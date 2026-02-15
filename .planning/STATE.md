# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 124 — 알림 시스템 개선

## Current Position

Phase: 124 (5 of 5 in v1.4.8) — 알림 시스템 개선
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-02-15 — Phase 123 complete (Admin UI 개선, 2/2 plans)

Progress: [██████░░░░] 75% (6/8 plans)

## Performance Metrics

**Cumulative:** 27 milestones, 119 phases, 262 plans, 711 reqs, 1,679 tests, ~176,000 LOC

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 120 | 01 | 6min | 1 (TDD) | 2 |
| 121 | 01 | 2min | 1 (TDD) | 4 |
| 122 | 01 | 8min | 2 | 15 |
| 122 | 02 | 8min | 2 | 12 |
| 123 | 01 | 3min | 2 | 3 |
| 123 | 02 | 6min | 2 | 7 |

## Accumulated Context

### Decisions

Full log in PROJECT.md.
- pushSchema 순서를 테이블 -> 마이그레이션 -> 인덱스 3단계로 분리 (MIGR-01 해결)
- v1 DB agents 테이블 존재 시 wallets 생성 스킵 (v3 마이그레이션 충돌 방지, MIGR-01b)
- shutdown 로직을 createShutdownHandler() 팩토리로 추출하여 DI 기반 테스트 가능하게 함
- shutdown 핸들러를 server.connect() 이전에 등록 -- stdin 즉시 닫힘 대비
- 세션 스코프 PUT /v1/wallet/default-network: MCP sessionAuth로 기본 네트워크 변경 가능하도록
- Python SDK get_wallet_info()에서 availableNetworks를 networks로 매핑
- wireEvmTokens() 헬퍼 추출: ERC-20 토큰 와이어링 코드 중복 제거
- getAllBalances()/getAllAssets()를 별도 메서드로 분리: 타입 안전성 우선 (이슈 021 설계 결정)
- network=all 분기 OpenAPI typed route는 `as never` cast로 런타임 분기 처리
- StatCard href는 hash 라우팅(#/wallets 등) 사용 -- SPA 라우팅과 일치
- createdAt 필드를 epoch seconds로 변환하여 응답 -- 기존 API 패턴 유지
- Failed Txns 뱃지: 0건=success, 1건+=danger -- 시각적 즉시 인지 가능
- 세션 조회 leftJoin wallets로 walletName 포함 -- 프론트엔드 추가 요청 최소화
- 잔액 API 실패 시 200 + error 필드 반환 -- 에러 격리로 UI 안정성 확보
- Admin 월렛 하위 리소스 /admin/wallets/:id/* masterAuth 와일드카드 적용

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing settings-service.test.ts (SETTING_DEFINITIONS count 32 vs 35)
- ~~MIGR-01 (pushSchema 순서) is HIGH priority -- 기존 DB에서 데몬 시작 차단~~ RESOLVED in 120-01

## Session Continuity

Last session: 2026-02-15
Stopped at: Phase 123 verified and merged, ready to plan Phase 124
Resume file: None
