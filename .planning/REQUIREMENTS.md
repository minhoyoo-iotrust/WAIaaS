# Requirements: WAIaaS

**Defined:** 2026-02-10
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.2 Requirements

v1.2 인증 + 정책 엔진 마일스톤 요구사항. 각 항목은 로드맵 페이즈에 매핑된다.

### 인증 미들웨어 (AUTH)

- [ ] **AUTH-01**: sessionAuth 미들웨어가 Authorization 헤더의 wai_sess_ JWT를 검증하고 세션 ID/에이전트 ID를 컨텍스트에 설정한다
- [ ] **AUTH-02**: masterAuth explicit 미들웨어가 X-Master-Password 헤더를 Argon2id로 검증한다
- [ ] **AUTH-03**: ownerAuth 미들웨어가 SIWS/SIWE 서명 페이로드를 검증하고 agents.owner_address와 대조한다
- [ ] **AUTH-04**: authRouter가 엔드포인트별 인증 타입(implicit master/explicit master/session/owner)을 디스패치한다
- [ ] **AUTH-05**: 기존 6개 엔드포인트에 적절한 인증 미들웨어를 적용한다 (현재 무인증 → 인증 필수)

### 세션 관리 (SESS)

- [ ] **SESS-01**: POST /v1/sessions로 에이전트 세션을 생성하고 JWT를 발급한다 (masterAuth implicit)
- [ ] **SESS-02**: GET /v1/sessions로 에이전트별 활성 세션 목록을 조회한다
- [ ] **SESS-03**: DELETE /v1/sessions/:id로 세션을 즉시 폐기(revoke)한다
- [ ] **SESS-04**: PUT /v1/sessions/:id/renew로 세션을 낙관적 갱신한다 (sessionAuth, 토큰 회전)
- [ ] **SESS-05**: 세션 갱신에 5종 안전 장치를 적용한다 (maxRenewals 30, 절대수명 30일, 50% 시점, token_hash CAS)
- [ ] **SESS-06**: JWT Secret을 key_value_store에 저장하고 dual-key 5분 윈도우 로테이션을 지원한다

### 정책 엔진 (PLCY)

- [ ] **PLCY-01**: DatabasePolicyEngine이 policies 테이블에서 규칙을 로드하여 우선순위 순으로 평가한다
- [ ] **PLCY-02**: SPENDING_LIMIT 규칙이 금액에 따라 INSTANT/NOTIFY/DELAY/APPROVAL 4-tier로 분류한다
- [ ] **PLCY-03**: WHITELIST 규칙이 수신 주소를 허용/차단 목록으로 평가한다
- [ ] **PLCY-04**: 정책 CRUD API를 제공한다 (POST/GET/PUT/DELETE /v1/policies, masterAuth explicit)
- [ ] **PLCY-05**: TOCTOU 방지를 위해 BEGIN IMMEDIATE + reserved amount 패턴을 적용한다

### DELAY/APPROVAL 워크플로우 (FLOW)

- [ ] **FLOW-01**: DELAY 티어 거래가 쿨다운 시간 동안 대기 후 미취소 시 자동 실행된다
- [ ] **FLOW-02**: APPROVAL 티어 거래가 Owner 승인을 대기하고 pending_approvals에 기록된다
- [ ] **FLOW-03**: POST /v1/transactions/:id/approve로 Owner가 APPROVAL 거래를 서명 승인한다 (ownerAuth)
- [ ] **FLOW-04**: POST /v1/transactions/:id/reject로 Owner가 APPROVAL 거래를 거절한다 (ownerAuth)
- [ ] **FLOW-05**: APPROVAL 미승인 거래가 타임아웃(3단계 우선순위: 정책별 > config > 3600초) 후 자동 만료된다
- [ ] **FLOW-06**: POST /v1/transactions/:id/cancel로 DELAY 대기 중 거래를 취소한다

### Owner 상태 머신 (OWNR)

