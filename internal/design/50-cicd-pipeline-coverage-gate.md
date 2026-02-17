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

---

## 9. 커버리지 게이트: Soft/Hard 전환 메커니즘

Phase 14 CI-GATE 결정에 따라, 커버리지 게이트는 2단계로 운영한다.

### 9.1 Soft Gate vs Hard Gate 비교표

| 항목 | Soft Gate (초기) | Hard Gate (안정화 후) |
|------|-----------------|---------------------|
| **Jest coverageThreshold** | 활성화 (수치 설정됨) | 동일 |
| **CI exit code 처리** | `|| true`로 무시 (실패해도 CI 통과) | 그대로 전달 (실패=CI 실패=PR 차단) |
| **PR 코멘트** | 커버리지 수치 표시 + `::warning::` annotation | 커버리지 수치 + `::error::` annotation + 실패 표시 |
| **전환 방식** | 패키지별 독립 전환 | jest.config.ts에서 해당 경로 threshold 활성화 |
| **전환 기준** | 목표의 80% 이상이 10회 연속 PR에서 유지 | - |
| **롤백 방법** | COVERAGE_GATE_MODE=soft로 복원 | threshold 주석 처리 또는 수치 하향 |

### 9.2 `scripts/coverage-gate.sh` 스크립트

CI에서 커버리지 게이트 모드를 제어하는 스크립트. `COVERAGE_GATE_MODE` 환경변수로 soft/hard를 전환한다.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Coverage Gate Script
# COVERAGE_GATE_MODE: soft (default) | hard
# ──────────────────────────────────────────────

MODE=${COVERAGE_GATE_MODE:-soft}
echo "Coverage gate mode: $MODE"
echo ""

if [ "$MODE" = "hard" ]; then
  echo "Running coverage check in HARD mode (CI will fail on threshold miss)..."
  turbo run test:unit test:integration --affected -- --coverage --ci
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "::error::Coverage threshold not met. CI failed (hard gate)."
    echo "::error::Check jest.config.ts coverageThreshold for failing paths."
    exit $EXIT_CODE
  fi
  echo "Coverage threshold met (hard gate passed)."
else
  echo "Running coverage check in SOFT mode (warnings only)..."
  turbo run test:unit test:integration --affected -- --coverage --ci || true
  echo ""
  echo "::warning::Coverage check completed in soft gate mode. Threshold violations are warnings, not failures."
  echo "::warning::To enable hard gate, set COVERAGE_GATE_MODE=hard in CI environment."
