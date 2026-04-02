# Feature Landscape: XRP Ledger (Ripple) Chain Integration

**Domain:** 3rd ChainType ('ripple') for AI Agent Wallet-as-a-Service
**Researched:** 2026-04-03
**Confidence:** HIGH (official XRPL documentation + CAIP namespace specs)

## Table Stakes

Features users expect from any XRPL wallet integration. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | IChainAdapter Method | Notes |
|---------|--------------|------------|---------------------|-------|
| XRP native transfer | Core functionality of any XRP wallet | Med | `buildTransaction()` | Amount in drops (1 XRP = 1,000,000 drops, decimals=6). Payment tx type. |
| Destination Tag support | Exchanges require it; omitting loses funds | Low | `buildTransaction()` extension | uint32 (0-4,294,967,295). TransferRequest.memo 와 별도 파라미터 필요. RequireDest 플래그 설정된 계정은 태그 없으면 거부. |
| Balance query (available vs total) | Reserve 시스템 때문에 총 잔액 != 사용가능 잔액 | Med | `getBalance()` | 총 잔액에서 base reserve(1 XRP) + owner reserve(0.2 XRP * owned objects) 차감한 가용 잔액을 별도 표시해야 함. |
| Fee estimation | 트랜잭션 수수료 예측 필수 | Low | `estimateFee()` | 기본 10 drops (~0.00001 XRP). fee escalation 시 동적 증가. `fee` RPC method 활용. |
| Sequence number management | 연속 트랜잭션 전송에 필수 | Low | `getCurrentNonce()` | `account_info`에서 Sequence 조회. EVM nonce와 동일 역할. |
| Transaction simulation (dry-run) | 전송 전 검증 필수 | Low | `simulateTransaction()` | xrpl.js `submit()` with `fail_hard: false` 또는 `autofill()` 로 사전 검증. |
| Transaction finality confirmation | 합의 기반 확정 확인 필수 | Med | `waitForConfirmation()` | validated ledger에 포함되어야 최종 확정. LastLedgerSequence(현재 ledger + 4)로 타임아웃 보장. 3~5초 합의 주기. |
| Trust Line 토큰 전송 (IOU Payment) | XRPL 토큰 = Trust Line IOU, 기본 토큰 전송 | Med | `buildTokenTransfer()` | Payment tx에 currency+issuer+value 지정. 발신자/수신자 모두 해당 Trust Line 필요. |
| Trust Line 설정 (TrustSet) | IOU 수신 전 Trust Line 생성 필수 | Med | `buildApprove()` 매핑 | "토큰 사용 허가" 상위 개념으로 매핑. currency(3자 또는 hex 160-bit), issuer(r-address), limit(최대 수용량) 파라미터. owner reserve 0.2 XRP 소비. |
| Asset listing (XRP + Trust Lines) | 보유 자산 조회 필수 | Med | `getAssets()` | `account_lines` + `account_info`로 네이티브 XRP + Trust Line 잔액 목록. |
| Token info 조회 | Trust Line 토큰 메타데이터 | Low | `getTokenInfo()` | currency code + issuer 조합으로 조회. XRPL 자체에 토큰 이름/심볼 메타데이터 없음 -- 외부 소스(xrpl.org tokens list 또는 레지스트리) 필요. |
| RPC 연결 관리 | WebSocket 기반 XRPL 클라이언트 | Med | `connect()`/`disconnect()`/`isConnected()`/`getHealth()` | xrpl.js Client는 WebSocket 기반. REST(JSON-RPC)도 지원하지만 WS가 표준. |
| Ed25519 키 생성 + r-address | 지갑 생성 기본 기능 | Low | KeyStore 확장 | 기존 Solana Ed25519 경로 재활용. r-address는 Base58Check 인코딩(AccountID 20바이트). |
| CAIP-2/CAIP-19 식별자 | 기존 멀티체인 표준 준수 | Med | CAIP 모듈 확장 | `xrpl:0`(mainnet), `xrpl:1`(testnet), `xrpl:2`(devnet). 네이티브: `xrpl:0/slip44:144`. Trust Line: `xrpl:0/token:{currency}.{issuer}`. |
| Sign-only 외부 트랜잭션 | 기존 인터페이스 호환 | Med | `parseTransaction()`/`signExternalTransaction()` | hex 또는 JSON 직렬화된 XRPL 트랜잭션 파싱 후 서명. |
| DB 마이그레이션 | chain_type CHECK 제약 업데이트 | Low | DB v62 | CHECK 제약에 'ripple' 추가. ENVIRONMENT_NETWORK_MAP 확장. |
| REST/MCP/SDK chain=ripple | 전 인터페이스 호환 | Low | 라우팅 확장 | AdapterPool에 ripple 분기 추가. 기존 엔드포인트에서 chain 파라미터만 확장. |

