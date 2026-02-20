---
phase: 200-notification-channel-push-relay-design
plan: 02
subsystem: design
tags: [push-relay, ipushprovider, pushwoosh, fcm, ntfy-sse, device-registry, docker, config-toml]

# Dependency graph
requires:
  - phase: 200-notification-channel-push-relay-design
    plan: 01
    provides: "doc 75 Sections 1-5 (알림 채널 설계: 토픽 분리 + NotificationMessage + WalletNotificationChannel)"
  - phase: 198-signing-protocol-v1-design
    provides: "doc 73 Signing Protocol v1 (ntfy 토픽 네이밍 + SignRequest 스키마)"
provides:
  - "doc 75 Sections 6-13 완성: Push Relay Server 전체 설계 (m26-03 구현 입력 사양)"
  - "IPushProvider 인터페이스 + PushPayload/PushResult Zod 스키마 (RELAY-01)"
  - "PushwooshProvider(createMessage API 매핑) + FcmProvider(OAuth2 인증 + HTTP v1 단건 전송) (RELAY-02)"
  - "NtfySubscriber(SSE 다중 토픽 + 지수 백오프 재연결) + MessageParser(토픽 패턴 분기 변환) (RELAY-03)"
  - "DeviceRegistration API(POST/DELETE /devices) + SQLite 스키마 + invalidTokens 자동 정리 (RELAY-04)"
  - "RelayConfigSchema Zod + config.toml TOML 예시 + 환경변수 오버라이드 10개 (RELAY-04)"
  - "Dockerfile 멀티스테이지 + docker-compose.yml + 배포 가이드 (RELAY-04)"
  - "기술 결정 10개 (알림 채널 4개 + Push Relay 6개)"
affects: [201]

# Tech tracking
tech-stack:
  added: []
  patterns: ["IPushProvider 인터페이스 패턴 (send/validateConfig)", "NtfySubscriber SSE 다중 토픽 + 지수 백오프", "MessageParser 토픽 패턴 분기 변환", "RelayConfigSchema superRefine 조건부 검증"]

key-files:
  created: []
  modified:
    - "internal/design/75-notification-channel-push-relay.md"

key-decisions:
  - "IPushProvider 인터페이스: send(tokens, payload) + validateConfig() 2메서드로 프로바이더 확장 가능"
  - "FCM HTTP v1 단건 전송: sendAll/sendMulticast deprecated 대비, Promise.allSettled 병렬 처리"
  - "FCM access_token 캐시: 메모리 저장, 만료 5분 전 자동 갱신 (jose RS256 JWT 서명)"
  - "NtfySubscriber 다중 토픽 SSE: ntfy 콤마 구분 토픽 네이티브 지원으로 단일 연결"
  - "heartbeat 타임아웃 60초: ntfy keepalive 30초 2회 미수신 시 재연결"
  - "DeviceRegistry push_token PK: 자연 키 사용으로 추가 ID 불필요"
  - "invalidTokens 자동 정리: FCM 404/410 응답 시 DeviceRegistry에서 자동 삭제"
  - "Push Relay config.toml: WAIaaS flat-key 정책 미적용 (별도 패키지), 중첩 섹션 사용"
  - "환경변수 오버라이드 10개: Docker 배포 시 config.toml 대신 환경변수 주입 가능"
  - "Dockerfile 멀티스테이지: node:22-alpine, 비루트 사용자, VOLUME /data + /config"

patterns-established:
  - "IPushProvider: readonly name + send(tokens[], PushPayload) → PushResult + validateConfig()"
  - "PushPayload: title/body/data/category/priority 5필드 구조"
  - "NtfySubscriber: SSE + 지수 백오프(1s-60s) + heartbeat 감시(60s)"
  - "MessageParser: 토픽 패턴 분기 (sign→sign_request, notify→notification)"
  - "DeviceRegistry: upsert/remove/getTokensByWalletId/removeInvalidTokens 4메서드"
  - "RelayConfigSchema: superRefine 조건부 검증 (provider→섹션 필수)"

requirements-completed: [RELAY-01, RELAY-02, RELAY-03, RELAY-04]

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 200 Plan 02: Push Relay Server IPushProvider + Pushwoosh/FCM + ntfy SSE + Docker 배포 설계 Summary

