# #234 Push Relay DeviceRegistry 마이그레이션 — UNIQUE 컬럼 추가 실패

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-02
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-02

## 현상

기존 DB(`relay.db`)가 있는 환경에서 Push Relay를 v2.9.0-rc12로 업데이트하면 시작 시 크래시 발생:

```
SqliteError: Cannot add a UNIQUE column
    at Database.exec (better-sqlite3/lib/methods/wrappers.js:9:14)
    at DeviceRegistry.init (device-registry.js:28:21)
```

`DeviceRegistry.init()`의 마이그레이션 코드가 `ALTER TABLE devices ADD COLUMN subscription_token TEXT UNIQUE`를 실행하는데, SQLite는 `ALTER TABLE ADD COLUMN`에 `UNIQUE` 제약 조건을 허용하지 않는다.

## 원인

`packages/push-relay/src/registry/device-registry.ts:39-41`:

```typescript
if (!cols.includes('subscription_token')) {
  this.db.exec(`ALTER TABLE devices ADD COLUMN subscription_token TEXT UNIQUE`);
}
```

SQLite 문서: "An added column ... may not have a UNIQUE or PRIMARY KEY constraint."

## 수정 방안

컬럼을 제약 조건 없이 추가한 후, 별도 유니크 인덱스를 생성:

```typescript
if (!cols.includes('subscription_token')) {
  this.db.exec(`ALTER TABLE devices ADD COLUMN subscription_token TEXT`);
}
this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_subscription_token ON devices(subscription_token)`);
```

## 영향 범위

- `packages/push-relay/src/registry/device-registry.ts` — 마이그레이션 코드 수정

## 테스트 항목

- [ ] 기존 DB(subscription_token 컬럼 없음)에서 시작 시 컬럼 추가 + 유니크 인덱스 생성 확인
- [ ] 이미 마이그레이션된 DB에서 재시작 시 에러 없이 정상 동작 확인
- [ ] 신규 DB(테이블 없음)에서 정상 생성 확인
- [ ] subscription_token 유니크 제약이 정상 동작하는지 확인 (중복 삽입 시 에러)
