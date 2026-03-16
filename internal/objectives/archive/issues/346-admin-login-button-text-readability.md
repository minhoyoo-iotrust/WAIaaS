# 346 — Admin UI 로그인 버튼 글자 가독성 불량

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-14

## 설명

Admin UI 테마를 WAIaaS 터미널 다크 테마로 변경한 후(#345), 로그인 페이지의 "Sign in" 버튼 글자 가독성이 떨어짐.

`packages/admin/src/auth/login.tsx:50`에서 버튼 텍스트 색상이 `color: 'white'`로 하드코딩되어 있어, 밝은 녹색(`#00ff41`) 배경 위에 흰색 텍스트로 표시됨. CSS 클래스 `.btn-primary`는 이미 `color: #0c0c0c`로 올바르게 설정되어 있으나, 로그인 버튼은 인라인 스타일을 사용하므로 CSS 클래스 변경이 반영되지 않음.

## 영향 범위

- `packages/admin/src/auth/login.tsx:50` — `color: 'white'` → `color: '#0c0c0c'` 변경 필요
- 다른 인라인 스타일 버튼은 영향 없음 (`app.tsx`의 `color: 'white'`는 shutdown 오버레이 텍스트로 검은 배경 위 흰 텍스트 — 정상)

## 수정 방안

`login.tsx` styles.button의 `color: 'white'`를 `color: '#0c0c0c'`로 변경하여 `.btn-primary` CSS 클래스와 동일한 대비를 적용.

## 테스트 항목

- 로그인 버튼 텍스트가 어두운 색(#0c0c0c)으로 표시되어 녹색 배경 위에서 가독성 확보
- 기존 auth.test.tsx 로그인 렌더링 테스트 통과 확인
