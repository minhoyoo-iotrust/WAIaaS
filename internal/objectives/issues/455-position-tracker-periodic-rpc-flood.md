# 455 — PositionTracker 주기적 동기화로 Solana RPC 429 폭주

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-25
- **관련 이슈:** #454 (Solana WS 429)

## 현상

데몬 장시간 운영 시 Kamino(`loadMarket`)와 Drift(`getClient.subscribe`) SDK가 주기적으로 대량 RPC 호출을 발생시켜 Helius/공용 RPC에서 429 rate limit 폭주.

```
[actions] KaminoSdkWrapper.loadMarket: attempt 1/3 failed {"error":"429 Too Many Requests: rate limited"}
[actions] DriftSdkWrapper.getClient: subscribe attempt 1/3 failed {"error":"429 Too Many Requests"}
Server responded with 429 Too Many Requests.  Retrying after 500ms delay...
Server responded with 429 Too Many Requests.  Retrying after 1000ms delay...
... (반복)
```

## 원인 분석

### PositionTracker 주기적 타이머가 RPC 과부하 유발

`PositionTracker.start()`가 카테고리별 주기 타이머를 등록:

| 카테고리 | 주기 | SDK 내부 RPC/지갑 | 비고 |
|----------|------|-------------------|------|
| PERP (Drift) | **1분** | 4~7회 | `client.subscribe()` → State/User/Market 계정 fetch |
| LENDING (Kamino) | 5분 | 3~6회 | `KaminoMarket.load()` + `loadReserves()` |
| STAKING | 15분 | 1~2회 | 상대적으로 가벼움 |
| YIELD | 1시간 | 1~2회 | 상대적으로 가벼움 |

- 지갑 8개 × PERP 1분 주기 = **매 분 32~56회** RPC 호출 (Drift만)
- SDK 내부 호출은 제어 불가 (블랙박스)
- 실패 시 3회 재시도 → 부하 3배 증폭 → 429 악순환
- HealthFactorMonitor가 DANGER 감지 시 즉시 재동기화 → 추가 폭주

### 근본 문제

포지션 변화가 없는 지갑에 대해서도 주기적으로 SDK 초기화 + RPC 호출 반복. 실제 포지션 변화는 사용자 액션(supply/borrow/open position 등) 시점에만 발생하므로, 주기적 polling은 대부분 불필요.

## 수정 방안: Startup-Once + Action-Triggered Sync

### 1. PositionTracker 주기적 타이머 제거

`start()`에서 `setInterval` 기반 주기 타이머를 제거하고, 시작 시 1회 초기 sync만 유지.

```typescript
// Before: 주기적 polling
start(): void {
  for (const category of POSITION_CATEGORIES) {
    const timer = setInterval(() => void this.syncCategory(category), intervalMs);
    this.timers.set(category, timer);
  }
  // Immediate first sync
  for (const category of POSITION_CATEGORIES) {
    void this.syncCategory(category);
  }
}

// After: startup 1회만
start(): void {
  for (const category of POSITION_CATEGORIES) {
    void this.syncCategory(category);
  }
}
```

### 2. Action 실행 후 on-demand sync

Kamino/Drift action provider에서 액션(supply, borrow, open position 등) 실행 완료 후 해당 지갑에 대해서만 position sync 트리거.

- `PositionTracker`에 `syncWallet(walletId, category)` 메서드 추가
- Action provider의 `execute()` 완료 후 호출

### 3. HealthFactorMonitor adaptive polling 제거

주기적 position 데이터가 없으므로 adaptive polling 기반 health factor 모니터링도 제거. Health factor는 action 후 sync된 데이터 기준으로만 확인.

## 수정 파일

| 파일 | 수정 내용 |
|---|---|
| `packages/daemon/src/services/defi/position-tracker.ts` | 주기적 타이머 제거, `syncWallet()` 메서드 추가, `start()`에서 1회 sync만 유지 |
| `packages/actions/src/providers/kamino/index.ts` | action 실행 후 position sync 콜백 호출 |
| `packages/actions/src/providers/drift/index.ts` | action 실행 후 position sync 콜백 호출 |
| `packages/daemon/src/services/monitoring/health-factor-monitor.ts` | adaptive polling 제거 또는 비활성화 |

## 테스트 항목

### 자동 테스트 (코드)

1. **startup sync 1회 확인**: `start()` 호출 시 모든 카테고리에 대해 `syncCategory()` 1회 호출 확인
2. **주기 타이머 미등록 확인**: `start()` 후 `setInterval` 호출 없음 확인
3. **syncWallet() 단위 테스트**: 특정 walletId + category로 호출 시 해당 지갑만 sync되는지 확인
4. **action 후 sync 콜백 호출 확인**: Kamino/Drift action 실행 후 position sync가 트리거되는지 확인

### 수동 테스트 (데몬 실행)

1. **429 감소 확인**: 데몬 20분 운영 시 Kamino/Drift 관련 429 로그가 startup 직후에만 발생하고 이후 발생하지 않는지 확인
2. **Admin UI 포지션 표시 확인**: startup sync 후 Admin UI DeFi Positions 페이지에 기존 포지션이 표시되는지 확인
