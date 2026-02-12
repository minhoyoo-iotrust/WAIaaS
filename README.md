# WAIaaS

**AI 에이전트가 안전하게 온체인 거래를 수행하는 Self-Hosted 지갑 데몬**

WAIaaS(Wallet-as-a-Service for AI Agents)는 중앙 서버 없이 사용자가 직접 설치·운영하는 AI 에이전트 전용 지갑 시스템이다. 체인 무관(Chain-Agnostic) 3계층 보안 모델로 에이전트의 자율적 거래를 보장하면서, 에이전트 주인(사람)이 자금 통제권을 유지한다.

## Why WAIaaS?

### 기존 문제

기존 WaaS(Wallet-as-a-Service)는 사용자가 **사람**이라는 것을 가정한다. AI 에이전트가 자율적으로 거래를 수행하려면 근본적으로 다른 접근이 필요하다.

현재 에이전트 지갑 시장은 두 극단으로 나뉘어 있다:

| 접근 방식 | 문제점 |
|-----------|--------|
| **완전 자율** (에이전트가 키 직접 보유) | 에이전트 해킹 시 자금 전액 탈취 위험 |
| **완전 커스터디** (중앙 서비스 관리) | 서비스 제공자에 대한 신뢰 의존, 단일 장애점 |

### WAIaaS의 접근

- **자율성과 통제의 균형** — 에이전트는 소액을 즉시 처리하고, 고액은 주인의 승인을 거친다
- **서비스 제공자 의존 없음** — 모든 것이 사용자의 로컬 머신에서 동작한다
- **다층 방어** — 하나의 보안 계층이 뚫려도 다른 계층이 자금을 보호한다

## 핵심 특징

### Self-Hosted 로컬 데몬
중앙 서버가 없다. 키 생성, 트랜잭션 서명, 정책 평가가 모두 사용자의 로컬 데몬에서 수행된다. 서비스 제공자가 사용자 자금에 접근할 수 없다.

### Chain-Agnostic 3계층 보안
특정 블록체인 프로토콜에 의존하지 않는 보안 모델로, Solana와 EVM 등 모든 체인에 동일한 보안이 적용된다.

| 계층 | 역할 | 메커니즘 |
|------|------|----------|
| **1. 세션 인증** | 에이전트 접근 제어 | JWT 토큰, 시간/금액/대상 제약 |
| **2. 시간 지연 + 승인** | 고액 거래 보호 | 금액별 정책 티어, Owner 승인 |
| **3. 모니터링 + 긴급 정지** | 이상 탐지 및 즉시 차단 | 실시간 알림, Kill Switch |

### 멀티체인 지원
Solana를 1순위로 지원하며, EVM(Ethereum 등) 체인을 추가 지원한다. `IChainAdapter` 인터페이스로 추상화되어 새로운 체인을 플러그인 방식으로 추가할 수 있다.

### 토큰 + 컨트랙트 + DeFi
네이티브 토큰(SOL/ETH) 전송뿐 아니라 SPL/ERC-20 토큰 전송, 임의 스마트 컨트랙트 호출, Approve 관리, 배치 트랜잭션을 지원한다. Action Provider 플러그인으로 Jupiter Swap 등 DeFi 프로토콜을 추상화한다.

### USD 기준 정책 평가
가격 오라클(CoinGecko/Pyth/Chainlink)을 통해 토큰 종류와 무관하게 **USD 금액 기준**으로 정책 티어를 분류한다. 1 SOL이든 100 USDC이든 동일한 달러 기준으로 보안 정책이 적용된다.

### 다양한 인터페이스
하나의 데몬에 여러 방식으로 접근할 수 있다:

