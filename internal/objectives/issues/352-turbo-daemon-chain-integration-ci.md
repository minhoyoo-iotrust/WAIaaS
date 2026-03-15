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

## 해결 방안

`chain-integration` job의 Build 및 Chain Tests 단계에서 Turborepo 데몬을 비활성화:

```yaml
- name: Build
  run: TURBO_DAEMON=false pnpm turbo run build

- name: Chain Tests
  run: TURBO_DAEMON=false pnpm turbo run test:chain
```

## 영향 범위

- `release.yml` — chain-integration job (릴리스 품질 게이트 차단)
- `ci.yml`에도 동일 chain-integration job 존재 시 동일 영향 가능

## 테스트 항목

- [ ] `TURBO_DAEMON=false` 적용 후 chain-integration Build 성공 확인
- [ ] chain-integration Chain Tests 정상 실행 확인
- [ ] test job 기존 동작 영향 없음 확인
