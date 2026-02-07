# Requirements: WAIaaS v0.6 블록체인 기능 확장 설계

**Defined:** 2026-02-07
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v0.6 Requirements

네이티브 토큰 전송에 한정된 IChainAdapter와 트랜잭션 파이프라인을 확장하여, SPL/ERC-20 토큰 전송, 자산 조회, 임의 컨트랙트 호출, DeFi 액션 추상화까지 설계 수준에서 정의한다.

### 토큰 확장 (TOKEN)

- [x] **TOKEN-01**: TransferRequest에 token 필드를 추가하여 SPL/ERC-20 토큰 전송을 설계한다 (하위 호환: undefined = 네이티브)
- [x] **TOKEN-02**: ALLOWED_TOKENS 정책 규칙을 설계한다 (에이전트별 토큰 민트/컨트랙트 화이트리스트, 미등록 토큰 거부)
- [x] **TOKEN-03**: getAssets() 인터페이스를 복원하고 AssetInfo 스키마를 확정한다 (Solana getTokenAccountsByOwner, EVM 프로바이더별 방식)
- [x] **TOKEN-04**: 토큰 전송 수수료 추정을 확장 설계한다 (Solana ATA 생성 비용, EVM ERC-20 gas 추정)
- [x] **TOKEN-05**: SPL/ERC-20 토큰 전송의 테스트 레벨/Mock/보안 시나리오를 정의한다

### 컨트랙트 호출 (CONTRACT)

- [x] **CONTRACT-01**: ContractCallRequest 인터페이스를 설계한다 (EVM calldata, Solana programId+instructionData+accounts)
- [x] **CONTRACT-02**: CONTRACT_WHITELIST, METHOD_WHITELIST 정책 규칙을 설계한다 (기본 전면 거부, opt-in 화이트리스트)
- [x] **CONTRACT-03**: 파이프라인 Stage 1 type 분기(TRANSFER/CONTRACT_CALL)와 Stage 2 세션 제약(allowedContracts) 확장을 설계한다
- [x] **CONTRACT-04**: transactions 테이블 type Enum 확장(CONTRACT_CALL, APPROVE, BATCH)과 감사 컬럼(contract_address, method_signature)을 설계한다
- [x] **CONTRACT-05**: 임의 컨트랙트 호출의 테스트 레벨/Mock/보안 시나리오를 정의한다 (악성 calldata, 미허용 method signature 등)

### 토큰 승인 (APPROVE)

- [x] **APPROVE-01**: ApproveRequest를 독립 타입으로 설계한다 (ContractCall과 분리 — 권한 위임은 별도 정책 카테고리)
- [x] **APPROVE-02**: APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE 정책 규칙을 설계한다 (무제한 approve 차단)
- [x] **APPROVE-03**: 토큰 Approve의 테스트 레벨/Mock/보안 시나리오를 정의한다 (무제한 approve, 미허용 spender 등)

### 배치 트랜잭션 (BATCH)

- [x] **BATCH-01**: BatchRequest 및 InstructionRequest 인터페이스를 설계한다 (Solana 원자적 배치, EVM 미지원 분기)
- [x] **BATCH-02**: 배치 정책 평가 규칙을 설계한다 (금액 합산 티어 결정, All-or-Nothing 정책 위반 처리)
- [x] **BATCH-03**: 멀티 instruction 배치의 테스트 레벨/Mock/보안 시나리오를 정의한다 (배치 크기 제한, 부분 위반 등)

### 가격 오라클 (ORACLE)

- [ ] **ORACLE-01**: IPriceOracle 인터페이스를 설계한다 (CoinGecko/Pyth/Chainlink 구현 옵션, PriceInfo 스키마)
- [ ] **ORACLE-02**: 오라클 캐싱 전략(5분 TTL)과 fallback 동작(stale 허용 vs 거부)을 설계한다
- [ ] **ORACLE-03**: USD 기준 정책 평가 확장을 설계한다 (기존 네이티브 금액 기준 → USD 금액 기준 티어 분류)
- [ ] **ORACLE-04**: 가격 오라클의 테스트 레벨/Mock/보안 시나리오를 정의한다 (가격 조작, 오라클 장애 등)

### Action Provider (ACTION)

