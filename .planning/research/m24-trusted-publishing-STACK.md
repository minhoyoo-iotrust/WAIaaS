# Technology Stack: npm Trusted Publishing (OIDC) 전환

**Project:** WAIaaS m24 - npm Trusted Publishing
**Researched:** 2026-02-18
**Overall Confidence:** HIGH

---

## 핵심 발견 요약

npm Trusted Publishing은 GitHub Actions OIDC 토큰으로 npm 레지스트리에 인증하여 장기 시크릿(NPM_TOKEN) 없이 패키지를 발행하는 보안 강화 메커니즘이다. **새로운 라이브러리나 도구 설치가 거의 불필요하며, 기존 워크플로 설정 변경만으로 전환 가능하다.**

---

## 필수 스택 변경사항

### 1. npm CLI 업그레이드 (CRITICAL)

| 항목 | 현재 | 필요 | 비고 |
|------|------|------|------|
| npm CLI | v10.x (Node 22 기본 번들) | **>=11.5.1** | Trusted Publishing OIDC 핸드셰이크 필수 |
| Node.js | 22.x (setup-node@v4) | **22.x (유지)** | npm만 업그레이드하면 됨 |

**왜 필요한가:** npm Trusted Publishing의 OIDC 토큰 교환 프로토콜은 npm CLI 11.5.1에서 구현되었다. Node.js 22는 npm 11을 번들하지만(nodejs/node#58423), 정확한 서브 버전이 11.5.1 이상인지 보장되지 않으므로 명시적 업그레이드가 안전하다.

**구현 방법 (deploy 잡의 Setup 이후에 추가):**

```yaml
- name: Upgrade npm for Trusted Publishing
  run: |
    npm install -g npm@latest
    echo "npm version: $(npm --version)"
```

**Confidence: HIGH** -- npm 공식 문서, 다수 블로그(philna.sh, remarkablemark), GitHub 이슈에서 일관되게 확인됨.

---

### 2. npm publish 직접 사용 (pnpm publish 대체)

| 항목 | 현재 | 변경 후 | 근거 |
|------|------|---------|------|
| 발행 CLI | `pnpm publish` | `npm publish` | OIDC 토큰 교환 확실 |
| 빌드/테스트 | `pnpm turbo run build` | `pnpm turbo run build` (유지) | 빌드는 pnpm 유지 |
| dry-run 체크 | `pnpm publish --dry-run` | `pnpm publish --dry-run` (유지) | 발행 아닌 검증은 pnpm 유지 |

**왜 npm publish 직접 호출인가:**
- pnpm publish는 내부적으로 npm publish를 호출한다 (pnpm maintainer 확인, pnpm/pnpm#9812)
- 그러나 pnpm 9.x의 OIDC 지원은 npm CLI에 위임하는 방식으로, 위임 경로에서의 OIDC 토큰 전달이 모든 상황에서 보장되지 않음
- npm publish 직접 호출은 OIDC 토큰 교환이 확실히 동작하는 가장 안전한 경로
- `--no-git-checks` 플래그도 npm publish에서는 불필요 (npm은 기본적으로 git 검사하지 않음)

**Confidence: MEDIUM-HIGH** -- pnpm maintainer 발언으로 위임 구조 확인됨. 다만 직접 호출이 더 안전한 선택.

---

### 3. GitHub Actions 퍼미션 변경

| 항목 | 현재 | 변경 |
|------|------|------|
| Top-level permissions | `contents: read`, `packages: write` | 변경 없음 |
| deploy 잡 permissions | 없음 (top-level 상속) | **`contents: read`, `id-token: write` 추가** |

**최소 권한 원칙 적용:** `id-token: write`는 deploy 잡에만 추가한다. 다른 5개 잡(test, chain-integration, platform, publish-check, docker-publish)에는 불필요하다.

**중요:** deploy 잡에 job-level permissions를 설정하면 top-level permissions를 상속하지 않는다. 따라서 `contents: read`도 반드시 명시해야 한다. `packages: write`는 deploy 잡에서 불필요하므로 생략.

```yaml
deploy:
  permissions:
    contents: read
    id-token: write  # npm OIDC Trusted Publishing
```

**Confidence: HIGH** -- GitHub Actions 공식 문서, npm 공식 문서 모두 확인.

---

### 4. npm 레지스트리 인증 변경

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| .npmrc 생성 | `echo "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" > ~/.npmrc` | **제거** |
| NPM_TOKEN 시크릿 | `secrets.NPM_TOKEN` 사용 | **제거 (검증 후)** |
| NODE_AUTH_TOKEN env | deploy 잡에서 설정 | **제거** |

**OIDC 모드에서는 `.npmrc`에 auth token이 필요 없다.** npm CLI가 OIDC 환경을 자동 감지하여 토큰 교환을 수행한다. 오히려 기존 token 기반 `.npmrc`가 존재하면 OIDC 인증과 충돌하여 토큰 인증으로 폴백된다.

**주의:** `actions/setup-node`의 `registry-url` 옵션을 사용하면 기본 NODE_AUTH_TOKEN을 설정할 수 있다. 현재 setup action에서는 `registry-url`을 사용하지 않으므로 문제 없음.

**Confidence: HIGH** -- GitHub community discussion #176761, npm 공식 문서

---

### 5. Sigstore / SLSA Provenance

| 항목 | 설명 | 필요한 추가 도구 |
|------|------|-----------------|
| Sigstore 서명 | npm publish 시 자동 수행 | **없음** (npm CLI 내장) |
| SLSA Build L2 provenance | --provenance 플래그로 활성화 | **없음** (npm CLI 내장) |
| 투명성 로그 | Sigstore public good 서버에 자동 기록 | **없음** |
| Provenance 배지 | npm 패키지 페이지에 자동 표시 | **없음** |

**핵심:** 추가 도구가 **불필요**하다. npm CLI의 `--provenance` 플래그가 Sigstore 연동을 내장하고 있다. Trusted Publishing 사용 시 provenance가 자동 생성되지만, `--provenance` 플래그를 명시적으로 추가하는 것을 권장한다 (실패 시 명확한 에러 + 의도 명확화).

**Confidence: HIGH** -- npm 공식 문서 + Sigstore 공식 블로그 확인.

---

## 필요 없는 것들 (Anti-Stack)

| 도구/액션 | 왜 불필요한가 |
|-----------|-------------|
| `actions/attest-build-provenance` | npm CLI가 Sigstore 서명을 내장. GitHub Attestations는 별도 시스템 |
| `slsa-framework/slsa-verifier` | 소비자(verifier) 도구. 발행자에게 불필요 |
| `@jsdevtools/npm-publish` | 자체 auth 로직이 OIDC와 충돌 가능 |
| `azu/setup-npm-trusted-publish` | 초기 패키지 발행용 헬퍼. 이미 발행된 패키지에는 불필요 |
| `semantic-release` | 이미 release-please 사용 중 |
| pnpm 10 업그레이드 | npm CLI만 업그레이드하면 됨 |
| Node.js 24 업그레이드 | Node 22 + npm@latest 업그레이드로 충분 |

---

## npmjs.com 패키지별 설정 (8개 모두 동일)

| 필드 | 값 | 비고 |
|------|-----|------|
| Publisher | GitHub Actions | |
| Owner | `minhoyoo-iotrust` | GitHub org 이름 (대소문자 정확히 일치) |
| Repository | `WAIaaS` | 레포 이름 (대소문자 정확히 일치) |
| Workflow | `release.yml` | .yml 확장자 포함 |
| Environment | `production` | deploy 잡의 `environment: production`과 일치 |

**중요:** npmjs.com은 설정 시 검증하지 않는다. 오류는 실제 publish 시에만 나타난다. 대소문자, 파일명, environment 이름이 정확히 일치해야 한다.

---

## package.json repository URL 수정 (CRITICAL)

### 현재 상태 (불일치 발견)

| 항목 | 현재 값 | 실제 값 |
|------|--------|--------|
| package.json repository.url | `https://github.com/minho-yoo/waiaas.git` | - |
| git remote origin | `git@github.com:minhoyoo-iotrust/WAIaaS.git` | - |
| 일치 여부 | **불일치** | provenance 실패 위험 |

### 수정 필요

9개 package.json (8개 publishable + admin)의 repository.url을 수정:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git",
    "directory": "packages/core"
  },
  "homepage": "https://github.com/minhoyoo-iotrust/WAIaaS#readme"
}
```

**변경 사항:**
1. `minho-yoo/waiaas` → `minhoyoo-iotrust/WAIaaS` (실제 GitHub repo)
2. `https://` → `git+https://` (npm 권장 형식)

