# #352 — chain-integration CI Build 실패: Turborepo 데몬 I/O 에러

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-15
- **발견 위치:** GitHub Actions release.yml — v2.11.0-rc.9 Release

## 증상

`release.yml` 워크플로우의 `chain-integration` job에서 `pnpm turbo run build` 실행 시 Turborepo 데몬이 즉시 크래시:

```
x I/O error: No such device or address (os error 6)
`-> No such device or address (os error 6)
```

- Build 스텝이 1초 만에 실패 (실제 컴파일 시작 전)
- 동일 워크플로우의 `test` job은 같은 `pnpm turbo run build`가 성공
- 2회 연속 재현 (일시적 flake 아님)

## 원인 분석

### 직접 원인
Turborepo 데몬이 Unix domain socket을 통해 워커와 통신할 때 `ENXIO` (os error 6) 발생. `chain-integration` job은 백그라운드에 Solana test-validator + Anvil이 실행 중이어서 리소스 경합 발생.

### 트리거
v31.17 마일스톤에서 `turbo.json`에 다음 변경이 적용됨:

1. `//#generate:api-types` 태스크 추가 (`"cache": false`)
2. `@waiaas/admin#build` 의존성에 `generate:api-types` 추가

`cache: false` 태스크가 파이프라인에 추가되면서 Turborepo 데몬의 태스크 그래프 처리 방식이 변경됨. 백그라운드 프로세스(solana-test-validator, anvil)로 리소스가 제한된 `chain-integration` runner에서 데몬 통신 실패가 발생.

### 근거
- rc.8 이전 릴리스는 모두 성공 (turbo.json 변경 전)
- `test` job은 백그라운드 프로세스 없이 동일 빌드 성공
- 에러가 빌드 시작 직후 (태스크 그래프 구성 단계) 발생

## 수정 이력

### 1차 수정 (실패) — env: TURBO_DAEMON: 'false'

`env:` 블록으로 `TURBO_DAEMON: 'false'` 설정 → **실패 지속**. Turborepo가 YAML `env:` 블록의 문자열 `'false'`를 올바르게 인식하지 못함. v2.11.0-rc.10에서 재현.

### 2차 수정 (실패) — --daemon=false

`--daemon=false` CLI 플래그 전달 → **실패**. Turborepo가 `--daemon`을 boolean-only 플래그로 취급하여 `unexpected value 'false'` 에러 발생. v2.11.0-rc.11에서 재현.

```
ERROR  unexpected value 'false' for '--daemon' found; no more were expected
Usage: turbo run --daemon
```

### 3차 수정 — --no-daemon

`--no-daemon` 플래그 사용 (Turborepo의 negation 플래그 패턴):

```yaml
- name: Build
  run: pnpm turbo run build --no-daemon

- name: Chain Tests
  run: pnpm turbo run test:chain --no-daemon
```

## 영향 범위

- `release.yml` — chain-integration job (릴리스 품질 게이트 차단)
- `ci.yml`에는 chain-integration job 없음 (영향 없음)

## 테스트 항목

- [ ] `--no-daemon` 플래그 적용 후 chain-integration Build 성공 확인
- [ ] chain-integration Chain Tests 정상 실행 확인
- [ ] test job 기존 동작 영향 없음 확인
