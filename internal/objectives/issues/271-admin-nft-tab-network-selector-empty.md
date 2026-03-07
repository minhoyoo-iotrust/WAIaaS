# 271 — Admin UI NFT 탭 네트워크 셀렉터가 항상 비어있음

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** —

## 현상

지갑 상세 페이지의 NFT 탭에서 네트워크 드롭다운이 "Select network..." 하나만 표시되고, 실제 네트워크 옵션이 없어 NFT 조회가 불가능하다.

## 원인

`packages/admin/src/pages/wallets.tsx:1546`에서 `wallet.value?.networks`를 참조하지만, `WalletDetail` 인터페이스에 `networks` 필드가 존재하지 않는다. 따라서 항상 `undefined`가 되어 빈 배열(`[]`)로 폴백된다.

```tsx
// 현재 (버그)
const walletNetworks: string[] = wallet.value?.networks?.map((n: { network: string }) => n.network) ?? [];
```

같은 컴포넌트 내에서 이미 `fetchNetworks()`로 `WALLET_NETWORKS` API를 호출하여 `networks` 시그널(`useSignal<NetworkInfo[]>`)에 저장하고 있으나, NFT 탭은 이 시그널을 사용하지 않고 존재하지 않는 `wallet.value.networks`를 참조한다.

## 수정 방안

```tsx
// 수정
const walletNetworks: string[] = networks.value.map((n) => n.network);
```

`networks` 시그널은 `WalletDetailView` 스코프에서 선언되어 `NftTab` 클로저에서 접근 가능하다.

## 테스트 항목

1. **단위 테스트**: NFT 탭 렌더링 시 `networks` 시그널의 네트워크 목록이 드롭다운 옵션으로 표시되는지 검증
2. **단위 테스트**: 네트워크 선택 후 `fetchNfts()`가 선택된 네트워크로 호출되는지 검증
