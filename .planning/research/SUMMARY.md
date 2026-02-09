# Project Research Summary

**Project:** WAIaaS v0.9 - MCP Session Management Automation
**Domain:** MCP Server token lifecycle automation for AI agent wallet daemon
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

WAIaaS v0.9 adds automatic session management to the MCP Server, solving the core problem that MCP stdio processes inherit environment variables only at startup, making token rotation impossible without process restart. The research confirms that no new dependencies are needed — all functionality uses existing libraries (jose, grammy, commander.js, Node.js built-ins) and the @modelcontextprotocol/sdk already in the stack.

The recommended architecture embeds a SessionManager in the MCP Server that handles token lifecycle transparently: loads tokens from `~/.waiaas/mcp-token` (file > env var priority), auto-renews at 60% TTL via existing PUT /v1/sessions/:id/renew API, and reloads from file on 401 (lazy reload pattern). This enables Telegram `/newsession` and CLI `mcp setup`/`mcp refresh-token` to update tokens without requiring Claude Desktop restart, maintaining conversation context and agent service continuity.

Critical risks center on timer accuracy (setTimeout 32-bit overflow), file write races (3 concurrent writers: MCP/Telegram/CLI), and MCP host behavior on repeated errors. Prevention requires safeSetTimeout wrappers, atomic write-then-rename patterns, and non-error responses for expired sessions. The architecture review confirms this is a natural extension of existing v0.5-v0.8 session renewal protocol, requiring changes to 7 design documents but no database schema modifications.

## Key Findings

### Recommended Stack

**Zero new dependencies.** All v0.9 features use existing libraries' previously unused APIs. This eliminates compatibility risk, version conflicts, and bundle size increase.

**Core technologies activated:**
- **jose (`decodeJwt`)** — JWT payload extraction without signature verification (MCP server has no signing key) — already in stack for server-side JWT operations
- **grammy (`InlineKeyboard`, `callbackQuery`)** — Telegram inline keyboard for agent selection in `/newsession` — already in stack for notifications
- **commander.js** — CLI `mcp` subcommand group for `setup`/`refresh-token` — already in stack for existing commands
- **Node.js fs/promises (`writeFile mode: 0o600`, `lstat`)** — Token file management with owner-only permissions, symlink rejection — built-in API
- **Node.js timers (`setTimeout`, `unref()`)** — Renewal scheduling with process-exit-friendly timers — built-in API

**Critical validation:** setTimeout supports delays up to 2,147,483,647ms (~24.85 days). Default 7-day expiresIn * 60% = 4.2 days is safe. Even max 30-day expiresIn * 60% = 18 days stays within limit. Defense: `Math.min(delay, MAX_TIMEOUT)` wrapper.

### Expected Features

**Table stakes (7 features — must implement all):**
- **TS-1: File-based token persistence** — `~/.waiaas/mcp-token` (0o600) as single source of truth across process restarts
- **TS-2: Token load priority (File > Env)** — File overrides env var after first bootstrap
- **TS-3: Auto-renewal at 60% TTL** — SessionManager calls PUT /renew, saves new token to memory + file
- **TS-4: Expiration alerts** — SESSION_EXPIRING_SOON notification when remainingRenewals ≤ 3 or absoluteExpiresAt - now ≤ 24h
- **TS-5: 401 lazy reload** — On AUTH_TOKEN_EXPIRED, reload `~/.waiaas/mcp-token` and retry (external token transition)
- **TS-6: CLI `mcp setup`** — One-command session creation + file save + Claude Desktop config guide
- **TS-7: CLI `mcp refresh-token`** — Revoke old session + create new + update file (absolute lifetime expiry)

**Differentiators (5 features — competitive advantage):**
- **DF-1: Telegram `/newsession`** — One-click session recreation from mobile, no SSH required
- **DF-2: Transparent session management** — LLM never sees token lifecycle, `sessionManager.getToken()` always returns valid token
- **DF-3: Agent-specific default constraints** — `/newsession` auto-applies role-based presets from agents.default_constraints or config
- **DF-4: SESSION_EXPIRING_SOON proactive alerts** — Owner receives advance warning with [Create New Session] button
- **DF-5: Race condition guard** — Renewal-in-progress flag prevents concurrent renewal attempts

**Anti-features (7 explicitly excluded):**
- fs.watch (OS-specific instability, lazy reload is safer)
- Auto-edit claude_desktop_config.json (risky, host app format varies)
- Multi-MCP-client support (single token file limitation)
- OAuth 2.1 for stdio transport (MCP spec says SHOULD NOT)
- Streamable HTTP transport (Claude Desktop uses stdio only)
- Infinite session extension (30-day absolute lifetime is security boundary)
- Metadata in token file (JWT already contains all needed claims)

