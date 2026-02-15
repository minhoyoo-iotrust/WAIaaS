# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 122 — MCP 도구 + 멀티체인 DX

## Current Position

Phase: 122 (3 of 5 in v1.4.8) — MCP 도구 + 멀티체인 DX -- COMPLETE
Plan: 2 of 2 in current phase (all complete)
Status: Phase Complete
Last activity: 2026-02-15 — 122-02 complete (network=all balance/assets, MCP/SDK/Python/Skill update)

Progress: [████░░░░░░] 50% (4/8 plans)

## Performance Metrics

**Cumulative:** 27 milestones, 119 phases, 260 plans, 711 reqs, 1,679 tests, ~176,000 LOC

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 120 | 01 | 6min | 1 (TDD) | 2 |
| 121 | 01 | 2min | 1 (TDD) | 4 |
| 122 | 01 | 8min | 2 | 15 |
| 122 | 02 | 8min | 2 | 12 |

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

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing settings-service.test.ts (SETTING_DEFINITIONS count 32 vs 35)
- ~~MIGR-01 (pushSchema 순서) is HIGH priority -- 기존 DB에서 데몬 시작 차단~~ RESOLVED in 120-01

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 122-02-PLAN.md (network=all balance/assets, MCP/SDK/Python/Skill)
Resume file: None
