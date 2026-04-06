# Domain Pitfalls: XRPL DEX Action Provider

**Domain:** XRPL native orderbook DEX integration into existing WAIaaS multi-chain wallet system
**Researched:** 2026-04-03
**Confidence:** HIGH (XRPL 공식 문서 + xrpl.js 소스 + 기존 코드베이스 분석)

---

## Critical Pitfalls

치명적 실수: 리라이트 또는 자금 손실을 유발하는 문제.

---

### Pitfall 1: XRP/IOU 금액 포맷 혼동 -- TakerGets/TakerPays 이종 포맷

**What goes wrong:**
OfferCreate 트랜잭션에서 TakerGets와 TakerPays가 서로 다른 포맷을 사용한다. XRP는 drops 문자열(`"50000000"`), IOU는 객체(`{currency, issuer, value}`)이다. XRP <-> IOU 스왑 시 한쪽은 문자열, 한쪽은 객체로 혼합해야 하는데, 양쪽 모두 같은 포맷으로 직렬화하면 `temBAD_OFFER` 또는 `temBAD_AMOUNT` 오류가 발생한다. 더 위험한 경우는 amount 단위를 잘못 넣는 것: XRP를 drops가 아닌 whole unit(예: `"50"`)으로 넣으면 0.00005 XRP만 오퍼에 걸린다.

**Why it happens:**
- 기존 WAIaaS의 모든 Action Provider(Jupiter, 0x, Aave 등)는 EVM/Solana 기반이라 금액이 항상 `bigint` smallest-unit 단일 포맷
- ContractCallRequest 스키마에 `value` 필드가 하나만 있고, XRPL DEX는 TakerGets/TakerPays 2개의 이종 금액이 필요
- IOU의 `value`는 string 소수점 표기(`"100.5"`)이고, 기존 WAIaaS는 bigint smallest-unit(`100500000000000000n`)으로 통일. 변환 누락 시 의도와 전혀 다른 금액 주문

**Consequences:**
- 잘못된 금액으로 오퍼 생성 -> 시장가 대비 극단적 환율로 체결 -> 즉시 자금 손실
- `temBAD_AMOUNT` 에러로 트랜잭션 실패 -> AI 에이전트 작업 중단
- IOU value를 bigint로 그대로 넣으면 (`"100500000000000000"`) XRPL이 15자리 유효숫자 초과로 거부하거나 엉뚱한 값으로 해석

**Prevention:**
```typescript
// XrplDexProvider.resolve() 내부에서 반드시 변환
function formatXrplAmount(
  currency: string,
  amount: bigint,
  issuer?: string,
): string | { currency: string; issuer: string; value: string } {
  if (currency === 'XRP') {
    // XRP: bigint drops -> string drops
    return amount.toString();
  }
  // IOU: bigint smallest-unit -> decimal string
  return {
    currency,
    issuer: issuer!,
    value: smallestUnitToIou(amount, IOU_DECIMALS),
  };
}
```
- XrplDexProvider 내부에서 TakerGets/TakerPays를 각각 올바른 포맷으로 변환하고, 단위 테스트에서 XRP-IOU, IOU-IOU, IOU-XRP 3가지 조합 모두 검증
- XRP currency를 `"XRP"` 문자열로 받되, issuer가 있으면 `temBAD_AMOUNT` 발생하므로 issuer 필드 포함 금지

**Detection:**
- `temBAD_AMOUNT`, `temBAD_OFFER` 에러 코드
- 매우 작은 금액(drops 단위 혼동) 또는 매우 큰 금액(IOU 변환 누락)의 오퍼 생성

**Phase to address:** Action Provider 구현 (XrplDexProvider.resolve) -- 첫 번째 단계

---

### Pitfall 2: OfferCreate가 ContractCallRequest에 맞지 않는 구조

**What goes wrong:**
기존 IActionProvider.resolve()는 `ContractCallRequest`(calldata/programId/accounts 기반)를 반환한다. XRPL OfferCreate는 스마트 컨트랙트가 아닌 네이티브 트랜잭션 타입이라, calldata/programId가 존재하지 않는다. RippleAdapter.buildContractCall()은 현재 `throw new ChainError('INVALID_INSTRUCTION', 'ripple', { message: 'XRPL does not support smart contracts' })`를 던진다. Action Provider가 ContractCallRequest를 반환하면 Stage 5에서 buildContractCall 호출 시 에러 발생.