### Architecture Approach

v0.9 extends existing MCP Server (`@waiaas/mcp`) with SessionManager class that encapsulates all token lifecycle logic. MCP tool handlers shift from `SESSION_TOKEN` env var to `apiClient.getWithRetry()`, centralizing token injection and 401 retry. The 4-component file ownership model (MCP read/write, Daemon no access, Telegram write, CLI write) uses atomic write-then-rename to prevent partial writes, with last-writer-wins conflict resolution.

**Major components:**
1. **SessionManager** (`@waiaas/mcp/session-manager.ts`) — Loads token (file > env), schedules renewal at 60% TTL via setTimeout, persists new token atomically, reloads on 401
2. **ApiClient refactor** (`@waiaas/mcp/api-client.ts`) — Wraps fetch with SessionManager.getToken() injection, auto-retries 401 after tryReloadFromFile()
3. **token-file utilities** (`@waiaas/core/utils/token-file.ts`) — Shared by MCP/Telegram/CLI for getMcpTokenPath(), atomicWriteToken(), readMcpToken() with symlink rejection
4. **Telegram `/newsession` handler** — InlineKeyboard agent list → create session → atomicWriteToken → MCP lazy reload on next 401
5. **CLI `mcp` subcommands** — `setup` (bootstrap) and `refresh-token` (30-day renewal) both write token file, SessionManager picks up on next API call
6. **Daemon SESSION_EXPIRING_SOON** — NotificationService adds 17th event type, triggered by SessionService when renewal response shows remainingRenewals ≤ 3

**Integration with v0.5-v0.8:** Zero changes to session renewal API (PUT /v1/sessions/:id/renew). The 5 safety guards (maxRenewals, absolute lifetime, 50% guard, denial window, fixed renewal units) remain unchanged. SessionManager is a client of the existing protocol. Daemon side adds only the expiration alert trigger in renewal response handler.

### Critical Pitfalls

1. **setTimeout 32-bit overflow (C-01)** — Delays > 2,147,483,647ms (24.85 days) wrap to 1ms, causing immediate renewal attempts that hit RENEWAL_TOO_EARLY. **Mitigation:** `Math.min(delay, MAX_TIMEOUT)` wrapper with chained setTimeout for long delays. Rare in practice (7-day default is safe) but config.toml allows custom expiresIn.

2. **Token file write race (C-02)** — MCP auto-renewal + Telegram /newsession + CLI refresh-token can write simultaneously, causing partial writes or file corruption. **Mitigation:** Atomic write-then-rename pattern (tmp file + fs.renameSync) shared via `@waiaas/core/utils/token-file.ts`. POSIX rename is atomic. Windows retry-on-EPERM with 10-50ms backoff.

3. **JWT payload decoding without verification (C-03)** — SessionManager extracts exp/sid from JWT without signature check (no signing key in MCP). Attacker replacing mcp-token with exp=distant_future causes renewal skip. **Mitigation:** On load, call GET /v1/sessions/:sid with token to verify server-side validity. Base64url parsing with exp sanity check (past 10y to future 1y range).

4. **Renewal inflight during process kill (H-02)** — SIGTERM during "API returned 200 but before file write" leaves token_hash updated in DB but old token in file. Next restart loads stale token → 401. **Mitigation:** Write file before updating memory. Graceful shutdown awaits inflight renewal (5s max). Start-time token validity check with daemon.

5. **Timer drift over 30 renewals (H-01)** — setTimeout delays are minimums, not guarantees. Event loop busy/GC pause causes minutes of drift over 30 renewals → absolute lifetime approached later than expected → RENEWAL_LIMIT_REACHED surprise. **Mitigation:** Recalculate next renewal from server response expiresAt, not client-side iat + delay. Resets drift to zero each cycle.

6. **Claude Desktop disconnects on repeated errors (H-04)** — Session expiry → all tools return 401 → Claude Desktop marks server as disconnected → /newsession afterwards has no effect because MCP already disconnected. **Mitigation:** Return non-error status messages ("session_expired, please retry in 2 minutes") instead of isError=true, preventing disconnect cascade.

