# Pitfalls Research: XRP Ledger (Ripple) 멀티체인 통합

**Domain:** XRPL chain integration into existing multi-chain AI agent wallet (WAIaaS)
**Researched:** 2026-04-03
**Confidence:** HIGH (공식 XRPL 문서 + xrpl.js GitHub Issues + 기존 IChainAdapter 패턴 대조)

---

## Critical Pitfalls

### Pitfall 1: Reserve 계산 오류 — 전체 잔액 전송 시 실패

**What goes wrong:**
AI 에이전트가 `getBalance()` 반환값 전체를 전송하려 하면 `tecINSUFFICIENT_XRP` 오류로 트랜잭션 실패. XRPL은 계정당 **base reserve 1 XRP** + 보유 객체당 **owner reserve 0.2 XRP**를 반드시 유지해야 한다. Trust Line 3개 + NFT Offer 2개를 보유한 계정은 1 + (5 * 0.2) = 2 XRP가 잠긴다. EVM/Solana에서는 가스비만 남기면 되지만, XRPL은 reserve가 별도로 존재.

**Why it happens:**
- EVM의 `getBalance()`는 가용 잔액(= 전체 잔액 - 가스비)으로 충분. Solana의 rent-exempt minimum(~0.00089 SOL)은 워낙 작아 무시해도 실패하지 않음
- 기존 IChainAdapter `getBalance()` 인터페이스가 `BalanceInfo.balance`만 반환하고, reserve 개념이 없음
- Reserve 값은 서버의 `server_info`에서 동적으로 조회해야 함 (하드코딩하면 amendment로 변경 시 깨짐)

**How to avoid:**
```typescript
// BalanceInfo에 reserve 필드 추가 (ripple 전용)
interface BalanceInfo {
  balance: string;          // 전체 잔액 (drops)
  available?: string;       // 가용 잔액 = balance - totalReserve
  reserve?: {
    base: string;           // 현재 base reserve (drops)
    owner: string;          // owner reserve per object (drops)
    ownerCount: number;     // 보유 객체 수
    total: string;          // base + (owner * ownerCount)
  };
}
```
- `buildTransaction()`에서 amount가 available을 초과하면 사전 검증 실패 처리
- Reserve 값은 `server_info` 응답의 `validated_ledger.reserve_base_xrp`와 `reserve_inc_xrp`에서 동적 조회
- `sweepAll()`은 미구현 처리(N/A) — 전체 잔액 전송은 AccountDelete만 가능하고, 이것도 reserve 일부를 burn

**Warning signs:**
- `tecINSUFFICIENT_XRP` 에러 반환
- 잔액이 있는데 전송 실패하는 AI 에이전트 리포트
- Reserve가 변경되는 amendment 적용 시 갑자기 기존 금액 전송이 실패

**Phase to address:** Core adapter 구현 단계 (RippleAdapter.getBalance + buildTransaction)

---

### Pitfall 2: Destination Tag 누락 — 거래소 입금 시 자금 분실

**What goes wrong:**
AI 에이전트가 거래소(Binance, Coinbase 등)에 XRP를 전송할 때 Destination Tag를 빠뜨리면 거래소가 어떤 사용자 계정에 입금해야 하는지 모름. 블록체인상 트랜잭션은 성공하지만 자금 회수에 수일~수주 소요되거나 영구 분실 가능.

**Why it happens:**
- EVM/Solana에는 Destination Tag 개념이 없음. 기존 `TransferRequest`에 해당 필드가 존재하지 않음
- 거래소 주소에 `RequireDest` 플래그가 설정되어 있으면 XRPL 레벨에서 거부하지만, 미설정 거래소도 있음
- `memo` 필드와 `destinationTag`는 별개 (memo는 자유 텍스트, destinationTag는 uint32)

