# Feature Landscape

**Domain:** AI Agent Skill Documentation Separation + OpenClaw Plugin
**Researched:** 2026-03-18

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Agent-only skill files** | OpenClaw/Claude Code 등 에이전트 프레임워크가 skills/ 로드 시 masterAuth 엔드포인트 호출 시도 -> 401 실패 반복. 에이전트 컨텍스트 오염은 모든 사용자가 겪는 문제 | Low | 기존 7개 혼합 파일에서 masterAuth 섹션 추출, 2개 admin 파일 이동. 내용 삭제가 아닌 분리 |
| **`openclaw.plugin.json` 매니페스트** | OpenClaw 플러그인 시스템이 매니페스트 없이는 플러그인을 인식하지 않음. `id`, `configSchema`, `uiHints` 필수 | Low | JSON Schema 기반 configSchema (daemonUrl, sessionToken). uiHints로 sessionToken에 `sensitive: true` 설정 |
| **`register(api)` 진입점** | OpenClaw 플러그인 로딩 파이프라인이 `register(api)` 또는 default export를 요구 | Med | `api.registerTool()` 호출로 ~22개 도구 등록. 각 도구의 input JSON Schema + handler 구현 |
| **configSchema 검증** | OpenClaw은 config load 시점에 JSON Schema로 검증하며, 런타임 코드 실행 없이 validation. 스키마 누락 시 플러그인 invalid 마킹 | Low | `daemonUrl` (string, default localhost:3100), `sessionToken` (string, required). `additionalProperties: false` |
| **sessionAuth 전용 도구** | 에이전트는 session token만 가지고 있으므로 masterAuth 도구를 노출하면 모든 호출이 실패. Coinbase AgentKit도 wallet provider 범위 내에서만 도구 노출 | Low | 42개 MCP 도구 중 sessionAuth 전용 ~22개만 선별. masterAuth 도구는 절대 포함하지 않음 |
| **관리자 매뉴얼 (docs/admin-manual/)** | masterAuth 내용이 skills/에서 제거되면 관리자 참조 문서가 사라짐. 별도 관리자 문서 필수 | Med | 8개 마크다운 파일 + README 인덱스. 기존 skill 내용 재구성 (단순 이동이 아닌 매뉴얼 형태로 재작성) |
| **docs/guides/ -> docs/agent-guides/ 리네이밍** | 에이전트/관리자 문서 경계 명확화. guides/ 이름이 모호하여 대상 불명확 | Low | 5개 파일 이동 + site/index.html, README.md 등 참조 경로 업데이트 |
| **npm 패키지 배포** | `openclaw plugins install @waiaas/openclaw-plugin` 원커맨드 설치가 표준. npm 미배포 시 수동 설치 필요 | Med | release-please + npm trusted publishing 기존 파이프라인 재활용. packages/openclaw-plugin 추가 |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **uiHints 지원** | OpenClaw UI에서 설정 필드 라벨/플레이스홀더/민감도 표시. 대부분의 플러그인이 이를 생략하지만 WAIaaS는 보안 민감 설정(sessionToken)이 있어 차별화 | Low | `sessionToken: { label: "Session Token (JWT)", sensitive: true, placeholder: "wai_sess_eyJ..." }` |
| **SDK 기반 도구 구현** | 각 도구 handler가 `@waiaas/sdk`를 통해 동작하므로 에러 핸들링/타입 안전성/재시도 로직 일관성 보장. raw HTTP 호출 대비 안정성 | Med | client.ts에서 SDK 클라이언트 팩토리, 각 도구 파일에서 SDK 메서드 호출 |
| **SEO 빌드 포함 (admin-manual + openclaw 랜딩)** | 관리자 매뉴얼과 OpenClaw 플러그인 페이지를 기존 CRT 테마 사이트에 포함하여 검색 노출 증가 | Med | site/build.mjs 빌드 대상에 9개 파일 추가, sitemap.xml/llms-full.txt 업데이트 |
| **도메인별 도구 그룹핑** | wallet/transfer/defi/nft/utility 5개 그룹으로 도구를 분류하여 에이전트가 관련 도구를 쉽게 발견 | Low | 도구 파일을 tools/ 하위 5개 파일로 분리 |
| **providerAuthEnvVars** | `WAIAAS_SESSION_TOKEN`, `WAIAAS_DAEMON_URL` 환경변수로 config 대신 인증 가능. CI/CD 환경에서 유용 | Low | 매니페스트에 선언만 하면 OpenClaw이 자동으로 env -> config 매핑 |
| **Progressive disclosure 스킬 구조** | Agent Skills 표준의 best practice. 핵심 정보만 메인 스킬에 두고 상세 정보는 별도 파일 참조 -> LLM 컨텍스트 절약 | Low | 기존 스킬 파일에서 관리자 내용 제거 자체가 progressive disclosure 달성 |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **masterAuth 도구 플러그인 노출** | 에이전트가 master password를 소유하면 안 됨. 보안 모델 위반. Coinbase AgentKit도 관리자 기능은 별도 대시보드로 분리 | sessionAuth 도구만 노출. 관리자 기능은 Admin UI/CLI에서 처리 |
| **MCP 서버 변경** | 기존 42개 MCP 도구가 안정적으로 동작 중. OpenClaw 플러그인은 별도 인터페이스 | MCP는 그대로 유지. 플러그인은 SDK를 통한 독립 구현 |
| **도구 이름/스키마 커스터마이징** | 플러그인 사용자가 도구 이름을 변경하면 스킬 파일과 불일치, 디버깅 불가 | 고정 도구 이름 + 고정 스키마. 버전 관리로 변경 추적 |
| **채널/백그라운드 서비스 플러그인** | OpenClaw의 channel plugin은 메시징 통합용. WAIaaS는 지갑 도구 제공이 목적이지 메시징 채널이 아님 | `registerTool()`만 사용. `registerChannel()` 등 불필요한 capability 등록 금지 |
| **플러그인 내 상태 관리** | 플러그인이 자체 DB/캐시를 두면 데몬과 상태 불일치 발생 | 모든 상태는 WAIaaS 데몬이 관리. 플러그인은 stateless SDK 호출만 수행 |
| **관리자 매뉴얼의 인터랙티브 기능** | admin-manual은 정적 참조 문서. 인터랙티브 설정 위자드는 Admin UI의 역할 | 마크다운 문서 + SEO 빌드. 설정 UI는 /admin에서 처리 |
| **Hyperliquid/Polymarket 전용 도구 번들링** | 22개 도구에 전문 프로토콜까지 넣으면 도구 목록이 비대해지고 일반 에이전트에게 불필요한 노이즈 | 핵심 도구셋만 포함. 전문 프로토콜은 향후 별도 플러그인으로 제공 가능 |

