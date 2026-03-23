# 396 — Jupiter Swap 프로그램 오류 6025로 시뮬레이션 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** —
- **발견일:** 2026-03-19

## 현상

`POST /v1/actions/jupiter_swap/swap?dryRun=true`으로 SOL→USDC 스왑 시뮬레이션 시 Jupiter V6 프로그램에서 오류 6025 (0x1789) 발생.

```
Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 invoke [1]
Program log: Instruction: Route
Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 consumed 1648 of 200000 compute units
Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1789
```

- 소비된 CU: 1,648/200,000 (매우 초기 단계에서 실패)
- 정책 결과: `INSTANT` (허용)

## 파라미터

```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "5000000",
  "slippageBps": 50
}
```

## 원인 추정

1. **Jupiter V6 프로그램 지원 중단**: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`는 Jupiter V6 프로그램 ID. Jupiter가 V7/V8로 업그레이드하면서 V6 라우트가 더 이상 유효하지 않을 수 있음
2. **라우트 만료**: Jupiter API에서 받은 라우트가 시뮬레이션 시점에 이미 만료
3. **금액 미달**: 5,000,000 lamports (0.005 SOL)이 최소 스왑 금액 미달

## 영향

- Jupiter Swap 전체 기능 사용 불가 (SOL→SPL, SPL→SPL 모든 스왑)
- defi-01 UAT 시나리오 실행 불가

## 수정 방안

1. Jupiter API 클라이언트가 사용하는 프로그램 ID 확인 — 최신 Jupiter 프로그램으로 업데이트 필요할 수 있음
2. Jupiter API 응답의 라우트 유효성 확인 (만료 시간 등)
3. 에러 코드 6025 매핑 추가 (Jupiter 에러 코드 문서 확인)

## 수정 대상 파일

- `packages/actions/src/providers/jupiter-swap/` — Jupiter API 클라이언트 및 프로그램 ID 확인
- `packages/actions/src/providers/jupiter-swap/jupiter-api-client.ts` — API 호출 파라미터 확인

## 테스트 항목

1. **통합 테스트**: Jupiter swap dryRun 성공 확인 (simulation.success: true)
2. **유닛 테스트**: Jupiter 에러 코드 6025 매핑 및 사용자 친화적 에러 메시지 확인