**How to avoid:**
- `TransferRequest`에 `destinationTag?: number` 필드 추가 (ripple chain 전용)
- X-address 포맷 자동 파싱: `X7AcgcsBL6XDcUb289X4mJ8djcdyKaB5hJDWMAY2EGQoLmo` 같은 X-address에는 destination tag가 내장되어 있음. `xrpl.js`의 `decodeXAddress()` 활용
- AI 에이전트 스킬 파일에 destination tag 필수 안내 추가
- 수신 주소가 `RequireDest` 플래그가 설정된 계정인지 `account_info`로 사전 확인 → 설정 시 tag 없으면 사전 거부
- REST API / MCP 도구에서 `destinationTag` 파라미터를 명시적으로 노출

**Warning signs:**
- 거래소 입금 후 잔액 미반영 리포트
- `tecDST_TAG_NEEDED` 에러 (RequireDest가 설정된 경우)
- AI 에이전트가 memo를 destination tag로 혼동하여 사용

**Phase to address:** Core adapter 구현 단계 (TransferRequest 확장 + buildTransaction) + 스킬 파일 업데이트

---

### Pitfall 3: Trust Line 설정 오류 — Rippling으로 인한 의도치 않은 잔액 변동

**What goes wrong:**
Trust Line 토큰(IOU) 지원 시 rippling 플래그를 잘못 설정하면 계정이 의도하지 않은 경로로 토큰이 통과하면서 잔액이 변동됨. 특히 사용자(비발행자) 계정에서 `NoRipple` 플래그를 설정하지 않으면 다른 사용자 간 결제의 중간 경로로 사용되어 보유 토큰이 다른 발행자의 동일 통화명 토큰으로 교체될 수 있음.

**Why it happens:**
- ERC-20 approve 모델과 Trust Line 모델이 근본적으로 다름. ERC-20은 1:1 관계지만, Trust Line은 양방향이고 rippling이라는 경로 탐색 기능이 있음
- 새 계정의 Default Ripple은 false → NoRipple 기본값이 true로 안전하지만, TrustSet에서 `tfSetNoRipple` 플래그를 명시하지 않으면 혼동 발생
- Freeze, Deep Freeze, Authorized Trust Line 등 추가 플래그들의 상호작용이 복잡
- `limit`을 0으로 설정해도 잔액이 0이 아니면 Trust Line이 삭제되지 않음 → owner reserve 계속 소모

**How to avoid:**
- WAIaaS 비발행자 계정의 TrustSet에는 항상 `tfSetNoRipple` 플래그 포함
- `buildApprove()`(TrustSet 매핑) 구현 시:
  ```typescript
  // 항상 NoRipple 설정 (비발행자 계정)
  const trustSetTx = {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: { currency, issuer, value: limit },
    Flags: TrustSetFlags.tfSetNoRipple, // 필수
  };
  ```
- Trust Line 제거 시: limit=0 설정 전에 잔액이 0인지 확인. 잔액이 남아있으면 먼저 토큰 전송 후 제거
- Authorized Trust Line(발행자가 asfRequireAuth 설정한 경우): `account_info`로 발행자 플래그 사전 확인 → authorize 안된 Trust Line에 전송하면 `tecPATH_DRY` 실패
- Freeze 상태 확인: 동결된 Trust Line에서는 전송 불가 → `account_lines`로 freeze 상태 사전 조회

**Warning signs:**
- 보유하지 않은 발행자의 토큰이 잔액에 나타남
- Trust Line 삭제 시도 후에도 owner reserve가 줄지 않음
- `tecPATH_DRY`, `tecFROZEN` 에러 반환

**Phase to address:** Trust Line 토큰 지원 단계 (buildApprove TrustSet 매핑 + buildTokenTransfer)

---

### Pitfall 4: XLS-20 NFT 2단계 전송 — 오퍼 만료 및 cross-account 문제

**What goes wrong:**
XRPL NFT 전송은 EVM/Solana의 단일 트랜잭션과 달리 2단계(NFTokenCreateOffer + NFTokenAcceptOffer). 오퍼 생성 후 수신자가 accept 하지 않으면 오퍼가 만료되거나 영구 pending. 또한 오퍼에 `Expiration`을 설정하지 않으면 owner reserve(0.2 XRP)가 무기한 잠김.

