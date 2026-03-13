# 마일스톤 m31-16: CAIP 표준 식별자 승격

- **Status:** PLANNED
- **Milestone:** v31.16

## 목표

REST API, SDK, MCP 전체 인터페이스에서 **CAIP-2(네트워크)와 CAIP-19(자산)를 표준 식별자로 승격**한다. 기존 plain string 방식(`ethereum-mainnet`, `address`)을 100% 유지하면서 CAIP 경로를 **병렬로 추가**하여, AI 에이전트와 외부 시스템이 업계 표준 식별자로 네트워크와 자산을 지칭할 수 있도록 한다.

> **선행**: 없음 (v27.2에서 CAIP-19 optional `assetId` 도입, `packages/core/src/caip/` 유틸리티 완비)
> **참조**: `packages/core/src/caip/`, `network-map.ts`, `asset-helpers.ts`, `transaction.schema.ts`

---

## 배경

### 현재 상태

WAIaaS는 내부적으로 CAIP-2/19를 활용하고 있으나(서명 프로토콜, x402, 가격 캐시, NFT), **외부 API 인터페이스에서는 자체 plain string 식별자만 사용**한다:

| 영역 | 현재 방식 | CAIP 사용 |
|------|----------|----------|
| REST API 네트워크 파라미터 | `network=ethereum-mainnet` | ❌ |
| REST API 토큰 식별 | `address` 필수 + `assetId` optional | △ (optional) |
| SDK 메서드 파라미터 | `network: 'polygon-mainnet'` | ❌ |
| MCP 도구 파라미터 | `network: 'base-mainnet'` | ❌ |
| 응답 네트워크 필드 | `network: "ethereum-mainnet"` | ❌ |
| 응답 자산 필드 | `assetId` optional | △ (일부만) |

### 문제점

1. **비표준 식별자**: `ethereum-mainnet`, `polygon-mainnet` 등은 WAIaaS 고유 명명이며, CAIP-2(`eip155:1`, `eip155:137`)가 업계 표준
2. **중복 정보 전달**: AI 에이전트가 `network` + `address` + `decimals` + `symbol`을 모두 전달해야 토큰을 특정 — CAIP-19 하나면 충분
3. **상호운용성 부재**: 다른 지갑/프로토콜(WalletConnect, CAIP-25, x402)에서 CAIP를 사용하므로 변환 레이어 필요
4. **응답 불일치**: 일부 응답은 `assetId`를 포함하고 일부는 미포함 — 일관성 부족

### CAIP 표준 승격의 이점

1. **AI 에이전트 DX 향상**: `assetId: "eip155:1/erc20:0xa0b8..."` 하나로 네트워크+토큰 완전 특정
2. **업계 표준 호환**: WalletConnect, CAIP-25, x402, ERC-8004 등과 동일 식별 체계
3. **토큰 레지스트리 자동 조회**: `assetId`만으로 `address`, `decimals`, `symbol` 자동 resolve — AI가 메타데이터를 외울 필요 없음
4. **L2 자산 구분 명확**: `eip155:1/erc20:0xa0b8...` vs `eip155:137/erc20:0xa0b8...` — 동일 주소, 다른 네트워크의 토큰 구분

---

## 요구사항

### R1. 네트워크 입력 — CAIP-2 Dual-Accept

기존 `NetworkTypeEnumWithLegacy`의 `z.preprocess` 패턴을 확장하여 CAIP-2 형식도 수용한다.

- **R1-1.** `normalizeNetworkInput()` 확장: CAIP-2 문자열(`eip155:1`, `solana:5eykt...`)을 NetworkType(`ethereum-mainnet`, `solana-mainnet`)으로 자동 변환
- **R1-2.** 기존 plain string(`ethereum-mainnet`) 및 legacy(`mainnet`, `devnet`) 입력은 그대로 동작
- **R1-3.** 변환 순서: (1) CAIP-2 매핑 → (2) legacy 매핑 → (3) 그대로 통과
- **R1-4.** 미등록 CAIP-2 문자열은 Zod validation에서 reject (기존 동작과 동일)
- **R1-5.** 모든 `network` 파라미터(query, body)에 자동 적용 — `NetworkTypeEnumWithLegacy`를 사용하는 곳 전체