7. **0o600 ignored on Windows (H-03)** — fs.chmod on Windows only sets read-only vs read-write, group/other distinction not enforced. mcp-token accessible to other users in multi-user Windows. **Mitigation:** Use %LOCALAPPDATA%\waiaas on Windows (user profile isolation), document limitation in 24-monorepo.md. macOS/Linux use 0o600 as designed.

8. **Lazy reload transition delay (M-02)** — 401 lazy reload means first API call after Telegram /newsession fails with old token, 50ms delay to reload file, then retry. User-facing: transparent. LLM-facing: one transient failure if newToken not yet persisted → "session expired" message → LLM stops trying wallet tools. **Mitigation:** Err on side of "retryable, please wait" messages, not hard errors.

9. **Renewal-in-flight tool call uses old token (H-05)** — During PUT /renew network RTT, tool call starts with old token. By time it reaches daemon, token_hash already swapped → 401. **Mitigation:** Auto-retry 401 after 50ms (enough for renewal completion), or extend 53-session-renewal-protocol.md with previous_token_hash grace period (like v0.7 JWT dual-key 5min rotation).

10. **Telegram callback_query 15s timeout (M-01)** — Owner clicks inline keyboard button, but sessionService.create() + file write takes >15s? Unlikely (300ms Argon2id + 100ms writes = <1s typical). Real risk: stale keyboard (hours old) clicked → "query too old". **Mitigation:** Immediately answerCallbackQuery("Creating session...") then send completion message separately. Timestamp in callback_data, reject if >5min old.

11. **Environment variable stale token bootstrap loop (M-03)** — config.json has 30-day-old TOKEN from initial setup. mcp-token file deleted by user. MCP restarts → loads expired env token → error state → never checks file again (lazy reload only triggers on 401 during API call). **Mitigation:** Error-recovery loop that checks file every 60s even when in expired state.

12. **Timer leak on ungraceful exit (M-05)** — SessionManager setTimeout not cleared → Node.js process hangs on shutdown. Windows orphan process continues renewing. **Mitigation:** timer.unref() to not block exit + process.on('SIGTERM/SIGINT', () => sessionManager.dispose()) to clean timers.

## Implications for Roadmap

Based on the research, v0.9 is a **pure design milestone** (no code implementation). The natural phase structure follows the dependency graph: shared utilities → SessionManager core → daemon/CLI/Telegram integration → document updates.

### Phase 36: Token File Infrastructure (Layer 0)

**Rationale:** All 3 integrations (SessionManager, Telegram, CLI) need shared file utilities. Building this foundation first eliminates code duplication and ensures consistent symlink/permission handling.

**Delivers:**
- `@waiaas/core/utils/token-file.ts` with getMcpTokenPath(), atomicWriteToken(), readMcpToken()
- Atomic write-then-rename pattern with Windows EPERM retry
- Symlink rejection (lstatSync check)
- SESSION_EXPIRING_SOON event type added to NotificationEventType enum (16→17)

**Addresses:**
- TS-1 (file persistence spec)
- C-02 (write race mitigation)
- H-03 (Windows permission handling)

**Avoids:**
- C-02 (partial writes) via atomic rename
- C-03 (symlink attacks) via lstat check

**Design outputs:**
- 24-monorepo.md update: `~/.waiaas/mcp-token` file spec (format, permissions, symlink rules)
- 25-sqlite-schema.md review: agents.default_constraints column (add or defer)

### Phase 37: SessionManager Core (Layer 1A — Milestone Heart)

**Rationale:** This is the differentiator. Once SessionManager works, everything else is integration glue. Focus on timer safety (C-01), token validation (C-03), drift correction (H-01), graceful shutdown (H-02).

**Delivers:**
- SessionManager class with loadToken(), start(), renew(), tryReloadFromFile(), dispose()
- safeSetTimeout wrapper with MAX_TIMEOUT check and chaining
- Start-time token validity check via GET /v1/sessions/:sid
- Timer drift correction: recalculate delay from server response expiresAt
- Graceful shutdown: await inflight renewal on SIGTERM/SIGINT
- ApiClient refactor: SessionManager injection, 401 auto-retry with 50ms delay

**Addresses:**
- TS-2 (load priority), TS-3 (auto-renewal), TS-5 (401 lazy reload)
- DF-2 (transparent management), DF-5 (race condition guard)

**Avoids:**
- C-01 (setTimeout overflow) via safeSetTimeout
- C-03 (unvalidated JWT) via start-time check
- H-01 (timer drift) via server-response recalc
- H-02 (inflight write loss) via file-first, graceful-shutdown
- H-04 (Claude disconnect) via non-error status messages
- H-05 (renewal race) via 401 auto-retry
- M-03 (expired env token loop) via error recovery polling
- M-05 (timer leak) via unref() + dispose()

