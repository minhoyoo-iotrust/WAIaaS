# 마일스톤 m31-12: External Action 프레임워크 구현

- **Status:** PLANNED
- **Milestone:** v31.12

## 목표

m31-11 설계를 기반으로, **기존 ActionProvider 프레임워크를 확장**하여 off-chain signed action을 지원한다. `resolve()` 반환 타입 확장(`ResolvedAction`), `ISignerCapability` 통합, per-wallet `CredentialVault` 도입, `IAsyncStatusTracker` 상태 일반화, 정책 컨텍스트 확장을 구현하여 WAIaaS가 on-chain tx + off-chain signed action을 통합 처리하는 action-centric 모델로 전환한다.

> **선행**: m31-11 설계 완료 필수
> **참조**: GitHub Issue #158

---

## 배경

m31-11 설계에서 정의한 7개 산출물(D1~D7)을 구현한다. 기존 인프라(ActionProvider, AsyncPollingService, DatabasePolicyEngine)를 **확장**하고, per-wallet credential 관리를 위한 CredentialVault를 **신규 도입**(암호화 인프라는 `settings-crypto.ts` 재사용)한다. 개별 off-chain ActionProvider 구현체(CoW Protocol, Hyperliquid 등)는 이후 마일스톤에서 추가한다.

### 확장/도입 대상

| 인프라 | 현재 역할 | 변경 |
|--------|----------|------|
| `IActionProvider.resolve()` | `ContractCallRequest` 반환 | **확장**: `ResolvedAction` (union) 반환 |
| `ActionProviderRegistry` | provider 등록, resolve 재검증 | **확장**: kind별 파이프라인 라우팅 |
| `SettingsService` | daemon 글로벌 credential (masterAuth) | **유지**: 글로벌 API key 관리 (기존 그대로) |
| `CredentialVault` (신규) | — | **도입**: per-wallet credential (sessionAuth), `settings-crypto.ts` 암호화 재사용 |
| `IAsyncStatusTracker` + `AsyncPollingService` | 브릿지/가스 상태 폴링 | **확장**: off-chain action 상태 폴링 |
| `DatabasePolicyEngine` | `actionProvider`/`actionName` provider-trust | **확장**: venue/category/notionalUsd 정책 |
| sign-message pipeline | personal/typedData 서명 | **래핑**: ISignerCapability 어댑터 (기존 경로 무변경) |
| ERC-8128 http-message-signer | signed HTTP request | **래핑**: ISignerCapability 어댑터 (기존 경로 무변경) |

---

## 요구사항

### R1. ResolvedAction 타입 구현

- **R1-1.** `ResolvedAction` Zod discriminatedUnion 구현 (kind 필드 분기)
  ```ts
  type ResolvedAction =
    | ContractCallAction   // kind: 'contractCall' — 기존 ContractCallRequest 래핑
    | SignedDataAction      // kind: 'signedData' — off-chain signing
    | SignedHttpAction      // kind: 'signedHttp' — signed HTTP request
  ```
- **R1-2.** `ContractCallAction`: 기존 `ContractCallRequest` + `kind: 'contractCall'`. **하위 호환**: kind 필드가 없는 반환값은 ContractCallRequest로 취급 (기존 provider 무변경)
- **R1-3.** `SignedDataAction` 구현: `kind`, `signingScheme`, `payload` (서명할 데이터), `venue`, `operation`, `credentialRef?` (CredentialVault 참조 or SettingsService fallback), `tracking?`, `policyContext?`
- **R1-4.** `SignedHttpAction` 구현: `kind`, `method`, `url`, `headers`, `body?`, `venue`, `operation`, `credentialRef?`, `signingPreset?`
- **R1-5.** `IActionProvider.resolve()` 반환 타입을 `ContractCallRequest | ContractCallRequest[] | ResolvedAction | ResolvedAction[]`로 확장
- **R1-6.** `ActionProviderRegistry`에서 resolve 결과 검증: kind별 스키마 파싱
- **R1-7.** 기존 10개 ActionProvider 구현체(Jupiter, 0x, LI.FI, Lido, Jito, Aave, Kamino, Pendle, Drift, ERC-8004)는 **변경 없이 동작** — ContractCallRequest 반환 시 기존 경로 그대로

