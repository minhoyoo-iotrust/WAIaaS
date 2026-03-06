# 설계 문서 77: DCent Swap Aggregator 통합

> WAIaaS v31.3 — DCent Swap Backend API를 WAIaaS에 통합하여 다중 프로바이더 스왑(동일체인 DEX + 크로스체인 Exchange)을 지원한다.

---

## 1. API 엔드포인트 분석

DCent Swap Backend API는 2개 인스턴스로 운영된다:

- **`https://agent-swap.dcentwallet.com`** — AI 에이전트 전용 (DEX 프로바이더만 포함, Exchange 없음)
- **`https://swapbuy-beta.dcentwallet.com`** — 풀 기능 (DEX + Exchange 프로바이더 모두 포함)

> **설계 결정 DS-01**: WAIaaS는 `swapbuy-beta.dcentwallet.com`을 기본 엔드포인트로 사용한다. Exchange(크로스체인) 기능이 필수이며, `agent-swap` 인스턴스에는 Exchange 프로바이더가 없다. Admin Settings에서 URL 변경 가능.

### 1.1 GET /api/swap/v3/get_supported_currencies

**용도**: 지원 통화(체인) 목록 조회

**응답 구조** (배열):
```json
[
  {
    "currencyId": "ETHEREUM",          // DCent Currency ID
    "tokenDeviceId": "ERC20",          // 토큰 디바이스 유형
    "currencyName": "Ethereum",        // 표시 이름
    "contractTokenSupport": "all",     // "all" = 해당 체인의 모든 컨트랙트 토큰 지원
    "providers": [                     // 이 체인에서 사용 가능한 프로바이더 목록
      "oneinch_classic",
      "butter_swap",
      "sushi_swap",
      "rubic_swap",
      "lifi_swap",
      "uniswap_swap"
    ],
    "providerTickers": {},             // 프로바이더별 티커 매핑 (대부분 비어있음)
    "contractTokens": [],              // 개별 토큰 목록 (contractTokenSupport="all"이면 비어있음)
    "cgkId": "ethereum"               // CoinGecko ID
  }
]
```

**agent-swap 인스턴스**: 32개 체인 (DEX 프로바이더만: oneinch, butter, sushi, rubic, lifi, uniswap, swap_scanner)
**beta 인스턴스**: 59개 체인 (DEX + Exchange: changelly, changenow, exolix 추가)

**주요 Currency ID 패턴**:
| 패턴 | 예시 | 설명 |
|------|------|------|
| 네이티브 이름 | `ETHEREUM`, `BSC`, `POLYGON`, `KLAYTN`, `SOLANA`, `XINFIN` | 주요 체인 네이티브 토큰 |
| `CHAN:{chainId}` | `CHAN:10` (Optimism), `CHAN:8453` (Base), `CHAN:42161` (Arbitrum) | EVM 체인 네이티브 토큰 |
| `ERC20/0x...` | `ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | Ethereum ERC-20 토큰 |
| `{DEVICE}/0x...` | `BEP20/0x...`, `POLYGON-ERC20/0x...` | 체인별 토큰 (tokenDeviceId 접두어) |
| `CH20:{chainId}/0x...` | `CH20:10/0x...`, `CH20:8453/0x...` | CHAN 체인의 토큰 |
| `SPL-TOKEN/{mint}` | `SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Solana SPL 토큰 |

### 1.2 GET /api/swap/v3/is_supported_by_currency_id

**용도**: 특정 Currency ID 지원 여부 확인

**요청**: `?currencyId=ETHEREUM`

**응답**: 빈 객체 `{}` (지원 여부와 무관하게 항상 빈 객체 반환 — 현재 유용하지 않음)

> **참고**: 이 엔드포인트는 실질적 정보를 반환하지 않으므로 WAIaaS에서는 `get_supported_currencies` 캐시 기반으로 지원 여부를 판단한다.

### 1.3 POST /api/swap/v3/get_quotes

**용도**: 스왑 견적 조회 (프로바이더별 비교)

**요청 파라미터** (body):
```json
{
  "fromId": "ETHEREUM",                                          // DCent Currency ID (필수)
  "toId": "ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",  // DCent Currency ID (필수)
  "amount": "1000000000000000000",                               // from 토큰 최소 단위 (필수)
  "fromDecimals": 18,                                            // from 토큰 소수점 (필수)
  "toDecimals": 6                                                // to 토큰 소수점 (필수)
}
```

**응답 구조**:
```json
{
  "status": "success",                  // "success" | "fail_no_available_provider"
  "fromId": "ETHEREUM",
  "toId": "ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "providers": {
    "bestOrder": ["sushi_swap", "uniswap_swap", "butter_swap"],  // 최적 순서 (expectedAmount 내림차순)
    "common": [
      {
        "id": "sushi_swap",
        "status": "success",            // "success" | "fail_*" (아래 에러 패턴 참조)
        "providerId": "sushi_swap",
        "providerType": "swap",         // "swap" | "cross_swap" | "exchange"
        "name": "Sushi",
        "iconUrl": "https://info-repo.dcentwallet.com/swap-exchange/images/sushi.png",
        "fromAmount": "1000000000000000000",
        "quoteType": "flexible",        // "flexible" | "fixed"
        "providerFee": {
          "depositFee": "50000000000000"  // 프로바이더 수수료 (from 토큰 최소 단위)
        },
        "expectedAmount": "2049257221",   // 예상 수신량 (to 토큰 최소 단위)
        "networkFee": {
          "gas": "212841"                 // 가스 추정량
        },
        "spenderContractAddress": "0xAC4c6e212A361c968F1725b4d055b47E63F80b75"
      },
      {
        "id": "changelly_exchange_flexible",
        "status": "success",
        "providerId": "changelly_exchange_flexible",
        "providerType": "exchange",       // Exchange 프로바이더
        "name": "Changelly",
        "quoteType": "flexible",
        "expectedAmount": "23552793560",
        // Exchange 프로바이더에는 spenderContractAddress 없음
      },
      {
        "id": "rubic_swap",
        "providerType": "cross_swap",      // 크로스체인 DEX
        "fixedRate": {                     // 고정 환율 견적 (cross_swap/exchange_fixed에만)
          "id": "70be53ac-7ca3-4c9e-...",
          "validUntil": 1772802802778      // Unix ms 타임스탬프
        }
      }
    ]
  }
}
```

