# Feature Landscape: npm Trusted Publishing OIDC 전환

**Domain:** CI/CD Supply Chain Security -- npm Trusted Publishing (OIDC)
**Researched:** 2026-02-18
**Overall confidence:** HIGH (공식 문서 + 다수 1차 소스 교차 검증)

---

## Table Stakes

사용자(소비자/감사자)가 기대하는 기본 기능. 누락 시 전환의 의미가 없음.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 8개 패키지 Trusted Publisher 등록 | OIDC 인증의 전제 조건. 미등록 패키지는 OIDC로 발행 불가 | Low | npmjs.com 웹 UI에서 패키지별 수동 등록. `npm trust github-actions` CLI로 스크립트화 가능 (npm >=11.5.1) |
| `id-token: write` 권한 추가 | OIDC 토큰 생성의 필수 퍼미션. 없으면 GitHub가 OIDC JWT를 발급하지 않음 | Low | deploy 잡에만 추가 (최소 권한 원칙) |
| Provenance 자동 생성 | Trusted Publishing 사용 시 npm CLI가 provenance를 자동 생성. 공급망 보안의 핵심 가치 | Low | npm >=11.5.1에서 Trusted Publishing 사용 시 `--provenance` 플래그 없이도 자동 생성. 단, 명시적 `--provenance` 또는 `NPM_CONFIG_PROVENANCE=true` 권장 (필드 누락 방지) |
| NPM_TOKEN 시크릿 제거 | 전환의 핵심 목표. 장기 시크릿 제거로 유출 위험 원천 차단 | Low | `.npmrc` Setup 스텝도 함께 제거 |
| npm CLI >=11.5.1 확보 | OIDC Trusted Publishing의 최소 npm 버전 요구사항 | Low | Node.js 22 LTS 최신(22.22.0+)은 npm 11.8.0 번들. `actions/setup-node@v4` + `node-version: 22`로 충분. 구 버전 Node 22는 npm 10이므로 `npm install -g npm@latest` 필요할 수 있음 |
| Pre-release (rc tag) 발행 호환 | 현재 `--tag rc` 사용 중. OIDC/provenance와 `--tag rc` 조합 필수 | Low | `--provenance --tag rc --access public` 조합 호환 확인됨. npm은 dist-tag과 provenance를 독립 처리 |
| `repository.url` 정합성 보장 | Sigstore가 OIDC 토큰의 source repository URI와 package.json `repository.url`을 대조. 불일치 시 422 에러 | **CRITICAL** | **현재 package.json: `minho-yoo/waiaas.git`, 실제 remote: `minhoyoo-iotrust/WAIaaS`**. 대소문자 + org 이름 불일치. 반드시 수정 필요 |
| monorepo `directory` 필드 유지 | 모노레포 패키지의 출처를 정확히 식별. 이미 설정되어 있으므로 유지만 확인 | Low | 8개 패키지 모두 `"directory": "packages/..."` 설정 완료 상태 |

---

## Differentiators

기대하지는 않지만 있으면 supply chain 보안 수준을 한 단계 높이는 기능.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| npm 패키지 페이지 Provenance 배지 | 버전 번호 옆 녹색 체크마크 + "Built and signed on GitHub Actions" 표시. 소비자 신뢰도 향상 | Free | provenance 생성 시 자동 표시. 추가 작업 불필요 |
| `publishConfig.provenance: true` in package.json | CLI 플래그 의존 제거. 어떤 환경에서든 provenance 생성 보장 | Low | 8개 package.json에 추가. NPM_CONFIG_PROVENANCE 환경변수 대비 더 명시적 |
| GitHub Environment (`production`) 연동 | 환경 보호 규칙(manual approval)과 OIDC 스코프를 결합. 승인 없이는 발행 불가 | Low | 현재 deploy 잡이 이미 `environment: production` 사용. npm Trusted Publisher 등록 시 Environment 필드에 `production` 지정하면 이중 보호 |
| `npm trust` CLI로 설정 스크립트화 | 8개 패키지 수동 등록 대신 스크립트로 일괄 등록. 재현 가능성 확보 | Med | `npm trust github-actions @waiaas/core --repository minhoyoo-iotrust/WAIaaS --workflow release.yml --environment production --yes` 형태. npm login 필요 |
| Deploy summary에 provenance 정보 추가 | $GITHUB_STEP_SUMMARY에 provenance 링크 포함. 릴리스 검증 편의 | Low | 각 패키지 발행 후 npmjs.com 링크 출력 |
| publish-check에서 repository.url 사전 검증 | dry-run 단계에서 repository.url 정합성 오류 조기 발견 | Med | repository.url vs GitHub 환경변수 비교 스크립트 추가 |

