# Phase 159: CI/CD 파이프라인 - Research

**Researched:** 2026-02-17
**Domain:** GitHub Actions CI/CD, Turborepo monorepo, Vitest coverage, Docker build, Solana/EVM toolchain
**Confidence:** HIGH

## Summary

Phase 159는 GitHub Actions 기반 4-stage CI/CD 파이프라인(ci.yml, nightly.yml, release.yml, coverage-report.yml)과 이를 지원하는 Composite Action, coverage-gate.sh 스크립트를 구현한다. 프로젝트는 pnpm 9.15.4 + Turborepo 2.8.3 + Vitest 3.x + Node.js 22 기반 9-패키지 모노레포이며, 기존 Phase 151에서 설정한 5개 Turborepo 태스크(test:unit/integration/security/chain/platform)와 패키지별 v8 커버리지 임계값을 CI에서 활용한다.

핵심 기술 스택은 모두 안정적이고 문서화가 잘 되어 있다. GitHub Actions의 Composite Action 패턴으로 Node.js 22 + pnpm + Turborepo 캐시를 공유하고, `davelosert/vitest-coverage-report-action@v2`로 PR 커버리지 코멘트를 생성하며, `metadaoproject/setup-solana@v1.2` + `foundry-rs/foundry-toolchain@v1`로 nightly 블록체인 테스트 환경을 구성한다. Docker 빌드는 `docker/build-push-action@v6` + GHA 캐시 백엔드를 사용한다.

**Primary recommendation:** GitHub Actions YAML 4개 + Composite Action 1개 + coverage-gate.sh 스크립트 1개를 `.github/` 디렉토리에 생성한다. `--affected` 플래그 사용 시 반드시 `fetch-depth: 0` + `git fetch origin main` + `TURBO_SCM_BASE=origin/main` 환경변수를 설정해야 한다.

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions | ubuntu-latest | CI/CD 호스티드 러너 | 무료 러너, 관리 부담 없음, 프로젝트 결정 사항 |
| actions/checkout | v4 | Git 체크아웃 | 최신 안정 버전, fetch-depth 제어 지원 |
| actions/setup-node | v4 | Node.js 22 설치 + pnpm 캐시 | `cache: 'pnpm'` 옵션으로 pnpm store 자동 캐싱 |
| pnpm/action-setup | v4 | pnpm 9.15.4 설치 | packageManager 필드 자동 감지, v4가 Node.js 22 호환 |
| actions/cache | v4 | Turborepo `.turbo/` 캐시 | 빌드 캐시 재사용으로 CI 시간 단축 |
| Turborepo | 2.8.3 (프로젝트 설치) | 모노레포 태스크 실행 + `--affected` | 이미 프로젝트에 설치됨, 5개 테스트 태스크 분리 완료 |
| Vitest | 3.x (프로젝트 설치) | 테스트 실행 + v8 커버리지 | 패키지별 vitest.config.ts에 thresholds 설정 완료 |

### Supporting

| Library/Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| davelosert/vitest-coverage-report-action | v2 | PR 커버리지 코멘트 | CICD-04: PR에 핵심 4 패키지 커버리지 게시 |
| metadaoproject/setup-solana | v1.2 | Solana CLI + test-validator 설치 | CICD-02: nightly local-validator job |
| foundry-rs/foundry-toolchain | v1 | Anvil (EVM local node) 설치 | CICD-02: nightly local-validator job |
| docker/setup-buildx-action | v3 | Docker Buildx 설정 | CICD-03: release Docker 빌드 |
| docker/build-push-action | v6 | Docker 이미지 빌드 + GHA 캐시 | CICD-03: release Docker 빌드 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| davelosert action | codecov/codecov-action | codecov는 외부 서비스 의존, vitest-coverage-report는 Vitest 네이티브 json-summary 직접 소비 |
| coverage-gate.sh | Vitest --coverage.thresholds | Vitest 내장 thresholds는 패키지별 Soft/Hard 모드 전환이 불가, CI 스크립트가 유연 |
| metadaoproject/setup-solana | 수동 Solana CLI 설치 | 수동 설치는 유지보수 부담, action이 캐싱 + 버전 관리 자동화 |
| actions/cache for turbo | Turborepo Remote Cache | Remote Cache는 Vercel 계정 필요, GitHub Actions cache로 충분 |

