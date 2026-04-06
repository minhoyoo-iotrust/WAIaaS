# Feature Landscape: XRPL DEX Action Provider

**Domain:** XRPL 네이티브 오더북 DEX (OfferCreate/OfferCancel) Action Provider
**Researched:** 2026-04-03

## Table Stakes

사용자(AI 에이전트)가 XRPL DEX를 사용할 때 당연히 기대하는 기능. 없으면 불완전.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 즉시 스왑 (OfferCreate + tfImmediateOrCancel) | DEX의 기본 기능. 오더북에 존재하는 호가를 소비하여 즉시 체결. 미체결 잔량은 자동 취소. | Med | tfImmediateOrCancel 플래그로 시장가 스왑 시뮬레이션. `tecKILLED` 결과 코드 처리 필요 (ImmediateOfferKilled 개정). |
| 지정가 주문 (OfferCreate, 플래그 없음) | 오더북 DEX의 핵심 가치. 원하는 가격에 주문을 걸어두고 체결 대기. | Med | 주문이 레저 오브젝트로 잔류, owner reserve 10 XRP 소비. Expiration 필드로 유효기간 설정 가능. |
| 주문 취소 (OfferCancel) | 지정가 주문의 필수 짝. 미체결 주문을 명시적으로 제거. | Low | OfferSequence(주문 생성 시의 Sequence 번호)만 필요. 이미 체결/취소된 주문도 tesSUCCESS 반환 (멱등). |
| 오더북 조회 (book_offers RPC) | 스왑 전 호가 확인, 슬리피지 예측에 필수. | Low | 읽기 전용 RPC. `owner_funds`, `taker_gets_funded`/`taker_pays_funded`(부분 펀딩) 필드 제공. |
| 내 활성 주문 조회 (account_offers RPC) | 에이전트가 자신의 미체결 주문 목록을 확인할 수 있어야 함. | Low | 읽기 전용 RPC. 페이지네이션(marker) 지원. |
| XRP <-> IOU 스왑 | XRPL DEX의 가장 일반적인 거래 쌍. drops 단위 변환 필수. | Low | TakerGets/TakerPays 중 하나가 XRP(drops 문자열), 하나가 IOU({currency, issuer, value}) 객체. |
| IOU <-> IOU 스왑 | Trust Line 토큰 간 직접 거래. Auto-bridging으로 XRP를 중간 매개로 활용. | Low | XRPL 프로토콜이 auto-bridging을 자동 수행. Provider 측에서 특별한 처리 불필요. |
| 슬리피지 보호 | AI 에이전트가 불리한 가격에 실행되는 것 방지. | Med | tfImmediateOrCancel은 오더북 소비만 하므로 예상 밖 슬리피지 제한적. book_offers로 사전 예측 가능. tfFillOrKill로 전량 체결 보장 옵션 추가. |
| MCP/SDK 도구 노출 | 기존 Action Provider SSoT 패턴. mcpExpose: true로 MCP 자동 노출. | Low | xrpl_dex_swap, xrpl_dex_limit_order, xrpl_dex_cancel_order, xrpl_dex_orderbook, xrpl_dex_get_offers — 5 도구. |
| Admin UI 활성화 설정 | 기존 Provider Settings SSoT 패턴. enabled/disabled 토글. | Low | enabledKey 기반 Admin Settings 연동. API 키 불필요 (네이티브 프로토콜). |

## Differentiators

