# 마일스톤 m02: Self-Hosted 보안 지갑 설계 및 구현

## 목표
중앙 서버 없이 사용자가 직접 설치하여 운영하는 에이전트 지갑 시스템을 설계하고 구현한다. 특정 블록체인 프로토콜에 의존하지 않는 체인 무관(Chain-Agnostic) 보안 모델을 적용하여, 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다.

## 핵심 원칙

### 1. 서버 의존성 제거
- 중앙 서버 없이 사용자 로컬 환경에서 완전히 동작
- 서비스 제공자가 사용자 자금에 접근 불가
- 사용자가 완전한 통제권 보유

### 2. 체인 무관 보안 (Chain-Agnostic Security)
- 특정 블록체인의 스마트 컨트랙트나 프로토콜에 의존하지 않음
- Solana, EVM, Bitcoin 등 모든 체인에 동일한 보안 모델 적용 가능
- 보안 로직은 로컬 데몬에서 처리

### 3. 다층 방어 (Defense in Depth)
- 단일 보안 계층 실패 시에도 다른 계층이 보호
- 키 유출 시에도 피해 최소화 구조
- 주인(Owner)의 개입 시간 확보

---

## 보안 계층 설계

### Layer 1: 세션 기반 인증 (Session-Based Auth)

영구 키 노출 대신 단기 세션 토큰으로 권한을 제한한다.

**세션 흐름:**
```
1. 에이전트 시작
2. 주인에게 세션 승인 요청 (알림)
3. 주인이 개인 지갑으로 승인 서명
4. 세션 토큰 발급 (24시간 유효)
5. 에이전트가 세션 토큰으로 API 호출
6. 만료 시 재승인 필요
```

**세션 제약 조건:**
| 제약 | 설명 | 기본값 |
|------|------|--------|
| 만료 시간 (Expiry) | 세션 유효 기간 | 24시간 |
| 세션 한도 (Session Limit) | 세션 내 최대 거래 총액 | 10 SOL |
| 단건 한도 (Per-TX Limit) | 단일 거래 최대 금액 | 1 SOL |
| 허용 작업 (Allowed Ops) | 허용된 작업 유형 | transfer, swap |

**구현 항목:**
- [ ] 세션 토큰 발급 (Owner 서명 기반)
- [ ] 세션 만료 자동 처리
- [ ] 세션별 사용량 추적
- [ ] 세션 즉시 폐기 기능
- [ ] 활성 세션 목록 관리

**보안 효과:**
- 토큰 유출 시에도 만료 후 무효화
- 세션 한도로 피해 범위 제한
- 주인이 의심 시 즉시 폐기 가능

---

### Layer 2: 시간 지연 + 승인 (Time-Lock + Approval)

고액 거래에 대기 시간을 적용하고 주인 승인을 요구한다.

**거래 등급:**
| 등급 | 금액 기준 | 처리 방식 |
|------|----------|----------|
| 즉시 | < 0.1 SOL | 바로 실행 |
| 알림 | 0.1 ~ 1 SOL | 실행 + 주인에게 알림 |
| 대기 | 1 ~ 5 SOL | 10분 대기 + 알림 (취소 가능) |
| 승인 | > 5 SOL | 주인 승인 필요 |

**구현 항목:**
- [ ] 금액별 처리 정책 엔진
- [ ] 대기 큐 관리 (Pending Transactions)
- [ ] 주인 승인 인터페이스 (알림 → 승인/거부)
- [ ] 대기 중 거래 취소 기능
- [ ] 타임아웃 처리 (미승인 시 자동 취소)

**보안 효과:**
- 이상 거래 발생 시 취소할 시간 확보
- 고액 거래는 명시적 승인 필요
- 해커가 급하게 빼가기 어려움

---

### Layer 3: 실시간 알림 + 긴급 정지 (Monitoring + Kill Switch)

모든 거래를 실시간으로 주인에게 알리고, 이상 시 즉시 정지한다.

**알림 채널:**
- Push Notification (모바일/데스크톱)
- Telegram Bot
- Discord Webhook
- Email (선택)

**긴급 정지 트리거:**
- 주인이 수동으로 정지 명령
- 연속 실패 거래 임계값 초과
- 비정상 시간대 거래 시도
- 세션 한도 90% 도달 시 경고

**구현 항목:**
- [ ] 멀티 채널 알림 시스템
- [ ] 긴급 정지 (Kill Switch) API
- [ ] 자동 정지 규칙 엔진
- [ ] 정지 후 복구 절차

