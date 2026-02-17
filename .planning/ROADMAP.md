# Roadmap: WAIaaS v2.0 전 기능 완성 릴리스

## Overview

v0.1~v1.8까지 37개 마일스톤으로 축적된 설계와 구현의 최종 검증, 문서화, 공개 릴리스를 달성한다. 설계 부채 0건 확인, 테스트 게이트 전수 통과, 영문/한글 사용자 문서 완비, npm 9개 패키지 + Docker 이미지 실제 배포 활성화, pre-release RC를 거쳐 v2.0.0 정식 릴리스를 발행한다.

## Phases

- [ ] **Phase 165: 릴리스 기반 준비** - MIT 라이선스 + npm scope 확보 (공개 릴리스 전제조건)
- [ ] **Phase 166: 설계 검증 + 설계 부채 해소** - 설계 문서 37개 구현 범위 검증 + 설계 부채 0건 확인 + OpenAPI 유효성 검증
- [ ] **Phase 167: 테스트 게이트 통과** - 보안 시나리오 ~460건 + 커버리지 80% + Enum SSoT + 플랫폼 84건 + 블록체인 통합 전수 통과
- [ ] **Phase 168: 사용자 문서 완비** - docs/ 재편성 + README en/ko + CONTRIBUTING + 배포 가이드 + API 레퍼런스 + CHANGELOG + Why WAIaaS
- [ ] **Phase 169: 패키지 생성** - @waiaas/skills npx 배포 패키지 + examples/simple-agent 예제 에이전트
- [ ] **Phase 170: 배포 활성화 + pre-release** - npm 9개 패키지 publish + Docker Hub push + release.yml 활성화 + v2.0.0-rc.1 pre-release 발행

## Phase Details

### Phase 165: 릴리스 기반 준비
**Goal**: 오픈소스 공개에 필요한 법적/인프라 전제조건이 갖추어진 상태
**Depends on**: Nothing (first phase)
**Requirements**: RELEASE-01, RELEASE-02
**Success Criteria** (what must be TRUE):
  1. 프로젝트 루트에 MIT 라이선스 파일이 존재하고, 모든 패키지의 package.json에 "license": "MIT"가 설정되어 있다
  2. npm 레지스트리에서 @waiaas scope가 확보되어 `npm access ls-packages` 또는 `npm org ls`로 확인할 수 있다
  3. `npm publish --dry-run`이 scope 관련 에러 없이 통과한다 (패키지 내용 검증은 Phase 170)
**Plans**: 1 plan

Plans:
- [ ] 165-01-PLAN.md — MIT LICENSE 파일 생성 + package.json license 필드 통일 + npm scope 확보

### Phase 166: 설계 검증 + 설계 부채 해소
**Goal**: v0.1~v0.10 설계 문서 37개의 구현 완전성이 검증되고, 설계 부채가 0건이거나 v2.1 이연이 명시된 상태
**Depends on**: Nothing (Phase 165와 독립적, 병렬 가능)
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03
**Success Criteria** (what must be TRUE):
  1. 설계 문서 37개의 구현 범위가 해당 마일스톤 objective 범위와 일치하는 교차 검증 보고서가 존재한다 (doc 39 Tauri 이연 제외)
  2. objectives/design-debt.md의 미해결 항목이 0건이거나, 각 항목에 "v2.1 이연" 사유가 명시되어 있다
  3. `GET /doc` OpenAPI 3.0 스펙이 유효성 검증 도구(swagger-cli validate 또는 동등)로 0 errors를 통과한다
**Plans**: TBD

Plans:
- [ ] 166-01: 설계 문서 37개 vs objective 교차 검증 + design-debt.md 잔여 항목 해소/이연
- [ ] 166-02: OpenAPI 3.0 스펙 유효성 검증 (swagger-cli 도입 + CI 통합)

### Phase 167: 테스트 게이트 통과
**Goal**: v2.0 릴리스 품질 기준을 만족하는 테스트 전수 통과 상태
**Depends on**: Phase 166 (설계 검증 후 발견된 수정 사항이 테스트에 반영되어야 함)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. 보안 공격 시나리오 ~460건이 CI에서 전수 통과하고, 실패 0건으로 리포트된다
  2. 전체 코드베이스 커버리지가 Hard 80% 게이트를 통과하며, 패키지별 커버리지 리포트가 생성된다
  3. Enum SSoT 16개가 빌드타임 4단계 검증(Zod -> TS -> OpenAPI -> Drizzle CHECK)을 통과한다
  4. 플랫폼 테스트 84건(CLI 32 + Docker 18 + Telegram 34)이 전수 통과한다
  5. 블록체인 통합 테스트가 Solana Local Validator + EVM Anvil 환경에서 통과한다
**Plans**: TBD

Plans:
- [ ] 167-01: 보안 시나리오 전수 실행 + 실패 건 수정
- [ ] 167-02: 커버리지 80% 게이트 확보 + Enum SSoT 검증
- [ ] 167-03: 플랫폼 테스트 84건 + 블록체인 통합 테스트 전수 통과