**프로바이더별 status 에러 패턴**:
| status | 의미 |
|--------|------|
| `success` | 견적 조회 성공 |
| `fail_empty_providers` | 프로바이더 없음 |
| `fail_no_available_provider` | 전체 응답 레벨 — 모든 프로바이더 실패 |
| `fail_chain_not_supported` | 해당 프로바이더가 체인 미지원 |
| `fail_token_not_supported` | 해당 프로바이더가 토큰 미지원 |
| `fail_internal_error` | 프로바이더 내부 오류 |
| `fail_smaller_than_min` | 최소 금액 미달 |

### 1.4 POST /api/swap/v3/get_dex_swap_transaction_data

**용도**: DEX 스왑 트랜잭션 데이터 조회 (`providerType: "swap"` 또는 `"cross_swap"` 전용)

**요청 파라미터** (body):
```json
{
  "fromId": "ETHEREUM",
  "toId": "ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "fromAmount": "1000000000000000000",
  "fromDecimals": 18,
  "toDecimals": 6,
  "fromWalletAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "toWalletAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "providerId": "sushi_swap",
  "isAutoSlippage": true,
  "slippage": 1                          // 슬리피지 % (1 = 1%)
}
```

**응답 구조**:
```json
{
  "status": "success",
  "txdata": {
    "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "to": "0xac4c6e212a361c968f1725b4d055b47e63f80b75",    // 라우터 컨트랙트 주소
    "data": "0x5f3bd1c8...",                                  // calldata (hex)
    "value": "2037326351"                                     // native value (wei, 10진수 문자열)
  },
  "networkFee": {
    "gas": "275841",
    "gasPrice": "121236406"
  }
}
```

> **주의**: `value` 필드가 10진수 문자열로 반환된다. `txdata.to`는 DEX 라우터 컨트랙트 주소이며, `spenderContractAddress`와 동일하다.

### 1.5 POST /api/swap/v3/get_evm_dex_approve_calldata

**용도**: ERC-20 토큰 approve calldata 조회 (ERC-20 sell 시 필요)

**요청 파라미터** (body):
```json
{
  "currencyId": "ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "amount": "1000000",
  "currencyDecimals": 6,
  "providerId": "sushi_swap"
}
```

**응답 구조**:
- 성공 시: approve calldata 반환 (추정 — sushi_swap에서 `"approveProviderTransaction not implemented"` 에러 발생)
- 에러: `{"status":"fail","error":"approveProviderTransaction not implemented"}`

> **설계 결정 DS-02**: sushi_swap 등 일부 프로바이더는 approve calldata API를 미구현한다. WAIaaS에서는 ERC-20 approve를 자체 인코딩한다 (`encodeApproveCalldata`). `spenderContractAddress`를 spender로 사용하여 `approve(spender, amount)` calldata를 직접 생성한다. 기존 0x 프로바이더 패턴(`encodeApproveCalldata`)을 재사용한다.

### 1.6 POST /api/swap/v3/create_exchange_transaction

**용도**: Exchange 트랜잭션 생성 (`providerType: "exchange"` 전용)

**요청 파라미터** (body):
```json
{
  "fromId": "ETHEREUM",
  "toId": "SOLANA",
  "fromAmount": "1000000000000000000",
  "fromDecimals": 18,
  "toDecimals": 9,
  "fromWalletAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "toWalletAddress": "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
  "providerId": "changelly_exchange_flexible"
}
```

**응답 구조**:
```json
{
  "status": "success",
  "transactionId": "95jr30stfzpf0tr1",
  "transactionStatusUrl": "https://changelly.com/track/95jr30stfzpf0tr1",
  "payInAddress": "0xbff7d6ba1201304af302f12265cfa435539d5502",
  "fromAmount": "1000000000000000000",
  "toAmount": "23543037760"
}
```

**핵심 필드**:
- `payInAddress` — 이 주소로 자금을 전송하면 Exchange 프로세스가 시작됨
- `transactionId` — 상태 추적용 ID
- `transactionStatusUrl` — 프로바이더 트래킹 URL

> **주의**: Exchange는 `providerType: "exchange"` 프로바이더에서만 지원된다. `cross_swap`/`swap` 프로바이더에서는 빈 응답 반환.

### 1.7 POST /api/swap/v3/get_transactions_status

**용도**: Exchange 트랜잭션 상태 추적

**요청 파라미터** (body — 배열):
```json
[
  {
    "txId": "95jr30stfzpf0tr1",      // create_exchange_transaction의 transactionId
    "providerId": "changelly_exchange_flexible"
  }
]
```

**응답 구조** (배열):
```json
[
  {
    "providerId": "changelly_exchange_flexible",
    "contactEmail": ["contact@iotrust.kr"],
    "status": "waiting",               // 상태 값
    "txId": "95jr30stfzpf0tr1",
    "payInAddress": "0xbff7...",
    "payOutAddress": "7EcDh...",
    "fromAmount": "1.0",
    "toAmount": "23.54"
  }
]
```

**상태 값**:
| status | 의미 |
|--------|------|
| `waiting` | 입금 대기 중 |
| `confirming` | 입금 확인 중 |
| `exchanging` | 교환 진행 중 |
| `sending` | 출금 전송 중 |
| `finished` | 완료 |
| `failed` | 실패 |
| `refunded` | 환불됨 |
| `error` | 조회 에러 (잘못된 txId 등) |

---

## 2. 프로바이더 유형 분석

DCent Swap API는 3가지 프로바이더 유형을 제공한다:

### 2.1 프로바이더 유형 분류

