---
phase: 161-cli-upgrade
plan: 02
subsystem: infra
tags: [backup, restore, sqlite, fs, upgrade]

requires:
  - phase: 160-version-check
    provides: VersionCheckService (백업 시점의 버전 정보 제공)
provides:
  - BackupService 클래스 (createBackup, restore, restoreLatest, listBackups, pruneBackups)
  - barrel export (packages/daemon/src/infrastructure/backup/index.ts)
affects: [161-03 (UpgradeService에서 BackupService 사용), 162 (Docker 백업 통합)]

tech-stack:
  added: []
  patterns: [fs.copyFileSync 기반 파일 백업, timestamp 정렬 기반 보존 정책]

key-files:
  created:
    - packages/daemon/src/infrastructure/backup/backup-service.ts
    - packages/daemon/src/infrastructure/backup/index.ts
    - packages/daemon/src/__tests__/backup-service.test.ts
  modified: []

key-decisions:
  - "copyFileSync로 개별 파일 복사 (cpSync 디렉토리 복사 대신 명시적 파일 단위)"
  - "DB 파일 없으면 에러 throw + 백업 디렉토리 정리 (빈 디렉토리 방지)"
  - "timestamp 포맷을 로컬 시간 기반 YYYYMMDDHHmmss로 사전순=시간순 보장"

patterns-established:
  - "BackupService 패턴: dataDir 기반 상대 경로로 백업/복원 대상 결정"
  - "보존 정책 패턴: listBackups 이름순 정렬 → keep개 초과 삭제"

requirements-completed: [UPGR-03, UPGR-04, UPGR-06]

duration: 2min
completed: 2026-02-17
---

# Phase 161 Plan 02: BackupService Summary

**DB + config.toml 자동 백업/복원 서비스 with 5개 보존 정책 (pre-upgrade-{version}-{timestamp}/ 디렉토리 구조)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T00:31:07Z
- **Completed:** 2026-02-17T00:33:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- BackupService 클래스 구현: createBackup, restoreLatest, restore, listBackups, pruneBackups 5개 메서드
- DB + WAL/SHM + config.toml 파일 백업/복원 (config.toml은 선택적)
- 5개 초과 백업 자동 삭제 보존 정책
- 15개 단위 테스트 통과 (실제 파일시스템 tmpdir 기반)

## Task Commits

Each task was committed atomically:

1. **Task 1: BackupService 구현 + barrel export** - `b0b011c` (feat)
2. **Task 2: BackupService 단위 테스트** - `87c50ea` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/backup/backup-service.ts` - BackupService 클래스 (createBackup, restore, listBackups, pruneBackups)
- `packages/daemon/src/infrastructure/backup/index.ts` - Barrel export
- `packages/daemon/src/__tests__/backup-service.test.ts` - 15개 단위 테스트 (createBackup 5, restoreLatest 2, restore 3, listBackups 2, pruneBackups 3)

## Decisions Made
- copyFileSync로 개별 파일 복사 (cpSync 디렉토리 복사 대신 명시적 파일 단위로 어떤 파일이 백업되는지 명확하게)
- DB 파일 없으면 에러 throw + 빈 백업 디렉토리 정리 (불완전한 백업 방지)
- timestamp 포맷을 로컬 시간 기반 YYYYMMDDHHmmss로 사전순 = 시간순 보장

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict null check 수정**
- **Found during:** Task 1 (BackupService 구현)
- **Issue:** `backups[0]`이 `string | undefined` 타입으로 추론되어 tsc 에러 발생
- **Fix:** Non-null assertion (`backups[0]!`) 추가 (앞에서 length === 0 체크로 안전)
- **Files modified:** packages/daemon/src/infrastructure/backup/backup-service.ts
- **Verification:** `npx tsc --noEmit` 통과
- **Committed in:** b0b011c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript strict mode 호환을 위한 필수 수정. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BackupService가 barrel export되어 161-03 UpgradeService에서 import 가능
- createBackup/restoreLatest가 CLI upgrade --rollback 구현에 필요한 인프라 제공
- 보존 정책(pruneBackups)이 디스크 공간 관리 자동화

## Self-Check: PASSED

- All 3 created files verified on disk
- All 2 commit hashes verified in git log

---
*Phase: 161-cli-upgrade*
*Completed: 2026-02-17*
