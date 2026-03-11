# Requirements: WAIaaS v31.12 External Action 프레임워크 구현

**Defined:** 2026-03-12
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Design Reference:** doc-81 External Action 프레임워크 설계 (m31-11)

## v1 Requirements

Requirements for v31.12 milestone. Each maps to roadmap phases.

### ResolvedAction 타입 시스템

- [ ] **RTYPE-01**: ResolvedAction Zod discriminatedUnion 구현 — kind 필드 분기 (contractCall/signedData/signedHttp)
- [ ] **RTYPE-02**: ContractCallAction 구현 — 기존 ContractCallRequest + kind:'contractCall' 래핑, kind 필드 없는 반환값은 ContractCallRequest로 취급 (하위 호환)
- [ ] **RTYPE-03**: SignedDataAction 구현 — kind, signingScheme, payload, venue, operation, credentialRef?, tracking?, policyContext?
- [ ] **RTYPE-04**: SignedHttpAction 구현 — kind, method, url, headers, body?, venue, operation, credentialRef?, signingPreset?
- [ ] **RTYPE-05**: IActionProvider.resolve() 반환 타입을 ContractCallRequest | ContractCallRequest[] | ResolvedAction | ResolvedAction[]로 확장
- [ ] **RTYPE-06**: ActionProviderRegistry에서 resolve 결과 검증 — kind별 Zod 스키마 파싱
- [ ] **RTYPE-07**: 기존 13개 ActionProvider 구현체 무변경 동작 확인 — kind 없이 ContractCallRequest 반환 시 contractCall로 정규화, ApiDirectResult는 정규화 전 isApiDirectResult()로 분기

### ISignerCapability

- [ ] **SIGN-01**: ISignerCapability 인터페이스 구현 — scheme, canSign(), sign()
- [ ] **SIGN-02**: 기존 signer 래핑 어댑터 구현 — Eip712SignerCapability, PersonalSignCapability, Erc8128SignerCapability (기존 코드 무변경, 어댑터가 기존 함수 호출)
- [ ] **SIGN-03**: HmacSignerCapability 구현 — Node.js crypto.createHmac() 기반
- [ ] **SIGN-04**: RsaPssSignerCapability 구현 — Node.js crypto.sign() RSA-PSS 기반
- [ ] **SIGN-05**: EcdsaSignBytesCapability 구현 — viem/@noble secp256k1 arbitrary bytes signing
- [ ] **SIGN-06**: Ed25519SignBytesCapability 구현 — @solana/kit signBytes 기반
- [ ] **SIGN-07**: SignerCapabilityRegistry 구현 — signingScheme → ISignerCapability 자동 매핑
- [ ] **SIGN-08**: 기존 sign-message / sign-only / ERC-8128 파이프라인의 기존 호출 경로 무변경 확인

### CredentialVault

- [ ] **CRED-01**: ICredentialVault 인터페이스 구현 — create(), get(), list(), delete(), rotate(), walletId null=글로벌/string=per-wallet
- [ ] **CRED-02**: LocalCredentialVault 구현 — settings-crypto.ts의 encryptSettingValue()/decryptSettingValue() 재사용
- [ ] **CRED-03**: DB 마이그레이션 v55 — wallet_credentials 테이블 생성 (AES-256-GCM, HKDF, auth_tag 별도 컬럼)
- [ ] **CRED-04**: CredentialTypeEnum 구현 — api-key, hmac-secret, rsa-private-key, session-token, custom
- [ ] **CRED-05**: Per-wallet credential CRUD REST API — GET/POST/DELETE/PUT rotate (sessionAuth 읽기, masterAuth 쓰기)
- [ ] **CRED-06**: 글로벌 credential CRUD REST API — GET/POST/DELETE/PUT rotate (masterAuth 전용)
- [ ] **CRED-07**: credential 조회 우선순위 — per-wallet CredentialVault → 글로벌 SettingsService → CREDENTIAL_NOT_FOUND
- [ ] **CRED-08**: credentialRef 참조 모델 — ActionProvider에서 문자열 참조, 파이프라인 내부에서만 복호화, 응답에 미포함
- [ ] **CRED-09**: credential 만료 자동 정리 — WorkerScheduler credential-cleanup 워커
- [ ] **CRED-10**: Master Password 변경 시 wallet_credentials 전 레코드 re-encrypt — SettingsService re-encrypt와 동일 트랜잭션
- [ ] **CRED-11**: 기존 SettingsService 무변경 — 글로벌 API key 관리 기존 경로 유지