## Feature Dependencies

```
docs/guides/ -> docs/agent-guides/ 리네이밍
    |
    v
skills/ 에이전트 전용 정리 (7개 혼합 파일 분리)
    |                          |
    v                          v
docs/admin-manual/ 생성    OpenClaw 플러그인 도구 목록 확정
    |                          |
    v                          v
SEO 빌드 포함              register() + tools/ 구현
                               |
                               v
                           CI/CD 통합 (release-please, npm)
                               |
                               v
                           openclaw-integration.md 업데이트
```

핵심 의존성:
- 스킬 정리(2단계)가 선행되어야 에이전트 전용 도구 목록이 확정됨
- 관리자 매뉴얼 생성과 플러그인 제작은 병렬 가능 (둘 다 스킬 정리에 의존)
- SEO 빌드는 관리자 매뉴얼 완성 후
- CI/CD 통합은 플러그인 패키지 구현 후

## MVP Recommendation

Prioritize:
1. **docs/guides/ 리네이밍 + skills/ 정리** -- 모든 후속 작업의 선행 조건. 에이전트 컨텍스트 오염 문제 즉시 해결
2. **docs/admin-manual/ 생성** -- masterAuth 내용 수용처. 스킬 정리와 동시 수행
3. **OpenClaw 플러그인 코어 (매니페스트 + register + ~22개 도구)** -- 핵심 가치. SDK 기반 handler 구현
4. **CI/CD + npm 배포** -- 원커맨드 설치 지원

