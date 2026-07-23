# Implementation Plan: Chat Session Management Commands

**Branch**: `001-chat-session-commands` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-chat-session-commands/spec.md`

## Summary

Add four in-chat text commands — `/sessions`, `/load [reference]`, `/clear`, `/help` — so a
returning customer can see their previous conversations, resume one, wipe the current one, and
discover what's available, all without introducing authentication. Ownership is scoped by having
the browser remember the list of session IDs it has used (in `localStorage`) and sending that
list to the server on every command; the server only ever answers questions about IDs the client
already proved knowledge of, and never confirms/denies the existence of IDs outside that list.
Commands are detected and fully handled inside the existing `/api/chat` route before any call to
the Anthropic API, reusing the existing `chat_sessions`/`chat_messages` tables with no schema
changes.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js, targeting Next.js 16.2.10 (App Router) / React 19.2

**Primary Dependencies**: Next.js, React, `pg` (node-postgres), `@anthropic-ai/sdk`, `uuid` — all
already in use. New dev dependencies for this feature: **Vitest** (unit + integration tests) and
**Playwright** (end-to-end tests) — the repo has no test runner today, and Principle II
(Test-Driven Quality) is NON-NEGOTIABLE, so introducing one is foundational to this feature.

**Storage**: PostgreSQL via the existing `chat_sessions` and `chat_messages` tables (see
`lib/db/schema.sql`). No new tables and no migrations are required.

**Testing**: Vitest for unit tests (command parsing/dispatch logic) and integration tests
(repository functions against a real local Postgres), Playwright for end-to-end tests (full
command flow through the running app in a browser).

**Target Platform**: Web — Next.js server (Node.js) + browser client; same deployment target as
the rest of the app.

**Project Type**: Web application — single Next.js project (no frontend/backend split).

**Performance Goals**: `/sessions` responds within 2s (spec SC-001), consistent with the
constitution's default performance target for simple indexed queries (p95 < 100ms at the database
layer; the 2s budget in SC-001 also covers network/render round-trip).

**Constraints**: No authentication exists in the app and none is introduced by this feature;
existing "fail closed, respond generically" security-gate behavior (see `CLAUDE.md` /
`lib/security/requestValidator.ts`) must be preserved for command input; local development remains
Node.js + PostgreSQL installed directly on the machine, no Docker.

**Scale/Scope**: Single-dealership chatbot; a given browser is expected to accumulate on the order
of tens of sessions, not an enterprise-scale multi-tenant volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Note on constitution/codebase fit**: `.specify/memory/constitution.md` was authored against a
> hypothetical stack description (Prisma ORM, pgvector, OpenAI) that does not match this repo's
> actual stack (`pg`/node-postgres, Anthropic API, no vector search or RAG pipeline). Per explicit
> project-owner decision, this plan follows the codebase's existing, real patterns rather than
> migrating the app to Prisma/OpenAI as part of a 4-command feature. Where this creates a literal
> mismatch with a principle, it's called out below and logged in Complexity Tracking rather than
> silently ignored.

| Principle | Status | Notes |
|---|---|---|
| I. Specification-First Development | ✅ PASS | `spec.md` written and quality-checklist-validated before this plan. |
| II. Test-Driven Quality (NON-NEGOTIABLE) | ⚠️ GAP → ADDRESSED | Repo has no test runner today. This plan's Foundational phase introduces Vitest + Playwright and requires unit/integration/e2e coverage for every user story (see Phase 1 / tasks). Treated as new foundational work, not a waiver of the principle. |
| III. Clean Architecture & Domain-Driven Boundaries | ✅ PASS BY DESIGN | New `lib/services/commandRouter.ts` is the business/service layer (framework-independent, no Next.js/`pg` imports); `app/api/chat/route.ts` stays a thin controller; `lib/db/queries.ts` remains the sole repository/data-access layer. |
| IV. Strict Typing & Static Quality Gates | ✅ PASS | `tsconfig.json` already has `strict: true`. All new command/service/repository signatures are explicitly typed; no `any`. |
| V. Modular, Testable RAG Pipeline | N/A | This feature never calls the LLM or a vector store; the app has no RAG/ingestion pipeline at all. Not applicable. |
| VI. Prisma-Only Data Access | ⚠️ DEVIATION (documented, user-approved) | Repo uses `pg`/node-postgres, not Prisma. Spirit of the principle (centralized, parameterized repository functions, no ad hoc SQL in routes) is preserved via `lib/db/queries.ts`; the letter (Prisma specifically) is not. See Complexity Tracking. |
| VII. Grounded, Cited AI Responses | N/A | Commands bypass the LLM entirely — no retrieval, no generation, so nothing to cite. |
| VIII. Dependency Injection & Interface-Based Design | ✅ PASS BY DESIGN | `commandRouter` is built by a factory function that takes a repository-shaped dependency object as a parameter, so unit tests inject fakes instead of hitting Postgres. |
| IX. Security & Configuration Discipline | ✅ PASS BY DESIGN | `/load` references are checked against the client-submitted known-session-id list before any DB lookup (FR-006, no cross-user enumeration); `/clear` requires an explicit second confirmation step (FR-007); all command input still passes through the existing `validateRequest` gate (FR-012); no new secrets or config. |
| Tech Stack: Node.js + PostgreSQL local dev, no Docker | ✅ PASS | Unchanged; feature adds no new local infrastructure requirement. |

**Overall Gate**: PASS, with one documented and explicitly user-approved deviation (Principle VI).
Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-chat-session-commands/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
└── api/
    └── chat/
        └── route.ts              # EXISTING — extended to detect "/..." commands and dispatch
                                   # them via commandRouter before any Anthropic call

components/
└── ChatInterface.tsx             # EXISTING — extended to track active/known session IDs in
                                   # localStorage and to handle command-shaped responses
                                   # (restored history on /load, cleared view on /clear confirm)

lib/
├── db/
│   └── queries.ts                # EXISTING repository — add getSessionsMetadata(ids),
                                   # deleteSessionMessages(sessionId)
├── security/
│   └── requestValidator.ts       # EXISTING — unchanged, reused as-is for command input
└── services/
    ├── types.ts                  # NEW — framework-independent domain types (SessionSummary,
                                   # CommandResult, etc.)
    └── commandRouter.ts          # NEW — business/service layer: parses commands, dispatches to
                                   # handlers via an injected repository dependency object

tests/
├── unit/
│   └── commandRouter.test.ts     # NEW — command parsing/dispatch, repository faked
├── integration/
│   └── sessionQueries.test.ts    # NEW — getSessionsMetadata / deleteSessionMessages against a
                                   # real local Postgres
└── e2e/
    └── session-commands.spec.ts  # NEW — Playwright coverage of all four commands end-to-end
```

**Structure Decision**: Single existing Next.js project, extended in place. This feature adds one
new layer, `lib/services/`, to hold framework-independent business logic (satisfying Principle
III), and one new top-level `tests/` directory (unit/integration/e2e), since the project has none
today (satisfying Principle II). No new projects, packages, or services are introduced.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Continuing to use `pg`/node-postgres via `lib/db/queries.ts` instead of Prisma (Principle VI: Prisma-Only Data Access) | The entire existing codebase — every table, every query — is already built on `pg`. This feature only adds two read/delete queries against existing tables. | Introducing Prisma solely for this feature would mean running two competing data-access layers against the same tables (Prisma for the two new queries, `pg` for everything else), which is strictly worse for consistency and maintainability than extending the already-centralized `queries.ts` repository. A full migration to Prisma was explicitly considered and declined by the project owner as out of scope for a 4-command feature. |
