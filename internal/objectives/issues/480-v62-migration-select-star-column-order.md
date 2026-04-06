# 480: v62 마이그레이션 SELECT * 컬럼 순서 불일치로 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **발견:** 2026-04-06
- **영향:** 데몬 시작 불가 (DB 마이그레이션 실패)

## 증상

v61 → v62 마이그레이션 시 아래 에러로 데몬이 시작되지 않음:

```
Migration v62 failed: NOT NULL constraint failed: defi_positions_new.opened_at
```

## 원인

v62 마이그레이션에서 `INSERT INTO defi_positions_new SELECT * FROM defi_positions`를 사용하는데, 실제 운영 DB의 `defi_positions` 테이블은 `environment` 컬럼이 ALTER TABLE ADD로 나중에 추가되어 **마지막 컬럼(16번)**에 위치함.

반면 v62의 새 테이블 정의는 `environment`를 **6번째 컬럼**에 배치. SQLite의 `SELECT *`는 위치 기반으로 매핑하므로 컬럼이 밀려서 문자열 `'mainnet'`이 `opened_at INTEGER NOT NULL` 위치에 들어가면서 NOT NULL 제약 위반 발생.

```
실제 DB 순서: ..., chain, network, asset_id, ..., opened_at, ..., updated_at, environment
새 테이블:    ..., chain, environment, network, asset_id, ..., opened_at, ..., updated_at
```

## 수정 범위

### 1. 버그 수정 — v62 마이그레이션 SELECT * → 명시적 컬럼 리스트
- `packages/daemon/src/infrastructure/database/migrations/v62.ts`
- `defi_positions` INSERT 문에 명시적 컬럼 리스트 사용

### 2. 재발 방지 — 시드 데이터 마이그레이션 체인 테스트
- `packages/daemon/src/__tests__/migration-chain.test.ts`
- v61까지 마이그레이션 → 시드 데이터 INSERT → v62 실행 → 데이터 무결성 검증
- ALTER TABLE ADD로 추가된 컬럼의 순서 불일치를 재현

### 3. 재발 방지 — SELECT * 금지 CI 체크
- 마이그레이션 파일에서 `SELECT *` 패턴 감지 스크립트
- CI에서 자동 실행하여 코드 리뷰 단계에서 차단

### 4. 재발 방지 — 스키마 컬럼 순서 검증
- 마이그레이션 체인 테스트에서 마이그레이션 후 `PRAGMA table_info` 결과가 fresh DB와 일치하는지 검증
- 컬럼 이름, 순서, 타입, NOT NULL 모두 비교

## 테스트 항목

- v61 DB에 defi_positions 시드 데이터 → v62 마이그레이션 성공 확인
- v62 마이그레이션 후 defi_positions 데이터 무결성 검증 (environment 값 보존)
- v1 → v62 풀 체인 마이그레이션 + 시드 데이터 검증
- 마이그레이션 파일에 SELECT * 사용 시 CI 실패 확인
- 마이그레이션 후 모든 테이블의 컬럼 순서가 fresh DB와 일치하는지 검증
