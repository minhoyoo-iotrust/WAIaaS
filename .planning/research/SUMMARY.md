# Project Research Summary

**Project:** WAIaaS m24 — npm Trusted Publishing (OIDC 전환)
**Domain:** CI/CD Supply Chain Security — npm 발행 인증 방식 전환
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

npm Trusted Publishing은 GitHub Actions OIDC 토큰으로 npm 레지스트리에 인증하여 장기 시크릿(NPM_TOKEN) 없이 패키지를 발행하는 보안 강화 메커니즘이다. WAIaaS는 이미 `release.yml`의 deploy 잡이 `environment: production` 수동 승인 게이트를 갖춘 성숙한 6-job 파이프라인을 보유하고 있어, 전환에 필요한 구조적 변경은 최소화된다. 새로운 라이브러리나 도구 추가 없이 기존 워크플로의 deploy 잡 설정 변경과 npmjs.com 수동 등록만으로 전환이 완료된다.

전환의 핵심 선행 조건은 **repository.url 불일치 수정**이다. 현재 8개(+ admin 1개) package.json 파일에 `"url": "https://github.com/minho-yoo/waiaas.git"`로 잘못 설정되어 있으나, 실제 GitHub 원격은 `minhoyoo-iotrust/WAIaaS`이다. provenance 생성 시 Sigstore가 OIDC 토큰의 repository 정보와 이 필드를 대조하여 불일치 시 422 에러로 발행 전체가 실패한다. 이 수정은 독립적으로 가장 먼저 수행해야 하며, 이후 npmjs.com 수동 등록 → release.yml 수정 → 검증 및 정리의 3단계로 진행한다.

주요 위험은 npm CLI 버전 요구사항(>=11.5.1)과 OIDC 권한 배치의 세부 사항에 있다. Node 22 기본 번들 npm이 구버전일 수 있으므로 deploy 잡에 `npm install -g npm@latest` 스텝을 추가해야 한다. `id-token: write`는 반드시 deploy 잡 레벨에만 추가해야 하며, job-level permissions는 top-level을 완전히 대체하므로 `contents: read`도 함께 명시해야 한다. NPM_TOKEN은 OIDC 전환이 검증된 이후(최소 2회 성공 릴리스)에만 제거한다.

## Key Findings

### 권장 스택 변경사항

npm Trusted Publishing 전환은 **새로운 도구 없이 기존 스택에서 설정 변경만으로** 완료된다. 유일한 버전 요구사항은 npm CLI >= 11.5.1이며, 이는 `npm install -g npm@latest`로 충족된다. pnpm과 Node.js는 현재 버전(9.15.4, 22.x)을 그대로 유지한다.

**핵심 변경사항:**
- **npm CLI >=11.5.1**: OIDC 토큰 교환 필수 버전 — deploy 잡에 업그레이드 스텝 추가
- **npm publish 직접 호출**: pnpm이 내부적으로 npm publish를 위임하지만, OIDC 토큰 전달 경로의 확실성을 위해 직접 호출 권장
- **GitHub Actions permissions**: deploy 잡에만 `id-token: write` + `contents: read` 추가
- **제거 대상**: `.npmrc` 수동 설정 스텝, `NODE_AUTH_TOKEN` 환경변수, `NPM_TOKEN` 시크릿 (검증 후)

**사용하지 않아야 할 것들:**
- `actions/attest-build-provenance`: npm CLI가 Sigstore 서명 내장, 불필요
- top-level `id-token: write`: 최소 권한 원칙 위반
- publish-check 잡에서 `--provenance` 플래그: dry-run + provenance 비호환

### 필요 기능 (Feature Landscape)

**필수 (Table Stakes):**
- 8개 패키지 Trusted Publisher 등록 — OIDC 인증의 전제 조건, 패키지별 수동 등록 필수
- `id-token: write` 권한 추가 (deploy 잡 레벨) — OIDC JWT 발급 필수
- Provenance 자동 생성 (`--provenance` 플래그) — 공급망 보안의 핵심 가치
- NPM_TOKEN 시크릿 제거 + `.npmrc` 스텝 제거 — 전환의 보안 목적
- npm CLI >=11.5.1 확보 — OIDC 토큰 교환 최소 요구사항
- `repository.url` 정합성 보장 — Sigstore 검증 필수 (CRITICAL, 현재 불일치)

