# Feature Landscape

**Domain:** Across Protocol Intent-based Cross-Chain Bridge Integration (WAIaaS Action Provider)
**Researched:** 2026-03-08

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bridge Quote (수수료/예상 시간) | 사용자가 실행 전에 비용과 시간을 알아야 함. Across `/suggested-fees` API로 totalRelayFee, lpFee, relayerCapitalFee, relayerGasFee, expectedFillTimeSec 반환 | Low | 기존 LI.FI quote 패턴과 동일한 resolve 흐름. `/suggested-fees` 단일 호출로 수수료+한도+fillDeadline+exclusiveRelayer 전부 획득 |
| ERC-20 Bridge 실행 (approve + depositV3) | 핵심 기능. ERC-20 토큰 크로스체인 전송. SpokePool에 approve 후 `depositV3()` 호출 | Medium | BATCH type (APPROVE + CONTRACT_CALL) 기존 파이프라인 그대로. 12개 파라미터 인코딩 필요 (depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, destinationChainId, exclusiveRelayer, quoteTimestamp, fillDeadline, exclusivityDeadline, message) |
| Native Token Bridge (ETH msg.value) | ETH->ETH 크로스체인은 가장 흔한 유스케이스. WETH 주소를 inputToken으로 사용하되 msg.value로 전송 | Medium | CONTRACT_CALL의 value 필드 활용. Across는 네이티브 ETH를 WETH 주소로 매핑하는 패턴 사용 |
| Bridge Status Tracking | 브릿지 완료까지 사용자에게 상태를 보여줘야 함. `/deposit/status` API: filled/pending/expired/refunded 4-state | Medium | 기존 IAsyncStatusTracker + AsyncPollingService 패턴 100% 재사용. LI.FI BridgeStatusTracker 2-phase 패턴(active 30s x N + monitoring 5min x N) 동일 적용. Across는 10초 인덱싱 cadence |
| Supported Routes 조회 | 어떤 체인/토큰 조합이 가능한지 사전 확인 필수. `/available-routes` API | Low | 캐싱 가능 (라우트는 자주 변하지 않음). originChainId/destinationChainId/token 필터 지원 |
| Transfer Limits 조회 | 최소/최대 전송 금액 확인 없으면 실패 트랜잭션 발생. `/limits` API: minDeposit, maxDeposit, maxDepositInstant, maxDepositShortDelay | Low | `/suggested-fees` 응답의 limits 필드에도 포함되므로 별도 호출 선택적 |
| 정책 엔진 통합 | 크로스체인 전송도 정책 평가 대상. CONTRACT_CALL로 실행되므로 기존 Stage 3 정책 평가 자동 적용 | Low | outputAmount USD 환산으로 DAILY_LIMIT/SINGLE_TX_LIMIT 평가. CONTRACT_WHITELIST에 SpokePool 주소 등록 필요 |
| MCP 도구 (quote/execute/status) | AI 에이전트가 MCP로 브릿지 호출해야 함. 기존 Action Provider mcpExpose 패턴 | Low | across-bridge-quote, across-bridge-execute, across-bridge-status 3개 최소 |
| SDK 메서드 | @waiaas/sdk에서 프로그래밍 접근 | Low | 기존 패턴 그대로 |
| Admin Settings | fillDeadline, slippage 등 운영자 런타임 조정 | Low | across_fill_deadline_buffer, across_exclusivity_deadline, across_default_slippage 등 |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `/swap/approval` 통합 API 활용 | Across의 최신 통합 API는 quote+approval+txdata를 단일 호출로 반환. 별도 SpokePool ABI 인코딩 불필요 | Medium | `/swap/approval` 응답이 approvalTxns[] + swapTx를 직접 반환하므로 depositV3 파라미터 수동 인코딩 대신 API 반환 calldata 사용 가능. LI.FI `/quote` -> transactionRequest 패턴과 거의 동일해짐. 단, SpokePool 직접 호출 대비 API 의존도 증가 트레이드오프 |
| Bridge Limits 사전 검증 | execute 전에 minDeposit/maxDeposit 검증하여 실패 방지 | Low | quote 시점에 isAmountTooLow 플래그 체크 + limits 범위 검증 |
| Refund 감지 및 알림 | 브릿지 실패 시 자동 환불 상태(~90분 후) 감지하여 알림 발송 | Low | status polling에서 expired -> refunded 전이 감지. 기존 알림 인프라(BRIDGE_COMPLETED/BRIDGE_FAILED 이벤트) 재사용 |
| IncomingTxMonitor 연동 | 목적지 체인에서 Relayer fill을 수신 TX로 감지 | Low | Relayer fill은 일반 ERC-20 transfer로 도착하므로 기존 IncomingTxMonitor(v27.1)가 자동 감지 가능. 추가 구현 불필요할 수 있음 (Phase 1 설계에서 확인) |
| fillDeadline/exclusivityDeadline Admin Settings | 운영자가 deadline 전략을 조정하여 fill 확률 vs 시간 트레이드오프 관리 | Low | Across API가 suggested-fees에서 권장값 반환. Admin Settings로 오버라이드 가능하게 |
| connect-info capability | 에이전트가 Across bridge 가용 여부를 자기 발견 | Low | 기존 패턴. capabilities에 across_bridge: true 추가 |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| LI.FI와 자동 라우팅 비교 | 범위 초과. 브릿지 애그리게이션 레이어는 별도 마일스톤 | 사용자가 명시적으로 Across 또는 LI.FI 선택. objective에도 명시됨 |
| SpokePool 직접 ABI 인코딩 (depositV3 수동 구성) | `/swap/approval` API가 approvalTxns + swapTx calldata를 직접 반환하므로 수동 인코딩 불필요. 유지보수 부담 증가 | `/swap/approval` API 응답의 calldata를 CONTRACT_CALL로 전달. LI.FI `/quote` -> transactionRequest 패턴과 동일 |
| Across SDK (@across-protocol/sdk) 직접 의존 | 추가 npm 의존성. REST API만으로 충분. LI.FI도 SDK 없이 API만 사용 중 | Across REST API 직접 호출 (axios/fetch). 기존 ActionApiClient 패턴 재사용 |
| Cross-chain swap (다른 토큰 간 교환) | Across `/swap/approval`이 cross-chain swap도 지원하지만, DCent Swap(v31.3)이 이미 크로스체인 교환을 커버. 중복 방지 | bridge (동일 토큰 크로스체인)에 집중. 추후 필요 시 cross_swap action 추가 가능 |
| Relayer 선택/관리 | Across Relayer 네트워크는 프로토콜이 관리. 사용자가 개입할 영역 아님 | exclusiveRelayer/exclusivityDeadline은 API 응답값 그대로 사용 |
| ERC-7683 (Cross-chain Intent Standard) 직접 통합 | Across가 ERC-7683 production 지원하지만 WAIaaS는 Across API 레이어에서 추상화. 표준 직접 구현은 범위 초과 | Across API가 ERC-7683 내부적으로 처리. WAIaaS는 API 소비자로만 동작 |
| Solana bridge | Across가 Solana를 지원하지만, 이번 마일스톤은 EVM 체인 간 브릿지에 집중 | EVM-only로 시작. Solana Across 지원은 별도 마일스톤에서 평가 |

