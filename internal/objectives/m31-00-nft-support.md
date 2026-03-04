# 마일스톤 m31-00: NFT 지원 (EVM + Solana)

- **Status:** PLANNED
- **Milestone:** v31.0

## 목표

WAIaaS에 EVM(ERC-721/ERC-1155)과 Solana(Metaplex) NFT를 통합하여,
AI 에이전트가 지갑이 보유한 NFT를 조회하고, 전송하며, 승인을 관리할 수 있는 상태.

---

## 배경

### 현재 상태

WAIaaS는 네이티브 토큰(SOL/ETH)과 대체 가능 토큰(ERC-20/SPL)만 지원한다.
NFT(Non-Fungible Token)는 지원 범위 밖이며, 에이전트 지갑이 보유한 NFT를
조회·전송·승인하는 기능이 없다.

### NFT 지원이 필요한 이유

1. **ERC-8004 Identity NFT 관리** — 에이전트 등록 시 발행된 Identity NFT를
   지갑 자산으로 확인할 수 없음
2. **NFT 기반 접근 제어** — 특정 NFT 보유 여부로 DeFi 프로토콜 접근, 거버넌스 참여,
   커뮤니티 멤버십을 검증하는 유스케이스 증가
3. **NFT 결제/교환** — AI 에이전트가 NFT를 대가로 받거나 전송하는 시나리오
4. **포트폴리오 완전성** — 지갑 자산 전체 조회 시 NFT가 빠지면 불완전

### 기술 환경

| | EVM | Solana |
|---|---|---|
| **토큰 표준** | ERC-721 (단일), ERC-1155 (다중) | Metaplex NFT (Token-2022 기반) |
| **목록 조회** | RPC 풀스캔 비현실적 → 인덱서 필요 | DAS (Digital Asset Standard) API |
| **전송** | `transferFrom` / `safeTransferFrom` / `safeTransferFrom(1155)` | SPL Token transfer instruction |
| **승인** | `approve` / `setApprovalForAll` | Token delegate |
| **메타데이터** | tokenURI → off-chain JSON (IPFS/HTTP) | Metaplex JSON (on-chain + off-chain) |
| **인덱서** | Alchemy NFT API, Moralis, SimpleHash | Helius DAS API, Shyft |

### 핵심 제약: 인덱서 의존성

NFT 목록 조회는 온체인 풀스캔이 비현실적이므로 외부 인덱서 API가 사실상 필수다.
이는 0x Swap과 유사하게 API 키 기반 프로바이더 패턴으로 처리한다.

---

## 요구사항

### R1. NFT 목록 조회

- **R1-1.** `GET /v1/wallet/nfts` — 세션 지갑이 보유한 NFT 목록 반환 (sessionAuth)
- **R1-2.** `GET /v1/wallets/{id}/nfts` — 특정 지갑의 NFT 목록 반환 (masterAuth)
- **R1-3.** 응답 필드: `tokenId`, `contractAddress`/`mintAddress`, `standard` (ERC-721/ERC-1155/Metaplex),
  `name`, `image`, `description`, `amount` (ERC-1155 수량), `collection`
- **R1-4.** 페이지네이션 지원 (커서 기반, 기존 트랜잭션 목록과 동일 패턴)
- **R1-5.** `network` 쿼리 파라미터로 네트워크 지정 (EVM 필수, Solana 자동)
- **R1-6.** 컬렉션별 그룹핑 옵션 (`?groupBy=collection`)

### R2. NFT 메타데이터 조회

- **R2-1.** `GET /v1/wallet/nfts/{tokenIdentifier}` — 개별 NFT 상세 메타데이터
- **R2-2.** EVM: tokenURI에서 JSON 파싱 (IPFS gateway 자동 변환)
- **R2-3.** Solana: Metaplex JSON 메타데이터 파싱
- **R2-4.** 메타데이터 캐싱 (TTL 기반, NFT 메타데이터는 변경 빈도 낮음)
- **R2-5.** attributes/traits 배열 포함

