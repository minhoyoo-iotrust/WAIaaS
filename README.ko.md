# WAIaaS

**AI 에이전트를 위한 Wallet-as-a-Service**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-3%2C599_passing-brightgreen.svg)](#)

AI 에이전트가 안전하게 온체인 거래를 수행하는 Self-Hosted 지갑 데몬. 에이전트 주인(사람)이 자금 통제권을 유지한다.

[English](README.md)

## Why WAIaaS?

기존 WaaS(Wallet-as-a-Service)는 사용자가 **사람**이라는 것을 가정한다. AI 에이전트가 자율적으로 거래를 수행하려면 근본적으로 다른 접근이 필요하다.

현재 에이전트 지갑 시장은 두 극단으로 나뉘어 있다:

| 접근 방식 | 문제점 |
|-----------|--------|
| **완전 자율** (에이전트가 키 직접 보유) | 에이전트 해킹 시 자금 전액 탈취 위험 |
| **완전 커스터디** (중앙 서비스 관리) | 서비스 제공자에 대한 신뢰 의존, 단일 장애점 |

WAIaaS는 이 간극을 해소한다:

- **자율성과 통제의 균형** -- 에이전트는 소액을 즉시 처리하고, 고액은 주인의 승인을 거친다
- **서비스 제공자 의존 없음** -- 모든 것이 사용자의 로컬 머신에서 동작한다
- **다층 방어** -- 하나의 보안 계층이 뚫려도 다른 계층이 자금을 보호한다

자세한 내용은 [docs/why-waiaas/](docs/why-waiaas/)를 참고한다.

## 핵심 특징

- **Self-Hosted 로컬 데몬** -- 중앙 서버가 없다. 키 생성, 트랜잭션 서명, 정책 평가가 모두 사용자의 로컬 데몬에서 수행된다.
- **Chain-Agnostic 3계층 보안** -- Solana, EVM 등 모든 체인에 동일한 보안 모델이 적용된다.
- **멀티체인 지원** -- Solana (SPL / Token-2022)와 EVM (Ethereum, Base 등 / ERC-20)을 `IChainAdapter` 인터페이스로 지원한다.
- **토큰, 컨트랙트, DeFi** -- 네이티브 전송, 토큰 전송, 임의 스마트 컨트랙트 호출, Approve 관리, 배치 트랜잭션. Action Provider 플러그인으로 Jupiter Swap 등 DeFi 프로토콜을 추상화한다.
- **USD 기준 정책 평가** -- 가격 오라클(CoinGecko / Pyth / Chainlink)을 통해 토큰 종류와 무관하게 달러 기준으로 정책 티어를 분류한다.
- **다양한 인터페이스** -- REST API, TypeScript SDK, Python SDK, MCP 서버, CLI, Admin Web UI, Desktop App (Tauri), Telegram Bot.

## 빠른 시작

### 방법 A: npm (전역 설치)

```bash
npm install -g @waiaas/cli

# 데이터 디렉토리 + 키스토어 초기화
waiaas init

# 데몬 시작 (마스터 패스워드 입력 프롬프트)
waiaas start
```

### 방법 B: Docker

```bash
# 저장소 클론
git clone https://github.com/anthropics/waiaas.git
cd waiaas

# Docker Compose로 시작
docker compose up -d

# 로그 확인
docker compose logs -f
```

데몬이 `http://127.0.0.1:3100`에서 실행된다.

### 지갑 생성 + 세션 발급

```bash
# 지갑 생성 (masterAuth 필요)
curl -X POST http://127.0.0.1:3100/v1/wallets \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"name": "my-wallet", "chain": "solana", "network": "devnet"}'

# 세션 토큰 발급 (masterAuth 필요)
curl -X POST http://127.0.0.1:3100/v1/sessions \
  -H "Content-Type: application/json" \
  -H "X-Master-Password: <your-master-password>" \
  -d '{"walletId": "<wallet-id>"}'
```

응답에서 받은 `token` 값을 에이전트 환경변수에 설정한다:

```bash
export WAIAAS_SESSION_TOKEN=wai_sess_eyJhbGciOiJIUzI1NiJ9...
```

### SDK로 첫 거래

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

## 아키텍처

```
+---------------------------------------------------------+
|  AI Agent                                               |
|  (Claude, GPT, LangChain, CrewAI, ...)                  |
+------------+-----------------+--------------------------+
             |                 |
     +-------v-------+  +-----v--------+
     | TS/Python SDK  |  |  MCP Server  |
     +-------+-------+  +------+-------+
             |                 |
             +--------+--------+
                      | HTTP (127.0.0.1:3100)
              +-------v--------+
              |  WAIaaS Daemon  |
              |                |
              |  +----------+  |     +-------------+
              |  | REST API |  |     | Desktop App |
              |  |  (Hono)  |  |     |  (Tauri 2)  |
              |  +----+-----+  |     +------+------+
              |       |        |            |
              |  +----v-----+  |     +------v------+
              |  | Pipeline |  |     | Telegram Bot|
              |  | (6-stage)|  |     +-------------+
              |  +----+-----+  |
              |       |        |
              |  +----v-----+  |
              |  | Policy   |  |
              |  | Engine   |  |
              |  +----+-----+  |
              |       |        |
              |  +----v-----+  |
              |  | Chain    |  |
              |  | Adapters |  |
              |  +----+-----+  |
              +-------+--------+
                      |
          +-----------+-----------+
          |           |           |
   +------v--+ +-----v----+ +---v---+
   | Solana  | |   EVM    | |  ...  |
   |(Mainnet)| |(Ethereum)| |       |
   +---------+ +----------+ +-------+
```

## 모노레포 구조

```
waiaas/
├── packages/
│   ├── core/               # 도메인 모델, 인터페이스, Zod 스키마, 에러 코드
│   ├── daemon/             # Self-Hosted 데몬 (Hono HTTP, SQLite, Keystore)
│   ├── adapters/
│   │   ├── solana/         # Solana 어댑터 (@solana/kit 6.x)
│   │   └── evm/            # EVM 어댑터 (viem 2.x)
│   ├── cli/                # CLI 도구 (waiaas 명령어)
│   ├── sdk/                # TypeScript SDK (외부 의존성 0개)
│   ├── mcp/                # MCP Server (stdio 전송)
│   └── admin/              # Admin Web UI (Preact + Signals)
├── python-sdk/             # Python SDK (httpx + Pydantic v2)
├── docs/                   # 사용자 문서
│   └── why-waiaas/         # 배경 설명 글
├── skills/                 # API 스킬 파일 (MCP 리소스)
└── objectives/             # 마일스톤 목표 문서
```

**수치 요약:** TypeScript ~124,700줄 (9개 패키지) + Python SDK, 3,599개 테스트, 50+ REST 엔드포인트, 18+ MCP 도구.

## 인터페이스

| 인터페이스 | 대상 | 설명 |
|-----------|------|------|
| **REST API** | 모든 클라이언트 | 50+ 엔드포인트, OpenAPI 3.0 |
| **TypeScript SDK** | Node.js 에이전트 | 외부 의존성 0개, 완전한 타입 |
| **Python SDK** | Python 에이전트 | httpx + Pydantic v2 |
| **MCP** | AI 에이전트 (Claude 등) | 18+ 도구, stdio 전송 |
| **CLI** | 개발자 / 운영자 | init, start, stop, status, mcp setup, upgrade |
| **Admin Web UI** | 관리자 | 대시보드, 지갑, 세션, 정책, 알림, 설정 |
| **Desktop App** | Owner (주인) | Tauri 2, 시스템 트레이, 승인 UI |
| **Telegram Bot** | Owner (주인) | 인라인 키보드로 거래 승인/거부 |

## 보안 모델

### 3-Tier 인증

WAIaaS는 세 가지 수준의 인증을 분리하여, 각 행위자에게 필요한 최소 권한만 부여한다.

| 인증 수준 | 대상 | 방식 | 용도 |
|-----------|------|------|------|
| **masterAuth** | 데몬 운영자 | 마스터 패스워드 (Argon2id) | 시스템 관리 (지갑 생성, 정책 설정, 세션 관리) |
| **ownerAuth** | 자금 소유자 | SIWS/SIWE 서명 (요청마다) | 거래 승인, Kill Switch 복구 |
| **sessionAuth** | AI 에이전트 | JWT Bearer (HS256) | 지갑 조회, 거래 요청 |

### 4-Tier 정책

거래 금액(USD 기준)에 따라 자동으로 보안 수준이 결정된다.

| 티어 | 기본 기준 | 동작 |
|------|----------|------|
| **INSTANT** | <= $10 | 즉시 실행 |
| **NOTIFY** | <= $100 | 즉시 실행 + Owner에게 알림 |
| **DELAY** | <= $500 | 5분 대기 후 자동 실행 (Owner가 취소 가능) |
| **APPROVAL** | > $500 | Owner가 직접 서명해야 실행 |

기준 금액은 config.toml 또는 Admin UI에서 커스터마이징 가능하다. 누적 USD 지출 한도(일간/월간 롤링 윈도우), 토큰 허용 목록, 컨트랙트 화이트리스트, 승인된 지출자 등 총 12가지 정책 타입을 지원한다.

### 추가 보안 기능

- **Kill Switch** -- 3-state 비상 정지 (ACTIVE / SUSPENDED / LOCKED), dual-auth 복구
- **AutoStop Engine** -- 4가지 규칙 기반 자동 정지 (연속 실패, 이상 시간대, 임계값 근접 등)
- **알림** -- 4채널 알림 (Telegram, Discord, ntfy, Slack)
- **감사 로그** -- 모든 거래와 관리 행위를 SQLite에 기록

## 설정

설정 파일은 `~/.waiaas/config.toml`에 위치한다. 모든 섹션은 **평탄(flat) 구조**이며 중첩을 허용하지 않는다.

```toml
[daemon]
port = 3100
hostname = "127.0.0.1"
log_level = "info"
admin_ui = true

[rpc]
solana_mainnet = "https://api.mainnet-beta.solana.com"
solana_devnet = "https://api.devnet.solana.com"

[security]
session_ttl = 86400
max_sessions_per_wallet = 5
```

모든 설정은 `WAIAAS_{SECTION}_{KEY}` 형식의 환경변수로 오버라이드할 수 있다:

```bash
WAIAAS_DAEMON_PORT=4000
WAIAAS_DAEMON_LOG_LEVEL=debug
WAIAAS_RPC_SOLANA_MAINNET="https://my-rpc.example.com"
```

런타임 변경이 유용한 설정(속도 제한, 정책 기본값 등)은 Admin Web UI에서 데몬 재시작 없이 조정할 수 있다.

## 문서

| 문서 | 설명 |
|------|------|
| [배포 가이드](docs/deployment.md) | Docker, npm, 설정 레퍼런스 |
| [API 레퍼런스](docs/api-reference.md) | REST API OpenAPI 스펙 |
| [Why WAIaaS?](docs/why-waiaas/) | AI 에이전트 지갑 보안 배경 |

## 기여하기

기여를 환영합니다! 개발 환경 설정, 코드 스타일, 테스트, PR 가이드라인은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해 주세요.

## 라이선스

[MIT](LICENSE) -- Copyright (c) 2026 WAIaaS Contributors
