# Project Research Summary

**Project:** WAIaaS v31.6 Across Protocol Cross-Chain Bridge Integration
**Domain:** DeFi Cross-Chain Bridge (Intent-based, EVM-only)
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

Across Protocol 통합은 WAIaaS 기존 아키텍처와 매우 높은 호환성을 보이며, 네 연구 파일 모두 동일한 결론에 수렴했다. SpokePool의 `depositV3()`는 일반 EVM 컨트랙트 호출이므로 기존 6-stage 파이프라인의 `CONTRACT_CALL`/`BATCH` type으로 그대로 처리된다. LI.FI(v28.3)에서 구축한 `IActionProvider`, `IAsyncStatusTracker`, `AsyncPollingService`, `bridge_status`/`bridge_metadata` DB 컬럼이 모두 직접 재사용 가능하다. 신규 DB 마이그레이션도 불필요하다.

권장 구현 방식은 Across SDK(`@across-protocol/sdk`, `@across-protocol/app-sdk`) 없이 REST API 직접 호출이다. 기존 `ActionApiClient`를 확장하여 Across 5개 엔드포인트(`/suggested-fees`, `/available-routes`, `/limits`, `/deposit/status`, SpokePool `depositV3` on-chain 호출)를 래핑하고, viem `encodeFunctionData`로 calldata를 인코딩한다. 신규 npm 의존성이 없으므로 번들 크기와 보안 노출이 증가하지 않는다. Across SDK는 ethers.js 의존성을 포함하여 WAIaaS의 viem 전용 아키텍처와 충돌한다.

가장 중요한 운영 위험은 quote staleness다. Across 공식 문서는 `/suggested-fees` 응답 캐싱을 명시적으로 금지한다(LP fee는 utilization 기반 실시간 변동). 캐시된 quote로 `depositV3`를 호출하면 Relayer가 fill하지 않아 자금이 SpokePool에 fillDeadline까지 잠긴다. 이를 방지하려면 매 실행마다 fresh quote 조회, `quoteTimestamp` 10분 유효 창 준수, `outputAmount = inputAmount - totalRelayFee.total` 정확한 계산이 필수다. 네이티브 ETH 브릿지 시 `inputToken`에 WETH 주소(체인별 매핑)를 사용하고 `msg.value`에 amount를 전달하는 것도 쉽게 간과되는 pitfall이다.

## Key Findings

### Recommended Stack

신규 npm 의존성이 전혀 필요 없다. 세 가지 기존 의존성만으로 완전한 구현이 가능하며, Across SDK 3종(`@across-protocol/app-sdk`, `@across-protocol/sdk`, `@across-protocol/contracts`)은 모두 명시적으로 거부된다.

**Core technologies:**
- `viem ^2.21.0`: `encodeFunctionData` + `parseAbi`로 SpokePool `depositV3` calldata 인코딩 — 이미 설치됨, ABI 인라인 정의로 contracts 패키지 불필요
- `zod ^3.24.0`: Across API 5개 엔드포인트 응답 스키마 검증 — 이미 설치됨, `AcrossSuggestedFeesSchema` 등 4개 스키마 신규 정의
- `@waiaas/core (workspace:*)`: `ActionApiClient` 베이스, `IActionProvider`, `IAsyncStatusTracker` 인터페이스 — LI.FI와 동일한 통합 패턴

**거부된 패키지:**
- `@across-protocol/app-sdk` v0.4.4: Frontend/React/wagmi 중심, 서버사이드 부적합
- `@across-protocol/sdk` v4.1.32: ethers.js 의존, WAIaaS viem 전용 아키텍처와 충돌
- `@across-protocol/contracts` v4.1.3: `depositV3` 1개 함수를 위해 전체 패키지 추가 불필요

### Expected Features

