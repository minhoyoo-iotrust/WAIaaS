# 355 — Admin UI Actions 페이지 카테고리별 탭 분리

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-16

## 현상

DeFi 프로바이더가 14개 이상으로 늘어나면서 Actions 페이지가 길어져 원하는 프로바이더를 찾기 어려움. 현재는 카테고리별 섹션 헤더로 그룹핑되어 있으나 한 페이지에 모두 렌더링됨.

## 수정 방안

카테고리 섹션 헤더를 `TabNav` 컴포넌트 기반 탭으로 전환. API 응답의 `category` 필드에서 동적으로 탭 생성.

### 구현 방식

```ts
// API 응답에서 카테고리 추출 → CATEGORY_ORDER 기준 정렬 → 탭 생성
const categories = [...new Set(providers.value.map(p => p.category))];
const sortedCategories = categories.sort((a, b) =>
  (CATEGORY_ORDER.indexOf(a) !== -1 ? CATEGORY_ORDER.indexOf(a) : 99) -
  (CATEGORY_ORDER.indexOf(b) !== -1 ? CATEGORY_ORDER.indexOf(b) : 99)
);
const tabs = sortedCategories.map(cat => ({ key: cat, label: cat }));

// 선택된 탭의 프로바이더만 렌더링
const filtered = providers.value.filter(p => p.category === activeTab.value);
```

### 동작

- 탭은 API 응답의 `category` 필드에서 동적 생성 — 새 프로바이더 추가 시 하드코딩 불필요
- `CATEGORY_ORDER` 배열은 탭 정렬 순서로만 사용
- 프로바이더가 없는 카테고리는 탭 미표시
- 기존 `TabNav` 컴포넌트 재사용
- 첫 번째 탭 자동 선택

### 변경 파일

- `packages/admin/src/pages/actions.tsx` — 섹션 그룹핑 → TabNav 전환

## 테스트 항목

1. 각 카테고리 탭 클릭 시 해당 카테고리 프로바이더만 표시되는지 확인
2. 프로바이더가 없는 카테고리 탭이 숨겨지는지 확인
3. 탭 전환 후 토글/API 키 저장/고급 설정이 정상 동작하는지 확인
4. 프로바이더 토글 ON/OFF 후 탭 유지되는지 확인 (re-fetch 시 탭 리셋 방지)
