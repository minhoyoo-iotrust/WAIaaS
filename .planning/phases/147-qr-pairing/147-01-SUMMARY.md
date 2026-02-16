---
phase: 147-qr-pairing
plan: 01
subsystem: api
tags: [walletconnect, qrcode, rest-api, openapi, pairing, session]

# Dependency graph
requires:
  - phase: 146-wc-infra
    provides: "WcSessionService, SqliteKeyValueStorage, wc_sessions DB table, SignClient lifecycle"
provides:
  - "WcSessionService.createPairing() -- 페어링 URI + QR 코드 생성 + 비동기 approval 대기"
  - "WcSessionService.getSessionInfo() -- DB에서 WC 세션 정보 조회"
  - "WcSessionService.getPairingStatus() -- 페어링/세션 상태 폴링"
  - "WcSessionService.disconnectSession() -- WC 세션 해제 (relay + DB + 메모리)"
  - "WcSessionService.getSessionTopic() -- 공개 세션 토픽 접근자"
  - "CAIP2_CHAIN_IDS 상수 맵 (Solana 3 + EVM 10 네트워크)"
  - "REST API 4개 엔드포인트: POST pair, GET session, DELETE session, GET pair/status"
  - "OpenAPI 스키마: WcPairingResponse, WcSessionResponse, WcPairingStatusResponse, WcDisconnectResponse"
  - "WC_NOT_CONFIGURED(503), WC_SESSION_EXISTS(409), WC_SESSION_NOT_FOUND(404) 에러 코드"
affects: [148-session-request, admin-wc-ui, cli-owner-connect]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "서버사이드 QR 생성: createRequire + qrcode.toDataURL() -> base64 data URL"
    - "비동기 approval: signClient.connect() -> { uri, approval } -> 즉시 URI 반환 + 백그라운드 approval() 대기"
    - "pendingPairing Map: 중복 페어링 방지 + 상태 폴링용 in-memory 추적"
    - "CAIP-2 상수 맵: 네트워크 이름 -> WC v2 chain ID 변환"

key-files:
  created:
    - packages/daemon/src/api/routes/wc.ts
    - packages/daemon/src/__tests__/wc-pairing.test.ts
  modified:
    - packages/daemon/src/services/wc-session-service.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "requiredNamespaces를 Record<string, ...> 타입으로 별도 변수로 추출하여 TS computed property 에러 해결"
  - "wc.ts 라우트에서 Drizzle query builder 대신 raw SQL (db.session.client) 사용 -- 단순 SELECT에 ORM 오버헤드 불필요"
  - "pendingPairing 중복 요청 시 기존 URI를 새 QR로 재생성하여 반환 (connect() 재호출 방지)"

patterns-established:
  - "WC 라우트 패턴: /v1/wallets/:id/wc/* 경로, masterAuth 보호, WcRouteDeps 의존성 주입"

# Metrics
duration: 8min
completed: 2026-02-16
---

# Phase 147 Plan 01: QR 페어링 + REST API Summary

**WcSessionService에 createPairing/disconnect/getSessionInfo/getPairingStatus 메서드 추가 + REST API 4개 엔드포인트(pair, session GET/DELETE, pair/status) + CAIP-2 상수 맵 + 18개 단위 테스트**

## Performance

- **Duration:** 8min
- **Started:** 2026-02-16T10:48:39Z
- **Completed:** 2026-02-16T10:57:29Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- WcSessionService에 5개 메서드 + pendingPairing Map + PairingResult/WcSessionInfo/PairingStatus 타입 추가
- REST API 4개 엔드포인트 (masterAuth 보호) + OpenAPI 스키마 4개 등록
- CAIP2_CHAIN_IDS 상수 맵 (13 네트워크: Solana 3 + EVM 10)
- WC_NOT_CONFIGURED/WC_SESSION_EXISTS/WC_SESSION_NOT_FOUND 에러 코드 3개 (core + i18n en/ko)
- 18개 단위 테스트 통과 + 기존 1,551개 테스트 회귀 없음 (총 1,569개)

