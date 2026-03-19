# UAT Report: DeFi Retry (7 scenarios) — v2.11.0-rc.23

- **Date**: 2026-03-19 16:15
- **Version**: v2.11.0-rc.23 (commit: efabf59f)
- **Category**: defi (retry of never-passed scenarios)
- **Network**: ethereum-mainnet, solana-mainnet
- **Executor**: agent

## Summary

| Metric | Value |
|--------|-------|
| Total | 7 |
| Passed | 1 |
| Failed | 6 |
| Skipped | 0 |
| Total Gas Cost | ~$0.00 (dryRun only) |

## Results

| # | ID | Title | Status | Notes |
|---|-----|-------|--------|-------|
| 1 | defi-01 | Jupiter Swap SOL→USDC | FAIL | Jupiter V6 프로그램 오류 6025 (Issue #396) |
| 2 | defi-06 | Jito SOL Staking | FAIL | "Invalid manager fee account" (Issue #397) |
| 3 | defi-07 | Aave V3 USDC Supply | **PASS** | dryRun 시뮬레이션 성공! Gas: 67,633, Fee: ~$0.013 |
| 4 | defi-08 | Kamino USDC Supply | FAIL | SDK 미설치: @kamino-finance/klend-sdk (Issue #399) |
| 5 | defi-09 | Pendle Buy PT | FAIL | API 응답 스키마 불일치 회귀 (Issue #398) |
| 6 | defi-10 | Drift USDC Deposit | FAIL | SDK 미설치: @drift-labs/sdk (Issue #399) |
| 7 | defi-12 | DCent Swap ETH→USDC | FAIL | txdata.value 불일치 (Issue #393, FIXED but retest pending) |

## Passed Scenarios

### defi-07: Aave V3 USDC Supply (dryRun)
- **Policy**: `INSTANT` 허용
- **Simulation**: 성공
- **Gas**: 67,633 units
- **Fee**: ~$0.013 (5,876,111,109,910 wei)
- **Note**: asset 파라미터에 USDC 심볼 대신 ERC-20 주소 사용 필요 (`0xA0b8...eB48`). 실제 supply 실행은 사용자 승인 보류 중

## Failed Scenarios

### defi-01: Jupiter Swap
- **Error**: Jupiter V6 프로그램 custom error 0x1789 (6025)
- **CU consumed**: 1,648/200,000 (매우 초기 실패)
- **Root Cause**: Jupiter V6 라우트 만료 또는 프로그램 버전 비호환
- **Issue**: #396

### defi-06: Jito Staking
- **Error**: `Invalid manager fee account` (SPL Stake Pool error 0x9)
- **Detail**: ATA 생성은 성공, DepositSol 인스트럭션에서 실패
- **Root Cause**: Jito Stake Pool의 manager_fee_account 온체인 상태와 코드 하드코딩 불일치
- **Issue**: #397

### defi-08: Kamino Lending / defi-10: Drift Perp
- **Error**: SDK 미설치 (`@kamino-finance/klend-sdk`, `@drift-labs/sdk`)
- **Root Cause**: #374/#375에서 동적 import 래퍼 구현했으나 실제 패키지 미설치
- **Issue**: #399

### defi-09: Pendle Yield
- **Error**: Zod union 검증 실패 — API 응답 object vs 스키마 기대 array
- **Root Cause**: #373 수정 후 Pendle API 응답 형식 재변경 (회귀)
- **Issue**: #398

### defi-12: DCent Swap
- **Error**: execution reverted — txdata.value 프로토콜 수수료만 반환
- **Issue**: #393 (FIXED, 재배포 후 재테스트 필요)

## Systemic Issue

**모든 DeFi UAT 시나리오(defi-01~10)가 구 API 형식 사용** (#395):
- 시나리오: `POST /v1/transactions/simulate` + `action` 필드
- 실제 API: `POST /v1/actions/{provider}/{action}?dryRun=true`
- 파라미터명도 불일치 (reserve→asset, market→asset 등)

## Issues Registered

| Issue ID | 유형 | 심각도 | 제목 |
|----------|------|--------|------|
| #395 | BUG | HIGH | DeFi UAT 시나리오 6개 API 엔드포인트/파라미터 불일치 |
| #396 | BUG | HIGH | Jupiter Swap 프로그램 오류 6025 |
| #397 | BUG | HIGH | Jito Staking "Invalid manager fee account" |
| #398 | BUG | HIGH | Pendle API 응답 스키마 불일치 회귀 |
| #399 | BUG | HIGH | Kamino/Drift SDK 런타임 미설치 |

## Environment

- Daemon: localhost:3100
- EVM Wallet: 0x1EB1...A37f (evm-mainnet, 0.0173 ETH + 24.13 USDC)
- Solana Wallet: D4Y4...AtFA (solana-mainnet, 0.30 SOL + 10.0 USDC)
- OS: darwin (macOS)