**IPushProvider 인터페이스(send/validateConfig) + PushwooshProvider(createMessage API) + FcmProvider(OAuth2 + HTTP v1) + NtfySubscriber(SSE 다중 토픽 + 지수 백오프) + MessageParser(토픽 패턴 분기) + DeviceRegistry(SQLite + invalidTokens 자동 정리) + RelayConfigSchema(superRefine 조건부 검증) + Docker 멀티스테이지로 doc 75 Sections 6-13 완성**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-19T15:45:33Z
- **Completed:** 2026-02-19T15:51:54Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- doc 75(알림 채널 + Push Relay Server) 설계 문서 Sections 6-13 완성 (~1,650줄 추가, Push Relay Server 설계 부분)
- Section 6(개요): 아키텍처 다이어그램 + 5개 컴포넌트 + 패키지 위치/운영 모델 + 데이터 흐름 시퀀스
- Section 7(IPushProvider): 인터페이스 정의 + PushPayload Zod 스키마(5필드) + PushResult Zod 스키마(3필드) + createProvider 팩토리
- Section 8(프로바이더): PushwooshProvider(createMessage API + 매핑 표 + 에러 처리) + FcmProvider(OAuth2 인증 흐름 + HTTP v1 단건 전송 + 재시도 + access_token 캐시)
- Section 9(ntfy 구독): NtfySubscriber(SSE + 지수 백오프 재연결 + heartbeat 60초) + buildTopics(walletId x 2) + MessageParser(토픽 패턴 분기 + 변환 매핑 표)
- Section 10(디바이스 API): DeviceRegistrationSchema + POST/DELETE /devices + SQLite 스키마(relay.db) + DeviceRegistry 4메서드 + invalidTokens 자동 정리 + Hono 라우트
- Section 11(config): RelayConfigSchema Zod + superRefine 조건부 검증 + TOML 예시(Pushwoosh/FCM) + 환경변수 오버라이드 10개 + config.example.toml
- Section 12(Docker): Dockerfile 멀티스테이지(node:22-alpine) + docker-compose.yml + 볼륨 구조 + 배포 가이드 5단계 + 파일/모듈 구조(15파일)
- Section 13(기술 결정): 알림 채널 4개 + Push Relay 6개 = 총 10개 설계 결정 + 문서 메타데이터

## Task Commits

Each task was committed atomically:

1. **Task 1: IPushProvider + PushwooshProvider + FcmProvider + ntfy SSE 구독 설계** - `c4e5d23` (docs)
2. **Task 2: 디바이스 토큰 API + config.toml + Docker 배포 + 기술 결정 요약** - `7c83414` (docs)

## Files Created/Modified
- `internal/design/75-notification-channel-push-relay.md` - 알림 채널 + Push Relay Server 설계서 (Sections 6-13 추가, 전체 13개 섹션 완성)

## Decisions Made
- IPushProvider 인터페이스: `send(tokens, payload)` + `validateConfig()` 2메서드 구조. createProvider 팩토리로 프로바이더 분기
- FCM HTTP v1 단건 전송: `sendAll`/`sendMulticast` deprecated 대비하여 `messages:send` 단건 API + `Promise.allSettled` 병렬 처리
- FCM access_token: 메모리 캐시, 만료 5분 전 자동 갱신, jose 라이브러리로 RS256 JWT 서명 (WAIaaS 본체와 동일)
- NtfySubscriber: ntfy 다중 토픽 SSE 구독(콤마 구분)으로 단일 연결, heartbeat 60초 타임아웃, 지수 백오프 1s-60s
- DeviceRegistry: push_token을 자연 PK로 사용, invalidTokens(FCM 404/410) 자동 정리
- Push Relay config.toml: WAIaaS flat-key 정책 미적용 (별도 패키지), `relay_` 접두어로 네이밍, superRefine 조건부 검증
- Docker: 멀티스테이지 빌드(build+production), 비루트 사용자(relay:1001), VOLUME /data + /config 분리
- 환경변수 오버라이드 10개: Docker 환경에서 config.toml 없이도 설정 주입 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- doc 75 전체 13개 섹션 완성으로 m26-02(알림 채널) + m26-03(Push Relay Server) 구현 시 바로 시작 가능
- RELAY-01/02/03/04 모두 충족으로 Push Relay Server 설계 요건 완료
- NOTIF-01/02/03 (Plan 200-01) + RELAY-01/02/03/04 (Plan 200-02) = Phase 200 전체 요건 완료

## Self-Check: PASSED

- FOUND: internal/design/75-notification-channel-push-relay.md
- FOUND: .planning/phases/200-notification-channel-push-relay-design/200-02-SUMMARY.md
- FOUND: c4e5d23 (Task 1 commit)
- FOUND: 7c83414 (Task 2 commit)

---
*Phase: 200-notification-channel-push-relay-design*
*Completed: 2026-02-20*