**Design outputs:**
- New design doc: `SESS-AUTO-01-session-manager.md` (SessionManager class spec, lifecycle, error handling, 12 pitfall mitigations)
- 38-sdk-mcp-interface.md update: SessionManager integration, tool handler token reference changes, ApiClient refactor

### Phase 38: Daemon-Side Integration (Layer 1B)

**Rationale:** SessionManager is a client of existing renewal API. Daemon only adds expiration alert trigger and /newsession handler. Parallel to Phase 37 after Phase 36 completes.

**Delivers:**
- SessionService: SESSION_EXPIRING_SOON trigger in renewal response handler (remainingRenewals ≤ 3 or absoluteExpiresAt - now ≤ 24h)
- TelegramBotService: `/newsession` command (9th command, Tier 1)
  - InlineKeyboard agent list
  - callback_query handler with immediate answerCallbackQuery
  - sessionService.create() with default_constraints resolution
  - atomicWriteToken() call
- agents.default_constraints column decision (add, defer, or config-only)

**Addresses:**
- TS-4 (expiration alerts), DF-1 (Telegram one-click), DF-3 (default constraints), DF-4 (proactive notification)

**Avoids:**
- M-01 (callback timeout) via immediate answerCallbackQuery + separate completion message
- M-01 (stale keyboard) via timestamp in callback_data, 5-min expiry

**Design outputs:**
- New design doc: `SESS-AUTO-02-telegram-newsession.md` (command spec, inline keyboard flow, callback handling, timestamp validation)
- 35-notification-architecture.md update: SESSION_EXPIRING_SOON event (severity: warning, channels: Telegram/Discord/ntfy)
- 40-telegram-bot-docker.md update: /newsession command (8→9), Tier 1 auth, agent selection UX
- 53-session-renewal-protocol.md update: Expiration alert trigger condition in Section 6 (renewal response handling)

### Phase 39: CLI MCP Commands (Layer 1C)

**Rationale:** Parallel to Phase 38 after Phase 36. CLI provides initial bootstrap (mcp setup) and 30-day manual refresh. Critical for first-time setup UX.

**Delivers:**
- CLI `mcp` subcommand group
- `waiaas mcp setup --agent-id <id> [--expires-in] [--constraints]`
  - Daemon health check (GET /health) → error if not running
  - masterAuth implicit session creation
  - atomicWriteToken() call
  - Claude Desktop config.json setup instructions output
- `waiaas mcp refresh-token --agent-id <id>`
  - Optional: revoke old session (if expired, skip)
  - Create new session with same constraints
  - atomicWriteToken() call

**Addresses:**
- TS-6 (mcp setup), TS-7 (mcp refresh-token)

**Avoids:**
- C-02 (CLI write race) via shared atomicWriteToken
- H-03 (Windows permissions) via platform-specific handling in token-file utils

**Design outputs:**
- New design doc: `SESS-AUTO-03-cli-mcp-commands.md` (command spec, daemon check, config guide output format, error handling for daemon-not-running)
- 54-cli-flow-redesign.md update: `mcp` subcommand group, setup/refresh-token commands

### Phase 40: Design Document Integration (Layer 3)

**Rationale:** After all components designed, update 7 existing docs to reflect v0.9 changes. This phase is documentation-only, ensuring no design inconsistencies remain.

**Delivers:**
- 38-sdk-mcp-interface.md: SessionManager integration, tool handler changes (8 files: send-token, get-balance, etc.), ApiClient refactor
- 35-notification-architecture.md: SESSION_EXPIRING_SOON event (17th event)
- 40-telegram-bot-docker.md: /newsession (9th command)
- 54-cli-flow-redesign.md: mcp subcommands
- 53-session-renewal-protocol.md: Expiration alert, optional previous_token_hash grace period
- 24-monorepo-data-directory.md: mcp-token file spec
- 25-sqlite-schema.md: agents.default_constraints review

**Rationale:** Unified review ensures cross-references are correct (e.g., 38→53→35 linkage). Prevents drift between design docs.

**Design outputs:**
- 7 updated design documents with v0.9 sections clearly marked
- Master checklist: v0.9 design completeness verification

### Phase Ordering Rationale

**Sequential dependency:**
- Phase 36 (shared utils) must precede all others (37, 38, 39 depend on token-file utils)
- Phase 37, 38, 39 can proceed in parallel after Phase 36
- Phase 40 (doc integration) must wait for Phase 37+38+39 to finalize

