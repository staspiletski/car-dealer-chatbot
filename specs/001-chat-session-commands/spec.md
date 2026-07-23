# Feature Specification: Chat Session Management Commands

**Feature Branch**: `001-chat-session-commands`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Add session management commands: /sessions to list previous chats with dates and message counts, /load [id] to resume a previous conversation, /clear to delete current session messages, and /help to show all commands."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List Previous Conversations (Priority: P1)

A returning customer wants to see the conversations they've had with CarDealerBot so they can decide whether to continue one of them or start fresh. They type `/sessions` and see a list of their previous conversations, each with when it happened and how many messages it contains.

**Why this priority**: This is the foundational capability the whole feature depends on — without a way to see previous conversations, `/load` has no usable input and the feature delivers no value on its own.

**Independent Test**: Can be fully tested by having a user with multiple prior conversations send `/sessions` and verifying the response lists each conversation with a date and message count, independent of whether `/load` or `/clear` are implemented.

**Acceptance Scenarios**:

1. **Given** a user has had 3 previous conversations, **When** they send `/sessions`, **Then** the response lists all 3, each showing a reference the user can use with `/load`, the date/time it started, and its message count, ordered most-recent first.
2. **Given** a user has never chatted before, **When** they send `/sessions`, **Then** the response clearly states there are no previous conversations yet, without an error.
3. **Given** a user has a conversation with zero completed messages (e.g., abandoned immediately), **When** they send `/sessions`, **Then** that conversation is either omitted or shown with a message count of 0, not treated as an error.

---

### User Story 2 - Resume a Previous Conversation (Priority: P2)

A customer who saw a car they liked yesterday wants to pick that conversation back up instead of re-explaining their preferences. They use `/load` with the reference shown in `/sessions` and the bot restores that conversation so they can continue where they left off.

**Why this priority**: This is the core "session management" value proposition — turning a listed history into something actionable — but it depends on User Story 1 existing first to supply valid references.

**Independent Test**: Can be fully tested by loading a known, previously-seeded session by its reference and confirming the full prior message history becomes the active conversation and new messages append to it.

**Acceptance Scenarios**:

1. **Given** a user has a previous conversation with 5 messages, **When** they send `/load` with that conversation's reference, **Then** all 5 prior messages are restored as the active conversation and the user can continue chatting within it.
2. **Given** a user sends `/load` with a reference that does not exist or is not theirs, **When** the system processes it, **Then** the user receives a clear, friendly "not found" message that does not reveal whether the reference belongs to someone else.
3. **Given** a user sends `/load` with no reference or a malformed one, **When** the system processes it, **Then** the user receives a short usage hint (e.g., how to find a valid reference via `/sessions`).

---

### User Story 3 - Clear Current Conversation (Priority: P3)

A customer wants to start over in the same chat window without their prior questions cluttering the context. They send `/clear` and, after confirming, their current conversation's messages are removed so they can start fresh.

**Why this priority**: Useful housekeeping that improves the experience but is not required for the list/resume value delivered by User Stories 1 and 2.

**Independent Test**: Can be fully tested by sending `/clear` in a conversation with existing messages, confirming when prompted, and verifying the conversation is empty afterward while any previously saved contact/lead information is untouched.

**Acceptance Scenarios**:

1. **Given** an active conversation with prior messages, **When** the user sends `/clear` and confirms, **Then** the conversation's messages are removed and the next message starts a clean conversation history.
2. **Given** an active conversation with prior messages, **When** the user sends `/clear` but does not confirm (or declines), **Then** no messages are removed.
3. **Given** a user previously provided contact details that were saved as a lead, **When** they send `/clear` and confirm, **Then** the saved lead/contact record is unaffected.
4. **Given** an active conversation with no messages yet, **When** the user sends `/clear`, **Then** the system responds that there is nothing to clear, without error.

---

### User Story 4 - Discover Available Commands (Priority: P4)

A new or returning customer isn't sure what commands are available. They send `/help` and get a short list of every command with a one-line description of what it does.

**Why this priority**: Improves discoverability of the other three commands but has no value on its own if none of them exist yet, so it is sequenced last.

**Independent Test**: Can be fully tested by sending `/help` in any conversation state (new or existing) and verifying the response lists `/sessions`, `/load`, `/clear`, and `/help` with accurate one-line descriptions.

**Acceptance Scenarios**:

