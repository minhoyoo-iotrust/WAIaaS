# 마일스톤 m27-02: CAIP-19 자산 식별 표준

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

WAIaaS 전체 코드베이스의 토큰/자산 식별 체계를 CAIP-19 표준으로 통일하여, 모든 ActionProvider와 외부 인터페이스가 체인·네트워크·자산을 하나의 식별자로 표현할 수 있는 상태.

---

## 배경

### 현재 한계

WAIaaS는 토큰/자산을 식별하는 방식이 컨텍스트마다 다르다:

| 컨텍스트 | 식별 방식 | 예시 |
|----------|----------|------|
| 트랜잭션 요청 | `token: { address, decimals, symbol }` + `network` | `{ address: "0xa0b8...", symbol: "USDC", decimals: 6 }` |
| 가격 오라클 캐시 키 | `${chain}:${address}` | `solana:EPjFW...`, `ethereum:native` |
| 토큰 레지스트리 DB | `(network, address)` unique index | `('ethereum-mainnet', '0xA0b8...')` |
| 정책 (ALLOWED_TOKENS) | `tokens[].address` (raw string) | `"0xa0b8..."` |
| AssetInfo | `mint` 필드 (네이티브는 `'native'`) | `mint: 'native'` |
| x402 USDC 맵 | CAIP-2 chain ID (부분 사용) | `'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'` |

이로 인해:
- 같은 USDC라도 Ethereum, Polygon, Arbitrum에서 각각 다른 주소로 식별되고, 체인 정보가 분리되어 전달됨
- 가격 오라클의 `TokenRef`에 `network` 필드가 없어 L2 토큰 가격 조회 불가 (CoinGecko 플랫폼 구분 불가)
- ActionProvider 도입 시 각 프로토콜마다 독자적 토큰 ID 형식 사용 (DCent: `ERC20/0x...`, Jupiter: mint address)
- 정책의 `address` 필드에 체인 정보가 없어, 같은 주소가 다른 체인에 존재할 때 구분 불가

### CAIP-19 표준 개요