## Feature Dependencies

```
available-routes 조회 -> quote 조회 (지원 라우트 확인 후 견적)
quote 조회 (/suggested-fees 또는 /swap/approval) -> bridge 실행 (수수료/calldata 획득)
bridge 실행 (ERC-20: approve + deposit) -> status tracking (depositTxHash로 추적)
status tracking -> 알림 (BRIDGE_COMPLETED/BRIDGE_FAILED 이벤트)

기존 인프라 의존:
- IActionProvider 인터페이스 (v1.5)
- IAsyncStatusTracker + AsyncPollingService (v28.3 LI.FI에서 구축)
- BATCH 파이프라인 (APPROVE + CONTRACT_CALL)
- 알림 이벤트 (BRIDGE_COMPLETED, BRIDGE_FAILED -- v28.3에서 추가)
- Admin Settings 프레임워크 (v1.4.4)
- connect-info capabilities (v26.4)
- 정책 엔진 Stage 3 (CONTRACT_WHITELIST, DAILY_LIMIT 등)
```

## MVP Recommendation

Prioritize:
1. **Across API Client** (quote via `/suggested-fees` + `/swap/approval` + limits + routes + status): 5개 API 엔드포인트 래퍼. Zod 응답 스키마 검증
2. **AcrossBridgeActionProvider** (bridge action): `/swap/approval` API로 calldata 획득 -> approvalTxns를 APPROVE + swapTx를 CONTRACT_CALL로 BATCH 반환
3. **Bridge Status Tracker**: IAsyncStatusTracker 구현. `/deposit/status` 폴링. LI.FI 2-phase 패턴 재사용 (active 30s + monitoring 5min)
4. **MCP 도구 3개** + SDK 메서드 3개: quote, execute, status
5. **Admin Settings 5개**: fill_deadline_buffer, exclusivity_deadline, default_slippage, api_base_url, integrator_id