fi
```

### 9.3 jest.config.ts coverageThreshold 구조

Phase 14 41-doc 섹션 3.4의 coverageThreshold를 그대로 채택한다. 루트 `jest.config.ts`에서 관리하며, 패키지별 `jest.config.ts`에 분산하지 않는다.

```typescript
// jest.config.ts (루트) -- 커버리지 임계값 설정
export default {
  coverageProvider: 'v8',
  coverageReporters: ['text', 'json-summary', 'html', 'lcov'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts',
    '!<rootDir>/src/**/testing/**',
    '!<rootDir>/src/**/__tests__/**',
  ],
  coverageThreshold: {
    // ─── 글로벌 기본값 ───
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    // ─── @waiaas/core (Critical 90%+) ───
    './packages/core/src/': {
      branches: 85, functions: 90, lines: 90, statements: 90,
    },
    // ─── @waiaas/daemon - keystore (Critical 95%+, 최상위) ───
    './packages/daemon/src/infrastructure/keystore/': {
      branches: 90, functions: 95, lines: 95, statements: 95,
    },
    // ─── @waiaas/daemon - 핵심 서비스 (Critical 90%+) ───
    './packages/daemon/src/services/': {
      branches: 85, functions: 90, lines: 90, statements: 90,
    },
    // ─── @waiaas/daemon - 미들웨어 (High 85%+) ───
    './packages/daemon/src/server/middleware/': {
      branches: 80, functions: 85, lines: 85, statements: 85,
    },
    // ─── @waiaas/daemon - 라우트 (High 80%+) ───
    './packages/daemon/src/server/routes/': {
      branches: 75, functions: 80, lines: 80, statements: 80,
    },
    // ─── @waiaas/daemon - DB 인프라 (High 80%+) ───
    './packages/daemon/src/infrastructure/database/': {
      branches: 75, functions: 80, lines: 80, statements: 80,
    },
    // ─── @waiaas/daemon - 알림 인프라 (High 80%+) ───
    './packages/daemon/src/infrastructure/notifications/': {
      branches: 75, functions: 80, lines: 80, statements: 80,
    },
    // ─── @waiaas/daemon - 라이프사이클 (Normal 75%+) ───
    './packages/daemon/src/lifecycle/': {
      branches: 70, functions: 75, lines: 75, statements: 75,
    },
    // ─── @waiaas/adapter-solana (High 80%+) ───
    './packages/adapters/solana/src/': {
      branches: 75, functions: 80, lines: 80, statements: 80,
    },
    // ─── @waiaas/adapter-evm (Low 50%+) ───
    './packages/adapters/evm/src/': {
      branches: 45, functions: 50, lines: 50, statements: 50,
    },
    // ─── @waiaas/sdk (High 80%+) ───
    './packages/sdk/src/': {
      branches: 75, functions: 80, lines: 80, statements: 80,
    },
    // ─── @waiaas/cli (Normal 70%+) ───
    './packages/cli/src/': {
      branches: 65, functions: 70, lines: 70, statements: 70,
    },
    // ─── @waiaas/mcp (Normal 70%+) ───
    './packages/mcp/src/': {
      branches: 65, functions: 70, lines: 70, statements: 70,
    },
  },
}
```

### 9.4 Soft Gate -> Hard Gate 전환 프로세스

**Soft Gate 운영 (초기):**

1. `COVERAGE_GATE_MODE=soft` 환경변수 유지 (기본값)
2. `coverage-gate.sh`가 테스트 실패를 `|| true`로 무시
3. PR 코멘트에서 커버리지 수치를 확인하되, CI는 통과 허용
4. 팀에서 커버리지 추이를 모니터링

**Hard Gate 전환 판단:**

1. 특정 패키지의 커버리지가 목표 수치의 80% 이상을 10회 연속 PR에서 유지
   - 예: @waiaas/core 목표 90% -> 72% 이상이 10회 연속 유지
2. 패키지별로 독립 전환 (전체 일괄 전환 아님)
3. 전환 우선순위: core(1순위) -> daemon/keystore(2순위) -> adapter-solana/sdk(3순위) -> 나머지(4순위)

**Hard Gate 전환 실행:**

1. `COVERAGE_GATE_MODE=hard`로 환경변수 변경
2. 또는 `scripts/coverage-gate.sh`에서 `|| true`를 제거
3. jest.config.ts의 해당 패키지 coverageThreshold가 활성 상태 확인

**롤백:**

1. `COVERAGE_GATE_MODE=soft`로 환경변수 복원
2. 또는 coverageThreshold에서 해당 경로를 주석 처리 / 수치 하향

---

## 10. 커버리지 리포트 자동 생성 방식

### 10.1 리포트 유형 4가지

| 리포트 유형 | 생성 위치 (Job) | 형식 | 용도 | 보존 기간 |
|------------|----------------|------|------|----------|
| **PR 코멘트** | `coverage-report.yml` -> `coverage-comment` job | Markdown (ArtiomTr action) | 코드 리뷰 시 커버리지 확인 | PR 존속 기간 |
| **HTML 리포트** | `ci.yml` -> `unit-test`, `integration-test` | Jest html reporter | 상세 라인별 커버리지 확인 (아티팩트 다운로드) | 14일 |
| **JSON Summary** | `ci.yml` -> `unit-test`, `integration-test` | `coverage-summary.json` | 자동화 도구 연동, 이력 추적 | 14일 |
| **콘솔 텍스트** | 모든 CI 로그 | Jest text reporter | CI 로그에서 빠른 확인 | CI 로그 보존 기간 |

### 10.2 Jest 커버리지 리포터 설정

```typescript
// jest.config.ts -- CI 커버리지 리포터 설정
{
  coverageProvider: 'v8',
  coverageReporters: ['text', 'json-summary', 'html', 'lcov'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts',
    '!<rootDir>/src/**/testing/**',
    '!<rootDir>/src/**/__tests__/**',
  ],
}
```

| 리포터 | 출력 | 용도 |
|--------|------|------|
| `text` | 콘솔 stdout | CI 로그에서 즉시 확인 |
| `json-summary` | `coverage/coverage-summary.json` | 자동화 도구(커버리지 게이트 스크립트, 트렌드 추적) |
| `html` | `coverage/lcov-report/index.html` | 브라우저에서 상세 라인별 커버리지 확인 |
| `lcov` | `coverage/lcov.info` | 외부 도구(Codecov 등) 연동 시 사용 가능 |

### 10.3 ArtiomTr/jest-coverage-report-action 설정 상세

**핵심 패키지만 PR 코멘트 대상:**

| 패키지 | custom-title | 이유 |
|--------|-------------|------|
| @waiaas/core | `@waiaas/core Coverage` | SSoT Enum 9종, Zod 스키마. 모든 패키지의 기반 |
| @waiaas/daemon | `@waiaas/daemon Coverage` | 보안 핵심 모듈(keystore, session, policy, tx) |
| @waiaas/adapter-solana | `@waiaas/adapter-solana Coverage` | 실제 블록체인 연동 |
| @waiaas/sdk | `@waiaas/sdk Coverage` | 공개 API 인터페이스. AI 에이전트가 직접 사용 |

**나머지 패키지는 콘솔 텍스트 리포트로 충분:**

| 패키지 | 이유 |
|--------|------|
| @waiaas/adapter-evm | Stub만 존재 (Low tier 50%+) |
| @waiaas/cli | Normal tier 70%+. 프로세스 spawn 위주 |
| @waiaas/mcp | SDK 위의 얇은 위임 레이어 (Normal tier 70%+) |

### 10.4 아티팩트 업로드

```yaml
# ci.yml 내 unit-test job
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: coverage-unit
    path: packages/*/coverage/
    retention-days: 14
```

| 설정 | 값 | 근거 |
|------|-----|------|
| `if: always()` | 테스트 실패해도 업로드 | 실패 원인 분석을 위해 커버리지 데이터 필요 |
| `retention-days` | 14 (PR), 30 (릴리스) | PR은 2주면 충분, 릴리스는 1개월 보존 |
| `path` | `packages/*/coverage/` | 모노레포 전체 패키지의 coverage 디렉토리 |

---

## 11. 패키지별 커버리지 임계값 상세

Phase 14 TLVL-03의 보안 위험도 기반 4-tier 커버리지 목표를 jest.config.ts `coverageThreshold` glob 패턴으로 변환한다.

### 11.1 패키지 수준 커버리지 임계값

| Package | Tier | Target | branches | functions | lines | statements | Rationale |
|---------|------|--------|----------|-----------|-------|------------|-----------|
| @waiaas/core | Critical | 90%+ | 85 | 90 | 90 | 90 | SSoT Enum 9종, Zod 스키마, 전 패키지의 기반 |
| @waiaas/adapter-solana | High | 80%+ | 75 | 80 | 80 | 80 | RPC 의존도 높으나 주소 검증/에러 매핑은 순수 함수 |
| @waiaas/adapter-evm | Low | 50%+ | 45 | 50 | 50 | 50 | v0.4 Stub만 존재. 13개 메서드 CHAIN_NOT_SUPPORTED 확인 |
| @waiaas/cli | Normal | 70%+ | 65 | 70 | 70 | 70 | parseArgs + 프로세스 spawn. Integration 위주 |
| @waiaas/sdk | High | 80%+ | 75 | 80 | 80 | 80 | AI 에이전트 공개 인터페이스. 타입 안정성 핵심 |
| @waiaas/mcp | Normal | 70%+ | 65 | 70 | 70 | 70 | SDK 위의 얇은 위임 레이어 |

### 11.2 @waiaas/daemon 모듈별 세분화 임계값

| Sub-Module | Tier | Target | branches | functions | lines | statements | Rationale |
|------------|------|--------|----------|-----------|-------|------------|-----------|
| infrastructure/keystore/ | Critical | 95%+ | 90 | 95 | 95 | 95 | AES-256-GCM, Argon2id. 자금 보호 최전선 |
| services/session-service | Critical | 90%+ | 85 | 90 | 90 | 90 | JWT 발급/검증, 세션 만료/무효화 |
| services/policy-engine | Critical | 90%+ | 85 | 90 | 90 | 90 | 4-tier 정책 평가, TOCTOU 방지 |
| services/transaction-service | Critical | 90%+ | 85 | 90 | 90 | 90 | 6단계 파이프라인, 8-state 상태 머신 |
| server/middleware/ | High | 85%+ | 80 | 85 | 85 | 85 | sessionAuth/ownerAuth/hostGuard/rateLimit |
| server/routes/ | High | 80%+ | 75 | 80 | 80 | 80 | 31개 API 엔드포인트 입력 검증 |
| infrastructure/database/ | High | 80%+ | 75 | 80 | 80 | 80 | Drizzle ORM, 마이그레이션, 트랜잭션 격리 |
| infrastructure/notifications/ | High | 80%+ | 75 | 80 | 80 | 80 | INotificationChannel, TokenBucketRateLimiter |
| lifecycle/ | Normal | 75%+ | 70 | 75 | 75 | 75 | 7단계 startup, 10단계 shutdown |

### 11.3 Soft -> Hard 전환 우선순위

패키지별 독립 전환 시 아래 우선순위를 따른다.

| 순위 | 패키지/모듈 | 전환 이유 | 전환 조건 |
|------|-----------|----------|----------|
| **1순위** | @waiaas/core | 전 패키지의 기반. 여기서의 회귀가 전체 시스템에 전파 | 90% 목표의 80%(=72%) 이상 10회 연속 |
| **2순위** | @waiaas/daemon/keystore | 자금 보호 최전선. 암호화 로직의 미검증 허용 불가 | 95% 목표의 80%(=76%) 이상 10회 연속 |
| **2순위** | @waiaas/daemon/services | 인증/정책/트랜잭션 핵심 로직 | 90% 목표의 80%(=72%) 이상 10회 연속 |
| **3순위** | @waiaas/adapter-solana | 블록체인 연동 정확성 | 80% 목표의 80%(=64%) 이상 10회 연속 |
| **3순위** | @waiaas/sdk | 공개 API 안정성 | 80% 목표의 80%(=64%) 이상 10회 연속 |
| **4순위** | @waiaas/daemon/middleware, routes, db, notifications | High tier | 80~85% 목표의 80% 이상 10회 연속 |
| **5순위** | @waiaas/cli, @waiaas/mcp, @waiaas/daemon/lifecycle | Normal tier | 70~75% 목표의 80% 이상 10회 연속 |
| **6순위** | @waiaas/adapter-evm | Low tier. Stub 단계에서는 Soft 유지 | EVM 본구현 시점에 Hard 전환 |

---

## 12. Pitfalls 및 대응 전략

### 12.1 Pitfalls 요약 표

| # | Pitfall | 발생 조건 | 대응 전략 | Warning Sign |
|---|---------|----------|----------|-------------|
| P1 | **Turborepo --affected에서 fetch-depth 누락** | `actions/checkout`에서 `fetch-depth: 1` (기본값) 사용 | 모든 워크플로우에서 `fetch-depth: 0` 강제 | `--affected`가 모든 패키지를 실행하거나, 아무것도 실행하지 않음 |
| P2 | **Soft -> Hard Gate 전환 시점 오판** | 커버리지가 불안정한 상태에서 Hard Gate로 전환 | 목표의 80% 이상 10회 연속 유지 기준 엄격 적용. 패키지별 독립 전환 | Hard Gate 전환 직후 PR이 연속 실패 |
| P3 | **solana-test-validator CI 시작 실패** | Solana CLI 버전 불일치, 포트 충돌, 메모리 부족 | metadaoproject/setup-solana action + health check 30초 폴링 + `--reset --quiet --no-bpf-jit` | nightly chain-tests job이 validator 시작 단계에서 타임아웃 |
| P4 | **Fork PR 커버리지 코멘트 권한 문제** | Fork PR에서 `GITHUB_TOKEN`이 읽기 전용 | `coverage-report.yml` 별도 분리. `pull_request` 트리거 사용 (추후 필요 시 `workflow_run`으로 전환) | Fork PR에서 커버리지 코멘트가 생성되지 않음 |
| P5 | **Devnet Rate Limit으로 nightly 실패** | Devnet 공용 RPC 동시 접속, Airdrop rate limit | 최대 3건(CHAIN-DEVNET-LIMIT-3), `--runInBand` 순차 실행, `continue-on-error: true` | devnet job이 429 에러로 반복 실패 |
| P6 | **CI 시간 초과** | 테스트 수 증가, 리소스 누수, 핸들 미정리 | `timeout-minutes` 설정 (Stage 1~2: 10~15, nightly: 15~20, release: 30), `--forceExit --detectOpenHandles` | CI job이 timeout으로 취소됨 |
| P7 | **coverageThreshold를 패키지별 jest.config.ts에 분산** | 각 패키지에서 독립적으로 threshold를 설정 | 루트 jest.config.ts에서 glob 패턴으로 관리 필수 (Phase 14 결정) | 패키지 간 threshold 불일치, 누락 발생 |
| P8 | **테스트 캐싱으로 인한 거짓 통과** | turbo.json에서 test 태스크에 `cache: true` 설정 | 모든 `test:*` 태스크에 `cache: false` 강제 | 코드 변경 후에도 테스트가 재실행되지 않음 |

### 12.2 추가 주의 사항

| 항목 | 설명 |
|------|------|
| **concurrency 설정** | 동일 브랜치에서 새 push 시 이전 CI 실행 취소 (`cancel-in-progress: true`). 리소스 낭비 방지 |
| **nightly 실패 알림** | nightly 실패 시 GitHub Issues 자동 생성 또는 Slack webhook 알림 추가 권장 (구현 시 결정) |
| **Turborepo Remote Cache** | 초기에는 로컬 캐시 + `actions/cache`로 충분. 팀 규모 확대 시 Vercel Remote Cache 도입 검토 |
| **IPv6 미지원** | Phase 6 결정: IPv6(`::1`) 미지원. CI 환경에서도 `127.0.0.1`만 사용 |

---

## 13. Phase 14~16 결정 사항 정합성 검증표

Phase 14(7건), Phase 15(2건), Phase 16(5건) = 총 14건의 결정이 본 CI/CD 파이프라인 설계에 빠짐없이 매핑되었는지 검증한다.

### 13.1 통합 정합성 검증표

| # | Phase | 결정 ID | 결정 내용 | CI 매핑 위치 | 구현 방식 | 정합 |
|---|-------|---------|----------|------------|----------|:----:|
| 1 | 14 | TLVL-01 | 6개 테스트 레벨 실행 빈도 (Unit 매커밋, Integration/E2E/Security 매PR, Chain nightly, Platform 릴리스) | 섹션 2 (4단계 파이프라인), 섹션 3 (매핑표) | Stage 1: Unit(push), Stage 2: Integration/E2E/Security(PR), Stage 3: Chain(nightly), Stage 4: Platform(릴리스) | O |
| 2 | 14 | TLVL-03 | 보안 위험도 기반 4-tier 커버리지 (Critical 90%+, High 80%+, Normal 70%+, Low 50%+) | 섹션 9.3 (coverageThreshold), 섹션 11 (패키지별 임계값) | 루트 jest.config.ts에서 glob 패턴으로 패키지/모듈별 임계값 설정 | O |
| 3 | 14 | CI-GATE | Soft gate(초기) -> Hard gate(안정화후), 패키지별 독립 전환 | 섹션 9 (Soft/Hard 전환 메커니즘), 섹션 11.3 (전환 우선순위) | COVERAGE_GATE_MODE 환경변수 + scripts/coverage-gate.sh | O |
| 4 | 14 | jest.config.ts 공유 | 루트 jest.config.ts에서 coverageThreshold 관리 | 섹션 9.3 (coverageThreshold 구조) | 루트 설정에서 glob 패턴, 패키지별 분산 금지 (Pitfall P7) | O |
| 5 | 14 | --maxWorkers=75% | Unit/Security 테스트 병렬 워커 설정 | 섹션 6.1 (ci.yml unit-test, security-test) | `turbo run test:unit --affected -- --coverage --ci --maxWorkers=75%` | O |
| 6 | 14 | --runInBand | Integration 테스트 순차 실행 (SQLite 잠금 방지) | 섹션 6.1 (ci.yml integration-test) | `turbo run test:integration --affected -- --coverage --ci --runInBand` | O |
| 7 | 14 | --forceExit | E2E 테스트 핸들 누수 방지 | 섹션 6.1 (ci.yml e2e-test) | `turbo run test:e2e --affected -- --ci --forceExit --detectOpenHandles` | O |
| 8 | 15 | Security 매 PR | Security 테스트를 매 PR에서 실행 | 섹션 2.2 Stage 2, 섹션 6.1 (ci.yml security-test) | `if: github.event_name == 'pull_request'` + `turbo run test:security --affected` | O |
| 9 | 15 | Security < 1min | Security 테스트 실행 시간 목표 | 섹션 6.1 (ci.yml security-test timeout) | `timeout-minutes: 10` (여유 포함 10분, 목표 <1min) | O |
| 10 | 16 | CHAIN-MOCK-13-SCENARIOS | Mock RPC 13개 시나리오 (Unit/Integration 레벨) | 섹션 3.1 매핑표 "Chain Integration (Mock RPC)" | Unit/Integration에 포함, `turbo run test:unit test:integration --affected` | O |
| 11 | 16 | CHAIN-E2E-5-FLOWS | Local Validator E2E 5개 흐름 | 섹션 2.2 Stage 3 local-validator, 섹션 6.2 (nightly.yml) | `metadaoproject/setup-solana` + `solana-test-validator` + `turbo run test:chain` | O |
| 12 | 16 | CHAIN-DEVNET-LIMIT-3 | Devnet 테스트 최대 3건, continue-on-error | 섹션 2.2 Stage 3 devnet, 섹션 6.2 (nightly.yml devnet job) | `continue-on-error: true` + `--testPathPatterns="devnet"` + `env WAIAAS_TEST_NETWORK=devnet` | O |
| 13 | 16 | ENUM-SSOT-DERIVE-CHAIN | as const -> TS 타입 -> Zod -> Drizzle -> DB CHECK 빌드타임 검증 | 섹션 2.2 Stage 2 enum-verify, 섹션 6.1 (ci.yml enum-verify job) | `turbo run typecheck` (전체) + `pnpm --filter @waiaas/core test -- --testPathPatterns "enum"` | O |
| 14 | 16 | CONFIG-UNIT-TEST | config.toml 로딩은 Unit 테스트 | 섹션 2.2 Stage 1 unit-test, 섹션 3.1 매핑표 | config 테스트는 Unit에 포함, `turbo run test:unit --affected` 매 커밋 실행 | O |

### 13.2 정합성 결과

- **Phase 14 결정 7건:** 7/7 매핑 완료 (O)
- **Phase 15 결정 2건:** 2/2 매핑 완료 (O)
- **Phase 16 결정 5건:** 5/5 매핑 완료 (O)
- **총계:** 14/14 (100%) 정합성 확인

모든 결정이 CI/CD 파이프라인 설계에 빠짐없이 반영되었으며, 각 결정의 구현 방식과 해당 섹션이 명시되었다.

---

*문서 ID: 50-cicd-pipeline-coverage-gate*
*Phase: 17-cicd-pipeline-design*
*Requirements: CICD-01, CICD-02, CICD-03*
*Status: Confirmed*
