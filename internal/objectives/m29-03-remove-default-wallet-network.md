# 마일스톤 m29-03: 기본 지갑/기본 네트워크 개념 제거

- **Status:** IN_PROGRESS
- **Milestone:** v29.3

## 목표

"기본 지갑(default wallet)"과 "기본 네트워크(default network)" 개념을 제거하여, 에이전트가 항상 명시적으로 대상 지갑과 네트워크를 지정하도록 강제한다. 암묵적 기본값으로 인해 트랜잭션이 의도하지 않은 네트워크에서 실행되는 문제를 근본적으로 해결한다.

---

## 배경

현재 시스템은 3단계 우선순위로 지갑과 네트워크를 해석한다:

```
지갑: body.walletId → query.walletId → JWT.wlt (기본 지갑)
네트워크: request.network → wallet.defaultNetwork → getDefaultNetwork(chain, env)
```

이 구조에서 에이전트가 `walletId`나 `network`를 생략하면 암묵적 기본값으로 폴백되어, **조회 컨텍스트와 실행 컨텍스트가 분리되는 문제**가 발생한다.

### 실제 사례

1. 에이전트가 `GET /v1/wallet/assets?network=base-mainnet`으로 Base 네트워크 잔고를 확인 (0.03 ETH)
2. `POST /v1/actions/lifi/cross_swap`에 `network` 필드 없이 스왑 요청
3. 폴백으로 `wallet.defaultNetwork`(null) → `getDefaultNetwork('ethereum', 'mainnet')` → **ethereum-mainnet**에서 실행
4. Base가 아닌 Ethereum Mainnet에서 트랜잭션 실행 → 실패

이는 에이전트의 실수가 아니라, 암묵적 기본값이 존재하는 API 설계의 문제다.

### 변경 원칙

| 현재 (암묵적 기본값) | 변경 후 (명시적 지정) |
|---|---|
| 세션에 기본 지갑이 항상 1개 (is_default) | 지갑 1개면 자동 해석, 2개 이상이면 `walletId` **필수** |
| 지갑에 defaultNetwork 설정 | `network` 파라미터 **필수** (단일 네트워크 체인은 자동 해석) |
| JWT에 `wlt` claim 포함 | JWT에서 `wlt` claim 제거 |
| PATCH 기본 지갑 변경 API | **엔드포인트 삭제** |
| PUT 기본 네트워크 변경 API | **엔드포인트 삭제** |

---

## 구현 대상

### DB 마이그레이션

| 대상 | 변경 내용 |
|------|----------|
| `session_wallets` 테이블 | `is_default` 컬럼 삭제 |
| `wallets` 테이블 | `default_network` 컬럼 삭제 |
| CHECK 제약 | `default_network` 관련 CHECK 제약 삭제 |

### JWT / 인증

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` | `JwtPayload.wlt` claim 제거 |
| `packages/daemon/src/api/middleware/session-auth.ts` | `defaultWalletId` 컨텍스트 설정 제거 |
| `packages/daemon/src/api/routes/sessions.ts` | 세션 생성/갱신 시 `defaultWalletId` 로직 제거, `PATCH /sessions/:id/wallets/:walletId/default` 엔드포인트 삭제 |

### 인증 미들웨어 / Telegram

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/api/middleware/owner-auth.ts` (L71) | `c.get('defaultWalletId')` 사용하여 지갑 해석 — `defaultWalletId` 컨텍스트 제거 후 대체 로직 필요 |
| `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` (L757, L782) | JWT `wlt: walletId` 구성(L757) + raw SQL `is_default = 1` INSERT(L782) — 기본 지갑 개념 제거에 따라 `wlt` claim 제거 및 `is_default` 컬럼 INSERT 제거. **대체 동작**: Telegram은 단일 지갑 세션을 생성하므로, `resolveWalletId`의 "세션 지갑 1개 → 자동 해석" 규칙에 의해 기존과 동일하게 동작 |

