# #259 — Admin UI ERC-8004 페이지 wallets API 응답 형식 불일치로 무한 로딩

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.3
- **상태:** FIXED

## 현상

Admin UI ERC-8004 Agent Identity 페이지가 토글 섹션만 표시하고 나머지 콘텐츠는 "Loading..." 상태에서 진행되지 않음.

## 원인

`packages/admin/src/pages/erc8004.tsx:195`에서 wallets API 응답을 배열로 직접 파싱:

```typescript
const walletList = await apiGet<Wallet[]>(API.WALLETS);
wallets.value = walletList;
const evmWallets = walletList.filter(w => w.chain === 'ethereum');
```

실제 `/v1/wallets` API 응답은 `{ items: [...] }` 래퍼 객체를 반환하므로:
- `walletList`에 `{ items: [...] }` 객체가 할당
- `walletList.filter()`에서 `TypeError: walletList.filter is not a function` 발생
- 외부 catch에서 잡히지만 `ApiError`가 아니라 토스트 미표시
- `agents.value` 업데이트가 스킵되어 기능 전체 미동작

## 영향 범위

- Admin UI ERC-8004 Agent Identity 페이지 전체 (Identity/Registration File/Reputation 탭 모두)
- 에이전트 등록, 지갑 링킹, 레지스트레이션 파일 조회, 평판 조회 불가

## 동일 패턴 다른 페이지 비교

| 페이지 | 코드 | 상태 |
|--------|------|------|
| wallets.tsx:2654 | `apiGet<{ items: Wallet[] }>` | 정상 |
| policies.tsx:494 | `apiGet<{ items: Wallet[] }>` | 정상 |
| sessions.tsx:270 | `apiGet<{ items: Wallet[] }>` | 정상 |
| walletconnect.tsx:75 | `apiGet<{ items: WalletSummary[] }>` | 정상 |
| **erc8004.tsx:195** | `apiGet<Wallet[]>` | **불일치** |

## 수정 방안

```typescript
// Before
const walletList = await apiGet<Wallet[]>(API.WALLETS);
wallets.value = walletList;

// After
const result = await apiGet<{ items: Wallet[] }>(API.WALLETS);
const walletList = result.items ?? [];
wallets.value = walletList;
```

## 테스트 항목

### 단위 테스트
1. **API 응답 형식 검증 테스트**: Admin UI의 모든 페이지에서 `apiGet(API.WALLETS)` 호출 시 `{ items: [...] }` 래퍼 형식으로 파싱하는지 확인
2. **ERC-8004 loadData 테스트**: wallets API가 `{ items: [...] }` 형식을 반환할 때 정상적으로 EVM 지갑을 필터링하는지 확인
3. **ERC-8004 loadData 빈 목록 테스트**: wallets API가 `{ items: [] }` 반환 시 "No EVM wallets found" EmptyState 표시 확인

### 회귀 방지 테스트
4. **Admin 전체 페이지 API 응답 래퍼 일관성 테스트**: `apiGet(API.WALLETS)` 사용하는 모든 Admin 페이지가 `{ items: [...] }` 래퍼를 올바르게 처리하는지 정적 분석 또는 grep 기반 테스트로 보장
