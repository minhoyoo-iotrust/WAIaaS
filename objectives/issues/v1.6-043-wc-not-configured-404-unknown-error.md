# v1.6-043: WalletConnect 미설정 시 404 + "알 수 없는 에러" 표시

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 증상

WalletConnect Project ID를 Settings에서 설정하지 않은 상태에서:
1. 월렛 상세 페이지 또는 WalletConnect 오버뷰 페이지 진입 시 콘솔에 404 에러 다수 발생
2. "Connect Wallet" 버튼 클릭 시 "알 수 없는 에러" 토스트 표시

```
v1/wallets/{id}/wc/session:1  Failed to load resource: the server responded with a status of 404 (Not Found)
v1/wallets/{id}/wc/pair:1     Failed to load resource: the server responded with a status of 404 (Not Found)
```

## 원인 분석

### Backend: WC 라우트 조건부 등록

`packages/daemon/src/api/server.ts:497-507`:

```typescript
// Register WalletConnect routes when DB + wcSessionService are available
if (deps.db && deps.wcSessionService) {
  app.route('/v1', wcRoutes({ ... }));
  app.route('/v1', wcSessionRoutes({ ... }));
}
```

`packages/daemon/src/lifecycle/daemon.ts:500-511`:

```typescript
const wcProjectId = this._settingsService?.get('walletconnect.project_id');
if (wcProjectId) {
  // WcSessionService 초기화
} else {
  console.log('Step 4c-6: WalletConnect disabled (no project_id)');
  // wcSessionService는 null로 유지
}
```

`project_id` 미설정 → `wcSessionService = null` → WC 라우트 미등록 → 모든 `/wc/*` 요청에 404 반환.

`wc.ts` 헤더에 "WC endpoints return 503 if WalletConnect is not configured" 라고 명시되어 있지만, 라우트가 아예 등록되지 않아서 503이 아닌 404가 발생함.

### Frontend: WC 에러 코드 미매핑

`packages/admin/src/utils/error-messages.ts`에 아래 WC 에러 코드가 누락:

- `WC_NOT_CONFIGURED` → 매핑 없음
- `WC_SESSION_NOT_FOUND` → 매핑 없음
- `WC_SESSION_EXISTS` → 매핑 없음
- `WC_SIGNING_FAILED` → 매핑 없음

404 응답은 WAIaaSError가 아니라 Hono 기본 404이므로 에러 코드도 없음 → `ApiError(0, 'UNKNOWN', 'Unknown error')` → "알 수 없는 에러" 표시.

## 수정 방안

### 1. Backend: WC 라우트 항상 등록 + 서비스 가드

`server.ts`에서 `deps.db` 조건만으로 WC 라우트를 항상 등록하되, `wcSessionService`를 nullable로 전달:

```typescript
if (deps.db) {
  app.route('/v1', wcRoutes({
    db: deps.db,
    wcSessionService: deps.wcSessionService ?? null,
  }));
}
```

`wc.ts`의 `WcRouteDeps` 타입에서 `wcSessionService`를 nullable로 변경하고, 각 핸들러 시작부에 가드 추가:

```typescript
export interface WcRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  wcSessionService: WcSessionService | null;
}

// 각 핸들러에서:
if (!wcSessionService) throw new WAIaaSError('WC_NOT_CONFIGURED');
```

이렇게 하면 503 + `{ code: "WC_NOT_CONFIGURED" }` 응답이 반환됨.

### 2. Frontend: WC 에러 코드 매핑 추가

`error-messages.ts`에 WC 관련 에러 메시지 추가:

```typescript
// WC domain (4)
WC_NOT_CONFIGURED: 'WalletConnect is not configured. Set the Project ID in Settings first.',
WC_SESSION_NOT_FOUND: 'No active WalletConnect session.',
WC_SESSION_EXISTS: 'A WalletConnect session already exists. Disconnect first.',
WC_SIGNING_FAILED: 'WalletConnect signing request failed.',
```

### 3. Frontend: fetchWcSession 404 조용히 처리

