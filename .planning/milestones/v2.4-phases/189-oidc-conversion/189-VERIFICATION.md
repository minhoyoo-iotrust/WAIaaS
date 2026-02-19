---
phase: 189-oidc-conversion
verified: 2026-02-19T00:30:00Z
status: human_needed
score: 4/5 must-haves verified
human_verification:
  - test: "npmjs.com에서 8개 @waiaas/* 패키지 각각의 access 페이지 확인"
    expected: "각 패키지의 Trusted Publishers 섹션에 Repository=minhoyoo-iotrust/WAIaaS, Workflow=release.yml, Environment=production이 표시됨"
    why_human: "npmjs.com 외부 서비스 상태는 코드베이스에서 검증 불가 — 웹 UI에서만 확인 가능"
---

# Phase 189: OIDC 전환 Verification Report

**Phase Goal:** npmjs.com에 Trusted Publisher가 등록되고, release.yml deploy 잡이 OIDC 인증 + provenance 서명으로 패키지를 발행하는 상태
**Verified:** 2026-02-19T00:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | npmjs.com에서 8개 패키지 모두 Trusted Publisher로 등록되어 있다 (repo: minhoyoo-iotrust/WAIaaS, workflow: release.yml, environment: production) | ? HUMAN NEEDED | SUMMARY 완료 주장 + git commit `195665f` "docs(189): complete Trusted Publisher registration" 존재. npmjs.com 외부 상태는 코드베이스에서 검증 불가. |
| 2 | release.yml deploy 잡이 `id-token: write` + `contents: read` 퍼미션을 갖는다 | ✓ VERIFIED | `.github/workflows/release.yml` 226-228행: `permissions: { contents: read, id-token: write }` |
| 3 | deploy 잡에서 npm publish --provenance --access public으로 발행한다 (pnpm publish + NODE_AUTH_TOKEN 제거됨) | ✓ VERIFIED | 269행: `npm publish --provenance --access public --tag rc`, 271행: `npm publish --provenance --access public`. `NODE_AUTH_TOKEN` 문자열 release.yml 전체에 없음. `Setup npmrc` 스텝 없음. |
| 4 | publish-check 잡은 기존 pnpm publish --dry-run을 그대로 유지한다 (--provenance 없음) | ✓ VERIFIED | 158행: `pnpm publish --dry-run --no-git-checks`. publish-check 잡 범위 내 `--provenance` 없음. |

**Score:** 3/4 truths verified (1 requires human), all automatable checks passed

### Must-Have Truths (from Plan frontmatter)

#### Plan 189-01 must_haves (OIDC-01)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | npmjs.com에서 8개 패키지 모두 Trusted Publisher로 등록되어 있다 | ? HUMAN NEEDED | 외부 서비스 상태 |
| 2 | 각 패키지의 Trusted Publisher 설정이 Owner=minhoyoo-iotrust, Repository=WAIaaS, Workflow=release.yml, Environment=production으로 일치한다 | ? HUMAN NEEDED | 외부 서비스 상태 |

#### Plan 189-02 must_haves (OIDC-02 ~ OIDC-05)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | deploy 잡이 id-token: write 퍼미션을 갖는다 | ✓ VERIFIED | release.yml:228 `id-token: write` |
| 2 | deploy 잡에서 NODE_AUTH_TOKEN 환경변수와 Setup npmrc 스텝이 제거되었다 | ✓ VERIFIED | 전체 파일에 `NODE_AUTH_TOKEN` 0건, `Setup npmrc` 0건 |
| 3 | deploy 잡이 npm publish --provenance --access public으로 패키지를 발행한다 | ✓ VERIFIED | release.yml:269,271 |
| 4 | pre-release 버전은 --tag rc 플래그를 포함한다 | ✓ VERIFIED | release.yml:269 `--tag rc` (pre-release 분기) |
| 5 | publish-check 잡은 기존 pnpm publish --dry-run을 그대로 유지한다 | ✓ VERIFIED | release.yml:158 `pnpm publish --dry-run --no-git-checks` |

