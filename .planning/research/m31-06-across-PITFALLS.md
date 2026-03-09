# Domain Pitfalls: Across Protocol Bridge

**Domain:** DeFi Cross-Chain Bridge (Intent-based)
**Researched:** 2026-03-08

## Critical Pitfalls

### Pitfall 1: Quote Staleness -- outputAmount 불일치

**What goes wrong:** /suggested-fees 응답의 수수료(totalRelayFee)를 기반으로 outputAmount를 계산하지만, depositV3 호출 시점에 on-chain 상태가 변경되어 relayer가 fill하지 않음.
**Why it happens:** Across 공식 문서: "The onchain state is subject to change each block, and cached data can quickly become invalid." LP fee는 utilization 기반이므로 pool 이용률에 따라 실시간 변동.
**Consequences:** deposit은 성공하지만 fill이 안 됨 -> fillDeadline 만료 -> 자금이 SpokePool에 잠김 (환불 프로세스 필요).
**Prevention:**
1. /suggested-fees 응답을 절대 캐시하지 않음
2. quote -> execute 사이 시간 최소화 (사용자에게 견적 유효 시간 표시)
3. fillDeadline을 충분히 길게 설정 (기본 6시간)
4. quoteTimestamp를 /suggested-fees에서 받은 값 그대로 사용
**Detection:** bridge_status가 PENDING에서 오래 머무름 (정상은 2-10초 내 filled)

### Pitfall 2: Native Token Bridge의 WETH 주소 혼동

**What goes wrong:** ETH 브릿지 시 inputToken에 ETH address (0xEee...Eee)나 zero address를 넣으면 SpokePool이 거부.
**Why it happens:** depositV3는 payable이므로 msg.value로 ETH를 보내지만, inputToken 파라미터에는 해당 체인의 WETH 주소를 넣어야 함. Across 문서: "in the case of bridging ETH this should be set to a WETH address."
**Consequences:** 트랜잭션 revert.
**Prevention:**
1. 체인별 WETH 주소 매핑 테이블 유지
2. isNativeToken 감지 시 자동으로 WETH 주소 치환
3. inputToken + msg.value 조합 검증 로직
**Detection:** Stage 5 Execute에서 revert 에러

### Pitfall 3: Bridge Enrollment 누락

**What goes wrong:** depositV3 실행 성공 후 bridge_status='PENDING' 등록을 잊으면 AsyncPollingService가 추적하지 않음. 사용자는 브릿지 상태를 확인할 수 없음.
**Why it happens:** 현재 LI.FI bridge도 이 enrollment이 명시적으로 없을 가능성 있음 (staking unstake만 enrollment 코드 확인됨). actions.ts post-execution에 프로바이더별 조건 분기 필요.
**Consequences:** 브릿지 실행은 되지만 상태 추적 불가. 사용자가 수동으로 Across Explorer에서 확인해야 함.
**Prevention:**
1. actions.ts에 `provider === 'across_bridge' && action === 'execute'` 조건으로 명시적 enrollment
2. 테스트: execute 후 bridge_status='PENDING' 검증하는 통합 테스트 필수
3. bridge_metadata에 txHash, originChainId, destChainId 포함
**Detection:** execute 후 GET /deposit/status 호출 시 "no tracking" 응답

## Moderate Pitfalls

### Pitfall 4: SpokePool 주소 하드코딩 vs 동적 조회

**What goes wrong:** Across가 SpokePool 프록시 구현을 업그레이드하거나 새 체인에 배포할 때 하드코딩 주소가 오래됨.
**Prevention:**
1. 하드코딩 주소 + /available-routes API fallback 이중 전략
2. 주소 변경 시 Admin Settings 오버라이드 가능하도록 설계
3. Across는 프록시 패턴이므로 주소 자체는 변경 안 됨 -- 구현만 업그레이드

### Pitfall 5: /deposit/status API 지연 (1-15초)

**What goes wrong:** Across 문서: "users should expect an average latency of 1 to 15 seconds after submitting a deposit to see the status changed." 첫 폴링에서 'pending'이 나와도 실제로는 이미 filled일 수 있음.
**Prevention:**
1. 첫 폴링은 deposit 후 최소 15초 대기
2. AcrossBridgeStatusTracker의 pollIntervalMs=15000 (15초)으로 설정하면 자연스럽게 해결
3. 'pending' 상태에서 불필요한 에러 로깅 방지

### Pitfall 6: approve 금액 과다 승인

**What goes wrong:** approve(spokePool, inputAmount)로 정확한 금액만 승인하면 매번 approve TX 필요. approve(spokePool, MAX_UINT256)으로 무제한 승인하면 보안 위험.
**Prevention:**
1. 정확한 inputAmount만 approve (WAIaaS 보안 원칙)
2. 기존 allowance 체크 후 충분하면 approve 스킵 (LI.FI는 이 로직 없음 -- Across에서도 단순하게 매번 approve)
3. CONTRACT_WHITELIST 정책으로 SpokePool 주소 화이트리스트

### Pitfall 7: Testnet Fill 지연

**What goes wrong:** Across testnet (https://testnet.across.to/api)에서 fill이 최대 1분 소요 (mainnet 2초 vs testnet 1분). 테스트 시 타임아웃으로 오판.
**Prevention:**
1. 테스트에서는 mock API 사용 (실제 testnet 호출은 E2E만)
2. testnet 사용 시 pollIntervalMs를 30초 이상으로 조정
3. fillDeadline을 충분히 길게 설정

## Minor Pitfalls

### Pitfall 8: Integrator ID 미등록

**What goes wrong:** Integrator ID 없이 API 호출 시 rate limit가 더 엄격. production에서 많은 요청 시 429 에러.
**Prevention:** Admin Settings에 integrator_id 필드 제공. 문서에 등록 안내 포함.

### Pitfall 9: 크로스체인 정책 평가 기준 모호

**What goes wrong:** SPENDING_LIMIT 정책 평가 시 origin chain 금액 기준인지 destination chain 수령 금액 기준인지 모호.
**Prevention:** origin chain inputAmount 기준으로 정책 평가 (자금이 나가는 체인 기준). LI.FI와 동일한 원칙.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| API Client 구현 | 응답 스키마 drift (Across API 업데이트) | Zod .passthrough() 사용, 필수 필드만 strict 검증 |
| depositV3 calldata | WETH 주소 혼동 (Pitfall 2) | 체인별 WETH 매핑 + native token 자동 치환 |
| Bridge enrollment | enrollment 누락 (Pitfall 3) | 통합 테스트에서 bridge_status='PENDING' 검증 |
| Status tracking | /deposit/status 지연 (Pitfall 5) | 첫 폴링 15초 후 시작 |
| BATCH flow | approve + depositV3 순서 오류 | approve가 BATCH의 첫 번째 요소인지 검증 |
| Native token | msg.value + WETH inputToken 조합 | isNativeToken 헬퍼 + WETH 주소 자동 치환 |

## Sources

- [Across API Reference -- caching warning](https://docs.across.to/reference/api-reference)
- [Across depositV3 -- WETH note](https://docs.across.to/reference/selected-contract-functions)
- [Across Fee Structure -- utilization-based pricing](https://docs.across.to/reference/fees-in-the-system)
- 기존 WAIaaS 코드 분석: actions.ts bridge enrollment 패턴, AsyncPollingService
