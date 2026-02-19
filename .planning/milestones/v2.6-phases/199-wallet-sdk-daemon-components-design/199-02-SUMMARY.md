---
phase: 199-wallet-sdk-daemon-components-design
plan: 02
subsystem: design
tags: [daemon-components, signing-sdk, ntfy, telegram, approval-channel, settings, db-schema, wallet-link]

# Dependency graph
requires:
  - phase: 199-wallet-sdk-daemon-components-design
    plan: 01
    provides: "doc 74 Sections 1-4 (SDK 공개 API + WalletLinkConfig + 패키지 구조)"
  - phase: 198-signing-protocol-v1-design
    provides: "doc 73 Signing Protocol v1 (ntfy/Telegram 채널 프로토콜, 에러 코드)"
provides:
  - "doc 74: Wallet SDK + Daemon Components 설계서 완성본 (전체 11개 섹션)"
  - "데몬 6개 컴포넌트 TypeScript 인터페이스 확정 (SignRequestBuilder/SignResponseHandler/NtfySigningChannel/TelegramSigningChannel/WalletLinkRegistry/ApprovalChannelRouter)"
  - "ApprovalChannelRouter 5단계 우선순위 라우팅 로직 확정"
  - "SettingsService signing_sdk 6개 키 + wallets JSON 저장 구조"
  - "wallets.owner_approval_method DB 컬럼 + REST API approval_method 필드 + Admin UI 와이어프레임"
affects: [200, 201]

# Tech tracking
tech-stack:
  added: []
  patterns: ["ISigningChannel 공통 인터페이스 패턴 (sendRequest + waitForResponse)", "ApprovalChannelRouter 5단계 fallback 패턴", "SettingsService JSON 배열 저장소 패턴 (WalletLinkRegistry)"]

key-files:
  created: []
  modified:
    - "internal/design/74-wallet-sdk-daemon-components.md"

key-decisions:
  - "ISigningChannel 공통 인터페이스 도입: ntfy/telegram 채널을 sendRequest+waitForResponse 2메서드로 통일, 향후 Slack/Discord 확장 가능"
  - "WalletLinkRegistry 저장소를 SettingsService signing_sdk.wallets JSON 배열로 결정 (별도 테이블 불필요, 지갑 등록 수 1-3개)"
  - "ApprovalChannelRouter 5단계 fallback: wallet.ownerApprovalMethod > SDK(ntfy/telegram) > WalletConnect > Telegram Bot > REST"
  - "owner_approval_method CHECK 제약 + NULL 허용: NULL=글로벌 fallback, 유효하지 않은 값은 DB 레벨 차단"
  - "SignRequest 임시 저장소는 메모리 Map 기본 사용 (데몬 재시작 시 PENDING_APPROVAL TX에 대해 재생성)"
  - "ntfy 서버 URL은 기존 notifications.ntfy_server 재사용 (서명 채널과 알림 채널 동일 서버, 토픽 접두어로 분리)"
  - "Telegram /sign_response 핸들러를 기존 Long Polling handleUpdate()에 추가 (chatId + signerAddress + 서명 3중 보안)"

patterns-established:
  - "ISigningChannel: 서명 채널 공통 인터페이스 (type + sendRequest + waitForResponse)"
  - "ApprovalChannelRouter: 지갑별 설정 우선 > 글로벌 SDK > 기존 인프라 순차 fallback"
  - "SettingsService JSON 배열: 소수 항목(1-3개) 관리에 별도 테이블 대신 JSON 사용"

requirements-completed: [DMON-01, DMON-02, DMON-03, DMON-04, DMON-05]

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 199 Plan 02: 데몬 컴포넌트 인터페이스 + 채널 라우팅 + DB 스키마 설계 Summary

