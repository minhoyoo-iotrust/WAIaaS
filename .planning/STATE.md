# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v2.6 Wallet SDK 설계 - Phase 200 complete (알림 채널 + Push Relay Server 설계)

## Current Position

Phase: 200 of 201 (알림 채널 + Push Relay Server 설계)
Plan: 2 of 2 in current phase (complete)
Status: In Progress
Last activity: 2026-02-20 — Plan 200-02 completed (Push Relay Server IPushProvider + Pushwoosh/FCM + Docker 배포 설계)

Progress: [########░░] 86% (6/7 plans)

## Performance Metrics

**Cumulative:** 45 milestones, 197 phases, 415 plans, 1,151 reqs, ~4,066+ tests, ~151,015+ LOC TS

**v2.6 Scope:** 4 phases, 23 requirements, ~7 plans (TBD)

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.
v2.6 design decisions: See internal/objectives/m26-00 through m26-03.

**198-01 decisions:**
- message 필드에 UTF-8 원문 텍스트 저장, 인코딩은 체인 라이브러리가 처리
- Nonce는 requestId(UUID v7) 재사용
- signature 인코딩: EVM hex(0x), Solana base64
- 2KB 초과 시 requestId 기반 ntfy 조회 fallback

**198-02 decisions:**
- ntfy 응답 토픽은 requestId 기반 1회용 (122비트 엔트로피, 토픽 자체가 인증)
- Telegram 응답은 chatId + signerAddress + 서명 검증의 3중 보안
- 자동 재시도 없음 원칙: 만료 후 새 SignRequest 생성 필요
- 프로덕션에서 self-hosted ntfy 권장

**199-01 decisions:**
- parseSignRequest 반환 타입 SignRequest | Promise<SignRequest>로 인라인/ntfy 조회 2모드 지원
- zod만 peerDependency, fetch/EventSource/URL은 내장 API로 의존성 최소화
- tsup ESM+CJS dual output, ES2022 타겟으로 React Native/Electron/Node.js 지원
- sendViaTelegram은 void 반환 (URL 스킴 호출은 비동기 결과 확인 불가)

**199-02 decisions:**
- ISigningChannel 공통 인터페이스: sendRequest+waitForResponse 2메서드로 ntfy/telegram 채널 교체 가능
- WalletLinkRegistry 저장소를 SettingsService signing_sdk.wallets JSON 배열로 결정 (별도 테이블 불필요)
- ApprovalChannelRouter 5단계 fallback: ownerApprovalMethod > SDK > WC > Telegram Bot > REST
- owner_approval_method CHECK 제약 + NULL 허용 (NULL=글로벌 fallback)
- SignRequest 임시 저장소: 메모리 Map 기본 사용
- ntfy 서버 URL: 기존 notifications.ntfy_server 재사용
- Telegram /sign_response 핸들러: 기존 Long Polling handleUpdate()에 명령어 추가

**200-01 decisions:**
- 서명/알림 토픽 분리: waiaas-sign-*/waiaas-notify-* 접두어로 동일 ntfy 서버 내 구분
- ntfy priority 차등: security_alert=5, policy_violation=4, 나머지=3
- NotificationMessage type:'notification' 필드로 SignRequest와 구분
- SDK export 8개 (기존 6개 + subscribeToNotifications + parseNotification)
- WalletNotificationChannel 5단계 필터: walletId > sdk_ntfy > enabled > categories > publish
- NotificationEventType 25종 → NotificationCategory 6종 매핑
- SettingsService 알림 3키로 doc 74의 6키와 합쳐 총 9개 signing_sdk 키

**200-02 decisions:**
- IPushProvider 인터페이스: send(tokens, payload) + validateConfig() 2메서드, createProvider 팩토리
- FCM HTTP v1 단건 전송 + Promise.allSettled 병렬, access_token 만료 5분 전 자동 갱신
- NtfySubscriber: 다중 토픽 SSE(콤마 구분 단일 연결), 지수 백오프 1s-60s, heartbeat 60초
- DeviceRegistry: push_token 자연 PK, invalidTokens(FCM 404/410) 자동 정리
- Push Relay config.toml: 별도 패키지이므로 중첩 섹션 허용, superRefine 조건부 검증
- Docker 멀티스테이지(node:22-alpine) + 환경변수 오버라이드 10개

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 200-02-PLAN.md (Push Relay Server IPushProvider + Pushwoosh/FCM + Docker 배포 설계)
Resume file: None
