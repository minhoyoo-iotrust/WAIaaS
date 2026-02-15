# Feature Landscape: x402 Protocol Client Support

**Domain:** Self-hosted AI agent wallet daemon -- x402 payment protocol client, HTTP 402 auto-payment proxy, EVM EIP-3009 authorization, Solana SPL TransferChecked partial signing
**Researched:** 2026-02-15
**Overall Confidence:** HIGH (primary sources: x402 spec v2, @x402/core source code, EIP-3009 spec, WAIaaS codebase analysis)

---

## Table Stakes

x402 클라이언트로서 반드시 구현해야 하는 기능. 없으면 프로토콜 비호환.

| # | Feature | Why Expected | Complexity | Depends On |
|---|---------|--------------|------------|------------|
| TS-01 | **402 Response Detection + PaymentRequired Parsing** | x402 프로토콜의 시작점. HTTP 402 응답의 `PAYMENT-REQUIRED` 헤더(v2) 또는 응답 바디(v1)에서 PaymentRequired JSON을 base64 디코딩하여 파싱. `x402Version`, `accepts[]` 배열, `resource` 정보를 추출해야 한다. v2에서는 헤더 기반, v1 fallback은 JSON body 기반. 양쪽 모두 지원해야 현존하는 x402 서버와 호환된다. | Low | HTTP 클라이언트, base64 디코딩 |
| TS-02 | **PaymentRequirements 선택 로직 (Requirement Selection)** | `accepts[]` 배열에 여러 결제 수단(다른 네트워크, 다른 토큰)이 나열될 수 있다. 클라이언트는 자신이 지원하는 scheme/network 조합을 필터링하고, 잔고/정책에 맞는 하나를 선택해야 한다. Coinbase 구현은 3단계 필터링: (1) 등록된 scheme+network 필터, (2) PaymentPolicy 순차 적용, (3) paymentRequirementsSelector 함수로 최종 선택. WAIaaS는 지갑의 체인 타입(solana/ethereum)과 잔고를 기준으로 선택한다. | Med | 지갑 체인 정보, 잔고 조회 |
| TS-03 | **EVM: EIP-3009 TransferWithAuthorization 서명** | x402 EVM 결제의 핵심. EIP-712 typed data signing으로 `TransferWithAuthorization` 메시지에 서명한다. 도메인: `{name, version, chainId, verifyingContract}` (name/version은 PaymentRequirements.extra에서 수신). 메시지: `{from, to, value, validAfter, validBefore, nonce}`. validAfter = now - 600초, validBefore = now + maxTimeoutSeconds. nonce = 32바이트 랜덤. **현재 IChainAdapter에 signTypedData가 없으므로 새 메서드 추가 필요.** | High | IChainAdapter 확장 (signTypedData), viem signTypedData, EIP-712 구현 |
| TS-04 | **SVM: SPL TransferChecked 부분 서명 트랜잭션 생성** | x402 Solana 결제의 핵심. 3~5개 인스트럭션으로 구성된 Versioned Transaction을 빌드하고 부분 서명: (1) ComputeBudget SetComputeUnitLimit, (2) ComputeBudget SetComputeUnitPrice, (3) SPL Token TransferChecked, (4-5) 선택적 Lighthouse 인스트럭션. feePayer는 PaymentRequirements.extra.feePayer(facilitator 주소). 클라이언트 서명 후 facilitator가 feePayer 서명 추가. 결과를 base64 인코딩. | High | @solana/kit TransferChecked, feePayer 지정 트랜잭션 빌드, partial sign |
| TS-05 | **PAYMENT-SIGNATURE 헤더 인코딩 + 재요청** | PaymentPayload JSON을 base64 인코딩하여 `PAYMENT-SIGNATURE` 헤더(v2) 또는 `X-PAYMENT` 헤더(v1)에 설정하고, 원본 요청을 복제하여 재전송. 무한 루프 방지: 이미 PAYMENT-SIGNATURE/X-PAYMENT 헤더가 있으면 재시도하지 않음. | Low | PaymentPayload 구성, base64 인코딩 |
| TS-06 | **PaymentPayload 구성 (v2 스키마)** | v2 PaymentPayload 구조: `{x402Version: 2, resource: ResourceInfo, accepted: PaymentRequirements, payload: scheme-specific, extensions?: {}}`. EVM payload = `{signature: "0x...", authorization: {from, to, value, validAfter, validBefore, nonce}}`. SVM payload = `{transaction: "base64-encoded-partial-signed-tx"}`. | Med | TS-03 또는 TS-04의 서명 결과 |
| TS-07 | **PAYMENT-RESPONSE 헤더 파싱 (Settlement 확인)** | 결제 성공 시 서버가 200 OK + `PAYMENT-RESPONSE` 헤더(v2) 또는 `X-PAYMENT-RESPONSE` 헤더(v1)를 반환. base64 디코딩하면 `{success: true, transaction: "txHash", network: "caip-2", payer: "address"}`. 이 정보를 WAIaaS 트랜잭션 로그에 기록해야 한다. | Low | base64 디코딩, DB 기록 |
| TS-08 | **x402 Proxy API 엔드포인트** | 에이전트가 WAIaaS 데몬에 URL을 보내면, 데몬이 대신 외부 HTTP 요청을 수행하고 402를 감지하여 자동 결제 후 결과를 반환하는 프록시 엔드포인트. `POST /v1/x402/fetch` -- body: `{url, method?, headers?, body?}`. 데몬이 전체 x402 핸들링을 투명하게 처리. | Med | 402 감지, 결제 플로우, 정책 평가 |
| TS-09 | **정책 엔진 통합 (Policy Evaluation)** | x402 결제도 기존 정책 엔진을 통과해야 한다. TOKEN_TRANSFER 타입으로 매핑: amount = PaymentRequirements.amount, toAddress = payTo, tokenAddress = asset. SPENDING_LIMIT, ALLOWED_TOKENS, USD 평가 적용. 정책 거부 시 결제 거부하고 402 에러 그대로 에이전트에 반환. | Med | 기존 DatabasePolicyEngine, IPriceOracle |
| TS-10 | **트랜잭션 기록 (Audit Trail)** | 모든 x402 결제를 transactions 테이블에 기록. type='X402_PAYMENT', status 기록, settlement txHash, 요청 URL, 결제 금액. 기존 알림 시스템 (TX_REQUESTED, TX_SUBMITTED) 연동. | Low | 기존 transactions 스키마, 알림 서비스 |

