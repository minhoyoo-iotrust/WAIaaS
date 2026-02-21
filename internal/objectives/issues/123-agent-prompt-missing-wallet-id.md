# 123. 에이전트 프롬프트에 지갑 UUID 및 사용 가능 네트워크 누락

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** -
- **상태:** OPEN

## 현황

`buildConnectInfoPrompt()`가 생성하는 프롬프트 텍스트에 지갑 UUID가 포함되지 않는다. 프롬프트는 "Specify walletId parameter to target a specific wallet"이라고 안내하지만, 실제로 UUID를 제공하지 않아 에이전트가 **지갑 이름**을 `walletId`로 사용하게 된다.

### 재현 과정

1. Admin Dashboard에서 Agent Connection Prompt 생성 (2개 지갑)
2. 프롬프트를 Claude Code에 붙여넣기
3. "잔액 조회해줘" 요청
4. 에이전트가 `GET /v1/wallet/balance?walletId=solana-testnet` 호출
5. `session_wallets` 테이블에는 UUID가 저장되어 있으므로 매칭 실패 → `WALLET_ACCESS_DENIED`

### 에러 응답

```json
{
  "code": "WALLET_ACCESS_DENIED",
  "message": "Wallet not accessible from this session",
  "retryable": false
}
```

### 현재 프롬프트 출력

```
1. solana-testnet (solana/testnet)
   Address: AnHN...cfA
   Network: devnet
   Policies: No restrictions
```

`?walletId=` 없이 호출하면 JWT의 `defaultWalletId`(UUID)를 사용하여 정상 동작하나, 에이전트가 멀티 지갑 환경에서 특정 지갑을 지정할 때 이름을 사용하므로 첫 번째 지갑 외에는 접근 불가.

### 추가 문제: 사용 가능 네트워크 미표시

프롬프트에 `Network: devnet` (기본 네트워크) 하나만 표시된다. 각 지갑은 environment 기반으로 여러 네트워크를 지원하지만(`?network=` 파라미터), 에이전트가 이를 알 수 없다.

- Solana testnet → devnet, testnet
- EVM testnet → ethereum-sepolia, base-sepolia, arbitrum-sepolia, optimism-sepolia

`connect-info` JSON 응답에도 `availableNetworks` 필드가 없어 에이전트가 기본 네트워크 외의 네트워크를 활용할 수 없다.

## 수정 방안

### 1. `BuildConnectInfoPromptParams` 인터페이스에 `id` 필드 추가

```typescript
export interface BuildConnectInfoPromptParams {
  wallets: Array<{
    id: string;       // ← 추가
    name: string;
    chain: string;
    // ...
  }>;
}
```

### 2. `buildConnectInfoPrompt()`에 UUID 출력 추가

```typescript
lines.push(`${i + 1}. ${w.name} (${w.chain}/${w.environment})`);
lines.push(`   ID: ${w.id}`);        // ← 추가
lines.push(`   Address: ${w.address}`);
```

### 3. 호출부에서 `id` 전달

`connect-info.ts`와 `admin.ts`(agent-prompt)의 `promptWallets` 매핑에 `id` 필드 추가.

### 4. 프롬프트에 사용 가능 네트워크 목록 추가

```typescript
lines.push(`   Networks: ${w.networks.join(', ')} (default: ${w.defaultNetwork})`);
```

`BuildConnectInfoPromptParams`에 `networks: string[]` 필드를 추가하고, 호출부에서 `GET /v1/wallets/{id}/networks` 결과 또는 environment 기반 네트워크 목록을 전달.

### 5. `connect-info` JSON 응답에 `availableNetworks` 필드 추가

각 지갑 객체에 `availableNetworks: string[]` 필드를 추가하여 에이전트가 프로그래밍적으로도 사용 가능 네트워크를 알 수 있게 한다.

### 6. walletId 안내 문구 보완

```
Specify walletId parameter (UUID from the ID field above) to target a specific wallet.
Append ?network=<network> to query a specific network (defaults to wallet's default network).
```

## 수정 대상

| 파일 | 변경 |
|------|------|
| `packages/daemon/src/api/routes/connect-info.ts` | `BuildConnectInfoPromptParams`에 `id`, `networks` 추가, 프롬프트에 UUID + 네트워크 목록 출력, JSON 응답에 `availableNetworks` 추가 |
| `packages/daemon/src/api/routes/admin.ts` | agent-prompt `promptWallets` 매핑에 `id`, `networks` 전달 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | `ConnectInfoResponseSchema` 지갑 객체에 `availableNetworks` 필드 추가 |

## 테스트 항목

### 단위 테스트 (`packages/daemon/src/__tests__/connect-info-prompt.test.ts`)

- `buildConnectInfoPrompt()` 출력에 각 지갑의 UUID가 `ID:` 라인으로 포함되는지 검증
- 프롬프트에 `Networks:` 라인으로 사용 가능 네트워크 목록과 기본 네트워크가 포함되는지 검증
- walletId 안내 문구에 UUID 사용 안내가 포함되는지 검증
- `?network=` 파라미터 안내 문구가 포함되는지 검증

### 통합 테스트 (`packages/daemon/src/__tests__/connect-info.test.ts`)

- `GET /v1/connect-info` JSON 응답의 각 지갑에 `availableNetworks` 배열이 포함되는지 검증
- `GET /v1/connect-info` 응답의 `prompt` 필드에 UUID가 포함되는지 검증
- `POST /admin/agent-prompt` 응답의 프롬프트에 UUID가 포함되는지 검증
- 프롬프트에서 추출한 UUID로 `GET /v1/wallet/balance?walletId=<UUID>` 호출 시 200 응답 검증
- 지갑 이름으로 `?walletId=solana-testnet` 호출 시 `WALLET_ACCESS_DENIED` 반환 검증 (회귀 방지)
