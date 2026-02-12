# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4 마일스톤 완료 — 토큰 + 컨트랙트 확장 전체 구현

## Current Position

Phase: 81 of 81 (파이프라인 통합 Stage 5)
Plan: 2 of 2 in current phase
Status: v1.4 Milestone complete — all 6 phases, 12 plans done
Last activity: 2026-02-12 — Completed Phase 81 (Stage 1 discriminatedUnion + Stage 3 type-based policy + Stage 5 CONC-01 retry + buildByType)

Progress: [████████████] 100% (12/12 plans)

## Performance Metrics

**Cumulative:** 19 milestones, 81 phases, 182 plans, 488 reqs, 1111 tests, 44,205+ LOC

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions affecting current work:

- v1.4에서 DB 마이그레이션 필수: 스키마 변경 시 ALTER TABLE 증분 마이그레이션 제공 (MIG-01~06)
- ChainError 27개 코드 3-카테고리 (PERMANENT 19/TRANSIENT 4/STALE 4) -- BATCH_NOT_SUPPORTED + BATCH_SIZE_EXCEEDED 추가
- Stage 5 완전 의사코드 CONC-01: build->simulate->sign->submit + 에러 분기
- discriminatedUnion 5-type으로 SendTransactionRequestSchema 교체 -- TransactionRequestSchema 구현 완료
- INFRA-05: INSUFFICIENT_FOR_FEE 에러 코드 TX 도메인으로 이동 -- 구현 완료 (DD-04 해소)
- ChainError extends Error (not WAIaaSError) -- chain adapter 내부 에러, Stage 5에서 WAIaaSError 변환
- TransferRequestInput 타입명 (TransferRequest 아님) -- IChainAdapter.TransferRequest 인터페이스와 충돌 방지
- runMigrations() 테스트용 migrations 파라미터 옵션 (기본값 = 전역 MIGRATIONS 배열)
- schema_version v1 설명 'Initial schema (9 tables)'로 정정
- getCurrentNonce는 Solana에서 0 반환 (스텁 아닌 실제 구현) -- EVM 전용 개념
- superRefine uses POLICY_RULES_SCHEMAS map lookup (switch/case 대신) -- 확장성
- 6개 rules 스키마는 module-level const (비공개) -- 내부 검증 전용
- ERC20_ABI uses `as const` for viem type inference -- abi parameter requires literal types
- EvmAdapter에서 _rpcUrl 필드 제거 (noUnusedLocals strict) -- 필요시 재추가
- buildBatch throws BATCH_NOT_SUPPORTED (EVM no native atomic batch)
- Gas safety margin: (estimatedGas * 120n) / 100n bigint 산술 -- buildTransaction/estimateFee/buildApprove/buildContractCall 일관 적용
- ChainError 매핑: viem 에러 메시지 패턴 매칭 (mapError 헬퍼) -- typed error 미제공 대응
- EVM chainId defaults to 1 (mainnet) when client.chain undefined
- getAssets는 네이티브 ETH + ERC-20 토큰 반환 (setAllowedTokens 설정 시 multicall로 balanceOf 조회)
- getTokenInfo multicall 부분 실패 시 defaults (18 decimals, empty strings)
- buildApprove metadata에 tokenAddress/spender/approveAmount 포함 (audit 추적)
- @solana-program/token 단일 패키지로 ATA + transferChecked 모두 제공 (별도 ATA 패키지 불필요)
- Token-2022 감지: mint account owner 필드로 SPL_TOKEN_PROGRAM_ID vs TOKEN_2022_PROGRAM_ID 판별
- getAssets 정렬: native first, balance descending, alphabetical tie-break
- ALLOWED_TOKENS 기본 거부: TOKEN_TRANSFER 시 ALLOWED_TOKENS 정책 없으면 deny (정책 로드 필수)
- tokenAddress? optional field -- 기존 호출자 영향 없음 (backward compatible)
- setAllowedTokens() approach: IChainAdapter 인터페이스 변경 없이 어댑터 레벨 설정
- buildTokenTransfer metadata에 tokenAddress/recipient/tokenAmount 포함 (audit 추적)
- Zero-balance 토큰 getAssets 결과에서 제외 (양수 잔액만 반환)
- Failed multicall 결과 silent skip (존재하지 않는 토큰 계약 graceful 처리)
- EVM calldata 검증: 0x prefix + 최소 8 hex chars (4-byte selector) 필수 -- INVALID_INSTRUCTION
- Solana instructionData 이중 처리: Uint8Array (programmatic) 또는 base64 string (REST API)
- CONTRACT_WHITELIST 기본 거부: CONTRACT_CALL 시 정책 없으면 deny (CONTRACT_CALL_DISABLED)
- METHOD_WHITELIST 선택적: 정책 없으면 모든 메서드 허용 (컨트랙트별 엔트리 없으면 해당 컨트랙트 제한 없음)
- 주소/셀렉터 대소문자 구분 없음 (EVM hex 주소 호환성)
- APPROVED_SPENDERS 기본 거부: APPROVE 시 정책 없으면 deny (APPROVE_DISABLED)
- UNLIMITED_THRESHOLD = (2^256 - 1) / 2 -- EVM MAX_UINT256 + Solana MAX_U64 통합 임계값
- APPROVE_TIER_OVERRIDE 기본 APPROVAL tier (Owner 승인 필수), SPENDING_LIMIT 건너뜀
- 대소문자 구분 없는 spender 주소 비교 (EVM hex 주소 호환성)
- classifyInstruction 필드 기반 union 판별: spender->APPROVE, token->TOKEN_TRANSFER, programId->CONTRACT_CALL, else->TRANSFER
- evaluateBatch Phase B 합산: TRANSFER.amount만 카운트 (TOKEN_TRANSFER/APPROVE/CONTRACT_CALL = 0)
- APPROVE in batch: max(amount tier, APPROVE_TIER_OVERRIDE tier) 해상도 -- 기본 APPROVAL
- evaluateBatch violations: index + type + reason 포함하여 어느 instruction이 거부되었는지 추적
- Stage 1 type 필드 존재 여부로 분기: type 있으면 TransactionRequestSchema, 없으면 SendTransactionRequestSchema
- Route handler는 SendTransactionRequestOpenAPI 유지 (discriminatedUnion OpenAPI 스키마는 향후 작업)
- BATCH는 evaluateBatch 직접 호출 (evaluateAndReserve 건너뜀)
- Safe accessor helpers (getRequestAmount/To/Memo) 패턴: union 타입 필드 접근
- sleep() extracted to pipeline/sleep.ts for vi.mock testability
- CONC-01 TRANSIENT retry rebuilds from Stage 5a (continue buildLoop) -- 단순한 루프 구조
- buildByType default case uses CHAIN_ERROR error code (INVALID_REQUEST 미존재)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed Phase 81 + v1.4 Milestone
Resume file: None