**Score:** 5/5 must-haves verified (Plan 189-02); 0/2 automatable for Plan 189-01 (human-only)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---------|---------|--------|---------|
| `.github/workflows/release.yml` | OIDC-based deploy job with provenance | ✓ VERIFIED | 284행 파일. deploy 잡 (221-284행) OIDC 전환 완료. YAML 문법 유효 (python3 yaml.safe_load PASS). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| deploy job permissions block | GitHub Actions OIDC provider | id-token: write permission | ✓ WIRED | release.yml:228 `id-token: write` in job-level permissions |
| npm publish --provenance | npmjs.com Trusted Publisher config | OIDC token exchange | ✓ WIRED (code side) / ? HUMAN (npm side) | Code: `npm publish --provenance --access public` 존재. npm 측 Trusted Publisher 등록 여부는 human verification 필요. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| OIDC-01 | 189-01 | npmjs.com 8개 패키지 Trusted Publisher 등록 | ? HUMAN NEEDED | SUMMARY 완료 주장. git `195665f`. 외부 서비스 상태 불가 검증. |
| OIDC-02 | 189-02 | deploy 잡 permissions: { contents: read, id-token: write } 추가 | ✓ SATISFIED | release.yml:226-228 |
| OIDC-03 | 189-02 | Setup npmrc 스텝 및 NODE_AUTH_TOKEN 제거 | ✓ SATISFIED | 전체 파일 검색: 0건 |
| OIDC-04 | 189-02 | pnpm publish -> npm publish --provenance --access public 전환 (pre-release --tag rc) | ✓ SATISFIED | release.yml:269,271 |
| OIDC-05 | 189-02 | publish-check 잡 pnpm publish --dry-run 유지 (--provenance 없음) | ✓ SATISFIED | release.yml:158 |

**Coverage:** 5/5 OIDC requirements mapped, 4/5 programmatically verified, 1/5 requires human.

**Orphaned requirements check:** REQUIREMENTS.md에서 Phase 189에 매핑된 요구사항은 OIDC-01~OIDC-05 5건. 두 플랜(189-01, 189-02)이 모두 선언함. 미등록 요구사항 없음.

**VERIFY-01~04는 Phase 190 범위** — Phase 189 검증 범위 외.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|---------|--------|
| (없음) | - | - | - | - |

release.yml 전체 검색 결과:
- TODO/FIXME/HACK: 0건
- placeholder/coming soon: 0건
- `return null` 류: N/A (YAML 파일)
- YAML 문법: `python3 -c "import yaml; yaml.safe_load(open(...))"` PASS

### Human Verification Required

#### 1. npmjs.com Trusted Publisher 등록 확인 (OIDC-01)

**Test:** 아래 8개 URL 각각 방문하여 Trusted Publishers 섹션 확인

- https://www.npmjs.com/package/@waiaas/core/access
- https://www.npmjs.com/package/@waiaas/daemon/access
- https://www.npmjs.com/package/@waiaas/cli/access
- https://www.npmjs.com/package/@waiaas/sdk/access
- https://www.npmjs.com/package/@waiaas/mcp/access
- https://www.npmjs.com/package/@waiaas/skills/access
- https://www.npmjs.com/package/@waiaas/adapter-solana/access
- https://www.npmjs.com/package/@waiaas/adapter-evm/access

**Expected:** 각 패키지의 "Trusted publishers" 섹션에 다음이 표시되어야 함:
- Repository: `minhoyoo-iotrust/WAIaaS`
- Workflow: `release.yml`
- Environment: `production`

**Why human:** npmjs.com 외부 서비스의 설정 상태는 코드베이스 또는 git 기록에서 프로그래밍적으로 확인 불가. SUMMARY는 사용자가 완료했다고 주장하며 git commit `195665f`가 있으나, 실제 npmjs.com 상태를 대체하지 않음.

### Gaps Summary

프로그래밍적으로 검증 가능한 모든 항목은 PASS:

- `.github/workflows/release.yml` deploy 잡: `id-token: write` + `contents: read` 퍼미션 정확히 배치됨
- `Setup npmrc` 스텝과 `NODE_AUTH_TOKEN` 완전 제거 확인
- `npm publish --provenance --access public` 양 분기(stable/pre-release) 존재 확인
- pre-release 분기에 `--tag rc` 포함 확인
- publish-check 잡에서 `pnpm publish --dry-run --no-git-checks` 유지, `--provenance` 없음 확인
- YAML 문법 유효 확인
- 커밋 `df4187c` git log에서 확인 ("ci(189-02): convert deploy job to OIDC auth with provenance signing")

OIDC-01만 인간 검증이 필요하며, 이는 Phase 189-01이 `checkpoint:human-action` 타입으로 설계된 이유와 일치함. SUMMARY 및 git 이력(커밋 `195665f`)은 작업 완료를 뒷받침하나, 외부 서비스 상태의 최종 확인은 사용자 몫.

---

_Verified: 2026-02-19T00:30:00Z_
_Verifier: Claude (gsd-verifier)_