[CAIP-19](https://standards.chainagnostic.org/CAIPs/caip-19)는 체인·자산을 하나의 URI로 식별하는 업계 표준이다:

```
asset_type = chain_id "/" asset_namespace ":" asset_reference
chain_id   = namespace ":" reference           (CAIP-2)
```

예시: `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` (Ethereum mainnet USDC)

---

## 사전 리서치 항목

이 마일스톤은 표준 스펙과 생태계 호환성에 대한 리서치가 구현 전에 필수적이다.

### R1. CAIP-2 체인 ID 표준 검증

- [CAIP-2](https://standards.chainagnostic.org/CAIPs/caip-2) 스펙 정독
- **Solana namespace 확정**: genesis hash 기반 reference 형식, 각 네트워크(mainnet-beta, devnet, testnet)의 정확한 genesis hash 확인
- **EVM namespace**: `eip155:{chainId}` 형식에서 WAIaaS 지원 12개 네트워크의 chain ID 교차 검증
- Solana devnet/testnet 리셋 시 genesis hash 변경 이력 조사

### R2. CAIP-19 자산 namespace 조사

- [CAIP-19](https://standards.chainagnostic.org/CAIPs/caip-19) 스펙 정독
- **공식 등록 namespace 목록**: `slip44`, `erc20`, `erc721` 등 CASA에 공식 등록된 namespace 확인
- **Solana SPL 토큰 namespace**: `spl`이 공식 등록되어 있는지, 다른 프로젝트에서 어떤 namespace를 사용하는지 조사
- **Solana Token-2022 (Token Extensions)**: SPL과 동일 namespace를 사용하는지 별도 namespace가 필요한지
- 네이티브 자산의 `slip44` coin type 번호 확인 (ETH=60, SOL=501 등)

### R3. 생태계 채택 현황 조사

- **WalletConnect v2**: CAIP-19를 어떻게 사용하는지, WAIaaS WcSigningBridge와의 호환성
- **기존 라이브러리**: `@chain-agnostic/caip`, `caip` npm 패키지 등 기존 파서 라이브러리 품질/유지보수 상태 조사 → 직접 구현 vs 라이브러리 사용 결정
- **DeFi 프로토콜 채택**: Jupiter, 0x, LI.FI, Aave 등이 CAIP-19를 지원하는지, 자체 토큰 ID와의 매핑 난이도
- **CoinGecko/Pyth**: 가격 오라클이 CAIP 기반 조회를 지원하는지, 매핑 방식

### R4. 하위 호환성 전략

- 기존 API 소비자(SDK, MCP 에이전트)에게 breaking change 없이 `assetId`를 도입하는 전략
- `assetId` 선택 필드 vs `assetId` 필수화 시점 결정
- DB 마이그레이션: 기존 `(network, address)` → CAIP-19 자동 변환의 정확도 검증
- 정책(ALLOWED_TOKENS) 기존 룰의 하위 호환 동작 보장 방안

### R5. 엣지 케이스 조사

- 같은 컨트랙트 주소가 다른 EVM 체인에 배포된 경우 (CREATE2 등) 처리 방식
- Wrapped 토큰 (WETH, WBTC 등)과 네이티브 토큰 간 관계 표현 가능 여부
- CAIP-19 URI의 최대 길이와 DB 컬럼 크기 결정
- URL 인코딩이 필요한 특수 문자 존재 여부

### 리서치 산출물

| 산출물 | 형식 | 내용 |
|--------|------|------|
| CAIP 스펙 분석 | 마크다운 | CAIP-2, CAIP-19 스펙 요약 + WAIaaS 매핑 테이블 확정 |
| 생태계 호환성 보고서 | 마크다운 | 라이브러리 평가, DeFi 프로토콜 매핑 난이도, WalletConnect 호환 |
| 마이그레이션 전략 | 마크다운 | 하위 호환 접근, 전환 타임라인, 엣지 케이스 처리 |

---

## 구현 대상

### 1. CAIP-19 파서/포매터 (packages/core)

`packages/core/src/caip/` 모듈:

| 컴포넌트 | 내용 |
|----------|------|
| `caip2.ts` | CAIP-2 chain ID 파서/포매터. `parseCaip2(chainId)` → `{ namespace, reference }`, `formatCaip2(namespace, reference)` → string |
| `caip19.ts` | CAIP-19 asset type 파서/포매터. `parseCaip19(assetId)` → `{ chainId, assetNamespace, assetReference }`, `formatCaip19(...)` → string |
| `network-map.ts` | WAIaaS NetworkType ↔ CAIP-2 양방향 매핑. `networkToCaip2(network)`, `caip2ToNetwork(chainId)` |
| `asset-helpers.ts` | 편의 함수: `nativeAssetId(network)` → CAIP-19, `tokenAssetId(network, address)` → CAIP-19, `isNativeAsset(caip19)` → boolean |

Zod 스키마 (리서치 결과에 따라 정규식 확정):

```typescript
export const Caip2Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}$/
);

export const Caip19Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-a-zA-Z0-9.%]{1,128}$/
);
```

### 2. TokenRef 확장

현재 `TokenRef`에 `network` 필드가 없어 L2 구분 불가. CAIP-19 도입과 함께 확장:

```typescript
// 현재
export const TokenRefSchema = z.object({
  address: z.string().min(1),
  symbol: z.string().optional(),
  decimals: z.number().int().min(0).max(18),
  chain: ChainTypeEnum,
});

// 확장
export const TokenRefSchema = z.object({
  assetId: Caip19Schema.optional(),    // 신규: CAIP-19 (선택적, 점진적 전환)
  address: z.string().min(1),          // 기존 호환
  symbol: z.string().optional(),
  decimals: z.number().int().min(0).max(18),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.optional(), // 신규: L2 구분
});
```

### 3. 가격 오라클 캐시 키 전환

현재 `${chain}:${address}` → CAIP-19 기반 캐시 키:

```typescript
// 현재: buildCacheKey('ethereum', '0xa0b8...') → 'ethereum:0xa0b8...'
// 변경: buildCacheKey(network, address) → 'eip155:1/erc20:0xa0b8...'
```

CoinGecko 플랫폼 ID 매핑도 CAIP-2 기반으로 전환하여 L2 토큰 가격 조회 지원.

### 4. ActionProvider 인터페이스 표준화

ActionProvider의 `resolve()` 입력에서 토큰을 CAIP-19로 식별:

```typescript
// ActionProvider resolve() 파라미터 예시
{
  fromAsset: 'eip155:1/slip44:60',                    // ETH
  toAsset: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  amount: '1000000000000000000',
  slippage: 1
}
```

각 ActionProvider는 내부에서 CAIP-19 → 프로토콜 고유 ID로 변환.

### 5. 트랜잭션 요청 스키마 확장

기존 `token: { address, decimals, symbol }` 필드에 `assetId` 선택 필드 추가. `assetId`가 제공되면 `address`는 `assetId`에서 추출하여 검증. 하위 호환성 유지.

### 6. 정책 스키마 확장

ALLOWED_TOKENS 정책에 `assetId` 지원. 평가 시 `assetId`가 있으면 체인+네트워크+주소를 모두 비교. `address`만 있으면 기존 동작 유지.

### 7. 토큰 레지스트리 DB 확장

`token_registry` 테이블에 `asset_id` 컬럼 추가. 기존 레코드 마이그레이션: `(network, address)` → CAIP-19 asset_id 자동 생성.

### 8. REST API / MCP / Skills 업데이트

- 토큰 관련 API 응답에 `assetId` 필드 추가
- `send_token`, `approve_token` MCP 도구에 `assetId` 파라미터 추가
- skills 파일에 CAIP-19 자산 식별자 사용법 반영

---

## 파일/모듈 구조

```
packages/core/src/
  caip/
    index.ts                  # barrel export
    caip2.ts                  # CAIP-2 파서/포매터
    caip19.ts                 # CAIP-19 파서/포매터
    network-map.ts            # NetworkType ↔ CAIP-2 매핑
    asset-helpers.ts          # 편의 함수
  interfaces/
    price-oracle.types.ts     # TokenRef 확장 (assetId, network)
  schemas/
    transaction.schema.ts     # TokenInfoSchema에 assetId 추가

packages/daemon/src/
  infrastructure/
    price/
      price-cache.ts          # 캐시 키 CAIP-19 전환
      coingecko-adapter.ts    # 플랫폼 ID CAIP-2 매핑
    database/
      schema.ts               # token_registry asset_id 컬럼
      migrations/             # ALTER TABLE 마이그레이션
  api/routes/
    tokens.ts                 # assetId 필드 추가

packages/mcp/src/tools/
  send-token.ts               # assetId 파라미터 추가
  approve-token.ts            # assetId 파라미터 추가

skills/
  quickstart.skill.md         # CAIP-19 소개
  transactions.skill.md       # assetId 사용법
  policies.skill.md           # ALLOWED_TOKENS assetId
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Solana CAIP-2 reference | genesis hash 기반 (리서치 확정 필요) | CAIP-2 Solana 네임스페이스 표준. x402 코드에서 이미 동일 형식 사용 중 |
| 2 | EVM CAIP-2 reference | `eip155:{chainId}` | 업계 표준 (WalletConnect 등) |
| 3 | 네이티브 자산 namespace | `slip44` (리서치 확정 필요) | CAIP-19 표준에서 네이티브 자산에 SLIP-44 coin type 사용 |
| 4 | SPL 토큰 namespace | `spl` (리서치 확정 필요) | 관례적 namespace. 공식 등록 여부 리서치 필요 |
| 5 | 하위 호환성 | `assetId` 선택 필드 | 기존 `address` 필드를 유지하고 `assetId`를 선택적으로 추가. 점진적 전환 |
| 6 | 파서 구현 | 직접 구현 vs npm 라이브러리 (리서치 결정) | 기존 `@chain-agnostic/caip` 등 라이브러리 품질 평가 후 결정 |
| 7 | CAIP-19 주소 정규화 | EVM lowercase, Solana 원본 | EVM 주소는 소문자로 정규화, Solana base58은 원본 유지 |
| 8 | 파서 위치 | packages/core | 모든 패키지(daemon, mcp, sdk)에서 공유. 외부 의존성 최소화 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | CAIP-2 파싱 | `parseCaip2('eip155:1')` → `{ namespace: 'eip155', reference: '1' }` assert | [L0] |
| 2 | CAIP-2 포매팅 | `formatCaip2('eip155', '1')` → `'eip155:1'` assert | [L0] |
| 3 | CAIP-19 파싱 | `parseCaip19('eip155:1/erc20:0xa0b8...')` → 구조체 assert | [L0] |
| 4 | CAIP-19 포매팅 | `formatCaip19(...)` → 원본 문자열 roundtrip assert | [L0] |
| 5 | NetworkType → CAIP-2 매핑 | 12개 네트워크 전체 양방향 매핑 assert | [L0] |
| 6 | 네이티브 자산 ID 생성 | `nativeAssetId('ethereum-mainnet')` → `'eip155:1/slip44:60'` assert | [L0] |
| 7 | 토큰 자산 ID 생성 | `tokenAssetId('ethereum-mainnet', '0xa0b8...')` → CAIP-19 assert | [L0] |
| 8 | isNativeAsset 판별 | `slip44` namespace → true, `erc20` namespace → false assert | [L0] |
| 9 | 잘못된 CAIP-19 거부 | 형식 불일치 문자열 → ZodError assert | [L0] |
| 10 | 토큰 레지스트리 assetId | POST /v1/tokens → 응답에 assetId 포함 assert | [L0] |
| 11 | 트랜잭션 assetId 전달 | TOKEN_TRANSFER 요청에 assetId 지정 → 파이프라인 통과 assert | [L0] |
| 12 | ALLOWED_TOKENS assetId | 정책에 assetId 지정 → 체인+네트워크+주소 모두 비교 assert | [L0] |
| 13 | 가격 오라클 L2 토큰 | Polygon USDC assetId → CoinGecko polygon-pos 플랫폼 조회 assert | [L0] |
| 14 | MCP send_token assetId | assetId로 토큰 전송 → token 필드 자동 추출 assert | [L0] |
| 15 | 마이그레이션 | 기존 토큰 레지스트리 레코드에 asset_id 자동 생성 assert | [L0] |
| 16 | 하위 호환 | assetId 없이 기존 address 방식 → 동일 동작 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| 없음 (독립적) | CAIP-19는 기존 인프라 위에 식별 레이어를 추가하는 것이므로 선행 의존 없음 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | CAIP-2 Solana genesis hash 변경 | devnet/testnet 리셋 시 chain ID 변경 | 매핑 테이블을 설정 가능하게 유지. 변경 시 매핑만 업데이트 |
| 2 | SPL namespace 비공식 | CAIP-19에 공식 Solana SPL namespace 미등록 가능성 | 리서치에서 확인. 비공식이면 관례 따르되 향후 공식 등록 시 전환 계획 수립 |
| 3 | 하위 호환성 유지 비용 | assetId + address 이중 지원으로 코드 복잡도 증가 | 전환 기간 후 address-only 지원 deprecated 예정 |
| 4 | 외부 프로토콜 매핑 | 각 ActionProvider마다 CAIP-19 ↔ 프로토콜 ID 변환 필요 | 공통 매핑 유틸리티 제공, 프로바이더별 변환은 프로바이더 내부에서 처리 |
| 5 | npm 파서 라이브러리 품질 | 외부 라이브러리가 유지보수 중단 또는 품질 미달일 수 있음 | 리서치에서 평가 후 직접 구현/라이브러리 사용 결정 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 4개 (리서치 1 / CAIP 파서+매핑 1 / 오라클+레지스트리+DB 마이그레이션 1 / API+MCP+정책+스킬 1) |
| 신규 파일 | 5-7개 |
| 수정 파일 | 12-18개 |
| 테스트 | 16-24개 |
| DB 마이그레이션 | 1건 (token_registry asset_id 컬럼 추가) |
| 리서치 산출물 | 3건 (스펙 분석, 생태계 호환성, 마이그레이션 전략) |

---

*생성일: 2026-02-20*
*선행: 없음 (독립적, m28 DeFi 프로토콜 진입 전 완료 권장)*
