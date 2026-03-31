# 마일스톤 m33-06: XRP 메인넷 지원

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

WAIaaS의 세 번째 ChainType으로 `'ripple'`을 추가하여, AI 에이전트가 XRP Ledger에서 네이티브 XRP 전송, 잔액 조회, Trust Line 토큰 관리를 수행할 수 있는 상태.

---

## 배경

### 왜 XRP인가

- **시가총액 3~4위** — 주요 L1 중 WAIaaS 미지원 체인
- **래핑 자산 부재** — WBTC처럼 EVM에서 대체할 수단이 없어 직접 지원 필요
- **Account 모델** — 현재 아키텍처(Solana/EVM 모두 account-based)와 자연스럽게 호환. UTXO 체인(Bitcoin)과 달리 IChainAdapter 인터페이스 리팩토링 불필요

### 아키텍처 호환성

| 항목 | 기존 (Solana/EVM) | XRP Ledger |
|------|-------------------|------------|
| 계정 모델 | Account-based | Account-based (호환) |
| 키 타입 | Ed25519 / secp256k1 | Ed25519 또는 secp256k1 (선택 가능) |
| 주소 포맷 | Base58 / 0x checksum | r-address (Base58Check) |
| 토큰 모델 | SPL / ERC-20 | Trust Lines (TrustSet 트랜잭션) |
| 수수료 | 동적 | drops 단위, 비교적 고정 |
| 스마트 컨트랙트 | 있음 | 없음 (Hooks 미메인넷) |
| 확인 시간 | 수초~수분 | 3~5초 (합의 기반) |

### IChainAdapter 25메서드 대응

| 그룹 | 구현 가능 | 해당 없음 |
|------|----------|----------|
| 연결 관리 (4) | connect, disconnect, isConnected, getHealth | — |
| 잔액 (1) | getBalance | — |
| 트랜잭션 파이프라인 (4) | build, simulate(dry-run), sign, submit | — |
| 확인 (1) | waitForConfirmation | — |
| 자산 (1) | getAssets (XRP + Trust Lines) | — |
| 수수료 (1) | estimateFee | — |
| 토큰 (2) | buildTokenTransfer(Trust Line IOU), getTokenInfo | — |
| 컨트랙트 (2) | — | buildContractCall, buildApprove |
| 배치 (1) | — | buildBatch |
| 유틸리티 (3) | getTransactionFee, parseTransaction, signExternalTransaction | getCurrentNonce (시퀀스 번호로 대체) |
| NFT (3) | buildNftTransferTx(XLS-20), transferNft | approveNft |

**구현율: ~80%** (20/25 메서드), 나머지는 N/A 또는 XRPL 고유 방식으로 대체.

---

## 범위

### 포함

1. **ChainType 확장**: `'ripple'` 추가 (shared/networks.ts SSoT)
2. **NetworkType 추가**: `xrpl-mainnet`, `xrpl-testnet`, `xrpl-devnet`
3. **RippleAdapter 구현**: `@waiaas/adapter-ripple` 패키지, IChainAdapter 20메서드
4. **KeyStore 확장**: Ed25519 키 생성, r-address 도출 (기존 Ed25519 경로 재활용)
5. **AdapterPool 등록**: `chain === 'ripple'` 분기 추가
6. **Trust Line 토큰 지원**: TrustSet → buildApprove 매핑, IOU 전송 → buildTokenTransfer
7. **XLS-20 NFT 기본 지원**: NFT 전송 (NFTokenCreateOffer + NFTokenAcceptOffer)
8. **DB 마이그레이션**: CHECK 제약조건 업데이트, ENVIRONMENT_NETWORK_MAP 확장
9. **REST API**: 기존 엔드포인트에서 chain=ripple 지원
10. **MCP/SDK 확장**: 기존 도구에서 ripple 체인 선택 가능
11. **Admin UI**: 지갑 생성 시 Ripple 체인 선택, Trust Line 관리 UI

### 제외

- XRPL DEX 통합 → m33-08
- XRPL AMM 통합 → m33-10
- THORChain 크로스체인 → m33-12
- Hooks (XRPL 스마트 컨트랙트) — 메인넷 미적용 상태
- Payment Channels, Escrow 등 XRPL 고유 고급 기능

---

## XRPL 고유 고려사항

### Reserve 요구사항

XRP Ledger는 계정 활성화에 **기본 reserve(현재 1 XRP)** + Trust Line/오퍼 등 오브젝트당 **owner reserve(현재 0.2 XRP)**가 필요하다. 잔액 조회 시 가용 잔액(balance - reserve)을 별도 표시해야 한다.

### 시퀀스 번호

EVM의 nonce와 유사하게 XRPL은 계정별 Sequence 번호를 사용한다. `getCurrentNonce()` 대신 `account_info`에서 Sequence를 조회하여 동일한 역할을 수행한다.

### Destination Tag

XRP 전송 시 거래소 등에서 요구하는 Destination Tag(uint32) 지원이 필요하다. 기존 `memo` 필드와 별도로 `destinationTag` 파라미터를 추가한다.

### Trust Line 모델

XRPL 토큰(IOU)은 발행자(issuer)에 대한 Trust Line 설정이 선행되어야 한다. 이는 ERC-20 approve와 유사하나, **수신자 측에서** 설정한다는 점이 다르다 (ERC-20은 발신자가 approve).

---

## 기술 의존성

- **xrpl.js**: 공식 JavaScript/TypeScript SDK (xrpl 패키지)
- **KeyStore Ed25519**: 기존 Solana Ed25519 경로 재활용 가능, r-address 도출 로직 추가
- **파이프라인**: Stage 5 buildByType()에 ripple 분기 추가 (CONTRACT_CALL, BATCH 타입은 미지원 처리)

## 선행 마일스톤

- 없음 (독립적으로 착수 가능)

## 후속 마일스톤

- **m33-08**: XRPL DEX (OfferCreate/Cancel) Action Provider
- **m33-10**: XRPL AMM (XLS-30) Action Provider
- **m33-12**: THORChain 크로스체인 스왑