## Differentiators

Features that set the integration apart. Not expected in MVP, but provide significant value.

| Feature | Value Proposition | Complexity | IChainAdapter Method | Notes |
|---------|-------------------|------------|---------------------|-------|
| XLS-20 NFT 전송 래핑 | 2-step Offer 모델을 단일 API로 추상화 | High | `buildNftTransferTx()`/`transferNft()` | NFTokenCreateOffer(sell) + NFTokenAcceptOffer(buy) 2단계를 단일 호출로. 수신자 Accept 필요 시 pending 상태 반환. NftTransferParams.token.standard에 'XLS-20' 추가. |
| Reserve-aware 잔액 표시 | AI 에이전트가 실제 전송 가능 금액 인지 | Med | `getBalance()` 확장 | BalanceInfo에 reservedBalance/availableBalance 필드 추가 또는 metadata로 전달. base reserve(1 XRP) + owner reserve(0.2 * N objects). |
| X-address 자동 해석 | 사용자가 X-address 입력해도 자동 디코딩 | Low | 주소 유틸리티 | X-address(X로 시작) → r-address + Destination Tag 자동 분리. ripple-address-codec 라이브러리 활용. |
| Partial Payment 방어 | delivered_amount 강제 사용으로 IOU 금액 조작 차단 | Med | 수신 TX 처리 | tfPartialPayment 플래그 감지 시 Amount 대신 반드시 delivered_amount 사용. 수신 모니터링(후속 마일스톤)에서 핵심. |
| Trust Line 가용 한도 표시 | 설정된 limit vs 현재 잔액 대비 추가 수신 가능량 | Low | `getAssets()` 확장 | Trust Line limit - balance = 추가 수신 가능 IOU. AssetInfo.metadata로 전달. |
| Admin UI Trust Line 관리 | Trust Line 설정/해제를 시각적으로 관리 | Med | Admin UI | currency+issuer 검색, limit 설정, NoRipple 플래그 토글. |
| NFT taxon/transferFee 표시 | NFT 메타데이터 정보 제공 | Low | NFT 조회 확장 | taxon(그룹화 태그), transferFee(이차판매 로열티 0-50%). |
| Currency code 듀얼 포맷 | 3자 표준 코드 + hex 160-bit 비표준 코드 모두 처리 | Low | 토큰 파싱 | ISO 4217 3자 코드(USD, EUR) + 40자 hex 비표준 코드. 내부에서 투명하게 처리. |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| XRPL DEX (OfferCreate/OfferCancel) | 범위 초과, 후속 마일스톤 m33-08로 계획됨 | Trust Line 토큰 전송만 지원. DEX는 Action Provider로 분리 구현. |
| XRPL AMM (XLS-30) | 범위 초과, 후속 마일스톤 m33-10으로 계획됨 | AMM LP 토큰은 xls30 CAIP 네임스페이스로 식별만 준비. |
| Payment Channels | 복잡도 대비 AI 에이전트 사용 빈도 극히 낮음 | off-ledger 결제 채널은 x402 등 기존 메커니즘 활용. |
| Escrow 트랜잭션 | 전용 설계 필요한 고급 기능 | 필요 시 후속 마일스톤에서 Action Provider로 추가. |
| Checks (수표) | 사용 빈도 낮은 XRPL 고유 기능 | XRPL 생태계에서도 마이너 기능. |
| Hooks (스마트 컨트랙트) | 메인넷 미적용 상태 | Hooks가 메인넷 활성화되면 buildContractCall 구현 검토. |
| buildContractCall | XRPL에 범용 스마트 컨트랙트 없음 | NOT_SUPPORTED 에러 반환. Hooks 메인넷 이후 재검토. |
| buildBatch | XRPL 네이티브 배치 트랜잭션 미지원 | NOT_SUPPORTED 에러 반환. |
| sweepAll | 선택적 메서드, Trust Line별 개별 전송 필요 | 구현 보류. Trust Line 해제 시 잔액 반환은 수동. |
| approveNft | XRPL NFT에 ERC-721식 approve 개념 없음 | NOT_SUPPORTED 에러 반환. Offer 기반 전송만 지원. |
| 수신 트랜잭션 모니터링 | IChainSubscriber XRPL 구현은 별도 마일스톤 | WebSocket subscribe 기반 구현은 후속 마일스톤에서. |
| RPC Pool 멀티엔드포인트 | WebSocket 기반 XRPL RPC 풀링은 별도 검토 필요 | 단일 엔드포인트로 시작. 후속 마일스톤에서 failover 추가. |
| Rippling/PathFinding 제어 | 복잡한 경로 결제는 AI 에이전트에 불필요 | 직접 Payment만 지원. pathfinding 기반 cross-currency 결제는 DEX 마일스톤에서. |
| Authorized Trust Lines | 발행자 전용 기능, 지갑 사용자 관점에서 불필요 | RequireAuth 발행자의 토큰은 자동으로 작동. |

