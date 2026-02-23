# 156 — FilterBar / SearchInput CSS 스타일 누락으로 UI 엉성

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** OPEN
- **마일스톤:** (미정)

## 설명

FilterBar 컴포넌트(`filter-bar.tsx`)와 SearchInput 컴포넌트(`search-input.tsx`)에 CSS 스타일이 전혀 정의되어 있지 않다. `global.css`에 `.filter-bar`, `.filter-field`, `.filter-clear`, `.search-input`(페이지 레벨), `.search-clear` 클래스에 대한 규칙이 없어서 raw HTML로 렌더링된다.

## 현재 동작

- select/date 필터가 세로로 나열되고 크기가 불균일
- 라벨이 필터 요소와 시각적으로 분리되지 않음
- Clear 버튼이 스타일 없는 기본 버튼
- SearchInput이 페이지 전체 너비를 차지하지 않고 기본 input 스타일
- SearchInput의 clear(x) 버튼이 위치/스타일 없음

## 기대 동작

- **FilterBar**: 수평 flex 배치, 필터 간 간격 균일, 라벨은 소형 uppercase, select/date 입력에 `.form-field` 일관 스타일 적용
- **SearchInput**: 최대 너비 제한, 우측에 clear 버튼 absolute 배치, focus 시 border 강조
- **반응형**: 768px 이하에서 세로 배치 전환

## 변경 대상 파일

| 파일 | 작업 |
|------|------|
| `styles/global.css` | `.filter-bar`, `.filter-field`, `.filter-clear`, `.search-input`, `.search-clear` 스타일 추가 |

`packages/admin/src/` 기준. 컴포넌트 TSX 변경 없음 (클래스명은 이미 올바르게 사용 중).

## 추가할 CSS 규칙

```css
/* Filter Bar */
.filter-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3); }
.filter-field { display: flex; flex-direction: column; gap: var(--space-1); }
.filter-field label { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
.filter-field select,
.filter-field input[type="date"] { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-size-sm); background: var(--color-bg); color: var(--color-text); outline: none; transition: border-color 0.15s; min-width: 140px; }
.filter-field select:focus,
.filter-field input[type="date"]:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light); }
.filter-clear { align-self: flex-end; }

/* Search Input (page-level) */
.search-input { position: relative; display: inline-flex; align-items: center; max-width: 400px; width: 100%; }
.search-input input[type="text"] { width: 100%; padding: var(--space-2) var(--space-3); padding-right: var(--space-8); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-size-sm); background: var(--color-bg); color: var(--color-text); outline: none; transition: border-color 0.15s; }
.search-input input[type="text"]:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-light); }
.search-clear { position: absolute; right: var(--space-2); background: none; border: none; font-size: var(--font-size-sm); color: var(--color-text-muted); cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); }
.search-clear:hover { color: var(--color-text); background: var(--color-bg-tertiary); }

/* Responsive */
@media (max-width: 768px) {
  .filter-bar { flex-direction: column; align-items: stretch; }
  .filter-field select, .filter-field input[type="date"] { min-width: 0; width: 100%; }
  .search-input { max-width: 100%; }
}
```

## 영향 범위

FilterBar를 사용하는 모든 페이지에 자동 적용:
- Transactions 페이지 (6개 필터 + SearchInput)
- Incoming TX 페이지 (4개 필터)
- 향후 통합 Transactions 페이지 (#153)

## 테스트 항목

1. Transactions 페이지 필터가 수평 배치되고 균일한 크기로 표시
2. select/date 필터에 border, border-radius, focus ring 적용
3. 라벨이 소형 uppercase로 표시
4. Clear 버튼이 `.btn .btn-secondary` 스타일과 일관
5. SearchInput에 최대 너비 제한, clear 버튼 우측 배치
6. 768px 이하에서 세로 배치 전환
