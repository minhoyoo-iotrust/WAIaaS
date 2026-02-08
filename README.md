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
| **CLI** | 개발자/운영자 | init/start/stop/status |
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
│   │   ├── solana/         # Solana 어댑터 (@solana/kit 3.x)
│   │   └── evm/            # EVM 어댑터 (viem 2.x)
│   ├── cli/                # CLI 도구 (waiaas 명령어)
│   ├── sdk/                # TypeScript SDK
│   └── mcp/                # MCP Server
├── objectives/             # 마일스톤별 목표 문서
└── docs/                   # 설계 문서
```

## 빠른 시작

> **참고:** WAIaaS는 현재 설계 단계이며 아래 명령어는 구현 예정 스펙이다.

### 1. 설치

```bash
npm install -g @waiaas/cli
```

### 2. 초기화 + 데몬 시작 + 세션 발급 (quickstart)

```bash
# 한 번에 초기화, 데몬 시작, 에이전트 생성, 세션 토큰 발급
waiaas init --quickstart --owner <your-wallet-address>
```

출력:

```
✓ 마스터 패스워드 생성 (~/.waiaas/.master-password)
✓ 데몬 시작 (127.0.0.1:3100)
✓ 에이전트 생성 (my-agent)
✓ 세션 토큰 발급

세션 토큰: wai_sess_eyJhbGciOiJIUzI1NiJ9...

다음 단계:
  export WAIAAS_SESSION_TOKEN=wai_sess_eyJhbGciOiJIUzI1NiJ9...
```

### 3. SDK로 첫 거래

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

## 설치 방법

### CLI

```bash
# npm 글로벌 설치
npm install -g @waiaas/cli

# 또는 npx로 직접 실행
npx @waiaas/cli init
```

**요구사항:** Node.js 22 LTS 이상

### Desktop App (Tauri)

macOS, Windows, Linux용 데스크톱 앱을 제공한다. 시스템 트레이에서 데몬 상태를 확인하고 거래를 승인/거부할 수 있다.

- 3색 트레이 아이콘: 정상(초록), 대기 중(노랑), 긴급 정지(빨강)
- Setup Wizard로 5단계 초기 설정
- WalletConnect로 모바일 지갑 연결

```
다운로드: https://github.com/anthropics/waiaas/releases (구현 예정)
```

### Docker

```yaml
# docker-compose.yml
services:
  waiaas:
    image: waiaas/daemon:latest
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - waiaas-data:/home/waiaas/.waiaas
    environment:
      - WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/master_password
    secrets:
      - master_password
    stop_grace_period: 35s
    user: "1001:1001"

volumes:
  waiaas-data:

secrets:
  master_password:
    file: ./master_password.txt
```

```bash
docker compose up -d
```

## 사용 방법

### CLI 명령어

```bash
# 초기화 (데이터 디렉토리 + 키스토어 생성)
waiaas init

# 개발 모드 시작 (고정 패스워드 "waiaas-dev")
waiaas start --dev

# 데몬 시작 (포그라운드)
waiaas start

# 백그라운드 데몬
waiaas start --daemon

# 상태 확인
waiaas status

# 에이전트 생성
waiaas agent create --owner <wallet-address>

# 세션 토큰 발급
waiaas session create --agent <agent-name>

# 데몬 중지
waiaas stop
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
const assets = await client.getAssets();        // 네이티브 + SPL/ERC-20

// 토큰 전송
const tx = await client.sendToken({
  to: 'recipient...',
  amount: '0.5',
  token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC (없으면 네이티브)
});

// 컨트랙트 호출
await client.contractCall({
  chain: 'solana',
  programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  instructionData: '...',
  accounts: [...],
});

// DeFi 액션 (Action Provider)
const actions = await client.listActions();
await client.executeAction('jupiter-swap', 'swap', {
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000000',  // 1 SOL
  slippageBps: 50,
});

// 트랜잭션 조회
const txList = await client.listTransactions({ limit: 20 });
const txDetail = await client.getTransaction(txId);
```

### Python SDK

```python
from waiaas import WAIaaSClient

client = WAIaaSClient(
    base_url="http://127.0.0.1:3100",
    session_token="wai_sess_..."
)

# 잔액 조회
balance = await client.get_balance()

# 토큰 전송
tx = await client.send_token({
    "to": "recipient...",
    "amount": "0.5",
})

# 보유 자산 목록
assets = await client.get_assets()

# 트랜잭션 목록
txs = await client.list_transactions(limit=20)
```

### MCP 연동 (AI 에이전트)

MCP(Model Context Protocol)를 지원하는 AI 에이전트(Claude 등)에서 WAIaaS를 도구로 사용할 수 있다.

**Claude Desktop 설정 예시:**

```json
{
  "mcpServers": {
    "waiaas": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": {
        "WAIAAS_SESSION_TOKEN": "wai_sess_..."
      }
    }
  }
}
```

**MCP 도구 목록:**

| 도구 | 설명 |
|------|------|
| `waiaas_get_balance` | 지갑 잔액 조회 |
| `waiaas_send_transaction` | 트랜잭션 전송 |
| `waiaas_list_transactions` | 트랜잭션 내역 조회 |
| `waiaas_create_session` | 새 세션 생성 |
| `waiaas_get_session` | 세션 정보 조회 |
| `waiaas_renew_session` | 세션 갱신 |

**MCP 리소스:**

| 리소스 | 설명 |
|--------|------|
| `waiaas://balance` | 현재 잔액 |
| `waiaas://transactions` | 트랜잭션 목록 |
| `waiaas://sessions` | 활성 세션 목록 |