---

## Differentiators

WAIaaS만의 가치를 제공하는 기능. 다른 x402 클라이언트(Coinbase @x402/http-fetch)에는 없거나 다르게 동작.

| # | Feature | Value Proposition | Complexity | Depends On |
|---|---------|-------------------|------------|------------|
| DF-01 | **정책 기반 자동 결제 제어** | Coinbase x402 클라이언트는 정책 없이 무조건 결제. WAIaaS는 4-tier 정책 엔진으로 금액별 자동/지연/승인 제어. AI 에이전트가 예상치 못한 고액 결제를 하는 것을 방지. x402 결제에도 SPENDING_LIMIT, DAILY_LIMIT 적용. USD 환산 금액으로 tier 결정 (AUTO/DELAY/APPROVAL). | Med | 기존 PolicyEngine, IPriceOracle |
| DF-02 | **멀티 월렛 결제 라우팅** | WAIaaS는 멀티 월렛 시스템. x402 서버가 EVM과 SVM 둘 다 accepts에 제시하면, 잔고가 충분한 지갑을 자동 선택. 에이전트는 어떤 체인에서 결제할지 몰라도 됨. 선택 기준: (1) 체인 지원 여부, (2) 토큰 잔고, (3) USD 기준 최저 비용. | High | 멀티 월렛 조회, 잔고 비교, USD 가격 |
| DF-03 | **결제 내역 Admin UI 대시보드** | x402 결제 내역을 Admin Web UI에서 조회. 어떤 URL에 얼마를 결제했는지, 어떤 지갑/체인에서 나갔는지, settlement txHash 포함. 기존 트랜잭션 목록 페이지를 확장하여 X402_PAYMENT 타입 필터링. | Low | Admin UI 기존 인프라, TS-10 |
| DF-04 | **MCP 도구: x402_fetch** | AI 에이전트가 MCP 프로토콜로 x402 결제 URL에 접근할 수 있는 도구. `x402_fetch(url, method?, headers?, body?)` -> 자동 결제 처리 후 응답 반환. 에이전트는 "이 URL을 가져와줘"만 하면 됨. | Med | TS-08 프록시 API, MCP 도구 등록 |
| DF-05 | **결제 예산 (Payment Budget)** | x402 전용 일일/월간 결제 한도. 기존 SPENDING_LIMIT과 별도로, x402 결제에만 적용되는 예산 제어. Admin Settings에서 설정. 예: "x402 결제는 일일 최대 $10". 예산 초과 시 402를 그대로 반환. | Med | Admin Settings, 정책 확장 |
| DF-06 | **알림: x402 결제 이벤트** | 기존 4채널 알림 시스템에 X402_PAYMENT 이벤트 추가. "지갑 wallet-01이 https://api.example.com에 0.50 USDC를 결제했습니다" 형식. 고액 결제 시 별도 경고 알림. | Low | 기존 NotificationService |
| DF-07 | **도메인 허용/차단 목록 (URL Policy)** | x402 결제를 허용할 도메인/URL 패턴 목록. 에이전트가 임의 URL에 결제하는 것을 방지. 화이트리스트 모드(허용된 도메인만) 또는 블랙리스트 모드(차단된 도메인 외 전부 허용). Admin Settings에서 관리. | Med | 정책 엔진 확장, URL 패턴 매칭 |

