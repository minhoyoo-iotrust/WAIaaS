# v1.8-058: WalletConnect 셧다운 시 DB 연결 종료 후 스토리지 쓰기 시도

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v1.8
- **상태:** FIXED
- **발견일:** 2026-02-17

## 증상

데몬 셧다운(SIGINT) 시 정상 종료 메시지 이후 Unhandled rejection 에러 발생:

```
Shutdown complete
{ time: 1771295842057, level: 50, context: 'core/subscription' }
Unhandled rejection: TypeError: The database connection is not open
    at Database.prepare (better-sqlite3/lib/methods/wrappers.js:5:21)
    at SqliteKeyValueStorage.setItem (wc-storage.js:40:14)
    at Gt.setRelayerSubscriptions (@walletconnect/core)
    at Gt.persist (@walletconnect/core)
    ...
```

## 원인 분석

셧다운 시퀀스에서 **순서 의존 레이스 컨디션** 발생:

1. **Step 6a**: `WcSessionService.shutdown()` 호출 — WebSocket relay `disconnect()` 후 `signClient = null`
2. **Step 10**: `sqlite.close()` — DB 연결 종료
3. **이후**: WalletConnect `@walletconnect/core` 내부의 Relayer가 비동기적으로 구독 정보를 persist 시도
   - `Gt.persist()` → `Gt.setRelayerSubscriptions()` → `SqliteKeyValueStorage.setItem()` 호출
   - 이 시점에서 DB가 이미 닫혀 있으므로 `Database.prepare()` 에서 TypeError 발생

**근본 원인**: WalletConnect SDK의 Relayer는 disconnect 이후에도 이벤트 기반으로 subscription persist를 시도한다. `disconnect()`가 모든 비동기 콜백을 즉시 취소하지 않으므로, DB 종료와의 경합이 발생한다.

## 영향

- 기능적 영향 없음 (셧다운 완료 후 발생하므로 데이터 손실 없음)
- 사용자에게 불필요한 에러 메시지 노출
- `unhandledRejection` 핸들러가 이 에러를 잡으면 이중 셧다운 시도 가능 (현재 double-shutdown 가드로 방어됨)

## 해결 방안

### `SqliteKeyValueStorage`에 closed 가드 추가

`wc-storage.ts`의 `SqliteKeyValueStorage` 클래스에 `closed` 플래그를 도입하여, 셧다운 이후 들어오는 WC SDK의 비동기 콜백을 무시한다:

```typescript
export class SqliteKeyValueStorage implements IKeyValueStorage {
  private closed = false;

  constructor(private readonly sqlite: Database) {}

  close(): void {
    this.closed = true;
  }

  async setItem<T = any>(key: string, value: T): Promise<void> {
    if (this.closed) return;  // 셧다운 후 WC 콜백 무시
    this.sqlite
      .prepare('INSERT OR REPLACE INTO wc_store (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  }

  // getKeys, getEntries, getItem, removeItem에도 동일 가드 적용
}
```

### `WcSessionService.shutdown()`에서 storage.close() 호출

```typescript
async shutdown(): Promise<void> {
  if (this.signClient) {
    try {
      await (this.signClient.core?.relayer?.provider as any)?.disconnect?.();
    } catch {
      // best effort
    }
    this.signClient = null;
    this.sessionMap.clear();
    this.pendingPairing.clear();
  }
  this.storage?.close();  // DB close 전에 스토리지 비활성화
}
```

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/services/wc-storage.ts` | `closed` 플래그 + `close()` 메서드 + 모든 DB 접근 메서드에 가드 추가 |
| `packages/daemon/src/services/wc-session-service.ts` | `shutdown()`에서 `this.storage?.close()` 호출 |

## 재발 방지 테스트

1. **단위 테스트 — `SqliteKeyValueStorage.close()` 후 no-op 검증**:
   - `close()` 호출 후 `setItem()` → 에러 없이 무시됨 확인
   - `close()` 호출 후 `getItem()` → `undefined` 반환 확인
   - `close()` 호출 후 `getKeys()` → 빈 배열 반환 확인

2. **통합 테스트 — WcSessionService 셧다운 순서 검증**:
   - `shutdown()` 호출 후 storage가 closed 상태인지 확인
   - `shutdown()` 이후 `storage.setItem()` 호출 시 DB 에러 미발생 확인

## 관련

- `packages/daemon/src/lifecycle/daemon.ts` (셧다운 시퀀스 Step 6a, Step 10)
- 이슈 #049 (WalletConnect SignClient ESM/CJS 호환성 — 동일 WC 서비스)