### R2. 자산 입력 — CAIP-19 Primary

`TokenInfoSchema`를 확장하여 `assetId`만으로 토큰을 특정할 수 있도록 한다.

- **R2-1.** `assetId`가 제공되면 `address`, `decimals`, `symbol`을 optional로 전환
- **R2-2.** `assetId`만 제공 시, 파이프라인 진입 전에 토큰 레지스트리에서 `address`, `decimals`, `symbol` 자동 resolve
- **R2-3.** 레지스트리에 없는 `assetId`는 CAIP-19에서 `chainId` + `address`를 파싱하여 네트워크와 주소를 추출하되, `decimals`/`symbol`은 필수로 요구 (on-chain 조회는 범위 밖)
- **R2-4.** `assetId`와 `address`가 모두 제공된 경우 기존 cross-validation 유지 (대소문자 무시 비교)
- **R2-5.** `assetId`에서 추출한 네트워크와 요청의 `network` 파라미터가 다르면 validation error
- **R2-6.** `assetId`가 제공되고 `network`가 미제공이면 `assetId`의 CAIP-2 chainId에서 네트워크 자동 추론

### R3. 응답 — CAIP 필드 항상 포함

모든 API 응답에서 네트워크와 자산 식별자에 CAIP 필드를 항상 포함한다.

- **R3-1.** 네트워크를 포함하는 모든 응답에 `chainId` (CAIP-2) 필드 추가: 잔액, 자산 목록, 트랜잭션, NFT, DeFi 포지션 등
- **R3-2.** 토큰/자산을 포함하는 모든 응답에 `assetId` (CAIP-19) 항상 포함 — optional에서 항상 생성으로 변경
- **R3-3.** 네이티브 토큰 잔액 응답에도 `assetId` 포함 (예: `eip155:1/slip44:60`)
- **R3-4.** 기존 `network`, `chain`, `address`, `mint` 필드는 그대로 유지 — additive only
- **R3-5.** NFT 응답의 `assetId` (이미 존재)는 항상 포함하도록 보장
- **R3-6.** `connect-info` 응답에 `supportedChainIds: string[]` (CAIP-2 배열) 추가 — 지갑이 지원하는 네트워크 목록

### R4. SDK 확장

- **R4-1.** 모든 `network` 파라미터에 CAIP-2 문자열도 수용 (`'eip155:1'` | `'ethereum-mainnet'`)
- **R4-2.** `sendToken()` 등 토큰 관련 메서드에서 `{ assetId }` 단독 전달 지원
- **R4-3.** 응답 타입에 `chainId` (CAIP-2), `assetId` (CAIP-19) 필드 추가
- **R4-4.** 기존 메서드 시그니처는 그대로 유지 — 추가 overload/union 타입으로 확장
- **R4-5.** SDK 타입 export에 `Caip2ChainId`, `Caip19AssetId` 타입 alias 추가

### R5. MCP 도구 확장

- **R5-1.** 모든 `network` 파라미터 설명에 CAIP-2 형식 수용 명시 (예: `"network or CAIP-2 chain ID (e.g., 'eip155:1')"`)
- **R5-2.** `send_token`, `approve_token` 등 토큰 도구에서 `assetId` 단독 전달 지원
- **R5-3.** 도구 응답에 `chainId`, `assetId` 항상 포함
- **R5-4.** 새 MCP 도구 `resolve_asset`: CAIP-19 → 토큰 메타데이터(address, decimals, symbol, name) 조회

### R6. OpenAPI 스펙 업데이트

