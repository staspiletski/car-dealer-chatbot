<!--
Sync Impact Report
==================
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: N/A (first concrete adoption of the constitution template)
Added sections:
  - Core Principles I–IX (Specification-First Development; Test-Driven Quality;
    Clean Architecture & Domain-Driven Boundaries; Strict Typing & Static Quality
    Gates; Modular, Testable RAG Pipeline; Prisma-Only Data Access; Grounded,
    Cited AI Responses; Dependency Injection & Interface-Based Design;
    Security & Configuration Discipline)
  - Technology Stack & Environment Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: Generic placeholder principles (I-V) from the template
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check gate is generic/dynamic — no changes needed)
  - ✅ .specify/templates/spec-template.md (mandatory sections already align — no changes needed)
  - ✅ .specify/templates/tasks-template.md (updated: tests are mandatory per Principle II, not optional)
  - ⚠ .claude/skills/speckit-tasks/SKILL.md (shared, non-project-specific skill logic still defaults to
    "tests are optional"; this project's tasks-template.md now overrides that default, but flagging since
    the skill's own guidance text was not modified — see follow-up)
Follow-up TODOs:
  - None blocking. Optional: if the speckit-tasks skill is ever forked/customized per-project, align its
    "Tests are OPTIONAL" language with Principle II for this repo.
-->

# CarDealerBot Enterprise Chatbot Constitution

## Core Principles

### I. Specification-First Development

Every feature, whether product-facing or internal/technical, MUST begin with a written
specification (`spec.md`) produced through the spec-driven workflow before any implementation
code is written. Specifications MUST define user scenarios, functional requirements, and
measurable success criteria before a plan (`plan.md`) or task list (`tasks.md`) is generated.
Implementation MUST NOT begin until the specification and plan have been reviewed and approved.
If reality diverges from the spec during implementation, the spec MUST be updated to reflect the
decision — undocumented drift between spec and code is a defect, not an acceptable shortcut.

**Rationale**: Spec-first development is the organizing discipline of this project. Skipping it
produces undocumented behavior that cannot be reviewed, tested against, or safely evolved by
future contributors or agents.

### II. Test-Driven Quality (NON-NEGOTIABLE)

Every feature MUST ship with three layers of automated tests: unit tests for business/domain
logic and repositories, integration tests for API routes, service boundaries, and Prisma/pgvector
queries, and end-to-end tests for user-facing flows. Tests MUST express the acceptance criteria
from the specification, MUST be written before or alongside implementation, and MUST fail before
the corresponding implementation exists. A pull request MUST NOT merge with reduced test coverage
on touched business logic; any skipped or pending test MUST be explicitly justified in the PR
description.

**Rationale**: An enterprise chatbot that reasons over retrieved data and executes SQL/vector
queries is high-risk for silent regressions. Test-first discipline is the primary defense.

### III. Clean Architecture & Domain-Driven Boundaries

The codebase MUST maintain strict separation between five layers: UI (React
components/pages/Tailwind), API routes (Next.js route handlers, kept as thin controllers only),
business services (use cases and domain logic), repositories (data access contracts), and data
access (Prisma client and pgvector queries). Business/domain logic MUST NOT import Next.js
request/response types, React, or the Prisma client directly; the domain layer depends only on
plain TypeScript interfaces, with framework and persistence details injected at the boundary.
Where a bounded context exists (e.g., Conversation, Document, Retrieval, Citation), Domain-Driven
Design MUST be applied: entities, value objects, and domain services live independent of
frameworks and MUST be unit-testable without a database or HTTP server.

**Rationale**: Layering and DDD boundaries keep the system maintainable and swappable as it
grows, and let business rules be tested and reasoned about without spinning up infrastructure.

### IV. Strict Typing & Static Quality Gates

TypeScript strict mode MUST be enabled project-wide. The `any` type MUST NOT be used unless
accompanied by an inline comment justifying why (e.g., an untyped third-party library boundary),
and the value MUST be narrowed to a concrete type immediately after crossing that boundary.
Public module boundaries — service interfaces, repository interfaces, API contracts, and RAG
pipeline module signatures — MUST have explicit parameter and return types. ESLint and Prettier
MUST be run automatically (pre-commit and/or CI) rather than enforced manually in review;
formatting is never a matter of reviewer opinion.

**Rationale**: Strong typing catches integration errors (LLM payloads, Prisma models, retrieval
results) at compile time instead of in production; automated formatting removes bikeshedding.

### V. Modular, Testable RAG Pipeline

The retrieval-augmented generation pipeline MUST be decomposed into independently testable
modules: document ingestion, chunking, embedding generation, retrieval, and answer generation.
Each module MUST be invocable and testable in isolation, with fixtures/mocks standing in for the
other stages. LLM access (chat completions and embeddings) and vector store access MUST sit
behind explicit interfaces (e.g., `ChatModel`, `EmbeddingModel`, `VectorStore`) so that OpenAI or
pgvector can be replaced or mocked without changes to calling code. Prompts MUST be defined as
versioned, isolated artifacts — not inlined ad hoc inside route handlers — and MUST be
independently testable (e.g., unit/snapshot tests over prompt construction given fixed inputs).

**Rationale**: RAG systems fail in subtle, stage-specific ways (bad chunking, stale embeddings,
irrelevant retrieval, ungrounded generation); isolating and testing each stage is the only way to
localize and fix failures instead of guessing across an opaque pipeline.

### VI. Prisma-Only Data Access

All SQL and vector operations, including pgvector similarity search, MUST go through Prisma-based
repository classes/functions. No route handler, service, or UI component may import or query the
database client directly. Raw SQL required for pgvector operators (`$queryRaw`/`$executeRaw`)
MUST be encapsulated inside repository methods, fully parameterized (never string-interpolated
with untrusted input), and covered by integration tests.

**Rationale**: Centralizing data access through repositories is what makes Principle III's
layering real, prevents SQL injection, and gives one place to enforce query performance targets.

### VII. Grounded, Cited AI Responses

Any assistant response that draws on retrieved documents MUST include citations identifying the
specific source document(s)/chunk(s) used. The system MUST NOT fabricate facts, sources, or
citations. When retrieval returns no sufficiently relevant context, the assistant MUST say so
explicitly rather than answering from unsupported prior knowledge. Each RAG-backed feature's
specification MUST define its relevance/confidence threshold and citation format, and MUST include
tests asserting that citations are present and traceable to actually-retrieved chunks.

**Rationale**: In an enterprise setting, an ungrounded or fabricated answer is a trust and
liability failure, not a quality nitpick — citations are how users and auditors verify correctness.

### VIII. Dependency Injection & Interface-Based Design

Services MUST depend on interfaces/abstractions — LLM provider, vector store, repository, clock,
file storage, etc. — rather than concrete implementations. Concrete implementations are wired at
the composition boundary (route handler or server bootstrap), not constructed deep inside business
logic. This applies with particular emphasis to LLM providers and vector stores, which MUST be
swappable (e.g., OpenAI → another provider, pgvector → another vector store) or replaceable with
test doubles without touching business logic.

**Rationale**: LLM and vector-store vendors change quickly; interface-based design is what keeps
a provider swap or a unit test from requiring a rewrite of core business logic.

### IX. Security & Configuration Discipline

All external input — user messages, API payloads, uploaded files — MUST be validated at the
system boundary (schema validation) before reaching business logic. File uploads MUST be
validated for type, size, and content before processing or storage; the ingestion pipeline MUST
reject unsupported, oversized, or malicious files. Prompt injection defenses MUST be applied to
any user-controllable or retrieved text that is interpolated into an LLM prompt: untrusted content
MUST be clearly delimited from system instructions, and system prompts MUST constrain the
assistant to its intended scope. Secrets (API keys, database credentials) MUST be supplied via
environment variables (`.env.local` locally, platform environment variables in deployed
environments), MUST NOT be committed to source control, and all `.env*` files other than
`.env.example` MUST be gitignored.

**Rationale**: A chatbot with tool/database access and file ingestion is a direct attack surface;
these controls are the minimum bar for handling untrusted input and credentials safely.

## Technology Stack & Environment Constraints

- **UI**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS.
- **Data**: PostgreSQL accessed exclusively through Prisma ORM; pgvector extension for vector
  similarity search, accessed only through Prisma repositories per Principle VI.
- **AI**: OpenAI API for chat completions and embeddings, accessed only through the LLM
  provider interfaces defined in Principle VIII — never called directly from routes or UI.
- **Local development** MUST use Node.js and PostgreSQL installed directly on the developer's
  machine. Docker/containers MUST NOT be required to run or develop the application locally.
- **Configuration** MUST be environment-based. No environment-specific values (URLs, keys,
  feature flags) may be hardcoded in source; they are read from environment variables and
  validated at startup.
- **Performance targets** (defaults; an individual feature spec MAY set stricter or looser
  targets with explicit justification):
  - Simple indexed Prisma queries: p95 < 100ms.
  - pgvector similarity search (top-k retrieval) at the feature's specified corpus scale: p95 < 500ms.
  - Chat response streaming MUST begin (first token/byte) within p95 < 2s of request receipt.

## Development Workflow & Quality Gates

- Every feature MUST progress `spec.md` (approved) → `plan.md` → `tasks.md` before any
  implementation task is executed.
- Documentation (README, `docs/`, and relevant module-level docs) MUST be updated in the same
  pull request as any feature that changes user-facing or developer-facing behavior.
- A pull request MUST NOT merge unless it passes: linting (ESLint), formatting verification
  (Prettier), type checking (`tsc --noEmit`), the full automated test suite relevant to the
  touched areas (unit + integration + e2e per Principle II), and a specification-alignment
  review confirming the implementation matches `spec.md`/`plan.md`.
- Code review MUST explicitly verify: Clean Architecture layer boundaries (Principle III),
  dependency injection / interface usage for swappable components (Principle VIII), absence of
  unjustified `any` (Principle IV), Prisma-only data access (Principle VI), and citation/grounding
  behavior for any RAG-facing change (Principle VII).
- Code MUST be written to be maintainable, modular, and production-ready — no speculative
  abstractions beyond what the current spec requires, but no throwaway/prototype-quality code
  merged to the main branch either.

## Governance

This constitution supersedes ad hoc conventions and prior undocumented practice. Where existing
code conflicts with a principle, the principle wins: the code MUST be brought into compliance, or
an amendment MUST be proposed and ratified before the conflicting pattern is treated as acceptable.

**Amendment procedure**: Amendments are proposed via a pull request that edits this file directly,
MUST include an updated Sync Impact Report (as an HTML comment at the top of this file), and MUST
update any dependent template or agent-guidance file affected by the change in the same PR.

**Versioning policy**: This constitution follows semantic versioning:
- **MAJOR** — backward-incompatible removal or redefinition of a principle or governance rule.
- **MINOR** — a new principle or section is added, or existing guidance is materially expanded.
- **PATCH** — clarifications, wording, typo fixes, or other non-semantic refinements.

**Compliance review**: Every pull request and code review MUST verify compliance with this
constitution. Any necessary complexity or deviation MUST be explicitly called out and justified
in the PR description (and, for plan-level deviations, in the plan's Complexity Tracking table).

**Version**: 1.0.0 | **Ratified**: 2026-07-22 | **Last Amended**: 2026-07-22