**Why this grouping:**
- Layer 0 (Phase 36): Zero external dependencies, purely foundational
- Layer 1 (Phase 37/38/39): Each Layer 1 phase is self-contained within its package boundary (mcp/daemon/cli)
- Layer 3 (Phase 40): Integration review crosses all boundaries

**How this avoids pitfalls:**
- Phase 36 enforces atomic write pattern before any component implements file I/O → eliminates C-02 retroactive fixes
- Phase 37 front-loads timer/validation complexity → remaining phases are straightforward integrations
- Phase 40 prevents doc drift that would confuse v1.3 implementation milestone

### Research Flags

**Phases needing deeper research during planning:**
- None. v0.9 is unique in that all 4 research files scored HIGH confidence. Stack research confirmed zero new deps. Features research drew directly from v0.5-v0.8 design precedents. Architecture research analyzed existing 7 docs. Pitfalls research cross-referenced Node.js official docs + Claude Desktop issues + Telegram Bot API + WAIaaS own renewal protocol.

**Phases with standard patterns (skip research-phase):**
- **All phases (36-40)** — This is a design milestone, not implementation. The research *is* the milestone. Implementation milestone (v1.3) will reference these 4 research files + 3 new design docs + 7 updated docs.

**Exception:** If Phase 38 chooses to add agents.default_constraints column, that's a minor schema change requiring a focused sub-task, but not a full research-phase (it's a nullable TEXT column with JSON constraints, established pattern from v0.6 policy design).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new deps confirmed via npm registry checks. All APIs (jose.decodeJwt, grammy InlineKeyboard, Node.js fs/timers) verified in official docs. setTimeout 32-bit limit confirmed in Node.js source + MDN. |
| Features | HIGH | Table stakes derived from MCP stdio constraints (env var immutability) + v0.5 session renewal protocol. Differentiators benchmarked against Claude Desktop/Cursor/Cline (all lack stdio auto-renewal). Anti-features explicitly justified (fs.watch instability, OAuth SHOULD NOT in MCP spec). |
| Architecture | HIGH | SessionManager pattern mirrors v0.5 SDK's renewSession() but adapted for MCP stdio. 4-component file ownership analyzed with Self-Hosted single-machine race conditions exhaustively covered (C-02). Integration points map 1:1 to existing v0.5-v0.8 components (TelegramBotService, CLI commands, NotificationService). |
| Pitfalls | HIGH | 12 pitfalls sourced from: Node.js official docs (C-01, H-01, H-03, M-05), npm package issues (C-02 write-file-atomic#28), Telegram Bot API spec (M-01), Claude Desktop issue tracker (H-02, H-04), WAIaaS own v0.5/v0.7 designs (H-05 token rotation, M-03 env var fallback). Critical pitfalls (C-01/02/03) have concrete mitigations designed. |

**Overall confidence:** HIGH

No research area scored below HIGH. This is the result of v0.9 being an *internal* milestone (extending existing WAIaaS architecture, not integrating external services) and MCP being a well-specified protocol with active community issue tracking.

### Gaps to Address

**Minor gaps (resolved during design phase):**

1. **agents.default_constraints column:** TS-1/FEATURES.md identified 3 options (DB column, config.toml global, hardcoded). Research leans toward "config + hardcoded" to avoid DB schema change in design milestone, but Phase 38 should finalize this with a 15-minute decision matrix.

2. **previous_token_hash grace period:** H-05 (renewal inflight 401) has two mitigations: 401 auto-retry (simple) vs daemon-side grace period (like v0.7 dual-key). Research recommends starting with auto-retry in SESS-AUTO-01, noting grace period as Phase 38 optional enhancement if testing reveals persistent race conditions.

3. **Windows %LOCALAPPDATA% path:** H-03 identified Windows 0o600 limitation. token-file utils should detect platform and use `%LOCALAPPDATA%\waiaas\mcp-token` on Windows. This is a 10-line change but must be specified in Phase 36.

4. **SESSION_EXPIRING_SOON notification template:** Phase 38 adds 17th event type but notification template (Telegram message format) is not in research. Phase 38 design doc should include: "⚠️ Session Expiring Soon\nAgent: {name}\nExpires: {timestamp}\nRemaining Renewals: {count}\n[Create New Session] button".

5. **MCP notification for token transition:** M-06 notes MCP stdio can't push unsolicited messages, but MCP spec supports server→client notifications. Research says "Claude Desktop handling unclear, defer to future." Phase 40 doc update should note this as "v1.4+ consideration" in 38-sdk-mcp-interface.md.

**No blocking gaps.** All gaps have defined resolution paths within the 4 phases. No additional research-phase invocations needed.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [Node.js v25 Timers](https://nodejs.org/api/timers.html) — setTimeout 32-bit limit (2^31-1 = 2,147,483,647ms), unref() behavior, delay minimums
- [Node.js v25 File System](https://nodejs.org/api/fs.html) — writeFile mode option, lstat vs stat, Windows ACL limitations
- [jose v6.x decodeJwt](https://github.com/panva/jose/blob/v6.x/docs/util/decode_jwt/functions/decodeJwt.md) — Signature-free JWT payload extraction
- [grammy Inline Keyboard](https://grammy.dev/plugins/keyboard) — InlineKeyboard.text(), bot.callbackQuery() regex matching
- [Telegram Bot API: answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery) — 15-second timeout, show_alert parameter
- [MCP Authorization Spec (Draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) — stdio SHOULD NOT use OAuth 2.1
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.26.0 latest stable, Transport lifecycle hooks

**NPM Packages:**
- [write-file-atomic#28](https://github.com/npm/write-file-atomic/issues/28) — Windows EPERM race condition
- [nodejs/node#22860](https://github.com/nodejs/node/issues/22860) — setTimeout >MAX_INT32 wraps to 1ms

**Claude Desktop Issues:**
- [claude-code#1254](https://github.com/anthropics/claude-code/issues/1254), [#23216](https://github.com/anthropics/claude-code/issues/23216) — env var not passed to MCP server
- [claude-code#15211](https://github.com/anthropics/claude-code/issues/15211) — Windows MCP process orphan
- [claude-code#15945](https://github.com/anthropics/claude-code/issues/15945) — MCP server 16h hang

### Secondary (MEDIUM confidence)

**Security Research:**
- [Auth0: Critical JWT Vulnerabilities](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/) — alg:none attacks, signature bypass
- [OWASP JWT Testing Guide](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/10-Testing_JSON_Web_Tokens) — Token validation checklist
- [cross-platform-node-guide: permissions](https://github.com/ehmicky/cross-platform-node-guide/blob/main/docs/5_security/permissions.md) — Windows file permission limitations

**Competitor Analysis:**
- [Cursor MCP Docs](https://cursor.com/docs/context/mcp) — env var + OAuth UI for remote only
- [Continue.dev MCP Setup](https://docs.continue.dev/customize/deep-dives/mcp) — secrets reference, no auto-renewal
- [Cline MCP Configuration](https://docs.cline.bot/mcp/configuring-mcp-servers) — mcp_settings.json, stdio only
- [Apify MCP CLI](https://github.com/apify/mcp-cli) — OS keychain + sessions.json, OAuth profiles

**Community Discussions:**
- [Stack Overflow: MCP Authentication](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol/) — Ecosystem PAT prevalence (53%)
- [MCP Credential Weakness - ReversingLabs](https://www.reversinglabs.com/blog/mcp-server-credential-weakness) — 79% env var storage
- [MCP Spec Update - Aaron Parecki](https://aaronparecki.com/2025/11/25/1/mcp-authorization-spec-update) — CIMD, enterprise auth

### Project-Internal (HIGH confidence)

**WAIaaS Design Documents:**
- objectives/v0.9-session-management-automation.md — SessionManager objectives, lazy reload confirmation, security scenarios S-01 to S-04
- 38-sdk-mcp-interface.md — MCP Server 6 tools + 3 resources, existing token passing
- 53-session-renewal-protocol.md — 5 safety guards, token rotation (token_hash swap), 60%/50% timing
- 35-notification-architecture.md — 16 event types (v0.8), INotificationChannel interface
- 40-telegram-bot-docker.md — 8 existing commands, 2-Tier auth (Tier 1: chatId)
- 54-cli-flow-redesign.md — CLI command structure, subcommand pattern
- 24-monorepo-data-directory.md — ~/.waiaas data directory spec
- 25-sqlite-schema.md — agents table schema, sessions table constraints

**Previous Milestones:**
- v0.5 outcomes — Session renewal protocol, 50% safety guard, maxRenewals=30, absolute lifetime
- v0.7 outcomes — JWT dual-key rotation (5min grace period for key transitions), flock locking patterns
- v0.8 outcomes — Owner 3-state model (NONE/GRACE/LOCKED), downgrade notifications

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