**Installation:**
```bash
# 추가 npm 패키지 설치 불필요 - 모든 도구는 GitHub Actions에서 사용
# 로컬 개발에 필요한 도구는 이미 설치됨:
# pnpm 9.15.4, turbo 2.8.3, vitest 3.x, @vitest/coverage-v8
```

## Architecture Patterns

### Recommended Project Structure
```
.github/
├── actions/
│   └── setup/
│       └── action.yml          # CICD-05: Composite Action (Node.js 22 + pnpm + turbo cache)
└── workflows/
    ├── ci.yml                  # CICD-01: push(Stage 1) + PR(Stage 2)
    ├── nightly.yml             # CICD-02: UTC 02:30 cron + manual
    ├── release.yml             # CICD-03: release published + manual
    └── coverage-report.yml     # CICD-04: PR 커버리지 코멘트
scripts/
└── coverage-gate.sh            # CICD-06: Soft/Hard 커버리지 게이트
```

### Pattern 1: Composite Action for Shared Setup (CICD-05)
**What:** Node.js 22 + pnpm + Turborepo 캐시를 하나의 Composite Action으로 캡슐화
**When to use:** 모든 워크플로우의 공통 setup 단계
**Example:**
```yaml
# .github/actions/setup/action.yml
name: 'WAIaaS Setup'
description: 'Node.js 22 + pnpm + Turborepo cache'
runs:
  using: 'composite'
  steps:
    - name: Setup pnpm
      uses: pnpm/action-setup@v4
      # version은 package.json의 packageManager 필드에서 자동 감지

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: 'pnpm'

    - name: Cache Turborepo
      uses: actions/cache@v4
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: |
          ${{ runner.os }}-turbo-

    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```
**Source:** Turborepo 공식 CI 가이드 (turborepo.dev/docs/guides/ci-vendors/github-actions)

### Pattern 2: Concurrency with cancel-in-progress (CICD-01)
**What:** 동일 PR의 이전 실행을 자동 취소하여 리소스 절약
**When to use:** ci.yml의 push/PR 트리거
**Example:**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```
**Source:** GitHub Docs (docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs)

### Pattern 3: Turborepo --affected for Push (CICD-01 Stage 1)
**What:** 변경된 패키지만 lint/typecheck/unit 실행
**When to use:** push 이벤트에서 Stage 1
**Example:**
```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    fetch-depth: 0  # --affected에 필요한 전체 git 히스토리

- name: Fetch base branch
  run: git fetch origin main

- name: Lint (affected)
  run: pnpm turbo run lint --affected
  env:
    TURBO_SCM_BASE: origin/main

- name: Typecheck (affected)
  run: pnpm turbo run typecheck --affected
  env:
    TURBO_SCM_BASE: origin/main

- name: Unit test (affected)
  run: pnpm turbo run test:unit --affected -- --coverage
  env:
    TURBO_SCM_BASE: origin/main
```
**Source:** Turborepo 문서 + Rebecca MDePrey 블로그 (rebeccamdeprey.com/blog/using-the-turborepo---affected-flag-in-ci)

### Pattern 4: vitest-coverage-report for Multiple Packages (CICD-04)
**What:** 핵심 4 패키지의 커버리지를 PR 코멘트로 게시
**When to use:** PR 이벤트에서 coverage-report.yml
**Example:**
```yaml
- name: Coverage Report - Core
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/core'
    json-summary-path: packages/core/coverage/coverage-summary.json
    json-final-path: packages/core/coverage/coverage-final.json
    working-directory: packages/core