### IAsyncStatusTracker 확장

- [ ] **TRACK-01**: AsyncTrackingResult.state 확장 — 기존 4종 + PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED
- [ ] **TRACK-02**: AsyncPollingService 쿼리 확장 — bridge_status/bridge_metadata를 tracking_status/tracking_metadata로 리네임
- [ ] **TRACK-03**: ExternalActionTracker 구현 — IAsyncStatusTracker 구현체, venue별 상태 확인을 ActionProvider에 위임
- [ ] **TRACK-04**: IActionProvider에 선택적 메서드 추가 — checkStatus(), execute()
- [ ] **TRACK-05**: EventBus 이벤트 — action:status-changed, action:completed, action:failed
- [ ] **TRACK-06**: 알림 이벤트 6종 — external_action_partially_filled/filled/settled/canceled/expired/failed

### 정책 컨텍스트 확장

- [ ] **POLICY-01**: TransactionParam 확장 — venue?, actionCategory?, notionalUsd?, leverage?, expiry?, hasWithdrawCapability?
- [ ] **POLICY-02**: DatabasePolicyEngine.evaluateAction() 확장 — venue 화이트리스트 체크, actionCategory 한도 체크
- [ ] **POLICY-03**: VENUE_WHITELIST Admin Setting — CONTRACT_WHITELIST 패턴, venue_whitelist_enabled 토글, default-deny
- [ ] **POLICY-04**: ACTION_CATEGORY_LIMIT 정책 — 카테고리별 USD 한도 (daily/monthly/per_action), tier_on_exceed
- [ ] **POLICY-05**: 기존 SPENDING_LIMIT / provider-trust 정책과 공존
- [ ] **POLICY-06**: ActionDefinition.riskLevel 4등급 — low/medium/high/critical → defaultTier 자동 매핑

### 파이프라인 라우팅

- [ ] **PIPE-01**: ActionProviderRegistry kind 판별 라우팅 — kind 없음/contractCall→기존, signedData→새 파이프라인, signedHttp→새 파이프라인
- [ ] **PIPE-02**: executeSignedDataAction() 파이프라인 — 파싱→credential→정책→DB→signer→서명→추적→응답
- [ ] **PIPE-03**: executeSignedHttpAction() 파이프라인 — 서명만 수행, HTTP 발송은 ActionProvider.execute() 콜백에 위임
- [ ] **PIPE-04**: REST API 기존 경로 유지 — POST /v1/actions/:provider/:action에서 자동 분기
- [ ] **PIPE-05**: 감사 로그 — ACTION_SIGNED, ACTION_HTTP_SIGNED
- [ ] **PIPE-06**: 서명 후 keyStore.releaseKey() 즉시 해제
- [ ] **PIPE-07**: connect-info 확장 — capabilities.externalActions, capabilities.signing, capabilities.supportedVenues

### External Action 조회 API

- [ ] **QUERY-01**: GET /v1/wallets/:id/actions — off-chain action 목록 조회 (페이지네이션, 필터: venue, status)
- [ ] **QUERY-02**: GET /v1/wallets/:id/actions/:actionId — 상세 조회 (요청/응답 payload, 상태 이력)
- [ ] **QUERY-03**: DB 저장 — transactions 테이블 컬럼 확장 (action_kind, venue, operation, external_id)

### 에러 코드

