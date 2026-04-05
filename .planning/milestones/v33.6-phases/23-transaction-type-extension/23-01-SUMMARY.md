---
phase: 23-transaction-type-extension
plan: 01
subsystem: api, database, security
tags: [contract-call, whitelist, pipeline, discriminatedUnion, zod, drizzle, evm-calldata, solana-instruction]

# Dependency graph
requires:
  - phase: 22-token-extension
    provides: TransferRequest.token 확장, ALLOWED_TOKENS 정책, PolicyType 5개
provides:
  - ContractCallRequest 인터페이스 (EVM calldata + Solana programId/accounts)
  - CONTRACT_WHITELIST 정책 (기본 전면 거부 opt-in)
  - METHOD_WHITELIST 정책 (4바이트 function selector EVM 전용)
  - 파이프라인 Stage 1-5 크로스커팅 확장 (5개 type 분기)
  - TransactionType Enum 5개 정식화 + PolicyType 10개 확장
  - transactions 테이블 감사 컬럼 4개 + 인덱스 2개
  - REST API discriminatedUnion 5개 variant + 에러 코드 10개
  - 보안 테스트 시나리오 14개
affects:
  - 23-02 (Approve 관리 스펙 -- APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
  - 23-03 (배치 트랜잭션 스펙 -- BatchRequest, 정책 합산 평가)
  - 25 (테스트 전략 통합 + 기존 문서 반영)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "discriminatedUnion type 분기: z.discriminatedUnion('type', [5 variants])"
    - "CONTRACT_WHITELIST opt-in 패턴: 정책 미설정 = 기능 비활성화"
    - "METHOD_WHITELIST selector 패턴: calldata.slice(0,10) 4바이트 추출"
    - "PolicyEvaluationInput 11단계 알고리즘: DENY 우선 원칙"

key-files:
  created:
    - docs/58-contract-call-spec.md
  modified: []

key-decisions:
  - "서비스 레이어에서 type별 빌드 함수 호출, IChainAdapter에 buildContractCall() 독립 메서드 추가 (유니온 확장 대신)"
  - "CONTRACT_CALL 기본 티어 = APPROVAL (보수적, Owner 승인 필수)"
  - "METHOD_WHITELIST는 EVM 전용 (Solana 표준 selector 규약 없음)"
  - "감사 컬럼 4개: contract_address, method_signature, token_address, spender_address"
  - "주소 비교 시 lowercase 정규화 (EVM checksum 주소 호환)"

patterns-established:
  - "크로스커팅 확장: 하나의 문서에서 파이프라인/DB/REST API 공통 확장을 정의하고, 후속 문서(23-02, 23-03)가 확장 포인트를 참조"
  - "type별 정책 매트릭스: 10개 정책 x 5개 type의 적용 여부를 매트릭스로 관리"

# Metrics
duration: 8min
completed: 2026-02-08
---

# Phase 23 Plan 01: 컨트랙트 호출 스펙 + 크로스커팅 확장 Summary

**ContractCallRequest(EVM calldata + Solana instruction) + CONTRACT_WHITELIST/METHOD_WHITELIST opt-in 정책 + 파이프라인 5-type discriminatedUnion + DB TransactionType 5개/PolicyType 10개 + 에러 코드 10개 + 보안 시나리오 14개**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-07T23:26:31Z
- **Completed:** 2026-02-07T23:34:45Z
- **Tasks:** 1/1
- **Files created:** 1

## Accomplishments

- ContractCallRequest 인터페이스가 EVM calldata(0x hex)와 Solana programId+instructionData(Base64)+accounts를 모두 표현
- CONTRACT_WHITELIST 정책이 기본 전면 거부(opt-in)로 동작하고, 미설정 시 CONTRACT_CALL_DISABLED 반환
- METHOD_WHITELIST 정책이 4바이트 function selector 기반으로 EVM 메서드를 필터링 (Solana는 EVM 전용)
- 파이프라인 Stage 1-5에 5가지 type(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) 분기 설계
- DatabasePolicyEngine.evaluate() 11단계 알고리즘 + type별 정책 매트릭스 정의
- DB TransactionType 5개 + PolicyType 10개 + 감사 컬럼 4개 + 인덱스 2개 명세
- REST API discriminatedUnion 5개 variant + 에러 코드 10개 정의
- 보안 테스트 시나리오 14개 (정상 2 + 정책 거부 5 + 에러 3 + 보안 4)
- 23-02(Approve), 23-03(Batch) 확장 포인트 9개 예비 정의

## Task Commits

Each task was committed atomically:

1. **Task 1: ContractCallRequest 인터페이스 + 화이트리스트 정책 + 체인별 빌드 로직 설계** - `b80241f` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `docs/58-contract-call-spec.md` - CHAIN-EXT-03 컨트랙트 호출 스펙 + 크로스커팅 확장 (~1735줄, 10 섹션 + 2 부록)

## Decisions Made

1. **IChainAdapter 확장 방식: 독립 메서드 추가** -- buildContractCall(), buildApprove(), buildBatch() 3개 독립 메서드를 추가. buildTransaction() 유니온 확장 대신 독립 메서드 패턴 선택. 각 type의 시맨틱을 명확히 분리하고 타입별 구현 자유도 보장.

2. **CONTRACT_CALL 기본 티어 = APPROVAL** -- 임의 컨트랙트 호출은 가장 위험한 작업이므로 기본 Owner 승인 필수. value > 0인 경우에도 이미 최고 보안 수준이므로 APPROVAL 유지.

3. **METHOD_WHITELIST EVM 전용** -- Solana 프로그램은 표준화된 function selector 규약이 없으므로(Anchor 8바이트, Native 가변) EVM 전용으로 한정. Solana는 CONTRACT_WHITELIST로 프로그램 수준 제어.

4. **감사 컬럼 4개 직접 추가** -- contract_address, method_signature, token_address, spender_address를 transactions 테이블에 직접 컬럼으로 추가. metadata JSON 필드 대신 독립 컬럼을 선택하여 인덱싱/쿼리 효율성 확보.

5. **주소 비교 lowercase 정규화** -- EVM checksum 주소(대소문자 혼합)와 소문자 주소의 불일치로 인한 정책 우회 방지.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 23-02(Approve 관리 스펙)가 참조할 확장 포인트 준비 완료: APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE 예비 스키마, Stage 3 평가 8-10단계 예약, ApproveVariant Zod 스키마 예비 정의
- 23-03(배치 트랜잭션 스펙)가 참조할 확장 포인트 준비 완료: BatchRequest 타입 예비 정의, BATCH_NOT_SUPPORTED/BATCH_SIZE_EXCEEDED/BATCH_POLICY_VIOLATION 에러 코드, Stage 5 buildBatch() 분기
- Phase 25에서 기존 문서 6개(27, 25, 32, 33, 37, 45) 수정 범위 식별 완료

## Self-Check: PASSED

---
*Phase: 23-transaction-type-extension*
*Plan: 01*
*Completed: 2026-02-08*
