# readonly-mcp-worker

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that runs on
**Cloudflare Workers**. It pulls operational data together (staff shifts, customer bookings and
calendar events) and exposes it to AI agents such as Claude as a set of read-only tools.

It ships with **deterministic mock providers**, so it runs and passes its tests without any
credentials. Clean provider interfaces let you plug in real APIs later, for example a
workforce/scheduling tool (Connecteam-style), a ticketing/booking tool (Roller-style) and
Microsoft Graph calendars.

> **About this project.** I built this with [Claude Code](https://claude.com/claude-code) as a
> portfolio/demo project. All data is mock data about fictional businesses. The real API providers
> are **skeletons that are not wired yet**. It has not been deployed or used in production.

---

## Contents
- [Architecture](#architecture)
- [Tools](#tools)
- [Run locally](#run-locally)
- [Test](#test)
- [Authentication](#authentication)
- [Read-only guarantees](#read-only-guarantees)
- [Plugging in real APIs](#plugging-in-real-apis)
- [Connecting from Claude](#connecting-from-claude)
- [Limitations](#limitations)

## Architecture

```
            MCP client (Claude Desktop / Claude Code / any agent)
                               │  POST /mcp  (JSON-RPC 2.0)
                               ▼
┌──────────────────────── Cloudflare Worker ────────────────────────┐
│ src/index.ts        routing · CORS · Origin check · bearer auth  │
│ src/mcp/protocol.ts initialize · ping · tools/list · tools/call  │
│ src/mcp/schema.ts   JSON Schema validation of tool arguments     │
│ src/tools/          list_locations · list_shifts · list_bookings │
│                     list_calendar_events · get_daily_summary     │
│ src/lib/summary.ts  pure staffing-vs-demand aggregation          │
│ src/providers/      ShiftsProvider · BookingsProvider ·          │
│                     CalendarProvider  (chosen by env var)        │
│    ├─ mock/         deterministic fixtures (default)             │
│    └─ real/         Connecteam / Roller / MS Graph skeletons     │
└───────────────────────────────────────────────────────────────────┘
```

- **Transport:** MCP Streamable HTTP, stateless. `POST /mcp` accepts a single JSON-RPC message
  or a batch and answers with `application/json`. Notifications get `202 Accepted`.
  `GET /mcp` returns `405` because the server does not open server-initiated SSE streams.
- **Protocol versions:** `2025-06-18` (latest), `2025-03-26`, `2024-11-05`. An unsupported
  `MCP-Protocol-Version` header gets `400`.
- **No SDK dependency.** The protocol surface needed here is small, so it is implemented by hand in
  about 200 lines, with no runtime dependencies. That keeps the Worker bundle tiny and avoids Node
  compatibility shims.
- **Errors:** protocol problems use JSON-RPC codes (`-32700` parse error, `-32600` invalid
  request, `-32601` method not found, `-32602` invalid params/unknown tool, `-32603` internal).
  Bad tool arguments and provider failures come back as a tool result with `isError: true`, so the
  model can read the message and correct itself.
- **Providers are lazy:** a misconfigured calendar provider only breaks the tools that need the
  calendar, not `list_shifts`.

### Staffing rule used by `get_daily_summary`
For each location and each opening hour (UTC):

- `staff_on_shift` = distinct staff on assigned shifts overlapping the hour (open, unassigned
  shifts do not count)
- `guests` = total guests on **confirmed** bookings overlapping the hour
- `required_staff` = `max(min_staff, ceil(guests / guests_per_staff))`
- the slot is **understaffed** when `staff_on_shift < required_staff`

Neighbouring understaffed hours are merged into one alert, and open shifts are flagged as well.

## Tools

Every tool is annotated `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.
All inputs are validated against the published JSON Schema (`additionalProperties: false`).
Dates are `YYYY-MM-DD` (UTC), ranges are inclusive, and a range can be at most 31 days.

| Tool | Arguments | Returns |
|---|---|---|
| `list_locations` | none | Locations with opening hours and staffing rules |
| `list_shifts` | `start_date`, `end_date`, `location_id?` | Scheduled and open shifts |
| `list_bookings` | `start_date`, `end_date`, `location_id?` | Bookings (confirmed + cancelled) and confirmed guest total |
| `list_calendar_events` | `start_date`, `end_date` | Operational calendar events |
| `get_daily_summary` | `date`, `location_id?` | Hourly staff vs. demand per location, understaffed slots, open shifts, the day's events, alerts |

### Mock data
Two fictional sites, `loc-downtown` (Downtown Arcade) and `loc-riverside` (Riverside Trampoline
Park), with weekly patterns so any date returns stable data. Useful reference dates:
`2026-12-04` (Friday: understaffing at both sites, one cancelled booking),
`2026-12-05` (Saturday: a large party and an open shift), `2026-12-07` (Monday: fully staffed).

### Example requests

Start the server with `npm run dev` (default `http://localhost:8787`).

**initialize**
```bash
curl -s http://localhost:8787/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"readonly-mcp-worker","title":"Read-only Ops MCP","version":"0.1.0"},"instructions":"Read-only operational data ..."}}
```

**tools/list**
```bash
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

**list_shifts**
```bash
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_shifts","arguments":{"start_date":"2026-12-05","end_date":"2026-12-05","location_id":"loc-downtown"}}}'
```
`result.structuredContent` (abridged):
```json
{
  "range": { "start": "2026-12-05", "end": "2026-12-05" },
  "count": 5,
  "shifts": [
    { "id": "shf-2026-12-05-4", "location_id": "loc-downtown", "staff_id": "stf-ana", "staff_name": "Ana Silva",
      "role": "Host", "start": "2026-12-05T10:00:00Z", "end": "2026-12-05T16:00:00Z", "status": "scheduled" },
    { "id": "shf-2026-12-05-8", "location_id": "loc-downtown", "staff_id": null, "staff_name": null,
      "role": "Party Host", "start": "2026-12-05T12:00:00Z", "end": "2026-12-05T18:00:00Z", "status": "open" }
  ]
}
```

**list_bookings**
```bash
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_bookings","arguments":{"start_date":"2026-12-04","end_date":"2026-12-04","location_id":"loc-downtown"}}}'
```
Returns 4 bookings (one `cancelled`) and `"confirmed_guests": 61`.

**list_calendar_events**
```bash
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_calendar_events","arguments":{"start_date":"2026-12-04","end_date":"2026-12-04"}}}'
```
Returns `Ops stand-up` and `Weekly staffing review`.

**get_daily_summary**
```bash
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_daily_summary","arguments":{"date":"2026-12-05","location_id":"loc-riverside"}}}'
```
`result.structuredContent` (slots abridged):
```json
{
  "date": "2026-12-05",
  "locations": [{
    "location_id": "loc-riverside",
    "location_name": "Riverside Trampoline Park",
    "totals": { "scheduled_shifts": 4, "open_shifts": 0, "staff_hours": 28,
                "confirmed_bookings": 1, "cancelled_bookings": 0, "guests": 40 },
    "slots": [
      { "start": "2026-12-05T14:00:00Z", "end": "2026-12-05T15:00:00Z", "staff_on_shift": 4,
        "guests": 40, "required_staff": 5, "shortfall": 1, "status": "understaffed" },
      { "start": "2026-12-05T15:00:00Z", "end": "2026-12-05T16:00:00Z", "staff_on_shift": 3,
        "guests": 40, "required_staff": 5, "shortfall": 2, "status": "understaffed" }
    ],
    "understaffed_slots": 2,
    "peak_shortfall": 2
  }],
  "calendar_events": [],
  "alerts": ["Riverside Trampoline Park: understaffed 14:00-16:00 UTC (short by up to 2 staff)"]
}
```

**Validation error (tool result, not a protocol error)**
```bash
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"list_shifts","arguments":{"start_date":"2026-12-07","end_date":"2026-12-01"}}}'
```
```json
{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"Invalid arguments: end_date must be on or after start_date"}],"isError":true}}
```

Each successful tool result carries the data twice: as `structuredContent` and as pretty-printed
JSON in `content[0].text`, for clients that only read text.

## Run locally

Requirements: Node.js 18+ (tested with Node 22) and npm.

```bash
npm install
cp .dev.vars.example .dev.vars   # optional: set MCP_AUTH_TOKEN, provider choice
npm run dev                      # wrangler dev → http://localhost:8787
curl http://localhost:8787/health
```

`wrangler dev` runs the Worker locally in the Workers runtime. You do not need a Cloudflare
account for local development. This repo does not include a deploy step. To deploy your own copy
later, run `npx wrangler deploy` and set secrets with `npx wrangler secret put MCP_AUTH_TOKEN`.

## Test

```bash
npm test            # vitest
npx tsc --noEmit    # type-check
```

The tests call the Worker's `fetch` handler directly with standard `Request` objects. They cover:
the JSON-RPC protocol (initialize/version negotiation, ping, tools/list, batches, notifications,
every error code, HTTP status codes, CORS, the Origin allow-list), each tool and its argument
validation, the aggregation rules, bearer auth, provider selection and config errors, and the
GET-only HTTP helper.

## Authentication

- If `MCP_AUTH_TOKEN` is **set**, every `/mcp` request must send `Authorization: Bearer <token>`.
  Anything else gets `401` with `WWW-Authenticate: Bearer`. Auth is checked before the body is
  parsed, and the token comparison uses SHA-256 digests compared in constant time.
- If `MCP_AUTH_TOKEN` is **not set**, the server is **open**. That is fine for local mock data,
  but **do not run it open with real data**.
- `/health` never needs a token and returns no business data.
- Optional `ALLOWED_ORIGINS` (comma-separated) rejects browser requests from other origins
  (`403`), which guards against DNS rebinding. Requests without an `Origin` header (CLIs, server
  clients) are not affected.

This is a single shared token. It is not OAuth and has no per-user scopes. See [Limitations](#limitations).

## Read-only guarantees

Read-only is a design rule, enforced in several places:

1. **Tools:** only list/get tools exist, and every tool is annotated `readOnlyHint: true`.
2. **Provider interfaces** (`src/providers/types.ts`) only declare read methods. There is no
   create/update/delete method for a tool to call.
3. **HTTP:** real providers must use `readOnlyFetch` (`src/lib/http.ts`), which always sends
   `GET` with no body. A test checks this.
4. **Credentials:** when you wire a real API, issue the **least-privilege, read-only** API key or
   OAuth scope the vendor offers (for Microsoft Graph, `Calendars.Read`). This is the guarantee that
   actually holds if the code changes later.

## Plugging in real APIs

Each data source is chosen by an environment variable (default `mock`):

| Variable | Values | Required config when not `mock` |
|---|---|---|
| `SHIFTS_PROVIDER` | `mock`, `connecteam` | `CONNECTEAM_BASE_URL`, `CONNECTEAM_API_KEY` |
| `BOOKINGS_PROVIDER` | `mock`, `roller` | `ROLLER_BASE_URL`, `ROLLER_API_TOKEN` |
| `CALENDAR_PROVIDER` | `mock`, `msgraph` | `MSGRAPH_BASE_URL`, `MSGRAPH_ACCESS_TOKEN`, `MSGRAPH_CALENDAR_USER` |

Base URLs must be `https://`. If you select a real provider without its config, its tools return a
clear error (`Provider configuration error: roller provider selected but missing config: ...`).
With config in place, the skeletons currently return `Provider not available: ... is a skeleton and
is not wired yet`. **No real API mapping is implemented yet.**

To wire one up (`src/providers/real/index.ts`):

1. Read the vendor's API docs for the list endpoint (shifts/schedules, bookings, or the Graph
   `calendarView` endpoint) and its auth scheme.
2. Call it with `readOnlyFetch(baseUrl, path, { headers, query })`, handling pagination.
3. Map the response to the domain types in `src/providers/types.ts`, and normalize every timestamp
   to UTC ISO 8601.
4. Add tests with recorded (sanitized) responses by injecting `fetchImpl`.
5. Put secrets in `.dev.vars` locally or `wrangler secret put` in production. Never commit them.

Microsoft Graph access tokens expire. A production setup needs a token refresh flow (for example
client credentials with `Calendars.Read` application permission) instead of a static
`MSGRAPH_ACCESS_TOKEN`.

## Connecting from Claude

### Claude Code (direct HTTP)
```bash
claude mcp add --transport http ops-readonly http://localhost:8787/mcp
# with auth:
claude mcp add --transport http ops-readonly http://localhost:8787/mcp \
  --header "Authorization: Bearer $MCP_AUTH_TOKEN"
```
Then ask, for example: *"Use ops-readonly to check staffing for 2026-12-05."*

### Claude Desktop (via `mcp-remote`)
Claude Desktop's config file launches local (stdio) servers, so use
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) as a bridge. Edit
`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "ops-readonly": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/mcp",
               "--header", "Authorization:${MCP_AUTH_HEADER}"],
      "env": { "MCP_AUTH_HEADER": "Bearer change-me" }
    }
  }
}
```
Leave out `--header` and `env` if `MCP_AUTH_TOKEN` is not set. Restart Claude Desktop after you
edit the file. For a deployed Worker, replace the URL with your `https://...workers.dev/mcp`
address. `mcp-remote` needs `--allow-http` for plain `http://` URLs other than localhost.

### Any other client
Any MCP client that speaks Streamable HTTP can `POST` JSON-RPC to `/mcp` (see the curl examples).

## Limitations

- **Mock data only.** The real providers are skeletons, and no vendor API has been called or
  verified against a real account.
- **UTC only.** Times and opening hours are UTC. Locations have no time zone handling yet, so a
  "day" is a UTC day.
- **Simple staffing model:** one ratio and one minimum per location, hourly slots, and any overlap
  counts. It does not model roles, skills, breaks or partial-hour coverage.
- **Stateless transport:** no `Mcp-Session-Id`, no server-to-client SSE stream, no resumability, no
  `resources` or `prompts`. Tools are the only capability.
- **Auth** is a single shared bearer token. There is no OAuth 2.1 authorization server, no per-user
  identity and no rate limiting. Put it behind Cloudflare Access or add OAuth before exposing real data.
- **No pagination** on tool results. The 31-day range cap keeps responses bounded.
- **No caching** of upstream calls.

## License

[MIT](./LICENSE) © 2026 Marcio Prado

## Built with Claude Code

See [CLAUDE.md](CLAUDE.md) for the conventions given to Claude Code and [PROMPTS.md](PROMPTS.md) for the prompt used to build this project.