## Task Commits

Each task was committed atomically:

1. **Task 1: WcSessionService 페어링/세션 관리 메서드 + CAIP-2 상수 + 에러 코드** - `54563b4` (feat)
2. **Task 2: REST API 라우트 + server.ts 등록 + OpenAPI 스키마 + 테스트** - `1cb8d60` (feat)

## Files Created/Modified
- `packages/daemon/src/services/wc-session-service.ts` - createPairing, waitForApproval, getSessionInfo, getPairingStatus, disconnectSession, getSessionTopic 메서드 + CAIP2_CHAIN_IDS 상수
- `packages/daemon/src/api/routes/wc.ts` - **NEW** 4개 REST 엔드포인트 (pair, session GET/DELETE, pair/status)
- `packages/daemon/src/api/routes/openapi-schemas.ts` - WcPairingResponse, WcSessionResponse, WcPairingStatusResponse, WcDisconnectResponse 스키마
- `packages/daemon/src/api/server.ts` - wcRoutes import/등록 + masterAuth /v1/wallets/:id/wc/* + skip 조건 추가
- `packages/core/src/errors/error-codes.ts` - WC_NOT_CONFIGURED, WC_SESSION_EXISTS, WC_SESSION_NOT_FOUND 에러 코드
- `packages/core/src/i18n/en.ts` - WC 에러 코드 영어 메시지
- `packages/core/src/i18n/ko.ts` - WC 에러 코드 한글 메시지
- `packages/daemon/src/__tests__/wc-pairing.test.ts` - **NEW** 18개 단위 테스트

## Decisions Made
- requiredNamespaces를 `Record<string, ...>` 타입 변수로 추출 -- TS가 computed property 키 타입(`string | undefined`)을 거부하는 문제 해결
- wc.ts 라우트에서 `(db as any).session.client`로 raw SQLite 접근 -- 단순 wallet 조회에 Drizzle query builder 대신 직접 SQL 사용 (기존 wc-session-service.ts 패턴과 일치)
- pendingPairing 중복 요청 시 새 `signClient.connect()` 호출 없이 기존 URI에 대한 QR을 재생성하여 반환 -- relay 충돌 방지

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS computed property name 에러 수정**
- **Found during:** Task 1 (WcSessionService 빌드)
- **Issue:** `chainId.split(':')[0]` 반환 타입이 `string | undefined`로 추론되어 WC SDK의 requiredNamespaces 키로 사용 시 TS2464 에러
- **Fix:** requiredNamespaces 객체를 `Record<string, ...>` 타입 변수로 별도 선언
- **Files modified:** packages/daemon/src/services/wc-session-service.ts
- **Verification:** `pnpm build --filter=@waiaas/daemon` 성공
- **Committed in:** 54563b4 (Task 1 commit)

**2. [Rule 3 - Blocking] 미사용 헬퍼 함수 제거**
- **Found during:** Task 2 (wc.ts 빌드)
- **Issue:** 초기 작성 시 Drizzle query builder 기반 `getWalletOrThrow` 헬퍼를 만들었으나 raw SQL 방식으로 전환 후 미사용 함수가 TS6133 에러 유발
- **Fix:** 미사용 `getWalletOrThrow` 함수 제거
- **Files modified:** packages/daemon/src/api/routes/wc.ts
- **Verification:** `pnpm build --filter=@waiaas/daemon` 성공
- **Committed in:** 1cb8d60 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** 빌드 에러 수정만. 기능 범위 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WC 페어링/세션 REST API 인프라 완비
- Phase 147-02 (Admin UI QR 모달, CLI owner connect)에서 이 API를 호출하여 UI/CLI 지원 추가 가능
- Phase 148 (session_request 처리)에서 WcSessionService.getSessionTopic()으로 활성 세션 토픽 접근 가능

## Self-Check: PASSED

All 7 files verified present. Both task commits (54563b4, 1cb8d60) confirmed in git log. 1,569 tests passing.

---
*Phase: 147-qr-pairing*
*Completed: 2026-02-16*
