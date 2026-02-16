---
phase: 148-wc-signing
plan: 01
subsystem: daemon/pipeline
tags: [walletconnect, signing, approval, fire-and-forget, di-wiring]
dependency_graph:
  requires: [146-01 WcSessionService, 147-01 REST API/Pairing]
  provides: [WcSigningBridge, stage4Wait WC integration, DI chain]
  affects: [stages.ts, transactions.ts, server.ts, daemon.ts]
tech_stack:
  added: [viem/siwe createSiweMessage (bridge), sodium-native Ed25519 verify (bridge)]
  patterns: [fire-and-forget void prefix, optional DI dependency, BEGIN IMMEDIATE pattern reuse]
key_files:
  created:
    - packages/daemon/src/services/wc-signing-bridge.ts
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
decisions:
  - encodeBase58 인라인 구현 (keystore.ts의 unexported 함수를 재사용 불가하여 동일 알고리즘 복제)
  - WC expiry를 pending_approvals.expires_at에서 동적 계산 (최소 60초 보장)
  - 서명 검증 실패 시 reject 하지 않음 (Owner가 REST API로 재시도 가능)
  - WcSigningBridge를 daemon.ts Step 4c-7로 배치 (WcSessionService + ApprovalWorkflow 이후)
metrics:
  duration: 5min
  completed: 2026-02-16T11:27:25Z
  tasks: 2/2
  files_changed: 8
  tests_passed: 1569
  tests_added: 0
---

# Phase 148 Plan 01: WcSigningBridge + stage4Wait WC 연동 Summary

WcSigningBridge 서비스로 APPROVAL 거래 발생 시 WC 세션 Owner에게 자동 서명 요청 + 응답 검증 후 approve/reject 호출

## What was built

### Task 1: WcSigningBridge 서비스 생성 (9edaa57)

`packages/daemon/src/services/wc-signing-bridge.ts`:

- **requestSignature(walletId, txId, chain)**: 메인 진입점. WC 세션 확인 -> 서명 요청 빌드 -> approval_channel 업데이트 -> WC request 전송 -> 응답 핸들링
- **EVM 분기**: `createSiweMessage()` (viem/siwe)로 SIWE 메시지 구성, `personal_sign` 메서드, 응답 시 `verifySIWE()` 검증 후 `approvalWorkflow.approve()`
- **Solana 분기**: `solana_signMessage` 메서드, base58 인코딩된 메시지, 응답 시 `sodium.crypto_sign_verify_detached()` Ed25519 검증 후 approve
- **타임아웃 동기화**: `pending_approvals.expires_at`에서 WC expiry 동적 계산 (최소 60초, 기본 300초)
- **에러 핸들링**: user rejected (4001/5000) -> `reject()`, expired (8000) -> 무시 (기존 워커 처리), 기타 -> warn 로그만

에러 코드 `WC_SIGNING_FAILED` 추가 (error-codes.ts, en.ts, ko.ts) -- 내부 로깅용.

### Task 2: PipelineContext/stage4Wait WC 연동 + DI 배선 (a1eb63f)

- **PipelineContext**: `wcSigningBridge?: WcSigningBridge` 필드 추가
- **stage4Wait**: APPROVAL 분기에서 `requestApproval()` 직후, `PIPELINE_HALTED` 직전에 `void ctx.wcSigningBridge.requestSignature()` fire-and-forget 호출
- **DI 체인 완성**: daemon.ts (Step 4c-7) -> server.ts (CreateAppDeps) -> transactions.ts (TransactionRouteDeps) -> stages.ts (PipelineContext)
- 기존 REST API 승인 경로에 영향 없음 -- wcSigningBridge는 옵셔널 의존성

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `pnpm build` -- 전체 모노레포 8 패키지 빌드 성공 (FULL TURBO)
2. `pnpm test --filter=@waiaas/daemon` -- 1,569 테스트 전체 통과 (95 파일, 0 실패)
3. `grep wcSigningBridge stages.ts` -- stage4Wait에 WC 연동 확인
4. `grep requestSignature wc-signing-bridge.ts` -- 메서드 존재 확인
5. `grep WC_SIGNING_FAILED error-codes.ts` -- 에러 코드 등록 확인

## Self-Check: PASSED

- [x] packages/daemon/src/services/wc-signing-bridge.ts EXISTS
- [x] Commit 9edaa57 EXISTS
- [x] Commit a1eb63f EXISTS
- [x] WC_SIGNING_FAILED in error-codes.ts, en.ts, ko.ts
- [x] wcSigningBridge in stages.ts, transactions.ts, server.ts, daemon.ts
- [x] 1,569 tests passed, 0 failures
