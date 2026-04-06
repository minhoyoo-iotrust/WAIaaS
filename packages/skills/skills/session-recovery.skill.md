---
name: "WAIaaS Session Recovery"
description: "Recover from expired or permanently expired session tokens"
category: "api"
tags: [wallet, blockchain, session, recovery, token, expired, waiass]
version: "2.13.0"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Session Recovery

This skill guides you through recovering from an expired session token. Follow the appropriate path based on your error type.

> AI agents must NEVER request the master password. Use only your session token.

## Diagnosing the Problem

When you receive a `401` response with one of these error codes, your session needs attention:

| Error Code | Meaning | Recovery Path |
|-----------|---------|---------------|
| `TOKEN_EXPIRED` | Session TTL elapsed | Try renewal first |
| `RENEWAL_NOT_REQUIRED` | Unlimited session does not need renewal | No action needed |
| `RENEWAL_LIMIT_REACHED` | Max renewals exceeded | Request new session |
| `SESSION_REVOKED` | Session manually revoked by operator | Request new session |
| `SESSION_NOT_FOUND` | Session deleted or invalid | Request new session |

## Path A: Session Renewal (Self-Service)

If your session is expired but not permanently, try renewing it first:

```bash
curl -s -X PUT http://localhost:3100/v1/sessions/{sessionId}/renew \
  -H "Authorization: Bearer wai_sess_..." | jq .
```

**Success response:**
```json
{
  "token": "wai_sess_<new-token>",
  "expiresAt": 1740000000,
  "renewalCount": 1
}
```

Update your session token with the new value and continue operating.

**Safety checks that may block renewal:**
- Unlimited session (expiresAt=0): returns `RENEWAL_NOT_REQUIRED` (400)
- Less than 50% of TTL has elapsed (too early)
- Renewal count exceeds max (if maxRenewals > 0)
- Absolute session lifetime exceeded (if absoluteLifetime > 0)
- Token hash mismatch (concurrent renewal detected)

## Path B: Request New Session from Operator

When renewal is not possible (RENEWAL_LIMIT_REACHED, SESSION_REVOKED, SESSION_NOT_FOUND), you cannot self-recover. Follow these steps:

### Step 1: Inform the User

Tell the user clearly:

> My WAIaaS session token has permanently expired and cannot be renewed. I need a new session token to continue operating.

### Step 2: Guide the Operator

The operator (human user) should create a new session via one of these methods:

**Option A: CLI (recommended)**
```bash
waiaas session prompt
```
This generates a new session with an AI-ready connection prompt.

**Option B: Admin UI**
1. Open Admin UI (http://localhost:3100/admin)
2. Navigate to Sessions page
3. Click "Create Session" and select the wallets
4. Copy the generated token

**Option C: REST API** -- The operator creates a new session via the admin API (see docs/admin-manual/daemon-operations.md).

### Step 3: Apply the New Token

Once the operator provides the new token:

**For MCP agents:** The operator updates the token file at `DATA_DIR/mcp-token`. The MCP recovery loop polls this file every 60 seconds and will automatically pick up the new token.

**For REST API agents:** Update the `Authorization: Bearer wai_sess_...` header with the new token value.

### Step 4: Verify Recovery

After applying the new token, call connect-info to verify:

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer wai_sess_<new-token>" | jq .session
```

Expected: 200 OK with session info including new `expiresAt`.

## Path C: Auto-Provision Recovery

If the daemon was set up with `waiaas init --auto-provision`, the master password is stored in `recovery.key` in the data directory (default: `~/.waiaas/recovery.key`). This enables autonomous recovery without human intervention.

### Step 1: Read the Recovery Key

The agent or automation script can read the password from `recovery.key`:

```bash
MASTER_PW=$(cat ~/.waiaas/recovery.key)
```

### Step 2: Create a New Session

Use the recovery key to create a new session via the CLI:

```bash
waiaas quickset
```

### Step 3: Apply and Verify

Update your session token and verify with connect-info:

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer wai_sess_<new-token>"
```

**SECURITY NOTE:** The `recovery.key` file contains the master password in plaintext. The operator should harden the password with `waiaas set-master` and delete `recovery.key` as soon as practical. This path is intended for initial autonomous bootstrapping only.

## Prevention Tips

- **Use unlimited sessions (default)**: Sessions created without `ttl` never expire, eliminating the need for renewal entirely.
- **Check session expiry proactively**: For finite sessions, the `connect-info` response includes `session.expiresAt` (Unix timestamp, 0 = unlimited). Monitor this to renew before expiration.
- **Renew early**: For finite sessions, call `PUT /v1/sessions/{id}/renew` when 60% of TTL has elapsed (MCP agents do this automatically for finite sessions).
- **Per-session TTL**: Session lifetime is configured per-session at creation time via `ttl`, `maxRenewals`, and `absoluteLifetime` parameters. There are no global session lifetime settings.