### R2. ISignerCapability 구현

- **R2-1.** `ISignerCapability` 인터페이스 구현 (`packages/core/src/interfaces/`)
  ```ts
  interface ISignerCapability {
    readonly scheme: SigningScheme;
    sign(payload: Uint8Array | Record<string, unknown>, keyMaterial: Uint8Array, options?: SigningOptions): Promise<SigningResult>;
  }
  ```
- **R2-2.** 기존 signer 어댑터 래핑 (기존 코드 무변경, 새 어댑터가 기존 함수를 호출):
  - `Eip712SignerCapability` — 기존 `privateKeyToAccount().signTypedData()` 래핑
  - `PersonalSignCapability` — 기존 `privateKeyToAccount().signMessage()` 래핑
  - `Erc8128SignerCapability` — 기존 `signHttpMessage()` 래핑
- **R2-3.** 신규 signer 구현:
  - `HmacSha256SignerCapability` — Node.js `crypto.createHmac()` 기반
  - `RsaPssSignerCapability` — Node.js `crypto.sign()` RSA-PSS 기반
  - `BytesSignerCapability` — Ed25519/ECDSA arbitrary bytes signing
- **R2-4.** `SignerCapabilityRegistry` 구현: `signingScheme` → `ISignerCapability` 자동 매핑
- **R2-5.** 기존 sign-message / sign-only / ERC-8128 파이프라인의 기존 호출 경로는 변경하지 않음

### R3. CredentialVault 구현 (per-wallet credential 관리)

글로벌 credential은 기존 `SettingsService`(masterAuth)가 계속 담당한다. per-wallet credential을 위한 `CredentialVault`를 신규 도입하되, 암호화 인프라는 `settings-crypto.ts`를 재사용한다.

- **R3-1.** `ICredentialVault` 인터페이스 구현 (`packages/core/src/interfaces/`)
  ```ts
  interface ICredentialVault {
    create(walletId: string, entry: CredentialEntry): Promise<CredentialRef>;
    get(walletId: string, ref: CredentialRef): Promise<DecryptedCredential>;
    list(walletId: string): Promise<CredentialSummary[]>;  // 원문 비노출
    delete(walletId: string, ref: CredentialRef): Promise<void>;
    rotate(walletId: string, ref: CredentialRef, newValue: string): Promise<void>;
  }
  ```
- **R3-2.** `LocalCredentialVault` 구현: `settings-crypto.ts`의 `encryptSettingValue()`/`decryptSettingValue()` 재사용
- **R3-3.** DB 마이그레이션: `wallet_credentials` 테이블 생성 (id UUID PK, walletId FK, type, name, encryptedValue, metadata JSON, expiresAt, createdAt, updatedAt)
- **R3-4.** `CredentialTypeEnum` 구현: `api-key`, `hmac-secret`, `rsa-private-key`, `session-token`, `custom`
- **R3-5.** credential CRUD REST API:
  - `POST /v1/wallets/:id/credentials` — credential 등록 (sessionAuth + masterAuth)
  - `GET /v1/wallets/:id/credentials` — 목록 조회 (type, name만 노출, 원문 비노출)
  - `DELETE /v1/wallets/:id/credentials/:credentialId` — 삭제
  - `POST /v1/wallets/:id/credentials/:credentialId/rotate` — 로테이션 (새 값으로 교체)
- **R3-6.** credential 조회 우선순위: off-chain action 실행 시 credential 조회 순서:
  1. per-wallet credential (`CredentialVault` — walletId + credentialRef)
  2. 글로벌 credential (`SettingsService` — `actions.{provider}_api_key`)
  3. 미발견 시 `CREDENTIAL_NOT_FOUND` 에러
- **R3-7.** `credentialRef` 참조 모델: ActionProvider의 SignedDataAction/SignedHttpAction에서 `credentialRef` 문자열로 vault에 간접 접근. 원문은 파이프라인 내부에서만 복호화, 응답에 절대 포함하지 않음
- **R3-8.** credential 만료 자동 정리: `WorkerScheduler`에 `credential-cleanup` 워커 등록 (만료된 credential 삭제)
- **R3-9.** Admin UI: 지갑 상세 Credentials 탭 — credential 목록 (type, name, createdAt, expiresAt), 등록/삭제/로테이션 버튼, 원문 비노출
- **R3-10.** 기존 `SettingsService`는 변경하지 않음 — 글로벌 API key 관리(`setApiKey()`/`getApiKey()`)는 기존 경로 그대로 유지

