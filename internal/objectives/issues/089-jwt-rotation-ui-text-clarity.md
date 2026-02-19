# 089 — Admin UI JWT Rotation 기능 명칭/설명이 내부 구현 용어를 사용하여 사용자 이해 어려움

| 필드 | 값 |
|------|-----|
| **유형** | ENHANCEMENT |
| **심각도** | LOW |
| **마일스톤** | v2.3 |
| **상태** | DONE |
| **발견일** | 2026-02-18 |

## 증상

Admin UI Security 페이지의 JWT Rotation 탭이 "JWT Secret Rotation", "Rotate JWT Secret" 등 내부 구현 용어를 사용하여, 사용자가 이 기능의 실제 효과(모든 세션 토큰 무효화)를 직관적으로 이해하기 어려움.

## 근본 원인

기능 이름이 내부 메커니즘(JWT signing key 교체)을 그대로 노출. 사용자 관점에서의 결과(세션 토큰 일괄 무효화 → 재인증 필요)를 반영하지 않음.

## 수정 방안

### 텍스트 변경 (security.tsx)

| 위치 | 현재 | 변경 |
|------|------|------|
| 탭 이름 | `JWT Rotation` | `Invalidate Sessions` |
| 섹션 제목 | `JWT Secret Rotation` | `Invalidate All Session Tokens` |
| 섹션 설명 | `Invalidate all existing JWT tokens. Old tokens remain valid for 5 minutes.` | `Revoke all active session tokens by rotating the signing key. Existing tokens remain valid for 5 minutes, then all wallets must create new sessions.` |
| 버튼 | `Rotate JWT Secret` | `Invalidate All Tokens` |
| 모달 제목 | `Rotate JWT Secret` | `Invalidate All Session Tokens` |
| 모달 본문 | `Are you sure you want to rotate the JWT secret? All existing session tokens will remain valid for 5 more minutes, then expire. Wallets will need new sessions.` | `This will rotate the signing key and invalidate all active session tokens after 5 minutes. Every wallet will need to create a new session to continue API access. Use this when a token may have been compromised.` |
| 성공 토스트 | `JWT secret rotated. Old tokens valid for 5 minutes.` | `All session tokens invalidated. Old tokens remain valid for 5 minutes.` |

### 동일 변경 대상 (settings.tsx — 레거시 페이지)

settings.tsx에도 동일한 JWT Rotation UI가 존재. 동일하게 변경.

### 테스트 변경 (settings-coverage.test.tsx)

텍스트 매칭하는 테스트 assertion도 새 텍스트로 업데이트.

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/admin/src/pages/security.tsx` | 탭 이름, 섹션 제목/설명, 버튼, 모달 텍스트 변경 |
| `packages/admin/src/pages/settings.tsx` | 동일 텍스트 변경 |
| `packages/admin/src/__tests__/settings-coverage.test.tsx` | 텍스트 매칭 assertion 업데이트 |
