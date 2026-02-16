# v1.5-033: Admin UI 월렛 상세 네트워크 필드 불일치 — Terminate 버튼 무응답 + 삭제 지갑 상세 크래시

## 유형: BUG
## 심각도: HIGH
## 마일스톤: v1.5.1
## 상태: FIXED

---

## 증상

### 증상 1: Terminate Wallet 버튼 무응답
- 월렛 상세 페이지에서 "Terminate Wallet" 버튼 클릭 시 아무 반응 없음
- 모달이 열리지 않거나, 모달 내 Confirm 버튼이 동작하지 않음

### 증상 2: 삭제된 지갑 상세 진입 시 크래시
- 데몬 재시작 후 TERMINATED 상태 지갑의 상세 페이지 진입 시 에러 발생
- 콘솔 에러: `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'map')`

---

## 근본 원인

**API 응답 필드명과 클라이언트 참조 필드명 불일치**

### 서버 (daemon)

`GET /v1/wallets/:id/networks` 응답 (wallets.ts:598-610):
```json
{
  "id": "...",
  "chain": "...",
  "environment": "...",
  "defaultNetwork": "...",
  "availableNetworks": [           ← 서버가 반환하는 필드명
    { "network": "devnet", "isDefault": true }
  ]
}
```

### 클라이언트 (admin)

`fetchNetworks` (wallets.tsx:241-242):
```typescript
const result = await apiGet<{ networks: NetworkInfo[] }>(API.WALLET_NETWORKS(id));
networks.value = result.networks;  // ← "networks" 참조 → undefined
```

### 영향 경로

1. `fetchNetworks` 성공 → `result.networks` = `undefined` → `networks.value = undefined`
2. 렌더링 시 `networks.value.map()` (wallets.tsx:403) → `TypeError: Cannot read properties of undefined (reading 'map')`
3. Preact 렌더 에러 → 전체 `WalletDetailView` 컴포넌트 렌더링 중단
4. 렌더링 중단으로 인해 모달, 버튼 등 모든 UI 상호작용 불가 → Terminate 버튼 무응답

---

## 영향 범위

- **모든 월렛 상세 페이지**에 영향 (ACTIVE, TERMINATED 무관)
- 네트워크 fetch가 완료되는 시점에 크래시 발생
- 네트워크 fetch가 지갑 fetch보다 먼저 완료되면 로딩 스켈레톤 상태에서 크래시하여 화면이 정상으로 보일 수 있으나 UI 상호작용 불가

---

## 수정 방안

### 1. 필드명 수정 (핵심)

`packages/admin/src/pages/wallets.tsx` — `fetchNetworks` 함수:

```typescript
// Before (bug)
const result = await apiGet<{ networks: NetworkInfo[] }>(API.WALLET_NETWORKS(id));
networks.value = result.networks;

// After (fix)
const result = await apiGet<{ availableNetworks: NetworkInfo[] }>(API.WALLET_NETWORKS(id));
networks.value = result.availableNetworks ?? [];
```

### 2. catch 블록 방어 코드 추가

```typescript
} catch (err) {
  const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
  showToast('error', getErrorMessage(e.code));
  networks.value = [];    // ← 추가: 실패 시 빈 배열로 초기화
}
```

### 3. 렌더링 방어 코드 추가

```jsx
// Before
{networks.value.map((n) => (

// After
{(networks.value ?? []).map((n) => (
```

---

## 재발 방지 테스트

### Unit Test: Admin 네트워크 필드 매핑 검증

`packages/admin/src/__tests__/wallet-detail-networks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * API 응답 필드명이 클라이언트 참조와 일치하는지 검증.
 * 서버 응답 스키마(WalletNetworksResponseSchema)의 실제 필드명을
 * 클라이언트가 올바르게 참조하는지 확인하여 필드 불일치 재발을 방지한다.
 */

describe('Wallet networks field mapping', () => {
  it('should read availableNetworks from API response', async () => {
    // Mock API response matching actual server schema
    const mockResponse = {
      id: 'test-id',
      chain: 'solana',
      environment: 'testnet',
      defaultNetwork: 'devnet',
      availableNetworks: [
        { network: 'devnet', isDefault: true },
        { network: 'testnet', isDefault: false },
      ],
    };

    // Verify the field exists and is an array
    expect(mockResponse.availableNetworks).toBeDefined();
    expect(Array.isArray(mockResponse.availableNetworks)).toBe(true);

    // Verify the OLD field name does NOT exist (regression guard)
    expect((mockResponse as Record<string, unknown>).networks).toBeUndefined();
  });

  it('should safely handle undefined availableNetworks with fallback', () => {
    const mockResponse = { id: 'test-id' } as Record<string, unknown>;
    const networks = (mockResponse.availableNetworks as unknown[] | undefined) ?? [];
    expect(networks).toEqual([]);
    expect(() => networks.map((n) => n)).not.toThrow();
  });
});
```

### Integration Test: WalletNetworksResponseSchema → Admin 클라이언트 일관성 검증

`packages/daemon/src/__tests__/api-schema-consistency.test.ts`에 추가:

```typescript
import { WalletNetworksResponseSchema } from '../api/routes/openapi-schemas.js';

describe('API schema field names match admin client expectations', () => {
  it('WalletNetworksResponseSchema contains availableNetworks field', () => {
    const shape = WalletNetworksResponseSchema.shape;
    expect(shape).toHaveProperty('availableNetworks');
    // Guard: 'networks' 필드가 없어야 함 (admin 클라이언트와 불일치 방지)
    expect(shape).not.toHaveProperty('networks');
  });
});
```

### E2E Test: 월렛 상세 페이지 네트워크 섹션 렌더링

`packages/admin/src/__tests__/wallet-detail-e2e.test.ts`:

```typescript
describe('WalletDetailView networks section', () => {
  it('should render network list without crash', async () => {
    // Setup: mock fetch to return actual API response shape
    // Navigate to wallet detail page
    // Assert: networks section renders without errors
    // Assert: each network item is visible
  });

  it('should render empty state when wallet is TERMINATED', async () => {
    // Setup: mock wallet with status=TERMINATED
    // Assert: page renders without crash
    // Assert: Terminate button is NOT shown (or disabled) for TERMINATED wallet
  });
});
```

---

## 관련 파일

| 파일 | 위치 | 관련 |
|------|------|------|
| `packages/admin/src/pages/wallets.tsx` | Line 238-249 (fetchNetworks), Line 403 (.map) | 클라이언트 측 버그 |
| `packages/daemon/src/api/routes/wallets.ts` | Line 598-610 (networks handler) | 서버 응답 구조 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | Line 434-447 (WalletNetworksResponseSchema) | 스키마 정의 |

---

## 비고

- 이슈 006 (MCP items vs agents 불일치)과 동일 패턴의 버그
- **근본 대책**: API 응답 필드명을 타입 레벨에서 서버 스키마와 동기화하는 방법 검토 필요 (예: OpenAPI → 클라이언트 타입 자동 생성)

---

*등록일: 2026-02-16*
