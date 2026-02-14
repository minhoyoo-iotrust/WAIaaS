# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4.7 Phase 116 Default Deny Toggles

## Current Position

Phase: 116 of 119 (Default Deny Toggles)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-02-15 -- Phase 115 완료 (Core Types + DB Migration + Parsers, 3/3 plans, verified)

Progress: [##░░░░░░░░] 20%

## Performance Metrics

**Cumulative:** 26 milestones, 114 phases, 245 plans, 681 reqs, 1,580 tests, ~73,000 LOC

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 115-01 | 1/3 | 8min | 8min |
| 115-02 | 2/3 | 5min | 5min |
| 115-03 | 3/3 | 6min | 6min |

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions affecting current work:

- DELAY/APPROVAL tier sign-only 요청은 즉시 거부 (동기 API 비호환)
- reserved_amount TTL: 세션 TTL로 자동 해제 (별도 메커니즘 없음)
- 파싱 실패 = DENY 원칙 (알려진 패턴만 통과)
- 신규 의존성 없음 (viem/solana-kit/mcp-sdk 기존 API 활용)
- ParsedOperationType 5종: NATIVE_TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, UNKNOWN
- SignedTransaction.txHash optional (체인별 해시 계산 시점 차이)
- v9 migration은 transactions 테이블만 재생성
- getCompiledTransactionMessageDecoder 사용 (decompileTransactionMessage 대신 -- v0 lookup table 회피)
- parseTransaction/signExternalTransaction은 offline 연산 (RPC 불필요)
- viem parseTransaction을 viemParseTransaction으로 alias import (IChainAdapter 메서드명 충돌 해소)
- value + calldata 동시 존재 시 CONTRACT_CALL로 분류 (calldata 우선 원칙)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param

## Session Continuity

Last session: 2026-02-15
Stopped at: Phase 115 완료, Phase 116 대기
Resume file: None
