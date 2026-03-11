# Requirements: WAIaaS v31.11 External Action 프레임워크 설계

**Defined:** 2026-03-11
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v31.11. Each maps to roadmap phases.

### Type System

- [x] **TYPE-01**: ResolvedAction union 타입을 ContractCallRequest | SignedDataAction | SignedHttpAction으로 설계
- [x] **TYPE-02**: SignedDataAction 스키마 설계 (kind: 'signedData', signingScheme, payload, venue, operation, credentialRef?, tracking?, policyContext?)
- [x] **TYPE-03**: SignedHttpAction 스키마 설계 (kind: 'signedHttp', 기존 SignHttpMessageParams 통합, venue, operation, credentialRef?)
- [x] **TYPE-04**: ContractCallRequest에 optional kind?: 'contractCall' 필드 추가 + ActionProviderRegistry 정규화 설계
- [x] **TYPE-05**: Zod discriminatedUnion 설계 (kind 필드로 contractCall | signedData | signedHttp 분기)
- [x] **TYPE-06**: 기존 13개 ActionProvider 무변경 하위 호환 검증 설계 (kind 없이 반환해도 registry가 정규화)

### Signer Capability

- [x] **SIGN-01**: ISignerCapability 통합 인터페이스 설계 (기존 4종 signer 통합)
- [x] **SIGN-02**: SigningSchemeEnum 설계 (eip712, personal, hmac-sha256, rsa-pss, ecdsa-secp256k1, ed25519, erc8128)
- [ ] **SIGN-03**: 기존 4종 signer ISignerCapability 어댑터 래핑 설계 (Eip712SignerCapability, PersonalSignCapability, Erc8128SignerCapability, TransactionSignerCapability)
- [ ] **SIGN-04**: 신규 HmacSignerCapability + RsaPssSignerCapability 설계 (node:crypto 기반)
- [ ] **SIGN-05**: signBytes() capability 설계 (Ed25519/ECDSA arbitrary bytes signing)
- [ ] **SIGN-06**: SignerCapabilityRegistry 설계 (signingScheme → ISignerCapability 자동 매핑)

### Credential Vault

- [ ] **CRED-01**: ICredentialVault 인터페이스 설계 (create, get, list, delete, rotate)
- [ ] **CRED-02**: credential 스코프 모델 설계 (글로벌 SettingsService + per-wallet CredentialVault, 조회 우선순위: per-wallet → 글로벌 fallback)
- [ ] **CRED-03**: credential 타입 설계 (api-key, hmac-secret, rsa-private-key, session-token, custom)
- [ ] **CRED-04**: credentialRef 간접 참조 모델 설계 (UUID or {walletId}:{name}, 원문 노출 없음)
- [ ] **CRED-05**: wallet_credentials DB 스키마 설계 (id, walletId, type, name, encryptedValue, metadata, expiresAt, createdAt, updatedAt)
- [ ] **CRED-06**: credential lifecycle 설계 (생성, 로테이션 이력 선택적, 만료, 삭제)
- [ ] **CRED-07**: credential 인증 모델 설계 (sessionAuth 해당 지갑 + masterAuth 모두 허용)
- [ ] **CRED-08**: Admin UI Credentials 탭 UX 설계 (목록: type/name/createdAt/expiresAt, 원문 비노출, 등록/삭제/로테이션 버튼)

### Async Tracking

- [ ] **TRCK-01**: AsyncTrackingResult.state 확장 설계 (기존 4종 + PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED)
- [ ] **TRCK-02**: AsyncPollingService 쿼리 확장 설계 (external action 상태 조회 경로)
- [ ] **TRCK-03**: tracker 메타데이터 확장 설계 (venue, operation 등 external action 컨텍스트 전달)
- [ ] **TRCK-04**: 상태 저장 위치 설계 (transactions 테이블 external_action_status 컬럼 vs 별도 테이블)

### Policy

- [ ] **PLCY-01**: TransactionParam/ActionPolicyParam 확장 설계 (venue, actionCategory, notionalUsd, leverage, expiry, hasWithdrawCapability)
- [ ] **PLCY-02**: venue 화이트리스트 정책 설계 (VENUE_WHITELIST, 기존 CONTRACT_WHITELIST 패턴 활용)
- [ ] **PLCY-03**: action 카테고리별 한도 설계 (ACTION_CATEGORY_LIMIT, SPENDING_LIMIT 패턴 확장)
- [ ] **PLCY-04**: ActionDefinition 확장 설계 (off-chain action riskLevel/defaultTier 정의 경로)