| 인터페이스 | 대상 | 설명 |
|-----------|------|------|
| **REST API** | 모든 클라이언트 | 36개 엔드포인트, OpenAPI 3.0 |
| **TypeScript SDK** | Node.js 에이전트 | 0 외부 의존성, 타입 안전 |
| **Python SDK** | Python 에이전트 | httpx + Pydantic v2 |
| **MCP** | AI 에이전트 (Claude 등) | 6개 도구, stdio 전송 |
| **CLI** | 개발자/운영자 | init/start/stop/status/mcp setup |
| **Admin Web UI** | 관리자 | 대시보드, 에이전트/세션/정책/알림 관리 |
| **Desktop App** | Owner (주인) | Tauri 2, 트레이 앱, 승인 UI |
| **Telegram Bot** | Owner (주인) | 인라인 키보드로 거래 승인/거부 |

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│  AI Agent                                                │
│  (Claude, GPT, LangChain, CrewAI, ...)                   │
└────────────┬──────────────────┬──────────────────────────┘
             │                  │
     ┌───────▼───────┐  ┌──────▼───────┐
     │  TS/Python SDK │  │  MCP Server  │
     └───────┬───────┘  └──────┬───────┘
             │                  │
             └────────┬─────────┘
                      │ HTTP (127.0.0.1:3100)
              ┌───────▼────────┐
              │   WAIaaS Daemon │
              │                │
              │  ┌──────────┐  │     ┌─────────────┐
              │  │ REST API │  │     │  Desktop App │
              │  │  (Hono)  │  │     │   (Tauri 2)  │
              │  └────┬─────┘  │     └──────┬──────┘
              │       │        │            │
              │  ┌────▼─────┐  │     ┌──────▼──────┐
              │  │ Pipeline │  │     │ Telegram Bot │
              │  │ (6-stage)│  │     └─────────────┘
              │  └────┬─────┘  │
              │       │        │
              │  ┌────▼─────┐  │
              │  │ Policy   │  │
              │  │ Engine   │  │
              │  └────┬─────┘  │
              │       │        │
              │  ┌────▼─────┐  │
              │  │ Chain    │  │
              │  │ Adapters │  │
              │  └────┬─────┘  │
              └───────┼────────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
   ┌──────▼──┐ ┌─────▼────┐ ┌───▼───┐
   │ Solana  │ │   EVM    │ │  ...  │
   │ (Mainnet)│ │(Ethereum)│ │       │
   └─────────┘ └──────────┘ └───────┘
```

### 모노레포 구조

```
waiaas/
├── packages/
│   ├── core/               # 도메인 모델, 인터페이스, Zod 스키마, 에러 코드
│   ├── daemon/             # Self-Hosted 데몬 (Hono HTTP, SQLite, Keystore)
│   ├── adapters/
│   │   └── solana/         # Solana 어댑터 (@solana/kit 6.x)
│   ├── cli/                # CLI 도구 (waiaas 명령어)
│   ├── sdk/                # TypeScript SDK (0 외부 의존성)
│   ├── mcp/                # MCP Server (stdio 전송)
│   └── admin/              # Admin Web UI (Preact + Signals)
├── python-sdk/             # Python SDK (httpx + Pydantic v2)
├── objectives/             # 마일스톤별 목표 문서
└── docs/                   # 설계 문서
```

## 빠른 시작 (Quick Start)

### 요구사항

- Node.js 22 LTS 이상
- pnpm 9 이상

### 1. 소스 빌드

```bash
git clone https://github.com/anthropics/waiaas.git
cd waiaas
pnpm install
pnpm build
```

### 2. 초기화 + 데몬 시작

```bash
# 데이터 디렉토리 + 키스토어 초기화
pnpm --filter @waiaas/cli exec waiaas init

# 데몬 시작 (마스터 패스워드 입력 프롬프트)
pnpm --filter @waiaas/cli exec waiaas start
```

데몬이 `http://127.0.0.1:3100`에서 실행된다.

### 3. 에이전트 생성 + 세션 발급

```bash
# 에이전트 생성 (masterAuth 필요)
curl -X POST http://127.0.0.1:3100/v1/agents \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"name": "my-agent", "chain": "solana", "network": "devnet"}'

# 세션 토큰 발급 (masterAuth 필요)
curl -X POST http://127.0.0.1:3100/v1/sessions \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"agentId": "<agent-id-from-above>"}'
```

응답에서 받은 `token` 값을 에이전트에 설정한다:

```bash
export WAIAAS_SESSION_TOKEN=wai_sess_eyJhbGciOiJIUzI1NiJ9...
```

### 4. SDK로 첫 거래

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  sessionToken: process.env.WAIAAS_SESSION_TOKEN,
});

// 잔액 조회
const balance = await client.getBalance();
console.log(`잔액: ${balance.amount} SOL`);