Defer:
- **SEO 빌드 포함**: 기능적으로는 독립적이나 admin-manual 완성 후 자연스럽게 추가. 마지막 단계로 배치
- **providerAuthEnvVars**: nice-to-have. 매니페스트에 선언만 하면 되므로 3단계에서 함께 처리 가능하지만 필수 아님

## 노출 도구 상세 (~22개 sessionAuth 전용)

MCP 42개 도구와 대조하여 sessionAuth 전용 도구 선별:

| 그룹 | 도구명 | MCP 대응 | 설명 |
|------|--------|----------|------|
| **Wallet** | `get_wallet_info` | get_wallet_info | 지갑 정보 조회 |
| | `get_balance` | get_balance | 잔액 조회 |
| | `get_assets` | get_assets | 전체 자산 목록 |
| | `get_address` | get_address | 주소 조회 |
| | `connect_info` | connect_info | 자기 발견 (지갑/정책/capabilities) |
| | `get_tokens` | get_tokens | 등록 토큰 목록 조회 |
| **Transfer** | `transfer` | send_token (type=TRANSFER) | 네이티브 전송 |
| | `token_transfer` | send_token (type=TOKEN_TRANSFER) | 토큰 전송 |
| | `get_transaction` | get_transaction | 트랜잭션 상세 |
| | `list_transactions` | list_transactions | 트랜잭션 목록 |
| **DeFi** | `execute_action` | action_provider (동적) | DeFi 액션 실행 (swap/bridge/stake 등) |
| | `list_providers` | list_providers (내장) | 프로바이더 목록 |
| | `get_defi_positions` | get_defi_positions | DeFi 포지션 조회 |
| **NFT** | `list_nfts` | list_nfts | NFT 목록 |
| | `transfer_nft` | transfer_nft | NFT 전송 |
| | `get_nft_metadata` | get_nft_metadata | NFT 메타데이터 |
| **Utility** | `sign_message` | sign_message | 메시지 서명 (personal/EIP-712) |
| | `contract_call` | call_contract | 컨트랙트 호출 |
| | `approve` | approve_token | 토큰 승인 |
| | `batch` | send_batch | 배치 트랜잭션 |
| | `resolve_asset` | resolve_asset | CAIP-19 자산 resolve |
| | `get_price` | (REST API 직접) | 토큰 가격 조회 |

**제외 도구 (masterAuth 또는 특수 용도):**
- WalletConnect (wc_connect/disconnect/status) -- Owner 관리용, masterAuth 영역
- Hyperliquid 10개 도구 -- 전문 프로토콜, 별도 플러그인 후보
- Polymarket 3개 도구 -- 전문 프로토콜, 별도 플러그인 후보
- ERC-8004 3개 도구 -- 에이전트 등록/평판은 sessionAuth이나 특수 용도
- ERC-8128 2개 도구 -- HTTP 서명은 sessionAuth이나 특수 용도
- x402_fetch -- 특수 프로토콜
- list_sessions -- 세션 관리는 관리자 영역
- list_credentials -- 크레덴셜 관리는 관리자 영역
- simulate_transaction -- 고급 기능, 핵심 도구셋 밖
- encode_calldata -- 개발자 도구, 일반 에이전트 불필요
- build_userop/sign_userop -- Smart Account 전용, 특수 용도
- get_health_factor -- DeFi 전문, get_defi_positions로 대체
- incoming TX 도구 (get_incoming_summary, list_incoming_transactions) -- 모니터링은 관리자/알림 채널 영역
- get_rpc_proxy_url -- 개발자 도구
- get_provider_status -- Smart Account 관리
- get_nonce -- 저수준 도구, 일반 에이전트 불필요
- sign_transaction -- raw 트랜잭션 서명, transfer/token_transfer로 대체
- list_offchain_actions -- External Action 이력, 특수 용도

