# Domain Pitfalls: npm Trusted Publishing (OIDC) 전환

**Domain:** CI/CD 보안 - npm OIDC Trusted Publishing
**Researched:** 2026-02-18

---

## Critical Pitfalls

실수 시 발행 실패 또는 보안 사고로 이어지는 치명적 문제.

### Pitfall 1: repository.url 불일치 -- provenance/publish 실패

**무엇이 잘못되는가:** package.json의 `repository.url`과 실제 GitHub 레포가 불일치하면, Sigstore가 provenance attestation 생성 시 OIDC JWT의 repository claim과 매칭에 실패한다. 결과적으로 422 Unprocessable Entity 또는 provenance 누락.

**왜 발생하는가:** 프로젝트 이관, 포크, 조직명 변경 등으로 package.json의 URL이 오래된 상태로 남는다.

**현재 프로젝트 상태 (불일치 확인됨):**
```
package.json: https://github.com/minho-yoo/waiaas.git
git remote:   git@github.com:minhoyoo-iotrust/WAIaaS.git
→ 불일치! org 이름과 repo 이름 모두 다름
```

**결과:** provenance 생성 실패, 또는 발행 자체 실패 (422).

**예방:**
- 전환 전에 9개 package.json의 `repository.url`을 실제 GitHub 레포와 일치시킴
- `git+https://github.com/minhoyoo-iotrust/WAIaaS.git` 형식 사용
- homepage URL도 함께 수정

**감지:** publish 시 422 에러, 또는 provenance 배지 미표시.

**Confidence: HIGH** -- philna.sh, leechael.org 등 다수 블로그에서 가장 흔한 실패 원인으로 보고됨.

---

### Pitfall 2: npm CLI 버전 부족 -- 무증상 OIDC 폴백

**무엇이 잘못되는가:** npm 11.5.1 미만에서는 OIDC 토큰 교환 프로토콜이 구현되어 있지 않다. npm은 OIDC 환경을 감지하지 못하고 조용히 레거시 토큰 인증으로 폴백한다. 토큰이 없으면 "Access token expired or revoked" 에러.

**왜 발생하는가:** Node.js 22에 npm 11이 번들되었지만, 정확한 서브 버전이 11.5.1 미만일 수 있다 (Node 22.14.0은 npm 11.2.0 번들).

**결과:** 에러 메시지가 OIDC가 아닌 토큰 관련으로 출력되어 디버깅이 매우 어렵다.

**예방:**
```yaml
- name: Upgrade npm for Trusted Publishing
  run: |
    npm install -g npm@latest
    echo "npm version: $(npm --version)"
```

**감지:** deploy 잡 초기에 npm 버전 출력 스텝 추가.

**Confidence: HIGH** -- npm 공식 문서 + remarkablemark 블로그에서 Node.js 22.14.0/npm 11.2.0 부족 명시.

---

### Pitfall 3: NODE_AUTH_TOKEN 잔존 -- OIDC 우회 (보안 위협)

**무엇이 잘못되는가:** `.npmrc`에 기존 auth token이 남아있거나 NODE_AUTH_TOKEN 환경변수가 설정되어 있으면, npm은 OIDC 대신 토큰 인증을 사용한다. 토큰이 유효하면 발행은 성공하지만 provenance가 누락될 수 있다.

**왜 발생하는가:**
1. `Setup npmrc` 스텝을 제거하지 않음
2. `NODE_AUTH_TOKEN` 환경변수가 pnpm publish env 블록에 남음
3. `actions/setup-node`의 `registry-url` 옵션이 기본 토큰을 설정 (현재는 미사용이므로 안전)

**결과:** OIDC 보안 강화 없이 "성공"한 것처럼 보이는 위험한 상태. 토큰 유출 시 여전히 임의 발행 가능.

**예방:**
1. `Setup npmrc` 스텝 완전 제거
2. deploy 잡의 NODE_AUTH_TOKEN 환경변수 참조 완전 제거
3. publish 후 npm 패키지 페이지에서 provenance 배지 확인

**감지:** provenance 배지 미표시 시 OIDC가 동작하지 않은 것.

**Confidence: HIGH** -- GitHub community discussion #176761에서 확인.

---

## Moderate Pitfalls

### Pitfall 4: environment 이름 불일치 -- 404 에러

**무엇이 잘못되는가:** npmjs.com Trusted Publisher 설정의 Environment 필드와 GitHub Actions 워크플로의 `environment:` 설정이 불일치하면, OIDC JWT의 environment claim이 매칭에 실패하여 404 에러 발생.

**예방:**
- deploy 잡: `environment: production`
- npmjs.com: Environment 필드에 `production` 입력 (대소문자 정확히 일치)
- 빈 값과 `production`은 다름 -- environment를 사용하면 반드시 매칭시킬 것

**Confidence: HIGH** -- npm 공식 문서에서 environment claim 매칭 명시.

---

### Pitfall 5: job-level permissions가 top-level을 오버라이드

**무엇이 잘못되는가:** deploy 잡에 `permissions:` 블록을 추가하면 top-level `permissions:`를 상속하지 않는다. `id-token: write`만 추가하고 `contents: read`를 빠뜨리면 checkout이 실패한다.

**예방:**
```yaml
deploy:
  permissions:
    contents: read      # checkout에 필요 -- 빠뜨리면 실패
    id-token: write     # OIDC에 필요
```

**Confidence: HIGH** -- GitHub Actions 공식 문서.

---

### Pitfall 6: workflow 파일명 불일치 -- silent fallback

**무엇이 잘못되는가:** npmjs.com에 등록한 Workflow 필드(`release.yml`)와 실제 워크플로 파일명이 불일치하면, npm이 OIDC 인증에 실패하고 조용히 토큰 인증으로 폴백한다. 토큰이 없으면 에러.