기대하지 않지만 있으면 가치 있는 기능. 경쟁 우위.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fill-or-Kill 모드 (tfFillOrKill) | 전량 체결 보장 — 부분 체결 리스크 제거. 대량 거래 에이전트에게 유용. | Low | OfferCreate 플래그 옵션. fixFillOrKill 개정으로 교차 주문 처리 개선됨. `tecKILLED` 에러 처리. |
| Sell 모드 (tfSell) | 정확한 매도량 소진 보장. "이 토큰 X개를 전부 팔아라" 시나리오. | Low | tfSell 플래그. 예상보다 많이 받을 수 있음 (유리한 방향). |
| Passive 주문 (tfPassive) | 메이커 전용 주문. 기존 호가를 소비하지 않고 오더북에만 추가. 스프레드 캡처용. | Low | tfPassive 플래그. 마켓 메이킹 에이전트에게 유용. |
| 주문 교체 (OfferCreate + OfferSequence) | 기존 주문 취소 + 신규 주문 생성을 단일 트랜잭션으로 원자적 실행. | Low | OfferCreate의 OfferSequence 필드 활용. 별도 OfferCancel 불필요. |
| 부분 체결 상태 추적 | 지정가 주문의 현재 체결량/잔여량 표시. ExternalActionTracker checkStatus() 연동. | Med | account_offers로 현재 잔여량 조회. 원래 주문량과 비교하여 체결 비율 계산. PARTIALLY_FILLED 상태 지원. |
| Expiration 자동 설정 | 지정가 주문에 유효기간 자동 부여. 에이전트가 잊어버린 주문이 영구 잔류하는 것 방지. | Low | XRPL Epoch 초 단위 Expiration 필드. 기본값 24h 등 Admin Settings로 설정 가능. |
| 오더북 깊이 요약 | book_offers 원시 응답을 매수/매도 측 가격 레벨별 집계로 가공. 에이전트가 시장 상황을 빠르게 파악. | Med | 호가를 가격 구간별로 그룹화, 누적 수량 계산, 스프레드 표시. |
| 스왑 견적 (quote) | 실제 실행 전에 예상 수령량/가격 조회. book_offers 기반 시뮬레이션. | Med | 오더북 상위 N개 호가를 순차 소비하여 예상 체결가 계산. 슬리피지 사전 표시. |

## Anti-Features

명시적으로 구현하지 않을 기능.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| 자동 마켓 메이킹 전략 | WAIaaS는 인프라(지갑+서명+정책)이지 트레이딩 봇이 아님. 전략 로직은 에이전트 레이어의 책임. | 에이전트가 limit_order/cancel_order를 조합하여 자체 전략 구현. |
| XRPL AMM (XLS-30) 통합 | 별도 유동성 소스. m33-10 후속 마일스톤으로 분리. 오더북 DEX와 AMM은 독립적 기능. | m33-10에서 AMM 전용 Action Provider로 구현. XRPL 프로토콜이 OfferCreate 실행 시 AMM 유동성도 자동 고려하므로 당장은 오더북만으로도 간접 활용됨. |
| 크로스체인 DEX/브릿지 | XRPL <-> 타 체인 스왑은 범위 초과. LI.FI, Across 등 기존 브릿지 Provider 활용. | m33-12 후속 마일스톤. |
| Pathfinding (ripple_path_find) | XRPL의 최적 경로 탐색(5-hop intermediary). 복잡도가 높고 Payment 트랜잭션과 결합 필요. DEX 오더북과는 다른 메커니즘. | 추후 Payment 경로 최적화 마일스톤에서 검토. 현재는 직접 거래쌍의 오더북 스왑에 집중. |
| Permissioned DEX (DomainID) | 2025년 도입된 신기능. 사용 사례가 극히 제한적 (규제 준수 기관용). | 수요 발생 시 DomainID 필드 추가로 확장 가능. |

## Feature Dependencies

```
기존 RippleAdapter (v33.6) → XrplDexProvider 전체 기능
  ├── Trust Line 토큰 인프라 → IOU 거래쌍 지원
  ├── drops 변환 유틸 (address-utils.ts) → XRP 금액 처리
  └── currency-utils.ts (parseTrustLineToken, iouToSmallestUnit) → IOU 금액 변환

ContractCallRequestSchema 확장 → OfferCreate/OfferCancel 트랜잭션 빌드
  ├── XRPL 전용 필드 추가 (xrplTxType, xrplFields) 또는
  └── RippleAdapter.buildContractCall() 확장

Action Provider 프레임워크 (v1.5) → Provider 등록/설정/MCP 노출
  ├── ActionProviderRegistry → 자동 등록
  ├── mcpExpose: true → MCP 도구 자동 생성
  └── Admin Settings → 활성화 토글

book_offers RPC (읽기) → 오더북 조회, 스왑 견적
account_offers RPC (읽기) → 활성 주문 조회, 부분 체결 추적

즉시 스왑 (tfImmediateOrCancel) → 슬리피지 보호
지정가 주문 → 주문 취소
지정가 주문 → 부분 체결 추적
지정가 주문 → 주문 교체 (OfferSequence)
```

## MVP Recommendation

**1차 우선순위 (Table Stakes -- 반드시 포함):**

