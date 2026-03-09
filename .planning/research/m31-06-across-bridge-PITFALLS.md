# Domain Pitfalls: Across Protocol Bridge Integration

**Domain:** Across Protocol Intent-based cross-chain bridge integration into WAIaaS
**Researched:** 2026-03-08

---

## Critical Pitfalls

Mistakes that cause fund loss, stuck deposits, or require major rework.

### Pitfall 1: outputAmount 계산 오류로 자금 장기 락업

**What goes wrong:** depositV3의 outputAmount을 잘못 설정하면 Relayer가 relay를 거부하여 자금이 SpokePool에 장기간 락업된다. 컨트랙트는 outputAmount이 비합리적이어도 revert하지 않는다.
**Why it happens:** `outputAmount = inputAmount * (1 - fees.totalRelayFee.pct)` 공식을 사용해야 하는데, 수수료 구조를 잘못 이해하거나 pct 값의 소수점 형식을 잘못 변환하면 outputAmount이 너무 높게(Relayer 손해) 또는 너무 낮게(사용자 손해) 설정된다.
**Consequences:** outputAmount이 너무 높으면 Relayer가 채우지 않아 fillDeadline 만료까지 자금 잠김. 너무 낮으면 사용자가 불필요한 수수료 손실.
**Prevention:**
- `/suggested-fees` API의 `totalRelayFee.pct` 값만 사용하여 outputAmount 계산. 절대 직접 LP/relayer fee를 조합하지 않는다.
- outputAmount 계산 후 limits 엔드포인트의 min/maxDeposit 범위와 교차 검증.
- Zod 스키마로 outputAmount이 inputAmount보다 크지 않은지 런타임 검증.
- API 응답에 `limits` 필드가 포함되므로, 계산된 outputAmount이 범위 내인지 assert.
**Detection:** 테스트에서 suggested-fees mock 응답의 pct 값과 계산된 outputAmount을 비교하는 단위 테스트 필수.
**Phase:** Phase 1 설계 시 수수료 계산 공식을 명확히 문서화, Phase 2 구현 시 검증 로직 구현.

### Pitfall 2: quoteTimestamp 만료로 트랜잭션 revert

**What goes wrong:** SpokePool의 depositV3()는 quoteTimestamp이 `[currentTime - depositQuoteTimeBuffer, currentTime]` 범위 밖이면 revert한다. Quote 조회와 TX 제출 사이의 시간 차이로 자주 발생.
**Why it happens:** WAIaaS의 6-stage 파이프라인은 정책 평가(Stage 3), Owner 승인 대기(Stage 4)를 거치므로 quote 조회부터 TX 제출까지 수초~수분의 지연이 발생한다. 특히 DELAY tier + Owner 승인이 필요한 경우 수분 이상 걸릴 수 있다.
**Consequences:** `depositV3()` 호출이 on-chain에서 revert — 가스비 손실, 사용자 경험 악화.
**Prevention:**
- Quote 조회를 Stage 4(서명 직전)으로 최대한 지연. 기존 LI.FI와 달리 Across는 calldata를 직접 인코딩하므로 quote를 late-bind 가능.
- quoteTimestamp을 Stage 5 실행 시점에 `/suggested-fees`에서 다시 조회. API 응답의 timestamp 필드를 그대로 사용.
- depositQuoteTimeBuffer는 일반적으로 3600초(1시간)이지만, 체인별로 다를 수 있음. API에서 반환하는 timestamp을 그대로 사용하면 안전.
- Admin Settings에 quote 재조회 임계시간(예: 60초) 설정 — quote age가 임계값 초과 시 자동 재조회.
**Detection:** Stage 5에서 현재 시각과 quoteTimestamp 차이를 로그로 남기고, depositQuoteTimeBuffer 근처에 있으면 경고 알림.
**Phase:** Phase 1 설계 시 파이프라인 통합 전략 확정, Phase 2 구현 시 late-bind quote 패턴 적용.

