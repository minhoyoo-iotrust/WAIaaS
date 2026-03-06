# 마일스톤 m31-02: UserOp Build/Sign API (플랫폼 대납 지원)

- **Status:** PLANNED
- **Milestone:** v31.2

## 목표

Smart Account 지갑에서 프로바이더(Bundler/Paymaster) 없이도 UserOperation을 구성하고 서명할 수 있는 API를 제공하여, 외부 플랫폼이 가스 대납(Gas Sponsorship)을 중계하는 아키텍처를 지원한다.

WAIaaS는 **UserOp 구성기 + 서명기** 역할만 담당하고, 플랫폼 백엔드와의 통신은 에이전트가 직접 수행한다.

---

## 배경

### 현재 상태

WAIaaS의 ERC-4337 Smart Account(v30.6~v30.9)는 per-wallet 프로바이더 모델로 동작한다:
- 지갑 생성 시 `aaProvider` (pimlico/alchemy/custom) 지정 **필수**
- Stage 5에서 WAIaaS가 Bundler/Paymaster에 **직접** 통신하여 UserOp 제출
- 프로바이더 미설정 시 Smart Account 생성 자체가 차단됨 (`wallets.ts:465-470`)

### 문제

플랫폼이 Alchemy Gas Manager 등을 통해 가스 대납을 중계하는 구조에서는, 에이전트/WAIaaS가 Alchemy에 직접 접근할 필요가 없다. 현재 구조는 이 패턴을 지원하지 않는다:

```
현재: WAIaaS ──── Alchemy (직접 통신, API Key 필수)

목표: Agent ──── WAIaaS (UserOp 구성/서명)
       |
       └──── Platform Backend ──── Alchemy (대납 중계)
```

### 플랫폼 대납 흐름

```
Agent              WAIaaS Daemon         Platform Backend      Alchemy
  |                     |                      |                  |
  |-- 1. buildUserOp -->|                      |                  |
  |                     | callData 인코딩       |                  |
  |                     | nonce 조회 (RPC)      |                  |
  |<-- unsigned UserOp -|                      |                  |
  |                     |                      |                  |
  |-- 2. sponsor ------>|                      |                  |
  |                     |                      |-- paymaster --->|
  |<-- sponsored UserOp ----------------------|<-- gas+pm data -|
  |                     |                      |                  |
  |-- 3. signUserOp --->|                      |                  |
  |                     | 정책 평가 + EOA 서명   |                  |
  |<-- signed UserOp ---|                      |                  |
  |                     |                      |                  |
  |-- 4. submit ------->|                      |                  |
  |                     |                      |-- sendUserOp -->|
  |<-- txHash ----------|----------------------|<-- hash --------|
```

WAIaaS는 Step 1(구성)과 Step 3(서명)만 담당. Alchemy/플랫폼 존재를 모른다.

---

## 요구사항

### R1. Smart Account 프로바이더 선택화

- **R1-1.** Smart Account 지갑 생성 시 `aaProvider` 필수 검증 제거. 프로바이더 없이도 Smart Account 생성 허용
- **R1-2.** 프로바이더 미설정 Smart Account = **Lite 모드**: `userop/build` + `userop/sign` API만 사용 가능
- **R1-3.** 프로바이더 설정 Smart Account = **Full 모드**: 기존 전체 AA 기능 + UserOp Build/Sign API 모두 사용 가능
- **R1-4.** Lite 모드에서 `POST /v1/transactions/send` 호출 시 Stage 5에서 `CHAIN_ERROR` (기존 `resolveWalletBundlerUrl()` 동작 유지). 에러 메시지에 `userop/build` + `userop/sign` API 안내 포함
- **R1-5.** `PUT /v1/wallets/:id/provider`로 나중에 프로바이더를 추가하면 Full 모드로 전환 (기존 동작 유지)

### R2. UserOp Build API