### R4. IAsyncStatusTracker 확장 구현

- **R4-1.** `AsyncTrackingResult.state` 확장: 기존 4종 + `'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'SETTLED' | 'EXPIRED'`
- **R4-2.** `AsyncPollingService` 쿼리 확장: off-chain action 상태 대상 추가 (m31-11 설계의 저장 위치 결정에 따름)
- **R4-3.** `ExternalActionTracker` 구현: `IAsyncStatusTracker` 구현체. venue별 상태 확인 로직을 ActionProvider에 위임
- **R4-4.** `IActionProvider`에 선택적 `checkStatus()` 메서드 추가: off-chain action의 상태 폴링을 provider가 구현
  ```ts
  interface IActionProvider {
    // 기존
    resolve(...): Promise<...>;
    // 신규 (선택적)
    checkStatus?(actionId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult>;
  }
  ```
- **R4-5.** EventBus 이벤트: `action:status-changed`, `action:completed`, `action:failed`
- **R4-6.** 알림 통합: 기존 NotificationService 채널 활용

### R5. 정책 컨텍스트 확장 구현

- **R5-1.** `TransactionParam` 확장: `venue?`, `actionCategory?` ('trade'|'withdraw'|'transfer'|'sign'), `notionalUsd?`, `leverage?`, `expiry?`, `hasWithdrawCapability?` 필드 추가
- **R5-2.** `DatabasePolicyEngine.evaluateAction()` 확장: venue 화이트리스트 체크, actionCategory 한도 체크
- **R5-3.** venue 화이트리스트: `VENUE_WHITELIST` Admin Setting (기존 `CONTRACT_WHITELIST` 패턴). 미설정 시 default-deny (CLAUDE.md 규칙)
- **R5-4.** notionalUsd 상한: `MAX_NOTIONAL_USD` Admin Setting. 단일 action USD 한도
- **R5-5.** 기존 `SPENDING_LIMIT` / `provider-trust` 정책과의 공존: off-chain action에도 기존 정책 평가 적용

### R6. 파이프라인 라우팅 구현

- **R6-1.** `ActionProviderRegistry`에서 resolve() 결과의 kind 판별:
  - kind 없음 or `'contractCall'` → 기존 6-stage pipeline (무변경)
  - `'signedData'` → `executeSignedDataAction()` 새 파이프라인
  - `'signedHttp'` → `executeSignedHttpAction()` 새 파이프라인
- **R6-2.** `executeSignedDataAction()` 파이프라인 (sign-only 패턴 기반):
  1. 요청 파싱 + 검증
  2. credential 조회 (CredentialVault → SettingsService fallback)
  3. 정책 평가 (확장된 evaluateAction)
  4. UUID v7 ID 생성 + DB INSERT
  5. signer capability 선택 (SignerCapabilityRegistry)
  6. 서명 실행 (ISignerCapability)
  7. 추적 등록 (AsyncPollingService, 선택적)
  8. 응답 반환
- **R6-3.** `executeSignedHttpAction()` 파이프라인: R6-2와 유사, ERC-8128 서명 경로 사용
- **R6-4.** REST API: 기존 `POST /v1/actions/:provider/:action` 경로 유지. off-chain action도 같은 엔드포인트에서 처리 (provider의 resolve() 결과에 따라 자동 분기)
- **R6-5.** 감사 로그: `ACTION_SIGNED` (off-chain signing), `ACTION_HTTP_SIGNED` (signed HTTP)
- **R6-6.** 키 해제: 서명 후 즉시 `keyStore.releaseKey()` (sign-only 패턴)

### R7. External Action 조회 API

- **R7-1.** `GET /v1/wallets/:id/actions` — off-chain action 목록 조회 (페이지네이션, 필터: venue, status)
- **R7-2.** `GET /v1/wallets/:id/actions/:actionId` — 상세 조회 (요청/응답 payload, 상태 이력)
- **R7-3.** DB 저장: m31-11 설계 결정에 따라 기존 `transactions` 테이블 확장 or 별도 테이블