## Feature Dependencies

```
Ed25519 KeyStore 확장 → r-address 도출 → 지갑 생성
  ↓
connect() WebSocket → account_info() → getBalance() / getCurrentNonce()
  ↓
buildTransaction() (XRP Payment) → simulateTransaction() → signTransaction() → submitTransaction()
  ↓                                                                                    ↓
estimateFee()                                                            waitForConfirmation() (validated ledger)
  
Trust Line 설정 (buildApprove/TrustSet) → IOU Payment (buildTokenTransfer)
  ↓
getAssets() (XRP + Trust Lines 목록)
  ↓
getTokenInfo() (currency+issuer 메타데이터)

NFTokenMint (외부) → NFTokenCreateOffer → NFTokenAcceptOffer → buildNftTransferTx/transferNft
                                          ↑ 2-step 래핑

CAIP-2 네임스페이스 등록 (xrpl:0/1/2) → CAIP-19 자산 식별자 (slip44:144, token:{cur}.{issuer}, xls20:{id})
  ↓
DB 마이그레이션 (CHECK 제약, ENVIRONMENT_NETWORK_MAP)
  ↓
AdapterPool 등록 → REST/MCP/SDK chain=ripple 지원
```

## MVP Recommendation

### Phase 1: Core Infrastructure (우선)
1. **ChainType 'ripple' + NetworkType 3종** -- 모든 후속 기능의 기반
2. **Ed25519 KeyStore + r-address** -- 지갑 생성 필수
3. **RPC 연결 관리 (WebSocket)** -- xrpl.js Client 초기화
4. **DB 마이그레이션** -- CHECK 제약 + ENVIRONMENT_NETWORK_MAP

### Phase 2: 네이티브 전송 + 잔액 (핵심)
5. **XRP 전송 (buildTransaction)** -- drops 단위, Destination Tag 포함
6. **잔액 조회 (getBalance)** -- reserve-aware 가용 잔액
7. **Fee 추정 (estimateFee)** -- fee RPC method
8. **Sequence 관리 (getCurrentNonce)** -- account_info Sequence
9. **트랜잭션 확인 (waitForConfirmation)** -- validated ledger + LastLedgerSequence
10. **시뮬레이션 (simulateTransaction)** -- dry-run 검증

### Phase 3: Trust Line 토큰 (확장)
11. **TrustSet (buildApprove 매핑)** -- Trust Line 설정/해제
12. **IOU Payment (buildTokenTransfer)** -- Trust Line 토큰 전송
13. **자산 목록 (getAssets)** -- XRP + Trust Line 잔액 조합
14. **토큰 정보 (getTokenInfo)** -- currency code 듀얼 포맷 처리

### Phase 4: NFT + 통합 (마무리)
15. **XLS-20 NFT 전송 래핑** -- CreateOffer + AcceptOffer 단일 호출
16. **Sign-only 외부 트랜잭션** -- parseTransaction/signExternalTransaction
17. **CAIP 표준 통합** -- xrpl:0/1/2, slip44:144, token:{}.{}, xls20:{}
18. **REST/MCP/SDK/Admin UI** -- chain=ripple 전 인터페이스 지원

### Defer
- **XRPL DEX**: m33-08로 분리. Action Provider 패턴.
- **XRPL AMM**: m33-10으로 분리. XLS-30 LP 토큰.
- **수신 TX 모니터링**: 별도 마일스톤. WebSocket subscribe 기반.
- **RPC Pool**: 단일 엔드포인트로 시작.

## XRPL-Specific Edge Cases

### 1. Reserve 부족으로 전송 실패
계정에 base reserve + owner reserve 이하 잔액만 남으면 전송 불가. `tecUNFUNDED_PAYMENT` 에러. getBalance()에서 가용 잔액을 정확히 계산하여 사전 방지 필요.

### 2. Trust Line 미설정 상태에서 IOU 수신 시도
수신자가 해당 currency+issuer Trust Line 없으면 `tecPATH_DRY` 에러. buildTokenTransfer()에서 수신자 Trust Line 존재 여부 사전 검증 필요.

