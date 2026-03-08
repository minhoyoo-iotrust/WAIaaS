# Project Research Summary

**Project:** WAIaaS v31.4 Hyperliquid Ecosystem Integration
**Domain:** DeFi DEX (Perp/Spot) + Off-chain Order Signing + Sub-accounts on HyperEVM
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

Hyperliquid 생태계 통합은 두 가지 독립적인 작업으로 구성된다. 첫째, HyperEVM (Chain ID 999/998)은 표준 EVM 체인이므로 viem 빌트인 chain export(`hyperEvm`, `hyperliquidEvmTestnet`)를 `EVM_CHAIN_MAP`에 추가하는 것만으로 기존 EVM 기능이 즉시 동작한다. 둘째, Hyperliquid L1 DEX는 온체인 트랜잭션이 아닌 EIP-712 서명 + REST API 호출 방식이므로, 기존 6-stage 파이프라인과 근본적으로 다른 실행 경로가 필요하다. 이 두 번째 부분이 이 마일스톤의 핵심 아키텍처 도전이다.

권장 접근법은 외부 SDK 없이 자체 `HyperliquidExchangeClient`를 구현하는 것이다. Hyperliquid REST API는 단 2개 엔드포인트(Exchange POST, Info POST)로 단순하며, 기존 DcentSwapApiClient/ZeroExSwapClient 패턴과 동일한 구조다. 유일한 신규 의존성은 `@msgpack/msgpack`(phantom agent 서명용)이며, EIP-712 서명은 viem 내장, WebSocket은 Node 22 내장을 활용한다. 파이프라인 통합은 새로운 discriminatedUnion 타입을 추가하지 않고, `ApiDirectResult` 패턴으로 Stage 5에서 분기하여 API 직접 실행 경로를 만드는 것이 최선이다.

핵심 리스크는 세 가지다: (1) L1 Action(phantom agent, chainId 1337)과 User-Signed Action(HyperliquidSignTransaction, chainId 42161/421614) 두 가지 서명 스키마 혼동, (2) msgpack 필드 순서가 해시에 영향을 주므로 공식 Python SDK 테스트 벡터로 검증 필수, (3) Sub-account가 private key 없이 master 서명으로 동작하므로 정책 엔진의 지출 한도 우회 가능성. 이 세 가지 모두 Phase 2 설계 문서에서 명확히 정의하고 Phase 3에서 테스트 벡터 기반 검증으로 예방해야 한다.

## Key Findings

### Recommended Stack

신규 의존성은 `@msgpack/msgpack` 1개뿐이다. viem 2.21.0+에 `hyperEvm`과 `hyperliquidEvmTestnet` chain export가 빌트인되어 있어 `defineChain` 없이 바로 사용 가능하다. 외부 Hyperliquid SDK는 모두 부적합하다: `hyperliquid`(nomeida)는 ethers.js 의존성, `@nktkas/hyperliquid`는 0.x 불안정 + valibot 추가 의존성, 공식 TS SDK는 부재.

**Core technologies:**
- `viem hyperEvm/hyperliquidEvmTestnet` -- HyperEVM 체인 정의, viem 빌트인으로 추가 설치 불필요
- `@msgpack/msgpack ^3.0.0` -- L1 action phantom agent 서명의 msgpack 직렬화에 필수. 0 dependencies, TypeScript 지원
- `viem signTypedData + keccak256` -- EIP-712 서명과 해시 계산, 기존 인프라 재활용
- `Node 22 native WebSocket` -- 실시간 구독(향후), 추가 라이브러리 불필요

### Expected Features

**Must have (table stakes):**
- Perp Trading: Market/Limit/Stop-Loss/Take-Profit 주문, 포지션/마진/마켓 조회, 레버리지 설정, 주문 취소/상태 조회
- Spot Trading: Market/Limit 주문, Spot 잔액 조회, Spot-Perp 잔액 이동
- Account State: 통합 잔액 조회, 오픈 주문 조회, 거래 이력 조회
- HyperEVM Chain: Mainnet/Testnet 체인 등록 (기존 EVM 기능 자동 호환)

