# Phase 17: CI/CD 파이프라인 설계 - Research

**Researched:** 2026-02-06
**Domain:** GitHub Actions CI/CD 파이프라인 설계 (Turborepo 모노레포, Jest 30, 커버리지 게이트)
**Confidence:** HIGH

## Summary

Phase 17은 Phase 14~16에서 확정한 모든 테스트 전략(6개 레벨, 71건 보안 시나리오, 블록체인 3단계 환경, Enum SSoT 검증)을 GitHub Actions 워크플로우로 통합하는 CI/CD 파이프라인 구조를 설계하는 문서화 페이즈이다. 코드를 작성하지 않으며, 구현 단계에서 워크플로우 YAML을 바로 작성할 수 있는 수준의 설계 문서를 산출한다.

핵심은 4단계 파이프라인 구조(매 커밋 / 매 PR / nightly / 릴리스)를 GitHub Actions의 4가지 트리거(push, pull_request, schedule, release)에 매핑하는 것이다. Turborepo의 `--affected` 플래그와 태스크 캐싱을 활용하여 변경된 패키지만 테스트하고, Jest 30의 v8 coverage provider + `coverageThreshold` glob 패턴으로 패키지별 커버리지 게이트를 구현한다. Phase 14에서 결정한 Soft Gate -> Hard Gate 전략을 CI 스크립트 레벨에서 구체화해야 한다.

GitHub Actions 워크플로우는 최대 4개 YAML 파일(ci.yml, nightly.yml, release.yml, coverage-report.yml)로 구성하며, 재사용 가능한 composite action으로 공통 setup(pnpm + Node.js + Turbo cache)을 추출한다. solana-test-validator는 nightly 워크플로우에서만 실행하고, Devnet 테스트는 nightly/릴리스에서만 허용한다.

**Primary recommendation:** Turborepo `turbo run` 기반 태스크 실행 + GitHub Actions job 병렬화 + ArtiomTr/jest-coverage-report-action PR 코멘트 + Soft/Hard gate 2단계 커버리지 게이트로 파이프라인을 설계하라.

---

## Standard Stack

### Core (CI/CD 인프라)

| Tool / Action | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| GitHub Actions | v2 (YAML workflow) | CI/CD 플랫폼 | 프로젝트가 GitHub 호스팅. Actions 외 추가 CI 서비스 불필요 |
| Turborepo | ^2.x | 모노레포 태스크 오케스트레이션 | Phase 14에서 turbo.json 태스크 구조 확정. `--affected` 필터로 변경 감지 |
| pnpm/action-setup | v4 | pnpm 패키지 매니저 설치 | 프로젝트가 pnpm 모노레포 |
| actions/setup-node | v4 | Node.js 22 LTS 설치 + pnpm 캐시 | `cache: 'pnpm'` 내장 지원으로 별도 캐시 설정 불필요 |
| actions/checkout | v4 | 리포지토리 체크아웃 | `fetch-depth: 0` 필요 (Turborepo 변경 감지용 full history) |
| actions/cache | v4 | Turborepo .turbo 캐시 | `${{ runner.os }}-turbo-${{ github.sha }}` 키 패턴 |

### Coverage & Reporting

| Tool / Action | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Jest v8 coverage provider | Jest 30 내장 | 커버리지 측정 | Phase 14에서 확정. coverageThreshold glob 패턴 지원 |
| ArtiomTr/jest-coverage-report-action | v2 | PR 커버리지 코멘트 | pnpm 지원, custom-title로 모노레포 패키지 구분, 임계값 자동 적용 |

### Blockchain CI (nightly/릴리스)

| Tool / Action | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| metadaoproject/setup-solana | v1.0+ | Solana CLI 설치 | solana-test-validator 실행에 필요. `solana-cli-version` 파라미터 지원 |
| solana-test-validator | Solana CLI suite | Local Validator E2E | Phase 16에서 5개 E2E 흐름 확정. `--reset --quiet` 플래그 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions | CircleCI, Jenkins | GitHub 네이티브 통합이 가장 간편. Self-hosted 프로젝트에 외부 CI는 불필요한 복잡성 |
| ArtiomTr/jest-coverage-report-action | codecov/codecov-action | Codecov는 외부 서비스 의존 + 유료 전환 위험. Jest 내장 threshold + PR 코멘트로 충분 |
| Turborepo --affected | 수동 paths 필터 | paths 필터는 패키지 간 의존성을 모름. Turborepo는 dependency graph 기반으로 영향받는 패키지를 정확히 감지 |
| Turborepo Remote Cache (Vercel) | 로컬 캐시만 | 초기에는 로컬 캐시 + actions/cache로 충분. 팀 규모가 커지면 Remote Cache 도입 검토 |

