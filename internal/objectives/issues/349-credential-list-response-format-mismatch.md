# #349 Credential List API 응답 형식 불일치로 Admin UI에서 추가한 자격증명이 표시되지 않음

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.17
- **상태:** OPEN

## 증상

Admin UI 지갑 상세 페이지 및 글로벌 Credentials 페이지에서 "Add Credential" 후 자격증명이 목록에 표시되지 않음. 실제 DB에는 저장되지만 UI에서는 항상 빈 목록(Empty State)으로 보임.

## 근본 원인

**백엔드와 프론트엔드 간 List API 응답 형식 불일치.**

### 백엔드 (배열 직접 반환)

- `credentials.ts:121` — `return c.json(list, 200)` → 응답: `[{...}, {...}]`
- `admin-credentials.ts:117` — `return c.json(list, 200)` → 응답: `[{...}, {...}]`

### 프론트엔드 (래핑된 객체 기대)

- `wallets.tsx:1879` — `apiGet<{ credentials: CredentialMetadata[] }>()` → `result.credentials` 접근
- `credentials.tsx:80` — `apiGet<{ credentials: CredentialMetadata[] }>()` → `result.credentials` 접근

`result`가 배열인데 `.credentials`로 접근하면 `undefined`가 되어, 항상 빈 배열로 처리됨.

## 영향 범위

1. **지갑별 Credentials 탭** (wallets.tsx CredentialsTab) — 목록 항상 비어있음
2. **글로벌 Credentials 페이지** (credentials.tsx) — 목록 항상 비어있음
3. **CRUD 동작** — Create/Delete/Rotate는 정상 작동하나, 결과 확인 불가

## 해결 방안

백엔드 List 응답을 `{ credentials: [...] }` 래퍼로 변경 (프로젝트의 다른 List 엔드포인트와 일관성 유지):

### 파일 1: `packages/daemon/src/api/routes/credentials.ts`

```typescript
// Before (line 46-48)
content: { 'application/json': { schema: z.array(CredentialMetadataSchema) } },

// After
content: { 'application/json': { schema: z.object({ credentials: z.array(CredentialMetadataSchema) }) } },

// Before (line 121)
return c.json(list, 200);

// After
return c.json({ credentials: list }, 200);
```

### 파일 2: `packages/daemon/src/api/routes/admin-credentials.ts`

```typescript
// Before (line 46)
content: { 'application/json': { schema: z.array(CredentialMetadataSchema) } },

// After
content: { 'application/json': { schema: z.object({ credentials: z.array(CredentialMetadataSchema) }) } },

// Before (line 117)
return c.json(list, 200);

// After
return c.json({ credentials: list }, 200);
```

## 재발 방지

### 1. 통합 테스트 추가

`credential-api.test.ts`에 응답 구조 검증 테스트 추가:

```typescript
it('GET /wallets/:walletId/credentials returns { credentials: [...] } wrapper', async () => {
  const res = await app.request(`/v1/wallets/${walletId}/credentials`, ...);
  const body = await res.json();
  expect(body).toHaveProperty('credentials');
  expect(Array.isArray(body.credentials)).toBe(true);
});

it('GET /admin/credentials returns { credentials: [...] } wrapper', async () => {
  const res = await app.request('/v1/admin/credentials', ...);
  const body = await res.json();
  expect(body).toHaveProperty('credentials');
  expect(Array.isArray(body.credentials)).toBe(true);
});
```

### 2. Admin UI 컴포넌트 테스트 보강

`credentials.test.tsx`에 API mock 응답 형식을 실제 백엔드와 동기화하여, 래핑 형식 변경 시 테스트 실패로 감지되도록 함.

### 3. 컨벤션 추가 검토

프로젝트 내 List API 엔드포인트는 배열을 직접 반환하지 않고, 명명된 키로 래핑하는 패턴을 따르도록 컨벤션화 검토. 기존 패턴 예시:
- `GET /v1/wallets` → `{ wallets: [...] }`
- `GET /v1/sessions` → `{ sessions: [...] }`
- `GET /v1/admin/audit-logs` → `{ items: [...] }`

## 테스트 항목

1. **단위 테스트**: credential-api.test.ts에 List 응답 래퍼 구조 검증 2건 추가
2. **통합 테스트**: Admin UI credentials.test.tsx에 Add 후 목록 표시 E2E flow 검증
3. **수동 검증**: Admin UI → Wallets → 지갑 상세 → Credentials 탭 → Add → 목록에 즉시 표시 확인
4. **수동 검증**: Admin UI → Credentials 페이지 → Add → 목록에 즉시 표시 확인