**차별화 기능 (Differentiators):**
- npm 패키지 페이지 Provenance 배지 — `--provenance` 사용 시 자동 표시, 추가 작업 불필요
- GitHub Environment(`production`) 연동 — 이미 deploy 잡에 설정, npmjs.com에도 등록하면 이중 보호
- `publishConfig.provenance: true` in package.json — 선택적이나 의도 명확화에 유용

**구현하지 않을 것 (Anti-Features):**
- NPM_TOKEN 병행 유지(fallback): 전환 검증 후 즉시 제거
- publish-check에서 `--provenance` 강제: OIDC 없는 환경에서 예측 불가 동작
- reusable workflow로 publish 로직 분리: Trusted Publisher 매칭이 caller workflow 기준이라 복잡도 증가
- `.npmrc` 수동 생성 유지: OIDC 모드에서 `_authToken` 불필요, 충돌 위험

**연기할 것:**
- `npm trust` CLI 스크립트화: 일회성 작업이므로 웹 UI 수동 등록으로 충분
- publish-check에서 repository.url 사전 검증 스크립트: dry-run의 OIDC 동작이 불명확

### 아키텍처 접근 방식

기존 6-job 파이프라인 구조는 **그대로 유지**되며, deploy 잡만 수정된다. OIDC 인증 흐름은 GitHub Actions Runner → npm CLI → npm Registry → Sigstore 순으로 진행되며, npm CLI가 OIDC 환경을 자동 감지하여 토큰 교환을 수행한다. `NODE_AUTH_TOKEN`이 설정되어 있으면 OIDC 대신 토큰 인증으로 폴백되므로 반드시 제거해야 한다.

**변경되는 컴포넌트:**
1. **deploy job (release.yml)** — permissions 추가, npm upgrade 스텝, publish 명령어 변경, Setup npmrc 제거
2. **9개 package.json** — repository.url을 `git+https://github.com/minhoyoo-iotrust/WAIaaS.git`으로 수정
3. **npmjs.com 각 패키지 설정** — 8개 패키지에 Trusted Publisher 수동 등록 (패키지별 2FA 필요)
4. **GitHub Secrets** — NPM_TOKEN 시크릿 삭제 (검증 후)

**변경되지 않는 컴포넌트:**
- test, chain-integration, platform, docker-publish, publish-check 잡
- release-please.yml, ci.yml, nightly.yml 워크플로
- pnpm, Node.js 버전

**핵심 OIDC 데이터 흐름:**
```
GitHub OIDC Provider -> JWT (repo, workflow, environment claims)
  -> npm CLI 자동 감지 -> npm Registry 제출
  -> Trusted Publisher 규칙 매칭 -> 단기 API 토큰 교환
  -> 패키지 발행 + Sigstore 서명 (Fulcio + Rekor)
  -> npm 패키지 페이지 provenance 배지 자동 표시
```

### 핵심 함정 (Top 5)

1. **repository.url 불일치 (CRITICAL)** — `minho-yoo/waiaas` -> `minhoyoo-iotrust/WAIaaS` 수정 필수. Phase 1에서 가장 먼저 수행. 불일치 시 422 에러로 전체 발행 실패.

2. **npm CLI 버전 부족 (CRITICAL)** — deploy 잡에 `npm install -g npm@latest` 스텝 추가. Node 22 번들 npm이 11.5.1 미만이면 OIDC 토큰 교환 404 에러 발생.

3. **id-token 퍼미션 배치 오류 (CRITICAL)** — deploy 잡에 `contents: read` + `id-token: write` 모두 명시. job-level permissions는 top-level을 override하므로 contents: read 누락 시 checkout 실패.

4. **NPM_TOKEN 조기 제거 (CRITICAL)** — OIDC 검증 완료(최소 2회 성공 릴리스) 후에만 제거. 조기 제거 시 롤백 수단 상실.

5. **dry-run + provenance 비호환 (MODERATE)** — publish-check 잡에서 `--provenance` 플래그 사용 금지. OIDC 토큰 없는 환경에서 에러 발생 또는 의도치 않은 Sigstore 기록.

## Implications for Roadmap

의존성 체인 기반 3단계 구조 권장:

