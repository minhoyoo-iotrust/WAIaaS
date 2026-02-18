# 마일스톤 m23: Admin UI 기능별 메뉴 재구성

## 목표

Admin UI의 메뉴 구조를 기능별로 재구성하고, 탐색성·사용성을 동시에 개선한다. 기존 Settings 페이지(13개 항목 몰빵)를 해체하고 각 기능 페이지에 탭으로 분산하며, 설정 검색·breadcrumb·필드 그룹화·미저장 경고를 추가하여 분산에 따른 UX 단점을 상쇄한다.

> **핵심 원칙**: "기능을 찾으려면 한 페이지만 보면 된다." 조회와 설정이 같은 페이지에 탭으로 공존. 어디에 있는지 모르면 검색으로 즉시 이동.

---

## 배경

현재 Admin UI는 조회/관리 페이지(Wallets, Sessions 등)와 Settings 페이지가 분리되어 있어 관련 설정을 찾으려면 두 곳을 확인해야 한다. Security Parameters에는 세션·정책·인프라 설정이 혼재되어 있다.

### 현재 구조 (7 메뉴)

```
Dashboard | Wallets | Sessions | Policies | Notifications | WalletConnect | Settings(13개)
```

### 변경 구조 (7 메뉴)

```
Dashboard | Wallets | Sessions | Policies | Notifications | Security | System
```

---

## 산출물

### 1. 메뉴 구조 변경

| 현재 | 변경 | 비고 |
|------|------|------|
| Dashboard | Dashboard | 변경 없음 |
| Wallets | Wallets (4탭) | + RPC Endpoints, Balance Monitoring, WalletConnect |
| Sessions | Sessions (2탭) | + Session/Rate Limit 설정 + Absolute Lifetime, Max Renewals |
| Policies | Policies (2탭) | + Policy Defaults, Default Deny |
| Notifications | Notifications (3탭) | 기존 2탭 → 3탭 확장. + 알림 설정(Telegram Bot 통합) |
| WalletConnect | **삭제** | Wallets 하위 탭으로 통합 (Owner 페어링과 동일 맥락) |
| Settings | **삭제** | 13개 항목을 5개 페이지로 분산 |
| — | **Security** (신규, 3탭) | Kill Switch, AutoStop Rules, JWT Rotation |
| — | **System** (신규) | API Keys, Oracle, Display, IP Rate Limit, Daemon, Danger Zone |

### 2. Settings 항목 분산 매핑

> **참고**: `[신규]` 표시 항목은 백엔드 `setting-keys.ts`에 키가 정의되어 있으나 현재 Admin UI Settings 페이지에서 렌더링되지 않는 항목이다. 이번 재구성 시 대상 탭에 신규 노출한다.

| Settings 항목 | → 이동 대상 |
|--------------|------------|
| Notifications 설정 | Notifications > Settings 탭 |
| RPC Endpoints | Wallets > RPC Endpoints 탭 |
| Security Parameters > session_ttl | Sessions > Settings 탭 |
| Security Parameters > max_sessions_per_wallet | Sessions > Settings 탭 |
| Security Parameters > rate_limit_session_rpm | Sessions > Settings 탭 |
| Security Parameters > rate_limit_tx_rpm | Sessions > Settings 탭 |
| Security Parameters > max_pending_tx | Sessions > Settings 탭 |
| Security Parameters > session_absolute_lifetime `[신규]` | Sessions > Settings 탭 |
| Security Parameters > session_max_renewals `[신규]` | Sessions > Settings 탭 |
| Security Parameters > rate_limit_global_ip_rpm | System |
| Security Parameters > policy_defaults_delay_seconds | Policies > Defaults 탭 |
| Security Parameters > policy_defaults_approval_timeout | Policies > Defaults 탭 |
| Security Parameters > default_deny_tokens | Policies > Defaults 탭 |
| Security Parameters > default_deny_contracts | Policies > Defaults 탭 |
| Security Parameters > default_deny_spenders | Policies > Defaults 탭 |
| WalletConnect (Project ID) | Wallets > WalletConnect 탭 |
| WalletConnect (Relay URL) `[신규]` | Wallets > WalletConnect 탭 |
| Telegram Bot | Notifications > Settings 탭 (Notifications 설정에 통합, 중복 제거) |
| Display Currency | System |
| API Keys | System |
| Oracle (cross_validation_threshold) `[신규]` | System (별도 항목) |
| Daemon (Log Level) | System |
| AutoStop Rules | Security |
| Balance Monitoring | Wallets > Balance Monitoring 탭 |
| Kill Switch | Security |
| JWT Rotation | Security |
| Danger Zone | System |

