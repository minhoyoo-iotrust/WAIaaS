# Requirements: WAIaaS v0.5

**Defined:** 2026-02-07
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v0.5 Requirements

인증 모델 재설계 + 개발자 경험 개선. 기존 v0.2 설계 문서 11개를 수정하고 신규 스펙 문서를 추가한다.

### 인증 모델 (AUTH)

- [ ] **AUTH-01**: masterAuth/ownerAuth/sessionAuth 3-tier 인증 수단이 정의되고 책임이 분리됨
- [ ] **AUTH-02**: 12개 엔드포인트의 인증 맵이 재배치됨 — ownerAuth는 거래 승인 + Kill Switch 복구 2곳으로 한정
- [ ] **AUTH-03**: ownerAuth 미들웨어가 agents.owner_address와 대조하여 에이전트별 Owner를 검증함
- [ ] **AUTH-04**: Owner 주소 변경 정책이 서명 이력 유무에 따라 2-track으로 정의됨
- [ ] **AUTH-05**: 인증 모델 변경이 보안 수준을 다운그레이드하지 않음 — APPROVAL 티어 + KS 복구의 ownerAuth 유지

### Owner 주소 모델 (OWNR)

- [ ] **OWNR-01**: agents 테이블에 owner_address 컬럼이 추가되고 체인별 주소 형식이 검증됨
- [ ] **OWNR-02**: config.toml [owner] 섹션이 제거되고 Owner 개념이 에이전트별 DB로 이동함
- [ ] **OWNR-03**: owner_wallets 테이블이 wallet_connections (WC push 서명 전용)으로 전환됨
- [ ] **OWNR-04**: 멀티 에이전트 시나리오에서 에이전트별 owner_address로 Owner가 격리됨
- [ ] **OWNR-05**: WalletConnect가 선택적 편의 기능으로 전환됨 — 미연결에서도 CLI 승인 가능
- [ ] **OWNR-06**: Kill Switch 복구 시 등록 Owner 중 1명 서명 + masterAuth로 검증됨

### 세션 갱신 (SESS)

- [ ] **SESS-01**: PUT /v1/sessions/:id/renew 엔드포인트가 sessionAuth로 동작함
- [ ] **SESS-02**: 세션 갱신 안전 장치 5종이 정의됨 (maxRenewals 30, 총 수명 30일, 50% 시점, 거부 윈도우, 갱신 단위 고정)
- [ ] **SESS-03**: sessions 테이블에 renewal_count, max_renewals, last_renewed_at 컬럼이 추가됨
- [ ] **SESS-04**: SessionConstraints에 maxRenewals, renewalRejectWindow 필드가 확장됨
- [ ] **SESS-05**: Owner 거부 플로우와 SESSION_RENEWED / SESSION_RENEWAL_REJECTED 알림 이벤트 2종이 추가됨

### 개발자 경험 (DX)

- [ ] **DX-01**: waiaas init이 순수 인프라 초기화만 수행함 — Owner 관련 단계 제거
- [ ] **DX-02**: waiaas agent create --owner \<address\>로 에이전트 생성 시 Owner 주소가 등록됨 (서명 불필요)
- [ ] **DX-03**: waiaas session create가 masterAuth(마스터 패스워드)만으로 동작함
- [ ] **DX-04**: --quickstart 플래그로 init부터 세션 토큰 발급까지 단일 커맨드로 완료됨
- [ ] **DX-05**: --dev 모드에서 마스터 패스워드 프롬프트 없이 데몬이 시작됨
- [ ] **DX-06**: 에러 응답에 hint 필드가 포함되어 다음 행동을 안내함
- [ ] **DX-07**: MCP 데몬 내장 옵션이 검토되고 스펙이 정의됨
- [ ] **DX-08**: 원격 에이전트 접근 가이드가 작성됨 (SSH 터널, VPN, --expose)

## Future Requirements

다음 마일스톤으로 연기.

- 실제 코드 구현 (테스트 코드 작성, Mock 구현, CI 워크플로우 구성)
- SPL 토큰 지원 (Solana)
- EVM 어댑터 전체 구현
- Streamable HTTP MCP 전송

## Out of Scope

| Feature | Reason |
|---------|--------|
| masterAuth를 JWT로 전환 | 마스터 패스워드 + Argon2id가 로컬 데몬에 적합, 복잡도 증가 불필요 |
| Owner 주소 서명 검증을 등록 시점에 수행 | 핵심 인사이트: 주소는 공개 정보, 서명은 자금 행위에서만 |
| 멀티시그 Owner 모델 | v0.5 범위 초과, 단일 Owner 모델로 충분 |
| 세션 갱신 시 Owner 사전 승인 | 낙관적 갱신 패턴 채택 — 사후 거부가 에이전트 자율성에 더 적합 |
| 원격 접근 시 mTLS | SSH 터널/VPN 가이드로 충분, mTLS는 과도한 복잡도 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| AUTH-04 | TBD | Pending |
| AUTH-05 | TBD | Pending |
| OWNR-01 | TBD | Pending |
| OWNR-02 | TBD | Pending |
| OWNR-03 | TBD | Pending |
| OWNR-04 | TBD | Pending |
| OWNR-05 | TBD | Pending |
| OWNR-06 | TBD | Pending |
| SESS-01 | TBD | Pending |
| SESS-02 | TBD | Pending |
| SESS-03 | TBD | Pending |
| SESS-04 | TBD | Pending |
| SESS-05 | TBD | Pending |
| DX-01 | TBD | Pending |
| DX-02 | TBD | Pending |
| DX-03 | TBD | Pending |
| DX-04 | TBD | Pending |
| DX-05 | TBD | Pending |
| DX-06 | TBD | Pending |
| DX-07 | TBD | Pending |
| DX-08 | TBD | Pending |

**Coverage:**
- v0.5 requirements: 25 total
- Mapped to phases: 0
- Unmapped: 25 ⚠️

---
*Requirements defined: 2026-02-07*
*Last updated: 2026-02-07 after initial definition*