## 보안 모델

### 3-tier 인증

WAIaaS는 세 가지 수준의 인증을 분리하여, 각 행위자에게 필요한 최소 권한만 부여한다.

| 인증 수준 | 대상 | 방식 | 용도 |
|-----------|------|------|------|
| **masterAuth** | 데몬 운영자 | 마스터 패스워드 | 시스템 관리 (에이전트 생성, 정책 설정, 세션 관리) |
| **ownerAuth** | 자금 소유자 | SIWS/SIWE 서명 (요청마다) | 거래 승인, Kill Switch 복구 (2개 엔드포인트만) |
| **sessionAuth** | AI 에이전트 | JWT Bearer 토큰 | 지갑 조회, 거래 요청, 세션 조회 |

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

> 기준 금액은 `config.toml`에서 커스터마이징 가능하다.

### 추가 보안 기능

- **Kill Switch** — 비상 시 모든 세션 즉시 해지, 키스토어 잠금, 진행 중 거래 취소
- **AutoStop Engine** — 연속 실패, 이상 시간대 거래, 임계값 근접 등 5가지 규칙 기반 자동 정지
- **알림** — Telegram, Discord, ntfy.sh 멀티 채널 알림 (최소 2개 채널 권장)
- **감사 로그** — 모든 거래와 관리 행위를 SQLite에 기록

## 설정

WAIaaS의 설정 파일은 `~/.waiaas/config.toml`에 위치한다.

```toml
# 데몬 설정
[daemon]
hostname = "127.0.0.1"      # localhost 전용 (보안상 변경 비권장)
port = 3100
log_level = "info"

# 블록체인 RPC 엔드포인트
[rpc]
solana = "https://api.mainnet-beta.solana.com"
# ethereum = "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"

# 보안 설정
[security]
session_max_ttl = "7d"       # 세션 최대 수명
session_default_ttl = "24h"  # 세션 기본 수명

[security.rate_limit]
global = 100                 # 전역 RPM
per_session = 300            # 세션당 RPM
per_transaction = 10         # 거래 요청 RPM

[security.policy_defaults]
instant_threshold_usd = 10
notify_threshold_usd = 100
delay_threshold_usd = 500
delay_cooldown = "5m"
approval_timeout = "1h"

# 알림 채널
[notifications.telegram]
bot_token = ""
chat_id = ""

[notifications.discord]
webhook_url = ""

[notifications.ntfy]
topic = ""
server = "https://ntfy.sh"

# WalletConnect (선택)
[walletconnect]
project_id = ""              # Reown Cloud 프로젝트 ID
```

## 프로젝트 상태

WAIaaS는 현재 **설계 단계**이며, 코드 구현은 아직 시작되지 않았다.

### 완료된 마일스톤

| 버전 | 이름 | 내용 | 완료일 |
|------|------|------|--------|
| v0.1 | 리서치 및 기획 | 에이전트 지갑 컨셉, 기술 스택 비교, 아키텍처 조사 | 2026-02-05 |
| v0.2 | Self-Hosted 보안 지갑 설계 | 코어 아키텍처, 세션/트랜잭션, 보안 계층, 클라이언트 인터페이스 | 2026-02-05 |
| v0.3 | 설계 논리 일관성 확보 | 37건 비일관성 해소, Enum SSoT, config.toml 통일 | 2026-02-06 |
| v0.4 | 테스트 전략 수립 | 300+ 테스트 시나리오, 보안 공격 71건, CI/CD 파이프라인 | 2026-02-07 |
| v0.5 | 인증 모델 재설계 + DX 개선 | 3-tier 인증, 세션 갱신, CLI 플로우, DX 스펙 | 2026-02-07 |
| v0.6 | 블록체인 기능 확장 설계 | 토큰 확장, 컨트랙트 호출, DeFi 추상화, 가격 오라클 | 2026-02-08 |

### 설계 산출물

- **68개 플랜**, **185개 요구사항**, **25개 페이즈** 완료
- **30개 설계 문서** (아키텍처, 프로토콜, 보안, API 스펙, 테스트 전략)

### 향후 계획

| 버전 | 이름 | 내용 |
|------|------|------|
| v0.7 | 구현 장애 요소 해소 | 설계→구현 전환을 위한 29건 차단 요소 제거 |
| v0.8 | Owner 선택적 등록 | Owner 없이 시작, 점진적 보안 해금 모델 |
| v0.9 | MCP 세션 관리 자동화 | MCP 환경 세션 자동 갱신/재발급 |
| v1.0 | 코어 구현 | 데몬, 키스토어, 세션, 트랜잭션 파이프라인 구현 (예정) |

## 기술 스택

| 영역 | 기술 |
|------|------|
| Runtime | Node.js 22 LTS |
| HTTP Server | Hono 4.x (OpenAPIHono) |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| Crypto | sodium-native (guarded memory), argon2 (KDF), jose (JWT) |
| Solana | @solana/kit 3.x |
| EVM | viem 2.x |
| Desktop | Tauri 2.x + React 18 + TailwindCSS 4 |
| Schema | Zod SSoT → TypeScript → OpenAPI 3.0 |
| Oracle | CoinGecko API, Pyth Network, Chainlink |

## 라이선스

TBD

---

> **이 프로젝트는 설계 단계입니다.** 위 명령어와 코드 예시는 설계 문서 기반의 예정 스펙이며, 실제 구현은 진행 중입니다.