### 3. 페이지별 구조 + 항목 설명

두 레벨의 설명을 표시한다:

- **페이지 레벨**: 페이지 헤더 하단에 subtitle 텍스트 추가 (blockquote로 표기). 현재 PageHeader에 subtitle 영역이 없으므로 레이아웃 수정 필요.
- **항목 레벨**: FormField 컴포넌트에 `description` prop 추가. 필드 라벨 아래에 `settings-description` 스타일로 help text 렌더링.

#### Dashboard

> Overview of your WAIaaS daemon — system health, wallet metrics, and recent transactions.

항목별 설명 불필요 (StatCard + 테이블 조회 전용)

#### Wallets

> Create and manage AI agent wallets. Each wallet holds keys for autonomous blockchain operations on behalf of an AI agent. Configure RPC endpoints, balance monitoring, and WalletConnect owner pairing.

| 탭 | 항목 | 설명 |
|----|------|------|
| **Wallets** | Create Wallet | Provision a new wallet for an AI agent. Choose chain and environment. |
| | Wallet Detail | View wallet address, balance, owner state, and recent transactions. |
| | Terminate | Permanently deactivate this wallet. Active sessions will be revoked. |
| | Owner Address | Link an external owner wallet for transaction approval and fund recovery. |
| | MCP Setup | Generate a session token and config for Claude Desktop integration. |
| **RPC Endpoints** | Solana RPC URLs | JSON-RPC endpoints for Solana networks (mainnet, devnet, testnet). |
| | EVM RPC URLs | JSON-RPC endpoints for EVM networks (Ethereum, Base, Polygon, Arbitrum, Optimism). |
| | EVM Default Network | Default EVM network used when no network is specified in requests. |
| | Connection Test | Verify RPC connectivity and measure response latency. |
| **Balance Monitoring** | Enabled | Enable periodic balance checks for all wallets. |
| | Check Interval | How often to check balances (seconds). |
| | Low Balance Threshold (SOL/ETH) | Trigger a notification when native balance falls below this amount. |
| | Cooldown Hours | Minimum hours between repeated low-balance alerts for the same wallet. |
| **WalletConnect** | Connect | Generate a QR code to pair an owner wallet via WalletConnect v2. |
| | Disconnect | End the pairing session. Owner approval falls back to Telegram or REST. |
| | Status | Connection state, peer wallet name, chain, and session expiry. |
| | Project ID | WalletConnect Cloud project ID. Required to enable QR pairing. Get one at cloud.walletconnect.com. |
| | Relay URL | WalletConnect relay server URL. Defaults to wss://relay.walletconnect.com. |

#### Sessions

> Issue and manage JWT session tokens for AI agents. Each token grants scoped access to a wallet. Set session limits and rate controls.

| 탭 | 항목 | 설명 |
|----|------|------|
| **Sessions** | Create Session | Issue a new JWT token bound to a specific wallet. |
| | Revoke | Immediately invalidate a session token. The agent loses wallet access. |
| | Status | Active, expired, or revoked state of each token. |
| **Settings** | Session TTL | Default lifetime for new session tokens (seconds). |
| | Session Absolute Lifetime | Maximum total lifetime for a session including renewals (seconds). |
| | Session Max Renewals | Maximum number of times a session token can be renewed. |
| | Max Sessions per Wallet | Maximum concurrent active sessions per wallet. |
| | Max Pending Transactions | Maximum unconfirmed transactions allowed per session. |
| | Session Rate Limit (RPM) | Maximum API requests per minute per session token. |
| | Transaction Rate Limit (RPM) | Maximum transaction submissions per minute per session. |

#### Policies

