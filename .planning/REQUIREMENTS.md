# Requirements: WAIaaS v2.0

**Defined:** 2026-02-17
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v2.0 Requirements

v0.1~v0.10 설계의 최종 검증 + 문서화 + 공개 릴리스.

### 설계 검증 (VERIFY)

- [x] **VERIFY-01**: 설계 문서 37개의 구현 범위가 해당 마일스톤 objective 범위와 일치함을 검증할 수 있다 (doc 39 Tauri 이연 제외)
- [x] **VERIFY-02**: 설계 부채(design-debt.md) 미해결 항목이 0건이거나 v2.1 이연이 명시되어 있다
- [x] **VERIFY-03**: OpenAPI 3.0 스펙이 유효성 검증 도구로 0 errors를 통과한다

### 테스트 게이트 (TEST)

- [x] **TEST-01**: 보안 시나리오 ~460건이 전수 통과한다
- [x] **TEST-02**: 커버리지가 Hard 80% 게이트를 통과한다
- [x] **TEST-03**: Enum SSoT 16개가 빌드타임 4단계 검증을 통과한다
- [x] **TEST-04**: 플랫폼 테스트 84건이 전수 통과한다 (CLI 32 + Docker 18 + Telegram 34)
- [x] **TEST-05**: 블록체인 통합 테스트(Solana Local Validator + EVM Anvil)가 통과한다

### 문서 (DOC)

- [x] **DOC-01**: 문서 디렉토리가 재편성된다 (docs/ 사용자 문서, docs-internal/ 내부 설계 문서)
- [x] **DOC-02**: 영문 README.md가 프로젝트 소개, Quick Start, 아키텍처 개요, 라이선스를 포함한다
- [x] **DOC-03**: 한글 README.ko.md가 영문과 동일한 내용을 포함한다
- [x] **DOC-04**: CONTRIBUTING.md가 개발 환경 설정, 코드 스타일, PR 프로세스, 테스트 방법을 안내한다
- [x] **DOC-05**: 배포 가이드가 CLI(npm global) 설치와 Docker(compose) 설치를 안내한다
- [x] **DOC-06**: API 레퍼런스가 OpenAPI 3.0 스펙 기반으로 제공된다
- [x] **DOC-07**: CHANGELOG.md가 v1.1~v2.0 전체 주요 변경 이력을 포함한다
- [x] **DOC-08**: Why WAIaaS 문서가 AI 에이전트 지갑 보안 위기와 프로젝트 가치를 설명한다 (영문)

### 패키지 (PKG)

- [x] **PKG-01**: @waiaas/skills 패키지가 `npx @waiaas/skills add <name>`으로 스킬 파일을 배포한다
- [x] **PKG-02**: examples/simple-agent/가 @waiaas/sdk 기반 예제 에이전트를 제공한다 (잔액 조회 → 조건부 전송 → 완료 대기)

### 배포 (DEPLOY)

- [x] **DEPLOY-01**: 9개 npm 패키지가 `npm publish --dry-run` 성공한다
- [x] **DEPLOY-02**: Docker 이미지가 Docker Hub에 push 가능하다 (waiaas/daemon:2.0.0 + latest)
- [x] **DEPLOY-03**: release.yml deploy job의 dry-run이 제거되어 실제 배포가 활성화된다
- [x] **DEPLOY-04**: GitHub Release v2.0.0이 release-please 2-게이트 모델로 생성된다

### 릴리스 (RELEASE)

- [x] **RELEASE-01**: MIT 라이선스 파일이 루트에 존재한다
- [x] **RELEASE-02**: npm scope @waiaas가 확보된다
- [x] **RELEASE-03**: pre-release v2.0.0-rc.1이 발행되어 3일 관찰 후 정식 발행된다

## v2.0.1 Requirements

v2.0.1 오픈소스 거버넌스 + 신뢰 강화 마일스톤으로 이연.

- **GOV-01**: Signed Releases (cosign/sigstore)
- **GOV-02**: OpenSSF Scorecard + Best Practices Badge
- **GOV-03**: DCO 강제 (Developer Certificate of Origin)
- **GOV-04**: PR Template
- **GOV-05**: API Versioning Policy
- **GOV-06**: Migration Guide 템플릿
- **GOV-07**: Public Roadmap
- **GOV-08**: GitHub Discussions 활성화

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tauri Desktop App | v2.6.1로 이연 — npm/Docker/CLI 중심 릴리스 |
| SaaS 클라우드 호스팅 | Self-Hosted 전용 아키텍처, 추후 확장 |
| 크로스체인 브릿지 | 별도 마일스톤 |
| Account Abstraction | 별도 마일스톤 |
| OpenSSF/DCO/Sigstore | v2.0.1 거버넌스 마일스톤 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VERIFY-01 | Phase 166 | Completed |
| VERIFY-02 | Phase 166 | Completed |
| VERIFY-03 | Phase 166 | Completed |
| TEST-01 | Phase 167 | Completed |
| TEST-02 | Phase 167 | Completed |
| TEST-03 | Phase 167 | Completed |
| TEST-04 | Phase 167 | Completed |
| TEST-05 | Phase 167 | Completed |
| DOC-01 | Phase 168 | Completed |
| DOC-02 | Phase 168, 173 | Completed |
| DOC-03 | Phase 168, 173 | Completed |
| DOC-04 | Phase 168 | Completed |
| DOC-05 | Phase 168, 173 | Completed |
| DOC-06 | Phase 168, 173 | Completed |
| DOC-07 | Phase 168 | Completed |
| DOC-08 | Phase 168 | Completed |
| PKG-01 | Phase 169, 173 | Completed |
| PKG-02 | Phase 169 | Completed |
| DEPLOY-01 | Phase 170, 171 | Completed |
| DEPLOY-02 | Phase 170, 171 | Completed |
| DEPLOY-03 | Phase 170, 171 | Completed |
| DEPLOY-04 | Phase 170, 171 | Completed |
| RELEASE-01 | Phase 165 | Completed |
| RELEASE-02 | Phase 165 | Completed |
| RELEASE-03 | Phase 170, 171 | Completed |

**Coverage:**
- v2.0 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-18 after Phase 173 gap closure phase creation*