- name: Coverage Report - Daemon
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/daemon'
    json-summary-path: packages/daemon/coverage/coverage-summary.json
    json-final-path: packages/daemon/coverage/coverage-final.json
    working-directory: packages/daemon
```
**Source:** davelosert/vitest-coverage-report-action README (github.com/davelosert/vitest-coverage-report-action)

### Pattern 5: Nightly Cron with Local Validators (CICD-02)
**What:** Solana test-validator + Anvil을 CI에서 실행
**When to use:** nightly.yml UTC 02:30 cron
**Example:**
```yaml
local-validator:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup

    - name: Setup Solana
      uses: metadaoproject/setup-solana@v1.2
      with:
        solana-cli-version: stable

    - name: Start solana-test-validator
      run: |
        solana-test-validator --reset --quiet &
        sleep 10
        solana cluster-version

    - name: Setup Foundry (Anvil)
      uses: foundry-rs/foundry-toolchain@v1

    - name: Start Anvil
      run: |
        anvil --silent &
        sleep 3

    - name: Build
      run: pnpm turbo run build

    - name: Chain tests
      run: pnpm turbo run test:chain
```
**Source:** metadaoproject/setup-solana README + foundry-rs/foundry-toolchain README

### Pattern 6: Docker Build with GHA Cache (CICD-03)
**What:** Docker 이미지 빌드 + GitHub Actions 캐시 백엔드
**When to use:** release.yml에서 Docker 빌드
**Example:**
```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build Docker image
  uses: docker/build-push-action@v6
  with:
    context: .
    push: false
    load: true
    tags: waiaas-daemon:test
    cache-from: type=gha
    cache-to: type=gha,mode=max

- name: Test Docker image
  run: |
    docker run -d --name waiaas-test -p 3100:3100 \
      -e WAIAAS_MASTER_PASSWORD=test-password waiaas-daemon:test
    sleep 10
    curl -f http://localhost:3100/health
    docker stop waiaas-test