---

## Architecture Patterns

### Pattern 1: 4단계 파이프라인 구조

**What:** Phase 14 TLVL-01 실행 빈도 피라미드를 CI 파이프라인 4단계에 매핑
**When to use:** 모든 CI 설계의 기본 골격

```
┌──────────────────────────────────────────────────────────────────────┐
│                    4단계 CI/CD 파이프라인                              │
├─────────────────┬──────────────────┬────────────────┬────────────────┤
│ Stage 1         │ Stage 2          │ Stage 3        │ Stage 4        │
│ 매 커밋 (push)   │ 매 PR            │ nightly        │ 릴리스          │
├─────────────────┼──────────────────┼────────────────┼────────────────┤
│ 1. lint         │ Stage 1 전체 +   │ Stage 2 전체 + │ Stage 3 전체 + │
│ 2. typecheck    │ 5. integration   │ 8. chain-int   │ 10. platform   │
│ 3. unit         │ 6. e2e           │    (local-val)  │     (CLI)      │
│ 4. coverage     │ 7. security      │ 9. devnet      │ 11. platform   │
│    (soft/hard)  │ 7b. enum-verify  │    (max 3건)   │     (Docker)   │
│                 │ 7c. coverage-gate│                │ 12. coverage   │
│                 │                  │                │     report     │
├─────────────────┼──────────────────┼────────────────┼────────────────┤
│ 트리거:          │ 트리거:           │ 트리거:         │ 트리거:         │
│ push to main/*  │ pull_request     │ schedule       │ release        │
│                 │                  │ (cron)         │ (published)    │
├─────────────────┼──────────────────┼────────────────┼────────────────┤
│ 예상 시간:       │ 예상 시간:        │ 예상 시간:      │ 예상 시간:      │
│ ~2min           │ ~5min            │ ~10min         │ ~15min         │
├─────────────────┼──────────────────┼────────────────┼────────────────┤
│ 실패 시:         │ 실패 시:          │ 실패 시:        │ 실패 시:        │
│ 커밋 빌드 실패   │ PR 머지 차단      │ Slack/이슈 알림 │ 릴리스 차단     │
└─────────────────┴──────────────────┴────────────────┴────────────────┘
```

**Phase 14~16 테스트 레벨과의 매핑:**

| 테스트 레벨 | Pipeline Stage | 실행 조건 |
|------------|----------------|----------|
| Unit | Stage 1 (매 커밋) | 항상 |
| Integration | Stage 2 (매 PR) | PR open/update |
| E2E | Stage 2 (매 PR) | PR open/update |
| Security | Stage 2 (매 PR) | PR open/update |
| Enum Verification | Stage 2 (매 PR) | `tsc --noEmit` + Enum 테스트 |
| Chain Integration (Local) | Stage 3 (nightly) | cron 또는 수동 |
| Chain Integration (Devnet) | Stage 3 (nightly) | cron 또는 수동 |
| Platform | Stage 4 (릴리스) | release published |

### Pattern 2: GitHub Actions 워크플로우 파일 구조

**What:** 트리거별로 분리된 워크플로우 파일 + 공통 composite action
**When to use:** 트리거별 job 구성이 크게 다를 때 (단일 YAML은 조건 분기가 과도해짐)

```
.github/
├── actions/
│   └── setup/
│       └── action.yml          # Composite action: pnpm + Node.js + turbo cache
├── workflows/
│   ├── ci.yml                  # push + pull_request 트리거 (Stage 1 + 2)
│   ├── nightly.yml             # schedule 트리거 (Stage 3)
│   ├── release.yml             # release 트리거 (Stage 4)
│   └── coverage-report.yml     # PR 커버리지 코멘트 (별도 분리)
```

**ci.yml 워크플로우 분리 이유:**
- push(매 커밋)와 pull_request(매 PR)를 하나의 YAML에서 `if` 조건으로 분기
- push 시: lint + typecheck + unit + coverage (Stage 1만)
- PR 시: Stage 1 + integration + e2e + security + enum + coverage gate (Stage 2)

**coverage-report.yml 별도 분리 이유:**
- ArtiomTr/jest-coverage-report-action은 PR 코멘트 권한이 필요
- fork PR에서는 `pull_request_target` 트리거를 사용해야 보안상 안전
- 테스트 실행 후 coverage JSON을 아티팩트로 전달하여 별도 job에서 코멘트 생성

### Pattern 3: Composite Action으로 공통 Setup 추출

**What:** pnpm install + Node.js setup + Turbo cache를 재사용 가능한 단위로 추출
**When to use:** 모든 워크플로우에서 동일한 setup 단계가 반복될 때

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

