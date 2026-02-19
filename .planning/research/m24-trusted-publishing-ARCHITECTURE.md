# Architecture: npm Trusted Publishing (OIDC) 전환

**Domain:** CI/CD 파이프라인 보안 -- npm 발행 인증 방식 OIDC 전환
**Researched:** 2026-02-18
**Confidence:** HIGH (npm 공식 문서 + 다수 실전 블로그 + pnpm 이슈 트래커 교차 검증)

---

## 현재 아키텍처 (AS-IS)

```
release.yml (6 jobs)
├── test           ─── 테스트 + 커버리지 게이트
├── chain-integration ─ 블록체인 통합 테스트
├── platform       ─── 플랫폼 테스트 + Docker 빌드 검증
├── publish-check  ─── pnpm publish --dry-run (8 packages)
├── docker-publish ─── GHCR + Docker Hub push
└── deploy         ─── [production 환경, 수동 승인]
    ├── Setup npmrc (NPM_TOKEN → ~/.npmrc)
    ├── pnpm publish loop (8 packages, --access public)
    └── Deploy summary

인증 흐름:
  GitHub Secrets (NPM_TOKEN, 장기 토큰)
    → ~/.npmrc에 authToken 기록
    → pnpm publish가 .npmrc 읽어서 인증
    → npm 레지스트리에 패키지 발행
```

**문제점:**
- NPM_TOKEN은 만료 없는 장기 시크릿 (유출 시 임의 발행 가능)
- 토큰 회전 관리 부담
- 빌드 출처 증명(provenance) 없음
- npm이 Classic Automation Token → Trusted Publishing 전환 권장

---

## 목표 아키텍처 (TO-BE)

```
release.yml (6 jobs, 구조 변경 없음)
├── test           ─── [변경 없음]
├── chain-integration ─ [변경 없음]
├── platform       ─── [변경 없음]
├── publish-check  ─── pnpm publish --dry-run (--provenance 제외)
├── docker-publish ─── [변경 없음]
└── deploy         ─── [production 환경, 수동 승인]
    ├── permissions: { contents: read, id-token: write }  ← 추가
    ├── npm upgrade (npm >=11.5.1 보장)                    ← 추가
    ├── npm publish --provenance loop (8 packages)         ← 변경
    └── Deploy summary

인증 흐름:
  GitHub OIDC Provider (런타임 JWT 발급)
    → npm CLI가 OIDC 환경 자동 감지
    → OIDC JWT를 npm 레지스트리에 제출
    → npm이 JWT 서명 검증 + Trusted Publisher 규칙 매칭
    → 단기 npm API 토큰 교환
    → 패키지 발행 + provenance 자동 생성
```

---

## 컴포넌트 경계 및 변경 범위

### 변경이 필요한 컴포넌트

| 컴포넌트 | 변경 유형 | 설명 |
|----------|----------|------|
| deploy job (release.yml) | **수정** | permissions 추가, npm upgrade 스텝, publish 명령어 변경, Setup npmrc 제거 |
| 8개 package.json | **수정** | repository.url을 실제 GitHub repo와 일치시킴 (provenance 필수) |
| npmjs.com 각 패키지 설정 | **신규 (수동)** | 8개 패키지에 Trusted Publisher 등록 |
| GitHub Secrets | **제거** | NPM_TOKEN 시크릿 삭제 |

### 변경이 불필요한 컴포넌트

| 컴포넌트 | 이유 |
|----------|------|
| test job | npm 발행과 무관 |
| chain-integration job | npm 발행과 무관 |
| platform job | Docker 빌드/테스트만 수행 |
| publish-check job | --dry-run은 OIDC 토큰 없이 동작, --provenance 불필요 |
| docker-publish job | GHCR/Docker Hub 인증은 별도 메커니즘 (GITHUB_TOKEN, DOCKERHUB_TOKEN) |
| .github/actions/setup | Node.js + pnpm 설정만 담당, 발행 인증 무관 |
| release-please.yml | 릴리스 PR 생성만 담당 |
| ci.yml | PR 검증만 담당 |
| nightly.yml | 야간 테스트만 담당 |

---

## OIDC 데이터 흐름 (상세)

### Step 1: GitHub OIDC JWT 발급