**Why it happens:**
- ContractCallRequest 스키마가 EVM/Solana 중심으로 설계: `calldata`, `programId`, `instructionData` 등 스마트 컨트랙트 전용 필드
- XRPL DEX는 `TransactionType: "OfferCreate"`, `TakerGets`, `TakerPays`, `Flags` 등 전혀 다른 필드 구조
- Stage 5 buildByType()이 `CONTRACT_CALL` 타입을 받으면 `adapter.buildContractCall()`을 호출하는데, RippleAdapter는 이를 지원하지 않음

**Consequences:**
- 파이프라인 실행 시 `INVALID_INSTRUCTION` 에러로 전체 스왑 실패
- 또는 ContractCallRequest에 XRPL 필드를 억지로 끼워넣으면 Zod 스키마 검증 실패

**Prevention:**
RippleAdapter에 `buildContractCall()` 확장이 필요. XRPL-specific 필드를 ContractCallRequest의 기존 필드에 매핑하는 전략:

**Option A (추천): ContractCallRequest 필드 재활용**
```typescript
// XrplDexProvider.resolve() 반환:
{
  type: 'CONTRACT_CALL',
  to: walletAddress, // self (OfferCreate의 Account)
  // XRPL-specific payload를 calldata JSON으로 인코딩
  calldata: JSON.stringify({
    TransactionType: 'OfferCreate',
    TakerGets: formatXrplAmount(...),
    TakerPays: formatXrplAmount(...),
    Flags: tfImmediateOrCancel,
  }),
  actionProvider: 'xrpl_dex',
  actionName: 'swap',
}

// RippleAdapter.buildContractCall() 확장:
async buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction> {
  if (request.calldata) {
    try {
      const parsed = JSON.parse(request.calldata);
      if (parsed.TransactionType === 'OfferCreate' || parsed.TransactionType === 'OfferCancel') {
        return this.buildOfferTransaction(request.from, parsed);
      }
    } catch { /* not JSON, fall through */ }
  }
  throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
    message: 'XRPL does not support smart contracts',
  });
}
```
- Stage 5 buildByType() 변경 없음 (CONTRACT_CALL -> buildContractCall 경로 기존 유지)
- RippleAdapter 내부에서 calldata JSON 파싱으로 OfferCreate/OfferCancel 분기

**Detection:**
- `INVALID_INSTRUCTION` 에러 + chain='ripple' 조합
- Action Provider 등록 후 첫 실행 시 즉시 실패

**Phase to address:** Adapter 확장 + Provider 구현 단계 -- buildContractCall 확장이 Provider 구현의 선행 조건

---

### Pitfall 3: Owner Reserve 미계산 -- 오퍼 생성 시 잔액 부족

**What goes wrong:**
XRPL에서 오퍼(Offer 객체)를 레저에 남기면 owner reserve가 추가로 필요하다. 현재 owner reserve는 **0.2 XRP**(200,000 drops)이다. 지정가 주문(limit order)으로 오퍼를 3개 생성하면 0.6 XRP가 추가로 잠긴다. AI 에이전트가 잔액이 빠듯한 상태에서 여러 지정가 주문을 넣으면 `tecINSUF_RESERVE_OFFER` 에러로 실패한다.

**Why it happens:**
- 기존 WAIaaS의 swap provider(Jupiter, 0x)는 즉시 실행이라 reserve 개념 없음
- tfImmediateOrCancel 스왑은 레저에 오퍼를 남기지 않아 reserve 불필요. 그러나 limit_order는 레저 오퍼 객체를 생성하므로 reserve 필요
- v33.6에서 구현한 reserve 조회(serverInfo.ownerReserve)는 잔액 검증용이지, "새 오퍼 생성 시 필요한 추가 reserve" 사전 검증은 없음

**Consequences:**
- `tecINSUF_RESERVE_OFFER`로 트랜잭션 실패 (수수료만 소모)
- 부분 체결 후 잔여분을 레저에 남기려 할 때도 reserve 부족이면 잔여분이 자동 취소됨 (tesSUCCESS이지만 오퍼 미생성)

**Prevention:**
- limit_order 실행 전 available balance >= sell amount + ownerReserve(200,000 drops) 사전 검증
- swap(tfImmediateOrCancel)은 reserve 검증 불필요 -- 레저에 남지 않음
- get_offers 결과에 현재 활성 오퍼 수를 표시하여 AI 에이전트가 reserve 상황 인지 가능
- 사전 검증 실패 시 명확한 에러 메시지: "Insufficient XRP: need {amount} XRP reserve for new offer (current offers: {count})"