**데몬 6개 컴포넌트(SignRequestBuilder/SignResponseHandler/NtfySigningChannel/TelegramSigningChannel/WalletLinkRegistry/ApprovalChannelRouter) TypeScript 인터페이스 + ISigningChannel 공통 인터페이스 + 5단계 라우팅 로직 + SettingsService 7키 + wallets.owner_approval_method DB 컬럼/REST API/Admin UI 설계 확정으로 doc 74 전체 11개 섹션 완성**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-19T15:24:04Z
- **Completed:** 2026-02-19T15:29:56Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- doc 74(Wallet SDK + Daemon Components) 설계 문서 완성 - 전체 11개 섹션 모두 실제 내용으로 채움 (placeholder 0건)
- Section 5(데몬 컴포넌트 개요): 6개 컴포넌트 책임 매트릭스 + 데이터 흐름 다이어그램(8단계) + 파일 구조 + 기존 코드 재사용 지점 6개
- Section 6(SignRequestBuilder/SignResponseHandler): ISignRequestBuilder(build 7단계 + resolveWalletName) + ISignResponseHandler(handle 8단계 + 에러 코드 매핑 8개) + SignRequest 임시 저장소 설계
- Section 7(NtfySigningChannel/TelegramSigningChannel): ISigningChannel 공통 인터페이스 + NtfySigningChannel(ntfy JSON publish + SSE subscribe 재연결 3회) + TelegramSigningChannel(Bot API sendMessage + pendingResponses Map + /sign_response 명령어 등록)
- Section 8(WalletLinkRegistry/ApprovalChannelRouter): IWalletLinkRegistry(JSON 저장 + 캐시 무효화 + URL 생성) + IApprovalChannelRouter(5단계 fallback 의사코드 + 구현 코드)
- Section 9(SettingsService 키): signing_sdk 6개 키(enabled/request_expiry_min/preferred_channel/preferred_wallet/ntfy_request_topic_prefix/ntfy_response_topic_prefix) + wallets JSON 배열 + Admin UI 와이어프레임
- Section 10(DB 스키마/REST API): wallets.owner_approval_method ALTER TABLE + CHECK 제약 + Drizzle 스키마 + REST API 요청/응답 스키마 변경 + Admin UI Approval Method 라디오 + 인프라 미구성 경고 규칙
- Section 11(기술 결정 요약): SDK 측 4개 + 데몬 측 7개 = 총 11개 설계 결정 정리 + 문서 메타데이터

## Task Commits

Each task was committed atomically:

1. **Task 1: 데몬 컴포넌트 개요 + SignRequestBuilder/SignResponseHandler + 채널 인터페이스 확정** - `5050095` (docs)
2. **Task 2: WalletLinkRegistry + ApprovalChannelRouter + SettingsService 키 + DB 스키마 + 기술 결정 요약** - `87c3854` (docs)

## Files Created/Modified
- `internal/design/74-wallet-sdk-daemon-components.md` - Wallet SDK + Daemon Components 설계서 완성본 (~2450줄, 전체 11개 섹션)

## Decisions Made
- ISigningChannel 공통 인터페이스 도입: sendRequest() + waitForResponse() 2메서드로 ntfy/telegram 채널을 교체 가능하게 설계. 향후 Slack/Discord 채널도 동일 인터페이스로 추가 가능
- WalletLinkRegistry를 SettingsService의 signing_sdk.wallets JSON 배열로 저장: 지갑 등록 수가 소수(1-3개)이므로 별도 DB 테이블 불필요. SettingsService의 기존 캐시/무효화 패턴 재사용
- ApprovalChannelRouter 5단계 fallback 순서 확정: wallet.ownerApprovalMethod(지갑별) > SDK enabled + preferred_channel(글로벌) > WalletConnect(세션) > Telegram Bot(chatId) > REST(최종)
- owner_approval_method CHECK 제약 + NULL 허용: NULL은 글로벌 fallback 진입을 의미. 유효하지 않은 값은 DB CHECK 제약으로 차단
- SignRequest 임시 저장소를 메모리 Map으로 설계: 단순 + 빠름 우선. 데몬 재시작 시 PENDING_APPROVAL 트랜잭션에 대해 새 SignRequest 재생성
- ntfy 서버 URL은 기존 notifications.ntfy_server 재사용: 서명/알림 채널이 동일 ntfy 서버를 공유하되 토픽 접두어(waiaas-sign-* vs waiaas-notify-*)로 분리
- Telegram /sign_response 핸들러를 기존 Long Polling handleUpdate()에 명령어 추가로 구현: chatId + signerAddress + 서명의 3중 보안

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- doc 74 전체 11개 섹션 완성으로 m26-01 구현 시 데몬 측 컴포넌트를 바로 구현할 수 있는 상태
- SDK 공개 API 6개 함수(Plan 01) + 데몬 컴포넌트 6개 인터페이스(Plan 02) + SettingsService 키 + DB 스키마 모두 확정
- Phase 200(알림 채널 설계) 또는 Phase 201(Push Relay Server 설계)로 진행 가능

## Self-Check: PASSED

- FOUND: internal/design/74-wallet-sdk-daemon-components.md
- FOUND: .planning/phases/199-wallet-sdk-daemon-components-design/199-02-SUMMARY.md
- FOUND: 5050095 (Task 1 commit)
- FOUND: 87c3854 (Task 2 commit)

---
*Phase: 199-wallet-sdk-daemon-components-design*
*Completed: 2026-02-20*
