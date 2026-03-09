# #280 HyperEVM RPC 설정 키 미등록 — IncomingTxMonitor 구독 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.6
- **상태:** FIXED

## 증상

데몬 시작 시 IncomingTxMonitor가 HyperEVM 네트워크(hyperevm-mainnet, hyperevm-testnet) 구독에 실패한다.

```
IncomingTxMonitor: failed to subscribe wallet ... on hyperevm-testnet: WAIaaSError: Unknown setting key: rpc.evm_hyperevm_testnet
IncomingTxMonitor: failed to subscribe wallet ... on hyperevm-mainnet: WAIaaSError: Unknown setting key: rpc.evm_hyperevm_mainnet
```

## 원인

v31.4(Hyperliquid 생태계 통합)에서 HyperEVM 네트워크를 추가했으나, `SETTING_DEFINITIONS`에 RPC 설정 키 2개가 누락됨.

- 네트워크 정의 완료: `chain.ts`, `network-map.ts`, `evm-chain-map.ts` 모두 등록됨
- RPC 키 생성 정상: `rpcConfigKey('ethereum', 'hyperevm-mainnet')` → `evm_hyperevm_mainnet`
- **누락 위치:** `packages/daemon/src/infrastructure/settings/setting-keys.ts` — `SETTING_DEFINITIONS` 배열에 `rpc.evm_hyperevm_mainnet`, `rpc.evm_hyperevm_testnet` 미등록
- `SettingsService.get()`이 키 유효성 검증에서 실패하여 에러 throw

## 수정 범위

1. **setting-keys.ts**: `SETTING_DEFINITIONS`에 2개 RPC 항목 추가
   - `{ key: 'rpc.evm_hyperevm_mainnet', category: 'rpc', configPath: 'rpc.evm_hyperevm_mainnet', defaultValue: 'https://rpc.hyperliquid.xyz/evm', isCredential: false }`
   - `{ key: 'rpc.evm_hyperevm_testnet', category: 'rpc', configPath: 'rpc.evm_hyperevm_testnet', defaultValue: 'https://rpc.hyperliquid-testnet.xyz/evm', isCredential: false }`
   - 주석 갱신: `Solana 3 + EVM 10` → `Solana 3 + EVM 12`

2. **settings-service.test.ts**: 총 정의 수 기대값 갱신 (`192` → `194`)

3. **rpc-config-key.test.ts**: `EVM_NETWORKS` 배열 및 `EXPECTED_EVM_KEYS`에 `hyperevm-mainnet`, `hyperevm-testnet` 추가

## 테스트 항목

- [ ] `rpcConfigKey('ethereum', 'hyperevm-mainnet')` → `evm_hyperevm_mainnet` 반환 확인
- [ ] `rpcConfigKey('ethereum', 'hyperevm-testnet')` → `evm_hyperevm_testnet` 반환 확인
- [ ] `SettingsService.get('rpc.evm_hyperevm_mainnet')` 정상 반환 (에러 없음)
- [ ] `SettingsService.get('rpc.evm_hyperevm_testnet')` 정상 반환 (에러 없음)
- [ ] `SETTING_DEFINITIONS.length` 기대값 일치
- [ ] 데몬 시작 시 HyperEVM 네트워크 IncomingTxMonitor 구독 성공