**Detection:**
- `tecINSUF_RESERVE_OFFER` 에러 코드
- tesSUCCESS인데 오퍼가 레저에 없는 경우 (부분 체결 후 잔여분 자동 취소)

**Phase to address:** Action Provider 구현 -- limit_order 액션 구현 시

---

### Pitfall 4: 부분 체결 결과 해석 오류 -- tesSUCCESS와 실제 체결량 불일치

**What goes wrong:**
XRPL DEX의 tesSUCCESS는 "트랜잭션이 적용되었다"는 의미이지 "주문이 완전히 체결되었다"는 의미가 아니다. tfImmediateOrCancel 스왑에서 tesSUCCESS를 받았지만 실제로 0 토큰이 교환된 경우도 있다 (fix1578 amendment 이전). fix1578 이후에는 이 경우 tecKILLED를 반환하지만, **부분 체결**(요청한 것보다 적은 금액만 교환됨)은 여전히 tesSUCCESS이다.

**Why it happens:**
- 기존 DEX Provider(Jupiter, 0x)는 외부 API가 예상 수량을 미리 계산해주고, 슬리피지 내에서 실행 보장
- XRPL 오더북은 오더북 깊이에 따라 체결량이 가변적이고, API가 아닌 온레저 매칭
- 트랜잭션 메타데이터의 `AffectedNodes`를 파싱해야 실제 체결량을 알 수 있음

**Consequences:**
- AI 에이전트가 "스왑 성공"으로 판단하지만 실제 토큰을 받지 못했거나 매우 적게 받음
- USD 지출 한도 계산이 실제 체결량과 다름 (정책 엔진 정합성 문제)
- 사용자에게 실제 체결 결과를 잘못 표시

**Prevention:**
- 트랜잭션 제출 후 `tx` RPC로 확인할 때, 메타데이터에서 실제 체결량 파싱:
  ```typescript
  // meta.delivered_amount (Payment에서만 보장)은 OfferCreate에 없음
  // AffectedNodes에서 ModifiedNode(Offer/RippleState)의 FinalFields/PreviousFields 비교로 계산
  ```
- tfImmediateOrCancel 스왑 결과에서 `tecKILLED` 처리 필수 (오더북 유동성 없음)
- 최소 수량(minReceived) 검증 로직 구현: 슬리피지 보호로 기대 수량의 X% 미만이면 에러 반환
- 응답에 `actualAmountIn`/`actualAmountOut` 필드를 포함하여 AI 에이전트가 실제 결과 인지

**Detection:**
- tesSUCCESS인데 잔액 변화가 없거나 예상보다 현저히 적은 경우
- tecKILLED 에러 코드 (유동성 부족으로 즉시 실행 불가)

**Phase to address:** Provider 구현 + 결과 해석 단계

---

## Moderate Pitfalls

---

### Pitfall 5: Trust Line 미설정 상태에서 IOU 오퍼 생성

**What goes wrong:**
XRPL에서 IOU 토큰을 받으려면 해당 발행자에 대한 Trust Line이 먼저 설정되어 있어야 한다. Trust Line 없이 IOU를 TakerPays(받을 토큰)로 지정한 OfferCreate는 `tecUNFUNDED_OFFER`로 실패하거나, 체결 시 상대방의 IOU 전송이 `tecPATH_DRY`로 실패한다.

**Why it happens:**
- EVM DEX(Uniswap, 0x)에서는 ERC-20 토큰을 받는 데 사전 설정이 필요 없음
- AI 에이전트가 "USD 토큰을 사려면 먼저 Trust Line을 설정해야 한다"는 개념을 모름
- XRP -> IOU 스왑 시: XRP는 Trust Line 불필요, IOU 수신에만 필요

**Prevention:**
- XrplDexProvider.resolve() 내부에서 TakerPays가 IOU인 경우 `account_lines` RPC로 해당 Trust Line 존재 여부 사전 확인
- Trust Line 미설정 시 2-step 트랜잭션: (1) TrustSet -> (2) OfferCreate. ContractCallRequest[] 배열 반환으로 기존 multi-step 패턴 활용
- 또는 명확한 에러 메시지로 "Trust Line for {currency}.{issuer} required. Use xrpl_trust_set first."

**Detection:**
- `tecUNFUNDED_OFFER` 에러 + IOU TakerPays 조합
- `tecPATH_DRY` 에러 (Trust Line 경로 없음)