- **R2-1.** `POST /v1/wallets/:id/userop/build` — unsigned UserOp 구성 (sessionAuth + masterAuth)
- **R2-2.** 요청 바디: 기존 `TransactionRequest` 스키마 재사용 (TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH)
- **R2-3.** 응답 필드: `sender`, `nonce`, `callData`, `factory` (미배포 시), `factoryData` (미배포 시), `entryPoint`, `buildId` (callData 무결성 검증용 UUID v7)
- **R2-4.** `buildUserOpCalls()` (stages.ts:1092) 재사용하여 request → calls 변환
- **R2-5.** `SmartAccount.encodeCalls(calls)` → 최종 callData 인코딩
- **R2-6.** EntryPoint RPC로 nonce 조회 (일반 RPC, Bundler 불필요)
- **R2-7.** 미배포 상태(`deployed === false`) 시 factory/factoryData 자동 포함 (viem `toSoladySmartAccount`의 lazy deployment)
- **R2-8.** `deployed` 상태 자동 감지: build 호출 시 `getCode(sender)` 확인 → 코드 존재하면 `deployed = true`로 DB 업데이트
- **R2-9.** `buildId` + `callData` + `walletId`를 DB에 저장 (sign 시 무결성 검증용, R3-4 참조)
- **R2-10.** EVM 체인만 지원. Solana Smart Account는 해당 없음 — Solana 지갑에서 호출 시 `ACTION_VALIDATION_FAILED`
- **R2-11.** gas/paymaster 필드는 포함하지 않음 — 에이전트가 외부에서 채워옴

### R3. UserOp Sign API

- **R3-1.** `POST /v1/wallets/:id/userop/sign` — sponsored UserOp 서명 (sessionAuth + masterAuth)
- **R3-2.** 요청 바디: 플랫폼에서 받은 완전한 UserOp (gas + paymaster 필드 포함)
  ```json
  {
    "buildId": "uuid-v7",
    "userOperation": {
      "sender": "0x...",
      "nonce": "0x...",
      "callData": "0x...",
      "callGasLimit": "0x...",
      "verificationGasLimit": "0x...",
      "preVerificationGas": "0x...",
      "maxFeePerGas": "0x...",
      "maxPriorityFeePerGas": "0x...",
      "paymaster": "0x...",
      "paymasterData": "0x...",
      "paymasterVerificationGasLimit": "0x...",
      "paymasterPostOpGasLimit": "0x..."
    }
  }
  ```
- **R3-3.** 응답 필드: `signedUserOperation` (signature 필드 추가된 완전한 UserOp), `txId` (UUID v7, 트랜잭션 기록)
- **R3-4.** callData 무결성 이중 검증:
  - **검증 A (DB 비교)**: `buildId`로 DB에서 저장된 callData 조회 → 요청의 callData와 일치 확인. 불일치 시 `CALLDATA_MISMATCH` 에러
  - **검증 B (정책 재평가)**: callData를 다시 파싱하여 정책 엔진 평가 (sign-only.ts 패턴). 정책 위반 시 `POLICY_DENIED` 에러
- **R3-5.** sender 필드가 지갑의 Smart Account 주소와 일치하는지 검증
- **R3-6.** 정책 평가: sign-only 파이프라인과 동일 패턴 (INSTANT tier만 허용, DELAY/APPROVAL tier는 거부)
- **R3-7.** EOA signer로 `smartAccount.signUserOperation(fullUserOp)` 실행 → signature 생성
- **R3-8.** 서명 후 키 즉시 해제 (`keyStore.releaseKey()`, sign-only.ts 패턴)
- **R3-9.** DB에 트랜잭션 기록: type='SIGN', status='SIGNED' (sign-only와 동일)
- **R3-10.** 감사 로그: `USEROP_SIGNED` 이벤트 기록

### R4. Build 데이터 관리