**참고:** Hyperliquid/Polymarket/ERC-8004/ERC-8128/x402 등은 향후 별도 OpenClaw 플러그인으로 제공 가능하나 v32.10 scope 밖.

## OpenClaw 플러그인 인터페이스 상세

### 매니페스트 (openclaw.plugin.json)

OpenClaw 공식 문서 기반 필수 필드:

```json
{
  "id": "waiaas",
  "name": "WAIaaS Wallet",
  "description": "AI Agent Wallet-as-a-Service",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "daemonUrl": {
        "type": "string",
        "description": "WAIaaS daemon URL",
        "default": "http://localhost:3100"
      },
      "sessionToken": {
        "type": "string",
        "description": "WAIaaS session token (JWT)"
      }
    },
    "required": ["sessionToken"]
  },
  "uiHints": {
    "daemonUrl": {
      "label": "Daemon URL",
      "placeholder": "http://localhost:3100"
    },
    "sessionToken": {
      "label": "Session Token (JWT)",
      "sensitive": true,
      "placeholder": "wai_sess_eyJ..."
    }
  },
  "providerAuthEnvVars": ["WAIAAS_SESSION_TOKEN", "WAIAAS_DAEMON_URL"]
}
```

### register() API 패턴

```typescript
export default function register(api: OpenClawPluginApi) {
  const config = api.config;
  const client = createClient(config.daemonUrl, config.sessionToken);

  api.registerTool({
    id: "waiaas_get_balance",
    name: "Get Wallet Balance",
    description: "Check native token balance for a wallet",
    input: {
      type: "object",
      properties: {
        walletId: { type: "string", description: "Wallet ID" },
        network: { type: "string", description: "Network (e.g., ethereum-mainnet)" }
      },
      required: ["walletId"]
    },
    handler: async (input, ctx) => {
      const result = await client.getBalance(input.walletId, input.network);
      return result;
    }
  });
  // ... 21 more tools
}
```

### 도구 등록 핵심 규칙

1. **input은 JSON Schema** -- OpenClaw이 파라미터 검증에 사용
2. **handler는 async** -- SDK 호출이므로 비동기 필수
3. **반환값은 직렬화 가능 객체** -- OpenClaw이 에이전트에게 전달
4. **에러는 throw** -- OpenClaw이 에이전트에게 에러 메시지 전달

## Sources

- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/tools/plugin) -- 매니페스트 형식, register() API, configSchema, uiHints (HIGH confidence)
- [OpenClaw GitHub Plugin Docs](https://github.com/openclaw/openclaw/blob/main/docs/tools/plugin.md) -- 플러그인 타입, 로딩 파이프라인, capability 등록 (HIGH confidence)
- [Agent Skills Specification](https://agentskills.io/home) -- 오픈 표준 포맷, progressive disclosure best practice (HIGH confidence)
- [Coinbase AgentKit](https://github.com/coinbase/agentkit) -- AI 지갑 도구 노출 패턴 참조 (MEDIUM confidence)
- [OpenClaw Plugin Manifest](https://www.learnclawdbot.org/docs/plugins/manifest) -- 매니페스트 필드 상세, configPatch (MEDIUM confidence)
- [What Are AI Agent Plugins](https://nevo.systems/blogs/nevo-journal/what-are-ai-agent-plugins) -- 2026 플러그인 생태계 트렌드 (LOW confidence)