// SOL 전송
const tx = await client.sendToken({
  to: 'recipient-address...',
  amount: '0.1',
});
console.log(`트랜잭션: ${tx.signature}`);
```

## 설정 (Configuration)

설정 파일은 `~/.waiaas/config.toml`에 위치한다. 모든 섹션은 **평탄(flat) 구조**이며 중첩을 허용하지 않는다.

### 기본 설정

```toml
# 데몬 설정
[daemon]
port = 3100                     # 리스닝 포트
hostname = "127.0.0.1"          # localhost 전용 (보안상 변경 비권장)
log_level = "info"              # trace | debug | info | warn | error
dev_mode = false                # true: 고정 패스워드 "dev-password"
admin_ui = true                 # Admin Web UI 활성화
admin_timeout = 900             # Admin 세션 타임아웃 (초)

# 블록체인 RPC 엔드포인트
[rpc]
solana_mainnet = "https://api.mainnet-beta.solana.com"
solana_devnet = "https://api.devnet.solana.com"
# ethereum_mainnet = "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"

# 보안 설정
[security]
session_ttl = 86400                         # 세션 수명 (초, 기본 24시간)
max_sessions_per_agent = 5                  # 에이전트당 최대 세션 수
rate_limit_global_ip_rpm = 1000             # 전역 IP당 RPM
rate_limit_session_rpm = 300                # 세션당 RPM
rate_limit_tx_rpm = 10                      # 거래 요청 RPM
policy_defaults_delay_seconds = 300         # DELAY 티어 대기 시간 (초)
policy_defaults_approval_timeout = 3600     # APPROVAL 티어 타임아웃 (초)

# 키스토어 설정
[keystore]
argon2_memory = 65536           # Argon2id 메모리 (KB)
argon2_time = 3                 # Argon2id 반복 횟수
argon2_parallelism = 4          # Argon2id 병렬도

# 데이터베이스
[database]
path = "data/waiaas.db"         # SQLite 파일 경로 (data-dir 상대)
wal_checkpoint_interval = 300   # WAL 체크포인트 주기 (초)

# WalletConnect (선택)
[walletconnect]
project_id = ""                 # Reown Cloud 프로젝트 ID
```

### 환경변수 오버라이드

모든 설정은 `WAIAAS_{SECTION}_{KEY}` 형식의 환경변수로 오버라이드할 수 있다:

```bash
WAIAAS_DAEMON_PORT=4000
WAIAAS_DAEMON_LOG_LEVEL=debug
WAIAAS_RPC_SOLANA_MAINNET="https://my-rpc.example.com"
WAIAAS_SECURITY_SESSION_TTL=43200
WAIAAS_NOTIFICATIONS_ENABLED=true
WAIAAS_NOTIFICATIONS_TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
```

## 알림 설정 (Notifications)

WAIaaS는 Telegram, Discord, ntfy 세 가지 알림 채널을 지원한다. 거래 실행, 대기, 승인 요청, Kill Switch 등 8개 이벤트에 대해 실시간 알림을 보낸다.

### config.toml 알림 섹션

```toml
[notifications]
enabled = true                  # 알림 활성화
min_channels = 2                # 최소 활성 채널 수 (권장: 2)
locale = "ko"                   # 알림 언어 (en | ko)
log_retention_days = 30         # 알림 로그 보관 기간

# Telegram
telegram_bot_token = ""         # BotFather에서 발급받은 토큰
telegram_chat_id = ""           # 알림을 받을 채팅 ID

# Discord
discord_webhook_url = ""        # Discord 웹훅 URL

# ntfy
ntfy_server = "https://ntfy.sh" # ntfy 서버 (기본: ntfy.sh 공개 서버)
ntfy_topic = ""                  # 구독할 토픽명
```

### Telegram 연결 가이드

1. **Bot 생성**: Telegram에서 [@BotFather](https://t.me/BotFather)에게 `/newbot` 명령을 보내 봇을 생성한다. 발급받은 토큰을 기록한다.

2. **Chat ID 확인**: 봇에게 아무 메시지를 보낸 후, 다음 URL로 Chat ID를 확인한다:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   응답의 `result[0].message.chat.id` 값이 Chat ID이다.

3. **config.toml에 설정**:
   ```toml
   [notifications]
   enabled = true
   telegram_bot_token = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
   telegram_chat_id = "987654321"
   ```

4. **테스트**: 데몬 재시작 후 Admin UI 또는 API로 테스트 알림을 보낼 수 있다:
   ```bash
   curl -X POST http://127.0.0.1:3100/v1/admin/notifications/test \
     -H "X-Master-Password: <your-master-password>" \
     -H "Content-Type: application/json" \
     -d '{"channel": "telegram"}'
   ```

### Discord 설정

1. Discord 서버 설정 → 연동 → 웹후크 → 새 웹후크 → URL 복사
2. config.toml에 설정:
   ```toml
   [notifications]
   discord_webhook_url = "https://discord.com/api/webhooks/..."
   ```

### ntfy 설정

```toml
[notifications]
ntfy_topic = "waiaas-my-alerts"
ntfy_server = "https://ntfy.sh"   # 또는 자체 호스팅 서버
```

구독: `ntfy subscribe waiaas-my-alerts` 또는 [ntfy 앱](https://ntfy.sh) 사용

### Admin UI에서 알림 관리

`http://127.0.0.1:3100/admin` → Notifications 페이지에서:
- 채널별 상태 확인 및 테스트 알림 전송
- 알림 로그 조회 (이벤트 타입, 채널, 전송 결과)

