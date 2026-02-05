---
phase: 08-security-layers-design
plan: 03
subsystem: security
tags: [notification, telegram, discord, ntfy, rate-limit, fallback, multi-channel]

# Dependency graph
requires:
  - phase: 08-security-layers-design
    provides: LOCK-MECH -- NOTIFY/DELAY/APPROVAL 알림 호출 포인트, 4-티어 보안 분류
  - phase: 06-core-architecture-design
    provides: CORE-01 config.toml [notifications], CORE-02 notification_channels 기본 구조
provides:
  - INotificationChannel 인터페이스 (type/name/channelId/send/healthCheck)
  - TelegramChannel (Bot API sendMessage, MarkdownV2)
  - DiscordChannel (Webhook Embed, Retry-After)
  - NtfyChannel (HTTP POST, Priority 1-5, Click/Actions)
  - NotificationService 오케스트레이터 (notify 폴백 + broadcast 병렬)
  - NotificationEventType 13개 열거형
  - notification_channels 테이블 스키마 확정 (name, healthCheck 추가)
  - notification_log 테이블 스키마 (전달 추적, 30일 보존)
  - 채널별 TokenBucketRateLimiter
  - 최소 2채널 검증 + 제한 모드
  - 메시지 포맷 템플릿 (APPROVAL_REQUEST, DELAY_QUEUED, KILL_SWITCH)
affects: [08-04-kill-switch, 09-01-api-spec, 09-04-telegram-bot]

# Tech tracking
tech-stack:
  added: []
  patterns: [INotificationChannel 채널 추상화, TokenBucketRateLimiter 토큰 버킷, LRU deduplication, fire-and-forget 비동기 알림, Promise.allSettled broadcast]

key-files:
  created: [.planning/deliverables/35-notification-architecture.md]
  modified: []

key-decisions:
  - "채널 설정 DB 저장: config.toml에서 notification_channels 테이블로 이전 (런타임 동적 관리)"
  - "config.toml [notifications]는 시스템 레벨 설정만 (enabled, min_channels, health_check_interval)"
  - "CORE-02 notification_channels 변경: name 추가, lastSuccessAt/lastFailureAt -> lastHealthCheck/lastHealthStatus"
  - "config JSON v0.2 평문 저장 + 파일 권한 600, v0.3 AES-256-GCM 암호화 마이그레이션 경로 문서화"
  - "시크릿 마스킹: botToken/webhookUrl/authToken은 API 응답에서 마지막 4자만, 로그에서 [REDACTED]"
  - "notify: priority 순 폴백, 첫 성공 시 중단. broadcast: Promise.allSettled 병렬 전송"
  - "중복 방지: LRU 캐시 max 500, TTL 5분, key = event:referenceId"
  - "rate limit: Telegram 30/s, Discord 5/5s (1/s refill), ntfy 10/s 토큰 버킷"
  - "제한 모드: 활성 채널 <2이면 INSTANT만 허용 (DELAY/APPROVAL 비활성)"
  - "healthCheck 5분 주기, 3회 연속 실패 시 다른 채널로 경고 알림"
  - "NOTIFY 티어 알림: fire-and-forget (await 없이 비블로킹)"
  - "notification_log 30일 보존, 배치 삭제 (LIMIT 1000)"

patterns-established:
  - "INotificationChannel: type/name/channelId/send/healthCheck 5메서드 채널 추상화"
  - "NotificationService: notify (priority fallback) + broadcast (allSettled) 이중 전송 패턴"
  - "TokenBucketRateLimiter: 채널별 API rate limit 사전 준수"
  - "fire-and-forget: NOTIFY 티어 알림은 await 없이 비동기 전송"
  - "채널 healthCheck worker: 5분 주기 백그라운드 워커 (DelayQueueWorker와 동일 패턴)"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 8 Plan 03: 멀티 채널 알림 아키텍처 Summary

