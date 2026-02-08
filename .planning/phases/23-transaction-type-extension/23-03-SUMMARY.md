---
phase: 23-transaction-type-extension
plan: 03
subsystem: api, security, blockchain
tags: [batch-transaction, solana, atomic-batch, policy-evaluation, instruction-request, discriminated-union, all-or-nothing, spending-limit]

# Dependency graph
requires:
  - phase: 23-transaction-type-extension
    plan: 01
    provides: 파이프라인 Stage 1-5 크로스커팅 확장, BATCH variant 예비 정의, PolicyEvaluationInput batchTotalAmount/batchInstructions, 에러 코드 3종
  - phase: 22-token-extension
    provides: TransferRequest.token 확장, ALLOWED_TOKENS 정책, SPL TransferChecked/ATA 패턴
provides:
  - BatchRequest + InstructionRequest discriminated union (4 types)
  - Solana 원자적 배치 빌드 로직 (pipe 패턴, ATA 자동 생성, CU 최적화)
  - EVM BATCH_NOT_SUPPORTED 명시적 미지원 분기
  - 2단계 정책 평가 알고리즘 (Phase A 개별 + Phase B 합산)
  - All-or-Nothing 위반 처리 (BATCH_POLICY_VIOLATION)
  - 트랜잭션 크기 1232 bytes + instruction 수 2-20 사전 검증
  - 감사 로그 전략 (metadata JSON batch_instructions)
  - 보안 테스트 시나리오 14개
affects:
  - 25 (테스트 전략 통합 + 기존 문서 반영)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2단계 배치 정책 평가: Phase A 개별 instruction + Phase B 합산 금액 티어"
    - "All-or-Nothing 패턴: 하나라도 DENY면 전체 배치 거부, violations 배열로 상세 보고"
    - "InstructionRequest discriminated union: 4 types (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE)"
    - "ATA 자동 삽입: TOKEN_TRANSFER/APPROVE에서 ATA 미존재 시 createATA instruction 앞에 삽입"
    - "maxTier() 패턴: APPROVE 포함 배치는 합산 금액 티어와 APPROVE override 티어 중 높은 쪽 채택"

key-files:
  created:
    - docs/60-batch-transaction-spec.md
  modified: []

key-decisions:
  - "InstructionRequest를 discriminated union으로 설계 (type별 필수 필드 차이, Zod 매핑, 정책 분기 일관성)"
  - "BatchRequest의 chain은 'solana' only (EVM BATCH_NOT_SUPPORTED 400)"
  - "2단계 정책 평가: Phase A 개별 + Phase B 합산 (소액 분할 우회 차단)"
  - "TOKEN_TRANSFER 합산 금액 = 0n (Phase 24 USD 통합 전 과도기)"
  - "APPROVE 합산 금액 = 0n (직접 자금 이동 아님, APPROVE_TIER_OVERRIDE에서 독립 결정)"
  - "APPROVE 포함 배치는 maxTier(합산 티어, approve override 티어)로 최종 결정"
  - "감사 컬럼 대표값 + metadata JSON 전체 기록 패턴 (인덱싱 효율 + 상세 추적)"
  - "배치 내 중복 instruction 감지는 정책 엔진 범위 밖 (감사 로그로 사후 추적)"
  - "ATA 자동 생성은 instruction 수에 포함 (20개 한도)"

patterns-established:
  - "2단계 배치 정책: Phase A(개별 정책) + Phase B(합산 금액) 패턴으로 복합 트랜잭션의 정책 우회 차단"
  - "감사 컬럼 대표값 패턴: 독립 컬럼에 첫 번째 값, metadata에 전체 목록 (검색 효율 + 상세 보존)"

# Metrics
duration: 8min
completed: 2026-02-08
---

# Phase 23 Plan 03: 배치 트랜잭션 스펙 Summary

**BatchRequest/InstructionRequest discriminated union(4 types) + Solana 원자적 배치 빌드(pipe/ATA/CU) + EVM BATCH_NOT_SUPPORTED + 2단계 정책 평가(개별+합산 All-or-Nothing) + 1232 bytes/20 instruction 사전 검증 + 보안 시나리오 14개**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-07T23:41:44Z
- **Completed:** 2026-02-07T23:49:26Z
- **Tasks:** 1/1
- **Files created:** 1

## Accomplishments

