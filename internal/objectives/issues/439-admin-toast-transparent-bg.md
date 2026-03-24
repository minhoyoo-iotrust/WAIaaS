# 439 — Admin UI: 토스트 메시지 배경이 투명하여 뒤 요소가 비침

- **유형:** BUG
- **심각도:** LOW
- **발견일:** 2026-03-24
- **마일스톤:** —

## 증상

우상단 토스트 메시지(success/error/info/warning)가 투명 배경으로 표시되어, 뒤에 있는 헤더 요소(Logout 버튼, 검색 아이콘 등)가 비쳐 보인다.

## 원인

`global.css`의 `.toast-success` 등이 `--color-success-bg: rgba(0, 255, 65, 0.1)` (10% 불투명도)를 사용한다. 이 값은 페이지 내부 배지/카드에는 적합하지만, `position: fixed; z-index: 200`으로 헤더 위에 뜨는 토스트에는 부적합하다.

## 영향 범위

- `packages/admin/src/styles/global.css` — `.toast-success`, `.toast-error`, `.toast-info`, `.toast-warning`
- `packages/admin/src/components/toast.tsx` — ToastContainer 렌더링

## 수정 방향

토스트 배경을 불투명(95%)으로 변경. 텍스트 색상도 배경 대비에 맞게 조정.

## 테스트 항목

- 각 토스트 타입(success/error/info/warning)이 불투명 배경으로 표시되는지 확인
- 헤더 위에 겹칠 때 뒤 요소가 비치지 않는지 확인