### R8. 에러 코드

- **R8-1.** `CREDENTIAL_NOT_FOUND` — credentialRef에 해당하는 credential이 CredentialVault/SettingsService 모두에 없음 (404)
- **R8-6.** `CREDENTIAL_EXPIRED` — credential이 만료됨 (400)
- **R8-2.** `SIGNING_SCHEME_UNSUPPORTED` — 요청한 signingScheme을 지원하지 않음 (400)
- **R8-3.** `VENUE_NOT_ALLOWED` — venue가 VENUE_WHITELIST에 없음 (403)
- **R8-4.** `EXTERNAL_ACTION_FAILED` — off-chain action 실행 실패 (500)
- **R8-7.** 기존 에러 코드 재사용: `POLICY_DENIED`, `INVALID_REQUEST`, `UNAUTHORIZED`, `ACTION_VALIDATION_FAILED`

### R9. DB 마이그레이션

- **R9-1.** `wallet_credentials` 테이블 생성 마이그레이션
- **R9-2.** off-chain action 저장: m31-11 설계 결정에 따라 `transactions` 테이블 컬럼 추가 or 별도 테이블
- **R9-3.** 마이그레이션 테스트: 스키마 스냅샷 + 데이터 변환 테스트 (CLAUDE.md 규칙)

### R10. Admin UI

- **R10-1.** Credentials 설정: 기존 API Key 관리 UI 확장 — credential 타입(API Key/HMAC/RSA) 표시, 범용 입력 지원
- **R10-2.** External Actions 탭: 지갑 상세에 off-chain action 이력 표시 (venue, operation, status, createdAt)
- **R10-3.** 정책 설정: Venue Whitelist 설정 UI (기존 CONTRACT_WHITELIST UI 패턴)

### R11. MCP + SDK

- **R11-1.** MCP: 기존 action 실행 도구가 off-chain action도 자동 지원 (provider의 resolve() 결과에 따라 분기)
- **R11-2.** MCP 도구: `list_external_actions` — off-chain action 이력 조회
- **R11-3.** MCP 도구: `manage_credentials` — per-wallet credential 등록/목록/삭제
- **R11-4.** SDK 메서드: `listExternalActions()`, `getExternalAction()` 추가
- **R11-5.** SDK 메서드: `createCredential()`, `listCredentials()`, `deleteCredential()`, `rotateCredential()` 추가
- **R11-6.** SDK: 기존 `executeAction()` 메서드가 off-chain action도 자동 지원

### R12. 스킬 파일

- **R12-1.** `skills/external-actions.skill.md` — 신규 스킬 파일 (off-chain action 개념, signing scheme, credential 설정, 사용 예시)
- **R12-2.** `skills/transactions.skill.md` — off-chain action 파이프라인 참조 추가
- **R12-3.** `skills/policies.skill.md` — Venue Whitelist, notionalUsd 한도 정책 추가
- **R12-4.** `skills/admin.skill.md` — credential 관리 확장, External Actions 모니터링 안내

---

## 설계 결정

### D1. 기존 인프라 확장 + CredentialVault 신규 도입

| 이슈 #158 제안 | 판단 | 근거 |
|---|---|---|
| VenueProvider | **확장** — ActionProvider.resolve() 반환 타입 확장 | ActionProvider와 역할 중복 |
| CredentialVault | **신규 도입** — per-wallet CredentialVault | SettingsService는 글로벌(Admin-only). 에이전트가 sessionAuth로 per-wallet credential을 직접 관리해야 함 |
| CredentialVault 암호화 | **재사용** — settings-crypto.ts | AES-256-GCM + HKDF 인프라가 이미 존재. 별도 암호화 스택 불필요 |
| 별도 async tracker | **확장** — IAsyncStatusTracker 상태 enum 확장 | AsyncPollingService가 이미 범용 인터페이스 |
| 별도 policy engine | **확장** — TransactionParam 필드 확장 | DatabasePolicyEngine이 이미 actionProvider/actionName 기반 정책 보유 |

