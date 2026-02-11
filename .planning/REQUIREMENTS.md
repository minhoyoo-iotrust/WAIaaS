# Requirements: WAIaaS v1.4 토큰 + 컨트랙트 확장

**Defined:** 2026-02-12
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1.4 Requirements

### 선행 인프라

- [ ] **INFRA-01**: ChainError 클래스 3-카테고리(PERMANENT/TRANSIENT/STALE) 시스템 구현 — category에서 retryable 자동 파생, 25개 에러 코드 매핑
- [ ] **INFRA-02**: DB 마이그레이션 러너 구현 — schema_version 테이블 기반 증분 마이그레이션 실행, MIG-01~06 준수
- [ ] **INFRA-03**: @waiaas/adapter-evm 패키지 스캐폴딩 — monorepo workspace 등록, tsconfig, viem 2.x 의존성, 기본 패키지 구조
- [ ] **INFRA-04**: discriminatedUnion 5-type 스키마 정의 — TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH, 기존 SendTransactionRequestSchema 교체
- [ ] **INFRA-05**: INSUFFICIENT_FOR_FEE 에러 코드 TX 도메인 이동 — 가스비 부족과 전송 금액 부족 구분 (DD-04 설계 부채)

### 토큰 전송

- [ ] **TOKEN-01**: 에이전트가 SPL 토큰(USDC 등)을 전송할 수 있다 — TransferRequest.token 필드 확장, buildSplTokenTransfer(getTransferCheckedInstruction), Token-2022 분기
- [ ] **TOKEN-02**: 에이전트가 ERC-20 토큰을 전송할 수 있다 — buildErc20Transfer(ERC-20 ABI transfer), EVM 어댑터 연동
- [ ] **TOKEN-03**: ALLOWED_TOKENS 정책으로 에이전트별 허용 토큰을 제한할 수 있다 — 미설정 시 네이티브만 허용(토큰 전송 거부), 에이전트별 화이트리스트
- [ ] **TOKEN-04**: getAssets()가 토큰 잔액을 포함하여 반환한다 — Solana getTokenAccountsByOwner, EVM ALLOWED_TOKENS 기반 보수적 multicall, 네이티브 첫 번째 + 잔액 내림차순
- [ ] **TOKEN-05**: getTokenInfo(tokenAddress)로 토큰 메타데이터를 조회할 수 있다 — decimals, symbol, name
- [ ] **TOKEN-06**: estimateFee()가 토큰 전송 수수료를 정확히 추정한다 — SPL ATA 생성 비용, ERC-20 gas 추정

### 컨트랙트 호출

- [ ] **CONTRACT-01**: 에이전트가 화이트리스트된 스마트 컨트랙트를 호출할 수 있다 — ContractCallRequest(EVM: calldata/abi, Solana: programId/instructionData/accounts)
- [ ] **CONTRACT-02**: CONTRACT_WHITELIST 정책으로 호출 가능한 컨트랙트를 제한할 수 있다 — 기본 전면 거부, opt-in 화이트리스트
- [ ] **CONTRACT-03**: METHOD_WHITELIST 정책으로 호출 가능한 메서드를 제한할 수 있다 — 컨트랙트별 허용 메서드 목록
- [ ] **CONTRACT-04**: 미설정 에이전트는 컨트랙트 호출이 완전 차단된다 — CONTRACT_DISABLED 에러

### Approve 관리

- [ ] **APPROVE-01**: 에이전트가 토큰 Approve를 요청할 수 있다 — ApproveRequest(from/spender/token/amount), EVM ERC-20 approve + Solana SPL ApproveChecked
- [ ] **APPROVE-02**: APPROVED_SPENDERS 정책으로 Approve 대상을 제한할 수 있다 — 기본 거부, 화이트리스트 spender만 허용
- [ ] **APPROVE-03**: 무제한 금액 Approve가 기본 차단된다 — APPROVE_AMOUNT_LIMIT(block_unlimited=true 기본), UNLIMITED_APPROVE_BLOCKED 에러
- [ ] **APPROVE-04**: APPROVE_TIER_OVERRIDE 미설정 시 기본 APPROVAL 티어가 강제된다 — Owner 승인 필수

### 배치 트랜잭션

- [ ] **BATCH-01**: 에이전트가 Solana에서 원자적 배치 트랜잭션을 실행할 수 있다 — BatchRequest + InstructionRequest[], min 2/max 20, 단일 트랜잭션
- [ ] **BATCH-02**: 배치 정책이 2단계 합산으로 평가된다 — 개별 instruction 평가 + 합산 SPENDING_LIMIT, All-or-Nothing(1개 위반 시 전체 거부)
- [ ] **BATCH-03**: 배치 트랜잭션이 부모-자식 DB 구조로 저장된다 — transactions 자기참조(parentId + batchIndex), 자식 개별 상태 추적, 부모 PARTIAL_FAILURE
- [ ] **BATCH-04**: EVM에서 배치 요청 시 명확한 미지원 에러를 반환한다 — BATCH_NOT_SUPPORTED 에러 코드

### EVM 어댑터