1. **즉시 스왑** (OfferCreate + tfImmediateOrCancel) -- 가장 빈번한 사용 시나리오
2. **지정가 주문** (OfferCreate, 플래그 없음) -- 오더북 DEX의 핵심 가치
3. **주문 취소** (OfferCancel) -- 지정가의 필수 짝
4. **오더북 조회** (book_offers) -- 스왑 전 호가 확인
5. **내 활성 주문 조회** (account_offers) -- 에이전트 자기 인식
6. **MCP/SDK 도구 노출** -- SSoT 패턴 준수

**2차 우선순위 (Differentiators -- 같이 구현하면 좋음, 복잡도 낮음):**

7. **Fill-or-Kill 모드** -- 즉시 스왑의 플래그 옵션, 추가 구현 비용 미미
8. **Sell 모드** -- 동일, 플래그 옵션
9. **주문 교체** -- OfferCreate의 OfferSequence 필드 활용, 추가 비용 미미
10. **Expiration 자동 설정** -- Expiration 필드 설정만으로 구현

**Defer:**

- **Passive 주문**: 마켓 메이킹 시나리오. 수요 확인 후 추가.
- **오더북 깊이 요약**: 편의 기능. 에이전트가 원시 데이터로도 판단 가능.
- **스왑 견적 (quote)**: 유용하지만, 즉시 스왑 자체가 오더북 소비이므로 실행 결과가 곧 최종 가격. 필요 시 book_offers 직접 분석.
- **부분 체결 추적**: ExternalActionTracker 연동 필요. 복잡도 대비 초기 가치 낮음.

## 핵심 설계 도전: ContractCallRequest 확장

현재 `ContractCallRequestSchema`는 EVM(`calldata`, `abi`, `value`)과 Solana(`programId`, `instructionData`, `accounts`) 전용 필드만 보유. RippleAdapter의 `buildContractCall()`은 `'XRPL does not support smart contracts'` 에러를 던짐.

XRPL DEX Provider가 반환하는 OfferCreate/OfferCancel 트랜잭션을 파이프라인에 전달하려면:

**Option A**: ContractCallRequestSchema에 XRPL 전용 필드 추가 (`xrplTxType`, `xrplFields`)
- 장점: 타입 안전, 명시적
- 단점: 스키마 확장, 기존 ContractCallRequest 검증 로직 수정 필요

**Option B**: 기존 `calldata` 필드에 JSON 직렬화된 XRPL 트랜잭션 인코딩
- 장점: 스키마 변경 없음
- 단점: 타입 안전성 약화, 우회적

**Option C**: RippleAdapter.buildContractCall()을 XRPL 네이티브 트랜잭션 빌더로 확장
- 장점: 어댑터 레이어에서 해결, Provider는 파라미터만 전달
- 단점: "Contract Call"이라는 이름과 의미 불일치 (하지만 이미 Solana도 "Contract Call"이 아닌 프로그램 호출을 이 경로로 처리)

**권장**: Option C. Solana 선례가 있고 (programId/instructionData도 스마트 컨트랙트 호출이 아닌 프로그램 인스트럭션), RippleAdapter.buildContractCall()이 `xrplTxType`을 기준으로 OfferCreate/OfferCancel 트랜잭션을 빌드하면 파이프라인 변경 최소화. ContractCallRequestSchema에 optional `xrplTxType` + `xrplFields` 필드만 추가.

## Sources

- [OfferCreate 공식 문서](https://xrpl.org/docs/references/protocol/transactions/types/offercreate) -- HIGH confidence
- [OfferCancel 공식 문서](https://xrpl.org/docs/references/protocol/transactions/types/offercancel) -- HIGH confidence
- [book_offers RPC](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/book_offers) -- HIGH confidence
- [account_offers RPC](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_offers) -- HIGH confidence
- [Auto-Bridging 개념](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/autobridging) -- HIGH confidence
- [XRPL Offers 개념](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/offers) -- HIGH confidence
- [XLS-30 AMM 통합](https://xrpl.org/blog/2024/deep-dive-into-amm-integration) -- HIGH confidence
- 기존 코드베이스 분석: IActionProvider, ContractCallRequestSchema, RippleAdapter -- HIGH confidence
- m33-08 목표 문서 (internal/objectives/m33-08-xrpl-dex.md) -- HIGH confidence
