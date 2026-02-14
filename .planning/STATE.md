# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4.7 Phase 117 Sign-Only Pipeline + REST API

## Current Position

Phase: 117 of 119 (Sign-Only Pipeline + REST API)
Plan: 2 of 2 in current phase
Status: Phase Complete
Last activity: 2026-02-15 -- Plan 117-02 완료 (sign REST API + OpenAPI schemas + 11 integration tests)

Progress: [####░░░░░░] 40%

## Performance Metrics

**Cumulative:** 26 milestones, 114 phases, 245 plans, 681 reqs, 1,580 tests, ~73,000 LOC

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 115-01 | 1/3 | 8min | 8min |
| 115-02 | 2/3 | 5min | 5min |
| 115-03 | 3/3 | 6min | 6min |
| 116-01 | 1/2 | 3min | 3min |
| 116-02 | 2/2 | 3min | 3min |
| 117-01 | 1/2 | 5min | 5min |
| 117-02 | 2/2 | 7min | 7min |

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
- txHash: SignOnlyResult undefined -> API 응답에서 null 변환 (OpenAPI nullable 스키마 호환)
- signTransactionRoute를 getTransactionRoute 앞에 배치 (route ordering pitfall 방지)
- viem parseTransaction을 viemParseTransaction으로 alias import (IChainAdapter 메서드명 충돌 해소)
- value + calldata 동시 존재 시 CONTRACT_CALL로 분류 (calldata 우선 원칙)
- settingsService를 DatabasePolicyEngine 선택적 3번째 파라미터로 DI (하위 호환)
- 토글은 "no policy exists" 분기에서만 확인 -- 정책 존재 시 토글 무관 화이트리스트 평가
- settingsService?.get() null-safe 패턴: 미전달 시 기본 거부 유지
- 토글 테스트에서 SettingsService 실제 인스턴스 사용 (mock 대신) -- hot-reload DB 동작 검증
- sign-only 파이프라인은 별도 모듈로 분리 (stages.ts 수정 없음)
- reservation SUM 쿼리에 SIGNED 포함 (이중 지출 방지)
- key release는 finally 블록에서만 수행 (catch에서 호출 금지)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing settings-service.test.ts 실패 (SETTING_DEFINITIONS count 32 vs 35)

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 117-02-PLAN.md (Phase 117 complete)
Resume file: None