---

## Anti-Features

x402 클라이언트에서 의도적으로 구현하지 않을 기능.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Facilitator 서버 운영** | WAIaaS는 클라이언트(결제자) 역할만. Facilitator(결제 검증/정산 서비스)를 운영하는 것은 서버 인프라, 가스비 부담, 책임 범위를 크게 확대. Coinbase나 다른 제3자 facilitator를 사용. | 외부 facilitator 활용 (x402.org 기본 facilitator) |
| **x402 서버 (Resource Server)** | WAIaaS가 콘텐츠를 판매하는 서버가 되는 것은 범위 밖. WAIaaS는 AI 에이전트의 지갑이지, 결제를 받는 서비스가 아님. | 서버 측 x402 통합은 별도 프로젝트 |
| **Permit2 지원** | EIP-3009가 x402의 기본이며 USDC 등 주요 스테이블코인이 지원. Permit2는 EIP-3009 미지원 토큰용 대안이지만, x402 생태계에서 현재 실사용 사례가 거의 없음. 구현 복잡도 높음 (x402Permit2Proxy 컨트랙트 배포 필요). | v1에서는 EIP-3009만 지원. Permit2는 필요 시 후속 마일스톤 |
| **V1 프로토콜 우선 지원** | x402 v2가 현재 표준. V1은 `X-PAYMENT` 헤더/바디 혼합 사용, CAIP-2 미준수 네트워크 식별자 등 레거시. V1 호환은 파싱 시 fallback으로만 제공. | V2 우선 구현, V1은 파싱 fallback만 |
| **자동 ATA 생성 (Solana)** | SVM 스펙에서 recipient ATA가 없으면 Create ATA 인스트럭션 포함 가능하지만, 클라이언트가 타인의 ATA를 생성하면 rent 비용 발생. facilitator가 처리하거나, ATA가 없으면 결제 거부. | 존재하는 ATA만 대상으로 결제. ATA 미존재 시 에러 반환 |
| **직접 블록체인 제출** | x402 프로토콜에서 클라이언트는 트랜잭션을 체인에 제출하지 않음. EVM: facilitator가 transferWithAuthorization 호출. SVM: facilitator가 feePayer 서명 추가 후 제출. 클라이언트는 오직 서명/인가만 생성. | 서명된 payload를 서버에 전달, facilitator가 체인 제출 담당 |

