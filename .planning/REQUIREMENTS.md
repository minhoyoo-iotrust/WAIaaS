# Requirements: WAIaaS

**Defined:** 2026-02-17
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.8 Requirements

v1.8 업그레이드 + 배포 인프라. 설치된 WAIaaS가 새 버전을 감지/알림/업그레이드하고, release-please 2-게이트 모델로 안전하게 배포한다.

### Version Check (버전 체크)

- [ ] **VCHK-01**: 데몬 시작 시 npm registry에서 최신 버전을 조회하여 key_value_store에 저장한다
- [ ] **VCHK-02**: registry 조회 실패 시 데몬이 정상 시작된다 (fail-soft)
- [ ] **VCHK-03**: `update_check = false` 설정 시 버전 조회를 수행하지 않는다
- [ ] **VCHK-04**: BackgroundWorkers에 runImmediately 옵션을 추가하여 즉시 실행 후 interval 반복을 지원한다
- [ ] **VCHK-05**: CLI 실행 시 새 버전이 있으면 stderr에 업그레이드 알림을 출력한다
- [ ] **VCHK-06**: 24시간 내 재실행 시 알림이 중복 출력되지 않는다
- [ ] **VCHK-07**: `--quiet` 플래그 또는 `WAIAAS_NO_UPDATE_NOTIFY=1` 환경변수로 알림을 억제할 수 있다

### Upgrade (CLI 업그레이드)

- [ ] **UPGR-01**: `waiaas upgrade --check`로 업그레이드 가능 여부를 확인할 수 있다
- [ ] **UPGR-02**: `waiaas upgrade`로 7단계 시퀀스(확인→중지→백업→업데이트→마이그레이션→검증→재시작)를 실행한다
- [ ] **UPGR-03**: 업그레이드 전 DB + config.toml을 `{dataDir}/backups/pre-upgrade-{version}-{timestamp}/`에 자동 백업한다
- [ ] **UPGR-04**: `waiaas upgrade --rollback`으로 직전 백업에서 복원할 수 있다
- [ ] **UPGR-05**: 이미 최신 버전이면 "Already up to date" 메시지를 출력하고 npm을 호출하지 않는다
- [ ] **UPGR-06**: 백업 디렉토리를 최근 5개까지만 보존하고 초과분을 자동 삭제한다
- [ ] **UPGR-07**: `waiaas upgrade --to {version}`으로 특정 버전을 지정하여 업그레이드할 수 있다

### Health + Compatibility (호환성)

- [ ] **HLTH-01**: `GET /health` 응답에 latestVersion, updateAvailable, schemaVersion 필드를 추가한다
- [ ] **HLTH-02**: 버전 체크 미실행 시 latestVersion = null, updateAvailable = false를 반환한다
- [ ] **CMPT-01**: 코드 버전 > DB 스키마 버전이면 자동 마이그레이션 후 정상 시작한다
- [ ] **CMPT-02**: 코드 버전 < DB 스키마 버전이면 시작을 거부하고 upgrade 안내 메시지를 출력한다
- [ ] **CMPT-03**: DB 스키마 버전이 MIN_COMPATIBLE_SCHEMA_VERSION 미만이면 시작을 거부하고 단계별 업그레이드를 안내한다

### Docker (Docker 업그레이드)

- [ ] **DOCK-01**: Dockerfile에 Watchtower 호환 라벨을 추가한다
- [ ] **DOCK-02**: Docker 이미지를 3-tier 태깅(latest/semver/major)한다

### Release (릴리스 자동화)

- [ ] **RLSE-01**: release-please 설정 파일(.release-please-manifest.json, release-please-config.json)을 생성한다
- [ ] **RLSE-02**: feat: 커밋 머지 시 release-please가 Release PR을 자동 생성한다
- [ ] **RLSE-03**: Release PR 머지(게이트 1) 시 CHANGELOG.md가 갱신되고 GitHub Release + 태그가 자동 생성된다
- [ ] **RLSE-04**: GitHub Release published 시 release.yml 품질 게이트가 자동 트리거된다
- [ ] **RLSE-05**: 품질 게이트 통과 후 deploy job이 environment: production으로 대기한다(게이트 2)
- [ ] **RLSE-06**: 배포 승인 후 npm publish + Docker push를 실행한다 (v2.0 전까지 dry-run)
- [ ] **RLSE-07**: BREAKING CHANGE 커밋 시 major 버전이 범프된다
- [ ] **RLSE-08**: tag-release.sh를 폐기하고 CLAUDE.md 규칙을 갱신한다

### Interface Sync (인터페이스 동기화)

- [ ] **SYNC-01**: HealthResponseSchema 변경에 따라 SDK 타입, MCP 응답, 스킬 파일을 동기화한다

## Future Requirements

### Desktop Auto-Update (v2.6.1로 이연)

- **DESK-01**: Tauri Auto Updater로 Desktop 앱 자동 업데이트
- **DESK-02**: 서명 키 관리 + 업데이트 서버 연동

### Package Independent Release (v2.0 검토)

- **PKGR-01**: 모노레포 패키지별 독립 버전 릴리스

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tauri Desktop 자동 업데이트 | Desktop App 자체가 v2.6.1로 이연 |
| 패키지별 독립 버전 관리 | v2.0에서 검토. 초기에는 단일 버전으로 복잡도 최소화 |
| 실제 npm publish + Docker push | v2.0 전까지 dry-run. 게이트 2에서 대기 |
| commitlint CI 검증 | 추후 검토. 최소한 PR 제목 type prefix 강제로 시작 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v1.8 requirements: 30 total
- Mapped to phases: 0
- Unmapped: 30

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after initial definition*
