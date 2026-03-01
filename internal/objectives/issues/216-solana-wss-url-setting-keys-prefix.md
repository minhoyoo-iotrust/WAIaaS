# #216 Solana WSS URL 설정 키에 `solana-` 프리픽스 누락 (v29.5 사이드 이펙트)

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.6
- **상태:** OPEN

## 증상

데몬 시작 시 IncomingTxMonitor가 Solana 지갑 구독에 실패:

```
IncomingTxMonitor: failed to subscribe wallet ... on solana-devnet:
WAIaaSError: Unknown setting key: incoming.wss_url.solana-devnet
```

`solana-mainnet`, `solana-testnet`도 동일하게 실패.

## 원인

v29.5(#211)에서 Solana 네트워크 ID를 `mainnet` → `solana-mainnet` 형식으로 통일했으나,
`setting-keys.ts`의 per-network WSS URL 키는 이전 형식(`mainnet`, `devnet`, `testnet`)으로 등록되어 있음.

`daemon.ts`의 `resolveWssUrl(net, rpcUrl)` 함수가 `incoming.wss_url.${net}`으로 조회하므로,
`net`이 `solana-devnet`일 때 `incoming.wss_url.solana-devnet` 키를 찾지만 등록된 키는 `incoming.wss_url.devnet`.

## 영향 범위

| 파일 | 라인 | 내용 |
|------|------|------|
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | 158-160 | WSS URL 키 3개가 구 형식 (`mainnet`, `devnet`, `testnet`) |
| `packages/daemon/src/__tests__/config-loader.test.ts` | 604, 607, 612 | 테스트 기대값도 구 형식 — 키 변경 시 함께 수정 필요 |

참고: `daemon.ts`의 `resolveWssUrl`, `rpcConfigKey`, Admin UI 검색 인덱스 등은 이미 새 형식(`solana-*`)을 사용하여 정상.

## 수정 방안

### 1. `setting-keys.ts` 키 변경

```
incoming.wss_url.mainnet  → incoming.wss_url.solana-mainnet
incoming.wss_url.devnet   → incoming.wss_url.solana-devnet
incoming.wss_url.testnet  → incoming.wss_url.solana-testnet
```

configPath도 동일하게 변경.

### 2. `config-loader.test.ts` 기대값 갱신

테스트에서 참조하는 키 이름도 새 형식으로 변경.

### DB 마이그레이션

기존 DB에 구 형식 키로 저장된 값이 있을 수 있으나, 기본값이 빈 문자열이므로 실질적 영향 없음. 마이그레이션 불필요.

## 테스트 항목

- [ ] `setting-keys.ts`에 `incoming.wss_url.solana-mainnet`, `incoming.wss_url.solana-devnet`, `incoming.wss_url.solana-testnet` 키 등록 확인
- [ ] `resolveWssUrl('solana-devnet', rpcUrl)` 호출 시 에러 없이 정상 동작 확인
- [ ] 데몬 시작 시 `Unknown setting key: incoming.wss_url.solana-*` 에러 미발생 확인
- [ ] `config-loader.test.ts` 테스트 통과 확인
- [ ] Admin UI Settings에서 Solana WSS URL 키가 올바른 이름으로 표시 확인
