# Requirements: WAIaaS v31.16 CAIP 표준 식별자 승격

**Defined:** 2026-03-14
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v31.16 Requirements

Requirements for CAIP-2/CAIP-19 standard identifier promotion across all interfaces.

### Network Input (CAIP-2 Dual-Accept)

- [ ] **NET-01**: `normalizeNetworkInput()` 확장 — CAIP-2 문자열(`eip155:1`, `solana:5eykt...`)을 NetworkType(`ethereum-mainnet`, `solana-mainnet`)으로 자동 변환
- [ ] **NET-02**: 기존 plain string(`ethereum-mainnet`) 및 legacy(`mainnet`, `devnet`) 입력은 그대로 동작
- [ ] **NET-03**: 변환 순서 보장 — (1) CAIP-2 매핑 → (2) legacy 매핑 → (3) 그대로 통과
- [ ] **NET-04**: 미등록 CAIP-2 문자열은 Zod validation에서 reject
- [ ] **NET-05**: 모든 `network` 파라미터(query, body)에 자동 적용 — `NetworkTypeEnumWithLegacy`의 `z.preprocess`에서 일괄 처리

### Asset Input (CAIP-19 Primary)

- [ ] **AST-01**: `assetId`가 제공되면 `address`, `decimals`, `symbol`을 optional로 전환 (`.superRefine()` cross-field validation)
- [ ] **AST-02**: `assetId`만 제공 시, 파이프라인 진입 전에 토큰 레지스트리에서 `address`, `decimals`, `symbol` 자동 resolve
- [ ] **AST-03**: 레지스트리에 없는 `assetId`는 CAIP-19에서 `chainId` + `address`를 파싱하여 네트워크와 주소 자동 추출, `decimals`/`symbol`만 필수 요구
- [ ] **AST-04**: `assetId`와 `address`가 모두 제공된 경우 기존 cross-validation 유지 (대소문자 무시 비교)
- [ ] **AST-05**: `assetId`에서 추출한 네트워크와 요청의 `network` 파라미터가 다르면 validation error
- [ ] **AST-06**: `assetId`가 제공되고 `network`가 미제공이면 `assetId`의 CAIP-2 chainId에서 네트워크 자동 추론 (preprocessing 단계)
- [ ] **AST-07**: `assetId`에서 네트워크 자동 추론이 가능한 엔드포인트에서 `network`를 conditional optional로 전환 (`.superRefine()`)

### Response (CAIP Fields)

- [ ] **RSP-01**: 네트워크를 포함하는 모든 응답에 `chainId` (CAIP-2) 필드 추가 (잔액, 자산, 트랜잭션, NFT, DeFi 포지션, 수신 TX, Action 결과)
- [ ] **RSP-02**: 토큰/자산을 포함하는 모든 응답에 `assetId` (CAIP-19) 항상 포함 — 런타임 동적 생성 (DB 마이그레이션 불필요)
- [ ] **RSP-03**: 네이티브 토큰 잔액 응답에도 `assetId` 포함 (예: `eip155:1/slip44:60`)
- [ ] **RSP-04**: 기존 `network`, `chain`, `address`, `mint` 필드는 그대로 유지 — additive only
- [ ] **RSP-05**: NFT 응답의 `assetId` 항상 포함 보장
- [ ] **RSP-06**: `connect-info` 응답에 `supportedChainIds: string[]` (CAIP-2 배열) 추가

### SDK

- [ ] **SDK-01**: 모든 `network` 파라미터에 CAIP-2 문자열도 수용 (`'eip155:1'` | `'ethereum-mainnet'`)
- [ ] **SDK-02**: `sendToken()` 등 토큰 관련 메서드에서 `{ assetId }` 단독 전달 지원 (union 타입 확장)
- [ ] **SDK-03**: 응답 타입에 `chainId` (CAIP-2), `assetId` (CAIP-19) 필드 추가
- [ ] **SDK-04**: 기존 메서드 시그니처 유지 — 추가 union 타입으로 확장
- [ ] **SDK-05**: SDK 타입 export에 `Caip2ChainId`, `Caip19AssetId` 타입 alias 추가

### MCP

