# BUG-010: Admin UI EVM 에이전트 생성 시 network 값 불일치

## 심각도

**HIGH** — Admin UI에서 Ethereum 계열 에이전트 생성이 불가능. API 유효성 검사 실패로 에이전트가 생성되지 않음.

## 증상

Admin UI(`/admin`) → Agents 페이지 → Create Agent → Chain: Ethereum 선택 → Network: Sepolia 선택 → 이름 입력 후 Create 클릭 시:
- "Action input validation failed." 에러 메시지 표시
- 에이전트가 생성되지 않음
- Solana 에이전트 생성은 정상 동작

## 재현 방법

```bash
# 1. 데몬 시작
waiaas start --data-dir ~/.waiaas --master-password test1234

# 2. 브라우저에서 http://127.0.0.1:3100/admin 접속
#    → 마스터 비밀번호 입력 → Agents 탭
#    → Create Agent 클릭 → Chain: Ethereum, Network: Sepolia, Name: test-eth
#    → Create 클릭 → "Action input validation failed." 에러

# 3. 브라우저 DevTools Network 탭에서 실제 전송된 요청 확인:
# POST /v1/agents
# Body: { "name": "test-eth", "chain": "ethereum", "network": "sepolia" }
#                                                             ^^^^^^^^
#                                                    잘못된 값 — "ethereum-sepolia" 이어야 함

# 4. curl로 올바른 값 전송 시 정상 동작
curl -s -X POST http://127.0.0.1:3100/v1/agents \
  -H "X-Master-Password: test1234" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-eth","chain":"ethereum","network":"ethereum-sepolia"}' | jq .
# → 에이전트 정상 생성
```

## 원인

### Admin UI의 네트워크 옵션 값이 API 스키마와 불일치

`packages/admin/src/pages/agents.tsx` 42-47행에서 EVM 네트워크 옵션을 정의할 때, API가 기대하는 `NetworkType` enum 값 대신 축약된 이름을 사용:

```typescript
// 현재 코드 — 잘못된 value
if (chain === 'ethereum') {
  return [
    { label: 'Sepolia', value: 'sepolia' },       // ← API 기대: 'ethereum-sepolia'
    { label: 'Mainnet', value: 'mainnet' },        // ← API 기대: 'ethereum-mainnet'
  ];
}
```

API 스키마 (`packages/core/src/enums/chain.ts` 7-16행):

```typescript
export const NETWORK_TYPES = [
  // Solana
  'mainnet', 'devnet', 'testnet',
  // EVM Tier 1
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
] as const;
```

Solana는 `'devnet'`, `'testnet'`, `'mainnet'` 그대로 사용하므로 문제 없지만, EVM은 `'{chain}-{network}'` 형식의 복합 네트워크 식별자를 사용하므로 Admin UI 옵션도 이 형식을 따라야 함.

### 추가 누락: Polygon, Arbitrum, Optimism, Base 네트워크 미노출

v1.4.1에서 EVM Tier 1으로 5개 체인(Ethereum, Polygon, Arbitrum, Optimism, Base)의 10개 네트워크를 지원하지만, Admin UI는 Ethereum의 2개 네트워크만 표시. 나머지 8개 EVM 네트워크에 대한 선택지가 없음.

## 수정안

### `packages/admin/src/pages/agents.tsx` 42-47행

```typescript
// Before — 축약된 value + 2개 네트워크만 노출
if (chain === 'ethereum') {
  return [
    { label: 'Sepolia', value: 'sepolia' },
    { label: 'Mainnet', value: 'mainnet' },
  ];
}

// After — NetworkType enum 값 사용 + EVM Tier 1 전체 10개 네트워크
if (chain === 'ethereum') {
  return [
    { label: 'Ethereum Sepolia', value: 'ethereum-sepolia' },
    { label: 'Ethereum Mainnet', value: 'ethereum-mainnet' },
    { label: 'Polygon Amoy', value: 'polygon-amoy' },
    { label: 'Polygon Mainnet', value: 'polygon-mainnet' },
    { label: 'Arbitrum Sepolia', value: 'arbitrum-sepolia' },
    { label: 'Arbitrum Mainnet', value: 'arbitrum-mainnet' },
    { label: 'Optimism Sepolia', value: 'optimism-sepolia' },
    { label: 'Optimism Mainnet', value: 'optimism-mainnet' },
    { label: 'Base Sepolia', value: 'base-sepolia' },
    { label: 'Base Mainnet', value: 'base-mainnet' },
  ];
}
```

### `formNetwork` 초기값 업데이트