- **R4-1.** DB 테이블 `userop_builds`: `buildId` (PK), `walletId`, `callData`, `sender`, `nonce`, `createdAt`, `expiresAt`, `used` (boolean)
- **R4-2.** build 데이터 TTL: 기본 10분 (만료된 buildId로 sign 시도 시 `EXPIRED_BUILD` 에러)
- **R4-3.** sign 성공 시 `used = true`로 업데이트 (동일 buildId 재사용 방지)
- **R4-4.** 만료된 build 레코드 주기적 정리 (기존 cleanup 패턴 활용)

### R5. connect-info capability

- **R5-1.** Smart Account 지갑이 존재하면 (프로바이더 유무 무관) `userop` capability 추가
- **R5-2.** 기존 `smart_account` capability는 프로바이더가 설정된 경우에만 노출 (기존 동작 유지)

### R6. Zod 스키마

- **R6-1.** `UserOpBuildRequestSchema` — 기존 `TransactionRequest` 재사용 + network 필수
- **R6-2.** `UserOpBuildResponseSchema` — sender, nonce, callData, factory?, factoryData?, entryPoint, buildId
- **R6-3.** `UserOpSignRequestSchema` — buildId + userOperation (EntryPoint v0.7 필드)
- **R6-4.** `UserOpSignResponseSchema` — signedUserOperation + txId
- **R6-5.** `UserOperationV07Schema` — EntryPoint v0.7 UserOp 필드 정의

### R7. 에러 코드

- **R7-1.** `EXPIRED_BUILD` — buildId가 만료되었을 때 (400)
- **R7-2.** `BUILD_NOT_FOUND` — buildId가 존재하지 않을 때 (404)
- **R7-3.** `BUILD_ALREADY_USED` — 이미 서명된 buildId로 재시도 시 (409)
- **R7-4.** `CALLDATA_MISMATCH` — sign 요청의 callData가 build 시 저장된 것과 불일치 (400)
- **R7-5.** `SENDER_MISMATCH` — UserOp의 sender가 지갑 주소와 불일치 (400)
- **R7-6.** 기존 에러 코드 재사용: `CHAIN_ERROR` (프로바이더 미설정 시 send 차단), `POLICY_DENIED` (정책 위반), `INVALID_TRANSACTION` (파싱 실패)

### R8. DB 마이그레이션

- **R8-1.** v44 마이그레이션 (또는 현재 다음 버전): `userop_builds` 테이블 생성
- **R8-2.** 마이그레이션 테스트: 스키마 스냅샷 + 빈 테이블 생성 검증 (CLAUDE.md 규칙 준수)

### R9. 알림 + 감사 로그

- **R9-1.** `userop/build` 호출 시 `USEROP_BUILD` 감사 로그
- **R9-2.** `userop/sign` 성공 시 `USEROP_SIGNED` 감사 로그
- **R9-3.** 알림: `TX_REQUESTED` (build 시), `TX_SUBMITTED` (sign 완료 시, signOnly=true)
- **R9-4.** EventBus: `wallet:activity` 이벤트 (sign-only 패턴 동일)

### R10. Admin UI

- **R10-1.** 지갑 생성 폼: 프로바이더 드롭다운에 `None (Lite mode)` 옵션 추가. `None` 선택 시 API Key/Bundler URL 입력 필드 숨김
- **R10-2.** 지갑 상세 페이지: Smart Account 섹션에 Mode 행 추가
  - Lite 모드: `[Lite]` 배지 + 안내 텍스트 "This wallet can build and sign UserOperations for platform-sponsored transactions. Add a provider to enable direct transaction submission."
  - Full 모드: `[Full]` 배지
- **R10-3.** 지갑 목록: Smart Account 배지에 모드 구분 표시 (`[Smart Account - Lite]` / `[Smart Account - Full]`)
- **R10-4.** Provider 편집 UI: 변경 없음 (기존 Change Provider 버튼으로 Lite → Full 전환 가능)

### R11. 스킬 파일

