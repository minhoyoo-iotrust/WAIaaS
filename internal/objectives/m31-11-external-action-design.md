# 마일스톤 m31-11: External Action 프레임워크 설계

- **Status:** SHIPPED
- **Milestone:** v31.11
- **Completed:** 2026-03-11

## 목표

WAIaaS를 on-chain tx-centric 모델에서 **action-centric 모델**로 확장하기 위한 설계를 수행한다. 에이전트가 on-chain contract call뿐 아니라, EIP-712 off-chain order, HMAC/RSA signed HTTP request, credential 기반 external venue action을 WAIaaS의 키/정책/추적 인프라 위에서 실행할 수 있도록 **기존 ActionProvider 프레임워크를 확장**한다.

> **참조**: GitHub Issue #158 (CLOSED) — external signed action 지원을 위한 `ExternalActionRequest` / signer capability 확장 제안. 이슈의 핵심 제안(ResolvedAction union, signer capability, credential vault, async tracking 일반화, venue-aware policy)이 본 마일스톤의 요구사항 R1~R6으로 반영됨.

---

## 배경

### 현재 상태

WAIaaS의 ActionProvider 프레임워크(v1.5~)는 이미 "외부 의도 → WAIaaS 파이프라인 번역" 패턴을 갖추고 있다:

- **`IActionProvider.resolve()`**: action 파라미터를 `ContractCallRequest`로 변환
- **`ActionProviderRegistry`**: provider 등록/조회, `ContractCallRequestSchema.parse()` 재검증
- **`ActionDefinition`**: action별 `riskLevel`, `defaultTier` 정책 메타데이터
- **`ActionProviderMetadata`**: `requiresApiKey`, `requiredApis` credential 요구사항
- **`SettingsService`**: provider별 API key를 AES-256-GCM 암호화 저장 (`setApiKey()`/`getApiKey()`)
- **`IAsyncStatusTracker` + `AsyncPollingService`**: 비동기 상태 폴링 (브릿지, 가스 조건 등)
- **`DatabasePolicyEngine`**: `actionProvider`/`actionName` 기반 provider-trust 정책 우회

또한 서명 역량도 이미 4종이 분산 구현되어 있다:

| 서명 방식 | 현재 위치 | 비고 |
|----------|----------|------|
| signTransaction | `IChainAdapter.signTransaction()` | 6-stage pipeline |
| signTypedData (EIP-712) | `sign-message.ts` pipeline | personal/typedData 분기 |
| signMessage (personal) | `sign-message.ts` pipeline | EVM + Solana |
| signHttpRequest (ERC-8128) | `http-message-signer.ts` | 독립 모듈, 파이프라인 미통합 |

### 문제

**`IActionProvider.resolve()`의 반환 타입이 `ContractCallRequest`로 고정**되어 있어 on-chain tx만 표현 가능하다. 실제 에이전트는 다음도 수행해야 한다:

| 유스케이스 | 서명 방식 | 현재 지원 |
|-----------|----------|----------|
| DEX swap (on-chain) | signTransaction | 지원 (6-stage pipeline) |
| CoW Protocol off-chain order | EIP-712 signTypedData | sign-message로 서명만 가능, 주문 추적 불가 |
| CEX API 호출 (Binance 등) | HMAC-SHA256 | 미지원 |
| Signed HTTP request | RSA-PSS / ECDSA | ERC-8128 모듈만, 정책 미통합 |
| 크로스체인 메시지 서명 | signBytes (arbitrary) | 미지원 |

**결론**: 새 추상화(VenueProvider)를 도입할 것이 아니라, **기존 ActionProvider의 resolve() 반환 타입을 확장**하고, 분산된 서명 역량을 통합 인터페이스로 묶고, 기존 SettingsService/AsyncPollingService를 확장하는 것이 정석이다.

### 목표 아키텍처

```
현재:  ActionProvider.resolve() ──> ContractCallRequest ──> 6-stage pipeline

확장:  ActionProvider.resolve() ──> ResolvedAction        ──> 6-stage pipeline (on-chain)
                                    ├ ContractCallRequest     (기존 경로 유지)
                                    ├ SignedDataAction         ──> sign-message pipeline 확장
                                    └ SignedHttpAction         ──> ERC-8128 pipeline 통합
```