### Pitfall 3: fillDeadline 설정 실수로 즉시 만료 또는 무한 대기

**What goes wrong:** fillDeadline을 과거 시간으로 설정하면 Relayer가 fill 불가능하여 자금이 SpokePool에 영원히 잠긴다(slow fill은 가능하지만 수 시간 소요). fillDeadline을 너무 길게 설정하면 출력 금액이 변동 후에도 기존 불리한 quote로 fill될 수 있다.
**Why it happens:** fillDeadline은 UNIX timestamp(초 단위)로 설정해야 하는데, 밀리초 timestamp을 사용하거나 상대 시간을 잘못 계산하면 과거/먼 미래 시간이 된다. 또한 SpokePool은 `[currentTime, currentTime + fillDeadlineBuffer]` 범위만 허용하므로 범위 밖이면 revert.
**Consequences:** 과거 설정 시 fill 불가 + 자금 장기 잠김. 범위 밖 설정 시 TX revert + 가스 손실.
**Prevention:**
- `/suggested-fees` API가 반환하는 fillDeadline 값을 그대로 사용. 직접 계산하지 않는다.
- API 반환 fillDeadline이 없는 경우에만 `currentTime + 설정가능한_기본값(예: 21600초 = 6시간)` 사용.
- 밀리초/초 단위 혼동 방지: depositV3 파라미터는 모두 uint32 (초 단위). `Math.floor(Date.now() / 1000)` 패턴 사용.
- fillDeadline 값이 현재 시간보다 과거인 경우 ChainError로 즉시 실패 처리 (on-chain revert 방지).
**Detection:** depositV3 calldata 인코딩 직전에 fillDeadline > currentTimestamp 검증 assert.
**Phase:** Phase 2 구현 시 fillDeadline 검증 + API 기본값 우선 사용 패턴 적용.

### Pitfall 4: 네이티브 토큰 브릿지 시 msg.value 불일치

**What goes wrong:** ETH를 브릿지할 때 inputToken을 WETH 주소로 설정하고 msg.value에 amount를 전달해야 하는데, msg.value와 inputAmount이 불일치하면 revert한다. 반대로 ERC-20 토큰 브릿지 시 msg.value가 0이 아니면 역시 revert.
**Why it happens:** SpokePool의 depositV3()는 payable 함수로, `inputToken == wrappedNativeToken && msg.value > 0` 일 때 `msg.value == inputAmount` 검증. ERC-20 토큰 시에는 msg.value가 반드시 0이어야 한다. 기존 CONTRACT_CALL 파이프라인에서 value 필드 처리 로직이 이 패턴을 정확히 구현해야 한다.
**Consequences:** TX revert + 가스 손실.
**Prevention:**
- 네이티브 ETH 브릿지: inputToken = WETH 주소, value = inputAmount (decimal string). CONTRACT_CALL의 value 필드에 설정.
- ERC-20 브릿지: value = undefined 또는 '0'. 명시적으로 0 전달.
- 체인별 WETH/wrappedNativeToken 주소 매핑 테이블 관리. Across API `/available-routes`에서 isNative 플래그 확인 불가하므로 자체 매핑 필수.
- inputToken이 네이티브 토큰인 경우 approve 스킵 로직 구현 (BATCH에서 approve 제거).
**Detection:** calldata 인코딩 후 (inputToken == WETH) XOR (value > 0) 불일치 검증.
**Phase:** Phase 2 네이티브 토큰 브릿지 구현 시 WETH 주소 매핑 + value 설정 로직.

### Pitfall 5: 목적지 체인 수신자의 ETH/WETH 분기 미인지

