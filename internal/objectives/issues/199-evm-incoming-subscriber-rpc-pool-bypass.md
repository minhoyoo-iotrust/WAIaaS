# #199 — EVM 수신 폴링이 RPC Pool을 우회하여 단일 엔드포인트만 사용

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** -
- **발견일:** 2026-02-26
- **관련:** #169, #175, #185, #193, #194

## 현상

Arbitrum 네트워크에 무료 RPC 엔드포인트 3개를 등록했음에도, EVM 수신 트랜잭션 폴링이 항상 동일한 엔드포인트(`https://arbitrum.drpc.org/`)로만 요청한다. 해당 엔드포인트가 408(free-tier timeout) 또는 500(internal error)을 반복 반환해도 다른 엔드포인트로 전환되지 않아, backoff만 증가하며(120s→240s→300s 캡) 수신 트랜잭션 감지가 사실상 중단된다.

**에러 로그 패턴:**
```
EVM poll failed for wallet 019c88f6-... (backoff 300s, consecutive: 10): HTTP request failed.
Status: 408
URL: https://arbitrum.drpc.org/
Details: {"message":"Request timeout on the free tier","code":30}
```

## 원인 분석

### 1. 구독자 생성 시 RPC URL 1회 고정

`daemon.ts`의 `subscriberFactory`에서 구독자 생성 시점에 `resolveRpcUrlFromPool()`을 1회 호출하고, 그 URL로 viem `PublicClient`를 생성한다. 이후 폴링에서는 이 클라이언트를 계속 재사용한다.

```typescript
// daemon.ts subscriberFactory — 지갑 구독 시 1회만 실행
const rpcUrl = resolveRpcUrlFromPool(this.rpcPool, ...);
return new EvmIncomingSubscriber({ rpcUrl, ... });
```

```typescript
// evm-incoming-subscriber.ts 생성자 — 고정 URL 클라이언트
this.client = createPublicClient({ transport: http(config.rpcUrl) });
```

### 2. 폴링 실패 시 RPC Pool에 미보고

`pollAll()` 내부에서 에러 발생 시 자체 backoff 로직만 적용하고, `rpcPool.reportFailure()`를 호출하지 않는다. 따라서 RPC Pool이 해당 엔드포인트를 cooldown 처리할 수 없고, 다음 엔드포인트로 전환이 발생하지 않는다.

### 3. RPC Pool이 priority-based fallback (라운드로빈 아님)

`RpcPool.getUrl()`은 항상 첫 번째 사용 가능한(cooldown 아닌) 엔드포인트를 반환한다. `reportFailure()`가 호출되지 않으면 cooldown이 설정되지 않아 항상 동일한 엔드포인트가 반환된다.

### 4. 트랜잭션 실행과의 비대칭

`AdapterPool`은 매 요청마다 `rpcPool.getUrl()`을 호출하여 동적으로 엔드포인트를 resolve하지만, `EvmIncomingSubscriber`는 생성 시 1회만 resolve한다.

| 컴포넌트 | URL resolve 시점 | reportFailure 호출 | Pool 연동 |
|----------|-------------------|-------------------|-----------|
| AdapterPool (TX 실행) | 매 요청 | O | 정상 |
| EvmIncomingSubscriber (수신 폴링) | 생성 시 1회 | X | 미연동 |

## 수정 방안

### 방안 A: 폴링 시 RPC URL 동적 재resolve (권장)

1. `EvmIncomingSubscriber` 생성자에 고정 URL 대신 URL resolver 콜백을 주입
2. `pollAll()` 시작 시 매번 resolver를 호출하여 현재 활성 엔드포인트 획득
3. 폴링 실패 시 failure reporter 콜백을 호출하여 RPC Pool에 보고
4. RPC Pool이 cooldown 처리 → 다음 폴링에서 자동으로 다른 엔드포인트 사용

```typescript
// 변경 후 인터페이스
interface EvmIncomingSubscriberConfig {
  resolveRpcUrl: () => string;        // 매 폴링마다 호출
  reportRpcFailure?: (url: string) => void;  // 실패 시 Pool에 보고
  // ...
}
```

### 방안 B: viem fallback transport 사용

viem의 `fallback()` transport에 복수 URL을 전달하여 자동 폴백 처리. RPC Pool 연동 없이 viem 레벨에서 해결.

```typescript
import { fallback, http } from 'viem';
const transport = fallback([
  http(url1), http(url2), http(url3)
]);
```

**방안 A 권장 사유:** 기존 RPC Pool의 cooldown/priority 로직과 일관성 유지, Admin UI RPC Status 페이지에 실패 현황 반영, 핫 리로드 시 URL 변경 자동 반영.

## 영향 범위

| 패키지 | 파일 | 변경 내용 |
|--------|------|-----------|
| `@waiaas/adapter-evm` | `evm-incoming-subscriber.ts` | URL resolver 콜백 주입 + 폴링 시 동적 resolve |
| `@waiaas/daemon` | `lifecycle/daemon.ts` (subscriberFactory) | resolver/reporter 콜백 전달 |
| `@waiaas/daemon` | `infrastructure/settings/hot-reload.ts` | 구독자 재생성 또는 URL 갱신 |
| `@waiaas/adapter-evm` | `__tests__/evm-incoming-subscriber.test.ts` | 테스트 업데이트 |

## 테스트 항목

- [ ] **단위 테스트**: 폴링 실패 시 `reportRpcFailure` 콜백이 실패한 URL과 함께 호출되는지 검증
- [ ] **단위 테스트**: 다음 폴링 시 `resolveRpcUrl`이 다시 호출되어 새 URL을 사용하는지 검증
- [ ] **단위 테스트**: RPC URL resolve 실패(AllRpcFailedError) 시 폴링이 graceful하게 스킵되는지 검증
- [ ] **통합 테스트**: 엔드포인트 A 실패 → cooldown → 엔드포인트 B로 자동 전환되는 E2E 흐름 검증
- [ ] **회귀 테스트**: 기존 단일 엔드포인트 설정에서도 정상 동작하는지 검증
- [ ] **회귀 테스트**: Admin Settings RPC URL 핫 리로드 시 폴링이 새 URL을 사용하는지 검증
