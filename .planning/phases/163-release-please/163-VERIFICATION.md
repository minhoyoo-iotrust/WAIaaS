---
phase: 163-release-please
verified: 2026-02-17T02:00:00Z
status: human_needed
score: 7/9 must-haves verified (2 require runtime confirmation)
re_verification: false
human_verification:
  - test: "feat: 타입 커밋을 main에 머지한 후 GitHub Actions에서 release-please 워크플로우가 실행되고 Release PR이 자동 생성되는지 확인"
    expected: "release-please 봇이 CHANGELOG.md 업데이트 + 버전 범프를 포함한 Release PR을 생성한다"
    why_human: "GitHub Actions가 실제로 실행되어야만 확인 가능한 런타임 동작 (RLSE-02)"
  - test: "Release PR을 머지한 후 CHANGELOG.md 갱신 + GitHub Release 생성 + 태그 자동 생성 여부 확인"
    expected: "CHANGELOG.md에 새 섹션 추가, GitHub Release 페이지에 릴리스 게시, v{version} 태그 생성"
    why_human: "release-please Release PR 머지 이후의 GitHub 플랫폼 동작 — 로컬에서 검증 불가 (RLSE-03)"
  - test: "GitHub repository settings에서 'production' Environment Protection Rules(Required reviewers)가 설정되어 있는지 확인"
    expected: "deploy job이 실행 전 지정된 reviewer의 승인을 대기한다"
    why_human: "GitHub Repository 설정이 로컬 코드 검사 범위 밖에 있음 (RLSE-05 실제 게이트 동작)"
---

# Phase 163: release-please Verification Report

**Phase Goal:** Conventional Commits 기반으로 CHANGELOG/버전/태그가 자동 관리되고, 2-게이트(Release PR 머지 + 배포 승인)로 안전하게 릴리스되는 상태
**Verified:** 2026-02-17T02:00:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | release-please 설정 파일이 모노레포 루트 단일 버전 전략으로 구성되어 있다 | VERIFIED | `.release-please-manifest.json` (`".": "1.7.0"`), `release-please-config.json` (`release-type: node`, `bump-minor-pre-major: false`, 9개 extra-files) |
| 2   | release-please.yml 워크플로우가 main 푸시 시 자동 실행되어 Release PR을 생성/갱신한다 | ? UNCERTAIN | 워크플로우 설정 확인됨 (`on: push: branches: [main]`, `google-github-actions/release-please-action@v4`) — 실제 Release PR 생성은 런타임 동작으로 human 확인 필요 |
| 3   | Release PR 머지 시 CHANGELOG.md가 갱신되고 GitHub Release + 태그가 자동 생성된다 | ? UNCERTAIN | release-please의 기본 동작이며 설정이 올바름 — Release PR 머지 실행 후 인간 확인 필요 |
| 4   | BREAKING CHANGE 커밋 시 major 버전이 범프된다 | VERIFIED | `release-please-config.json`에 `"bump-minor-pre-major": false`로 설정 — 1.x 단계에서도 BREAKING CHANGE가 major 범프를 유발한다 |
| 5   | GitHub Release published 이벤트로 release.yml이 자동 트리거된다 | VERIFIED | `release.yml` line 4-5: `on: release: types: [published]` |
| 6   | 품질 게이트(test, chain-integration, platform, publish-check) 통과 후 deploy job이 environment: production으로 대기한다 | VERIFIED | `release.yml` line 191: `needs: [test, chain-integration, platform, publish-check, docker-publish]`, line 193: `environment: production` |
| 7   | 배포 승인 후 npm publish dry-run + Docker push가 실행된다 (v2.0 전까지 dry-run) | VERIFIED | deploy job의 npm publish 단계에 `--dry-run` 플래그 존재 (line 209). Docker push는 `docker-publish` job이 처리 |
| 8   | tag-release.sh가 폐기 표시되어 실행 시 release-please 사용 안내를 출력한다 | VERIFIED | `scripts/tag-release.sh`: `DEPRECATED` 헤더 주석, `exit 1`, "ERROR: tag-release.sh is DEPRECATED since v1.8.1" 메시지 출력 |
| 9   | CLAUDE.md의 Milestone Completion 규칙이 v1.8.1 이후 2-게이트 모델만 기술한다 | VERIFIED | "v1.8.1 이전" 텍스트 제거 확인, "release-please가 버전 범프 + 태그 + CHANGELOG를 자동 관리한다 (2-게이트 모델)" + Conventional Commits 규약 안내 포함 |

**Score:** 7/9 truths verified (2 require runtime confirmation)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `.release-please-manifest.json` | 루트 패키지 버전 매핑 `"."` | VERIFIED | 존재, `".": "1.7.0"` 포함, JSON 유효 |
| `release-please-config.json` | release-please 설정 (release-type, extra-files, changelog-sections) | VERIFIED | 존재, `release-type: node`, 9개 extra-files (8 Node.js 패키지 + python-sdk), `bump-minor-pre-major: false`, `include-v-in-tag: true`, JSON 유효 |
| `.github/workflows/release-please.yml` | release-please GitHub Action 워크플로우 | VERIFIED | 존재, `google-github-actions/release-please-action@v4` 사용, `on: push: branches: [main]` 트리거, outputs 3종 노출 |
| `.github/workflows/release.yml` | 릴리스 품질 게이트 + 2-게이트 deploy job | VERIFIED | 존재, deploy job에 `environment: production` + `if: github.event_name == 'release'` + `needs` 5개 job |
| `scripts/tag-release.sh` | 폐기 안내 스크립트 | VERIFIED | 존재, "DEPRECATED" 포함, `exit 1`, 원본 스크립트 ARCHIVED 주석으로 보존 |
| `CLAUDE.md` | 갱신된 Milestone Completion 규칙 | VERIFIED | "release-please" 포함, "v1.8.1 이전" 텍스트 제거 확인 |

