# Requirements: WAIaaS v33.6 XRP 메인넷 지원

**Defined:** 2026-04-03
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for XRP Ledger integration. Each maps to roadmap phases.

### Core Infrastructure

- [x] **INFRA-01**: ChainType `'ripple'` SSoT에 추가되어 모든 Zod 스키마/TypeScript 타입에 전파된다
- [x] **INFRA-02**: NetworkType `xrpl-mainnet`, `xrpl-testnet`, `xrpl-devnet` 3종이 등록된다
- [x] **INFRA-03**: ENVIRONMENT_NETWORK_MAP에 ripple 환경별 네트워크 매핑이 추가된다
- [x] **INFRA-04**: ENVIRONMENT_SINGLE_NETWORK에 ripple이 Solana와 동일하게 환경당 단일 네트워크로 등록된다
- [x] **INFRA-05**: CAIP-2 namespace `xrpl:0` (mainnet), `xrpl:1` (testnet), `xrpl:2` (devnet)이 등록된다
- [x] **INFRA-06**: CAIP-19 네이티브 자산 `xrpl:0/slip44:144`과 Trust Line `xrpl:0/token:{currency}.{issuer}` 식별자가 지원된다
- [x] **INFRA-07**: DB migration v62에서 chain_type CHECK 제약조건에 'ripple'이 추가된다
- [x] **INFRA-08**: NATIVE_DECIMALS에 XRP 6 decimals가 등록된다

### Adapter & Key Management

- [x] **ADAPT-01**: `@waiaas/adapter-ripple` 패키지가 모노레포에 생성되어 IChainAdapter 21개 메서드를 구현한다
- [x] **ADAPT-02**: 미지원 4개 메서드(buildContractCall, buildBatch, sweepAll, approveNft)가 NOT_SUPPORTED 에러를 반환한다
- [x] **ADAPT-03**: KeyStore에서 Ed25519 키를 생성하고 ripple-keypairs로 r-address를 도출한다
- [x] **ADAPT-04**: xrpl.Client WebSocket 연결이 자동 재연결과 health check를 지원한다
- [x] **ADAPT-05**: AdapterPool에 `chain === 'ripple'` 분기가 추가되어 RippleAdapter를 생성한다
- [x] **ADAPT-06**: config.toml에 XRPL RPC WebSocket URL 설정이 추가된다

### Native XRP Transfer

- [x] **XRP-01**: 사용자가 XRP를 r-address로 전송할 수 있다 (drops 단위 변환 자동)
- [x] **XRP-02**: 잔액 조회 시 총 잔액과 가용 잔액(balance - base reserve - owner reserve * objects)이 구분되어 표시된다
- [x] **XRP-03**: Destination Tag를 TransferRequest에 지정할 수 있다
- [x] **XRP-04**: 모든 트랜잭션에 LastLedgerSequence가 자동 설정되어 타임아웃이 보장된다
- [x] **XRP-05**: 수수료가 drops 단위로 추정되고 가스 안전 마진(120%)이 적용된다
- [x] **XRP-06**: Sequence 번호가 account_info에서 조회되어 getCurrentNonce()로 반환된다
- [x] **XRP-07**: 트랜잭션 확인이 validated ledger 기준으로 동작한다
- [x] **XRP-08**: simulate(dry-run)이 autofill 기반으로 트랜잭션 유효성을 검증한다
- [x] **XRP-09**: Reserve 값이 server_info에서 동적으로 조회된다 (하드코딩 금지)
- [x] **XRP-10**: X-address가 입력되면 classic address + Destination Tag으로 자동 디코딩된다

### Trust Line Tokens

- [x] **TRUST-01**: TrustSet 트랜잭션이 buildApprove로 매핑되어 Trust Line을 설정할 수 있다
- [x] **TRUST-02**: Trust Line 설정 시 tfSetNoRipple 플래그가 자동 적용된다
- [x] **TRUST-03**: IOU 토큰을 buildTokenTransfer로 전송할 수 있다
- [x] **TRUST-04**: getTokenInfo가 Trust Line 메타데이터(issuer, currency, limit)를 반환한다
- [x] **TRUST-05**: getAssets가 XRP + 활성 Trust Line 토큰 목록을 반환한다
- [x] **TRUST-06**: 3자리 통화 코드와 40자리 hex 통화 코드가 모두 지원된다

### XLS-20 NFT