### 3. Destination Tag 누락
RequireDest 설정된 계정(거래소)에 태그 없이 전송하면 `tecDST_TAG_NEEDED` 에러. 자금은 보존되지만 사용자 혼란 유발. X-address 자동 해석으로 완화 가능.

### 4. Partial Payment 금액 불일치
tfPartialPayment 플래그 활성화된 Payment에서 Amount != delivered_amount. 수신 처리 시 반드시 delivered_amount 확인. 이 마일스톤에서는 발신 전용이므로 tfPartialPayment 플래그를 **절대 설정하지 않음**.

### 5. Trust Line 잔액과 reserve 상호작용
Trust Line 삭제(limit=0 설정)는 잔액이 0일 때만 가능. 잔액 > 0이면 Trust Line 유지되며 owner reserve 반환 불가.

### 6. NFT Offer 2-step 비동기성
NFTokenCreateOffer는 즉시 반영되지만, 상대방의 Accept는 비동기. 자동 래핑 시 both sides가 같은 에이전트 제어하에 있어야 단일 호출 가능. 외부 수신자의 Accept는 pending 상태로 반환.

### 7. Currency Code 3자 vs 160-bit hex
"USD" 같은 3자 코드는 내부적으로 160-bit(0x00 prefix + 88-bit zero + 24-bit ASCII)로 인코딩. 비표준 코드는 0x00 이외 prefix. 양방향 변환 유틸리티 필요.

### 8. LastLedgerSequence 타임아웃
XRPL 권장: LastLedgerSequence = 현재 validated ledger + 4. 트랜잭션이 이 ledger까지 포함되지 않으면 영구 실패 확정. waitForConfirmation()에서 이 메커니즘 활용.

## Sources

- [XRPL Reserves](https://xrpl.org/docs/concepts/accounts/reserves) -- reserve 시스템 (1 XRP base, 0.2 XRP owner)
- [Lower Reserves Dec 2024](https://xrpl.org/blog/2024/lower-reserves-are-in-effect) -- 현재 reserve 값 확인
- [TrustSet Transaction](https://xrpl.org/docs/references/protocol/transactions/types/trustset) -- Trust Line 설정 메커니즘
- [Trust Line Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens) -- IOU 토큰 모델
- [Non-Fungible Tokens](https://xrpl.org/docs/concepts/tokens/nfts) -- XLS-20 NFT 개요
- [NFTokenMint](https://xrpl.org/docs/references/protocol/transactions/types/nftokenmint) -- NFT 민팅
- [NFTokenCreateOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokencreateoffer) -- NFT Offer 생성
- [NFTokenAcceptOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokenacceptoffer) -- NFT Offer 수락
- [NFT Reserve Requirements](https://xrpl.org/docs/concepts/tokens/nfts/reserve-requirements) -- NFT당 ~0.083 XRP reserve
- [Transaction Cost](https://xrpl.org/docs/concepts/transactions/transaction-cost) -- 수수료 모델 (10 drops 기본)
- [Reliable Transaction Submission](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission) -- LastLedgerSequence 패턴
- [Finality of Results](https://xrpl.org/docs/concepts/transactions/finality-of-results) -- validated ledger 확정
- [Partial Payments](https://xrpl.org/docs/concepts/payment-types/partial-payments) -- delivered_amount 보안
- [Source and Destination Tags](https://xrpl.org/docs/concepts/transactions/source-and-destination-tags) -- Destination Tag uint32
- [Addresses](https://xrpl.org/docs/concepts/accounts/addresses) -- r-address + X-address
- [Currency Formats](https://xrpl.org/docs/references/protocol/data-types/currency-formats) -- drops, 3-char vs hex currency codes
- [Rippling](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling) -- NoRipple 플래그
- [AccountDelete](https://xrpl.org/docs/references/protocol/transactions/types/accountdelete) -- 계정 삭제 + reserve 복구
- [CAIP-2 XRPL Namespace](https://namespaces.chainagnostic.org/xrpl/caip2) -- xrpl:0/1/2
- [CAIP-19 XRPL Assets](https://namespaces.chainagnostic.org/xrpl/caip19) -- slip44:144, token:{}.{}, xls20:{}
- [xrpl npm package](https://www.npmjs.com/package/xrpl) -- v4.6.0, TypeScript SDK
- [xrpl.js Supply Chain Advisory](https://xrpl.org/blog/2025/vulnerabilitydisclosurereport-bug-apr2025) -- v4.2.1-4.2.4 compromised, v4.6.0 safe
