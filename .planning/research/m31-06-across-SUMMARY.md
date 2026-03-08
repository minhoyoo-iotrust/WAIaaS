# Research Summary: Across Protocol Cross-Chain Bridge

**Domain:** DeFi Cross-Chain Bridge (Intent-based)
**Researched:** 2026-03-08
**Overall confidence:** HIGH

## Executive Summary

Across Protocol 통합은 WAIaaS의 기존 아키텍처와 매우 높은 호환성을 보인다. SpokePool의 depositV3()는 일반 EVM 컨트랙트 호출이므로 기존 6-stage 파이프라인의 CONTRACT_CALL type으로 그대로 처리된다. ERC-20 토큰 브릿지는 approve + depositV3를 ContractCallRequest[]로 반환하여 기존 BATCH 파이프라인을 활용하고, 네이티브 토큰(ETH)은 msg.value를 사용하는 단일 CONTRACT_CALL로 처리한다.

브릿지 상태 추적은 LI.FI BridgeStatusTracker와 동일한 IAsyncStatusTracker 패턴을 사용한다. Across의 /deposit/status API를 폴링하여 filled/pending/expired/refunded 상태를 추적하며, 기존 AsyncPollingService에 등록만 하면 자동으로 작동한다. Across의 Intent 기반 Relayer fill은 보통 2-10초 내 완료되므로, 폴링 간격을 LI.FI(30초) 대비 짧은 15초로 설정한다.

가장 중요한 설계 결정은 **새 DB 테이블이 불필요**하다는 점이다. 기존 transactions 테이블의 bridge_status + bridge_metadata 컬럼이 범용 브릿지 추적용으로 설계되어 있으며, bridge_metadata JSON에 Across 전용 필드(depositId, fillTxnRef, originChainId, destChainId)를 저장하면 충분하다. DB 마이그레이션이 불필요하므로 구현 복잡도가 크게 줄어든다.

신규 외부 의존성도 불필요하다. viem(calldata 인코딩), Zod(API 응답 검증), ActionApiClient(HTTP client)가 모두 기존에 설치되어 있으며, Across REST API를 직접 호출하는 방식이 Across SDK(@across-protocol/sdk, ethers.js 의존)보다 가볍고 WAIaaS 아키텍처에 적합하다.

## Key Findings

**Stack:** 신규 의존성 없음. viem + Zod + ActionApiClient 기존 스택으로 충분. Across SDK 불사용 (ethers.js 의존 회피).
**Architecture:** LiFiActionProvider와 동일한 IActionProvider 패턴. AcrossBridgeActionProvider(5 actions) + AcrossBridgeStatusTracker(2-phase polling). 새 DB 테이블/마이그레이션 불필요.
**Critical pitfall:** Quote staleness -- /suggested-fees 응답을 캐시하면 relayer가 fill하지 않아 자금 잠김. 캐시 금지가 Across 공식 정책.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 1: Across Protocol 리서치 및 설계 (doc 79)** - API 사양 확정 + 설계 문서
   - Addresses: API endpoint 매핑, depositV3 파라미터, SpokePool 주소, 수수료 모델
   - Avoids: 구현 착수 전 API 변경/제약 발견 못 하는 리스크

2. **Phase 2: Across Bridge 코어 구현** - AcrossApiClient + Provider + Tracker
   - Addresses: quote, execute, status, routes, limits 전체 action
   - Avoids: approve+deposit BATCH 순서 오류, WETH 주소 혼동
   - Build order: ApiClient -> Provider -> Tracker -> Daemon integration

3. **Phase 3: MCP / SDK / Admin UI 통합** - 인터페이스 레이어
   - Addresses: MCP 5 tools, SDK 5 methods, skill files, Admin UI
   - Note: mcpExpose=true로 MCP는 대부분 자동. SDK 메서드만 명시적 구현 필요

4. **Phase 4: 테스트 및 검증** - Mock 기반 단위 + 통합
   - Addresses: calldata 인코딩, BATCH flow, status polling, 에러 케이스
   - Avoids: bridge enrollment 누락 (통합 테스트에서 반드시 검증)

**Phase ordering rationale:**
- Phase 1(설계)은 Across API 사양이 확정되어야 Phase 2 구현 가능
- Phase 2 내부 순서: ApiClient -> Provider -> Tracker -> Daemon (의존성 체인)
- Phase 3은 Phase 2의 Provider 등록 후에만 MCP/SDK 동작
- Phase 4는 Phase 2-3 완료 후 전체 검증

**Research flags for phases:**
- Phase 1: Across API 사양 변경 가능성 있음 (V3 마이그레이션 진행 중). /deposit/status 응답 스키마 정확한 확인 필요 -- MEDIUM confidence
- Phase 2: SpokePool 체인별 주소 확정 필요 (GitHub deployments.json 참조). 현재 Ethereum만 Etherscan에서 확인됨
- Phase 3: 표준 패턴, 추가 리서치 불필요
- Phase 4: Across testnet fill 지연 (1분) 주의. Mock API 우선 테스트 권장

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 신규 의존성 없음. 기존 viem + Zod + ActionApiClient 검증 완료 |
| Features | HIGH | Across API 5 endpoints + depositV3 문서 확인 완료 |
| Architecture | HIGH | LI.FI/DCent/Staking 선례와 동일 패턴. 코드 직접 검증 |
| Pitfalls | MEDIUM | Quote staleness, WETH 혼동은 문서 기반. 실 사용 경험 없음 |
| API Stability | MEDIUM | V3 마이그레이션 진행 중이나, depositV3는 안정적. /deposit/status 응답 스키마 정확도 미확인 |

## Gaps to Address

- **/deposit/status 응답 스키마 정확한 검증**: 공식 문서에서 status 값 목록(filled/pending/expired/refunded)은 확인했으나, 전체 응답 필드 목록은 실제 API 호출로 확인 필요
- **체인별 SpokePool 주소 확정**: Ethereum만 Etherscan 확인. Arbitrum/Optimism/Base/Polygon은 Across GitHub deployments.json에서 확인 필요 (rate limit으로 미확인)
- **체인별 WETH 주소 매핑**: native token bridge 시 inputToken으로 사용할 WETH 주소. 체인별로 다름 (Ethereum: 0xC02a...6Cc2, Arbitrum: 0x82aF...등)
- **LI.FI bridge enrollment 검증**: 현재 LI.FI bridge의 bridge_status enrollment이 코드에서 확인 안 됨. LI.FI와 Across 모두 enrollment 패턴을 명시적으로 구현해야 할 수 있음

## Sources

- [Across API Reference](https://docs.across.to/reference/api-reference)
- [Across Selected Contract Functions](https://docs.across.to/reference/selected-contract-functions)
- [Across Intent Lifecycle](https://docs.across.to/concepts/intent-lifecycle-in-across)
- [Across Fee Structure](https://docs.across.to/reference/fees-in-the-system)
- [Across Bridge Guide](https://docs.across.to/developer-quickstart/bridge)
- [Ethereum SpokePool (Etherscan)](https://etherscan.io/address/0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5)
- [Across GitHub Contracts](https://github.com/across-protocol/contracts)