**INotificationChannel 3채널 추상화 + NotificationService 폴백/broadcast + notification_channels/notification_log DB 스키마 + TokenBucketRateLimiter + 최소 2채널 제한 모드 전체 설계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T11:37:45Z
- **Completed:** 2026-02-05T11:45:13Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments
- INotificationChannel 인터페이스 정의 (type/name/channelId/send/healthCheck)
- TelegramChannel 코드 수준 설계 (Bot API sendMessage, MarkdownV2 이스케이프, 429 retryAfter)
- DiscordChannel 코드 수준 설계 (Webhook Embed, 색상/필드/타임스탬프, Retry-After)
- NtfyChannel 코드 수준 설계 (HTTP POST, Priority 1-5, Click/Actions 헤더, self-hosted 지원)
- NotificationService: notify (priority 순 폴백) + broadcast (Promise.allSettled 병렬)
- NotificationEventType 13개 열거형 + 이벤트별 심각도 매핑 테이블
- 중복 방지 LRU 캐시 (event+referenceId, max 500, TTL 5분)
- notification_channels 테이블 스키마 확정 (CORE-02 대비 name/healthCheck/updatedAt 추가)
- notification_log 테이블 스키마 (DELIVERED/FAILED/RATE_LIMITED/ALL_FAILED, 30일 보존)
- 최소 2채널 검증: 삭제/비활성화 거부(MIN_CHANNELS_REQUIRED) + 제한 모드
- TokenBucketRateLimiter: Telegram 30/s, Discord 5/5s, ntfy 10/s
- 메시지 포맷 템플릿 3종 x 3채널 (APPROVAL_REQUEST, DELAY_QUEUED, KILL_SWITCH)
- LOCK-MECH 연동 포인트 13개 정의 (알림 호출 포인트 매핑 테이블)
- config.toml [notifications] 시스템 레벨 설정 확정 (enabled/min_channels/health_check_interval/log_retention_days/dedup_ttl)
- 보안: 주소 축약 표시, 비동기 비블로킹 전송, CSRF nonce 바인딩

## Task Commits

Each task was committed atomically:

1. **Task 1: 알림 채널 추상화 + 3개 어댑터 + NotificationService 설계** - `f12bb7e` (feat)
2. **Task 2: 알림 DB 스키마 + 채널 설정 + 전달 추적 + rate limit 설계** - `630708f` (feat)

## Files Created/Modified
- `.planning/deliverables/35-notification-architecture.md` - 멀티 채널 알림 아키텍처 전체 설계 (13개 섹션, 2142줄, NOTI-01/NOTI-02 충족)

## Decisions Made
1. **채널 설정 DB 이전**: config.toml의 채널 상세 설정 -> notification_channels 테이블 (런타임 API로 동적 관리)
2. **config.toml 역할 축소**: 시스템 레벨만 (enabled, min_channels, health_check_interval, log_retention_days, dedup_ttl)
3. **CORE-02 스키마 변경**: name 컬럼 추가, lastSuccessAt/lastFailureAt -> lastHealthCheck/lastHealthStatus
4. **v0.2 평문 저장**: config JSON 평문 + 파일 권한 600. v0.3에서 AES-256-GCM 암호화 마이그레이션
5. **시크릿 마스킹**: botToken/webhookUrl/authToken은 API 응답에서 마지막 4자만 표시
6. **NOTIFY 비블로킹**: fire-and-forget 패턴 (await 없이 비동기, 실패해도 거래 영향 없음)
7. **제한 모드**: 활성 채널 <2이면 INSTANT만 허용 (DELAY/APPROVAL 비활성화)
8. **rate limiter 전략**: 429 사전 방지 (토큰 버킷) + 429 사후 처리 (retryAfter 1회 재시도)
9. **healthCheck 3회 연속 실패**: 자동 비활성화 안함, 다른 채널로 경고 알림
10. **notification_log 30일 보존**: 배치 삭제 LIMIT 1000 (long lock 방지)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NotificationService broadcast() -> 08-04 (Kill Switch)에서 KILL_SWITCH_ACTIVATED 알림 호출
- 채널 관리 API 구조 -> 09-01 (REST API 전체 스펙)에서 OpenAPI 정의
- Telegram Bot 알림 포맷 -> 09-04 (Interactive Telegram Bot)에서 인라인 키보드 확장
- 제한 모드 -> 08-04 (자동 정지 규칙 엔진)에서 채널 부족 시 정책 엔진 연동

---
*Phase: 08-security-layers-design*
*Completed: 2026-02-05*
