# 454: Solana WebSocket 429 로그 폭주 — Adaptive Polling Fallback

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-25
- **관련 이슈:** #429, #431, #437 (기존 수정 불충분)

## 증상

데몬을 장시간 운영하면 아래 로그가 수십~수백 회 반복 출력되며 멈추지 않음:

```
ws error: Unexpected server response: 429
ws error: Unexpected server response: 429
ws error: Unexpected server response: 429
... (무한 반복)
```

이전 이슈 #437에서 시작 시 rate limit은 해결했으나, 장시간 운영 시 Solana RPC WebSocket 재연결 폭주 문제는 여전히 존재.

## 원인 분석 (3중 원인)

### 1. `ws` 라이브러리가 stderr에 직접 출력 — 제어 불가

- `"ws error: Unexpected server response: 429"`는 WAIaaS 코드가 아닌 `ws` npm 패키지(v8.x)가 WebSocket 핸드셰이크 실패 시 stderr에 직접 출력
- `@solana/kit` → 내부 `ws` 라이브러리 경로이므로 WAIaaS의 ILogger를 거치지 않음
- 경로: `SolanaIncomingSubscriber.connect()` → `@solana/kit createSolanaRpcSubscriptions` → `ws` library → stderr

### 2. `@solana/kit` 내부 자체 재연결 + WAIaaS reconnectLoop 이중 재시도

- `@solana/kit`의 `createSolanaRpcSubscriptions`가 내부적으로 WS 재연결을 시도할 수 있음
- 동시에 WAIaaS의 `reconnectLoop` (connection-state.ts)도 disconnect를 감지하고 `connect()` 재호출
- 두 레이어가 각각 독립적으로 재시도 → 429 응답이 기하급수적으로 증가

### 3. `connect()`에서 모든 지갑의 WS 구독을 동시 시작

- `SolanaIncomingSubscriber.connect()` (L150-168)에서 모든 subscribed wallet에 대해 동시에 `startWebSocketSubscription()` 호출
- 재연결 시에도 동일하게 N개의 WS 구독을 한번에 시도 → RPC rate limit 즉시 초과

## 수정 방안: Adaptive Fallback (방안 C)

### C-1. `connect()` 내 지갑 구독 stagger

- `SolanaIncomingSubscriber.connect()`에서 지갑별 WS 구독을 300ms 간격으로 순차 시작
- 재연결 시에도 동일하게 stagger 적용

### C-2. 429 카운터 기반 adaptive polling 전환

- 연속 429 카운터 도입 (SolanaIncomingSubscriber 내부)
- 429 연속 5회 초과 시 자동으로 polling 모드로 전환
- polling 모드에서 주기적으로 (5분 간격) WS 복귀 시도
- 성공 시 WS 모드 복원, 실패 시 polling 유지

### C-3. `@solana/kit` WS transport 커스터마이징

- `createSolanaRpcSubscriptions`에 커스텀 WebSocket transport 주입
- 429 응답 시 `ws` 라이브러리 error 이벤트를 캡처하여 stderr 출력 억제
- WAIaaS ILogger를 통해 rate limit 상태를 warn 레벨로 1회만 보고

### C-4. Solana용 reconnectConfig 프리셋 강화

- `maxDelayMs: 300_000` (5분, 현재 60초)
- `pollingFallbackThreshold: 2` (현재 3)
- POLLING_FALLBACK 전환 후 WS 복귀 시도 간격도 5분으로 확대

### C-5. Admin Settings 런타임 전환

- `incoming_monitor_solana_mode: 'websocket' | 'polling' | 'adaptive'` 설정 추가
- 기본값: `'adaptive'`
- 운영 중 Admin UI에서 모드 전환 가능 (hot-reload)

## 수정 파일

| 파일 | 수정 내용 |
|---|---|
| `packages/adapters/solana/src/solana-incoming-subscriber.ts` | C-1: 지갑 구독 stagger, C-2: 429 카운터 + adaptive 전환, C-3: 커스텀 WS transport |
| `packages/core/src/interfaces/connection-state.ts` | C-4: Solana용 reconnectConfig 프리셋 export |
| `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` | C-4: Solana subscriber 생성 시 강화된 config 전달, C-5: Admin Settings 연동 |
| `packages/daemon/src/services/settings-service.ts` | C-5: `incoming_monitor_solana_mode` 설정 키 등록 |

## 재발 방지

1. **RPC Pool 통합**: Solana WS도 RPC Pool의 rate limiter를 통과하도록 통합 (현재 HTTP만)
2. **관측 가능성**: `ws` stderr 출력을 캡처하여 WAIaaS ILogger로 리다이렉트
3. **E2E 시나리오**: 429 rate limit 시뮬레이션 테스트 추가 (mock RPC server)

## 테스트 항목

### 자동 테스트 (코드)

1. **stagger 적용**: `connect()`에서 N개 지갑 구독 시작 간 300ms 이상 간격이 존재하는지 확인 (타이밍 mock)
2. **adaptive 전환**: mock RPC가 429를 5회 연속 반환할 때 mode가 `'polling'`으로 전환되는지 확인
3. **WS 복귀 시도**: polling 전환 후 5분(테스트에서는 짧은 interval) 경과 시 WS 재연결을 시도하는지 확인
4. **WS 복귀 성공**: mock RPC 정상화 후 WS 모드로 자동 복원되고 pollAll 중단되는지 확인
5. **stderr 억제**: 429 발생 시 `ws` 라이브러리의 stderr 직접 출력이 발생하지 않는지 확인 (process.stderr.write spy)
6. **ILogger 보고**: rate limit 상태가 ILogger warn 레벨로 1회만 보고되는지 확인 (logger mock)
7. **reconnectConfig**: Solana subscriber가 `maxDelayMs: 300_000`, `pollingFallbackThreshold: 2`로 초기화되는지 확인
8. **Admin Settings 반영**: `incoming_monitor_solana_mode` 값 변경 시 subscriber mode가 hot-reload되는지 확인
9. **cascading 방지**: 한 네트워크의 429가 다른 네트워크 ConnectionEntry에 영향을 주지 않는지 확인
10. **connect 실패 시 엔트리 정리**: connect()가 throw하면 connections Map에서 해당 key가 제거되는지 확인

### 수동 테스트 (데몬 실행)

1. **장시간 운영 검증**: 데몬을 실제 환경에서 30분 이상 운영하며 `ws error: Unexpected server response: 429` 로그가 폭주하지 않는지 확인. adaptive 전환 후 로그가 안정화되고 polling 모드에서 정상 동작하는지 검증.