### Pattern 4: Turborepo 태스크 기반 Job 설계

**What:** turbo.json에 정의된 태스크를 GitHub Actions job으로 매핑
**When to use:** 모노레포에서 패키지 간 의존성을 존중하면서 병렬 실행할 때

```jsonc
// turbo.json -- CI 관련 태스크 (Phase 14 14-RESEARCH.md 참조 + 확장)
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
      "inputs": ["src/**", "__tests__/chain/**", "jest.config.*"],
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

**CI에서 실행:**
```bash
# Stage 1 (매 커밋) -- 변경된 패키지만
turbo run lint typecheck test:unit --affected

# Stage 2 (매 PR) -- 변경된 패키지만
turbo run test:integration test:e2e test:security --affected

# Stage 3 (nightly) -- 전체
turbo run test:chain

# Stage 4 (릴리스) -- 전체
turbo run lint typecheck test:unit test:integration test:e2e test:security test:chain
```

### Pattern 5: Job 의존 관계 (DAG)

**What:** ci.yml 내 job 간 depends-on/needs 관계 시각화
**When to use:** 파이프라인 실행 순서와 병렬 가능 구간 파악

```
ci.yml (push + pull_request):

  ┌─────────┐
  │  setup   │
  └────┬─────┘
       │
  ┌────┴────┐
  │         │
  ▼         ▼
┌─────┐  ┌──────────┐
│lint │  │typecheck  │     ← 병렬 실행 (독립)
└──┬──┘  └────┬──────┘
   │          │
   ▼          ▼
  ┌────────────┐
  │  unit-test │               ← lint + typecheck 통과 후
  └──────┬─────┘
         │
    ┌────┼────────┐
    │    │        │
    ▼    ▼        ▼
┌──────┐┌──────┐┌────────┐
│integ.││ e2e  ││security│    ← PR only, 병렬 실행
└──┬───┘└──┬───┘└───┬────┘
   │       │        │
   ▼       ▼        ▼
  ┌────────────────────┐
  │  coverage-gate     │      ← PR only, 모든 테스트 완료 후
  └────────────────────┘
```

```
nightly.yml (schedule):

  ┌──────────┐
  │  setup   │
  └────┬─────┘
       │
  ┌────┴────────────────┐
  │                     │
  ▼                     ▼
┌──────────────┐  ┌──────────────┐
│ local-validator│  │ full-suite   │   ← 병렬 (validator 시작 + unit/integ/e2e)
│ chain-tests   │  │ (Stage 1+2)  │
└──────┬────────┘  └──────┬───────┘
       │                  │
       ▼                  ▼
  ┌──────────────────────────┐
  │  devnet-tests (max 3건)  │   ← local + full 완료 후
  └──────────────────────────┘
