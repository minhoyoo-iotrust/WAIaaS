# Roadmap: WAIaaS v1.8 업그레이드 + 배포 인프라

## Overview

설치된 WAIaaS가 새 버전 출시를 자동 감지하여 사용자에게 알리고, `waiaas upgrade`로 안전하게 업그레이드할 수 있는 상태를 달성한다. npm/Docker 2개 채널 업그레이드 경로가 동작하며, DB 호환성 매트릭스가 자동 마이그레이션/시작 거부를 판별한다. release-please 기반 2-게이트 릴리스 모델로 CHANGELOG 자동 생성과 배포 안전성을 확보한다.

## Phases

- [x] **Phase 160: 버전 체크 인프라** - VersionCheckService + BackgroundWorkers 확장 + Health 엔드포인트 확장 (completed 2026-02-17)
- [x] **Phase 161: CLI 알림 + upgrade 명령** - 업그레이드 알림 출력 + 7단계 upgrade 시퀀스 + backup/rollback (completed 2026-02-17)
- [x] **Phase 162: 호환성 매트릭스 + Docker** - 코드-DB 스키마 호환성 검증 + Watchtower 라벨 + 3-tier 태깅 (completed 2026-02-17)
- [x] **Phase 163: release-please 2-게이트 모델** - release-please 설정 + CI/CD release.yml 확장 + tag-release.sh 폐기 (completed 2026-02-17)
- [x] **Phase 164: 인터페이스 동기화 + 통합 검증** - SDK/MCP/Skill 파일 동기화 + E2E 통합 검증 (completed 2026-02-17)

## Phase Details

### Phase 160: 버전 체크 인프라
**Goal**: 데몬이 주기적으로 최신 버전을 확인하고, Health API에서 버전/스키마 정보를 노출하는 상태
**Depends on**: Nothing (first phase)
**Requirements**: VCHK-01, VCHK-02, VCHK-03, VCHK-04, HLTH-01, HLTH-02
**Success Criteria** (what must be TRUE):
  1. 데몬 시작 시 npm registry에서 최신 버전을 조회하여 key_value_store에 저장되고, 24시간마다 재조회된다
  2. npm registry 조회가 실패해도 데몬이 정상 시작되고 기능에 영향이 없다 (fail-soft)
  3. `update_check = false` 설정 시 버전 조회가 전혀 수행되지 않는다
  4. `GET /health` 응답에 latestVersion, updateAvailable, schemaVersion 필드가 포함되며, 버전 체크 미실행 시 latestVersion = null을 반환한다
**Plans**: 2 plans

Plans:
- [ ] 160-01-PLAN.md — BackgroundWorkers runImmediately 확장 + VersionCheckService 구현
- [ ] 160-02-PLAN.md — Health 엔드포인트 확장 (latestVersion, updateAvailable, schemaVersion)

### Phase 161: CLI 알림 + upgrade 명령
**Goal**: 사용자가 CLI 실행 시 새 버전 알림을 받고, `waiaas upgrade`로 안전하게 업그레이드/롤백할 수 있는 상태
**Depends on**: Phase 160
**Requirements**: VCHK-05, VCHK-06, VCHK-07, UPGR-01, UPGR-02, UPGR-03, UPGR-04, UPGR-05, UPGR-06, UPGR-07
**Success Criteria** (what must be TRUE):
  1. CLI 실행 시 새 버전이 있으면 stderr에 업그레이드 알림이 출력되고, 24시간 내 중복 출력되지 않으며, `--quiet` 또는 환경변수로 억제 가능하다
  2. `waiaas upgrade --check`로 업그레이드 가능 여부를 확인할 수 있고, 이미 최신이면 npm을 호출하지 않는다
  3. `waiaas upgrade`로 7단계 시퀀스(확인-중지-백업-업데이트-마이그레이션-검증-재시작)가 순서대로 실행된다
  4. 업그레이드 전 DB + config.toml이 자동 백업되고, `--rollback`으로 직전 백업에서 복원할 수 있다
  5. 백업 디렉토리가 최근 5개까지만 보존되고 초과분이 자동 삭제된다
**Plans**: 3 plans

Plans:
- [ ] 161-01-PLAN.md — CLI 업그레이드 알림 모듈 (stderr 출력, 24h 중복 방지, --quiet 억제)
- [ ] 161-02-PLAN.md — BackupService 구현 (DB + config.toml 백업/복원, 5개 보존 정책)
- [ ] 161-03-PLAN.md — upgrade 명령 구현 (7단계 시퀀스, --check, --to, --rollback, --no-start)

