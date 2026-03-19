# 402: Kamino/Drift SDK RPC URL 미설정으로 Action 실행 전면 실패

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-19
- **발견 경위:** DeFi UAT defi-08 (Kamino), defi-10 (Drift) dryRun 실행

## 증상

Kamino supply 또는 Drift add_margin action 실행 시:
```
ACTION_RESOLVE_FAILED: Endpoint URL must start with `http:` or `https:`.
```

## 원인

Kamino SDK와 Drift SDK가 Solana RPC URL을 올바르게 전달받지 못함. #399에서 SDK 설치는 완료되었으나, SDK 초기화 시 RPC 엔드포인트 해석에 실패하는 것으로 추정.

- `KaminoSdkWrapper`/`DriftSdkWrapper`가 RPC URL을 resolveRpcUrl 등에서 가져올 때 빈 문자열 또는 undefined가 전달되어 URL 파싱 에러 발생
- #380 (PositionTracker RPC URL 미해결) 수정 시 Action Provider 쪽은 반영되지 않았을 가능성

## 재현 조건

```bash
curl -s -X POST 'http://localhost:3100/v1/actions/kamino/kamino_supply?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{"walletId":"<SOL_WALLET>","network":"solana-mainnet","params":{"asset":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","humanAmount":"1.0","decimals":6}}'
```

동일 에러가 drift_perp/drift_add_margin에서도 발생.

## 영향

- Kamino Lending 전체 기능 사용 불가 (supply/withdraw)
- Drift Perp 전체 기능 사용 불가 (add_margin/open_position/close_position/withdraw_margin)

## 테스트 항목

- [ ] Kamino kamino_supply dryRun 성공 (200 응답)
- [ ] Drift drift_add_margin dryRun 성공 (200 응답)
- [ ] 두 SDK가 Admin Settings의 RPC URL을 올바르게 수신하는지 단위 테스트
