# 마일스톤 m31-03: DCent Swap Aggregator 통합

- **Status:** PLANNED
- **Milestone:** v31.3

## 목표

DCent Swap Backend API를 WAIaaS에 통합하여 다중 프로바이더 스왑(동일체인 DEX + 크로스체인 Exchange)을 지원한다. 직접 경로가 없는 페어에 대해서는 DCent 자체 multi-hop 지원 여부를 확인하고, 미지원 시 WAIaaS 레이어에서 2-hop 자동 라우팅을 구현한다.

> **리서치 필수**: DCent Swap API는 여러 프로바이더(Changelly, ChangeNOW, 1inch, Uniswap 등)를 애그리게이팅하는 서비스이다. 구현 착수 전에 반드시 다음을 리서치해야 한다: `get_supported_currencies` 응답 상세 구조, `get_quotes` 응답의 provider 객체 필드(rate, fee, minAmount 등), WAIaaS CAIP-19 자산 식별자 ↔ DCent Currency ID 매핑 전략, 프로바이더별 체인/토큰 가용성, multi-hop 라우팅 자체 지원 여부, API 인증 요구 사항, rate limit 정책.

---

## 배경

### DCent Swap Aggregator 개요

DCent Swap Backend API(`https://agent-swap.dcentwallet.com`)는 다중 스왑 프로바이더를 애그리게이팅하는 서비스이다. 특징:
- **Exchange 프로바이더 (크로스체인)**: Changelly, ChangeNOW, Exolix — payInAddress 방식
- **DEX 프로바이더 (동일체인)**: OKX, 1inch, Uniswap, SushiSwap, LI.FI, Rubic, Squid Router — txdata 방식
- **Currency ID 포맷**: 네이티브(`BITCOIN`, `ETHEREUM`), ERC20(`ERC20/0x...`), 체인 토큰(`TOKEN:chainId`)
- **2가지 플로우**: Exchange(크로스체인 payInAddress) / DEX Swap(동일체인 txdata 서명)

### 기존 인프라 활용

- **6-stage 파이프라인**: DEX Swap의 txdata를 `CONTRACT_CALL` type으로 실행
- **APPROVE 파이프라인**: ERC20 approve calldata 전용 API 제공(`get_evm_dex_approve_calldata`)
- **BATCH type**: approve + swap 순차 실행, 2-hop 자동 라우팅 시 활용
- **TRANSFER type**: Exchange 플로우에서 payInAddress로 자금 전송
- **크로스체인 경험**: LI.FI Bridge(v28.3), Across Protocol(m31-06) 선례