**What goes wrong:** Across SpokePool은 목적지 체인에서 수신자가 EOA이면 네이티브 ETH를, 컨트랙트이면 WETH를 전달한다. Smart Account(ERC-4337) 지갑은 컨트랙트이므로 WETH를 받게 되는데, 이를 모르고 ETH 잔액을 기대하면 잔액 불일치가 발생한다.
**Why it happens:** "EOA recipients will always receive ETH while contracts will always receive WETH" — Across의 고유 동작. WAIaaS는 EOA/Smart Account 양쪽을 지원하므로 수신 토큰이 account_type에 따라 달라진다.
**Consequences:** Smart Account 지갑이 ETH 브릿지 후 ETH 잔액 변화 없음 (WETH로 받음). 사용자 혼란, 후속 TX에서 ETH 잔액 부족 오류.
**Prevention:**
- 브릿지 견적 응답에 수신 토큰 형태(ETH vs WETH) 명시. Smart Account 수신자인 경우 경고 메시지 포함.
- 견적 조회 시 recipient의 account_type을 확인하여, 컨트랙트인 경우 outputToken을 WETH로 표시.
- MCP/SDK 응답에 `receivedAsWeth: true/false` 필드 추가.
**Detection:** 수신 지갑이 Smart Account일 때 ETH 브릿지 요청에 대해 경고 로그 출력.
**Phase:** Phase 2 견적 조회 구현 시 recipient type 기반 분기, Phase 3 MCP/SDK 응답에 필드 추가.

---

## Moderate Pitfalls

### Pitfall 6: exclusiveRelayer/exclusivityDeadline 불일치

**What goes wrong:** exclusiveRelayer가 0x0 주소인데 exclusivityDeadline이 0이 아니면 fill 동작이 혼란스럽다. SpokePool은 이를 revert하지 않지만 Relayer 동작이 예측 불가능해진다.
**Prevention:**
- exclusiveRelayer를 사용하지 않는 기본 통합에서는 exclusiveRelayer = 0x0, exclusivityDeadline = 0으로 고정.
- `/suggested-fees` API가 exclusiveRelayer를 반환하면 그 값과 exclusivityDeadline을 쌍으로 사용.
- 두 값의 일관성을 Zod 스키마의 refine()으로 검증: `exclusiveRelayer === 0x0 ? exclusivityDeadline === 0 : true`.
**Phase:** Phase 2 depositV3 calldata 인코딩 구현 시 검증 로직.

### Pitfall 7: suggested-fees API 응답 캐싱으로 인한 stale quote

**What goes wrong:** `/suggested-fees` 응답을 캐싱하면 실제 릴레이 시점의 수수료와 유동성 상황이 달라져 불리한 조건으로 실행되거나 fill이 거부될 수 있다.
**Why it happens:** Across 공식 문서에서 명시적으로 "Do not cache API responses, specially the /swap/approval and /suggested-fees endpoints"라고 경고. 수수료는 실시간 유동성, 가스 가격, relayer 상태에 따라 변동한다.
**Prevention:**
- `/suggested-fees` 응답을 절대 캐싱하지 않는다. 매 요청마다 fresh 호출.
- `/available-routes`는 비교적 안정적이므로 5분 캐시 가능하지만, `/suggested-fees`와 `/limits`는 캐시 금지.
- ActionApiClient의 캐싱 레이어가 있다면 Across 엔드포인트에 대해 명시적으로 비활성화.
**Phase:** Phase 2 AcrossApiClient 구현 시 캐시 정책 설정.

### Pitfall 8: 브릿지 상태 추적 indexer 지연으로 오탐

**What goes wrong:** Across의 `/deposit/status` API는 내부 indexer가 10초 주기로 이벤트를 폴링하므로, deposit 직후 1-15초간 상태가 'pending' 또는 찾을 수 없는 상태다. 이를 에러로 처리하면 불필요한 재시도나 사용자 알림이 발생한다.
**Why it happens:** Across indexer 인프라의 정상적인 지연. Mainnet 기준 deposit TX 확인 후 1-15초 내에 상태 반영.
**Prevention:**
- BridgeStatusTracker의 첫 폴링을 deposit TX 확인 후 30초 이후에 시작 (기존 LI.FI 패턴과 동일한 30s 간격 적용).
- 'pending' 상태와 'not found' 상태를 모두 PENDING으로 매핑 (NOT_FOUND를 에러로 처리하지 않음).
- 기존 LI.FI BridgeStatusTracker의 2-phase 패턴(30s x 240 = 2시간 active + 5min x 264 = 22시간 reduced) 재사용.
**Phase:** Phase 2 AcrossBridgeStatusTracker 구현 시 기존 패턴 재사용.