1. **Given** any conversation state, **When** the user sends `/help`, **Then** the response lists all four commands with a short description of each.
2. **Given** a user sends an unrecognized command starting with `/`, **When** the system processes it, **Then** the response points the user to `/help` instead of silently failing or treating it as a vehicle question.

---

### Edge Cases

- What happens when `/sessions` is sent by a user with no previous chats? System responds with a friendly empty-state message, not an error.
- What happens when `/load` is sent without a reference, or with one that doesn't parse? System responds with a short usage hint.
- What happens when `/load` targets a conversation that was since removed via `/clear` or otherwise no longer exists? System responds with a not-found message.
- What happens when `/clear` is sent on an already-empty conversation? System responds that there's nothing to clear.
- What happens if the user keeps chatting immediately after `/clear`? The same conversation continues, now with empty history, rather than starting an entirely new one.
- What happens if a command is sent with extra whitespace or mixed case (e.g., `/SESSIONS`, ` /help`)? System still recognizes it as the intended command.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST recognize `/sessions`, `/load [reference]`, `/clear`, and `/help` as special commands when entered as chat input, distinct from ordinary vehicle-inquiry messages.
- **FR-002**: When a user sends `/sessions`, system MUST return a list of that user's previous conversations, each showing a reference usable with `/load`, the date/time it started, and its message count.
- **FR-003**: The `/sessions` list MUST be scoped to the requesting user's own conversations only and MUST NOT expose conversations belonging to other users.
- **FR-004**: System MUST order the `/sessions` list by most recent activity first.
- **FR-005**: When a user sends `/load [reference]`, system MUST retrieve the full message history for that conversation and make it the active conversation, so subsequent messages continue it.
- **FR-006**: If the reference given to `/load` does not exist or does not belong to the requesting user, system MUST return a clear, friendly error message and MUST NOT reveal whether the reference exists for a different user.
- **FR-007**: When a user sends `/clear`, system MUST ask for confirmation before removing anything, and MUST only remove the current active conversation's messages after the user confirms.
- **FR-008**: `/clear` MUST NOT delete or modify any previously saved lead/contact information associated with the conversation.
- **FR-009**: When a user sends `/help`, system MUST display all available commands with a one-line description of what each does.
- **FR-010**: System MUST treat commands case-insensitively and MUST tolerate surrounding whitespace (e.g., `/Sessions`, ` /help ` behave the same as `/sessions`, `/help`).
- **FR-011**: If a user sends an unrecognized command beginning with `/`, system MUST respond with a helpful message directing them to `/help` rather than treating it as a vehicle inquiry or failing silently.
- **FR-012**: System MUST continue to apply existing input validation and abuse-prevention checks to command input, consistent with how ordinary chat messages are handled.

### Key Entities

- **Chat Session**: A single conversation between a user and CarDealerBot. Relevant attributes for this feature: a reference usable with `/load`, when it started, its current message count, and whether it is still accessible (not cleared/removed).
- **Chat Message**: An individual message within a Chat Session (existing concept); this feature reads message counts and full history per session and removes messages on `/clear`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see their list of previous conversations within 2 seconds of sending `/sessions`.
- **SC-002**: 100% of previous conversations that still exist can be fully resumed via `/load`, with all prior messages visible and continuable.
- **SC-003**: A user can successfully clear their current conversation without outside help in a single confirmed step.
- **SC-004**: A new user can learn all available commands and their purpose from a single `/help` response, without needing outside documentation.
- **SC-005**: 0% of `/load` attempts succeed in loading a conversation that does not belong to the requesting user.

## Assumptions

- The application currently has no login/authentication; a conversation's reference (its session identifier) is already the sole mechanism used to resume it. This feature keeps that same model: "the user's own conversations" means conversations associated with identifiers known to the requesting browser/device, and knowledge of a valid reference is treated as proof of access, consistent with how the application already works today.
- Because of the above, conversation history is private per browser/device: it is not accessible from a different browser without knowing the specific reference, and there is no cross-device sync in this feature's scope.
- `/clear` requires a lightweight confirmation step to avoid accidental data loss; it does not require typing a password or other heavy-weight confirmation.
- `/sessions` returns a reasonably bounded, most-recent set of conversations (e.g., the most recent 20) rather than a user's entire unbounded history, to keep the response easy to read.
- Commands are entered as plain text within the existing chat input; no separate menu, button, or UI surface is required for this feature.
- Clearing a conversation's messages does not affect any lead/contact information already saved from that conversation, since leads are a separate record kept for dealership follow-up.
