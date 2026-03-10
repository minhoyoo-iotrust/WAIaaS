# Domain Pitfalls: Polymarket 예측 시장 통합

**Domain:** Polymarket prediction market integration into WAIaaS
**Researched:** 2026-03-10

---

## Critical Pitfalls

치명적 실수 -- 재작업 또는 주요 장애를 유발한다.

---

### Pitfall C1: EIP-712 Domain Separator가 Hyperliquid와 완전히 다름

**What goes wrong:** Hyperliquid EIP-712 패턴을 그대로 복사하면 서명이 100% 실패한다. 두 프로토콜의 EIP-712 도메인이 근본적으로 다르다.

**Hyperliquid vs Polymarket 도메인 비교:**

| Field | Hyperliquid L1 (HL_L1_DOMAIN) | Polymarket Order |
|-------|-------------------------------|------------------|
| name | `"Exchange"` | `"Polymarket CTF Exchange"` |
| version | `"1"` | `"1"` |
| chainId | `1337` (고정, phantom agent) | `137` (Polygon mainnet) / `80002` (Amoy testnet) |
| verifyingContract | `0x000...000` (zero address) | **실제 Exchange 컨트랙트 주소** |

**핵심 차이:**
1. **verifyingContract가 실제 주소**: Hyperliquid는 zero address를 사용하지만, Polymarket은 실제 CTF Exchange 주소(`0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`)를 사용한다. **Neg Risk 마켓은 다른 주소(`0xC5d563A36AE78145C45a50134d48A1215220f80a`)를 사용한다.**
2. **chainId가 실제 체인 ID**: Hyperliquid는 phantom agent 패턴으로 chainId 1337을 고정 사용하지만, Polymarket은 Polygon 실제 chainId 137을 사용한다.
3. **Neg Risk 시장은 다른 도메인**: 동일한 Order struct이지만 verifyingContract가 Neg Risk CTF Exchange로 바뀐다. 시장 타입에 따라 도메인을 동적으로 선택해야 한다.

**API Key 생성은 또 다른 도메인 사용:**
```
Domain: { name: "ClobAuthDomain", version: "1", chainId: 137 }
// verifyingContract 없음!
```
주문 서명 도메인과 API Key 서명 도메인이 다르다.

**Why it happens:** Hyperliquid의 `HyperliquidSigner`를 참조하여 공통 추상화를 만들려 할 때, 도메인 구성 방식의 근본적 차이를 간과한다.

**Consequences:** 모든 주문 서명 실패, CLOB API가 `INVALID_SIGNATURE` 반환. 디버깅이 어려움 -- 서명 자체는 유효한 ECDSA이지만 도메인이 틀려 ecrecover 결과가 다른 주소를 반환한다.

**Prevention:**
- Polymarket 전용 도메인 빌더 함수를 만들어 `verifyingContract`를 마켓 타입(binary vs negRisk)에 따라 동적 선택
- Hyperliquid `HyperliquidSigner`와 코드 공유하지 말 것 -- 패턴만 참고하고 별도 `PolymarketSigner` 구현
- 단위 테스트에서 도메인 해시가 Polymarket Python/Rust 클라이언트의 알려진 값과 일치하는지 검증
- 도메인 3개를 명확히 분리: (1) 주문 서명(CTF Exchange), (2) 주문 서명(Neg Risk CTF Exchange), (3) API Key 생성(ClobAuthDomain)

**Detection:** CLOB API `/order` 호출 시 401/403 또는 "invalid signature" 에러.

**Confidence:** HIGH (공식 소스코드: ctf-exchange/Hashing.sol, Clojure gist, py-clob-client)

---

### Pitfall C2: Order Struct 필드와 Hyperliquid OrderWire의 근본적 차이

**What goes wrong:** Hyperliquid의 OrderWire(`a`, `b`, `p`, `s`, `r`, `t` -- msgpack 인코딩)와 Polymarket의 Order struct(12필드, EIP-712 직접 서명)가 완전히 다른 구조인데 유사한 것으로 착각하여 매핑 오류 발생.

**Polymarket Order struct (12 필드, EIP-712 서명 대상):**
```
ORDER_TYPEHASH = keccak256("Order(uint256 salt,address maker,address signer,
  address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,
  uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,
  uint8 signatureType)")
```