**Should have (differentiators):**
- TWAP 주문 -- 대량 주문 분할 실행, AI 에이전트에 유용
- Sub-account 관리 -- 전략별 자금 격리, AI 에이전트 격리
- Dead Man's Switch -- 연결 끊김 시 자동 주문 취소 안전장치
- 주문 수정 (Modify) -- 취소/재주문 없이 원자적 수정

**Defer (v2+):**
- WebSocket 실시간 구독 -- REST polling으로 충분, 복잡도 급증
- Vault 운용 -- WAIaaS 개별 월렛 모델과 불일치
- Portfolio Margin -- Pre-alpha 상태, 불안정
- Staking/Delegation -- 별도 도메인
- HyperEVM 스마트 컨트랙트 DEX 연동 -- 범위 초과

### Architecture Approach

핵심 설계 결정은 `ApiDirectResult` 패턴 도입이다. 새로운 discriminatedUnion 타입을 추가하면 수백 개 파일에 영향이 가므로, 대신 `IActionProvider.resolve()`가 `ContractCallRequest` 대신 `ApiDirectResult`를 반환할 수 있게 확장한다. Stage 1-4(Validate/Auth/Policy/Delay)는 그대로 실행하되, Stage 5에서 `ApiDirectResult` 여부를 확인하여 온체인 실행 대신 API 응답을 DB에 기록한다. Provider는 `requiresSigningKey: true`를 선언하여 Stage 4 이후 복호화된 private key를 받아 EIP-712 서명 + API 제출을 원자적으로 수행한다.

**Major components:**
1. `HyperliquidExchangeClient` -- Exchange/Info REST API 래퍼, 가중치 기반 rate limiting (1200 weight/min)
2. `HyperliquidSigner` -- L1 Action phantom agent 서명 + User-Signed Action 서명 (두 스키마 명확 분리)
3. `HyperliquidPerpProvider` -- IPerpProvider 구현 (open/close/modify/leverage/cancel, riskLevel/defaultTier 선언)
4. `HyperliquidSpotProvider` -- IActionProvider 구현 (spot buy/sell/cancel, asset index 10000+ 규칙)
5. `HyperliquidMarketData` -- Info API 기반 마켓/포지션/주문/펀딩레이트 조회
6. `HyperliquidSubAccountService` -- Sub-account CRUD + 내부 이체, vaultAddress 전파

### Critical Pitfalls

1. **두 가지 서명 스키마 혼동** -- `HyperliquidSigner`에 `signL1Action()`과 `signUserSignedAction()` 두 메서드를 명확히 분리. Python SDK `signing_test.py` 테스트 벡터로 바이트 단위 검증
2. **API 거래를 6-stage 파이프라인에 강제 삽입** -- `ApiDirectResult` 패턴으로 Stage 5에서 분기. 새 discriminatedUnion 타입 추가 금지. `if (isHyperliquid)` 분기가 stage 내부에 나타나면 설계 오류
3. **Nonce 밀리초 타임스탬프 충돌** -- `Date.now()` + monotonic counter로 burst 시 충돌 방지. 100개 최고 nonce 윈도우 인지. Sub-account별 별도 API wallet 사용
4. **Sub-account 보안: 정책 우회 가능** -- Sub-account 간 이체를 정책 엔진에서 별도 스코프로 평가. Default-deny. 감사 로그에 `HYPERLIQUID_SUBACCOUNT_TRANSFER` 이벤트 기록
5. **msgpack 필드 순서 민감성** -- 정규 필드 순서 배열 정의 후 순회하며 객체 생성. trailing zeros 제거, 주소 소문자화 필수. Python SDK 참조 구현과 바이트 단위 비교

## Implications for Roadmap

