# 마일스톤 m31-00: NFT 지원 (EVM + Solana)

- **Status:** SHIPPED
- **Milestone:** v31.0
- **Completed:** 2026-03-06

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
  `name`, `image`, `description`, `amount` (ERC-1155 수량), `collection`, `assetId` (CAIP-19)
- **R1-4.** 페이지네이션 지원 (커서 기반, 기존 트랜잭션 목록과 동일 패턴)
- **R1-5.** `network` 쿼리 파라미터로 네트워크 지정 (필수 — v29.3에서 기본 네트워크 개념 제거됨). sessionAuth(R1-1)과 masterAuth(R1-2) 모두 동일하게 필수
- **R1-6.** 컬렉션별 그룹핑 옵션 (`?groupBy=collection`). 인덱서가 컬렉션 정보를 제공하지 않는 경우 그룹핑 미적용 (flat list fallback)

### R2. NFT 메타데이터 조회

- **R2-1.** `GET /v1/wallet/nfts/{tokenIdentifier}` — 개별 NFT 상세 메타데이터
  - **tokenIdentifier 형식**: EVM은 `{contractAddress}:{tokenId}` (예: `0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:1234`), Solana는 `{mintAddress}` (예: `7Dg3...abc`)
  - EVM에서 콜론(`:`)은 URL-safe이므로 별도 인코딩 불필요
- **R2-2.** EVM: tokenURI에서 JSON 파싱 (IPFS gateway 자동 변환)
- **R2-3.** Solana: Metaplex JSON 메타데이터 파싱
- **R2-4.** 메타데이터 캐싱 (TTL 기반, 기본 24시간 — NFT 메타데이터는 변경 빈도 낮음). DB 테이블 `nft_metadata_cache` 사용 (D3 참조)
- **R2-5.** attributes/traits 배열 포함

### R3. NFT 전송

- **R3-1.** 트랜잭션 타입 `NFT_TRANSFER` 추가 — TransactionRequestSchema discriminatedUnion에 6번째 타입 (현재 5-type: TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH). 개념적 전체 트랜잭션 타입은 8개 (6 send + SIGN + X402_PAYMENT)
- **R3-2.** EVM ERC-721: `safeTransferFrom(from, to, tokenId)` 호출
- **R3-3.** EVM ERC-1155: `safeTransferFrom(from, to, tokenId, amount, data)` 호출
- **R3-4.** Solana Metaplex: SPL Token transfer instruction 생성
- **R3-5.** 6-stage 파이프라인 통과 (정책 평가 + 승인 tier 적용)
- **R3-6.** Smart Account (ERC-4337) 호환: Stage 5에서 accountType=smart인 경우 `buildUserOpCalls()`에 NFT_TRANSFER → call 변환 로직 추가 (기존 5-type 변환 패턴과 동일)
- **R3-7.** `POST /v1/transactions/send` 요청 바디:
  ```json
  {
    "type": "NFT_TRANSFER",
    "to": "<recipient>",
    "token": {
      "address": "<contract/mint>",
      "tokenId": "<tokenId>",
      "standard": "ERC-721",
      "assetId": "eip155:1/erc721:0x.../<tokenId>"
    },
    "amount": "1",
    "network": "ethereum-mainnet"
  }
  ```
  `token.assetId`는 선택 필드 (CAIP-19 형식, R11 참조).
  `amount`는 선택 필드 — ERC-1155일 때만 의미가 있으며, 생략 시 기본값 `"1"`. ERC-721/Metaplex는 `amount` 생략 가능

### R4. NFT 승인 관리

- **R4-1.** EVM `approve`: 특정 NFT에 대한 단일 승인
- **R4-2.** EVM `setApprovalForAll`: 컬렉션 전체 승인
- **R4-3.** Solana `delegate`: 토큰 위임
- **R4-4.** **기존 `APPROVE` 트랜잭션 타입을 확장한다.** ApproveRequestSchema에 선택 필드 `nft` (`{ tokenId, standard }`) 추가. NFT 승인 시 `nft` 필드 존재 여부로 구분. 별도 타입을 만들지 않는다 (기존 APPROVE 정책/파이프라인 재사용).
- **R4-5.** 현재 승인 상태 조회 API: `GET /v1/wallet/nfts/{tokenIdentifier}/approvals` (sessionAuth), `GET /v1/wallets/{id}/nfts/{tokenIdentifier}/approvals` (masterAuth)

### R5. 인덱서 프로바이더 프레임워크