```
GitHub Actions Runner
  → ACTIONS_ID_TOKEN_REQUEST_URL 환경변수 확인
  → GitHub OIDC Provider에 JWT 요청
  → JWT Claims:
    {
      "iss": "https://token.actions.githubusercontent.com",
      "sub": "repo:minhoyoo-iotrust/WAIaaS:environment:production",
      "aud": "https://registry.npmjs.org",
      "repository": "minhoyoo-iotrust/WAIaaS",
      "workflow": "release.yml",
      "ref": "refs/tags/v2.3.0",
      "sha": "<commit-sha>",
      "environment": "production",
      ...
    }
```

**Confidence:** HIGH -- GitHub OIDC Provider 공식 문서 기반

### Step 2: npm CLI의 OIDC 자동 감지

```
npm publish 실행 시:
  1. NODE_AUTH_TOKEN 환경변수 확인 → 있으면 토큰 인증 (레거시)
  2. 없으면 OIDC 환경 감지 (ACTIONS_ID_TOKEN_REQUEST_URL 존재 여부)
  3. OIDC JWT 획득
  4. npm 레지스트리에 JWT 제출 (Authorization 헤더)
```

**핵심:** NODE_AUTH_TOKEN이 설정되어 있으면 OIDC 대신 토큰 인증으로 폴백한다. 따라서 Setup npmrc 스텝과 NODE_AUTH_TOKEN 환경변수를 반드시 제거해야 한다.

**Confidence:** HIGH -- npm/cli 이슈 #8525, GitHub community discussion #176761 교차 확인

### Step 3: npm 레지스트리 검증

```
npm Registry:
  1. JWT 서명을 GitHub OIDC Provider 공개키로 검증
  2. JWT Claims를 패키지의 Trusted Publisher 규칙과 매칭:
     - repository == "minhoyoo-iotrust/WAIaaS"
     - workflow == "release.yml"
     - environment == "production" (설정한 경우)
  3. 매칭 성공 → 단기 npm API 토큰 발급
  4. 매칭 실패 → 토큰 인증으로 폴백 (없으면 에러)
```

**Confidence:** HIGH -- npm 공식 문서 + 다수 블로그 일치

### Step 4: 발행 + Provenance 생성

```
npm publish 완료 후:
  1. 패키지 tarball 업로드
  2. Sigstore를 통한 provenance attestation 자동 생성
  3. npm 패키지 페이지에 "Published from GitHub Actions" 배지 표시
  4. provenance 메타데이터에 빌드 출처 (repo, commit, workflow) 기록
```

**Confidence:** HIGH -- npm provenance 문서 + Sigstore 통합 확인

---

## 핵심 설계 결정

### 결정 1: `id-token: write`는 deploy job 레벨에만 추가

**선택:** Job-level permissions (deploy job에만)
**근거:**
- 최소 권한 원칙 -- 다른 5개 job에는 OIDC 토큰 불필요
- `id-token: write`를 top-level에 두면 모든 job이 OIDC JWT 발급 가능
- docker-publish는 이미 자체 `permissions: { contents: read, packages: write }` 보유

```yaml
deploy:
  permissions:
    contents: read
    id-token: write   # npm OIDC Trusted Publishing
```

**Confidence:** HIGH -- GitHub Actions 공식 문서, 보안 베스트 프랙티스 일관

### 결정 2: `npm publish` 사용 (pnpm publish 대체)