**Confidence: HIGH** -- 다수 소스에서 repository URL 불일치가 provenance/publish 실패의 주요 원인으로 보고

---

## 대안 검토

| 카테고리 | 추천 | 대안 | 왜 대안을 선택하지 않는가 |
|---------|------|------|------------------------|
| 발행 CLI | `npm publish` 직접 | `pnpm publish` 위임 | OIDC 토큰 전달 경로 확실성 |
| npm CLI 업그레이드 | `npm install -g npm@latest` | Node.js 24로 전환 | Node 22 LTS 유지가 안정적 |
| Provenance 설정 | `--provenance` 플래그 | `publishConfig.provenance: true` | 워크플로 1곳 수정이 8개 package.json 수정보다 간단 |
| Provenance 설정 | `--provenance` 플래그 | `NPM_CONFIG_PROVENANCE=true` 환경변수 | 환경변수는 의도치 않은 영향 가능 |

---

## 버전 요약

| 도구 | 현재 버전 | 필요 버전 | 변경 필요 |
|------|----------|----------|----------|
| pnpm | 9.15.4 | 9.15.4 (유지) | 아니오 |
| Node.js | 22.x | 22.x (유지) | 아니오 |
| npm CLI | ~10.x (Node 22 번들) | **>=11.5.1** | **예 (CI에서만)** |
| actions/checkout | v4 | v4 | 아니오 |
| actions/setup-node | v4 | v4 | 아니오 |
| pnpm/action-setup | v4 | v4 | 아니오 |

---

## Sources

### 공식 문서 (HIGH confidence)
- [npm Trusted Publishing Docs](https://docs.npmjs.com/trusted-publishers/)
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/)
- [pnpm publish CLI docs](https://pnpm.io/cli/publish)

### GitHub Issues (HIGH confidence)
- [pnpm/pnpm#9812 - OIDC Trusted Publishing Support](https://github.com/pnpm/pnpm/issues/9812) (Closed as completed)
- [nodejs/node#58423 - Update npm to v11 in Node.js v22](https://github.com/nodejs/node/issues/58423) (Closed)
- [GitHub community #176761 - NPM publish using OIDC](https://github.com/orgs/community/discussions/176761)

### 검증된 가이드 (MEDIUM confidence)
- [Phil Nash - Things you need to do for npm trusted publishing to work](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [remarkablemark - How to set up trusted publishing](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/)
- [npmdigest - npm Trusted Publishing OIDC Setup Guide](https://npmdigest.com/guides/npm-trusted-publishing)
- [vcfvct - Publishing to npm with GitHub Actions + OIDC](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/)