| Field | Type | 설명 |
|-------|------|------|
| salt | uint256 | 랜덤 엔트로피: `Math.round(Math.random() * Date.now())` |
| maker | address | 자금 보유자 (EOA 모드: wallet address) |
| signer | address | 서명자 (EOA 모드: wallet address와 동일) |
| taker | address | `0x000...000` (open order) |
| tokenId | uint256 | CTF ERC-1155 token ID (conditionId에서 파생) |
| makerAmount | uint256 | 제공 토큰 양 (6 decimals) |
| takerAmount | uint256 | 수령 토큰 양 (6 decimals) |
| expiration | uint256 | Unix timestamp (0 = 만료 없음) |
| nonce | uint256 | **온체인 취소 전용** (API nonce와 다름!) |
| feeRateBps | uint256 | 수수료 basis points (**CLOB API에서 조회 필수**) |
| side | uint8 | 0=BUY, 1=SELL |
| signatureType | uint8 | 0=EOA, 1=POLY_PROXY, 2=POLY_GNOSIS_SAFE |

**Hyperliquid와의 핵심 차이:**
1. **salt vs nonce**: Polymarket `salt`는 랜덤 엔트로피(주문 고유성), `nonce`는 온체인 취소 전용. Hyperliquid는 시간 기반 nonce 하나만 사용하고 salt 개념 없음.
2. **maker/signer 분리**: Proxy Wallet 시 다름. Hyperliquid는 단일 서명자.
3. **makerAmount/takerAmount (가격 표현)**: 가격이 직접 들어가지 않음 -- 비율로 표현. Hyperliquid는 `p`(가격)와 `s`(수량) 명시적 분리.
4. **feeRateBps**: CLOB API에서 조회해야 함 -- 클라이언트가 임의 설정 불가. Hyperliquid는 builder fee만 설정.
5. **서명 대상**: Polymarket은 Order struct을 직접 EIP-712 서명. Hyperliquid는 msgpack → keccak256 → phantom agent 서명 (간접).

**Why it happens:** "EIP-712 주문 서명"이라는 공통점에 집중하여 내부 구조의 차이를 무시.

**Consequences:** 잘못된 makerAmount/takerAmount 비율로 의도치 않은 가격에 주문 체결, salt 대신 nonce를 랜덤으로 생성하면 온체인 취소 불가.

**Prevention:**
- `PolymarketOrderBuilder` 전용 클래스로 price+size를 makerAmount/takerAmount로 변환하는 로직 캡슐화
- 가격 변환 공식 명확화:
  ```
  BUY:  makerAmount = round(price * size * 1e6)   // USDC 지불
        takerAmount = round(size * 1e6)             // CT 수령
  SELL: makerAmount = round(size * 1e6)             // CT 지불
        takerAmount = round(price * size * 1e6)     // USDC 수령
  ```
- salt 생성: `Math.round(Math.random() * Date.now())`
- nonce는 0부터 시작, 온체인 취소 시에만 증가
- feeRateBps는 반드시 CLOB API에서 조회

**Detection:** 주문 가격이 의도와 다르게 체결, CLOB API "invalid fee rate" 반환.

