---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/daemon/src/lifecycle/daemon.ts
  - packages/daemon/src/__tests__/master-password-validation.test.ts
autonomous: true
requirements: [ISSUE-090]

must_haves:
  truths:
    - "잘못된 패스워드로 데몬 시작 시 즉시 실패하고 process.exit(1) 호출"
    - "올바른 패스워드로 데몬 시작 시 정상 진행"
    - "최초 설치(키스토어 없음, DB 해시 없음)시 해시가 DB에 저장됨"
    - "기존 사용자 업그레이드(키스토어 있음, DB 해시 없음)시 키스토어 복호화로 검증 후 해시 DB 저장"
    - "마이그레이션 이후 재시작시 DB 해시로 검증 경로 전환"
  artifacts:
    - path: "packages/daemon/src/lifecycle/daemon.ts"
      provides: "3단계 패스워드 검증 로직 (DB 해시 → 키스토어 복호화 → 최초 저장)"
      contains: "master_password_hash"
    - path: "packages/daemon/src/__tests__/master-password-validation.test.ts"
      provides: "6개 단위 테스트"
      min_lines: 80
  key_links:
    - from: "packages/daemon/src/lifecycle/daemon.ts"
      to: "key_value_store"
      via: "drizzle select/insert on 'master_password_hash' key"
      pattern: "master_password_hash"
    - from: "packages/daemon/src/lifecycle/daemon.ts"
      to: "packages/daemon/src/infrastructure/keystore/keystore.ts"
      via: "decryptPrivateKey for migration validation"
      pattern: "decryptPrivateKey"
---

<objective>
Issue 090 수정: 데몬 시작 시 마스터 패스워드 검증을 추가하여, 잘못된 패스워드로 시작해도 데몬이 가동되는 버그를 해결한다.

Purpose: 현재 잘못된 패스워드로 데몬이 시작되면 모든 트랜잭션이 서명 시점에서 실패하여 사용자에게 혼란을 줌. 시작 시점에 검증하여 즉시 실패하도록 변경.
Output: 패스워드 검증 로직이 추가된 daemon.ts + 6개 단위 테스트
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/daemon/src/lifecycle/daemon.ts
@packages/daemon/src/infrastructure/keystore/keystore.ts
@packages/daemon/src/infrastructure/keystore/crypto.ts
@packages/daemon/src/infrastructure/database/schema.ts (keyValueStore table: key/value/updatedAt)
@packages/daemon/src/__tests__/lifecycle.test.ts
@internal/objectives/issues/090-master-password-not-validated-on-start.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: daemon.ts Step 2 이후에 3단계 마스터 패스워드 검증 로직 추가</name>
  <files>packages/daemon/src/lifecycle/daemon.ts</files>
  <action>
daemon.ts의 `_startInternal` 메서드에서 Step 2 (Database initialization) 완료 직후, Step 3 (Keystore unlock) 시작 전에 마스터 패스워드 검증 단계를 삽입한다. DB와 keystore 디렉토리 모두 필요하므로 Step 2 이후가 적절하다.

**추가할 import:**
- `readdirSync`를 기존 `node:fs` import에 추가 (현재: `writeFileSync, unlinkSync, existsSync, mkdirSync`)
- `eq`를 `drizzle-orm`에서 import
- `keyValueStore`를 `../infrastructure/database/schema.js`에서 import
- `decrypt`를 `../infrastructure/keystore/crypto.js`에서 import

**Step 2 이후, Step 3 이전에 "Step 2b: Master password validation" 블록 삽입:**

```typescript
// Step 2b: Master password validation (fail-fast)
await withTimeout(
  (async () => {
    const existingHash = this._db!
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();

    if (existingHash) {
      // Path A: DB hash exists -> verify against stored hash
      const isValid = await argon2.verify(existingHash.value, masterPassword);
      if (!isValid) {
        console.error('Invalid master password.');
        process.exit(1);
      }
      console.log('Step 2b: Master password verified (DB hash)');
    } else {
      // Path B: No DB hash -> check for existing keystore files
      const keystoreDir = join(dataDir, 'keystore');
      const keystoreFiles = existsSync(keystoreDir)
        ? readdirSync(keystoreDir).filter(f => f.endsWith('.json'))
        : [];

      if (keystoreFiles.length > 0) {
        // Existing user migration: validate by decrypting first keystore
        const walletId = keystoreFiles[0].replace('.json', '');
        const keystorePath = join(keystoreDir, keystoreFiles[0]);
        const content = readFileSync(keystorePath, 'utf-8');
        const parsed = JSON.parse(content);
        const encrypted = {
          iv: Buffer.from(parsed.crypto.cipherparams.iv, 'hex'),
          ciphertext: Buffer.from(parsed.crypto.ciphertext, 'hex'),
          authTag: Buffer.from(parsed.crypto.authTag, 'hex'),
          salt: Buffer.from(parsed.crypto.kdfparams.salt, 'hex'),
          kdfparams: parsed.crypto.kdfparams,
        };
        try {
          const plain = await decrypt(encrypted, masterPassword);
          plain.fill(0); // zero immediately
        } catch {
          console.error('Invalid master password. Cannot decrypt existing wallets.');
          process.exit(1);
        }
        console.log('Step 2b: Master password verified (keystore migration)');
      } else {
        console.log('Step 2b: First install, no password validation needed');
      }

      // Store hash in DB for future startups
      const hash = await argon2.hash(masterPassword, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      this._db!
        .insert(keyValueStore)
        .values({
          key: 'master_password_hash',
          value: hash,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .run();
    }
  })(),
  30_000,
  'STEP2B_PASSWORD_VALIDATION',
);
```

