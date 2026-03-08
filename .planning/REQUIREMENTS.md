# Requirements: WAIaaS v31.6 Across Protocol 크로스체인 브릿지

**Defined:** 2026-03-08
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v31.6 Requirements

Requirements for Across Protocol cross-chain bridge integration. Each maps to roadmap phases.

### Design (설계)

- [ ] **DES-01**: Across Protocol API(suggested-fees, limits, available-routes, deposit/status) 사양을 리서치하여 설계 문서(doc 79)에 반영
- [ ] **DES-02**: SpokePool depositV3 컨트랙트 인터페이스(12 파라미터)와 체인별 주소를 리서치하여 문서화
- [ ] **DES-03**: 수수료 모델(LP fee, relayer fee, gas fee)과 outputAmount 계산 공식을 설계 문서에 명시
- [ ] **DES-04**: 브릿지 상태 추적 방식(DB 재사용 vs 신규 테이블)을 설계 문서에서 확정
- [ ] **DES-05**: fillDeadline/exclusivityDeadline 기본값 전략을 설계 문서에서 확정
- [ ] **DES-06**: AcrossBridgeActionProvider 인터페이스와 MCP/SDK 설계를 문서화

### API Client (API 클라이언트)

- [ ] **API-01**: User can query Across bridge quote with source/destination chain, token, amount
- [ ] **API-02**: User can query supported bridge routes (source/destination chain + token combinations)
- [ ] **API-03**: User can query bridge limits (min/max amounts per route)
- [ ] **API-04**: User can check bridge deposit status (filled/pending/expired/refunded)
- [ ] **API-05**: AcrossApiClient가 /suggested-fees 응답을 캐싱하지 않고 매번 fresh quote를 요청

### Bridge Execution (브릿지 실행)

- [ ] **BRG-01**: User can bridge ERC-20 tokens cross-chain via approve+depositV3 BATCH
- [ ] **BRG-02**: User can bridge native ETH cross-chain via depositV3 with msg.value
- [ ] **BRG-03**: outputAmount를 /suggested-fees totalRelayFee 기반으로 정확히 계산
- [ ] **BRG-04**: fillDeadline/exclusivityDeadline를 Admin Settings에서 설정 가능
- [ ] **BRG-05**: 견적 만료 시 Stage 5 실행 직전에 fresh quote를 재조회 (late-bind)
- [ ] **BRG-06**: 지원하지 않는 route 요청 시 명확한 에러 메시지 반환
- [ ] **BRG-07**: liquidity 부족 시 명확한 에러 메시지 반환

### Status Tracking (상태 추적)

- [ ] **STS-01**: Bridge deposit 후 2-phase polling으로 fill 완료를 자동 추적
- [ ] **STS-02**: 상태 변경 시 알림 이벤트 발행 (BRIDGE_COMPLETED, BRIDGE_FAILED 등)
- [ ] **STS-03**: 기존 transactions.bridge_status/bridge_metadata 컬럼을 재사용하여 DB 마이그레이션 불필요

### Interface (인터페이스)

- [ ] **INT-01**: MCP 도구로 bridge-quote, bridge-execute, bridge-status, bridge-routes 노출
- [ ] **INT-02**: SDK 메서드로 acrossBridgeQuote, acrossBridgeExecute, acrossBridgeStatus 등 제공
- [ ] **INT-03**: Admin Settings에서 fillDeadline, exclusivityDeadline 등 런타임 설정 가능
- [ ] **INT-04**: Admin UI에서 최근 브릿지 트랜잭션 상태를 확인 가능
- [ ] **INT-05**: defi.skill.md 등 관련 skill 파일을 Across bridge 기능에 맞게 업데이트
- [ ] **INT-06**: connect-info에 across capability 노출

### Test (테스트)

- [ ] **TST-01**: Mock API 기반 AcrossApiClient 단위 테스트 (quote, routes, limits, status)
- [ ] **TST-02**: SpokePool depositV3 calldata 인코딩 검증 테스트
- [ ] **TST-03**: ERC-20 approve+deposit BATCH 파이프라인 통합 테스트
- [ ] **TST-04**: 네이티브 ETH 브릿지 (msg.value) 테스트
- [ ] **TST-05**: 에러 핸들링 테스트 (insufficient liquidity, unsupported route, deadline expired)
- [ ] **TST-06**: Bridge status tracker polling 테스트

## Future Requirements

### Bridge Aggregation (브릿지 애그리게이션)

- **AGG-01**: LI.FI + Across 자동 견적 비교하여 최적 브릿지 선택
- **AGG-02**: 다중 브릿지 프로토콜 통합 라우팅 레이어

### Extended Bridge Support

- **EXT-01**: Solana 크로스체인 브릿지 (Wormhole 등)
- **EXT-02**: zkSync/Scroll 등 추가 L2 체인 지원

## Out of Scope

| Feature | Reason |
|---------|--------|
| LI.FI + Across 자동 비교 라우팅 | 별도 브릿지 애그리게이션 마일스톤에서 다룸 |
| Solana 크로스체인 브릿지 | EVM 우선, Solana는 별도 마일스톤 |
| Cross-chain swap (bridge + swap 결합) | DCent Swap이 이미 커버 |
| Across Integrator ID 등록 | 런타임에 불필요, 추후 파트너십 시 등록 |
| zkSync/Scroll 등 WAIaaS 미지원 체인 | 체인 추가는 별도 마일스톤 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DES-01 | — | Pending |
| DES-02 | — | Pending |
| DES-03 | — | Pending |
| DES-04 | — | Pending |
| DES-05 | — | Pending |
| DES-06 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |
| BRG-01 | — | Pending |
| BRG-02 | — | Pending |
| BRG-03 | — | Pending |
| BRG-04 | — | Pending |
| BRG-05 | — | Pending |
| BRG-06 | — | Pending |
| BRG-07 | — | Pending |
| STS-01 | — | Pending |
| STS-02 | — | Pending |
| STS-03 | — | Pending |
| INT-01 | — | Pending |
| INT-02 | — | Pending |
| INT-03 | — | Pending |
| INT-04 | — | Pending |
| INT-05 | — | Pending |
| INT-06 | — | Pending |
| TST-01 | — | Pending |
| TST-02 | — | Pending |
| TST-03 | — | Pending |
| TST-04 | — | Pending |
| TST-05 | — | Pending |
| TST-06 | — | Pending |

**Coverage:**
- v31.6 requirements: 33 total
- Mapped to phases: 0
- Unmapped: 33 ⚠️

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after initial definition*