### Phase 1: HyperEVM 체인 등록
**Rationale:** 독립적이고 복잡도 최소. `EVM_CHAIN_MAP` + `NETWORK_TYPES` 추가만으로 완료. 나머지 Phase의 네트워크 전제 조건
**Delivers:** HyperEVM Mainnet(999)/Testnet(998) 체인 지원, 네이티브 토큰 HYPE, 기존 EVM 기능(전송, 토큰, 컨트랙트) 즉시 활용
**Addresses:** HyperEVM Chain table stakes (체인 등록, 기존 EVM 기능 호환)
**Avoids:** Pitfall 9 (testnet/mainnet 엔드포인트 혼동) -- 네트워크별 API endpoint 설정 분리, Pitfall 13 (HyperEVM RPC vs L1 API rate limit 혼동) -- 별도 rate limiter 구조

### Phase 2: 설계 문서 (Hyperliquid DEX 아키텍처 확정)
**Rationale:** Pitfall 1(서명 스키마), 2(파이프라인 통합), 4(Sub-account 보안), 8(정책 엔진)이 모두 설계 단계에서 해결해야 할 아키텍처 결정. 구현 전 반드시 확정 필요
**Delivers:** ApiDirectResult 인터페이스 정의, 파이프라인 Stage 5 분기 설계, EIP-712 두 서명 스키마 상세, Sub-account-to-wallet 매핑 모델, 정책 엔진 적용 규칙 (margin vs notional), DB v51-52 스키마, API wallet 라이프사이클 전략
**Uses:** STACK.md의 EIP-712 서명 구성(L1 domain chainId 1337, user-signed domain chainId 42161/421614)
**Implements:** IActionProvider.resolve() 반환 타입 확장 설계, HyperliquidSigner 두 스키마 분리 설계, requiresSigningKey 패턴 설계

### Phase 3: Core Infrastructure + Perp Trading
**Rationale:** 모든 공유 인프라(ExchangeClient, Signer, MarketData, ApiDirectResult)와 핵심 MVP(Perp)를 함께 구현. Spot/Sub-account의 전제 조건. 분할 불가 -- 인프라만으로는 의미 있는 테스트 불가능
**Delivers:** HyperliquidExchangeClient(rate limiter 포함), HyperliquidSigner(phantom agent + user-signed), HyperliquidMarketData, ApiDirectResult 인터페이스 + ActionProviderRegistry 업데이트 + Stage 5 분기, DB v51(hyperliquid_orders), HyperliquidPerpProvider(Market/Limit/SL/TP/cancel/modify/leverage), MCP 도구 + SDK 메서드 자동 생성, Admin Settings 7개
**Addresses:** Perp Trading table stakes 전체, Account State table stakes
**Avoids:** Pitfall 1(서명 스키마 분리), Pitfall 3(HyperliquidNonceManager), Pitfall 5(가중치 기반 rate limiter), Pitfall 10(msgpack 필드 순서 -- 정규 배열 + 테스트 벡터)

### Phase 4: Spot Trading
**Rationale:** Phase 3의 ExchangeClient/Signer/orders 테이블 재활용. Perp와 코드 공유 높음 (같은 `action: "order"` 구조, asset index만 다름). Phase 5와 병렬 가능
**Delivers:** HyperliquidSpotProvider(Market/Limit buy/sell, cancel), Spot 잔액 조회(spotClearinghouseState), Spot-Perp 잔액 이동(usdClassTransfer), Spot 마켓 정보(spotMeta), MCP 도구 + SDK 메서드
**Addresses:** Spot Trading table stakes 전체

### Phase 5: Sub-account 관리
**Rationale:** Phase 3에 의존하나 Phase 4와 병렬 가능. Sub-account 보안 설계(Phase 2)가 전제. 독립적인 DB 마이그레이션(v52)
**Delivers:** DB v52(hyperliquid_sub_accounts), HyperliquidSubAccountService(create/list/transfer), vaultAddress 전파(Signer/ExchangeClient), Sub-account별 포지션/잔액 조회, per-sub-account API wallet 생성(nonce 충돌 방지), MCP 도구 + SDK 메서드
**Addresses:** Sub-account differentiators 전체
**Avoids:** Pitfall 4(Sub-account 보안 -- 정책 스코프 분리, default-deny 이체), Pitfall 3(Sub-account별 nonce 분리 -- 별도 API wallet)