- [ ] **MCP-01**: 모든 `network` 파라미터 설명에 CAIP-2 형식 수용 명시
- [ ] **MCP-02**: `send_token`, `approve_token` 등 토큰 도구에서 `assetId` 단독 전달 지원
- [ ] **MCP-03**: 도구 응답에 `chainId`, `assetId` 항상 포함
- [ ] **MCP-04**: 새 MCP 도구 `resolve_asset` — CAIP-19 → 토큰 메타데이터 조회
- [ ] **MCP-05**: `resolve_asset` 입력: `assetId` (CAIP-19). 출력: `{ address, decimals, symbol, name, network, chainId, isNative, isRegistered }`
- [ ] **MCP-06**: 미등록 자산은 `isRegistered: false`로 반환, decimals/symbol은 `null`

### Spec & Docs

- [ ] **DOC-01**: 네트워크 파라미터 스키마에 CAIP-2 예시 추가 (OpenAPI)
- [ ] **DOC-02**: TokenInfo 스키마에 `assetId`-only 사용 패턴 문서화 (OpenAPI)
- [ ] **DOC-03**: 응답 스키마에 `chainId`, `assetId` 필드 추가 (OpenAPI)
- [ ] **DOC-04**: CAIP-2/CAIP-19 형식 설명 및 예시를 API 문서 상단에 기재
- [ ] **DOC-05**: `skills/*.skill.md` 파일에 CAIP-2/19 사용법 추가
- [ ] **DOC-06**: 네트워크 지정 예시에 CAIP-2 형식 병기
- [ ] **DOC-07**: 토큰 전송 예시에 `assetId` 단독 사용 패턴 추가

### Test

- [ ] **TST-01**: `normalizeNetworkInput` CAIP-2 변환 테스트 — 15개 네트워크 매핑 전수 검증
- [ ] **TST-02**: CAIP-2 + plain string + legacy 혼용 입력 테스트 (우선순위 검증)
- [ ] **TST-03**: `TokenInfo` assetId-only 입력 → 레지스트리 resolve 테스트
- [ ] **TST-04**: `assetId`에서 네트워크 자동 추론 테스트
- [ ] **TST-05**: `assetId` vs `network` 불일치 validation error 테스트
- [ ] **TST-06**: 미등록 assetId + address/decimals/symbol 폴백 테스트
- [ ] **TST-07**: 모든 응답 스키마에 `chainId`/`assetId` 포함 검증 테스트
- [ ] **TST-08**: SDK CAIP-2 네트워크 입력 테스트
- [ ] **TST-09**: MCP 도구 CAIP-2 네트워크 입력 + assetId 단독 전달 테스트
- [ ] **TST-10**: `resolve_asset` MCP 도구 테스트

## Future Requirements

### CAIP Extended

- **CAIP-EXT-01**: CAIP-10 (Account ID) 도입 — 계정 식별 표준
- **CAIP-EXT-02**: CAIP-25 (Session Namespace) — WalletConnect 세션 범위 정의
- **CAIP-EXT-03**: DB 네트워크 컬럼 CAIP-2 마이그레이션 (대규모 변경)
- **CAIP-EXT-04**: on-chain 토큰 메타데이터 자동 조회 (RPC 지연/실패 가능성)

## Out of Scope

| Feature | Reason |
|---------|--------|
| DB 스키마 변경 (network 컬럼 → CAIP-2) | 대규모 마이그레이션 — 입출력 변환 레이어에서 처리 |
| on-chain 토큰 메타데이터 조회 | RPC 지연 + 실패 가능성 — 레지스트리 미등록 시 decimals/symbol 필수 요구 |
| CAIP-10 (Account ID) | 계정 식별 표준이나 현재 walletId 체계와 중복 |
| CAIP-25 (Session Namespace) | WalletConnect 세션 범위 정의 — 현재 세션 모델과 상이 |
| plain string deprecation | 하위 호환 영구 유지 목표 — 둘 다 지원 |
| 기존 DB 레코드 assetId 백필 | 런타임 동적 생성으로 해결 |
| 알림 이벤트 payload CAIP 변환 | 내부 소비 전용 — 소비자 측에서 필요 시 수행 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated during roadmap creation) | | |

**Coverage:**
- v31.16 requirements: 43 total
- Mapped to phases: 0
- Unmapped: 43

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after initial definition*