- [ ] **EVM-01**: @waiaas/adapter-evm이 IChainAdapter 인터페이스를 구현한다 — viem 2.x Client/Action 패턴, 20개 메서드
- [ ] **EVM-02**: EVM 네이티브 토큰(ETH) 전송이 동작한다 — EIP-1559 트랜잭션 빌드/시뮬레이션/서명/제출
- [ ] **EVM-03**: EVM gas 추정이 동작한다 — viem estimateGas * 1.2x 배수
- [ ] **EVM-04**: EVM nonce 관리가 동작한다 — getCurrentNonce + 인메모리 트래킹 + resetNonceTracker
- [ ] **EVM-05**: EVM ERC-20 전송/approve가 동작한다 — buildTokenTransfer + buildApprove EVM 구현
- [ ] **EVM-06**: buildBatch()가 BATCH_NOT_SUPPORTED를 반환한다

### 파이프라인 확장

- [ ] **PIPE-01**: Stage 1이 discriminatedUnion 5-type을 파싱한다 — TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH 자동 식별
- [ ] **PIPE-02**: Stage 3이 type별 적용 가능 정책을 필터링하여 평가한다 — 기존 SPENDING_LIMIT/WHITELIST + 6개 신규 PolicyType(ALLOWED_TOKENS/CONTRACT_WHITELIST/METHOD_WHITELIST/APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE)
- [ ] **PIPE-03**: Stage 5가 완전 의사코드(CONC-01)를 구현한다 — build→simulate→sign→submit, PERMANENT 즉시 실패/TRANSIENT 지수 백오프/STALE 재빌드, MAX_RETRIES=2
- [ ] **PIPE-04**: Stage 5가 type별 adapter 메서드를 라우팅한다 — TRANSFER→buildTransaction, TOKEN_TRANSFER→buildTokenTransfer, CONTRACT_CALL→buildContractCall, APPROVE→buildApprove, BATCH→buildBatch
- [ ] **PIPE-05**: IChainAdapter 인터페이스가 20개 메서드로 확장된다 — 기존 11개 + 신규 9개(estimateFee, buildTokenTransfer, buildContractCall, buildApprove, buildBatch, getTransactionFee, getTokenInfo, getCurrentNonce, sweepAll)
- [ ] **PIPE-06**: 6개 신규 PolicyType의 Zod superRefine 검증이 동작한다 — type별 rules 스키마 검증

## Future Requirements

### v1.4.1 EVM 지갑 인프라

- **EVMINFRA-01**: secp256k1 키 생성 + 0x 주소 파생
- **EVMINFRA-02**: 어댑터 팩토리 패턴 (AdapterPool)
- **EVMINFRA-03**: Config EVM RPC 확장 (Tier 1 5체인)
- **EVMINFRA-04**: NetworkType EVM 네트워크 값 추가

### v1.5 DeFi + 가격 오라클

- **ORACLE-01**: IPriceOracle 인터페이스 + CoinGecko/Pyth/Chainlink
- **ACTION-01**: IActionProvider resolve-then-execute 패턴
- **SWAP-01**: Jupiter Swap Action Provider
- **USD-01**: USD 기준 정책 평가 전환

## Out of Scope

| Feature | Reason |
|---------|--------|
| EVM 키스토어 (secp256k1) | v1.4.1에서 구현, 이번 마일스톤은 어댑터만 |
| 어댑터 팩토리 (AdapterPool) | v1.4.1에서 구현, EVM 어댑터를 데몬에 연결하는 인프라 |
| USD 기준 정책 평가 | v1.5에서 IPriceOracle과 함께 구현 |
| Jupiter Swap | v1.5 Action Provider 패턴으로 구현 |
| Liquid Staking | Action Provider 패턴 검증 후 별도 마일스톤 |
| Account Abstraction | EVM 배치 대안, 별도 마일스톤 |
| Tauri Desktop | v1.6에서 구현 |
| Docker 배포 | v1.6에서 구현 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| INFRA-05 | — | Pending |
| TOKEN-01 | — | Pending |
| TOKEN-02 | — | Pending |
| TOKEN-03 | — | Pending |
| TOKEN-04 | — | Pending |
| TOKEN-05 | — | Pending |
| TOKEN-06 | — | Pending |
| CONTRACT-01 | — | Pending |
| CONTRACT-02 | — | Pending |
| CONTRACT-03 | — | Pending |
| CONTRACT-04 | — | Pending |
| APPROVE-01 | — | Pending |
| APPROVE-02 | — | Pending |
| APPROVE-03 | — | Pending |
| APPROVE-04 | — | Pending |
| BATCH-01 | — | Pending |
| BATCH-02 | — | Pending |
| BATCH-03 | — | Pending |
| BATCH-04 | — | Pending |
| EVM-01 | — | Pending |
| EVM-02 | — | Pending |
| EVM-03 | — | Pending |
| EVM-04 | — | Pending |
| EVM-05 | — | Pending |
| EVM-06 | — | Pending |
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| PIPE-05 | — | Pending |
| PIPE-06 | — | Pending |

**Coverage:**
- v1.4 requirements: 35 total
- Mapped to phases: 0
- Unmapped: 35 ⚠️

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after initial definition*