### 알림 로그 API

```bash
# 알림 채널 상태 조회
curl http://127.0.0.1:3100/v1/admin/notifications/status \
  -H "X-Master-Password: <your-master-password>"

# 알림 로그 조회 (최근 50건)
curl "http://127.0.0.1:3100/v1/admin/notifications/log?limit=50" \
  -H "X-Master-Password: <your-master-password>"
```

## 사용 방법

### CLI 명령어

```bash
# 초기화 (데이터 디렉토리 + 키스토어 생성)
waiaas init

# 데몬 시작 (마스터 패스워드 프롬프트)
waiaas start

# 상태 확인
waiaas status

# 데몬 중지
waiaas stop

# MCP 연동 설정 (Claude Desktop에 자동 등록)
waiaas mcp setup
waiaas mcp setup --agent <agent-id>    # 특정 에이전트
waiaas mcp setup --all                 # 모든 에이전트 일괄 설정
```

### TypeScript SDK

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  sessionToken: 'wai_sess_...',
});

// 지갑
const balance = await client.getBalance();
const address = await client.getAddress();
const assets = await client.getAssets();

// 토큰 전송
const tx = await client.sendToken({
  to: 'recipient...',
  amount: '0.5',
});

// 트랜잭션 조회
const txList = await client.listTransactions({ limit: 20 });
const txDetail = await client.getTransaction(txId);
const pending = await client.listPendingTransactions();

// 세션 갱신
const renewed = await client.renewSession(sessionId);
```

### Python SDK

```bash
cd python-sdk && pip install -e .
```

```python
from waiaas import WAIaaSClient

async with WAIaaSClient("http://127.0.0.1:3100", "wai_sess_...") as client:
    # 잔액 조회
    balance = await client.get_balance()
    print(f"{balance.balance} {balance.symbol}")

    # 지갑 주소
    address = await client.get_address()

    # 토큰 전송
    tx = await client.send_token("recipient...", "0.5")

    # 보유 자산 목록
    assets = await client.get_assets()

    # 트랜잭션 조회
    txs = await client.list_transactions(limit=20)
    detail = await client.get_transaction(tx_id)

    # 세션 갱신
    renewed = await client.renew_session(session_id)
```

### MCP 연동 (AI 에이전트)

MCP(Model Context Protocol)를 지원하는 AI 에이전트(Claude 등)에서 WAIaaS를 도구로 사용할 수 있다.

**자동 설정 (권장):**

```bash
# Claude Desktop에 MCP 서버 자동 등록
waiaas mcp setup
```

`waiaas mcp setup`은 에이전트별 세션 토큰을 자동 발급하고, Claude Desktop 설정 파일에 MCP 서버를 등록한다. `--all` 플래그로 모든 에이전트를 일괄 설정할 수 있다.

**수동 설정:**

```json
{
  "mcpServers": {
    "waiaas": {
      "command": "node",
      "args": ["/path/to/waiaas/packages/mcp/dist/index.js"],
      "env": {
        "WAIAAS_BASE_URL": "http://127.0.0.1:3100",
        "WAIAAS_SESSION_TOKEN": "wai_sess_..."
      }
    }
  }
}
```

**MCP 도구 목록:**

| 도구 | 설명 |
|------|------|
| `send_token` | 토큰 전송 (SOL 등) |
| `get_balance` | 지갑 잔액 조회 |
| `get_address` | 지갑 주소 조회 |
| `list_transactions` | 트랜잭션 내역 조회 |
| `get_transaction` | 트랜잭션 상세 조회 |
| `get_nonce` | Owner 서명 검증용 nonce 조회 |

**MCP 리소스:**

| 리소스 | 설명 |
|--------|------|
| `waiaas://wallet/balance` | 현재 잔액 |
| `waiaas://wallet/address` | 지갑 주소 |
| `waiaas://system/status` | 데몬 상태 |

