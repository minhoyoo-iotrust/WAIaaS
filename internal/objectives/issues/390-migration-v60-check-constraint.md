# 390: Migration v60 CHECK 제약조건 미갱신으로 sdk_push UPDATE 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견:** 2026-03-18
- **마일스톤:** v32.9 (프리릴리즈)

## 증상

`waiaas start` 실행 시 DB 마이그레이션 v60에서 다음 에러로 데몬 시작 실패:

```
Migration v60 (Add wallet_apps.push_relay_url, clear sign_topic/notify_topic, rename sdk_ntfy to sdk_push) failed:
CHECK constraint failed: owner_approval_method IS NULL OR owner_approval_method IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest')
```

## 원인

Migration v60이 `wallets.owner_approval_method`를 `sdk_ntfy` → `sdk_push`로 UPDATE하지만, 기존 테이블의 CHECK 제약조건이 여전히 `sdk_ntfy`만 허용하고 `sdk_push`는 포함하지 않음. SQLite는 `ALTER TABLE`로 CHECK 제약조건을 변경할 수 없으므로, 테이블 리빌드(CREATE new → INSERT → DROP old → RENAME) 패턴이 필요하나 이를 누락.

- `schema-ddl.ts`의 최신 DDL은 `sdk_push`로 올바르게 정의됨 (fresh DB는 문제 없음)
- 기존 DB를 마이그레이션할 때만 발생 (v59 이하 → v60 업그레이드 경로)

## 영향

- **기존 사용자 전원**: v32.9 프리릴리즈로 업그레이드 시 데몬 시작 불가
- Fresh install은 영향 없음 (schema-ddl.ts가 최신 DDL 사용)

## 수정 방안

Migration v60의 step 4를 단순 UPDATE에서 wallets 테이블 리빌드 패턴으로 변경:

1. `sqlite_master`에서 현재 wallets CREATE SQL을 조회하여 `sdk_ntfy` 포함 여부 확인 (멱등성)
2. `wallets_new` 테이블을 `sdk_push` CHECK로 생성
3. 데이터 복사 시 `owner_approval_method` 값을 `sdk_ntfy` → `sdk_push`로 변환
4. 기존 테이블 DROP → RENAME
5. 인덱스 4개 재생성

참고: 기존 마이그레이션에서 동일 패턴 다수 사용 (v21-v30.ts:290~314 등)

## 테스트 항목

1. **기존 DB 업그레이드 테스트**: v59 스키마 + `sdk_ntfy` 데이터 → v60 마이그레이션 → `sdk_push`로 변환 확인
2. **CHECK 제약조건 검증**: 마이그레이션 후 `sdk_ntfy` 값 INSERT 시 CHECK 실패 확인
3. **Fresh DB 테스트**: 신규 DB 생성 시 v60 마이그레이션 스킵 (schema-ddl 사용) 정상 동작
4. **멱등성 테스트**: v60 마이그레이션 2회 실행 시 에러 없음
5. **인덱스 복원 테스트**: 마이그레이션 후 wallets 테이블 인덱스 4개 존재 확인
6. **기존 migration-v60.test.ts 업데이트**: 테이블 리빌드 로직 반영