---

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `.github/workflows/release-please.yml` | `release-please-config.json` | `config-file` input | WIRED | line 23: `config-file: release-please-config.json` |
| `.github/workflows/release-please.yml` | `.release-please-manifest.json` | `manifest-file` input | WIRED | line 24: `manifest-file: .release-please-manifest.json` |
| `.github/workflows/release.yml` (deploy job) | test + chain-integration + platform + publish-check + docker-publish | `needs` dependency | WIRED | line 191: `needs: [test, chain-integration, platform, publish-check, docker-publish]` |
| `.github/workflows/release-please.yml` | `.github/workflows/release.yml` | GitHub Release published event chain | WIRED | release-please가 Release 생성 시 `release: types: [published]` 트리거 발생 (GitHub 플랫폼 레벨 연동) |
| `CLAUDE.md` (Milestone Completion) | `.github/workflows/release-please.yml` | 릴리스 흐름 설명 | WIRED | CLAUDE.md에 "release-please" 및 Release PR 머지 → deploy 흐름 명시 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| RLSE-01 | 163-01 | release-please 설정 파일(.release-please-manifest.json, release-please-config.json)을 생성한다 | SATISFIED | 두 파일 모두 존재하고 유효한 JSON |
| RLSE-02 | 163-01 | feat: 커밋 머지 시 release-please가 Release PR을 자동 생성한다 | NEEDS HUMAN | 워크플로우 설정 올바름, 런타임 동작은 human 확인 필요 |
| RLSE-03 | 163-01 | Release PR 머지(게이트 1) 시 CHANGELOG.md가 갱신되고 GitHub Release + 태그가 자동 생성된다 | NEEDS HUMAN | release-please 기본 동작, 설정 올바름, 실행 후 human 확인 필요 |
| RLSE-04 | 163-02 | GitHub Release published 시 release.yml 품질 게이트가 자동 트리거된다 | SATISFIED | `on: release: types: [published]` 확인 |
| RLSE-05 | 163-02 | 품질 게이트 통과 후 deploy job이 environment: production으로 대기한다(게이트 2) | SATISFIED | `environment: production` + 5-job needs 확인 (Environment Protection Rules는 GitHub 설정 필요) |
| RLSE-06 | 163-02 | 배포 승인 후 npm publish + Docker push를 실행한다 (v2.0 전까지 dry-run) | SATISFIED | `--dry-run` 플래그 확인, Docker push는 docker-publish job 처리 |
| RLSE-07 | 163-01 | BREAKING CHANGE 커밋 시 major 버전이 범프된다 | SATISFIED | `bump-minor-pre-major: false` 설정 확인 |
| RLSE-08 | 163-03 | tag-release.sh를 폐기하고 CLAUDE.md 규칙을 갱신한다 | SATISFIED | 폐기 스크립트 + CLAUDE.md 갱신 모두 확인 |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (없음) | - | - | - | 스캔 결과 anti-pattern 없음 |

모든 수정 파일에서 TODO/FIXME/PLACEHOLDER/빈 구현체 없음.
deploy job의 `--dry-run` 플래그는 의도적인 설계 결정 (RLSE-06 명시)이며 anti-pattern이 아님.

---

## Human Verification Required

### 1. Release PR 자동 생성 확인 (RLSE-02)

**Test:** `feat: [test commit]` 형식의 커밋을 main 브랜치에 머지한 후, GitHub Actions 탭에서 "Release Please" 워크플로우가 실행되고 release-please 봇이 Release PR을 생성하는지 확인
**Expected:** Release PR이 자동 생성되며, CHANGELOG.md 업데이트 + 버전 범프 커밋이 포함되어 있다
**Why human:** GitHub Actions 실행 및 외부 봇(release-please)의 API 호출은 로컬 코드 검사로 확인 불가

### 2. Release PR 머지 후 GitHub Release/태그 자동 생성 확인 (RLSE-03)

**Test:** release-please가 생성한 Release PR을 머지한 후, GitHub Releases 페이지에서 새 Release가 생성되고 `v{version}` 태그가 달려있는지 확인
**Expected:** CHANGELOG.md가 갱신되고, GitHub Release가 자동 게시되며, `v1.8.0` (또는 적절한 다음 버전) 태그가 생성된다
**Why human:** Release PR 머지 이후의 GitHub 플랫폼 내부 동작 — 실제 실행 없이는 확인 불가

### 3. GitHub Environment Protection Rules 설정 확인 (RLSE-05 운영 요건)

**Test:** GitHub Repository → Settings → Environments → "production" 환경이 존재하고, Required reviewers가 설정되어 있는지 확인
**Expected:** deploy job 실행 전 reviewer의 승인이 필요하며, 승인 없이는 npm publish/deploy가 실행되지 않는다
**Why human:** GitHub Repository 관리자 설정은 코드베이스 검사 범위 밖. 코드에 `environment: production`이 설정되어 있으나 실제 보호 규칙은 GitHub UI에서 별도 구성 필요

---

## Gaps Summary

자동화 검증에서 발견된 gaps 없음.

3개 항목이 human verification으로 분류되었으나 이는 런타임/플랫폼 동작으로 코드 구현 문제가 아님:
- RLSE-02, RLSE-03: release-please의 정상 동작 — 설정은 완전히 올바름
- RLSE-05: `environment: production` 코드는 존재하나 GitHub Repository 설정(Protection Rules) 구성은 별도 작업

commit 검증: `115e4f9` (plan 01), `f639e61` (plan 02), `5d7eebb` (plan 03) — 모두 git log에서 확인됨.

---

_Verified: 2026-02-17T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
