# Requirements: WAIaaS v2.0.1

**Defined:** 2026-02-18
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v2.0.1 Requirements

퍼블릭 리포 필수 거버넌스 + 내부 문서 구조 정리 + OPEN 이슈 해소 + Known Gaps 수정.

### 거버넌스 (GOV)

- [ ] **GOV-01**: SECURITY.md가 루트에 존재하며 Responsible Disclosure 정책, 신고 채널, 대응 SLA를 포함한다
- [ ] **GOV-02**: CODE_OF_CONDUCT.md가 루트에 존재하며 Contributor Covenant 기반으로 작성된다
- [ ] **GOV-03**: .github/ISSUE_TEMPLATE/에 Bug Report, Feature Request 템플릿이 존재한다
- [ ] **GOV-04**: .github/PULL_REQUEST_TEMPLATE.md에 변경 요약, 테스트 방법, 관련 이슈 체크리스트가 포함된다

### 문서 구조 (DOCS)

- [ ] **DOCS-01**: .planning/deliverables/ 및 docs-internal/의 설계 문서가 internal/design/으로 통합된다
- [ ] **DOCS-02**: objectives/ 디렉토리가 internal/objectives/로 이동된다
- [ ] **DOCS-03**: v0.1~v2.0 shipped 목표 문서 + FIXED 이슈가 internal/objectives/archive/로 분리된다
- [ ] **DOCS-04**: docs/ 디렉토리 내 모든 .md 파일이 영문 전용으로 유지됨을 검증할 수 있다
- [ ] **DOCS-05**: CLAUDE.md Issue Tracking 섹션의 경로가 internal/objectives/issues/로 갱신된다

### 정리 (CLEAN)

- [ ] **CLEAN-01**: scripts/tag-release.sh가 삭제되고 CLAUDE.md에서 관련 문구가 제거된다
- [ ] **CLEAN-02**: CLAUDE.md Language 섹션에 Git 태그/GitHub Release 영문 규칙이 추가된다
- [ ] **CLEAN-03**: README.md/deployment.md의 `add --all` vs `add all` CLI 문법이 일관되게 수정된다 (INT-01)
- [ ] **CLEAN-04**: examples/simple-agent/README.md의 깨진 링크와 placeholder URL이 수정된다 (INT-02)
- [ ] **CLEAN-05**: validate-openapi.ts의 @see 주석 경로가 수정된다

### 배포 품질 (DEPLOY)

- [ ] **DEPLOY-01**: scripts/smoke-test-published.sh 스모크 테스트 스크립트가 작성된다
- [ ] **DEPLOY-02**: 8개 패키지에 대해 npm pack → tarball 설치 → import 검증이 통과한다
- [ ] **DEPLOY-03**: release.yml에 스모크 테스트 단계가 통합된다
- [ ] **DEPLOY-04**: pnpm test:smoke로 로컬 스모크 테스트 실행이 가능하다

## Deferred Requirements

v2.0에서 이월된 후순위 거버넌스 항목. 별도 마일스톤에서 검토.

- **GOV-05**: Signed Releases (cosign/sigstore)
- **GOV-06**: OpenSSF Scorecard + Best Practices Badge
- **GOV-07**: DCO 강제 (Developer Certificate of Origin)
- **GOV-08**: API Versioning Policy
- **GOV-09**: Migration Guide 템플릿
- **GOV-10**: Public Roadmap
- **GOV-11**: GitHub Discussions 활성화

## Out of Scope

| Feature | Reason |
|---------|--------|
| Signed Releases (cosign/sigstore) | 후순위 이연 — 초기 공개에 필수적이지 않음 |
| OpenSSF Scorecard | 후순위 이연 — 배지 취득은 별도 마일스톤 |
| DCO 강제 | 후순위 이연 — 초기 기여자 유입 장벽 최소화 |
| Tauri Desktop App | v2.6.1로 이연 |
| SaaS 클라우드 호스팅 | Self-Hosted 전용 아키텍처 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GOV-01 | — | Pending |
| GOV-02 | — | Pending |
| GOV-03 | — | Pending |
| GOV-04 | — | Pending |
| DOCS-01 | — | Pending |
| DOCS-02 | — | Pending |
| DOCS-03 | — | Pending |
| DOCS-04 | — | Pending |
| DOCS-05 | — | Pending |
| CLEAN-01 | — | Pending |
| CLEAN-02 | — | Pending |
| CLEAN-03 | — | Pending |
| CLEAN-04 | — | Pending |
| CLEAN-05 | — | Pending |
| DEPLOY-01 | — | Pending |
| DEPLOY-02 | — | Pending |
| DEPLOY-03 | — | Pending |
| DEPLOY-04 | — | Pending |

**Coverage:**
- v2.0.1 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18 ⚠️

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