- **R11-1.** `skills/transactions.skill.md` — UserOp Build/Sign API 추가
- **R11-2.** `skills/wallet.skill.md` — Lite/Full 모드 설명, 프로바이더 없이 Smart Account 생성 안내
- **R11-3.** `skills/admin.skill.md` — Smart Account Lite 모드 관련 설정 안내

### R12. MCP + SDK

- **R12-1.** MCP 도구: `build_userop`, `sign_userop`
- **R12-2.** SDK 메서드: `buildUserOp()`, `signUserOp()`

---

## 설계 결정

### D1. Lite/Full 모드 분리

Smart Account 지갑을 프로바이더 유무에 따라 2가지 모드로 운영한다:

| | Lite 모드 (프로바이더 없음) | Full 모드 (프로바이더 있음) |
|---|---|---|
| 지갑 생성 | 허용 (CREATE2 주소 예측) | 허용 |
| userop/build | 사용 가능 | 사용 가능 |
| userop/sign | 사용 가능 | 사용 가능 |
| POST /transactions/send | 차단 (CHAIN_ERROR) | 사용 가능 |
| 컨트랙트 배포 | 첫 UserOp에 factory 포함 | 자동 (Bundler 경유) |

프로바이더는 나중에 `PUT /v1/wallets/:id/provider`로 추가하여 Full 모드로 전환 가능.

### D2. callData 변조 방지 이중 검증

sign 요청에서 에이전트가 callData를 바꿔치기하면 임의 컨트랙트 호출이 가능하므로 2중 방어:

- **검증 A (DB 비교)**: build 시 발급한 `buildId`에 callData를 저장. sign 시 DB에서 조회하여 바이트 단위 일치 확인. 변조 시 `CALLDATA_MISMATCH`.
- **검증 B (정책 재평가)**: callData를 파싱하여 정책 엔진 평가 (sign-only.ts가 이미 하는 방식). 검증 A를 우회하더라도 정책에서 차단.

둘 다 적용하는 이유: 검증 A만으로는 build 시점의 정책과 sign 시점의 정책이 다를 수 있고, 검증 B만으로는 build에서 승인된 것과 다른 callData를 서명하는 것을 막지 못한다.

### D3. deployed 상태 자동 감지

Lite 모드에서는 WAIaaS가 트랜잭션 제출/receipt을 모르므로 deployed 상태를 직접 추적할 수 없다. 대신 `userop/build` 호출 시 `getCode(sender)` RPC 호출로 온체인 배포 상태를 확인한다:

- `getCode()` 반환값이 `'0x'`가 아니면 → `deployed = true`로 DB 업데이트
- 일반 RPC 호출이므로 Bundler/Paymaster 불필요
- 추가 API(confirm 등) 없이 자연스럽게 상태 동기화

### D4. EntryPoint v0.7 전용

WAIaaS의 SmartAccountService는 EntryPoint v0.7만 지원한다 (v0.6 미지원). UserOp 스키마도 v0.7 포맷만 정의한다:
- `paymaster` + `paymasterData` 분리 (v0.6의 `paymasterAndData` 아님)
- `paymasterVerificationGasLimit` + `paymasterPostOpGasLimit` 필드

분석 문서(alchemy-gas-manager-analysis.md)에서 v0.6 예시가 있으나, WAIaaS는 v0.7로 통일.

### D5. build 데이터 TTL

build에서 sign까지의 시간 간격을 제한한다 (기본 10분). 이유:
- 오래된 nonce는 무효화될 수 있음
- 장기간 미사용 buildId 축적 방지
- 보안: callData가 DB에 남는 시간 최소화

### D6. sign-only 파이프라인 패턴 재사용

`userop/sign`은 기존 `sign-only.ts`의 10단계 파이프라인과 동일한 패턴을 따른다:
1. 파싱 → 2. 정책 파라미터 변환 → 3. ID 생성 → 4. DB INSERT → 5. 정책 평가 → 6. 허용 확인 → 7. tier 확인 (INSTANT만) → 8. 서명 → 9. DB 업데이트 → 10. 결과 반환