### Pitfall 9: SpokePool 주소 하드코딩으로 인한 업그레이드 대응 실패

**What goes wrong:** SpokePool은 UUPS Proxy로 배포되어 주소는 고정이지만, 새로운 체인 추가 시 주소를 업데이트해야 한다. 하드코딩하면 새 체인 지원 시 코드 변경이 필요하다.
**Prevention:**
- Across API `/available-routes` 응답에서 체인별 SpokePool 주소를 동적으로 가져오거나, `@across-protocol/contracts` 패키지의 `deployments.json`을 참조하는 방법을 검토.
- 현실적으로는 주요 체인(Ethereum, Arbitrum, Optimism, Base, Polygon) SpokePool 주소를 config에 관리하되, Admin Settings로 런타임 추가/변경 가능하게 설계.
- 기존 패턴(`LIFI_CHAIN_MAP`)처럼 정적 매핑 + Admin Settings 오버라이드 조합.
**Phase:** Phase 1 설계에서 SpokePool 주소 관리 전략 확정, Phase 2 config 구현.

### Pitfall 10: BATCH 트랜잭션에서 approve 금액 불일치

**What goes wrong:** ERC-20 브릿지는 `APPROVE(SpokePool, amount) + CONTRACT_CALL(depositV3)` BATCH로 실행되는데, approve 금액이 inputAmount과 다르면 depositV3가 실패한다. 특히 기존 allowance가 남아있는 경우 새 approve가 불필요할 수 있다.
**Prevention:**
- BATCH 생성 시 approve의 amount = depositV3의 inputAmount과 정확히 일치시킨다.
- 기존 allowance 조회 후 충분하면 approve 생략 (가스 절약). `allowance >= inputAmount`이면 CONTRACT_CALL만 단독 실행.
- approve 금액을 infinite(MaxUint256)로 설정하지 않는다 — WAIaaS의 보안 원칙(최소 권한)에 위배.
**Phase:** Phase 2 BATCH 구성 로직 구현 시 allowance 체크 + approve 금액 = inputAmount 정합성.

### Pitfall 11: 정책 평가에서 크로스체인 금액 산정 기준 혼란

**What goes wrong:** 정책 엔진의 지출 한도 평가 시 inputAmount(출발 체인 기준)과 outputAmount(도착 체인 기준) 중 어느 값을 사용할지 불명확하면 한도 우회 또는 과도한 차단이 발생한다.
**Prevention:**
- 정책 평가 기준은 inputAmount (사용자가 실제 지출하는 금액). outputAmount은 수수료 차감 후 수령액이므로 정책 대상이 아니다.
- USD 환산 정책의 경우 inputToken의 가격으로 inputAmount을 USD 변환하여 평가.
- TRANSFER_LIMIT 정책이 크로스체인 브릿지에도 적용되도록 확인 — bridge는 본질적으로 transfer이므로 별도 정책 타입 불필요.
- 기존 LI.FI 브릿지가 정책을 어떻게 평가하는지 패턴 확인 후 동일 적용.
**Phase:** Phase 2 정책 엔진 통합 시 inputAmount 기준 통일, Phase 3 MCP/SDK에서 견적 시 정책 사전 평가 표시.

---

## Minor Pitfalls

### Pitfall 12: deposit 이벤트의 depositId 추출 실패

