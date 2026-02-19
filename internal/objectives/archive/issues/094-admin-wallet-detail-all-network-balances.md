# 094 — Admin 지갑 상세에서 모든 네트워크 잔액 미표시

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v2.4
- **상태:** FIXED
- **등록일:** 2026-02-19

## 현상

Admin UI 지갑 상세 페이지에서 지갑 잔액 조회 시 `defaultNetwork` 하나의 네이티브 + 토큰 잔액만 표시된다.

예: 이더리움 테스트넷 지갑의 경우 `ethereum-sepolia`만 조회되고, 동일 키를 공유하는 `polygon-amoy`, `arbitrum-sepolia`, `optimism-sepolia`, `base-sepolia` 네트워크 잔액은 보이지 않음.

## 원인

`GET /v1/admin/wallets/{id}/balance` 엔드포인트가 `wallet.defaultNetwork` (또는 `getDefaultNetwork()` 폴백) 하나에 대해서만 잔액을 조회한다.

```typescript
// packages/daemon/src/api/routes/admin.ts:1522-1526
const network = (wallet.defaultNetwork
  ?? getDefaultNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType)) as NetworkType;
const rpcUrl = resolveRpcUrl(deps.daemonConfig!.rpc, wallet.chain, network);
const adapter = await deps.adapterPool.resolve(wallet.chain as ChainType, network, rpcUrl);
```

Admin UI도 이 단일 네트워크 응답만 렌더링한다.

## 기대 동작

지갑의 `chain + environment` 조합으로 사용 가능한 **모든 네트워크**의 잔액을 표시한다.

- 이더리움 테스트넷: ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia
- 이더리움 메인넷: ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet
- 솔라나 테스트넷: devnet, testnet
- 솔라나 메인넷: mainnet

## 수정 범위

### 1. 백엔드 — `GET /v1/admin/wallets/{id}/balance` 응답 확장

- `getNetworksForEnvironment(chain, environment)`로 가용 네트워크 목록 획득
- 각 네트워크에 대해 병렬로 `adapter.getBalance()` + `adapter.getAssets()` 호출
- RPC URL 미설정 또는 연결 실패 시 해당 네트워크는 `error` 필드로 반환 (전체 실패 아님)
- 응답 스키마를 네트워크별 배열로 변경:

```typescript
// 새 응답 스키마
z.object({
  balances: z.array(z.object({
    network: z.string(),
    isDefault: z.boolean(),
    native: z.object({
      balance: z.string(),
      symbol: z.string(),
    }).nullable(),
    tokens: z.array(z.object({
      symbol: z.string(),
      balance: z.string(),
      address: z.string(),
    })),
    error: z.string().optional(),
  })),
})
```

### 2. Admin UI — 지갑 상세 잔액 섹션 개선

- `WalletBalance` 인터페이스를 네트워크별 배열로 변경
- 네트워크별 카드/행으로 잔액 표시 (기본 네트워크 상단 배치, 뱃지 표시)
- 로딩 중인 네트워크는 스켈레톤, 실패한 네트워크는 에러 메시지 표시
- RPC 미설정 네트워크는 "RPC not configured" 안내

## 테스트 항목

### 단위 테스트
1. `adminWalletBalanceRoute` 핸들러가 모든 가용 네트워크에 대해 잔액을 반환하는지 확인
2. 일부 네트워크 RPC 연결 실패 시 해당 네트워크만 `error` 포함하고 나머지는 정상 반환
3. `adapterPool` 미설정 시 빈 `balances` 배열 반환

### 통합 테스트
4. Admin UI `WalletBalance` 인터페이스가 새 스키마에 맞게 렌더링되는지 확인
5. 기본 네트워크에 `isDefault` 뱃지 표시 확인
6. 에러 네트워크에 에러 메시지 표시 확인