**선택:** `npm publish --provenance` 직접 사용
**근거:**
- pnpm publish는 내부적으로 npm publish를 위임하지만, OIDC 지원은 npm CLI >=11.5.1에 구현됨
- pnpm 9.x는 네이티브 OIDC 지원이 불완전 (pnpm/pnpm#9812, 2025-08 closed but via delegation)
- npm publish를 직접 호출하면 OIDC 토큰 교환이 확실히 동작
- `--provenance` 플래그도 npm CLI 기능이므로 npm 직접 호출이 안전

**위험 완화:** publish-check에서는 기존 `pnpm publish --dry-run` 유지 (OIDC 토큰 불필요)

```yaml
- name: Upgrade npm
  run: npm install -g npm@latest

- name: npm publish
  run: |
    for pkg_path in "${PACKAGES[@]}"; do
      cd "$pkg_path"
      PKG_VERSION=$(node -p "require('./package.json').version")
      if [[ "$PKG_VERSION" == *-* ]]; then
        npm publish --provenance --access public --tag rc
      else
        npm publish --provenance --access public
      fi
      cd "$GITHUB_WORKSPACE"
    done
```

**Confidence:** MEDIUM -- pnpm maintainer가 "pnpm publish runs npm publish under the hood"로 동작한다고 확인했으나, OIDC 토큰 전달 경로의 세부 동작은 pnpm 버전에 따라 다를 수 있음. npm 직접 호출이 안전한 선택.

### 결정 3: `--provenance` 플래그 명시적 사용

**선택:** `npm publish --provenance` (명시적 플래그)
**근거:**
- npm 문서는 Trusted Publishing 시 provenance가 자동 생성된다고 기술
- 그러나 다수 실전 블로그에서 명시적 `--provenance` 없이 동작하지 않는 케이스 보고
- 명시적 플래그 사용이 안전하고, OIDC 실패 시 토큰 폴백 대신 명확한 에러 발생

**Confidence:** HIGH -- philna.sh, remarkablemark.org 등 실전 블로그에서 명시적 플래그 권장 확인

### 결정 4: Trusted Publisher에 environment: `production` 설정

**선택:** npmjs.com 설정에 environment 필드를 `production`으로 지정
**근거:**
- deploy job이 이미 `environment: production` 사용
- environment를 지정하면 OIDC JWT의 `environment` claim이 매칭 조건에 포함
- 추가 보안 레이어: production 환경 외의 워크플로에서는 발행 불가
- environment는 선택 필드이지만, 이미 사용 중이므로 일치시키는 것이 안전

**Confidence:** HIGH -- npm 공식 문서에서 environment 매칭 명시

### 결정 5: publish-check에서 `--provenance` 제외

**선택:** publish-check job의 `pnpm publish --dry-run`에서 `--provenance` 미사용
**근거:**
- `--dry-run`은 실제 발행하지 않으므로 OIDC 토큰 교환 불필요
- publish-check job에는 `id-token: write` 권한 없음
- `--provenance` + `--dry-run` 조합은 OIDC 토큰 부재로 에러 발생 가능
- dry-run은 패키지 내용 검증 목적이므로 provenance 무관

**Confidence:** HIGH -- npm/cli#8525에서 dry-run의 OIDC 비검증 확인

### 결정 6: repository.url 수정 (Critical)

**선택:** 8개 package.json의 `repository.url`을 실제 GitHub repo와 일치시킴
**근거:**
- 현재값: `https://github.com/minho-yoo/waiaas.git`
- 실제 repo: `git@github.com:minhoyoo-iotrust/WAIaaS.git`
- provenance 생성 시 Sigstore가 repository.url과 OIDC JWT의 repository claim을 매칭
- 불일치 시 provenance 생성 실패 또는 발행 자체 실패 가능

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git",
    "directory": "packages/core"
  }
}
```

**Confidence:** HIGH -- philna.sh 블로그에서 repository.url 매칭 필수 확인, npm provenance 공식 repo 문서

---

## release.yml 변경 상세 (deploy job)

### Before (현재)

```yaml
deploy:
  runs-on: ubuntu-latest
  needs: [test, chain-integration, platform, publish-check, docker-publish]
  if: github.event_name == 'release'
  environment: production
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup
      uses: ./.github/actions/setup

    - name: Build
      run: pnpm turbo run build

    - name: Setup npmrc
      run: echo "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" > ~/.npmrc
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

    - name: pnpm publish
      run: |
        PACKAGES=( ... )
        for pkg_path in "${PACKAGES[@]}"; do
          cd "$pkg_path"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [[ "$PKG_VERSION" == *-* ]]; then
            pnpm publish --access public --no-git-checks --tag rc 2>&1
          else
            pnpm publish --access public --no-git-checks 2>&1
          fi
          cd "$GITHUB_WORKSPACE"
        done
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

    - name: Deploy summary
      run: ...