**Why it happens:**
- IChainAdapter의 `buildNftTransferTx()`/`transferNft()`는 단일 호출로 전송 완료를 가정
- XRPL에서는 sender가 sell offer를 생성하고, receiver가 별도로 accept해야 소유권 이전
- 두 트랜잭션이 서로 다른 계정에서 발생 → WAIaaS의 single-wallet 서명으로는 수신측 accept를 직접 실행 불가
- NFTokenID 계산이 MintedNFTokens 카운터에 의존하여 배치 민팅 시 사전 계산 불가

**How to avoid:**
- `transferNft()` 반환 타입에 `pending` 상태 추가:
  ```typescript
  interface NftTransferResult {
    status: 'completed' | 'pending_accept';
    offerId?: string;        // pending_accept 시 수신자가 사용할 offer ID
    expiration?: number;     // 오퍼 만료 시간
  }
  ```
- Sell offer 생성 시 반드시 `Expiration` 설정 (권장: 24시간). 만료된 오퍼는 자동 정리되어 owner reserve 반환
- 같은 WAIaaS 인스턴스 내 두 월렛 간 전송: sender의 sell offer → receiver의 accept를 자동 체이닝
- 외부 수신자: pending 상태 반환 + 알림으로 accept 필요 안내
- `Destination` 필드로 특정 수신자만 accept 가능하게 제한 (보안)

**Warning signs:**
- NFT 전송 후 소유권 미이전 리포트
- Owner reserve가 계속 증가 (만료 없는 offer 누적)
- `tecNO_PERMISSION` — Destination 미설정 offer를 제3자가 accept 시도

**Phase to address:** XLS-20 NFT 지원 단계

---

### Pitfall 5: Fee drops 단위 혼동 — 1 XRP = 1,000,000 drops

**What goes wrong:**
수수료를 XRP 단위로 설정하면 100만배 과다 지불. 예: `Fee: "12"` (12 drops = 0.000012 XRP, 정상) vs `Fee: "12000000"` (12 XRP, 치명적 과다). 반대로, 전송 금액을 drops로 설정해야 하는데 XRP 단위로 넣으면 극소량만 전송됨.

**Why it happens:**
- EVM은 wei(18자리), Solana는 lamports(9자리), XRPL은 drops(6자리). 각 체인의 최소 단위가 다름
- xrpl.js의 `xrpToDrops()`/`dropsToXrp()` 헬퍼를 사용하지 않고 수동 변환 시 실수
- `Amount` 필드: XRP는 drops 문자열, IOU 토큰은 `{currency, issuer, value}` 객체 → 타입이 다름
- WAIaaS 파이프라인의 `NATIVE_DECIMALS` 상수가 체인별로 다르므로 ripple: 6 등록 필수

**How to avoid:**
- `NATIVE_DECIMALS` SSoT에 `ripple: 6` 등록
- 모든 내부 금액은 drops(최소 단위) 기준으로 처리. UI/API 레이어에서만 XRP 단위로 변환
- `buildTransaction()` 내부에서 `xrpToDrops()` 사용하여 변환. 사용자 입력이 XRP면 변환, 이미 drops면 bypass
- humanAmount 패턴(v31.15) 활용: `humanAmount: "1.5"` → 내부에서 `"1500000"` drops로 변환
- Fee 설정: `autofill()` 사용하여 xrpl.js가 자동으로 적절한 fee drops 계산하게 위임. 수동 설정 금지

**Warning signs:**
- 전송 금액이 예상과 극단적으로 다름 (100만배 차이)
- 수수료가 비정상적으로 높음 (12 XRP 이상)
- `Amount` 필드에 숫자 타입 사용 (반드시 문자열이어야 함)

**Phase to address:** Core adapter 구현 단계 (NATIVE_DECIMALS 등록 + buildTransaction)

---

### Pitfall 6: Sequence Number vs Ticket 시스템 혼동 — 동시 트랜잭션 실패

**What goes wrong:**
XRPL은 EVM nonce와 유사한 Sequence 번호를 사용하지만, 동시 트랜잭션 시 순서가 꼬이면 `tefPAST_SEQ` 또는 `terPRE_SEQ` 에러. EVM처럼 pending nonce를 가져와서 +1 하는 패턴이 XRPL에서는 제대로 동작하지 않을 수 있음 — 특히 AI 에이전트가 빠르게 연속 트랜잭션을 제출할 때.

