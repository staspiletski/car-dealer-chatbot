# Quickstart: Validating Chat Session Management Commands

## Prerequisites

- Node.js and a local PostgreSQL instance running (per repo convention, no Docker).
- `.env.local` with `DATABASE_URL` and `ANTHROPIC_API_KEY` set.
- Database initialized: `node lib/db/init-db.js`.
- Dependencies installed, including the new test tooling added by this feature:
  `npm install` (adds Vitest + Playwright dev dependencies).

## Run the app

```bash
npm run dev
# open http://localhost:3000
```

## Manual validation scenarios

These map directly to the acceptance scenarios in `spec.md`. Each can be run either in the browser
UI or via `curl` against `POST /api/chat` (see `contracts/chat-api.md` for the exact request/
response shape).

1. **Empty history (US1 edge case)**: Fresh browser (clear localStorage), send `/sessions` →
   expect a friendly "no previous conversations yet" reply, not an error.

2. **List previous conversations (US1)**: Have 2–3 ordinary conversations (send a few normal
   vehicle questions in each, reloading between them so each gets its own session). Send
   `/sessions` → expect all of them listed, most-recent first, each with a date and message count.

3. **Resume a conversation (US2)**: From the `/sessions` list, send `/load 1` (or `/load <full
   uuid>`) → expect the full prior message history to reappear in the chat view, and a follow-up
   ordinary message to be appended to that same restored session (verify via `/sessions` afterward
   that its message count increased).

4. **Load an unknown/foreign reference (US2 edge case)**: Send `/load <a uuid that isn't in this
   browser's history>` → expect a generic "couldn't find that conversation" message — not a
   distinguishing error, and not a crash.

5. **Clear current conversation (US3)**: Send `/clear` → expect a confirmation prompt. Send
   `/clear confirm` → expect the conversation to become empty. Verify (e.g., via `lib/db/queries.ts`
   or a DB client) that any previously saved lead/contact record for that session is still present.

6. **Clear with nothing to clear (US3 edge case)**: On a brand-new session with zero messages,
   send `/clear` then `/clear confirm` → expect a friendly "nothing to clear" response, no error.

7. **Discover commands (US4)**: Send `/help` → expect all four commands listed with a one-line
   description each.

8. **Unknown command (US4 edge case)**: Send `/notacommand` → expect a reply pointing to `/help`,
   not a vehicle-sales attempt and not a silent failure.

## Automated validation

- Unit tests: `npx vitest run tests/unit` — covers command parsing/dispatch in
  `lib/services/commandRouter.ts` against a faked repository (no DB required).
- Integration tests: `npx vitest run tests/integration` — covers `getSessionsMetadata` and
  `deleteSessionMessages` in `lib/db/queries.ts` against the local Postgres instance from
  Prerequisites.
- End-to-end tests: `npx playwright test tests/e2e` — drives the running dev server through all
  eight scenarios above in a real browser.

## Expected outcome

All eight manual scenarios behave as described, and all three automated test suites pass, before
this feature is considered done (constitution Principle II).