```

### After (OIDC)

```yaml
deploy:
  runs-on: ubuntu-latest
  needs: [test, chain-integration, platform, publish-check, docker-publish]
  if: github.event_name == 'release'
  environment: production
  permissions:                          # ← 추가: job-level permissions
    contents: read
    id-token: write                     # ← npm OIDC Trusted Publishing
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup
      uses: ./.github/actions/setup

    - name: Build
      run: pnpm turbo run build

    - name: Upgrade npm for OIDC        # ← 추가: npm >=11.5.1 보장
      run: |
        npm install -g npm@latest
        echo "npm version: $(npm --version)"

    # "Setup npmrc" 스텝 제거됨          # ← 제거

    - name: Publish to npm (OIDC)        # ← 변경: npm publish + --provenance
      run: |
        PACKAGES=(
          packages/core
          packages/daemon
          packages/cli
          packages/sdk
          packages/mcp
          packages/skills
          packages/adapters/solana
          packages/adapters/evm
        )
        for pkg_path in "${PACKAGES[@]}"; do
          echo "--- Publishing $pkg_path ---"
          cd "$pkg_path"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [[ "$PKG_VERSION" == *-* ]]; then
            npm publish --provenance --access public --tag rc 2>&1
          else
            npm publish --provenance --access public 2>&1
          fi
          cd "$GITHUB_WORKSPACE"
        done
      # NODE_AUTH_TOKEN 환경변수 제거됨   # ← 제거: OIDC가 대체

    - name: Deploy summary               # ← 수정: provenance 언급 추가
      run: |
        echo "## Deploy Summary" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        echo "- **Version:** ${{ github.event.release.tag_name }}" >> $GITHUB_STEP_SUMMARY
        echo "- **npm:** 8 packages published with provenance (OIDC)" >> $GITHUB_STEP_SUMMARY
        echo "- **Docker (GHCR):** ghcr.io/${{ github.repository }}" >> $GITHUB_STEP_SUMMARY
        echo "- **Docker (Hub):** waiaas/daemon" >> $GITHUB_STEP_SUMMARY
```

---

## 영향을 받지 않는 Job 상세 분석

### publish-check job -- 변경 불필요

```yaml
publish-check:
  # 기존 그대로 유지
  # --dry-run은 실제 발행 안 함 → OIDC 불필요
  # --provenance 추가하지 않음
  # pnpm publish --dry-run --no-git-checks 유지
```

**근거:** dry-run은 패키지 구조/파일 검증만 수행. OIDC 토큰이 없는 환경에서 `--provenance`를 추가하면 에러 가능. publish-check의 목적(패키지가 올바르게 구성되었는가)은 provenance와 무관.

### docker-publish job -- 변경 불필요

```yaml
docker-publish:
  permissions:
    contents: read
    packages: write     # GHCR 인증용 (GITHUB_TOKEN 기반)
  # GHCR: GITHUB_TOKEN 자동 제공
  # Docker Hub: DOCKERHUB_USERNAME + DOCKERHUB_TOKEN
  # npm과 완전히 별개 인증 메커니즘
```

**근거:** Docker 발행은 GHCR (GITHUB_TOKEN)과 Docker Hub (DOCKERHUB_TOKEN) 사용. npm OIDC와 무관.

---

## 순차 발행에서의 OIDC 토큰 동작

### 질문: 8개 패키지 순차 발행 시 각 publish마다 새 OIDC 토큰을 교환하는가?

**답변:** 예. 각 `npm publish` 호출마다 개별 OIDC 토큰 교환이 발생한다.

```
패키지 1 (core):     JWT 요청 → npm 검증 → 단기 토큰 → 발행 → 토큰 만료
패키지 2 (daemon):   JWT 요청 → npm 검증 → 단기 토큰 → 발행 → 토큰 만료
...
패키지 8 (evm):      JWT 요청 → npm 검증 → 단기 토큰 → 발행 → 토큰 만료
```

**이것은 의도된 동작이다:**
- 각 토큰이 해당 발행에만 유효 (보안상 이점)
- GitHub OIDC Provider의 JWT 발급은 동일 job 내에서 반복 가능
- 단기 토큰이므로 추출/재사용 불가
- 8개 패키지 순차 발행에 추가 지연은 미미 (토큰 교환은 밀리초 단위)

**Confidence:** MEDIUM -- npm 공식 문서에서 "each publish uses short-lived tokens" 확인. 순차 발행에서의 반복 교환은 Lerna OIDC 가이드에서 간접 확인. 직접 검증은 실제 발행에서만 가능.

---

## npmjs.com Trusted Publisher 설정 (수동 작업)

각 패키지별로 npmjs.com > Package > Settings > Publishing access에서 설정:

| 필드 | 값 | 비고 |
|------|---|------|
| Publisher | GitHub Actions | |
| Organization/User | `minhoyoo-iotrust` | GitHub org 이름 |
| Repository | `WAIaaS` | 대소문자 정확히 일치 |
| Workflow | `release.yml` | .github/workflows/ 내 파일명 |
| Environment | `production` | deploy job의 environment와 일치 |

**대상 패키지 (8개):**
1. `@waiaas/core`
2. `@waiaas/daemon`
3. `@waiaas/cli`
4. `@waiaas/sdk`
5. `@waiaas/mcp`
6. `@waiaas/skills`
7. `@waiaas/adapter-solana`
8. `@waiaas/adapter-evm`

**주의: 2FA 인증 필요** -- 각 패키지 설정 변경 시 2FA 인증이 요구됨. 8개 패키지 = 8회 2FA.

---

## package.json repository.url 수정

### 현재 (잘못된 값)

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/minho-yoo/waiaas.git",
    "directory": "packages/core"
  }
}
```