**보안 효과:**
- 이상 활동 즉시 인지
- 신속한 대응으로 피해 최소화
- 자동 방어로 24시간 보호

---

## Owner 지갑 연결

주인(Owner)은 다양한 방식으로 자신의 지갑을 연결하여 세션 승인, 거래 승인 등을 수행한다.

### 연결 방식

| 방식 | 설명 | 지원 지갑 |
|------|------|----------|
| **브라우저 익스텐션** | 표준 Wallet Adapter 인터페이스 | Phantom, Backpack, MetaMask 등 |
| **WalletConnect** | QR 코드 기반 모바일 연결 | 대부분의 모바일 지갑 |
| **하드웨어 지갑** | USB/Bluetooth 연결 | Ledger, D'CENT, Trezor |

### 구현 항목
- [ ] Solana Wallet Adapter 연동 (@solana/wallet-adapter)
- [ ] WalletConnect v2 연동
- [ ] Ledger SDK 연동 (직접 연결)
- [ ] D'CENT SDK 연동
- [ ] 연결 상태 관리 및 재연결 처리

### 서명 요청 흐름
```
1. 데몬이 승인 필요 이벤트 발생
2. 연결된 지갑으로 서명 요청 전송
3. 사용자가 지갑에서 서명 승인
4. 서명 결과를 데몬이 수신하여 처리
```

---

## 배포 형태

### Option A: CLI Daemon (개발자용)

```bash
# 설치
npm install -g @waiaas/daemon

# 초기화
waiaas init

# 주인 지갑 연결
waiaas link-owner --address <OWNER_WALLET>

# 데몬 실행
waiaas start --port 3000
```

**구현 항목:**
- [ ] npm 패키지 배포
- [ ] 초기 설정 CLI 위저드
- [ ] 백그라운드 데몬 모드
- [ ] 로그 레벨 설정
- [ ] 상태 확인 명령어 (`waiaas status`)

---

### Option B: Desktop App (비개발자용)

Electron/Tauri 기반 데스크톱 애플리케이션

**주요 화면:**
- 대시보드: 잔액, 오늘 거래, 세션 상태
- 거래 내역: 필터링, 검색, 상세 보기
- 대기 중 거래: 승인/거부 인터페이스
- 설정: 알림, 정책, 연결된 지갑

**구현 항목:**
- [ ] macOS / Windows / Linux 빌드
- [ ] 시스템 트레이 상주
- [ ] 알림 센터 연동
- [ ] 자동 업데이트

---

### Option C: Docker (서버 환경)

```yaml
# docker-compose.yml
version: '3.8'
services:
  waiaas:
    image: waiaas/daemon:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - WAIAAS_OWNER_ADDRESS=...
```

**구현 항목:**
- [ ] Docker Hub 이미지 배포
- [ ] docker-compose 템플릿
- [ ] Kubernetes Helm Chart (선택)

---

## 통합 인터페이스

### REST API

```
# 지갑
GET    /v1/wallet/balance              # 잔액 조회
GET    /v1/wallet/address              # 주소 조회

# 세션
POST   /v1/sessions                    # 세션 생성 요청
GET    /v1/sessions                    # 활성 세션 목록
DELETE /v1/sessions/:id                # 세션 폐기

# 거래
POST   /v1/transactions/send           # 전송
GET    /v1/transactions                # 거래 내역
GET    /v1/transactions/pending        # 대기 중 거래

# 주인 전용
POST   /v1/owner/approve/:txId         # 거래 승인
POST   /v1/owner/reject/:txId          # 거래 거부
POST   /v1/owner/kill-switch           # 긴급 정지
```

**구현 항목:**
- [ ] OpenAPI 3.0 스펙
- [ ] 세션 토큰 인증 미들웨어
- [ ] Owner 서명 검증 미들웨어
- [ ] Rate Limiting
- [ ] 에러 코드 체계

---

### SDK

**TypeScript:**
```typescript
import { WAIaaS } from '@waiaas/sdk';

const wallet = new WAIaaS({
  endpoint: 'http://localhost:3000',
  sessionToken: process.env.WAIAAS_SESSION
});

// 잔액 확인
const balance = await wallet.getBalance();

// 전송
const tx = await wallet.send({
  to: 'recipient.sol',
  amount: 0.5,
  asset: 'SOL'
});
```

**Python:**
```python
from waiaas import WAIaaS

wallet = WAIaaS(
    endpoint='http://localhost:3000',
    session_token=os.environ['WAIAAS_SESSION']
)

balance = await wallet.get_balance()
tx = await wallet.send(to='recipient.sol', amount=0.5, asset='SOL')
```