- [ ] **ERR-01**: CREDENTIAL_NOT_FOUND (404), CREDENTIAL_EXPIRED (400) 에러 코드 추가
- [ ] **ERR-02**: SIGNING_SCHEME_UNSUPPORTED (400), CAPABILITY_NOT_FOUND (400) 에러 코드 추가
- [ ] **ERR-03**: VENUE_NOT_ALLOWED (403), EXTERNAL_ACTION_FAILED (500) 에러 코드 추가

### DB 마이그레이션

- [ ] **DBMIG-01**: v55 마이그레이션 — wallet_credentials 테이블 (유니크 인덱스, expires_at 부분 인덱스)
- [ ] **DBMIG-02**: v56 마이그레이션 — transactions 테이블 변경 (리네임 + 컬럼 추가 + 인덱스)
- [ ] **DBMIG-03**: 마이그레이션 테스트 — 스키마 스냅샷 + 데이터 변환 테스트

### Admin UI

- [ ] **ADMIN-01**: Credentials 설정 UI — per-wallet 탭 + 글로벌 페이지, 등록/삭제/로테이션 모달, 원문 비노출
- [ ] **ADMIN-02**: External Actions 탭 — 지갑 상세에 off-chain action 이력 (venue, operation, status, createdAt)
- [ ] **ADMIN-03**: Venue Whitelist 설정 UI — CONTRACT_WHITELIST 패턴 재사용
- [ ] **ADMIN-04**: ACTION_CATEGORY_LIMIT 정책 설정 UI — 카테고리별 USD 한도 등록/수정/삭제

### MCP + SDK

- [ ] **INTEG-01**: MCP 기존 action 도구가 off-chain action 자동 지원 (resolve 결과 분기)
- [ ] **INTEG-02**: MCP action-list-offchain 도구 — off-chain action 이력 조회
- [ ] **INTEG-03**: MCP credential-list 도구 — sessionAuth 기반 credential 목록 확인
- [ ] **INTEG-04**: SDK listOffchainActions(), getActionResult() 메서드 추가
- [ ] **INTEG-05**: SDK listCredentials() (sessionAuth) + AdminClient createCredential()/deleteCredential()/rotateCredential() (masterAuth)
- [ ] **INTEG-06**: SDK 기존 executeAction() off-chain action 자동 지원

### 스킬 파일

- [ ] **SKILL-01**: external-actions.skill.md 신규 — off-chain action 개념, signing scheme, credential 설정, 사용 예시
- [ ] **SKILL-02**: transactions.skill.md — off-chain action 파이프라인 참조 추가
- [ ] **SKILL-03**: policies.skill.md — Venue Whitelist, notionalUsd 한도 정책 추가
- [ ] **SKILL-04**: admin.skill.md — credential 관리, External Actions 모니터링 추가

## Future Requirements

### 개별 Off-chain ActionProvider 구현
- **OFFCHAIN-01**: CoW Protocol ActionProvider (Intent-based DEX)
- **OFFCHAIN-02**: Hyperliquid off-chain ActionProvider 마이그레이션 (ApiDirectResult → SignedDataAction)
- **OFFCHAIN-03**: Polymarket off-chain ActionProvider 마이그레이션 (ApiDirectResult → SignedDataAction)
- **OFFCHAIN-04**: CEX ActionProvider (Binance, Coinbase 등)

### 고급 Credential 기능
- **CRED-ADV-01**: OAuth 2.0 flow 지원
- **CRED-ADV-02**: credential 자동 로테이션

## Out of Scope