```

### Anti-Patterns to Avoid

- **단일 거대 워크플로우:** 모든 트리거를 하나의 YAML에 넣으면 조건 분기가 복잡해져 유지보수가 어려워진다. 트리거별로 분리하되 composite action으로 공통 부분을 추출한다.
- **fetch-depth: 1 (shallow clone):** Turborepo의 `--affected` 플래그는 git history를 비교하므로 `fetch-depth: 0`이 필요하다. shallow clone은 변경 감지를 불가능하게 만든다.
- **모든 패키지 항상 테스트:** `turbo run test --affected` 대신 `turbo run test`를 사용하면 변경 없는 패키지까지 테스트하여 CI 시간이 불필요하게 증가한다. nightly/릴리스에서만 전체 실행한다.
- **coverageThreshold를 각 패키지 jest.config.ts에 분산:** Phase 14 Pitfall #2에서 확인된 바와 같이, per-project coverageThreshold는 지원이 제한적이다. 반드시 루트 jest.config.ts에서 관리한다.
- **Devnet 테스트를 PR에서 실행:** Devnet은 결정성이 ~90%이며 rate limit으로 인해 간헐적 실패가 발생한다. PR 차단 요인이 되면 개발 속도가 저하된다. nightly/릴리스에서만 실행한다.
- **테스트 캐싱 활성화:** Jest 테스트는 `cache: false`로 설정해야 한다. 캐시된 테스트 결과는 코드 변경을 반영하지 않아 위험하다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 모노레포 변경 감지 | 수동 paths 필터 / git diff 스크립트 | Turborepo `--affected` | 패키지 dependency graph 기반 정확한 감지. 수동 paths는 의존성 누락 |
| PR 커버리지 코멘트 | 커스텀 스크립트로 PR API 호출 | ArtiomTr/jest-coverage-report-action | 베이스 브랜치 대비 diff, 파일별 커버리지, 임계값 자동 적용 |
| pnpm + Node.js 캐시 | 수동 actions/cache 키 구성 | actions/setup-node@v4 `cache: 'pnpm'` | 내장 lockfile hash 기반 캐시. 수동 키 관리 불필요 |
| Turbo 캐시 | 빌드 아티팩트 수동 관리 | actions/cache@v4 + .turbo 디렉토리 | SHA 기반 캐시 키로 정확한 캐시 히트 |
| Solana CLI 설치 | curl + PATH 수동 설정 | metadaoproject/setup-solana | 버전 관리 + PATH 자동 설정 |
| 커버리지 게이트 판단 | 커스텀 exit code 스크립트 | Jest coverageThreshold + CI exit code | Jest 내장 기능. threshold 미달 시 non-zero exit |

**Key insight:** CI 파이프라인의 가장 큰 위험은 "느려서 무시당하는 것"이다. Turborepo --affected와 적절한 캐싱으로 피드백 루프를 최대한 짧게 유지하는 것이 관건이다.

---

## Common Pitfalls

### Pitfall 1: Turborepo --affected에서 fetch-depth 누락

**What goes wrong:** `turbo run test --affected`가 모든 패키지를 대상으로 실행된다.
**Why it happens:** GitHub Actions의 `actions/checkout@v4`는 기본적으로 `fetch-depth: 1` (shallow clone). Turborepo는 `GITHUB_BASE_REF` 환경변수와 git history를 비교하여 변경된 패키지를 판단하는데, shallow clone에서는 base branch와의 diff를 계산할 수 없다.
**How to avoid:** `actions/checkout@v4`에서 `fetch-depth: 0`을 명시한다. PR이 아닌 push에서는 `--affected`가 부모 커밋과 비교한다.
**Warning signs:** CI에서 "Running N tasks" 로그에 전체 패키지가 나옴.

### Pitfall 2: Soft Gate에서 Hard Gate로의 전환 시점 판단

**What goes wrong:** 전환 기준이 불명확하여 Soft Gate가 영구적으로 유지되거나, 너무 이르게 Hard Gate로 전환하여 개발 속도가 저하된다.
**Why it happens:** Phase 14에서 "목표의 80% 이상 10회 연속 유지" 기준을 제시했지만, 이를 자동으로 추적하는 메커니즘이 없다.
**How to avoid:**
- Soft Gate: Jest `--coverage` 실행 후 exit code를 무시하고 커버리지 수치만 리포트
- Hard Gate: Jest `--coverage` exit code를 그대로 전달
- 전환: 수동 전환 (jest.config.ts의 coverageThreshold 활성화/비활성화)
- 패키지별 독립 전환 (Phase 14 결정)
**Warning signs:** 커버리지가 목표의 50%도 안 되는데 Hard Gate를 적용하면 모든 PR이 차단됨.

### Pitfall 3: solana-test-validator CI 실행 안정성

**What goes wrong:** nightly CI에서 solana-test-validator가 시작되지 않거나 포트 충돌 발생.
**Why it happens:** Phase 16 Pitfall #2와 동일. validator 설치 누락, 포트 충돌, 시작 대기 부족.
**How to avoid:**
- `metadaoproject/setup-solana` action으로 설치 표준화
- `--rpc-port 8899 --reset --quiet` 플래그 명시
- 시작 후 health check 폴링 (최대 30초): `curl -s http://127.0.0.1:8899 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`
- `afterAll`에서 프로세스 kill + job의 `post` step에서 cleanup
**Warning signs:** nightly chain-test job이 간헐적으로 실패.

### Pitfall 4: PR 커버리지 코멘트 권한 문제 (Fork PR)

**What goes wrong:** Fork에서 올린 PR에 커버리지 코멘트가 달리지 않는다.
**Why it happens:** `pull_request` 트리거에서는 fork PR에 write 권한이 없어 코멘트를 작성할 수 없다.
**How to avoid:** coverage-report 워크플로우를 별도로 분리하고, `workflow_run` 트리거 (ci.yml 완료 시 실행) 또는 `pull_request_target` 트리거를 사용한다. 단, `pull_request_target`은 보안 주의가 필요하므로 코드 실행 없이 아티팩트만 읽는 방식을 권장한다.
**Warning signs:** Fork PR에서 커버리지 코멘트가 누락됨. WAIaaS는 현재 단독 개발이므로 당장은 문제 없으나, 향후 오픈소스화 시 고려 필요.

### Pitfall 5: Devnet Rate Limit으로 인한 nightly 실패