**구현 항목:**
- [ ] TypeScript SDK (@waiaas/sdk)
- [ ] Python SDK (waiaas)
- [ ] 자동 재시도 로직
- [ ] 타입 정의 완비

---

### MCP Server (LLM 에이전트용)

```json
{
  "mcpServers": {
    "waiaas": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": {
        "WAIAAS_ENDPOINT": "http://localhost:3000",
        "WAIAAS_SESSION": "..."
      }
    }
  }
}
```

**MCP Tools:**
| Tool | 설명 |
|------|------|
| `get_balance` | 잔액 조회 |
| `send_token` | 토큰 전송 |
| `get_address` | 지갑 주소 |
| `list_transactions` | 거래 내역 |

**구현 항목:**
- [ ] MCP Server 패키지 (@waiaas/mcp)
- [ ] Tool 정의 및 구현
- [ ] Claude Desktop 연동 가이드

---

## 주인-에이전트 권한 모델

### Owner (주인)
- Agent Wallet 생성/삭제
- 세션 승인/폐기
- 거래 승인/거부
- 정책 설정
- 긴급 정지
- 알림 설정

### Agent (에이전트)
- 세션 범위 내 거래
- 잔액 조회
- 거래 내역 조회
- 세션 상태 확인

### 인증 방식
- Owner: 연결된 지갑으로 서명 (익스텐션, WalletConnect, 하드웨어)
- Agent: 세션 토큰

---

## 멀티체인 확장성

### 체인 추상화 계층

