---
phase: 46-ext-release-objectives
plan: 01
subsystem: docs
tags: [objective, v1.5, v1.6, defi, oracle, desktop, telegram, docker, tauri, killswitch]

# Dependency graph
requires:
  - phase: 45-core-impl-objectives
    provides: v1.1~v1.4 objective 문서 4개 + 부록 구조 패턴
provides:
  - v1.5 DeFi + 가격 오라클 마일스톤 objective 문서 (28개 E2E 시나리오)
  - v1.6 Desktop + Telegram + Docker 마일스톤 objective 문서 (33개 E2E 시나리오)
affects: [46-02 (v1.7/v2.0 objective), v1.5 구현 phases, v1.6 구현 phases]

# Tech tracking
tech-stack:
  added: []
  patterns: [objective 부록 구조 7섹션 패턴 유지]

key-files:
  created:
    - objectives/v1.5-defi-price-oracle.md
    - objectives/v1.6-desktop-telegram-docker.md
  modified: []

key-decisions:
  - "v1.5 CoinGecko 무료 Demo API 기본 (Pro 키 선택적, 5분 TTL 캐시로 rate limit 완화)"
  - "v1.5 Pyth Oracle Hermes HTTP API 우선 (온체인 호출 대비 구현 단순성)"
  - "v1.5 Chainlink EVM 전용 (Solana는 Pyth가 대안)"
  - "v1.5 Jupiter API fetch 직접 호출 (SDK 미사용, 의존성 최소화)"
  - "v1.5 Action Provider ESM dynamic import (Node.js 22 네이티브)"
  - "v1.5 MCP Tool 16개 초과 시 config.toml tool_priority 배열 기반 우선순위"
  - "v1.5 가격 캐시 인메모리 Map 기반 LRU 128항목 (외부 라이브러리 미사용)"
  - "v1.6 Telegram Bot native fetch 전용 (외부 프레임워크 미사용, NOTI-ARCH 결정 계승)"
  - "v1.6 Docker base node:22-slim (alpine 대비 native addon 호환성 우수)"
  - "v1.6 Kill Switch CAS SQLite BEGIN IMMEDIATE + WHERE state=expected (CONC-03)"
  - "v1.6 AutoStop 규칙 config.toml 저장 (policies 테이블과 혼용 방지)"

patterns-established:
  - "v0.10 설계 결정 반영 테이블: 결정 ID/내용/적용 범위 구조"
  - "v1.4/v1.5 이미 구현된 부분 vs v1.6에서 새로 추가하는 부분 구분 섹션"

# Metrics
duration: 8min
completed: 2026-02-09
---

# Phase 46 Plan 01: v1.5/v1.6 Objective 문서 Summary

**v1.5 DeFi+가격오라클(IPriceOracle 3구현체+OracleChain+ActionProvider+Jupiter Swap, 28 E2E) + v1.6 Desktop+Telegram+Docker(Tauri 8화면+Kill Switch CAS+AutoStop 5규칙, 33 E2E) objective 문서 2개 생성**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-09T13:56:41Z
- **Completed:** 2026-02-09T14:04:33Z
- **Tasks:** 2/2
- **Files created:** 2

## Accomplishments

- v1.5 objective: 설계 문서 61/62/63 전체 구현 범위 정의, IPriceOracle+OracleChain+ActionProviderRegistry+JupiterSwap 8개 컴포넌트, 28개 E2E 시나리오(27 [L0] + 1 [HUMAN]), v0.10 OPER-03 교차 검증 인라인+가격 나이 3단계 반영
- v1.6 objective: 설계 문서 39/40/36 구현 범위 정의, Tauri 8화면+Sidecar+Telegram 9명령어+KillSwitch CAS+AutoStop+Docker 9개 컴포넌트, 33개 E2E 시나리오(26 자동화 + 7 [HUMAN]), v0.10 CONC-03 Kill Switch 4전이 CAS ACID 반영
- 두 문서 모두 부록 구조 7개 섹션 완전 준수, 리스크 각 7건 식별

## Task Commits

Each task was committed atomically:

1. **Task 1: v1.5 DeFi + 가격 오라클 objective 문서 생성** - `b1a6894` (docs)
2. **Task 2: v1.6 Desktop + Telegram Bot + Docker objective 문서 생성** - `693cd51` (docs)

## Files Created/Modified

- `objectives/v1.5-defi-price-oracle.md` - v1.5 마일스톤 objective (IPriceOracle, OracleChain, ActionProvider, Jupiter Swap, USD 정책, 28 E2E)
- `objectives/v1.6-desktop-telegram-docker.md` - v1.6 마일스톤 objective (Tauri Desktop, Telegram Bot, Kill Switch, AutoStop, Docker, 33 E2E)

## Decisions Made

### v1.5 기술 결정 (8건)

1. CoinGecko 무료 Demo API 기본 -- 5분 TTL 캐시로 rate limit 완화, Pro 키 선택적
2. Pyth Oracle Hermes HTTP API 우선 -- 온체인 대비 단순성/비용
3. Chainlink EVM 전용 -- Solana는 Pyth 대안
4. Jupiter API fetch 직접 호출 -- SDK 미사용, 의존성 최소화
5. Action Provider ESM dynamic import -- Node.js 22 네이티브
6. MCP Tool 16개 초과 시 config.toml tool_priority 배열 우선순위
7. 슬리피지 기본값 [actions.jupiter_swap] 섹션 config.toml 저장
8. 가격 캐시 인메모리 Map LRU 128항목 -- 외부 라이브러리 미사용

### v1.6 기술 결정 (8건)

1. Tauri 2 + React 18 번들러 Vite (기본)
2. TailwindCSS 4 JIT + 커스텀 디자인 토큰
3. WalletConnect @reown/appkit (Tauri 바인딩, 스파이크 검증 필요)
4. Telegram Bot native fetch 전용 (프레임워크 미사용)
5. Docker base node:22-slim (native addon 호환성)
6. Sidecar Node.js SEA esbuild + postject
7. Kill Switch CAS SQLite BEGIN IMMEDIATE + WHERE state=expected
8. AutoStop 규칙 config.toml [autostop] 섹션 저장

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v1.5/v1.6 objective 문서 완성. v1.1~v1.6까지 6개 마일스톤 objective 완료
- Phase 46 plan 02 (v1.7/v2.0 objective) 실행 준비 완료
- v1.5/v1.6 구현 시 참조할 설계 문서(61/62/63, 39/40/36)와 objective 문서 간 매핑 완성

## Self-Check: PASSED

---
*Phase: 46-ext-release-objectives*
*Completed: 2026-02-09*