**Must have (table stakes):**
- Bridge Quote (`/suggested-fees`) — 수수료, 수령액, 예상 시간 사전 확인 필수
- ERC-20 Bridge Execute (approve + `depositV3` BATCH) — 핵심 기능, 12개 파라미터 인코딩
- Native Token Bridge (ETH, `msg.value` + WETH 주소 치환) — 가장 흔한 브릿지 유스케이스
- Bridge Status Tracking (`/deposit/status` 폴링) — 크로스체인 TX 완료까지 비동기 추적 필수
- Available Routes (`/available-routes`) — 에이전트가 가능한 경로 파악
- Transfer Limits (`/limits`) — minDeposit/maxDeposit 사전 검증으로 실패 방지
- MCP Tool Exposure (5개: quote/execute/status/routes/limits) — AI 에이전트 접근성
- SDK Methods (5개: quote/execute/status/routes/limits) — 프로그래밍 접근
- Admin Settings (6개 키: enabled, api_base_url, integrator_id, fill_deadline_buffer 등)

**Should have (differentiators):**
- 초고속 Fill 알림 (Across 2-10초 fill 완료 시 `BRIDGE_COMPLETED` 알림)
- Bridge Limits 사전 검증 (`isAmountTooLow` 플래그 + limits 범위 교차 검증)
- Refund 감지 (expired → refunded 상태 전이 감지 및 알림)
- IncomingTxMonitor 연동 (목적지 체인 Relayer fill 자동 감지 — 추가 구현 불필요)
- Integrator ID 설정 (rate limit 완화, Across 대시보드 통계)
- connect-info capability (`across_bridge: true` 자기 발견)

**Defer (v2+):**
- LI.FI vs Across 자동 라우팅 비교 — 브릿지 애그리게이션 레이어 별도 마일스톤
- Cross-chain message passing (`depositV3.message` 파라미터) — 보안 검증 필요, 범위 외
- Solana bridge — Across EVM-only 우선, Solana 지원은 별도 평가
- Swap API (`/swap/approval`) 통합 — bridge와 다른 API, DCent Swap이 이미 커버

### Architecture Approach

Across 통합은 LI.FI(v28.3) 패턴을 그대로 따른다. `AcrossBridgeActionProvider`(`IActionProvider`)가 5개 action을 노출하고, quote/execute는 `AcrossApiClient.getSuggestedFees()` 호출 후 `ContractCallRequest[]`를 반환한다. ERC-20은 `[approve, depositV3]` BATCH, 네이티브 토큰은 `[depositV3 with value]` 단일 `CONTRACT_CALL`이다. 실행 후 `bridge_status='PENDING'` 등록으로 `AsyncPollingService`가 `AcrossBridgeStatusTracker`를 통해 `/deposit/status` API를 폴링한다. Across Intent fill은 2-10초 내 완료되므로 폴링 간격은 LI.FI(30초) 대비 15초로 단축된다.

**Major components:**
1. `AcrossApiClient` (`ActionApiClient` 확장) — 5개 Across REST API 엔드포인트 래핑, Zod 응답 검증
2. `AcrossBridgeActionProvider` (`IActionProvider` 구현) — quote/execute/status/routes/limits 5 actions, SpokePool calldata 인코딩
3. `AcrossBridgeStatusTracker` + `AcrossBridgeMonitoringTracker` (`IAsyncStatusTracker`) — 2-phase polling (15s x 480 = 2h active, 5min x 264 = 22h monitoring)
4. Bridge Enrollment 로직 (daemon `actions.ts` post-execution) — `bridge_status='PENDING'` + metadata 등록
5. `AcrossConfig` — 설정 타입, 기본값, 체인별 chain ID 매핑, WETH 주소 매핑

**새로 생성하는 파일 (`packages/actions/src/providers/across-bridge/`):**
- `index.ts`, `across-api-client.ts`, `schemas.ts`, `config.ts`, `bridge-status-tracker.ts`

**수정하는 파일:**
- `packages/actions/src/index.ts` (export 추가)
- `packages/daemon/src/lifecycle/daemon.ts` (tracker 등록)
- `packages/daemon/src/api/routes/actions.ts` (bridge enrollment)
- Admin Settings definitions, SDK, skill files