**Phase to address:** Provider 구현 -- swap/limit_order resolve() 내부 사전 검증

---

### Pitfall 6: USD 지출 한도 계산에서 XRPL DEX 누락

**What goes wrong:**
기존 `resolveEffectiveAmountUsd()`는 TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH 5가지 타입만 처리한다. XRPL DEX 오퍼가 CONTRACT_CALL 타입으로 파이프라인에 들어오면, `value` 필드(EVM native token value)로 USD를 계산하려 하는데, XRPL DEX 오퍼에는 `value` 필드가 없거나 의미가 다르다. 결과적으로 USD 지출 한도가 $0으로 계산되어 정책 우회가 가능하다.

**Why it happens:**
- CONTRACT_CALL의 USD 계산은 `req.value`(= 컨트랙트에 보내는 native token 양)를 기준으로 함
- XRPL OfferCreate의 실제 지출은 TakerGets(내가 내놓는 것)이지만, 이 정보가 calldata JSON 안에 묻혀 있어 resolveEffectiveAmountUsd가 접근 불가
- `actionProvider` 태그가 있어도 현재 spending limit evaluator는 txType별 분기만 함

**Consequences:**
- 실제로 $10,000 상당의 XRP를 DEX에서 매도하는 오퍼도 USD 지출 한도에 $0으로 반영
- 일일 지출 한도($1,000/day) 정책이 DEX 거래에 무효화
- 보안 취약점: AI 에이전트가 정책 제한 없이 무제한 DEX 거래 가능

**Prevention:**
- XrplDexProvider.resolve()가 ContractCallRequest에 `value` 필드를 적절히 설정:
  - TakerGets가 XRP인 경우: `value = TakerGets drops 값` (native token value)
  - TakerGets가 IOU인 경우: 별도 처리 필요 (IOU USD 가치는 priceOracle로 조회)
- 또는 ContractCallRequest에 `actionProvider` + `actionName` 태그를 활용하여 spending limit evaluator에서 XRPL DEX 전용 분기 추가
- 가장 안전한 접근: swap의 경우 TakerGets 금액을 USD로 환산하여 `policyContext.notionalUsd`에 설정

**Detection:**
- DEX 거래의 spending_amount_usd가 0인 감사 로그
- 높은 금액의 DEX 거래가 INSTANT 티어로 처리되는 경우

**Phase to address:** Policy 통합 단계 -- resolveEffectiveAmountUsd 확장 또는 policyContext 활용

---

### Pitfall 7: Sequence Number 충돌 -- 동시 오퍼 생성/취소 시

**What goes wrong:**
XRPL 트랜잭션은 `Sequence` 번호가 필수이며 순차적이어야 한다. AI 에이전트가 빠르게 여러 오퍼를 생성하거나, 오퍼 생성과 취소를 동시에 요청하면 같은 Sequence를 사용하여 `tefPAST_SEQ` 또는 `tefMAX_LEDGER` 에러가 발생한다. xrpl.js의 `client.autofill()`이 Sequence를 자동 설정하지만, 비동기로 여러 트랜잭션을 동시에 autofill하면 같은 Sequence를 받는다.

**Why it happens:**
- EVM은 nonce 관리를 `getTransactionCount`로 하고, Solana는 nonce 개념 없음
- 기존 WAIaaS 파이프라인은 트랜잭션을 순차 처리하므로 단일 트랜잭션에서는 문제없음
- 그러나 limit_order 3개를 연속 요청하면 각각 별도의 파이프라인으로 들어가고, autofill이 동시 호출

**Prevention:**
- RippleAdapter에 Sequence 번호 로컬 카운터 구현 (EVM nonce 관리와 유사):
  ```typescript
  private pendingSequence: number | null = null;
  
  async getNextSequence(address: string): Promise<number> {
    if (this.pendingSequence !== null) {
      return ++this.pendingSequence;
    }
    const info = await this.client.request({ command: 'account_info', account: address });
    this.pendingSequence = info.result.account_data.Sequence;
    return this.pendingSequence;
  }
  ```
- 또는 xrpl.js의 autofill에 `Sequence` 필드를 명시적으로 전달하여 충돌 방지
- 파이프라인 레벨에서 XRPL 트랜잭션을 직렬화하는 것도 대안이지만 성능 저하

**Detection:**
- `tefPAST_SEQ` 에러 (이미 사용된 Sequence)
- `tefMAX_LEDGER` 에러 (LastLedgerSequence 초과)
- 같은 Sequence의 두 트랜잭션 중 하나만 성공