```
**Source:** Docker 공식 문서 (docs.docker.com/build/ci/github-actions/cache/)

### Anti-Patterns to Avoid
- **fetch-depth: 1 with --affected:** 기본 checkout은 shallow clone(depth=1)이라 `--affected`가 base branch를 찾지 못한다. 반드시 `fetch-depth: 0`을 사용하라.
- **turbo cache 키에 lockfile 해시 사용:** Turborepo 캐시는 빌드 출력 캐시이므로 `github.sha` 기반이 적합. lockfile 해시는 pnpm store 캐시에 사용 (actions/setup-node가 자동 처리).
- **coverage-report를 별도 워크플로우로 분리 시 권한 문제:** `workflow_run` 트리거는 fork PR에서 `pull-requests: write` 권한이 없을 수 있다. 같은 워크플로우 내에서 실행하거나 `actions: read` 권한을 추가로 설정해야 한다.
- **Turborepo --affected + --parallel 동시 사용:** `--affected`는 `--parallel` 플래그와 함께 사용하면 무시된다. Turborepo의 기본 병렬화만 사용하라.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| pnpm store 캐싱 | actions/cache 수동 설정 | actions/setup-node `cache: 'pnpm'` | setup-node v4가 자동으로 pnpm store 경로를 감지하고 캐싱 |
| Vitest PR 커버리지 코멘트 | 커스텀 파싱 스크립트 | davelosert/vitest-coverage-report-action@v2 | json-summary 직접 파싱, threshold 아이콘 표시, 여러 패키지 `name` 분리 지원 |
| Solana CLI 설치 | apt-get + curl 수동 설치 | metadaoproject/setup-solana@v1.2 | 버전 관리 + 캐싱 자동화, 유지보수 용이 |
| Docker layer 캐시 | 수동 save/load 스크립트 | docker/build-push-action@v6 `cache-from/to: type=gha` | GHA 캐시 백엔드 네이티브 지원, mode=max로 전체 레이어 캐싱 |
| 패키지별 커버리지 파싱 | 커스텀 Node.js 스크립트 | jq + bash 스크립트 (coverage-gate.sh) | json-summary 형식이 단순하여 jq로 충분, 외부 의존 없음 |

**Key insight:** CI/CD 파이프라인의 모든 인프라 도구는 GitHub Actions 생태계에서 잘 관리되는 공식/준공식 Action으로 해결 가능하다. 커스텀 빌드가 필요한 부분은 coverage-gate.sh 스크립트 하나뿐이다.

## Common Pitfalls

### Pitfall 1: --affected가 모든 패키지를 실행
**What goes wrong:** `turbo run test:unit --affected`가 변경된 패키지만이 아닌 전체 패키지를 실행한다.
**Why it happens:** CI 환경에서 git이 detached HEAD 상태이고, base branch 정보가 없어서 모든 패키지를 "affected"로 판단한다.
**How to avoid:** 3가지를 반드시 설정: (1) `fetch-depth: 0`, (2) `git fetch origin main`, (3) `env: TURBO_SCM_BASE: origin/main`
**Warning signs:** CI 로그에서 전체 8개 패키지가 모두 실행됨, "cannot find merge base" 에러 메시지.

### Pitfall 2: vitest-coverage-report-action이 thresholds를 읽지 못함
**What goes wrong:** PR 코멘트에 threshold 대비 상태가 표시되지 않는다.
**Why it happens:** vitest-coverage-report-action은 vitest.config.ts에서 직접 정의된 thresholds만 읽는다. workspace 레벨에서 상속된 thresholds는 감지하지 못한다.
**How to avoid:** 각 패키지의 vitest.config.ts에 thresholds가 직접 정의되어 있는지 확인 (Phase 151에서 이미 설정 완료).
**Warning signs:** PR 코멘트에 threshold 열이 비어있거나 0%로 표시.

### Pitfall 3: sodium-native/better-sqlite3 빌드 실패
**What goes wrong:** `pnpm install`에서 native addon 빌드가 실패한다.
**Why it happens:** ubuntu-latest에 python3/make/g++ 빌드 도구가 없거나, Node.js 버전 불일치로 prebuild 바이너리가 없다.
**How to avoid:** ubuntu-latest에는 기본 빌드 도구가 포함되어 있지만, 문제 발생 시 Composite Action에 `sudo apt-get install -y python3 make g++` 단계를 추가한다.
**Warning signs:** `node-gyp rebuild` 에러, `prebuild-install WARN` 메시지.

### Pitfall 4: Docker 빌드에서 GHA 캐시가 적용되지 않음
**What goes wrong:** 매 빌드마다 전체 레이어를 재빌드한다.
**Why it happens:** `docker/setup-buildx-action`을 누락하면 기본 Docker builder가 GHA 캐시 백엔드를 지원하지 않는다.
**How to avoid:** 반드시 `docker/setup-buildx-action@v3`을 `docker/build-push-action` 전에 실행한다.
**Warning signs:** 빌드 시간이 일정하게 5분+ (캐시 히트 시 1-2분이어야 함).

### Pitfall 5: coverage-report.yml에서 fork PR 권한 부족
**What goes wrong:** fork에서 올린 PR에 커버리지 코멘트가 작성되지 않는다.
**Why it happens:** fork PR은 `GITHUB_TOKEN`에 `pull-requests: write` 권한이 없다.
**How to avoid:** coverage-report를 별도 `workflow_run` 트리거로 분리하거나, 프로젝트가 fork PR을 받지 않으면 무시해도 된다.
**Warning signs:** "Resource not accessible by integration" 에러.

### Pitfall 6: nightly cron이 비활성 레포에서 자동 비활성화
**What goes wrong:** 60일간 커밋이 없으면 GitHub가 cron 워크플로우를 자동 비활성화한다.
**Why it happens:** GitHub의 리소스 절약 정책.
**How to avoid:** `workflow_dispatch` 트리거를 함께 설정하여 수동 실행 가능하게 하고, 60일 이내에 커밋이 있으면 문제없다.
**Warning signs:** Actions 탭에서 워크플로우가 "Disabled" 표시.

### Pitfall 7: Solana test-validator 시작 타이밍
**What goes wrong:** chain 테스트가 validator 연결에 실패한다.
**Why it happens:** test-validator 시작 후 ready 상태까지 수초~30초 소요.
**How to avoid:** `sleep 10` + health check 폴링으로 ready 대기. 테스트 코드에서도 `describe.skipIf(!validatorRunning)` 패턴 사용 (Phase 154에서 이미 구현).
**Warning signs:** "Connection refused" 에러, 간헐적 chain test 실패.

## Code Examples

### coverage-gate.sh 스크립트 패턴 (CICD-06)
```bash
#!/usr/bin/env bash
# scripts/coverage-gate.sh
# Usage: COVERAGE_GATE_MODE=soft|hard ./scripts/coverage-gate.sh
#
# 환경변수:
#   COVERAGE_GATE_MODE: soft (경고만) | hard (실패) - 기본값 soft
#   COVERAGE_GATE_<PACKAGE>: 패키지별 모드 오버라이드 (예: COVERAGE_GATE_CORE=hard)
#
# 패키지별 임계값은 각 패키지의 vitest.config.ts에서 정의.
# 이 스크립트는 coverage/coverage-summary.json을 읽어 임계값을 검증.

