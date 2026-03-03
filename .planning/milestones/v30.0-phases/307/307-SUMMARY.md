---
phase: 307
plan: 01-02
subsystem: webhook
tags: [webhook, hmac-sha256, eventbus, rest-api, aes-gcm, retry-queue]

# Dependency graph
requires:
  - phase: 305
    provides: AuditEventType 20-event taxonomy for webhook event filtering
provides:
  - webhooks + webhook_logs DB schema (Drizzle + Zod SSoT)
  - HMAC-SHA256 signing protocol with X-WAIaaS-Signature header
  - Async retry queue design (4 attempts, exponential backoff)
  - REST API 4 endpoints (POST/GET/DELETE webhooks, GET logs)
  - EventBus integration and event filtering mechanism
  - WebhookService independent architecture
affects: [308-admin-stats, implementation-milestone, doc-25-sqlite, doc-35-notification, doc-37-rest-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [webhook-hmac-signing, secret-dual-storage, fire-and-forget-queue]

key-files:
  created:
    - .planning/phases/307/PLAN-307-01.md
    - .planning/phases/307/PLAN-307-02.md
    - .planning/phases/307/DESIGN-SPEC.md
  modified: []

key-decisions:
  - "WebhookService is independent of INotificationChannel (different concerns: N URLs + HMAC + retry vs single channel + fallback)"
  - "Secret dual-storage: SHA-256 hash (API exposure prevention) + AES-256-GCM encrypted (HMAC generation)"
  - "In-memory queue with setTimeout (no external MQ needed for self-hosted single process)"
  - "4xx responses abort retry immediately (client errors are not transient)"
  - "Webhook events reuse Phase 305 AuditEventType 20-event taxonomy"
  - "Empty events array means wildcard subscription (receive all events)"
  - "Best-effort delivery: in-flight jobs lost on daemon restart (acceptable trade-off)"

patterns-established:
  - "Webhook HMAC signing: sha256={hex} prefix format (GitHub convention)"
  - "Secret lifecycle: server-generated, one-time disclosure, AES-GCM encrypted storage"
  - "Fire-and-forget queue integration with EventBus listeners"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05]

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 307: Webhook Outbound 설계 Summary

**Webhook outbound HMAC-SHA256 서명 프로토콜, 재시도 큐, REST API 4개 엔드포인트, EventBus 이벤트 필터링 메커니즘 설계 완료**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-03T08:16:13Z
- **Completed:** 2026-03-03T08:24:47Z
- **Tasks:** 3 (Plan 307-01, Plan 307-02, DESIGN-SPEC)
- **Files created:** 3

## Accomplishments

- webhooks + webhook_logs 테이블 스키마 정의 (Drizzle + Zod SSoT, 19 -> 21 테이블)
- HMAC-SHA256 서명 생성/검증 프로토콜 정의 (X-WAIaaS-Signature 헤더, 수신 측 검증 가이드 포함)
- Secret 이중 보안 모델: SHA-256 해시 (노출 방지) + AES-256-GCM 암호화 (HMAC 서명 생성)
- 비동기 재시도 큐 설계: 최대 4회 시도, 지수 백오프 1s-2s-4s, fire-and-forget 비블로킹
- REST API 4 엔드포인트: POST/GET/DELETE /v1/webhooks + GET /v1/webhooks/:id/logs (masterAuth)
- EventBus 연동: 8개 이벤트 매핑 + 7개 직접 호출, webhooks.events JSON 필터링
- WebhookService 독립 아키텍처 결정 (INotificationChannel 미구현)
- 21개 테스트 시나리오 정의

## Task Commits

Each task was committed atomically:

1. **Task 1: DB schema + HMAC signing + retry queue** - `bc4b9c1c` (docs)
2. **Task 2: REST API spec + EventBus integration** - `178e6f22` (docs)
3. **Task 3: Consolidated DESIGN-SPEC** - `6428fd99` (docs)

## Files Created

- `.planning/phases/307/PLAN-307-01.md` - DB schema, HMAC protocol, retry queue design
- `.planning/phases/307/PLAN-307-02.md` - REST API spec, EventBus integration, doc updates
- `.planning/phases/307/DESIGN-SPEC.md` - Consolidated design specification

## Decisions Made

1. **WebhookService 독립 구조**: INotificationChannel과 관심사가 다르다 (N개 URL + HMAC 서명 + 개별 재시도 vs 단일 채널 + 폴백 체인). 독립 서비스로 운영.
2. **Secret 이중 저장**: SHA-256 해시 (GET 조회 시 노출 방지) + AES-256-GCM 암호화 (HMAC 서명 생성 시 복호화). settings-crypto 패턴 재사용.
3. **인메모리 큐**: Self-Hosted 단일 프로세스이므로 외부 MQ 불필요. setTimeout 기반 재시도.
4. **4xx 즉시 중단**: 클라이언트 에러는 재시도로 해결되지 않으므로 즉시 중단. 5xx/네트워크 에러만 재시도.
5. **AuditEventType 재사용**: Phase 305에서 정의한 20개 감사 이벤트를 webhook 구독 이벤트로 재사용하여 이벤트 체계 일관성 유지.
6. **빈 배열 와일드카드**: `events: []`은 모든 이벤트 구독을 의미. 간단한 설정으로 전체 구독 가능.
7. **Best-effort 전달**: 인메모리 큐이므로 데몬 재시작 시 미완료 전송 유실. 수용 가능한 트레이드오프.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 308 (Admin Stats + AutoStop Plugin) 설계 준비 완료
- Phase 308은 Phase 304 (TX stats 참조) + Phase 305 (감사 이벤트) 의존성 활용
- 현재 Phase 307까지 완료, v30.0 마일스톤 마지막 Phase 308 남음

## Self-Check: PASSED

- [x] PLAN-307-01.md exists
- [x] PLAN-307-02.md exists
- [x] DESIGN-SPEC.md exists
- [x] 307-SUMMARY.md exists
- [x] Commit bc4b9c1c found
- [x] Commit 178e6f22 found
- [x] Commit 6428fd99 found

---
*Phase: 307*
*Completed: 2026-03-03*
