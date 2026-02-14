# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4.7 Milestone Complete

## Current Position

Phase: 119 of 119 (SDK + MCP + Notifications + Skill Resources)
Plan: 3 of 3 in current phase
Status: Milestone v1.4.7 Complete
Last activity: 2026-02-15 -- Phase 119 완료 (SDK + MCP + Notifications + Skill Resources, 3/3 plans, verified)

Progress: [##########] 100%

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
| 118-01 | 1/2 | 5min | 5min |
| 118-02 | 2/2 | 3min | 3min |
| 119-01 | 1/3 | 3min | 3min |
| 119-02 | 2/3 | 5min | 5min |
| 119-03 | 3/3 | 4min | 4min |

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
- viem encodeFunctionData 직접 import (adapter-evm 경유 안 함)
- abi 타입을 as unknown as Abi 이중 캐스트 (Record<string, unknown>[] -> Abi 직접 변환 불가)
- utils 라우트 등록을 deps-check 밖에 배치 (DB/adapter 의존성 없음)
- MCP encode_calldata가 12번째 도구로 등록 (11->12)
- Python SDK function_name 파라미터명 (PEP8), Pydantic alias로 functionName 직렬화
- MCP sign_transaction에 chain 파라미터 미노출 (wallet에서 자동 추론)
- MCP sign_transaction이 13번째 도구로 등록 (12->13)
- txParam을 stage3Policy 함수 스코프로 호이스팅 (BATCH/non-BATCH 공통 접근)
- tokenAddress/contractAddress는 notification body에 미포함 (빈 값 방지), vars metadata로만 전달
- sign-only 섹션을 transactions.skill.md 10번에 삽입, encode-calldata 11번으로 리넘버링
- SKILL_NOT_FOUND를 SYSTEM 도메인에 배치 (스킬은 시스템 리소스)
- skills 라우트는 public (인증 불필요) -- nonce/health와 동일 레벨
- ResourceTemplate list callback에서 5개 스킬을 정적으로 나열 (VALID_SKILLS 배열 기반)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing settings-service.test.ts 실패 (SETTING_DEFINITIONS count 32 vs 35)

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 119-02-PLAN.md (all 3 plans of phase 119 now complete)
Resume file: None