- [ ] **OWNR-01**: resolveOwnerState() 순수 함수가 agents 레코드에서 NONE/GRACE/LOCKED를 파생한다
- [ ] **OWNR-02**: PUT /v1/agents/:id/owner로 Owner를 사후 등록한다 (masterAuth, NONE→GRACE 전이)
- [ ] **OWNR-03**: GRACE 구간에서 Owner 변경/해제가 masterAuth만으로 가능하다
- [ ] **OWNR-04**: ownerAuth 검증 성공 시 markOwnerVerified()가 GRACE→LOCKED 자동 전이를 수행한다
- [ ] **OWNR-05**: LOCKED 구간에서 Owner 변경은 ownerAuth+masterAuth 필요, 해제는 불가하다
- [ ] **OWNR-06**: APPROVAL 티어가 Owner 없으면 DELAY로 자동 다운그레이드된다 (TX_DOWNGRADED_DELAY 이벤트)

### 파이프라인 확장 (PIPE)

- [ ] **PIPE-01**: Stage 2(Auth)가 세션 토큰을 검증하고 sessionId를 PipelineContext에 설정한다
- [ ] **PIPE-02**: Stage 3(Policy)가 DefaultPolicyEngine 대신 DatabasePolicyEngine을 사용한다
- [ ] **PIPE-03**: Stage 4(Wait)가 DELAY 타이머와 APPROVAL 대기를 구현한다
- [ ] **PIPE-04**: transactions 테이블에 sessionId를 기록하고 감사 로그에 actor 정보를 포함한다

### 테스트 (TEST)

- [ ] **TEST-01**: 인증 미들웨어 단위 테스트 (sessionAuth/masterAuth/ownerAuth 각 valid/invalid/expired)
- [ ] **TEST-02**: 정책 엔진 단위 테스트 (4-tier 분류, 우선순위, TOCTOU 방지)
- [ ] **TEST-03**: 세션 CRUD + 갱신 통합 테스트 (생성→사용→갱신→폐기 전 흐름)
- [ ] **TEST-04**: DELAY/APPROVAL 워크플로우 E2E 테스트 (대기→승인/거절/만료/취소)
- [ ] **TEST-05**: Owner 상태 전이 테스트 (NONE→GRACE→LOCKED, 다운그레이드)

## Future Requirements

### v1.3 SDK + MCP + 알림

- **SDK-01**: TypeScript SDK (SessionManager 포함)
- **SDK-02**: Python SDK
- **MCP-01**: MCP Server 6 도구 + 3 리소스
- **NOTIF-01**: 멀티 채널 알림 (console/webhook/telegram)
- **SMGR-01**: SessionManager 자동 갱신

### v1.4+ 토큰/컨트랙트/DeFi

- 나머지 PolicyType 8개 (TIME_RESTRICTION, RATE_LIMIT, ALLOWED_TOKENS 등)
- SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch
- IPriceOracle, USD 기준 정책, Action Provider

## Out of Scope

| Feature | Reason |
|---------|--------|
| Kill Switch 상태 관리 | v1.1 stub 유지, Kill Switch 전체 구현은 v1.6 (Desktop/Telegram) |
| 알림 서비스 (NotificationService) | v1.3에서 구현, v1.2에서는 이벤트 발행 인터페이스만 |
| WalletConnect v2 실시간 연결 | v1.6 Desktop 마일스톤, v1.2에서는 CLI 수동 서명 방식 ownerAuth |
| TIME_RESTRICTION, RATE_LIMIT 정책 | v1.4+, v1.2는 SPENDING_LIMIT + WHITELIST 2개 핵심 정책만 |
| SessionManager (SDK 측) | v1.3 SDK 마일스톤, v1.2는 서버 측 세션 API만 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| SESS-01 | — | Pending |
| SESS-02 | — | Pending |
| SESS-03 | — | Pending |
| SESS-04 | — | Pending |
| SESS-05 | — | Pending |
| SESS-06 | — | Pending |
| PLCY-01 | — | Pending |
| PLCY-02 | — | Pending |
| PLCY-03 | — | Pending |
| PLCY-04 | — | Pending |
| PLCY-05 | — | Pending |
| FLOW-01 | — | Pending |
| FLOW-02 | — | Pending |
| FLOW-03 | — | Pending |
| FLOW-04 | — | Pending |
| FLOW-05 | — | Pending |
| FLOW-06 | — | Pending |
| OWNR-01 | — | Pending |
| OWNR-02 | — | Pending |
| OWNR-03 | — | Pending |
| OWNR-04 | — | Pending |
| OWNR-05 | — | Pending |
| OWNR-06 | — | Pending |
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |

**Coverage:**
- v1.2 requirements: 35 total
- Mapped to phases: 0
- Unmapped: 35 ⚠️

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after initial definition*