### Phase 6: Admin UI + 통합 완성
**Rationale:** Phase 3-5 완료 후 운영 가시성 및 DX 마무리. AI 에이전트 API는 이미 Phase 3-5에서 완성
**Delivers:** Admin UI Hyperliquid 포지션/주문 대시보드, Sub-account 관리 뷰, Skill files 업데이트(transactions.skill.md, admin.skill.md), connect-info `hyperliquid` capability

### Phase Ordering Rationale

- Phase 1은 독립적이며 나머지 Phase의 네트워크 전제 조건. 빌트인 프리셋(v28.8 패턴) 추가만으로 완료
- Phase 2는 Pitfall 1, 2, 4, 8의 아키텍처 결정을 구현 전에 확정하기 위해 반드시 Phase 3 전에 수행. ApiDirectResult는 WAIaaS에 신규 패턴이므로 설계 문서 필수
- Phase 3이 가장 크지만 분할 불가 -- ExchangeClient/Signer/MarketData/ApiDirectResult가 모두 PerpProvider와 결합되어야 end-to-end 테스트 가능
- Phase 4와 5는 Phase 3의 공유 인프라에만 의존하므로 병렬 가능. Spot은 Perp와 코드 공유가 높고, Sub-account는 별도 DB 스키마
- Phase 6은 모든 기능이 완료된 후 UI/DX 통합. AI 에이전트 우선 설계 원칙 준수

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (설계):** ApiDirectResult 패턴의 기존 파이프라인 영향 범위 분석 필요. `ActionProviderRegistry.resolveAction()` 호출 경로와 `stages.ts` Stage 5 정확한 분기 지점 코드 리딩 필수
- **Phase 3 (Perp):** phantom agent msgpack 직렬화의 정확한 필드 순서를 Python SDK `signing.py`에서 추출 필요. 테스트넷에서 실제 서명 검증 필수 (`api.hyperliquid-testnet.xyz`)
- **Phase 5 (Sub-account):** Sub-account 생성의 거래량 요건($100K)이 testnet에도 적용되는지 확인 필요. Account Abstraction 모드별 API 응답 구조 차이 확인

Phases with standard patterns (skip research-phase):
- **Phase 1 (HyperEVM 체인):** viem chain export 확인 완료 (GitHub 소스). EVM_CHAIN_MAP 추가만으로 완료. 기존 v28.8 빌트인 프리셋 패턴 그대로
- **Phase 4 (Spot):** Phase 3의 ExchangeClient 재활용. Spot asset index 규칙(10000+)만 적용. 기존 Perp 주문 코드와 거의 동일 구조
- **Phase 6 (Admin UI):** 기존 Admin UI 패턴 그대로. 신규 아키텍처 결정 불필요

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | viem chain export GitHub 소스 확인, 외부 SDK 3개 비교 분석 완료, 신규 의존성 @msgpack/msgpack 1개만. 기존 인프라 재활용률 높음 |
| Features | HIGH | Hyperliquid 공식 gitbook 전체 API 문서 기반. 모든 Exchange/Info action type 검증. Rate limit 가중치 시스템 상세 문서화 확인 |
| Architecture | MEDIUM | ApiDirectResult 패턴은 WAIaaS에 신규 개념 -- IActionProvider.resolve() 반환 타입 확장과 Stage 5 분기가 기존 코드베이스에 미치는 영향 범위 검증 필요 |
| Pitfalls | HIGH | 공식 서명 문서, Python SDK signing.py/signing_test.py, Chainstack/Turnkey 서드파티 구현 사례에서 교차 검증. 14개 pitfall 도출 |

**Overall confidence:** HIGH

### Gaps to Address