| providerType | 실행 방식 | 프로바이더 | 범위 |
|-------------|----------|-----------|------|
| `swap` | txdata 서명+전송 | 1inch, SushiSwap, Uniswap Labs, SwapScanner | 동일체인 DEX |
| `cross_swap` | txdata 서명+전송 | Rubic, ButterSwap, LI.FI | 크로스체인 DEX (txdata 기반) |
| `exchange` | payInAddress 전송 | Changelly, ChangeNOW, Exolix | 크로스체인 커스터디 Exchange |

### 2.2 프로바이더별 지원 체인

| 프로바이더 | 유형 | 주요 체인 |
|-----------|------|----------|
| 1inch (`oneinch_classic`) | swap | Ethereum, Polygon, BSC, Optimism, Base, Arbitrum, Avalanche, Gnosis, Kaia, + |
| SushiSwap (`sushi_swap`) | swap | Ethereum, Polygon, BSC, Optimism, Base, Arbitrum, Avalanche, + |
| Uniswap Labs (`uniswap_swap`) | swap | Ethereum, Polygon, BSC, Optimism, Base, Arbitrum, Avalanche |
| SwapScanner (`swap_scanner`) | swap | Kaia |
| ButterSwap (`butter_swap`) | cross_swap | Ethereum, BSC, Polygon, Solana, + |
| Rubic (`rubic_swap`) | cross_swap | 거의 모든 EVM + Solana (30+ 체인) |
| LI.FI (`lifi_swap`) | cross_swap | Ethereum, Polygon, BSC, Optimism, Base, Arbitrum, + |
| Changelly (`changelly_exchange_*`) | exchange | 대부분 체인/토큰 (크로스체인 전용) |
| ChangeNOW (`changenow_exchange_*`) | exchange | 대부분 체인/토큰 (크로스체인 전용) |
| Exolix (`exolix_exchange_*`) | exchange | 대부분 체인/토큰 (크로스체인 전용) |

### 2.3 Exchange 프로바이더 서브타입

Exchange 프로바이더는 2가지 서브타입으로 분류된다:

| 서브타입 | providerId 예시 | 설명 |
|---------|----------------|------|
| `_flexible` | `changelly_exchange_flexible` | 변동 환율, 시장가 |
| `_fixed` | `changelly_exchange_fixed` | 고정 환율, `fixedRate.id` + `validUntil` 포함 |

> **설계 결정 DS-03**: WAIaaS는 기본적으로 `_flexible` Exchange를 사용한다. 고정 환율은 `fixedRate.validUntil` 만료 리스크가 있으며, AI 에이전트의 비동기 승인 플로우와 충돌할 수 있다.

---

## 3. Multi-hop 라우팅 자체 지원 검증

### 3.1 테스트 결과

**테스트 1: 마이너 ERC-20 → 마이너 ERC-20 (UNI → LINK)**
```
fromId: ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984 (UNI)
toId: ERC20/0x514910771af9ca656af840dff83e8264ecf986ca (LINK)
```
- **결과**: `status: success`, 4개 프로바이더 성공 (sushi_swap, uniswap_swap, rubic_swap, oneinch_classic)
- Uniswap `quoteInfo`에서 확인: 직접 UNI→LINK 풀(v3, 0.3% fee)을 사용하여 1-hop 라우팅
- **결론**: 직접 풀이 존재하는 경우 1-hop으로 처리

**테스트 2: 크로스체인 (ETH → SOL)**
```
fromId: ETHEREUM
toId: SOLANA
```
- **결과**: Rubic(`cross_swap`) 성공, 나머지 실패
- **결론**: 크로스체인은 `cross_swap` 또는 `exchange` 프로바이더가 자체적으로 라우팅

### 3.2 결론: DCent 자체 multi-hop 지원

**DCent API는 프로바이더 레벨에서 multi-hop을 자체 처리한다.**

- **동일체인 DEX** (1inch, Sushi, Uniswap): 각 프로바이더의 내부 라우터가 최적 경로를 탐색 (WETH 경유 등)
- **크로스체인** (Rubic, ButterSwap, LI.FI): 크로스체인 애그리게이터가 자체 브릿지+스왑 경로 탐색
- **Exchange** (Changelly, ChangeNOW): 커스터디 방식으로 내부 유동성 풀 활용

> **설계 결정 DS-04**: Phase 345 (Auto Routing) 범위를 **대폭 축소**한다. DCent의 각 프로바이더가 자체적으로 multi-hop을 처리하므로, WAIaaS 레이어에서의 2-hop 자동 라우팅은 `fail_no_available_provider` 상태(모든 프로바이더가 경로를 찾지 못한 경우)에 대한 **fallback 전략**으로 축소한다. 기본 구현은 Phase 343-344에서 완료되며, Phase 345는 선택적 최적화로 남긴다.

---

## 4. API 운영 특성

### 4.1 인증

- **API Key 불필요**: 모든 엔드포인트에 인증 없이 접근 가능
- 베타 인스턴스(`swapbuy-beta`)와 에이전트 인스턴스(`agent-swap`) 모두 동일

### 4.2 Rate Limit

- 테스트 기간 동안 429 응답 미확인 (명시적 Rate Limit 미적용 추정)
- 그러나 프로덕션 환경에서는 보수적으로 접근 필요

> **설계 결정 DS-05**: WAIaaS에서 자체 Rate Limit을 적용한다. `get_quotes`는 최소 2초 간격, `get_supported_currencies`는 24h TTL 캐싱으로 API 부하를 최소화한다.

### 4.3 견적 유효 시간

- `flexible` 견적: 유효 시간 없음 (실시간 시장가, 실행 시 재계산)
- `fixed` 견적: `fixedRate.validUntil` (Unix ms) — 대략 견적 시점 + 5~10분
- 견적 조회 → 실행 사이 지연 시 환율 변동 발생 가능

### 4.4 에러 코드 체계

