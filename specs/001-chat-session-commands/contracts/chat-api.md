# Contract: `POST /api/chat` (extended for session commands)

This feature extends the existing single endpoint rather than adding new routes. The request and
response shapes below are additive — all existing fields keep their current meaning and behavior
for ordinary (non-command) messages.

## Request

```jsonc
{
  "sessionId": "3f9a...-uuid",     // existing field, unchanged meaning
  "message": "/sessions",          // existing field; command detection happens on this value
  "knownSessionIds": [             // NEW, required for command handling
    "3f9a...-uuid",
    "a11c...-uuid"
  ]
}
```

- `knownSessionIds`: the client's `sessionHistory` from `localStorage`, most-recent-first, capped
  at 20 entries. Required whenever `message` is a recognized/attempted command; ordinary chat
  messages may omit it (ignored if present).
- Existing validation (`validateRequest` — length cap, denylist, rate limit) still runs on
  `message` first, before command detection, for every request (spec FR-012).

## Response

```jsonc
{
  "response": "human-readable chat bubble text",   // existing field, always present
  "sessionId": "3f9a...-uuid",                       // existing field, unchanged meaning
  "command": {                                       // NEW, present only when a command was handled
    "type": "sessions" | "load" | "clear_prompt" | "clear_confirmed" | "help" | "unknown",
    "activeSessionId": "a11c...-uuid",               // present only for type "load"
    "restoredMessages": [                             // present only for type "load"
      { "role": "user", "content": "...", "timestamp": "2026-07-20T10:03:00.000Z" },
      { "role": "assistant", "content": "...", "timestamp": "2026-07-20T10:03:04.000Z" }
    ]
  }
}
```

`command` is entirely absent for ordinary (non-command) chat turns — existing clients/behavior are
unaffected.

## Behavior per command

### `/sessions`

- Input: `message` trims/lowercases to `/sessions`.
- Server calls `getSessionsMetadata(knownSessionIds)`, formats each as one line
  (`#<index> — <date> — <messageCount> messages`) ordered most-recent-first.
- `response` is that formatted list, or a friendly empty-state sentence if `knownSessionIds` is
  empty or none still exist.
- `command.type`: `"sessions"`. No `activeSessionId`/`restoredMessages`.

### `/load [reference]`

- `reference` is either a 1-based integer (resolved against the same ordering `/sessions` would
  produce for `knownSessionIds`) or a full UUID that must be present in `knownSessionIds`.
- On success: `response` confirms the switch, `command.type` = `"load"`,
  `command.activeSessionId` = the resolved session ID, `command.restoredMessages` = that session's
  full message history ordered by `timestamp` ascending.
- On missing/malformed reference: `response` is a short usage hint; `command.type` = `"load"`,
  no `activeSessionId`/`restoredMessages`.
- On reference not found in `knownSessionIds` (whether it doesn't exist at all or belongs to
  someone else): `response` is a generic "couldn't find that conversation" message; same for both
  cases, per FR-006. `command.type` = `"load"`, no `activeSessionId`/`restoredMessages`.

### `/clear`

- First call (`message` trims to `/clear`): `response` asks the user to confirm with
  `/clear confirm`; nothing is deleted. `command.type` = `"clear_prompt"`.
- Confirmed call (`message` trims to `/clear confirm`): server deletes all `chat_messages` rows
  for the request's `sessionId` (not `knownSessionIds` — only the currently active session can be
  cleared). `response` confirms completion (or states there was nothing to clear, if zero rows
  were deleted). `command.type` = `"clear_confirmed"`.
- The `leads` table is never touched by either call (FR-008).

### `/help`

- `response` lists all four commands with a one-line description each. `command.type` = `"help"`.

### Unrecognized `/...` input

- Any message starting with `/` that doesn't match the above: `response` points the user to
  `/help`. `command.type` = `"unknown"`.

## Error handling

All command handling happens after the existing `validateRequest` gate and before any Anthropic
call. Errors internal to command handling (e.g., a DB error while fetching session metadata) are
caught and surfaced as the existing generic error path (`getSafeErrorMessage`/HTTP 200), consistent
with the rest of the app's "fail closed, respond generically" behavior — never a raw stack trace
or DB error string in `response`.
