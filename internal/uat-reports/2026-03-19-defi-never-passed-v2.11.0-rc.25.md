# UAT Report: DeFi Never-Passed Scenarios — v2.11.0-rc.25

- **Date**: 2026-03-19 17:30
- **Version**: v2.11.0-rc.25 (commit: 5a1a3d8d)
- **Category**: defi (never-passed retry)
- **Network**: solana-mainnet, ethereum-mainnet
- **Executor**: Claude Opus 4.6

## Summary

| Metric | Value |
|--------|-------|
| Total | 6 |
| Passed | 3 |
| Failed | 3 |
| Skipped | 0 |
| Total Gas Cost | ~$0.08 |
| New Issues Filed | 3 (#402, #403, #404) |

## Results

| # | ID | Title | dryRun | On-chain | Notes |
|---|-----|-------|--------|----------|-------|
| 1 | defi-01 | Jupiter Swap SOL→USDC | **PASS** | **CONFIRMED** | 0.005 SOL → 0.448 USDC, #396 fix verified |
| 2 | defi-06 | Jito SOL Staking | **PASS** | **CONFIRMED** | 0.05 SOL → 0.0394 JitoSOL, DELAY 5min, #397 fix verified |
| 3 | defi-08 | Kamino USDC Supply | **FAIL** | — | `Endpoint URL must start with http:` (#402) |
| 4 | defi-09 | Pendle Yield PT Buy | **FAIL** | — | Zod array vs object (#403) |
| 5 | defi-10 | Drift USDC Deposit | **FAIL** | — | `Endpoint URL must start with http:` (#402) |
| 6 | defi-12 | DCent Swap ETH→USDC | **PASS** | **CONFIRMED** | 0.002 ETH → 4.311 USDC, #393 fix verified |

## First-Time PASS Achieved

3개 시나리오가 **최초 PASS** (dryRun + on-chain 모두 성공):
- **defi-01**: Jupiter Swap — 기존 #396(프로그램 오류 6025) 수정 후 정상 동작
- **defi-06**: Jito Staking — 기존 #397(manager fee account) 수정 후 정상 동작
- **defi-12**: DCent Swap — 기존 #393(txdata.value) 수정 후 정상 동작. 단, `fromDecimals`/`toDecimals` 필수 (#404)

## Transaction Log

| Scenario | TX ID | TX Hash | Status | Network |
|----------|-------|---------|--------|---------|
| defi-01 | 019d055c...59c4 | b4e4oiKg...DXuRq | CONFIRMED | solana-mainnet |
| defi-06 | 019d055c...c626 | 2q5z3qSC...pgsw | CONFIRMED | solana-mainnet |
| defi-12 (retry) | 019d055d...413f | 0x7e3d66f0...a279 | CONFIRMED | ethereum-mainnet |

## Balance Changes

| Wallet | Asset | Before | After | Delta | Notes |
|--------|-------|--------|-------|-------|-------|
| Solana | SOL | 0.2999 | 0.2409 | -0.0591 | Jupiter swap + Jito stake + fees |
| Solana | USDC | 10.000 | 10.448 | +0.448 | Jupiter swap output |
| Solana | JitoSOL | 0 | 0.0394 | +0.0394 | Jito staking output |
| EVM | ETH | 0.0172 | 0.0152 | -0.0020 | DCent swap + gas |
| EVM | USDC | 23.127 | 27.438 | +4.311 | DCent swap output |

## Failed Scenarios Detail

### defi-08: Kamino USDC Supply
- **Failed Step**: Step 3 (dryRun)
- **Error**: `ACTION_RESOLVE_FAILED: Endpoint URL must start with http: or https:.`
- **Root Cause**: Kamino SDK에 Solana RPC URL이 전달되지 않음
- **Issue**: #402

### defi-09: Pendle Yield PT Buy
- **Failed Step**: Step 3 (dryRun)
- **Error**: Zod validation — `Expected array, received object`
- **Root Cause**: Pendle API 응답 형식 3회째 변경 (#373 → #398 → #403)
- **Issue**: #403

### defi-10: Drift USDC Deposit
- **Failed Step**: Step 3 (dryRun)
- **Error**: `ACTION_RESOLVE_FAILED: Endpoint URL must start with http: or https:.`
- **Root Cause**: Drift SDK에 Solana RPC URL이 전달되지 않음 (Kamino와 동일 원인)
- **Issue**: #402

### defi-12: DCent Swap (첫 시도 실패)
- **Error**: `DCent API returned empty txdata` (0.001 ETH 첫 시도)
- **Resolution**: 0.002 ETH + slippageBps 100으로 재시도 시 성공
- **Note**: 소액(0.001 ETH) 시 DCent API가 간헐적으로 빈 txdata 반환. 시나리오 최소 금액 상향 권장

## Issues Registered

| Issue ID | Type | Severity | Title |
|----------|------|----------|-------|
| #402 | BUG | HIGH | Kamino/Drift SDK RPC URL 미설정으로 Action 실행 전면 실패 |
| #403 | BUG | HIGH | Pendle API 응답 스키마 불일치 재발 (3회차) |
| #404 | BUG | MEDIUM | DCent Swap fromDecimals/toDecimals 필수인데 시나리오/문서 누락 |

## Verification Checklist

### defi-01: Jupiter Swap
- [x] SOL 잔액 조회 성공 (200 응답)
- [x] Jupiter 스왑 simulate 성공 (dryRun PASS)
- [x] 실제 스왑 트랜잭션 생성 성공 (txId 반환)
- [x] 트랜잭션 컨펌 완료 (CONFIRMED)
- [x] 스왑 후 SOL 감소, USDC 증가 확인

### defi-06: Jito Staking
- [x] SOL 잔액 조회 성공 (200 응답)
- [x] Jito 스테이킹 simulate 성공 (dryRun PASS)
- [x] 실제 스테이킹 트랜잭션 생성 성공 (txId 반환)
- [x] 트랜잭션 컨펌 완료 (CONFIRMED, DELAY 5min)
- [x] 스테이킹 후 SOL 감소, JitoSOL 증가 확인

### defi-12: DCent Swap
- [x] ETH 잔액 조회 성공 (200 응답)
- [x] DCent 스왑 dryRun 성공 (fromDecimals/toDecimals 추가 시)
- [x] 실제 스왑 트랜잭션 생성 성공 (txId 반환, 0.002 ETH)
- [x] 트랜잭션 컨펌 완료 (CONFIRMED)
- [x] 스왑 후 ETH 감소, USDC 증가 확인

## Environment

- Daemon: localhost:3100
- Solana Wallet: D4Y4...AtFA (solana-mainnet)
- EVM Wallet: 0x1EB1...A37f (ethereum-mainnet)
- OS: darwin (Darwin 25.3.0)
- Node: v22.x
