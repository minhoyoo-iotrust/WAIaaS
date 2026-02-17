# 027: Admin UI 대시보드가 전체 현황 파악에 부족 — 핵심 정보 누락 + 상세 페이지 링크 없음

## 심각도

**MEDIUM** — 관리자가 대시보드만으로 시스템 전체 상황을 파악할 수 없다. 트랜잭션 현황, 잔액, 알림 상태 등 핵심 정보가 빠져 있고, 기존 StatCard에서 상세 페이지로 이동하는 링크도 없다.

## 증상

- 대시보드에 Version, Uptime, Wallets 수, Active Sessions 수, Kill Switch, Status 6개 카드만 표시
- 트랜잭션 성공/실패 현황을 알 수 없음
- 월렛 잔액 요약이 없어 자금 부족 여부를 확인할 수 없음
- 알림 채널 정상 동작 여부를 알 수 없음
- Wallets(3), Active Sessions(5) 등 숫자를 봐도 상세 페이지로 바로 이동할 수 없음

## 수정안

### 1. StatCard에 상세 페이지 링크 추가

클릭 가능한 StatCard에 시각적 힌트(화살표, hover 효과)를 추가하고, 클릭 시 해당 페이지로 이동한다:

| StatCard | 링크 대상 |
|----------|----------|
| Wallets | `#/wallets` |
| Active Sessions | `#/sessions` |
| Policies | `#/policies` |
| Notifications | `#/notifications` |
| Version | 링크 없음 |
| Uptime | 링크 없음 |
| Kill Switch | 링크 없음 |
| Status | 링크 없음 |

```typescript
// StatCard에 href 옵션 추가
function StatCard({ label, value, loading, badge, href }: {
  label: string; value: string; loading?: boolean;
  badge?: 'success' | 'danger'; href?: string;
}) {
  const content = (/* 기존 렌더링 */);
  return href
    ? <a href={href} class="stat-card stat-card-link">{content}</a>
    : <div class="stat-card">{content}</div>;
}
```

### 2. 대시보드 정보 확장

`GET /v1/admin/status` 응답에 추가 필드를 포함하거나 별도 API 호출로 데이터를 수집한다.

#### 추가 StatCard

| StatCard | 데이터 소스 | 내용 |
|----------|-----------|------|
| Policies | `COUNT(*) FROM policies` | 활성 정책 수 |
| Recent Transactions | `COUNT(*) FROM transactions WHERE created_at > now - 24h` | 24시간 내 트랜잭션 수 |
| Failed Transactions | `COUNT(*) FROM transactions WHERE status = 'FAILED' AND created_at > now - 24h` | 24시간 내 실패 수 (0이면 success 뱃지, 1 이상이면 danger) |
| Notifications | 최근 알림 성공/실패 | 24시간 내 발송 현황 |

#### 최근 활동 섹션

StatCard 아래에 최근 트랜잭션 5건을 간략히 표시한다:

```
Recent Activity
  | Time       | Wallet        | Type     | Amount   | Status    |
  |------------|---------------|----------|----------|-----------|
  | 2m ago     | my-evm-wallet | TRANSFER | 0.01 ETH | CONFIRMED |
  | 15m ago    | sol-wallet    | TRANSFER | 1.5 SOL  | CONFIRMED |
  | 1h ago     | my-evm-wallet | APPROVE  | ∞ USDC   | CONFIRMED |
```

### 3. 변경 후 대시보드 레이아웃

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐
│ Version  │  │ Uptime   │  │ Wallets →│  │ Sessions →│
│ 1.4.5    │  │ 2h 30m   │  │ 3        │  │ 5          │
└──────────┘  └──────────┘  └──────────┘  └────────────┘
┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐
│ Kill     │  │ Status   │  │ Policies →│  │ Notifs    → │
│ Switch   │  │ running  │  │ 8          │  │ 12 sent      │
│ NORMAL   │  │          │  │            │  │              │
└──────────┘  └──────────┘  └────────────┘  └──────────────┘
┌──────────────┐  ┌──────────────┐
│ Txns (24h)   │  │ Failed (24h) │
│ 47           │  │ 0 ✓          │
└──────────────┘  └──────────────┘

Recent Activity
  | Time    | Wallet        | Type     | Amount   | Status    |
  |---------|---------------|----------|----------|-----------|
  | 2m ago  | my-evm-wallet | TRANSFER | 0.01 ETH | CONFIRMED |
  | ...     | ...           | ...      | ...      | ...       |
```

## 구현 고려사항

### 백엔드

`GET /v1/admin/status` 응답 확장 또는 별도 `GET /v1/admin/dashboard` 엔드포인트 추가:

| 방식 | 장단점 |
|------|--------|
| 기존 `/admin/status` 확장 | 단순, 하위호환 유지 (신규 필드 추가) |
| 별도 `/admin/dashboard` | 관심사 분리, 대시보드 전용 데이터 자유롭게 설계 |

기존 `/admin/status` 확장을 권장 — 신규 필드는 추가만 하므로 하위호환 문제 없음.

### 프론트엔드

- `StatCard` 컴포넌트에 `href` prop 추가
- 클릭 가능한 카드에 hover 효과 (`cursor: pointer`, 테두리 색상 변경)
- 최근 활동 섹션은 기존 `Table` 컴포넌트 재사용

## 재발 방지 테스트

### T-1: StatCard 링크 동작

Wallets StatCard 클릭 시 `#/wallets` 페이지로 이동하는지 검증.

### T-2: 추가 StatCard 데이터 표시

대시보드 로드 시 Policies, Recent Transactions, Failed Transactions 카드가 표시되고 올바른 숫자를 보여주는지 검증.

### T-3: 최근 활동 섹션

대시보드에 최근 트랜잭션 5건이 표시되고, 트랜잭션이 없을 때 빈 상태가 표시되는지 검증.

### T-4: API 응답 확장 하위호환

기존 `/admin/status` 필드(version, uptime, walletCount, activeSessionCount, killSwitchState)가 그대로 유지되는지 검증.

### T-5: Failed Transactions 뱃지

실패 트랜잭션 0건일 때 success 뱃지, 1건 이상일 때 danger 뱃지가 표시되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `routes/admin.ts` (status 응답 확장), `pages/dashboard.tsx` (StatCard 링크 + 추가 카드 + 최근 활동) |
| 스키마 | `AdminStatusResponseSchema` 필드 추가 |
| 컴포넌트 | `StatCard`에 `href` prop 추가 |
| 테스트 | 5건 추가 |
| 하위호환 | 기존 필드 유지, 신규 필드 추가만 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: Admin UI 대시보드 (`packages/admin/src/pages/dashboard.tsx`), 이슈 024 (잔액/트랜잭션 표시)*
