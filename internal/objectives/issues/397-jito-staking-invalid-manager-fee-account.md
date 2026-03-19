# 397 — Jito Staking DepositSol "Invalid manager fee account" 오류로 스테이킹 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** (미정)
- **발견일:** 2026-03-19

## 현상

`POST /v1/actions/jito_staking/stake?dryRun=true`으로 SOL 스테이킹 시뮬레이션 시 Jito Stake Pool 프로그램에서 "Invalid manager fee account" 오류 발생.

```
Program SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy invoke [1]
Program log: Instruction: DepositSol
Program log: Error: Invalid manager fee account
Program SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy failed: custom program error: 0x9
```

- ATA 생성은 성공 (CreateIdempotent OK)
- DepositSol 인스트럭션에서 실패 (error 0x9)

## 파라미터

```json
{ "amount": "50000000" }  // 0.05 SOL (최소 금액)
```

## 원인 추정

기존 #370(reserve stake 주소 불일치)은 FIXED로 표시되었으나, 이번 오류는 `manager_fee_account` 관련.
Jito Stake Pool 프로그램이 검증하는 계정 중 `manager_fee_account`가 현재 온체인 상태와 불일치할 가능성:

1. Jito가 manager fee account를 변경했으나 코드의 하드코딩 주소가 미갱신
2. `jito-stake-pool.ts`의 계정 목록에서 manager_fee_account 전달이 잘못됨

## 영향

- Jito SOL 스테이킹 전체 기능 사용 불가 (stake/unstake 모두)
- defi-06 UAT 시나리오 실행 불가

## 수정 방안

1. Jito Stake Pool의 온체인 상태에서 현재 `manager_fee_account` 조회
2. `packages/actions/src/providers/jito-staking/jito-stake-pool.ts`의 계정 주소 갱신
3. 하드코딩 대신 온체인 stake pool 상태에서 동적으로 계정 주소를 파싱하는 방안 검토

## 수정 대상 파일

- `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` — 계정 주소 확인/갱신

## 테스트 항목

1. **통합 테스트**: Jito stake dryRun 성공 확인 (simulation.success: true)
2. **유닛 테스트**: Jito stake pool 계정 주소가 온체인 상태와 일치하는지 검증
