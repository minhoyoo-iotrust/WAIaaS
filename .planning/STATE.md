# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.5 Phase 126 Oracle Implementations

## Current Position

Phase: 126 of 129 (Oracle Implementations)
Plan: 2 of 3 in current phase
Status: Plan 126-02 complete
Last activity: 2026-02-15 -- CoinGeckoOracle (Demo API) + platformId 매핑 + oracle 설정 키 (12 tests)

Progress: [###░░░░░░░] 29%

## Performance Metrics

**Cumulative:** 28 milestones, 124 phases, 265 plans, 739 reqs, ~1,618 tests, ~178,176 LOC

**v1.5 Planned:**
- 5 phases, 14 plans, 29 requirements
- Phases 125-129

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions affecting current work:

- v1.5: 신규 외부 npm 의존성 0개 -- Pyth/CoinGecko는 native fetch(), LRU는 직접 구현, 암호화는 settings-crypto 재사용
- v1.5: evaluateAndReserve() 진입 전에 Oracle HTTP 호출 완료 -- better-sqlite3 동기 트랜잭션 내 비동기 호출 불가
- v1.5: PriceResult 3-state discriminated union -- success/oracleDown/notListed로 "가격 불명 != 가격 0" 보안 원칙
- v1.5: PriceAge를 daemon 패키지에 배치 (core 승격은 후속 필요시)
- v1.5: source enum 'pyth'|'coingecko'|'cache' 3가지 제한
- v1.5: staleMax(30min)를 TTL(5min)과 독립 파라미터로 분리
- v1.5: Chainlink 제거 -- Pyth가 체인 무관 380+ 피드 제공, EVM 전용 불필요
- v1.5: PriceCache maxEntries 1000->128 (Self-hosted 보수적 상한)
- v1.5: 교차 검증 편차 10%->5%, CoinGecko 키 설정 시에만 활성화
- v1.5: MCP Tool 도구 수 상한 제거 (MCP 프로토콜에 제한 없음)
- v1.5: PriceNotAvailableError를 oracle-errors.ts 공유 모듈에서 관리 (PythOracle/CoinGeckoOracle 공유)
- v1.5: PythOracle은 캐시 미관리 -- OracleChain이 InMemoryPriceCache 전담
- v1.5: CoinGeckoOracle은 캐시 미관리 -- OracleChain이 InMemoryPriceCache 전담
- v1.5: oracle-errors.ts 공유 모듈에서 PriceNotAvailableError + CoinGeckoNotConfiguredError 관리
- v1.5: Solana 주소는 CoinGecko API에서 원본 base58 보존, EVM만 lowercase 정규화

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- MCP 동적 도구 등록/해제 공식 API 미존재 -- Phase 129에서 대안 패턴 검증 필요

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 126-02-PLAN.md (CoinGeckoOracle TDD: Demo API + platformId 매핑 + oracle 설정 키)
Resume file: None
