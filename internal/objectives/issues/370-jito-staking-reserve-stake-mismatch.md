# #370 — Jito Staking DepositSol 실패 — reserve stake 주소 불일치

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

Jito Staking DepositSol 실행 시 Jito Stake Pool 프로그램이 잘못된 reserve stake 주소를 전달받아 실패한다. 코드에 하드코딩된 주소(`BgKUXdS2jFbByBaPQRf6eSCjMH3mRLDPH1MCVLhEAD3c`)가 실제 풀의 현재 주소(`BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL`)와 불일치한다.

## 에러 로그

```
Program log: Invalid reserve stake provided, expected BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL, received BgKUXdS2jFbByBaPQRf6eSCjMH3mRLDPH1MCVLhEAD3c
Program SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy failed: custom program error: 0x1
```

## 수정 방안

Jito Stake Pool의 reserve stake 주소를 하드코딩 대신 온체인 풀 상태에서 동적으로 조회하거나, 현재 올바른 주소(`BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL`)로 업데이트해야 한다.

## 영향 범위

- defi-06 (Jito Staking UAT) 실행 불가
- MCP `action_jito_staking_stake` 도구 사용 불가
- 에이전트 Jito SOL 스테이킹 전체 차단

## 테스트 항목

- [ ] Jito DepositSol dryRun 시뮬레이션 성공 확인
- [ ] Jito DepositSol 실제 실행 및 JitoSOL 수령 확인
- [ ] 기존 Jito 단위 테스트 통과 확인
