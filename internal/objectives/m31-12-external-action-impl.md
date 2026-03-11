# 마일스톤 m31-12: External Action 프레임워크 구현

- **Status:** SHIPPED
- **Milestone:** v31.12
- **Completed:** 2026-03-12

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
- **R1-7.** 기존 13개 ActionProvider 구현체는 **변경 없이 동작** — kind 없이 ContractCallRequest 반환 시 registry가 contractCall로 정규화, ApiDirectResult(Hyperliquid/Polymarket)는 정규화 전 `isApiDirectResult()`로 분기 (기존 provider 코드 변경 0줄)
- **R1-8.** **마이그레이션 경로**: 향후 off-chain provider가 안정화되면, 기존 provider도 `ResolvedAction`(kind: 'contractCall')으로 통일하고 `ContractCallRequest` 직접 반환을 deprecated 처리한다

### R2. ISignerCapability 구현

- **R2-1.** `ISignerCapability` 인터페이스 구현 (`packages/core/src/interfaces/`)
  ```ts
  interface ISignerCapability {
    readonly scheme: SigningScheme;
    canSign(params: SigningParams): boolean;
    sign(params: SigningParams): Promise<SigningResult>;
  }
  ```
- **R2-2.** 기존 signer 어댑터 래핑 (기존 코드 무변경, 새 어댑터가 기존 함수를 호출):
  - `Eip712SignerCapability` — 기존 `privateKeyToAccount().signTypedData()` 래핑
  - `PersonalSignCapability` — 기존 `privateKeyToAccount().signMessage()` 래핑
  - `Erc8128SignerCapability` — 기존 `signHttpMessage()` 래핑
- **R2-3.** 신규 signer 구현:
  - `HmacSignerCapability` — Node.js `crypto.createHmac()` 기반
  - `RsaPssSignerCapability` — Node.js `crypto.sign()` RSA-PSS 기반
  - `EcdsaSignBytesCapability` — viem/@noble secp256k1 arbitrary bytes signing (hashData 옵션, 기본 true=keccak256)
  - `Ed25519SignBytesCapability` — @solana/kit signBytes 기반 (내부 SHA-512, 외부 해시 불필요)
- **R2-4.** `SignerCapabilityRegistry` 구현: `signingScheme` → `ISignerCapability` 자동 매핑
- **R2-5.** 기존 sign-message / sign-only / ERC-8128 파이프라인의 기존 호출 경로는 변경하지 않음

### R3. CredentialVault 구현 (per-wallet credential 관리)

글로벌 credential은 기존 `SettingsService`(masterAuth)가 계속 담당한다. per-wallet credential을 위한 `CredentialVault`를 신규 도입하되, 암호화 인프라는 `settings-crypto.ts`를 재사용한다.

- **R3-1.** `ICredentialVault` 인터페이스 구현 (`packages/core/src/interfaces/`)
  ```ts
  interface ICredentialVault {
    create(walletId: string | null, params: CreateCredentialParams): Promise<CredentialMetadata>;
    get(ref: string, walletId?: string): Promise<DecryptedCredential>;
    list(walletId?: string): Promise<CredentialMetadata[]>;  // 원문 비노출
    delete(ref: string): Promise<void>;
    rotate(ref: string, newValue: string): Promise<CredentialMetadata>;
  }
  ```
  - `walletId: null` → 글로벌 credential (모든 지갑에서 접근 가능)
  - `walletId: string` → per-wallet credential (해당 지갑 세션만 접근)
