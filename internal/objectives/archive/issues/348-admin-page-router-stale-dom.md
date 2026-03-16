# 348 — Admin UI 라우트 전환 시 이전 페이지 DOM 잔류 — 지갑 상세 뷰 중복 렌더링

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-14

## 설명

지갑 상세 페이지(`/wallets/{id}`)에서 다른 메뉴(예: Hyperliquid)로 이동하면, 이전 지갑 상세 뷰가 언마운트되지 않고 새 페이지 위에 중복 렌더링됨. 스크린샷에서 지갑 상세 뷰가 2번 표시되고 그 아래에 Hyperliquid 콘텐츠가 나타남.

## 원인 분석

`PageRouter` 컴포넌트(`components/layout.tsx:107-153`)가 `currentPath.value` 시그널을 읽어 라우트별 컴포넌트를 반환하는데, `WalletsPage`(`pages/wallets.tsx:3409-3417`)도 내부에서 같은 `currentPath.value`를 읽어 walletId를 추출함.

라우트 전환 시:
1. `currentPath` 시그널 변경
2. `PageRouter`와 `WalletsPage` 모두 시그널 구독으로 동시 리렌더링 트리거
3. Preact 시그널 최적화가 VDOM 조정을 우회하여 직접 DOM 업데이트 시도
4. 부모(PageRouter)와 자식(WalletsPage)의 동시 렌더링 레이스 컨디션으로 이전 DOM 노드가 제거되지 않고 누적

`key` prop이 없어서 Preact가 동일 위치의 컴포넌트를 교체가 아닌 패치로 처리하려 함.

**테마 변경(#345)과 무관한 기존 버그.** 테마 커밋(`14d93794`)의 wallets.tsx 변경은 CSS 변수 fallback 제거뿐이며 렌더링 로직에 영향 없음.

## 영향 범위

- `packages/admin/src/components/layout.tsx:107-153` — `PageRouter` 함수
- 모든 페이지 전환에서 발생 가능하나, 특히 `WalletsPage`가 `currentPath.value`를 이중으로 구독하여 발생 빈도 높음

## 수정 방안

`PageRouter`에서 라우트 키 기반 `key` prop을 추가하여 라우트 전환 시 Preact가 완전 언마운트/재마운트하도록 강제:

```tsx
function PageRouter() {
  const path = currentPath.value;
  const routeKey = path.startsWith('/wallets/') ? '/wallets/detail' : path;

  let page;
  if (path === '/hyperliquid') page = <HyperliquidPage />;
  else if (path.startsWith('/wallets')) page = <WalletsPage />;
  // ... 기타 라우트
  else page = <DashboardPage />;

  return <div key={routeKey}>{page}</div>;
}
```

## 테스트 항목

- 지갑 상세(`/wallets/{id}`) → Hyperliquid 이동 시 지갑 상세 뷰 잔류 없음
- 지갑 상세 → Dashboard/Sessions/Policies 등 다른 메뉴 전환 시 정상 렌더링
- 연속 빠른 메뉴 전환(Dashboard → Wallets → Hyperliquid → Policies) 후 정상 렌더링
- 기존 라우팅 테스트 통과 확인
