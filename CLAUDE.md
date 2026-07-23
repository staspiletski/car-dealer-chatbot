# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`, extends `eslint-config-next`)
- `node lib/db/init-db.js` — create tables from `lib/db/schema.sql` and seed dummy vehicle data (requires `DATABASE_URL` in `.env.local`)
- `npm run test:unit` — Vitest unit tests (`tests/unit/`), no DB required
- `npm run test:integration` — Vitest integration tests (`tests/integration/`) against the local Postgres instance in `DATABASE_URL`
- `npm run test:e2e` — Playwright end-to-end tests (`tests/e2e/`); starts/reuses the dev server automatically
- `npm test` — runs all three suites in sequence

## Architecture

Single-page Next.js App Router chatbot (`CarDealerBot`). `components/ChatInterface.tsx` is a client component that generates a session UUID on mount and POSTs each message to `app/api/chat/route.ts`, which is the only route and contains all chat logic inline (system prompts, tool schemas, and the tool-execution loop all live in this one file rather than being split into helpers).

**Request flow in `route.ts`**:
1. Validate the incoming `{ sessionId, message }` via `validateRequest` (see security gate below).
2. Upsert the `chat_sessions` row with a raw `pool.query(... ON CONFLICT DO NOTHING)` call — note this bypasses `createChatSession` in `lib/db/queries.ts`, which exists but is currently unused/dead code. Fix in either place if you touch session creation.
3. Persist the user message, load full chat history, call `anthropic.messages.create` with three tools (`search_vehicles`, `get_vehicle_details`, `save_lead`).
4. For each `tool_use` block Claude returns, dispatch to the matching function in `lib/db/queries.ts`, collect `tool_result` blocks, and make a second `messages.create` call (different system prompt, formatting-only) to get the final natural-language reply.
5. Persist the assistant reply and return `{ response, sessionId }`.

Tool schemas passed to `messages.create` must stay in sync with the corresponding `if (content.name === ...)` branches in the tool loop and with the function signatures in `lib/db/queries.ts`.

**Security gate (`lib/security/requestValidator.ts`)** — every message passes through `validateRequest` before touching the model or DB:
1. `validateUserInput` — 2000-char length cap + regex denylist for SQL-injection-shaped text (`DROP`/`DELETE`/etc., `--`/`;`/`/* */`, `UNION`/`SELECT...FROM`) and prompt-injection phrasing (`ignore previous`, `system prompt`, `override rules`, etc.).
2. `detectSemanticThreats` — substring match against a fixed phrase list (`erase all`, `bypass security`, ...).
3. `checkRateLimit` — in-memory, per-process (not distributed — resets on redeploy/restart, and won't work correctly across multiple server instances), sliding window keyed by `sessionId`: 30 messages/min.

Blocked requests (steps 1–2 only, not rate-limit hits) are logged to `blocked_requests` via `logBlockedRequest`. Any block returns HTTP 200 with a randomized generic message from `getSafeErrorMessage` — the frontend treats blocks as normal chat replies, never as errors. Preserve this "fail closed, respond generically, never reveal the block reason" behavior when editing validation logic.

**Database layer** (`lib/db/`):
- `pool.ts` — lazy singleton `pg.Pool` via `getDbPool()`; throws if `DATABASE_URL` is unset. `closeDbPool`/`testConnection` exist but aren't called from the app.
- `queries.ts` — all SQL as parameterized queries; add new data access here rather than importing `pool` directly into routes. `saveLead` upserts on `email` (unique) via `ON CONFLICT (email) DO UPDATE SET preferences = $4`. `validatePrice`/`validateEmail` are defined but not currently called anywhere.
- `schema.sql` — source of truth for `vehicles`, `chat_sessions`, `chat_messages`, `leads`, `blocked_requests`, plus seed data for 12 vehicles. `init-db.js` splits this file on `;` and runs each statement — keep statements semicolon-terminated and avoid embedding `;` inside function bodies/strings.

**Session handling**: session ids are client-generated UUIDs (`ChatInterface.tsx` rolls its own UUIDv4 via `Math.random()`, not `crypto.randomUUID()` or the `uuid` package already in `package.json`), with no auth. Sessions are created implicitly on first message rather than through an explicit endpoint.

**Anthropic integration**: model id (`claude-opus-4-6`) and both system prompts are inline in `route.ts`, not centralized. The first system prompt forbids discussing database/system-administration topics outside vehicle sales — preserve this constraint when editing prompts. Chat history sent to the model on each turn is the *entire* `chat_messages` table for that session with no truncation/summarization.

**Session management commands**: `/sessions`, `/load [reference]`, `/clear`, `/help` are handled entirely by `lib/services/commandRouter.ts` (`createCommandRouter`, a dependency-injected, framework-independent business/service layer — see `parseCommand` for the recognized syntax) and dispatched from `route.ts` *before* any Anthropic call; command turns are never persisted to `chat_messages`. Since the app has no auth, ownership is enforced entirely client-side: `components/ChatInterface.tsx` persists `activeSessionId` and a capped, most-recent-first `sessionHistory` array in `localStorage`, and sends `sessionHistory` as `knownSessionIds` on every request — the server only ever answers `/sessions`/`/load` questions about IDs the client already submitted (never a general session lookup), and `/sessions`/`/load`'s numbering excludes any session with zero messages so a just-created empty session never appears as a "previous conversation." See `specs/001-chat-session-commands/contracts/chat-api.md` for the exact request/response shape.
