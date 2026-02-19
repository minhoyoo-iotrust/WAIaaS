# 079 — vitest 고아 프로세스 재발 방지 — 전 패키지 forceExit + forks pool 통일

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v2.2
- **상태:** FIXED
- **발견일:** 2026-02-18
- **발생 위치:** `packages/*/vitest.config.ts` (8개 패키지)
- **관련 이슈:** #008 (v1.4.4에서 daemon/cli에만 부분 적용)

## 현상

GSD executor가 Claude Code Task(subagent)를 spawn하여 `vitest run`을 실행할 때, Task agent가 종료/타임아웃되면 vitest worker 프로세스들이 고아(orphan, PPID=1)로 남아 시스템 리소스를 지속 소모한다.

2026-02-18 관찰 시점:
- 고아 vitest 프로세스 **17개** 잔류
- CPU 합계 **~300%+** 소모
- vitest worker 1~7번까지 확인 (8개 패키지 × 다수 worker)

## 원인 분석

### 부분 적용 현황

`#008` 수정 시 `daemon`과 `cli`에만 `pool: 'forks'` + `maxForks: 2`를 적용했으나, 나머지 6개 패키지는 기본값(threads pool)을 사용 중:

| 패키지 | pool | maxForks | forceExit | 상태 |
|--------|------|----------|-----------|------|
| daemon | forks | 2 | 미설정 | 부분 적용 |
| cli | forks | 2 | 미설정 | 부분 적용 |
| core | 기본(threads) | 무제한 | 미설정 | **미적용** |
| admin | 기본(threads) | 무제한 | 미설정 | **미적용** |
| sdk | 기본(threads) | 무제한 | 미설정 | **미적용** |
| mcp | 기본(threads) | 무제한 | 미설정 | **미적용** |
| adapter-solana | 기본(threads) | 무제한 | 미설정 | **미적용** |
| adapter-evm | 기본(threads) | 무제한 | 미설정 | **미적용** |

### 고아 프로세스 발생 메커니즘

1. GSD executor → Task(subagent) spawn → `vitest run` 실행
2. vitest가 worker 프로세스들을 fork/spawn
3. Task agent 종료 또는 타임아웃 → 부모 프로세스(node) 소멸
4. vitest worker들의 PPID가 1(init)로 전환 → **고아 프로세스**
5. `forceExit` 미설정 시 vitest가 열린 핸들을 기다리며 무한 대기 가능

## 수정 방안

전 패키지 vitest.config.ts에 다음 설정을 통일 적용:

```ts
test: {
  pool: 'forks',
  poolOptions: {
    forks: {
      maxForks: 2,
    },
  },
  forceExit: true,
}
```

### 설정 근거

- **`pool: 'forks'`**: fork된 자식 프로세스는 부모 종료 시 SIGTERM 전파를 받음. threads pool보다 고아 프로세스 방지에 유리
- **`maxForks: 2`**: 패키지당 worker 수를 제한하여 총 프로세스 수 폭발 방지 (8패키지 × 2 = 최대 16)
- **`forceExit: true`**: 테스트 완료 후 미정리 핸들(타이머, 소켓 등)을 무시하고 즉시 종료

### 적용 대상 (6개 파일 수정)

1. `packages/core/vitest.config.ts`
2. `packages/admin/vitest.config.ts`
3. `packages/sdk/vitest.config.ts`
4. `packages/mcp/vitest.config.ts`
5. `packages/adapters/solana/vitest.config.ts`
6. `packages/adapters/evm/vitest.config.ts`

기존 적용된 `daemon`, `cli`에는 `forceExit: true`만 추가.

## 영향 범위

- 테스트 실행 동작: forks pool은 threads 대비 약간 느리지만 격리성 향상
- sodium-native 호환성: daemon/cli에서 이미 forks pool 사용 중이므로 호환 검증 완료
- 기존 테스트 결과: 동작 변경 없음 (pool 변경은 실행 방식만 영향)