- **R3-2.** `LocalCredentialVault` 구현: `settings-crypto.ts`의 `encryptSettingValue()`/`decryptSettingValue()` 재사용
- **R3-3.** DB 마이그레이션 **v55**: `wallet_credentials` 테이블 생성 (id UUID PK, walletId FK nullable, type, name, encrypted_value BLOB, iv BLOB, auth_tag BLOB, metadata JSON, expiresAt, createdAt, updatedAt). 암호화: AES-256-GCM, HKDF info `"waiaas-credential-encryption"`, AAD `{credentialId}:{walletId|global}:{type}`, auth_tag 별도 컬럼
- **R3-4.** `CredentialTypeEnum` 구현: `api-key`, `hmac-secret`, `rsa-private-key`, `session-token`, `custom`
- **R3-5.** credential CRUD REST API (per-wallet + 글로벌 이원화):
  - Per-wallet (지갑별):
    - `GET /v1/wallets/:walletId/credentials` — 목록 조회 (**sessionAuth**) — type, name만 노출, 원문 비노출
    - `POST /v1/wallets/:walletId/credentials` — credential 등록 (**masterAuth**)
    - `DELETE /v1/wallets/:walletId/credentials/:ref` — 삭제 (**masterAuth**)
    - `PUT /v1/wallets/:walletId/credentials/:ref/rotate` — 로테이션 (**masterAuth**)
  - 글로벌 (Admin):
    - `GET /v1/admin/credentials` — 글로벌 credential 목록 (**masterAuth**)
    - `POST /v1/admin/credentials` — 글로벌 credential 등록 (**masterAuth**)
    - `DELETE /v1/admin/credentials/:ref` — 삭제 (**masterAuth**)
    - `PUT /v1/admin/credentials/:ref/rotate` — 로테이션 (**masterAuth**)
  - **권한 모델 정리**: credential 쓰기(등록/삭제/로테이션)는 masterAuth 전용 — Owner/Admin이 사전 프로비저닝. AI 에이전트(sessionAuth)는 **읽기(목록 조회)만 가능**하며, 파이프라인 내부에서 credentialRef를 통해 간접 사용. 이는 보안 원칙("AI agents must NEVER request the master password")과 일관: 에이전트는 credential 값을 직접 다루지 않고, Owner가 등록한 credential을 참조만 함
- **R3-6.** credential 조회 우선순위: off-chain action 실행 시 credential 조회 순서:
  1. per-wallet credential (`CredentialVault` — walletId + credentialRef)
  2. 글로벌 credential (`SettingsService` — `actions.{provider}_api_key`)
  3. 미발견 시 `CREDENTIAL_NOT_FOUND` 에러
- **R3-7.** `credentialRef` 참조 모델: ActionProvider의 SignedDataAction/SignedHttpAction에서 `credentialRef` 문자열로 vault에 간접 접근. 원문은 파이프라인 내부에서만 복호화, 응답에 절대 포함하지 않음
- **R3-8.** credential 만료 자동 정리: `WorkerScheduler`에 `credential-cleanup` 워커 등록 (만료된 credential 삭제)
- **R3-9.** Master Password 변경 시 `wallet_credentials` 전 레코드 re-encrypt. SettingsService의 암호화 설정 re-encrypt와 **동일 `db.transaction()` 내에서 원자적으로 수행** — 한쪽만 성공하면 일부 credential이 이전 키로 암호화된 채 남아 복호화 불가능해지므로 반드시 같은 트랜잭션. 구현: 기존 `changeMasterPassword()` **호출자 레벨**(API route 또는 서비스 메서드)에서 트랜잭션을 통합하여 SettingsService re-encrypt + CredentialVault re-encrypt를 원자적으로 수행. SettingsService 내부 로직은 변경하지 않음. backup export에 wallet_credentials 테이블 포함
- **R3-10.** 기존 `SettingsService`는 변경하지 않음 — 글로벌 API key 관리(`setApiKey()`/`getApiKey()`)는 기존 경로 그대로 유지. R3-9의 re-encrypt 통합은 호출자 레벨에서 수행

### R4. IAsyncStatusTracker 확장 구현

- **R4-1.** `AsyncTrackingResult.state` 확장: 기존 4종 + `'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'SETTLED' | 'EXPIRED'`
- **R4-2.** `AsyncPollingService` 쿼리 확장: off-chain action 상태 추적은 기존 `bridge_status`/`bridge_metadata` 컬럼을 `tracking_status`/`tracking_metadata`로 리네임하여 사용 (별도 테이블 없음). 브릿지 상태 추적도 tracking의 일종이므로 범용 이름이 적절. tracking 있는 off-chain action은 `tracking_status = 'PENDING'`, tracking 없는 action은 `tracking_status = NULL` (폴링 대상 제외). 리네임은 R9 v56 마이그레이션에서 수행. **폴링 호환**: 기존 브릿지 폴링 조건(`bridge_status = 'PENDING'`)이 `tracking_status = 'PENDING'`으로 변경되므로, 기존 브릿지 레코드도 동일 조건으로 폴링됨 — side effect 없음
- **R4-3.** `ExternalActionTracker` 구현: `IAsyncStatusTracker` 구현체. venue별 상태 확인 로직을 ActionProvider에 위임
- **R4-4.** `IActionProvider`에 선택적 메서드 2종 추가:
  - `checkStatus()`: off-chain action의 상태 폴링을 provider가 구현
  - `execute()`: SignedHttpAction 파이프라인에서 서명 결과를 받아 실제 HTTP 발송을 수행하는 콜백. 파이프라인은 서명 오케스트레이션만 담당하고, HTTP 발송의 성공/실패/재시도 책임은 provider에 위임 (R6-3 참조)
  ```ts
  interface IActionProvider {
    // 기존
    resolve(...): Promise<...>;
    // 신규 (선택적)
    checkStatus?(actionId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult>;
    execute?(signedAction: SignedActionResult): Promise<ExecuteResult>;
  }
  ```
