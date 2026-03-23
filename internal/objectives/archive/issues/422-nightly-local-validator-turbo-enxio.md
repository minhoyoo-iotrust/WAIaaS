# 422. Nightly local-validator job Turborepo ENXIO 에러로 5일 연속 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-23
- **관련 이슈:** #352 (release.yml 동일 문제 수정됨)

## 증상

Nightly CI (`nightly.yml`)의 `local-validator` job이 Build 단계에서 Turborepo I/O 에러로 5일 연속 실패 (2026-03-19 ~ 2026-03-23).

```
x I/O error: No such device or address (os error 6)
`-> No such device or address (os error 6)
##[error]Process completed with exit code 1.
```

다른 3개 job (devnet, full-suite, evm-testnet)은 모두 정상 통과.

## 원인 분석

`local-validator` job은 빌드 전에 `solana-test-validator`와 `anvil`을 백그라운드 프로세스로 실행한다.
이 백그라운드 프로세스들이 Turborepo daemon의 Unix IPC 소켓 통신에 간섭(fd 충돌/ENXIO)을 일으킨다.

동일한 문제가 `release.yml`의 `chain-integration` job에서 #352로 보고되어 수정 완료되었으나, `nightly.yml`의 `local-validator` job에는 해당 수정이 적용되지 않았다.

## #352 수정 이력 (release.yml)

이슈 #352에서 4단계 시행착오를 거쳐 최종 해결됨:

1. **`TURBO_DAEMON=false` 환경변수** (커밋 `5e5205a8`) → ❌ 효과 없음
2. **`--daemon=false` CLI 플래그** (커밋 `fb0d81be`) → ❌ 효과 없음
3. **fd 격리 (`nohup ... > /dev/null 2>&1 &`)** (커밋 `c1b24899`) → ❌ 단독으로는 효과 없음
4. **Turborepo 완전 우회 (`pnpm -r`)** (커밋 `41b563f5`) → ✅ 해결

최종 해결: Turborepo를 완전히 우회하고 `pnpm -r` recursive 명령으로 대체.

## 수정 방안

`release.yml` chain-integration job에 이미 적용된 패턴을 `nightly.yml` local-validator job에 동일 적용:

### 변경 전 (nightly.yml L87-106)
```yaml
- name: Start solana-test-validator
  run: |
    solana --version
    solana-test-validator --reset --quiet &
    sleep 10
    solana cluster-version

- name: Start Anvil
  run: |
    anvil --silent &
    sleep 3

- name: Build
  run: pnpm turbo run build

- name: Chain Tests
  run: pnpm turbo run test:chain
```

### 변경 후
```yaml
- name: Start solana-test-validator
  run: |
    solana --version
    nohup solana-test-validator --reset --quiet > /dev/null 2>&1 &
    sleep 10
    solana cluster-version

- name: Start Anvil
  run: |
    nohup anvil --silent > /dev/null 2>&1 &
    sleep 3

- name: Build
  run: pnpm --filter='!@waiaas/admin' -r run build

- name: Chain Tests
  run: pnpm -r run test:chain --if-present
```

변경 포인트 3가지:
1. **백그라운드 프로세스 fd 격리**: `nohup ... > /dev/null 2>&1 &` (stdout/stderr 분리)
2. **Build**: `pnpm turbo run build` → `pnpm --filter='!@waiaas/admin' -r run build` (Turborepo 우회)
3. **Chain Tests**: `pnpm turbo run test:chain` → `pnpm -r run test:chain --if-present` (Turborepo 우회)

## 테스트 항목

- [ ] `nightly.yml` 수정 후 `workflow_dispatch`로 수동 트리거하여 local-validator job 통과 확인
- [ ] chain test 결과가 이전 정상 실행 시와 동일한지 확인
- [ ] 다른 3개 job (devnet, full-suite, evm-testnet)에 영향 없는지 확인