**What goes wrong:** Devnet 공용 RPC의 rate limit(~40 req/s)으로 airdrop 실패, 테스트 실패.
**Why it happens:** Phase 16 Pitfall #3과 동일. nightly에서 여러 요청이 집중될 때 초과.
**How to avoid:**
- Devnet 테스트 최대 3건 (Phase 16 결정: CHAIN-DEVNET-LIMIT-3)
- `--runInBand`로 순차 실행
- Airdrop 재시도 (최대 3회, 2초 간격)
- Devnet 실패 시 nightly 전체를 실패로 처리하지 않고, 해당 job만 경고 (allow-failure)
**Warning signs:** Devnet 테스트 성공률 90% 미만.

### Pitfall 6: CI 시간 초과로 인한 실패

**What goes wrong:** 전체 CI가 GitHub Actions 기본 타임아웃(6시간)에 도달하여 실패.
**Why it happens:** 대부분의 경우 openHandle 누수(Hono 서버 미종료)나 Jest 프로세스가 종료되지 않아 hang 발생.
**How to avoid:**
- 워크플로우 레벨에서 `timeout-minutes: 15` 설정 (Stage 1~2)
- nightly: `timeout-minutes: 30`
- 릴리스: `timeout-minutes: 45`
- E2E 테스트에서 `--forceExit` 플래그 (Phase 14 권장)
- `--detectOpenHandles`로 리소스 누수 감지 (개발 시)
**Warning signs:** CI job이 예상 시간의 2배 이상 소요.

---

## Code Examples

