# 401 — PositionTracker 시작 시 STAKING/YIELD/PERP 즉시 동기화 누락으로 최대 15분간 포지션 미표시

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** —
- **발견일:** 2026-03-19

## 현상

데몬 재시작 후 DeFi Positions 대시보드에서 Lido stETH 포지션이 표시되지 않음. Assets 탭에서는 stETH 0.020500 ($44.83)이 정상 표시되지만, DeFi Positions 대시보드에는 Aave V3만 표시.

데몬 uptime 8분 시점에서 STAKING 카테고리 sync가 아직 한 번도 실행되지 않음.

## 원인

`packages/daemon/src/services/defi/position-tracker.ts` (line 100-121):

```typescript
start(): void {
  for (const category of POSITION_CATEGORIES) {
    const timer = setInterval(() => void this.syncCategory(category), intervalMs);
    timer.unref();
    this.timers.set(category, timer);
  }
  // Immediate first sync for LENDING
  void this.syncCategory('LENDING');  // ← LENDING만 즉시 동기화
}
```

| 카테고리 | 첫 실행 | 간격 |
|----------|---------|------|
| LENDING | **즉시** | 5분 |
| STAKING | **15분 후** | 15분 |
| YIELD | **1시간 후** | 1시간 |
| PERP | **1분 후** | 1분 |

STAKING의 첫 실행이 15분 후이므로, 데몬 재시작 후 최대 15분간 Lido/Jito 포지션이 대시보드에 표시되지 않음.

`daemon-startup.ts` (line 1238-1240)에서도 LENDING만 즉시 sync:
```typescript
void state.positionTracker.syncCategory('LENDING');
```

## 영향

- 데몬 재시작 후 최대 15분간 STAKING 포지션(Lido, Jito) 미표시
- YIELD 포지션(Pendle)은 최대 1시간 후에야 표시
- 사용자가 "Lido 포지션이 보이지 않는다"고 반복 보고 — 실제로는 시간이 지나면 표시되지만, 재시작 직후에는 항상 누락

## 수정 방안

### A. 시작 시 전체 카테고리 즉시 동기화 (권장)

```typescript
start(): void {
  for (const category of POSITION_CATEGORIES) {
    const timer = setInterval(() => void this.syncCategory(category), intervalMs);
    timer.unref();
    this.timers.set(category, timer);
  }
  // Immediate first sync for ALL categories
  for (const category of POSITION_CATEGORIES) {
    void this.syncCategory(category);
  }
}
```

### B. STAKING만 추가

```typescript
void this.syncCategory('LENDING');
void this.syncCategory('STAKING');
```

## 수정 대상 파일

- `packages/daemon/src/services/defi/position-tracker.ts` — `start()` 메서드
- `packages/daemon/src/lifecycle/daemon-startup.ts` — Step 4f-5 즉시 sync 추가

## 테스트 항목

1. **유닛 테스트**: `start()` 호출 후 모든 카테고리에 대해 `syncCategory`가 즉시 호출되는지 검증
2. **통합 테스트**: 데몬 시작 직후 (5초 이내) Lido stETH 포지션이 DeFi Positions에 표시되는지 확인
