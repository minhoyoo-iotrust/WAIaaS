# #170 Admin UI Actions 페이지 접근 시 401 — sessionAuth 미스매치

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.3
- **상태:** OPEN

---

## 증상

Admin UI에서 Actions 페이지로 이동하면 재로그인 요청이 표시된다. 데몬 로그에 다음이 기록됨:

```
[REQ] GET /v1/actions/providers 401 0ms
```

동일 세션에서 다른 Admin 페이지(Settings, Transactions, API Keys 등)는 정상 동작(200).

---

## 근본 원인

**인증 미스매치:** `GET /v1/actions/providers` 엔드포인트가 `sessionAuth`(Bearer 토큰)를 요구하지만, Admin UI는 `masterAuth`(`X-Master-Password` 헤더)만 전송한다.

### 에러 경로

1. Admin UI `actions.tsx:91` → `apiGet('/v1/actions/providers')` 호출
2. `client.ts:21` → `X-Master-Password` 헤더를 설정 (Bearer 토큰 없음)
3. `server.ts:217` → `app.use('/v1/actions/*', sessionAuth)` — 모든 `/v1/actions/*` 경로에 sessionAuth 적용
4. sessionAuth 미들웨어가 Bearer 토큰 부재로 **401 반환**

### 작동하는 엔드포인트와의 비교

| 엔드포인트 | 인증 | Admin UI 결과 |
|-----------|------|-------------|
| `GET /v1/admin/api-keys` | masterAuth | 200 ✅ |
| `GET /v1/admin/settings` | masterAuth | 200 ✅ |
| `GET /v1/admin/transactions` | masterAuth | 200 ✅ |
| `GET /v1/actions/providers` | **sessionAuth** | **401 ❌** |

`/v1/actions/*` 경로 전체에 sessionAuth가 적용되어 있으며(`server.ts:217`), Admin UI가 호출하는 `GET /v1/actions/providers`도 이에 포함된다.

---

## 해결 방안

### 방안 A: `/v1/actions/providers`에 dual-auth 적용 (권장)

`/v1/policies`와 `/v1/tokens`에 이미 적용된 dual-auth 패턴을 재사용한다 (`server.ts:222-239`):

```typescript
// server.ts:217 변경
// Before:
app.use('/v1/actions/*', sessionAuth);

// After: GET /v1/actions/providers는 masterAuth도 허용
app.use('/v1/actions/providers', async (c, next) => {
  // masterAuth가 있으면 통과 (Admin UI)
  const masterPw = c.req.header('X-Master-Password');
  if (masterPw) {
    return masterAuthForAdmin(c, next);
  }
  // Bearer 토큰이 있으면 sessionAuth (에이전트)
  return sessionAuth(c, next);
});
app.use('/v1/actions/*', sessionAuth);  // 나머지 actions 경로는 sessionAuth 유지
```

**근거:**
- `GET /v1/actions/providers`는 읽기 전용 인벤토리 조회 (월렛 컨텍스트 불필요)
- Admin UI의 API Keys 관리 페이지에서 프로바이더 목록 표시에 필요
- `/v1/policies`, `/v1/tokens`에 동일 패턴 적용 선례 (`server.ts:222-239`)
- `POST /v1/actions/:provider/:action` (실행)은 sessionAuth 유지

### 방안 B: Admin 전용 엔드포인트 추가

`GET /v1/admin/actions/providers`를 admin 라우터에 추가하고, Admin UI가 이 경로를 호출하도록 변경.

- 장점: 인증 경로 분리 명확
- 단점: 라우트 중복, Admin UI 엔드포인트 변경 필요

**권장: 방안 A** — 기존 dual-auth 패턴 재사용으로 최소 변경.

---

## 수정 대상 파일

| # | 파일 | 변경 |
|---|------|------|
| 1 | `packages/daemon/src/api/server.ts:217` | `/v1/actions/providers`에 dual-auth 미들웨어 추가 (masterAuth + sessionAuth) |

Admin UI 쪽은 수정 불필요 — 이미 `apiGet('/v1/actions/providers')`로 올바르게 호출하고 있으며, masterAuth 헤더를 전송 중.

---

## 재발 방지 방안

### 1. Admin UI가 호출하는 엔드포인트 인증 체크리스트

Admin UI에서 새 엔드포인트를 호출할 때:
- [ ] 해당 엔드포인트가 `/v1/admin/*` 경로에 있는지 확인 (masterAuth 자동 적용)
- [ ] `/v1/admin/*` 외 경로라면 dual-auth 미들웨어 추가 필요
- [ ] `endpoints.ts`에 추가 시 인증 방식 주석 명시

### 2. Admin UI 엔드포인트 인증 통합 테스트

Admin UI가 호출하는 모든 엔드포인트(`endpoints.ts` 정의)에 대해, masterAuth로 호출 시 401이 아닌 200/403을 반환하는지 검증하는 테스트 추가.

### 3. 코드 리뷰 체크포인트

`endpoints.ts`에 새 엔드포인트 추가 시, 해당 경로의 인증 미들웨어가 masterAuth를 지원하는지 `server.ts` 대조 확인.

---

## 테스트 항목

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | masterAuth로 GET /v1/actions/providers 호출 | X-Master-Password 헤더 → 200 + providers 목록 반환 assert | [L0] |
| 2 | sessionAuth로 GET /v1/actions/providers 호출 | Bearer wai_sess_* 헤더 → 200 + providers 목록 반환 assert (기존 동작 유지) | [L0] |
| 3 | 인증 없이 GET /v1/actions/providers 호출 | 헤더 없음 → 401 assert | [L0] |
| 4 | POST /v1/actions/:provider/:action은 sessionAuth만 허용 | masterAuth로 POST → 401 assert (실행은 에이전트 전용) | [L0] |
| 5 | Admin UI Actions 페이지 정상 로드 | masterAuth 세션에서 Actions 페이지 → 프로바이더 목록 표시 + 401 에러 없음 assert | [HUMAN] |

---

*발견일: 2026-02-24*
*발견 환경: npm 최신 RC 버전, Admin UI Actions 페이지*
*관련: #158 (Admin UI Actions 페이지 추가), server.ts:217 sessionAuth 미들웨어, dual-auth 패턴(server.ts:222-239)*