`handleChainChange` (315-319행)에서 chain 변경 시 첫 번째 옵션으로 자동 설정되므로 추가 수정 불필요. Ethereum 선택 시 `ethereum-sepolia`가 기본값으로 설정됨.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/admin/src/pages/agents.tsx` (42-47행) |
| 기능 영향 | Admin UI에서 EVM 에이전트 생성 불가 (100% 실패) |
| API 영향 | **없음** — API 자체는 정상 동작, curl/SDK/MCP 경유 생성은 문제 없음 |
| Solana 에이전트 | **영향 없음** — Solana 네트워크 값(`devnet`/`testnet`/`mainnet`)은 정상 |
| 우회 방법 | curl 또는 CLI로 직접 에이전트 생성 |

## 기존 테스트가 통과한 이유

Admin UI 테스트(`packages/admin/src/__tests__/`)에서 에이전트 생성 폼의 E2E 유효성 검사 테스트가 없음:
- 기존 테스트는 폼 렌더링, API 호출 여부 등 단위 수준만 검증
- 실제 서버에 전송되는 `network` 값이 `NetworkType` enum에 포함되는지는 미검증
- v1.3.2(Admin UI 구현) 시점에는 EVM 지원이 없었으므로 EVM 네트워크 옵션 자체가 불필요했음
- v1.4.1에서 EVM 네트워크 옵션을 추가하면서 `core/enums/chain.ts`의 `NETWORK_TYPES`와 동기화하지 않음

## 재발 방지 테스트

### 1. Admin UI 에이전트 생성 폼 네트워크 값 검증 (필수)

```typescript
import { NETWORK_TYPES } from '@waiaas/core';

describe('Agent creation form', () => {
  it('chainNetworkOptions의 모든 value가 유효한 NetworkType이다', () => {
    const solanaOptions = chainNetworkOptions('solana');
    for (const opt of solanaOptions) {
      expect(NETWORK_TYPES).toContain(opt.value);
    }

    const evmOptions = chainNetworkOptions('ethereum');
    for (const opt of evmOptions) {
      expect(NETWORK_TYPES).toContain(opt.value);
    }
  });

  it('EVM 네트워크 옵션이 EVM_NETWORK_TYPES 전체를 포함한다', () => {
    const evmOptions = chainNetworkOptions('ethereum');
    const evmValues = evmOptions.map((o) => o.value);
    // 최소한 ethereum-sepolia, ethereum-mainnet 포함 확인
    expect(evmValues).toContain('ethereum-sepolia');
    expect(evmValues).toContain('ethereum-mainnet');
  });
});
```

### 2. E2E: EVM 에이전트 생성 → API 요청 body 검증 (권장)

```typescript
it('Ethereum 에이전트 생성 시 올바른 network 값을 API로 전송한다', async () => {
  // Chain: Ethereum 선택
  // Network: 첫 번째 옵션 (ethereum-sepolia) 자동 선택
  // Create 클릭

  // apiPost 호출 시 전송된 body 검증
  expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/agents', {
    name: expect.any(String),
    chain: 'ethereum',
    network: 'ethereum-sepolia',  // 'sepolia'가 아닌 'ethereum-sepolia'
  });
});
```

### 3. 타입 안전성 강화 — SSoT 연동 (권장)

`chainNetworkOptions` 함수의 반환 타입을 `@waiaas/core`의 `NetworkType`으로 제한하여 컴파일 타임에 불일치를 감지:

```typescript
import type { NetworkType } from '@waiaas/core';

function chainNetworkOptions(chain: string): { label: string; value: NetworkType }[] {
  // ...
  // 'sepolia'를 value로 사용하면 타입 에러 발생
}
```

> **참고**: Admin 패키지가 Preact SPA로 별도 빌드되므로 `@waiaas/core`를 직접 import하려면 빌드 설정 조정이 필요할 수 있음. 대안으로 `chainNetworkOptions` 유닛 테스트에서 core enum과 대조하는 방식(테스트 1)이 현실적.

## 근본 원인 분석

BUG-006, BUG-007과 동일한 패턴: **Admin UI(프론트엔드)가 서버/코어의 타입 정의와 독립적으로 값을 하드코딩하여 불일치 발생**.

v1.3.2에서 Admin UI를 구현할 때 Solana만 지원했으므로 네트워크 옵션이 단순했으나, v1.4.1에서 EVM 확장 시 Admin UI의 옵션 값을 `NetworkType` enum에 맞추지 않았음. Zod SSoT → TS → OpenAPI 파이프라인이 Admin UI까지 확장되지 않아 수동 동기화에 의존하는 구조적 문제.

---

*발견일: 2026-02-12*
*마일스톤: v1.4.1*
*상태: FIXED*
*관련: BUG-006 (프론트엔드-서버 응답 구조 불일치), BUG-007 (동일 패턴)*