Defer:
- **Cross-chain swap action**: DCent Swap이 이미 커버. 동일 토큰 bridge에 집중
- **LI.FI 자동 비교 라우팅**: 별도 애그리게이션 레이어 마일스톤
- **Solana bridge**: EVM 체인 우선
- **Admin UI Bridge 탭 신규 페이지**: 기존 트랜잭션 목록에서 bridge_status 표시로 충분 (LI.FI와 동일 패턴)

## Complexity Assessment

| Feature | Complexity | Rationale |
|---------|-----------|-----------|
| Across API Client | Low | HTTP GET 5개 엔드포인트. 기존 ActionApiClient 패턴 |
| AcrossBridgeActionProvider | Medium | `/swap/approval` API 응답을 ContractCallRequest[] 변환. LI.FI provider와 구조 동일하지만 approvalTxns/swapTx 분리 처리 필요 |
| Bridge Status Tracker | Low | LI.FI BridgeStatusTracker 코드 거의 복사. API 응답 매핑만 변경 (filled/pending/expired/refunded -> COMPLETED/PENDING/FAILED/REFUNDED) |
| MCP/SDK/Settings | Low | 기존 패턴 반복. 보일러플레이트 |
| 전체 마일스톤 | Medium | 기존 인프라 95% 재사용. 신규 구현은 API 클라이언트 + Provider + Tracker |

## Key Technical Decisions for Design Phase

1. **`/swap/approval` vs `/suggested-fees` + SpokePool 직접 호출**: `/swap/approval`이 권장. calldata를 API가 구성해주므로 SpokePool ABI 인코딩 불필요. LI.FI `/quote` 패턴과 동일. 단, quote-only 조회는 `/suggested-fees` 사용 (수수료 미리보기)
2. **DB 테이블 필요 여부**: bridge_status/bridge_metadata는 기존 transactions 테이블 컬럼으로 충분 (LI.FI와 동일). 별도 across_deposits 테이블은 불필요할 가능성 높음
3. **SpokePool 주소 관리**: Across API가 체인별 SpokePool 주소를 `/swap/approval` 응답의 to 필드로 반환하므로 하드코딩 불필요
4. **fillDeadline 전략**: Across API `/suggested-fees` 응답의 fillDeadline 값 그대로 사용 (API가 최적값 계산). Admin Settings로 오버라이드 가능하게 하되 기본은 API 권장값
5. **Integrator ID**: Across가 integrator 등록 폼 제출을 권장. 테스트 환경에서는 없어도 동작하지만, production에서는 등록 필요. Admin Settings로 설정

## Across Protocol API Summary (for design doc reference)

### Endpoints Used

