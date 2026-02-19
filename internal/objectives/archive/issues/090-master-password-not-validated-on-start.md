# 090 — 데몬 시작 시 마스터 패스워드 검증 없음 — 잘못된 패스워드로 시작 후 서명 시점에야 실패

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | HIGH |
| **마일스톤** | v2.3 |
| **상태** | OPEN |
| **발견일** | 2026-02-19 |

## 증상

`waiaas start` 시 이전과 다른 패스워드를 입력해도 데몬이 정상 시작됨. 이후 트랜잭션 서명 시도 시 `INVALID_MASTER_PASSWORD` (GCM authTag mismatch) 에러로 실패. 사용자는 데몬이 정상 작동한다고 생각하지만 실제로는 모든 트랜잭션이 실패하는 상태.

## 근본 원인

마스터 패스워드가 어디에도 영구 저장되지 않음:
- config.toml: 패스워드/해시 없음
- DB: 패스워드/해시 없음
- keystore 파일: 개인키를 패스워드로 암호화하여 저장하지만, 패스워드 자체의 해시는 저장하지 않음

`daemon.ts` Step 4c에서 입력된 패스워드를 즉석에서 Argon2id 해시 → 메모리에만 보관:

```typescript
// daemon.ts:319
this.masterPasswordHash = await argon2.hash(masterPassword, { ... });
```

시작 시점에 기존 키스토어 파일로 패스워드를 검증하는 로직이 없으므로, 아무 패스워드나 입력해도 데몬이 시작됨.

## 재현 절차

1. `waiaas init && waiaas start` → 패스워드 "correct123" 입력
2. 월렛 생성 + 트랜잭션 정상 동작
3. 데몬 종료
4. `waiaas start` → 패스워드 "wrong456" 입력 → 데몬 정상 시작됨
5. 기존 월렛으로 트랜잭션 시도 → `INVALID_MASTER_PASSWORD` 에러

## 수정 방안: 키스토어 검증 + DB 해시 저장 (A+B 조합)

시작 시 3단계 분기로 패스워드를 검증:

```
시작 시 패스워드 입력
    │
    ▼
DB에 master_password_hash 존재?
    │
    ├─ YES → DB 해시로 검증
    │         ├─ 성공 → 데몬 시작
    │         └─ 실패 → "Invalid master password" + 종료
    │
    └─ NO (기존 사용자 또는 최초 설치)
          │
          ▼
        키스토어 파일 존재?
          │
          ├─ YES → 첫 번째 키스토어 파일로 복호화 시도 (1회성 마이그레이션)
          │         ├─ 성공 → 해시를 DB에 저장 → 데몬 시작
          │         └─ 실패 → "Invalid master password" + 종료
          │
          └─ NO → 최초 설치 → 해시를 DB에 저장 → 데몬 시작
```

### 구현 상세

```typescript
// daemon.ts Step 4c 이후 추가

// 1. DB에서 기존 해시 조회
const storedHash = db.select().from(keyValueStore)
  .where(eq(keyValueStore.key, 'master_password_hash')).get();

if (storedHash) {
  // 2a. DB 해시 존재 → 검증
  const isValid = await argon2.verify(storedHash.value, masterPassword);
  if (!isValid) {
    console.error('Invalid master password.');
    process.exit(1);
  }
} else {
  // 2b. DB 해시 없음 → 키스토어로 검증 또는 최초 설치
  const keystoreFiles = readdirSync(join(dataDir, 'keystore'))
    .filter(f => f.endsWith('.json'));

  if (keystoreFiles.length > 0) {
    // 기존 사용자: 키스토어 복호화로 검증
    try {
      const walletId = keystoreFiles[0].replace('.json', '');
      await keyStore.decryptPrivateKey(walletId, masterPassword);
    } catch {
      console.error('Invalid master password. Cannot decrypt existing wallets.');
      process.exit(1);
    }
  }

  // 검증 성공 또는 최초 설치 → 해시를 DB에 저장
  const hash = await argon2.hash(masterPassword, { type: argon2.argon2id, ... });
  db.insert(keyValueStore).values({
    key: 'master_password_hash',
    value: hash,
    updatedAt: new Date(),
  }).onConflictDoNothing().run();
}
```

### 기존 사용자 마이그레이션 경로

| 시나리오 | 동작 |
|----------|------|
| 최초 설치 (키스토어 없음) | 입력 패스워드 해시를 DB에 저장. 이후 시작부터 DB 해시로 검증 |
| 기존 사용자 첫 업그레이드 (키스토어 있음, DB 해시 없음) | 키스토어 복호화로 패스워드 검증 → 성공 시 해시를 DB에 저장 (1회성) |
| 이후 시작 (DB 해시 있음) | DB 해시로 빠르게 검증 (키스토어 복호화 불필요) |

## 테스트 항목

### 단위 테스트

| # | 테스트 | 검증 내용 |
|---|--------|-----------|
| 1 | 최초 시작 — DB 해시 저장 | 키스토어 없음 + DB 해시 없음 → 시작 성공 + DB에 `master_password_hash` 저장 확인 |
| 2 | DB 해시 존재 — 올바른 패스워드 | DB 해시 일치 → 시작 성공 |
| 3 | DB 해시 존재 — 잘못된 패스워드 | DB 해시 불일치 → process.exit(1) 호출 확인 |
| 4 | 기존 사용자 마이그레이션 — 올바른 패스워드 | 키스토어 있음 + DB 해시 없음 → 복호화 성공 → DB에 해시 저장 |
| 5 | 기존 사용자 마이그레이션 — 잘못된 패스워드 | 키스토어 있음 + DB 해시 없음 → 복호화 실패 → process.exit(1) |
| 6 | 마이그레이션 후 재시작 | 마이그레이션 완료 후 → DB 해시로 검증 경로 전환 확인 |

### 통합/E2E 테스트

| # | 테스트 | 검증 내용 |
|---|--------|-----------|
| 7 | 잘못된 패스워드로 시작 시 트랜잭션 차단 | 기존: 시작 성공 + 서명 시점 실패 → 수정 후: 시작 자체가 실패 |
| 8 | 패스워드 변경 불가 확인 | 정상 시작 후 다른 패스워드로 재시작 → 시작 거부 확인 |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4c 이후 3단계 패스워드 검증 + DB 해시 저장 로직 추가 |
| `packages/cli/src/commands/start.ts` | 검증 실패 시 에러 메시지 + 재입력 안내 |
| `packages/daemon/src/__tests__/master-password-validation.test.ts` | 신규 — 6개 단위 테스트 |
| `packages/daemon/src/__tests__/lifecycle.test.ts` | 기존 라이프사이클 테스트에 패스워드 검증 케이스 추가 |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `packages/daemon/src/infrastructure/keystore/crypto.ts` | AES-256-GCM 암호화/복호화 + Argon2id KDF |
| `packages/daemon/src/infrastructure/keystore/keystore.ts` | 키스토어 파일 관리 (generate/decrypt) |
| `packages/daemon/src/api/middleware/master-auth.ts` | API 요청 시 X-Master-Password 검증 |
| `packages/cli/src/utils/password.ts` | CLI 패스워드 입력 유틸리티 |