### 해석 로직 변경

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/api/helpers/resolve-wallet-id.ts` | Priority 3 (JWT 기본 지갑) 제거. 세션에 지갑 1개면 자동 해석, 2개 이상이면 `WALLET_ID_REQUIRED` 에러 |
| `packages/daemon/src/pipeline/network-resolver.ts` | Priority 2 (wallet.defaultNetwork) 제거. 체인+환경에 네트워크 1개면 자동 해석(Solana), 다수면 `NETWORK_REQUIRED` 에러 |
| `packages/core/src/enums/chain.ts` (`getDefaultNetwork`) | **함수명 `getSingleNetwork`로 변경**, 반환 타입 `NetworkType \| null`로 변경. 단일 네트워크 체인(Solana)은 네트워크 반환, 다수 네트워크 체인(EVM)은 `null` 반환. `ENVIRONMENT_DEFAULT_NETWORK` 상수도 `ENVIRONMENT_SINGLE_NETWORK`로 변경하고 EVM 항목 제거 |

### 네트워크 자동 해석 규칙 (environment 유지)

| 체인 | 환경 | 가능한 네트워크 | 동작 |
|------|------|----------------|------|
| Solana | mainnet | solana-mainnet (1개) | 자동 해석 |
| Solana | testnet | solana-devnet (1개) | 자동 해석 |
| EVM | mainnet | ethereum/polygon/base/arbitrum 등 다수 | `NETWORK_REQUIRED` 에러 |
| EVM | testnet | sepolia/base-sepolia 등 다수 | `NETWORK_REQUIRED` 에러 |

### API 엔드포인트

| 변경 유형 | 대상 | 내용 |
|----------|------|------|
| 삭제 | `PATCH /v1/sessions/:id/wallets/:walletId/default` | 기본 지갑 변경 엔드포인트 |
| 삭제 | `PUT /v1/wallets/:id/default-network` | 기본 네트워크 변경 엔드포인트 (owner-scoped) |
| 삭제 | `PUT /v1/wallet/default-network` | 기본 네트워크 변경 엔드포인트 (session-scoped, `wallet.ts`) |
| 수정 | `POST /v1/sessions` | `defaultWalletId` 파라미터 제거 |
| 수정 | `GET /v1/wallets/:id/networks` | 응답에서 `isDefault` 필드 제거 |
| 수정 | `GET /v1/wallets/:id` | 응답에서 `defaultNetwork` 필드 제거 |
| 수정 | `GET /v1/connect-info` | 응답에서 `defaultNetwork`, `isDefault` 필드 제거 |

### MCP 도구

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/mcp/src/tools/set-default-network.ts` | **도구 파일 삭제** — PUT 엔드포인트 삭제에 따라 MCP 도구도 삭제 |
| `packages/mcp/src/server.ts` (L28, L85) | `registerSetDefaultNetwork` import + registration 삭제 — 도구 파일 삭제에 따라 서버 등록도 제거 |
| `packages/mcp/src/tools/*.ts` (25개 파일) | `wallet_id` description에서 "Omit to use the default wallet" 문구 제거. 세션 지갑 1개일 때만 optional, 다수면 필수로 설명 업데이트 |
| `packages/mcp/src/tools/action-provider.ts` | `network` description에서 "Defaults to wallet default network" 문구 제거 |

