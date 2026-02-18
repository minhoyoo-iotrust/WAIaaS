# WAIaaS Project Rules

## Language

- All planning/design documents and issue reports are written in Korean.
- Commit messages, PR titles/bodies, Git tag messages, and GitHub Release titles/bodies are written in English.
- Code comments, variable names, and API responses use English.

## Communication

- Minimize questions; make your best judgment and propose the optimal approach.
- Only ask questions when choices are needed.

## Schema & Type System

- **Zod SSoT**: Zod schemas are the single source of truth. Derivation order: Zod → TypeScript types → OpenAPI → Drizzle schema → DB CHECK constraints.
- **discriminatedUnion 5-type**: Discriminate on the `type` field: TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH.
- ChainError extends Error (not WAIaaSError). Convert to WAIaaSError in Stage 5.
- Gas safety margin: `(estimatedGas * 120n) / 100n` bigint arithmetic.

## Database

- **DB migrations required since v1.4**: Provide incremental ALTER TABLE migrations for schema changes. Never drop and recreate the DB. Version management via the `schema_version` table. Strategy defined in design doc 65 (MIG-01~06).
- **Tests required for new migrations**: (1) Update schema snapshot fixtures (2) Write data transformation tests. Chain tests automatically verify the full path from past versions to the latest.
- SQLite timestamps are in seconds; UUID v7 uses ms for ordering.

## Configuration

- No nesting in config.toml. Environment variables follow the `WAIAAS_{SECTION}_{KEY}` pattern.
- **Expose runtime-adjustable settings in Admin Settings.** config.toml provides initial defaults; Admin Settings provides runtime overrides (hot-reload). Settings that should be changeable without daemon restart are made adjustable via SettingsService in the Admin UI. Security credentials (master_password_hash) and infrastructure settings (port, host, rpc_url) that require restart remain config.toml-only.

## Policy

- Default-deny policy: deny when ALLOWED_TOKENS / CONTRACT_WHITELIST / APPROVED_SPENDERS are not configured.
- Contracts default-deny (CONTRACT_WHITELIST opt-in).

## Interface Sync

- **When REST API, SDK, or MCP interfaces change, `skills/` files must be updated accordingly.**
  - Targets: quickstart.skill.md, wallet.skill.md, transactions.skill.md, policies.skill.md, admin.skill.md
  - Sync the corresponding skill files when endpoints are added/removed/changed, request/response schemas change, auth methods change, or error codes are added.
  - Create a new skill file when a new domain is added.

## Git Branching

- **Create a milestone branch before any work.** When starting a new milestone, create `milestone/v{X.Y}` branch from `main` before making any commits (including planning docs).
- All milestone work (planning, implementation, tests) happens on the milestone branch.
- Merge to `main` via PR when the milestone is complete.

## Milestone Completion

- **Run `pnpm turbo run lint` and `pnpm turbo run typecheck` before merging milestone branch to main.** Lint/type errors in merged code block release-please PRs.
- release-please manages version bumps + tags + CHANGELOG automatically (2-gate model).
- **Release flow**: Merge PR (Conventional Commits) → release-please auto-creates Release PR → Merge Release PR (Gate 1: release decision) → release.yml quality gate → deploy job manual approval (Gate 2: deployment execution).
- **Commit conventions**: `feat:` (minor), `fix:` (patch), `BREAKING CHANGE:` (major). `docs:`, `test:`, `chore:`, `ci:`, etc. are excluded from CHANGELOG.

## Milestone & Issue Naming

- Milestone objective files are placed in `internal/objectives/` with the format `m{seq}-{sub}-{slug}.md`.
  - `{seq}`: two-digit sequence number (01-99)
  - `{sub}`: two-digit sub-sequence (00 for main, 01-99 for sub-milestones)
  - `{slug}`: kebab-case topic name
- Issue files are placed in `internal/objectives/issues/` with the format `{NNN}-{slug}.md`.
- Register issues in `internal/objectives/issues/TRACKER.md` and update the status.
- Types: BUG (defect) / ENHANCEMENT (improvement) / MISSING (missing feature).
