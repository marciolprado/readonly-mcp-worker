# Prompt log

This project was generated with Claude Code (`claude -p --model opus --effort medium`, permission mode `acceptEdits`, Bash limited to npm/npx/node and read-only git). Below is the prompt that produced it. Claude Code wrote the code and tests; it ran `npm install`, `npm test` and `npx tsc --noEmit` itself and iterated until they passed. The result was then checked by hand (80/80 tests passing, clean type check) before the first commit.

## Prompt 1: initial build

```text
Build a small, real, working project in the current directory (empty git repo): a READ-ONLY MCP (Model Context Protocol) server in TypeScript that runs on Cloudflare Workers.

Purpose: it aggregates data from operational business APIs (examples: a workforce/scheduling tool like Connecteam, a ticketing/booking tool like Roller, and Microsoft Graph calendar) and exposes them to AI agents (Claude, etc.) as read-only MCP tools. It must ship with MOCK data providers so it runs and is testable without any credentials, plus a clean provider interface so real APIs can be plugged in later via env vars/secrets.

Requirements:
- TypeScript, Cloudflare Workers (wrangler config, `npm run dev` works locally with wrangler). Do NOT deploy anything.
- Implement MCP over Streamable HTTP (JSON-RPC 2.0 at POST /mcp): initialize, tools/list, tools/call, ping, proper JSON-RPC errors. Use the official @modelcontextprotocol/sdk only if it works cleanly on Workers; otherwise implement the minimal protocol by hand — keep it simple and correct.
- Tools (all read-only, with JSON-schema inputs, validated): e.g. list_shifts(date range, location?), list_bookings(date range), get_daily_summary(date) that aggregates staffing vs bookings and flags understaffed slots, list_calendar_events(date range). Pick sensible ones.
- Provider interface (e.g. ShiftsProvider, BookingsProvider, CalendarProvider) with Mock implementations (deterministic seed data in a fixtures file) and stub "real" implementation skeletons that read base URL/token from env and are clearly marked as not yet wired (throw a clear error if selected without config). Provider chosen by env var, default mock.
- Optional bearer-token auth: if env MCP_AUTH_TOKEN is set, require Authorization: Bearer; otherwise open (document it). Never commit secrets; add .dev.vars.example and .gitignore (node_modules, .dev.vars, .wrangler).
- Read-only enforcement: no tool mutates anything; only GET calls in providers; document this.
- Tests with vitest covering protocol handling, each tool, aggregation logic, auth, and error cases. `npm test` must pass. `npx tsc --noEmit` must pass.
- README.md in English: what it does, architecture, tools list with example request/response (curl), how to run locally, how to test, how to plug real APIs, how to connect from Claude Desktop/Claude Code (via mcp-remote or direct HTTP), limitations. State honestly that it was built with Claude Code as a portfolio/demo project with mock data. Do NOT invent metrics, clients, users or production usage.
- CLAUDE.md with project conventions for Claude Code.
- MIT LICENSE (copyright Marcio Prado).
- Do not reference Kaseya, Kiria, Valquiria or any employer.

Work step by step, run `npm install`, `npm test` and `npx tsc --noEmit` yourself and fix until everything passes. Do not run git push or deploy. At the end print a short summary of files and test results.
```
