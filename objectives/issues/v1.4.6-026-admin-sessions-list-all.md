# 026: Admin UI 세션 페이지에서 전체 세션 조회 불가 — 월렛 선택 필수

## 심각도

**LOW** — 세션 관리 기능 자체에는 문제 없으나, 관리자가 전체 세션 현황을 한눈에 파악할 수 없다.

## 증상

- Admin UI 세션 페이지 진입 시 "Select a wallet" 빈 화면만 표시
- 월렛을 선택해야만 해당 월렛의 세션을 볼 수 있음
- 전체 월렛에 걸친 활성 세션 수, 만료 임박 세션 등을 한눈에 확인할 수 없음

## 원인

### 백엔드

OpenAPI 스키마에서는 `walletId`가 optional이지만, 핸들러에서 필수로 강제한다:

```typescript
// sessions.ts:77 — 스키마는 optional
walletId: z.string().uuid().optional(),

// sessions.ts:242-245 — 핸들러에서 필수 강제
if (!walletId) {
  throw new WAIaaSError('WALLET_NOT_FOUND', {
    message: 'walletId query parameter required',
  });
}
```

### 프론트엔드

월렛 미선택 시 API 호출을 하지 않고 EmptyState를 표시한다:

```typescript
// sessions.tsx:79
if (!selectedWalletId.value) return;
```

## 사이드 이펙트 분석

| 소비자 | `GET /v1/sessions` 사용 | 영향 |
|--------|----------------------|------|
| Admin UI | 월렛별 조회 | 없음 — `walletId` 전송하는 기존 호출 그대로 동작 |
| SDK | 사용 안 함 (renew/create만) | 없음 |
| CLI | 사용 안 함 (create만) | 없음 |
| MCP | 사용 안 함 | 없음 |

`GET /v1/sessions`의 유일한 소비자는 Admin UI이며, 기존 호출(`walletId` 지정)은 그대로 동작하므로 하위호환 문제 없음.

## 수정안

### 1. 백엔드: `walletId` 미지정 시 전체 세션 반환

```typescript
// sessions.ts — 변경
router.openapi(listSessionsRoute, (c) => {
  const { walletId } = c.req.valid('query');

  const conditions = [isNull(sessions.revokedAt)];
  if (walletId) {
    conditions.push(eq(sessions.walletId, walletId));
  }

  const rows = deps.db
    .select({
      ...sessions,
      walletName: wallets.name,  // JOIN으로 월렛 이름 포함
    })
    .from(sessions)
    .leftJoin(wallets, eq(sessions.walletId, wallets.id))
    .where(and(...conditions))
    .orderBy(sql`${sessions.createdAt} DESC`)
    .all();

  // ...
});
```

### 2. 응답에 walletName 추가

전체 조회 시 어떤 월렛의 세션인지 구분하기 위해 `walletName` 필드를 추가한다:

```json
{
  "id": "uuid",
  "walletId": "uuid",
  "walletName": "my-evm-wallet",
  "status": "ACTIVE",
  "expiresAt": 1739520000,
  "renewalCount": 2,
  "maxRenewals": 5,
  "createdAt": 1739500000
}
```

### 3. 프론트엔드: 페이지 로드 시 전체 세션 표시

```typescript
// sessions.tsx — 변경
// 1. 페이지 로드 시 전체 세션 조회 (walletId 없이)
// 2. 월렛 드롭다운: 필수 선택 → 필터 역할로 전환
// 3. 테이블에 Wallet 컬럼 추가
// 4. "All Wallets" 옵션 추가
```

| 현재 | 변경 후 |
|------|--------|
| 월렛 선택 전: "Select a wallet" 빈 화면 | 전체 세션 테이블 표시 |
| 드롭다운: 필수 선택 | 드롭다운: "All Wallets" 기본 + 월렛 필터 |
| 테이블 컬럼: ID, Status, Expires, Renewals, Created, Actions | + **Wallet** 컬럼 추가 |

## 재발 방지 테스트

### T-1: walletId 미지정 시 전체 세션 반환

`GET /v1/sessions` (walletId 없이) 호출 시 모든 월렛의 세션이 반환되는지 검증.

### T-2: walletId 지정 시 필터링 유지

`GET /v1/sessions?walletId=uuid` 호출 시 해당 월렛의 세션만 반환되는지 검증 (기존 동작 유지).

### T-3: 응답에 walletName 포함

전체 조회 시 각 세션에 `walletName` 필드가 포함되는지 검증.

### T-4: Admin UI 초기 로드

세션 페이지 진입 시 전체 세션이 테이블에 표시되고, Wallet 컬럼에 월렛 이름이 표시되는지 검증.

### T-5: Admin UI 월렛 필터

드롭다운에서 특정 월렛을 선택하면 해당 월렛의 세션만 필터링되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `routes/sessions.ts` (WHERE 분기 + JOIN), `pages/sessions.tsx` (전체 조회 + Wallet 컬럼) |
| 스키마 | `SessionListItemSchema`에 `walletName` 필드 추가 |
| 테스트 | 5건 추가 |
| 하위호환 | `walletId` 지정 호출은 기존과 동일, 미지정 시 전체 반환 (기존에는 에러) |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: Admin UI 세션 관리 (`packages/admin/src/pages/sessions.tsx`), OpenAPI 스키마 불일치*