### D2. 기존 파이프라인 무변경 원칙

기존 6-stage, sign-only, sign-message 파이프라인을 수정하지 않는다. off-chain action은 별도 파이프라인(`executeSignedDataAction`, `executeSignedHttpAction`)으로 구현한다. ISignerCapability 래퍼는 기존 함수를 감싸는 어댑터이며, 기존 호출 경로를 변경하지 않는다.

### D3. 하위 호환: kind 필드 부재 = ContractCallRequest

기존 10개 ActionProvider가 반환하는 `ContractCallRequest`에는 `kind` 필드가 없다. ActionProviderRegistry에서 `kind` 필드 유무로 판별한다:
- `kind` 없음 → `ContractCallRequest` → 기존 6-stage pipeline
- `kind: 'signedData'` → off-chain signing pipeline
- `kind: 'signedHttp'` → signed HTTP pipeline

기존 provider 코드 변경 제로.

### D4. checkStatus()는 ActionProvider에 위임

별도 VenueProvider를 만들지 않으므로, off-chain action의 상태 폴링도 ActionProvider가 담당한다. `checkStatus()`를 선택적 메서드로 추가하여 기존 provider는 구현하지 않아도 된다. ExternalActionTracker가 AsyncPollingService에 등록되어 provider의 checkStatus()를 호출한다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/core/src/interfaces/action-provider.types.ts` | `resolve()` 반환 타입 확장, `checkStatus()` 선택적 메서드, ResolvedAction union |
| `packages/core/src/interfaces/` | ISignerCapability 인터페이스 추가 |
| `packages/core/src/schemas/` | SignedDataAction, SignedHttpAction, ResolvedAction Zod 스키마 |
| `packages/core/src/enums/` | SigningScheme enum 추가 |
| `packages/core/src/errors/error-codes.ts` | CREDENTIAL_NOT_FOUND, SIGNING_SCHEME_UNSUPPORTED, VENUE_NOT_ALLOWED, EXTERNAL_ACTION_FAILED |
| `packages/actions/src/common/async-status-tracker.ts` | AsyncTrackingResult.state 확장 |
| `packages/daemon/src/services/async-polling-service.ts` | off-chain action 폴링 대상 확장 |
| `packages/daemon/src/infrastructure/credential-vault/` | LocalCredentialVault (신규, settings-crypto.ts 암호화 재사용) |
| `packages/daemon/src/infrastructure/database/schema.ts` | wallet_credentials 테이블 추가 |
| `packages/daemon/src/api/routes/` | credentials.ts (신규, CRUD API) |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | TransactionParam 확장, venue 정책 |
| `packages/daemon/src/pipeline/` | signed-data-action.ts, signed-http-action.ts (신규 파이프라인) |
| `packages/daemon/src/api/routes/actions.ts` | kind별 파이프라인 라우팅 |
| `packages/admin/src/pages/` | credential 설정 확장, External Actions 탭, Venue Whitelist |
| `packages/mcp/src/tools/` | list_external_actions 도구 추가 |
| `packages/sdk/src/` | listExternalActions(), getExternalAction() 메서드 |
| `skills/` | external-actions.skill.md (신규), transactions/policies/admin 업데이트 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| 특정 off-chain ActionProvider 구현 (CoW, Hyperliquid, Binance 등) | 프레임워크 코어 구현이 선행 | 이후 마일스톤에서 개별 provider 추가 |
| 기존 10개 ActionProvider 수정 | 하위 호환 (kind 없음 = ContractCallRequest) | 기존 코드 무변경 |
| 기존 sign-message/sign-only/ERC-8128 파이프라인 수정 | 기존 호출 경로 유지 | ISignerCapability는 새 파이프라인에서만 사용 |
| OAuth 2.0 flow | credential 저장/관리만 범위 내 | off-chain provider 구현 시 필요하면 추가 |
| credential 자동 로테이션 | 초기 scope 과다 | rotate API로 수동 로테이션 |
| SettingsService per-wallet 확장 | 글로벌 설정과 지갑별 credential 혼재 | 별도 CredentialVault 도입 |
| 별도 VenueProvider 추상화 | ActionProvider와 역할 중복 | ActionProvider.resolve() 반환 타입 확장 |
