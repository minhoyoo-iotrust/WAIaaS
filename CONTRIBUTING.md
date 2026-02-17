# Contributing to WAIaaS

Thank you for your interest in contributing to WAIaaS! This is a streamlined open-source project without a formal Code of Conduct -- just be respectful and constructive.

## Development Setup

### Prerequisites

- **Node.js** 22 LTS or later
- **pnpm** 9+ (corepack will activate it automatically)

### Clone and Build

```bash
git clone https://github.com/anthropics/waiaas.git
cd waiaas
pnpm install
pnpm build
```

### Development Mode

```bash
# Start the daemon in dev mode (fixed password "dev-password", auto-reload)
pnpm --filter @waiaas/cli exec waiaas init --dev
pnpm --filter @waiaas/cli exec waiaas start

# Admin UI hot-reload (Vite dev server)
pnpm --filter @waiaas/admin dev
```

In dev mode, the daemon uses a fixed master password (`dev-password`) so you don't need to type it every time.

### Data Directory

WAIaaS stores data (database, keystore, config) in `~/.waiaas/` by default. Use `--dev` during init to create a separate dev environment:

```bash
waiaas init --dev    # Uses ~/.waiaas-dev/
```

## Project Structure

WAIaaS is a monorepo with 9 TypeScript packages and a Python SDK:

| Package | Path | Description |
|---------|------|-------------|
| `@waiaas/core` | `packages/core/` | Domain models, interfaces, Zod schemas, error codes |
| `@waiaas/daemon` | `packages/daemon/` | Self-hosted daemon (Hono HTTP, SQLite, Keystore) |
| `@waiaas/adapter-solana` | `packages/adapters/solana/` | Solana chain adapter (@solana/kit 6.x) |
| `@waiaas/adapter-evm` | `packages/adapters/evm/` | EVM chain adapter (viem 2.x) |
| `@waiaas/cli` | `packages/cli/` | CLI tool (`waiaas` command) |
| `@waiaas/sdk` | `packages/sdk/` | TypeScript SDK (zero external deps) |
| `@waiaas/mcp` | `packages/mcp/` | MCP server (stdio transport) |
| `@waiaas/admin` | `packages/admin/` | Admin Web UI (Preact + Signals + Vite) |
| Python SDK | `python-sdk/` | Python SDK (httpx + Pydantic v2) |

Build order is managed by Turborepo. Run `pnpm build` from the root to build everything in the correct dependency order.

## Code Style

### TypeScript

- **Strict mode** enabled across all packages
- **ESLint + Prettier** for linting and formatting
- Run before committing:

```bash
pnpm lint            # ESLint
pnpm format:check    # Prettier (check only)
pnpm format          # Prettier (auto-fix)
pnpm typecheck       # tsc --noEmit
```

### Zod SSoT (Single Source of Truth)

Zod schemas are the single source of truth for all data types. The derivation chain is:

```
Zod schema -> TypeScript type -> OpenAPI 3.0 -> Drizzle schema -> DB CHECK constraint
```

When adding or changing data models, always start with the Zod schema in `@waiaas/core`.

### Naming Conventions

- Code comments and variable names: **English**
- Planning / design documents: **Korean**
- Commit messages: English prefix (`feat:`, `fix:`, etc.), body in Korean

## Testing

WAIaaS uses **Vitest 3.x** for all testing. Test files follow the `*.test.ts` naming convention.

### Running Tests

```bash
# All tests (via Turborepo)
pnpm test

# Single package
pnpm --filter @waiaas/daemon test
pnpm --filter @waiaas/core test

# Specific test categories
pnpm test:unit          # Unit tests only
pnpm test:integration   # Integration tests only
pnpm test:security      # Security tests only
pnpm test:chain         # Chain migration tests

# Coverage report
pnpm --filter @waiaas/daemon exec vitest run --coverage
```

### Writing Tests

- Place test files next to the source file or in a `__tests__/` directory
- Use descriptive `describe` / `it` blocks
- Mock external dependencies (RPC endpoints, price oracles, etc.)

## Pull Request Process

### Workflow

1. **Fork** the repository
2. Create a **feature branch** from `main` (e.g., `feat/add-polygon-adapter`)
3. Make your changes and commit with [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a **Pull Request** to `main`

### Conventional Commits

All commits must follow Conventional Commits format. This drives automatic versioning and changelog generation via release-please.

| Prefix | When | CHANGELOG |
|--------|------|-----------|
| `feat:` | New feature | Yes (minor bump) |
| `fix:` | Bug fix | Yes (patch bump) |
| `docs:` | Documentation only | No |
| `test:` | Test only | No |
| `chore:` | Tooling, config | No |
| `ci:` | CI/CD changes | No |
| `refactor:` | Code cleanup, no behavior change | No |
| `BREAKING CHANGE:` | Breaking API change | Yes (major bump) |

Example:

```
feat: add Polygon chain adapter

- Implement IChainAdapter for Polygon PoS
- Add ERC-20 token support via shared EVM utilities
- Register adapter in chain resolver
```

### PR Checklist

Before submitting, ensure:

- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] New features have tests
- [ ] Breaking changes are documented

## Database Migrations

Since v1.4, **incremental migrations are mandatory** for any schema change.

### Rules

- **Never** delete and recreate the database -- always provide `ALTER TABLE` incremental migrations
- Version tracking via the `schema_version` table
- Each migration must be idempotent and forward-only
- Chain tests (`pnpm test:chain`) automatically verify the full migration path from every past version to the latest

### Adding a Migration

1. Add the migration SQL file in the daemon's migration directory
2. Update the schema snapshot fixture
3. Write a data transformation test if the migration alters existing data
4. Run `pnpm test:chain` to verify the full version chain

## Interface Sync Rule

When changing any public interface (REST API, SDK, MCP), you **must** also update the corresponding skill file in `skills/`:

| Interface Change | Skill File |
|-----------------|------------|
| REST endpoints | `quickstart.skill.md`, `wallet.skill.md`, `transactions.skill.md`, etc. |
| Policy API | `policies.skill.md` |
| Admin API | `admin.skill.md` |
| Action Provider | `actions.skill.md` |
| x402 | `x402.skill.md` |

This includes: endpoint additions/removals, request/response schema changes, auth method changes, and new error codes.

## Questions?

Open an issue on GitHub or check the existing [documentation](docs/).
