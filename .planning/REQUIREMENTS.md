# Requirements: WAIaaS v26.4

**Defined:** 2026-02-21
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v26.4 멀티 지갑 세션 + 에이전트 자기 발견. Each maps to roadmap phases.

### 세션 모델 (SESSION)

- [x] **SESS-01**: 세션 생성 시 여러 지갑을 한 번에 연결할 수 있다 (walletIds 복수 파라미터)
- [x] **SESS-02**: 기존 단일 지갑 세션(walletId 단수)이 하위 호환으로 동작한다
- [x] **SESS-03**: 세션에 지갑을 동적으로 추가할 수 있다 (POST /v1/sessions/:id/wallets)
- [x] **SESS-04**: 세션에서 지갑을 동적으로 제거할 수 있다 (DELETE /v1/sessions/:id/wallets/:walletId)
- [x] **SESS-05**: 세션의 기본 지갑을 변경할 수 있다 (PATCH /v1/sessions/:id/wallets/:walletId/default)
- [x] **SESS-06**: 세션에 연결된 지갑 목록을 조회할 수 있다 (GET /v1/sessions/:id/wallets)
- [x] **SESS-07**: DB v19 마이그레이션 — session_wallets junction 테이블 생성 + 기존 데이터 자동 이관
- [x] **SESS-08**: 기본 지갑 제거 시도 시 CANNOT_REMOVE_DEFAULT_WALLET 에러가 반환된다
- [x] **SESS-09**: 마지막 지갑 제거 시도 시 SESSION_REQUIRES_WALLET 에러가 반환된다
- [x] **SESS-10**: 지갑 삭제(TERMINATE) 시 해당 지갑이 기본 지갑이면 자동 승격, 마지막이면 세션 자동 revoke

### API 변경 (API)

- [x] **API-01**: walletId 미지정 시 기본 지갑이 자동 선택되어 기존 코드가 무변경으로 동작한다
- [x] **API-02**: GET 요청에서 ?walletId= 쿼리 파라미터로 특정 지갑을 지정할 수 있다
- [x] **API-03**: POST/PUT 요청에서 body walletId 필드로 특정 지갑을 지정할 수 있다
- [x] **API-04**: 세션에 연결되지 않은 지갑 접근 시 WALLET_ACCESS_DENIED 에러가 반환된다
- [x] **API-05**: 세션 목록/상세 응답에 wallets 배열이 포함된다 (하위 호환 walletId/walletName 유지)
- [x] **API-06**: 세션 갱신(renew) 시 현재 기본 지갑으로 JWT가 발급된다

### 자기 발견 (DISC)

- [ ] **DISC-01**: 에이전트가 세션 토큰으로 GET /v1/connect-info를 조회하여 접근 가능 지갑/정책/capabilities를 파악할 수 있다
- [ ] **DISC-02**: connect-info의 capabilities가 데몬 설정에 따라 동적으로 결정된다
- [ ] **DISC-03**: connect-info에 에이전트용 자연어 프롬프트가 포함된다
- [ ] **DISC-04**: POST /admin/agent-prompt가 단일 멀티 지갑 세션을 생성하고 connect-info 프롬프트 빌더를 공유한다

### 통합 (INTG)

- [ ] **INTG-01**: SDK에 createSession({ walletIds }) 파라미터와 getConnectInfo() 메서드가 추가된다
- [ ] **INTG-02**: MCP에 connect-info 도구가 추가된다
- [ ] **INTG-03**: MCP 기존 도구에 선택적 walletId 파라미터가 추가된다
- [ ] **INTG-04**: MCP가 단일 인스턴스로 동작한다 (WAIAAS_WALLET_ID 선택적, 단일 토큰 파일)
- [ ] **INTG-05**: Admin UI 세션 생성 폼에서 다중 지갑 선택과 기본 지갑 지정이 가능하다
- [ ] **INTG-06**: Admin UI 세션 상세에서 연결된 지갑 목록과 기본 지갑 배지가 표시된다
- [ ] **INTG-07**: CLI quickset이 단일 멀티 지갑 세션 + 단일 MCP config entry를 생성한다
- [ ] **INTG-08**: 스킬 파일(quickstart/wallet/admin)에 connect-info 사용법과 walletId 파라미터가 문서화된다
- [ ] **INTG-09**: 가이드 문서에서 마스터 패스워드 의존이 제거되고 세션 토큰 단독 설정으로 변경된다
- [ ] **INTG-10**: SESSION_WALLET_ADDED/SESSION_WALLET_REMOVED 알림 이벤트가 발송된다

## v2 Requirements

### 세션 확장

- **SESS-EXT-01**: 세션별 지갑 권한(read-only/full) 분리
- **SESS-EXT-02**: 세션 그룹 (다수 세션을 묶어 관리)

### 자기 발견 확장

- **DISC-EXT-01**: connect-info에 사용 가능 Action Provider 목록 포함
- **DISC-EXT-02**: connect-info에 지갑별 잔액 실시간 포함

## Out of Scope

| Feature | Reason |
|---------|--------|
| 세션별 지갑 권한 분리 (read-only/full) | 복잡도 높음, 정책 엔진으로 충분히 제어 가능 |
| JWT에 지갑 배열 포함 | 지갑 추가/제거 시 토큰 재발급 필요, DB 기반이 유연 |
| 세션 간 지갑 이동 (transfer) | 삭제+추가로 대체 가능, 추가 복잡도 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 210 | Complete |
| SESS-02 | Phase 210 | Complete |
| SESS-03 | Phase 210 | Complete |
| SESS-04 | Phase 210 | Complete |
| SESS-05 | Phase 210 | Complete |
| SESS-06 | Phase 210 | Complete |
| SESS-07 | Phase 210 | Complete |
| SESS-08 | Phase 210 | Complete |
| SESS-09 | Phase 210 | Complete |
| SESS-10 | Phase 210 | Complete |
| API-01 | Phase 211 | Complete |
| API-02 | Phase 211 | Complete |
| API-03 | Phase 211 | Complete |
| API-04 | Phase 211 | Complete |
| API-05 | Phase 211 | Complete |
| API-06 | Phase 211 | Complete |
| DISC-01 | Phase 212 | Pending |
| DISC-02 | Phase 212 | Pending |
| DISC-03 | Phase 212 | Pending |
| DISC-04 | Phase 212 | Pending |
| INTG-01 | Phase 213 | Pending |
| INTG-02 | Phase 213 | Pending |
| INTG-03 | Phase 213 | Pending |
| INTG-04 | Phase 213 | Pending |
| INTG-05 | Phase 213 | Pending |
| INTG-06 | Phase 213 | Pending |
| INTG-07 | Phase 213 | Pending |
| INTG-08 | Phase 213 | Pending |
| INTG-09 | Phase 213 | Pending |
| INTG-10 | Phase 213 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after roadmap creation*