### 수정 후 (올바른 값)

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git",
    "directory": "packages/core"
  }
}
```

**변경 사항:**
1. `minho-yoo/waiaas` → `minhoyoo-iotrust/WAIaaS` (실제 GitHub repo와 일치)
2. `https://` → `git+https://` (npm 권장 형식, provenance 매칭에 필요)

**대상 파일 (9개):** 8개 publishable 패키지 + admin 패키지
- `packages/core/package.json`
- `packages/daemon/package.json`
- `packages/cli/package.json`
- `packages/sdk/package.json`
- `packages/mcp/package.json`
- `packages/skills/package.json`
- `packages/adapters/solana/package.json`
- `packages/adapters/evm/package.json`
- `packages/admin/package.json` (발행 대상은 아니지만 일관성)

---

## npm 버전 요구사항

### 문제

npm Trusted Publishing (OIDC)은 npm CLI >= 11.5.1을 요구한다.

### Node 22 번들 npm 버전

| Node.js 버전 | 번들 npm 버전 | OIDC 지원 |
|-------------|-------------|----------|
| 22.14.0 | 11.2.0 | 부족 (11.5.1 필요) |
| 22.15.x+ | 11.x (추정) | 확인 필요 |

**해결책:** deploy job에 `npm install -g npm@latest` 스텝 추가

```yaml
- name: Upgrade npm for OIDC
  run: |
    npm install -g npm@latest
    echo "npm version: $(npm --version)"
```

