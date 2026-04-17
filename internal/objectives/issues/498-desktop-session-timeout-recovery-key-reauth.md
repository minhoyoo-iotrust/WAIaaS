# 498 — Desktop 세션 타임아웃 후 recovery.key 재인증 불가

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **관련:** #488, #491, #496, #497

## 현상

Desktop 앱에서 오토프로비저닝으로 첫 부팅 후 일정 시간(기본 15분) 비활성 시:

1. `auth/store.ts`의 `resetInactivityTimer()`가 만료되어 `logout()` 호출
2. `masterPassword.value = null` → `isAuthenticated = false`
3. `app.tsx`에서 `<Login />` 컴포넌트 렌더링 → 마스터패스워드 입력 폼 표시
4. 사용자는 오토프로비저닝으로 부팅했기 때문에 패스워드를 모름 → **진행 불가**

## 원인

`app.tsx:61-130`의 recovery.key 자동 로그인 로직이 최초 마운트 `useEffect([], [])` 에서만 실행됨. 세션 만료 후 `<Login />` 컴포넌트가 렌더링될 때는 recovery.key 재인증을 시도하지 않음.

## 영향 범위

- **Desktop 앱만 해당** — 웹 브라우저 접속 시에는 사용자가 직접 설정한 패스워드로 로그인하므로 문제 없음
- recovery.key 파일은 디스크에 존재하나 Login 컴포넌트가 이를 활용하지 않음

## 수정 방안

Login 컴포넌트가 마운트될 때 Desktop 환경이면 recovery.key로 자동 재인증 시도:

1. `Login` 컴포넌트 마운트 시 `isDesktop()` 체크
2. `getDesktopRecoveryKey()` 호출하여 recovery.key 읽기
3. `/v1/admin/status`로 인증 시도
4. 성공: `login()` 호출 → 대시보드 이동
5. 실패: 기존 패스워드 입력 폼 표시 (recovery.key 손상/삭제 시)

## 테스트 항목

- [ ] Desktop 환경에서 세션 타임아웃 후 recovery.key 자동 재인증 성공 확인
- [ ] recovery.key가 없거나 유효하지 않을 때 기존 로그인 폼 표시 확인
- [ ] 웹 브라우저 환경에서는 기존 동작(패스워드 폼)이 변경되지 않음 확인
- [ ] 재인증 중 로딩 상태 표시 확인