---

## Anti-Features

명시적으로 구현하지 않아야 하는 것.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Top-level `id-token: write` 퍼미션 | 6개 잡 중 deploy만 OIDC 필요. 나머지 잡에 불필요한 권한 부여는 최소 권한 원칙 위반 | deploy 잡에만 `permissions.id-token: write` 추가 |
| NPM_TOKEN 병행 유지 (fallback) | 전환의 보안 이점을 무효화. "장기 시크릿 제거"가 핵심 목표 | 전환 완료 후 즉시 제거. fallback 기간 불필요 (dry-run 검증으로 충분) |
| publish-check에서 `--provenance` 강제 | dry-run은 OIDC 토큰 없이 실행됨. `--provenance`가 OIDC 미감지 시 예측 불가 동작 | publish-check에서는 `--provenance` 제외. 대신 `repository.url` 검증 스크립트 추가 |
| Self-hosted runner 사용 | npm Trusted Publishing은 현재 cloud-hosted runner만 지원. self-hosted에서 OIDC 토큰 검증 실패 | `runs-on: ubuntu-latest` 유지 (현재 상태 그대로) |
| Reusable workflow로 publish 로직 분리 | npm Trusted Publisher가 "caller workflow" 파일명을 기준으로 매칭. reusable workflow 사용 시 workflow 파일명이 caller여야 함 -- 복잡도 증가 | 현재처럼 release.yml 단일 파일에 deploy 잡 유지 |
| `.npmrc` 수동 생성 유지 | OIDC 모드에서는 `.npmrc`의 `_authToken`이 불필요. npm CLI가 OIDC 환경을 자동 감지 | `Setup npmrc` 스텝 완전 제거 |
| 토큰 없이 `npm whoami` 검증 | OIDC 모드에서 `npm whoami`는 401 반환 (정상 동작). 이를 에러로 처리하면 파이프라인 실패 | whoami 검증 스텝이 있다면 제거 또는 조건부 스킵 |

---

## Feature Dependencies

```
repository.url 수정 (8개 package.json) ──┐
                                          ├── npm Trusted Publisher 등록 (8개)
npm CLI >=11.5.1 확보 ────────────────────┘        │
                                                    │
id-token: write 퍼미션 추가 ───────────────────────┤
                                                    │
                                                    v
                                            pnpm publish --provenance 실행
                                                    │
                                                    v
                                            Provenance 배지 표시 (자동)
                                                    │
NPM_TOKEN 제거 ←── 전환 성공 확인 후 ──────────────┘
.npmrc 스텝 제거 ←──┘
```

**핵심 의존성 체인:**
1. `repository.url` 수정이 모든 것의 전제 (Sigstore 검증 실패 방지)
2. Trusted Publisher 등록 + id-token 퍼미션이 OIDC 발행의 전제
3. NPM_TOKEN 제거는 반드시 전환 성공 확인 **이후**

---

## MVP Recommendation

**Phase 1 (선행 조건):**
1. **repository.url 수정** -- 8개 package.json의 `repository.url`을 실제 GitHub remote (`https://github.com/minhoyoo-iotrust/WAIaaS`) 와 정확히 일치하도록 수정. 대소문자 포함 정확 매칭 필수.
2. **npm CLI 버전 확인** -- `actions/setup-node@v4` + `node-version: 22`가 npm >=11.5.1을 제공하는지 확인. 부족 시 `npm install -g npm@latest` 스텝 추가.

**Phase 2 (핵심 전환):**
1. **8개 패키지 Trusted Publisher 등록** -- npmjs.com에서 수동 등록 또는 `npm trust github-actions` CLI 사용
2. **release.yml deploy 잡 수정** -- `id-token: write` + `--provenance` 추가, `.npmrc` 스텝 제거
3. **publishConfig.provenance: true** -- 8개 package.json에 추가 (선택이지만 권장)

