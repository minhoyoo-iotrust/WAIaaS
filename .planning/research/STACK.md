# Technology Stack

**Project:** m33-04 서명 앱 명시적 선택
**Researched:** 2026-04-02

## Scope

이 마일스톤은 기존 스택에 **신규 라이브러리 추가 없음**. SQLite 내장 기능, better-sqlite3 기존 API, Preact 기존 패턴만 사용. 아래는 세 가지 핵심 기술 영역의 검증 결과.

## 1. SQLite Partial Unique Index

### 현황

프로젝트에 이미 9개 이상의 partial index(`CREATE INDEX ... WHERE`) 사용 중:
- `idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'`
- `idx_transactions_bridge_status ON transactions(bridge_status) WHERE bridge_status IS NOT NULL`
- `idx_wallet_credentials_global_name ON wallet_credentials(name) WHERE wallet_id IS NULL`
- 등 (v21-v30, v51-v59 마이그레이션 파일 참조)

### Partial UNIQUE Index 지원

| 항목 | 상태 | 근거 |
|------|------|------|
| SQLite 지원 | **YES** (3.8.0+, 2013) | SQLite 공식 문서: partial index는 `CREATE INDEX` 뿐만 아니라 `CREATE UNIQUE INDEX`에도 동일 적용 |
| better-sqlite3 지원 | **YES** | raw SQL `exec()` 호출이므로 드라이버 제한 없음 |
| Drizzle ORM 영향 | **없음** | 마이그레이션은 raw SQL(`sqlite.exec()`), Drizzle schema는 읽기 전용 타입 정의 |

### 필요한 SQL

```sql
CREATE UNIQUE INDEX idx_wallet_apps_signing_primary
  ON wallet_apps(wallet_type) WHERE signing_enabled = 1;
```

이 인덱스는 `wallet_type` 당 `signing_enabled = 1`인 행을 최대 1개로 제한. `signing_enabled = 0`인 행은 인덱스 대상이 아니므로 여러 개 가능.

### Confidence: HIGH

근거: 프로젝트에서 동일 패턴(partial index)을 이미 광범위하게 사용. UNIQUE 변형도 SQLite 3.8.0+ 표준 기능.

## 2. Transaction-Safe Multi-Row Updates (better-sqlite3)

### 현황

프로젝트에 `sqlite.transaction()` 패턴이 15곳 이상 사용 중:
- `database-policy-engine.ts:415` -- 정책 평가
- `approval-workflow.ts:120, 187, 247, 295` -- 승인 워크플로우
- `delay-queue.ts:156` -- 지연 큐
- `wallets.ts:1164` -- 지갑 CRUD
- `re-encrypt.ts:152, 215` -- 키 재암호화
- `incoming-tx-queue.ts:96` -- 수신 TX 배치

### 필요한 트랜잭션 패턴

```typescript
// WalletAppService.update() -- signing_enabled 토글 시
const txn = this.sqlite.transaction(() => {
  // 1. 같은 wallet_type의 다른 앱 비활성화
  this.sqlite.prepare(
    'UPDATE wallet_apps SET signing_enabled = 0, updated_at = ? WHERE wallet_type = ? AND id != ?'
  ).run(now, walletType, id);
  // 2. 대상 앱 활성화
  this.sqlite.prepare(
    'UPDATE wallet_apps SET signing_enabled = 1, updated_at = ? WHERE id = ?'
  ).run(now, id);
});
txn();
```

| 항목 | 상태 | 근거 |
|------|------|------|
| better-sqlite3 ^12.6.0 | 사용 중 | `packages/daemon/package.json` |
| `db.transaction()` API | 안정적 | WAL 모드 SQLite + 동기 API = 데드락 없음 |
| Partial unique index + transaction | **호환** | 트랜잭션 내에서 비활성화 후 활성화하면 unique 위반 없음 (순서 보장) |

### 주의사항

- better-sqlite3의 `transaction()` 내 모든 statement는 **동기 실행**. async 호출 불가 (프로젝트 전체가 이 패턴을 따름).
- 트랜잭션 내에서 `signing_enabled = 0`을 먼저 실행한 후 `signing_enabled = 1`을 설정해야 partial unique index 위반 방지.

### Confidence: HIGH

