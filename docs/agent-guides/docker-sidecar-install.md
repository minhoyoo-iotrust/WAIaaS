---
title: "Running WAIaaS Inside an Agent Docker Container"
description: "Solve data persistence when running WAIaaS inside AI agent Docker containers. Volume mount and sidecar patterns."
date: "2026-02-10"
section: "blog"
slug: "docker-sidecar-install"
category: "Guides"
---
# Running WAIaaS Inside an Agent Docker Container

When you install an AI agent (e.g., OpenClaw, SWE-agent) in a Docker container and install WAIaaS via npm inside the same container, **WAIaaS data will be lost when the container image is rebuilt**. This guide explains the problem and how to prevent it.

## The Problem

A typical workflow looks like this:

1. Build an agent Docker image with WAIaaS pre-installed (`npm install -g @waiaas/cli`)
2. Run the container, initialize WAIaaS (`waiaas init`), create wallets, configure policies
3. Later, rebuild the image to update the agent or WAIaaS version
4. **All WAIaaS data (wallets, keys, sessions, policies, database) is gone**

This happens because WAIaaS stores data at `~/.waiaas/` inside the container filesystem. When the image is rebuilt, a new container is created from the fresh image and the old container's filesystem is discarded.

```
~/.waiaas/              <-- lives inside the container
  config.toml           <-- lost on rebuild
  data/waiaas.db        <-- lost on rebuild
  keystore/*.enc        <-- lost on rebuild (private keys!)
  tokens/               <-- lost on rebuild
  backups/              <-- lost on rebuild
```

## Solution: Mount the Data Directory

Mount `~/.waiaas/` (or a custom data directory) to a Docker volume or host path so that data persists independently of the container lifecycle.

### Option A: Docker Compose (Recommended)

Add a named volume for the WAIaaS data directory in your agent's `docker-compose.yml`:

```yaml
services:
  agent:
    image: your-agent-image
    volumes:
      - waiaas-data:/root/.waiaas
    environment:
      - WAIAAS_DATA_DIR=/root/.waiaas

volumes:
  waiaas-data:
    driver: local
```

### Option B: docker run

```bash
docker run \
  -v waiaas-data:/root/.waiaas \
  -e WAIAAS_DATA_DIR=/root/.waiaas \
  your-agent-image
```

### Option C: Host Bind Mount

If you want direct access to the data from the host filesystem:

```bash
mkdir -p ~/waiaas-data

docker run \
  -v ~/waiaas-data:/root/.waiaas \
  -e WAIAAS_DATA_DIR=/root/.waiaas \
  your-agent-image
```

This makes it easy to back up, inspect, or migrate the data.

## Dockerfile Example

A minimal Dockerfile that installs an agent and WAIaaS together:

```dockerfile
FROM node:22-slim

# Install your agent
RUN npm install -g your-agent-cli

# Install WAIaaS
RUN npm install -g @waiaas/cli

# Declare the data directory as a volume
# This serves as documentation and creates an anonymous volume as fallback
VOLUME /root/.waiaas

ENV WAIAAS_DATA_DIR=/root/.waiaas

CMD ["your-agent-entrypoint"]
```

> **Note:** The `VOLUME` instruction alone does not guarantee persistence across rebuilds. You must still use `-v` or a `volumes:` section at run time. The `VOLUME` instruction creates an anonymous volume as a safety net, but named volumes are strongly preferred.

## Non-Root Containers

If your agent container runs as a non-root user, adjust the data path accordingly:

```yaml
services:
  agent:
    image: your-agent-image
    user: "1000:1000"
    volumes:
      - waiaas-data:/home/agent/.waiaas
    environment:
      - WAIAAS_DATA_DIR=/home/agent/.waiaas

volumes:
  waiaas-data:
    driver: local
```

Make sure the mounted directory is writable by the container user. For host bind mounts:

```bash
mkdir -p ~/waiaas-data
chown 1000:1000 ~/waiaas-data
```

## Verifying Data Persistence

After setting up the volume mount, verify that data survives a rebuild:

```bash
# 1. Start and initialize
docker compose up -d
docker compose exec agent waiaas init --auto-provision
docker compose exec agent waiaas start
docker compose exec agent waiaas status   # should show "running"

# 2. Rebuild the image
docker compose down
docker compose build
docker compose up -d

# 3. Verify data is intact
docker compose exec agent waiaas start
docker compose exec agent waiaas status   # should show same wallets/config
```

## What Gets Persisted

| Path | Contents | Critical? |
|------|----------|-----------|
| `config.toml` | Daemon configuration | Yes |
| `data/waiaas.db` | All wallets, sessions, policies, transactions | Yes |
| `keystore/*.enc` | Encrypted private keys | **Critical** |
| `tokens/` | MCP session token files | Regenerable |
| `backups/` | Automatic backup archives | Recommended |
| `recovery.key` | Auto-provision master password | Delete after hardening |

> **Warning:** If `keystore/*.enc` files are lost, wallet private keys are **permanently unrecoverable**. Always ensure the data directory is mounted to a persistent volume.

## See Also

- [Deployment Guide](../deployment.md) -- WAIaaS native Docker deployment with `docker-compose.yml`
- [OpenClaw Integration](openclaw-integration.md) -- Connecting WAIaaS to OpenClaw agents
- [Agent Self-Setup Guide](agent-self-setup.md) -- Autonomous daemon provisioning with `waiaas init --auto-provision`

## Related

- [Deployment Guide](/docs/deployment/) - WAIaaS native Docker deployment
- [Agent Self-Setup Guide](/blog/agent-self-setup/) - Autonomous daemon provisioning
- [Architecture](/docs/architecture/) - System architecture overview
