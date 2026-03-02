# Requirements: WAIaaS v29.9

**Defined:** 2026-03-02
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v29.9 Requirements

Requirements for 세션 점진적 보안 모델. Each maps to roadmap phases.

### Session API

- [ ] **SESS-01**: User can create session without TTL/maxRenewals/absoluteLifetime (all default to unlimited)
- [ ] **SESS-02**: User can specify per-session TTL (seconds), maxRenewals (count), absoluteLifetime (seconds)
- [ ] **SESS-03**: Unlimited session (expiresAt=0) authenticates successfully on all API endpoints
- [ ] **SESS-04**: Session list API returns status=ACTIVE for unlimited sessions (not EXPIRED)
- [ ] **SESS-05**: Drizzle schema default for maxRenewals changes from 12 to 0 (app-level only)

### JWT

- [ ] **JWT-01**: Unlimited session JWT has no exp claim (jose signToken skips setExpirationTime)
- [ ] **JWT-02**: Finite TTL session JWT has correct exp claim (exp = iat + ttl)
- [ ] **JWT-03**: JwtPayload.exp type changes to optional (number | undefined)

### Renewal

- [ ] **RENW-01**: Unlimited session renewal returns RENEWAL_NOT_REQUIRED error (400)
- [ ] **RENW-02**: Finite session with maxRenewals=0 allows unlimited renewals
- [ ] **RENW-03**: Finite session with absoluteLifetime=0 skips absolute lifetime check
- [ ] **RENW-04**: Existing finite session renewal logic (5-step validation) remains unchanged

### Config

- [ ] **CONF-01**: Admin Settings keys session_ttl, session_absolute_lifetime, session_max_renewals are removed
- [ ] **CONF-02**: DaemonConfig security schema removes 3 session fields

### MCP

- [ ] **MCP-01**: MCP SessionManager accepts JWT without exp claim (expiresAt=0, state=active)
- [ ] **MCP-02**: MCP SessionManager skips renewal scheduling and recovery for unlimited sessions

### CLI

- [ ] **CLI-01**: `waiaas mcp setup` creates unlimited session by default (no TTL sent)
- [ ] **CLI-02**: `--ttl N` flag sends ttl=N*86400 seconds to API (day-to-second conversion)
- [ ] **CLI-03**: `--max-renewals` and `--lifetime` flags added for per-session control

### Admin UI

- [ ] **ADUI-01**: Sessions Settings tab removes 3 session lifetime keys
- [ ] **ADUI-02**: Create Session modal has collapsible Advanced section with TTL/Renewals/Lifetime fields (days)
- [ ] **ADUI-03**: Session list displays "—" for unlimited values (expiresAt=0, maxRenewals=0)

### SDK

- [ ] **SDK-01**: CreateSessionParams.expiresIn renamed to ttl, maxRenewals and absoluteLifetime added
- [ ] **SDK-02**: createSession() sends ttl (not expiresIn) to API with conditional field inclusion

### Skill Files

- [ ] **SKIL-01**: wallet.skill.md, quickstart.skill.md, admin.skill.md, session-recovery.skill.md updated for new session parameters

## v2 Requirements

None — all session progressive security features are in v1 scope.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Session scoped permissions | 별도 설계 필요, 이번 마일스톤은 수명 모델만 변경 |
| DB-level expiry check migration | JWT exp 기반 현재 구조 유지, 방어적 체크만 선택적 추가 |
| MCP session creation tool | MCP는 transport 계층에서 세션 관리, 별도 도구 불필요 |
| Python SDK 변경 | Python SDK는 TS SDK 래퍼가 아닌 별도 구현, 후속 동기화 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 300 | Pending |
| SESS-02 | Phase 300 | Pending |
| SESS-03 | Phase 300 | Pending |
| SESS-04 | Phase 300 | Pending |
| SESS-05 | Phase 300 | Pending |
| JWT-01 | Phase 300 | Pending |
| JWT-02 | Phase 300 | Pending |
| JWT-03 | Phase 300 | Pending |
| RENW-01 | Phase 300 | Pending |
| RENW-02 | Phase 300 | Pending |
| RENW-03 | Phase 300 | Pending |
| RENW-04 | Phase 300 | Pending |
| CONF-01 | Phase 300 | Pending |
| CONF-02 | Phase 300 | Pending |
| MCP-01 | Phase 301 | Pending |
| MCP-02 | Phase 301 | Pending |
| CLI-01 | Phase 301 | Pending |
| CLI-02 | Phase 301 | Pending |
| CLI-03 | Phase 301 | Pending |
| ADUI-01 | Phase 301 | Pending |
| ADUI-02 | Phase 301 | Pending |
| ADUI-03 | Phase 301 | Pending |
| SDK-01 | Phase 301 | Pending |
| SDK-02 | Phase 301 | Pending |
| SKIL-01 | Phase 301 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after roadmap creation (traceability updated)*