**왜 위험한가:** 에러 메시지가 "Access token expired or revoked"로 표시되어 워크플로 이름 문제를 인식하기 어렵다.

**예방:**
- npmjs.com에서 정확히 `release.yml` 입력 (경로 제외, 파일명만, `.yml` 확장자 포함)
- 복사/붙여넣기 시 trailing space 주의

**Confidence: HIGH** -- vcfvct 블로그에서 이 정확한 함정 보고.

---

### Pitfall 7: publish-check에 --provenance 추가 시 에러

**무엇이 잘못되는가:** publish-check 잡에서 `pnpm publish --dry-run --provenance`를 실행하면, OIDC 토큰이 없는 환경(`id-token: write` 미설정)에서 provenance 관련 에러가 발생할 수 있다.

**예방:** publish-check 잡에는 `--provenance` 플래그를 추가하지 않는다. 기존 `pnpm publish --dry-run --no-git-checks` 유지.

**Confidence: MEDIUM** -- npm/cli#8525에서 dry-run의 OIDC 비검증이 확인됨. 에러 발생 여부는 npm 버전에 따라 다를 수 있음.

---

## Minor Pitfalls

### Pitfall 8: `npm whoami` 실패가 정상 동작

**무엇이 잘못되는가:** OIDC 인증 환경에서 `npm whoami`를 실행하면 401 에러가 발생한다. 이를 보고 인증이 실패했다고 오해할 수 있다.

**예방:** OIDC는 publish 시점에만 토큰을 교환하므로 `npm whoami`가 실패하는 것은 정상이다. 디버깅 시 `npm whoami`로 판단하지 말 것.

**Confidence: HIGH** -- 다수 가이드에서 명시적으로 언급.

---

### Pitfall 9: 부분 발행 (partial publish) 시 복구 어려움

**무엇이 잘못되는가:** 8개 패키지 순차 발행 중 중간에 실패하면, 일부만 발행된 상태가 된다. npm은 한번 발행된 버전을 재발행할 수 없으므로 (`npm unpublish` 후 24시간 대기 또는 버전 스킵 필요), 불일치 상태가 장기화될 수 있다.

**예방:**
- publish-check dry-run이 이미 사전 검증 수행
- repository.url, environment, workflow 필드를 사전에 정확히 설정
- 8개 패키지 모두 동일한 Trusted Publisher 설정 적용

**Confidence: MEDIUM** -- 이론적 위험. publish-check가 대부분의 문제를 사전 검출.

---

### Pitfall 10: npm 레지스트리의 대소문자 민감성

**무엇이 잘못되는가:** npmjs.com Trusted Publisher 설정에서 Owner, Repository 필드는 대소문자를 구분한다. `minhoyoo-iotrust/WAIaaS`와 `minhoyoo-iotrust/waiaas`는 다른 것으로 취급된다.

**예방:** GitHub 레포 URL에서 정확한 대소문자를 복사하여 입력. `git remote get-url origin` 결과 참조.

**Confidence: HIGH** -- npm 공식 문서 + 다수 블로그에서 case-sensitive 명시.

---

## Phase-Specific Warnings

| Phase 주제 | 예상 Pitfall | 대응 |
|-----------|-------------|------|
| package.json 수정 | repository.url 형식 오류 | `git+https://` 접두사 + `.git` 접미사 확인 |
| npmjs.com 설정 (수동) | Owner/Repository/Workflow 대소문자/스펠링 오류 | 실제 GitHub URL에서 복사 |
| npmjs.com 설정 (수동) | environment 필드 누락 또는 오타 | 정확히 `production` 입력 |
| release.yml 수정 | permissions 오버라이드로 checkout 실패 | `contents: read` 반드시 포함 |
| release.yml 수정 | npm 버전 부족으로 OIDC 미감지 | `npm install -g npm@latest` + 버전 출력 |
| release.yml 수정 | NODE_AUTH_TOKEN 잔존 | Setup npmrc 스텝 제거 + env 블록 제거 |
| 검증 | npm whoami 실패 오해 | provenance 배지로 성공 확인 |
| NPM_TOKEN 제거 | 너무 일찍 제거하면 롤백 불가 | OIDC 발행 성공 확인 후 제거 |

---

## 롤백 전략

**NPM_TOKEN을 즉시 삭제하지 말 것.** 다음 순서를 권장:

1. Trusted Publisher 설정 완료
2. release.yml에 OIDC 설정 추가 (NPM_TOKEN 관련 스텝은 제거)
3. 실제 릴리스로 OIDC 발행 성공 확인
4. provenance 배지 확인
5. **그 후에** NPM_TOKEN 시크릿 삭제

NPM_TOKEN이 GitHub Secrets에 남아있어도, deploy 잡에서 참조하지 않으면 사용되지 않는다. OIDC 실패 시 Setup npmrc 스텝과 env 블록을 복원하면 즉시 롤백 가능.

---

## Sources

- [Phil Nash - Things you need to do for npm trusted publishing](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [remarkablemark - How to set up trusted publishing](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/)
- [npmdigest - OIDC Setup Guide](https://npmdigest.com/guides/npm-trusted-publishing)
- [vcfvct - Publishing to npm with GitHub Actions + OIDC](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/)
- [GitHub community #176761 - NPM publish using OIDC](https://github.com/orgs/community/discussions/176761)
- [npm/cli#8525 - validating auth context with OIDC](https://github.com/npm/cli/issues/8525)
- [pnpm/pnpm#9812 - OIDC Support Issue](https://github.com/pnpm/pnpm/issues/9812)