**What goes wrong:** depositV3() 호출 후 V3FundsDeposited 이벤트에서 depositId를 추출해야 상태 추적이 가능한데, TX receipt에서 이벤트 파싱을 실패하면 상태 추적이 불가능하다.
**Prevention:**
- SpokePool ABI에서 V3FundsDeposited 이벤트를 정의하고 viem의 `decodeEventLog`로 파싱.
- 이벤트 파싱 실패 시 depositTxHash 기반 fallback 조회 (`/deposit/status?depositTxnRef=txHash`).
- bridge_metadata에 depositId와 depositTxHash 모두 저장.
**Phase:** Phase 2 deposit 후 이벤트 파싱 + metadata 저장.

### Pitfall 13: Testnet 환경에서 fill 지연으로 테스트 오판

**What goes wrong:** Across testnet은 mainnet과 달리 fill에 약 1분이 걸리고 (mainnet은 2초), relayer가 수동 펀딩되므로 유동성이 불안정하다. 소액($10 이하) 테스트 권장.
**Prevention:**
- 테스트 코드에서 mock API 사용 (실제 testnet 호출 최소화).
- E2E 테스트 시 testnet 전용 timeout을 충분히 설정 (2분 이상).
- Across 공식 문서 권장: testnet에서는 $10 이하 소액만 사용.
**Phase:** Phase 4 테스트 시 mock 기반 단위 테스트 우선, E2E는 testnet 타임아웃 고려.

### Pitfall 14: Integrator ID 미등록

**What goes wrong:** Across는 프로덕션 통합에 2-byte hex integrator ID를 요구한다. 미등록 시 API 접근이 제한되거나 rate limit이 적용될 수 있다.
**Prevention:**
- Phase 1 설계 시 integrator ID 등록 절차를 확인하고, 개발 중에는 기본값 사용.
- Admin Settings에 `across_integrator_id` 설정 항목 추가.
- 프로덕션 배포 시 integrator ID 등록 안내를 설치 문서에 포함.
**Phase:** Phase 1 리서치 시 등록 절차 확인, Phase 2 config에 항목 추가.

### Pitfall 15: message 파라미터 오용

**What goes wrong:** depositV3의 message 파라미터는 수신자 컨트랙트에 전달될 calldata인데, 빈 바이트가 아닌 잘못된 데이터를 전달하면 수신 측에서 실행 오류가 발생할 수 있다.
**Prevention:**
- 기본 브릿지(단순 전송)에서는 message = "0x" (빈 바이트).
- message를 사용하는 고급 기능(cross-chain action)은 이번 범위에 포함하지 않으므로 항상 빈 바이트 전달.
- depositV3 calldata 인코딩 시 message 필드를 `"0x"` 또는 `Uint8Array(0)`으로 고정.
**Phase:** Phase 2 depositV3 calldata 인코딩 시 빈 message 고정.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: 리서치 + 설계 | Across API 스펙 변경 미반영 | 공식 문서 URL을 설계 문서에 명시, API 버전 확인 |
| Phase 1: 설계 | DB 테이블 필요 여부 미확정으로 Phase 2 지연 | bridge_status/bridge_metadata 기존 컬럼 재사용 가능 여부 Phase 1에서 확정 |
| Phase 2: depositV3 인코딩 | quoteTimestamp/fillDeadline 초/밀리초 혼동 | uint32 = 초 단위, `Math.floor(Date.now() / 1000)` 통일 |
| Phase 2: 네이티브 토큰 | WETH 주소 체인별 상이 | 체인별 WETH 매핑 테이블 Phase 2 초기에 정의 |
| Phase 2: BATCH | approve + deposit 순서 실수 | BATCH 배열에서 approve가 반드시 deposit 앞에 위치 |
| Phase 2: 상태 추적 | depositId 추출 실패 시 추적 불가 | depositTxHash fallback + 기존 BridgeStatusTracker 2-phase 패턴 재사용 |
| Phase 3: MCP/SDK | quote 결과의 수수료 표시 혼란 | inputAmount, outputAmount, fee(inputAmount - outputAmount) 3값 명시 |
| Phase 3: 정책 | 크로스체인 이중 계산 (출발+도착) | inputAmount 기준 단일 평가, 도착 체인 수신은 정책 미적용 |
| Phase 4: 테스트 | testnet fill 지연으로 타임아웃 | mock 기반 테스트 우선, E2E testnet은 긴 타임아웃 |
| Phase 4: 에러 핸들링 | insufficient liquidity 에러 누락 | limits API 사전 조회 + Across API 에러 응답 매핑 |