> Define spending limits, whitelists, and security rules that govern what AI agents can do. Configure default deny behaviors for tokens, contracts, and spenders.

| 탭 | 항목 | 설명 |
|----|------|------|
| **Policies** | Create Policy | Add a new rule (global or per-wallet). 12 types available. |
| | Type | Rule category — spending limit, whitelist, time restriction, rate limit, etc. |
| | Scope | Global (all wallets) or bound to a specific wallet. |
| | Network | Optional network restriction. Leave empty to apply across all networks. |
| | Priority | Evaluation order (0 = highest). Higher priority rules are checked first. |
| | Enabled | Toggle a policy on/off without deleting it. |
| **Defaults** | Delay Seconds | Mandatory wait time before executing approved transactions. |
| | Approval Timeout | How long an approval request stays valid before auto-rejection (seconds). |
| | Default Deny Tokens | When enabled, token transfers are blocked unless an ALLOWED_TOKENS policy exists. |
| | Default Deny Contracts | When enabled, contract calls are blocked unless a CONTRACT_WHITELIST policy exists. |
| | Default Deny Spenders | When enabled, approve operations are blocked unless an APPROVED_SPENDERS policy exists. |

#### Notifications

> Monitor alert delivery across channels. Manage Telegram user approvals and configure notification settings.

| 탭 | 항목 | 설명 |
|----|------|------|
| **Channels & Logs** | Channel Status | Connection state for each configured channel (Telegram, Discord, ntfy, Slack). |
| | Test | Send a test message to verify channel connectivity. |
| | Delivery Log | History of all sent notifications with status and message details. |
| **Telegram Users** | Pending Users | Users who messaged the bot but await admin approval. |
| | Approve | Grant a Telegram user access as Admin (full control) or Read-only (alerts only). |
| | Delete | Remove a Telegram user's access. |
| **Settings** | Notifications Enabled | Global toggle to enable or disable all notification delivery. |
| | Notification Rate Limit | Maximum notification messages per minute (prevents flood). |
| | *Telegram* | |
| | Telegram Bot Enabled | Start/stop the Telegram bot polling service. |
| | Telegram Bot Token | Bot API token from @BotFather. Required for Telegram notifications and commands. |
| | Telegram Chat ID | Default chat for system-level alerts (not per-user). |
| | Telegram Locale | Bot response language (en/ko). |
| | *Other Channels* | |
| | Discord Webhook URL | Incoming webhook URL for Discord channel alerts. |
| | ntfy Server / Topic | Self-hosted or ntfy.sh server URL and subscription topic. |
| | Slack Webhook URL | Incoming webhook URL for Slack channel alerts. |

> **참고**: 현재 NotificationSettings와 TelegramBotSettings가 Settings 페이지에 별도 섹션으로 중복 존재(`telegram_bot_token` 중복 렌더링). 이번 통합 시 단일 Settings 탭으로 병합하고 중복 제거.

#### Security (신규, 3탭)

> Emergency controls and automatic protection rules. Manage kill switch state, auto-stop triggers, and JWT secret rotation.

| 탭 | 항목 | 설명 |
|----|------|------|
| **Kill Switch** | Status | Current state: ACTIVE (normal), SUSPENDED (halted), or LOCKED (dual-auth required). |
| | Activate | Immediately suspend all wallet operations. Use in case of compromise or anomaly. |
| | Recover | Restore normal operations from SUSPENDED or LOCKED state. LOCKED recovery has a 5-second delay. |
| | Escalate to LOCKED | Upgrade from SUSPENDED to LOCKED. Requires owner + master auth to recover. |
| **AutoStop Rules** | Enabled | Enable or disable automatic stop rules. |
| | Consecutive Failures | Suspend after N consecutive transaction failures (default: 5). |
| | Unusual Activity Threshold | Maximum transactions within a time window before suspension. |
| | Unusual Activity Window | Time window (seconds) for unusual activity detection. |
| | Idle Timeout | Suspend wallet after N seconds of inactivity (0 = disabled). |
| | Idle Check Interval | How often to check for idle wallets (seconds). |
| **JWT Rotation** | Rotate Secret | Rotate the JWT signing secret. All existing session tokens become invalid immediately. |

