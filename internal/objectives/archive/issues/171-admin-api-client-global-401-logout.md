# #171 Admin UI apiCall 글로벌 401 핸들러가 비-admin 엔드포인트 401에도 로그아웃 트리거

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.3
- **상태:** FIXED

---

## 증상

Admin UI에서 Actions 페이지로 이동하면 재로그인 요청이 표시된다. 마스터 패스워드를 올바르게 입력해도 Actions 페이지 진입 시마다 로그아웃된다.

---

## 근본 원인

**두 가지 버그가 결합**되어 발생한다:

### 원인 1: `/v1/actions/providers`가 sessionAuth만 허용 (#170)

`server.ts:217`에서 `/v1/actions/*` 전체에 sessionAuth를 적용하여, Admin UI의 masterAuth 요청이 401을 반환한다.

### 원인 2 (본 이슈): `apiCall`의 글로벌 401 핸들러가 무조건 `logout()` 호출

`client.ts:39-42`:
```typescript
if (response.status === 401) {
    logout();  // ← 어떤 API든 401이면 즉시 로그아웃
    throw new ApiError(401, 'INVALID_MASTER_PASSWORD', 'Authentication failed');
}
```

### 에러 경로

1. Actions 페이지 로드 시 `fetchAll()` 호출 (actions.tsx:98-102)
2. `Promise.all([fetchSettings(), fetchApiKeys(), fetchProviders()])` — 3개 동시 호출
3. `fetchProviders()` → `apiGet('/v1/actions/providers')` → 서버 401 반환
4. `apiCall` 내부에서 **`logout()` 즉시 호출** (client.ts:40) — 마스터 패스워드 초기화, 로그인 화면으로 전환
5. `fetchProviders()`의 `catch {}` 블록(actions.tsx:93-95)에 도달하지만, **이미 `logout()` 실행 완료**
6. 동시 실행 중이던 `fetchSettings()`/`fetchApiKeys()`도 로그인 화면 전환으로 의미 없어짐

### 왜 #170만 수정하면 부족한가

`#170`이 수정되어 `/v1/actions/providers`가 masterAuth를 허용하면 이 특정 케이스는 해결된다. 하지만:

- 향후 Admin UI가 비-admin 엔드포인트를 호출할 때마다 동일 문제 재발 가능
- `apiCall`이 401의 원인을 구분하지 못함 (masterAuth 실패 vs sessionAuth 필요 엔드포인트)
- `Promise.all` 패턴에서 1개 실패가 전체 세션을 파괴하는 구조적 취약점

---

## 해결 방안

### 방안 A: apiCall에서 admin 엔드포인트 401만 logout 트리거 (권장)

```typescript
// client.ts 수정
if (response.status === 401) {
    // /v1/admin/* 엔드포인트의 401만 마스터 패스워드 실패로 판단
    if (path.startsWith('/v1/admin/')) {
        logout();
    }
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication failed');
}
```

**근거:**
- Admin UI가 masterAuth를 보내는 대상은 `/v1/admin/*` 엔드포인트
- 비-admin 엔드포인트(`/v1/actions/*` 등)의 401은 인증 방식 불일치이지 패스워드 오류가 아님
- 호출자(`fetchProviders`)의 catch 블록이 개별 처리 가능

### 방안 B: #170과 함께 수정

`#170`(dual-auth)을 먼저 수정하여 `/v1/actions/providers`가 masterAuth를 허용하도록 하고, 추가로 `apiCall`의 401 핸들러를 방안 A처럼 개선한다. 두 수정 모두 적용하면 현재 문제 해결 + 재발 방지 달성.

---

## 수정 대상 파일

| # | 파일 | 변경 |
|---|------|------|
| 1 | `packages/admin/src/api/client.ts:39-42` | 401 시 경로 기반 조건부 logout (admin 엔드포인트만) |

---

## 재발 방지 방안

### 1. Admin UI에서 비-admin 엔드포인트 호출 시 가이드라인

- Admin UI가 `/v1/admin/*` 외 엔드포인트를 호출해야 할 때, 해당 엔드포인트에 masterAuth dual-auth가 적용되었는지 확인
- 또는 별도 `apiCallNoLogout()` 래퍼 사용하여 401 시 자동 로그아웃 방지

### 2. 401 핸들러 경로 기반 분리

방안 A의 수정이 적용되면, 비-admin 경로의 401은 자동으로 호출자에게 위임되어 `catch` 블록에서 개별 처리됨.

---

## 테스트 항목

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | /v1/admin/* 401 → logout 호출 | mock apiCall('/v1/admin/settings') 401 → logout() 호출 assert | [L0] |
| 2 | /v1/actions/* 401 → logout 미호출 | mock apiCall('/v1/actions/providers') 401 → logout() 미호출 + ApiError throw assert | [L0] |
| 3 | fetchProviders 401 시 세션 유지 | Actions 페이지 로드 → providers 401 → settings/apiKeys 정상 로드 + 로그아웃 안 됨 assert | [L0] |
| 4 | Promise.all 1개 실패 시 나머지 정상 | 3개 fetch 중 1개 401 → 나머지 2개 정상 완료 + UI 렌더링 정상 assert | [L0] |

---

*발견일: 2026-02-24*
*발견 환경: npm 최신 RC 버전, Admin UI Actions 페이지*
*관련: #170 (sessionAuth 미스매치 — 근본 원인 제공), client.ts apiCall 글로벌 401 핸들러*