### R3. NFT 전송

- **R3-1.** 트랜잭션 타입 `NFT_TRANSFER` 추가 — discriminatedUnion에 7번째 타입 (기존 7-type에 추가하여 8-type)
- **R3-2.** EVM ERC-721: `safeTransferFrom(from, to, tokenId)` 호출
- **R3-3.** EVM ERC-1155: `safeTransferFrom(from, to, tokenId, amount, data)` 호출
- **R3-4.** Solana Metaplex: SPL Token transfer instruction 생성
- **R3-5.** 6-stage 파이프라인 통과 (정책 평가 + 승인 tier 적용)
- **R3-6.** `POST /v1/transactions/send` 요청 바디:
  ```json
  {
    "type": "NFT_TRANSFER",
    "to": "<recipient>",
    "token": {
      "address": "<contract/mint>",
      "tokenId": "<tokenId>",
      "standard": "ERC-721"
    },
    "amount": "1",
    "network": "ethereum-mainnet"
  }
  ```

### R4. NFT 승인 관리

- **R4-1.** EVM `approve`: 특정 NFT에 대한 단일 승인
- **R4-2.** EVM `setApprovalForAll`: 컬렉션 전체 승인
- **R4-3.** Solana `delegate`: 토큰 위임
- **R4-4.** 기존 `APPROVE` 트랜잭션 타입 확장 또는 NFT 전용 승인 액션
- **R4-5.** 현재 승인 상태 조회 API

### R5. 인덱서 프로바이더 프레임워크

- **R5-1.** `INftIndexer` 인터페이스 정의: `listNfts()`, `getNftMetadata()`, `getNftsByCollection()`
- **R5-2.** EVM 인덱서: Alchemy NFT API 구현체
- **R5-3.** Solana 인덱서: Helius DAS API 구현체
- **R5-4.** 인덱서 API 키 설정: Admin Settings 또는 `PUT /v1/admin/api-keys/{provider}`
- **R5-5.** 인덱서 미설정 시 NFT 조회 불가 안내 (전송은 컨트랙트 주소+tokenId 직접 지정으로 가능)
- **R5-6.** 인덱서 응답 캐싱 (TTL 설정 가능)

### R6. IChainAdapter 확장

- **R6-1.** IChainAdapter에 NFT 메서드 추가: `transferNft()`, `approveNft()`, `buildNftTransferTx()`
- **R6-2.** SolanaAdapter에 Metaplex NFT 전송 구현
- **R6-3.** EvmAdapter에 ERC-721/ERC-1155 전송 구현
- **R6-4.** NFT 표준 자동 감지 (ERC-165 `supportsInterface` 호출)

### R7. Admin UI

- **R7-1.** 지갑 상세 페이지에 NFT 탭 추가 — 보유 NFT 그리드/리스트 뷰
- **R7-2.** NFT 이미지 썸네일 표시 (CSP 정책 업데이트 필요: img-src)
- **R7-3.** NFT 상세 모달: 메타데이터, attributes, 전송 버튼
- **R7-4.** 인덱서 설정 UI (System Settings 또는 API Keys 페이지)

### R8. MCP + SDK

- **R8-1.** MCP 도구: `list_nfts`, `get_nft_metadata`, `transfer_nft`
- **R8-2.** SDK 메서드: `listNfts()`, `getNftMetadata()`, `transferNft()`
- **R8-3.** connect-info에 NFT 보유 요약 포함

### R9. 정책

- **R9-1.** NFT_TRANSFER에 대한 기존 정책 적용 (RATE_LIMIT, SPENDING_LIMIT은 수량 기반)
- **R9-2.** CONTRACT_WHITELIST 정책으로 허용된 NFT 컨트랙트만 전송 가능
- **R9-3.** NFT 전송 기본 tier: `APPROVAL` (고가 자산 가능성)

### R10. 스킬 파일