set -euo pipefail

MODE="${COVERAGE_GATE_MODE:-soft}"

# 핵심 4 패키지 정의
PACKAGES=(
  "packages/core"
  "packages/daemon"
  "packages/adapters/solana"
  "packages/sdk"
)

# 패키지별 Hard 임계값 (lines 기준)
declare -A THRESHOLDS
THRESHOLDS[packages/core]=90
THRESHOLDS[packages/daemon]=85
THRESHOLDS[packages/adapters/solana]=80
THRESHOLDS[packages/sdk]=80

check_package() {
  local pkg="$1"
  local threshold="${THRESHOLDS[$pkg]}"
  local summary="$pkg/coverage/coverage-summary.json"

  if [ ! -f "$summary" ]; then
    echo "::warning::Coverage summary not found: $summary"
    return 0
  fi

  local lines
  lines=$(jq '.total.lines.pct' "$summary")

  # 패키지별 모드 오버라이드 확인
  local pkg_var
  pkg_var="COVERAGE_GATE_$(echo "$pkg" | tr '/' '_' | tr '[:lower:]' '[:upper:]')"
  local pkg_mode="${!pkg_var:-$MODE}"

  if (( $(echo "$lines < $threshold" | bc -l) )); then
    if [ "$pkg_mode" = "hard" ]; then
      echo "::error::$pkg coverage ${lines}% < ${threshold}% (HARD GATE)"
      return 1
    else
      echo "::warning::$pkg coverage ${lines}% < ${threshold}% (soft warning)"
    fi
  else
    echo "$pkg coverage ${lines}% >= ${threshold}% OK"
  fi
}

FAILED=0
for pkg in "${PACKAGES[@]}"; do
  check_package "$pkg" || FAILED=1
done

exit $FAILED
```

### ci.yml 기본 구조 (CICD-01)
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  # Stage 1: push + PR 공통
  stage1:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: git fetch origin main
      - run: pnpm turbo run lint --affected
        env:
          TURBO_SCM_BASE: origin/main
      - run: pnpm turbo run typecheck --affected
        env:
          TURBO_SCM_BASE: origin/main
      - run: pnpm turbo run test:unit --affected -- --coverage
        env:
          TURBO_SCM_BASE: origin/main

  # Stage 2: PR only - full suite + coverage gate
  stage2:
    if: github.event_name == 'pull_request'
    needs: stage1
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: pnpm turbo run build
      - run: pnpm turbo run test:unit -- --coverage
      - run: pnpm turbo run test:integration
      - run: pnpm turbo run test:security
      - run: pnpm turbo run verify:enums
      - name: Coverage Gate
        run: bash scripts/coverage-gate.sh
        env:
          COVERAGE_GATE_MODE: soft  # v1.7 초기는 soft, 이후 hard 전환
```

