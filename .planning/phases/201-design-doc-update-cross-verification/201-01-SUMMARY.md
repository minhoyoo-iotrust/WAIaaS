---
phase: 201-design-doc-update-cross-verification
plan: 01
subsystem: docs
tags: [design-docs, cross-verification, notification, rest-api, sqlite, admin-ui]

# Dependency graph
requires:
  - phase: 198-signing-protocol
    provides: "doc 73 Signing Protocol v1 스키마 + 채널 프로토콜"
  - phase: 199-wallet-sdk
    provides: "doc 74 Wallet SDK + Daemon 컴포넌트 설계"
  - phase: 200-notification-push-relay
    provides: "doc 75 알림 채널 + Push Relay Server 설계"
provides:
  - "doc 35에 WalletNotificationChannel 4번째 어댑터 + 서명/알림 토픽 분리 구조 반영"
  - "doc 37에 PUT /v1/wallets/:id/owner approval_method 필드 + GET 응답 owner_approval_method"
  - "doc 25에 wallets.owner_approval_method 컬럼 + CHECK 제약 + 마이그레이션 4.15"
  - "doc 67에 Wallet Detail Owner Settings > Approval Method UI 와이어프레임 + ApprovalMethodSelector"
  - "4개 문서 간 교차 검증 5항목 PASS"
affects: [m26-01-wallet-signing-sdk, m26-02-wallet-notification-channel]

# Tech tracking
tech-stack:
  added: []
  patterns: ["v2.6 설계 문서 보완 시 [v2.6] 접두어 + 참조 문서 링크 패턴"]

key-files:
  created: []
  modified:
    - "internal/design/35-notification-architecture.md"
    - "internal/design/37-rest-api-complete-spec.md"
    - "internal/design/25-sqlite-schema.md"
    - "internal/design/67-admin-web-ui-spec.md"

key-decisions:
  - "INotificationChannel type에 'WALLET_NTFY' 추가하여 4번째 채널 타입 확장"
  - "REST API 요청 필드는 approval_method, 응답/DB 컬럼은 owner_approval_method로 명명 일관성 유지"
  - "SQLite 마이그레이션은 ALTER TABLE ADD COLUMN만으로 충분 (NULL 허용이므로 테이블 재생성 불필요)"

patterns-established:
  - "설계 문서 보완 시 [vX.Y] 접두어로 변경 추적 + 원본 문서 섹션 참조 링크"

requirements-completed: [DOCS-01, DOCS-02, DOCS-03, DOCS-04]

# Metrics
duration: 7min
completed: 2026-02-20
---

# Phase 201 Plan 01: 기존 설계 문서 4개 갱신 + 교차 검증 Summary

**doc 35/37/25/67에 v2.6 신규 설계(WalletNotificationChannel, approval_method, 토픽 분리)를 통합하고 5항목 교차 검증 PASS**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-19T16:01:30Z
- **Completed:** 2026-02-19T16:08:10Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- doc 35에 WalletNotificationChannel 4번째 INotificationChannel 구현체 + 서명/알림/응답 3개 토픽 분리 구조 추가
- doc 37에 PUT /v1/wallets/:id/owner 스키마 확장(approval_method 5-enum) + GET 응답 owner_approval_method 필드 추가
- doc 25에 wallets.owner_approval_method 컬럼(Drizzle + SQL DDL + CHECK 제약) + 마이그레이션 4.15 + 전체 스키마 export 동기화
- doc 67에 Wallet Detail Owner Settings 와이어프레임 + ApprovalMethodSelector 컴포넌트(6개 라디오, disabled 규칙, 경고 메시지)
- 5항목 교차 검증(enum 값, 컬럼명, 토픽 접두어, NULL 의미, 참조 무결성) 모두 PASS

## Task Commits

Each task was committed atomically:

1. **Task 1: doc 35 알림 아키텍처 + doc 37 REST API 업데이트** - `7540e32` (docs)
2. **Task 2: doc 25 SQLite 스키마 + doc 67 Admin UI 업데이트** - `a97b1b6` (docs)
3. **Task 3: 교차 검증 + 일관성 확인** - 변경 없음 (검증 전용, 불일치 0건)

## Files Created/Modified

- `internal/design/35-notification-architecture.md` - WalletNotificationChannel 어댑터 + 서명/알림 토픽 분리 + 섹션 13.2 + 요구사항 매핑
- `internal/design/37-rest-api-complete-spec.md` - 섹션 8.19 approval_method 스키마 확장 + 엔드포인트 맵 v2.6 주석
- `internal/design/25-sqlite-schema.md` - owner_approval_method 컬럼(Drizzle/SQL/CHECK) + 마이그레이션 4.15 + 전체 스키마 export + v2.6 요구사항
- `internal/design/67-admin-web-ui-spec.md` - Owner Settings 와이어프레임 + ApprovalMethodSelector 컴포넌트 + 참조 문서 추가

## Decisions Made

- INotificationChannel type에 `'WALLET_NTFY'` 추가: 기존 `'TELEGRAM' | 'DISCORD' | 'NTFY'` union에 4번째 타입을 추가하여 타입 안전성 유지
- REST API naming: 요청 필드 `approval_method` (간결) vs DB/응답 필드 `owner_approval_method` (명시적) -- doc 74 원본 설계와 동일
- 마이그레이션 전략: NULL 허용 컬럼이므로 ALTER TABLE ADD COLUMN만으로 충분, CHECK 제약은 앱 레벨(Zod) 처리

## Deviations from Plan

None - plan executed exactly as written.

## Cross-Verification Results

| # | 검증 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | enum 값 일관성 (5개) | PASS | doc 25 CHECK, doc 37 z.enum, doc 67 라디오 옵션 모두 sdk_ntfy/sdk_telegram/walletconnect/telegram_bot/rest 동일 |
| 2 | 컬럼명 일관성 | PASS | DB: owner_approval_method, Drizzle: ownerApprovalMethod, API 요청: approval_method, API 응답: owner_approval_method |
| 3 | 토픽 접두어 일관성 | PASS | doc 35/73: waiaas-sign-{walletId}, doc 35/75: waiaas-notify-{walletId}, doc 35/73: waiaas-response-{requestId} |
| 4 | NULL 의미 일관성 | PASS | doc 25: NULL=글로벌 fallback, doc 37: null=글로벌 fallback 초기화, doc 67: "Use default"=NULL |
| 5 | 문서 간 참조 무결성 | PASS | doc 35->73/74/75, doc 37->74, doc 25->74, doc 67->74 모두 참조 존재 |

**교차 검증 결과: 5/5 PASS, 설계 부채 0건**

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v2.6 마일스톤 설계 문서 갱신 완료, 구현 단계에서 단일 소스 참조 가능
- 4개 설계 문서가 doc 73/74/75 신규 설계와 통합되어 일관성 확보

---
*Phase: 201-design-doc-update-cross-verification*
*Completed: 2026-02-20*
