# Research Summary: npm Trusted Publishing (OIDC) 전환

**Domain:** CI/CD 보안 - npm 발행 인증 방식 OIDC 전환
**Researched:** 2026-02-18
**Overall confidence:** HIGH

---

## Executive Summary

npm Trusted Publishing은 GitHub Actions OIDC 토큰으로 npm 레지스트리에 인증하여, 장기 시크릿(NPM_TOKEN) 없이 패키지를 발행하는 메커니즘이다. 이 전환은 supply chain 보안을 크게 강화하며, npm이 공식적으로 권장하는 인증 방식이다.

핵심 발견: **새로운 라이브러리나 도구 설치가 거의 불필요하다.** 전환에 필요한 것은 (1) npmjs.com에서 8개 패키지별 Trusted Publisher 등록 (수동), (2) release.yml의 deploy 잡에 `id-token: write` 퍼미션 추가, (3) npm CLI를 11.5.1+로 업그레이드하는 워크플로 스텝 추가, (4) 기존 .npmrc auth token 스텝 제거, (5) `pnpm publish` -> `npm publish --provenance` 전환이다.

**Critical 발견: repository.url 불일치.** 현재 9개 package.json의 `repository.url`이 `https://github.com/minho-yoo/waiaas.git`로 설정되어 있으나, 실제 GitHub remote는 `git@github.com:minhoyoo-iotrust/WAIaaS.git`이다. 이 불일치는 provenance 생성 실패를 유발하므로, OIDC 전환 전에 반드시 수정해야 한다.

Sigstore/SLSA provenance는 npm CLI에 내장되어 있으며, 추가 도구(actions/attest-build-provenance, slsa-verifier 등)가 불필요하다. `--provenance` 플래그 하나로 SLSA Build L2 provenance가 자동 생성된다.

---

## Key Findings

**Stack:** npm CLI >= 11.5.1 업그레이드만 필요. pnpm 9.x, Node.js 22 유지 가능. 새 도구/라이브러리 없음. 발행 커맨드를 `pnpm publish` -> `npm publish`로 전환하여 OIDC 토큰 교환 확실성 확보.

**Architecture:** deploy 잡에만 `permissions: { contents: read, id-token: write }` 추가. 나머지 5개 잡(test, chain-integration, platform, publish-check, docker-publish) 변경 없음. OIDC 데이터 흐름: GitHub OIDC JWT -> npm 레지스트리 검증 -> 단기 토큰 교환 -> 발행 + provenance 자동 생성. 각 패키지 publish마다 독립적 토큰 교환.

**Critical pitfall:** (1) package.json `repository.url` 불일치 -- 현재 `minho-yoo/waiaas`이지만 실제 repo는 `minhoyoo-iotrust/WAIaaS`. (2) npm CLI 버전 부족 시 무증상 OIDC 폴백. (3) NODE_AUTH_TOKEN 잔존 시 OIDC 우회.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### 1. **사전 준비: package.json 수정 + Trusted Publisher 등록**

- Addresses: repository.url 일관성, npmjs.com Trusted Publisher 설정 (FEATURES.md - Table Stakes)
- Avoids: repository.url 불일치로 인한 422/provenance 실패 (PITFALLS.md - Pitfall 1), 대소문자 불일치 (Pitfall 10)
- 코드 변경: 9개 package.json의 repository.url + homepage 수정
- 수동 작업: 8개 패키지에 Trusted Publisher 등록 (npmjs.com UI, 8회 2FA)
- 병렬 가능: 코드 변경과 npmjs.com 설정은 독립적

### 2. **핵심 변경: release.yml OIDC 전환**

- Addresses: id-token:write 퍼미션, npm 업그레이드 스텝, `npm publish --provenance` 전환, Setup npmrc 제거, NODE_AUTH_TOKEN 제거
- Avoids: npm CLI 버전 부족 (Pitfall 2), NODE_AUTH_TOKEN 잔존 (Pitfall 3), permissions 오버라이드 (Pitfall 5)
- 코드 변경: release.yml deploy 잡 수정
- 의존성: Phase 1 완료 필요 (repository.url + Trusted Publisher)