```
repository.url 수정 -> Trusted Publisher 등록 -> release.yml 수정 -> E2E 검증 -> 정리
```

### Phase 1: 선행 조건 확보 (Package Metadata + 수동 등록)

**Rationale:** repository.url 수정은 모든 것의 전제 조건. 이 수정 없이 OIDC 전환 시 provenance 검증이 즉시 실패한다. npmjs.com 등록은 CI와 독립적으로 수행 가능하며, 등록만으로는 기존 발행에 영향 없다.

**Delivers:**
- 9개 package.json의 repository.url이 실제 GitHub 원격과 일치
- 8개 패키지의 npmjs.com Trusted Publisher 등록 완료 (체크리스트 검증)

**Addresses:** Table stakes의 repository.url 정합성, Trusted Publisher 등록

**Avoids:** Pitfall 1 (repository.url 불일치), Pitfall 3 (패키지 누락 등록), Pitfall 7/8 (필드값 불일치)

**주요 작업:**
- 9개 package.json: `"url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git"` + homepage URL 수정
- npmjs.com에서 8개 패키지 각각 Trusted Publisher 등록
  - Organization: `minhoyoo-iotrust`, Repository: `WAIaaS`, Workflow: `release.yml`, Environment: `production`
  - 대소문자 정확 매칭, 체크리스트 + 스크린샷으로 검증

### Phase 2: OIDC 전환 (release.yml 수정)

**Rationale:** Phase 1 완료 후 실제 파이프라인 변경. deploy 잡에 최소 변경만 적용하여 위험 최소화. NPM_TOKEN은 이 단계에서 아직 유지 (롤백 대비).

**Delivers:**
- release.yml deploy 잡의 OIDC 인증 전환 완료
- `--provenance` 플래그로 Sigstore 서명 및 npm 배지 활성화
- publish-check 잡은 기존 그대로 유지 (dry-run + provenance 비호환 방지)

**Uses:** npm CLI >=11.5.1, `id-token: write` + `contents: read` job-level permissions

**Implements:** OIDC 데이터 흐름 전체 (JWT 발급 -> 토큰 교환 -> 패키지 발행 -> Sigstore 서명)

**deploy 잡 변경 요약:**
- `permissions: { contents: read, id-token: write }` 추가 (job-level)
- "Upgrade npm for OIDC" 스텝 추가 (`npm install -g npm@latest`)
- "Setup npmrc" 스텝 제거
- `pnpm publish --access public --no-git-checks` -> `npm publish --provenance --access public`
- `NODE_AUTH_TOKEN` 환경변수 제거

**Avoids:** Pitfall 2 (npm CLI 버전), Pitfall 4 (id-token 퍼미션 배치), Pitfall 6 (dry-run + provenance), Pitfall 9 (scoped 패키지 OIDC 404)

### Phase 3: 검증 및 정리

**Rationale:** 실제 릴리스로 E2E 검증 후, 장기 시크릿 제거로 전환 완료. NPM_TOKEN은 검증 완료 후에만 제거하여 롤백 가능성 유지.

**Delivers:**
- npm 패키지 페이지 provenance 배지 확인
- NPM_TOKEN 시크릿 완전 제거로 보안 강화 완료
- Deploy summary에 provenance 정보 추가

**Avoids:** Pitfall 5 (NPM_TOKEN 조기 제거)

**검증 체크리스트:**
- 8개 패키지 모두 발행 성공 확인
- npm 패키지 페이지에서 "Built and signed on GitHub Actions" 배지 확인
- provenance 상세에서 소스 저장소, 커밋, 워크플로 링크 정확성 확인
- 최소 2회 성공 릴리스 후 NPM_TOKEN 제거

### Phase 순서 근거

- **Phase 1 선행 필수:** repository.url 불일치는 즉각적 발행 실패를 유발하며, npmjs.com 등록은 기존 발행에 영향 없이 선행 가능
- **Phase 2는 Phase 1 완료 후:** Trusted Publisher 미등록 상태에서 OIDC 전환 시 404 에러 불가피
- **NPM_TOKEN은 마지막:** OIDC 검증 완료 전 제거 시 롤백 불가
- **publish-check 잡은 건드리지 않음:** dry-run은 OIDC와 무관하게 동작하며, provenance 추가 시 오히려 파이프라인이 깨짐

