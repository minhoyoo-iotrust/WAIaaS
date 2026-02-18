# npm Trusted Publishing (OIDC) 전환 -- 도메인 함정

**도메인:** npm Trusted Publishing OIDC 전환 (기존 pnpm 모노레포 릴리스 파이프라인)
**리서치 일자:** 2026-02-18
**대상 파이프라인:** release.yml 6-job (test, chain-integration, platform, publish-check, docker-publish, deploy)
**대상 패키지:** 8개 @waiaas/* scoped 패키지

---

## Critical Pitfalls

재작업 또는 릴리스 실패를 유발하는 치명적 실수.

---

### Pitfall 1: repository.url 불일치 -- GitHub 원격 vs package.json

**심각도:** CRITICAL -- 발행 즉시 실패
**신뢰도:** HIGH (npm/cli#8036, 공식 문서, 다수 사용자 보고)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** 현재 8개 패키지의 `package.json`에 `"url": "https://github.com/minho-yoo/waiaas.git"`로 되어 있으나, 실제 GitHub 원격은 `minhoyoo-iotrust/WAIaaS`이다. provenance 검증 시 Sigstore가 OIDC 토큰의 repository 정보(`minhoyoo-iotrust/WAIaaS`)와 package.json의 repository.url을 비교하여 불일치 시 422 Unprocessable Entity 오류로 발행이 실패한다.

**왜 발생하는가:** npm provenance 검증은 OIDC 토큰에 포함된 GitHub repository 메타데이터와 package.json의 `repository.url`을 정확히 매칭한다. 이 요구사항이 npm 사용자 문서에는 명시되지 않고 npm/provenance GitHub 저장소에만 문서화되어 있어 간과하기 쉽다.

**결과:** `--provenance` 플래그 사용 시 모든 패키지 발행이 실패한다. 에러 메시지가 "Error verifying sigstore provenance bundle: Failed to validate repository information"으로 나와 원인 파악이 어렵다.

**예방:**
1. Phase 2 이전에 8개 패키지 모두의 `repository.url`을 실제 GitHub 원격과 일치시킨다
2. 올바른 형식: `"url": "https://github.com/minhoyoo-iotrust/WAIaaS.git"`
3. `git+https://` prefix는 npm이 자동 정규화하므로 `https://`로 시작해도 된다
4. 대소문자도 정확히 일치해야 한다 (`WAIaaS` not `waiaas`)

**감지:** CI에서 `--provenance` 첫 테스트 시 즉시 422 에러 발생

---

### Pitfall 2: npm CLI 버전 부족 -- OIDC 토큰 교환 실패

**심각도:** CRITICAL -- 발행 자체가 불가능
**신뢰도:** HIGH (npm 공식 문서, npm/cli#8678)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** Trusted Publishing은 npm CLI 11.5.1 이상을 요구한다. Node 22.x의 기본 번들 npm은 10.9.x 수준으로, OIDC 토큰 교환 엔드포인트를 지원하지 않아 404 에러가 발생한다. 현재 setup action은 `node-version: 22`만 설정하고 npm 버전을 명시적으로 업그레이드하지 않는다.

**왜 발생하는가:** `pnpm publish`는 내부적으로 `npm publish`를 실행한다(pnpm 메인테이너 확인). pnpm 9.x 자체에는 OIDC 토큰 교환 로직이 없고, 시스템에 설치된 npm CLI에 의존한다. Node 22.x 번들 npm이 충분히 최신이 아니면 OIDC 경로를 인식하지 못한다.

**결과:** "OIDC token exchange error" 또는 "404 Not Found" 에러로 발행 실패. 에러가 OIDC 관련이 아닌 일반적인 HTTP 404로 보여 디버깅이 어렵다.

**예방:**
1. deploy 잡에 `npm install -g npm@latest` 스텝을 추가하거나, `actions/setup-node@v4`에서 Node 22.14.0+ (npm 11.5.1+ 번들)를 명시
2. npm 버전 확인 스텝 추가: `npm --version` 출력으로 11.5.1+ 확인
3. 가능하면 `node-version: '22.14'` 이상으로 고정

**감지:** deploy 잡 실행 시 `npm http fetch POST 404 https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/...` 로그

---

### Pitfall 3: 8개 패키지 중 일부 Trusted Publisher 미등록

**심각도:** CRITICAL -- 미등록 패키지만 발행 실패
**신뢰도:** HIGH (npm 공식 문서, 다수 사용자 보고)
**해당 Phase:** Phase 1 (npmjs.com 수동 설정)

**무엇이 잘못되는가:** Trusted Publisher 설정은 npmjs.com에서 패키지별로 수동 등록해야 한다. 8개 패키지를 하나씩 등록하다가 1-2개를 누락하면, 누락된 패키지에서 OIDC 토큰 교환이 실패한다. npm은 설정 저장 시 유효성 검증을 하지 않아, 실제 발행 시도 전까지 오류를 알 수 없다.

**왜 발생하는가:** 각 패키지를 수동으로 npmjs.com > Settings > Publishing access에서 설정해야 하고, 8개 패키지에 동일한 정보(Repository: `minhoyoo-iotrust/WAIaaS`, Workflow: `release.yml`, Environment: `production`)를 반복 입력하는 중 실수가 발생한다.

**결과:** 순차 발행 루프에서 7개 성공 후 1개 실패 시, 부분 릴리스 상태가 된다. 일부 패키지만 새 버전이 올라가고 나머지는 이전 버전에 머무르는 불일치 상태.

**예방:**
1. 체크리스트: 8개 패키지 이름과 등록 완료 여부를 기록
2. 각 패키지 설정값 스크린샷 보관
3. 설정 완료 후 npm CLI로 OIDC 상태 확인: `npm access ls-packages @waiaas` 등
4. 워크플로 필드 값은 정확히: Repository = `minhoyoo-iotrust/WAIaaS`, Workflow = `release.yml`, Environment = `production`

**감지:** "404 Not Found" on `POST /-/npm/v1/oidc/token/exchange/package/@waiaas%2f{패키지명}`

---

### Pitfall 4: `id-token: write` 퍼미션 배치 오류

**심각도:** CRITICAL -- OIDC 토큰 미발급으로 발행 실패
**신뢰도:** HIGH (GitHub 공식 문서, 다수 사용자 보고)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** 두 가지 실수 패턴:
- **패턴 A (과도한 범위):** `id-token: write`를 top-level `permissions`에 넣으면 test, chain-integration 등 6개 전체 잡이 불필요한 OIDC 토큰 발급 권한을 가짐. 최소 권한 위반.
- **패턴 B (누락):** deploy 잡에 `id-token: write`를 넣지 않으면, GitHub가 OIDC 토큰을 발급하지 않아 npm이 OIDC 경로를 시도하지 않음.
- **패턴 C (top-level과의 충돌):** 현재 top-level에 `permissions: contents: read, packages: write`가 있다. job-level permissions를 설정하면 top-level을 완전히 override한다. deploy 잡에 `id-token: write`만 넣고 `contents: read`를 빠뜨리면 checkout이 실패한다.

**왜 발생하는가:** GitHub Actions 퍼미션은 top-level과 job-level이 additive가 아니라, job-level이 설정되면 top-level을 완전히 대체(override)한다. 이 동작을 모르면 OIDC 추가 시 기존 퍼미션이 사라지는 사고가 발생한다.

**결과:**
- 패턴 A: 보안 문제 (다른 잡에서 OIDC 토큰 남용 가능성)
- 패턴 B: OIDC 실패, npm이 token fallback 시도하지만 NPM_TOKEN 제거 후엔 완전 실패
- 패턴 C: checkout 단계부터 실패

**예방:**
```yaml
# deploy 잡에만 명시적으로 전체 퍼미션 설정
deploy:
  permissions:
    contents: read    # checkout 필수
    id-token: write   # npm OIDC Trusted Publishing
```

**감지:** 패턴 B는 "Unable to authenticate" 에러, 패턴 C는 "Resource not accessible by integration" 에러

---

### Pitfall 5: NPM_TOKEN 조기 제거 -- OIDC 미검증 상태에서 fallback 상실

**심각도:** CRITICAL -- 릴리스 파이프라인 완전 중단
**신뢰도:** HIGH (실무 패턴)
**해당 Phase:** Phase 3 (정리)

**무엇이 잘못되는가:** OIDC 설정이 완전히 검증되기 전에 `NPM_TOKEN` 시크릿을 GitHub Secrets에서 삭제하면, OIDC 실패 시 fallback 수단이 없어진다. npm CLI는 OIDC 실패 시 자동으로 기존 토큰 인증을 시도하지만, 토큰이 없으면 완전 실패한다.

**왜 발생하는가:** "OIDC가 잘 되니까 토큰은 바로 삭제해도 되겠지"라는 낙관적 판단. 첫 번째 OIDC 발행 성공 후 바로 토큰을 삭제하지만, 다음 릴리스에서 npm 측 변경이나 환경 차이로 OIDC가 실패할 수 있다.

**결과:** 릴리스가 필요한 시점에 발행이 불가능해지고, npmjs.com에 다시 토큰을 생성하고 GitHub Secrets에 추가하는 긴급 작업이 필요.

**예방:**
1. **2-릴리스 검증 전략:** OIDC로 최소 2회 성공적 발행 확인 후 NPM_TOKEN 제거
2. 첫 번째 OIDC 릴리스에서는 `NPM_TOKEN`을 시크릿에 유지하되, 워크플로에서 `.npmrc` 설정 스텝과 `NODE_AUTH_TOKEN` env를 제거하여 OIDC 경로만 사용하도록 전환
3. OIDC 실패 시 `.npmrc` 스텝을 일시적으로 복원할 수 있도록 주석 처리
4. 완전 제거는 2-3회 OIDC 성공 릴리스 후

**감지:** 릴리스 시도 시 "Unable to authenticate" + OIDC 토큰 교환 실패 로그

---

## Moderate Pitfalls

---

### Pitfall 6: `--dry-run` + `--provenance` 비호환 -- publish-check 잡 실패

**심각도:** MODERATE -- CI 파이프라인 차단, 릴리스는 아님
**신뢰도:** MEDIUM (npm/cli#7654, 커뮤니티 보고. 정확한 동작은 실험 필요)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** publish-check 잡은 `pnpm publish --dry-run --no-git-checks`를 실행한다. 여기에 `--provenance`를 추가하면 두 가지 문제가 발생할 수 있다:
1. dry-run 모드에서 OIDC 토큰 교환을 시도하지만, publish-check 잡에는 `id-token: write` 퍼미션이 없어 실패
2. dry-run인데도 provenance 번들이 생성되어 Sigstore에 서명이 남는 버그(npm/cli#7654)

**왜 발생하는가:** `--dry-run`이 "모든 검증을 수행하되 최종 업로드만 생략"하는 것인지, "네트워크 호출 자체를 생략"하는 것인지 명확하지 않다. npm CLI 동작이 버전마다 다르고, provenance 생성이 publish 성공/실패와 독립적으로 발생하는 버그가 있다.

**결과:** publish-check 잡 실패로 deploy 잡이 시작되지 않음 (deploy는 publish-check에 의존).

**예방:**
1. **publish-check에서 `--provenance` 제외:** dry-run은 패키지 구조 검증만 수행하면 되므로 provenance 불필요
2. publish-check 잡에는 기존 그대로 `pnpm publish --dry-run --no-git-checks` 유지
3. `--provenance`는 deploy 잡의 실제 발행 명령에서만 사용

**감지:** publish-check 잡에서 "Error: id-token permission is not set" 또는 provenance 관련 에러

---

### Pitfall 7: npmjs.com 설정 필드의 미묘한 불일치

**심각도:** MODERATE -- 발행 실패, 원인 파악이 어려움
**신뢰도:** HIGH (Phil Nash 블로그, npm/cli#8730, 다수 커뮤니티 보고)
**해당 Phase:** Phase 1 (npmjs.com 수동 설정)

**무엇이 잘못되는가:** npmjs.com에서 Trusted Publisher를 등록할 때 모든 필드가 대소문자 구분(case-sensitive)이고 정확히 일치해야 한다. 흔한 실수:
- Workflow 필드에 `.yml` 확장자 누락 (예: `release` vs `release.yml`)
- Workflow 필드 앞에 보이지 않는 공백 문자 (예: ` release.yml`)
- Repository 이름의 대소문자 불일치 (예: `waiaas` vs `WAIaaS`)
- Organization/User 이름 불일치 (예: `minho-yoo` vs `minhoyoo-iotrust`)
- Environment 이름 불일치 (예: `Production` vs `production`)

**왜 발생하는가:** npm은 설정 저장 시 유효성 검증을 하지 않는다. 잘못된 값을 넣어도 저장이 성공한다. 실제 발행 시도 시에만 불일치가 드러난다.

**결과:** OIDC 토큰 교환 단계에서 npm이 워크플로 실행과 Trusted Publisher 설정을 매칭하지 못해 404 에러. 에러 메시지가 "package not found"로 나와 설정 문제가 아닌 패키지 존재 여부 문제로 오인할 수 있다.

**예방:**
1. 설정값을 미리 텍스트 파일로 작성하고 복사-붙여넣기:
   - Repository owner: `minhoyoo-iotrust`
   - Repository name: `WAIaaS`
   - Workflow filename: `release.yml`
   - Environment name: `production`
2. 8개 패키지 등록 후 모든 설정을 재확인
3. 첫 테스트 발행 전에 스크린샷으로 설정값 보관

**감지:** "404 Not Found" on OIDC token exchange, "Unable to authenticate" 에러

---

### Pitfall 8: Environment 이름 불일치 -- GitHub vs npmjs.com

**심각도:** MODERATE -- 발행 실패, 디버깅 어려움
**신뢰도:** HIGH (GitHub 공식 문서, npm 공식 문서)
**해당 Phase:** Phase 1 (npmjs.com 수동 설정)

**무엇이 잘못되는가:** release.yml의 deploy 잡은 `environment: production`으로 설정되어 있다. npmjs.com에서 Trusted Publisher 등록 시 Environment 필드를 설정하면, OIDC 토큰의 `environment` 클레임과 정확히 일치해야 한다. 두 가지 함정:
1. **npmjs.com에서 environment를 입력했는데 GitHub에서 해당 environment가 존재하지 않는 경우** -- GitHub OIDC 토큰에 environment 클레임이 포함되지 않아 매칭 실패
2. **npmjs.com에서 environment를 비워뒀는데 GitHub 잡에는 environment가 있는 경우** -- npm이 더 넓은 범위(environment 무관)로 매칭하므로 동작은 하지만 보안이 약해짐

**왜 발생하는가:** Environment 필드는 선택사항이지만, 설정하면 정확히 일치해야 한다. GitHub Actions의 `environment` 키워드와 npmjs.com의 Environment 필드가 같은 값을 참조하는지 직관적이지 않다.

**결과:** 불일치 시 OIDC 토큰 교환 실패. environment를 비워두면 동작하지만, GitHub environment의 보호 규칙(수동 승인 게이트)을 우회하여 발행할 수 있는 보안 구멍이 생긴다.

**예방:**
1. npmjs.com에서 Environment = `production`으로 명시적 설정 (현재 deploy 잡의 `environment: production`과 일치)
2. GitHub Settings > Environments에서 `production` 환경이 존재하고 보호 규칙이 활성화되어 있는지 확인
3. Environment 설정은 보안 강화 차원에서 반드시 입력 (비워두지 않음)

**감지:** OIDC 토큰 교환 실패, 로그에서 environment 클레임 관련 에러

---

### Pitfall 9: Scoped 패키지의 OIDC 토큰 교환 404 에러

**심각도:** MODERATE -- 특정 패키지만 실패
**신뢰도:** MEDIUM (npm/cli#8678, npm CLI 11.5.1 이전 버전에서 발생)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** `@waiaas/core` 같은 scoped 패키지의 OIDC 토큰 교환에서 npm CLI가 패키지명을 URL-encode 할 때(`@waiaas%2fcore`) 구버전 npm에서 404 에러가 발생한다. 이 버그는 npm 11.5.1에서 수정되었으나, Node 22.x 기본 번들 npm이 이보다 오래된 경우 발생한다.

**왜 발생하는가:** scoped 패키지명의 `/`가 URL-encode 시 `%2f`로 변환되는 과정에서 npm CLI와 레지스트리 사이의 인코딩 불일치. 8개 패키지 모두 `@waiaas` 스코프이므로 전체에 영향.

**결과:** "OIDC token exchange error - package not found" 에러. 실제로 패키지는 존재하지만 OIDC 엔드포인트가 인식하지 못함.

**예방:**
1. npm CLI 11.5.1+ 명시적 설치 (Pitfall 2와 동일 해결책)
2. deploy 잡 첫 스텝으로 `npm --version` 확인

**감지:** `npm http fetch POST 404 .../-/npm/v1/oidc/token/exchange/package/@waiaas%2f...`

---

### Pitfall 10: `workflow_dispatch` 트리거와 OIDC 호환성

**심각도:** MODERATE -- 수동 재발행 불가
**신뢰도:** MEDIUM (커뮤니티 보고, GitHub 공식 문서)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** 현재 release.yml은 `on: release: [published]`와 `on: workflow_dispatch` 두 가지 트리거를 가진다. deploy 잡의 `if: github.event_name == 'release'` 조건으로 인해 `workflow_dispatch`로 수동 트리거하면 deploy 잡 자체가 스킵된다. 하지만 OIDC 전환 후 NPM_TOKEN을 제거하면, 수동 재발행(workflow_dispatch)의 의미가 변한다.

**왜 발생하는가:** `workflow_dispatch`가 현재는 테스트/디버깅 용도로 존재하지만, OIDC 전환 후에도 긴급 재발행이 필요한 상황(npm 장애 후 재시도 등)이 발생할 수 있다.

**결과:** 긴급 재발행이 필요할 때 `workflow_dispatch`로는 deploy 잡이 실행되지 않아, GitHub에서 수동으로 Release를 다시 만들어야 하는 불편.

**예방:**
1. `workflow_dispatch` 트리거의 역할을 재정의: 테스트 전용인지, 긴급 재발행도 포함하는지 결정
2. 긴급 재발행이 필요하면 deploy 잡의 `if` 조건을 `if: github.event_name == 'release' || github.event_name == 'workflow_dispatch'`로 확장 (단, 보호 규칙 검토 필요)
3. 현 상태 유지가 가장 안전: 재발행은 GitHub Release를 재생성하여 정상 파이프라인으로 처리

**감지:** `workflow_dispatch` 실행 시 deploy 잡이 "Skipped" 상태

---

### Pitfall 11: 순차 발행 루프에서 부분 실패 시 복구 전략 부재

**심각도:** MODERATE -- 부분 릴리스 상태로 사용자 혼란
**신뢰도:** MEDIUM (실무 패턴)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** 8개 패키지를 for 루프로 순차 발행하는 중 5번째 패키지에서 실패하면, 1-4번은 이미 npm에 올라간 상태고 5-8번은 올라가지 않은 부분 릴리스 상태가 된다. OIDC 에러(토큰 만료, npm 장애 등)가 루프 중간에 발생할 수 있다.

**왜 발생하는가:** GitHub Actions OIDC 토큰은 잡 단위로 발급되며, 잡이 실행되는 동안 유효하다. 8개 패키지 순차 발행은 일반적으로 몇 분 내에 완료되므로 토큰 만료는 드물지만, npm 레지스트리 장애나 일시적 네트워크 문제로 중간 실패는 가능하다.

**결과:** 일부 패키지만 새 버전이 올라가고, 이를 사용하는 소비자가 버전 불일치 에러를 겪는다. 특히 `@waiaas/core`가 올라갔는데 `@waiaas/daemon`이 안 올라간 경우 의존성 해결 실패.

**예방:**
1. 발행 루프에 재시도 로직 추가: 실패 시 3회 재시도 (지수 백오프)
2. 실패한 패키지 목록을 기록하여 step summary에 표시
3. 의존 관계 순서로 발행: core -> adapters -> sdk -> daemon -> cli -> mcp -> skills (가장 기초적인 것부터)
4. 부분 실패 시 수동으로 남은 패키지만 재발행할 수 있는 스크립트 준비

**감지:** deploy 잡 로그에서 일부 패키지만 "published" 표시

---

## Minor Pitfalls

---

### Pitfall 12: Pre-release(rc) 태그와 provenance -- 의미상 차이는 없지만 확인 필요

**심각도:** MINOR -- 동작에는 문제 없으나 확인 미비 시 불안
**신뢰도:** MEDIUM (npm 공식 문서. pre-release + provenance 조합의 엣지 케이스 문서가 부족)
**해당 Phase:** Phase 2 (release.yml 수정)

**무엇이 잘못되는가:** 현재 deploy 잡은 버전에 `-`가 포함되면 `--tag rc`로 발행한다. `--provenance`와 `--tag rc`의 조합은 문서화가 충분하지 않다. provenance 자체는 dist-tag와 무관하게 동작해야 하지만, npm 패키지 페이지에서 rc 태그 버전의 provenance 배지가 정상 표시되는지 검증이 필요하다.

**예방:**
1. 첫 OIDC 릴리스를 rc 버전으로 테스트하여 provenance 배지 확인
2. `pnpm publish --provenance --access public --no-git-checks --tag rc` 동작 검증
3. `--access public`이 provenance와 함께 필요한지 확인 (scoped 패키지의 경우 첫 발행 시 필수이나, 기존 패키지는 publishConfig에 설정되어 있으므로 문제 없을 가능성 높음)

**감지:** npm 패키지 페이지에서 provenance 배지 미표시

---

### Pitfall 13: `.npmrc` 스텝 제거 시 레지스트리 URL 미설정

**심각도:** MINOR -- 기본값이 npmjs.org이므로 일반적으로 문제 없음
**신뢰도:** LOW (이론적 가능성, 실제 문제 보고 없음)
**해당 Phase:** Phase 3 (정리)

**무엇이 잘못되는가:** 현재 `Setup npmrc` 스텝이 `//registry.npmjs.org/:_authToken`을 설정한다. 이 스텝을 제거하면 레지스트리 URL 설정도 사라진다. pnpm은 기본적으로 `https://registry.npmjs.org/`를 사용하므로 보통 문제없지만, `.npmrc` 파일이 프로젝트에 존재하면서 다른 레지스트리를 가리키는 경우 문제가 될 수 있다.

**예방:**
1. 프로젝트 루트의 `.npmrc` 파일에 커스텀 레지스트리 설정이 있는지 확인
2. OIDC 모드에서는 `.npmrc`의 `_authToken` 줄만 제거하고, 레지스트리 URL 설정은 유지

**감지:** "Cannot publish to private registry" 또는 의도치 않은 레지스트리로 발행 시도

---

### Pitfall 14: Private 저장소에서 provenance 미생성

**심각도:** MINOR -- 현재 public repo이므로 해당 없음
**신뢰도:** HIGH (npm 공식 문서)
**해당 Phase:** 해당 없음 (정보 기록용)

**무엇이 잘못되는가:** provenance attestation은 private 저장소에서 발행된 패키지에는 생성되지 않는다. 향후 저장소를 private으로 전환할 경우 provenance가 중단된다.

**예방:**
1. 저장소가 public 상태인지 확인 (현재 public이므로 문제 없음)
2. 저장소 가시성 변경 시 provenance 영향 인지

---

## Phase별 경고 요약

| Phase | 함정 | 심각도 | 완화 |
|-------|------|--------|------|
| Phase 1: npmjs.com 수동 설정 | Pitfall 3: 패키지 누락 등록 | CRITICAL | 8개 체크리스트 + 스크린샷 |
| Phase 1: npmjs.com 수동 설정 | Pitfall 7: 필드값 대소문자/공백 불일치 | MODERATE | 텍스트 파일로 준비 후 복사-붙여넣기 |
| Phase 1: npmjs.com 수동 설정 | Pitfall 8: Environment 이름 불일치 | MODERATE | `production` 명시적 설정 확인 |
| Phase 2: release.yml 수정 | Pitfall 1: repository.url 불일치 | CRITICAL | 8개 package.json URL 수정 필수 |
| Phase 2: release.yml 수정 | Pitfall 2: npm CLI 버전 부족 | CRITICAL | npm 11.5.1+ 설치 스텝 추가 |
| Phase 2: release.yml 수정 | Pitfall 4: id-token 퍼미션 배치 | CRITICAL | deploy 잡에만 contents+id-token |
| Phase 2: release.yml 수정 | Pitfall 6: dry-run + provenance 비호환 | MODERATE | publish-check에서 provenance 제외 |
| Phase 2: release.yml 수정 | Pitfall 9: Scoped 패키지 OIDC 404 | MODERATE | npm 버전으로 해결 |
| Phase 2: release.yml 수정 | Pitfall 10: workflow_dispatch 호환성 | MODERATE | 역할 재정의 또는 현상 유지 |
| Phase 2: release.yml 수정 | Pitfall 11: 부분 발행 실패 복구 | MODERATE | 재시도 로직 + 의존 순서 발행 |
| Phase 2: release.yml 수정 | Pitfall 12: Pre-release + provenance | MINOR | rc 버전으로 첫 테스트 |
| Phase 3: 정리 | Pitfall 5: NPM_TOKEN 조기 제거 | CRITICAL | 2-릴리스 검증 후 제거 |
| Phase 3: 정리 | Pitfall 13: .npmrc 레지스트리 설정 | MINOR | 커스텀 레지스트리 확인 |

---

## WAIaaS 프로젝트 고유 위험 요약

1. **repository.url 불일치가 가장 급박한 문제:** 현재 package.json의 `minho-yoo/waiaas`와 실제 원격 `minhoyoo-iotrust/WAIaaS`가 다르다. OIDC 전환과 무관하게 수정이 필요하며, provenance 사용 시 필수.

2. **8개 scoped 패키지 전부 영향:** 모든 패키지가 `@waiaas` 스코프이므로, scoped 패키지 관련 OIDC 버그에 전부 노출. npm CLI 버전 관리가 특히 중요.

3. **기존 파이프라인의 복잡성:** 6-job 파이프라인에 OIDC를 추가할 때, deploy 잡만 수정하면 되지만 publish-check 잡과의 정합성(dry-run에서 provenance 제외)을 반드시 확인해야 한다.

4. **production environment + 수동 승인 게이트:** 이미 `production` 환경에 수동 승인이 설정되어 있으므로, npmjs.com에 `production`을 정확히 등록하면 보안 체인이 완성된다.

---

## 출처

### 공식 문서
- [npm Trusted Publishing 공식 문서](https://docs.npmjs.com/trusted-publishers/)
- [npm Provenance 공식 문서](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Actions OIDC 공식 문서](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

### GitHub Issues (버그/기능)
- [pnpm#9812: OIDC 지원 요청 (closed, pnpm은 npm publish를 내부 사용)](https://github.com/pnpm/pnpm/issues/9812)
- [npm/cli#8678: Scoped 패키지 OIDC 404 버그](https://github.com/npm/cli/issues/8678)
- [npm/cli#8036: repository.url 불일치 provenance 에러](https://github.com/npm/cli/issues/8036)
- [npm/cli#7654: dry-run에서도 provenance가 생성되는 버그](https://github.com/npm/cli/issues/7654)
- [npm/cli#8730: GitHub Actions에서 OIDC 발행 실패](https://github.com/npm/cli/issues/8730)

### 커뮤니티 가이드
- [Phil Nash: Things you need to do for npm trusted publishing to work](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [vcfvct: Publishing to npm with GitHub Actions + OIDC -- What I Learned](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/)
- [Speakeasy: Securing Your NPM Publishing](https://www.speakeasy.com/blog/npm-trusted-publishing-security)
- [Socket.dev: npm Adopts OIDC for Trusted Publishing](https://socket.dev/blog/npm-trusted-publishing)
- [npm Classic Token 제거 타임라인](https://github.com/orgs/community/discussions/179562)
- [MakerX: Catch up on the new NPM Trusted Publishing feature](https://blog.makerx.com.au/catch-up-on-the-new-npm-trusted-publishing-feature/)