---

## Feature Dependencies

```
TS-01 (402 Detection) -> TS-02 (Requirement Selection)
TS-02 -> TS-03 (EVM EIP-3009) 또는 TS-04 (SVM TransferChecked)
TS-03 또는 TS-04 -> TS-06 (PaymentPayload)
TS-06 -> TS-05 (PAYMENT-SIGNATURE Header)
TS-05 -> TS-07 (PAYMENT-RESPONSE Parsing)
TS-01 + TS-05 + TS-07 -> TS-08 (Proxy API)
TS-08 -> TS-09 (Policy Integration)
TS-09 -> TS-10 (Audit Trail)

TS-08 -> DF-01 (정책 제어)
TS-08 -> DF-04 (MCP 도구)
TS-02 -> DF-02 (멀티 월렛 라우팅)
TS-10 -> DF-03 (Admin Dashboard)
TS-10 -> DF-06 (알림)
TS-08 -> DF-07 (URL Policy)
DF-01 -> DF-05 (Payment Budget)
```

---

## Detailed Protocol Schemas

### PaymentRequired (서버 -> 클라이언트, 402 응답)

```typescript
// V2: PAYMENT-REQUIRED 헤더에 base64 인코딩
interface PaymentRequired {
  x402Version: 2;
  error?: string;                    // 사람이 읽을 수 있는 결제 필요 사유
  resource: {
    url: string;                     // 보호된 리소스 URL
    description?: string;            // 리소스 설명
    mimeType?: string;               // 응답 MIME 타입
  };
  accepts: PaymentRequirements[];    // 결제 수단 목록 (하나 이상 선택)
  extensions?: Record<string, unknown>;
}

interface PaymentRequirements {
  scheme: "exact";                   // 결제 방식 (현재 exact만 존재)
  network: string;                   // CAIP-2 네트워크 식별자
                                     //   EVM: "eip155:8453" (Base), "eip155:84532" (Base Sepolia)
                                     //   SVM: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" (Mainnet)
                                     //        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" (Devnet)
  amount: string;                    // 원자 단위 토큰 금액 (예: USDC 6 decimals -> "1000000" = 1 USDC)
  asset: string;                     // 토큰 주소 (EVM: contract address, SVM: mint pubkey)
  payTo: string;                     // 결제 수취인 주소
  maxTimeoutSeconds: number;         // 결제 유효 시간 (초)
  extra: {
    // EVM 전용
    assetTransferMethod?: "eip3009" | "permit2";  // 기본값: "eip3009"
    name?: string;                   // EIP-712 도메인 name (예: "USD Coin")
    version?: string;                // EIP-712 도메인 version (예: "2")

    // SVM 전용
    feePayer?: string;               // facilitator의 공개 주소 (가스비 지불자)
  };
}
```

### PaymentPayload (클라이언트 -> 서버, PAYMENT-SIGNATURE 헤더)

