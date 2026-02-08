---
phase: 28-dependency-build-resolution
plan: 01
subsystem: infra
tags: [viem, siwe, ethers, sea, prebuildify, native-addon, cross-compile, sidecar]

# Dependency graph
requires:
  - phase: 27-daemon-security-foundation
    provides: Argon2id 통일, daemon 보안 미들웨어
provides:
  - SIWE 검증 viem/siwe 전환 (ethers/siwe 의존성 제거)
  - Sidecar 5개 타겟 플랫폼 매트릭스 + prebuildify 기반 native addon 번들 전략
  - 5개 설계 문서 일관성 있는 [v0.7 보완] 업데이트
affects: [28-02, 28-03, implementation]

# Tech tracking
tech-stack:
  added: [viem/siwe (viem v2.x 내장)]
  removed: [siwe v3.x, ethers v6 (peer dep)]
  patterns: [parseSiweMessage + validateSiweMessage + verifyMessage 3단계 SIWE 검증, SEA assets + native-loader.ts 패턴]

key-files:
  created: []
  modified:
    - .planning/deliverables/30-session-token-protocol.md
    - .planning/deliverables/34-owner-wallet-connection.md
    - .planning/deliverables/37-rest-api-complete-spec.md
    - .planning/deliverables/39-tauri-desktop-architecture.md
    - .planning/deliverables/24-monorepo-data-directory.md

key-decisions:
  - "viem/siwe 전환: parseSiweMessage + validateSiweMessage + verifyMessage 3단계 (EOA 전용, RPC 불필요)"
  - "verifySIWE 함수 시그니처 유지 (SIWEVerifyInput -> { valid, address?, nonce? }), 내부 구현만 교체"
  - "ARM64 Windows 제외: sodium-native/argon2 prebuild 미제공, Tauri 실험적, 시장 미미"
  - "SEA primary 전략: assets 메커니즘 + process.dlopen, fallback: 동반 .node 파일 디렉토리"
  - "argon2 경로 차이 주의: lib/binding/ (node-pre-gyp), sodium-native/better-sqlite3: prebuilds/ (prebuildify/prebuild-install)"

patterns-established:
  - "viem/siwe SIWE 검증 3단계: parse -> validate -> verifyMessage"
  - "SEA native-loader.ts: sea.getRawAsset() + process.dlopen() + 임시 파일 정리"
  - "[v0.7 보완] 태그로 설계 문서 수정 추적"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 28 Plan 01: SIWE viem/siwe 전환 + Sidecar 크로스 컴파일 전략 Summary

**SIWE 검증을 viem/siwe 내장 3단계 함수로 전환하여 ethers/siwe 의존성을 제거하고, 5개 타겟 플랫폼 + prebuildify 기반 native addon SEA 번들 전략을 확정한 5개 설계 문서 수정**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T10:10:20Z
- **Completed:** 2026-02-08T10:14:31Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- SIWE 검증을 `siwe` + `ethers v6`에서 `viem/siwe` 내장 함수(`parseSiweMessage`, `validateSiweMessage`, `verifyMessage`)로 전환하여 ethers 130KB+ 의존성 완전 제거
- Sidecar 크로스 컴파일 대상 5개 플랫폼(macOS ARM64/x64, Windows x64, Linux x64/ARM64) 확정, ARM64 Windows 제외 근거 명시
- prebuildify 기반 native addon 번들 전략(SEA assets primary + 동반 파일 fallback) 정의, 3개 addon별 빌드 도구/경로 차이 문서화
- 5개 설계 문서(24, 30, 34, 37, 39)가 [v0.7 보완] 태그와 함께 일관성 있게 업데이트됨

## Task Commits

Each task was committed atomically:

1. **Task 1: SIWE viem 전환 -- 4개 설계 문서 수정 (DEPS-01)** - `6bd4393` (feat)
2. **Task 2: Sidecar 크로스 컴파일 전략 확정 -- 2개 설계 문서 수정 (DEPS-02)** - `f042284` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `.planning/deliverables/30-session-token-protocol.md` - verifySIWE 코드 패턴을 viem/siwe 기반으로 교체, 의존성 설명 변경, 시퀀스 다이어그램 갱신
- `.planning/deliverables/34-owner-wallet-connection.md` - verifySIWE viem/siwe 전환 주석 추가 (함수 시그니처 동일)
- `.planning/deliverables/37-rest-api-complete-spec.md` - 서명 알고리즘 설명 siwe+ethers -> viem/siwe 변경
- `.planning/deliverables/39-tauri-desktop-architecture.md` - 5개 타겟 플랫폼 매트릭스, native addon 번들 전략(SEA assets + fallback), native-loader.ts 패턴, CI 파이프라인
- `.planning/deliverables/24-monorepo-data-directory.md` - daemon dependencies에 viem ^2.23.0 추가, native addon prebuild 전략 주석

## Decisions Made

| 결정 | 근거 | Task |
|------|------|------|
| viem/siwe 3단계 검증 (parse -> validate -> verifyMessage) | EOA 전용, RPC 불필요, ethers 의존성 완전 제거 | 1 |
| verifySIWE 함수 시그니처 유지 | 호출부(34번) 변경 최소화, 내부 구현만 교체 | 1 |
| ARM64 Windows 제외 | sodium-native/argon2 prebuild 미제공, Tauri 실험적, 시장 미미 | 2 |
| SEA assets primary + 동반 파일 fallback | SEA 내장 메커니즘 우선, 호환성 문제 시 안전망 | 2 |
| argon2 경로 차이 명시 | lib/binding/ (node-pre-gyp) vs prebuilds/ (prebuildify) 혼동 방지 | 2 |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEPS-01(SIWE viem 전환)과 DEPS-02(Sidecar 크로스 컴파일) 설계 기반 완성
- Phase 28의 나머지 plan(02, 03)에서 다른 의존성 이슈 해소 가능
- 구현 시 검증 필요: sodium-native SEA 호환성, Linux ARM64 Docker postject 이슈
- 블로커 없음

## Self-Check: PASSED

---
*Phase: 28-dependency-build-resolution*
*Completed: 2026-02-08*