- **R4-5.** EventBus 이벤트: `action:status-changed`, `action:completed`, `action:failed`
- **R4-6.** 알림 이벤트 6종: `external_action_partially_filled`, `external_action_filled`, `external_action_settled`, `external_action_canceled` (high), `external_action_expired`, `external_action_failed` (high). 기존 NotificationService 채널 활용

### R5. 정책 컨텍스트 확장 구현

- **R5-1.** `TransactionParam` 확장: `venue?`, `actionCategory?` ('trade'|'withdraw'|'transfer'|'sign'|'deposit'), `notionalUsd?`, `leverage?`, `expiry?`, `hasWithdrawCapability?` 필드 추가
- **R5-2.** `DatabasePolicyEngine.evaluateAction()` 확장: venue 화이트리스트 체크, actionCategory 한도 체크
- **R5-3.** venue 화이트리스트: `VENUE_WHITELIST` Admin Setting (기존 `CONTRACT_WHITELIST` 패턴). `policy.venue_whitelist_enabled` (기본값 false) 비활성 가능. 활성 시 미등록 venue는 default-deny (CLAUDE.md 규칙). contractCall (venue 없음)은 항상 통과
- **R5-4.** `ACTION_CATEGORY_LIMIT` 정책: 카테고리별 USD 한도 (daily_limit_usd, monthly_limit_usd, per_action_limit_usd 중 최소 1개 필수). `tier_on_exceed` (기본 DELAY). `SPENDING_LIMIT`과 완전 독립 — on-chain(amount) vs off-chain(notionalUsd), 이중 차감 없음. notionalUsd는 metadata JSON에 저장, `json_extract()`로 누적 합산 쿼리
- **R5-5.** 기존 `SPENDING_LIMIT` / `provider-trust` 정책과의 공존: off-chain action에도 기존 정책 평가 적용
- **R5-6.** `ActionDefinition.riskLevel` 추가: `'low'|'medium'|'high'|'critical'` 4등급 → defaultTier 자동 매핑 (low→INSTANT, medium→NOTIFY, high→DELAY, critical→APPROVAL). 미설정 시 기존 동작 유지 (INSTANT). **평가 우선순위**: `명시적 정책 규칙 tier` > `provider-trust defaultTier` > `riskLevel defaultTier` > `INSTANT`. provider-trust가 이미 설정된 provider의 action은 riskLevel 기본값을 무시한다

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
- **R6-3.** `executeSignedHttpAction()` 파이프라인: R6-2와 유사, ERC-8128 서명 경로 사용. **파이프라인은 서명만 수행하고 HTTP 발송(fetch)은 수행하지 않음**. 실제 실행 흐름: ActionProvider의 `resolve()`가 SignedHttpAction을 반환 → 파이프라인이 서명 → **서명 결과를 ActionProvider의 `execute()` 콜백에 전달** (R4-4에서 정의한 `IActionProvider.execute()`) → ActionProvider가 서명된 HTTP 요청을 발송하고 결과 반환. `execute()` 미구현 시 서명 결과(`signature`, `signedPayload`)를 API 응답에 포함하여 반환하고 발송하지 않음 — 클라이언트(SDK/MCP)가 서명된 데이터를 받아 직접 외부 서비스에 제출 가능 (sign-only 패턴과 동일). 이 경우 DB에는 `tracking_status = NULL`로 저장(폴링 대상 제외). HTTP 발송의 성공/실패/재시도 책임은 ActionProvider에 있으며, 파이프라인은 서명 오케스트레이션만 담당 (관심사 분리)
- **R6-4.** REST API: 기존 `POST /v1/actions/:provider/:action` 경로 유지. off-chain action도 같은 엔드포인트에서 처리 (provider의 resolve() 결과에 따라 자동 분기)
- **R6-5.** 감사 로그: `ACTION_SIGNED` (off-chain signing), `ACTION_HTTP_SIGNED` (signed HTTP)
- **R6-6.** 키 해제: 서명 후 즉시 `keyStore.releaseKey()` (sign-only 패턴)
- **R6-7.** connect-info 확장: `capabilities.externalActions: true`, `capabilities.signing: [7 schemes]`, `capabilities.supportedVenues: [...]`