**Phase to address:** Adapter 확장 단계 -- buildContractCall 내부 Sequence 관리

---

### Pitfall 8: OfferCancel에 잘못된 OfferSequence 지정

**What goes wrong:**
OfferCancel 트랜잭션은 취소할 오퍼의 `OfferSequence`(오퍼 생성 시 사용된 Sequence 번호)를 지정해야 한다. 잘못된 OfferSequence를 지정하면 `temBAD_OFFER` 에러가 발생한다. 이미 체결되거나 만료된 오퍼의 OfferSequence를 지정하면 `tecNO_ENTRY` 에러가 발생한다.

**Why it happens:**
- AI 에이전트가 get_offers로 조회한 오퍼 목록의 Sequence와 OfferCancel의 OfferSequence를 혼동
- 부분 체결된 오퍼의 Sequence는 변하지 않지만, 완전 체결되면 레저에서 제거됨
- 시간 경과로 오퍼가 만료되었는데 취소를 시도

**Prevention:**
- cancel_order 실행 전 `account_offers` RPC로 해당 OfferSequence가 아직 활성인지 확인
- get_offers 응답에 `seq` (OfferSequence) 필드를 명확히 포함하여 AI 에이전트가 정확한 값 사용
- 취소 실패 시 `tecNO_ENTRY`를 "이미 체결되었거나 만료된 주문" 메시지로 변환

**Detection:**
- `temBAD_OFFER`, `tecNO_ENTRY` 에러 코드
- 잘못된 OfferSequence로 다른 사람의 오퍼 취소 시도는 프로토콜이 차단 (Account 불일치)

**Phase to address:** Provider 구현 -- cancel_order 액션

---

### Pitfall 9: Offer Quality(환율) 역방향 해석

**What goes wrong:**
XRPL 오더북에서 offer quality는 `TakerPays / TakerGets` 비율이다. 이것은 "테이커가 지불할 금액 / 테이커가 받을 금액"인데, 테이커와 메이커 관점에서 buy/sell이 뒤집힌다. book_offers 응답의 `quality` 필드를 그대로 사용자에게 보여주면 "1 USD = 0.5 XRP" vs "1 XRP = 2 USD"가 헷갈린다.

**Why it happens:**
- EVM DEX API(0x, Jupiter)는 `buyAmount`/`sellAmount` 또는 `inAmount`/`outAmount`로 직관적
- XRPL의 TakerGets/TakerPays는 "테이커 관점"이라 오퍼 생성자(메이커) 관점에서는 반대
- `book_offers` RPC의 응답에서 ask/bid 방향이 taker_gets/taker_pays 기준이라 혼동 발생

**Prevention:**
- get_orderbook 응답에 `price`(사람이 읽는 환율)와 `inversePrice`를 모두 포함
- 명확한 라벨: "1 {base} = {price} {quote}" 포맷으로 통일
- XrplDexProvider 내부에서 가격 계산 유틸리티 함수 구현:
  ```typescript
  function calculatePrice(takerGets: Amount, takerPays: Amount): number {
    const getsValue = parseAmountValue(takerGets);
    const paysValue = parseAmountValue(takerPays);
    return paysValue / getsValue; // 테이커 관점 가격
  }
  ```

**Detection:**
- AI 에이전트가 환율을 역으로 해석하여 의도와 반대 방향 주문
- 오더북 표시에서 bid/ask가 뒤집힌 경우

**Phase to address:** Provider 구현 -- get_orderbook 액션

---

## Minor Pitfalls

---

### Pitfall 10: tx-parser.ts에 OfferCreate/OfferCancel 파싱 누락

**What goes wrong:**
현재 `parseRippleTransaction()`은 `Payment`과 `TrustSet`만 처리하고, 나머지는 `UNKNOWN` 타입으로 반환한다. sign-only 모드에서 OfferCreate/OfferCancel 트랜잭션이 들어오면 `UNKNOWN`으로 처리되어 정책 평가가 부정확해진다.

**Prevention:**
- tx-parser.ts에 OfferCreate/OfferCancel 파싱 추가:
  - OfferCreate -> `CONTRACT_CALL` (또는 새 타입 매핑) + amount 추출(TakerGets)
  - OfferCancel -> `APPROVE` 유사 (금전적 가치 없음, 인덱스 지정)

**Phase to address:** tx-parser 확장 단계

---

### Pitfall 11: LastLedgerSequence 만료로 인한 지정가 주문 조기 취소