### Pipeline Routing

- [ ] **PIPE-01**: ActionProviderRegistry resolve() 결과 kind별 파이프라인 라우팅 설계 (contractCall→6-stage, signedData→sign pipeline, signedHttp→ERC-8128 pipeline)
- [ ] **PIPE-02**: 정책 평가 시점 설계 (resolve() 후 서명 전, 기존 패턴 동일)
- [ ] **PIPE-03**: off-chain action DB 기록 설계 (transactions 테이블 action_kind 컬럼 + nullable txHash)
- [ ] **PIPE-04**: REST API 엔드포인트 설계 (기존 POST /v1/actions/:provider/:action에서 off-chain action 처리)
- [ ] **PIPE-05**: MCP 도구 / SDK 메서드 설계 (기존 action 실행 도구 확장, credential 관리 도구)

### Design Document

- [ ] **DOC-01**: 설계 문서 doc-77 작성 (D1~D6 통합: ResolvedAction 타입, ISignerCapability, CredentialVault, AsyncTracker 확장, 정책 확장, 파이프라인 라우팅)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Implementation

- **IMPL-01**: External Action 프레임워크 구현 (m31-12에서 구현)
- **IMPL-02**: CoW Protocol ActionProvider 구현 (SignedDataAction 첫 사례)
- **IMPL-03**: CEX API ActionProvider 구현 (Binance 등, HmacSignerCapability 활용)

### Enhancement

- **ENH-01**: WebSocket 실시간 상태 스트리밍 (폴링 대신)
- **ENH-02**: Multi-step off-chain action 오케스트레이션

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 구현 (코드 작성) | m31-11은 설계만 수행. m31-12에서 구현 |
| 특정 venue provider 구현 (CoW, Binance 등) | 프레임워크 설계가 선행 |
| 기존 6-stage/sign-only/sign-message 파이프라인 리팩토링 | 기존 경로는 안정적, ISignerCapability는 새 경로에서만 사용 |
| 별도 VenueProvider 추상화 | ActionProvider와 역할 중복, resolve() 반환 타입 확장으로 해결 |
| SettingsService per-wallet 확장 | 글로벌 설정과 지갑별 credential 혼재 방지, 별도 CredentialVault 도입 |
| Per-wallet 암호화 키 | HKDF context 분리로 충분, per-wallet 키 관리 복잡도 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TYPE-01 | Phase 380 | Complete |
| TYPE-02 | Phase 380 | Complete |
| TYPE-03 | Phase 380 | Complete |
| TYPE-04 | Phase 380 | Complete |
| TYPE-05 | Phase 380 | Complete |
| TYPE-06 | Phase 380 | Complete |
| SIGN-01 | Phase 380 | Complete |
| SIGN-02 | Phase 380 | Complete |
| SIGN-03 | Phase 382 | Pending |
| SIGN-04 | Phase 382 | Pending |
| SIGN-05 | Phase 382 | Pending |
| SIGN-06 | Phase 382 | Pending |
| CRED-01 | Phase 381 | Pending |
| CRED-02 | Phase 381 | Pending |
| CRED-03 | Phase 381 | Pending |
| CRED-04 | Phase 381 | Pending |
| CRED-05 | Phase 381 | Pending |
| CRED-06 | Phase 381 | Pending |
| CRED-07 | Phase 381 | Pending |
| CRED-08 | Phase 381 | Pending |
| TRCK-01 | Phase 384 | Pending |
| TRCK-02 | Phase 384 | Pending |
| TRCK-03 | Phase 384 | Pending |
| TRCK-04 | Phase 384 | Pending |
| PLCY-01 | Phase 384 | Pending |
| PLCY-02 | Phase 384 | Pending |
| PLCY-03 | Phase 384 | Pending |
| PLCY-04 | Phase 384 | Pending |
| PIPE-01 | Phase 383 | Pending |
| PIPE-02 | Phase 383 | Pending |
| PIPE-03 | Phase 383 | Pending |
| PIPE-04 | Phase 383 | Pending |
| PIPE-05 | Phase 383 | Pending |
| DOC-01 | Phase 385 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation*