### Admin UI

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/admin/src/pages/wallets.tsx` | "Default Network" 표시(line 701), "Set as Default" 버튼(line 794), 기본 네트워크 하이라이팅, `handleChangeDefaultNetwork` 함수, `defaultNetworkLoading` signal, `evm_default_network` 설정 폼(line 1897) 제거 |
| `packages/admin/src/pages/sessions.tsx` | 세션 생성 시 `defaultWalletId` 선택 라디오 UI(line 609-610) + `createDefaultWalletId` 로직(line 347-348) 제거 |
| `packages/admin/src/pages/settings.tsx` | `rpc.evm_default_network` 설정 폼 필드(line 528-534) 제거 |
| `packages/admin/src/utils/settings-helpers.ts` | `evm_default_network: 'Default EVM Network'` 라벨(line 92) 삭제 |
| `packages/admin/src/utils/settings-search-index.ts` | `rpc.evm_default_network` 검색 인덱스 항목(line 35) 삭제 |
| `packages/admin/src/api/endpoints.ts` | `WALLET_DEFAULT_NETWORK` 엔드포인트 상수(line 23) 삭제 |

### Admin Settings 세부 삭제 대상

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | `rpc.evm_default_network` 키 등록 삭제 |
| `packages/daemon/src/infrastructure/config/loader.ts` | `evm_default_network` 스키마 필드 삭제 |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | `evm_default_network` 특수 skip 로직 (line 590) 삭제 |

### SDK 패키지 (`packages/sdk`)

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/sdk/src/types.ts:195` | `CreateSessionParams.defaultWalletId` 필드 제거 |
| `packages/sdk/src/types.ts:243` | `ConnectInfoWallet.defaultNetwork` 필드 제거 (`WalletNetworkInfo.isDefault` 필드도 제거) |
| `packages/sdk/src/types.ts:403` | `SetDefaultNetworkResponse` 인터페이스 삭제 (`defaultNetwork` / `previousNetwork` 필드 포함) |
| `packages/sdk/src/client.ts:290` | 세션 생성 시 `defaultWalletId` 전송 로직 제거 |
| `packages/sdk/src/client.ts` | `setDefaultNetwork()` 메서드 삭제 (PUT 엔드포인트 삭제에 따라) |

### CLI 패키지 (`packages/cli`)

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/cli/src/commands/wallet.ts` | `set-default-network` 서브커맨드 삭제, `defaultNetwork` 표시(line 256) 제거 |
| `packages/cli/src/commands/quickstart.ts` | `defaultNetwork` 타입 정의(line 32, 106, 123, 144) + 표시 로직(line 171, 219-220) + `defaultWallet` 참조(line 228, 234-235) 제거/수정 |

### Python SDK (`python-sdk`)

| 대상 파일 | 변경 내용 |
|----------|----------|
| `python-sdk/waiaas/models.py` | `is_default`, `default_network`, `isDefault` 필드(line 65, 83, 403, 405) 제거 |
| `python-sdk/waiaas/client.py` | `set_default_network()` 메서드(line 239-246) 삭제 |

### Skill 파일

| 대상 | 변경 내용 |
|------|----------|
| `skills/wallet.skill.md` | default network 관련 문구 제거/수정 (`PUT /v1/wallet/default-network`, `set_default_network` MCP 도구, SDK/CLI 섹션) |
| `skills/transactions.skill.md` | network 명시 필수 안내 추가, "defaults to wallet's default network" 문구 제거 |
| `skills/quickstart.skill.md` | "wallet's default network" 참조(line 127, 165, 191, 241) 제거/수정 |
| `skills/admin.skill.md` | `rpc.evm_default_network` 설정 문서(line 409, 470, 550) 제거 |

### 스키마/타입

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/core/src/schemas/session.schema.ts` | `CreateSessionRequestSchema`의 `defaultWalletId` 필드 제거 (SessionSchema가 아닌 요청 스키마에 위치) |
| `packages/core/src/schemas/wallet.schema.ts:14` | `WalletSchema.defaultNetwork` 필드 제거 (`defaultNetwork: NetworkTypeEnum.nullable()`) |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | `defaultNetwork`, `isDefault` 관련 스키마 필드 제거, `UpdateDefaultNetworkRequestSchema` / `UpdateDefaultNetworkResponseSchema` 삭제, `SessionDefaultWalletSchema`(L205-208) 삭제 |
| `packages/daemon/src/infrastructure/database/schema.ts` | `is_default`, `default_network` 컬럼 및 CHECK 제약 제거 |