### Admin Web UI

데몬이 실행 중이면 브라우저에서 Admin Web UI에 접속할 수 있다:

```
http://127.0.0.1:3100/admin
```

마스터 패스워드로 로그인하면 다음 기능을 사용할 수 있다:

| 페이지 | 기능 |
|--------|------|
| **Dashboard** | 시스템 상태, Kill Switch 제어, 데몬 정보 |
| **Agents** | 에이전트 목록/생성, 상세 정보, 키 재생성 |
| **Sessions** | 활성 세션 목록, 세션 발급/해지 |
| **Policies** | 정책 티어 조회/수정 |
| **Notifications** | 알림 채널 상태, 테스트 전송, 알림 로그 |
| **Settings** | JWT 시크릿 교체, 데몬 종료 |

> Admin UI는 `config.toml`의 `daemon.admin_ui = true` (기본값)일 때 활성화된다.

## 보안 모델

### 3-tier 인증

WAIaaS는 세 가지 수준의 인증을 분리하여, 각 행위자에게 필요한 최소 권한만 부여한다.

| 인증 수준 | 대상 | 방식 | 용도 |
|-----------|------|------|------|
| **masterAuth** | 데몬 운영자 | 마스터 패스워드 (Argon2id) | 시스템 관리 (에이전트 생성, 정책 설정, 세션 관리) |
| **ownerAuth** | 자금 소유자 | SIWS/SIWE 서명 (요청마다) | 거래 승인, Kill Switch 복구 |
| **sessionAuth** | AI 에이전트 | JWT Bearer 토큰 (HS256) | 지갑 조회, 거래 요청, 세션 조회 |

### 4-tier 정책

거래 금액(USD 기준)에 따라 자동으로 보안 수준이 결정된다.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  $0 ──────── $10 ──────── $100 ──────── $500 ────────── │
│  │  INSTANT  │   NOTIFY   │    DELAY    │   APPROVAL  │ │
│  │  즉시 실행  │ 실행 + 알림 │ 5분 대기    │ Owner 승인  │ │
│  │           │            │ (취소 가능) │  (서명 필요) │ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| 티어 | 기본 기준 | 동작 |
|------|----------|------|
| **INSTANT** | ≤ $10 | 즉시 실행 |
| **NOTIFY** | ≤ $100 | 즉시 실행 + Owner에게 알림 |
| **DELAY** | ≤ $500 | 5분 대기 후 자동 실행 (Owner가 취소 가능) |
| **APPROVAL** | > $500 | Owner가 직접 서명해야 실행 |

> 기준 금액은 `config.toml`의 정책 설정 또는 Admin UI에서 커스터마이징 가능하다.

### 추가 보안 기능

- **Kill Switch** — 비상 시 모든 세션 즉시 해지, 키스토어 잠금, 진행 중 거래 취소
- **AutoStop Engine** — 연속 실패, 이상 시간대 거래, 임계값 근접 등 규칙 기반 자동 정지
- **알림** — Telegram, Discord, ntfy.sh 멀티 채널 알림 (최소 2개 채널 권장)
- **감사 로그** — 모든 거래와 관리 행위를 SQLite에 기록

## 기술 스택

| 영역 | 기술 |
|------|------|
| Runtime | Node.js 22 LTS |
| Package Manager | pnpm 9.x + Turborepo |
| HTTP Server | Hono 4.x (OpenAPIHono) |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| Crypto | sodium-native (guarded memory), Argon2id (KDF), jose (JWT) |
| Solana | @solana/kit 6.x |
| EVM | viem 2.x |
| Admin UI | Preact 10.x + @preact/signals + Vite 6.x |
| Desktop | Tauri 2.x (예정) |
| Schema | Zod SSoT → TypeScript → OpenAPI 3.0 → Drizzle |
| Oracle | CoinGecko API, Pyth Network, Chainlink |
| Test | Vitest 3.x |