- **ApiDirectResult 파이프라인 통합 상세:** `ActionProviderRegistry`와 `stages.ts`의 정확한 분기 지점은 Phase 2 설계 시 코드 리딩으로 확정. 특히 `requiresSigningKey` 패턴이 기존 key decryption 흐름과 어떻게 결합되는지 상세 설계 필요
- **Python SDK 테스트 벡터 추출:** phantom agent 서명의 정확한 입출력 매핑(action -> msgpack bytes -> keccak256 -> connectionId -> EIP-712 signature)은 Phase 3 구현 시 `signing_test.py`에서 직접 포팅. 구현 전 테스트 벡터 확보 우선
- **Sub-account 생성 요건:** testnet에서의 $100K 거래량 요건 적용 여부 -- Phase 5 착수 전 testnet 실제 호출로 확인
- **Account Abstraction 모드별 API 응답 차이:** Unified 모드에서 spotClearinghouseState 응답 구조가 Standard 모드와 다른지 -- Phase 4 설계 시 확인
- **정책 엔진 적용 기준:** SPENDING_LIMIT가 margin 금액에 적용되는지 notional value(size * price)에 적용되는지 -- Phase 2 설계에서 결정. 레버리지 거래는 margin 기준 권장 (실제 위험 노출 금액)
- **WebSocket 도입 시점:** 초기 구현은 REST polling으로 충분하나, 주문 상태 동기화 지연이 UX 문제가 될 경우 Phase 3 내에서 선택적 도입 검토. 1000 구독 제한과 30 connections/min 제한 인지

## Sources

### Primary (HIGH confidence)
- [Hyperliquid Exchange Endpoint Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) -- 전체 action type, 서명 요구사항
- [Hyperliquid Info Endpoint Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) -- 조회 API 전체
- [Hyperliquid Signing Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing) -- 두 서명 스키마, 필드 순서 주의사항
- [Hyperliquid Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits) -- 가중치 기반 rate limit 상세
- [Hyperliquid Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) -- Nonce 형식(ms timestamp), 100개 윈도우, API wallet 제한
- [Hyperliquid Python SDK signing.py](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/utils/signing.py) -- 공식 참조 구현
- [Hyperliquid Python SDK signing_test.py](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/tests/signing_test.py) -- 서명 테스트 벡터
- [viem chains index.ts](https://github.com/wevm/viem/blob/main/src/chains/index.ts) -- hyperEvm, hyperliquidEvmTestnet export 확인
- WAIaaS codebase: `packages/actions/src/providers/drift/` -- IPerpProvider 패턴 (Hyperliquid Perp 참조 구조)
- WAIaaS codebase: `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider.resolve() 계약
- WAIaaS codebase: `packages/daemon/src/pipeline/stages.ts` -- 6-stage pipeline, Stage 5 분기 대상

### Secondary (MEDIUM confidence)
- [Chainstack Hyperliquid Auth Guide](https://docs.chainstack.com/docs/hyperliquid-authentication-guide) -- EIP-712 domain 파라미터 교차 확인
- [Turnkey x Hyperliquid EIP-712](https://www.turnkey.com/blog/hyperliquid-secure-eip-712-signing) -- 서드파티 EIP-712 구현 사례, domain 파라미터 확인
- [DeepWiki nomeida/hyperliquid Auth](https://deepwiki.com/nomeida/hyperliquid/6.1-authentication-and-signing) -- phantom agent 구조 분석
- [Chainstack: Hyperliquid Sub-accounts](https://docs.chainstack.com/reference/hyperliquid-info-subaccounts) -- Sub-account API 참조

### Tertiary (LOW confidence)
- [@nktkas/hyperliquid npm](https://www.npmjs.com/package/@nktkas/hyperliquid) -- 커뮤니티 SDK 비교 참고 (0.x 불안정)
- [hyperliquid npm (nomeida)](https://www.npmjs.com/package/hyperliquid) -- 커뮤니티 SDK 비교 참고 (ethers.js 의존성)

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