```typescript
// base64(JSON.stringify(PaymentPayload)) -> PAYMENT-SIGNATURE 헤더
interface PaymentPayload {
  x402Version: 2;
  resource?: {                       // 원본 요청 리소스 정보
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepted: PaymentRequirements;     // 선택한 결제 수단 (accepts 중 하나)
  payload: ExactEvmPayload | ExactSvmPayload;  // scheme별 페이로드
  extensions?: Record<string, unknown>;
}

// --- EVM EIP-3009 Payload ---
interface ExactEvmPayload {
  signature: string;                 // EIP-712 서명 (0x 접두사, 65바이트 hex)
  authorization: {
    from: string;                    // 결제자 주소 (checksummed)
    to: string;                      // 수취인 주소 (= payTo, checksummed)
    value: string;                   // 결제 금액 (원자 단위)
    validAfter: string;              // 유효 시작 시간 (Unix 타임스탬프, 초)
    validBefore: string;             // 유효 종료 시간 (Unix 타임스탬프, 초)
    nonce: string;                   // 32바이트 랜덤 hex (0x 접두사)
  };
}

// --- SVM Payload ---
interface ExactSvmPayload {
  transaction: string;               // base64 인코딩된 부분 서명 Versioned Transaction
}
```

### SettlementResponse (서버 -> 클라이언트, PAYMENT-RESPONSE 헤더)

```typescript
// base64(JSON.stringify(SettlementResponse)) -> PAYMENT-RESPONSE 헤더
interface SettlementResponse {
  success: boolean;
  transaction: string;               // 블록체인 트랜잭션 해시/서명
  network: string;                   // CAIP-2 네트워크 식별자
  payer: string;                     // 결제자 주소
}
```

---

## Detailed Signing Procedures

### EVM: EIP-3009 TransferWithAuthorization

```
1. PaymentRequirements에서 추출:
   - asset = verifyingContract (USDC 컨트랙트 주소)
   - extra.name = EIP-712 도메인 name
   - extra.version = EIP-712 도메인 version
   - network에서 chainId 추출 (예: "eip155:8453" -> 8453)

2. Authorization 파라미터 구성:
   - from = 지갑 주소 (checksummed)
   - to = payTo (checksummed)
   - value = amount
   - validAfter = Math.floor(Date.now() / 1000) - 600  (10분 전)
   - validBefore = Math.floor(Date.now() / 1000) + maxTimeoutSeconds
   - nonce = crypto.randomBytes(32) -> "0x" + hex

3. EIP-712 Typed Data 구성:
   domain = { name, version, chainId, verifyingContract: asset }
   types = {
     TransferWithAuthorization: [
       { name: "from", type: "address" },
       { name: "to", type: "address" },
       { name: "value", type: "uint256" },
       { name: "validAfter", type: "uint256" },
       { name: "validBefore", type: "uint256" },
       { name: "nonce", type: "bytes32" }
     ]
   }
   primaryType = "TransferWithAuthorization"
   message = { from, to, value, validAfter, validBefore, nonce }

4. privateKey로 signTypedData (viem의 account.signTypedData 사용)
   -> signature (0x 접두사 65바이트 hex)

5. ExactEvmPayload = { signature, authorization: { from, to, value, validAfter, validBefore, nonce } }
```

### SVM: SPL TransferChecked (Partial Sign)

```
1. PaymentRequirements에서 추출:
   - asset = SPL 토큰 mint 주소
   - payTo = 수취인 소유자 주소
   - extra.feePayer = facilitator 공개 주소 (가스비 지불자)
   - amount = 전송 금액 (원자 단위)

2. 토큰 정보 조회:
   - mint 데이터에서 decimals 확인
   - 토큰 프로그램 확인 (spl-token 또는 token-2022)

3. ATA 계산:
   - payer ATA = getAssociatedTokenAddress(mint, payerPubkey, tokenProgram)
   - recipient ATA = getAssociatedTokenAddress(mint, payToPubkey, tokenProgram)
   - 양쪽 ATA 존재 확인

4. 트랜잭션 인스트럭션 구성 (정확히 이 순서):
   (1) ComputeBudget.SetComputeUnitLimit (discriminator: 2)
   (2) ComputeBudget.SetComputeUnitPrice (discriminator: 3, <= 5 lamports/CU)
   (3) SPL Token TransferChecked (source ATA, mint, dest ATA, authority=payer, amount, decimals)
   (4) Optional: Memo 인스트럭션 (16바이트 랜덤 nonce hex)

5. Versioned Transaction Message 구성:
   - feePayer = extra.feePayer (facilitator)
   - recentBlockhash = 최신 블록해시 조회
   - instructions = 위 순서대로

6. 부분 서명:
   - payer의 privateKey로만 서명 (facilitator 서명 미포함)
   - partiallySignTransactionMessageWithSigners()

7. base64 인코딩:
   - getBase64EncodedWireTransaction() -> ExactSvmPayload.transaction
```