**What goes wrong:**
xrpl.js의 `autofill()`이 자동으로 `LastLedgerSequence`를 현재 + 20 레저(약 80초)로 설정한다. 이는 일반 전송에는 적절하지만, 지정가 주문은 오랫동안 레저에 남아있어야 한다. LastLedgerSequence에 의해 트랜잭션 자체가 거부되는 것은 아니지만(이미 제출/검증됨), 오퍼 자체에 `Expiration` 필드를 별도로 설정하지 않으면 영구히 남는다.

**Prevention:**
- OfferCreate에 `Expiration` 필드를 설정하되, Ripple epoch(2000-01-01 기준)으로 변환 필요:
  ```typescript
  const RIPPLE_EPOCH = 946684800; // 2000-01-01 UTC in Unix seconds
  const expiration = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH + ttlSeconds;
  ```
- 지정가 주문 기본 만료: 24시간 (사용자 커스텀 가능)
- 즉시 스왑(tfImmediateOrCancel)은 Expiration 불필요 (즉시 실행 또는 취소)

**Phase to address:** Provider 구현 -- limit_order 액션

---

### Pitfall 12: Admin UI에서 DEX 트랜잭션 표시 누락

**What goes wrong:**
트랜잭션 목록/상세에서 OfferCreate/OfferCancel 트랜잭션이 `CONTRACT_CALL` 타입으로 표시되면 사용자가 "어떤 컨트랙트를 호출했는가?"로 혼동한다. ContractNameRegistry가 XRPL DEX 오퍼를 인식하지 못하면 계약 이름이 "Unknown"으로 표시된다.

**Prevention:**
- ContractNameRegistry에 XRPL DEX 관련 엔트리 추가 (Action Provider displayName 활용: "XRPL DEX")
- 트랜잭션 상세 응답에 actionProvider/actionName 태그 포함
- Admin UI의 트랜잭션 활동 탭에서 "XRPL DEX Swap" / "XRPL DEX Limit Order" 라벨 표시

**Phase to address:** Admin UI 통합 단계

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Adapter 확장 (buildContractCall) | Pitfall 2: CONTRACT_CALL 구조 불일치 | calldata JSON 기반 XRPL 트랜잭션 분기 |
| Adapter 확장 (buildContractCall) | Pitfall 7: Sequence 충돌 | 로컬 Sequence 카운터 또는 직렬화 |
| Provider 구현 (swap) | Pitfall 1: 금액 포맷 혼동 | formatXrplAmount 유틸 + 3조합 테스트 |
| Provider 구현 (swap) | Pitfall 4: 부분 체결 해석 | tecKILLED 처리 + 메타데이터 파싱 |
| Provider 구현 (swap) | Pitfall 5: Trust Line 미설정 | 사전 account_lines 검증 or 2-step |
| Provider 구현 (limit_order) | Pitfall 3: Reserve 미계산 | available balance + ownerReserve 사전 검증 |
| Provider 구현 (limit_order) | Pitfall 11: 만료 시간 | Ripple epoch 변환 + 기본 24h 만료 |
| Provider 구현 (cancel_order) | Pitfall 8: OfferSequence 오류 | account_offers 사전 확인 |
| Provider 구현 (get_orderbook) | Pitfall 9: 환율 역방향 | 양방향 가격 + 명확한 라벨 |
| Policy 통합 | Pitfall 6: USD 지출 한도 누락 | TakerGets 금액 기준 USD 환산 |
| tx-parser 확장 | Pitfall 10: 파싱 누락 | OfferCreate/OfferCancel 파싱 추가 |
| Admin UI | Pitfall 12: 표시 누락 | displayName + 라벨 매핑 |

---

## Sources

- [OfferCreate Transaction (XRPL.org)](https://xrpl.org/docs/references/protocol/transactions/types/offercreate) -- HIGH confidence
- [Offers Concept (XRPL.org)](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/offers) -- HIGH confidence
- [OfferCreateFlags (xrpl.js)](https://js.xrpl.org/enums/OfferCreateFlags.html) -- HIGH confidence
- [Reserves (XRPL.org)](https://xrpl.org/docs/concepts/accounts/reserves) -- HIGH confidence
- [fixFillOrKill Amendment (rippled PR #4694)](https://github.com/XRPLF/rippled/pull/4694) -- MEDIUM confidence
- WAIaaS 코드베이스 분석: RippleAdapter, tx-parser, resolveEffectiveAmountUsd, Stage 5 -- HIGH confidence
