# 마일스톤 m33-12: THORChain 크로스체인 스왑

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

THORChain을 Action Provider로 구현하여, AI 에이전트가 네이티브 자산 간 크로스체인 스왑(XRP ↔ ETH, XRP ↔ SOL, BTC ↔ ETH 등)을 래핑 없이 실행할 수 있는 상태.

---

## 배경

### THORChain 특성

THORChain은 네이티브 L1 자산 간 직접 스왑을 지원하는 유일한 프로토콜이다. 래핑/브릿지 없이 실제 네이티브 자산을 교환한다.

| 항목 | THORChain | LI.FI (현재 v28.3) | Across (현재 v31.6) |
|------|-----------|-------------------|---------------------|
| 지원 체인 | BTC, ETH, SOL, XRP, DOGE 등 L1 | EVM only | EVM only |
| 스왑 방식 | 네이티브 L1 → RUNE 풀 → L1 | 브릿지 + DEX 조합 | 인텐트 기반 브릿지 |
| 래핑 필요 | 없음 | 체인 간 래핑 토큰 | 체인 간 래핑 토큰 |
| 확정 시간 | 소스 체인 확인 + ~15초 | 수분~수십분 | 수초~수분 |
| API | REST (THORNode + Midgard) | REST API | REST API |

### 유동성 현황 (2026-03 기준)

| 풀 | TVL (RUNE) | 24h Vol | Vol/TVL |
|----|-----------|---------|---------|
| BTC | 32.8M | 6.0M | 18% |
| ETH | 12.8M | 12.7M | 99% |
| XRP | 1.1M | 3.2M | 306% |
| BCH | 3.7M | 7.9M | 214% |
| DOGE | 2.4M | 0.15M | 6% |

XRP 풀은 TVL 대비 거래량이 매우 높아 수요는 있으나 유동성이 부족한 상태. 소액 스왑에 적합하며, 대규모 거래 시 슬리피지 주의 필요.

### WAIaaS 통합 가치

THORChain은 XRP뿐 아니라 **기존 지원 체인(EVM, Solana) 간 크로스체인 스왑**도 커버한다. LI.FI/Across가 EVM↔EVM만 지원하는 반면, THORChain은 **Solana ↔ EVM**, **BTC ↔ EVM** 등 이종 체인 간 스왑을 제공한다.

---

## 범위

### 포함

1. **ThorchainSwapProvider**: IActionProvider 구현
   - `swap` — 크로스체인 스왑 (quote → inbound_address → memo 구성 → L1 전송)
   - `quote` — 스왑 견적 조회 (예상 출력, 수수료, 슬리피지, 예상 시간)
   - `check_status` — 스왑 진행 상태 추적 (Midgard tx status)
   - `get_pools` — 풀 목록/유동성 조회
2. **멀티체인 라우팅**: XRP/EVM/Solana 소스 체인 자동 감지, 대상 체인 지정
3. **Memo 프로토콜**: THORChain 스왑 memo 구성 (=:CHAIN.ASSET:DEST_ADDR:LIMIT:AFFILIATE:FEE)
4. **비동기 추적**: 크로스체인 스왑은 수분 소요 → checkStatus() + ActionProviderTrackingResult
5. **슬리피지 보호**: quote 기반 최소 수량 설정, 풀 깊이 경고
6. **MCP/SDK 도구**: thorchain_swap, thorchain_quote, thorchain_status, thorchain_pools
7. **Admin UI**: THORChain 활성화 설정, 크로스체인 스왑 내역

### 제외

- THORChain 유동성 공급 (LP) — 에이전트 유스케이스에 부적합
- THORChain Savers (단일 자산 예금)
- Streaming Swaps 고급 옵션 (대규모 스왑 분할 실행)
- THORNames (네이밍 서비스)

---

## 기술 설계 포인트

### 스왑 흐름

```
1. GET /thorchain/quote/swap?from=XRP.XRP&to=ETH.ETH&amount=1000000
   → expected_amount_out, fees, expiry, inbound_address, memo

2. 소스 체인(XRPL)에서 inbound_address로 XRP 전송
   - memo 필드에 THORChain 스왑 지시 포함
   - 예: "=:ETH.ETH:0xDEST:100000:t:30"

3. THORChain이 관찰 → RUNE 풀 스왑 → 대상 체인으로 출금

4. Midgard API로 상태 추적
   GET /v2/actions?txid=SOURCE_TX_HASH
```

### ApiDirectResult 패턴 vs 온체인 패턴

THORChain 스왑은 **소스 체인에서 일반 전송**으로 시작한다. 따라서:
- XRP → ETH 스왑: RippleAdapter로 XRP 전송 (memo 포함) → THORChain이 처리
- ETH → XRP 스왑: EvmAdapter로 ETH 전송 (calldata=memo) → THORChain이 처리
- SOL → ETH 스왑: SolanaAdapter로 SOL 전송 (memo 포함) → THORChain이 처리

기존 파이프라인의 TRANSFER 타입을 활용하되, memo에 THORChain 프로토콜 지시를 인코딩하는 구조.

### 크로스체인 상태 추적

기존 LI.FI(v28.3)의 bridgeStatus/bridgeMetadata 패턴을 재활용:
- transactions.bridgeStatus: 'pending' → 'completed' / 'refunded'
- transactions.bridgeMetadata: THORChain tx hash, 소스/대상 체인 정보

---

## 선행 마일스톤

- **m33-06**: XRP 메인넷 지원 (XRP 소스/대상 체인으로 사용 시 필요)
- 단, EVM↔Solana 등 XRP 미관여 스왑은 m33-06 없이도 가능

## 후속 마일스톤

- 없음 (독립 완결)