- **R10-1.** `skills/nft.skill.md` 신규 생성 — NFT 조회/전송/승인 API, SDK, MCP 문서
- **R10-2.** `skills/wallet.skill.md` — NFT 탭, 자산 조회에 NFT 포함
- **R10-3.** `skills/transactions.skill.md` — NFT_TRANSFER 타입 추가 (8-type)

---

## 설계 결정

### D1. discriminatedUnion 확장: 7-type → 8-type

기존 7개 타입(TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH / SIGN / X402_PAYMENT)에
NFT_TRANSFER를 추가하여 8-type으로 확장한다. CONTRACT_CALL로 처리할 수도 있지만,
NFT 전송은 고유한 파라미터(tokenId, standard, amount for 1155)가 있고 정책 평가 시
별도 처리가 필요하므로 전용 타입이 적합하다.

### D2. 인덱서 의존성 전략

NFT 목록 조회는 인덱서 필수, NFT 전송은 인덱서 불필요(직접 지정).
인덱서 미설정 시에도 전송 기능은 사용 가능하도록 분리한다.
이는 RPC만으로 충분한 현재 토큰 전송 패턴과 일관성을 유지한다.

### D3. 메타데이터 캐싱

NFT 메타데이터(이름, 이미지, attributes)는 변경 빈도가 매우 낮으므로
장기 캐싱(기본 24시간)이 적합하다. 기존 reputation_cache 패턴을 참고하되
TTL을 길게 설정한다.

### D4. 이미지 처리

Admin UI에서 NFT 이미지를 표시하려면 CSP `img-src` 정책 업데이트가 필요하다.
IPFS 이미지는 공개 gateway(ipfs.io, cloudflare-ipfs.com)를 통해 접근한다.
이미지 프록시는 구현하지 않고 직접 참조한다 (self-hosted 특성상 CORS 제약 낮음).

### D5. ERC-1155 수량 처리

ERC-1155는 동일 tokenId를 여러 개 보유할 수 있으므로 `amount` 필드가 필수다.
ERC-721과 Metaplex는 항상 `amount: "1"`이다. 통합 스키마에서 `amount`를
선택 필드로 두되 ERC-1155일 때만 의미를 가진다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/core/src/schemas/` | NFT_TRANSFER 타입 추가 (discriminatedUnion 8-type), NFT 응답 스키마 |
| `packages/core/src/types/` | INftIndexer 인터페이스, NFT 관련 타입 |
| `packages/daemon/src/chain/` | IChainAdapter NFT 메서드, SolanaAdapter/EvmAdapter 구현 |
| `packages/daemon/src/api/routes/` | NFT 조회/전송 라우트 추가 |
| `packages/daemon/src/infrastructure/` | 인덱서 클라이언트 (Alchemy, Helius), 메타데이터 캐시 |
| `packages/daemon/src/pipeline/` | NFT_TRANSFER 파이프라인 처리 |
| `packages/admin/src/pages/` | 지갑 상세 NFT 탭, 인덱서 설정 |
| `packages/mcp/src/` | NFT MCP 도구 3개 |
| `packages/sdk/src/` | NFT SDK 메서드 3개 |
| `skills/` | nft.skill.md 신규, wallet/transactions 업데이트 |

---

## 향후 확장

### NFT 마켓플레이스 연동

본 마일스톤 범위 밖이며, NFT 기본 기능(조회/전송/승인)이 안정된 후 별도 마일스톤으로 검토한다.

- **EVM**: OpenSea, Blur — 리스팅, 오퍼, 구매, 가격 조회
- **Solana**: Magic Eden, Tensor — 리스팅, 구매, 컬렉션 탐색
- **구현 방식**: DeFi 프로토콜과 동일하게 Action Provider 패턴으로 추가
- **유스케이스**: 에이전트 자동 구매(멤버십/거버넌스 NFT), 포트폴리오 가치 평가, 리스팅 관리