## 프로젝트 상태

WAIaaS는 **활발히 개발 중**이며, v1.3.4까지 구현이 완료되었다.

- **42,123 LOC** / **895 테스트** / **8 패키지** 모노레포 + Python SDK
- **170개 플랜**, **488개 요구사항**, **75개 페이즈**, **19개 마일스톤** 완료

### 마일스톤 이력

| 버전 | 이름 | 내용 | 완료일 |
|------|------|------|--------|
| v0.1 | 리서치 및 기획 | 에이전트 지갑 컨셉, 기술 스택 비교, 아키텍처 조사 | 2026-02-05 |
| v0.2 | Self-Hosted 보안 지갑 설계 | 코어 아키텍처, 세션/트랜잭션, 보안 계층 | 2026-02-05 |
| v0.3 | 설계 논리 일관성 확보 | 37건 비일관성 해소, Enum SSoT | 2026-02-06 |
| v0.4 | 테스트 전략 수립 | 300+ 테스트 시나리오, 보안 공격 71건 | 2026-02-07 |
| v0.5 | 인증 모델 재설계 | 3-tier 인증, 세션 갱신, CLI 플로우 | 2026-02-07 |
| v0.6 | 블록체인 기능 확장 설계 | 토큰, 컨트랙트, DeFi, 가격 오라클 | 2026-02-08 |
| v0.7 | 구현 장애 요소 해소 | 25건 차단 요소 제거 | 2026-02-08 |
| v0.8 | Owner 선택적 등록 | 점진적 보안 해금 모델 | 2026-02-09 |
| v0.9 | MCP 세션 관리 자동화 | MCP 환경 세션 자동 갱신 | 2026-02-09 |
| v0.10 | 구현 전 설계 완결성 확보 | 설계 완결성 검증 | 2026-02-09 |
| v1.0 | 구현 계획 수립 | 구현 로드맵, 목표 문서 | 2026-02-09 |
| **v1.1** | **코어 인프라 + 기본 전송** | 모노레포, 데몬, 키스토어, Solana 전송 | 2026-02-10 |
| **v1.2** | **인증 + 정책 엔진** | masterAuth, sessionAuth, 4-tier 정책 | 2026-02-10 |
| **v1.3** | **SDK + MCP + 알림** | TS/Python SDK, MCP 서버, 알림 시스템 | 2026-02-11 |
| v1.3.1 | Admin Web UI 설계 | Preact SPA 설계 문서 | 2026-02-11 |
| **v1.3.2** | **Admin Web UI 구현** | 6페이지 관리 대시보드 | 2026-02-11 |
| v1.3.3 | MCP 다중 에이전트 지원 | 에이전트별 MCP 토큰 격리 | 2026-02-11 |
| **v1.3.4** | **알림 이벤트 트리거 + 어드민 알림** | 8개 이벤트, 알림 로그, Admin 알림 패널 | 2026-02-12 |

### 향후 계획

| 버전 | 이름 | 내용 |
|------|------|------|
| v1.4 | 토큰 + 컨트랙트 확장 | SPL/ERC-20 전송, 컨트랙트 호출, Approve |
| v1.5 | DeFi + 가격 오라클 | Action Provider, Jupiter Swap, IPriceOracle, USD 정책 |
| v1.5.1 | x402 클라이언트 | x402 자동 결제, 유료 API 자율 소비, 도메인 정책 |
| v1.6 | 운영 인프라 | 모니터링, 잔액 알림, 백업 |

## 개발 참여 (Development)

### 소스 빌드

```bash
git clone https://github.com/anthropics/waiaas.git
cd waiaas
pnpm install
pnpm build
```

### 테스트

```bash
# 전체 테스트
pnpm test

# 특정 패키지 테스트
pnpm --filter @waiaas/core test
pnpm --filter @waiaas/daemon test

# 커버리지
pnpm --filter @waiaas/daemon exec vitest run --coverage
```

### 린트 + 타입 체크

```bash
pnpm lint
pnpm typecheck
pnpm format:check
```

### Admin UI 개발 모드

```bash
# Vite dev server (HMR)
pnpm --filter @waiaas/admin dev
```

Admin UI를 수정하면 Vite가 자동으로 핫 리로드한다. 빌드 시 결과물은 `packages/daemon/public/admin/`에 복사된다.

## 라이선스

TBD