- [ ] **ACTION-01**: IActionProvider 인터페이스를 설계한다 (resolve-then-execute 패턴, ActionDefinition Zod 스키마)
- [ ] **ACTION-02**: ActionDefinition → MCP Tool 자동 변환 메커니즘을 설계한다 (name/description/inputSchema 매핑)
- [ ] **ACTION-03**: Action Provider 플러그인 로드 메커니즘을 설계한다 (~/.waiaas/actions/ 디렉토리, 보안 경계)
- [ ] **ACTION-04**: Jupiter Swap Action Provider를 상세 설계한다 (quote API → ContractCallRequest 변환, 슬리피지, MEV 보호)
- [ ] **ACTION-05**: Action Provider의 테스트 레벨/Mock/보안 시나리오를 정의한다 (악성 플러그인, 슬리피지 조작 등)

### 테스트 전략 통합 (TEST)

- [ ] **TEST-01**: v0.4 테스트 프레임워크에 새 Mock 경계 5개를 추가 설계한다 (Aggregator, 가격 API, 온체인 오라클, IPriceOracle, IActionProvider)
- [ ] **TEST-02**: EVM 로컬 테스트 환경(Hardhat/Anvil)을 설계에 포함한다 (ERC-20 배포, Uniswap fork)
- [ ] **TEST-03**: 확장 패키지(@waiaas/actions 등)를 포함하여 커버리지 기준을 재설정한다

### 기존 문서 통합 (INTEG)

- [ ] **INTEG-01**: 기존 설계 문서 8개에 v0.6 확장을 반영한다 (27, 25, 31, 33, 32, 37, 38, 45)
- [ ] **INTEG-02**: TransactionType, PolicyType 등 Enum 확장을 v0.3 SSoT 체계(45-enum)에 통합한다

## Future Requirements

v0.6 이후로 이연. 추적하되 현재 로드맵에는 미포함.

### 자금 회수 (objectives/08 연관)
- **SWEEP-01**: getTokenBalances, sweepAll 메서드로 에이전트 자금 전량 회수
- **SWEEP-02**: Owner 선택적 등록 + 점진적 보안 해금 모델

### 추가 Action Provider
- **ACTION-F01**: Stake Action Provider (Marinade / Lido)
- **ACTION-F02**: Lend Action Provider (Solend / Aave)
- **ACTION-F03**: NFT Action Provider (민팅, 마켓플레이스)

### 크로스체인
- **BRIDGE-01**: 크로스체인 브릿지 통합 (Wormhole 등)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 실제 코드 구현 | v0.6은 설계 마일스톤 |
| 크로스체인 브릿지 | 별도 마일스톤으로 분리 |
| NFT 민팅/마켓플레이스 | Action Provider 패턴 확립 후 |
| Liquid Staking 상세 설계 | Swap Action 패턴 검증 후 |
| Account Abstraction / Smart Wallet | EVM 배치 문제 해결, 별도 마일스톤 |
| Owner 선택적 등록 (objectives/08) | 별도 마일스톤으로 분리 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOKEN-01 | Phase 22 | Complete |
| TOKEN-02 | Phase 22 | Complete |
| TOKEN-03 | Phase 22 | Complete |
| TOKEN-04 | Phase 22 | Complete |
| TOKEN-05 | Phase 22 | Complete |
| CONTRACT-01 | Phase 23 | Complete |
| CONTRACT-02 | Phase 23 | Complete |
| CONTRACT-03 | Phase 23 | Complete |
| CONTRACT-04 | Phase 23 | Complete |
| CONTRACT-05 | Phase 23 | Complete |
| APPROVE-01 | Phase 23 | Complete |
| APPROVE-02 | Phase 23 | Complete |
| APPROVE-03 | Phase 23 | Complete |
| BATCH-01 | Phase 23 | Complete |
| BATCH-02 | Phase 23 | Complete |
| BATCH-03 | Phase 23 | Complete |
| ORACLE-01 | Phase 24 | Pending |
| ORACLE-02 | Phase 24 | Pending |
| ORACLE-03 | Phase 24 | Pending |
| ORACLE-04 | Phase 24 | Pending |
| ACTION-01 | Phase 24 | Pending |
| ACTION-02 | Phase 24 | Pending |
| ACTION-03 | Phase 24 | Pending |
| ACTION-04 | Phase 24 | Pending |
| ACTION-05 | Phase 24 | Pending |
| TEST-01 | Phase 25 | Pending |
| TEST-02 | Phase 25 | Pending |
| TEST-03 | Phase 25 | Pending |
| INTEG-01 | Phase 25 | Pending |
| INTEG-02 | Phase 25 | Pending |

**Coverage:**
- v0.6 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-07*
*Last updated: 2026-02-07 after initial definition*