**Why it happens:**
- EVM의 `getTransactionCount('pending')`은 pending pool 포함 nonce를 반환하지만, XRPL `account_info`의 Sequence는 마지막 *검증된* 트랜잭션 기준
- XRPL의 `account_info`에 `current` 파라미터를 사용하면 pending 포함 Sequence를 얻을 수 있지만, 이것도 노드의 open ledger 기준이라 100% 신뢰 불가
- Ticket 시스템(250개 제한)은 out-of-order 트랜잭션을 가능하게 하지만 owner reserve를 소모하고 복잡성 증가

**How to avoid:**
- `getCurrentNonce()` 구현 시: `account_info`의 `ledger_index: "current"` 사용하여 open ledger 기준 Sequence 조회
- 로컬 Sequence 추적: 트랜잭션 제출 후 로컬에서 Sequence +1 캐싱. 실패 시 `account_info` 재조회로 리셋
- xrpl.js `autofill()`이 Sequence를 자동 채워주므로 가능하면 autofill 활용
- 초기 구현에서 Ticket 시스템은 사용하지 않음 (복잡성 대비 이점 부족). 동시 트랜잭션은 순차 큐로 처리
- LastLedgerSequence 항상 설정 (다음 pitfall 참조)

**Warning signs:**
- `tefPAST_SEQ` — 이미 사용된 Sequence
- `terPRE_SEQ` — Sequence가 현재보다 미래
- 동일 Sequence의 두 트랜잭션이 서로 충돌

**Phase to address:** Core adapter 구현 단계 (getCurrentNonce + buildTransaction)

---

### Pitfall 7: LastLedgerSequence 미설정 — 트랜잭션 영구 미결 상태

**What goes wrong:**
`LastLedgerSequence`를 설정하지 않으면 트랜잭션이 네트워크 혼잡 시 영구적으로 pending 상태에 머무를 수 있음. EVM의 `maxFeePerGas`처럼 가격 기반 만료가 아니라, 레저 번호 기반 만료이므로 다른 접근 필요.

**Why it happens:**
- EVM 트랜잭션은 gas price가 충분하면 언젠가 포함됨 (pending 상태도 nonce 재사용으로 교체 가능)
- Solana 트랜잭션은 blockhash 만료(~90초)로 자동 만료
- XRPL은 `LastLedgerSequence` 미설정 시 트랜잭션이 이론상 영원히 유효 → Sequence를 점유하여 후속 트랜잭션도 차단

**How to avoid:**
- **모든 트랜잭션에 LastLedgerSequence 필수 설정**: 현재 validated ledger + 20 (약 60~80초)
- xrpl.js `autofill()` 사용 시 자동으로 `LastLedgerSequence = current + 20` 설정됨
- `waitForConfirmation()` 구현: LastLedgerSequence 이후 ledger까지 대기. 해당 ledger를 지나도 미포함이면 최종 실패 확정
- Reliable Transaction Submission 패턴 준수:
  1. 서명된 트랜잭션 정보를 DB에 persist
  2. 제출
  3. LastLedgerSequence까지 모니터링
  4. 포함 안되면 최종 실패 처리 (재제출 시 새 Sequence + LastLedgerSequence)

**Warning signs:**
- `waitForConfirmation()`이 무한 대기
- 후속 트랜잭션이 `terPRE_SEQ`로 계속 실패 (이전 pending이 Sequence 점유)
- WAIaaS 파이프라인의 PENDING 상태가 해소되지 않음

**Phase to address:** Core adapter 구현 단계 (buildTransaction + waitForConfirmation)

---

### Pitfall 8: WebSocket 연결 관리 — xrpl.js 연결 불안정

**What goes wrong:**
xrpl.js의 `Client`가 WebSocket 연결 끊김 후 자동 재연결에 실패하거나 무한 루프에 빠짐. 특히 동시 요청이 100건 이상이면 `DisconnectedError(websocket was closed)` 대량 발생. XRPL 공개 노드(s1.ripple.com/s2.ripple.com)는 연결 수 제한이 있어 끊김 빈번.