`wallets.tsx`의 `fetchWcSession()`과 `walletconnect.tsx`의 `fetchData()`에서 `WC_NOT_CONFIGURED` / `WC_SESSION_NOT_FOUND`를 정상 케이스로 처리하여 콘솔 에러 토스트 방지:

```typescript
// wallets.tsx - fetchWcSession
catch (err) {
  wcSession.value = null;
  // WC_NOT_CONFIGURED / WC_SESSION_NOT_FOUND는 정상 케이스 — 토스트 불필요
}
```

`handleWcConnect()`에서는 `WC_NOT_CONFIGURED`일 때 Settings 페이지로 안내하는 메시지 표시:

```typescript
catch (err) {
  const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
  showToast('error', getErrorMessage(e.code));
  // WC_NOT_CONFIGURED 메시지가 "Set the Project ID in Settings first."로 표시됨
}
```

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/api/server.ts` | WC 라우트 항상 등록 |
| `packages/daemon/src/api/routes/wc.ts` | `WcRouteDeps.wcSessionService` nullable + 가드 |
| `packages/admin/src/utils/error-messages.ts` | WC 에러 코드 4건 추가 |
| `packages/admin/src/pages/wallets.tsx` | handleWcConnect에서 WC_NOT_CONFIGURED 안내 |
| `packages/admin/src/pages/walletconnect.tsx` | handleConnect에서 WC_NOT_CONFIGURED 안내 |

## 테스트

### Backend 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-043-01 | `wcSessionService=null`일 때 `POST /v1/wallets/{id}/wc/pair` 호출 | 503 + `{ code: "WC_NOT_CONFIGURED" }` |
| T-043-02 | `wcSessionService=null`일 때 `GET /v1/wallets/{id}/wc/session` 호출 | 503 + `{ code: "WC_NOT_CONFIGURED" }` |
| T-043-03 | `wcSessionService=null`일 때 `DELETE /v1/wallets/{id}/wc/session` 호출 | 503 + `{ code: "WC_NOT_CONFIGURED" }` |
| T-043-04 | `wcSessionService=null`일 때 `GET /v1/wallets/{id}/wc/pair/status` 호출 | 503 + `{ code: "WC_NOT_CONFIGURED" }` |
| T-043-05 | `wcSessionService=null`일 때 sessionAuth 라우트 (`/v1/wallet/wc/*`) 4개 동일 검증 | 503 + `{ code: "WC_NOT_CONFIGURED" }` |
| T-043-06 | `wcSessionService`가 정상일 때 기존 동작 유지 확인 (pair, session, disconnect, status) | 기존 응답과 동일 |

### Frontend 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-043-07 | `getErrorMessage('WC_NOT_CONFIGURED')` 호출 | `'WalletConnect is not configured. Set the Project ID in Settings first.'` 반환 |
| T-043-08 | `getErrorMessage('WC_SESSION_NOT_FOUND')` 호출 | `'No active WalletConnect session.'` 반환 |
| T-043-09 | `getErrorMessage('WC_SESSION_EXISTS')` 호출 | `'A WalletConnect session already exists. Disconnect first.'` 반환 |
| T-043-10 | `getErrorMessage('WC_SIGNING_FAILED')` 호출 | `'WalletConnect signing request failed.'` 반환 |

### E2E 시나리오

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-043-E1 | Project ID 미설정 + Admin 월렛 상세 진입 | WC 섹션 정상 렌더링 (에러 토스트 없음), Connect Wallet 버튼 표시 |
| T-043-E2 | Project ID 미설정 + Connect Wallet 클릭 | "WalletConnect is not configured. Set the Project ID in Settings first." 토스트 |
| T-043-E3 | Project ID 설정 후 Connect Wallet 클릭 | QR 모달 정상 표시 |

## 재현 방법

1. Settings에서 WalletConnect Project ID를 비우거나 설정하지 않음
2. 데몬 시작 (또는 재시작)
3. Admin UI → Wallets → 월렛 상세 페이지 진입 → 콘솔에 404 에러
4. "Connect Wallet" 클릭 → "알 수 없는 에러" 토스트