### Research Flags

**표준 패턴 (추가 리서치 불필요):**
- **Phase 1 (package.json 수정):** 단순 텍스트 수정, 확립된 패턴
- **Phase 2 (release.yml 수정):** npm 공식 문서 + 다수 실전 블로그에서 충분히 검증된 패턴
- **Phase 3 (정리):** 표준 정리 작업

**실행 중 확인이 필요한 사항:**
- `actions/setup-node@v4` + `node-version: 22`가 제공하는 실제 npm 버전 (`npm --version`으로 확인)
- 첫 OIDC 릴리스를 rc 버전으로 진행하여 `--provenance --tag rc` 조합 검증

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm 공식 문서 + nodejs/node#58423 + pnpm/pnpm#9812 교차 검증 |
| Features | HIGH | npm 공식 문서 + 다수 1차 소스 교차 검증. Classic token 폐기 타임라인 공식 확인 |
| Architecture | HIGH | npm/cli 이슈 트래커 + GitHub 공식 문서 + 실전 블로그 다수 일치 |
| Pitfalls | HIGH | npm/cli#8036, #8678, #7654, #8730 실제 버그 리포트 + Phil Nash 실전 가이드 교차 확인 |

**Overall confidence:** HIGH

### Gaps to Address

- **pnpm publish OIDC 위임 신뢰도 (MEDIUM):** pnpm maintainer가 "npm publish에 위임"을 확인했으나, 정확한 OIDC 토큰 전달 경로는 pnpm 버전에 따라 다를 수 있음. npm publish 직접 호출로 위험 제거.

- **순차 발행 중 OIDC 토큰 재교환 (MEDIUM):** 각 `npm publish` 호출마다 개별 OIDC 토큰 교환이 발생하는 것으로 문서 확인됨. 단, 8개 패키지 순차 발행에서의 실제 동작은 첫 릴리스에서 검증.

- **pre-release + provenance 조합 (MEDIUM):** `--provenance --tag rc` 조합은 이론적으로 호환되나, WAIaaS 파이프라인에서 실제 검증 미완료. 첫 OIDC 릴리스를 rc 버전으로 진행하여 확인.

- **Node 22 최신 번들 npm 버전 (MEDIUM):** Node 22.14.0이 npm 11.2.0을 번들한다고 알려져 있으나, 최신 22.x가 11.5.1 이상을 제공하는지 실행 시 `npm --version`으로 확인 필요.

## Sources

### Primary (HIGH confidence)
- [npm Trusted Publishing 공식 문서](https://docs.npmjs.com/trusted-publishers/)
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/)
- [npm-trust CLI 문서](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [GitHub Actions OIDC Permissions 공식 문서](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)

### Secondary (MEDIUM confidence)
- [Phil Nash: Things you need to do for npm trusted publishing to work (2026-01)](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/) — 실전 필수 체크리스트
- [remarkablemark: How to set up trusted publishing for npm (2025-12)](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/)
- [vcfvct: Publishing to npm with GitHub Actions + OIDC (2026-01)](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/)
- [MakerX: Catch up on the new NPM Trusted Publishing feature](https://blog.makerx.com.au/catch-up-on-the-new-npm-trusted-publishing-feature/)
- [Sigstore: npm provenance GA](https://blog.sigstore.dev/npm-provenance-ga/)

### Issues & Discussions (HIGH confidence)
- [pnpm/pnpm#9812: OIDC 지원 (pnpm은 npm publish 내부 위임으로 동작 확인)](https://github.com/pnpm/pnpm/issues/9812)
- [npm/cli#8036: repository.url 불일치 provenance 에러](https://github.com/npm/cli/issues/8036)
- [npm/cli#8678: Scoped 패키지 OIDC 404 버그 (11.5.1에서 수정)](https://github.com/npm/cli/issues/8678)
- [npm/cli#7654: dry-run에서도 provenance 생성 버그](https://github.com/npm/cli/issues/7654)
- [nodejs/node#58423: Node.js v22에 npm v11 병합](https://github.com/nodejs/node/issues/58423)
- [GitHub community #176761: NPM publish using OIDC](https://github.com/orgs/community/discussions/176761)
- [GitHub Discussion #179562: Classic token 제거 타임라인](https://github.com/orgs/community/discussions/179562)

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