- **R6-1.** 네트워크 파라미터 스키마에 CAIP-2 예시 추가
- **R6-2.** TokenInfo 스키마에 `assetId`-only 사용 패턴 문서화
- **R6-3.** 응답 스키마에 `chainId`, `assetId` 필드 추가
- **R6-4.** CAIP-2/CAIP-19 형식 설명 및 예시를 API 문서 상단에 기재

### R7. Skill 파일 동기화

- **R7-1.** `skills/*.skill.md` 파일에 CAIP-2/19 사용법 추가
- **R7-2.** 네트워크 지정 예시에 CAIP-2 형식 병기
- **R7-3.** 토큰 전송 예시에 `assetId` 단독 사용 패턴 추가

### R8. 테스트

- **R8-1.** `normalizeNetworkInput` CAIP-2 변환 테스트: 15개 네트워크 매핑 전수 검증
- **R8-2.** CAIP-2 + plain string + legacy 혼용 입력 테스트 (우선순위 검증)
- **R8-3.** `TokenInfo` assetId-only 입력 → 레지스트리 resolve 테스트
- **R8-4.** `assetId`에서 네트워크 자동 추론 테스트
- **R8-5.** `assetId` vs `network` 불일치 validation error 테스트
- **R8-6.** 미등록 assetId + address/decimals/symbol 폴백 테스트
- **R8-7.** 모든 응답 스키마에 `chainId`/`assetId` 포함 검증 테스트
- **R8-8.** SDK CAIP-2 네트워크 입력 테스트
- **R8-9.** MCP 도구 CAIP-2 네트워크 입력 + assetId 단독 전달 테스트
- **R8-10.** `resolve_asset` MCP 도구 테스트

---

## 설계 결정

### D1. Dual-Accept, Never Deprecate