#### System (신규)

> API keys, display preferences, daemon configuration, and server management.

| 항목 | 설명 |
|------|------|
| **API Keys** | Manage third-party API credentials (CoinGecko, etc.). Keys are stored encrypted. |
| **Oracle** | |
| Cross Validation Threshold | Maximum allowed deviation between price sources before flagging a discrepancy (0.0–1.0). |
| **Display Currency** | Default fiat currency for USD-equivalent display (43 currencies supported). |
| **Global IP Rate Limit** | Maximum API requests per minute from a single IP address. |
| **Log Level** | Daemon logging verbosity (debug, info, warn, error). Changes apply immediately. |
| **Danger Zone** | |
| Shutdown Daemon | Gracefully stop the daemon process. Requires typing "SHUTDOWN" to confirm. |

### 4. 설정 검색 (Settings Search)

Settings를 5개 페이지로 분산하면 "이 설정이 어디 있지?" 문제가 발생할 수 있다. 헤더에 글로벌 설정 검색을 제공하여 분산의 단점을 상쇄한다.

- **위치**: 헤더 우측에 검색 아이콘 + 클릭 시 검색 팝오버 (또는 `Ctrl+K` / `Cmd+K` 단축키)
- **인덱스 대상**: 모든 설정 항목의 label + description 텍스트 (정적 배열, API 호출 불필요)
- **동작**: fuzzy match → 결과 클릭 시 해당 페이지 + 탭으로 이동 + 해당 필드 하이라이트
- **범위**: Settings 탭 항목만 대상. 조회 페이지(월렛 목록, 세션 목록 등)는 제외

### 5. Breadcrumb 네비게이션

탭 구조가 깊어지면 현재 위치가 불명확해진다. PageHeader에 breadcrumb을 추가하여 탐색 컨텍스트를 제공한다.

- **형식**: `페이지명 > 탭명` (예: `Wallets > WalletConnect`, `Sessions > Settings`)
- **위치**: PageHeader의 title 위 (작은 텍스트, 링크)
- **동작**: 페이지명 클릭 시 첫 번째 탭으로 이동
- **단일 콘텐츠 페이지**: Dashboard, System은 breadcrumb 미표시 (탭 없음)

### 6. FormField 그룹화 (Fieldset)

Settings 탭 내에서 관련 필드를 시각적으로 그룹화하여 스캔 용이성을 높인다.

- **구현**: `<FieldGroup>` 컴포넌트 신규 생성 — `<fieldset>` + `<legend>` 래퍼
- **스타일**: 그룹 제목(legend) + 선택적 그룹 설명 + 하위 FormField 들여쓰기
- **적용 예시**:
  - Sessions > Settings: "Lifetime" 그룹 (TTL, Absolute Lifetime, Max Renewals) / "Rate Limits" 그룹 (Session RPM, Tx RPM, Max Pending)
  - Notifications > Settings: "Telegram" 그룹 / "Other Channels" 그룹 (문서 §3에 이미 이탤릭으로 구분)
  - Security > AutoStop Rules: "Activity Detection" 그룹 (Threshold, Window) / "Idle Detection" 그룹 (Timeout, Check Interval)

### 7. 탭 전환 미저장 경고

기술 결정 #6(탭별 독립 save bar)과 연계하여, dirty 상태에서 탭 전환 시 변경사항 유실을 방지한다.

- **트리거**: dirty signal이 true인 상태에서 다른 탭 클릭
- **UI**: 확인 다이얼로그 — "미저장 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?" + 저장 후 이동 / 저장 없이 이동 / 취소 3버튼
- **동작**: "저장 후 이동" 선택 시 save → 탭 전환, "저장 없이 이동" 시 dirty 초기화 → 탭 전환
- **페이지 이탈**: 사이드바 메뉴 클릭 시에도 동일하게 적용 (beforeunload 이벤트는 hash routing에서 미지원이므로 라우터 레벨에서 가드)

### 8. README Admin UI 섹션 업데이트

메뉴 구조 변경에 맞춰 `README.md`의 Admin UI 섹션을 갱신한다.

