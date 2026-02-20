---
phase: 198-signing-protocol-v1-design
plan: 02
subsystem: design
tags: [signing-protocol, ntfy, telegram, security, error-codes, expiry-policy]

# Dependency graph
requires:
  - phase: 198-01
    provides: "doc 73 Sections 1-6 (SignRequest/SignResponse 스키마, 서명 포맷, 유니버셜 링크)"
provides:
  - "doc 73: Signing Protocol v1 설계서 완성본 (12개 섹션 전체)"
  - "ntfy 채널 프로토콜 (토픽 네이밍, publish/subscribe, E2E 시퀀스)"
  - "Telegram 채널 프로토콜 (인라인 버튼, 공유 인텐트, 모바일/PC 시나리오)"
  - "보안 모델 (5가지 위협 분석 + 서명 검증 플로우)"
  - "에러 코드 8개 (SIGN_REQUEST_EXPIRED ~ WALLET_NOT_REGISTERED)"
affects: [199, 200, 201]

# Tech tracking
tech-stack:
  added: []
  patterns: ["ntfy 요청/응답 토픽 분리 패턴 (waiaas-sign-{walletId} / waiaas-response-{requestId})", "Telegram 공유 인텐트 응답 패턴 (/sign_response base64url)"]

key-files:
  created: []
  modified:
    - "internal/design/73-signing-protocol-v1.md"

key-decisions:
  - "ntfy 응답 토픽은 requestId 기반 1회용 (waiaas-response-{requestId}), 122비트 엔트로피로 추측 불가"
  - "Telegram 응답은 공유 인텐트(/sign_response) + chatId 이중 확인 + 서명 검증 3중 보안"
  - "자동 재시도 없음 (1회성 요청 원칙), 만료 후 새 SignRequest 생성 필요"
  - "공개 ntfy.sh와 self-hosted ntfy 모두 지원, 프로덕션에서는 self-hosted 권장"

patterns-established:
  - "ntfy 채널: POST publish + GET SSE subscribe 패턴"
  - "Telegram 채널: Bot sendMessage(인라인 버튼) + Long Polling(/sign_response) 패턴"
  - "보안: 위협 분석 표(시나리오/위험도/대응) 패턴"

requirements-completed: [PROTO-03, PROTO-04]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 198 Plan 02: ntfy/Telegram 채널 프로토콜 + 보안 모델 + 에러 코드 Summary

**ntfy 토픽 네이밍(요청/응답 분리) + SSE 구독 프로토콜, Telegram 인라인 버튼 + 공유 인텐트 응답(모바일/PC 시나리오), 5가지 위협 분석 기반 보안 모델, 8개 에러 코드 체계를 확정하여 doc 73(Signing Protocol v1) 12개 섹션 완성**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T15:03:43Z
- **Completed:** 2026-02-19T15:08:37Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Section 7(ntfy 채널 프로토콜): 토픽 네이밍 규칙(waiaas-sign-{walletId} / waiaas-response-{requestId}), 요청 publish(JSON + Priority:5 + Actions 헤더), 응답 SSE subscribe, 지갑 앱 응답 publish, 5단계 E2E 시퀀스 다이어그램, self-hosted ntfy 지원
- Section 8(Telegram 채널 프로토콜): Bot sendMessage + InlineKeyboardMarkup(유니버셜 링크), 모바일 시나리오(3탭 UX), PC 시나리오(QR 코드 브릿지), Long Polling /sign_response 핸들러, 플랫폼별 공유 인텐트 URL(Android tg:// / iOS t.me/), 5단계 E2E 시퀀스 다이어그램
- Section 9(만료 정책): 기본 30분(SettingsService 조정 가능), expiresAt 기반 4시점 검증, 자동 재시도 없음 원칙, Admin 수동 재승인 경로
- Section 10(보안 모델): 5가지 위협 분석(토픽 스니핑/위조 응답/리플레이/중간자/토픽 추측), ntfy 토픽 보안 수준 분류, EVM/Solana 서명 검증 코드, 향후 보안 강화 옵션 4가지
- Section 11(에러 코드): 8개 에러 코드 표 + 에러 응답 JSON 형식 + 에러 처리 매트릭스(상태 변경/재시도/로그 레벨)
- Section 12(기술 결정 요약): m26-01의 11개 결정 사항 정리 + 문서 메타데이터

## Task Commits

Each task was committed atomically:

1. **Task 1: ntfy 채널 프로토콜 + Telegram 채널 프로토콜 섹션 작성** - `c827dda` (docs)
2. **Task 2: 만료 정책 + 보안 모델 + 에러 코드 + 기술 결정 요약 작성** - `54ea7b7` (docs)

## Files Created/Modified
- `internal/design/73-signing-protocol-v1.md` - Signing Protocol v1 설계서 완성본 (1465줄, 12개 섹션 전체)

## Decisions Made
- ntfy 응답 토픽은 requestId(UUID v7) 기반 1회용으로, 122비트 엔트로피로 추측 불가. 토픽 자체가 인증 역할을 수행
- Telegram 응답은 chatId(1차) + signerAddress(2차) + ownerAuth 서명 검증(3차)의 3중 보안으로 위조 방지
- 자동 재시도 없음 원칙: 만료/거부 후에는 새 SignRequest 생성 필요 (새 requestId 부여)
- 프로덕션 환경에서는 self-hosted ntfy 권장 (토픽 인증 + 데이터 로컬 처리)
- 향후 보안 강화(ntfy 토픽 인증, E2E 암호화, 응답 토픽 TTL, SignRequest HMAC)는 v1 범위 외로 분리

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- doc 73(Signing Protocol v1) 12개 섹션 완성본으로 Phase 199/200/201의 구현 입력으로 사용 가능
- Phase 198(설계) 완료 → Phase 199(데몬 측 컴포넌트 구현) 진행 가능
- PROTO-01~04 요구사항 모두 충족, 프로토콜 설계 확정 완료

## Self-Check: PASSED

- FOUND: internal/design/73-signing-protocol-v1.md
- FOUND: c827dda (Task 1 commit)
- FOUND: 54ea7b7 (Task 2 commit)

---
*Phase: 198-signing-protocol-v1-design*
*Completed: 2026-02-19*