---

## 요구사항

### R1. ResolvedAction 타입 시스템 설계

- **R1-1.** `IActionProvider.resolve()` 반환 타입을 `ContractCallRequest`에서 `ResolvedAction`으로 확장
  ```ts
  type ResolvedAction =
    | ContractCallRequest      // 기존 on-chain tx (하위 호환)
    | SignedDataAction          // EIP-712, HMAC, RSA 등 off-chain signing
    | SignedHttpAction          // signed HTTP request (ERC-8128 통합)
  ```
- **R1-2.** `SignedDataAction` 설계: `kind: 'signedData'`, `signingScheme`, `payload`, `venue`, `operation`, `credentialRef?`, `tracking?`, `policyContext?`
- **R1-3.** `SignedHttpAction` 설계: `kind: 'signedHttp'`, 기존 `SignHttpMessageParams` 통합, `venue`, `operation`, `credentialRef?`
- **R1-4.** 기존 `ContractCallRequest`에 `kind?: 'contractCall'` optional 필드를 추가 (하위 호환). 기존 provider가 kind 없이 반환해도 `ActionProviderRegistry`에서 `kind: 'contractCall'`로 정규화
- **R1-5.** Zod discriminatedUnion 설계: `kind` 필드로 분기 (`contractCall` | `signedData` | `signedHttp`). 정규화 후에는 모든 멤버가 `kind`를 가지므로 정식 `discriminatedUnion` 사용 가능
- **R1-6.** 기존 ActionProvider 구현체(Jupiter, 0x, LI.FI 등)는 변경 없이 동작해야 함 — `ContractCallRequest`를 kind 없이 반환하면 registry가 정규화 후 기존 경로 그대로

### R2. ISignerCapability 통합 인터페이스 설계

- **R2-1.** 기존 4종 signer를 통합하는 `ISignerCapability` 인터페이스 설계
- **R2-2.** `SigningSchemeEnum` 설계: `eip712`, `personal`, `hmac-sha256`, `rsa-pss`, `ecdsa-secp256k1`, `ed25519`, `erc8128`
- **R2-3.** 각 기존 signer를 ISignerCapability 어댑터로 래핑하는 설계:
  - `Eip712SignerCapability` — 기존 sign-message typedData 래핑
  - `PersonalSignCapability` — 기존 sign-message personal 래핑
  - `Erc8128SignerCapability` — 기존 http-message-signer 래핑
  - `HmacSignerCapability` — 신규
  - `RsaPssSignerCapability` — 신규
- **R2-4.** `signBytes()` capability 설계: Ed25519/ECDSA arbitrary bytes signing
- **R2-5.** `SignerCapabilityRegistry` 설계: signingScheme → capability 자동 매핑
- **R2-6.** **기존 sign-message / sign-only / ERC-8128 파이프라인의 기존 호출 경로는 변경하지 않음** — ISignerCapability는 새 ActionProvider 경로에서만 사용

### R3. CredentialVault 설계 (per-wallet credential 관리)

**SettingsService와 CredentialVault를 분리하는 이유:**

SettingsService는 **daemon 글로벌 설정**(Admin-only, masterAuth 필수)이다. 하지만 에이전트가 off-chain action을 수행하려면 **per-wallet 스코프의 credential을 직접 관리**해야 하는 케이스가 있다:
- 에이전트마다 다른 CEX 계정(API key)을 사용
- 지갑별로 다른 HMAC secret/RSA key가 필요
- 에이전트가 런타임에 credential을 등록/교체 (sessionAuth로 CRUD)
- credential의 생명주기가 세션/지갑에 종속

SettingsService를 per-wallet로 확장하면 글로벌 설정과 지갑별 credential이 혼재되어 복잡해진다. 따라서 **별도 CredentialVault를 도입하되, 암호화 인프라는 기존 `settings-crypto.ts`를 재사용**한다.

