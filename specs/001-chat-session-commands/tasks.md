---

description: "Task list for Chat Session Management Commands"
---

# Tasks: Chat Session Management Commands

**Input**: Design documents from `/specs/001-chat-session-commands/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/chat-api.md, research.md, quickstart.md

**Tests**: MANDATORY per constitution Principle II (Test-Driven Quality, NON-NEGOTIABLE) — every
user story below includes unit, integration, and/or e2e test tasks that MUST be written and MUST
fail before their corresponding implementation task.

**Organization**: Tasks are grouped by user story (from spec.md, in priority order) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- File paths are exact, per `plan.md`'s Project Structure section

## Path Conventions

Single existing Next.js project (see `plan.md`): `app/`, `components/`, `lib/` at repo root; new
`tests/unit/`, `tests/integration/`, `tests/e2e/` directories introduced by this feature.

<!--
  Sample/template scaffolding has been fully replaced below with real tasks for this feature.
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Introduce the test tooling the constitution requires (repo currently has none)

- [X] T001 Add Vitest as a dev dependency and create `vitest.config.ts` at repo root, configured
      for two projects/workspaces: `tests/unit/**` and `tests/integration/**`
- [X] T002 [P] Add Playwright as a dev dependency, run `npx playwright install`, and create
      `playwright.config.ts` at repo root pointing at `tests/e2e/**` against `npm run dev`
- [X] T003 [P] Add `test`, `test:unit`, `test:integration`, `test:e2e` scripts to `package.json`
      and create the empty `tests/unit/`, `tests/integration/`, `tests/e2e/` directories

**Checkpoint**: `npm run test:unit` / `test:integration` / `test:e2e` all run (with zero tests) without config errors

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared plumbing every user story's command depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Define domain types (`SessionSummary`, `CommandResult`, `RestoredMessage`) in
      `lib/services/types.ts`, per `data-model.md` — no Next.js/`pg` imports
- [X] T005 [P] Add `getSessionsMetadata(sessionIds: string[]): Promise<SessionSummary[]>` to
      `lib/db/queries.ts` (parameterized query joining `chat_sessions`/`chat_messages`, grouped,
      ordered by `started_at` descending, per `data-model.md`)
- [X] T006 [P] Add `deleteSessionMessages(sessionId: string): Promise<number>` to
      `lib/db/queries.ts` (parameterized `DELETE FROM chat_messages WHERE session_id = $1`,
      returning row count; must not touch `leads` or `chat_sessions`)
- [X] T007 Create `createCommandRouter(deps)` factory and `parseCommand(message)` parser skeleton
      in `lib/services/commandRouter.ts`: recognizes `/sessions`, `/load`, `/clear`,
      `/clear confirm`, `/help`, is case-insensitive and whitespace-tolerant (FR-010), and returns
      an "unknown command" `CommandResult` for any other `/`-prefixed input (FR-011); `deps` is a
      typed interface (`{ getSessionsMetadata, getChatHistory, deleteSessionMessages }`) so the
      router never imports `lib/db/pool.ts` or `pg` directly (Principle VIII)
- [X] T008 Wire command detection into `app/api/chat/route.ts`: after the existing
      `validateRequest` call and session upsert, if `parseCommand` recognizes the message, call
      the router and return its `CommandResult` as the JSON response (per `contracts/chat-api.md`)
      **before** any `anthropic.messages.create` call; otherwise fall through to existing behavior
      unchanged
- [X] T009 Extend `components/ChatInterface.tsx` to persist `activeSessionId` and a capped
      (max 20), most-recent-first `sessionHistory` array in `localStorage`; read `activeSessionId`
      on mount instead of always generating a new UUID (create one only if none stored yet, and
      push it into `sessionHistory`); send `knownSessionIds: sessionHistory` in every
      `POST /api/chat` request body

**Checkpoint**: Shared parsing/routing/wiring exists; individual commands can now be implemented per story

---

## Phase 3: User Story 1 - List Previous Conversations (Priority: P1) 🎯 MVP

**Goal**: `/sessions` lists the requesting browser's previous conversations with date and message count

**Independent Test**: Seed a few sessions for a known `knownSessionIds` list, send `/sessions`, and verify the response lists each with a date and message count, most-recent first — no dependency on `/load`, `/clear`, or `/help`.

### Tests for User Story 1 (MANDATORY per constitution Principle II) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T010 [P] [US1] Unit tests for `/sessions` formatting and empty-state handling (fake
      `getSessionsMetadata`) in `tests/unit/commandRouter.test.ts`
- [X] T011 [P] [US1] Integration test for `getSessionsMetadata` (ordering, message counts, only
      requested IDs returned) in `tests/integration/sessionQueries.test.ts`
- [X] T012 [P] [US1] E2E test: empty-state message for a fresh browser, and a populated,
      most-recent-first list for a browser with several sessions, in
      `tests/e2e/session-commands.spec.ts`

### Implementation for User Story 1

- [X] T013 [US1] Implement `handleSessions(knownSessionIds, deps)` in
      `lib/services/commandRouter.ts`: call `getSessionsMetadata`, format each entry as
      `#<index> — <date> — <messageCount> messages`, return a friendly empty-state `CommandResult`
      when the list is empty (depends on T004, T005, T007)
- [X] T014 [US1] Dispatch `/sessions` to `handleSessions` in the router's main entry point
      (depends on T013)
- [X] T015 [US1] [P] Verify `components/ChatInterface.tsx` renders `command.type: "sessions"`
      responses as a normal chat bubble (no special-case handling needed beyond existing text
      rendering — add a short render-path note/comment if any adjustment is required)

**Checkpoint**: `/sessions` is fully functional and independently testable/deployable

---

## Phase 4: User Story 2 - Resume a Previous Conversation (Priority: P2)

**Goal**: `/load [reference]` restores a previous conversation's full history as the active conversation

**Independent Test**: Seed a session with known messages, send `/load` with its index or UUID, and verify the response includes the full prior history and a new `activeSessionId` — independent of `/clear`/`/help`.

### Tests for User Story 2 (MANDATORY per constitution Principle II) ⚠️

- [X] T016 [P] [US2] Unit tests for `/load` reference resolution (numeric index, full UUID,
      malformed/missing reference, reference not in `knownSessionIds`) in
      `tests/unit/commandRouter.test.ts`
- [X] T017 [P] [US2] Integration test confirming restored history is ordered by `timestamp`
      ascending and matches what `getChatHistory` returns, in
      `tests/integration/sessionQueries.test.ts`
- [X] T018 [P] [US2] E2E test: load by index, load by full UUID, load an unknown/foreign
      reference (generic not-found, no distinguishing detail per FR-006), and load with no/garbled
      reference (usage hint), in `tests/e2e/session-commands.spec.ts`

### Implementation for User Story 2

- [X] T019 [US2] Implement `handleLoad(reference, knownSessionIds, deps)` in
      `lib/services/commandRouter.ts`: resolve a numeric reference against the same
      most-recent-first ordering as `handleSessions` restricted to `knownSessionIds`; resolve a
      UUID reference only if present in `knownSessionIds`; otherwise return a generic not-found
      `CommandResult`; on success call `getChatHistory` and populate `activeSessionId` +
      `restoredMessages` (depends on T004, T007, T013 for shared ordering logic)
- [X] T020 [US2] Extract the `[reference]` token and dispatch `/load` to `handleLoad` in the
      router's main entry point (depends on T019)
- [X] T021 [US2] Handle `command.type: "load"` in `components/ChatInterface.tsx`: on success,
      update `activeSessionId` + move-to-front `sessionHistory` in `localStorage`, and replace the
      `messages` state with `restoredMessages` (depends on T009)
- [X] T022 [US2] [P] Add the missing/malformed-reference usage-hint response path in
      `handleLoad` (covered by T016's tests)

**Checkpoint**: `/load` is fully functional and independently testable; `/sessions` still works unaffected

---

## Phase 5: User Story 3 - Clear Current Conversation (Priority: P3)

**Goal**: `/clear` (with confirmation via `/clear confirm`) removes the active conversation's messages without touching saved leads

**Independent Test**: Send `/clear` on a session with messages, verify a confirmation prompt and no deletion; send `/clear confirm`, verify messages are gone and any lead record for that session is untouched — independent of `/sessions`/`/load`/`/help`.

### Tests for User Story 3 (MANDATORY per constitution Principle II) ⚠️

- [X] T023 [P] [US3] Unit tests for the `/clear` → `/clear confirm` two-step flow, decline path
      (plain `/clear` never deletes), and no-op-when-already-empty case, in
      `tests/unit/commandRouter.test.ts`
- [X] T024 [P] [US3] Integration test for `deleteSessionMessages`: deletes only the target
      session's `chat_messages` rows, leaves `leads` and other sessions' messages untouched, in
      `tests/integration/sessionQueries.test.ts`
- [X] T025 [P] [US3] E2E test: `/clear` prompts for confirmation without deleting, `/clear confirm`
      empties the conversation, and a saved lead survives, in
      `tests/e2e/session-commands.spec.ts`

### Implementation for User Story 3

- [X] T026 [US3] Implement `handleClearPrompt()` and `handleClearConfirmed(sessionId, deps)` in
      `lib/services/commandRouter.ts`: the prompt handler never touches the database; the confirm
      handler calls `deleteSessionMessages` and reports "nothing to clear" when zero rows were
      deleted (depends on T004, T006, T007)
- [X] T027 [US3] Dispatch `/clear` to `handleClearPrompt` and `/clear confirm` to
      `handleClearConfirmed` (using the request's `sessionId`, not `knownSessionIds`) in the
      router's main entry point (depends on T026)
- [X] T028 [US3] Handle `command.type: "clear_confirmed"` in `components/ChatInterface.tsx`: clear
      the local `messages` state (depends on T009)

**Checkpoint**: `/clear` is fully functional and independently testable; US1/US2 still work unaffected

---

## Phase 6: User Story 4 - Discover Available Commands (Priority: P4)

**Goal**: `/help` lists all commands with descriptions; unrecognized `/` input points users to `/help`

**Independent Test**: Send `/help` in any conversation state and verify all four commands are listed with accurate descriptions; send an unrecognized `/xyz` and verify it's redirected to `/help` — independent of every other story.

### Tests for User Story 4 (MANDATORY per constitution Principle II) ⚠️

- [X] T029 [P] [US4] Unit tests for `/help` output content and the unknown-command fallback
      message in `tests/unit/commandRouter.test.ts`
- [X] T030 [P] [US4] E2E test: `/help` from a fresh session and from a session with history both
      return the full command list; an unrecognized `/xyz` is redirected to `/help`, in
      `tests/e2e/session-commands.spec.ts`

### Implementation for User Story 4

- [X] T031 [US4] Implement `handleHelp()` and `handleUnknownCommand()` in
      `lib/services/commandRouter.ts`, listing `/sessions`, `/load`, `/clear`, `/help` each with a
      one-line description (depends on T004, T007)
- [X] T032 [US4] Ensure the router's fallback path (any `/`-prefixed message not matching a known
      command) dispatches to `handleUnknownCommand` (depends on T031)

**Checkpoint**: All four commands are independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, compatibility, and final constitution/spec conformance checks

- [X] T033 [P] Update `CLAUDE.md`'s Architecture section to document command routing
      (`lib/services/commandRouter.ts`), the `localStorage` session-tracking model, and the
      extended `/api/chat` request/response contract
- [X] T034 [P] Add a regression test confirming command strings (e.g., `/load <uuid>`,
      `/clear confirm`) pass the existing `validateRequest` gate in
      `lib/security/requestValidator.ts` without false-positive blocks, in
      `tests/unit/commandRouter.test.ts` or `tests/integration/sessionQueries.test.ts`
- [X] T035 Run the full manual validation checklist in `quickstart.md` (all 8 scenarios) against a
      local dev server
- [X] T036 Security review pass confirming FR-006 (no session-enumeration signal between
      "doesn't exist" and "not yours") holds across `handleLoad`'s error paths — cross-check
      against T016/T018 test coverage
- [X] T037 Final code review pass for constitution compliance: no unjustified `any` anywhere in
      `lib/services/`, DI boundaries respected (Principle VIII), and the Prisma-deviation note in
      `plan.md`'s Complexity Tracking still accurately describes the shipped code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational completion
  - US1 (P1) has no dependency on US2/US3/US4
  - US2 (P2) reuses US1's ordering logic (T013) but is otherwise independent — implement after US1
    for MVP sequencing, though its own tests (T016-T018) can be written in parallel with US1
  - US3 (P3) and US4 (P4) depend only on Foundational, not on US1/US2
- **Polish (Phase 7)**: Depends on all four user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundational only
- **US2 (P2)**: Foundational + reuses US1's session-ordering helper (T013) — implement after US1
- **US3 (P3)**: Foundational only — no dependency on US1/US2
- **US4 (P4)**: Foundational only — no dependency on US1/US2/US3

### Within Each User Story

- Tests MUST be written and FAIL before implementation tasks
- Domain/service logic before route/UI wiring
- Story complete before moving to the next priority (for solo/sequential execution)

### Parallel Opportunities

- All Setup tasks marked [P] (T002, T003) can run together after T001
- T005 and T006 (Foundational, different functions in the same file but independently testable)
  can be developed in parallel and merged
- All [P] test tasks within a story (e.g., T010-T012, T016-T018, T023-T025, T029-T030) can be
  written in parallel
- US3 and US4 implementation can proceed in parallel with each other (and with US2) once
  Foundational is done, since neither depends on the other or on US1/US2 code

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit tests for /sessions formatting and empty-state in tests/unit/commandRouter.test.ts"
Task: "Integration test for getSessionsMetadata in tests/integration/sessionQueries.test.ts"
Task: "E2E test for /sessions empty-state and populated list in tests/e2e/session-commands.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1 (`/sessions`)
4. **STOP and VALIDATE**: Run `quickstart.md` scenarios 1-2 independently
5. Demo `/sessions` alone if ready — it delivers standalone value (viewing history) even before `/load` exists

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add US1 (`/sessions`) → validate → demo (MVP)
3. Add US2 (`/load`) → validate → demo (list + resume)
4. Add US3 (`/clear`) → validate → demo (+ housekeeping)
5. Add US4 (`/help`) → validate → demo (full feature, all four commands discoverable)
6. Polish phase → final constitution/spec conformance pass

### Parallel Team Strategy

With multiple developers, after Foundational is done:
- Developer A: US1 → US2 (US2 depends on US1's ordering helper)
- Developer B: US3 (independent)
- Developer C: US4 (independent)

---

## Notes

- [P] tasks touch different files or are independently verifiable — no shared-file conflicts
- [Story] labels map every user-story-phase task back to spec.md's US1-US4 for traceability
- Every test task MUST be written and confirmed failing before its paired implementation task
- Commit after each task or logical group
- Stop at any checkpoint to validate that story's independent test criteria before continuing
- Avoid: vague tasks, two tasks editing the same file marked [P], cross-story dependencies beyond
  the one documented (US2 → US1 ordering helper)
