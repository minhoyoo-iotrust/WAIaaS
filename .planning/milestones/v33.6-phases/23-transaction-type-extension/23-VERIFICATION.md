---
phase: 23-transaction-type-extension
verified: 2026-02-07T23:54:00Z
status: passed
score: 21/21 must-haves verified
re_verification: false
---

# Phase 23: 트랜잭션 타입 확장 설계 Verification Report

**Phase Goal:** 에이전트가 임의 스마트 컨트랙트를 호출하고, 토큰 Approve를 독립 정책으로 관리하며, 복수 인스트럭션을 원자적 배치로 실행하는 트랜잭션 타입을 설계한다

**Verified:** 2026-02-07T23:54:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ContractCallRequest로 EVM calldata와 Solana programId+instructionData+accounts를 표현할 수 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 2, interface 정의 (line 64-104), EVM calldata 필수 + Solana programId/instructionData/accounts 필수 필드 명세 |
| 2 | CONTRACT_WHITELIST/METHOD_WHITELIST 정책이 기본 전면 거부(opt-in)로 동작한다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 4.3/5.3, 정책 미설정 시 CONTRACT_CALL_DISABLED 반환 (line 527-532), 핵심 설계 원칙 #1 "기본 전면 거부" |
| 3 | ApproveRequest가 ContractCall과 독립된 타입으로 존재한다 | ✓ VERIFIED | 59-approve-management-spec.md 섹션 2, interface ApproveRequest 독립 정의 (line 79-95), ContractCallRequest와 분리 근거 표 (line 99-115) |
| 4 | APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 정책이 무제한 approve를 차단한다 | ✓ VERIFIED | 59-approve-management-spec.md 섹션 5/6/7, APPROVE_AMOUNT_LIMIT block_unlimited=true (line 811-829), 무제한 임계값 MAX/2 정의 |
| 5 | BatchRequest로 Solana 원자적 배치를 표현할 수 있다 | ✓ VERIFIED | 60-batch-transaction-spec.md 섹션 2, interface BatchRequest + InstructionRequest discriminated union (line 61-130), min 2 / max 20 instruction |
| 6 | EVM 미지원 시 명확한 BATCH_NOT_SUPPORTED 에러를 반환한다 | ✓ VERIFIED | 60-batch-transaction-spec.md 섹션 3, EVM BATCH_NOT_SUPPORTED (400) 에러 (line 245-276), chain === 'solana' 검증 |
| 7 | 정책 평가에서 금액 합산과 All-or-Nothing 위반 처리가 명세되어 있다 | ✓ VERIFIED | 60-batch-transaction-spec.md 섹션 5, 2단계 평가 알고리즘 Phase A(개별) + Phase B(합산) (line 651-850), All-or-Nothing violations 배열 (line 862-912) |
| 8 | 파이프라인 Stage 1-5의 type 분기가 설계되어 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 6, Stage 1 discriminatedUnion 5 variants (line 760-831), Stage 2 allowedContracts/allowedSpenders (line 846-882), Stage 3 evaluate() 11단계 (line 897-1071), Stage 5 type 분기 (line 1155-1185) |
| 9 | 세션 제약 allowedContracts 확장이 설계되어 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 6.2, SessionConstraints.allowedContracts 필드 + 검증 로직 (line 846-882) |
| 10 | transactions 테이블의 TransactionType Enum 5개 값이 명세되어 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 7.2, TransactionType = 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH' (line 1242-1283) |
| 11 | 감사 컬럼 4개가 명세되어 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 7.3, contract_address / method_signature / token_address / spender_address 컬럼 + 인덱스 2개 (line 1307-1421) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/58-contract-call-spec.md` | CHAIN-EXT-03 컨트랙트 호출 스펙 + 크로스커팅 확장 | ✓ VERIFIED | 1735 lines, 10 sections + 2 appendices, ContractCallRequest interface + CONTRACT_WHITELIST/METHOD_WHITELIST policies + pipeline/DB/REST cross-cutting extensions |
| `docs/59-approve-management-spec.md` | CHAIN-EXT-04 Approve 관리 스펙 | ✓ VERIFIED | 1696 lines, 9 sections + 3 appendices, ApproveRequest interface + 3 approve policies + race condition prevention + single delegate handling |
| `docs/60-batch-transaction-spec.md` | CHAIN-EXT-05 배치 트랜잭션 스펙 | ✓ VERIFIED | 1569 lines, 8 sections + 3 appendices, BatchRequest + InstructionRequest + 2-phase policy evaluation + All-or-Nothing |

**All artifacts substantive:**
- Level 1 (Exists): All 3 files exist (67K, 64K, 59K)
- Level 2 (Substantive): All exceed minimum lines (1735, 1696, 1569 >> 900+ target), comprehensive sections with code examples, detailed algorithms, test scenarios
- Level 3 (Wired): All committed to git (b80241f, 62764ac, 5a4300f), referenced in summaries, cross-reference each other and existing docs (27, 25, 31, 32, 33, 37, 45)

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| 58-contract-call-spec.md | 32-transaction-pipeline-api.md | Stage 1-5 확장 | ✓ WIRED | Section 6: Stage 1 discriminatedUnion, Stage 2 allowedContracts, Stage 3 CONTRACT_WHITELIST/METHOD_WHITELIST 11단계, Stage 5 buildContractCall |
| 58-contract-call-spec.md | 25-sqlite-schema.md | TransactionType Enum + 감사 컬럼 | ✓ WIRED | Section 7: TransactionType 5개, contract_address/method_signature/token_address/spender_address 컬럼, idx_transactions_contract_address/spender_address 인덱스 |
| 58-contract-call-spec.md | 37-rest-api-complete-spec.md | discriminatedUnion 요청 + 에러 코드 | ✓ WIRED | Section 8: TransactionSendRequestSchema discriminatedUnion 5 variants, 에러 코드 10개 (CONTRACT_CALL_DISABLED, CONTRACT_NOT_WHITELISTED, METHOD_NOT_WHITELISTED 등) |
| 59-approve-management-spec.md | 58-contract-call-spec.md | Stage 3 순서 8-10 정책 | ✓ WIRED | Section 1.5 참조: CHAIN-EXT-03 Stage 3 순서 8(APPROVED_SPENDERS), 9(APPROVE_AMOUNT_LIMIT), 10(APPROVE_TIER_OVERRIDE) 예비 정의를 정식화 |
| 59-approve-management-spec.md | 33-time-lock-approval-mechanism.md | PolicyType 3개 추가 | ✓ WIRED | Section 10.2: PolicyType 10개 확장 (APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE) |
| 60-batch-transaction-spec.md | 58-contract-call-spec.md | Stage 1 BATCH variant, Stage 3 batchTotalAmount/batchInstructions | ✓ WIRED | Section 1.5 참조: CHAIN-EXT-03 Stage 1 BATCH variant, Stage 3 PolicyEvaluationInput.batchTotalAmount/batchInstructions, Stage 5 buildBatch 분기 |
| 60-batch-transaction-spec.md | 31-solana-adapter-detail.md | appendTransactionMessageInstruction 다중 패턴 | ✓ WIRED | Section 4: @solana/kit pipe 패턴, appendTransactionMessageInstruction 반복 호출로 다중 instruction 구성 |

**All key links verified:** Documents cross-reference correctly, pipeline stages properly extended, DB schema changes integrated, REST API discriminatedUnion implemented.

### Requirements Coverage

| Requirement | Status | Supporting Truths | Evidence |
|-------------|--------|-------------------|----------|
| CONTRACT-01 | ✓ SATISFIED | Truth #1 | ContractCallRequest interface (58/섹션 2) |
| CONTRACT-02 | ✓ SATISFIED | Truth #2 | CONTRACT_WHITELIST + METHOD_WHITELIST policies (58/섹션 4-5) |
| CONTRACT-03 | ✓ SATISFIED | Truth #8, #9 | Pipeline Stage 1-5 확장 (58/섹션 6) |
| CONTRACT-04 | ✓ SATISFIED | Truth #10, #11 | TransactionType Enum + 감사 컬럼 (58/섹션 7) |
| CONTRACT-05 | ✓ SATISFIED | Artifact 58 | 보안 위험 매트릭스 5개 + 테스트 시나리오 14개 (58/섹션 9) |
| APPROVE-01 | ✓ SATISFIED | Truth #3 | ApproveRequest 독립 타입 (59/섹션 2) |
| APPROVE-02 | ✓ SATISFIED | Truth #4 | 3가지 approve 정책 (59/섹션 5-7) |
| APPROVE-03 | ✓ SATISFIED | Artifact 59 | 보안 위험 매트릭스 5개 + 테스트 시나리오 22개 (59/섹션 9) |
| BATCH-01 | ✓ SATISFIED | Truth #5, #6 | BatchRequest + InstructionRequest + EVM 미지원 (60/섹션 2-3) |
| BATCH-02 | ✓ SATISFIED | Truth #7 | 2단계 정책 평가 + All-or-Nothing (60/섹션 5) |
| BATCH-03 | ✓ SATISFIED | Artifact 60 | 보안 위험 매트릭스 4개 + 테스트 시나리오 14개 (60/섹션 7) |

**Requirements Coverage:** 11/11 (100%)

### Anti-Patterns Found

No anti-patterns detected. All documents are:
- Substantive design specifications (not placeholder TODOs)
- Comprehensive with code examples, algorithms, schemas
- Cross-referenced with proper integration points
- Committed to version control
- Aligned with Phase 23 goals

### Success Criteria Verification

**From ROADMAP.md Phase 23 Success Criteria:**

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | ContractCallRequest로 EVM calldata와 Solana programId+instructionData+accounts를 표현할 수 있고, CONTRACT_WHITELIST/METHOD_WHITELIST 정책이 기본 전면 거부(opt-in)로 동작한다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 2 (interface 정의, EVM/Solana 필수 필드 표), 섹션 4-5 (opt-in 정책, CONTRACT_CALL_DISABLED 기본 거부) |
| 2 | ApproveRequest가 ContractCall과 독립된 타입으로 존재하고, APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 정책이 무제한 approve를 차단한다 | ✓ VERIFIED | 59-approve-management-spec.md 섹션 2 (독립 인터페이스), 섹션 5-7 (3중 정책, block_unlimited=true 무제한 차단) |
| 3 | BatchRequest로 Solana 원자적 배치를 표현할 수 있고, EVM 미지원 시 명확한 에러를 반환하며, 정책 평가에서 금액 합산과 All-or-Nothing 위반 처리가 명세되어 있다 | ✓ VERIFIED | 60-batch-transaction-spec.md 섹션 2 (BatchRequest + InstructionRequest), 섹션 3 (BATCH_NOT_SUPPORTED), 섹션 5 (2단계 평가: Phase A 개별 + Phase B 합산, All-or-Nothing violations) |
| 4 | 파이프라인 Stage 1의 type 분기(TRANSFER/CONTRACT_CALL/APPROVE/BATCH)와 Stage 2의 세션 제약(allowedContracts) 확장이 설계되어 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 6.1 (discriminatedUnion 5 variants), 섹션 6.2 (SessionConstraints.allowedContracts + allowedSpenders) |
| 5 | transactions 테이블의 TransactionType Enum 확장(CONTRACT_CALL, APPROVE, BATCH)과 감사 컬럼(contract_address, method_signature)이 명세되어 있다 | ✓ VERIFIED | 58-contract-call-spec.md 섹션 7.2 (TransactionType 5개 Enum), 섹션 7.3 (감사 컬럼 4개: contract_address, method_signature, token_address, spender_address + 인덱스 2개) |

**All 5 success criteria VERIFIED.**

### Must-Haves Verification (from PLAN frontmatter)

**Plan 23-01 must_haves (7 truths):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ContractCallRequest 인터페이스가 EVM calldata(0x hex)와 Solana programId+instructionData(Base64)+accounts를 모두 표현할 수 있다 | ✓ VERIFIED | 58/line 64-104: interface ContractCallRequest with calldata/abi (EVM) and programId/instructionData/accounts (Solana) |
| 2 | CONTRACT_WHITELIST 정책이 기본 전면 거부(opt-in)로 동작하고, 미설정 시 CONTRACT_CALL 자체를 거부한다 | ✓ VERIFIED | 58/line 527-532: CONTRACT_WHITELIST 미설정 → CONTRACT_CALL_DISABLED 에러 |
| 3 | METHOD_WHITELIST 정책이 4바이트 function selector 기반으로 허용된 메서드만 통과시킨다 | ✓ VERIFIED | 58/line 646-741: evaluateMethodWhitelist(), calldata.slice(0,10) selector 추출, allowed_selectors 검증 |
| 4 | 파이프라인 Stage 1-5에 CONTRACT_CALL/APPROVE/BATCH type 분기가 설계되어 있다 | ✓ VERIFIED | 58/섹션 6: Stage 1 discriminatedUnion (line 760-831), Stage 2 (line 846-882), Stage 3 11단계 (line 897-1071), Stage 5 buildContractCall (line 1155-1185) |
| 5 | transactions 테이블에 TransactionType Enum(5개), 감사 컬럼(contract_address, method_signature, token_address, spender_address), 인덱스가 명세되어 있다 | ✓ VERIFIED | 58/섹션 7.2-7.3: TransactionType 5개 + 감사 컬럼 4개 + idx_transactions_contract_address/spender_address 인덱스 |
| 6 | POST /v1/transactions/send가 z.discriminatedUnion('type', [...])으로 다형적 요청을 수신한다 | ✓ VERIFIED | 58/line 760-831: TransactionSendRequestSchema = z.discriminatedUnion('type', [5 variants]) |
| 7 | 에러 코드 10개가 정의되어 있고, CONTRACT_CALL 보안 테스트 시나리오가 명세되어 있다 | ✓ VERIFIED | 58/섹션 8: 에러 코드 10개 (CONTRACT_CALL_DISABLED, CONTRACT_NOT_WHITELISTED, METHOD_NOT_WHITELISTED, SPENDER_NOT_APPROVED, APPROVE_AMOUNT_EXCEEDED, UNLIMITED_APPROVE_BLOCKED, BATCH_NOT_SUPPORTED, BATCH_SIZE_EXCEEDED, BATCH_POLICY_VIOLATION, APPROVE_DISABLED), 섹션 9: 보안 시나리오 14개 |

**Plan 23-02 must_haves (7 truths):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ApproveRequest가 ContractCallRequest와 독립된 타입으로 존재하고, EVM ERC-20 approve와 Solana SPL ApproveChecked를 모두 표현할 수 있다 | ✓ VERIFIED | 59/line 79-95: interface ApproveRequest 독립 정의, line 99-115: ContractCallRequest 분리 근거 표 |
| 2 | APPROVED_SPENDERS 정책이 기본 전면 거부(opt-in)로 동작하고, 미설정 시 APPROVE 자체를 거부한다 | ✓ VERIFIED | 59/line 700-750: APPROVED_SPENDERS 미설정 → APPROVE_DISABLED 에러 |
| 3 | APPROVE_AMOUNT_LIMIT 정책이 무제한 approve(uint256.max, u64.max)를 감지하여 차단한다 | ✓ VERIFIED | 59/line 811-829: block_unlimited=true, unlimited_threshold = MAX/2, UNLIMITED_APPROVE_BLOCKED 에러 |
| 4 | APPROVE_TIER_OVERRIDE 정책이 SPENDING_LIMIT과 독립적으로 approve 보안 티어를 결정한다 (기본 APPROVAL) | ✓ VERIFIED | 59/line 930-1012: APPROVE_TIER_OVERRIDE, resolveEffectiveAmount(APPROVE) = 0n (SPENDING_LIMIT과 독립), 기본 APPROVAL 티어 |
| 5 | EVM approve race condition 방지를 위해 어댑터가 approve(0) -> approve(new) 패턴을 자동 처리한다 | ✓ VERIFIED | 59/line 335-450: Race condition 방지 섹션, approve(0) -> approve(new) 2단계 자동 처리, approveGroupId 그룹화 |
| 6 | Solana SPL 단일 delegate 제약이 문서화되고, 기존 delegate 경고 로직이 설계되어 있다 | ✓ VERIFIED | 59/line 560-623: 단일 delegate 제약, previousDelegate 조회 + 응답 포함 + 감사 로그 기록 |
| 7 | APPROVE 보안 테스트 시나리오가 무제한 approve, 비허가 spender, race condition 등을 포함한다 | ✓ VERIFIED | 59/섹션 9: 보안 위험 매트릭스 5개 + 테스트 시나리오 22개 (무제한 차단, 비허가 spender, race condition 자동 처리, 단일 delegate 경고 포함) |

**Plan 23-03 must_haves (7 truths):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BatchRequest로 Solana 다중 instruction을 원자적 배치로 표현할 수 있고, InstructionRequest가 TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE 4가지 type을 지원한다 | ✓ VERIFIED | 60/line 61-130: interface BatchRequest + InstructionRequest discriminated union 4 types |
| 2 | EVM BATCH 요청 시 BATCH_NOT_SUPPORTED 에러가 명확히 반환된다 | ✓ VERIFIED | 60/line 245-276: EVM chain → BATCH_NOT_SUPPORTED (400) 에러 |
| 3 | 배치 정책 평가에서 개별 instruction 각각의 정책 평가 + 금액 합산 티어 결정이 명세되어 있다 | ✓ VERIFIED | 60/line 651-850: 2단계 평가 알고리즘 Phase A(개별 instruction 정책) + Phase B(합산 금액 티어) |
| 4 | All-or-Nothing 정책 위반 처리가 명세되어 있다 (하나라도 위반 시 전체 배치 거부) | ✓ VERIFIED | 60/line 862-912: All-or-Nothing 패턴, violations 배열로 상세 보고, BATCH_POLICY_VIOLATION 에러 |
| 5 | Solana 트랜잭션 크기 제한(1232 bytes)과 instruction 수 제한(20개)이 사전 검증 로직에 포함되어 있다 | ✓ VERIFIED | 60/line 677-725: 1232 bytes 크기 검증, line 68/244/259: instruction min 2 / max 20 제한 |
| 6 | approve + transferFrom 콤보 배치의 보안 시나리오가 정의되어 있다 | ✓ VERIFIED | 60/line 1377-1460: 보안 위험 매트릭스 + 테스트 시나리오에 approve+transferFrom 콤보 포함 |
| 7 | 배치 트랜잭션 테스트 시나리오가 정상/정책거부/에러/보안을 포함한다 | ✓ VERIFIED | 60/섹션 7: 테스트 시나리오 14개 (정상 3 + 정책 거부 4 + 에러 4 + 보안 3) |

**Total must-haves: 21/21 VERIFIED (100%)**

---

## Overall Assessment

**Phase 23 goal ACHIEVED.**

All three transaction types (CONTRACT_CALL, APPROVE, BATCH) are fully designed with:
- Complete interface definitions (ContractCallRequest, ApproveRequest, BatchRequest, InstructionRequest)
- Comprehensive policy rules (CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
- Pipeline integration (Stage 1-5 discriminatedUnion, type branching, session constraints, 11-step evaluation)
- Database schema extensions (TransactionType 5 values, PolicyType 10 values, 4 audit columns, 2 indexes)
- REST API integration (discriminatedUnion requests, 10 new error codes)
- Security patterns (opt-in whitelist, race condition prevention, unlimited approve blocking, All-or-Nothing)
- Chain-specific implementations (EVM calldata vs Solana instruction, Solana atomic batch vs EVM unsupported)
- Test strategies (50+ test scenarios across 3 specs, security risk matrices)

**Documents are production-ready design specifications:**
- Total 5000 lines of detailed design
- Cross-referenced with 8 existing docs for integration
- Committed to version control (3 atomic commits)
- Ready for Phase 25 integration into existing docs

**No gaps found. No blockers. Phase 23 complete.**

---

_Verified: 2026-02-07T23:54:00Z_
_Verifier: Claude (gsd-verifier)_