### R7. External Action 조회 API

- **R7-1.** `GET /v1/wallets/:id/actions` — off-chain action 목록 조회 (페이지네이션, 필터: venue, status)
- **R7-2.** `GET /v1/wallets/:id/actions/:actionId` — 상세 조회 (요청/응답 payload, 상태 이력)
- **R7-3.** DB 저장: 기존 `transactions` 테이블에 컬럼 확장 (별도 테이블 아님). 스키마 변경 상세는 R9-2 참조. actionKind/venue 필터로 off-chain action 조회

### R8. 에러 코드

- **R8-1.** `CREDENTIAL_NOT_FOUND` — credentialRef에 해당하는 credential이 CredentialVault/SettingsService 모두에 없음 (404)
- **R8-2.** `CREDENTIAL_EXPIRED` — credential이 만료됨 (400)
- **R8-3.** `SIGNING_SCHEME_UNSUPPORTED` — 요청한 signingScheme을 지원하지 않음 (400)
- **R8-4.** `CAPABILITY_NOT_FOUND` — 미등록 signingScheme에 대한 SignerCapability 없음 (400)
- **R8-5.** `VENUE_NOT_ALLOWED` — venue가 VENUE_WHITELIST에 없음 (403)
- **R8-6.** `EXTERNAL_ACTION_FAILED` — off-chain action 실행 실패 (500)
- **R8-7.** 기존 에러 코드 재사용: `POLICY_DENIED`, `INVALID_REQUEST`, `UNAUTHORIZED`, `ACTION_VALIDATION_FAILED`

### R9. DB 마이그레이션 (v55 → v56)

- **R9-1.** **v55**: `wallet_credentials` 테이블 생성 (D3 CredentialVault). 유니크 인덱스: `(wallet_id, name) WHERE wallet_id IS NOT NULL` + `(name) WHERE wallet_id IS NULL`. expires_at 부분 인덱스
- **R9-2.** **v56**: `transactions` 테이블 변경:
  - 컬럼 리네임: `bridge_status` → `tracking_status`, `bridge_metadata` → `tracking_metadata` (브릿지/off-chain 범용 추적 컬럼)
  - 컬럼 추가: `action_kind` (TEXT NOT NULL DEFAULT 'contractCall'), `venue` (TEXT), `operation` (TEXT), `external_id` (TEXT)
  - 단일 인덱스: action_kind, venue, external_id(부분)
  - 복합 인덱스: `(action_kind, tracking_status) WHERE tracking_status IS NOT NULL` — off-chain action 폴링 최적화
  - 기존 코드에서 `bridge_status`/`bridge_metadata` 참조를 `tracking_status`/`tracking_metadata`로 일괄 변경. **리네임 영향 범위**: `packages/actions/src/bridges/` (LI.FI, Across), `packages/daemon/src/services/async-polling-service.ts`, `packages/daemon/src/infrastructure/database/schema.ts`, `packages/daemon/src/pipeline/` (6-stage), `packages/daemon/src/api/routes/` (transactions 조회), 테스트 파일. Drizzle 스키마 컬럼명 + TypeScript 필드명 + SQL 쿼리 모두 변경 대상
- **R9-3.** 마이그레이션 테스트: 스키마 스냅샷 + 데이터 변환 테스트 (CLAUDE.md 규칙). 기존 레코드는 `action_kind DEFAULT 'contractCall'`로 자동 호환

### R10. Admin UI

