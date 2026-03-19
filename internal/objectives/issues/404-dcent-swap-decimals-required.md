# 404: DCent Swap dex_swap에 fromDecimals/toDecimals 필수 파라미터 누락 시 검증 실패

- **유형:** BUG
- **심각도:** MEDIUM
- **발견일:** 2026-03-19
- **발견 경위:** DeFi UAT defi-12 dryRun 실행 — 시나리오대로 실행 시 실패, fromDecimals/toDecimals 추가 시 성공

## 증상

DCent Swap dex_swap action 실행 시 파라미터 검증 실패:
```
ACTION_VALIDATION_FAILED: fromDecimals: Required, toDecimals: Required
```

## 원인

`dex_swap` 액션의 Zod 스키마에 `fromDecimals`(number)와 `toDecimals`(number)가 필수 필드로 정의되어 있으나:
1. UAT 시나리오(defi-12)에 해당 필드가 포함되어 있지 않음
2. CAIP-19 자산 식별자에서 decimals를 자동 추출하지 않고 명시적 전달을 요구

## 재현 조건

```bash
# 실패 (fromDecimals/toDecimals 없음)
curl -s -X POST 'http://localhost:3100/v1/actions/dcent_swap/dex_swap?dryRun=true' \
  -d '{"walletId":"<WALLET>","network":"ethereum-mainnet","params":{"fromAsset":"eip155:1/slip44:60","toAsset":"eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","amount":"1000000000000000","slippageBps":50}}'

# 성공 (fromDecimals/toDecimals 추가)
# ... + "fromDecimals": 18, "toDecimals": 6
```

## 제안 수정 방향

1. **UAT 시나리오 업데이트**: defi-12의 모든 curl 예시에 `fromDecimals`/`toDecimals` 추가
2. **(선택) DX 개선**: CAIP-19에서 네이티브 토큰(slip44:60→18, slip44:501→9)은 자동 추론, ERC-20은 토큰 레지스트리에서 조회하여 optional로 변경 검토

## 영향

- defi-12 UAT 시나리오가 그대로 실행하면 무조건 실패
- 에이전트/SDK 사용자가 decimals를 직접 파악해야 하는 DX 마찰

## 테스트 항목

- [ ] defi-12 UAT 시나리오에 fromDecimals/toDecimals가 포함되어 있는지 확인
- [ ] fromDecimals/toDecimals 없이 호출 시 명확한 에러 메시지 반환 확인
