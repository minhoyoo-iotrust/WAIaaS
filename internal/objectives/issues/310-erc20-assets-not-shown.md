# #310 — EVM getAssets() ERC-20 multicall silent failure — Sepolia USDC 40개 미표시

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** —
- **이전 상태:** WONTFIX (2026-03-10) — 온체인 잔액 0 가정으로 조기 종결. **UAT 재검증에서 온체인 40 USDC 확인, 재오픈.**

## 현상

`GET /v1/wallet/assets?network=ethereum-sepolia` 호출 시 native ETH만 반환되고 ERC-20 토큰(USDC 40개)이 표시되지 않는다.

### 재현 데이터

```
# assets API — USDC 미표시
GET /v1/wallet/assets?network=ethereum-sepolia&walletId=019c6fb6-2b2d-72a8-8515-235255be884d
→ assets: [{ mint: "native", symbol: "ETH", balance: "154946904508067680" }]

# 온체인 직접 RPC 조회 — USDC 40개 존재
eth_call balanceOf(0xf3DfA424D21BE3018e79d7ABC095236d0dF9F091) on 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
→ 0x0000000000000000000000000000000000000000000000000000000002625a00 (= 40,000,000 = 40 USDC)

# viem multicall 독립 테스트 — 정상 동작
node -e "createPublicClient → multicall → [{result: '40000000', status: 'success'}]"
```

## 확정된 사실

1. **온체인 잔액**: Sepolia USDC 40.00개 확인 (RPC 직접 eth_call)
2. **토큰 레지스트리**: Sepolia USDC 정상 등록 (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, decimals: 6, source: builtin)
3. **viem multicall**: evm adapter 패키지에서 동일 RPC(sepolia.drpc.org)로 multicall 실행 시 **정상 반환**
4. **데몬 API**: ETH만 반환, USDC 미포함

→ **RPC/multicall 자체는 정상. 데몬 런타임의 wireEvmTokens → adapter.getAssets 경로에서 문제 발생.**

## 원인 분석

### 코드 경로

1. `wireEvmTokens()` (`wallet.ts:133-180`): tokenRegistryService에서 토큰 목록 로드 → `adapter.setAllowedTokens()` 호출
2. `adapter.getAssets()` (`adapter.ts:169-228`): `_allowedTokens`에 대해 `client.multicall()` 실행, `balance > 0n` 필터링
3. `AdapterPool.resolve()` (`adapter-pool.ts:140`): chain:network 키로 adapter 캐시

### 근본원인 후보

| 후보 | 가능성 | 근거 |
|------|--------|------|
| **A. multicall silent failure** | **높음** | `adapter.ts:216`에서 multicall 실패를 **무조건 무시** (`// Skip failed multicall results silently`). 데몬 런타임에서 multicall이 실패해도 로그나 에러 없이 네이티브만 반환 |
| **B. tokenRegistryService 미주입** | 중간 | `wireEvmTokens()`의 `if (deps.tokenRegistryService)` 가드 — null이면 `_allowedTokens`가 빈 배열로 유지되어 ERC-20 조회 자체 미시도 |
| **C. adapterPool 캐시 인스턴스 불일치** | 낮음 | pool에서 꺼낸 adapter에 setAllowedTokens 호출하지만, getAssets 시점에 다른 인스턴스가 사용되는 경우 |

### 핵심 문제: 관측 불가능성

현재 코드는 multicall 실패를 **완전히 무시**하므로, 문제가 발생해도 데몬 로그에 흔적이 남지 않는다. 이것이 이 버그를 WONTFIX로 잘못 종결하게 만든 직접적 원인이다.

## 해결 방안

### Phase 1: 관측 가능성 확보 (진단 우선)

**원칙: 근본원인을 확정하기 전에 수정하지 않는다.**

1. **multicall 실패 로깅 추가** (`adapter.ts:216`)
   ```typescript
   // Before: Skip failed multicall results silently
   // After:
   if (result.status === 'failure') {
     logger.warn('ERC-20 multicall failed', {
       token: tokenDef.address,
       symbol: tokenDef.symbol,
       error: result.error?.message,
     });
   }
   ```

2. **wireEvmTokens 진입/결과 로깅** (`wallet.ts:133-180`)
   ```typescript
   logger.debug('wireEvmTokens', {
     walletId: wallet.id,
     network,
     tokenRegistryAvailable: !!deps.tokenRegistryService,
     tokenCount: tokenList.length,
   });
   ```

3. **getAssets 결과 로깅** (`wallet.ts:443`)
   ```typescript
   logger.debug('getAssets result', {
     walletId: wallet.id,
     network: targetNetwork,
     assetCount: assets.length,
     hasErc20: assets.some(a => !a.isNative),
   });
   ```

### Phase 2: 근본원인 확정

Phase 1 로깅 배포 후 동일 요청을 재실행하여 로그에서 다음을 확인:

- `wireEvmTokens`에서 `tokenCount`가 0이면 → 원인 B (주입 누락)
- `tokenCount > 0`이지만 `multicall failed` 로그가 보이면 → 원인 A (RPC 문제)
- `tokenCount > 0`이고 `multicall failed` 로그 없고 `hasErc20: false`면 → 원인 C 또는 미지 원인

### Phase 3: 원인별 수정

| 확정 원인 | 수정 방안 |
|-----------|----------|
| A. multicall 실패 | multicall 실패 시 개별 eth_call fallback 추가. 단일 호출 실패는 warn 로그 후 skip |
| B. tokenRegistryService null | daemon.ts → createApp() DI 경로 추적, wallet route 의존성 주입 확인 및 수정 |
| C. adapter 인스턴스 불일치 | AdapterPool 캐시 키 검증, setAllowedTokens 호출 시점과 getAssets 호출 시점의 인스턴스 동일성 확인 |

## 테스트 항목

- [ ] Phase 1 로깅 추가 후 데몬 재시작 → `/v1/wallet/assets` 호출 시 debug 로그 출력 확인
- [ ] 근본원인 확정 후: Sepolia USDC 40개 보유 상태에서 `GET /v1/wallet/assets?network=ethereum-sepolia` → USDC 표시 확인
- [ ] multicall 실패 시 warn 로그 출력 확인 (silent failure 해소)
- [ ] 빈 토큰 목록(tokenRegistryService null) 시 적절한 경고 로그 출력 확인
- [ ] EVM mainnet 토큰 잔액 조회 정상 동작 회귀 테스트
- [ ] Solana SPL 토큰 조회에 영향 없음 확인