### Example 1: ci.yml 워크플로우 골격 (Stage 1 + 2)

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
  # === Stage 1: 매 커밋 (push + PR) ===

  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: turbo run lint --affected

  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: turbo run typecheck --affected

  unit-test:
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: turbo run test:unit --affected -- --coverage --ci
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-unit
          path: packages/*/coverage/

  # === Stage 2: 매 PR ===

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
      - run: turbo run test:integration --affected -- --coverage --ci --runInBand

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
      - run: turbo run test:e2e --affected -- --ci --forceExit --detectOpenHandles

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
      - run: turbo run test:security --affected -- --ci

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
      - name: Enum SSoT verification (tsc --noEmit)
        run: turbo run typecheck  # tsc --noEmit이 Enum 불일치를 빌드타임에 감지
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
      - name: Run coverage check (Soft Gate)
        run: |
          turbo run test:unit test:integration --affected -- --coverage --ci || true
        # Soft Gate: exit code 무시, 커버리지 리포트만 생성
        # Hard Gate 전환 시: || true 제거
```

### Example 2: nightly.yml 워크플로우 골격 (Stage 3)

```yaml
# .github/workflows/nightly.yml
name: Nightly

on:
  schedule:
    - cron: '30 2 * * *'  # UTC 02:30 (KST 11:30)
  workflow_dispatch:  # 수동 트리거 지원

jobs:
  full-suite:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - run: turbo run lint typecheck test:unit test:integration test:e2e test:security -- --ci --coverage

  local-validator:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - uses: metadaoproject/setup-solana@v1.0
        with:
          solana-cli-version: '1.18.26'  # 안정 버전 고정
      - name: Start local validator
        run: |
          solana-test-validator --reset --quiet &
          VALIDATOR_PID=$!
          echo "VALIDATOR_PID=$VALIDATOR_PID" >> $GITHUB_ENV
          # Health check polling (max 30s)
          for i in $(seq 1 30); do
            if curl -s http://127.0.0.1:8899 -X POST \
              -H "Content-Type: application/json" \
              -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q "ok"; then
              echo "Validator ready after ${i}s"
              break
            fi
            sleep 1
          done
      - name: Run Chain Integration tests (Local Validator)
        run: turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000
      - name: Cleanup validator
        if: always()
        run: kill $VALIDATOR_PID 2>/dev/null || true

  devnet:
    needs: [local-validator]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true  # Devnet 실패 시 nightly 전체 차단하지 않음
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Run Devnet tests (max 3)
        run: turbo run test:chain --filter=@waiaas/adapter-solana -- --ci --runInBand --testTimeout=60000 --testPathPatterns="devnet"
        env:
          WAIAAS_TEST_NETWORK: devnet
          WAIAAS_TEST_RPC_URL: https://api.devnet.solana.com
```

### Example 3: Soft Gate -> Hard Gate 전환 메커니즘

```bash
# scripts/coverage-gate.sh
#!/usr/bin/env bash
# 커버리지 게이트: Soft/Hard 모드 전환
# 환경변수: COVERAGE_GATE_MODE=soft|hard (기본: soft)

set -euo pipefail

MODE=${COVERAGE_GATE_MODE:-soft}

echo "Coverage gate mode: $MODE"

# Jest --coverage 실행
if [ "$MODE" = "hard" ]; then
  # Hard Gate: coverageThreshold 미달 시 CI 실패
  turbo run test:unit test:integration --affected -- --coverage --ci
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "::error::Coverage threshold not met. CI failed (hard gate)."
    exit $EXIT_CODE
  fi
else
  # Soft Gate: coverageThreshold 미달이어도 경고만
  turbo run test:unit test:integration --affected -- --coverage --ci || true
  echo "::warning::Coverage check completed in soft gate mode. See report for details."
fi
```

```typescript
// jest.config.ts 루트 -- coverageThreshold (Phase 14 41-doc에서 이미 확정)
// Soft Gate: 이 섹션 전체를 주석 처리
// Hard Gate: 주석 해제 (패키지별 독립 전환)
coverageThreshold: {
  global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  './packages/core/src/': { branches: 85, functions: 90, lines: 90, statements: 90 },
  './packages/daemon/src/infrastructure/keystore/': { branches: 90, functions: 95, lines: 95, statements: 95 },
  // ... (41-doc 섹션 3.4 전체 참조)
}
```

### Example 4: ArtiomTr/jest-coverage-report-action PR 코멘트

```yaml
# .github/workflows/coverage-report.yml (또는 ci.yml 내 별도 job)
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

      - name: Run tests with coverage
        run: turbo run test:unit test:integration --affected -- --coverage --ci --coverageReporters=json-summary || true

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

      # ... 나머지 패키지도 동일 패턴
```

### Example 5: release.yml 워크플로우 골격 (Stage 4)

```yaml
# .github/workflows/release.yml
name: Release

on:
  release:
    types: [published]
  workflow_dispatch:  # 수동 트리거 (사전 검증용)

jobs:
  full-test-suite:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Full test suite (모든 패키지, 모든 레벨)
        run: turbo run lint typecheck test:unit test:integration test:e2e test:security -- --ci --coverage

  chain-integration:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - uses: metadaoproject/setup-solana@v1.0
      - name: Local Validator + Devnet
        run: |
          solana-test-validator --reset --quiet &
          # ... (nightly와 동일 패턴)

  platform-cli:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: CLI Platform tests
        run: turbo run test:platform --filter=@waiaas/cli -- --ci

  platform-docker:
    needs: [full-test-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Docker build & health check
        run: |
          docker build -t waiaas:test .
          docker run -d --name waiaas-test waiaas:test
          # health check polling ...
          docker stop waiaas-test

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
        run: turbo run test:unit test:integration -- --coverage --ci --coverageReporters=json-summary --coverageReporters=text
```

---

## Phase 14~16 결정 사항과의 정합성 매핑

CI/CD 파이프라인 설계가 반드시 준수해야 하는 이전 Phase의 결정 사항:

### Phase 14 결정 (테스트 기반)

| 결정 | CI 매핑 | 구현 방식 |
|------|---------|----------|
| TLVL-01: 6개 레벨 실행 빈도 | 4단계 파이프라인에 매핑 | Unit=push, Integ/E2E/Security=PR, Chain=nightly, Platform=릴리스 |
| TLVL-03: 4-tier 커버리지 | jest.config.ts coverageThreshold | 루트 설정에서 glob 패턴으로 패키지/모듈별 임계값 |
| CI-GATE: Soft->Hard | scripts/coverage-gate.sh | COVERAGE_GATE_MODE 환경변수로 전환, 패키지별 독립 |
| jest.config.ts 공유 | turbo.json + 패키지별 config | `turbo run test:unit` -> 각 패키지 jest.config.ts 실행 |
| --maxWorkers=75% (Unit/Security) | CI job 설정 | turbo passthrough: `-- --maxWorkers=75% --ci` |
| --runInBand (Integration) | CI job 설정 | turbo passthrough: `-- --runInBand --ci` |
| --forceExit (E2E) | CI job 설정 | turbo passthrough: `-- --forceExit --detectOpenHandles --ci` |

### Phase 15 결정 (보안)

| 결정 | CI 매핑 | 구현 방식 |
|------|---------|----------|
| Security 테스트 매 PR | Stage 2 security-test job | `turbo run test:security --affected` |
| Security < 1min | timeout-minutes: 10 | 여유 포함 10분 (타임아웃 안전 마진) |

### Phase 16 결정 (블록체인/Enum)

| 결정 | CI 매핑 | 구현 방식 |
|------|---------|----------|
| CHAIN-MOCK-13-SCENARIOS | Unit/Integration에서 실행 | `turbo run test:unit test:integration --filter=@waiaas/adapter-solana` |
| CHAIN-E2E-5-FLOWS | nightly local-validator job | `turbo run test:chain` + solana-test-validator |
| CHAIN-DEVNET-LIMIT-3 | nightly devnet job (allow-failure) | `continue-on-error: true` + env WAIAAS_TEST_NETWORK=devnet |
| ENUM-SSOT-DERIVE-CHAIN | Stage 2 enum-verify job | `tsc --noEmit` (typecheck 태스크에 포함) |
| CONFIG-UNIT-TEST | Stage 1 unit-test | config 테스트는 Unit 레벨, 매 커밋 실행 |

---

## 커버리지 리포트 자동 생성 방식

### 리포트 유형

| 리포트 | 생성 위치 | 형식 | 용도 |
|--------|----------|------|------|
| PR 코멘트 | coverage-report job | Markdown (ArtiomTr action) | 코드 리뷰 시 커버리지 확인 |
| HTML 리포트 | unit-test/integration-test job | Jest html reporter | 상세 라인별 커버리지 확인 |
| JSON Summary | CI 아티팩트 | coverage-summary.json | 자동화 도구 연동, 이력 추적 |
| 콘솔 텍스트 | CI 로그 | text reporter | CI 로그에서 빠른 확인 |

### Jest 커버리지 설정 (CI 전용)

```typescript
// jest.config.ts -- CI에서 추가되는 설정
{
  coverageProvider: 'v8',  // Jest 30 기본
  coverageReporters: [
    'text',           // 콘솔 출력 (CI 로그)
    'json-summary',   // ArtiomTr action + 자동화 도구
    'html',           // 상세 리포트 (아티팩트 업로드)
    'lcov',           // codecov 등 외부 도구 호환 (향후)
  ],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts',
    '!<rootDir>/src/**/testing/**',
    '!<rootDir>/src/**/__tests__/**',
  ],
}
```

### Soft Gate vs Hard Gate 구현 상세

| 항목 | Soft Gate (초기) | Hard Gate (안정화 후) |
|------|-----------------|---------------------|
| Jest coverageThreshold | 활성화 (수치 설정됨) | 동일 |
| CI exit code 처리 | `\|\| true`로 무시 | 그대로 전달 (실패=차단) |
| PR 코멘트 | 커버리지 수치 표시 | 커버리지 수치 + 경고/실패 표시 |
| 전환 방식 | 패키지별 독립 전환 | jest.config.ts에서 해당 경로 threshold 활성화 |
| 전환 기준 | 목표의 80% 이상 10회 연속 유지 | - |
| 롤백 | threshold 주석 처리 또는 수치 하향 | 주석 처리 |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 단일 CI YAML + 수동 paths 필터 | Turborepo --affected + 트리거별 YAML 분리 | 2024+ Turborepo 성숙 | 변경된 패키지만 테스트, CI 시간 3-5x 단축 |
| codecov/coveralls 외부 서비스 | Jest 내장 threshold + PR 코멘트 action | Jest 30 threshold glob 지원 | 외부 서비스 의존 제거, 설정 단순화 |
| 수동 coverage 스크립트 | ArtiomTr/jest-coverage-report-action v2 | 2024+ 안정화 | PR 코멘트 자동화, base branch 대비 diff |
| actions/setup-node v3 | actions/setup-node v4 | 2024 | pnpm 캐시 네이티브 지원 |
| Solana 수동 설치 + PATH | metadaoproject/setup-solana | 2023+ | 버전 관리 + 자동 PATH |
| 전체 테스트 항상 실행 | --affected (PR) + 전체 (nightly) | Turborepo 패턴 | 피드백 루프 단축 |

---

## Open Questions

1. **Turborepo Remote Cache 도입 시점**
   - What we know: Vercel Remote Cache는 TURBO_TOKEN + TURBO_TEAM으로 설정. 팀 간 캐시 공유로 CI 속도 추가 향상.
   - What's unclear: 단독 개발에서는 actions/cache@v4 로컬 캐시로 충분한지, 아니면 Remote Cache가 의미 있는 속도 차이를 내는지.
   - Recommendation: 초기에는 actions/cache@v4만 사용. 빌드 시간이 10분을 초과하면 Remote Cache 도입 검토. LOW confidence on timing.

2. **ArtiomTr/jest-coverage-report-action v2의 모노레포 multi-package 지원 한계**
   - What we know: custom-title로 패키지를 구분할 수 있고, working-directory로 패키지별 실행이 가능하다.
   - What's unclear: 7개 패키지를 순차적으로 실행하면 coverage-report job이 과도하게 길어질 수 있다. 패키지별 병렬 실행이 가능한지, 또는 단일 merged coverage로 대체할 수 있는지.
   - Recommendation: 초기에는 핵심 3-4개 패키지(core, daemon, adapter-solana, sdk)만 PR 코멘트 대상. 나머지는 콘솔 로그에서 확인. MEDIUM confidence.

3. **Python SDK CI 통합**
   - What we know: Python SDK는 별도 레포이다 (Phase 9 결정). pytest + httpx.AsyncClient mock 기반.
   - What's unclear: 같은 GitHub 레포에서 관리되는지, 별도 레포인지에 따라 CI 전략이 다르다.
   - Recommendation: 별도 레포라면 별도 CI 파이프라인 (이 Phase 범위 밖). 같은 레포라면 turbo task에 Python 빌드/테스트 추가. MEDIUM confidence.

4. **GitHub Actions 무료 tier 분 한도**
   - What we know: GitHub Free에서는 월 2,000분 (public repo 무제한). Private repo에서 nightly + PR CI를 합산하면 한도 소진 가능.
   - What's unclear: WAIaaS가 public/private인지에 따라 한도 전략이 다르다.
   - Recommendation: public repo라면 한도 무관. private이면 nightly 실행 빈도를 주 2-3회로 줄이거나, `turbo-ignore`로 불필요한 nightly 스킵. MEDIUM confidence.

---

## Sources

### Primary (HIGH confidence)
- [Turborepo - GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions) -- pnpm + Turbo cache + CI 설정
- [Turborepo - Constructing CI](https://turborepo.dev/docs/crafting-your-repository/constructing-ci) -- --affected, --filter, turbo-ignore, Remote Cache
- [ArtiomTr/jest-coverage-report-action](https://github.com/ArtiomTr/jest-coverage-report-action) -- PR 커버리지 코멘트, 모노레포 custom-title
- [GitHub Actions Events](https://docs.github.com/actions/learn-github-actions/events-that-trigger-workflows) -- push, pull_request, schedule, release 트리거
- [metadaoproject/setup-solana](https://github.com/marketplace/actions/setup-solana) -- Solana CLI 설치 Action
- docs/v0.4/41-test-levels-matrix-coverage.md -- 6개 테스트 레벨, 커버리지 목표, CI 게이트 전략
- docs/v0.4/42-mock-boundaries-interfaces-contracts.md -- Mock 경계 매트릭스
- docs/v0.4/48-blockchain-test-environment-strategy.md -- 블록체인 3단계 환경, Mock RPC 13 시나리오
- docs/v0.4/49-enum-config-consistency-verification.md -- Enum SSoT 빌드타임 검증

### Secondary (MEDIUM confidence)
- [GitHub Actions Monorepo Guide (2026)](https://dev.to/pockit_tools/github-actions-in-2026-the-complete-guide-to-monorepo-cicd-and-self-hosted-runners-1jop) -- 2026년 모노레포 CI 최적화 가이드
- [Jest Coverage Comment Actions Marketplace](https://github.com/marketplace/actions/jest-coverage-comment) -- 대안 coverage action
- [Graphite - Code Quality Gates](https://graphite.dev/guides/enforce-code-quality-gates-github-actions) -- Soft/Hard gate 패턴

### Tertiary (LOW confidence)
- [setup-solana 캐싱 전략](https://github.com/marketplace/actions/setup-solana) -- 공식 문서에 캐싱 미기재. 설치 시간이 길면 actions/cache로 Solana 바이너리 캐싱 필요할 수 있음.

---

## Metadata

**Confidence breakdown:**
- 4단계 파이프라인 구조: HIGH -- Phase 14 TLVL-01 결정 + Turborepo 공식 문서로 확인
- GitHub Actions 워크플로우 구조: HIGH -- Turborepo GitHub Actions 가이드 + 공식 Events 문서로 확인
- 커버리지 게이트 (Soft/Hard): HIGH -- Phase 14 41-doc에서 이미 상세 정의됨. CI 스크립트 레벨 구현만 추가
- Turbo --affected 변경 감지: HIGH -- Turborepo Constructing CI 공식 문서로 확인
- PR 커버리지 코멘트: MEDIUM -- ArtiomTr action 문서 확인했으나 모노레포 7패키지 동시 실행은 미검증
- solana-test-validator CI 통합: MEDIUM -- setup-solana action 확인. validator 시작/종료 패턴은 커뮤니티 사례 기반
- Devnet CI 안정성: MEDIUM -- Phase 16 연구 기반. 실제 CI 환경에서의 rate limit 경험치 부족

**Research date:** 2026-02-06
**Valid until:** 2026-04-06 (GitHub Actions, Turborepo 안정기. 60일 유효)