| 에러 | HTTP | 설명 |
|------|------|------|
| `400 Bad Request` | 400 | 필수 파라미터 누락 또는 잘못된 형식 (`message` 배열에 상세) |
| `fail_no_available_provider` | 200 | 모든 프로바이더 실패 (응답 status 필드) |
| `fail_chain_not_supported` | 200 | 프로바이더가 해당 체인 미지원 (provider-level) |
| `fail_token_not_supported` | 200 | 프로바이더가 해당 토큰 미지원 (provider-level) |
| `fail_internal_error` | 200 | 프로바이더 내부 오류 (provider-level) |
| `500 Internal Error` | 500 | 서버 내부 오류 (예: `get_transactions_status` 잘못된 포맷) |

---

## 5. Currency ID 체계 분석

### 5.1 DCent Currency ID 포맷 분류

| 카테고리 | 포맷 | 예시 | EVM ChainId |
|---------|------|------|-------------|
| **주요 네이티브** | `{NAME}` | `ETHEREUM` | 1 |
| | | `BSC` | 56 |
| | | `POLYGON` | 137 |
| | | `KLAYTN` | 8217 |
| | | `SOLANA` | — |
| | | `XINFIN` | 50 |
| **EVM 체인 네이티브** | `CHAN:{chainId}` | `CHAN:10` (Optimism) | 10 |
| | | `CHAN:8453` (Base) | 8453 |
| | | `CHAN:42161` (Arbitrum) | 42161 |
| | | `CHAN:43114` (Avalanche) | 43114 |
| **Ethereum ERC-20** | `ERC20/0x{addr}` | `ERC20/0xa0b8...` (USDC) | 1 |
| **BSC BEP-20** | `BEP20/0x{addr}` | `BEP20/0x...` | 56 |
| **Polygon ERC-20** | `POLYGON-ERC20/0x{addr}` | `POLYGON-ERC20/0x...` | 137 |
| **기타 EVM 토큰** | `CH20:{chainId}/0x{addr}` | `CH20:10/0x...` (Optimism 토큰) | {chainId} |
| | | `CH20:8453/0x...` (Base 토큰) | |
| **Kaia 토큰** | `KLAYTN-ERC20/0x{addr}` | `KLAYTN-ERC20/0x...` | 8217 |
| **Solana SPL** | `SPL-TOKEN/{mint}` | `SPL-TOKEN/EPjF...` | — |

### 5.2 tokenDeviceId 매핑

`tokenDeviceId`는 해당 체인의 토큰 접두어를 결정한다:

| currencyId | tokenDeviceId | 토큰 ID 접두어 |
|-----------|---------------|---------------|
| `ETHEREUM` | `ERC20` | `ERC20/0x...` |
| `BSC` | `BEP20` | `BEP20/0x...` |
| `POLYGON` | `POLYGON-ERC20` | `POLYGON-ERC20/0x...` |
| `KLAYTN` | `KLAYTN-ERC20` | `KLAYTN-ERC20/0x...` |
| `CHAN:10` | `CH20:10` | `CH20:10/0x...` |
| `CHAN:8453` | `CH20:8453` | `CH20:8453/0x...` |
| `SOLANA` | `SPL-TOKEN` | `SPL-TOKEN/{mint}` |

### 5.3 CAIP-19 대응 관계

| DCent Currency ID | CAIP-19 (WAIaaS) |
|-------------------|------------------|
| `ETHEREUM` | `eip155:1/slip44:60` |
| `BSC` | `eip155:56/slip44:60` |
| `POLYGON` | `eip155:137/slip44:60` |
| `KLAYTN` | `eip155:8217/slip44:60` |
| `CHAN:10` | `eip155:10/slip44:60` |
| `CHAN:8453` | `eip155:8453/slip44:60` |
| `CHAN:42161` | `eip155:42161/slip44:60` |
| `CHAN:43114` | `eip155:43114/slip44:60` |
| `SOLANA` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` |
| `ERC20/0xa0b8...` | `eip155:1/erc20:0xa0b8...` |
| `BEP20/0x...` | `eip155:56/erc20:0x...` |
| `POLYGON-ERC20/0x...` | `eip155:137/erc20:0x...` |
| `CH20:10/0x...` | `eip155:10/erc20:0x...` |
| `CH20:8453/0x...` | `eip155:8453/erc20:0x...` |
| `KLAYTN-ERC20/0x...` | `eip155:8217/erc20:0x...` |
| `SPL-TOKEN/{mint}` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:{mint}` |

---

## 6. CAIP-19 <-> DCent Currency ID 변환 설계

### 6.1 변환 규칙 매트릭스

#### CAIP-19 → DCent Currency ID

```
caip19ToDcentId(caip19: string): string
```

| CAIP-19 패턴 | 변환 규칙 | 결과 예시 |
|-------------|----------|----------|
| `eip155:1/slip44:60` | → `ETHEREUM` | `ETHEREUM` |
| `eip155:56/slip44:60` | → `BSC` | `BSC` |
| `eip155:137/slip44:60` | → `POLYGON` | `POLYGON` |
| `eip155:8217/slip44:60` | → `KLAYTN` | `KLAYTN` |
| `eip155:{chainId}/slip44:60` | → `CHAN:{chainId}` (나머지 EVM) | `CHAN:10` |
| `eip155:1/erc20:{addr}` | → `ERC20/{addr}` | `ERC20/0xa0b8...` |
| `eip155:56/erc20:{addr}` | → `BEP20/{addr}` | `BEP20/0x...` |
| `eip155:137/erc20:{addr}` | → `POLYGON-ERC20/{addr}` | `POLYGON-ERC20/0x...` |
| `eip155:8217/erc20:{addr}` | → `KLAYTN-ERC20/{addr}` | `KLAYTN-ERC20/0x...` |
| `eip155:{chainId}/erc20:{addr}` | → `CH20:{chainId}/{addr}` (나머지) | `CH20:10/0x...` |
| `solana:.../slip44:501` | → `SOLANA` | `SOLANA` |
| `solana:.../spl:{mint}` | → `SPL-TOKEN/{mint}` | `SPL-TOKEN/EPjF...` |

**네이티브 토큰 특수 매핑 (하드코딩)**:
```typescript
const NATIVE_ID_MAP: Record<number, string> = {
  1: 'ETHEREUM',
  56: 'BSC',
  137: 'POLYGON',
  8217: 'KLAYTN',
  50: 'XINFIN',
};
```