**변경 불필요:**
- DB schema (v52) — `bridge_status` + `bridge_metadata` 기존 컬럼으로 충분
- DB migration — 불필요
- 6-stage 파이프라인 — `CONTRACT_CALL`/`BATCH` 기존 type으로 처리
- Policy engine — 기존 `SPENDING_LIMIT`, `RATE_LIMIT`, `CONTRACT_WHITELIST` 그대로 적용
- `AsyncPollingService` — `registerTracker()`로 등록만 하면 자동 폴링

### Critical Pitfalls

1. **outputAmount 계산 오류 → 자금 장기 락업** — `outputAmount = BigInt(inputAmount) - BigInt(totalRelayFee.total)` 공식 엄수. 절대 LP/relayer fee를 개별 조합하여 계산하지 않는다. Zod로 `outputAmount < inputAmount` 런타임 검증 필수.

2. **`/suggested-fees` 응답 캐싱 → Relayer fill 거부** — Across 공식 캐싱 금지 정책. LP fee는 매 블록 변동. 매 요청마다 fresh API 호출 강제. `/available-routes`만 5분 캐시 허용.

3. **`quoteTimestamp` 만료 → `depositV3` on-chain revert** — SpokePool은 `quoteTimestamp`이 현재 블록 기준 10분 이내여야 통과. Stage 4(Owner 승인 대기) 후 시간이 경과하면 Stage 5 직전에 quote 재조회 필요. Admin Settings에 quote 재조회 임계시간 설정.

4. **네이티브 ETH 브릿지 시 WETH 주소 혼동 → revert** — ETH 브릿지 시 `inputToken`은 체인별 WETH 주소(예: Ethereum `0xC02a...6Cc2`)여야 한다. `0xEee...Eee`(ETH placeholder)나 zero address를 넣으면 SpokePool이 거부. 체인별 WETH 매핑 테이블 필수 관리.

5. **Bridge Enrollment 누락 → 상태 추적 불가** — `depositV3` 성공 후 `bridge_status='PENDING'` 등록을 `actions.ts`에 명시적으로 구현하지 않으면 `AsyncPollingService`가 추적하지 않는다. `bridge_metadata`에 `txHash`, `originChainId`, `destChainId` 포함 필수.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Across API Client + 스키마 + 설정
**Rationale:** `AcrossApiClient`, Zod 스키마, `AcrossConfig`(WETH 주소 매핑 포함)는 `AcrossBridgeActionProvider`와 `AcrossBridgeStatusTracker` 양쪽의 기반 의존성이다. 먼저 구축해야 후속 컴포넌트가 임포트 가능하다.
**Delivers:** `AcrossApiClient` (5 endpoints), Zod response schemas (4개), `AcrossConfig` (chain ID map + WETH map + Admin Settings keys)
**Addresses:** API 스펙 확정, quote staleness 방지(no-cache 정책 API 레이어에서 강제), WETH 주소 매핑 초기 정의
**Avoids:** 하드코딩 SpokePool 주소(API `spokePoolAddress` 동적 조회 패턴 설정), 응답 스키마 drift(Zod `.passthrough()` 사용)

### Phase 2: AcrossBridgeActionProvider (quote/execute/routes/limits)
**Rationale:** Phase 1의 `AcrossApiClient` 완성 후 Provider 구현 가능. quote와 execute가 없으면 추적할 대상이 없으므로 StatusTracker보다 먼저.
**Delivers:** `AcrossBridgeActionProvider` (5 actions), `depositV3` calldata 인코딩, ERC-20 BATCH (approve + depositV3), 네이티브 ETH `msg.value` 처리
**Uses:** viem `encodeFunctionData` + `parseAbi` (SPOKE_POOL_ABI 인라인), `AcrossApiClient`, 기존 6-stage 파이프라인 `CONTRACT_CALL`/`BATCH`
**Implements:** `IActionProvider` 패턴 (LI.FI 선례 그대로)
**Avoids:** `outputAmount` 오계산(totalRelayFee.total 사용), WETH 주소 혼동(Phase 1 매핑 활용), approve + deposit 순서 오류