### nightly.yml 기본 구조 (CICD-02)
```yaml
name: Nightly
on:
  schedule:
    - cron: '30 2 * * *'  # UTC 02:30
  workflow_dispatch:

jobs:
  full-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm turbo run build
      - run: pnpm turbo run lint
      - run: pnpm turbo run typecheck
      - run: pnpm turbo run test:unit -- --coverage
      - run: pnpm turbo run test:integration
      - run: pnpm turbo run test:security

  local-validator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: metadaoproject/setup-solana@v1.2
        with:
          solana-cli-version: stable
      - run: solana-test-validator --reset --quiet &
      - run: sleep 10 && solana cluster-version
      - uses: foundry-rs/foundry-toolchain@v1
      - run: anvil --silent &
      - run: sleep 3
      - run: pnpm turbo run build
      - run: pnpm turbo run test:chain

  devnet:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm turbo run build
      - run: DEVNET_TEST=true pnpm turbo run test:chain
```

### npm dry-run 패턴 (CICD-03 release.yml)
```yaml
- name: npm publish dry-run
  run: |
    for pkg in core sdk cli mcp; do
      echo "--- Checking packages/$pkg ---"
      cd packages/$pkg
      npm publish --dry-run 2>&1 || exit 1
      cd ../..
    done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pnpm/action-setup@v2 | pnpm/action-setup@v4 | 2024 | Node.js 22 호환, packageManager 필드 자동 감지 |
| actions/cache@v3 | actions/cache@v4 | 2024 | Cache service API v2 지원 (2025-04-15부터 v1 API 중단) |
| docker/build-push-action@v5 | docker/build-push-action@v6 | 2025 | 최신 Buildx 호환, GHA 캐시 개선 |
| setup-node `cache` 수동 설정 | setup-node@v4 `cache: 'pnpm'` | 2024 | pnpm store 자동 캐싱 내장 |
| GitHub cache service API v1 | GitHub cache service API v2 | 2025-04-15 | v1 중단, v2 전용 (actions/cache@v4 사용 필수) |

**Deprecated/outdated:**
- `actions/cache@v3`: GitHub Cache API v1 중단으로 v4로 업그레이드 필수
- `pnpm/action-setup@v2-v3`: Node.js 22에서 동작 불안정, v4 사용 권장

## Project-Specific Facts

### 현재 프로젝트 상태 (Phase 151-158 완료)

| 항목 | 상태 | 위치 |
|------|------|------|
| pnpm 9.15.4 | package.json `packageManager` 필드 설정 | `/package.json` |
| Turborepo 2.8.3 | 5개 테스트 태스크 분리 완료 | `/turbo.json` |
| Vitest workspace | 8개 패키지 vitest.config.ts | `/vitest.workspace.ts` |
| v8 커버리지 | 패키지별 thresholds 설정 완료 | `packages/*/vitest.config.ts` |
| coverage/ | .gitignore에 포함 | `/.gitignore` |
| Dockerfile | Multi-stage build 완료 | `/Dockerfile` |
| docker-compose.yml | 운영 설정 완료 | `/docker-compose.yml` |
| verify:enums | 빌드타임 검증 스크립트 | `/scripts/verify-enum-ssot.ts` |
| test:chain | Solana mock-rpc + local-validator + devnet + Anvil EVM | `packages/adapters/*/src/__tests__/chain/` |
| test:security | daemon 보안 테스트 ~249건 | `packages/daemon/src/__tests__/security/` |
| test:platform | CLI 32건 + Docker 18건 + Telegram 34건 | `packages/*/src/__tests__/platform/` |

### 패키지별 커버리지 임계값 (Phase 151에서 설정)

| Package | branches | functions | lines | statements |
|---------|----------|-----------|-------|------------|
| @waiaas/core | 85 | 90 | 90 | 90 |
| @waiaas/daemon | 80 | 85 | 85 | 85 |
| @waiaas/adapter-solana | 75 | 80 | 80 | 80 |
| @waiaas/adapter-evm | 45 | 50 | 50 | 50 |
| @waiaas/sdk | 75 | 80 | 80 | 80 |
| @waiaas/cli | 65 | 70 | 70 | 70 |
| @waiaas/mcp | 65 | 70 | 70 | 70 |
| @waiaas/admin | 65 | 70 | 70 | 70 |

### 커버리지 리포터 설정 (이미 완료)
모든 패키지의 vitest.config.ts에 `reporter: ['text', 'json-summary', 'json']`이 설정되어 있다. `json-summary`는 coverage-gate.sh와 vitest-coverage-report-action이 소비하고, `json`은 상세 파일 커버리지에 사용된다.

## CICD 요구사항별 상세 매핑

### CICD-01: ci.yml

| 항목 | 구현 |
|------|------|
| Stage 1 트리거 | `push: branches: [main]` |
| Stage 2 트리거 | `pull_request: branches: [main]` |
| cancel-in-progress | `concurrency.group: ${{ github.workflow }}-${{ github.head_ref \|\| github.run_id }}` |
| turbo affected | `--affected` + `TURBO_SCM_BASE=origin/main` + `fetch-depth: 0` |
| Stage 1 steps | lint -> typecheck -> test:unit (affected, --coverage) |
| Stage 2 steps | build -> test:unit(full, --coverage) -> test:integration -> test:security -> verify:enums -> coverage-gate |

### CICD-02: nightly.yml

| 항목 | 구현 |
|------|------|
| 스케줄 | `schedule: cron: '30 2 * * *'` (UTC 02:30) |
| 수동 트리거 | `workflow_dispatch` |
| full-suite | lint + typecheck + test:unit + test:integration + test:security (전체, --affected 없음) |
| local-validator | metadaoproject/setup-solana@v1.2 + foundry-rs/foundry-toolchain@v1 + test:chain |
| devnet | `continue-on-error: true` + DEVNET_TEST 환경변수 |

### CICD-03: release.yml

| 항목 | 구현 |
|------|------|
| 트리거 | `release: types: [published]` + `workflow_dispatch` |
| full-test-suite | build -> test:unit(--coverage) -> test:integration -> test:security |
| chain-integration | local-validator job (Solana + Anvil) |
| platform-cli | test:platform (CLI 패키지) |
| platform-docker | Docker 빌드 -> health check |
| coverage-report | coverage-gate.sh hard 모드 |
| Docker 빌드 | docker/build-push-action@v6, push: false, health check |
| npm dry-run | `npm publish --dry-run` for core/sdk/cli/mcp |

### CICD-04: coverage-report.yml

| 항목 | 구현 |
|------|------|
| 트리거 | `pull_request` (ci.yml 내에 통합하거나 별도 워크플로우) |
| Action | davelosert/vitest-coverage-report-action@v2 |
| 핵심 4 패키지 | core, daemon, adapter-solana, sdk |
| name 분리 | 각 패키지별 `name` 파라미터로 독립 리포트 |
| 권한 | `pull-requests: write` |

### CICD-05: Composite Action

| 항목 | 구현 |
|------|------|
| 위치 | `.github/actions/setup/action.yml` |
| Node.js | actions/setup-node@v4, node-version: 22 |
| pnpm | pnpm/action-setup@v4 (packageManager 자동 감지) |
| Turborepo 캐시 | actions/cache@v4, path: .turbo, key: sha 기반 |
| 의존성 설치 | pnpm install --frozen-lockfile |

### CICD-06: coverage-gate.sh

| 항목 | 구현 |
|------|------|
| 모드 | COVERAGE_GATE_MODE 환경변수 (soft/hard) |
| 패키지별 오버라이드 | COVERAGE_GATE_CORE=hard 등 환경변수 |
| 임계값 소스 | 스크립트 내 하드코딩 (vitest.config.ts와 동기) |
| 출력 | ::warning:: (soft) / ::error:: + exit 1 (hard) |
| 의존성 | jq (ubuntu-latest에 기본 설치), bc |

## Open Questions

1. **coverage-report를 ci.yml에 통합 vs 별도 워크플로우**
   - What we know: ci.yml Stage 2에서 커버리지를 생성하므로 같은 워크플로우에서 리포트 가능
   - What's unclear: 별도 coverage-report.yml을 만들면 test 실행과 리포트가 분리되어 관리가 깔끔하지만, 테스트를 두 번 실행하거나 아티팩트 공유가 필요
   - Recommendation: ci.yml Stage 2 마지막에 vitest-coverage-report-action steps를 추가하는 것이 가장 단순. 별도 워크플로우는 불필요한 복잡성.

2. **`--affected` vs 전체 실행 기준**
   - What we know: Stage 1(push)은 --affected, Stage 2(PR)는 전체 실행
   - What's unclear: Stage 2에서도 --affected를 사용하면 시간 절약 가능하지만, PR merge 전 전체 테스트 통과 보장이 약해짐
   - Recommendation: 목표 문서 대로 Stage 1만 --affected, Stage 2는 전체 실행으로 유지.

3. **native addon prebuildify**
   - What we know: 설계 문서 50에서 release.yml에 "native addon prebuildify" 언급
   - What's unclear: prebuildify 설정이 복잡하고 v2.0에서 실제 npm publish 시 필요
   - Recommendation: v1.7에서는 npm dry-run만 실행하므로 prebuildify는 생략. 실제 publish 시점(v2.0)에서 구현.

## Sources

### Primary (HIGH confidence)
- [Turborepo GitHub Actions 가이드](https://turborepo.dev/docs/guides/ci-vendors/github-actions) - Composite Action, 캐싱, pnpm 설정
- [davelosert/vitest-coverage-report-action README](https://github.com/davelosert/vitest-coverage-report-action) - v2, 입력/출력, 모노레포 지원, name 파라미터
- [metadaoproject/setup-solana](https://github.com/metaDAOproject/setup-solana) - v1.2, Solana CLI 설치 action
- [foundry-rs/foundry-toolchain](https://github.com/foundry-rs/foundry-toolchain) - v1, Anvil 포함, GHA 캐싱
- [Docker GHA Cache 문서](https://docs.docker.com/build/ci/github-actions/cache/) - type=gha, mode=max
- [GitHub Actions Concurrency 문서](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) - cancel-in-progress
- 프로젝트 파일: `turbo.json`, `package.json`, `vitest.workspace.ts`, `Dockerfile`, 8개 패키지 `vitest.config.ts`

### Secondary (MEDIUM confidence)
- [Turborepo --affected CI 사용법](https://rebeccamdeprey.com/blog/using-the-turborepo---affected-flag-in-ci) - TURBO_SCM_BASE, fetch-depth 요구사항
- [Turborepo setup-node composite action](https://github.com/vercel/turborepo/blob/main/.github/actions/setup-node/action.yml) - Vercel 자체 CI 패턴 참조
- [Composite Action pnpm+cache gist](https://gist.github.com/belgattitude/838b2eba30c324f1f0033a797bab2e31) - pnpm store 캐싱 패턴

### Tertiary (LOW confidence)
- native addon prebuildify 관련 사항은 v2.0에서 실제 npm publish 시 재조사 필요

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 action 버전이 공식 문서/릴리즈에서 확인됨
- Architecture: HIGH - 프로젝트의 기존 인프라(Turborepo, Vitest, Docker)가 완비되어 있고, CI 패턴이 잘 문서화됨
- Pitfalls: HIGH - 여러 소스에서 교차 검증된 알려진 함정들
- coverage-gate.sh: MEDIUM - 커스텀 스크립트라 구현 시 에지 케이스 발견 가능

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (안정적 도구 스택, 30일)
