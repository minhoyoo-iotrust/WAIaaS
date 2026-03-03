---
phase: "306"
title: "Encrypted Backup & Restore 통합 설계 스펙"
type: design-spec
requirements: [BKUP-01, BKUP-02, BKUP-03, BKUP-04]
---

# Phase 306: Encrypted Backup & Restore 통합 설계 스펙

## 1. 개요

마스터 비밀번호 기반 AES-256-GCM 암호화 백업/복원을 설계한다. 기존 `BackupService`(비암호화 파일 복사, 업그레이드 롤백 전용)와 분리된 `EncryptedBackupService`를 신규 정의하고, 독립 CLI 커맨드(`waiaas backup` / `waiaas restore`)와 config.toml `[backup]` 섹션을 제공한다.

### 1.1 설계 범위

| 영역 | 내용 |
|------|------|
| 아카이브 포맷 | 단일 `.waiaas-backup` 바이너리 파일 (헤더 + 평문 메타데이터 + AES-256-GCM 암호문) |
| 암호화 | Argon2id KDF (기존 keystore와 동일 파라미터) + AES-256-GCM |
| DB 스냅샷 | VACUUM INTO 원자적 스냅샷 (WAL 통합, 데몬 실행 중 가능) |
| 포함 파일 | DB + config.toml + keystore/*.json |
| CLI | backup (create/list/inspect), restore |
| 설정 | config.toml `[backup]` 섹션 (dir, interval, retention_count) |
| 자동 백업 | BackupWorker (setInterval 기반, BackgroundWorkers 통합) |
| REST API | POST /v1/admin/backup, GET /v1/admin/backups |

### 1.2 비범위

- 원격 스토리지 연동 (S3, GCS 등)
- 증분 백업 (항상 전체 백업)
- 스트리밍 암호화 (DB 크기가 수~수십 MB로 메모리 충분)

---

## 2. 아카이브 바이너리 포맷

### 2.1 바이너리 레이아웃

```
Offset   Size      Field                  Description
──────   ────      ─────                  ───────────
0x0000   8B        Magic Number           "WAIAAS\x00\x01"
0x0008   2B        Format Version         uint16 LE (0x0001)
0x000A   2B        Reserved               0x0000
0x000C   4B        Metadata Length         uint32 LE
0x0010   16B       KDF Salt               Argon2id 솔트 (CSPRNG 128비트)
0x0020   12B       AES-GCM Nonce          96비트 논스
0x002C   16B       AES-GCM Auth Tag       128비트 인증 태그
0x003C   NB        Metadata (JSON)        평문 메타데이터
0x003C+N MB        Encrypted Payload      AES-256-GCM 암호문
```

고정 헤더: 60바이트 (0x3C).

### 2.2 Magic Number

```
0x57 0x41 0x49 0x41 0x41 0x53 0x00 0x01
 W    A    I    A    A    S   \0   \x01
```

### 2.3 메타데이터 (평문 JSON)

```json
{
  "created_at": "2026-03-03T14:30:22.000Z",
  "daemon_version": "2.9.0",
  "schema_version": 33,
  "kdf": "argon2id",
  "kdf_params": {
    "memory_cost": 65536,
    "time_cost": 3,
    "parallelism": 4,
    "hash_length": 32
  },
  "contents": {
    "database": { "name": "waiaas.db", "size": 2457600 },
    "config": { "name": "config.toml", "size": 1024 },
    "keystore_files": [
      { "name": "wallet-abc.json", "size": 512 }
    ]
  },
  "checksum": "sha256:a1b2c3d4..."
}
```

평문 저장 이유: 복호화 없이 백업 목록/정보 조회 가능.

### 2.4 암호화 페이로드 내부 구조

평문 페이로드는 entry 연결 형식:

```
[Entry 1][Entry 2]...[Entry N]

Entry: [nameLen:uint16 LE][name:UTF-8][dataLen:uint64 LE][data:bytes]
```

포함 파일:
1. `waiaas.db` (VACUUM INTO 스냅샷, 필수)
2. `config.toml` (존재 시)
3. `keystore/<wallet-id>.json` (0개 이상)

---

## 3. EncryptedBackupService

### 3.1 클래스 구조

```
packages/daemon/src/infrastructure/backup/
  backup-service.ts            -- 기존 (비암호화, 업그레이드 롤백 전용)
  encrypted-backup-service.ts  -- 신규 (암호화 백업/복원)
  backup-format.ts             -- 신규 (아카이브 포맷 읽기/쓰기 유틸)
  index.ts                     -- export 추가
```

### 3.2 인터페이스

```typescript
class EncryptedBackupService {
  constructor(dataDir: string, backupsDir: string, db: DatabaseType);

  async createBackup(masterPassword: string): Promise<string>;
  async restore(archivePath: string, masterPassword: string): Promise<void>;
  listBackups(): BackupInfo[];
  pruneBackups(keep?: number): number;
  inspectBackup(archivePath: string): BackupMetadata;
}
```

### 3.3 암호화 파라미터 (keystore 재사용)

| 파라미터 | 값 | 출처 |
|---------|-----|------|
| KDF | Argon2id | crypto.ts KDF_PARAMS |
| memoryCost | 65536 (64 MiB) | keystore와 동일 |
| timeCost | 3 | keystore와 동일 |
| parallelism | 4 | keystore와 동일 |
| hashLength | 32 (256비트) | AES-256 키 |
| 암호화 | AES-256-GCM | Node.js crypto |
| IV | 12바이트 | CSPRNG |
| Salt | 16바이트 | CSPRNG |
| Auth Tag | 16바이트 | GCM |

### 3.4 VACUUM INTO

```typescript
const snapPath = join(tmpDir, `waiaas-snap-${uuid}.db`);
db.exec(`VACUUM INTO '${snapPath}'`);
```

- SQLite 3.27.0+ 지원
- 원본 DB 무중단 (읽기 잠금만)
- WAL 통합된 단일 자기완결적 DB 파일 생성
- 데몬 실행 중 안전 호출 가능

---

## 4. CLI 커맨드

### 4.1 커맨드 매트릭스

| 커맨드 | 설명 | 데몬 상태 | 인증 |
|--------|------|----------|------|
| `waiaas backup` | 암호화 백업 생성 | 실행 중 필수 | 마스터 비밀번호 |
| `waiaas backup list` | 목록 조회 | 무관 | 불필요 |
| `waiaas backup inspect <path>` | 상세 조회 | 무관 | 불필요 |
| `waiaas restore --from <path>` | 복원 | 정지 필수 | 마스터 비밀번호 |

### 4.2 안전 장치

| 장치 | 적용 커맨드 | 설명 |
|------|------------|------|
| 데몬 실행 확인 | backup | VACUUM INTO가 DB 커넥션 필요 |
| 데몬 정지 확인 | restore | 파일 경합 방지 |
| 확인 프롬프트 | restore | 기존 데이터 교체 경고 (--force로 건너뛰기) |
| 기존 데이터 보존 | restore | data/ -> data.bak-{ts}/, keystore/ -> keystore.bak-{ts}/ |
| 비밀번호 사전 검증 | backup | 데몬 API로 검증 후 백업 시도 |
| DB 무결성 검증 | restore | PRAGMA integrity_check |
| 자동 롤백 | restore | 실패 시 .bak에서 원본 복구 |

### 4.3 실행 방식

- **backup**: CLI -> REST API (`POST /v1/admin/backup`) -> 데몬 내 EncryptedBackupService
- **restore**: CLI가 직접 EncryptedBackupService 실행 (데몬 미실행)

---

## 5. config.toml [backup] 섹션

### 5.1 키 정의

```toml
[backup]
dir = "backups"           # 백업 저장 디렉토리 (기본: {dataDir}/backups/)
interval = 0              # 자동 백업 간격(초), 0=비활성 (기본: 0)
retention_count = 7       # 보존 최대 백업 수 (기본: 7)
```

### 5.2 Zod 스키마

```typescript
backup: z.object({
  dir: z.string().default('backups'),
  interval: z.number().int().min(0).max(604800).default(0),
  retention_count: z.number().int().min(1).max(100).default(7),
}).default({}),
```

### 5.3 환경변수

| 키 | 환경변수 |
|----|---------|
| dir | `WAIAAS_BACKUP_DIR` |
| interval | `WAIAAS_BACKUP_INTERVAL` |
| retention_count | `WAIAAS_BACKUP_RETENTION_COUNT` |

---

## 6. REST API

### 6.1 POST /v1/admin/backup

```
Authorization: X-Master-Password
Response 200: { path, size, created_at, daemon_version, schema_version, file_count }
```

### 6.2 GET /v1/admin/backups

```
Authorization: X-Master-Password
Response 200: { backups: BackupInfo[], total, retention_count }
```

---

## 7. 자동 백업 스케줄러

BackupWorker를 BackgroundWorkers에 등록. `backup.interval > 0`일 때 활성화.

데몬 라이프사이클 통합:
- 시작: Workers 단계에서 BackupWorker.start()
- 종료: workers.stopAll()에서 BackupWorker.stop()

마스터 비밀번호: 데몬 시작 시 메모리에 보유 (기존 keystore unlock과 동일 패턴).

---

## 8. 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| INVALID_BACKUP_FORMAT | 400 | 매직 넘버 불일치 |
| UNSUPPORTED_BACKUP_VERSION | 400 | 지원하지 않는 포맷 버전 |
| BACKUP_CORRUPTED | 400 | SHA-256 체크섬 불일치 |
| BACKUP_NOT_FOUND | 404 | 백업 파일 미존재 |
| DAEMON_RUNNING | 409 | 복원 시 데몬 실행 중 |
| RESTORE_FAILED | 500 | 복원 중 에러 (자동 롤백) |
| INVALID_MASTER_PASSWORD | 401 | 비밀번호 오류 (기존 재사용) |

---

## 9. 설계 문서 갱신 매핑

| 문서 | 변경 영역 |
|------|----------|
| doc 24 (monorepo) | backups/ 디렉토리 트리 + 파일 목록 + config.toml [backup] 섹션 추가 |
| doc 26 (keystore) | 백업 시 키스토어 포함 범위 + 이중 암호화 설명 |
| doc 28 (daemon) | BackupWorker 서비스 컴포넌트 + 시작/종료 통합 |
| doc 54 (cli) | backup/restore 커맨드 추가 + 옵션 + 플로우 |

---

## 10. 테스트 시나리오 통합

### 기능 테스트

| # | 시나리오 | 타입 |
|---|---------|------|
| T-01 | 아카이브 파일 생성 + 매직 넘버/버전/메타데이터 검증 | Unit |
| T-02 | 백업 -> 복원 라운드트립 (DB/config/keystore 바이트 일치) | Integration |
| T-03 | 잘못된 비밀번호 -> INVALID_MASTER_PASSWORD | Unit |
| T-04 | 변조된 아카이브 -> BACKUP_CORRUPTED | Unit |
| T-05 | VACUUM INTO 원자성 (쓰기 중 백업) | Integration |
| T-06 | 보존 정책 (pruneBackups) | Unit |
| T-07 | 매직 넘버 불일치 -> INVALID_BACKUP_FORMAT | Unit |
| T-08 | 복원 실패 시 .bak 자동 롤백 | Integration |
| T-09 | inspectBackup (복호화 없이 메타데이터 조회) | Unit |
| T-10 | 빈 키스토어 (파일 0개) 백업/복원 | Unit |
| T-11 | config.toml [backup] 파싱 + 기본값 | Unit |
| T-12 | 환경변수 오버라이드 (WAIAAS_BACKUP_*) | Unit |
| T-13 | 자동 백업 스케줄러 실행 | Integration |

### 보안 테스트

| # | 시나리오 | 검증 내용 |
|---|---------|----------|
| S-01 | 백업 파일 탈취 | 마스터 비밀번호 없이 복호화 불가 |
| S-02 | 백업 파일 변조 | AEAD 인증 실패로 복원 거부 |
| S-03 | 키 메모리 안전 | AES 키 사용 후 즉시 fill(0) |

---

## 11. 설계 결정 요약

| # | 결정 | 근거 |
|---|------|------|
| D-01 | 별도 EncryptedBackupService | 기존 BackupService는 업그레이드 롤백 전용, 용도 분리 |
| D-02 | 메타데이터 평문 | 복호화 없이 목록/정보 조회 가능 |
| D-03 | 단일 파일 아카이브 | 이동 편의 + 원자성 |
| D-04 | VACUUM INTO | WAL 통합 원자적 스냅샷, 데몬 실행 중 가능 |
| D-05 | KDF 파라미터 재사용 | keystore와 동일한 보안 수준 유지 |
| D-06 | 키스토어 전체 포함 | DB-keystore 일치성 보장 |
| D-07 | tar 미사용 | 파일 3~5개, 의존성 최소화 |
| D-08 | backup = 데몬 API | VACUUM INTO가 DB 커넥션 필요 |
| D-09 | restore = CLI 직접 | 데몬 미실행 상태에서 수행 |
| D-10 | [backup] 3개 평탄 키 | 최소 충분 + YAGNI |
| D-11 | interval 기본 0 | 개인 데몬에서 자동 백업은 선택적 |
| D-12 | retention_count 기본 7 | 일주일분 일일 백업 보존 |

---

## 12. 요구사항 충족 매핑

| 요구사항 | 충족 섹션 | 상태 |
|---------|----------|------|
| BKUP-01 | 섹션 2 (아카이브 바이너리 포맷) | 완료 |
| BKUP-02 | 섹션 3 (EncryptedBackupService) | 완료 |
| BKUP-03 | 섹션 4 (CLI 커맨드) + 섹션 4.2 (안전 장치) | 완료 |
| BKUP-04 | 섹션 5 (config.toml [backup] 섹션) | 완료 |