### Phase 3: Bridge Status Tracker + Daemon Integration
**Rationale:** StatusTracker는 Phase 2 execute action이 완성되어야 추적할 대상이 생긴다. Daemon enrollment 로직도 Phase 2 Provider가 임포트 가능해야 등록할 수 있다.
**Delivers:** `AcrossBridgeStatusTracker` + `AcrossBridgeMonitoringTracker` (2-phase polling), Daemon tracker 등록, `actions.ts` bridge enrollment (`bridge_status='PENDING'` + metadata), Admin Settings 6개 키
**Avoids:** bridge enrollment 누락(enrollment 통합 테스트 필수), `/deposit/status` indexer 지연 오탐(첫 폴링 15초 후 시작)

### Phase 4: MCP / SDK / Skill Files
**Rationale:** Phase 2-3의 Provider 등록 후에야 MCP 자동 노출(`mcpExpose=true`)과 SDK 메서드가 의미가 있다. 인터페이스 레이어는 비즈니스 로직 완성 후.
**Delivers:** MCP tools (across-bridge-quote, across-bridge-execute, across-bridge-status, across-bridge-routes, across-bridge-limits), SDK 5 메서드, `skills/defi.skill.md` Across 브릿지 섹션 추가, connect-info capability
**Avoids:** MCP quote 응답의 수수료 표시 혼란(inputAmount/outputAmount/fee 3값 명시)

### Phase 5: 테스트 및 검증
**Rationale:** 전체 컴포넌트 완성 후 단위+통합 테스트로 전체 검증. testnet E2E는 마지막에.
**Delivers:** Mock 기반 단위 테스트 (`AcrossApiClient`, `outputAmount` 계산, `depositV3` calldata 인코딩, BATCH 순서), 통합 테스트 (bridge enrollment, StatusTracker 상태 매핑), E2E 선택 (testnet, mock 우선)
**Avoids:** testnet fill 지연 오판(mock 우선, testnet timeout 2분+), `fillDeadline`/`quoteTimestamp` ms/s 혼동

### Phase Ordering Rationale

- **의존성 체인:** ApiClient → Provider → Tracker → Daemon integration → MCP/SDK. 각 단계가 이전 단계의 타입과 인스턴스를 임포트하므로 순서가 강제된다.
- **DB 마이그레이션 없음:** 기존 `bridge_status`/`bridge_metadata` 컬럼 재사용으로 Phase 1에 DB 설계 비용이 없다. LI.FI 선례 덕분에 스키마 설계 위험이 제거됨.
- **신규 의존성 없음:** Phase 1부터 `pnpm install` 없이 시작 가능. 빌드/CI 영향 없음.
- **Pitfall 우선 처리:** WETH 주소 매핑(Phase 1), `outputAmount` 검증(Phase 2), bridge enrollment(Phase 3) 순서로 가장 위험한 pitfall을 구현 시점에 즉시 처리.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (API Client):** `/deposit/status` 응답의 전체 필드 목록을 실제 API 호출로 확인 필요. 문서에서 status enum 4값은 확인했으나 나머지 필드 정확도 MEDIUM. Zod `.passthrough()` 사용 권장.
- **Phase 2 (Provider):** 체인별 SpokePool 주소 확정 필요 (Ethereum만 Etherscan 확인됨, 나머지는 Across GitHub `deployments.json` 참조). 체인별 WETH 주소 매핑 완성 필요.
- **Phase 3 (Daemon):** 현재 LI.FI bridge의 `bridge_status` enrollment 코드 존재 여부 확인 필요. LI.FI enrollment가 없다면 Across와 함께 LI.FI enrollment도 구현해야 할 수 있음.

Phases with standard patterns (skip research-phase):
- **Phase 4 (MCP/SDK):** `mcpExpose=true`로 MCP 자동 노출. SDK 메서드는 기존 패턴 반복. 추가 리서치 불필요.
- **Phase 5 (Tests):** Mock 기반 단위 테스트 패턴은 기존 provider 테스트와 동일. 추가 리서치 불필요.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 신규 의존성 없음 확인. LI.FI 동일 패턴 검증 완료. viem ABI encoding 공식 문서 교차 검증 |
| Features | HIGH | Across API 5 endpoints + depositV3 공식 문서 확인. 4개 연구 파일 동일 결론 |
| Architecture | HIGH | LI.FI/DCent/Staking 11개 provider 선례와 동일 패턴. 기존 코드 직접 검증 완료 |
| Pitfalls | MEDIUM | quote staleness, WETH 혼동은 공식 문서 기반. 실 운영 경험 없음. 핵심 5개 pitfall 모두 공식 문서에서 확인됨 |
| API Stability | MEDIUM | depositV3는 안정적. `/deposit/status` 응답 전체 필드 목록 미확인. V3 마이그레이션 완료 상태이나 추가 변경 가능성 |