- [x] **NFT-01**: NFTokenCreateOffer + NFTokenAcceptOffer가 buildNftTransferTx/transferNft로 래핑된다
- [x] **NFT-02**: 수신자 Accept가 필요한 경우 pending_accept 상태가 반환된다
- [x] **NFT-03**: NFT 메타데이터(URI, taxon)가 조회 가능하다

### Integration

- [x] **INTG-01**: REST API 기존 엔드포인트에서 chain=ripple 지갑 생성/조회/전송이 동작한다
- [x] **INTG-02**: MCP 기존 도구에서 ripple 체인 선택이 가능하다
- [x] **INTG-03**: TypeScript SDK에서 ripple 체인 지갑 조작이 가능하다
- [x] **INTG-04**: Admin UI 지갑 생성 시 Ripple 체인이 선택 가능하다
- [x] **INTG-05**: Admin UI에서 Trust Line 설정/조회 관리가 가능하다
- [x] **INTG-06**: Pipeline Stage 5 buildByType()에서 ripple 미지원 타입(CONTRACT_CALL, BATCH)이 명시적 에러를 반환한다
- [ ] **INTG-07**: Skill 파일이 ripple 체인 사용 가이드를 포함하도록 업데이트된다

## v2 Requirements

Deferred to future milestones.

### XRPL DEX (m33-08)

- **DEX-01**: OfferCreate/OfferCancel로 XRPL DEX 주문을 생성/취소할 수 있다
- **DEX-02**: 오더북 조회가 가능하다

### XRPL AMM (m33-10)

- **AMM-01**: XLS-30 AMM 풀에 유동성을 추가/제거할 수 있다

### 수신 TX 모니터링

- **INCTX-01**: IChainSubscriber XRPL 구현으로 수신 트랜잭션을 실시간 감지한다
- **INCTX-02**: Partial Payment delivered_amount 방어가 적용된다

## Out of Scope

| Feature | Reason |
|---------|--------|
| XRPL Hooks (스마트 컨트랙트) | 메인넷 미적용 상태 |
| Payment Channels | XRPL 고급 기능, 후속 검토 |
| Escrow | XRPL 고급 기능, 후속 검토 |
| Account Deletion | 에지 케이스, 후속 검토 |
| Multi-Purpose Tokens (MPT) | 메인넷 미적용 |
| RPC Pool XRPL WebSocket | 멀티엔드포인트 로테이션 후속 적용 |
| THORChain 크로스체인 스왑 | m33-12에서 별도 진행 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 470 | Complete |
| INFRA-02 | Phase 470 | Complete |
| INFRA-03 | Phase 470 | Complete |
| INFRA-04 | Phase 470 | Complete |
| INFRA-05 | Phase 470 | Complete |
| INFRA-06 | Phase 470 | Complete |
| INFRA-07 | Phase 470 | Complete |
| INFRA-08 | Phase 470 | Complete |
| ADAPT-01 | Phase 471 | Complete |
| ADAPT-02 | Phase 471 | Complete |
| ADAPT-03 | Phase 471 | Complete |
| ADAPT-04 | Phase 471 | Complete |
| ADAPT-05 | Phase 471 | Complete |
| ADAPT-06 | Phase 471 | Complete |
| XRP-01 | Phase 471 | Complete |
| XRP-02 | Phase 471 | Complete |
| XRP-03 | Phase 471 | Complete |
| XRP-04 | Phase 471 | Complete |
| XRP-05 | Phase 471 | Complete |
| XRP-06 | Phase 471 | Complete |
| XRP-07 | Phase 471 | Complete |
| XRP-08 | Phase 471 | Complete |
| XRP-09 | Phase 471 | Complete |
| XRP-10 | Phase 471 | Complete |
| TRUST-01 | Phase 472 | Complete |
| TRUST-02 | Phase 472 | Complete |
| TRUST-03 | Phase 472 | Complete |
| TRUST-04 | Phase 472 | Complete |
| TRUST-05 | Phase 472 | Complete |
| TRUST-06 | Phase 472 | Complete |
| NFT-01 | Phase 473 | Complete |
| NFT-02 | Phase 473 | Complete |
| NFT-03 | Phase 473 | Complete |
| INTG-01 | Phase 473 | Complete |
| INTG-02 | Phase 473 | Complete |
| INTG-03 | Phase 473 | Complete |
| INTG-04 | Phase 473 | Complete |
| INTG-05 | Phase 473 | Complete |
| INTG-06 | Phase 473 | Complete |
| INTG-07 | Phase 473 | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation*