#### DCent Currency ID → CAIP-19

```
dcentIdToCaip19(dcentId: string): string
```

| DCent 패턴 | 변환 규칙 | 결과 예시 |
|-----------|----------|----------|
| `ETHEREUM` | → `eip155:1/slip44:60` | 네이티브 매핑 |
| `BSC` | → `eip155:56/slip44:60` | 네이티브 매핑 |
| `POLYGON` | → `eip155:137/slip44:60` | 네이티브 매핑 |
| `KLAYTN` | → `eip155:8217/slip44:60` | 네이티브 매핑 |
| `SOLANA` | → `solana:5eykt.../slip44:501` | Solana 네이티브 |
| `CHAN:{chainId}` | → `eip155:{chainId}/slip44:60` | EVM 네이티브 |
| `ERC20/0x{addr}` | → `eip155:1/erc20:0x{addr}` | Ethereum 토큰 |
| `BEP20/0x{addr}` | → `eip155:56/erc20:0x{addr}` | BSC 토큰 |
| `POLYGON-ERC20/0x{addr}` | → `eip155:137/erc20:0x{addr}` | Polygon 토큰 |
| `KLAYTN-ERC20/0x{addr}` | → `eip155:8217/erc20:0x{addr}` | Kaia 토큰 |
| `CH20:{chainId}/0x{addr}` | → `eip155:{chainId}/erc20:0x{addr}` | 기타 EVM 토큰 |
| `SPL-TOKEN/{mint}` | → `solana:5eykt.../spl:{mint}` | Solana SPL |

### 6.2 캐싱 전략

- **get_supported_currencies 캐싱**: 24h TTL, 메모리 캐시 (`Map<string, DcentCurrency>`)
- **데몬 시작 시 프리로드**: `DcentSwapApiClient.init()` 에서 currencies 로드
- **캐시 갱신**: TTL 만료 시 lazy refresh (요청 시 비동기 갱신, stale 데이터 즉시 반환)
- **tokenDeviceId 기반 인덱스**: `currencyId → tokenDeviceId` 매핑 캐시 (토큰 ID 접두어 결정에 사용)

### 6.3 알 수 없는 ID 처리

1. 로컬 매핑 테이블에서 변환 시도
2. 실패 시 `get_supported_currencies` 캐시에서 패턴 매칭
3. 여전히 실패 시 `UNSUPPORTED_ASSET` 에러 반환

---

## 7. DEX Swap 파이프라인 매핑 설계

### 7.1 DEX Swap 실행 플로우

```
사용자 요청: "ETH를 USDC로 스왑"
  ↓
1. CAIP-19 → DCent Currency ID 변환
   eip155:1/slip44:60 → ETHEREUM
   eip155:1/erc20:0xa0b8... → ERC20/0xa0b8...
  ↓
2. POST get_quotes
   → providers.bestOrder[0] 선택 (또는 사용자 지정 providerId)
   → providerType 확인 ("swap" 또는 "cross_swap")
   → min/max 금액 검증
  ↓
3. (ERC-20 sell인 경우) approve calldata 생성
   → spenderContractAddress를 spender로 사용
   → encodeApproveCalldata(spender, amount)
  ↓
4. POST get_dex_swap_transaction_data
   → txdata { from, to, data, value } 수신
  ↓
5. ContractCallRequest[] 반환 → BATCH 파이프라인 실행
```

### 7.2 BATCH 구성

**네이티브 토큰 sell (예: ETH → USDC)**:
```typescript
[
  {
    type: 'CONTRACT_CALL',
    to: txdata.to,           // DEX 라우터 주소
    calldata: txdata.data,   // 스왑 calldata
    value: txdata.value,     // native value (10진수)
  }
]
```

**ERC-20 sell (예: USDC → ETH)**:
```typescript
[
  {
    type: 'CONTRACT_CALL',
    to: tokenAddress,                                    // ERC-20 컨트랙트 주소
    calldata: encodeApproveCalldata(spender, amount),    // approve(spender, amount)
    value: '0',
  },
  {
    type: 'CONTRACT_CALL',
    to: txdata.to,           // DEX 라우터 주소
    calldata: txdata.data,   // 스왑 calldata
    value: txdata.value || '0',
  }
]
```

### 7.3 min/max 금액 검증

`get_quotes` 응답에서 프로바이더별 `minAmount`, `maxAmount`가 포함될 수 있다 (실제 테스트에서는 미포함 — 프로바이더별 차이). 금액 검증은 다음 전략:

1. 견적 응답에 `minAmount`/`maxAmount` 포함 시 → 클라이언트 사전 검증
2. 미포함 시 → 실행 시 프로바이더가 에러 반환 (`fail_smaller_than_min` 등)
3. `expectedAmount`가 0인 경우 (금액 너무 작음) → `AMOUNT_TOO_SMALL` 에러

### 7.4 슬리피지 처리

- `get_dex_swap_transaction_data`에 `slippage` 파라미터 전달 (정수 %)
- `isAutoSlippage: true` 설정 시 프로바이더 자동 슬리피지 적용
- WAIaaS 기본값: 1% (`dcent_swap.default_slippage_bps = 100`)
- WAIaaS 최대값: 5% (`dcent_swap.max_slippage_bps = 500`)

### 7.5 에러 매핑

| DCent 에러 | WAIaaS 에러 코드 | 설명 |
|-----------|-----------------|------|
| `fail_no_available_provider` | `NO_ROUTE` | 경로 없음 |
| `fail_empty_providers` | `NO_ROUTE` | 프로바이더 없음 |
| `fail_smaller_than_min` | `AMOUNT_TOO_SMALL` | 최소 금액 미달 |
| `fail_chain_not_supported` | `CHAIN_NOT_SUPPORTED` | 체인 미지원 |
| `fail_token_not_supported` | `TOKEN_NOT_SUPPORTED` | 토큰 미지원 |
| `fail_internal_error` | `PROVIDER_ERROR` | 프로바이더 내부 오류 |
| HTTP 400 | `INVALID_INSTRUCTION` | 잘못된 요청 파라미터 |
| HTTP 500 | `PROVIDER_ERROR` | 서버 오류 |
| 네트워크 타임아웃 | `PROVIDER_UNAVAILABLE` | API 응답 없음 |