**추가 import 필요:** `readFileSync`도 `node:fs` import에 추가 (키스토어 파일 직접 읽기용 -- LocalKeyStore 인스턴스는 Step 3에서 생성되므로 Step 2b에서는 직접 파일을 읽어야 함).

**중요:** Step 4c의 기존 `this.masterPasswordHash = await argon2.hash(...)` 로직은 그대로 유지. 이것은 API 요청의 X-Master-Password 헤더 검증용 in-memory 해시이고, Step 2b에서 저장하는 DB 해시와는 별개의 용도이며 Argon2 파라미터도 다름.
  </action>
  <verify>
`pnpm turbo run typecheck --filter=@waiaas/daemon` 통과. `pnpm turbo run build --filter=@waiaas/daemon` 성공.
  </verify>
  <done>
daemon.ts에 Step 2b 패스워드 검증 블록이 존재하고, 3가지 분기(DB 해시 검증 / 키스토어 마이그레이션 / 최초 설치)가 모두 구현됨. 빌드 및 타입체크 통과.
  </done>
</task>

<task type="auto">
  <name>Task 2: 마스터 패스워드 검증 단위 테스트 6개 작성</name>
  <files>packages/daemon/src/__tests__/master-password-validation.test.ts</files>
  <action>
이슈 090에 정의된 6개 테스트 케이스를 구현한다. 테스트는 실제 DB와 keystore를 temp 디렉토리에 생성하여 검증한다.

**테스트 구조:**
- `vitest`의 `describe`, `it`, `expect`, `vi` 사용
- 각 테스트 전 임시 디렉토리 + SQLite DB + keyValueStore 테이블 생성
- `afterAll`에서 임시 디렉토리 정리
- `process.exit` 호출은 `vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); })` 패턴으로 검증

**핵심: DaemonLifecycle.start()를 직접 호출하지 않는다** (HTTP 서버, 워커 등 전체 스택이 필요하므로). 대신 Step 2b의 검증 로직을 테스트 가능한 함수로 추출하거나, 검증 로직의 핵심 동작을 직접 재현하여 테스트한다.

**접근법: DB + 키스토어 + argon2를 직접 사용하여 검증 로직의 동작을 테스트:**

1. **최초 시작 -- DB 해시 저장**: 빈 DB + 키스토어 없음 → argon2.hash 호출 후 keyValueStore에 `master_password_hash` insert → DB에서 조회하여 존재 확인
2. **DB 해시 존재 -- 올바른 패스워드**: DB에 미리 해시 저장 → argon2.verify(storedHash, correctPassword) === true 확인
3. **DB 해시 존재 -- 잘못된 패스워드**: DB에 미리 해시 저장 → argon2.verify(storedHash, wrongPassword) === false 확인
4. **기존 사용자 마이그레이션 -- 올바른 패스워드**: keystore 파일 생성(encrypt로 암호화) + DB 해시 없음 → decrypt 성공 확인
5. **기존 사용자 마이그레이션 -- 잘못된 패스워드**: keystore 파일 생성 + DB 해시 없음 → decrypt 실패 (INVALID_MASTER_PASSWORD 에러) 확인
6. **마이그레이션 후 재시작**: 마이그레이션 후 DB에 해시가 저장되었으므로 → argon2.verify로 검증 경로 전환 확인

테스트에서 `createDatabase`, `pushSchema` (from `../infrastructure/database/index.js`), `keyValueStore` (from schema), `argon2`, `encrypt`/`decrypt` (from `../infrastructure/keystore/crypto.js`)를 직접 import하여 사용.

각 테스트는 독립적인 temp 디렉토리를 사용하고, 실제 Argon2id KDF + AES-256-GCM 암/복호화를 수행한다.
  </action>
  <verify>
`pnpm vitest run packages/daemon/src/__tests__/master-password-validation.test.ts` -- 6개 테스트 모두 통과.
  </verify>
  <done>
6개 단위 테스트가 모두 green이며, 최초 설치/DB 해시 검증(성공+실패)/키스토어 마이그레이션(성공+실패)/마이그레이션 후 재시작 시나리오를 모두 커버.
  </done>
</task>

</tasks>

<verification>
1. `pnpm turbo run typecheck --filter=@waiaas/daemon` -- 타입 에러 없음
2. `pnpm turbo run build --filter=@waiaas/daemon` -- 빌드 성공
3. `pnpm vitest run packages/daemon/src/__tests__/master-password-validation.test.ts` -- 6/6 통과
4. `pnpm vitest run packages/daemon/src/__tests__/lifecycle.test.ts` -- 기존 테스트 깨지지 않음
</verification>

<success_criteria>
- 잘못된 패스워드로 데몬 시작 시 Step 2b에서 즉시 process.exit(1) (서명 시점까지 가지 않음)
- 올바른 패스워드로 정상 시작 가능
- 최초 설치 시 DB에 master_password_hash가 자동 저장됨
- 기존 사용자 업그레이드 시 첫 번째 키스토어 파일로 1회성 검증 후 DB에 해시 저장
- 이후 시작부터 DB 해시로 빠르게 검증 (키스토어 복호화 불필요)
- 신규 테스트 6개 통과, 기존 테스트 깨지지 않음
</success_criteria>

<output>
After completion, create `.planning/quick/1-issue-090/1-SUMMARY.md`
</output>