현재 (변경 전):
```markdown
- **Dashboard** -- System overview, wallet balances, recent transactions
- **Wallets** -- Create, manage, and monitor wallets across chains
- **Sessions** -- Issue and revoke agent session tokens
- **Policies** -- Configure 12 policy types with visual form editors
- **Notifications** -- Set up Telegram, Discord, ntfy, and Slack alerts
- **Settings** -- Runtime configuration without daemon restart
```

변경 후:
```markdown
- **Dashboard** -- System overview, wallet balances, recent transactions
- **Wallets** -- Create and manage wallets, RPC endpoints, balance monitoring, WalletConnect pairing
- **Sessions** -- Issue and revoke session tokens, configure TTL and rate limits
- **Policies** -- Configure 12 policy types, set default deny behaviors
- **Notifications** -- Telegram, Discord, ntfy, Slack alerts and delivery logs
- **Security** -- Kill switch, auto-stop rules, JWT rotation
- **System** -- API keys, display currency, log level, daemon management
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 탭 구현 방식 | 재사용 `<TabNav>` 컴포넌트 신규 생성 | 5개 페이지에 탭 필요 (Wallets, Sessions, Policies, Notifications, Security). Dashboard·System은 탭 없음. 인라인 복제 대신 공유 컴포넌트로 일관성 확보. 기존 Notifications 탭 CSS(`tab-nav`/`tab-btn`) 활용 |
| 2 | 페이지 설명 위치 | 페이지 헤더 하단 (subtitle) | 사이드바 호버 대비 항상 보임. 레이아웃 변경 최소화 |
| 3 | 항목 설명 표시 | FormField 하위 description prop | 기존 settings-description 클래스 활용. 필드별 help text |
| 4 | Settings 페이지 | 삭제 + Dashboard 리다이렉트 | #/settings 접근 시 #/dashboard로 리다이렉트. #/walletconnect 접근 시 #/wallets로 리다이렉트. 기존 `/telegram-users` → `/notifications` 리다이렉트 패턴 동일 적용 |
| 5 | URL 구조 | 기존 해시 라우팅 유지 (#/wallets, #/security 등) | 신규 페이지만 추가. 기존 URL 호환성 유지 |
| 6 | Save bar 전략 | 탭별 독립 save bar | 각 Settings 탭이 자체 dirty signal + save bar 보유. 탭 전환 시 다른 탭의 미저장 상태에 영향 없음 |
| 7 | 설정 검색 구현 | 정적 인덱스 + 클라이언트 fuzzy match | 설정 항목은 정적(수십 개)이므로 API 불필요. label + description 배열을 빌드 타임에 생성. 검색 라이브러리 미도입, `String.includes()` + 가중치 정렬로 충분 |
| 8 | Breadcrumb 위치 | PageHeader title 상단 | subtitle(페이지 설명) 아래가 아닌 title 위에 배치하여 시각 계층 유지. breadcrumb → title → subtitle 순서 |
| 9 | FieldGroup 구현 | `<fieldset>` + `<legend>` 시맨틱 래퍼 | HTML 시맨틱 + 접근성 확보. `<div>` 대신 `<fieldset>`로 스크린 리더 그룹 인식. legend 스타일링으로 시각적 구분 |
| 10 | 미저장 경고 전략 | 라우터 가드 + 탭 전환 가드 이중 적용 | hash routing은 `beforeunload` 미지원이므로 라우터 레벨에서 dirty 체크. `<TabNav>`에 `onBeforeChange` 콜백 prop 추가 |

---

## E2E 검증 시나리오

**자동화 비율: 86% -- `[HUMAN]` 3건**

### 자동 검증 (20건)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 사이드바 메뉴 7개 표시 | NAV_ITEMS 배열 길이 === 7 assert | [L0] |
| 2 | Settings 라우트 제거 | #/settings 접근 시 #/dashboard로 리다이렉트 assert | [L0] |
| 3 | WalletConnect 라우트 제거 | #/walletconnect 접근 시 #/wallets로 리다이렉트 assert | [L0] |
| 4 | Wallets 4탭 존재 | Wallets 페이지에 탭 4개 (Wallets, RPC Endpoints, Balance Monitoring, WalletConnect) 렌더 assert | [L0] |
| 5 | Sessions 2탭 존재 | Sessions 페이지에 탭 2개 (Sessions, Settings) 렌더 assert | [L0] |
| 6 | Policies 2탭 존재 | Policies 페이지에 탭 2개 (Policies, Defaults) 렌더 assert | [L0] |
| 7 | Notifications 2→3탭 확장 | Notifications 페이지에 탭 3개 (Channels & Logs, Telegram Users, Settings) assert | [L0] |
| 8 | Security 페이지 3탭 렌더 | #/security 접근 시 탭 3개 (Kill Switch, AutoStop Rules, JWT Rotation) 렌더 assert | [L0] |
| 9 | System 페이지 렌더 | #/system 접근 시 API Keys + Display + Log Level + Danger Zone 렌더 assert | [L0] |
| 10 | RPC 설정 Wallets에서 동작 | Wallets > RPC Endpoints 탭에서 설정 변경 + 저장 → API 반영 assert | [L1] |
| 11 | Policy Defaults 동작 | Policies > Defaults 탭에서 default_deny_tokens 토글 → API 반영 assert | [L1] |
| 12 | Session Settings 동작 | Sessions > Settings 탭에서 session_ttl 변경 → API 반영 assert | [L1] |
| 13 | WalletConnect 설정 동작 | Wallets > WalletConnect 탭에서 Project ID 변경 + 저장 → API 반영 assert | [L1] |
| 14 | 페이지 설명 존재 | 모든 7개 페이지 헤더에 description 텍스트 존재 assert | [L0] |
| 15 | 항목 설명 존재 | Settings 탭의 FormField에 description prop 렌더 assert (샘플 3개 이상) | [L0] |
| 16 | 설정 검색 동작 | 검색창에 "telegram" 입력 → Notifications > Settings 결과 표시 + 클릭 시 해당 탭 이동 assert | [L1] |
| 17 | Breadcrumb 렌더 | 탭이 있는 5개 페이지에서 breadcrumb "페이지명 > 탭명" 텍스트 존재 assert. Dashboard·System은 미표시 assert | [L0] |
| 18 | FieldGroup 렌더 | Sessions > Settings 탭에 FieldGroup 2개 (Lifetime, Rate Limits) 렌더 assert | [L0] |
| 19 | 미저장 경고 다이얼로그 | dirty 상태에서 탭 전환 시 확인 다이얼로그 표시 assert + "저장 없이 이동" 클릭 시 탭 전환 + dirty 초기화 assert | [L1] |
| 20 | README Admin UI 섹션 | README.md에 7개 메뉴 항목 나열 + Settings/WalletConnect 미포함 + Security/System 포함 assert | [L0] |

### 수동 검증 [HUMAN]

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 21 | 초보 사용자 탐색성 | WAIaaS를 처음 접한 사람이 원하는 기능을 3클릭 이내에 찾을 수 있는지 확인 | [HUMAN] |
| 22 | 페이지/항목 설명 품질 | 설명 문구가 명확하고 기술 용어에 대한 충분한 컨텍스트를 제공하는지 검토 | [HUMAN] |
| 23 | 설정 검색 결과 품질 | 다양한 키워드(rpc, rate, deny, telegram 등)로 검색 시 기대 결과가 상위에 노출되는지 검토 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m20 (릴리스) | Admin UI 기본 구현이 완료된 상태에서 재구성 |
| m22 (커버리지) | 재구성 후 기존 admin 테스트 수정 필요. 커버리지 임계값 복원과 병행 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 기존 Settings 테스트 대량 수정 | settings.test.tsx가 Settings 페이지 기준으로 작성됨 | 페이지별 테스트로 분할 |
| 2 | Save bar 동작 변경 | 현재 Settings 전용 dirty tracking을 탭별로 분리 필요 | 탭별 독립 save bar 적용 (기술 결정 #6) |
| 3 | 북마크/URL 호환 | #/settings, #/walletconnect URL을 사용하던 사용자 | #/dashboard, #/wallets로 각각 리다이렉트 (기술 결정 #4) |

---

*최종 업데이트: 2026-02-18 — UX 4건 + README 갱신 추가, E2E 20+3건으로 확장*