---

## 8. Exchange 파이프라인 매핑 설계

### 8.1 Exchange 실행 플로우

```
사용자 요청: "ETH를 SOL로 교환"
  ↓
1. CAIP-19 → DCent Currency ID 변환
  ↓
2. POST get_quotes
   → providers.common에서 providerType="exchange" 필터
   → bestOrder에서 exchange 프로바이더 선택
  ↓
3. POST create_exchange_transaction
   → { payInAddress, transactionId, toAmount } 수신
  ↓
4. TRANSFER 파이프라인 실행
   → { type: 'TRANSFER', to: payInAddress, amount: fromAmount }
  ↓
5. 상태 폴링 시작 (백그라운드)
   → POST get_transactions_status (30초 간격, 최대 1시간)
  ↓
6. 완료/실패 알림
   → NotificationService: SWAP_COMPLETE / SWAP_FAILED 이벤트
```

### 8.2 TRANSFER 구성

```typescript
{
  type: 'TRANSFER',
  to: payInAddress,           // Exchange 서비스 입금 주소
  amount: fromAmount,         // 원본 금액 (from 토큰 최소 단위)
}
```

> **주의**: Exchange는 `TRANSFER` 타입으로 실행한다 (CONTRACT_CALL 아님). payInAddress는 Exchange 서비스가 생성한 일회용 입금 주소이다.

### 8.3 extraId(memo) 처리

일부 체인(Solana, Cosmos, XRP 등)은 입금 시 memo/tag가 필요하다. `create_exchange_transaction` 응답에 `extraId` 필드가 포함될 수 있다.

> **설계 결정 DS-06**: extraId가 포함된 경우 TRANSFER에 memo 필드를 추가한다. 현재 WAIaaS TRANSFER 타입은 memo를 지원하므로 추가 파이프라인 변경 불필요.

### 8.4 상태 폴링 전략

```typescript
const POLL_CONFIG = {
  intervalMs: 30_000,    // 30초 간격
  maxDurationMs: 3_600_000, // 최대 1시간
  maxRetries: 120,       // 30초 * 120 = 1시간
};
```

- **폴링 방식**: 주기적 `get_transactions_status` 호출
- **종료 조건**: `finished`, `failed`, `refunded` 상태 수신 또는 maxDuration 초과
- **저장**: DB `dcent_swap_exchanges` 테이블에 상태 기록 (Phase 344에서 구현)

### 8.5 알림 연동

| Exchange 상태 | WAIaaS 알림 이벤트 | 우선순위 |
|-------------|-------------------|---------|
| `finished` | `SWAP_COMPLETE` | normal |
| `failed` | `SWAP_FAILED` | high |
| `refunded` | `SWAP_REFUNDED` | high |
| 폴링 타임아웃 | `SWAP_TIMEOUT` | high |

---

## 9. DcentSwapActionProvider 인터페이스 설계

### 9.1 Provider Metadata

```typescript
{
  name: 'dcent_swap',
  description: 'DCent Swap aggregator supporting multi-provider DEX swaps and cross-chain exchanges via Changelly, ChangeNOW, 1inch, SushiSwap, Uniswap, Rubic, LI.FI, and more',
  version: '1.0.0',
  chains: ['ethereum', 'solana'],  // 멀티체인 지원
  mcpExpose: true,
  requiresApiKey: false,
  requiredApis: [],
}
```

### 9.2 Actions 정의

| Action | 설명 | Chain | Risk | Tier |
|--------|------|-------|------|------|
| `get_quotes` | 스왑 견적 조회 (정보성) | ethereum | low | INSTANT |
| `dex_swap` | DEX 스왑 실행 (동일체인) | ethereum | high | DELAY |
| `exchange` | Exchange 실행 (크로스체인) | ethereum | high | APPROVAL |
| `swap_status` | 스왑/Exchange 상태 조회 | ethereum | low | INSTANT |

### 9.3 Action Input Schemas

```typescript
// get_quotes
const GetQuotesInputSchema = z.object({
  fromAsset: z.string().min(1),    // CAIP-19 식별자
  toAsset: z.string().min(1),      // CAIP-19 식별자
  amount: z.string().min(1),       // from 토큰 최소 단위
  fromDecimals: z.number().int().min(0).max(18),
  toDecimals: z.number().int().min(0).max(18),
});

// dex_swap
const DexSwapInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1),
  fromDecimals: z.number().int(),
  toDecimals: z.number().int(),
  providerId: z.string().optional(),     // 프로바이더 직접 지정 (없으면 bestOrder[0])
  slippageBps: z.number().int().optional(), // 슬리피지 (basis points)
});

// exchange
const ExchangeInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1),
  fromDecimals: z.number().int(),
  toDecimals: z.number().int(),
  toAddress: z.string().min(1),           // 수신 지갑 주소 (다른 체인 가능)
  providerId: z.string().optional(),
});

// swap_status
const SwapStatusInputSchema = z.object({
  transactionId: z.string().min(1),
  providerId: z.string().min(1),
});
```

### 9.4 resolve() 분기 로직

