# =============================================================================
# WAIaaS Docker Image -- Multi-stage build
# Stage 1 (builder): Install deps + build all packages via turbo
# Stage 2 (runner):  Production-only deps + dist artifacts + non-root user
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: builder
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder

# Native addon build dependencies (sodium-native, better-sqlite3, argon2)
RUN apt-get update \
    && apt-get install -y python3 make g++ --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 1) Copy workspace config + lock file (layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./

# 2) Copy each package's package.json only
COPY packages/core/package.json packages/core/package.json
COPY packages/daemon/package.json packages/daemon/package.json
COPY packages/admin/package.json packages/admin/package.json
COPY packages/adapters/solana/package.json packages/adapters/solana/package.json
COPY packages/adapters/evm/package.json packages/adapters/evm/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/mcp/package.json packages/mcp/package.json

# 3) Install all dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# 4) Copy full source
COPY . .

# 5) Build all packages (daemon + cli + mcp + sdk + adapters + core)
RUN pnpm turbo build


# ---------------------------------------------------------------------------
# Stage 2: runner
# ---------------------------------------------------------------------------
FROM node:22-slim AS runner

# OCI standard labels (populated by docker/build-push-action --build-arg)
LABEL org.opencontainers.image.title="WAIaaS" \
      org.opencontainers.image.description="AI Agent Wallet-as-a-Service daemon" \
      org.opencontainers.image.url="https://github.com/minho-yoo/waiaas" \
      org.opencontainers.image.source="https://github.com/minho-yoo/waiaas" \
      org.opencontainers.image.vendor="WAIaaS" \
      org.opencontainers.image.licenses="MIT"

# Watchtower auto-update support
# Watchtower monitors containers with this label and auto-pulls new images.
# Users opt-in per container: docker run --label com.centurylinklabs.watchtower.enable=true
LABEL com.centurylinklabs.watchtower.enable="true"

# Runtime dependencies: curl for HEALTHCHECK
RUN apt-get update \
    && apt-get install -y curl --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (UID 1001)
RUN groupadd -g 1001 waiaas && useradd -u 1001 -g waiaas -m -s /bin/sh waiaas

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 1) Copy workspace config for pnpm install --prod
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/turbo.json ./

# 2) Copy each package's package.json
COPY --from=builder /app/packages/core/package.json packages/core/package.json
COPY --from=builder /app/packages/daemon/package.json packages/daemon/package.json
COPY --from=builder /app/packages/admin/package.json packages/admin/package.json
COPY --from=builder /app/packages/adapters/solana/package.json packages/adapters/solana/package.json
COPY --from=builder /app/packages/adapters/evm/package.json packages/adapters/evm/package.json
COPY --from=builder /app/packages/cli/package.json packages/cli/package.json
COPY --from=builder /app/packages/sdk/package.json packages/sdk/package.json
COPY --from=builder /app/packages/mcp/package.json packages/mcp/package.json

# 3) Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# 4) Copy build artifacts (dist directories)
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/daemon/dist packages/daemon/dist
COPY --from=builder /app/packages/daemon/public packages/daemon/public
COPY --from=builder /app/packages/adapters/solana/dist packages/adapters/solana/dist
COPY --from=builder /app/packages/adapters/evm/dist packages/adapters/evm/dist
COPY --from=builder /app/packages/cli/dist packages/cli/dist
COPY --from=builder /app/packages/cli/bin packages/cli/bin
COPY --from=builder /app/packages/sdk/dist packages/sdk/dist
COPY --from=builder /app/packages/mcp/dist packages/mcp/dist

# 5) Copy and prepare entrypoint
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# 6) Create data directory with correct ownership
RUN mkdir -p /data && chown -R waiaas:waiaas /data /app

# 7) Environment configuration
ENV NODE_ENV=production
ENV WAIAAS_DATA_DIR=/data
ENV WAIAAS_DAEMON_HOSTNAME=0.0.0.0

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

USER waiaas

ENTRYPOINT ["/app/entrypoint.sh"]
