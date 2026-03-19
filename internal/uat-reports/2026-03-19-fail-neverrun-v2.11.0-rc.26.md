# UAT Report: FAIL + NEVER RUN scenarios — v2.11.0-rc.26

- **Date**: 2026-03-19 20:10
- **Version**: v2.11.0-rc.26 (commit: 6923a658)
- **Category**: mixed (defi, advanced, admin)
- **Network**: ethereum-mainnet, solana-mainnet, ethereum-sepolia, all
- **Executor**: agent

## Summary

| Metric | Value |
|--------|-------|
| Total | 12 |
| Passed | 2 |
| Failed | 6 |
| Skipped | 3 |
| Partial | 1 |
| New Issues Filed | 7 (#405-#411) |
| Total Gas Cost | ~$0.01 (Sepolia self-transfer) |

## Results

| # | ID | Title | Status | Gas | Duration | Notes |
|---|-----|-------|--------|-----|----------|-------|
| 1 | defi-08 | Kamino Lending (USDC Supply) | FAIL | $0 | 3s | #406 programId.toBuffer |
| 2 | defi-09 | Pendle Yield Trading (PT) | FAIL | $0 | 2s | #407 schema array vs object (4th) |
| 3 | defi-10 | Drift Perpetual Trading | FAIL | $0 | 2s | #408 Wallet.local not a function |
| 4 | defi-14 | DCent 2-hop Auto-Routing | PARTIAL | $0 | 3s | dryRun PASS, get_quotes FAIL (#409) |
| 5 | defi-15 | DCent 크로스체인 (EVM→Solana) | SKIP | $0 | 2s | DCent API 크로스체인 미지원 (empty txdata) |
| 6 | defi-16 | DCent Solana 스왑 | FAIL | $0 | 2s | #410 txdata from/to schema regression |
| 7 | advanced-01 | Smart Account UserOp Build/Sign | FAIL | $0 | 1s | #411 /v1/userop/* 엔드포인트 미구현 |
| 8 | advanced-02 | x402 HTTP 결제 | SKIP | $0 | 1s | x402 서비스 없음, capability 확인만 PASS |
| 9 | advanced-03 | 가스 조건부 실행 | FAIL | $0 | 12s | #405 gasCondition 파라미터 무시됨 |
| 10 | advanced-04 | 메시지 서명 및 검증 | PASS | $0 | 5s | personal_sign + EIP-712 + hex 서명/검증 통과 |
| 11 | advanced-05 | 트랜잭션 승인 워크플로우 | SKIP | $0.01 | 8s | Owner GRACE (LOCKED 필요), 기본 전송 CONFIRMED |
| 12 | admin-01 | Admin UI 전체 페이지 접근 | PASS | $0 | 2s | 12개 페이지 전부 HTTP 200 |

## Failed Scenarios

### defi-08: Kamino Lending (USDC Supply)
- **Failed Step**: Step 3 (Kamino USDC Supply Simulate)
- **Error**: `ACTION_RESOLVE_FAILED: programId.toBuffer is not a function`
- **Response**: Kamino SDK에서 @solana/kit Address를 web3.js PublicKey로 변환 실패
- **Issue**: #406

### defi-09: Pendle Yield Trading (PT)
- **Failed Step**: Step 3 (PT 매수 Simulate)
- **Error**: `ACTION_RESOLVE_FAILED: Expected array, received object`
- **Response**: Pendle API 응답이 배열 대신 객체, Zod z.array() 검증 실패
- **Issue**: #407 (4회차 재발: #373 → #398 → #403 → #407)

### defi-10: Drift Perpetual Trading
- **Failed Step**: Step 3 (USDC Deposit Simulate)
- **Error**: `ACTION_RESOLVE_FAILED: sdk.Wallet.local is not a function`
- **Response**: Drift SDK Wallet 팩토리 메서드 호환성 에러
- **Issue**: #408

### defi-16: DCent Solana 스왑 (SOL→USDC)
- **Failed Step**: Step 2 (DCent Solana dryRun)
- **Error**: `ACTION_RESOLVE_FAILED: txdata.from Required, txdata.to Required`
- **Response**: Solana 트랜잭션에 EVM 전용 스키마 적용 (#394 회귀)
- **Issue**: #410

### advanced-01: Smart Account UserOp Build/Sign
- **Failed Step**: Step 3 (UserOp Build)
- **Error**: `404 Not Found`
- **Response**: `/v1/userop/build` 엔드포인트 미존재
- **Issue**: #411

### advanced-03: 가스 조건부 실행
- **Failed Step**: Step 2 (낮은 가스 상한 테스트)
- **Error**: 조건 미충족이어야 하나 `success: true` 반환
- **Response**: `gasCondition.maxGasPrice` 파라미터가 simulate에서 무시됨
- **Issue**: #405

## Passed Scenarios

### admin-01: Admin UI 전체 페이지 접근 검증
- 12개 Admin UI 페이지 전부 HTTP 200 응답
- /admin/dashboard, /admin/wallets, /admin/policies, /admin/settings, /admin/notifications, /admin/audit-logs, /admin/backup, /admin/tokens, /admin/stats, /admin/nft, /admin/defi, /admin/providers

### advanced-04: 메시지 서명 및 검증
- personal_sign UTF-8: 서명 성공 + viem verifyMessage 검증 통과
- EIP-712 typedData (Permit2): 서명 성공 + viem verifyTypedData 검증 통과
- 0x-프리픽스 hex: 서명 성공 + viem verifyMessage(raw) 검증 통과
- SIGN 트랜잭션 기록 8건 확인 (type=SIGN, status=SIGNED)

## Skipped Scenarios

### defi-15: DCent 크로스체인 (EVM→Solana)
- DCent API가 EVM→Solana 크로스체인 경로를 지원하지 않음 (empty txdata)
- 시나리오 Troubleshooting에 명시된 알려진 한계

### advanced-02: x402 HTTP 결제
- x402 capability 확인: PASS
- 테스트 가능한 x402 서비스 미존재, simulate까지만 시도

### advanced-05: 트랜잭션 승인 워크플로우
- Owner state=GRACE (LOCKED 필요하여 APPROVAL 미활성화)
- 기본 전송은 CONFIRMED 정상 동작
- SPENDING_LIMIT tier=NOTIFY로 분류되어 바로 실행

## New Issues Filed

| Issue | Type | Severity | Title |
|-------|------|----------|-------|
| #405 | BUG | MEDIUM | simulate API gasCondition 파라미터 무시 |
| #406 | BUG | HIGH | Kamino SDK programId.toBuffer 호환 에러 |
| #407 | BUG | HIGH | Pendle API 스키마 불일치 4회차 재발 |
| #408 | BUG | HIGH | Drift SDK Wallet.local 호환 에러 |
| #409 | BUG | MEDIUM | DCent get_quotes informational 에러 반환 |
| #410 | BUG | HIGH | DCent Solana txdata 스키마 회귀 |
| #411 | MISSING | HIGH | UserOp Build/Sign REST 엔드포인트 미구현 |

## Environment

- Daemon: localhost:3100
- RPC: mainnet-beta.solana.com, public Ethereum RPC
- OS: Darwin 25.3.0
- Node: v22.22.0