```typescript
async resolve(actionName: string, params: Record<string, unknown>, context: ActionContext):
  Promise<ContractCallRequest | ContractCallRequest[]> {

  switch (actionName) {
    case 'get_quotes':
      // 정보성 — 견적 조회 후 metadata에 담아 빈 배열 반환
      // 실제로는 별도 query 메서드로 분리 (resolve는 실행 전용)
      throw new ChainError('INVALID_INSTRUCTION', context.chain, {
        message: 'Use getDcentQuotes() for quote queries. get_quotes is informational only.',
      });

    case 'dex_swap':
      // 1. CAIP-19 → DCent ID 변환
      // 2. get_quotes → 최적 DEX 프로바이더 선택
      // 3. providerType 확인 ("swap" 또는 "cross_swap")
      // 4. ERC-20 sell → approve calldata 생성
      // 5. get_dex_swap_transaction_data → txdata
      // 6. return [approveRequest?, swapRequest]

    case 'exchange':
      // 1. CAIP-19 → DCent ID 변환
      // 2. get_quotes → Exchange 프로바이더 선택
      // 3. create_exchange_transaction → payInAddress
      // 4. return { type: 'TRANSFER', to: payInAddress, amount }
      // 5. 상태 폴링 시작 (비동기)

    case 'swap_status':
      // 정보성 — 상태 조회 후 메타데이터 반환
      throw new ChainError('INVALID_INSTRUCTION', context.chain, {
        message: 'Use getDcentSwapStatus() for status queries.',
      });
  }
}
```

> **설계 결정 DS-07**: `get_quotes`와 `swap_status`는 정보성 액션이므로 `resolve()`에서 ContractCallRequest를 반환하지 않는다. 대신 DcentSwapActionProvider에 별도 query 메서드를 노출하고, MCP/SDK에서 직접 호출한다. `resolve()`는 `dex_swap`과 `exchange` 실행 액션에만 사용한다.

### 9.5 DcentSwapApiClient 클래스

```typescript
class DcentSwapApiClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private currencyCache: Map<string, DcentCurrency> | null = null;
  private cacheExpiry: number = 0;

  constructor(config: DcentSwapConfig) { /* ... */ }

  // API methods
  async getSupportedCurrencies(): Promise<DcentCurrency[]>;
  async getQuotes(params: GetQuotesParams): Promise<DcentQuotesResponse>;
  async getDexSwapTransactionData(params: DexSwapTxParams): Promise<DcentTxDataResponse>;
  async getEvmDexApproveCalldata(params: ApproveParams): Promise<DcentApproveResponse>;
  async createExchangeTransaction(params: ExchangeParams): Promise<DcentExchangeResponse>;
  async getTransactionsStatus(params: StatusParams[]): Promise<DcentStatusResponse[]>;

  // Cache management
  async init(): Promise<void>;  // 프리로드 currencies
  private async refreshCacheIfNeeded(): Promise<void>;

  // HTTP helper
  private async request<T>(method: string, path: string, body?: unknown): Promise<T>;
}
```

---

## 10. MCP/SDK/정책/Admin 통합 설계

### 10.1 MCP 도구 (4개)

| MCP 도구 | 설명 | 호출 방식 |
|---------|------|----------|
| `dcent_get_quotes` | DCent 스왑 견적 조회 (프로바이더별 비교) | DcentSwapApiClient 직접 호출 |
| `dcent_dex_swap` | DCent DEX 스왑 실행 (동일체인) | resolve('dex_swap') → 파이프라인 |
| `dcent_exchange` | DCent Exchange 실행 (크로스체인) | resolve('exchange') → 파이프라인 |
| `dcent_swap_status` | 스왑/Exchange 상태 조회 | DcentSwapApiClient 직접 호출 |

### 10.2 SDK 메서드 (4개)

```typescript
// TypeScript SDK
class WAIaaSClient {
  async getDcentQuotes(params: DcentQuoteParams): Promise<DcentQuoteResult>;
  async dcentDexSwap(params: DcentDexSwapParams): Promise<TransactionResult>;
  async dcentExchange(params: DcentExchangeParams): Promise<TransactionResult>;
  async getDcentSwapStatus(params: DcentStatusParams): Promise<DcentStatusResult>;
}
```

### 10.3 정책 엔진 통합

| 정책 | DEX Swap 적용 | Exchange 적용 | 설명 |
|------|-------------|-------------|------|
| `CONTRACT_WHITELIST` | 적용 | **미적용** | DEX 라우터 주소 허용 필요. Exchange는 TRANSFER이므로 CONTRACT_WHITELIST 미통과. |
| `ALLOWED_TOKENS` | 적용 | 적용 | from/to 토큰 정책 평가 |
| `SPENDING_LIMIT` | 적용 | 적용 | 스왑 금액 USD 환산 평가 |
| `APPROVED_SPENDERS` | 적용 | **미적용** | ERC-20 approve의 spender 주소 정책 |

> **설계 결정 DS-08**: DEX Swap 시 DEX 라우터 주소를 CONTRACT_WHITELIST에 추가해야 한다. DCent가 반환하는 `spenderContractAddress`(= `txdata.to`)를 자동으로 화이트리스트에 추가하는 옵션은 보안 위험이 있으므로 제공하지 않는다. 대신 Admin Settings에서 "알려진 DEX 라우터" 프리셋을 제공한다.

> **설계 결정 DS-09**: Exchange의 payInAddress는 일회용 입금 주소이므로 CONTRACT_WHITELIST 평가를 우회한다. TRANSFER 타입은 CONTRACT_WHITELIST 대상이 아니다 (기존 파이프라인 동작과 일치).

### 10.4 Admin Settings 키

| 키 | 타입 | 기본값 | 설명 |
|----|------|-------|------|
| `dcent_swap.enabled` | boolean | `true` | DCent Swap 기능 활성화 |
| `dcent_swap.api_url` | string | `https://swapbuy-beta.dcentwallet.com` | DCent API 베이스 URL |
| `dcent_swap.default_slippage_bps` | number | `100` | 기본 슬리피지 (1%) |
| `dcent_swap.max_slippage_bps` | number | `500` | 최대 슬리피지 (5%) |
| `dcent_swap.exchange_poll_interval_ms` | number | `30000` | Exchange 상태 폴링 간격 |
| `dcent_swap.exchange_poll_max_ms` | number | `3600000` | Exchange 폴링 최대 시간 |
| `dcent_swap.currency_cache_ttl_ms` | number | `86400000` | Currency 캐시 TTL (24h) |

### 10.5 connect-info capability