- **R5-1.** `INftIndexer` 인터페이스 정의: `listNfts()`, `getNftMetadata()`, `getNftsByCollection()`
- **R5-2.** EVM 인덱서: Alchemy NFT API 구현체
- **R5-3.** Solana 인덱서: Helius DAS API 구현체
- **R5-4.** 인덱서 API 키 설정: settings 테이블에 `actions.alchemy_nft_api_key` / `actions.helius_das_api_key` 패턴으로 저장 (기존 DeFi 프로바이더 API 키와 동일 패턴, AES-256-GCM 암호화). 기존 `actions.*` 키에 alchemy 관련 키가 없으므로 이름 충돌 없음 (Smart Account의 per-wallet alchemy 키는 별도 저장소)
- **R5-5.** 인덱서 미설정 시 NFT 조회 불가 안내 (전송은 컨트랙트 주소+tokenId 직접 지정으로 가능)
- **R5-6.** 인덱서 응답 캐싱 (TTL 설정 가능)
- **R5-7.** 인덱서 API 호출 rate limit/retry: 기존 DeFi 프로바이더와 동일 패턴 적용 (지수 백오프 + 최대 3회 재시도, 429 응답 시 Retry-After 헤더 존중)

### R6. IChainAdapter 확장

- **R6-1.** IChainAdapter에 NFT 메서드 추가: `transferNft()`, `approveNft()`, `buildNftTransferTx()`
- **R6-2.** SolanaAdapter에 Metaplex NFT 전송 구현
- **R6-3.** EvmAdapter에 ERC-721/ERC-1155 전송 구현
- **R6-4.** NFT 표준 자동 감지 (ERC-165 `supportsInterface` 호출)

### R7. Admin UI

- **R7-1.** 지갑 상세 페이지에 NFT 탭 추가 — 보유 NFT 그리드/리스트 뷰
- **R7-2.** NFT 이미지 썸네일 표시 (CSP `img-src` 업데이트: `ipfs.io`, `cloudflare-ipfs.com`, `w3s.link`, `nftstorage.link`, `arweave.net` 허용). `w3s.link`는 web3.storage의 현행 IPFS gateway이며, `nftstorage.link`는 레거시 호환용으로 함께 허용
- **R7-3.** NFT 상세 모달: 메타데이터, attributes 표시 (전송 기능은 Admin UI에 포함하지 않음 — API/SDK/MCP를 통해서만 전송)
- **R7-4.** 인덱서 설정 UI (System Settings 또는 API Keys 페이지)

### R8. MCP + SDK

- **R8-1.** MCP 도구: `list_nfts`, `get_nft_metadata`, `transfer_nft`
- **R8-2.** SDK 메서드: `listNfts()`, `getNftMetadata()`, `transferNft()`
- **R8-3.** connect-info에 NFT 보유 요약 포함. 인덱서 미설정 시 NFT 섹션 생략 (에러 아닌 graceful omission)

### R9. 정책

- **R9-1.** NFT_TRANSFER에 대한 기존 정책 적용: RATE_LIMIT은 건수 기반, SPENDING_LIMIT은 NFT 전송 개수(count) 기반 — 기존 금액 필드를 NFT 수량으로 재해석하지 않고, 별도 `nft_count` 카운터로 추적한다. NFT 시세 기반 금액 한도는 가격 오라클 부재로 **범위 밖** — 향후 마켓플레이스 연동 시 검토.
- **R9-2.** CONTRACT_WHITELIST 정책으로 허용된 NFT 컨트랙트만 전송 가능
- **R9-3.** NFT 전송 기본 tier: `APPROVAL` (고가 자산 가능성)

### R10. 스킬 파일

- **R10-1.** `skills/nft.skill.md` 신규 생성 — NFT 조회/전송/승인 API, SDK, MCP 문서
- **R10-2.** `skills/wallet.skill.md` — NFT 탭, 자산 조회에 NFT 포함
- **R10-3.** `skills/transactions.skill.md` — NFT_TRANSFER 타입 추가

### R11. CAIP-19 NFT 자산 식별

