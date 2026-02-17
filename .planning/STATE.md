# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.8 업그레이드 + 배포 인프라 — Phase 164 동기화 + 통합

## Current Position

Phase: 164 of 164 (동기화 + 통합)
Plan: 11 of 12 total (1 of 2 in current phase)
Status: In Progress
Last activity: 2026-02-17 — 164-01 완료 (SDK HealthResponse 타입 추가 + 스킬 파일 /health 응답 동기화)

Progress: [#########░] 92% — Milestone v1.8 (5 phases, 12 plans, 30 reqs)

## Performance Metrics

**Cumulative:** 36 milestones, 159 phases, 344 plans, 971 reqs, ~3,509 tests, ~237,000 LOC

**v1.8 Milestone:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 160. 버전 체크 인프라 | 2/2 | 5min | 2.5min |
| 161. CLI 알림 + upgrade | 3/3 | 9min | 3min |
| 162. 호환성 + Docker | 2/2 | 5min | 2.5min |
| 163. release-please | 3/3 | 3min | 1min |
| 164. 동기화 + 통합 | 1/2 | 1min | 1min |

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.
v1.7 decisions archived to milestones/v1.7-ROADMAP.md (66 decisions).
v1.8 기술 결정 16건: objectives/v1.8-upgrade-distribution.md 참조.

**160-01 결정:**
- semver 패키지로 npm registry 버전 비교 (런타임 dependency)
- AbortSignal.timeout(5000) fetch 타임아웃 (Node.js native)
- key_value_store에 version_check_latest / version_check_checked_at 저장

**160-02 결정:**
- health.ts를 createHealthRoute 팩토리 함수로 리팩토링 (backward compatibility 유지)
- VersionCheckService를 Step 4g로 이동 (Step 5 createApp 전에 생성)
- semver.gt()로 updateAvailable 판별 (latestVersion null이면 항상 false)

**161-01 결정:**
- 파일 기반 mtime dedup (.last-update-notify) -- 데몬 비실행 시에도 CLI 독립적으로 동작
- AbortSignal.timeout(2000) 페치 타임아웃 -- CLI 응답성 2초 이내 보장
- process.stderr.write 출력 -- stdout 파이프 안전성 확보

**161-02 결정:**
- copyFileSync로 개별 파일 복사 (cpSync 디렉토리 복사 대신 명시적 파일 단위)
- DB 파일 없으면 에러 throw + 빈 백업 디렉토리 정리 (불완전한 백업 방지)
- timestamp 포맷을 로컬 시간 기반 YYYYMMDDHHmmss로 사전순=시간순 보장

**161-03 결정:**
- execSync('npm install -g') 사용 -- 기술 결정 #15에 따라 npm CLI 직접 호출
- Step 5 마이그레이션은 데몬 시작 시 자동 실행에 위임 -- 구버전 코드에서 마이그레이션 직접 실행 위험
- BackupService를 @waiaas/daemon barrel export에 추가 -- CLI에서 직접 import 가능

**162-01 결정:**
- dbVersion null vs 0 구분: MAX(version) null이면 빈 테이블(fresh DB), 0은 유효한 구버전으로 취급
- SCHEMA_INCOMPATIBLE 에러 코드를 @waiaas/core SYSTEM 도메인에 추가 (503, non-retryable)
- MIN_COMPATIBLE_SCHEMA_VERSION = 1 -- 모든 마이그레이션 경로가 v1부터 지원

**162-02 결정:**
- docker/metadata-action@v5로 GitHub Release 태그에서 3-tier 태그 자동 생성
- GHCR(GitHub Container Registry) 사용 -- github.repository 기반 이미지 이름
- docker-publish는 release 이벤트에서만 push (workflow_dispatch 제외)
- Watchtower 라벨을 이미지에 기본 포함하여 사용자 opt-in 간소화

**163-01 결정:**
- 모노레포 단일 버전 전략: 루트 패키지(.)가 9개 서브패키지 버전을 대표
- bump-minor-pre-major: false로 1.x에서도 BREAKING CHANGE가 major 범프
- changelog-sections: feat/fix/perf/refactor만 표시, docs/test/chore/ci는 숨김

**163-02 결정:**
- deploy job이 5개 품질 게이트 job 모두에 의존하여 전체 통과 후에만 실행
- npm publish는 v2.0 전까지 --dry-run으로 실행 (RLSE-06)
- Docker push는 docker-publish job에서 이미 처리되므로 deploy job에서 중복 안 함

**163-03 결정:**
- 원본 스크립트를 ARCHIVED 주석으로 보존하여 히스토리 참조 가능
- CLAUDE.md에서 v1.8.1 이전 규칙을 완전히 제거하고 2-게이트 모델만 기술

**164-01 결정:**
- SDK HealthResponse는 타입만 export, getHealth() 메서드 미추가 (unauthenticated endpoint이므로 SDK 클라이언트 패턴 부적합)
- 스킬 파일 프론트매터 version을 1.8.0으로 갱신

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing 3 sessions.test.tsx failures -- not blocking

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 164-01-PLAN.md (SDK HealthResponse 타입 추가 + 스킬 파일 /health 응답 동기화)
Resume file: None
