# Phase 1 Data Model: Chat Session Management Commands

No schema changes are required. This feature reads and deletes rows in the existing
`chat_sessions` and `chat_messages` tables (`lib/db/schema.sql`) and introduces two
application-level (non-persisted) value objects used to move data between the repository and
service layers.

## Existing Entities (reused, unchanged)

### ChatSession (`chat_sessions` table)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | The session reference; already the client-generated session ID used throughout the app. |
| `customer_email`, `customer_name` | varchar, nullable | Not used by this feature. |
| `started_at` | timestamp | Used as `/sessions` display date and default sort key. |
| `ended_at` | timestamp, nullable | Not used by this feature. |
| `status` | varchar | Not used by this feature. |
| `preferences` | jsonb, nullable | Not used by this feature. |

### ChatMessage (`chat_messages` table)

| Field | Type | Notes |
|---|---|---|
| `id` | serial (PK) | Not surfaced directly. |
| `session_id` | UUID (FK → chat_sessions.id, `ON DELETE CASCADE`) | Used to count/fetch/delete messages per session. |
| `role` | varchar (`user`\|`assistant`) | Returned as-is when restoring history via `/load`. |
| `content` | text | Returned as-is when restoring history via `/load`. |
| `timestamp` | timestamp | Used for ordering restored history and as a tiebreaker for `/sessions` recency. |

## New Value Objects (in-memory only, defined in `lib/services/types.ts`)

### SessionSummary

Produced by `getSessionsMetadata(sessionIds)`; one per requested ID that still exists.

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | The session's reference. |
| `startedAt` | string (ISO 8601) | From `chat_sessions.started_at`. |
| `messageCount` | number | `COUNT(chat_messages.id)` for that session. |

**Ordering rule**: results are sorted by `startedAt` descending (most recent first) — this is the
same order used to resolve a numeric `/load` index (see research.md §2).

### CommandResult

Returned by `commandRouter`'s dispatch function; consumed by `app/api/chat/route.ts` to build the
HTTP response (see `contracts/chat-api.md`).

| Field | Type | Description |
|---|---|---|
| `type` | `'sessions' \| 'load' \| 'clear_prompt' \| 'clear_confirmed' \| 'help' \| 'unknown'` | Which command was handled. |
| `responseText` | string | Human-readable chat bubble text. |
| `activeSessionId?` | string | Present only for `'load'`: the session the client should switch to. |
| `restoredMessages?` | `{ role: 'user' \| 'assistant'; content: string; timestamp: string }[]` | Present only for `'load'`: full prior history to replace the client's message list. |

## Validation Rules (from spec Functional Requirements)

- A `/load` reference MUST resolve against the client-submitted `sessionHistory` array only
  (FR-006) — no DB existence check is performed for IDs outside that array; those are reported as
  not-found without distinguishing "doesn't exist" from "not yours."
- `/clear` MUST NOT execute a deletion on the first message; it only deletes after `/clear confirm`
  is received for the same active session (FR-007).
- `/clear` (and `/clear confirm`) MUST NOT touch the `leads` table (FR-008) — the delete query is
  scoped to `chat_messages` only.
- Command text matching is case-insensitive and whitespace-tolerant (FR-010).

## State Transitions

`ChatSession` gains no new statuses. The only state change introduced is at the *client* level
(`activeSessionId` in `localStorage`), which switches when `/load` succeeds — this is a UI/client
concern, not a database state transition.