- **R11-1.** CAIP-19 NFT 네임스페이스 추가: `erc721`, `erc1155`, `metaplex`
  - EVM ERC-721: `eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D/1234`
  - EVM ERC-1155: `eip155:1/erc1155:0x.../<tokenId>`
  - Solana Metaplex: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/metaplex:<mintAddress>`
- **R11-2.** `asset-helpers.ts`에 `nftAssetId(network, address, tokenId?, standard?)` 헬퍼 추가
- **R11-3.** NFT 목록/상세 응답에 `assetId` 필드 포함 (선택)
- **R11-4.** ALLOWED_TOKENS 정책에서 NFT CAIP-19 매칭 지원 (기존 4-scenario 매트릭스 확장)

### R12. 에러 코드

- **R12-1.** `NFT_NOT_FOUND` — 지정한 tokenIdentifier에 해당하는 NFT가 없을 때 (404)
- **R12-2.** `INDEXER_NOT_CONFIGURED` — NFT 조회 시 인덱서 API 키가 미설정 (400)
- **R12-3.** `UNSUPPORTED_NFT_STANDARD` — 지원하지 않는 NFT 표준 지정 시 (400)
- **R12-4.** `INDEXER_API_ERROR` — 인덱서 API 호출 실패 (502)
- **R12-5.** `NFT_METADATA_FETCH_FAILED` — tokenURI/메타데이터 JSON 파싱 실패 (502)
- **R12-6.** 기존 에러 코드 재사용: `INSUFFICIENT_BALANCE` (NFT 미보유 시 전송 시도), `CONTRACT_NOT_WHITELISTED` (정책 위반)

### R13. DB 마이그레이션

- **R13-1.** v44 마이그레이션: `nft_metadata_cache` 테이블 생성 (contract_address, token_id, chain, metadata_json, cached_at, expires_at)
- **R13-2.** 인덱서 API 키는 기존 settings 테이블 사용 (마이그레이션 불필요)
- **R13-3.** 마이그레이션 테스트: 스키마 스냅샷 + 데이터 변환 테스트 (CLAUDE.md 규칙 준수)

---

## 설계 결정

### D1. discriminatedUnion 확장: TransactionRequestSchema 5-type → 6-type

현재 TransactionRequestSchema는 5개 타입(TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH)을 가진다.
SIGN과 X402_PAYMENT는 별도 스키마/파이프라인으로 처리된다.
NFT_TRANSFER를 TransactionRequestSchema에 6번째 타입으로 추가한다.
CONTRACT_CALL로 처리할 수도 있지만, NFT 전송은 고유한 파라미터(tokenId, standard, amount for 1155)가 있고
정책 평가 시 별도 처리가 필요하므로 전용 타입이 적합하다.

### D2. 인덱서 의존성 전략

NFT 목록 조회는 인덱서 필수, NFT 전송은 인덱서 불필요(직접 지정).
인덱서 미설정 시에도 전송 기능은 사용 가능하도록 분리한다.
이는 RPC만으로 충분한 현재 토큰 전송 패턴과 일관성을 유지한다.

### D3. 메타데이터 캐싱

NFT 메타데이터(이름, 이미지, attributes)는 변경 빈도가 매우 낮으므로
장기 캐싱(기본 24시간)이 적합하다. DB 테이블 `nft_metadata_cache`에 저장하며,
기존 `reputation_cache` 패턴(DB 기반 + TTL 필드)을 참고한다.
인메모리 캐시가 아닌 DB 캐시를 선택하는 이유: 데몬 재시작 시에도 캐시 유지,
메타데이터 페이로드가 크므로 메모리 절약.

### D4. 이미지 처리

Admin UI에서 NFT 이미지를 표시하려면 CSP `img-src` 정책 업데이트가 필요하다.
IPFS 이미지는 공개 gateway(`ipfs.io`, `cloudflare-ipfs.com`, `w3s.link`, `nftstorage.link`)를 통해 접근하고,
Arweave 이미지는 `arweave.net`을 통해 접근한다.
이미지 프록시는 구현하지 않고 직접 참조한다 (self-hosted 특성상 CORS 제약 낮음).

### D5. ERC-1155 수량 처리

ERC-1155는 동일 tokenId를 여러 개 보유할 수 있으므로 `amount` 필드가 필수다.
ERC-721과 Metaplex는 항상 수량 1이다. 통합 스키마에서 `amount`를
선택 필드(기본값 `"1"`)로 두되 ERC-1155일 때만 의미를 가진다.
전송 요청(R3-7)에서 ERC-721/Metaplex는 `amount` 생략 가능, ERC-1155는 필수.

### D6. NFT 승인은 기존 APPROVE 타입 확장

NFT 승인을 위해 별도 트랜잭션 타입을 만들지 않는다. 기존 APPROVE 타입의
ApproveRequestSchema에 선택 필드 `nft: { tokenId, standard }`를 추가한다.
`nft` 필드 존재 여부로 ERC-20 approve와 NFT approve를 구분한다.
이유: 승인이라는 의미적 동일성, 기존 정책/파이프라인 로직 최대 재사용.

### D7. CAIP-19 NFT 네임스페이스

기존 CAIP-19 체계(`slip44`, `erc20`, `token`)에 NFT 네임스페이스를 추가한다:
- `erc721`: EVM ERC-721 (assetReference = `contractAddress/tokenId`)
- `erc1155`: EVM ERC-1155 (assetReference = `contractAddress/tokenId`)
- `metaplex`: Solana Metaplex (assetReference = `mintAddress`)

이들은 WAIaaS 자체 확장 네임스페이스이다 (기존 `token` 네임스페이스와 동일한 접근 — CAIP-19 공식 표준에는 NFT 전용 네임스페이스가 없으므로 WAIaaS가 자체 정의).
CAIP-19 정규화 시 EVM 주소는 소문자 변환 (기존 erc20 패턴과 동일).

### D8. Smart Account (ERC-4337) NFT 전송 호환

Stage 5의 `buildUserOpCalls()` 함수에 NFT_TRANSFER → call 변환 로직을 추가한다.
기존 5-type 변환 패턴(TRANSFER → value transfer, TOKEN_TRANSFER → ERC20 call 등)과
동일한 구조로 NFT_TRANSFER → safeTransferFrom call을 생성한다.
별도의 추가 설계 없이 기존 패턴을 그대로 따른다.

### D9. Dry-Run 및 Batch 호환

NFT_TRANSFER는 기존 Dry-Run API(`POST /v1/transactions/dry-run`)를 그대로 지원한다.
6-stage 파이프라인을 Stage 4(서명)까지만 실행하는 기존 로직이 NFT_TRANSFER에도 동일 적용.
BATCH 타입 내부에 NFT_TRANSFER를 포함할 수 있다 — 기존 BATCH 처리 로직이 items 배열의
각 타입을 개별 처리하므로 NFT_TRANSFER 핸들러 추가만으로 호환된다.

### D10. NFT 수신 감지 — 범위 밖

IncomingTxMonitorService의 NFT 수신 감지는 이 마일스톤 범위 밖이다.
이유: 현재 incoming_transactions 테이블에 NFT 관련 컬럼이 없고,
IChainSubscriber의 감지 전략이 토큰 전송에 최적화되어 있다.
NFT Transfer 이벤트(ERC-721 `Transfer`, ERC-1155 `TransferSingle/TransferBatch`) 감지는
별도 마일스톤에서 incoming_transactions 스키마 확장과 함께 구현한다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/core/src/schemas/` | NFT_TRANSFER 타입 추가 (TransactionRequestSchema 6-type), APPROVE 스키마 nft 필드, NFT 응답 스키마, NFT 에러 코드 (Zod SSoT → OpenAPI 자동 파생) |
| `packages/core/src/types/` | INftIndexer 인터페이스, NFT 관련 타입 |
| `packages/core/src/caip/` | NFT CAIP-19 네임스페이스 (erc721/erc1155/metaplex), nftAssetId() 헬퍼 |
| `packages/daemon/src/chain/` | IChainAdapter NFT 메서드, SolanaAdapter/EvmAdapter 구현 |
| `packages/daemon/src/api/routes/` | NFT 조회/전송 라우트 추가 |
| `packages/daemon/src/infrastructure/` | 인덱서 클라이언트 (Alchemy, Helius), 메타데이터 캐시 |
| `packages/daemon/src/infrastructure/database/` | v44 마이그레이션 (nft_metadata_cache 테이블) |
| `packages/daemon/src/pipeline/` | NFT_TRANSFER 파이프라인 처리, buildUserOpCalls() NFT 변환 추가 |
| `packages/admin/src/pages/` | 지갑 상세 NFT 탭, 인덱서 설정 |
| `packages/mcp/src/` | NFT MCP 도구 3개 |
| `packages/sdk/src/` | NFT SDK 메서드 3개 |
| `skills/` | nft.skill.md 신규, wallet/transactions 업데이트 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 향후 계획 |
|------|------|----------|
| NFT 마켓플레이스 연동 (OpenSea, Magic Eden 등) | 기본 기능 안정화 우선 | Action Provider 패턴으로 별도 마일스톤 |
| NFT 수신 감지 (IncomingTxMonitor) | incoming_transactions 스키마 확장 필요 | NFT Transfer 이벤트 구독 별도 마일스톤 |
| NFT 시세 기반 금액 한도 정책 | 가격 오라클 부재 | 마켓플레이스 연동 시 검토 |

### NFT 마켓플레이스 연동

- **EVM**: OpenSea, Blur — 리스팅, 오퍼, 구매, 가격 조회
- **Solana**: Magic Eden, Tensor — 리스팅, 구매, 컬렉션 탐색
- **구현 방식**: DeFi 프로토콜과 동일하게 Action Provider 패턴으로 추가
- **유스케이스**: 에이전트 자동 구매(멤버십/거버넌스 NFT), 포트폴리오 가치 평가, 리스팅 관리