**Confidence:** HIGH (ctf-exchange/OrderStructs.sol, Clojure gist, py-clob-client issue #121)

---

### Pitfall C3: Proxy Wallet vs EOA 서명 모드 혼동

**What goes wrong:** WAIaaS 지갑은 항상 EOA(자체 관리 키)인데, Polymarket의 3가지 signatureType(EOA=0, POLY_PROXY=1, POLY_GNOSIS_SAFE=2)과 maker/signer/funder 관계를 혼동하여 서명 검증 실패.

**WAIaaS에서의 올바른 매핑:**

| Scenario | signatureType | maker | signer | funder |
|----------|---------------|-------|--------|--------|
| WAIaaS EOA 직접 사용 | `0` (EOA) | EOA 주소 | EOA 주소 (동일) | EOA 주소 |
| Polymarket UI 계정 연동 | `1` (POLY_PROXY) | Proxy Wallet 주소 | EOA 주소 | Proxy Wallet 주소 |

**핵심 문제:**
1. **Proxy Wallet이 없으면 signatureType=0**: WAIaaS 지갑이 Polymarket에 처음 접근할 때 Proxy Wallet이 자동 생성되지 않는다. Polymarket.com 웹사이트를 통해서만 생성된다.
2. **signatureType=0(EOA)에서는 maker = signer**: 분리하면 서명 검증 실패.
3. **funder 주소 오류**: API Key 생성 시 funder가 틀리면 "unauthorized" 에러. EOA 모드에서 funder = EOA 주소.
4. **Smart Account(ERC-4337) 지갑의 경우**: signatureType=2(GNOSIS_SAFE)를 사용해야 할 수 있으나, Polymarket이 ERC-4337을 지원하는지 미확인 -- 별도 리서치 필요.

**Why it happens:** Polymarket 문서가 POLY_PROXY/웹 사용자 중심으로 작성되어 있어 순수 EOA API 트레이더의 세부사항이 묻힘.

**Consequences:** API Key 생성 실패, 주문 서명 검증 실패, "unauthorized funder" 에러.

**Prevention:**
- WAIaaS는 signatureType=0(EOA) 전용으로 시작 -- POLY_PROXY/GNOSIS_SAFE는 지원하지 않음 (불필요한 복잡성 제거)
- Order 구성 시 `maker = signer = wallet.address` 고정
- API Key 생성 시 funder도 동일 EOA 주소 사용
- Smart Account 호환은 별도 후속 마일스톤에서 검토

**Detection:** CLOB API "invalid signer", "unauthorized", 또는 "unknown signing type" 에러.

**Confidence:** HIGH (공식 문서 + py-clob-client 소스)

---

### Pitfall C4: Neg Risk 시장 라우팅 누락 -- 도메인+Approve+정산 전부 다름

**What goes wrong:** 바이너리(Yes/No) 시장과 Neg Risk(다중 아웃컴) 시장의 라우팅을 구분하지 않아 주문 서명 실패, approve 누락, 정산 실패가 연쇄적으로 발생.

**바이너리 vs Neg Risk 완전 비교:**

| 항목 | 바이너리 시장 | Neg Risk 시장 |
|------|--------------|---------------|
| Exchange 컨트랙트 | CTF Exchange `0x4bFb...982E` | Neg Risk CTF Exchange `0xC5d5...20f80a` |
| Adapter | 없음 | Neg Risk Adapter `0xd91E...5296` |
| EIP-712 verifyingContract | CTF Exchange 주소 | **Neg Risk CTF Exchange 주소** |
| 담보 | USDC 직접 | WrappedCollateral (USDC 래핑) |
| 해결 규칙 | Yes/No 중 하나 | **정확히 하나만 Yes** (나머지 모두 No) |
| USDC approve 대상 | CTF Exchange (1곳) | CTF Exchange + Neg Risk CTF Exchange + Neg Risk Adapter (3곳) |
| CT approve 대상 | CTF Exchange (1곳) | CTF Exchange + Neg Risk CTF Exchange (2곳) |

**NegRiskAdapter 특수 엣지 케이스:**
- NO 토큰 → YES 토큰 + USDC 변환 가능 (수학적 동치 활용)
- Oracle가 `[1,1]`(두 개 이상 Yes) 반환하면 컨트랙트 **revert**
- 모든 아웃컴이 No로 해결되면 시장 해결 불가

**Why it happens:** Gamma API의 마켓 데이터에서 `neg_risk` 필드를 확인하지 않고 모든 시장을 바이너리로 처리.

**Consequences:** Neg Risk 시장 주문 서명이 CLOB API에서 거부됨 (EIP-712 도메인 불일치), approve가 잘못된 컨트랙트에만 설정되어 정산 실패.

**Prevention:**
- 마켓 조회 시 `neg_risk` 플래그를 항상 캐시, 주문/approve/redeem 시 참조
- Exchange 주소와 approve 대상을 `neg_risk`로 분기하는 라우터 패턴 구현
- 안전 전략: USDC/CT approve를 모든 컨트랙트(5곳)에 한번에 설정 -- 바이너리든 Neg Risk든 안전
- 단위 테스트: `negRisk=true/false`에 따른 도메인/Exchange 분기 검증

**Detection:** CLOB API 주문 제출 시 "invalid signature" (도메인 불일치), CTF redeem 트랜잭션 on-chain revert.

**Confidence:** HIGH (neg-risk-ctf-adapter 공식 문서 + py-clob-client issue #138)

---

## Moderate Pitfalls

---

### Pitfall M1: USDC.e 6-decimal + Tick Size 정밀도 오류

**What goes wrong:** Polymarket은 Polygon USDC.e(`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`, 6 decimals)를 사용한다. makerAmount/takerAmount는 6-decimal 단위인데, 가격(0.0~1.0)과 수량(shares) 사이의 변환에서 tick size 규칙을 무시하면 정밀도 오류 발생.

**Tick size별 소수점 제한 (CLOB 강제):**

| Tick Size | Price Decimals | Size Decimals |
|-----------|---------------|---------------|
| 0.1 | 1 | 3 |
| 0.01 | 2 | 4 |
| 0.001 | 3 | 5 |
| 0.0001 | 4 | 6 |

**Why it happens:** WAIaaS의 기존 USDC 처리는 `parseUnits(amount, 6)`을 사용하지만, Polymarket의 마켓별 tick size를 무시하면 반올림 불일치 발생.

**Prevention:**
- price와 size를 먼저 마켓 tick size에 맞게 반올림한 후 makerAmount/takerAmount 계산
- bigint 연산 사용 (부동소수점 금지) -- 기존 가스 안전 마진 패턴 `(estimatedGas * 120n) / 100n`과 일관
- CLOB API에서 마켓별 tick size 조회하여 적용
- 변환 후 역변환(makerAmount/takerAmount -> price)으로 원래 가격과 허용 오차 내인지 검증

**Detection:** CLOB API "invalid tick size" 또는 "price out of range" 에러, FOK 주문 시 partial fill 불가로 전량 취소.

**Confidence:** HIGH (py-clob-client issue #121 + 공식 문서)

---

### Pitfall M2: API Key 생성의 nonce/timestamp 관리 실패

**What goes wrong:** Polymarket CLOB API Key 생성은 EIP-712 서명 기반이며, nonce로 API Key를 결정적으로 파생한다. 동일 nonce로 재생성하면 동일 키가 나오지만, nonce를 잃으면 기존 키를 복구할 수 없다.

**API Key 생성 EIP-712 구조:**
```
Domain: { name: "ClobAuthDomain", version: "1", chainId: 137 }
// verifyingContract 없음! (주문 서명 도메인과 다름)
Type: ClobAuth {
  address: wallet address,
  timestamp: server timestamp (CLOB API /time에서 조회),
  nonce: 0 (기본, 이미 사용된 경우 1, 2, ...),
  message: "This message attests that I control the given wallet"
}
```

**핵심 문제:**
1. `timestamp`는 **CLOB 서버 시간**을 사용해야 함 -- 로컬 시간 사용 시 "invalid timestamp" 에러
2. nonce=0으로 생성한 API Key가 이미 존재하면 "nonce already used" 에러
3. API Key는 `apiKey` + `secret`(base64) + `passphrase` 3개 값 -- 모두 저장해야 L2 인증 가능
4. API Key 분실 시 같은 nonce로 `derive` 가능하나, nonce 자체를 모르면 복구 불가

**Why it happens:** Admin Settings에 API Key만 저장하고 secret/passphrase를 누락하거나, nonce를 저장하지 않는다.

**Prevention:**
- Admin Settings에 `polymarket_api_key`, `polymarket_api_secret`, `polymarket_api_passphrase`, `polymarket_api_nonce` 4개 필드 저장
- API Key 자동 생성 플로우: (1) CLOB `/time` 서버 시간 조회 (2) nonce=0으로 시도 (3) "already used" 시 nonce 증가 후 재시도
- 생성 성공 시 3개 값 + nonce를 즉시 Admin Settings에 저장 (secret은 민감 데이터 -- 암호화 저장 권장)
- Encrypted Backup(v30.2)에 Polymarket API 자격증명 포함 필수

**Detection:** CLOB API "unauthorized" 또는 "invalid api key" 에러 (L2 인증 헤더 누락/불일치).

**Confidence:** HIGH (공식 문서 + py-clob-client issue #187)

---

### Pitfall M3: Testnet 부재로 인한 테스트 전략 공백

**What goes wrong:** Polymarket은 **CLOB API 전용 테스트넷이 없다**. Polygon Amoy에 CTF Exchange 컨트랙트(`0xdFE02Eb6733538f8Ea35D585af8DE5958AD99E40`)는 배포되어 있지만, CLOB 매칭 엔진 테스트넷은 존재하지 않는다.

**테스트 가능 범위:**

| 계층 | Testable | 방법 |
|------|----------|------|
| EIP-712 서명 생성/검증 | YES | 순수 단위 테스트 (알려진 test vector 기반) |
| Order struct 구성/변환 | YES | 순수 단위 테스트 |
| CLOB API 호출/응답 파싱 | MOCK ONLY | HTTP mock (Zod 스키마로 응답 구조 검증) |
| CTF calldata 인코딩 | YES | ABI 인코딩 검증 (Amoy에서 가능) |
| 실제 주문 매칭/체결 | MAINNET ONLY | 소액 실거래 ($1-5 규모) |
| Approve 트랜잭션 | Amoy 가능 | Amoy CTF Exchange에 approve |
| Redeem | MAINNET ONLY | 해결된 시장에서 실제 redeem |

**Why it happens:** Polymarket이 중앙화된 CLOB 매칭 엔진을 운영하며, 테스트 환경을 공개하지 않는다.

**Prevention:**
- 3-tier 테스트 전략:
  1. **Unit** (Phase 2): 서명/변환/validation -- Polymarket Python/Rust 클라이언트의 알려진 test vector 활용
  2. **Integration** (Phase 4): CLOB API mock + Zod 스키마 검증 + Amoy CTF 컨트랙트
  3. **Agent UAT** (Phase 4): 메인넷 소액 실거래 ($1-5 규모) -- v31.8 6-section 포맷 준수
- E2E 스모크(@waiaas/e2e-tests)는 오프체인 전용 (CLOB API mock)
- test vector 확보 우선: py-clob-client 테스트에서 서명 입출력 쌍 추출하여 fixture 생성
- Mock 응답은 실제 API 호출로 캡처한 fixture 사용 (인위 구성 금지)

**Detection:** Agent UAT에서만 발견되는 버그 (mock과 실제 API 응답 구조 차이).

**Confidence:** HIGH (공식 문서에 "no testnet" 명시 + 커뮤니티 확인)

---

### Pitfall M4: USDC/CT Approve 대상 누락 (5곳 approve 필요)

**What goes wrong:** Polymarket 거래를 위해 USDC.e와 CT를 여러 컨트랙트에 approve해야 하는데, 일부 누락 시 특정 마켓 타입이나 정산에서 실패.

**필요한 Approve 완전 목록 (Polygon Mainnet):**

| # | Token | Spender | 주소 | 용도 |
|---|-------|---------|------|------|
| 1 | USDC.e | CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | 바이너리 시장 거래 |
| 2 | USDC.e | Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | Neg Risk 시장 거래 |
| 3 | USDC.e | Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | Neg Risk 담보 변환 |
| 4 | CT (ERC-1155) | CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | 바이너리 CT 거래 |
| 5 | CT (ERC-1155) | Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | Neg Risk CT 거래 |

**주의: ERC-1155 approve는 `setApprovalForAll`** -- ERC-20 `approve`와 인터페이스가 다름. 기존 WAIaaS APPROVE 파이프라인은 ERC-20만 처리하므로, ERC-1155 approve를 CONTRACT_CALL로 처리해야 함.

**Why it happens:** 바이너리 시장만 테스트하고 Neg Risk 3곳 approve 누락, 또는 CT(ERC-1155) approve를 빠뜨림.

**Prevention:**
- "polymarket_setup" 액션으로 5개 approve를 BATCH 트랜잭션 한번에 실행
- 주문 전 allowance 사전 체크: USDC는 `allowance()`, CT는 `isApprovedForAll()`
- approve는 지갑당 1회만 필요 -- DB에 approve 완료 상태 캐시 (polymarket_orders 테이블의 플래그 또는 별도 컬럼)
- 한번에 모든 컨트랙트에 approve하면 바이너리/Neg Risk 구분 없이 안전

**Detection:** 주문 체결 후 온체인 정산 시 "insufficient allowance" revert -- 특히 Neg Risk 시장에서만 실패하면 이 함정.

**Confidence:** HIGH (poly-rodr/allowance gist + py-clob-client 문서)

---

### Pitfall M5: CLOB API Rate Limit -- Hyperliquid와 다른 Throttling 모델

**What goes wrong:** Polymarket CLOB API는 Cloudflare 기반 **throttling**(지연/큐잉)을 사용하며, 429 즉시 거부가 아닌 응답 지연이 발생한다. Hyperliquid의 weight-based 즉시 거부 모델과 다른 전략이 필요.

**Rate Limit 구조 (이중 제한):**

| 엔드포인트 | Burst (10s) | Sustained (10min) |
|-----------|-------------|-------------------|
| POST /order | 3,500 | 36,000 |
| DELETE /order | 3,000 | 30,000 |
| POST /orders (batch) | 1,000 | 15,000 |
| DELETE /cancel-all | 250 | 6,000 |
| Gamma /markets | 300/10s | -- |
| Data /positions | 150/10s | -- |

**Hyperliquid와의 핵심 차이:**
1. **Burst + Sustained 이중 제한**: burst 내에 있어도 sustained 초과 시 제한
2. **Throttling (not rejection)**: 429 대신 응답 지연 -- 타임아웃 설정이 핵심
3. **엔드포인트별 독립 제한**: `/markets`와 `/order`가 별도 카운터
4. **`/positions` 조회가 가장 제한적 (150/10s)**: 포지션 폴링 주기 주의

**Why it happens:** Hyperliquid의 단일 weight-based rate limiter(600 weight/min) 패턴을 그대로 적용.

**Prevention:**
- 엔드포인트 그룹별 독립 rate limiter: trading / market-data / positions
- 응답 타임아웃 넉넉히 설정 (30s+) -- throttling 지연 대비
- 마켓 데이터는 로컬 캐시 + TTL(1분+)
- batch 주문 활용 (최대 15개 한번에 제출 가능)
- cancel-all은 최대한 자제 -- 개별 취소 권장

**Detection:** API 응답 시간 비정상 증가, 간헐적 타임아웃, 캐시 miss 급증.

**Confidence:** HIGH (공식 Rate Limit 문서)

---

### Pitfall M6: 마켓 해결(Resolution) 엣지 케이스

**What goes wrong:** UMA Optimistic Oracle 기반 해결에서 여러 엣지 케이스가 예측 시장 자동화를 방해한다.

**해결 타임라인:**
```
마켓 종료 → 결과 제안(proposer) → 48h 분쟁 기간 →
  [분쟁 없음] → 확정 → redeem 가능
  [1차 분쟁] → 새 Request 생성 → 48h 추가 대기
  [2차 분쟁] → UMA DVM 투표 에스컬레이션 (수일 소요)
  [Emergency] → 관리자 강제 해결/리셋 가능
```

**자동화에 영향을 주는 엣지 케이스:**
1. **분쟁 중 포지션**: 마켓이 해결 대기 중이면 거래 불가할 수 있음 -- 자동 redeem 시도 시 revert
2. **Neg Risk "모두 No"**: 다중 아웃컴에서 정확히 하나만 Yes여야 함 -- 모두 No면 해결 불가
3. **Emergency resolution**: Polymarket 관리자가 강제 해결/리셋 -- 예상 밖 결과
4. **Governance attack**: 2025년 3월 UMA 투표권 집중으로 $7M 분쟁 조작 사건 (실제 발생)
5. **분쟁 기간 변동**: 최소 48시간이지만 에스컬레이션 시 수주일 걸릴 수 있음

**Why it happens:** 해결 완료(resolved) 시장만 고려하고 해결 중(resolving/disputed) 상태를 무시.

**Prevention:**
- 마켓 상태 머신: `ACTIVE -> RESOLVING -> DISPUTED -> RESOLVED -> REDEEMED` 추적
- redeem 호출 전 온체인 `payoutNumerators` 확인 -- 0이면 아직 미해결
- 48시간 분쟁 기간 동안 포지션을 "pending resolution"으로 표시
- 알림 통합: 마켓 해결 시 Owner에게 자동 알림
- **자동 redeem은 해결 확정 후에만** -- 분쟁 중 redeem 시도 금지

**Detection:** redeem 트랜잭션 revert ("market not resolved"), 포지션 가치 갑작스런 변동.

**Confidence:** MEDIUM (UMA 문서 + 뉴스 기반)

---

## Minor Pitfalls

---

### Pitfall N1: CTF 토큰이 "Fungible ERC-1155" -- NFT 인프라 혼동

**What goes wrong:** WAIaaS v31.0 NFT 인프라(INftIndexer, NftMetadataCacheService)가 non-fungible 토큰을 가정한다. CTF 조건부 토큰은 ERC-1155이지만 fungible하게 동작 -- NFT 메타데이터 조회/컬렉션 그룹핑이 무의미.

**Prevention:**
- CTF 토큰을 NFT 인덱서에 등록하지 말 것
- 포지션 조회는 CLOB API `/positions`를 사용, 온체인 `balanceOf(address, tokenId)`는 보조 수단
- Admin UI "NFT" 탭이 아닌 "Prediction Market" 전용 탭에서 표시
- CAIP-19 네임스페이스: `erc1155:polygon-mainnet/0x4D97DCd97eC945f40cF65F87097ACe5EA0476045/{tokenId}` -- NFT와 네임스페이스는 같지만 처리 파이프라인은 분리

**Confidence:** MEDIUM

---

### Pitfall N2: Polygon 네트워크 강제 검증 누락

**What goes wrong:** Polymarket 액션이 polygon-mainnet/polygon-amoy 외 네트워크에서 실행되면 무의미한 트랜잭션 발생 또는 잘못된 주소에 approve.

**Prevention:**
- `PolymarketActionProvider.validate()`에서 네트워크 하드체크: `polygon-mainnet` 또는 `polygon-amoy`만 허용
- ALLOWED_NETWORKS 정책과 독립적으로 하드코딩 검증 (정책 없어도 거부)
- connect-info polymarket capability 노출 시 polygon 네트워크 지갑만 표시
- Amoy 테스트넷 사용 시 Exchange 주소가 메인넷과 다름 주의: Amoy CTF Exchange = `0xdFE02Eb6733538f8Ea35D585af8DE5958AD99E40`

**Confidence:** HIGH

---

### Pitfall N3: ApiDirectResult + 온체인 TX 이중 플로우 혼동

**What goes wrong:** CLOB 주문은 ApiDirectResult(오프체인 CONFIRMED)이지만, approve/redeem은 온체인 TX이다. 하나의 Action Provider에서 두 경로를 관리할 때 DB 상태 추적이 혼동됨.

**Prevention:**
- CLOB 주문과 CTF approve/redeem을 별도 action으로 분리 (같은 Provider 내)
- CLOB 주문: ApiDirectResult -> `polymarket_orders` 테이블에 orderId/status 기록
- approve/redeem: 기존 CONTRACT_CALL 파이프라인 -> `transactions` 테이블
- 주문 상태 동기화: CLOB API `/order/{orderId}` 조회 (WebSocket은 Phase 1 리서치에서 판단)

**Confidence:** MEDIUM

---

### Pitfall N4: 정책 엔진 매핑 -- 예측 시장 특수성

**What goes wrong:** 기존 정책(ALLOWED_TOKENS, CONTRACT_WHITELIST, SPENDING_LIMIT)을 예측 시장에 매핑할 때 의미론적 불일치.

**예시:**
- "USDC 지출 한도 100 USDC/day"가 BUY makerAmount에만? SELL takerAmount(USDC 수령)는 수입?
- CONTRACT_WHITELIST에 CTF Exchange 등록 필요?
- 마켓 카테고리 제한(정치/스포츠/암호화폐)이 기존 정책 프레임워크에 없음

**Prevention:**
- SPENDING_LIMIT: BUY makerAmount만 지출로 카운트 (Hyperliquid Perp margin 패턴과 일관)
- CONTRACT_WHITELIST: provider 활성화 시 CTF Exchange/Neg Risk 주소 자동 등록
- 마켓 카테고리 제한은 Admin Settings로 처리 (PolicyType 추가 최소화)
- 예측 시장 전용 정책은 후속 마일스톤에서 검토 (최대 1개 PolicyType 추가)

**Confidence:** MEDIUM

---

### Pitfall N5: viem signTypedData에서 EIP712Domain 제거

**What goes wrong:** viem의 `signTypedData`는 `EIP712Domain`을 types에 포함하면 에러가 발생한다. Polymarket Python 클라이언트의 코드를 그대로 포팅할 때 `EIP712Domain`을 types 객체에 넣는 실수.

**Prevention:**
- viem은 `domain` 파라미터에서 자동으로 EIP712Domain을 구성 -- types에 넣지 않음
- 기존 Hyperliquid `HyperliquidSigner`가 이미 올바르게 사용 중 -- 같은 패턴 적용
- types에는 `Order` 타입 정의만 포함

**Confidence:** HIGH (viem 공식 문서)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1 (리서치/설계) | C1: EIP-712 도메인 차이를 간과하고 Hyperliquid 공통화 설계 | 별도 `PolymarketSigner`, 공통 추상화는 인터페이스 수준만 |
| Phase 1 (리서치/설계) | C3: Proxy Wallet 지원 범위 과잉 설계 | signatureType=0(EOA) 전용으로 시작 |
| Phase 1 (리서치/설계) | C4: Neg Risk 시장 라우팅 미설계 | 설계 단계에서 binary/negRisk 분기 명시적 포함 |
| Phase 2 (CLOB 주문) | C2: salt/nonce 혼동 | Python 클라이언트 test vector 기반 단위 테스트 선행 |
| Phase 2 (CLOB 주문) | M1: makerAmount/takerAmount 변환 오류 | `PolymarketOrderBuilder` 전용 클래스 + tick size 검증 |
| Phase 2 (CLOB 주문) | M2: API Key 생성 실패 | CLOB 서버 시간 사용, nonce 자동 증가, 3개 값 모두 저장 |
| Phase 2 (CLOB 주문) | N5: viem EIP712Domain 중복 | types에 EIP712Domain 넣지 않음 (viem 자동 처리) |
| Phase 3 (마켓/포지션) | M4: approve 대상 누락 (5곳) | 초기 setup 액션으로 일괄 approve |
| Phase 3 (마켓/포지션) | M6: 해결 중 마켓의 redeem 시도 | 온체인 payoutNumerators 확인 후 redeem |
| Phase 3 (마켓/포지션) | N1: CTF 토큰 NFT 인프라 혼동 | 전용 탭, NFT 인덱서 미등록 |
| Phase 4 (테스트) | M3: 테스트넷 부재 E2E 커버리지 부족 | 3-tier 전략 (unit + mock + mainnet UAT) |
| Phase 4 (테스트) | M5: Rate limit 전략 미스매치 | 엔드포인트 그룹별 독립 limiter + 타임아웃 30s+ |
| 전 Phase | N2: Polygon 네트워크 검증 누락 | Provider.validate()에서 하드체크 |
| 전 Phase | N4: 정책 엔진 매핑 | SPENDING_LIMIT에 BUY makerAmount만 카운트 |

---

## Sources

### 공식 문서 (HIGH confidence)
- [Polymarket CLOB Authentication](https://docs.polymarket.com/developers/CLOB/authentication)
- [Polymarket API Rate Limits](https://docs.polymarket.com/quickstart/introduction/rate-limits)
- [Polymarket CTF Overview](https://docs.polymarket.com/developers/CTF/overview)
- [Polymarket Contract Addresses](https://docs.polymarket.com/resources/contract-addresses)
- [Polymarket Create Order](https://docs.polymarket.com/developers/CLOB/orders/create-order)
- [Polymarket Resolution (UMA)](https://docs.polymarket.com/developers/resolution/UMA)

### 공식 소스코드 (HIGH confidence)
- [CTF Exchange OrderStructs.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/libraries/OrderStructs.sol)
- [CTF Exchange Hashing.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/Hashing.sol)
- [CTF Exchange Overview](https://github.com/Polymarket/ctf-exchange/blob/main/docs/Overview.md)
- [NegRiskAdapter](https://github.com/Polymarket/neg-risk-ctf-adapter)
- [py-clob-client](https://github.com/Polymarket/py-clob-client)
- [py-clob-client EIP-712 signing](https://github.com/Polymarket/py-clob-client/blob/main/py_clob_client/signing/eip712.py)
- [clob-client (TypeScript)](https://github.com/Polymarket/clob-client)
- [rs-clob-client (Rust)](https://github.com/Polymarket/rs-clob-client)

### 참조 구현/Gist (HIGH confidence)
- [Polymarket order signing in Clojure](https://gist.github.com/shaunlebron/7463f0003aa906ffe6f31dc18c408f73) -- EIP-712 도메인/struct 완전 명세
- [CLOB Allowance Setting Python + Neg Risk](https://gist.github.com/poly-rodr/44313920481de58d5a3f6d1f8226bd5e) -- approve 대상 완전 목록

### 커뮤니티/이슈 (MEDIUM confidence)
- [py-clob-client Issue #121 (FOK decimal error)](https://github.com/Polymarket/py-clob-client/issues/121)
- [py-clob-client Issue #187 (401 Unauthorized)](https://github.com/Polymarket/py-clob-client/issues/187)
- [py-clob-client Issue #138 (Neg Risk resolution)](https://github.com/Polymarket/py-clob-client/issues/138)
- [py-clob-client Issue #147 (Rate limit burst vs throttle)](https://github.com/Polymarket/py-clob-client/issues/147)
- [UMA Oracle manipulation 2025](https://orochi.network/blog/oracle-manipulation-in-polymarket-2025)
- [Understanding UMA dispute resolution](https://ariverwhale.substack.com/p/understanding-uma-and-dispute-resolution)