**Phase 3 (정리 + 검증):**
1. **실제 릴리스로 E2E 검증** -- rc 릴리스로 전체 파이프라인 테스트
2. **NPM_TOKEN 시크릿 제거** -- 전환 성공 확인 후
3. **Deploy summary 업데이트** -- provenance 정보 포함

**Defer:**
- `npm trust` CLI 스크립트화: 일회성 작업이므로 웹 UI 수동 등록으로 충분. 추후 패키지 추가 시 고려.
- publish-check provenance 사전 검증: dry-run 환경에서의 OIDC 동작이 불명확. repository.url 검증 스크립트만 추가.

---

## 모노레포 특수 고려사항 (8개 패키지)

| Concern | Status | Action Needed |
|---------|--------|---------------|
| 패키지별 Trusted Publisher 등록 | 각 패키지 개별 등록 필수 | 8회 반복 (org 단위 일괄 등록 미지원) |
| 동일 workflow/environment 공유 | 가능 | 8개 모두 `release.yml` + `production` 환경으로 동일 설정 |
| 순차 발행 시 OIDC 토큰 재사용 | pnpm이 내부적으로 npm publish 호출. OIDC 토큰은 워크플로 레벨에서 유효 | 단일 잡 내 8개 순차 발행은 문제 없음 |
| repository.url + directory 조합 | Sigstore가 repository.url만 검증, directory는 메타데이터 | directory 필드 유지 (현재 설정 OK) |
| pnpm의 OIDC 지원 현황 | pnpm publish가 내부적으로 npm publish 호출하므로 동작함 | npm >=11.5.1이 시스템에 있으면 OK. `NPM_CONFIG_PROVENANCE=true` 환경변수로 설정 권장 |

---

## OIDC 토큰 교환 플로우 상세

```
1. GitHub Actions 런타임이 OIDC JWT 생성
   - Claims: repository, workflow, environment, ref, sha 등

2. npm CLI가 OIDC 환경 자동 감지
   - id-token: write 퍼미션 확인
   - ACTIONS_ID_TOKEN_REQUEST_URL 환경변수 존재 확인

3. npm CLI -> npm registry: OIDC JWT 전송
   - registry가 JWT 서명을 GitHub OIDC provider 공개키로 검증
   - JWT claims를 패키지의 Trusted Publisher 설정과 매칭
     (owner, repository, workflow file, environment)

4. npm registry -> npm CLI: 단기 publish 토큰 발급
   - 해당 워크플로 실행에만 유효한 scoped 토큰

5. npm CLI: 패키지 발행 + Sigstore 서명
   - Fulcio에서 단기 서명 인증서 획득
   - 패키지 tarball + 메타데이터에 서명
   - Rekor 투명성 로그에 기록

6. npm registry: 서버측 검증
   - Sigstore 번들 검증
   - certificate의 sourceRepositoryURI와 package.json repository.url 대조
   - 검증 성공 시 publish attestation 생성
```

---

## Provenance 메타데이터 상세

npm 패키지 provenance는 **SLSA Build Level 2** 달성 (HIGH confidence -- 공식 문서 + deps.dev 확인).

**Provenance Statement 포함 내용:**
- Source repository URI (GitHub repo URL)
- Source commit SHA
- Build workflow URI (GitHub Actions workflow)
- Build invocation URI (특정 workflow run URL)
- Builder ID (GitHub Actions runner)
- SLSA predicate (v0.2 또는 v1.0)

**npm 패키지 페이지 표시:**
- 버전 번호 옆 녹색 체크마크 배지
- "Built and signed on GitHub Actions" 텍스트
- 클릭 시 provenance 상세: 소스 저장소, 커밋, 워크플로 링크
- Sigstore Rekor 투명성 로그 링크

**검증 체인:**
- Sigstore Fulcio (서명 인증서) + Rekor (투명성 로그)
- npm 설치 시 자동 검증 (향후 `npm audit signatures` 강화 예정)

---

## `--dry-run` + `--provenance` 호환성