### API 엔드포인트 요약

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /api/swap/v3/get_supported_currencies` | 지원 통화 목록 |
| `GET /api/swap/v3/is_supported_by_currency_id` | 통화 지원 여부 확인 |
| `POST /api/swap/v3/get_quotes` | 스왑 견적 조회 (프로바이더별) |
| `POST /api/swap/v3/create_exchange_transaction` | Exchange TX 생성 (크로스체인) |
| `POST /api/swap/v3/get_dex_swap_transaction_data` | DEX Swap TX data 조회 (동일체인) |
| `POST /api/swap/v3/get_evm_dex_approve_calldata` | ERC20 approve calldata 조회 |
| `POST /api/swap/v3/get_transactions_status` | TX 상태 추적 |

---

## 범위

### Phase 1: 리서치 및 설계

DCent Swap API를 심층 리서치하고 WAIaaS 통합 설계 문서를 작성한다.

**리서치 항목:**
- `get_supported_currencies` 응답 상세 구조 (currencies 배열 내 필드)
- `get_quotes` 응답의 provider 객체 상세 (rate, fee, minAmount, maxAmount, estimatedTime 등)
- WAIaaS CAIP-19 자산 식별자 ↔ DCent Currency ID 변환 매핑
- 프로바이더별 체인/토큰 가용성 매트릭스 (실제 API 호출로 확인)
- EVM ↔ Solana 크로스체인 스왑 가용성 확인
- **Multi-hop 라우팅 자체 지원 여부** (직접 경로 없는 페어로 `get_quotes` 호출 테스트)
- API 인증 요구 사항 (API Key 필요 여부)
- Rate limit 정책
- `fixedRate` 견적의 유효 시간 및 갱신 전략

**설계 항목:**
- DcentSwapProvider 인터페이스 설계
- Exchange 플로우(payInAddress) → WAIaaS TRANSFER 파이프라인 매핑
- DEX Swap 플로우(txdata) → WAIaaS CONTRACT_CALL 파이프라인 매핑
- Currency ID 변환 레이어 설계 (CAIP-19 ↔ DCent 양방향)
- 자동 라우팅 전략 설계 (리서치 결과에 따라 범위 확정)
- 정책 엔진 통합 (스왑 한도, 허용 프로바이더)
- MCP 도구 / SDK 메서드 설계

### Phase 2: 기본 스왑 구현

1-hop 스왑(직접 경로)을 구현한다.

**기능:**
- 지원 통화 조회 및 캐싱
- 스왑 견적 조회 (프로바이더별 비교, 최적 견적 추천)
- DEX Swap 실행 (ERC20 approve + txdata 서명/전송, BATCH 파이프라인)
- Exchange 실행 (create_exchange_transaction → payInAddress로 TRANSFER)
- 트랜잭션 상태 추적 (폴링)
- Currency ID 변환 레이어 (CAIP-19 ↔ DCent)
- Action Provider 패턴 구현 (DcentSwapActionProvider)
- MCP 도구 + SDK 메서드

### Phase 3: 자동 라우팅 (조건부)

직접 경로가 없는 페어에 대해 중간 토큰을 경유하는 2-hop 자동 라우팅을 구현한다.

> **조건부 phase**: Phase 1 리서치에서 DCent가 자체적으로 multi-hop을 지원하는 것으로 확인되면 이 phase는 스킵한다. DCent가 1-hop만 제공하는 경우에만 WAIaaS 레이어에서 구현한다.

**기능 (구현 시):**
- 직접 경로 실패 시 중간 토큰 후보 선정 (ETH, USDC, USDT 등 유동성 높은 토큰)
- 2-hop 경로 탐색 (fromToken → 중간 토큰, 중간 토큰 → toToken 견적 조합)
- 총 비용 계산 (수수료 + 슬리피지 누적) 및 최적 경로 선택
- BATCH 파이프라인으로 순차 실행 (TX 1 → TX 2)
- 부분 실패 처리 (TX 1 성공 후 TX 2 실패 시 중간 토큰 잔액 안내)
- 2-hop 경로임을 사용자에게 명시 (수수료 투명성)

### Phase 4: 테스트 및 통합

통합 테스트와 기존 시스템 연동을 검증한다.

**기능:**
- Mock API 기반 단위 테스트 (get_quotes, create_exchange, get_dex_swap 등)
- Currency ID 변환 로직 테스트 (CAIP-19 ↔ DCent 양방향)
- DEX Swap 플로우 (approve + txdata) 통합 테스트
- Exchange 플로우 (payInAddress → TRANSFER) 통합 테스트
- 자동 라우팅 경로 탐색/실행 테스트 (Phase 3 구현 시)
- 정책 엔진 연동 (스왑 한도, 프로바이더 제한)
- 상태 추적 폴링 테스트
- 에러 핸들링 (fail_empty_providers, fail_smaller_than_min, rate expired 등)
- MCP 도구 + SDK 메서드 통합 테스트

---

## 기술적 고려사항

1. **이중 플로우**: Exchange(payInAddress 전송)와 DEX Swap(txdata 서명)은 완전히 다른 파이프라인 — DcentSwapProvider 내부에서 프로바이더 유형에 따라 분기.
2. **Currency ID 매핑**: WAIaaS의 CAIP-19 자산 식별자(`eip155:137/erc20:0x...`)와 DCent 포맷(`ERC20/0x...`)간 변환 레이어 필수.
3. **견적 유효 시간**: fixedRate 견적은 시간 제한이 있으므로, 견적 조회 → 실행 사이 타임아웃 처리 필요.
4. **크로스체인 상태 추적**: Exchange 플로우는 완료까지 수분~수십분 소요 — 폴링 간격 및 알림 통합 고려.
5. **프로바이더 가용성**: 특정 프로바이더가 일시적으로 불가용할 수 있음 — fallback 프로바이더 자동 선택.
6. **2-hop 슬리피지**: 자동 라우팅 시 슬리피지가 두 번 적용되므로 총 비용을 사전에 계산하여 사용자에게 고지.

---

## 테스트 항목

- get_quotes 호출 및 프로바이더 파싱 테스트
- get_supported_currencies 캐싱 테스트
- Currency ID 변환 (CAIP-19 ↔ DCent) 양방향 테스트
- DEX Swap: approve calldata + swap txdata 인코딩 검증
- Exchange: create_exchange_transaction → TRANSFER 플로우 테스트
- 트랜잭션 상태 폴링 (waiting → finished) 테스트
- 자동 라우팅 경로 탐색 테스트 (Phase 3 구현 시)
- 2-hop BATCH 실행 및 부분 실패 처리 테스트 (Phase 3 구현 시)
- 정책 엔진 연동 (스왑 한도) 테스트
- 에러 케이스 (empty providers, min/max amount, rate expired, insufficient liquidity)
- MCP 도구 + SDK 메서드 통합 테스트