차이점: Step 1에서 raw tx 대신 UserOp의 callData를 파싱하고, Step 8에서 `adapter.signExternalTransaction()` 대신 `smartAccount.signUserOperation()`을 사용한다.

### D7. EVM 전용

UserOp Build/Sign API는 EVM 체인 전용이다. Solana에는 Account Abstraction 개념이 없으므로 Solana 지갑에서 호출 시 `ACTION_VALIDATION_FAILED`를 반환한다.

### D8. Admin UI Lite/Full 모드 표시

Admin UI에서 Smart Account의 모드를 직관적으로 표시한다:

- **지갑 생성 폼**: 프로바이더 드롭다운에 `None (Lite mode)` 옵션을 추가. 선택 시 API Key/URL 입력 필드를 숨겨 불필요한 입력 제거
- **지갑 상세**: Mode 행에 `[Lite]` / `[Full]` 배지 표시. Lite 모드일 때 안내 텍스트로 userop API 사용과 프로바이더 추가 방법 안내
- **지갑 목록**: `[Smart Account - Lite]` / `[Smart Account - Full]` 배지로 모드 구분. 한눈에 어떤 지갑이 프로바이더 없이 운영되는지 파악 가능

Provider 편집 UI는 변경 없이 기존 Change Provider 버튼으로 Lite → Full 전환을 자연스럽게 지원한다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/core/src/schemas/` | UserOp Build/Sign 요청/응답 Zod 스키마, UserOperationV07Schema |
| `packages/core/src/errors/error-codes.ts` | EXPIRED_BUILD, BUILD_NOT_FOUND, BUILD_ALREADY_USED, CALLDATA_MISMATCH, SENDER_MISMATCH |
| `packages/daemon/src/api/routes/wallets.ts` | aaProvider 필수 검증 제거 (L465-470), 에러 메시지 개선 |
| `packages/daemon/src/api/routes/` | userop build/sign 라우트 추가 |
| `packages/daemon/src/api/routes/connect-info.ts` | `userop` capability 추가 |
| `packages/daemon/src/pipeline/` | userop-sign 파이프라인 (sign-only.ts 패턴) |
| `packages/daemon/src/infrastructure/database/schema.ts` | userop_builds 테이블 |
| `packages/daemon/src/infrastructure/database/migrate.ts` | v44 마이그레이션 |
| `packages/daemon/src/infrastructure/smart-account/` | buildPartialUserOp 로직, deployed getCode 감지 |
| `packages/admin/src/pages/wallets.tsx` | 생성 폼 None 옵션, 상세 Mode 배지, 목록 Lite/Full 배지 |
| `packages/mcp/src/tools/` | build_userop, sign_userop 도구 |
| `packages/sdk/src/` | buildUserOp(), signUserOp() 메서드 |
| `skills/` | transactions.skill.md, wallet.skill.md, admin.skill.md 업데이트 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| 플랫폼 백엔드 연동/통신 | WAIaaS는 UserOp 구성/서명만 담당, 플랫폼 통신은 에이전트 책임 | 에이전트가 직접 플랫폼 API 호출 |
| Alchemy Admin API (Policy CRUD) | WAIaaS가 Alchemy를 모르는 것이 설계 의도 | 플랫폼 또는 Alchemy 대시보드에서 관리 |
| Gas 대납 비용 추적/집계 | WAIaaS가 receipt을 모름 (Lite 모드) | 플랫폼 백엔드에서 추적 |
| Webhook 엔드포인트 | 플랫폼이 Alchemy webhook 수신 | 플랫폼 백엔드에서 구현 |
| UserOp 제출 (submit) API | WAIaaS가 Bundler에 제출하지 않음 (Lite 모드) | 에이전트 → 플랫폼 → Bundler |
| EntryPoint v0.6 지원 | WAIaaS는 v0.7 전용 | 필요 시 별도 마일스톤 |