### Phase 162: 호환성 매트릭스 + Docker
**Goal**: 코드-DB 스키마 버전 불일치를 자동 감지하여 안전하게 처리하고, Docker 이미지가 자동 업데이트 인프라를 지원하는 상태
**Depends on**: Phase 160
**Requirements**: CMPT-01, CMPT-02, CMPT-03, DOCK-01, DOCK-02
**Success Criteria** (what must be TRUE):
  1. 코드 버전 > DB 스키마 버전이면 자동 마이그레이션 후 정상 시작된다
  2. 코드 버전 < DB 스키마 버전이면 시작을 거부하고 `waiaas upgrade` 안내 메시지를 출력한다
  3. DB 스키마 버전이 MIN_COMPATIBLE_SCHEMA_VERSION 미만이면 시작을 거부하고 단계별 업그레이드를 안내한다
  4. Docker 이미지에 Watchtower 호환 라벨이 포함되고, latest/semver/major 3-tier 태깅이 적용된다
**Plans**: 2 plans

Plans:
- [ ] 162-01-PLAN.md — 호환성 매트릭스 구현 (checkSchemaCompatibility 3-시나리오 판별 + daemon Step 2 통합)
- [ ] 162-02-PLAN.md — Docker Watchtower 라벨 + release.yml 3-tier 태깅 (GHCR push)

### Phase 163: release-please 2-게이트 모델
**Goal**: Conventional Commits 기반으로 CHANGELOG/버전/태그가 자동 관리되고, 2-게이트(Release PR 머지 + 배포 승인)로 안전하게 릴리스되는 상태
**Depends on**: Nothing (독립 작업, CI/CD 설정)
**Requirements**: RLSE-01, RLSE-02, RLSE-03, RLSE-04, RLSE-05, RLSE-06, RLSE-07, RLSE-08
**Success Criteria** (what must be TRUE):
  1. release-please 설정 파일이 존재하고, feat: 커밋 머지 시 Release PR이 자동 생성된다
  2. Release PR 머지(게이트 1) 시 CHANGELOG.md가 갱신되고 GitHub Release + 태그가 자동 생성된다
  3. GitHub Release published 시 release.yml 품질 게이트가 자동 트리거되고, 통과 후 deploy job이 environment: production으로 대기한다(게이트 2)
  4. BREAKING CHANGE 커밋 시 major 버전이 범프되고, tag-release.sh가 폐기되어 CLAUDE.md 규칙이 갱신된다
**Plans**: 3 plans

Plans:
- [ ] 163-01-PLAN.md — release-please 설정 파일 3종 (manifest + config + release-please.yml 워크플로우)
- [ ] 163-02-PLAN.md — release.yml deploy job 추가 (게이트 2: environment: production)
- [ ] 163-03-PLAN.md — tag-release.sh 폐기 + CLAUDE.md 규칙 갱신

### Phase 164: 인터페이스 동기화 + 통합 검증
**Goal**: Health 스키마 변경이 SDK/MCP/스킬 파일에 반영되고, 전체 업그레이드 흐름이 E2E로 검증된 상태
**Depends on**: Phase 160, Phase 161, Phase 162
**Requirements**: SYNC-01
**Success Criteria** (what must be TRUE):
  1. HealthResponseSchema 변경에 따라 SDK 타입, MCP 응답, 스킬 파일이 동기화되어 있다
  2. 버전 체크 -> CLI 알림 -> upgrade 명령 -> 호환성 검증 전체 흐름이 E2E 테스트로 검증된다
**Plans**: 2 plans

Plans:
- [ ] 164-01-PLAN.md — SDK HealthResponse 타입 추가 + 스킬 파일 /health 응답 동기화
- [ ] 164-02-PLAN.md — 업그레이드 흐름 E2E 통합 테스트 (16건+)

## Progress

**Execution Order:** 160 -> 161 -> 162 -> 163 -> 164
(Phase 162, 163은 Phase 160 이후 병렬 가능하나, 순차 실행 기준으로 기재)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 160. 버전 체크 인프라 | 0/2 | Complete    | 2026-02-17 |
| 161. CLI 알림 + upgrade 명령 | 0/3 | Complete    | 2026-02-17 |
| 162. 호환성 매트릭스 + Docker | 0/2 | Complete    | 2026-02-17 |
| 163. release-please 2-게이트 모델 | 0/3 | Complete    | 2026-02-17 |
| 164. 인터페이스 동기화 + 통합 검증 | 0/2 | Complete    | 2026-02-17 |
