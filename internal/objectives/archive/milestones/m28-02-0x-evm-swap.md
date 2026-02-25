# 마일스톤 m28-02: 0x EVM DEX Swap

- **Status:** SHIPPED
- **Milestone:** v28.2
- **Completed:** 2026-02-24

## 목표

v1.5 Action Provider 프레임워크 위에 0x Swap API를 ActionProvider로 구현하여, AI 에이전트가 EVM 체인(Ethereum, Base, Arbitrum 등)에서 토큰 스왑을 정책 평가 하에 실행할 수 있는 상태.

---

## 배경

m28-01에서 Jupiter(Solana DEX)가 첫 번째 ActionProvider로 구현된다. m28-02는 **동일한 REST API -> calldata 패턴**을 EVM 체인에 적용하여, WAIaaS가 Solana와 EVM 양쪽에서 DEX 스왑을 지원하는 상태를 만든다.

0x Swap API는 20개 EVM 체인을 지원하는 기관급 DEX 애그리게이터로, 100+ 유동성 소스(Uniswap, Curve, Sushiswap 등)를 집계하여 최적 경로를 계산한다. REST API가 calldata를 직접 반환하므로 Jupiter와 거의 동일한 통합 패턴으로 구현 가능하다.

### Jupiter vs 0x 패턴 비교

```
Jupiter (Solana):
  POST /swap/v1/quote → 견적 → POST /swap-instructions → instruction → ContractCallRequest

0x (EVM):
  GET /swap/allowance-holder/price → 견적 → GET /swap/allowance-holder/quote → calldata → ContractCallRequest
```

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| ZeroExSwapActionProvider | IActionProvider 구현체. 0x Swap API v2 호출(AllowanceHolder 기반). resolve() -> ContractCallRequest[](단일 또는 [approve, swap] 배열). `actionProvider: '0x_swap'` 태깅 자동 적용. 지원 체인: Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche 등 20개 체인 |
| ZeroExApiClient | 0x REST API 래퍼. 단일 base URL `https://api.0x.org` + `chainId` 쿼리 파라미터로 체인 선택. `/swap/allowance-holder/price`(견적 조회), `/swap/allowance-holder/quote`(실행용 calldata). 필수 헤더: `0x-api-key`(인증) + `0x-version: v2`(API 버전). 요청 타임아웃 10초(AbortController). 응답 Zod 스키마 검증. `liquidityAvailable=false`일 때 조기 반환 처리 |
| 슬리피지 제어 | 기본 0.01(1%), 상한 0.05(5%). Admin Settings > Actions 페이지에서 오버라이드. 0x API의 `slippagePercentage` 파라미터에 매핑. pct 단위 사용 (API 네이티브) |
| AllowanceHolder 토큰 승인 | ERC-20 토큰 스왑 시 AllowanceHolder 컨트랙트에 standard ERC-20 approve 필요. resolve()가 allowance 부족 시 `[approveRequest, swapRequest]` 배열을 반환하고, actions route handler가 순차적으로 파이프라인에 투입 (각각 6-stage 풀 파이프라인 통과). 중간 실패 시 나머지 미실행. ETH(네이티브) 스왑은 `[swapRequest]` 단일 반환. EIP-712 서명 불필요 (standard approve만 사용) |
| MCP 도구 | action_0x_swap_swap — ActionDefinition -> MCP Tool 자동 매핑(v1.5 프레임워크 활용, `action_{provider}_{action}` 네이밍) |
| SDK `executeAction()` 메서드 추가 | TS SDK(`packages/sdk/src/client.ts`) `client.executeAction(provider, action, params)` + Python SDK(`python-sdk/waiaas/`) `await client.execute_action(provider, action, params)` 메서드 신규 구현. 현재 두 SDK 모두 `executeAction` 미구현 상태이므로 m28-02에서 추가. 내부적으로 `POST /v1/actions/{provider}/{action}` 호출. 기존 `sendToken()` 패턴 동일 |
| #158 Admin UI Actions 페이지 + 기본 활성화 | m28-02에서 동시 구현. (1) `registerBuiltInProviders()` 기본 활성화 로직 변경: `if (cfg?.enabled)` → `if (cfg?.enabled !== false)` (undefined일 때 기본 활성화). (2) **config.toml `[actions]` 섹션 폐지** — Jupiter 포함 모든 빌트인 프로바이더 설정을 Admin Settings `actions` 카테고리로 단일 관리. config loader에서 기존 jupiter 관련 config 키 제거. (3) SettingsService에 `actions` 카테고리 + 프로바이더별 설정 키 등록 (Jupiter 기존 설정도 이관). (4) Admin UI Actions 페이지 신설 (프로바이더 목록, 활성화 토글, API 키 관리). (5) `ACTION_API_KEY_REQUIRED` 알림 이벤트 타입 추가 (`NOTIFICATION_EVENT_TYPES` 30→31개) + i18n 템플릿(en/ko) + `adminUrl` 필드. (6) actions route에서 API 키 미설정 시 에러 응답 + 알림 이벤트 동시 발송 |