### 3. **검증 및 정리**

- Addresses: provenance 배지 확인, NPM_TOKEN 시크릿 삭제
- Avoids: 너무 일찍 NPM_TOKEN 삭제로 롤백 불가 (PITFALLS.md - 롤백 전략)
- NPM_TOKEN은 OIDC 발행 성공 확인 후에만 삭제
- 의존성: 실제 릴리스에서 Phase 2 검증 완료

**Phase ordering rationale:**
- Phase 1은 위험 없는 선행 작업 (package.json 수정 + npmjs.com 설정은 기존 발행에 영향 없음)
- Phase 2는 Phase 1 완료 후 진행 (Trusted Publisher 등록 + repository.url이 선행 조건)
- Phase 3은 실제 릴리스 성공 확인 후 진행 (NPM_TOKEN 유지로 롤백 가능성 보존)

**Research flags for phases:**
- Phase 1: 표준 패턴, 추가 리서치 불필요
- Phase 2: npm publish --provenance의 OIDC 토큰 교환 동작은 실제 발행에서만 완전 검증 가능. 실패 시 NPM_TOKEN 롤백으로 대응.
- Phase 3: 표준 패턴, 추가 리서치 불필요

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm 공식 문서 + 다수 실전 블로그 + pnpm 이슈 트래커 교차 검증. 버전 요구사항 명확. |
| Features | HIGH | 전환 범위가 명확하고 잘 문서화되어 있음. 모든 항목이 단일 전환 단위. |
| Architecture | HIGH | release.yml 구조 분석 완료. OIDC 데이터 흐름, 토큰 교환 메커니즘 상세 문서화. |
| Pitfalls | HIGH | 주요 pitfall은 다수 소스에서 교차 확인. repository.url 불일치는 실제 프로젝트에서 발견됨. |

---

## Gaps to Address

- **repository.url 정확한 형식:** `git+https://github.com/minhoyoo-iotrust/WAIaaS.git` 형식이 provenance와 호환되는지 실제 발행에서만 최종 확인 가능. 다수 소스에서 이 형식을 권장하므로 HIGH confidence이지만, npm의 매칭 로직 세부 동작은 문서화가 부족.
- **8개 패키지 순차 OIDC 토큰 교환:** 각 `npm publish`마다 독립 토큰 교환이 발생한다는 것은 간접 확인됨. 순차 발행 시 지연이나 rate limiting 문제는 실제 발행에서만 확인 가능.
- **publish-check + --provenance + --dry-run 호환성:** OIDC 토큰 없는 환경에서 `--dry-run --provenance` 조합의 동작은 직접 검증하지 못함. 현재 판단: publish-check에서 `--provenance` 제외가 안전.

---

## Sources

### 공식 문서 (HIGH confidence)
- [npm Trusted Publishing Docs](https://docs.npmjs.com/trusted-publishers/)
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Actions OIDC Permissions](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)

### 이슈 트래커 (HIGH confidence)
- [pnpm/pnpm#9812 - OIDC Support](https://github.com/pnpm/pnpm/issues/9812) (Closed)
- [nodejs/node#58423 - npm 11 in Node.js 22](https://github.com/nodejs/node/issues/58423) (Closed)
- [npm/cli#8525 - OIDC auth context](https://github.com/npm/cli/issues/8525)
- [GitHub community #176761 - NPM publish OIDC](https://github.com/orgs/community/discussions/176761)

### 검증된 블로그 (MEDIUM-HIGH confidence)
- [Phil Nash - Things you need to do](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [remarkablemark - How to set up](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/)
- [npmdigest - OIDC Setup Guide](https://npmdigest.com/guides/npm-trusted-publishing)
- [vcfvct - Publishing to npm with OIDC](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/)
- [robino.dev - NPM Trusted Publishing](https://blog.robino.dev/posts/npm-trusted-publishing)
- [MakerX - NPM Trusted Publishing](https://blog.makerx.com.au/catch-up-on-the-new-npm-trusted-publishing-feature/)
