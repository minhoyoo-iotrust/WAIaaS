---
phase: 170-deploy-prerelease
verified: 2026-02-18T01:14:48Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 170: 배포 활성화 + Pre-release Verification Report

**Phase Goal:** npm 8개 패키지 + Docker 이미지가 실제 레지스트리에 발행되고, release-please 2-게이트 파이프라인이 E2E 검증된 상태
**Verified:** 2026-02-18T01:14:48Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 8개 publishable 패키지가 npm publish --dry-run 전수 성공한다 | VERIFIED | 170-01-SUMMARY: "8개 publishable 패키지 전수 npm publish --dry-run 성공 확인", admin(private:true)은 npm pack --dry-run 별도 확인. 170-03-SUMMARY: npm 8개 패키지 v2.0.0-rc.1 실제 발행 PASS |
| 2 | Docker 이미지가 Docker Hub + GHCR 이중 레지스트리에 push 성공한다 | VERIFIED | 170-02-SUMMARY: "docker-publish job에 Docker Hub 로그인 + 듀얼 레지스트리 이미지 push 추가". 170-03-SUMMARY Verification Results: "Docker GHCR push: PASS", "Docker Hub push: PASS" |
| 3 | release.yml deploy job에서 dry-run이 제거되어 실제 배포가 활성화된다 | VERIFIED | 170-02-SUMMARY: commit 5e8ef95, "release.yml deploy job에서 --dry-run 제거, 8개 패키지 실제 npm publish 활성화" |
| 4 | release-please 2-게이트 모델로 v2.0.0-rc.1 pre-release가 발행된다 | VERIFIED | 170-03-SUMMARY: "v2.0.0-rc.1 RC 릴리스 전체 파이프라인 E2E 검증 완료", npm 8개 패키지 + Docker 2 레지스트리 발행 성공 |
| 5 | GitHub Release v2.0.0-rc.1이 생성된다 | VERIFIED | 170-03-SUMMARY Verification Results: "GitHub Release (Pre-release): PASS" |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `release-please-config.json` | RC 설정 포함 | VERIFIED | release-as: "2.0.0-rc.1", prerelease: true |
| `.github/workflows/release-please.yml` | RELEASE_PAT + googleapis action | VERIFIED | googleapis/release-please-action@v4, RELEASE_PAT 토큰 |
| `.github/workflows/release.yml` | 8패키지 publish + Docker Hub | VERIFIED | 8패키지 PACKAGES 배열, Docker Hub 듀얼 레지스트리, dry-run 제거 |
| `Dockerfile` | turbo 필터 빌드 | VERIFIED | daemon+cli+mcp+sdk 필터 빌드, skills 제외 |
| npm @waiaas/* v2.0.0-rc.1 (8개) | npm 레지스트리 발행 | VERIFIED | core, daemon, cli, sdk, mcp, skills, adapter-solana, adapter-evm 전수 PASS |
| Docker waiaas/daemon | Docker Hub + GHCR push | VERIFIED | GHCR push PASS, Docker Hub push PASS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| release-please-config.json | release-please.yml | RC 설정 연동 | WIRED | release-as: "2.0.0-rc.1" 설정이 Release PR 생성 시 반영 |
| release-please.yml | release.yml | on: release published 트리거 | WIRED | RELEASE_PAT로 cross-workflow 트리거 활성화 (GITHUB_TOKEN 제한 해결) |
| release.yml | npm registry | npm publish | WIRED | NPM_TOKEN (Classic Automation Token)으로 8패키지 발행 |
| release.yml | Docker Hub + GHCR | docker push | WIRED | DOCKERHUB_USERNAME/TOKEN + GITHUB_TOKEN으로 듀얼 push |
| 170-01-SUMMARY | 170-02-SUMMARY | publish 준비 → 파이프라인 활성화 | WIRED | dry-run 검증 → 실제 배포 활성화 순서 |
| 170-02-SUMMARY | 170-03-SUMMARY | 파이프라인 활성화 → E2E 검증 | WIRED | release.yml 실전 전환 → RC 릴리스 트리거 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| DEPLOY-01 | 170-01 | 9개 npm 패키지 npm publish --dry-run 성공 | SATISFIED | 170-01-SUMMARY: 8개 publishable 패키지 dry-run 성공 + admin(private:true) pack --dry-run 성공 = 9개 전수 검증. 170-03-SUMMARY: v2.0.0-rc.1 실제 publish 8개 성공 |
| DEPLOY-02 | 170-02, 170-03 | Docker 이미지 Docker Hub push | SATISFIED | 170-02-SUMMARY: Docker Hub 듀얼 레지스트리 설정. 170-03-SUMMARY: "Docker Hub push: PASS" |
| DEPLOY-03 | 170-02 | release.yml dry-run 제거 | SATISFIED | 170-02-SUMMARY: commit 5e8ef95, "--dry-run 제거, 8개 패키지 실제 npm publish 활성화" |
| DEPLOY-04 | 170-03 | release-please 2-게이트 GitHub Release | SATISFIED | 170-03-SUMMARY: "release-please 2-게이트 모델로 v2.0.0-rc.1 pre-release 발행", "GitHub Release (Pre-release): PASS" |
| RELEASE-03 | 170-03 | pre-release v2.0.0-rc.1 발행 | SATISFIED | 170-03-SUMMARY: "v2.0.0-rc.1 RC 릴리스 전체 파이프라인 E2E 검증 완료", npm 8개 + Docker 2 레지스트리 발행, 3일 관찰 계획 |

**Orphaned requirements:** 없음 (Phase 170에 매핑된 5개 요구사항 모두 커버됨)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| - | - | - | - | 없음 |

릴리스 파이프라인 설정 파일에 TODO/FIXME/플레이스홀더 없음.

### Human Verification Required

없음 -- npm 레지스트리 발행 결과와 Docker 이미지 push 결과는 170-03-SUMMARY의 Verification Results 테이블에서 PASS 확인됨.
GitHub Actions 워크플로 실행 로그에서 각 job 성공 확인 완료.

### Gaps Summary

없음. 모든 자동화 검증 통과.

---

## Verification Details

### Commit Evidence

- Commit `543ba8a` (170-01): 패키지 메타데이터 + publishConfig.access + release-please skills 동기화
- Commit `5e8ef95` (170-02): release.yml 8패키지 실제 publish + Docker Hub 듀얼 레지스트리 + dry-run 제거
- Commit `44135cc` (170-03): release-please RC 설정 (release-as: 2.0.0-rc.1)
- Commit `d882e77` (170-03): Solana 인스톨러 Anza 공식 교체
- Commit `78ee4aa` (170-03): Docker builder 필터 빌드 (daemon+cli+mcp)
- Commit `640e907` (170-03): Docker builder sdk 추가

### npm Publish Evidence (170-03-SUMMARY)

| 패키지 | 버전 | 결과 |
|--------|------|------|
| @waiaas/core | 2.0.0-rc.1 | PASS |
| @waiaas/daemon | 2.0.0-rc.1 | PASS |
| @waiaas/cli | 2.0.0-rc.1 | PASS |
| @waiaas/sdk | 2.0.0-rc.1 | PASS |
| @waiaas/mcp | 2.0.0-rc.1 | PASS |
| @waiaas/skills | 2.0.0-rc.1 | PASS |
| @waiaas/adapter-solana | 2.0.0-rc.1 | PASS |
| @waiaas/adapter-evm | 2.0.0-rc.1 | PASS |

### Docker Push Evidence (170-03-SUMMARY)

| 레지스트리 | 이미지 | 결과 |
|-----------|--------|------|
| GHCR | ghcr.io/minhoyoo-iotrust/waiaas | PASS |
| Docker Hub | waiaas/daemon | PASS |

---

_Verified: 2026-02-18T01:14:48Z_
_Verifier: Claude (gsd-executor)_
