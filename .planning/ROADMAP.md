# Roadmap: WAIaaS v2.0.1

## Overview

v2.0.1은 퍼블릭 리포 전환을 위한 거버넌스 파일 생성, 내부 문서 구조 통합, 기존 Known Gaps/OPEN 이슈 해소, 그리고 npm 배포 스모크 테스트 자동화를 수행하는 docs/cleanup 마일스톤이다. 코드 기능 변경 없이 파일 생성/이동/수정과 CI 통합만으로 구성된다.

## Phases

- [x] **Phase 174: 거버넌스 파일** - 퍼블릭 리포 필수 거버넌스 문서 생성
- [x] **Phase 175: 정리 및 수정** - 잔존 이슈 해소 및 규칙 보완
- [x] **Phase 176: 문서 구조 통합** - 설계 문서/objectives 디렉토리 재배치 및 경로 갱신
- [x] **Phase 177: 배포 스모크 테스트** - npm 패키지 스모크 테스트 스크립트 작성 및 CI 통합

## Phase Details

### Phase 174: 거버넌스 파일
**Goal**: 퍼블릭 리포지토리에 필수적인 보안 정책, 행동 강령, 이슈/PR 템플릿이 모두 갖춰진다
**Depends on**: Nothing (first phase)
**Requirements**: GOV-01, GOV-02, GOV-03, GOV-04
**Success Criteria** (what must be TRUE):
  1. SECURITY.md가 루트에 존재하며 Responsible Disclosure 정책, 신고 채널(이메일), 대응 SLA가 명시되어 있다
  2. CODE_OF_CONDUCT.md가 루트에 존재하며 Contributor Covenant v2.1 기반으로 작성되어 있다
  3. .github/ISSUE_TEMPLATE/에 Bug Report와 Feature Request 두 개의 YAML 템플릿이 존재하고, GitHub New Issue 화면에서 선택 가능하다
  4. .github/PULL_REQUEST_TEMPLATE.md가 존재하며 변경 요약, 테스트 방법, 관련 이슈 링크 체크리스트를 포함한다
**Plans:** 1 plan

Plans:
- [ ] 174-01-PLAN.md -- 거버넌스 파일 일괄 생성 (SECURITY.md, CODE_OF_CONDUCT.md, Issue/PR 템플릿)

### Phase 175: 정리 및 수정
**Goal**: 더 이상 사용하지 않는 스크립트 제거, CLAUDE.md 규칙 보완, 문서/코드의 잔존 오류가 수정된다
**Depends on**: Nothing (independent)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05
**Success Criteria** (what must be TRUE):
  1. scripts/tag-release.sh 파일이 존재하지 않으며 CLAUDE.md에서 관련 문구가 제거되어 있다
  2. CLAUDE.md Language 섹션에 Git 태그와 GitHub Release 제목/본문을 영문으로 작성한다는 규칙이 명시되어 있다
  3. README.md와 deployment.md에서 CLI `add --all` / `add all` 문법이 실제 CLI 스펙과 일관되게 통일되어 있다
  4. examples/simple-agent/README.md의 모든 링크가 유효하고 placeholder URL이 실제 URL로 대체되어 있다
  5. validate-openapi.ts의 @see 주석이 실제 파일 경로를 가리킨다
**Plans**: TBD

Plans:
- [ ] 175-01: 폐기 스크립트 제거 + CLAUDE.md 규칙 보완 (CLEAN-01, CLEAN-02)
- [ ] 175-02: 문서/코드 잔존 오류 수정 (CLEAN-03, CLEAN-04, CLEAN-05)

### Phase 176: 문서 구조 통합
**Goal**: 분산된 설계 문서와 objectives가 internal/ 하위로 통합되고 모든 참조 경로가 갱신된다
**Depends on**: Phase 175 (CLAUDE.md 수정이 선행되어야 경로 충돌 없음)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05
**Success Criteria** (what must be TRUE):
  1. .planning/deliverables/와 docs-internal/의 설계 문서가 모두 internal/design/에 존재하고 원본 위치에는 없다
  2. objectives/ 디렉토리가 internal/objectives/로 이동되어 있고 원본 위치에는 없다
  3. v0.1~v2.0 shipped 목표 문서와 FIXED 이슈가 internal/objectives/archive/에 분리되어 있다
  4. docs/ 디렉토리의 모든 .md 파일이 영문 전용임을 검증하는 수단이 존재한다 (스크립트 또는 CI 체크)
  5. CLAUDE.md Issue Tracking 섹션의 경로가 internal/objectives/issues/로 갱신되어 있다
**Plans**: TBD

Plans:
- [ ] 176-01: 설계 문서 통합 이동 (DOCS-01)
- [ ] 176-02: objectives 이동 + 아카이브 분리 + 경로 갱신 (DOCS-02, DOCS-03, DOCS-05)
- [ ] 176-03: docs/ 영문 전용 검증 (DOCS-04)

### Phase 177: 배포 스모크 테스트
**Goal**: npm 발행된 8개 패키지의 import 정상성을 로컬과 CI 양쪽에서 자동 검증할 수 있다
**Depends on**: Nothing (independent)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. scripts/smoke-test-published.sh가 존재하며 실행 시 8개 패키지를 npm pack -> tarball 설치 -> import 검증한다
  2. 8개 @waiaas/* 패키지 각각에 대해 npm pack -> 임시 디렉토리 설치 -> ESM import 성공이 확인된다
  3. release.yml 워크플로우에 스모크 테스트 job이 추가되어 릴리스 시 자동 실행된다
  4. pnpm test:smoke 명령으로 로컬에서 스모크 테스트를 실행할 수 있다
**Plans**: TBD

Plans:
- [ ] 177-01: 스모크 테스트 스크립트 작성 + 로컬 실행 검증 (DEPLOY-01, DEPLOY-02, DEPLOY-04)
- [ ] 177-02: release.yml CI 통합 (DEPLOY-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 174 -> 175 -> 176 -> 177

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 174. 거버넌스 파일 | 1/1 | Complete | 2026-02-18 |
| 175. 정리 및 수정 | 2/2 | Complete | 2026-02-18 |
| 176. 문서 구조 통합 | 3/3 | Complete | 2026-02-18 |
| 177. 배포 스모크 테스트 | 2/2 | Complete | 2026-02-18 |

## Decisions

| # | Decision | Phase | Rationale |
|---|----------|-------|-----------|
| 1 | CODE_OF_CONDUCT.md 수동 생성 이연 | 174 | 콘텐츠 필터에 의해 자동 생성 차단, 사용자 수동 작성 필요 |
| 2 | validate-openapi.ts @see 경로 2회 갱신 | 175, 177 | Phase 175에서 deliverables/ 경로로 수정 후 Phase 176 이동으로 재수정 |