```
┌─────────────────────────────────────────────────────────────────┐
│                    WAIaaS Core (체인 무관)                       │
│                                                                  │
│   세션 관리 │ 정책 엔진 │ 알림 │ 로깅                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Solana Adapter  │ │ EVM Adapter     │ │ Future Adapter  │
│                 │ │                 │ │                 │
│ @solana/web3.js │ │ ethers.js       │ │ ...             │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Adapter 인터페이스:**
```typescript
interface ChainAdapter {
  createWallet(): Promise<Wallet>;
  getBalance(address: string): Promise<Balance>;
  signTransaction(tx: Transaction): Promise<SignedTx>;
  broadcastTransaction(signedTx: SignedTx): Promise<TxHash>;
  getTransaction(hash: string): Promise<TxDetails>;
}
```

**구현 항목:**
- [ ] Chain Adapter 인터페이스 정의
- [ ] Solana Adapter 구현 (1순위)
- [ ] EVM Adapter 구현 (2순위)
- [ ] 체인별 설정 분리

---

## 기술 스택

### Core
- **Runtime**: Node.js 20+ 또는 Bun
- **Language**: TypeScript 5+
- **API Framework**: Hono 또는 Fastify

### Storage (로컬)
- **키 저장**: 암호화 파일 (AES-256-GCM)
- **데이터**: SQLite (거래 내역, 세션, 설정)
- **캐시**: In-memory LRU

### Desktop App
- **Framework**: Tauri (경량) 또는 Electron
- **UI**: React + Tailwind CSS

### Wallet Connection
- **Solana**: @solana/wallet-adapter
- **EVM**: wagmi / viem
- **Cross-chain**: WalletConnect v2

### Notification
- **Push**: ntfy.sh 또는 Pushover
- **Messaging**: Telegram Bot API, Discord Webhook

---

## 성공 기준

### 보안
- [ ] 세션 만료 후 토큰 거부됨 검증
- [ ] 세션 한도 초과 시 거래 거부됨 검증
- [ ] 단건 한도 초과 시 거래 거부됨 검증
- [ ] 대기 중 거래 취소 기능 동작 검증
- [ ] 긴급 정지 후 모든 거래 차단됨 검증

### 사용성
- [ ] 개발자가 5분 내 CLI 설치 및 첫 거래 가능
- [ ] Desktop App으로 세션 승인 완료 가능
- [ ] Claude에서 MCP 연동 후 자연어 거래 가능
- [ ] Phantom, MetaMask 등 주요 지갑으로 Owner 연결 가능

### 확장성
- [ ] Solana Adapter 완전 동작
- [ ] EVM Adapter 인터페이스 준수
- [ ] 새 체인 추가 시 Core 변경 불필요

---

## 마일스톤 범위 외 (Out of Scope)

- SaaS 버전 (클라우드 호스팅)
- 온체인 스마트 컨트랙트 정책
- 특정 체인 프로토콜 의존 기능
- 모바일 앱
- ML 기반 이상 탐지

---

## 보안 한계 명시

### 키 유출 시 남은 위험
세션 기반 인증과 시간 지연으로 피해를 최소화하지만, 다음은 막지 못함:

1. **세션 유효 기간 내 악용**: 세션 토큰 유출 시 만료까지 세션 한도 내 악용 가능
2. **즉시 실행 등급 탈취**: 소액(즉시 실행) 거래는 연속 실행 가능
3. **승인된 거래 악용**: 주인이 승인한 거래는 실행됨

### 권장 운영 방식
- 세션 만료 시간을 짧게 설정 (업무 시간만)
- 세션 한도를 필요 최소로 설정
- 알림을 항상 활성화하고 즉시 확인
- 의심 시 즉시 Kill Switch 사용

---

## 마일스톤 1 설계 검토: 부합도 분석 및 수정 방향

마일스톤 1(Phase 1-4)에서 완성한 설계 산출물을 본 마일스톤 목표와 대조한 결과, **활용 가능한 설계**와 **재조정이 필요한 설계**가 명확히 구분된다. 마일스톤 1의 설계는 "클라우드 기반 WaaS 서비스"로서의 완성도는 높으나, 본 마일스톤이 요구하는 "Self-Hosted 로컬 데몬" 방향과는 근본 전제가 다르다.

### 부합하는 설계 (그대로 활용)

| 마일스톤 1 산출물 | 부합 영역 | 활용 방법 |
|-------------------|-----------|-----------|
| Owner-Agent 권한 분리 (Dual Key) | Owner/Agent 역할 구분 | 개념은 유지, 키 저장 방식만 로컬로 전환 |
| IBlockchainAdapter 인터페이스 (ARCH-05) | 체인 추상화 계층 | ChainAdapter 인터페이스와 거의 동일, 그대로 채택 |
| 비상 회수 메커니즘 (REL-04) | 긴급 정지 (Kill Switch) | 4가지 트리거 패턴과 단계별 처리 활용 |
| 에이전트 생명주기 5단계 (REL-03) | 세션/에이전트 상태 관리 | 상태 모델 유지, 세션 레이어와 결합 |
| 모노레포 패키지 구조 (ARCH-02) | core/cloud/selfhost 분리 | selfhost를 기본 경로로 승격 |
| 4단계 에스컬레이션 (ARCH-03) | 거래 등급별 처리 | Time-Lock + Approval 레이어의 기반으로 활용 |
| 규칙 기반 이상 탐지 (ARCH-04) | 자동 정지 규칙 엔진 | ML 없이 시작하는 방향이 본 마일스톤과 일치 |

### 핵심 충돌 및 수정 방향

#### 1. 아키텍처 전환: Cloud-First → Self-Hosted-First

**현재 설계**: AWS KMS(Owner Key) + Nitro Enclaves(Agent Key) + EC2 서버가 기본 경로
**본 마일스톤 요구**: 중앙 서버 없이 사용자 로컬 환경에서 완전히 동작

| 항목 | 현재 (Cloud-First) | 수정 방향 (Self-Hosted-First) |
|------|---------------------|-------------------------------|
| Owner Key | AWS KMS ED25519 | 사용자 개인 지갑 서명 (Phantom, Ledger 등) |
| Agent Key | Nitro Enclaves | 로컬 암호화 파일 (AES-256-GCM + Argon2id) |
| 서명 처리 | vsock → Enclave | 로컬 데몬 내 메모리 서명 |
| 복구 경로 | AWS Root → IAM → KMS | 사용자 백업 파일 + Owner 지갑 |

수정 원칙:
- `packages/selfhost`를 기본 구현으로, `packages/cloud`를 선택적 확장으로 전환
- 서비스 제공자(AWS 포함)가 사용자 자금에 접근할 수 없는 구조
- ARCH-01의 libsodium sealed box + Argon2id 방식이 이미 self-hosted 대안으로 설계되어 있으므로 이를 승격

#### 2. 보안 모델 전환: Squads 온체인 의존 → 로컬 데몬 정책 엔진

**현재 설계**: Squads Protocol v4 멀티시그가 자금 관리, 정책 시행, 비상 복구의 핵심
**본 마일스톤 요구**: 특정 블록체인 프로토콜에 의존하지 않는 체인 무관 보안

| 항목 | 현재 (Squads 의존) | 수정 방향 (로컬 데몬) |
|------|---------------------|----------------------|
| 정책 시행 | 서버 → Enclave → **Squads 온체인** | **로컬 정책 엔진** → 체인 어댑터 |
| 자금 관리 | Squads Vault PDA + SpendingLimit | 로컬 예산 추적 + 단일 키 서명 |
| 멀티시그 | Squads 2-of-2 threshold | 세션 기반 권한 제한 (멀티시그 불필요) |
| 비상 회수 | ChangeThreshold(1) → RemoveMember | Owner 키로 직접 전송 (표준 트랜잭션) |

수정 원칙:
- 보안 계층을 본 마일스톤의 3-Layer(세션 인증 → 시간 지연 → 모니터링)로 재구성
- Squads 등 온체인 정책은 "추가 강화 레이어(선택적)"로 격하
- 정책 시행의 최종 권한은 로컬 데몬이 보유

#### 3. 인증 모델 추가: 세션 기반 인증 레이어

**현재 설계**: Agent Key 직접 서명 (세션 개념 없음)
**본 마일스톤 요구**: 단기 세션 토큰으로 에이전트 권한 제한

현재 설계에 세션 레이어가 부재하므로 신규 설계 필요:
- 세션 토큰 발급/만료/폐기 메커니즘
- 세션별 제약 조건 (한도, 허용 작업, 유효 기간)
- Owner 지갑 서명 기반 세션 승인 흐름
- REL-03의 에이전트 상태 모델과 세션 생명주기 통합

#### 4. 스토리지 전환: 서버 DB → 로컬 임베디드

| 항목 | 현재 설계 | 수정 방향 |
|------|-----------|-----------|
| 메인 DB | PostgreSQL (AWS RDS) | SQLite (로컬 파일) |
| 캐시 | Redis (ElastiCache) | In-memory LRU |
| 키 저장 | KMS / Enclave | 암호화 파일 (AES-256-GCM) |
| ORM | Prisma 6.x | Prisma 또는 better-sqlite3 직접 사용 |

수정 원칙:
- 단일 바이너리(또는 단일 프로세스)로 외부 DB 서버 의존 없이 동작
- 데이터 디렉토리 하나(`~/.waiaas/data/`)에 모든 상태 저장

#### 5. 미설계 영역: 신규 설계 필요

본 마일스톤에서 요구하지만 마일스톤 1에 포함되지 않은 항목:

| 영역 | 설명 | 우선순위 |
|------|------|----------|
| 세션 토큰 시스템 | 발급, 만료, 사용량 추적, 즉시 폐기 | 높음 (Layer 1 핵심) |
| 시간 지연 메커니즘 | 금액별 4단계 처리 (즉시/알림/대기/승인) | 높음 (Layer 2 핵심) |
| 멀티 채널 알림 | Telegram, Discord, Push, Email | 높음 (Layer 3 핵심) |
| Owner 지갑 연결 | Wallet Adapter, WalletConnect, 하드웨어 지갑 | 높음 (Owner 인증 필수) |
| CLI Daemon | `waiaas init/start/status` 명령어 체계 | 높음 (배포 형태 A) |
| Desktop App | Tauri/Electron 기반 승인 UI | 중간 (배포 형태 B) |

### 마일스톤 1 산출물 활용 전략

마일스톤 1의 설계를 폐기하는 것이 아니라, **관점을 전환**하여 활용한다:

```
마일스톤 1 설계 (Cloud WaaS)          본 마일스톤 (Self-Hosted)
─────────────────────────────         ─────────────────────────
AWS KMS Owner Key                 →   Owner 개인 지갑 서명
Nitro Enclave Agent Key           →   로컬 암호화 키스토어
Squads 온체인 정책                →   로컬 정책 엔진 (체인 무관)
PostgreSQL + Redis                →   SQLite + In-memory LRU
EC2 서버 배포                     →   CLI Daemon / Desktop App
IAM + MFA 인증                    →   세션 토큰 + 지갑 서명

[유지] IBlockchainAdapter 체인 추상화
[유지] 에이전트 생명주기 5단계 모델
[유지] 4단계 에스컬레이션 프레임워크
[유지] 규칙 기반 이상 탐지 (ML 제외)
[유지] 비상 정지 트리거 패턴 4종
[유지] 모노레포 패키지 구조 (core/selfhost/api)
```

---

## 기본 규칙

- 모든 설계 문서는 한글로 작성
- 질문을 최소화하고 직접 판단하여 최선의 방법 제시
- 모든 선택지에는 권장 옵션과 이유를 명시
- 체인 특정 기능에 의존하지 않는 범용 설계 우선

---

*작성일: 2026-02-04*
*최종 수정: 2026-02-05 — 마일스톤 1 설계 검토 및 수정 방향 추가*
*상태: 초안*