재사용하는 기존 인프라:
- `encryptSettingValue()` / `decryptSettingValue()` — AES-256-GCM 암호화/복호화
- `deriveSettingsKey()` — HKDF(SHA-256) 마스터 패스워드 → 암호화 키 파생
- `getAllMasked()` 패턴 — credential 값 마스킹 노출

설계 요구사항:

- **R3-1.** `ICredentialVault` 인터페이스 설계: per-wallet credential CRUD (create, get, list, delete, rotate)
- **R3-2.** credential 스코프 모델 설계:
  - **글로벌 credential** (daemon-wide): 기존 SettingsService 유지 (`actions.{provider}_api_key`). Admin이 설정, 모든 지갑이 공유
  - **지갑별 credential** (per-wallet): CredentialVault. 에이전트가 sessionAuth로 관리, 해당 지갑에서만 사용
  - credential 조회 우선순위: per-wallet → 글로벌 fallback
- **R3-3.** credential 타입 설계: `api-key`, `hmac-secret`, `rsa-private-key`, `session-token`, `custom`
- **R3-4.** credential 참조 모델 설계: `credentialRef` (UUID or `{walletId}:{name}`) 기반 간접 참조. 원문 노출 없음
- **R3-5.** DB 스키마 초안: `wallet_credentials` 테이블 (id, walletId, type, name, encryptedValue, metadata, expiresAt, createdAt, updatedAt)
- **R3-6.** credential lifecycle 설계: 생성, 로테이션 (이력 선택적), 만료, 삭제
- **R3-7.** 인증 모델 설계: credential CRUD는 sessionAuth (해당 지갑의 세션) + masterAuth 모두 허용
- **R3-8.** Admin UI credential 관리 UX 설계: 지갑 상세의 Credentials 탭 (목록: type/name/createdAt/expiresAt, 원문 비노출, 등록/삭제/로테이션 버튼)

### R4. IAsyncStatusTracker 일반화 설계

기존 `IAsyncStatusTracker` + `AsyncPollingService`가 이미 갖추고 있는 인프라:
- `checkStatus(txId, metadata)` → `AsyncTrackingResult` (PENDING/COMPLETED/FAILED/TIMEOUT)
- `AsyncPollingService`: tracker 등록, 30초 주기 폴링, maxAttempts 제한, timeout 전이
- `AsyncPollingCallbacks`: 알림 발행, reservation 해제, 파이프라인 재진입
- `BridgeStatusTracker` (LI.FI), `GasConditionTracker` 구현체

확장 설계:

- **R4-1.** `AsyncTrackingResult.state` 확장 설계: 기존 4종 (`PENDING`/`COMPLETED`/`FAILED`/`TIMEOUT`) + off-chain action 상태 (`PARTIALLY_FILLED`/`FILLED`/`CANCELED`/`SETTLED`/`EXPIRED`)
- **R4-2.** `AsyncPollingService` 쿼리 확장 설계: 현재 `transactions` 테이블의 `bridge_status` 컬럼만 조회 → external action 상태도 조회
- **R4-3.** tracker 메타데이터 확장 설계: `venue`, `operation` 등 external action 컨텍스트 전달
- **R4-4.** 상태 저장 위치 설계: 기존 `transactions.bridge_status` 컬럼 패턴 vs 별도 `external_action_status` 컬럼 vs 별도 테이블

### R5. 정책 컨텍스트 확장 설계

기존 정책 인프라:
- `DatabasePolicyEngine`: `actionProvider`/`actionName` 필드로 provider-trust 우회
- `ActionDefinition`: `riskLevel` (low/medium/high), `defaultTier` (INSTANT/NOTIFY/DELAY/APPROVAL)
- `TransactionParam`: `tokenDecimals`, `actionProvider`, `actionName`

확장 설계:

- **R5-1.** `TransactionParam` (또는 새 `ActionPolicyParam`) 확장 설계: `venue`, `actionCategory` (trade/withdraw/transfer/sign), `notionalUsd`, `leverage`, `expiry`, `hasWithdrawCapability`
- **R5-2.** venue 화이트리스트 정책 설계: 기존 `CONTRACT_WHITELIST` 패턴 활용
- **R5-3.** action 카테고리별 한도 설계: `SPENDING_LIMIT` 패턴 확장
- **R5-4.** `ActionDefinition` 확장: off-chain action에 대한 `riskLevel`/`defaultTier` 정의 경로