기존 plain string 식별자(`ethereum-mainnet`, `address`)를 deprecate하지 않고 CAIP 경로를 병렬로 추가한다. 이유:
- 기존 사용자/에이전트의 코드 변경 불필요
- plain string이 가독성 면에서 우수한 경우 있음 (`ethereum-mainnet` vs `eip155:1`)
- CAIP-2 Solana 참조값(`5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)은 genesis hash라 사용자 친화적이지 않음
- **둘 다 영구 지원**, 사용자가 선호하는 방식 선택

### D2. `normalizeNetworkInput` 단일 변환 지점

모든 네트워크 입력 정규화를 `normalizeNetworkInput()` 한 곳에서 처리한다:
- `NetworkTypeEnumWithLegacy`의 `z.preprocess`에서 호출
- 모든 route의 query/body `network` 파라미터가 자동으로 이 경로를 거침
- 개별 route 수정 불필요 — preprocess 로직만 확장하면 30+ 엔드포인트에 일괄 적용

### D3. assetId-only 시 토큰 레지스트리 자동 조회

`assetId`만 제공된 경우 토큰 레지스트리에서 메타데이터를 조회하는 이유:
- AI 에이전트가 `decimals`, `symbol`을 기억할 필요 없음 — `assetId` 하나면 충분
- 레지스트리에 없는 토큰은 `decimals`/`symbol` 필수 → 안전한 폴백
- on-chain 조회(ERC-20 `decimals()` 호출)는 지연 + 실패 가능성 있으므로 범위 밖

### D4. 응답 CAIP 필드는 additive

기존 응답 필드를 변경하지 않고 `chainId`(CAIP-2), `assetId`(CAIP-19)를 **추가만** 한다:
- 기존 SDK/에이전트의 응답 파싱 코드가 깨지지 않음
- OpenAPI 스키마에서 새 필드는 optional → 이전 클라이언트 호환
- 내부적으로 `networkToCaip2()`, `tokenAssetId()` 호출로 생성 — 런타임 비용 무시 가능

### D5. assetId 네트워크 자동 추론

`assetId`에 CAIP-2 chainId가 포함되어 있으므로 `network` 파라미터를 생략할 수 있다:
- `eip155:1/erc20:0xa0b8...` → `ethereum-mainnet` 자동 추론
- 네트워크와 토큰을 한 번에 특정 — AI 에이전트에게 최적의 DX
- `network`가 명시된 경우 일치 검증으로 실수 방지

### D6. MCP `resolve_asset` 도구 추가

새 MCP 도구를 추가하여 AI 에이전트가 CAIP-19 → 메타데이터 조회를 할 수 있게 한다:
- 입력: `assetId` (CAIP-19)
- 출력: `{ address, decimals, symbol, name, network, chainId, isNative, isRegistered }`
- AI가 토큰 메타데이터 확인이 필요한 경우 활용 (잔액 표시, 금액 변환 등)
- 기존 `GET /v1/tokens/resolve` 엔드포인트의 CAIP-19 기반 래퍼

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/core/src/enums/chain.ts` | `normalizeNetworkInput()` CAIP-2 변환 로직 추가 |
| `packages/core/src/schemas/transaction.schema.ts` | `TokenInfoSchema` assetId-only 지원 (address conditional optional) |
| `packages/core/src/caip/network-map.ts` | CAIP-2 → NetworkType 역매핑 내보내기 확인 |
| `packages/daemon/src/api/routes/wallet.ts` | 응답에 `chainId` 필드 추가 |
| `packages/daemon/src/api/routes/tokens.ts` | 응답에 `assetId` 항상 포함 + resolve 엔드포인트 CAIP-19 입력 지원 |
| `packages/daemon/src/api/routes/transactions.ts` | 응답에 `chainId` 추가, assetId resolve 로직 |
| `packages/daemon/src/api/routes/nfts.ts` | 응답 `assetId` 항상 포함 보장 |
| `packages/daemon/src/api/routes/defi-positions.ts` | 응답 `chainId` 추가 |
| `packages/daemon/src/api/routes/incoming.ts` | 응답 `chainId` 추가 |
| `packages/daemon/src/pipeline/stages.ts` | assetId → 토큰 레지스트리 resolve 단계 추가 |
| `packages/daemon/src/services/token-registry.ts` | `resolveByAssetId(caip19)` 메서드 추가 |
| `packages/sdk/src/types.ts` | 네트워크/토큰 타입에 CAIP 필드 추가, Caip2/Caip19 타입 export |
| `packages/sdk/src/client.ts` | CAIP-2 네트워크 파라미터 수용 |
| `packages/mcp/src/tools/*.ts` | 네트워크/토큰 파라미터 설명 업데이트, assetId-only 지원 |
| `packages/mcp/src/tools/resolve-asset.ts` | 신규 — `resolve_asset` MCP 도구 |
| `packages/core/src/schemas/connect-info.schema.ts` | `supportedChainIds` 필드 추가 |
| `skills/*.skill.md` | CAIP 사용법 + 예시 추가 |
| OpenAPI 스펙 | 자동 재생성 (Zod → OpenAPI 체인) |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| DB 스키마 변경 | network 컬럼을 CAIP-2로 마이그레이션하면 대규모 변경 | 입출력 변환 레이어에서 처리 |
| on-chain 토큰 메타데이터 조회 | RPC 지연 + 실패 가능성 | 레지스트리 미등록 시 `decimals`/`symbol` 필수 요구 |
| CAIP-10 (Account ID) | 계정 식별 표준이나 현재 walletId 체계와 중복 | 필요 시 후속 마일스톤 |
| CAIP-25 (Session Namespace) | WalletConnect 세션 범위 정의 — 현재 세션 모델과 상이 | WalletConnect 확장 시 검토 |
| plain string deprecation | 하위 호환 영구 유지 목표 | 둘 다 지원 |
| 기존 `assetId` optional 필드의 DB 마이그레이션 | 기존 레코드에 assetId 채우기는 대규모 작업 | 신규 레코드부터 항상 포함 |