---

## Error/Retry Semantics

### 클라이언트 에러 처리 흐름

| 상황 | HTTP 코드 | 처리 방식 |
|------|-----------|-----------|
| 결제 불필요 (비-402 응답) | 200/3xx/4xx(!=402)/5xx | 원본 응답 그대로 반환 |
| 결제 필요 (402) | 402 | PaymentRequired 파싱 -> 결제 플로우 시작 |
| 결제 후 성공 | 200 | PAYMENT-RESPONSE 파싱, 리소스 + settlement 정보 반환 |
| 결제 후 실패 (잘못된 서명) | 400 | "Malformed payment" -- 재시도 불가, 에러 반환 |
| 결제 후 서버 에러 | 500 | "Settlement failed" -- 재시도 가능하나 위험 (이중 결제 가능성) |
| 지원하지 않는 scheme | 402 | accepts[]에서 매칭되는 scheme/network 없음 -> 에러 반환 |
| 잔고 부족 | 402 | 선택 가능한 requirements 없음 -> 에러 반환 |
| 정책 거부 | N/A | PolicyEngine이 거부 -> 402 그대로 에이전트에 반환 |
| 무한 루프 방지 | N/A | PAYMENT-SIGNATURE 헤더 이미 존재 시 재시도 차단 |

### 재시도 정책

- x402 결제는 **1회 시도만**. 실패 시 재시도하지 않음 (이중 결제 위험).
- 서명은 시간 제한됨 (validAfter ~ validBefore / blockhash lifetime).
- 서버가 500 반환 시, settlement가 이미 체인에 제출되었을 수 있으므로 재시도 금지.
- 에이전트에게는 실패 사유를 포함한 에러 반환. 에이전트가 재시도 결정.

---

## Coinbase Reference Client vs WAIaaS 차이점

| 측면 | Coinbase @x402/http-fetch | WAIaaS x402 Client |
|------|---------------------------|---------------------|
| **아키텍처** | fetch 래퍼 (브라우저/Node.js) | 데몬 프록시 (에이전트가 URL을 보내면 데몬이 대행) |
| **키 관리** | 외부 signer 주입 (Coinbase Wallet, viem account) | LocalKeyStore 암호화 키 (sodium-native, Argon2id) |
| **정책** | 없음 (무조건 결제) | 4-tier 정책 엔진 (AUTO/DELAY/APPROVAL/DENY) |
| **멀티 월렛** | 단일 signer | 멀티 월렛 + 멀티 체인 자동 선택 |
| **감사 추적** | 없음 | transactions 테이블 기록, 알림 |
| **결제 제어** | 없음 | 도메인 허용/차단, 일일 예산, USD 한도 |
| **프로토콜 버전** | V1 + V2 + Legacy | V2 우선, V1 파싱 fallback |
| **scheme 지원** | exact (EIP-3009 + Permit2) | exact (EIP-3009만, SVM TransferChecked) |
| **API 표면** | fetch(url) 래퍼 | REST API + MCP 도구 + SDK |

### 핵심 차이: WAIaaS는 "보호된 결제"

Coinbase 클라이언트는 서명 키를 가진 누구든 무제한 결제 가능. WAIaaS는:
1. 정책 엔진이 금액/토큰/도메인을 검증한 후에만 서명
2. 고액 결제는 지연/승인 요구 가능
3. 모든 결제가 감사 로그에 기록
4. Admin이 언제든 x402 결제를 비활성화 가능 (Kill Switch)