**Why it happens:**
- xrpl.js GitHub Issue #1185: `connect()` 중 `_subscribeToLedger` 실패 시 WebSocket이 정리되지 않아 복구 불가능한 루프 발생
- Issue #903: 동시 요청 100회 이상에서 WebSocket 닫힘
- Issue #1055: 동시 트랜잭션 다수 실행 시 DisconnectedError
- EVM(HTTP JSON-RPC)과 Solana(HTTP + optional WebSocket)와 달리 XRPL은 WebSocket이 기본 프로토콜

**How to avoid:**
- **연결 래퍼 구현**: isConnected() 확인 + 자동 재연결 + 지수 백오프
  ```typescript
  class RippleConnectionManager {
    private reconnectAttempts = 0;
    private maxReconnectDelay = 30_000; // 30초
    
    async ensureConnected(): Promise<Client> {
      if (!this.client.isConnected()) {
        await this.reconnectWithBackoff();
      }
      return this.client;
    }
  }
  ```
- 요청 큐: 동시 WebSocket 요청을 제한 (권장: 최대 10개 동시)
- `client.on('disconnected')` 이벤트 핸들러로 재연결 트리거
- 헬스체크: `server_info` 주기적 호출(30초)로 연결 상태 확인
- 대안 라이브러리 고려: `xrpl-client`(XRPL Labs)는 자동 재연결 + 백오프 + server_info 기반 활성 확인이 내장되어 있으나, xrpl.js 공식 SDK를 우선 사용하고 연결 관리만 래핑하는 것이 SSoT 유지에 유리

**Warning signs:**
- `DisconnectedError` 로그 급증
- `getHealth()` 실패
- 트랜잭션 제출 실패율 급증

