# 411 — UserOp Build/Sign REST API 엔드포인트 404 — 경로 불일치

- **유형:** BUG
- **심각도:** MEDIUM (MISSING → BUG로 변경)
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT advanced-01 (Smart Account UserOp Build/Sign)
- **상태:** OPEN

## 증상

`POST /v1/userop/build` 및 `POST /v1/userop/sign` 엔드포인트가 404 Not Found를 반환.

## 근본 원인

**엔드포인트는 구현되어 있으나 (1) 경로가 시나리오와 다르고 (2) 조건부 등록으로 인해 누락 가능.**

### 구현 상태 (실제로 존재함)

| 파일 | 위치 | 엔드포인트 |
|------|------|-----------|
| `packages/daemon/src/api/routes/userop.ts:81` | build 라우트 | `POST /wallets/{id}/userop/build` |
| `packages/daemon/src/api/routes/userop.ts:323` | sign 라우트 | `POST /wallets/{id}/userop/sign` |
| `packages/daemon/src/api/server.ts:610-627` | 등록 | 조건부: `deps.db && deps.sqlite && deps.keyStore && effectiveMasterPassword` |

### 2가지 문제

**1. 경로 불일치 (UAT 시나리오 오류)**

| 시나리오 경로 | 실제 경로 |
|--------------|----------|
| `POST /v1/userop/build` | `POST /v1/wallets/{walletId}/userop/build` |
| `POST /v1/userop/sign` | `POST /v1/wallets/{walletId}/userop/sign` |

UAT 시나리오 `advanced-01`이 잘못된 경로를 사용하고 있음.

**2. 조건부 등록**

`server.ts:610-613`:
```typescript
if (deps.db && deps.sqlite && deps.keyStore && effectiveMasterPassword) {
  app.route('/v1', userOpRoutes({...}));
}
```

4개 의존성 중 하나라도 누락되면 라우트가 등록되지 않아 404 반환. 하지만 `connect-info`는 하드코딩으로 `userop` capability를 보고:

`connect-info.ts:363-366`:
```typescript
if (linkedWallets.some((w) => w.accountType === 'smart')) {
  capabilities.push('userop'); // 라우트 존재 여부와 무관하게 보고
}
```

**3. 인증 방식**

UserOp 라우트는 **masterAuth**를 요구 (`userop.ts:7`). sessionAuth로는 접근 불가.

## 수정 방향

1. **UAT 시나리오 수정**: `advanced-01`의 API 경로를 `/v1/wallets/{walletId}/userop/build`로 수정
2. **인증 방식 확인**: masterAuth가 필요한지, sessionAuth로도 가능해야 하는지 검토
3. **connect-info capability**: 라우트 등록 여부를 확인하여 capability 보고 (선택)

## 테스트 항목

- [ ] `POST /v1/wallets/{walletId}/userop/build` masterAuth로 호출 시 200 응답
- [ ] `POST /v1/wallets/{walletId}/userop/sign` masterAuth로 호출 시 200 응답
- [ ] UAT 시나리오 `advanced-01` 경로 수정 후 재실행
- [ ] connect-info의 `userop` capability가 실제 라우트 등록 상태와 일치