---

## IChainAdapter 확장 필요사항

### 새로 필요한 메서드

```typescript
// EVM 전용: EIP-712 typed data 서명
signTypedData(
  privateKey: Uint8Array,
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  },
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>,
): Promise<string>;  // 0x-prefixed hex signature

// SVM 전용: feePayer가 다른 주소인 부분 서명 트랜잭션 빌드
buildPartialSignTransaction(
  instructions: TransactionInstruction[],
  feePayer: string,  // facilitator 주소
  signerPrivateKey: Uint8Array,  // 지갑 privateKey (payer authority)
): Promise<string>;  // base64 encoded partial-signed transaction
```

**대안 설계**: IChainAdapter를 확장하는 대신, x402 모듈 내부에서 직접 viem/solana-kit를 사용하여 서명할 수도 있다. IChainAdapter는 범용 인터페이스이므로 x402 전용 메서드를 추가하면 인터페이스가 비대해질 수 있다. **권장: x402 모듈 내부에서 직접 구현**, 키 접근만 KeyStore를 통해 수행.

---

## MVP Recommendation

### Phase 1: 핵심 프로토콜 (Table Stakes)

1. **TS-01** 402 Detection + PaymentRequired Parsing
2. **TS-06** PaymentPayload 구성
3. **TS-05** PAYMENT-SIGNATURE 헤더 인코딩
4. **TS-07** PAYMENT-RESPONSE 파싱
5. **TS-03** EVM EIP-3009 서명 (Base/Base Sepolia USDC 우선)
6. **TS-08** Proxy API 엔드포인트
7. **TS-09** 정책 엔진 통합
8. **TS-10** 트랜잭션 기록

### Phase 2: SVM 지원

9. **TS-04** SVM TransferChecked 부분 서명
10. **TS-02** 멀티 scheme/network 선택 로직 고도화

### Phase 3: DX + 보호 기능

11. **DF-04** MCP 도구: x402_fetch
12. **DF-01** 정책 기반 자동 결제 제어 (기존 정책 재사용)
13. **DF-07** 도메인 허용/차단 목록
14. **DF-06** x402 결제 알림
15. **DF-03** Admin UI 대시보드 확장

### Defer (후속 마일스톤)

- **DF-02** 멀티 월렛 결제 라우팅: 복잡도 높고 단일 월렛으로도 충분히 동작
- **DF-05** Payment Budget: 기존 SPENDING_LIMIT으로 대체 가능, 별도 예산은 후순위
- **Permit2 지원**: 현재 생태계에서 필요성 낮음

---

## Sources

- [x402 Protocol Specification v2](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md) -- HIGH confidence
- [Exact Scheme SVM Specification](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md) -- HIGH confidence
- [Exact Scheme EVM Specification](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) -- HIGH confidence
- [x402 HTTP Transport v2 Specification](https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md) -- HIGH confidence
- [@x402/core TypeScript source code](https://github.com/coinbase/x402/tree/main/typescript/packages/core) -- HIGH confidence
- [@x402/mechanisms EVM source code](https://github.com/coinbase/x402/tree/main/typescript/packages/mechanisms/evm) -- HIGH confidence
- [@x402/mechanisms SVM source code](https://github.com/coinbase/x402/tree/main/typescript/packages/mechanisms/svm) -- HIGH confidence
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009) -- HIGH confidence
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712) -- HIGH confidence
- [Solana x402 Guide](https://solana.com/developers/guides/getstarted/intro-to-x402) -- HIGH confidence
- [Base x402 Agents Guide](https://docs.base.org/base-app/agents/x402-agents) -- MEDIUM confidence
- [x402 V2 Launch Announcement](https://www.x402.org/writing/x402-v2-launch) -- MEDIUM confidence
- [ERC-3009: The Protocol Powering x402 Payments](https://blog.payin.com/posts/erc-3009-x402/) -- MEDIUM confidence
