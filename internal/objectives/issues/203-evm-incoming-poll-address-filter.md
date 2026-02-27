# #203 — EVM 수신 모니터 eth_getLogs address 필터 누락으로 반복 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** v29.2

## 증상

데몬 장시간 운영 시 아래 에러가 지속 반복됨:

```
EVM poll failed for wallet {walletId} (backoff 300s, consecutive: 8): ...
```

### 관측된 에러 유형 3가지

1. **publicnode.com 거부** — `"Please specify an address in your request"`
2. **drpc.org 500/408** — `"Temporary internal error"` (code 19) / `"Request timeout on the free tier"` (code 30)
3. **null 응답 크래시** — `"Cannot read properties of null (reading 'map')"`

## 근본 원인

`EvmIncomingSubscriber.pollERC20()`이 `eth_getLogs`를 호출할 때 **contract address 없이 topics만**으로 필터링함:

```typescript
// packages/adapters/evm/src/evm-incoming-subscriber.ts:331-336
const logs = await this.client.getLogs({
  event: TRANSFER_EVENT,
  args: { to: walletAddress },  // topics[2]만 설정
  fromBlock,
  toBlock,
  // address 파라미터 없음 → 전체 체인 로그 스캔 요구
});
```

이 요청은 해당 블록 범위의 **모든 컨트랙트의 모든 Transfer 이벤트**를 스캔해야 하므로:
- 무료 RPC는 address 없는 로그 쿼리를 거부하거나 타임아웃 처리
- RPC Pool이 엔드포인트를 로테이션해도 모든 엔드포인트에서 동일한 문제 발생
- 실패 누적 시 `MAX_RETRY_SAME_RANGE`(3회)에 의해 블록 범위 강제 스킵 → **수신 트랜잭션 누락**

### 부수 버그: null 가드 미적용

```typescript
// :338 — RPC가 null 응답 시 크래시
return logs.map((log) => ({ ... }));
```

일부 RPC가 비정상 응답(null)을 반환하면 `.map()` 호출에서 TypeError 발생.

## 영향

| 영향 | 설명 |
|------|------|
| 수신 TX 누락 | 3회 연속 실패 시 블록 범위 스킵 → 해당 구간 ERC-20 수신 미감지 |
| 로그 스팸 | 매 폴링 주기마다 경고 로그 출력 (모든 지갑 × 모든 네트워크) |
| RPC 쿼터 낭비 | 반드시 실패할 요청을 반복 전송하여 무료 RPC 쿼터 소진 |
| 백오프 고착 | `errorCount`가 계속 증가하여 최대 300초 백오프에 고정 |

## 수정 방안

### 1. Token Registry 주소를 `address` 필터로 전달

`TokenRegistryService.getTokensForNetwork(network)`에서 해당 네트워크의 등록 토큰 주소 목록을 가져와 `getLogs`의 `address` 파라미터로 전달:

```typescript
// Before
client.getLogs({ event: TRANSFER_EVENT, args: { to: walletAddress }, fromBlock, toBlock })

// After
client.getLogs({ address: tokenAddresses, event: TRANSFER_EVENT, args: { to: walletAddress }, fromBlock, toBlock })
```

- 등록된 토큰만 모니터링 → RPC 부하 대폭 감소
- 미등록 토큰은 기존 `UnknownTokenRule`이 suspicious 처리하므로 일관성 유지
- `resolveTokenAddresses: () => Address[]` 리졸버를 constructor에 전달하여 런타임 토큰 등록 반영

### 2. 토큰 미등록 시 ERC-20 폴링 graceful skip

네트워크에 등록된 토큰이 없으면 ERC-20 폴링을 스킵하고 네이티브 전송만 감지 (무의미한 실패 반복 방지).

### 3. null 가드 추가

```typescript
const results = logs ?? [];
return results.map((log) => ({ ... }));
```

## 변경 대상

| 파일 | 변경 |
|------|------|
| `packages/adapters/evm/src/evm-incoming-subscriber.ts` | `resolveTokenAddresses` 리졸버 추가, `pollERC20`에 address 필터, null 가드 |
| `packages/daemon/src/lifecycle/daemon.ts` (subscriberFactory) | TokenRegistryService에서 토큰 주소 목록을 리졸브하는 콜백 전달 |

기존 인터페이스(`IChainSubscriber`) 변경 불필요.

## 관련 이슈

- #169 — EVM IncomingMonitor 무료 RPC rate limit (FIXED, v28.4)
- #175 — per-wallet 폴링 에러 무한 재시도 + 로그 스팸 (FIXED, v28.4)
- #185 — free-tier RPC 408 타임아웃 수신 TX 무음 누락 (FIXED, v28.5)
- #199 — EVM 수신 폴링이 RPC Pool 우회 (FIXED, v29.0)

## 테스트 항목

1. **address 필터 적용 단위 테스트**: 토큰 주소 목록이 있을 때 `getLogs` 호출에 `address` 파라미터가 포함되는지 검증
2. **토큰 미등록 시 스킵 테스트**: 빈 토큰 목록일 때 ERC-20 폴링을 스킵하고 에러 없이 빈 배열 반환 검증
3. **null 응답 핸들링 테스트**: RPC가 null 반환 시 크래시 없이 빈 배열 반환 검증
4. **리졸버 동적 갱신 테스트**: 런타임에 토큰이 추가되면 다음 폴링 주기에 반영되는지 검증