```json
{
  "dcent_swap": {
    "enabled": true,
    "supportedChains": ["ethereum", "solana"],
    "providerTypes": ["swap", "cross_swap", "exchange"],
    "providerCount": 10,
    "features": ["dex_swap", "cross_chain_exchange", "status_tracking"]
  }
}
```

---

## 11. 설계 결정 요약

| # | 결정 항목 | 선택 | 근거 |
|---|----------|------|------|
| DS-01 | API 엔드포인트 | `swapbuy-beta.dcentwallet.com` | Exchange 프로바이더(Changelly, ChangeNOW, Exolix) 포함, `agent-swap`은 DEX만 |
| DS-02 | ERC-20 approve | WAIaaS 자체 인코딩 | DCent approve API가 일부 프로바이더에서 미구현, 기존 `encodeApproveCalldata` 패턴 재사용 |
| DS-03 | Exchange 환율 타입 | `_flexible` 기본 | 고정 환율은 validUntil 만료 리스크, AI 에이전트 비동기 승인과 충돌 가능 |
| DS-04 | Phase 345 (Auto Routing) | 범위 대폭 축소 → fallback 전략 | DCent 프로바이더가 자체 multi-hop 처리, WAIaaS 2-hop은 `fail_no_available_provider` 시에만 |
| DS-05 | Rate Limit | WAIaaS 자체 적용 (get_quotes 2초, currencies 24h) | DCent API 명시적 rate limit 미확인이나 보수적 접근 |
| DS-06 | Exchange extraId | TRANSFER memo 필드 활용 | WAIaaS TRANSFER 타입이 이미 memo 지원, 추가 파이프라인 변경 불필요 |
| DS-07 | 정보성 액션 처리 | resolve()와 분리, 별도 query 메서드 | get_quotes/swap_status는 ContractCallRequest 미반환, MCP/SDK에서 직접 호출 |
| DS-08 | DEX 라우터 CONTRACT_WHITELIST | 수동 추가 필요 (자동 허용 안 함) | 보안: 알 수 없는 컨트랙트 자동 허용은 위험, Admin에서 프리셋 제공 |
| DS-09 | Exchange payInAddress 정책 | CONTRACT_WHITELIST 미적용 | TRANSFER 타입은 CONTRACT_WHITELIST 대상 아님 (기존 동작 일치) |
| DS-10 | 프로바이더 선택 | bestOrder[0] 자동 선택 (사용자 지정 가능) | AI 에이전트 DX 우선, providerId 파라미터로 수동 선택 가능 |
| DS-11 | 패키지 위치 | `packages/actions/src/providers/dcent-swap/` | 기존 zerox-swap, lifi와 동일 구조 |
| DS-12 | Currency ID 변환 | `packages/actions/src/providers/dcent-swap/currency-mapper.ts` | DCent 전용 변환 로직, CAIP-19 유틸 재사용 |
| DS-13 | Exchange 상태 저장 | DB 테이블 `dcent_swap_exchanges` | 폴링 상태 영속화, 데몬 재시작 후 폴링 재개 가능 |
| DS-14 | cross_swap 프로바이더 | DEX Swap 플로우 사용 | cross_swap도 txdata 반환 → get_dex_swap_transaction_data로 실행 가능 |
| DS-15 | is_supported_by_currency_id | 사용하지 않음 | 빈 객체만 반환, get_supported_currencies 캐시로 대체 |
| DS-16 | Solana DEX 지원 | butter_swap, lifi_swap 프로바이더 경유 | Solana 동일체인 DEX는 SPL-TOKEN 매핑 후 동일 플로우 |
| DS-17 | fixedRate 견적 | 선택적 지원 (flexible 우선) | fixedRate.id를 create_exchange에 전달하되, 기본은 flexible |

### Phase 345 (Auto Routing) 확정 범위

**결론: Phase 345를 선택적 최적화로 변경한다.**

- DCent의 각 프로바이더(1inch, Rubic, LI.FI 등)가 자체적으로 최적 경로를 탐색하므로, WAIaaS 레이어에서 2-hop 라우팅을 구현할 필요성이 낮다.
- `fail_no_available_provider` 상태에서의 fallback으로:
  1. 중간 토큰(ETH, USDC, USDT) 경유 2-hop 탐색
  2. 총 비용 계산 (수수료 + 슬리피지 * 2)
  3. 사용자에게 2-hop 경로임을 고지
- Phase 345는 Phase 344 완료 후 실제 운영에서 `fail_no_available_provider` 빈도를 측정하여 구현 결정

### 후속 Phase 구현 지침

**Phase 343 (Currency Mapping + DEX Swap)**:
1. `currency-mapper.ts` — CAIP-19 ↔ DCent ID 양방향 변환 + 테스트
2. `dcent-api-client.ts` — HTTP 클라이언트 + currencies 캐싱
3. `dex-swap.ts` — get_quotes → 최적 프로바이더 → approve + txdata → ContractCallRequest[]
4. DcentSwapActionProvider의 `dex_swap` 액션 구현

**Phase 344 (Exchange + Status Tracking)**:
1. `exchange.ts` — get_quotes(exchange 필터) → create_exchange_transaction → TRANSFER
2. DB migration: `dcent_swap_exchanges` 테이블
3. `status-poller.ts` — 백그라운드 폴링 서비스
4. 알림 연동: SWAP_COMPLETE / SWAP_FAILED / SWAP_REFUNDED

**Phase 345 (Auto Routing — 선택적)**:
1. `fail_no_available_provider` 빈도 분석
2. 필요 시 중간 토큰 후보 + 2-hop 탐색 구현
3. BATCH로 순차 실행 + 부분 실패 처리

**Phase 346 (Integration + Testing)**:
1. MCP 4도구 + SDK 4메서드 구현
2. 정책 엔진 통합 (CONTRACT_WHITELIST, ALLOWED_TOKENS, SPENDING_LIMIT)
3. Admin Settings 키 등록 + connect-info capability
4. 스킬 파일 업데이트 (transactions.skill.md)
5. 전 영역 테스트 (단위 + 통합)