근거: 프로젝트에서 동일 `sqlite.transaction()` 패턴을 15곳 이상에서 검증 완료.

## 3. Preact Radio Button Group (Admin UI)

### 현황

프로젝트에 이미 radio 버튼 패턴이 존재:
- `packages/admin/src/pages/wallets.tsx:1378` -- `approval_method` 라디오 그룹
- `packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx` -- 라디오 테스트

### 기존 패턴 (wallets.tsx)

```tsx
<input
  type="radio"
  name="approval_method"
  value={opt.value ?? ''}
  checked={wallet.value?.approvalMethod === opt.value}
  onChange={() => handleApprovalMethodChange(opt.value)}
  style={{ marginTop: '2px' }}
/>
```

### 서명 앱 라디오에 적용할 패턴

```tsx
// wallet_type 그룹별 name 속성으로 라디오 그룹 분리
<input
  type="radio"
  name={`signing_primary_${app.walletType}`}
  value={app.id}
  checked={app.signingEnabled}
  onChange={() => handleSigningToggle(app.id)}
/>
```

| 항목 | 상태 | 근거 |
|------|------|------|
| Preact 10.x radio | **표준 HTML** | Preact는 표준 DOM 이벤트 사용, React 래퍼 불필요 |
| @preact/signals 연동 | **기존 패턴** | `useSignal` + onChange -> API 호출 -> 리패치 |
| "없음" 옵션 | `value=""` 라디오 추가 | 전체 비활성화를 위한 옵션 |

### "없음" 옵션 구현

```tsx
// 그룹 내 모든 앱의 signing_enabled = 0으로 만드는 "없음" 라디오
<input
  type="radio"
  name={`signing_primary_${walletType}`}
  value=""
  checked={!groupApps.some(a => a.signingEnabled)}
  onChange={() => handleSigningDisableAll(walletType)}
/>
```

### Confidence: HIGH

근거: 동일 Preact 라디오 패턴이 wallets.tsx에서 이미 검증됨.

## 추가 라이브러리 필요 여부

| 후보 | 필요 여부 | 이유 |
|------|-----------|------|
| UI 라디오 컴포넌트 라이브러리 | **불필요** | 표준 HTML `<input type="radio">` + 기존 CSS로 충분 |
| ORM 마이그레이션 도구 | **불필요** | raw SQL `sqlite.exec()` 패턴 유지 |
| 트랜잭션 매니저 | **불필요** | better-sqlite3 내장 `transaction()` |
| 상태 관리 추가 | **불필요** | @preact/signals 기존 패턴 |

## 기존 스택 (변경 없음)

| Technology | Version | Purpose |
|------------|---------|---------|
| better-sqlite3 | ^12.6.0 | SQLite 드라이버 (트랜잭션, partial unique index) |
| drizzle-orm | ^0.45.0 | Schema 타입 정의 (마이그레이션은 raw SQL) |
| Preact | 10.x | Admin UI (라디오 버튼 그룹) |
| @preact/signals | 기존 | UI 상태 관리 |
| openapi-fetch | 기존 | 타입 안전 API 클라이언트 |

## Installation

```bash
# 신규 패키지 설치 없음
```

## Drizzle Schema 업데이트

마이그레이션은 raw SQL이지만, `schema.ts`의 Drizzle 정의도 동기화 필요:

```typescript
// schema.ts -- walletApps 테이블 정의는 변경 없음
// partial unique index는 Drizzle schema에 표현 불필요 (런타임 DB 제약)
// 단, 스키마 주석에 v61 인덱스 추가 정보 기록
```

## Sources

- SQLite 공식 문서: Partial Indexes (https://www.sqlite.org/partialindex.html) -- SQLite 3.8.0+
- better-sqlite3 API: `Database.transaction()` (https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function)
- 프로젝트 내부: `packages/daemon/src/infrastructure/database/migrations/v21-v30.ts` (9개 partial index)
- 프로젝트 내부: `packages/daemon/src/infrastructure/database/migrations/v51-v59.ts` (추가 partial index)
- 프로젝트 내부: `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` (WalletAppService CRUD)
- 프로젝트 내부: `packages/admin/src/pages/wallets.tsx:1378` (Preact radio 패턴)