**Confidence:** HIGH -- Node.js 22에 npm 11이 병합됨 확인 (nodejs/node#58423 closed). 단, 정확한 서브 버전에 따라 11.5.1 미만일 수 있으므로 `npm@latest`로 업그레이드가 안전.

---

## actions/setup-node 주의사항

### 문제

`actions/setup-node`는 `registry-url` 옵션 사용 시 기본 NODE_AUTH_TOKEN을 설정할 수 있다. 이 경우 npm CLI가 OIDC 대신 토큰 인증으로 폴백한다.

### 현재 설정 (안전)

```yaml
# .github/actions/setup/action.yml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'pnpm'
    # registry-url 미설정 → NODE_AUTH_TOKEN 자동 설정 없음
```

현재 setup action은 `registry-url`을 사용하지 않으므로 문제 없다. 향후 setup action 수정 시 `registry-url` 추가하지 않도록 주의.

**Confidence:** HIGH -- GitHub community discussion #176761에서 확인

---

## 구현 빌드 순서

### Phase 1: package.json repository.url 수정

**의존성:** 없음 (독립적으로 선행 가능)
**위험도:** LOW
**검증:** `pnpm turbo run build` + `pnpm turbo run typecheck` 통과

1. 9개 package.json의 repository.url 수정
2. homepage URL도 일치시킴
3. 빌드/타입체크 통과 확인

### Phase 2: npmjs.com Trusted Publisher 등록 (수동)

**의존성:** 없음 (Phase 1과 병렬 가능)
**위험도:** LOW (설정만, 즉시 영향 없음)
**검증:** npmjs.com UI에서 설정 확인

1. 8개 패키지에 GitHub Actions Trusted Publisher 등록
2. environment: production 설정
3. 기존 NPM_TOKEN은 아직 제거하지 않음 (폴백용 유지)

### Phase 3: release.yml deploy job 수정

**의존성:** Phase 1 (repository.url), Phase 2 (Trusted Publisher 등록)
**위험도:** MEDIUM (실제 발행 흐름 변경)
**검증:** 다음 릴리스에서 실제 발행 성공 확인

1. deploy job에 `permissions: { contents: read, id-token: write }` 추가
2. "Upgrade npm" 스텝 추가
3. "Setup npmrc" 스텝 제거
4. `pnpm publish` → `npm publish --provenance` 변경
5. NODE_AUTH_TOKEN 환경변수 제거
6. Deploy summary에 provenance 언급 추가

### Phase 4: 검증 + 정리

**의존성:** Phase 3 성공 확인 후
**위험도:** LOW
**검증:** npm 패키지 페이지에서 provenance 배지 확인

1. 발행된 패키지에서 provenance 확인
2. NPM_TOKEN 시크릿 제거 (GitHub Settings > Secrets)
3. 문서 업데이트 (필요 시)

---

## 롤백 전략

OIDC 발행 실패 시:
1. GitHub Secrets에서 NPM_TOKEN 복원 (삭제 전까지)
2. release.yml에서 Setup npmrc + NODE_AUTH_TOKEN 복원
3. `npm publish --provenance` → `pnpm publish` 복원

**Phase 순서가 중요한 이유:** NPM_TOKEN을 Phase 4까지 유지하면 롤백이 가능하다. Phase 3에서 OIDC 발행이 성공적으로 검증된 후에만 Phase 4에서 NPM_TOKEN을 제거한다.

---

## Scalability 고려사항

| 관심사 | 현재 (8 packages) | 향후 (20+ packages) |
|--------|------------------|-------------------|
| Trusted Publisher 설정 | 수동 8회 | 수동 20+회 (자동화 불가) |
| 순차 발행 시간 | ~2분 | ~5분 (OIDC 교환 오버헤드 미미) |
| OIDC 토큰 교환 | 패키지당 1회 | 패키지당 1회 (선형 증가) |
| provenance 검증 | 패키지별 독립 | 패키지별 독립 |

---

## Sources

### 공식 문서 (HIGH confidence)
- [npm Trusted Publishing 문서](https://docs.npmjs.com/trusted-publishers/)
- [npm Provenance 문서](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Actions OIDC Permissions](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)

### 검증된 블로그 (MEDIUM-HIGH confidence)
- [Phil Nash: Things you need to do for npm trusted publishing to work (2026-01)](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [remarkablemark: How to set up trusted publishing for npm (2025-12)](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/)
- [Niek Saarberg: Trusted Publishing with GitHub OIDC (2026-02)](https://medium.com/@n.saarberg/trusted-publishing-with-github-oidc-668961051bf4)
- [vcfvct: Publishing to npm with GitHub Actions + OIDC (2026-01)](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/)
- [npmdigest: npm Trusted Publishing Guide](https://npmdigest.com/guides/npm-trusted-publishing)
- [robino.dev: NPM Trusted Publishing](https://blog.robino.dev/posts/npm-trusted-publishing)
- [MakerX: Catch up on the new NPM Trusted Publishing feature](https://blog.makerx.com.au/catch-up-on-the-new-npm-trusted-publishing-feature/)

### 이슈 트래커 (HIGH confidence)
- [pnpm/pnpm#9812: Support OIDC publishing](https://github.com/pnpm/pnpm/issues/9812)
- [npm/cli#8525: validating auth context when using OIDC](https://github.com/npm/cli/issues/8525)
- [nodejs/node#58423: Update npm to v11 in Node.js v22](https://github.com/nodejs/node/issues/58423)
- [GitHub community discussion #176761: NPM publish using OIDC](https://github.com/orgs/community/discussions/176761)

### Lerna 참조 (MEDIUM confidence)
- [Lerna OIDC Trusted Publishing Recipe](https://lerna.js.org/docs/recipes/oidc-trusted-publishing)
