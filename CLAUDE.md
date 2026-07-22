# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`, extends `eslint-config-next`)
- `node lib/db/init-db.js` — create tables from `lib/db/schema.sql` and seed dummy vehicle data (requires `DATABASE_URL` in `.env.local`)

There is no test suite configured.

## Architecture

This is a single-page Next.js App Router chatbot (`CarDealerBot`) that lets customers ask about dealership inventory via the Anthropic API, with Claude driving tool calls against a Postgres-backed vehicle catalog.

**Request flow**: `components/ChatInterface.tsx` (client component, generates a UUID session id on mount) → `POST /app/api/chat/route.ts` → the route validates/rate-limits the input, persists it, calls the Anthropic Messages API with three tools (`search_vehicles`, `get_vehicle_details`, `save_lead`), executes whichever tool Claude requests against `lib/db/queries.ts`, feeds tool results back to Claude for a final natural-language reply, then persists and returns that reply.

**Security gate (`lib/security/requestValidator.ts`)**: every incoming message passes through `validateRequest` before touching the model or DB:
1. `validateUserInput` — length check + regex denylist for SQL-injection-shaped text and prompt-injection phrasing (e.g. "ignore previous instructions", "system prompt").
2. `detectSemanticThreats` — substring match against a fixed list of harmful phrases.
3. `checkRateLimit` — in-memory (per-process, not distributed) sliding window, 30 messages/min per session id.

Blocked requests are logged to the `blocked_requests` table and the user gets a randomized generic refusal from `getSafeErrorMessage` (never the actual block reason) with HTTP 200 — the frontend treats blocks as normal chat replies, not errors. Any change to validation logic should preserve this "fail closed, respond generically" behavior.

**Database layer** (`lib/db/`):
- `pool.ts` — lazy-initialized singleton `pg.Pool` (`getDbPool`), reads `DATABASE_URL`.
- `queries.ts` — all SQL lives here as parameterized queries; add new data access here rather than querying `pool` directly from routes.
- `schema.sql` — source of truth for tables: `vehicles`, `chat_sessions`, `chat_messages`, `leads`, `blocked_requests`. `init-db.js` splits this file on `;` and executes each statement, so keep statements semicolon-terminated and avoid `;` inside function bodies/strings in the schema.

**Session handling**: session ids are client-generated UUIDs (no auth). The chat route upserts the `chat_sessions` row (`ON CONFLICT DO NOTHING`) on every message rather than requiring an explicit create step first.

**Anthropic integration**: model id and system prompts are inline in `app/api/chat/route.ts` (not centralized). The system prompt explicitly forbids discussing anything outside vehicle sales/database internals — preserve this constraint when editing prompts. Tool schemas passed to `messages.create` must stay in sync with the corresponding handlers in the tool-result loop and with `lib/db/queries.ts` function signatures.
