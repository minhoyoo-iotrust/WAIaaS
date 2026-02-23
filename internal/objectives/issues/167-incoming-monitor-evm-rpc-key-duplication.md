# #167 IncomingTxMonitor EVM RPC 설정 키 중복으로 모든 EVM 네트워크 구독 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.3
- **상태:** FIXED

---

## 증상

데몬 시작 시 IncomingTxMonitor가 모든 EVM 네트워크에 대해 `Unknown setting key` 에러를 발생시키며 구독에 실패한다.

```
IncomingTxMonitor: failed to subscribe wallet ... on ethereum-sepolia:
WAIaaSError: Unknown setting key: rpc.evm_ethereum_ethereum_sepolia

IncomingTxMonitor: failed to subscribe wallet ... on polygon-amoy:
WAIaaSError: Unknown setting key: rpc.evm_ethereum_polygon_amoy
```

**영향 범위:** EVM 전체 10개 네트워크 (5체인 × mainnet/testnet). Solana는 정상 동작.

---

## 근본 원인

`packages/daemon/src/lifecycle/daemon.ts:793`의 `subscriberFactory`에서 EVM RPC 설정 키를 구성할 때 `chain` 파라미터를 불필요하게 포함하고 있다.

```typescript
// ❌ 버그 코드 (daemon.ts:793)
const rpcKey = `rpc.evm_${chain}_${network.replace(/-/g, '_')}`;
// chain='ethereum', network='ethereum-sepolia'
// → rpc.evm_ethereum_ethereum_sepolia (잘못된 키)
```

`chain` 파라미터는 EVM의 경우 항상 `'ethereum'`이고, `network` ID에 이미 블록체인 이름이 포함되어 있으므로(`ethereum-sepolia`, `polygon-amoy` 등) 중복이 발생한다.

**올바른 설정 키 패턴:** `rpc.evm_{network_id_underscored}` (예: `rpc.evm_ethereum_sepolia`)

**정상 구현 참조:** `adapter-pool.ts:29`
```typescript
// ✅ 올바른 패턴 (adapter-pool.ts:29)
const key = `evm_${network.replace(/-/g, '_')}`;
// network='ethereum-sepolia' → evm_ethereum_sepolia
```

---

## 해결 방안

### 수정 대상

`packages/daemon/src/lifecycle/daemon.ts:793` — 1줄 수정

### 수정 내용

```typescript
// Before:
const rpcKey = `rpc.evm_${chain}_${network.replace(/-/g, '_')}`;

// After:
const rpcKey = `rpc.evm_${network.replace(/-/g, '_')}`;
```

`adapter-pool.ts:resolveRpcUrl()`의 기존 올바른 패턴과 일치시킨다.

---

## 재발 방지 방안

### 1. subscriberFactory 유닛 테스트 추가

현재 subscriberFactory에 대한 직접 테스트가 없다. 다음 케이스를 커버하는 테스트를 추가한다:

| # | 시나리오 | 검증 |
|---|---------|------|
| 1 | Solana 네트워크 RPC 키 조회 | `rpc.solana_devnet` 형태로 호출되는지 확인 |
| 2 | EVM 네트워크 RPC 키 조회 | `rpc.evm_ethereum_sepolia` 형태로 호출되는지 확인 |
| 3 | EVM 다양한 체인 (polygon-amoy, arbitrum-sepolia 등) | 모두 `rpc.evm_{network}` 패턴인지 확인 |

### 2. resolveRpcUrl() 함수 재사용

`daemon.ts`의 subscriberFactory와 `adapter-pool.ts`의 `resolveRpcUrl()`이 동일한 RPC 키 해석 로직을 중복 구현하고 있다. `resolveRpcUrl()` 함수를 공용 유틸로 추출하거나, subscriberFactory에서 직접 호출하여 키 구성 로직을 단일화한다.

```typescript
// 개선안: resolveRpcUrl 재사용 또는 키 구성 헬퍼 추출
import { resolveRpcUrl } from '../infrastructure/adapter-pool.js';
// 또는 rpcSettingKey(chain, network) 헬퍼 함수 공유
```

### 3. 설정 키 검증 테스트 패턴

새로운 SettingsService.get() 호출을 추가할 때, 키가 `setting-keys.ts`에 실제 존재하는지 검증하는 테스트 관행을 수립한다 (기존 `settingDefinitions` 배열과 대조).

---

## 테스트 항목

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | EVM subscriberFactory가 올바른 RPC 키로 조회 | mock SettingsService → subscriberFactory('ethereum', 'ethereum-sepolia') → `rpc.evm_ethereum_sepolia` 키로 get() 호출 assert | [L0] |
| 2 | 다양한 EVM 네트워크의 키 형태 일관성 | polygon-amoy, arbitrum-sepolia, optimism-mainnet, base-sepolia 각각에 대해 `rpc.evm_{network}` 패턴 assert | [L0] |
| 3 | Solana subscriberFactory 키 형태 비회귀 | subscriberFactory('solana', 'devnet') → `rpc.solana_devnet` 키 유지 assert | [L0] |
| 4 | IncomingTxMonitor EVM 구독 정상 시작 | mock 환경에서 EVM 월렛 3개 + 네트워크 3개 → 모두 에러 없이 구독 성공 assert | [L0] |

---

*발견일: 2026-02-24*
*발견 환경: npm 최신 RC 버전 글로벌 설치*
*관련: #164 (IncomingTxMonitor 전체 네트워크 구독), adapter-pool.ts:resolveRpcUrl()*
