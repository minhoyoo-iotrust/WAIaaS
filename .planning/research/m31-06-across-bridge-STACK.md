# Technology Stack: Across Protocol Bridge Integration

**Project:** WAIaaS v31.6 Across Protocol
**Researched:** 2026-03-08

## Recommended Stack

### Core (기존 활용 -- 신규 의존성 없음)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| viem | 2.x (기존) | depositV3 calldata 인코딩, ABI encoding | 이미 EVM adapter에서 사용 중. encodeFunctionData로 depositV3 파라미터 인코딩 |
| Zod | 3.x (기존) | Across API 응답 런타임 검증 | SSoT 패턴. LI.FI 스키마와 동일한 방식 |
| Native fetch | Node 22 (기존) | Across REST API 호출 | ActionApiClient 베이스 클래스 활용 |

### Across Protocol API

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /suggested-fees` | 수수료 견적 (LP + relayer + gas) | Integrator ID (optional header) |
| `GET /limits` | 토큰별 min/max deposit 제한 | None |
| `GET /available-routes` | 지원 체인/토큰 조합 | None |
| `GET /deposit/status` | deposit fill 상태 추적 | None |

### SpokePool Contract

| Chain | Contract | Purpose |
|-------|----------|---------|
| Ethereum | `0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5` | depositV3() 호출 대상 |
| Other EVM chains | deployments.json 참조 | 체인별 SpokePool proxy |

### Supporting Libraries (기존 -- 추가 설치 불필요)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@waiaas/core` | current | ChainError, IActionProvider types | 항상 |
| `@waiaas/actions` | current | ActionApiClient base class, IAsyncStatusTracker | API client, tracker 구현 |
| `drizzle-orm` | current | transactions table bridge_status 업데이트 | bridge enrollment |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API client | Native fetch + ActionApiClient | Across SDK (@across-protocol/sdk) | SDK는 ethers.js 의존, WAIaaS는 viem 사용. REST API 직접 호출이 더 가볍고 의존성 없음 |
| Calldata encoding | viem encodeFunctionData | ethers.js Interface.encodeFunctionData | viem 이미 프로젝트 표준. ethers.js 추가 의존성 불필요 |
| SpokePool ABI | 최소 ABI (depositV3만) | 전체 SpokePool ABI | depositV3 하나만 호출하므로 전체 ABI 불필요. Fragment ABI로 충분 |
| Status tracking | Across /deposit/status API polling | On-chain event listening (V3FundsDeposited + FilledV3Relay) | API polling이 더 간단하고 안정적. Event listening은 destination chain RPC 연결 필요 |

## Installation

```bash
# 신규 패키지 설치 없음 -- 기존 의존성으로 충분
# viem, zod, drizzle-orm 모두 이미 설치되어 있음
```

## SpokePool ABI Fragment (최소)

```typescript
const SPOKE_POOL_ABI = [
  {
    name: 'depositV3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'inputToken', type: 'address' },
      { name: 'outputToken', type: 'address' },
      { name: 'inputAmount', type: 'uint256' },
      { name: 'outputAmount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'exclusiveRelayer', type: 'address' },
      { name: 'quoteTimestamp', type: 'uint32' },
      { name: 'fillDeadline', type: 'uint32' },
      { name: 'exclusivityDeadline', type: 'uint32' },
      { name: 'message', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;
```

## Sources

- [Across API Reference](https://docs.across.to/reference/api-reference) -- HIGH confidence
- [Across Selected Contract Functions](https://docs.across.to/reference/selected-contract-functions) -- HIGH confidence
- 기존 WAIaaS 코드: viem, ActionApiClient, IAsyncStatusTracker -- HIGH confidence