| 환경 | 동작 | 권장 |
|------|------|------|
| OIDC 있는 환경 (deploy 잡) | dry-run + provenance 모두 동작하나, 실제 발행 안 함 | 불필요 (실제 발행에서 검증) |
| OIDC 없는 환경 (publish-check 잡) | provenance 검증을 건너뛰거나 예측 불가 동작 | **publish-check에서 `--provenance` 제외** |
| 로컬 개발 환경 | OIDC 토큰 없음. provenance 생성 실패 가능 | `--provenance` 없이 dry-run |

**결론**: publish-check 잡에서는 현재처럼 `pnpm publish --dry-run --no-git-checks`만 유지. provenance 검증은 deploy 잡의 실제 발행에서 수행.

---

## Classic Token 폐지 타임라인 (긴급성 근거)

| Date | Event |
|------|-------|
| 2025-11-05 | Classic token 신규 생성 비활성화 |
| 2025-12-09 | **Classic token 영구 폐기** -- 모든 기존 classic token 작동 중지 |
| 현재 (2026-02) | Classic token 완전 불가. Granular token (90일 만료) 또는 Trusted Publishing 필수 |

**WAIaaS 현황**: `NPM_TOKEN`이 classic token이었다면 이미 작동하지 않음. Granular token으로 교체되었을 가능성이 있으나, Trusted Publishing 전환이 장기적으로 관리 부담 최소화 (토큰 회전 불필요).

---

## Trusted Publisher 등록 필드 상세 (npmjs.com)

각 패키지 (`npmjs.com/package/@waiaas/<name>/access`)에서 설정:

| Field | Value | Notes |
|-------|-------|-------|
| Provider | GitHub Actions | 드롭다운 선택 |
| Owner | `minhoyoo-iotrust` | **대소문자 정확 매칭 필수** |
| Repository | `WAIaaS` | **대소문자 정확 매칭 필수** |
| Workflow | `release.yml` | `.yml` 확장자 포함, 파일명만 (경로 제외) |
| Environment | `production` | 선택사항이나 deploy 잡이 이미 사용 중이므로 설정 권장 |

**8개 패키지 모두 동일한 값으로 등록** (모노레포이므로 repo/workflow/environment 동일).

---

## Sources

### 공식 문서 (HIGH confidence)
- [npm Trusted Publishing docs](https://docs.npmjs.com/trusted-publishers/)
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/)
- [npm-trust CLI docs](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [npm/provenance GitHub](https://github.com/npm/provenance)

### 기술 가이드 (MEDIUM confidence)
- [Phil Nash -- Things you need to do for npm trusted publishing to work](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [leechael -- npm Trusted Publishers: The Complete Guide](https://leechael.org/posts/2025/npm-trusted-publishers-the-complete-guide/)
- [remarkablemark -- How to set up trusted publishing for npm](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/)
- [Speakeasy -- Securing Your NPM Publishing](https://www.speakeasy.com/blog/npm-trusted-publishing-security)
- [MakerX -- Catch up on npm Trusted Publishing](https://blog.makerx.com.au/catch-up-on-the-new-npm-trusted-publishing-feature/)
- [robino.dev -- NPM Trusted Publishing](https://blog.robino.dev/posts/npm-trusted-publishing)

### pnpm OIDC 지원 (MEDIUM confidence)
- [pnpm/pnpm#9812 -- Support OIDC publishing](https://github.com/pnpm/pnpm/issues/9812) -- pnpm publish가 내부적으로 npm publish 호출하므로 동작 확인

### Provenance / SLSA (HIGH confidence)
- [deps.dev -- npm SLSA provenance support](https://blog.deps.dev/npm-provenance/)
- [SLSA -- Node.js ecosystem](https://slsa.dev/blog/2023/05/bringing-improved-supply-chain-security-to-the-nodejs-ecosystem)
- [Sigstore -- npm provenance GA](https://blog.sigstore.dev/npm-provenance-ga/)
- [tsmx -- Built and signed on GitHub Actions](https://tsmx.net/npmjs-built-and-signed-on-github-actions/)

### Classic Token 폐기 (HIGH confidence)
- [GitHub Discussion #179562 -- Classic token removal Dec 9](https://github.com/orgs/community/discussions/179562)
- [npm/cli#8036 -- repository.url provenance conflict](https://github.com/npm/cli/issues/8036)