### R6. ActionProvider resolve() 확장 후 파이프라인 라우팅 설계

- **R6-1.** `ActionProviderRegistry`에서 `resolve()` 결과의 `kind`에 따른 파이프라인 라우팅 설계:
  - `ContractCallRequest` (kind: 'contractCall', 정규화 후) → 기존 6-stage pipeline (무변경)
  - `SignedDataAction` → sign-message pipeline 확장 경로
  - `SignedHttpAction` → ERC-8128 pipeline 통합 경로
- **R6-2.** 정책 평가 시점 설계: resolve() 후, 서명 전에 정책 평가 (기존 패턴 동일)
- **R6-3.** DB 기록 설계: `transactions` 테이블 확장 vs 별도 테이블
- **R6-4.** REST API 엔드포인트 설계: 기존 `POST /v1/actions/:provider/:action` 경로에서 off-chain action도 처리
- **R6-5.** MCP 도구 / SDK 메서드 설계: 기존 action 실행 도구 확장

---

## 설계 산출물

| # | 산출물 | 설명 |
|---|--------|------|
| D1 | ResolvedAction 타입 시스템 | Zod 스키마, discriminatedUnion, 기존 ContractCallRequest 하위 호환 |
| D2 | ISignerCapability 인터페이스 | 기존 4종 signer 통합, 신규 2종 추가, registry 매핑 |
| D3 | CredentialVault + SettingsService 공존 모델 | per-wallet vault (sessionAuth), 글로벌 Settings (masterAuth), 조회 우선순위, 암호화 재사용 |
| D4 | IAsyncStatusTracker 상태 확장 | off-chain 상태 enum, AsyncPollingService 쿼리 확장, 저장 위치 |
| D5 | 정책 컨텍스트 확장 | TransactionParam 확장, venue 화이트리스트, 카테고리 한도 |
| D6 | 파이프라인 라우팅 | resolve() 결과 kind별 분기, 정책 평가 시점, DB 기록 |
| D7 | 설계 문서 doc-81 | External Action 프레임워크 전체 설계 (위 D1~D6 통합) |

---

## 영향 범위

| 영역 | 변경 내용 |
|------|----------|
| `packages/core/src/interfaces/action-provider.types.ts` | `resolve()` 반환 타입 확장, ResolvedAction union |
| `packages/core/src/interfaces/` | ISignerCapability 인터페이스 추가 |
| `packages/core/src/schemas/` | SignedDataAction, SignedHttpAction Zod 스키마 |
| `packages/actions/src/common/async-status-tracker.ts` | 상태 enum 확장 설계 |
| `packages/daemon/src/infrastructure/credential-vault/` | CredentialVault 설계 (settings-crypto.ts 암호화 재사용) |
| `packages/daemon/src/infrastructure/database/schema.ts` | wallet_credentials 테이블 설계 |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | 정책 컨텍스트 확장 설계 |
| `packages/daemon/src/api/routes/actions.ts` | 라우팅 확장 설계 |
| 설계 문서 | doc-81 (External Action 프레임워크 설계) |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| 구현 | m31-11은 설계만 수행 | m31-12에서 구현 |
| 특정 venue provider 구현 (CoW, Binance 등) | 프레임워크 설계가 선행 | 이후 마일스톤에서 ActionProvider 구현체 추가 |
| 기존 6-stage/sign-only/sign-message 파이프라인 리팩토링 | 기존 경로는 안정적 | ISignerCapability는 새 경로에서만 사용 |
| 별도 VenueProvider 추상화 | ActionProvider와 역할 중복 | ActionProvider.resolve() 반환 타입 확장 |
| SettingsService per-wallet 확장 | 글로벌 설정과 지갑별 credential이 혼재되어 복잡 | 별도 CredentialVault 도입 (암호화 인프라만 재사용) |
| 별도 external_actions 테이블 | 기존 transactions 테이블 + AsyncPollingService 활용 가능 | 설계에서 최적 저장 위치 결정 |
