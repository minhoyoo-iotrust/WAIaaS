# Requirements: WAIaaS

**Defined:** 2026-02-19
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v2.4 Requirements

npm Trusted Publishing (OIDC) 전환으로 supply chain 보안 강화.

### 사전 준비 (PREP)

- [ ] **PREP-01**: 9개 package.json의 repository.url을 실제 GitHub 레포 URL로 수정 (minhoyoo-iotrust/WAIaaS)
- [ ] **PREP-02**: deploy 잡에서 npm CLI >= 11.5.1 확보 (npm upgrade 스텝 추가 또는 Node.js 번들 버전 확인)
- [ ] **PREP-03**: 8개 패키지의 package.json repository.directory 필드 정확성 확인

### OIDC 설정 (OIDC)

- [ ] **OIDC-01**: npmjs.com에서 8개 패키지 각각 Trusted Publisher 등록 (repo: minhoyoo-iotrust/WAIaaS, workflow: release.yml, environment: production)
- [ ] **OIDC-02**: release.yml deploy 잡에 permissions: { contents: read, id-token: write } 추가
- [ ] **OIDC-03**: deploy 잡에서 Setup npmrc 스텝 및 NODE_AUTH_TOKEN 환경변수 제거
- [ ] **OIDC-04**: deploy 잡의 pnpm publish를 npm publish --provenance --access public 전환 (pre-release 시 --tag rc 포함)
- [ ] **OIDC-05**: publish-check 잡은 --provenance 없이 기존 pnpm publish --dry-run 유지 확인

### 검증 및 정리 (VERIFY)

- [ ] **VERIFY-01**: OIDC 전환 후 실제 릴리스 (rc 또는 stable)로 8개 패키지 발행 성공 확인
- [ ] **VERIFY-02**: npmjs.com 패키지 페이지에서 provenance 배지 표시 확인
- [ ] **VERIFY-03**: GitHub Secrets에서 NPM_TOKEN 시크릿 제거 (OIDC 발행 성공 검증 후)
- [ ] **VERIFY-04**: Deploy summary에 provenance 정보 추가

## Future Requirements

(없음)

## Out of Scope

| Feature | Reason |
|---------|--------|
| npm CLI granular token 전환 | OIDC Trusted Publishing이 token을 완전 대체 |
| sigstore 서명 검증 자동화 (CI) | 첫 전환 범위 외, 향후 추가 가능 |
| SLSA Level 3 빌드 격리 | npm provenance가 기본 제공, 별도 격리 불필요 |
| 다른 패키지 레지스트리 (JSR 등) | npm 단일 레지스트리에 집중 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PREP-01 | Phase 188 | Pending |
| PREP-02 | Phase 188 | Pending |
| PREP-03 | Phase 188 | Pending |
| OIDC-01 | Phase 189 | Pending |
| OIDC-02 | Phase 189 | Pending |
| OIDC-03 | Phase 189 | Pending |
| OIDC-04 | Phase 189 | Pending |
| OIDC-05 | Phase 189 | Pending |
| VERIFY-01 | Phase 190 | Pending |
| VERIFY-02 | Phase 190 | Pending |
| VERIFY-03 | Phase 190 | Pending |
| VERIFY-04 | Phase 190 | Pending |

**Coverage:**
- v2.4 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