### 에러 코드 / i18n

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/core/src/errors/error-codes.ts` | `WALLET_ID_REQUIRED`, `NETWORK_REQUIRED` 에러 코드 신규 추가. `CANNOT_REMOVE_DEFAULT_WALLET` 에러 코드 삭제 (기본 지갑 개념 제거에 따라 불필요) |
| `packages/core/src/i18n/en.ts` | 신규 에러 코드 메시지 추가, `CANNOT_REMOVE_DEFAULT_WALLET` 메시지 삭제, 기존 default wallet/network 관련 메시지 제거/수정 |
| `packages/core/src/i18n/ko.ts` | `CANNOT_REMOVE_DEFAULT_WALLET` 한국어 메시지 삭제, 신규 에러 코드 한국어 메시지 추가 |

### 파이프라인 / 인프라

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/lifecycle/daemon.ts` | 재진입 시 `getDefaultNetwork()` 폴백 제거(line 1650, 1749). `tx.network`이 null이면 에러 (레거시 트랜잭션 마이그레이션 시 network 채워야 함). `defaultNetwork: wallet.defaultNetwork` 컨텍스트 구성(line 1677, 1775) 제거 |
| `packages/daemon/src/pipeline/stages.ts` | `PipelineContext.wallet.defaultNetwork` 타입 필드(line 71) 제거 |
| `packages/daemon/src/pipeline/pipeline.ts` | `wallet.defaultNetwork` 참조(line 68, 71, 84) 제거 |
| `packages/daemon/src/notifications/notification-service.ts` | DB 쿼리의 `defaultNetwork` 셀렉트(line 286) + 알림 네트워크 폴백(line 296) 제거. **대체 동작**: `lookupWallet` 반환의 `network` 필드를 `row.chain`으로 변경. 실제 알림에서는 `vars.network`(트랜잭션 네트워크)가 항상 우선 사용되므로(`effectiveNetwork = vars?.network \|\| walletInfo.network`), 트랜잭션 알림의 explorer URL은 정확함. 비트랜잭션 알림에서는 `chain` 값을 컨텍스트 라벨로 사용 |
| `packages/daemon/src/infrastructure/adapter-pool.ts` | `evm_default_network` skip 로직(line 58, 63) 제거 |
| `packages/daemon/src/services/monitoring/balance-monitor-service.ts` | `default_network` SQL 셀렉트 + `wallet.default_network ?? getDefaultNetwork()` 폴백 로직 제거. **대체 동작**: `getNetworksForEnvironment(chain, env)`로 전체 네트워크 목록을 가져와 순회하며 잔액 체크 (IncomingTxMonitor와 동일 패턴). Solana 지갑은 1개 네트워크, EVM 지갑은 RPC가 설정된 전체 네트워크 체크 |
| `packages/actions/src/index.ts` | `rpc.evm_default_network` 세팅 참조 제거 |

### API 라우트 (`defaultNetwork` / `isDefault` 참조 제거)

