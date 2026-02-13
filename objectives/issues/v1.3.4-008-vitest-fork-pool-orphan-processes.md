# BUG-008: vitest fork pool 워커 프로세스가 고아 상태로 누적

## 심각도

**MEDIUM** — 시스템 메모리/CPU를 점진적으로 소모. 기능 장애는 아니나 장시간 개발 시 리소스 고갈 유발.

## 증상

GSD 워크플로우로 개발 중 vitest 프로세스가 종료되지 않고 누적됨:

```bash
ps aux | grep vitest
# → PPID=1(launchd)인 고아 vitest fork 워커 다수 확인
# → 각 프로세스 메모리 ~2-2.3%, CPU 코어-1(=7)개씩 누적
```

- VS Code vitest 익스텐션 미설치 상태에서도 발생
- 프로세스가 자동 종료되지 않아 수동 kill 필요

## 재현 방법

```bash
# 1. vitest를 실행 후 부모 프로세스를 강제 종료 (Ctrl+C, 컨텍스트 리셋 등)
pnpm test --filter @waiaas/daemon
# → 테스트 도중 Ctrl+C 또는 부모 프로세스 종료

# 2. 고아 프로세스 확인
ps aux | grep "vitest" | grep -v grep
# → PPID=1인 vitest fork 워커가 남아 있음
```

GSD executor가 테스트를 실행하다 컨텍스트 리셋/사용자 중단이 발생하면 매번 워커가 누적됨.

## 원인

### 1. Fork Pool 사용 (sodium-native 호환) — 설정 자체는 정당

`packages/daemon/vitest.config.ts`:

```typescript
pool: 'forks', // sodium-native guarded memory (mprotect) requires forks pool
```

`packages/cli/vitest.config.ts`:

```typescript
pool: 'forks', // Isolate tests using forks (sodium-native mprotect compatibility)
```

`sodium-native`의 `mprotect_noaccess` 호출이 thread worker에서 크래시를 유발하므로 fork pool은 필수.

### 2. poolOptions 미설정 — 과도한 워커 생성

두 설정 모두 `poolOptions`가 없어 vitest 기본값 적용:

- `maxForks = Math.max(numCpus - 1, 1)` → 8코어 시스템에서 **7개 워커**
- `minForks = 0`이지만 한번 생성된 워커는 부모 존재 시에만 정리됨

### 3. 부모 프로세스 비정상 종료 시 워커 미정리

vitest의 fork pool은 부모 프로세스의 `beforeExit`/`SIGTERM` 핸들러에서 워커를 종료함. 그러나:

1. Claude Code의 GSD executor가 `pnpm test` 실행
2. 컨텍스트 리셋, 사용자 중단, 또는 타임아웃 발생
3. 부모 프로세스(turbo/vitest runner)가 `SIGKILL`로 즉시 종료됨
4. `SIGKILL`은 핸들러를 실행하지 않으므로 fork 워커 cleanup 불가
5. 워커 PPID가 1(launchd/init)로 바뀌며 고아 프로세스로 잔존

### 4. 워크스페이스 구조가 문제를 증폭

`vitest.workspace.ts`가 8개 패키지를 스캔하므로, 패키지별 fork pool이 독립 생성됨. 중단 시 daemon(7개) + cli(7개) = **최대 14개** 워커가 동시에 고아화 가능.

## 영향 범위

| 항목 | 영향 |
|------|------|
| 메모리 | 워커당 ~2-2.3% 시스템 메모리 소모, 7개 시 ~15% |
| CPU | 유휴 상태이나 이벤트 루프 폴링으로 미량 CPU 사용 |
| 파일 디스크립터 | 워커당 pipe/KQUEUE FD 점유 |
| 장시간 개발 | 수십 개 프로세스 누적 시 시스템 성능 저하 |

## 수정안

`packages/daemon/vitest.config.ts`와 `packages/cli/vitest.config.ts`에 `poolOptions.forks` 추가:

```typescript
// Before
export default defineConfig({
  test: {
    pool: 'forks',
    // ... 기타 설정
  },
});

// After
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,  // CPU-1(7개) → 2개로 제한. 고아화 시 피해 최소화
      },
    },
    // ... 기타 설정
  },
});
```

### 수정 근거

- `maxForks: 2` — 테스트 병렬성은 유지하면서 고아 프로세스 피해를 7개→2개로 축소
- 이 프로젝트의 단위 테스트는 I/O 바운드(SQLite, 네트워크 mock)이므로 2개 워커로도 충분
- `singleFork: true`는 테스트 격리를 약화시키므로 사용하지 않음

### 임시 대응

고아 프로세스 수동 정리:

```bash
pkill -f "node.*vitest"
```

---

*발견일: 2026-02-12*
*마일스톤: v1.3.4*
*상태: FIXED*
*관련 파일: packages/daemon/vitest.config.ts, packages/cli/vitest.config.ts*