### Phase 168: 사용자 문서 완비
**Goal**: 외부 사용자가 프로젝트를 이해하고, 설치하고, 사용하고, 기여할 수 있는 문서가 완비된 상태
**Depends on**: Phase 167 (테스트 통과 후 확정된 API/기능 기준으로 문서 작성)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08
**Success Criteria** (what must be TRUE):
  1. docs/ 디렉토리에 사용자 문서가, docs-internal/ 디렉토리에 내부 설계 문서가 분리되어 있다
  2. 영문 README.md가 프로젝트 소개, Quick Start(CLI + Docker), 아키텍처 개요, 라이선스를 포함하고, README.ko.md가 동일 내용의 한글 버전을 제공한다
  3. CONTRIBUTING.md가 개발 환경 설정, 코드 스타일, PR 프로세스, 테스트 실행 방법을 안내한다
  4. 배포 가이드(docs/deployment.md)가 npm global 설치와 Docker compose 설치 두 경로를 안내하고, API 레퍼런스(docs/api-reference.md)가 OpenAPI 3.0 스펙 기반으로 제공된다
  5. CHANGELOG.md가 v1.1~v2.0 전체 주요 변경 이력을 포함하고, docs/why-waiaas.md가 AI 에이전트 지갑 보안 위기와 프로젝트 가치를 영문으로 설명한다
**Plans**: TBD

Plans:
- [ ] 168-01: docs/ 디렉토리 재편성 (사용자 문서 vs 내부 설계 문서 분리)
- [ ] 168-02: README.md(영문) + README.ko.md(한글) + CONTRIBUTING.md
- [ ] 168-03: 배포 가이드 + API 레퍼런스 + CHANGELOG + Why WAIaaS

### Phase 169: 패키지 생성
**Goal**: @waiaas/skills npx 패키지와 예제 에이전트가 사용자에게 제공되는 상태
**Depends on**: Phase 168 (문서 완비 후 스킬 파일/예제가 문서와 일관)
**Requirements**: PKG-01, PKG-02
**Success Criteria** (what must be TRUE):
  1. `npx @waiaas/skills add <name>` 명령으로 현재 디렉토리에 스킬 파일(.skill.md)이 복사되고, `npx @waiaas/skills list`로 사용 가능한 스킬 목록이 출력된다
  2. examples/simple-agent/ 디렉토리에 @waiaas/sdk 기반 예제 에이전트가 있고, README를 따라 설치/실행하면 잔액 조회 -> 조건부 전송 -> 완료 대기 흐름이 동작한다
  3. @waiaas/skills 패키지가 `npm publish --dry-run` 성공한다
**Plans**: TBD

Plans:
- [ ] 169-01: @waiaas/skills 패키지 생성 (npx CLI + 스킬 파일 번들링)
- [ ] 169-02: examples/simple-agent/ 예제 에이전트 (SDK 기반 잔액 조회 -> 전송 -> 완료 대기)

### Phase 170: 배포 활성화 + pre-release
**Goal**: npm 9개 패키지 + Docker 이미지가 실제 배포 채널에 게시되고, pre-release RC를 거쳐 정식 릴리스가 가능한 상태
**Depends on**: Phase 165, Phase 167, Phase 168, Phase 169 (모든 전제조건 완료 후)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, RELEASE-03
**Success Criteria** (what must be TRUE):
  1. 9개 npm 패키지(@waiaas/core, daemon, adapter-solana, adapter-evm, cli, sdk, mcp, admin, skills)가 `npm publish --dry-run` 전수 성공하고, 패키지 내용(files 필드)이 올바르다
  2. Docker 이미지가 Docker Hub에 waiaas/daemon:2.0.0-rc.1 + latest 태그로 push 가능하다
  3. release.yml deploy job에서 dry-run 플래그가 제거되어 실제 npm publish + Docker push가 활성화된다
  4. release-please 2-게이트 모델로 v2.0.0-rc.1 pre-release가 발행되어 npm + Docker Hub에 게시된다
  5. GitHub Release v2.0.0-rc.1이 생성되고, 3일 관찰 후 v2.0.0 정식 릴리스 발행 준비가 완료된다
**Plans**: TBD

Plans:
- [ ] 170-01: npm 9개 패키지 publish 검증 (files 필드, 의존성, 버전 정합성)
- [ ] 170-02: Docker Hub push + release.yml dry-run 제거 + 배포 활성화
- [ ] 170-03: v2.0.0-rc.1 pre-release 발행 (release-please RC + 3일 관찰 계획)

## Progress

**Execution Order:** 165 -> 166 -> 167 -> 168 -> 169 -> 170
(Phase 165와 166은 병렬 가능)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 165. 릴리스 기반 준비 | 0/1 | Not started | - |
| 166. 설계 검증 + 설계 부채 해소 | 0/2 | Not started | - |
| 167. 테스트 게이트 통과 | 0/3 | Not started | - |
| 168. 사용자 문서 완비 | 0/3 | Not started | - |
| 169. 패키지 생성 | 0/2 | Not started | - |
| 170. 배포 활성화 + pre-release | 0/3 | Not started | - |