| 대상 파일 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/api/routes/wallet.ts` | `PUT /wallet/default-network` 세션 스코프 핸들러 삭제, 잔고 조회 시 `wallet.defaultNetwork!` 폴백(line 344, 390, 549) 제거, 지갑 생성 시 `getDefaultNetwork()` 초기값 설정(line 419, 429, 441) 제거 |
| `packages/daemon/src/api/routes/wallets.ts` | `PUT /wallets/:id/default-network` owner 스코프 핸들러 삭제, `defaultNetwork` 필드 참조 제거, JWT `wlt: id` 구성(L460) 제거, `isDefault` cascade defense 로직(L645-684) 재설계 — is_default 컬럼 삭제에 따라 기본 지갑 전환 로직 불필요 |
| `packages/daemon/src/api/routes/connect-info.ts` | `defaultNetwork` 타입(line 63), AI 프롬프트 `defaultNetwork` 폴백(line 101, 114, 124), `defaultWalletId` 컨텍스트 조회(line 179, 205), 응답의 `defaultNetwork`/`isDefault` 필드(line 291, 326-328) 제거 |
| `packages/daemon/src/api/routes/wc.ts` | raw SQL `SELECT ... default_network` 직접 참조(line 209-210, 225) + `wallet.default_network ?? wallet.environment` 폴백(line 339-340, 359) 제거. **대체 동작**: WC 페어링 API에 `network` 파라미터 추가. Solana 지갑은 `getSingleNetwork()`로 자동 해석. EVM 지갑은 요청에서 `network` 필수 — WC dApp의 세션 제안 namespace(`eip155:1`, `eip155:8453` 등)에서 네트워크를 파싱하여 전달 |
| `packages/daemon/src/api/routes/admin.ts` | `defaultNetwork` 잔고 정렬/표시(line 1906-1907, 1940), 지갑 목록 `defaultNetwork` 필드(line 2373, 2511), 세션 생성 시 `isDefault: i === 0`(line 2475) + `wlt: defaultWalletId` JWT 구성(line 2637-2643) 제거 |
| `packages/daemon/src/api/routes/mcp.ts` | MCP 세션 생성 시 `isDefault: true` 세팅(line 168) 제거 |
| `packages/daemon/src/api/routes/transactions.ts` | `wallet.defaultNetwork` 네트워크 해석(line 312, 317, 361, 456) 제거 |
| `packages/daemon/src/api/routes/actions.ts` | `wallet.defaultNetwork` 네트워크 해석(line 295, 300, 332) 제거 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 단일 지갑 세션에서 walletId 생략 | 허용 (자동 해석) | 세션에 지갑이 1개뿐이면 모호함이 없으므로 DX를 위해 자동 해석. 2개 이상일 때만 명시 강제 |
| 2 | 단일 네트워크 체인에서 network 생략 | 허용 (Solana 등) | Solana는 환경당 네트워크가 1개뿐(mainnet→solana-mainnet, testnet→solana-devnet)이므로 자동 해석. EVM은 다수이므로 필수 |
| 3 | 에러 코드 | `WALLET_ID_REQUIRED` / `NETWORK_REQUIRED` 신규 추가 | 기존 `VALIDATION_ERROR`와 구분하여 에이전트가 누락된 필드를 명확히 인지하도록 전용 에러 코드 사용 |
| 4 | JWT 축소 | `wlt` claim 제거 | 기본 지갑 개념 제거에 따라 JWT에 지갑 ID를 포함할 이유가 없음. 토큰 크기 절감 + JWT 갱신 시 기본 지갑 재조회 로직 제거 |
| 5 | 하위 호환성 | 마이그레이션으로 컬럼 삭제, Breaking Change | 기본 지갑/네트워크는 내부 편의 기능이므로, 호환 레이어 없이 깔끔하게 제거. API 삭제 + 필수 파라미터 추가는 Breaking Change이나, 현재 pre-release (v2.x RC) 단계이므로 Semver minor bump로 처리 |
| 6 | environment 유지 | mainnet/testnet 구분 유지 | environment는 보안 경계(테스트넷 자산 vs 메인넷 자산)이므로 제거 대상이 아님. 네트워크 검증(chain-network, environment-network)은 그대로 유지 |
| 7 | getDefaultNetwork 함수 | `getSingleNetwork`로 리네임 + 반환 타입 `NetworkType \| null` | 함수명이 "기본값"이 아닌 "유일한 네트워크"를 표현하도록 변경. EVM은 `null` 반환 → 호출부에서 `NETWORK_REQUIRED` 에러. `ENVIRONMENT_DEFAULT_NETWORK` 상수도 `ENVIRONMENT_SINGLE_NETWORK`로 변경 |
| 8 | BalanceMonitor 네트워크 | 전체 네트워크 순회 | 단일 네트워크 fallback 대신 `getNetworksForEnvironment()`로 wallet의 chain+env 전체 네트워크 잔액 체크. IncomingTxMonitor와 동일 패턴 적용 |
| 9 | WalletConnect 페어링 네트워크 | 요청 파라미터 필수화 | WC 페어링 시 네트워크를 wallet 기본값에서 가져오지 않고, 요청에서 명시. Solana는 자동 해석, EVM은 필수 |
| 10 | IncomingTxMonitor | 영향 없음 | 이미 `getNetworksForEnvironment()`로 전체 네트워크 구독 중. `default_network` 미참조 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 지갑 해석

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 세션에 지갑 1개 + walletId 생략 → 자동 해석 | POST /v1/transactions/send (walletId 없음) → 유일한 지갑으로 실행 assert | [L0] |
| 2 | 세션에 지갑 2개 + walletId 생략 → WALLET_ID_REQUIRED | POST /v1/transactions/send (walletId 없음) → 422 WALLET_ID_REQUIRED assert | [L0] |
| 3 | 세션에 지갑 2개 + walletId 명시 → 정상 | POST /v1/transactions/send (walletId: 지갑B) → 지갑B로 실행 assert | [L0] |
| 4 | 세션에 없는 walletId → WALLET_ACCESS_DENIED | POST (walletId: 미연결 지갑) → 403 assert | [L0] |

### 네트워크 해석

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | Solana 지갑 + network 생략 → 자동 해석 | POST /v1/transactions/send (Solana, network 없음) → solana-mainnet 사용 assert | [L0] |
| 6 | EVM 지갑 + network 생략 → NETWORK_REQUIRED | POST /v1/transactions/send (EVM, network 없음) → 422 NETWORK_REQUIRED assert | [L0] |
| 7 | EVM 지갑 + network 명시 → 정상 | POST (network: 'base-mainnet') → base-mainnet에서 실행 assert | [L0] |
| 8 | 환경 불일치 → ENVIRONMENT_NETWORK_MISMATCH | POST (testnet 지갑, network: 'ethereum-mainnet') → 에러 assert | [L0] |

### 삭제된 엔드포인트

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | PATCH 기본 지갑 변경 → 404 | PATCH /v1/sessions/:id/wallets/:wid/default → 404 assert | [L0] |
| 10 | PUT 기본 네트워크 → 404 | PUT /v1/wallets/:id/default-network → 404 assert | [L0] |

### JWT 변경

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | 신규 세션 JWT에 wlt claim 없음 | POST /v1/sessions → JWT 디코딩 → wlt 필드 없음 assert | [L0] |
| 12 | 세션 갱신 JWT에 wlt claim 없음 | PUT /v1/sessions/:id/renew → JWT 디코딩 → wlt 필드 없음 assert | [L0] |

### MCP 도구

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | MCP get_balance + 멀티 지갑 세션 + wallet_id 생략 → 에러 | MCP 호출 → WALLET_ID_REQUIRED 에러 반환 assert | [L0] |
| 14 | MCP action + EVM + network 생략 → 에러 | MCP action 호출 → NETWORK_REQUIRED 에러 반환 assert | [L0] |

### connect-info

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 15 | connect-info 응답에 defaultNetwork/isDefault 없음 | GET /v1/connect-info → 응답에 defaultNetwork, isDefault 필드 없음 assert | [L0] |

### SDK / CLI

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 16 | SDK createSession에 defaultWalletId 미지원 | `WAIaaSClient.createSession({ walletId })` → 요청 body에 defaultWalletId 필드 없음 assert | [L0] |
| 17 | SDK setDefaultNetwork 메서드 삭제 | `WAIaaSClient` 인스턴스에 `setDefaultNetwork` 메서드 없음 assert (타입 레벨) | [L0] |
| 18 | CLI wallet set-default-network 삭제 | `waiaas wallet set-default-network` 실행 → 알 수 없는 커맨드 에러 assert | [L1] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v26.4 (멀티 지갑 세션) | session_wallets 테이블 + resolveWalletId 도입한 마일스톤 |
| v1.4.6 (멀티체인 월렛) | defaultNetwork, network-resolver 도입한 마일스톤 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Breaking API 변경 | 기존 클라이언트가 walletId/network 없이 요청하면 에러 발생 | 에러 메시지에 필요한 필드를 명확히 안내 (어떤 walletId 선택 가능한지, 어떤 network가 유효한지 목록 포함) |
| 2 | MCP 에이전트 혼란 | 기존 MCP 도구 description 변경으로 에이전트 동작 변화 | Skill 파일과 MCP description에 명시적 지정 가이드 추가. connect-info에서 세션 지갑 목록과 가용 네트워크 제공 |
| 3 | JWT 하위 호환 | 마이그레이션 중 기존 JWT 토큰에 wlt claim이 있음 | session-auth 미들웨어에서 wlt claim 무시 처리 (있어도 에러 안 냄). 기존 토큰 만료 시 자연 전환 |
| 4 | Admin UI 기능 축소 | 기본 네트워크 설정 UI 제거 | 사용자에게 트랜잭션 시 네트워크 명시 필요성 안내. Admin UI에서 지갑별 사용 가능 네트워크 목록은 유지 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (DB 마이그레이션 + Core 스키마/에러 1 / 해석 로직 + JWT/API + 파이프라인 + 라우트 1 / SDK + CLI + Python SDK + MCP + Admin UI + Skills 1 / 테스트 정리 1) |
| 신규/수정 파일 | 90-110개 (소스 35-45 + 테스트 55-65) |
| 테스트 | 15-20개 (신규) + 70+개 (기존 수정). 주요 영향: `core/__tests__/schemas.test.ts`(L130,141,152), `sdk/__tests__/client.test.ts`(L1101,1102,1114,1162) |
| DB 마이그레이션 | is_default 컬럼 삭제, default_network 컬럼 삭제 |

---

*생성일: 2026-02-27*
*검증일: 2026-02-27 — 코드베이스 대조 검증 완료 (25/25 항목 일치 + 15개 누락 대상 보완)*
*2차 검증: 2026-02-27 — 누락 대상 4건 보완 (balance-monitor-service.ts, actions/index.ts, i18n/ko.ts, wallets.ts owner-scoped) + MCP 도구 수 23→25 정정*
*3차 검증: 2026-02-27 — 누락 대상 6건 보완 (mcp/server.ts, owner-auth.ts, telegram-bot-service.ts, wallets.ts L460/L645-684, openapi-schemas.ts SessionDefaultWalletSchema) + 라인 번호 3건 수정 (wallets.tsx L798→L794, sessions.tsx L608→L609, sdk/types.ts 타입명 UpdateDefaultNetworkResult→SetDefaultNetworkResponse) + 테스트 파일 영향 명시*
*4차 검증: 2026-02-27 — 미결 사항 8건 보완: Milestone v29.3 확정, getDefaultNetwork→getSingleNetwork 확정, IncomingTxMonitor 영향 없음 확인(getNetworksForEnvironment 사용), BalanceMonitor/NotificationService/WalletConnect/Telegram 대체 동작 명시, 기술 결정 #8-#10 추가*
*선행: v26.4 (멀티 지갑 세션), v1.4.6 (멀티체인 월렛)*
*관련: resolve-wallet-id.ts, network-resolver.ts, session-auth.ts, sdk/client.ts, cli/wallet.ts, admin/sessions.tsx, connect-info.ts, wc.ts, admin.ts, wallets.ts, transactions.ts, actions.ts, balance-monitor-service.ts, python-sdk/*
