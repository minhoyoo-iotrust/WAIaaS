# #352 — chain-integration CI Build 실패: Turborepo I/O 에러

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-15
- **수정일:** 2026-03-15
- **발견 위치:** GitHub Actions release.yml — v2.11.0-rc.9 Release

## 증상

`release.yml` 워크플로우의 `chain-integration` job에서 `pnpm turbo run build` 실행 시 즉시 크래시:

```
x I/O error: No such device or address (os error 6)
`-> No such device or address (os error 6)
```

- Build 스텝이 1초 만에 실패 (실제 컴파일 시작 전)
- 동일 워크플로우의 `test` job은 같은 `pnpm turbo run build`가 성공
- rc.9 ~ rc.12 4회 연속 재현 (일시적 flake 아님)

## 원인 분석

### 근본 원인
Turborepo 2.8.3이 백그라운드 프로세스(solana-test-validator, anvil)가 실행 중인 GitHub Actions runner에서 내부 IPC(Unix domain socket/파이프) 초기화에 실패. 데몬 on/off와 무관한 Turborepo 자체의 환경 감도 문제.

### 근거
- `test` job (백그라운드 프로세스 없음): `pnpm turbo run build` **성공**
- `chain-integration` job (백그라운드 프로세스 2개): Turborepo **모든 호출 실패**
- 데몬 비활성화 3가지 시도 모두 동일 에러 → 데몬과 무관
- `--filter` 사용해도 동일 에러 → 특정 태스크와 무관
- `pnpm -r run build`로 교체 시 빌드 성공, 이후 `turbo run test:chain` 호출 시 다시 실패 → Turborepo 자체가 문제

## 수정 이력

| 시도 | 방법 | 결과 | 버전 |
|------|------|------|------|
| 1차 | `env: TURBO_DAEMON: 'false'` | ❌ 환경변수 미인식 | rc.10 |
| 2차 | `--daemon=false` | ❌ `unexpected value 'false'` | rc.11 |
| 3차 | `--no-daemon` | ❌ 동일 I/O error | rc.12 |
| 4차 | `--filter='!@waiaas/admin'` | ❌ 동일 I/O error | dispatch |
| 5차 | `pnpm -r run build` (turbo build만 우회) | ❌ `turbo run test:chain`에서 재발 | dispatch |
| **6차** | **`pnpm -r` 전면 교체 (turbo 완전 우회)** | **✅ 성공** | dispatch |

## 해결 방안

chain-integration job에서 Turborepo를 완전히 우회하고 `pnpm -r`(recursive) 사용:

```yaml
- name: Build
  run: pnpm --filter='!@waiaas/admin' -r run build

- name: Chain Tests
  run: pnpm -r run test:chain --if-present
```

## 테스트 항목

- [x] chain-integration Build 성공 확인 (pnpm -r)
- [x] chain-integration Chain Tests 정상 실행 확인
- [x] test job 기존 동작 영향 없음 확인
