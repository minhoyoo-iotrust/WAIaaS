# 328 — Jito Staking DepositSol 시 JitoSOL ATA 미생성으로 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.9
- **상태:** FIXED
- **수정일:** 2026-03-11

## 현상

첫 Jito 스테이킹 시 JitoSOL Associated Token Account(ATA)가 존재하지 않으면 DepositSol 인스트럭션이 `InstructionError: Custom(1)`로 실패한다. defi-06 시나리오 FAIL.

## 원인

`buildDepositSolRequest()`가 JitoSOL ATA의 존재를 전제하고 DepositSol 인스트럭션만 생성. 첫 스테이킹 시 ATA가 없으면 Stake Pool 프로그램이 목적지 토큰 계정을 찾지 못해 Custom(1) 에러 반환.

## 수정 내용

`preInstructions` 메커니즘을 도입하여 CreateAssociatedTokenAccountIdempotent pre-instruction을 DepositSol 앞에 삽입.

수정 파일 (5개):
1. `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` — PreInstruction 인터페이스 + buildCreateAtaIdempotentInstruction() + preInstructions 반환
2. `packages/core/src/interfaces/chain-adapter.types.ts` — ContractCallParams.preInstructions 추가
3. `packages/core/src/schemas/transaction.schema.ts` — ContractCallRequestSchema.preInstructions 추가 (Zod SSoT)
4. `packages/daemon/src/pipeline/stages.ts` — preInstructions 패스스루 + base64→Buffer 변환
5. `packages/adapters/solana/src/adapter.ts` — pre-instruction 파싱 + main instruction 앞에 append

## 테스트 항목

1. JitoSOL ATA 미존재 상태에서 DepositSol 성공 확인 (preInstruction으로 ATA 생성)
2. JitoSOL ATA 이미 존재 시 Idempotent로 에러 없이 성공 확인
3. preInstructions 미설정(기존 CONTRACT_CALL) 시 기존 동작 유지 확인
4. preInstruction의 base64 → Buffer → Uint8Array 변환 체인 정합성 단위 테스트
