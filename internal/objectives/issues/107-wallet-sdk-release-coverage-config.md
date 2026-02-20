# 107 — 신규/누락 패키지 release-please + CI 커버리지 설정 등록

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** v2.6
- **상태:** FIXED
- **등록일:** 2026-02-20

## 현상

### 1. release-please-config.json — wallet-sdk extra-files 누락

`release-please-config.json`의 `packages["."].extra-files` 배열에 `packages/wallet-sdk/package.json`이 없다. release-please가 버전 범프 시 wallet-sdk의 `package.json` version 필드를 갱신하지 않는다.

### 2. scripts/coverage-gate.sh — 5개 패키지 누락

`coverage-gate.sh`의 PACKAGES/THRESHOLDS 배열에 core 4개(core, daemon, adapters/solana, sdk)만 등록되어 있고, 나머지 5개 패키지가 빠져 있다. 이 패키지들은 vitest.config.ts에 커버리지 임계값이 설정되어 있지만 CI Coverage Gate에서 검사되지 않는다.

| 패키지 | vitest thresholds (lines) | coverage-gate.sh | CI 리포트 |
|--------|:------------------------:|:----------------:|:---------:|
| `packages/core` | 90% | 등록 | 등록 |
| `packages/daemon` | 85% | 등록 | 등록 |
| `packages/adapters/solana` | 80% | 등록 | 등록 |
| `packages/sdk` | 80% | 등록 | 등록 |
| **`packages/cli`** | **70%** | **누락** | **누락** |
| **`packages/mcp`** | **70%** | **누락** | **누락** |
| **`packages/admin`** | **70%** | **누락** | **누락** |
| **`packages/adapters/evm`** | **50%** | **누락** | **누락** |
| **`packages/wallet-sdk`** | **80%** | **누락** | **누락** |

> `packages/skills`는 마크다운 파일 배포 패키지로 테스트 대상 아님 (제외).

### 3. .github/workflows/ci.yml — Coverage Report 스텝 누락

CI stage2의 Coverage Report 스텝에도 위 5개 패키지가 없다. PR에 해당 패키지들의 커버리지 리포트가 표시되지 않는다.

## 수정 범위

### 1. release-please-config.json

`extra-files` 배열에 추가:

```json
"packages/wallet-sdk/package.json"
```

### 2. scripts/coverage-gate.sh

PACKAGES/THRESHOLDS 배열에 5개 패키지 추가:

```bash
PACKAGES=(
  "packages/core"
  "packages/daemon"
  "packages/adapters/solana"
  "packages/sdk"
  "packages/cli"             # 추가
  "packages/mcp"             # 추가
  "packages/admin"           # 추가
  "packages/adapters/evm"    # 추가
  "packages/wallet-sdk"      # 추가
)
THRESHOLDS=(
  90
  85
  80
  80
  70    # cli: vitest.config.ts lines 임계값
  70    # mcp: vitest.config.ts lines 임계값
  70    # admin: vitest.config.ts lines 임계값
  50    # adapters/evm: vitest.config.ts lines 임계값
  80    # wallet-sdk: vitest.config.ts lines 임계값
)
```

### 3. .github/workflows/ci.yml

stage2에 Coverage Report 스텝 5개 추가:

```yaml
- name: 'Coverage Report - @waiaas/cli'
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/cli'
    json-summary-path: coverage/coverage-summary.json
    json-final-path: coverage/coverage-final.json
    working-directory: packages/cli

- name: 'Coverage Report - @waiaas/mcp'
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/mcp'
    json-summary-path: coverage/coverage-summary.json
    json-final-path: coverage/coverage-final.json
    working-directory: packages/mcp

- name: 'Coverage Report - @waiaas/admin'
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/admin'
    json-summary-path: coverage/coverage-summary.json
    json-final-path: coverage/coverage-final.json
    working-directory: packages/admin

- name: 'Coverage Report - @waiaas/adapter-evm'
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/adapter-evm'
    json-summary-path: coverage/coverage-summary.json
    json-final-path: coverage/coverage-final.json
    working-directory: packages/adapters/evm

- name: 'Coverage Report - @waiaas/wallet-sdk'
  uses: davelosert/vitest-coverage-report-action@v2
  if: always()
  with:
    name: '@waiaas/wallet-sdk'
    json-summary-path: coverage/coverage-summary.json
    json-final-path: coverage/coverage-final.json
    working-directory: packages/wallet-sdk
```

### 영향 범위

- `release-please-config.json` — extra-files 1줄 추가
- `scripts/coverage-gate.sh` — PACKAGES/THRESHOLDS 각 5줄 추가
- `.github/workflows/ci.yml` — Coverage Report 스텝 5개 추가

## 테스트 항목

1. `release-please-config.json`의 extra-files에 `packages/wallet-sdk/package.json`이 포함되어 있는지 확인
2. `coverage-gate.sh`의 PACKAGES 배열에 9개 패키지(기존 4 + 신규 5)가 모두 포함되어 있는지 확인
3. 각 패키지의 vitest.config.ts lines 임계값과 coverage-gate.sh THRESHOLDS가 일치하는지 확인
4. CI stage2 Coverage Report에 9개 패키지 스텝이 모두 존재하는지 확인
5. skills 패키지가 coverage-gate.sh와 CI 리포트에 포함되지 않았는지 확인 (테스트 없는 패키지)
