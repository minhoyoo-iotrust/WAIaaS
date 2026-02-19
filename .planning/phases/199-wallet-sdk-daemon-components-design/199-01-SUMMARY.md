---
phase: 199-wallet-sdk-daemon-components-design
plan: 01
subsystem: design
tags: [wallet-sdk, zod, typescript, npm, universal-link, ntfy, telegram, tsup]

# Dependency graph
requires:
  - phase: 198-signing-protocol-v1-design
    provides: "doc 73 Signing Protocol v1 (SignRequest/SignResponse 스키마, 채널 프로토콜, 에러 코드)"
provides:
  - "doc 74: Wallet SDK + Daemon Components 설계서 (Sections 1-4)"
  - "@waiaas/wallet-sdk 공개 API 6개 함수 시그니처/매개변수/반환타입/에러/코드예시 확정"
  - "WalletLinkConfig Zod 스키마 (6필드) + registerWallet() 인터페이스"
  - "packages/wallet-sdk/ 디렉토리 구조 + package.json + tsup 빌드/배포 설정"
affects: [199-02, 200, 201]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SDK 공개 API 함수별 시그니처/매개변수/에러/코드예시 문서 패턴", "WalletLinkConfig Zod SSoT 스키마 패턴"]

key-files:
  created:
    - "internal/design/74-wallet-sdk-daemon-components.md"
  modified: []

key-decisions:
  - "parseSignRequest 반환 타입을 SignRequest | Promise<SignRequest>로 설계하여 인라인(동기)/ntfy 조회(비동기) 2가지 모드 지원"
  - "zod만 peerDependency로 요구하고 fetch/EventSource/URL은 내장 API 사용하여 의존성 최소화"
  - "tsup ESM+CJS dual output으로 React Native/Electron/Node.js/브라우저 모두 지원"
  - "sendViaTelegram은 void 반환 (URL 스킴 호출은 비동기 결과 확인 불가)"

patterns-established:
  - "SDK 함수 문서: 시그니처 -> 매개변수 표 -> 반환 타입 -> 에러 케이스 -> 코드 예시 -> 내부 로직"
  - "WalletLinkConfig: registerWallet()로 SDK 내부 레지스트리에 등록, 데몬 측 WalletLinkRegistry와 별개"

requirements-completed: [WSDK-01, WSDK-02, WSDK-03]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 199 Plan 01: Wallet SDK 공개 API + WalletLinkConfig + 패키지 구조 설계 Summary

**@waiaas/wallet-sdk 6개 공개 함수(parseSignRequest/buildSignResponse/formatDisplayMessage/sendViaNtfy/sendViaTelegram/subscribeToRequests) TypeScript 시그니처 + WalletLinkConfig Zod 스키마(6필드) + packages/wallet-sdk/ 디렉토리 구조/tsup ESM+CJS 빌드/배포 설정 확정**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T15:16:35Z
- **Completed:** 2026-02-19T15:21:29Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- doc 74(Wallet SDK + Daemon Components) 설계 문서 생성 - 11개 섹션 목차 + Sections 1-4 완성
- Section 1(개요): 문서 목적, 적용 범위, doc 73 참조 관계 표(7개 섹션 매핑)
- Section 2(SDK 공개 API): 6개 함수 각각에 대해 TypeScript 시그니처, 매개변수 상세 표, 반환 타입, 에러 케이스, 지갑 앱 통합 코드 예시, 내부 로직 의사코드 포함. SDK 에러 클래스 계층(WalletSdkError 기반 6개 에러 클래스) 정의
- Section 3(WalletLinkConfig): Zod 스키마 6필드(name/displayName/universalLink/deepLink/ntfy/supportedChains) + registerWallet() 인터페이스 + D'CENT 레퍼런스 설정 예시 + 지갑 개발사 5단계 통합 체크리스트
- Section 4(패키지 구조): packages/wallet-sdk/ 디렉토리(11 src 파일 + 6 test 파일) + package.json(zod peer dep, ESM/CJS exports) + tsup.config.ts(ES2022 타겟) + tsconfig.json + 4환경 호환성 표 + release-please 배포 통합

## Task Commits

Each task was committed atomically:

1. **Task 1: doc 74 골격 + Section 1-2 (SDK 공개 API 6개 함수 시그니처)** - `a0ff98a` (docs)
2. **Task 2: Section 3-4 (WalletLinkConfig + 패키지 구조)** - `4e7920d` (docs)

## Files Created/Modified
- `internal/design/74-wallet-sdk-daemon-components.md` - Wallet SDK + Daemon Components 설계서 (1200줄, Sections 1-4 완성 + 5-11 Plan 02 placeholder)

## Decisions Made
- parseSignRequest()의 반환 타입을 `SignRequest | Promise<SignRequest>`로 설계: URL에 data 파라미터가 있으면 동기 반환(인라인 모드), requestId만 있으면 ntfy에서 비동기 조회(fallback 모드)
- zod만 peerDependency로 요구하고 fetch, EventSource, URL, TextEncoder 등은 모든 대상 환경(React Native/Electron/Node.js 18+)에서 내장 제공되므로 별도 의존성 불필요
- tsup으로 ESM + CJS dual output 빌드, ES2022 타겟으로 React Native Hermes와 Node.js 18+ 모두 지원
- sendViaTelegram()은 void 반환으로 설계: URL 스킴 호출(tg://, https://t.me/)은 비동기 결과를 확인할 수 없으므로 동기 함수로 정의하고 fallback 체인(Android -> iOS -> 클립보드)으로 처리

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 199-02에서 Sections 5-11(데몬 측 컴포넌트: SignRequestBuilder, SignResponseHandler, NtfySigningChannel, TelegramSigningChannel, WalletLinkRegistry, ApprovalChannelRouter, SettingsService 키, DB 컬럼, 기술 결정 요약) 작성 가능
- SDK 공개 API와 WalletLinkConfig가 확정되어 데몬 측 컴포넌트 인터페이스 설계의 입력으로 사용 가능

## Self-Check: PASSED

- FOUND: internal/design/74-wallet-sdk-daemon-components.md
- FOUND: .planning/phases/199-wallet-sdk-daemon-components-design/199-01-SUMMARY.md
- FOUND: a0ff98a (Task 1 commit)
- FOUND: 4e7920d (Task 2 commit)

---
*Phase: 199-wallet-sdk-daemon-components-design*
*Completed: 2026-02-20*