---

## WAIaaS 통합 특화 경고

### 기존 LI.FI 패턴과의 차이점에서 오는 함정

| 항목 | LI.FI (기존) | Across (신규) | 주의사항 |
|------|-------------|---------------|---------|
| TX data 생성 | LI.FI API가 calldata 반환 | 직접 depositV3 calldata 인코딩 | ABI 인코딩 직접 구현 필요 (viem encodeFunctionData) |
| approve 대상 | LI.FI가 approvalAddress 반환 | SpokePool 주소가 approve 대상 | SpokePool 주소 = approve spender |
| 상태 추적 식별자 | txHash 기반 | depositId + originChainId 또는 txHash | depositId 추출 로직 추가 필요 |
| 네이티브 토큰 | LI.FI가 자동 처리 | msg.value 직접 설정 필요 | value 필드 명시적 관리 |
| 수수료 계산 | LI.FI가 outputAmount 반환 | outputAmount 직접 계산 | 수수료 공식 정확 구현 필수 |

### Pipeline 통합 시 특별 주의

1. **Stage 3 정책 평가**: inputAmount 기준으로 평가. outputAmount은 수수료 차감 후이므로 정책 대상이 아님.
2. **Stage 4 Owner 승인**: 브릿지 요청 시 출발/도착 체인, inputAmount, 수수료, 예상 도착 시간을 승인 메시지에 포함.
3. **Stage 5 실행**: CONTRACT_CALL type으로 실행. 네이티브 토큰인 경우 value 필드 필수. BATCH인 경우 approve + deposit 순서.
4. **Post-Stage 5**: deposit TX 확인 후 AsyncPollingService에 bridge tracker 등록. bridge_status = 'PENDING', bridge_metadata에 depositId/originChainId/destinationChainId 저장.

---

## Sources

- [Across Documentation - Selected Contract Functions](https://docs.across.to/reference/selected-contract-functions) — depositV3 파라미터 상세, fillDeadline/exclusivityDeadline 검증 규칙
- [Across Documentation - API Reference](https://docs.across.to/reference/api-reference) — suggested-fees, deposit/status, limits, available-routes 엔드포인트
- [Across Documentation - Fees in the System](https://docs.across.to/reference/fees-in-the-system) — LP fee/Relayer fee 계산 구조
- [Across Documentation - Tracking Events](https://docs.across.to/reference/tracking-events) — V3FundsDeposited 이벤트 추적
- [Across V3 Incremental Audit (OpenZeppelin)](https://blog.openzeppelin.com/across-v3-incremental-audit) — 보안 감사 결과
- [Across GitHub - SpokePool.sol](https://github.com/across-protocol/contracts/blob/master/contracts/SpokePool.sol) — 컨트랙트 소스
- [Across GitHub - deployments](https://github.com/across-protocol/contracts/blob/master/deployments/README.md) — 체인별 SpokePool 배포 주소
- 기존 코드: `packages/actions/src/providers/lifi/` — LI.FI BridgeStatusTracker 2-phase 패턴, LiFiActionProvider resolve 패턴, LiFiApiClient 구현
- 기존 코드: `packages/actions/src/common/async-status-tracker.ts` — IAsyncStatusTracker 인터페이스, BRIDGE_STATUS_VALUES 6-value enum
