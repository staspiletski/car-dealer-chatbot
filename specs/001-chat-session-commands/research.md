# Phase 0 Research: Chat Session Management Commands

## 1. Session ownership without authentication

**Decision**: The browser persists two things in `localStorage`: an `activeSessionId` and a
`sessionHistory` array (session IDs the browser has created or loaded, most-recent-first, capped
at 20). Every command request (`/sessions`, `/load`) sends the current `sessionHistory` array
alongside the message. The server only ever looks up metadata/history for IDs present in that
client-submitted array — it never queries "all sessions" or accepts an arbitrary ID as proof of
ownership.

**Rationale**: The app has no login system and the constitution's "no auth" reality (documented in
`CLAUDE.md`) is a hard constraint, not something this feature should change. The existing app
already treats a session UUID as a de facto bearer credential (whoever holds the ID can continue
that conversation). This feature extends that exact model instead of inventing a new one: the
list of IDs a browser has locally is the only claim of ownership, and the server enforces it by
never answering about an ID the client didn't submit.

**Alternatives considered**:
- *Server-side accounts/login*: rejected — far outside this feature's scope and explicitly not
  requested; would change the whole app's security model.
- *Cookie-based device identifier issued by the server*: rejected — adds a new server-side concept
  (device identity) for no real benefit over the client just keeping its own list of session IDs,
  and complicates the "no auth" simplicity the app currently has.
- *Global session listing with no ownership check*: rejected outright — would let any user browse
  every other customer's conversations (including any leads/contact info they shared), a severe
  privacy violation and a direct violation of constitution Principle IX and spec FR-003/FR-006.

## 2. Reference format for `/load`

**Decision**: `/load [reference]` accepts either (a) a small 1-based integer, resolved as an index
into the same most-recent-first ordering the last `/sessions` call would produce for that
client's `sessionHistory`, or (b) a full session UUID that must appear in the client-submitted
`sessionHistory` array.

**Rationale**: Typing a full UUID is unpleasant; a short index matching what `/sessions` just
displayed is the natural usability win. Recomputing the same order server-side (rather than
trusting client-cached positions) keeps the index meaningful without introducing new server state
between the two requests.

**Alternatives considered**: Requiring the full UUID only — rejected as poor UX (spec FR-006/edge
cases call for a friendly experience); having the server store "last shown list" per session —
rejected as unnecessary state for a stateless HTTP API when recomputation is cheap and simple.

## 3. `/clear` confirmation flow

**Decision**: `/clear` alone returns a confirmation prompt ("reply `/clear confirm` to proceed");
only `/clear confirm` actually deletes the current session's messages.

**Rationale**: Spec FR-007 requires a confirmation step before this destructive action, and the
app's only interaction surface today is plain chat text (per spec Assumptions — no new UI
components for v1). A two-message text confirmation is the simplest mechanism that fits the
existing interaction model without adding buttons/modals.

**Alternatives considered**: A modal/dialog in `ChatInterface.tsx` — rejected as extra UI surface
not justified by this feature's scope; a timed "undo" window after immediate deletion — rejected
as more complex and not what FR-007 asks for (confirm-before, not undo-after).

## 4. Are command exchanges persisted to `chat_messages`?

**Decision**: No. Command requests (e.g. the literal text `/sessions`) and their responses are
not written to `chat_messages`. Only the *restored* history from a successful `/load` (which was
already persisted from the original conversation) is shown.

**Rationale**: Keeps `/sessions` message counts meaningful (reflecting actual conversation content,
not command chatter) and keeps `/load`ed history clean of unrelated meta-commands from other
sessions. Also avoids `/clear` needing special-case logic to also purge its own confirmation
exchange.

**Alternatives considered**: Persisting everything uniformly — rejected because it pollutes
message counts (spec FR-002) and resumed history (spec FR-005) with irrelevant command noise.

## 5. Test framework selection

**Decision**: Vitest for unit and integration tests; Playwright for end-to-end tests.

**Rationale**: The repo has zero test infrastructure today, and constitution Principle II is
non-negotiable, so this feature must introduce one. Vitest is TypeScript/ESM-native (matches
`"type"` config implied by Next.js 16 + `moduleResolution: bundler`), fast, and needs no extra
services to run unit tests or integration tests against a local Postgres instance the developer
already has running (per the "no Docker" constraint). Playwright drives the real Next.js dev/build
server in a real browser for e2e coverage without requiring containers.

**Alternatives considered**: Jest — heavier ESM/TS configuration friction with Next.js 16;
Cypress for e2e — rejected in favor of Playwright's lighter local setup and native TypeScript
support, no strong project precedent either way so the simpler default was chosen.

## 6. Constitution/codebase mismatch (Prisma, OpenAI)

**Decision**: This feature does not introduce Prisma or OpenAI. It extends the existing `pg`-based
`lib/db/queries.ts` repository and never calls an LLM at all (commands bypass Anthropic entirely).

**Rationale**: Explicit project-owner decision (see plan.md Constitution Check) to follow the
codebase's real, existing patterns rather than migrate the data or AI layer as a side effect of a
small feature. Logged as a documented deviation from Principle VI in Complexity Tracking; Principle
VII (citations) is not applicable since no generation occurs.

**Alternatives considered**: See plan.md Constitution Check note — migrating now was considered
and rejected as disproportionate scope for this feature.