**Phase to address:** Core adapter 구현 단계 (connect/disconnect/isConnected/getHealth)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reserve 값 하드코딩 (1 XRP / 0.2 XRP) | 구현 단순 | amendment로 변경 시 전체 실패 (2024-12 실제 변경 사례) | Never — `server_info`에서 동적 조회 필수 |
| Ticket 시스템 건너뛰기 | 초기 복잡성 감소 | 동시 트랜잭션 시 순차 큐 병목 | MVP 단계 (동시성 낮은 AI 에이전트 유스케이스) |
| XLS-20 NFT에서 accept 자동화 건너뛰기 | 구현 단순 | 사용자가 수동 accept 해야 함 | 초기 릴리스 (pending 상태 반환으로 충분) |
| IOU Amount를 string으로만 처리 | 타입 단순 | `{currency, issuer, value}` 객체와 drops string의 이중 처리 필요 | Never — Amount 타입을 union으로 정의 |
| WebSocket 재연결 로직 미구현 | 빠른 출시 | 프로덕션에서 연결 끊김 시 전체 서비스 장애 | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| IChainAdapter.getBalance() | reserve를 고려하지 않고 balance만 반환 | `available` 필드 추가 (balance - totalReserve) |
| IChainAdapter.buildApprove() | ERC-20 approve 시맨틱 그대로 적용 | TrustSet 매핑 + NoRipple 플래그 + issuer/currency/limit 파라미터 |
| CAIP-2 네임스페이스 | `ripple:mainnet` 식으로 임의 등록 | XRPL 공식 CAIP-2: `xrpl:0` (mainnet), `xrpl:1` (testnet), `xrpl:2` (devnet) |
| CAIP-19 토큰 자산 | ERC-20 패턴(`erc20:address`) 적용 | `xrpl:0/trustline:{CURRENCY}.{ISSUER}` — currency는 3글자 또는 hex |
| Amount 필드 | 숫자 타입 사용 | XRP: drops 문자열. IOU: `{currency, issuer, value}` 객체. 타입 union 필수 |
| X-address 처리 | r-address만 지원 | X-address도 파싱해서 r-address + destination tag 분리 (`xrpl.js` decodeXAddress) |
| Pipeline Stage 5 | ripple 분기에서 CONTRACT_CALL/BATCH 타입 전달 | 명시적 `UNSUPPORTED_TX_TYPE` 에러 반환 (silent fail 방지) |
| 네트워크 ID | chainId를 숫자로 가정 | XRPL은 ledger index 기반. CAIP-2의 chain reference는 `0`/`1`/`2` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| WebSocket 단일 연결 병목 | 동시 요청 100+ 시 `websocket was closed` | 요청 큐 + 동시 요청 수 제한 (10개) | 동시 AI 에이전트 10+ |
| `account_lines` 전체 조회 | Trust Line 수백개 계정에서 응답 지연 | `marker` 기반 페이지네이션 + limit 설정 | Trust Line 200+ |
| `account_nfts` 전체 조회 | NFT 수백개 계정에서 응답 지연 | `marker` 기반 페이지네이션 | NFT 100+ |
| Reserve 동적 조회 매번 호출 | 매 트랜잭션마다 `server_info` 호출 | Reserve 값 캐싱 (5분 TTL) + ledger close 이벤트로 갱신 | 트랜잭션 빈도 높을 때 |
| Ledger subscribe로 인한 메모리 증가 | 모든 트랜잭션 이벤트 수신 | 필요한 계정만 subscribe. 모니터링은 후속 마일스톤 | 모니터링 계정 100+ |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ed25519 시드를 r-address에서 역산 가능하다고 가정 | 키 관리 혼동 | r-address는 공개키 해시. 기존 KeyStore Ed25519 경로 재활용, 시드 별도 보관 |
| Destination 없는 NFT Offer | 제3자가 낮은 가격 offer를 snipe | `NFTokenCreateOffer`에 반드시 `Destination` 설정 |
| Rippling 활성화된 Trust Line | 의도하지 않은 잔액 변동, 자금 손실 | 비발행자 계정에 항상 `tfSetNoRipple` |
| Master Key 비활성화 없이 Regular Key만 설정 | Master Key 유출 시 전체 계정 장악 | WAIaaS는 자체 키 관리이므로 Regular Key 불필요. Master Key만 사용 |
| Reserve 부족한 계정에서 Trust Line 남용 | 계정이 잠김 (XRP 부족으로 아무 것도 못함) | Trust Line/Offer 생성 전 available balance + owner reserve 사전 검증 |
| AccountDelete 후 주소 재사용 | 다른 사용자가 같은 주소로 새 계정 생성 가능 | AccountDelete는 WAIaaS에서 지원하지 않음 (scope out) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 잔액을 drops로만 표시 | AI 에이전트가 "1500000"을 1.5 XRP로 해석 못함 | `amountFormatted` + `amountDecimals: 6` + `amountSymbol: "XRP"` 응답 보강 (v31.15 패턴) |
| Trust Line 설정이 "approve"로 표시 | ERC-20 approve와 혼동 | API에서 `operationType: "trust_line_set"` 명시, description에 Trust Line 설명 추가 |
| NFT 전송이 "completed"로 표시되나 실제 pending | 사용자 혼란 | `pending_accept` 상태 명확 반환 + 알림 |
| Reserve로 잠긴 XRP가 total balance에 포함 | AI 에이전트가 실제 사용 가능 금액 오판 | `available` 필드를 primary 잔액으로 노출, `reserved` 별도 표시 |
| Testnet/Devnet XRP가 mainnet과 동일하게 표시 | 테스트넷 자산을 실제 자산으로 착각 | 환경(testnet/mainnet) 표시를 모든 응답에 포함 (기존 WAIaaS 패턴) |

---

## "Looks Done But Isn't" Checklist

