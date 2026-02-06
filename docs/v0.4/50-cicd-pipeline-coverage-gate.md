# 50. CI/CD 파이프라인 설계 + 커버리지 게이트 전략

**Version:** 0.4
**Phase:** 17 - CI/CD 파이프라인 설계
**Status:** Confirmed
**Created:** 2026-02-06
**Requirements:** CICD-01 (4단계 파이프라인), CICD-02 (GitHub Actions 워크플로우), CICD-03 (커버리지 게이트)
**References:** 41-test-levels-matrix-coverage.md (TLVL-01~03), 42-mock-boundaries-interfaces-contracts.md (Mock 경계), 43~47 (Security 시나리오), 48-blockchain-test-environment-strategy.md (CHAIN-01~04), 49-enum-config-consistency-verification.md (ENUM-01~03), 17-RESEARCH.md

---

## 목차

1. [개요 및 설계 원칙](#1-개요-및-설계-원칙)
2. [4단계 파이프라인 구조](#2-4단계-파이프라인-구조)
3. [Phase 14~16 테스트 레벨 매핑표](#3-phase-1416-테스트-레벨-매핑표)
4. [GitHub Actions 워크플로우 파일 구조](#4-github-actions-워크플로우-파일-구조)
5. [Composite Action: 공통 Setup](#5-composite-action-공통-setup)
6. [워크플로우별 상세 설계](#6-워크플로우별-상세-설계)
7. [Job DAG 시각화](#7-job-dag-시각화)
8. [Turborepo 태스크 기반 실행 전략](#8-turborepo-태스크-기반-실행-전략)
9. [커버리지 게이트: Soft/Hard 전환 메커니즘](#9-커버리지-게이트-softhard-전환-메커니즘)
10. [커버리지 리포트 자동 생성 방식](#10-커버리지-리포트-자동-생성-방식)
11. [패키지별 커버리지 임계값 상세](#11-패키지별-커버리지-임계값-상세)
12. [Pitfalls 및 대응 전략](#12-pitfalls-및-대응-전략)
13. [Phase 14~16 결정 사항 정합성 검증표](#13-phase-1416-결정-사항-정합성-검증표)

---

## 1. 개요 및 설계 원칙

본 문서는 Phase 14~16에서 확정한 모든 테스트 전략을 GitHub Actions CI/CD 파이프라인으로 통합하는 **설계 문서**이다. 코드를 작성하지 않으며, 구현 단계에서 워크플로우 YAML을 바로 작성할 수 있는 수준의 상세 설계를 산출한다.

**Primary recommendation:** Turborepo `turbo run` 기반 태스크 실행 + GitHub Actions job 병렬화 + ArtiomTr/jest-coverage-report-action PR 코멘트 + Soft/Hard gate 2단계 커버리지 게이트로 파이프라인을 설계하라.

### 1.1 설계 원칙

| 원칙 | 설명 |
|------|------|
| **피라미드 실행** | 빈번한 트리거일수록 빠르고 가벼운 테스트만 실행 (TLVL-01 실행 빈도 피라미드) |
| **변경 기반 실행** | push/PR에서는 `turbo run --affected`로 변경된 패키지만 테스트 |
| **전체 실행 분리** | nightly/릴리스에서는 `--affected` 없이 전체 패키지 테스트 |
| **Soft -> Hard 점진 전환** | 초기 Soft Gate(경고)에서 안정화 후 Hard Gate(차단)로 패키지별 독립 전환 (CI-GATE) |
| **외부 서비스 최소 의존** | Codecov 등 외부 SaaS 없이, Jest 내장 coverage + GitHub Actions 자체 기능으로 구성 |
| **Fork PR 보안** | coverage-report.yml을 분리하여 fork PR에서의 토큰 노출 방지 |

### 1.2 통합 대상 Phase 결정 사항 (요약)

- **Phase 14:** 6개 테스트 레벨(TLVL-01), 커버리지 4-tier(TLVL-03), Soft/Hard gate(CI-GATE), Jest 30 + @swc/jest, turbo.json 태스크 구조
- **Phase 15:** Security 테스트 매 PR 실행, 71건 보안 시나리오, 실행 시간 <1min
- **Phase 16:** Mock RPC 13개 시나리오(CHAIN-MOCK-13-SCENARIOS), Local Validator E2E 5개 흐름(CHAIN-E2E-5-FLOWS), Devnet 최대 3건(CHAIN-DEVNET-LIMIT-3), Enum SSoT 빌드타임 검증(ENUM-SSOT-DERIVE-CHAIN), config.toml Unit 테스트(CONFIG-UNIT-TEST)

---

## 2. 4단계 파이프라인 구조

Phase 14 TLVL-01의 실행 빈도 피라미드를 CI 파이프라인 4단계에 매핑한다.

### 2.1 Stage 요약 테이블

| Stage | 트리거 | 포함 테스트 유형 | 예상 시간 | 실패 시 영향 | Turborepo 모드 |
|-------|--------|----------------|----------|------------|---------------|
| **Stage 1** (매 커밋) | `push` to main/* | lint, typecheck, unit-test | ~2min | 커밋 빌드 실패 | `--affected` |
| **Stage 2** (매 PR) | `pull_request` to main | Stage 1 전체 + integration, e2e, security, enum-verify, coverage-gate | ~5min | PR 머지 차단 | `--affected` |
| **Stage 3** (nightly) | `schedule` (cron) + `workflow_dispatch` | Stage 2 전체 + chain-integration (local-validator), devnet (max 3건) | ~10min | Slack/이슈 알림 | 전체 실행 |
| **Stage 4** (릴리스) | `release` published + `workflow_dispatch` | Stage 3 전체 + platform (CLI), platform (Docker), full coverage report | ~15min | 릴리스 차단 | 전체 실행 |

### 2.2 Stage별 상세

#### Stage 1: 매 커밋 (push)

**트리거:** `push` to `main`, feature branches
**목적:** 기본 코드 품질 + 로직 정확성을 빠르게 검증

| Job | 실행 내용 | timeout-minutes | 의존 |
|-----|----------|-----------------|------|
| lint | `turbo run lint --affected` | 10 | setup |
| typecheck | `turbo run typecheck --affected` | 10 | setup |
| unit-test | `turbo run test:unit --affected -- --coverage --ci --maxWorkers=75%` | 10 | lint, typecheck |

- **Turborepo:** `--affected` 플래그로 변경된 패키지만 실행
- `typecheck`에는 Enum SSoT 빌드타임 검증(tsc --noEmit)이 포함됨
- config.toml Unit 테스트는 `test:unit`에 포함 (CONFIG-UNIT-TEST)
- Mock RPC Unit 테스트(CHAIN-MOCK-13-SCENARIOS 중 Unit 레벨)도 `test:unit`에 포함

#### Stage 2: 매 PR (pull_request)

**트리거:** `pull_request` to `main`
**목적:** Stage 1 + 모듈 간 연동, 전체 흐름, 보안, 일관성 검증

| Job | 실행 내용 | timeout-minutes | 의존 |
|-----|----------|-----------------|------|
| lint | Stage 1과 동일 | 10 | setup |
| typecheck | Stage 1과 동일 | 10 | setup |
| unit-test | Stage 1과 동일 | 10 | lint, typecheck |
| integration-test | `turbo run test:integration --affected -- --coverage --ci --runInBand` | 15 | unit-test |
| e2e-test | `turbo run test:e2e --affected -- --ci --forceExit --detectOpenHandles` | 15 | unit-test |
| security-test | `turbo run test:security --affected -- --ci --maxWorkers=75%` | 10 | unit-test |
| enum-verify | `turbo run typecheck` (전체) + `pnpm --filter @waiaas/core test -- --testPathPatterns "enum" --ci` | 5 | lint, typecheck |
| coverage-gate | `scripts/coverage-gate.sh` (Soft/Hard 모드) | 5 | integration-test, e2e-test, security-test |

- **Phase 14 결정 반영:** `--maxWorkers=75%`(Unit/Security), `--runInBand`(Integration), `--forceExit`(E2E)
- **Phase 15 결정 반영:** Security 테스트 매 PR 실행, 실행 시간 <1min(timeout 10min 여유)
- **Phase 16 결정 반영:** enum-verify job에서 ENUM-SSOT-DERIVE-CHAIN 검증(tsc --noEmit + Enum 테스트)
- Mock RPC Integration 테스트(CHAIN-MOCK-13-SCENARIOS 중 Integration 레벨)는 `test:integration`에 포함

#### Stage 3: nightly (schedule)

**트리거:** `schedule` cron(매일 UTC 02:30) + `workflow_dispatch`
**목적:** 전체 패키지 대상 Stage 1+2 + 블록체인 실제 네트워크 검증

| Job | 실행 내용 | timeout-minutes | 의존 |
|-----|----------|-----------------|------|
| full-suite | `turbo run lint typecheck test:unit test:integration test:e2e test:security -- --ci --coverage` (전체) | 20 | setup |
| local-validator | solana-test-validator + `turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000` | 15 | setup |
| devnet | `turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000 --testPathPatterns="devnet"` (max 3건, continue-on-error) | 10 | local-validator |

- **Turborepo:** `--affected` 없이 전체 패키지 실행
- **Phase 16 결정 반영:** CHAIN-E2E-5-FLOWS(local-validator), CHAIN-DEVNET-LIMIT-3(devnet max 3건, continue-on-error)
- devnet job은 `continue-on-error: true`로 네트워크 불안정에 의한 nightly 전체 실패 방지

#### Stage 4: 릴리스 (release)

**트리거:** `release` published + `workflow_dispatch`
**목적:** 릴리스 배포 전 전체 검증 + 플랫폼별 동작 확인

| Job | 실행 내용 | timeout-minutes | 의존 |
|-----|----------|-----------------|------|
| full-test-suite | Stage 3 full-suite와 동일 (전체 패키지, 모든 레벨) | 30 | setup |
| chain-integration | local-validator + devnet (Stage 3과 동일 패턴) | 15 | full-test-suite |
| platform-cli | `turbo run test:platform --filter=@waiaas/cli -- --ci` | 15 | full-test-suite |
| platform-docker | `docker build -t waiaas:test .` + health check | 15 | full-test-suite |
| coverage-report | 전체 패키지 coverage 집계 + 아티팩트 업로드 | 10 | full-test-suite |

- 릴리스 차단: 모든 job이 통과해야 릴리스 완료

---

## 3. Phase 14~16 테스트 레벨 매핑표

Phase 14 TLVL-01의 6개 레벨 + Phase 15 Security + Phase 16 Chain/Enum을 파이프라인 Stage에 매핑한다.

### 3.1 테스트 레벨 -> 파이프라인 Stage 매핑

| 테스트 레벨 | Pipeline Stage | 실행 조건 | Job 이름 | 비고 |
|------------|---------------|----------|---------|------|
| Unit | **Stage 1** (매 커밋) | push/PR 항상 | `unit-test` | `--affected`, `--maxWorkers=75%` |
| Integration | **Stage 2** (매 PR) | PR open/update only | `integration-test` | `--affected`, `--runInBand` |
| E2E | **Stage 2** (매 PR) | PR open/update only | `e2e-test` | `--affected`, `--forceExit --detectOpenHandles` |
| Security | **Stage 2** (매 PR) | PR open/update only | `security-test` | `--affected`, `--maxWorkers=75%`, Phase 15 확정 |
| Enum Verification | **Stage 2** (매 PR) | PR open/update only | `enum-verify` | `tsc --noEmit` + Enum 테스트, ENUM-SSOT-DERIVE-CHAIN |
| Chain Integration (Mock RPC) | **Stage 1/2** | Unit/Integration에 포함 | `unit-test`, `integration-test` | `--affected`, CHAIN-MOCK-13-SCENARIOS |
| Chain Integration (Local Validator) | **Stage 3** (nightly) | cron 또는 수동 | `local-validator` | solana-test-validator, CHAIN-E2E-5-FLOWS |
| Chain Integration (Devnet) | **Stage 3** (nightly) | cron 또는 수동 | `devnet` | max 3건, continue-on-error, CHAIN-DEVNET-LIMIT-3 |
| Platform (CLI/Docker) | **Stage 4** (릴리스) | release published | `platform-cli`, `platform-docker` | 전체 실행 |
| config.toml Unit | **Stage 1** (매 커밋) | push/PR 항상 | `unit-test` | Unit 포함, CONFIG-UNIT-TEST |

### 3.2 Phase 15 Security 시나리오 분류

Phase 15에서 확정한 보안 시나리오(43~47 문서)는 모두 Stage 2의 `security-test` job에서 실행된다.

| 보안 문서 | 시나리오 수 | 실행 대상 패키지 |
|----------|-----------|----------------|
| 43-layer1-session-auth-attacks.md | ~15건 | @waiaas/daemon |
| 44-layer2-policy-bypass-attacks.md | ~15건 | @waiaas/daemon |
| 45-layer3-killswitch-recovery-attacks.md | ~15건 | @waiaas/daemon |
| 46-keystore-external-security-scenarios.md | ~12건 | @waiaas/daemon |
| 47-boundary-value-chain-scenarios.md | ~14건 | @waiaas/daemon, @waiaas/adapter-solana |

---

## 4. GitHub Actions 워크플로우 파일 구조

17-RESEARCH.md Pattern 2의 `.github/` 디렉토리 구조를 채택한다.

```
.github/
├── actions/
│   └── setup/
│       └── action.yml          # Composite action: pnpm + Node.js + Turbo cache
├── workflows/
│   ├── ci.yml                  # push + pull_request 트리거 (Stage 1 + 2)
│   ├── nightly.yml             # schedule 트리거 (Stage 3)
│   ├── release.yml             # release 트리거 (Stage 4)
│   └── coverage-report.yml     # PR 커버리지 코멘트 (별도 분리)
```

### 4.1 파일별 역할

| 파일 | 역할 | 트리거 |
|------|------|--------|
| `actions/setup/action.yml` | pnpm 설치, Node.js 22 캐시, 의존성 설치, Turborepo `.turbo` 캐시를 공통 composite action으로 추출 | N/A (다른 워크플로우에서 호출) |
| `ci.yml` | push 시 Stage 1(lint/typecheck/unit), PR 시 Stage 1 + Stage 2(integration/e2e/security/enum-verify/coverage-gate) 통합 실행 | `push`, `pull_request` |
| `nightly.yml` | 매일 UTC 02:30에 전체 패키지 대상 Stage 1+2 + solana-test-validator + Devnet 테스트 실행 | `schedule`, `workflow_dispatch` |
| `release.yml` | 릴리스 배포 전 전체 검증 + Platform(CLI/Docker) + full coverage 집계 | `release` published, `workflow_dispatch` |
| `coverage-report.yml` | PR 커버리지 코멘트를 별도 워크플로우로 분리하여 실행 | `pull_request` |

### 4.2 coverage-report.yml 분리 이유

ArtiomTr/jest-coverage-report-action은 PR 코멘트 작성을 위해 `GITHUB_TOKEN` 쓰기 권한이 필요하다. Fork PR에서 `pull_request` 트리거는 읽기 전용 토큰만 제공하므로, 보안상 `pull_request_target` 트리거 또는 별도 `workflow_run` 트리거를 사용해야 한다. 테스트 실행과 코멘트 생성을 분리하여, fork PR에서도 안전하게 커버리지 코멘트를 생성할 수 있다.

---

## 5. Composite Action: 공통 Setup

모든 워크플로우에서 공유하는 환경 설정을 composite action으로 추출한다.

```yaml
# .github/actions/setup/action.yml
name: 'WAIaaS Setup'
description: 'Setup Node.js, pnpm, and Turborepo cache'
inputs:
  node-version:
    description: 'Node.js version'
    default: '22'
runs:
  using: 'composite'
  steps:
    - name: Setup pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 9

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile
      shell: bash

    - name: Cache Turborepo
      uses: actions/cache@v4
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: |
          ${{ runner.os }}-turbo-
```

### 5.1 Composite Action 설계 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| pnpm 버전 | `9` (고정) | 프로젝트 pnpm 모노레포. lockfile 호환성 보장 |
| Node.js 버전 | `22` (기본값, input으로 변경 가능) | Node.js 22 LTS. Phase 6에서 확정 |
| 의존성 설치 | `--frozen-lockfile` | CI에서 lockfile 변경 방지 |
| Turbo 캐시 키 | `${{ runner.os }}-turbo-${{ github.sha }}` | SHA 기반 캐시로 동일 커밋에서 재사용, `restore-keys`로 이전 캐시 fallback |
| `actions/setup-node` 캐시 | `cache: 'pnpm'` | pnpm store 자동 캐싱 내장 |

---

## 6. 워크플로우별 상세 설계

### 6.1 ci.yml (push + pull_request)

Stage 1(매 커밋)과 Stage 2(매 PR)를 하나의 워크플로우에 통합한다. `github.event_name` 조건으로 PR 전용 job을 분기한다.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ──────────────────────────────────────────────
  # Stage 1: 매 커밋 (push + PR 공통)
  # ──────────────────────────────────────────────
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run lint
        run: turbo run lint --affected

  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run typecheck (Enum SSoT 빌드타임 검증 포함)
        run: turbo run typecheck --affected

  unit-test:
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run unit tests with coverage
        run: turbo run test:unit --affected -- --coverage --ci --maxWorkers=75%
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-unit
          path: packages/*/coverage/
          retention-days: 14

  # ──────────────────────────────────────────────
  # Stage 2: 매 PR 전용
  # ──────────────────────────────────────────────
  integration-test:
    if: github.event_name == 'pull_request'
    needs: [unit-test]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run integration tests
        run: turbo run test:integration --affected -- --coverage --ci --runInBand
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-integration
          path: packages/*/coverage/
          retention-days: 14

  e2e-test:
    if: github.event_name == 'pull_request'
    needs: [unit-test]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run E2E tests
        run: turbo run test:e2e --affected -- --ci --forceExit --detectOpenHandles

  security-test:
    if: github.event_name == 'pull_request'
    needs: [unit-test]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run security tests
        run: turbo run test:security --affected -- --ci --maxWorkers=75%

  enum-verify:
    if: github.event_name == 'pull_request'
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Enum SSoT full typecheck verification
        run: turbo run typecheck
      - name: Enum unit tests
        run: pnpm --filter @waiaas/core test -- --testPathPatterns "enum" --ci

  coverage-gate:
    if: github.event_name == 'pull_request'
    needs: [integration-test, e2e-test, security-test]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run coverage gate check
        run: bash scripts/coverage-gate.sh
        env:
          COVERAGE_GATE_MODE: soft
```

**설계 결정:**

| 항목 | 결정 | 근거 |
|------|------|------|
| push + PR 통합 | 단일 ci.yml | 트리거별 YAML 분리하면 중복 과다. `if` 조건으로 분기 |
| `concurrency` | `cancel-in-progress: true` | 동일 브랜치에서 새 push 시 이전 실행 취소 |
| `fetch-depth: 0` | 전체 git history | Turborepo `--affected`가 git diff 기반으로 변경 감지 |
| `enum-verify` 의존 | `lint, typecheck` | Unit 테스트와 독립적으로 빌드타임 검증 가능 |
| `coverage-gate` 의존 | `integration-test, e2e-test, security-test` | 모든 테스트 완료 후 커버리지 판정 |
| `upload-artifact` | `if: always()` | 테스트 실패해도 커버리지 아티팩트 보존 |

### 6.2 nightly.yml (schedule + workflow_dispatch)

Stage 3: 전체 패키지 대상 + 블록체인 실제 네트워크 검증.

```yaml
# .github/workflows/nightly.yml
name: Nightly

on:
  schedule:
    - cron: '30 2 * * *'   # UTC 02:30 (KST 11:30)
  workflow_dispatch:

jobs:
  # ──────────────────────────────────────────────
  # 전체 패키지 Stage 1+2 (--affected 없음)
  # ──────────────────────────────────────────────
  full-suite:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run full test suite (lint + typecheck + unit + integration + e2e + security)
        run: |
          turbo run lint typecheck
          turbo run test:unit -- --coverage --ci --maxWorkers=75%
          turbo run test:integration -- --coverage --ci --runInBand
          turbo run test:e2e -- --ci --forceExit --detectOpenHandles
          turbo run test:security -- --ci --maxWorkers=75%
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-nightly
          path: packages/*/coverage/
          retention-days: 14

  # ──────────────────────────────────────────────
  # Local Validator Chain Integration (CHAIN-E2E-5-FLOWS)
  # ──────────────────────────────────────────────
  local-validator:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Install Solana CLI
        uses: metadaoproject/setup-solana@v1.0
        with:
          solana-cli-version: '1.18.26'
      - name: Start local validator
        run: |
          solana-test-validator --reset --quiet --rpc-port 8899 --no-bpf-jit &
          VALIDATOR_PID=$!
          echo "VALIDATOR_PID=$VALIDATOR_PID" >> $GITHUB_ENV
          for i in $(seq 1 30); do
            if curl -s http://127.0.0.1:8899 \
              -X POST \
              -H "Content-Type: application/json" \
              -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
              | grep -q '"ok"'; then
              echo "Validator ready after ${i}s"
              break
            fi
            if [ "$i" -eq 30 ]; then
              echo "Validator failed to start within 30s"
              kill $VALIDATOR_PID 2>/dev/null
              exit 1
            fi
            sleep 1
          done
      - name: Run Chain Integration tests (E2E-1~5)
        run: turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000
      - name: Cleanup validator
        if: always()
        run: kill $VALIDATOR_PID 2>/dev/null || true

  # ──────────────────────────────────────────────
  # Devnet Integration (CHAIN-DEVNET-LIMIT-3)
  # ──────────────────────────────────────────────
  devnet:
    needs: [local-validator]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run Devnet tests (max 3 -- SOL 전송 + 잔액 + 헬스)
        run: turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000 --testPathPatterns="devnet"
        env:
          WAIAAS_TEST_NETWORK: devnet
          WAIAAS_TEST_RPC_URL: https://api.devnet.solana.com
```

**설계 결정:**

| 항목 | 결정 | 근거 |
|------|------|------|
| cron 시간 | UTC 02:30 (KST 11:30) | GitHub Actions 트래픽이 적은 시간대 |
| full-suite와 local-validator 병렬 | 독립 실행 | full-suite는 Mock 기반, local-validator는 실제 노드. 상호 독립 |
| devnet `continue-on-error` | `true` | 네트워크 불안정으로 인한 nightly 전체 실패 방지 |
| devnet `needs: [local-validator]` | 순차 실행 | Local Validator 통과 후 Devnet 진행으로 불필요한 Devnet 호출 최소화 |
| Health check 30초 폴링 | 1초 간격 | Phase 16 CI 실행 가이드(48-doc 섹션 3.4)와 일치 |

### 6.3 release.yml (release + workflow_dispatch)

Stage 4: 릴리스 배포 전 전체 검증.

```yaml
# .github/workflows/release.yml
name: Release

on:
  release:
    types: [published]
  workflow_dispatch:

jobs:
  # ──────────────────────────────────────────────
  # 전체 패키지 모든 레벨 테스트
  # ──────────────────────────────────────────────
  full-test-suite:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run full test suite (all levels)
        run: |
          turbo run lint typecheck
          turbo run test:unit -- --coverage --ci --maxWorkers=75%
          turbo run test:integration -- --coverage --ci --runInBand
          turbo run test:e2e -- --ci --forceExit --detectOpenHandles
          turbo run test:security -- --ci --maxWorkers=75%
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-release
          path: packages/*/coverage/
          retention-days: 30

  # ──────────────────────────────────────────────
  # 블록체인 통합 테스트
  # ──────────────────────────────────────────────
  chain-integration:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Install Solana CLI
        uses: metadaoproject/setup-solana@v1.0
        with:
          solana-cli-version: '1.18.26'
      - name: Start local validator + run chain tests
        run: |
          solana-test-validator --reset --quiet --rpc-port 8899 --no-bpf-jit &
          VALIDATOR_PID=$!
          for i in $(seq 1 30); do
            if curl -s http://127.0.0.1:8899 \
              -X POST \
              -H "Content-Type: application/json" \
              -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
              | grep -q '"ok"'; then
              echo "Validator ready after ${i}s"
              break
            fi
            if [ "$i" -eq 30 ]; then
              echo "Validator failed to start within 30s"
              kill $VALIDATOR_PID 2>/dev/null
              exit 1
            fi
            sleep 1
          done
          turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000
          kill $VALIDATOR_PID 2>/dev/null || true
      - name: Run Devnet tests (max 3)
        continue-on-error: true
        run: turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000 --testPathPatterns="devnet"
        env:
          WAIAAS_TEST_NETWORK: devnet
          WAIAAS_TEST_RPC_URL: https://api.devnet.solana.com

  # ──────────────────────────────────────────────
  # Platform: CLI
  # ──────────────────────────────────────────────
  platform-cli:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run CLI platform tests
        run: turbo run test:platform --filter=@waiaas/cli -- --ci

  # ──────────────────────────────────────────────
  # Platform: Docker
  # ──────────────────────────────────────────────
  platform-docker:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Docker build and health check
        run: |
          docker build -t waiaas:test .
          docker run -d --name waiaas-test -p 3100:3100 waiaas:test
          sleep 5
          curl -sf http://127.0.0.1:3100/health || (docker logs waiaas-test && exit 1)
          docker stop waiaas-test
          docker rm waiaas-test

  # ──────────────────────────────────────────────
  # Coverage Report (full)
  # ──────────────────────────────────────────────
  coverage-report:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Generate full coverage report
        run: |
          turbo run test:unit test:integration -- --coverage --ci --coverageReporters=json-summary --coverageReporters=text --coverageReporters=html
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report-full
          path: packages/*/coverage/
          retention-days: 30
```

### 6.4 coverage-report.yml (PR 커버리지 코멘트)

PR 코멘트 전용 워크플로우. ArtiomTr/jest-coverage-report-action@v2를 사용한다.

```yaml
# .github/workflows/coverage-report.yml
name: Coverage Report

on:
  pull_request:
    branches: [main]

jobs:
  coverage-comment:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup

      # 핵심 패키지: PR 코멘트로 커버리지 표시
      - name: Coverage Report - @waiaas/core
        uses: ArtiomTr/jest-coverage-report-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          test-script: pnpm --filter @waiaas/core test -- --coverage --ci
          package-manager: pnpm
          custom-title: '@waiaas/core Coverage'
          working-directory: packages/core

      - name: Coverage Report - @waiaas/daemon
        uses: ArtiomTr/jest-coverage-report-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          test-script: pnpm --filter @waiaas/daemon test -- --coverage --ci
          package-manager: pnpm
          custom-title: '@waiaas/daemon Coverage'
          working-directory: packages/daemon

      - name: Coverage Report - @waiaas/adapter-solana
        uses: ArtiomTr/jest-coverage-report-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          test-script: pnpm --filter @waiaas/adapter-solana test -- --coverage --ci
          package-manager: pnpm
          custom-title: '@waiaas/adapter-solana Coverage'
          working-directory: packages/adapters/solana

      - name: Coverage Report - @waiaas/sdk
        uses: ArtiomTr/jest-coverage-report-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          test-script: pnpm --filter @waiaas/sdk test -- --coverage --ci
          package-manager: pnpm
          custom-title: '@waiaas/sdk Coverage'
          working-directory: packages/sdk

      # 나머지 패키지: 콘솔 로그로만 확인
      - name: Coverage Report - remaining packages (console only)
        run: |
          echo "=== @waiaas/adapter-evm ==="
          pnpm --filter @waiaas/adapter-evm test -- --coverage --ci --coverageReporters=text 2>&1 || true
          echo ""
          echo "=== @waiaas/cli ==="
          pnpm --filter @waiaas/cli test -- --coverage --ci --coverageReporters=text 2>&1 || true
          echo ""
          echo "=== @waiaas/mcp ==="
          pnpm --filter @waiaas/mcp test -- --coverage --ci --coverageReporters=text 2>&1 || true
```

**ArtiomTr action 설계 결정:**

| 항목 | 결정 | 근거 |
|------|------|------|
| 핵심 패키지 | core, daemon, adapter-solana, sdk | 보안/기능 핵심. PR 코멘트로 가시성 확보 필요 |
| 나머지 패키지 | adapter-evm, cli, mcp | Low/Normal tier. 콘솔 텍스트 리포트로 충분 |
| `custom-title` | 패키지명 표시 | 모노레포에서 어떤 패키지의 커버리지인지 구분 |
| `working-directory` | 각 패키지 루트 | ArtiomTr action이 올바른 jest.config.ts를 찾도록 |

---

## 7. Job DAG 시각화

각 워크플로우의 job 의존 관계를 ASCII로 시각화한다. `needs:` 기반 의존 그래프.

### 7.1 ci.yml (push 경로 -- Stage 1만)

```
  ┌──────────┐
  │ checkout │
  └────┬─────┘
       │
  ┌────┴────┐
  │         │
  ▼         ▼
┌─────┐  ┌──────────┐
│lint │  │typecheck  │     ← 병렬 실행 (독립)
└──┬──┘  └────┬──────┘
   │          │
   └────┬─────┘
        ▼
   ┌──────────┐
   │unit-test │             ← needs: [lint, typecheck]
   └──────────┘
```

### 7.2 ci.yml (PR 경로 -- Stage 1 + Stage 2)

```
  ┌──────────┐
  │ checkout │
  └────┬─────┘
       │
  ┌────┴────┐
  │         │
  ▼         ▼
┌─────┐  ┌──────────┐
│lint │  │typecheck  │           ← 병렬 실행 (독립)
└──┬──┘  └────┬──────┘
   │          │
   ├────┬─────┘
   │    │
   ▼    ▼
┌──────────┐  ┌─────────────┐
│unit-test │  │enum-verify  │    ← needs: [lint, typecheck] (병렬)
└────┬─────┘  └─────────────┘
     │
┌────┼────────────┐
│    │             │
▼    ▼             ▼
┌──────────┐ ┌────┐ ┌──────────┐
│integ-test│ │e2e │ │sec-test  │  ← needs: [unit-test] (병렬)
└────┬─────┘ └─┬──┘ └────┬─────┘
     │         │          │
     └────┬────┘──────────┘
          ▼
   ┌───────────────┐
   │coverage-gate  │              ← needs: [integ, e2e, sec]
   └───────────────┘
```

### 7.3 nightly.yml

```
  ┌──────────┐
  │ checkout │
  └────┬─────┘
       │
  ┌────┴──────────────┐
  │                   │
  ▼                   ▼
┌────────────┐  ┌─────────────────┐
│full-suite  │  │local-validator  │   ← 병렬 실행 (독립)
│(Stage 1+2) │  │(chain-tests)    │
└────────────┘  └───────┬─────────┘
                        │
                        ▼
                ┌───────────────┐
                │  devnet       │     ← needs: [local-validator]
                │(max 3, allow  │       continue-on-error: true
                │ failure)      │
                └───────────────┘
```

### 7.4 release.yml

```
  ┌──────────┐
  │ checkout │
  └────┬─────┘
       │
       ▼
┌─────────────────┐
│full-test-suite  │                        ← 모든 레벨 전체 실행
└───────┬─────────┘
        │
  ┌─────┼─────────┬──────────┬────────────┐
  │     │         │          │            │
  ▼     ▼         ▼          ▼            ▼
┌─────┐┌────────┐┌─────────┐┌──────────┐┌────────────┐
│chain││plat-cli││plat-dock││cov-report││(future)    │
│-int ││        ││er       ││          ││            │
└─────┘└────────┘└─────────┘└──────────┘└────────────┘
                                              ← 모두 needs: [full-test-suite]
                                                (병렬 실행)
```

---

## 8. Turborepo 태스크 기반 실행 전략

### 8.1 turbo.json 태스크 정의

```jsonc
// turbo.json
{
  "tasks": {
    "lint": {
      "dependsOn": [],
      "inputs": ["src/**", ".eslintrc.*", "eslint.config.*"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig*.json"],
      "outputs": []
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/unit/**", "jest.config.*"],
      "outputs": ["coverage/**"],
      "cache": false
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/integration/**", "jest.config.*"],
      "outputs": ["coverage/**"],
      "cache": false
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/e2e/**", "jest.config.*"],
      "outputs": [],
      "cache": false
    },
    "test:security": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/security/**", "jest.config.*"],
      "outputs": [],
      "cache": false
    },
    "test:chain": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/chain/**", "__tests__/chain-integration/**", "jest.config.*"],
      "outputs": [],
      "cache": false
    },
    "test:platform": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/platform/**", "jest.config.*"],
      "outputs": [],
      "cache": false
    },
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig*.json"],
      "outputs": ["dist/**"]
    }
  }
}
```

### 8.2 `cache: false` 설정 이유

모든 `test:*` 태스크에 `cache: false`를 설정한다. 이유:

1. **테스트 결과 캐싱 위험:** 테스트는 소스 코드 외에도 환경, 시간, 랜덤 시드 등에 의존할 수 있다. 캐싱하면 실제로는 실패하는 테스트가 캐시 히트로 통과할 수 있다.
2. **커버리지 측정:** 커버리지 데이터는 매 실행마다 최신 상태여야 한다. 캐시된 커버리지는 현재 코드를 반영하지 않는다.
3. **Phase 14 결정:** `빌드 캐시 -- Turborepo test 태스크 (cache: false, 항상 실행)` (41-doc 섹션 1.5)

### 8.3 CI Stage별 실행 명령어

| Stage | 명령어 | Turborepo 모드 | 근거 |
|-------|--------|---------------|------|
| Stage 1 (매 커밋) | `turbo run lint typecheck test:unit --affected` | 변경된 패키지만 | 빠른 피드백 (~2min) |
| Stage 2 (매 PR) | `turbo run test:integration test:e2e test:security --affected` | 변경된 패키지만 | PR 리뷰 시 빠른 검증 (~5min) |
| Stage 3 (nightly) | `turbo run lint typecheck test:unit test:integration test:e2e test:security` + `turbo run test:chain --filter=@waiaas/adapter-solana` | 전체 패키지 | 회귀 검출 |
| Stage 4 (릴리스) | Stage 3 전체 + `turbo run test:platform --filter=@waiaas/cli` | 전체 패키지 | 릴리스 전 완전 검증 |

### 8.4 `--affected` vs 전체 실행 구분

| 상황 | 모드 | 이유 |
|------|------|------|
| push to main | `--affected` | 빠른 빌드 피드백. 변경된 패키지만으로 충분 |
| pull_request | `--affected` | PR 범위에서 영향받는 패키지만. 리뷰 속도 우선 |
| nightly | 전체 실행 | 의존성 업데이트, 시간 경과에 의한 회귀를 포착 |
| release | 전체 실행 | 릴리스 품질 보장. 모든 패키지가 정상임을 확인 |

**`--affected` 작동 원리:** Turborepo는 `git diff`를 사용하여 변경된 파일을 감지하고, `turbo.json`의 `inputs` 패턴과 패키지 의존 그래프를 기반으로 영향받는 패키지를 결정한다. `fetch-depth: 0`(full clone)이 필수이며, shallow clone에서는 변경 감지가 불가능하다.
