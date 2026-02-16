---
phase: 148-wc-signing
plan: 02
subsystem: daemon/tests
tags: [walletconnect, signing, unit-test, integration-test, ed25519, siwe, fire-and-forget]
dependency_graph:
  requires: [148-01 WcSigningBridge, 148-01 stage4Wait WC integration]
  provides: [WcSigningBridge test coverage, stage4Wait WC integration tests]
  affects: []
tech_stack:
  added: []
  patterns: [real Ed25519 keypair for Solana tests, createRequire CJS interop in test, vi.mock for ESM modules]
key_files:
  created:
    - packages/daemon/src/__tests__/wc-signing-bridge.test.ts
    - packages/daemon/src/__tests__/wc-approval-integration.test.ts
  modified: []
decisions:
  - sodium-native는 createRequire CJS 로딩이라 vi.mock 불가 -> 실제 Ed25519 키페어 생성하여 Solana 테스트
  - Solana 테스트에 signEd25519 헬퍼로 실제 서명 생성 (mock 없이 실제 crypto_sign_verify_detached 검증)
  - verifySIWE는 ESM import라 vi.mock으로 정상 모킹
metrics:
  duration: 7min
  completed: 2026-02-16T11:37:00Z
  tasks: 2/2
  files_changed: 2
  tests_passed: 1598
  tests_added: 29
---

# Phase 148 Plan 02: WcSigningBridge 단위 테스트 + stage4Wait 통합 테스트 Summary

WcSigningBridge 모든 분기(EVM/Solana, 승인/거부/타임아웃, 세션 유무) 단위 테스트 22개 + stage4Wait fire-and-forget 통합 테스트 7개

## What was built

### Task 1: WcSigningBridge 단위 테스트 (a9dd812)

`packages/daemon/src/__tests__/wc-signing-bridge.test.ts` (699 lines, 22 tests):

- **WC 세션 없음 (3개)**: signClient null / topic null / sessionInfo null -> 조용히 반환, signClient.request 미호출
- **EVM personal_sign (5개)**: personal_sign 메서드 호출, SIWE hex 메시지 포맷 검증, verifySIWE 성공 시 approve, verifySIWE 실패 시 approve/reject 모두 미호출, approval_channel='walletconnect' DB 업데이트
- **Solana solana_signMessage (4개)**: solana_signMessage 메서드, base58 메시지 + pubkey, 실제 Ed25519 서명으로 approve 성공, 틀린 서명으로 approve/reject 미호출
- **Owner 거부 (2개)**: WC error code 4001 -> reject, code 5000 -> reject
- **타임아웃/에러 (3개)**: code 8000(expired) -> reject 미호출, 네트워크 에러 -> reject 미호출, console.warn 로그 확인
- **타임아웃 동기화 (3개)**: pending_approvals.expires_at 반영, 최소 60초 클램프, 기본 300초 폴백
- **Edge cases (2개)**: 빈 Solana 서명 -> approve 미호출, raw string 응답 포맷 처리

모킹 전략:
- `verifySIWE`: vi.mock (ESM import -> 정상 인터셉트)
- `sodium-native`: vi.mock 불가 (createRequire CJS 로딩) -> 실제 Ed25519 키페어 생성하여 테스트
- signClient, wcSessionService, approvalWorkflow: vi.fn() spy
- SQLite: in-memory DB + pushSchema

### Task 2: stage4Wait + WcSigningBridge 통합 테스트 (16f54b6)

`packages/daemon/src/__tests__/wc-approval-integration.test.ts` (251 lines, 7 tests):

- **APPROVAL tier requestSignature 호출**: walletId, txId, chain 인자 정확성
- **호출 순서**: requestApproval 먼저, requestSignature 나중
- **fire-and-forget 비블로킹**: slow mock (pending Promise) + 100ms 미만 완료 확인
- **backward compat**: wcSigningBridge undefined -> requestApproval만 호출, 정상 동작
- **INSTANT tier**: requestSignature 미호출 (passthrough)
- **DELAY tier**: delayQueue.queueDelay 호출, requestSignature 미호출
- **chain 전달**: wallet.chain='solana' -> requestSignature 세 번째 인자 'solana'

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] sodium-native vi.mock 불가 -> 실제 Ed25519 키페어 사용**
- **Found during:** Task 1 (Solana 테스트)
- **Issue:** `loadSodium()`이 `createRequire(import.meta.url)`로 CJS 모듈 로딩하므로 vi.mock('sodium-native')가 인터셉트 불가. 실제 sodium-native가 64바이트 미만 서명 버퍼를 거부
- **Fix:** 테스트에서 실제 Ed25519 키페어를 생성하고 `signEd25519()` 헬퍼로 올바른 64바이트 서명 생성. 잘못된 서명 테스트는 다른 메시지에 대한 서명 사용
- **Files modified:** packages/daemon/src/__tests__/wc-signing-bridge.test.ts
- **Commit:** a9dd812

## Verification Results

1. `pnpm build --filter=@waiaas/daemon` -- 빌드 성공
2. `pnpm test --filter=@waiaas/daemon` -- 1,598 테스트 전체 통과 (97 파일, 0 실패)
3. WcSigningBridge 모든 분기 커버: session 없음(3) + EVM(5) + Solana(4) + reject(2) + timeout(3) + sync(3) + edge(2) = 22
4. stage4Wait 통합: APPROVAL + INSTANT + DELAY + backward compat + fire-and-forget = 7

## Self-Check: PASSED

- [x] packages/daemon/src/__tests__/wc-signing-bridge.test.ts EXISTS
- [x] packages/daemon/src/__tests__/wc-approval-integration.test.ts EXISTS
- [x] Commit a9dd812 EXISTS
- [x] Commit 16f54b6 EXISTS
- [x] 1,598 tests passed, 0 failures