- BatchRequest + InstructionRequest discriminated union이 4가지 type(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE)을 지원하며, BATCH 중첩 불가를 구조적으로 보장
- Solana 원자적 배치 빌드 로직이 pipe 패턴, ATA 자동 생성, CU 최적화를 포함하여 완전한 빌드 파이프라인 정의
- EVM BATCH 요청 시 BATCH_NOT_SUPPORTED(400) 에러가 명확히 반환되며, 향후 ERC-4337/EIP-7702 확장 포인트 기록
- 2단계 정책 평가 알고리즘이 Phase A(개별 instruction 정책) + Phase B(합산 금액 티어)로 구성되어 소액 분할 우회 차단
- All-or-Nothing: 하나라도 정책 위반이면 전체 배치 거부, violations 배열로 위반 instruction 인덱스 + 정책 타입 + 사유 상세 보고
- Solana 1232 bytes 크기 제한과 instruction 수 2-20 사전 검증이 Stage 5 빌드 전에 수행
- APPROVE 포함 배치는 maxTier(합산 금액 티어, APPROVE override 티어)로 최종 티어 결정
- approve + transferFrom 콤보 보안 시나리오가 3중 방어(에이전트 직접 구성, APPROVE_TIER_OVERRIDE, APPROVED_SPENDERS)로 정의
- 보안 위험 매트릭스 4개 + 테스트 시나리오 14개(정상 3 + 정책 거부 4 + 에러 4 + 보안 3)
- CHAIN-EXT-03 예비 정의 5개 항목(BatchVariant, batchTotalAmount, batchInstructions, buildBatch, 에러 코드)을 상세 교체

## Task Commits

Each task was committed atomically:

1. **Task 1: BatchRequest 인터페이스 + 배치 정책 평가 + Solana 빌드 로직 설계** - `5a4300f` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `docs/60-batch-transaction-spec.md` - CHAIN-EXT-05 배치 트랜잭션 스펙 (~1569줄, 8 섹션 + 3 부록)

## Decisions Made

1. **InstructionRequest discriminated union 설계** -- type별 필수 필드가 다르므로 단일 인터페이스 대신 discriminated union으로 설계. Zod discriminatedUnion과 직접 매핑되어 REST API 검증 일관성 확보.

2. **BatchRequest chain 제한 = 'solana' only** -- EVM EOA는 1 tx = 1 call 원칙이므로 네이티브 배치 불가. BATCH_NOT_SUPPORTED(400)로 명시적 거부. 향후 ERC-4337/EIP-7702 확장 포인트만 기록.

3. **TOKEN_TRANSFER/APPROVE 합산 금액 = 0n** -- Phase 24 USD 통합 전까지 토큰 금액은 네이티브 토큰과 비교 불가. 0으로 간주하여 합산에서 제외하되, 개별 instruction 정책(ALLOWED_TOKENS, APPROVED_SPENDERS 등)은 Phase A에서 정상 평가.

4. **APPROVE 포함 배치의 maxTier 패턴** -- 합산 금액 티어와 APPROVE_TIER_OVERRIDE 티어 중 높은 쪽을 최종 채택. 소액 TRANSFER + APPROVE 배치에서 APPROVE의 위험도가 희석되는 것을 방지.

5. **감사 컬럼 대표값 패턴** -- 배치는 다수 instruction을 포함하므로 독립 컬럼(contract_address 등)에는 첫 번째 값, metadata JSON에 전체 목록. 인덱싱 효율과 상세 추적을 동시 확보.

6. **배치 내 중복 instruction 미감지** -- 복수 수신자 동시 전송(에어드롭), 동일 프로그램 복수 호출(LP 추가) 등 정당한 사용 사례 존재. 정책 엔진 범위 밖으로 두고 감사 로그로 사후 추적.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 23 3/3 plans 완료. 산출물: CHAIN-EXT-03(58), CHAIN-EXT-04(59, 23-02), CHAIN-EXT-05(60, 23-03)
- Phase 25에서 기존 문서 수정 범위: 27(IChainAdapter buildBatch 메서드), 25(transactions type CHECK), 32(파이프라인 BATCH 분기), 33(DatabasePolicyEngine BATCH 평가), 37(REST API BATCH variant), 45(TransactionType/PolicyType 확장)
- Phase 24(상위 추상화) 진행 시 calculateBatchTotalAmount()의 TOKEN_TRANSFER 합산 로직이 USD 기준으로 교체될 예정

## Self-Check: PASSED

---
*Phase: 23-transaction-type-extension*
*Plan: 03*
*Completed: 2026-02-08*
