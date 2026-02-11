# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.3.1 Admin Web UI 설계 완료 — Phase 64-65 complete

## Current Position

Phase: 65 of 65 (페이지 + 컴포넌트 + API 연동 설계)
Plan: 1 of 1 in current phase
Status: Phase complete
Last activity: 2026-02-11 — Completed 65-01-PLAN.md

Progress: [██████████] 100% (2/2 plans)

## Performance Metrics

**Cumulative:** 15 milestones, 63 phases, 153 plans, 416 reqs, 784 tests, 33,929 LOC

## Accumulated Context

### Decisions

Full log in PROJECT.md. v1.3.1 objectives 문서에서 기술 결정 9건 확정:
- Preact 10.x (3KB gzip), preact-iso 해시 라우터, @preact/signals
- Vite 6.x + Custom CSS + CSS Variables
- masterAuth 전용 (JWT 미사용), 15분 비활성 타임아웃
- packages/admin 별도 패키지 (devDependencies 분리)
- 영문 단일, API 캐싱 없음

Phase 64 설계 결정 5건:
- masterAuth X-Master-Password 헤더 매 요청 전송, JWT 세션 미사용
- admin_timeout은 GET /v1/admin/status 응답의 adminTimeout 필드로 전달 (별도 엔드포인트 없음)
- 빌드 산출물 packages/daemon/public/admin/ git-ignored, CI에서 빌드 후 패키징
- CSP default-src 'none' (가장 엄격한 기본값), script-src 'self'
- CSRF 토큰 불필요: 커스텀 헤더 + CORS 미설정으로 cross-origin 차단

Phase 65 설계 결정 8건:
- Dashboard 30s setInterval 폴링 (SSE/WebSocket 불필요)
- Agent/Policy 생성 폼은 인라인 (모달 아님)
- Session 토큰 1회 표시 후 재조회 불가 (DB 해시 전용)
- SPENDING_LIMIT 티어 시각화: INSTANT(green)/DELAY(amber)/BLOCKED(red) 수평 바
- Shutdown 오버레이는 Auth Guard보다 우선 (daemonShutdown 전역 signal)
- 클라이언트 검증은 Zod 미임포트, 경량 함수로 서버 규칙 미러링
- 68 에러 코드 전체 매핑 (Admin UI 미사용 코드 포함, 견고성)
- CSS Variables 구조로 다크 모드 향후 확장 가능

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect
- Kill switch state in-memory only (v1.3 DB 미저장)

## Session Continuity

Last session: 2026-02-11T04:33:47Z
Stopped at: Completed 65-01-PLAN.md, Phase 65 complete
Resume file: None
