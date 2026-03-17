---
title: "Agent Self-Setup Guide"
description: "How an autonomous AI agent can set up WAIaaS from scratch with zero human interaction using auto-provision mode."
date: "2026-02-10"
section: "blog"
slug: "agent-self-setup"
category: "Guides"
---
# Agent Self-Setup Guide

This guide describes how an autonomous AI agent can set up WAIaaS from scratch with zero human interaction using the **auto-provision** mode.

## Prerequisites

- **Node.js 22 LTS** or later
- **npm** package manager (bundled with Node.js)
- No existing WAIaaS installation (first-time setup)

## Auto-Provision Setup

### 1. Install CLI

```bash
npm install -g @waiaas/cli
```

### 2. Initialize with Auto-Provision

```bash
waiaas init --auto-provision
```

This creates the data directory (`~/.waiaas/`) with:

- `config.toml` -- default configuration with auto-generated master password hash
- `recovery.key` -- plaintext master password for autonomous access

The `--auto-provision` flag generates a cryptographically random master password, hashes it with Argon2id, and stores the hash in config.toml. The plaintext password is saved to `recovery.key` so that subsequent CLI commands can authenticate without human input.

### 3. Start Daemon

```bash
waiaas start
```

The daemon starts immediately using the auto-provisioned password. No interactive password prompt.

Verify:

```bash
curl -s http://localhost:3100/health
```

### 4. Create Wallets and Session

```bash
waiaas quickset
```

This reads the master password from `recovery.key` automatically and creates:

1. Solana + EVM wallets
2. Session tokens (`wai_sess_...`)
3. MCP configuration JSON

Capture the session token from the output:

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<token-from-quickset>
```

### 5. Verify Connection

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

This returns accessible wallets, policies, capabilities, and an AI-ready usage prompt.

## Next Steps

- [Agent Skills Integration](agent-skills-integration.md) -- Install WAIaaS skill files to teach your agent wallet operations
- [Claude Code Integration](claude-code-integration.md) -- Claude Code specific skill setup
- [OpenClaw Integration](openclaw-integration.md) -- OpenClaw specific skill setup

## Related

- [Agent Skills Integration Guide](/blog/agent-skills-integration/) - Install WAIaaS skill files for your agent
- [Deployment Guide](/docs/deployment/) - WAIaaS deployment and configuration options
- [The AI Agent Wallet Security Crisis](/blog/ai-agent-wallet-security-crisis/) - Why secure agent setup matters