- **R10-1.** Credentials 설정: per-wallet 탭 (`/wallets/:id` Credentials 탭) + 글로벌 페이지 (`/admin/credentials`). 등록 모달: Type(5종), Name, Value(password input), Metadata(JSON), ExpiresAt. 삭제: 이름 타이핑 확인 + masterAuth. 로테이션: 새 값 입력 + masterAuth. 원문 비노출
- **R10-2.** External Actions 탭: 지갑 상세에 off-chain action 이력 표시 (venue, operation, status, createdAt)
- **R10-3.** 정책 설정: Venue Whitelist 설정 UI (기존 CONTRACT_WHITELIST UI 패턴), ACTION_CATEGORY_LIMIT 정책 설정 UI (카테고리별 USD 한도 등록/수정/삭제)

### R11. MCP + SDK

- **R11-1.** MCP: 기존 action 실행 도구가 off-chain action도 자동 지원 (provider의 resolve() 결과에 따라 분기)
- **R11-2.** MCP 도구: `action-list-offchain` — off-chain action 이력 조회
- **R11-3.** MCP 도구: `credential-list` (sessionAuth) — 에이전트가 사용 가능한 credential 목록 확인용. credential 쓰기 도구(create/delete/rotate)는 MCP에 노출하지 않음 — masterAuth가 필요하며, 스킬 보안 규칙("AI agents must NEVER request the master password")과 충돌하므로 **Admin UI 또는 REST API로만 관리**
- **R11-4.** SDK 메서드: `listOffchainActions()`, `getActionResult()` 추가
- **R11-5.** SDK 메서드: `listCredentials()` (sessionAuth) 추가. 쓰기 메서드(`createCredential()`, `deleteCredential()`, `rotateCredential()`)는 AdminClient에 추가 (masterAuth 전용)
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
| CredentialVault | **신규 도입** — per-wallet CredentialVault | SettingsService는 글로벌(Admin-only). per-wallet credential을 Owner가 사전 등록(masterAuth)하고, 에이전트가 sessionAuth로 목록 조회 + 파이프라인에서 간접 사용 |
| CredentialVault 암호화 | **재사용** — settings-crypto.ts | AES-256-GCM + HKDF 인프라가 이미 존재. 별도 암호화 스택 불필요 |
| 별도 async tracker | **확장** — IAsyncStatusTracker 상태 enum 확장 | AsyncPollingService가 이미 범용 인터페이스 |
| 별도 policy engine | **확장** — TransactionParam 필드 확장 | DatabasePolicyEngine이 이미 actionProvider/actionName 기반 정책 보유 |

### D2. 기존 파이프라인 무변경 원칙

기존 6-stage, sign-only, sign-message 파이프라인을 수정하지 않는다. off-chain action은 별도 파이프라인(`executeSignedDataAction`, `executeSignedHttpAction`)으로 구현한다. ISignerCapability 래퍼는 기존 함수를 감싸는 어댑터이며, 기존 호출 경로를 변경하지 않는다.

### D3. 하위 호환: kind 필드 부재 = ContractCallRequest

기존 13개 ActionProvider가 반환하는 `ContractCallRequest`/`ApiDirectResult`에는 `kind` 필드가 없다. ActionProviderRegistry에서 `kind` 필드 유무로 판별한다:
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
| `packages/sdk/src/` | listExternalActions(), getExternalAction() 메서드, AdminClient: createCredential(), deleteCredential(), rotateCredential() |
| `packages/actions/src/bridges/` | LI.FI, Across 등 bridge provider — bridge_status/bridge_metadata → tracking_status/tracking_metadata 리네임 |
| `skills/` | external-actions.skill.md (신규), transactions/policies/admin 업데이트 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| 특정 off-chain ActionProvider 구현 (CoW, Hyperliquid, Binance 등) | 프레임워크 코어 구현이 선행 | 이후 마일스톤에서 개별 provider 추가 |
| 기존 13개 ActionProvider 수정 | 하위 호환 (kind 없음 = ContractCallRequest) | 기존 코드 무변경 |
| 기존 sign-message/sign-only/ERC-8128 파이프라인 수정 | 기존 호출 경로 유지 | ISignerCapability는 새 파이프라인에서만 사용 |
| OAuth 2.0 flow | credential 저장/관리만 범위 내 | off-chain provider 구현 시 필요하면 추가 |
| credential 자동 로테이션 | 초기 scope 과다 | rotate API로 수동 로테이션 |
| SettingsService per-wallet 확장 | 글로벌 설정과 지갑별 credential 혼재 | 별도 CredentialVault 도입 |
| 별도 VenueProvider 추상화 | ActionProvider와 역할 중복 | ActionProvider.resolve() 반환 타입 확장 |
