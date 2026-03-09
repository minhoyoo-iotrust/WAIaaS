# #281 HyperEVM incoming.wss_url 설정 키 미등록 — IncomingTxMonitor 구독 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 증상

데몬 시작 시 IncomingTxMonitor가 HyperEVM 네트워크(hyperevm-mainnet, hyperevm-testnet) 구독에 실패한다.

```
IncomingTxMonitor: failed to subscribe wallet ... on hyperevm-testnet: WAIaaSError: Unknown setting key: incoming.wss_url.hyperevm-testnet
IncomingTxMonitor: failed to subscribe wallet ... on hyperevm-mainnet: WAIaaSError: Unknown setting key: incoming.wss_url.hyperevm-mainnet
```

## 원인

v31.4(Hyperliquid 생태계 통합)에서 HyperEVM 네트워크를 추가하고, #280에서 RPC 설정 키(`rpc.evm_hyperevm_*`)와 `rpc_pool.hyperevm-*`는 추가했으나, `incoming.wss_url.hyperevm-*` 설정 키가 `SETTING_DEFINITIONS`에 누락됨.

- **누락 위치:** `packages/daemon/src/infrastructure/settings/setting-keys.ts` — `SETTING_DEFINITIONS` 배열에 `incoming.wss_url.hyperevm-mainnet`, `incoming.wss_url.hyperevm-testnet` 미등록
- `SettingsService.get('incoming.wss_url.hyperevm-mainnet')`이 키 유효성 검증에서 실패하여 `ACTION_VALIDATION_FAILED` 에러 throw
- `resolveWssUrl()` → `SettingsService.get()` 경로에서 발생

## 수정 범위

1. **setting-keys.ts**: `SETTING_DEFINITIONS`에 2개 incoming WSS URL 항목 추가
   - `{ key: 'incoming.wss_url.hyperevm-mainnet', category: 'incoming', configPath: 'incoming.wss_url.hyperevm-mainnet', defaultValue: '', isCredential: false }`
   - `{ key: 'incoming.wss_url.hyperevm-testnet', category: 'incoming', configPath: 'incoming.wss_url.hyperevm-testnet', defaultValue: '', isCredential: false }`

2. **settings-service.test.ts**: 총 정의 수 기대값 갱신 (현재값 → +2)

## 테스트 항목

- [ ] `SettingsService.get('incoming.wss_url.hyperevm-mainnet')` 정상 반환 (에러 없음)
- [ ] `SettingsService.get('incoming.wss_url.hyperevm-testnet')` 정상 반환 (에러 없음)
- [ ] `SETTING_DEFINITIONS.length` 기대값 일치
- [ ] 데몬 시작 시 HyperEVM 네트워크 IncomingTxMonitor 구독 성공 (에러 로그 미출력)