| Endpoint | Method | Purpose | Caching |
|----------|--------|---------|---------|
| `/suggested-fees` | GET | Quote (수수료, 한도, fillDeadline, exclusiveRelayer) | NO (Across 권고: 캐싱 금지) |
| `/swap/approval` | GET | Approval txns + bridge tx calldata (통합 API) | NO |
| `/available-routes` | GET | 지원 라우트 목록 | 가능 (1h TTL 권장) |
| `/limits` | GET | min/max deposit 한도 | 가능 (5min TTL) |
| `/deposit/status` | GET | Bridge 상태 추적 (filled/pending/expired/refunded) | N/A (폴링) |

### depositV3 Parameters (SpokePool contract)

| Parameter | Type | Source |
|-----------|------|--------|
| depositor | address | context.walletAddress |
| recipient | address | 입력 또는 walletAddress (self-bridge) |
| inputToken | address | origin chain 토큰 |
| outputToken | address | destination chain 토큰 |
| inputAmount | uint256 | 사용자 입력 금액 |
| outputAmount | uint256 | inputAmount * (1 - totalRelayFee.pct) |
| destinationChainId | uint256 | 목적지 체인 |
| exclusiveRelayer | address | /suggested-fees 응답 |
| quoteTimestamp | uint32 | /suggested-fees 응답 |
| fillDeadline | uint32 | /suggested-fees 응답 (Admin Settings 오버라이드 가능) |
| exclusivityDeadline | uint32 | /suggested-fees 응답 |
| message | bytes | 0x (빈 메시지, handler 없음) |

### Supported Chains (WAIaaS 겹침 확인)

| Chain | Across | WAIaaS | Notes |
|-------|--------|--------|-------|
| Ethereum (1) | O | O | 완전 지원 |
| Arbitrum (42161) | O | O | 완전 지원 |
| Optimism (10) | O | O | 완전 지원 |
| Base (8453) | O | O | 완전 지원 |
| Polygon (137) | O | O | 완전 지원 |
| Linea (59144) | O | O | 완전 지원 |
| zkSync (324) | O | ? | WAIaaS 지원 여부 확인 필요 |
| Scroll (534352) | O | ? | WAIaaS 지원 여부 확인 필요 |
| HyperEVM (999) | O | O | v31.4에서 추가 |

### Fee Structure

- **totalRelayFee** = lpFee + relayerCapitalFee + relayerGasFee
- **outputAmount** = inputAmount - totalRelayFee.total
- LP fee: utilization 기반 이자율 모델 (체인별 R0/R1/R2 파라미터)
- Relayer fee: gas + capital opportunity cost + risk premium
- 수수료는 inputAmount/outputAmount 스프레드로 암시적 표현

### Status Values Mapping

| Across Status | WAIaaS BridgeStatus | Action |
|---------------|---------------------|--------|
| filled | COMPLETED | 알림 BRIDGE_COMPLETED |
| pending | PENDING | 계속 폴링 |
| expired | FAILED -> REFUNDED | fillDeadline 초과, ~90분 내 환불 |
| refunded | REFUNDED | 환불 완료 알림 |

## Sources

- [Across API Reference](https://docs.across.to/reference/api-reference) - HIGH confidence
- [Across Selected Contract Functions (depositV3)](https://docs.across.to/reference/selected-contract-functions) - HIGH confidence
- [Across Fees in the System](https://docs.across.to/reference/fees-in-the-system) - HIGH confidence
- [Across Intent Lifecycle](https://docs.across.to/concepts/intent-lifecycle-in-across) - HIGH confidence
- [Across Bridge Integration Guide (/swap/approval)](https://docs.across.to/developer-quickstart/bridge) - HIGH confidence
- [Across Supported Chains and Tokens](https://docs.across.to/user-docs/how-across-works/supported-chains-and-tokens) - HIGH confidence
- [Across Migration from V2 to V3](https://docs.across.to/introduction/migration-guides/migration-from-v2-to-v3) - MEDIUM confidence
- 기존 WAIaaS 코드: LI.FI provider (packages/actions/src/providers/lifi/) - HIGH confidence
- 기존 WAIaaS 코드: IAsyncStatusTracker (packages/actions/src/common/async-status-tracker.ts) - HIGH confidence
