# CLAUDE.md

Conventions for working on this repo with Claude Code.

## What this is
A read-only MCP server (JSON-RPC 2.0 over Streamable HTTP) on Cloudflare Workers.
It aggregates shifts, bookings and calendar data behind provider interfaces.
Mock providers are the default; real providers are unwired skeletons.

## Commands
- `npm run dev`: local server via `wrangler dev` (http://localhost:8787/mcp)
- `npm test`: vitest, runs the Worker's `fetch` handler directly in Node
- `npx tsc --noEmit`: type-check (must pass, along with tests, before any commit)
- Never run `wrangler deploy` or push unless the user explicitly asks.

## Layout
- `src/index.ts`: HTTP routing, CORS, origin check, auth, body parsing
- `src/mcp/protocol.ts`: JSON-RPC dispatch (initialize, ping, tools/list, tools/call)
- `src/mcp/schema.ts`: small JSON Schema subset validator (the same schemas are published in tools/list)
- `src/tools/index.ts`: tool definitions
- `src/lib/summary.ts`: pure aggregation for `get_daily_summary`
- `src/providers/types.ts`: provider interfaces and domain types
- `src/providers/mock/`: deterministic fixtures + mock providers
- `src/providers/real/`: real provider skeletons (not wired)

## Rules
- **Read-only is a hard rule.** No tool may create, update or delete anything.
  Providers expose only list/get methods. Real providers must use `readOnlyFetch`
  (`src/lib/http.ts`), which only issues GET. Every tool sets `readOnlyHint: true`.
- No secrets in the repo. Secrets go in `.dev.vars` (gitignored) or `wrangler secret put`.
  Add new variables to `src/env.ts` and `.dev.vars.example`.
- All times are UTC ISO 8601 strings. Dates are `YYYY-MM-DD`, ranges are inclusive, max 31 days.
- Tool output uses snake_case; internal domain types use camelCase.
- Argument/provider errors are returned as tool results with `isError: true`
  (so the model can self-correct). Protocol errors (unknown method/tool, bad JSON-RPC) use JSON-RPC error codes.
- Keep aggregation logic pure (no I/O) and unit-tested in `test/summary.test.ts`.
- Mock data must stay deterministic. If you change fixtures, update the expected values in tests.
- Adding a tool: define it in `src/tools/index.ts` with an `additionalProperties: false` schema,
  add tests in `test/tools.test.ts`, update the expected list in `test/protocol.test.ts` and the README.
- Do not invent metrics, clients or production usage in docs. This is a demo project with mock data.
