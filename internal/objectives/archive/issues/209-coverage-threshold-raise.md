# #209 — 테스트 커버리지 임계값 상향 (실제 수치 대비 과소 설정)

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v29.3
- **상태:** FIXED
- **발견일:** 2026-02-27

## 현상

테스트 커버리지 임계값이 실제 달성 수치보다 크게 낮게 설정되어 있어 커버리지 하락을 조기에 감지하지 못한다. 특히 CI Gate(coverage-gate.sh)의 임계값이 vitest 임계값보다도 훨씬 낮아서 사실상 게이트 역할을 하지 못하고 있다.

**현재 상태:**

| 패키지 | 실제 Lines | vitest 임계값 | CI Gate | 여유분(vitest) |
|--------|-----------|-------------|---------|---------------|
| core | 97.54% | 92% | 90% | +5.54% |
| daemon | 85.06% | 85% | 85% | +0.06% |
| solana | 91.82% | 86% | 80% | +5.82% |
| evm | 94.52% | 89% | 50% | +5.52% |
| sdk | 80.99% | 80% | 80% | +0.99% |
| cli | 82.78% | 77% | 70% | +5.78% |
| mcp | 89.77% | 84% | 70% | +5.77% |
| admin | 89.39% | 84% | 70% | +5.39% |
| wallet-sdk | 89.84% | 84% | 80% | +5.84% |
| push-relay | 84.35% | 80% | ❌없음 | +4.35% |

## 문제점

1. **CI Gate가 soft 모드** — 임계값 미달 시 경고만 출력하고 빌드를 막지 않음
2. **CI Gate에 push-relay 미포함** — coverage-gate.sh PACKAGES 배열에 누락
3. **CI Gate 임계값이 vitest보다 훨씬 낮음** — mcp/admin/cli에서 vitest 84%/77% vs CI 70%
4. **evm CI Gate가 50%** — 실제 94.52% 대비 44.52%p 차이

## 수정 방안

### vitest.config.ts 임계값 인상 (실제-2% 버퍼)

daemon과 sdk는 여유분이 부족하므로 현행 유지. 나머지는 실제 수치에서 2% 버퍼를 뺀 값으로 인상:

| 패키지 | Lines/Stmts | Branches | Functions |
|--------|-------------|----------|-----------|
| core | 92 → **95** | 88 → **91** | 90 → **93** |
| solana | 86 → **89** | 77 → **80** | 86 → **89** |
| evm | 89 → **92** | 68 → **71** | 90 → **93** |
| cli | 77 → **80** | 79 → **82** | 92 → **95** |
| mcp | 84 → **87** | 80 → **83** | 90 → **93** |
| admin | 84 → **87** | 77 → **80** | 70 → **71** |
| wallet-sdk | 84 → **87** | 75 → **76** | 95 → **98** |
| push-relay | 80 → **82** | 86 → **90** | 90 → **94** |

### coverage-gate.sh 임계값 동기화 + hard mode

1. CI Gate 임계값을 vitest 임계값과 동일하게 동기화
2. push-relay을 PACKAGES 배열에 추가
3. `COVERAGE_GATE_MODE` 기본값을 `soft` → `hard`로 변경

### CLI 테스트 실패 수정

`stopCommand > reads PID file, sends SIGTERM to running process` 테스트 1건 실패 — `process.kill(pid, 0)`으로 프로세스 존재 확인 후 SIGTERM을 보내는 로직에서, 테스트가 `kill(pid, 'SIGTERM')`을 기대하지만 실제로는 `kill(pid, 0)` 호출만 발생.

## 관련 파일

- `packages/*/vitest.config.ts` (10개) — 패키지별 커버리지 임계값
- `scripts/coverage-gate.sh` — CI 커버리지 게이트 스크립트
- `.github/workflows/ci.yml` — CI 파이프라인
- `packages/cli/src/__tests__/cli-commands.test.ts:371` — 실패 테스트

## 테스트 항목

1. **전 패키지 vitest 임계값 통과 테스트**: 인상된 임계값으로 `pnpm turbo run test:unit` 전체 통과 검증
2. **CI Gate hard mode 검증**: coverage-gate.sh가 임계값 미달 시 exit code 1 반환하는지 검증
3. **push-relay CI Gate 포함 검증**: coverage-gate.sh PACKAGES 배열에 push-relay이 포함되어 게이트가 동작하는지 검증
4. **CLI stopCommand 테스트 수정**: `process.kill` 호출 순서(존재 확인 → SIGTERM)를 올바르게 검증하도록 테스트 수정
