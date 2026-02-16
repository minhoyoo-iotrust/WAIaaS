---
phase: 157-extension-test
plan: 03
subsystem: daemon/tests/extension
tags: [testing, action-provider, chain-error, functional-test]
dependency_graph:
  requires: []
  provides:
    - "EXT-06: Action Provider 기능 테스트 16건"
    - "EXT-07: ChainError 3-category 기능 테스트 12건"
  affects:
    - "packages/daemon test coverage (extension/)"
tech_stack:
  added: []
  patterns:
    - "extension test: scenario-driven end-to-end functional testing"
    - "MockActionProvider factory with createMockActionProvider()"
    - "CHAIN_ERROR_CATEGORIES exhaustive partition verification"
key_files:
  created:
    - packages/daemon/src/__tests__/extension/action-provider.extension.test.ts
    - packages/daemon/src/__tests__/extension/chain-error.extension.test.ts
  modified: []
decisions:
  - "ACT-U01: Registry에 MCP Tool 상한 하드캡 미존재 -- 17개 이상 등록 가능 (문서화)"
  - "ACT-U04: 156-02 결정 재확인 -- Registry는 chain 매칭 미강제, pipeline 레벨 검증"
  - "CE-12: STALE !== TRANSIENT -- STALE는 retryable이지만 TX rebuild 필요"
metrics:
  duration: 4min
  completed: 2026-02-17
  tasks: 2
  files: 2
  tests_added: 28
  lines_added: 1004
---

# Phase 157 Plan 03: Action Provider + ChainError Extension Test Summary

Action Provider resolve-then-execute 흐름, MCP Tool 변환, ESM 플러그인 로드, ChainError 29-code 3-category 분류/retryable 자동 파생/직렬화를 기능 테스트 28건으로 검증

## Task 1: EXT-06 Action Provider 기능 테스트 16건

**Commit:** 4276b01

16건 테스트를 4개 describe 블록으로 구성:

| Describe | Tests | Coverage |
|----------|-------|----------|
| ACT-U01~U04: Registry errors | 4 | MCP 상한, 이름 충돌, 입력 검증, 체인 불일치 |
| ACT-I01~I04: Plugin load + pipeline | 4 | CJS 실패, 타임아웃 시뮬레이션, 화이트리스트, 미존재 디렉토리 |
| ACT-F01~F04: Normal behavior | 4 | resolve-then-execute, from 검증, MCP 필터링, 목록 열거 |
| ACT-X01~X04: Cross-validation | 4 | 스키마 통과, 다중 provider, 재등록, MCP 변환 정확도 |

**Key patterns:**
- `createMockActionProvider` factory (MockActionProvider with vi.fn() spies)
- `makeRawProvider` for custom resolve behavior (timeout, etc.)
- ContractCallRequestSchema explicit re-validation
- Temp directory + cleanup for ESM plugin load tests

## Task 2: EXT-07 ChainError 기능 테스트 12건

**Commit:** 5f759d4

12건 테스트를 4개 describe 블록으로 구성:

| Describe | Tests | Coverage |
|----------|-------|----------|
| CE-01~CE-03: 3-category accuracy | 3 | PERMANENT 21, TRANSIENT 4, STALE 4 전수 검증 |
| CE-04~CE-06: Constructor + retryable | 3 | 기본 메시지, 커스텀 메시지, 29 code 전수 auto-derivation |
| CE-07~CE-09: toJSON + cause | 3 | 5필드 직렬화, cause chaining, leakage 방지 |
| CE-10~CE-12: Cross-validation | 3 | disjoint partition, TRANSIENT retry, STALE rebuild |

**Key patterns:**
- `@waiaas/core` 패키지 export로 ChainError/CHAIN_ERROR_CATEGORIES import
- `Object.entries(CHAIN_ERROR_CATEGORIES)` 전수 순회 (exhaustive enumeration)
- Disjoint partition Set 검증 (29 = 21 + 4 + 4)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Extension directory: 5 files, 106 tests all passing
- Existing action-provider-registry.test.ts: 21 tests, no regression
- action-provider.extension.test.ts: 16/16 passed
- chain-error.extension.test.ts: 12/12 passed

## Self-Check: PASSED

- [x] action-provider.extension.test.ts exists (653 lines)
- [x] chain-error.extension.test.ts exists (351 lines)
- [x] Commit 4276b01 found in git log
- [x] Commit 5f759d4 found in git log
- [x] 16 + 12 = 28 tests all passing
- [x] No regressions in existing tests