**Overall confidence:** HIGH

### Gaps to Address

- **/deposit/status 응답 스키마 검증:** status 4값(filled/pending/expired/refunded)은 확인. `fillTxnRef`, `depositId`, `actionsSucceeded` 등 세부 필드는 실제 API 호출로 검증 필요. Zod `.passthrough()` + 런타임 로깅으로 Phase 1에서 보완.
- **체인별 SpokePool 주소 확정:** Ethereum(`0x5c7B...35C5`), Polygon(`0x69B5...7920`) 확인. Arbitrum/Optimism/Base는 Across GitHub `deployments/README.md`에서 Phase 2 초기에 확정.
- **체인별 WETH 주소 매핑 완성:** Ethereum WETH(`0xC02a...6Cc2`), Arbitrum WETH(`0x82aF...`) 등 WAIaaS 지원 체인 전체 매핑. Phase 1 `config.ts`에서 정의.
- **LI.FI bridge enrollment 현황 확인:** 현재 LI.FI `bridge_status` enrollment가 `actions.ts`에 있는지 코드 확인 필요. 없다면 Across와 LI.FI 모두 Phase 3에서 구현.
- **zkSync/Scroll WAIaaS 지원 여부:** Across 지원 체인 중 zkSync(324), Scroll(534352)의 WAIaaS 네트워크 지원 여부 미확인. Phase 2에서 WAIaaS 네트워크 목록과 대조.

## Sources

### Primary (HIGH confidence)
- [Across API Reference](https://docs.across.to/reference/api-reference) — suggested-fees, deposit/status, limits, available-routes 엔드포인트
- [Across Selected Contract Functions](https://docs.across.to/reference/selected-contract-functions) — depositV3 시그니처, fillDeadline/quoteTimestamp 검증 규칙
- [Across Intent Lifecycle](https://docs.across.to/concepts/intent-lifecycle-in-across) — Relayer fill 흐름, 2-10초 완료 타임라인
- [Across Bridge Guide](https://docs.across.to/developer-quickstart/bridge) — 통합 흐름, WETH inputToken 패턴
- [SpokePool.sol (GitHub)](https://github.com/across-protocol/contracts/blob/master/contracts/SpokePool.sol) — 컨트랙트 소스, depositV3 payable 검증
- [Ethereum SpokePool (Etherscan)](https://etherscan.io/address/0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5) — 배포 주소 확인
- 기존 WAIaaS 코드: `packages/actions/src/providers/lifi/` — LI.FI 선례 패턴 직접 검증

### Secondary (MEDIUM confidence)
- [Across Fees in the System](https://docs.across.to/reference/fees-in-the-system) — LP fee 이자율 모델, relayer capital/gas fee 구조
- [Across Tracking Events](https://docs.across.to/reference/tracking-events) — V3FundsDeposited 이벤트, depositId 추출
- [Across Migration V2 to V3](https://docs.across.to/introduction/migration-guides/migration-from-v2-to-v3) — 2025-01-23 컨트랙트 마이그레이션 이력
- [Across GitHub Deployments](https://github.com/across-protocol/contracts/blob/master/deployments/README.md) — 체인별 SpokePool 주소 (미확인 체인 존재)

### Tertiary (LOW confidence)
- [@across-protocol/app-sdk npm](https://www.npmjs.com/package/@across-protocol/app-sdk) — v0.4.4 frontend SDK (명시적 거부, WAIaaS 부적합 확인용으로만 참조)
- [@across-protocol/sdk npm](https://www.npmjs.com/package/@across-protocol/sdk) — v4.1.32 relayer SDK (명시적 거부, ethers.js 의존성 확인용)

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