### 입력 스키마

```typescript
const ZeroExSwapInputSchema = z.object({
  sellToken: z.string(),       // 판매 토큰 주소 (0x...)
  buyToken: z.string(),        // 구매 토큰 주소 (0x...)
  sellAmount: z.string(),      // 판매 수량 (smallest unit)
  slippagePercentage: z.number().optional(), // 슬리피지 (0.01 = 1%)
  chain: z.string().optional(), // 체인 (기본: 월렛 체인)
});
```

### 파일/모듈 구조

```
packages/actions/src/
  providers/
    0x-swap/
      index.ts                   # ZeroExSwapActionProvider
      0x-api-client.ts           # 0x REST API 래퍼
      schemas.ts                 # ZeroExSwapInputSchema, PriceResponse, QuoteResponse Zod 스키마
      config.ts                  # ZeroExSwapConfig 타입 + 기본값
      allowance-holder.ts        # AllowanceHolder approve 헬퍼
  index.ts                       # 내장 프로바이더 export (jupiter_swap, 0x_swap)
```

### Admin Settings (Actions 페이지)

빌트인 프로바이더는 기본 활성화 상태. Admin UI > Actions 페이지에서 런타임 설정 변경 가능 (#158). API 키 미설정 시 `ACTION_API_KEY_REQUIRED` 알림 이벤트 발송 (신규 이벤트 타입 추가 필요 — 현재 NOTIFICATION_EVENT_TYPES 30개에 포함되어 있지 않으므로 m28-02에서 추가).

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `0x_swap.enabled` | `true` | 프로바이더 활성화 |
| `0x_swap.api_key` | `""` | 0x API 키 (필수 — 미설정 시 알림) |
| `0x_swap.api_base_url` | `"https://api.0x.org"` | API base URL |
| `0x_swap.default_slippage_pct` | `0.01` | 기본 슬리피지 (1%) |
| `0x_swap.max_slippage_pct` | `0.05` | 최대 슬리피지 (5%) |

### REST API

기존 POST /v1/actions/:provider/:action 엔드포인트 재사용:

```
POST /v1/actions/0x_swap/swap
Body: { sellToken, buyToken, sellAmount, slippagePercentage?, chain? }
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 0x API 버전 | Swap API v2 (AllowanceHolder 기반) | 최신 버전. AllowanceHolder로 standard ERC-20 approve 사용 -- 서버사이드에 최적. EIP-712 서명 불필요, 낮은 가스비, 단순한 구현. Research에서 AllowanceHolder가 서버사이드 환경에 적합하다고 확인됨 (0x 공식 권장) |
| 2 | API 키 정책 | 필수 (Admin Settings) | 0x API는 API 키가 필수. Admin Settings > Actions 페이지에서 설정. 미설정 시 ACTION_API_KEY_REQUIRED 알림 발송 (#158). 무료 플랜(제한적 rate limit) + 유료 플랜 모두 동일 키 필드 사용 |
| 3 | 체인 라우팅 | 단일 base URL + chainId 쿼리 파라미터 | 0x API v2는 단일 URL `https://api.0x.org`에 `chainId` 쿼리 파라미터로 체인 선택 (v1의 체인별 URL 분기 방식은 폐지됨). 월렛의 chain 속성에서 chainId를 자동 매핑 |
| 4 | AllowanceHolder approve 처리 | standard ERC-20 approve + swap 순차 실행 | ERC-20 첫 스왑 시 AllowanceHolder 컨트랙트에 standard approve를 별도 APPROVE 파이프라인으로 선행. approve 완료 후 swap 실행. ETH 네이티브 스왑은 승인 자체 불필요. EIP-712 서명 불필요 (Permit2 대비 복잡도 대폭 감소) |
| 5 | 1inch 대비 0x 선택 근거 | 0x | 체인 커버리지(20 vs 9+), 기관급 API 안정성, AllowanceHolder 기반 서버사이드 최적화. 1inch Fusion(gasless)은 향후 별도 ActionProvider로 추가 가능 |
| 6 | 빌트인 프로바이더 설정 관리 | Admin Settings 단일 관리 (config.toml 폐지) | Jupiter 포함 모든 빌트인 프로바이더 설정을 Admin Settings `actions` 카테고리에서 단일 관리. config.toml `[actions]` 섹션 폐지. `registerBuiltInProviders()`가 SettingsService에서 설정을 직접 읽음. 데몬 재시작 없이 프로바이더 활성화/비활성화, API 키 교체, 슬리피지 조정 가능 |
| 7 | 동적 컨트랙트 주소 정책 처리 | Provider-trust 모델 | ContractCallRequest에 `actionProvider?: string` 옵션 필드 추가. 등록+활성화된 프로바이더가 resolve()한 결과에 자동 태깅. Policy Stage 3에서 `actionProvider` 태그가 있고 해당 프로바이더가 활성화 상태이면 CONTRACT_WHITELIST 검사 skip. 0x API v2가 체인/거래마다 다른 settler 주소를 반환하므로 정적 번들 등록 불가. Admin이 프로바이더를 활성화하는 행위 자체가 컨트랙트 상호작용 신뢰의 명시적 opt-in. LI.FI(m28-03) 등 동적 주소 프로바이더에도 동일 패턴 적용 |
| 8 | resolve() 반환 타입 | ContractCallRequest[] 배열 | IActionProvider.resolve() 반환 타입을 `ContractCallRequest` → `ContractCallRequest[]`로 확장. 단일 항목: Jupiter `[swapReq]`, 다중 항목: 0x `[approveReq, swapReq]`. actions route handler가 배열을 순차 파이프라인 투입, 각각 6-stage 풀 통과(정책 포함). 중간 실패 시 나머지 미실행. EVM DeFi의 approve 패턴(0x, LI.FI, Lido)이 반복 출현하므로 범용 해결. AI 에이전트/SDK는 한 번 호출로 완결 |

---

## E2E 검증 시나리오

**자동화 비율: 95%+ -- `[HUMAN]` 1건 (19개 시나리오)**

### 0x Swap resolve + execute

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 0x_swap resolve -> ContractCallRequest 반환 | mock 0x /swap/allowance-holder/quote 응답 -> ZeroExSwapActionProvider.resolve() -> ContractCallRequest(to/calldata/value) 반환 assert | [L0] |
| 2 | 0x_swap execute -> 파이프라인 실행 | mock 0x API + mock EvmAdapter -> resolve() -> ContractCallRequest -> 파이프라인 실행 -> 상태 전이 assert | [L0] |
| 3 | MCP: action_0x_swap_swap 도구 자동 노출 | 0x_swap 프로바이더(mcpExpose=true) 등록 -> MCP tool 목록에 action_0x_swap_swap 포함 assert | [L0] |
| 4 | ETH -> USDC 스왑 -> 네이티브 토큰 판매 | mock quote(ETH->USDC) -> value 필드에 ETH 금액 포함 + AllowanceHolder 승인 불필요 assert | [L0] |
| 5 | USDC -> ETH 스왑 -> ERC-20 판매 + AllowanceHolder | mock quote(USDC->ETH) -> AllowanceHolder approve 트랜잭션 선행 (standard ERC-20 approve) + 스왑 트랜잭션 실행 assert | [L0] |

### 슬리피지 + 에러

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 6 | 슬리피지: 기본 1% 적용 확인 | 기본 설정 -> 0x API 호출 시 slippagePercentage=0.01 파라미터 assert | [L0] |
| 7 | 슬리피지: max 초과 요청 -> 상한 적용 | 사용자 slippagePercentage=0.1(10%) 요청 -> max 0.05(5%) 적용 assert | [L0] |
| 8 | 0x API 에러 응답 -> ACTION_API_ERROR | mock 0x API 400 에러 -> resolve() ACTION_API_ERROR 반환 assert | [L0] |
| 9 | API 키 미설정 -> 명확한 에러 + 알림 이벤트 | api_key 빈 값 -> ACTION_API_KEY_REQUIRED 에러 응답 + ACTION_API_KEY_REQUIRED 알림 이벤트 발송 + adminUrl 필드 포함 assert (#158) | [L0] |

### 정책 연동

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | Provider-trust: 활성화된 프로바이더 -> CONTRACT_WHITELIST skip | 0x_swap 프로바이더 활성화 + resolve() 결과에 `actionProvider: '0x_swap'` 태그 -> Policy Stage 3에서 CONTRACT_WHITELIST 검사 skip assert | [L0] |
| 11 | Provider-trust: 비활성화된 프로바이더 -> CONTRACT_WHITELIST 적용 | 0x_swap 프로바이더 비활성화 + 수동 ContractCallRequest(`actionProvider` 없음) -> CONTRACT_WHITELIST 검사 적용 assert | [L0] |
| 12 | 스왑 금액 USD 환산 -> SPENDING_LIMIT 정책 평가 | mock oracle + 1 ETH($3000) -> USDC 스왑 -> SPENDING_LIMIT 평가 assert | [L0] |
| 13 | resolve() 배열: approve + swap 순차 파이프라인 | mock 0x API + allowance 부족 -> resolve() [approve, swap] 반환 -> 각각 6-stage 파이프라인 순차 실행 assert | [L0] |
| 14 | resolve() 배열: approve 실패 시 swap 미실행 | mock approve 파이프라인 실패 -> swap 파이프라인 미실행 + 에러 반환 assert | [L0] |

### 멀티체인

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 15 | Ethereum 월렛 -> 0x Ethereum API 호출 | ethereum 체인 월렛 + 스왑 -> api.0x.org 호출 assert | [L0] |
| 16 | Base 월렛 -> 0x Base API 호출 | base 체인 월렛 + 스왑 -> api.0x.org (chainId=8453) 호출 assert | [L0] |

### SDK executeAction

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 17 | TS SDK executeAction 호출 | mock REST -> client.executeAction('0x_swap', 'swap', params) -> POST /v1/actions/0x_swap/swap 호출 + 응답 매핑 assert | [L0] |
| 18 | Python SDK execute_action 호출 | mock REST -> await client.execute_action('0x_swap', 'swap', params) -> 동일 엔드포인트 호출 assert | [L0] |

### 외부 API 실 호출

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 19 | 0x API 실 호출 테스트넷 검증 | Sepolia에서 0x /swap/allowance-holder/price 실 호출 -> 견적 응답 성공 확인 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m28-00 (기본 DeFi 프로토콜 설계) | DEFI-02(REST→calldata 공통 패턴), DEFI-03(정책 연동), DEFI-05(테스트 전략) 설계 산출물을 입력으로 사용 |
| v1.5 (Action Provider 프레임워크) | IActionProvider, ActionProviderRegistry, MCP Tool 자동 변환, POST /v1/actions/:provider/:action |
| m28-01 (Jupiter Swap) | 첫 번째 ActionProvider 구현으로 패턴 확립. packages/actions/ 패키지 구조, 내장 프로바이더 로딩 로직 재사용 |
| v1.4 (EVM 인프라) | EvmAdapter, ContractCallRequest(EVM: to/calldata/value), CONTRACT_WHITELIST |
| #158 (Admin UI Actions 페이지) | **m28-02에서 동시 구현.** 빌트인 프로바이더 기본 활성화 로직 변경(`cfg?.enabled` → `cfg?.enabled !== false`), Admin Settings actions 카테고리, Actions 페이지 신설, API 키 미설정 알림 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 0x API 키 필수 | Jupiter(키 선택)와 달리 0x는 API 키 필수. DX 장벽 | Admin Settings에서 키 설정 UI 제공. 무료 플랜으로 시작 가능. 키 미설정 시 명확한 안내 메시지 |
| 2 | AllowanceHolder 승인 UX | 첫 ERC-20 스왑 시 추가 트랜잭션(standard approve) 필요 | 자동으로 approve 선행 실행. 사용자에게 "첫 스왑 시 토큰 승인이 필요합니다" 알림. AllowanceHolder는 standard ERC-20 approve이므로 EIP-712 서명 불필요 |
| 3 | AllowanceHolder 주소 분기 | Cancun 호환 체인(19개)과 Mantle(Shanghai)의 AllowanceHolder 주소가 다름 | Cancun: `0x0000000000001fF3684f28c67538d4D072C22734`, Mantle: `0x0000000000005E88410CcDFaDe4a5EfaE4b49562`. chainId 기반 매핑. 미지원 체인 요청 시 명확한 에러 |
| 4 | 0x API rate limit | 무료 플랜은 rate limit 존재 | 견적 캐시(30초 TTL). 실행(quote)은 캐시 불가하므로 rate limit 도달 시 ACTION_RATE_LIMITED 에러 반환 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 (#158 Admin UI Actions 페이지 + 기본 활성화 1 / ZeroExSwapActionProvider + API Client + AllowanceHolder 1 / SDK메서드+알림이벤트+MCP+스킬+테스트 1) |
| 신규/수정 파일 | 20-28개 |
| 테스트 | 25-35개 |
| DB 마이그레이션 | 없음 |

---

*생성일: 2026-02-15*
*수정일: 2026-02-23 -- 3대 설계 결정 확정 (config.toml 폐지, Provider-trust, resolve 배열)*
*선행: m28-01 (Jupiter Swap)*
*관련: 0x Swap API v2 (https://docs.0x.org/docs/introduction/getting-started)*

---

## 변경 이력

### 2026-02-23: Permit2 -> AllowanceHolder 변경

**변경 근거:** Research에서 AllowanceHolder가 서버사이드 환경에 적합하다고 확인됨 (0x 공식 권장).

**주요 변경 사항:**
- API 엔드포인트: `/swap/permit2/*` -> `/swap/allowance-holder/*`
- 토큰 승인 방식: Permit2 (EIP-712 서명 필요) -> AllowanceHolder (standard ERC-20 approve)
- 파일 구조: `permit2.ts` -> `allowance-holder.ts`
- 기술 결정 #1: "Permit2 기반" -> "AllowanceHolder 기반"
- 기술 결정 #4: "Permit2 승인 처리" -> "AllowanceHolder approve 처리"
- EIP-712 서명 관련 내용 전면 제거

**AllowanceHolder 채택 이유 (vs Permit2):**

| 항목 | AllowanceHolder (채택) | Permit2 (미채택) |
|------|----------------------|-----------------|
| 서명 | 1회 (트랜잭션) | 2회 (EIP-712 + 트랜잭션) |
| 가스 | 낮음 | 높음 |
| 복잡도 | 낮음 (standard approve) | 높음 (EIP-712 서명 + 시그니처 조합) |
| 적합 환경 | 서버사이드 (WAIaaS) | 브라우저 지갑 |
| Race condition 리스크 | 낮음 (순차 실행) | 높음 (Pitfall P3) |

### 2026-02-23: 0x API v2 현행 검증 반영

**변경 근거:** 마일스톤 시작 전 0x API v2 현행 상태 검증 결과 반영.

**주요 변경 사항:**
- 체인 라우팅: 체인별 base URL 분기 → 단일 URL `https://api.0x.org` + `chainId` 쿼리 파라미터 (v1 방식 폐지 확인)
- `0x-version: v2` 필수 헤더 명시 (API v1은 2025-04 sunset)
- 지원 체인 수: 19+ → 20개 (Abstract, Berachain, Sonic 등 추가)
- AllowanceHolder 컨트랙트 주소 명시: Cancun 호환 `0x0000...22734` (19체인), Mantle 전용 `0x0000...49562`
- `liquidityAvailable` 응답 필드 핸들링 추가
- 리스크 #3: "체인별 엔드포인트 분기" → "AllowanceHolder 주소 분기"로 변경 (실제 리스크 반영)
- 참고 URL: `0x.org/docs/...` → `docs.0x.org/...` (도메인 이전 반영)

### 2026-02-23: config.toml → Admin Settings 이관 + 코드베이스 검증 반영

**변경 근거:** #158 이슈 — 빌트인 프로바이더 설정을 Admin UI Actions 페이지에서 관리. 코드베이스 대조 검증 결과 반영.

**주요 변경 사항:**
- `[actions.0x_swap]` config.toml 중첩 섹션 → Admin Settings 테이블로 변경 (WAIaaS config.toml 중첩 금지 원칙 준수)
- 빌트인 프로바이더 기본 활성화 (`enabled` 기본값 `true`)
- API 키 미설정 시 ACTION_API_KEY_REQUIRED 알림 발송 + adminUrl 필드 (#158)
- ContractCallRequest 필드명: `to/data/value` → `to/calldata/value` (실제 스키마 `calldata` 필드 반영)
- MCP 도구명: `waiaas_0x_swap` → `action_0x_swap_swap` (실제 `action_{provider}_{action}` 네이밍 패턴 반영)

### 2026-02-23: 코드베이스 검증 — SDK 메서드 + 알림 이벤트 추가

**변경 근거:** m28-02 시작 전 코드베이스 대조 검증에서 2건의 미구현 사항 발견.

**주요 변경 사항:**
- SDK `executeAction()` 메서드: TS/Python SDK 모두 미구현 상태 확인 → m28-02 구현 범위에 명시적 포함. `POST /v1/actions/{provider}/{action}` 호출하는 SDK 메서드 신규 추가
- `ACTION_API_KEY_REQUIRED` 알림 이벤트: 현재 NOTIFICATION_EVENT_TYPES(30개)에 미포함 → 신규 알림 이벤트 타입 추가. API 키 미설정 시 에러 응답 + 알림 이벤트 동시 발송

### 2026-02-23: #158 동시 구현 확정 + 코드베이스 정합성 보정

**변경 근거:** m28-02 시작 전 최종 검증에서 3건 보정.

**주요 변경 사항:**
- **#158 동시 구현 확정:** #158(Admin UI Actions 페이지)을 별도 선행이 아닌 m28-02 내 첫 번째 페이즈로 동시 구현. `registerBuiltInProviders()` 기본 활성화 로직(`cfg?.enabled` → `cfg?.enabled !== false`) 변경 포함
- **Python SDK 경로 보정:** 목표 문서 내 SDK 경로를 실제 디렉토리(`python-sdk/waiaas/`)로 명시
- **예상 규모 조정:** 페이즈 2→3개, 파일 15-20→20-28개, 테스트 16-24→20-30개 (#158 작업량 반영)

### 2026-02-23: 3대 설계 결정 확정

**변경 근거:** 마일스톤 시작 전 코드베이스 검증에서 식별된 3건의 미확정 설계 사항에 대해 방향 확정.

**결정 1: 빌트인 프로바이더 config.toml 폐지 → Admin Settings 단일 관리**
- Jupiter 포함 모든 빌트인 프로바이더 설정을 Admin Settings `actions` 카테고리에서 단일 관리
- config.toml `[actions]` 섹션 및 config loader의 jupiter 관련 키 제거
- `registerBuiltInProviders()`가 SettingsService에서 직접 설정을 읽도록 변경
- 기술 결정 #6으로 등록

**결정 2: Provider-trust 모델 (동적 컨트랙트 주소)**
- ContractCallRequest에 `actionProvider?: string` 옵션 필드 추가
- 등록+활성화된 프로바이더가 resolve()한 결과에 자동 태깅
- Policy Stage 3에서 `actionProvider` 태그 확인 → CONTRACT_WHITELIST 검사 skip
- 0x API v2의 동적 settler 주소를 정적 번들로 등록할 수 없는 문제 해결
- 거부한 대안: (A) resolve()에서 자동 화이트리스트 추가 — 순수 함수 원칙 위반, (B) 정적 번들 — settler 주소 동적이라 유지보수 불가
- 기술 결정 #7로 등록

**결정 3: resolve() 반환 타입 배열 확장**
- IActionProvider.resolve() 반환 타입: `ContractCallRequest` → `ContractCallRequest[]`
- 단일 항목: Jupiter `[swapReq]` — 기존 동작과 동일
- 다중 항목: 0x ERC-20 스왑 `[approveReq, swapReq]` — 순차 파이프라인 실행
- actions route handler가 배열을 순차로 파이프라인에 투입, 각각 6-stage 풀 통과
- 중간 실패 시 나머지 미실행, 에러 반환
- 거부한 대안: (A) 2회 호출 — AI 에이전트가 2-step 이해 필요 (DX 나쁨), (C) resolve() 내부 파이프라인 실행 — 순수 함수 원칙 위반
- 기술 결정 #8로 등록
- E2E 시나리오 #10-#14 재편: provider-trust + 배열 순차 실행 검증 추가