- [ ] **getBalance():** reserve 고려한 `available` 필드 — `balance`만 반환하면 전송 실패 유발
- [ ] **buildTransaction():** `LastLedgerSequence` 자동 설정 — 미설정 시 영구 pending
- [ ] **buildTransaction():** `Fee` 필드 drops 단위 확인 — XRP 단위면 100만배 과다
- [ ] **buildApprove():** `tfSetNoRipple` 플래그 포함 — 누락 시 rippling 위험
- [ ] **buildTokenTransfer():** Amount가 `{currency, issuer, value}` 객체 — drops string 아님
- [ ] **transferNft():** 2단계 처리 + `pending_accept` 상태 반환 — 단일 트랜잭션 가정 금지
- [ ] **destinationTag:** TransferRequest에 `destinationTag` 필드 — memo와 별개
- [ ] **X-address:** r-address와 X-address 모두 수용 — X-address에서 tag 자동 추출
- [ ] **CAIP-2:** `xrpl:0`/`xrpl:1`/`xrpl:2` 등록 — 임의 네임스페이스 금지
- [ ] **connect():** WebSocket 재연결 + 백오프 로직 — 끊김 시 서비스 장애
- [ ] **Pipeline Stage 5:** ripple에서 미지원 TX 타입 명시적 에러 — silent fail 방지
- [ ] **NATIVE_DECIMALS:** `ripple: 6` 등록 — 미등록 시 humanAmount 변환 실패
- [ ] **DB CHECK:** chain_type에 'ripple' 추가 — 미추가 시 INSERT 실패
- [ ] **Testnet/Devnet:** 주기적 리셋 가능성 고려 — 테스트 데이터 영속성 가정 금지

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Reserve 부족으로 전송 실패 | LOW | 에러 메시지에 필요 reserve 표시 → 사용자가 추가 XRP 입금 |
| Destination Tag 누락 입금 | HIGH | 거래소 고객센터 문의 (txHash 증빙). 자동 복구 불가 |
| Rippling으로 잔액 변동 | MEDIUM-HIGH | Trust Line 감사 → NoRipple 재설정. 이미 변동된 잔액은 복구 어려움 |
| NFT Offer 미accept 방치 | LOW | `NFTokenCancelOffer`로 취소 → owner reserve 회수 |
| Fee 과다 지불 | HIGH | 블록체인 특성상 환불 불가. 사전 검증만이 해결책 |
| Sequence 충돌 | LOW | `account_info`로 현재 Sequence 재조회 → 새 트랜잭션 제출 |
| WebSocket 무한 루프 | MEDIUM | Client 인스턴스 폐기 + 새 인스턴스 생성으로 재연결 |
| LastLedgerSequence 없는 pending TX | MEDIUM | 같은 Sequence로 새 트랜잭션 제출(cancel 효과). 원본 TX가 포함되면 새 TX는 자동 실패 |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Reserve 계산 오류 | Core adapter (getBalance + build) | 잔액 1.5 XRP, reserve 1.2 XRP 시 0.3 XRP만 전송 가능 확인 |
| Destination Tag 누락 | Core adapter (TransferRequest 확장) | RequireDest 계정에 tag 없이 전송 시 사전 거부 확인 |
| Trust Line rippling | Trust Line 지원 (buildApprove) | TrustSet 트랜잭션에 tfSetNoRipple 플래그 포함 확인 |
| XLS-20 2단계 전송 | NFT 지원 (transferNft) | 전송 후 pending_accept 상태 + offerId 반환 확인 |
| Fee drops 혼동 | Core adapter (NATIVE_DECIMALS) | 1 XRP 전송 시 Fee가 12 drops(0.000012 XRP) 수준 확인 |
| Sequence 충돌 | Core adapter (getCurrentNonce) | 연속 5건 트랜잭션 순차 성공 확인 |
| LastLedgerSequence 미설정 | Core adapter (buildTransaction) | 모든 TX에 LastLedgerSequence 포함 + 만료 시 최종 실패 확인 |
| WebSocket 불안정 | Core adapter (connect) | 강제 disconnect 후 자동 재연결 + 정상 동작 확인 |
| Testnet 리셋 | E2E 테스트 설계 | Faucet으로 계정 재생성하는 테스트 setup 확인 |
| Pipeline 미지원 타입 | Pipeline Stage 5 확장 | chain=ripple + type=CONTRACT_CALL 시 명시적 에러 확인 |
| CAIP 매핑 오류 | CAIP 통합 | `xrpl:0/native:XRP` 파싱 + resolve 정상 확인 |
| DB CHECK 제약 | DB 마이그레이션 | chain_type='ripple' 월렛 생성 성공 확인 |