| Feature | Reason |
|---------|--------|
| 특정 off-chain ActionProvider 구현 (CoW, CEX 등) | 프레임워크 코어 구현이 선행 — 이후 마일스톤에서 추가 |
| 기존 13개 ActionProvider 수정 | 하위 호환 (kind 없음 = ContractCallRequest) |
| 기존 sign-message/sign-only/ERC-8128 파이프라인 수정 | 기존 호출 경로 유지, ISignerCapability는 새 파이프라인에서만 사용 |
| OAuth 2.0 flow | credential 저장/관리만 범위 내 |
| credential 자동 로테이션 | rotate API로 수동 로테이션 |
| SettingsService per-wallet 확장 | 별도 CredentialVault 도입으로 대체 |
| 별도 VenueProvider 추상화 | ActionProvider.resolve() 반환 타입 확장으로 대체 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RTYPE-01 | Phase 386 | Pending |
| RTYPE-02 | Phase 386 | Pending |
| RTYPE-03 | Phase 386 | Pending |
| RTYPE-04 | Phase 386 | Pending |
| RTYPE-05 | Phase 386 | Pending |
| RTYPE-06 | Phase 386 | Pending |
| RTYPE-07 | Phase 386 | Pending |
| ERR-01 | Phase 386 | Pending |
| ERR-02 | Phase 386 | Pending |
| ERR-03 | Phase 386 | Pending |
| DBMIG-01 | Phase 386 | Pending |
| DBMIG-02 | Phase 386 | Pending |
| DBMIG-03 | Phase 386 | Pending |
| SIGN-01 | Phase 387 | Pending |
| SIGN-02 | Phase 387 | Pending |
| SIGN-03 | Phase 387 | Pending |
| SIGN-04 | Phase 387 | Pending |
| SIGN-05 | Phase 387 | Pending |
| SIGN-06 | Phase 387 | Pending |
| SIGN-07 | Phase 387 | Pending |
| SIGN-08 | Phase 387 | Pending |
| CRED-01 | Phase 388 | Pending |
| CRED-02 | Phase 388 | Pending |
| CRED-03 | Phase 388 | Pending |
| CRED-04 | Phase 388 | Pending |
| CRED-05 | Phase 388 | Pending |
| CRED-06 | Phase 388 | Pending |
| CRED-07 | Phase 388 | Pending |
| CRED-08 | Phase 388 | Pending |
| CRED-09 | Phase 388 | Pending |
| CRED-10 | Phase 388 | Pending |
| CRED-11 | Phase 388 | Pending |
| TRACK-01 | Phase 389 | Pending |
| TRACK-02 | Phase 389 | Pending |
| TRACK-03 | Phase 389 | Pending |
| TRACK-04 | Phase 389 | Pending |
| TRACK-05 | Phase 389 | Pending |
| TRACK-06 | Phase 389 | Pending |
| POLICY-01 | Phase 389 | Pending |
| POLICY-02 | Phase 389 | Pending |
| POLICY-03 | Phase 389 | Pending |
| POLICY-04 | Phase 389 | Pending |
| POLICY-05 | Phase 389 | Pending |
| POLICY-06 | Phase 389 | Pending |
| PIPE-01 | Phase 390 | Pending |
| PIPE-02 | Phase 390 | Pending |
| PIPE-03 | Phase 390 | Pending |
| PIPE-04 | Phase 390 | Pending |
| PIPE-05 | Phase 390 | Pending |
| PIPE-06 | Phase 390 | Pending |
| PIPE-07 | Phase 390 | Pending |
| QUERY-01 | Phase 390 | Pending |
| QUERY-02 | Phase 390 | Pending |
| QUERY-03 | Phase 390 | Pending |
| ADMIN-01 | Phase 391 | Pending |
| ADMIN-02 | Phase 391 | Pending |
| ADMIN-03 | Phase 391 | Pending |
| ADMIN-04 | Phase 391 | Pending |
| INTEG-01 | Phase 392 | Pending |
| INTEG-02 | Phase 392 | Pending |
| INTEG-03 | Phase 392 | Pending |
| INTEG-04 | Phase 392 | Pending |
| INTEG-05 | Phase 392 | Pending |
| INTEG-06 | Phase 392 | Pending |
| SKILL-01 | Phase 392 | Pending |
| SKILL-02 | Phase 392 | Pending |
| SKILL-03 | Phase 392 | Pending |
| SKILL-04 | Phase 392 | Pending |

**Coverage:**
- v1 requirements: 60 total
- Mapped to phases: 60/60
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation*