---

## Testnet/Devnet 특이사항

XRPL Testnet과 Devnet은 프로덕션과 다른 중요한 차이점이 있어 별도 섹션으로 정리:

| 항목 | Mainnet | Testnet | Devnet |
|------|---------|---------|--------|
| Reserve | 동적 (현재 1/0.2 XRP) | 동일 | 다를 수 있음 (amendment 선행 적용) |
| Amendment | 투표 기반 활성화 | Mainnet 미러링 | develop 브랜치 선행 기능 |
| 안정성 | 분산화, 고가용성 | 중앙화, **주기적 리셋** | 중앙화, **빈번한 리셋** |
| Faucet | 없음 | 있음 (100 XRP/요청) | 있음 |
| 유효성 | 영구적 | 리셋 시 전체 삭제 | 리셋 시 전체 삭제 |

**E2E 테스트 주의:** Testnet/Devnet은 예고 없이 리셋될 수 있으므로, 테스트 시 매번 Faucet으로 새 계정을 생성하고 trust line 등을 재설정하는 setup 루틴이 필수.

---

## Sources

- [XRPL Reserves Documentation](https://xrpl.org/docs/concepts/accounts/reserves) — Base/Owner reserve 현재 값 및 동적 조회 방법
- [Lower Reserves In Effect (2024-12)](https://xrpl.org/blog/2024/lower-reserves-are-in-effect) — 10→1 XRP, 2→0.2 XRP 변경
- [Source and Destination Tags](https://xrpl.org/docs/concepts/transactions/source-and-destination-tags) — Destination Tag 공식 문서
- [Require Destination Tags](https://xrpl.org/docs/tutorials/how-tos/manage-account-settings/require-destination-tags) — RequireDest 플래그 설정
- [Trust Line Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens) — Trust Line 구조 및 rippling
- [Rippling](https://xrpl.org/docs/concepts/tokens/fungible-tokens/rippling) — NoRipple 플래그 설명
- [Authorized Trust Lines](https://xrpl.org/docs/concepts/tokens/fungible-tokens/authorized-trust-lines) — 발행자 인증 Trust Line
- [Freeze a Trust Line](https://xrpl.org/docs/tutorials/how-tos/use-tokens/freeze-a-trust-line) — 동결 메커니즘
- [NFTokenCreateOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokencreateoffer) — XLS-20 오퍼 생성
- [NFTokenAcceptOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokenacceptoffer) — XLS-20 오퍼 수락
- [Reliable Transaction Submission](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission) — LastLedgerSequence 패턴
- [Tickets](https://xrpl.org/docs/concepts/accounts/tickets) — Ticket 시스템 (250개 제한, owner reserve)
- [Use Tickets](https://xrpl.org/docs/tutorials/how-tos/manage-account-settings/use-tickets) — Ticket 사용 튜토리얼
- [AccountDelete](https://xrpl.org/docs/references/protocol/transactions/types/accountdelete) — 계정 삭제 조건 및 reserve 환불
- [Deleting Accounts](https://xrpl.org/docs/concepts/accounts/deleting-accounts) — 삭제 조건 (Sequence+256 < Ledger Index)
- [Parallel Networks](https://xrpl.org/docs/concepts/networks-and-servers/parallel-networks) — Testnet/Devnet 차이
- [xrpl.js Issue #1185](https://github.com/XRPLF/xrpl.js/issues/1185) — WebSocket 정리 실패 무한 루프
- [xrpl.js Issue #903](https://github.com/XRPLF/xrpl.js/issues/903) — 동시 요청 100+ WebSocket 닫힘
- [xrpl.js Issue #1055](https://github.com/XRPLF/xrpl.js/issues/1055) — 동시 트랜잭션 DisconnectedError
- [xrpl-client npm](https://www.npmjs.com/package/xrpl-client) — 대안 WebSocket 클라이언트 (자동 재연결)

---
*Pitfalls research for: XRP Ledger integration into WAIaaS multi-chain wallet*
*Researched: 2026-04-03*
