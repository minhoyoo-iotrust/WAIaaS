# AI Agent Wallet-as-a-Service 아키텍처 패턴

**도메인:** AI 에이전트용 Wallet-as-a-Service (WAIaaS)
**연구일자:** 2026-02-04
**신뢰도:** MEDIUM (WebSearch 결과를 다수의 공식 소스로 교차 검증)

---

## 1. 권장 아키텍처 개요

### 1.1 시스템 개념도

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WAIaaS 시스템 아키텍처                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │  AI 에이전트  │     │     주인     │     │   관리자     │             │
│  │ (외부 클라이언트) │     │   (사람)    │     │   (운영팀)   │             │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘             │
│         │                     │                     │                    │
│         │ Agent API           │ Owner API           │ Admin API          │
│         ▼                     ▼                     ▼                    │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │                      API Gateway Layer                        │       │
│  │  ┌────────────┐ ┌─────────────┐ ┌─────────────┐               │       │
│  │  │ 인증/인가  │ │ Rate Limit  │ │  로깅/모니터 │               │       │
│  │  └────────────┘ └─────────────┘ └─────────────┘               │       │
│  └──────────────────────────┬───────────────────────────────────┘       │
│                             │                                            │
│  ┌──────────────────────────┴───────────────────────────────────┐       │
│  │                      Core Services Layer                      │       │
│  │                                                                │       │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │       │
│  │  │ Wallet      │  │ Transaction │  │ Policy Engine       │   │       │
│  │  │ Service     │  │ Service     │  │ (권한/한도 관리)    │   │       │
│  │  │             │  │             │  │                     │   │       │
│  │  │ - 지갑 생성 │  │ - TX 구성   │  │ - 거래 한도 검증    │   │       │
│  │  │ - 잔액 조회 │  │ - TX 시뮬   │  │ - 화이트리스트      │   │       │
│  │  │ - 소유권    │  │ - TX 제출   │  │ - 시간 기반 규칙    │   │       │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │       │
│  │         │                 │                    │               │       │
│  └─────────┼─────────────────┼────────────────────┼───────────────┘       │
│            │                 │                    │                       │
│  ┌─────────┴─────────────────┴────────────────────┴───────────────┐       │
│  │                    Key Management Layer                         │       │
│  │                                                                 │       │
│  │  ┌─────────────────────────────────────────────────────────┐   │       │
│  │  │              Signing Service (TEE/MPC)                   │   │       │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │       │
│  │  │  │ Owner Key    │  │ Agent Key    │  │ Recovery Key │   │   │       │
│  │  │  │ (주인 서명)   │  │ (에이전트)   │  │ (복구용)     │   │   │       │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │       │
│  │  └─────────────────────────────────────────────────────────┘   │       │
│  └────────────────────────────────┬────────────────────────────────┘       │
│                                   │                                        │
│  ┌────────────────────────────────┴────────────────────────────────┐       │
│  │                    Blockchain Adapter Layer                      │       │
│  │                                                                  │       │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │       │
│  │  │   Solana     │  │   Ethereum   │  │   Future     │           │       │
│  │  │   Adapter    │  │   Adapter    │  │   Chains     │           │       │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │       │
│  └────────────────────────────────┬────────────────────────────────┘       │
│                                   │                                        │
│                                   ▼                                        │
│                          [ Blockchain Networks ]                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 아키텍처 핵심 원칙

1. **Dual Key Architecture**: 주인(Owner)과 에이전트(Agent) 분리된 키 구조
2. **Policy-First Signing**: 서명 전 정책 검증 필수
3. **Non-Custodial by Default**: 서비스 제공자가 키에 접근 불가
4. **Modular & Pluggable**: 컴포넌트별 독립 배포 및 교체 가능

---

## 2. 커스터디 모델 비교

### 2.1 모델 개요

| 모델 | 설명 | 키 소유권 | 복구 |
|------|------|----------|------|
| **Custodial** | 서비스 제공자가 키 보관 | 서비스 제공자 | 서비스 제공자 |
| **Non-Custodial** | 사용자가 키 직접 보관 | 사용자 | 사용자 책임 |
| **MPC/TSS Hybrid** | 키를 여러 조각으로 분산 | 분산 (M-of-N) | 임계값 기반 |
| **Dual Key (권장)** | 스마트 컨트랙트 지갑 + 다중 키 | Owner + Agent | Owner 또는 복구 키 |

### 2.2 AI 에이전트 관점 상세 비교

#### Custodial (수탁형)

**작동 방식:**
- 서비스 제공자가 모든 개인키를 보관
- 에이전트는 API를 통해 거래 요청만 전송
- 서비스 제공자가 서명 및 제출 처리

**장점:**
- 구현 단순 (가장 빠른 MVP)
- 에이전트 개발자 부담 최소화
- 복구/계정 관리 용이

**단점:**
- **Single Point of Failure**: 서비스 해킹 시 전체 자금 위험
- **규제 리스크**: 많은 국가에서 수탁 서비스 라이선스 필요
- **신뢰 문제**: 사용자가 서비스를 100% 신뢰해야 함
- 2025년 상반기 수탁 플랫폼에서 $21.7억 해킹 피해 발생

**AI 에이전트 적합성: 낮음**
- 에이전트 자율성과 수탁 모델이 근본적으로 충돌
- 에이전트가 서비스 제공자에게 완전 종속

---

#### Non-Custodial (비수탁형)

**작동 방식:**
- 에이전트가 자체 개인키를 생성/보관
- 에이전트 코드 또는 환경에 키 저장
- 에이전트가 직접 서명 및 브로드캐스트

**장점:**
- 완전한 자율성
- 규제 부담 최소
- 분산화 철학과 부합

**단점:**
- **보안 취약점**: 코드에 키 노출 시 치명적
  - 2024년 Banana Gun 사례: $300만 탈취
- **복구 불가**: 시드 분실 = 자금 영구 손실
- **주인 통제 어려움**: 에이전트에게 전권 위임됨

**AI 에이전트 적합성: 중간**
- 자율성은 높으나 보안/복구 문제 심각
- TEE(Trusted Execution Environment) 없이는 위험

---

#### MPC/TSS Hybrid (다자간 연산)

**작동 방식:**
- 개인키가 실제로 존재하지 않음
- 키 조각(Shares)이 여러 참여자에게 분산
- 임계값(예: 2-of-3) 충족 시 협력하여 서명 생성
- 서명 과정에서도 전체 키 재구성 없음

**장점:**
- **Single Point of Failure 제거**: 한 조각 유출로 서명 불가
- **유연한 거버넌스**: M-of-N 구조로 권한 분배
- **체인 무관**: 오프체인 작동, 모든 블록체인 지원
- **가스비 절감**: Multi-Sig 대비 50% 절감
- 기관 표준으로 자리잡음 (Fireblocks, Dfns 등)

**단점:**
- **구현 복잡도**: 자체 구축 시 암호학 전문성 필요
- **지연 시간**: 분산 연산으로 인해 50-200ms 추가
- **비용**: MPC-as-a-Service 사용 시 비용 발생

**AI 에이전트 적합성: 높음**
- 에이전트를 키 조각 보유자 중 하나로 설정 가능
- 정책 기반 서명 제어와 자연스럽게 결합

---

#### Dual Key Architecture (이중 키 - 권장)

**작동 방식:**
- 스마트 컨트랙트 지갑 (Account Abstraction) 사용
- 하나의 지갑에 복수의 서명자 등록:
  - **Owner Key**: 주인(사람)이 보유, 전권
  - **Agent Key**: 에이전트가 TEE 내에서 보유, 제한된 권한
- 스마트 컨트랙트에서 권한 규칙 강제

```
┌────────────────────────────────────────────────────┐
│            Smart Contract Wallet                   │
│            (Squads Protocol on Solana)             │
├────────────────────────────────────────────────────┤
│                                                    │
│   ┌─────────────────┐   ┌─────────────────┐       │
│   │   Owner Key     │   │   Agent Key     │       │
│   │                 │   │                 │       │
│   │ - 전체 권한     │   │ - 제한된 권한   │       │
│   │ - 에이전트 등록 │   │ - 일일 한도     │       │
│   │ - 자금 회수     │   │ - 화이트리스트  │       │
│   │ - 정책 변경     │   │ - TEE 내 보관   │       │
│   └─────────────────┘   └─────────────────┘       │
│                                                    │
│   Rules (On-chain):                               │
│   - Agent: max 10 SOL/day                         │
│   - Agent: only whitelisted contracts             │
│   - Owner: full access                            │
│                                                    │
└────────────────────────────────────────────────────┘
```

**장점:**
- **주인 통제권 유지**: 언제든 에이전트 권한 철회 가능
- **에이전트 자율성**: 정해진 범위 내 자유로운 거래
- **복구 가능**: Owner Key로 항상 자금 회수 가능
- **정책 온체인 강제**: 스마트 컨트랙트 수준 보안
- **비수탁 구조**: 서비스 제공자가 키에 접근 불가

**단점:**
- **구현 복잡도**: 스마트 컨트랙트 개발 필요
- **체인 종속성**: 각 체인별 AA 표준 다름
  - Solana: Squads Protocol
  - EVM: ERC-4337
- **가스비**: 스마트 컨트랙트 호출 비용

**AI 에이전트 적합성: 최고**
- WAIaaS의 핵심 요구사항과 완벽 부합
- Crossmint, Turnkey 등 2026년 주요 솔루션이 채택

### 2.3 커스터디 모델 권장사항

**권장: Dual Key Architecture + TEE**

**이유:**
1. 주인-에이전트 관계 모델을 자연스럽게 구현
2. 비수탁으로 규제 부담 최소화
3. Solana 생태계에서 Squads Protocol 검증됨 ($100억+ 보호)
4. Crossmint 등 업계 리더가 동일 패턴 채택

**대안:**
- MPC/TSS: 더 높은 보안이 필요한 기관용
- 초기 MVP에서는 단순한 Non-Custodial + TEE도 고려 가능

---

## 3. 컴포넌트 경계 및 책임

### 3.1 컴포넌트 상세

| 컴포넌트 | 책임 | 통신 대상 | 의존성 |
|----------|------|----------|--------|
| **API Gateway** | 인증, 라우팅, Rate Limiting, 로깅 | 모든 외부 클라이언트 | - |
| **Wallet Service** | 지갑 생성, 조회, 소유권 관리 | Gateway, Key Mgmt, Policy | Key Management |
| **Transaction Service** | TX 구성, 시뮬레이션, 제출 | Gateway, Key Mgmt, Blockchain | Policy Engine, Key Mgmt |
| **Policy Engine** | 권한 검증, 한도 관리, 규칙 실행 | Transaction Service | 데이터베이스 |
| **Key Management** | 키 생성, 보관, 서명 연산 | Wallet, Transaction | TEE/HSM |
| **Blockchain Adapter** | 체인별 RPC 호출 추상화 | Transaction Service | 외부 RPC |
| **Notification Service** | 이벤트 알림 (웹훅, 이메일) | 모든 서비스 | 메시지 큐 |

### 3.2 서비스 인터페이스 정의

#### API Gateway → Core Services

```typescript
// 에이전트 API 엔드포인트
POST   /v1/wallets                    // 지갑 생성
GET    /v1/wallets/{walletId}         // 지갑 정보 조회
GET    /v1/wallets/{walletId}/balance // 잔액 조회

POST   /v1/transactions/prepare       // TX 준비 (시뮬레이션 포함)
POST   /v1/transactions/sign          // TX 서명 요청
POST   /v1/transactions/submit        // TX 제출
GET    /v1/transactions/{txId}        // TX 상태 조회

// 주인(Owner) API 엔드포인트
POST   /v1/owner/deposit              // 에이전트에게 자금 충전
POST   /v1/owner/withdraw             // 에이전트로부터 자금 회수
PUT    /v1/owner/policies             // 정책 변경
DELETE /v1/owner/agents/{agentId}     // 에이전트 등록 해제
```

#### Policy Engine 인터페이스

```typescript
interface PolicyCheck {
  walletId: string;
  agentId: string;
  transaction: {
    type: 'transfer' | 'swap' | 'contract_call';
    amount?: number;
    asset?: string;
    destination?: string;
    contract?: string;
  };
}

interface PolicyResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
  remainingDailyLimit?: number;
}

// 정책 규칙 예시
interface WalletPolicy {
  dailyLimit: number;           // 일일 거래 한도 (SOL 기준)
  perTxLimit: number;           // 단일 거래 한도
  allowedAssets: string[];      // 허용된 토큰 목록
  allowedContracts: string[];   // 허용된 컨트랙트 주소
  allowedDestinations: string[];// 화이트리스트 주소
  timeRestrictions?: {          // 시간 제한 (선택)
    allowedHours: [number, number];
    timezone: string;
  };
}
```

---

## 4. 데이터 흐름

### 4.1 지갑 생성 흐름

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│ AI Agent  │     │ Gateway   │     │ Wallet    │     │ Key Mgmt  │
│           │     │           │     │ Service   │     │ (TEE)     │
└─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
      │                 │                 │                 │
      │ 1. POST /wallets│                 │                 │
      │────────────────>│                 │                 │
      │                 │                 │                 │
      │                 │ 2. Validate     │                 │
      │                 │    Auth Token   │                 │
      │                 │                 │                 │
      │                 │ 3. Create Wallet│                 │
      │                 │────────────────>│                 │
      │                 │                 │                 │
      │                 │                 │ 4. Generate     │
      │                 │                 │    Key Pair     │
      │                 │                 │────────────────>│
      │                 │                 │                 │
      │                 │                 │<────────────────│
      │                 │                 │  5. Public Key  │
      │                 │                 │     (Agent Key) │
      │                 │                 │                 │
      │                 │                 │ 6. Deploy Smart │
      │                 │                 │    Wallet       │
      │                 │                 │    (Squads)     │
      │                 │                 │                 │
      │                 │<────────────────│                 │
      │                 │ 7. Wallet Info  │                 │
      │<────────────────│                 │                 │
      │  8. Response    │                 │                 │
      │  {walletId,     │                 │                 │
      │   address,      │                 │                 │
      │   ownerKey}     │                 │                 │
```

### 4.2 거래 실행 흐름 (Policy-Controlled)

```
┌───────────┐  ┌─────────┐  ┌───────────┐  ┌────────┐  ┌─────────┐  ┌──────────┐
│ AI Agent  │  │ Gateway │  │ Tx Service│  │ Policy │  │ Key Mgmt│  │Blockchain│
└─────┬─────┘  └────┬────┘  └─────┬─────┘  └───┬────┘  └────┬────┘  └────┬─────┘
      │             │             │            │            │            │
      │ 1. POST     │             │            │            │            │
      │ /transactions/prepare     │            │            │            │
      │────────────>│             │            │            │            │
      │             │ 2. Forward  │            │            │            │
      │             │────────────>│            │            │            │
      │             │             │            │            │            │
      │             │             │ 3. Check   │            │            │
      │             │             │    Policy  │            │            │
      │             │             │───────────>│            │            │
      │             │             │            │            │            │
      │             │             │<───────────│            │            │
      │             │             │ 4. Allowed │            │            │
      │             │             │            │            │            │
      │             │             │ 5. Simulate│            │            │
      │             │             │    TX      │            │            │
      │             │             │────────────────────────────────────>│
      │             │             │<────────────────────────────────────│
      │             │             │ 6. Simulation OK        │            │
      │             │             │            │            │            │
      │<────────────│<────────────│            │            │            │
      │ 7. Prepared TX (unsigned) │            │            │            │
      │             │             │            │            │            │
      │ 8. POST     │             │            │            │            │
      │ /transactions/sign        │            │            │            │
      │────────────>│────────────>│            │            │            │
      │             │             │            │            │            │
      │             │             │ 9. Sign in │            │            │
      │             │             │    TEE     │            │            │
      │             │             │───────────────────────>│            │
      │             │             │<───────────────────────│            │
      │             │             │ 10. Signed TX          │            │
      │             │             │            │            │            │
      │             │             │ 11. Broadcast          │            │
      │             │             │────────────────────────────────────>│
      │             │             │<────────────────────────────────────│
      │             │             │ 12. TX Hash│            │            │
      │<────────────│<────────────│            │            │            │
      │ 13. Response│             │            │            │            │
      │ {txHash, status}          │            │            │            │
```

### 4.3 주인(Owner) 자금 충전 흐름

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│  Owner    │     │ Gateway   │     │ Wallet    │     │ Blockchain│
│  (주인)   │     │           │     │ Service   │     │ (Solana)  │
└─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
      │                 │                 │                 │
      │ 1. POST /owner/deposit            │                 │
      │   (from: owner_wallet,            │                 │
      │    to: agent_wallet,              │                 │
      │    amount: 10 SOL)                │                 │
      │────────────────>│                 │                 │
      │                 │                 │                 │
      │                 │ 2. Verify Owner │                 │
      │                 │    Signature    │                 │
      │                 │────────────────>│                 │
      │                 │                 │                 │
      │                 │                 │ 3. Monitor for  │
      │                 │                 │    incoming TX  │
      │                 │                 │────────────────>│
      │                 │                 │                 │
      │ [Owner signs & │                 │                 │
      │  sends TX via   │                 │                 │
      │  their wallet]  │                 │                 │
      │─────────────────────────────────────────────────────>
      │                 │                 │                 │
      │                 │                 │<────────────────│
      │                 │                 │ 4. TX Confirmed │
      │                 │                 │                 │
      │<────────────────│<────────────────│                 │
      │ 5. Deposit Confirmed              │                 │
      │    (new balance: 15 SOL)          │                 │
```

---

## 5. 주인-에이전트 권한 모델

### 5.1 권한 계층 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        Permission Hierarchy                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Level 0: Platform Admin (WAIaaS 운영자)                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - 시스템 설정 관리                                          │ │
│  │ - 긴급 동결 (Freeze)                                        │ │
│  │ - 개별 지갑 접근 불가 (비수탁)                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  Level 1: Owner (지갑 주인 - 사람)                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - 지갑 완전 통제권                                          │ │
│  │ - 에이전트 등록/해제                                        │ │
│  │ - 정책(Policy) 설정/변경                                    │ │
│  │ - 무제한 입출금                                             │ │
│  │ - 에이전트 키 폐기                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  Level 2: Agent (AI 에이전트)                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - 정책 범위 내 자율 거래                                    │ │
│  │ - 잔액 조회                                                 │ │
│  │ - 거래 내역 조회                                            │ │
│  │ - 정책 조회 (읽기 전용)                                     │ │
│  │                                                             │ │
│  │ [제한 사항]                                                 │ │
│  │ - 일일 거래 한도                                            │ │
│  │ - 단건 거래 한도                                            │ │
│  │ - 허용된 자산만 거래                                        │ │
│  │ - 화이트리스트 주소만 전송                                  │ │
│  │ - 정책 변경 불가                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 정책(Policy) 설계

```typescript
interface AgentPolicy {
  // 기본 식별
  policyId: string;
  walletId: string;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;

  // 거래 한도
  limits: {
    dailyMaxAmount: number;      // 일일 최대 거래액 (SOL)
    perTransactionMax: number;   // 단건 최대액
    dailyTransactionCount: number; // 일일 최대 건수
  };

  // 자산 제어
  assets: {
    allowed: string[];           // 허용된 토큰 민트 주소
    // 또는 'all' | 'sol_only' | 'stable_only'
  };

  // 목적지 제어
  destinations: {
    mode: 'whitelist' | 'blacklist' | 'any';
    addresses: string[];
  };

  // 컨트랙트 제어
  contracts: {
    allowed: string[];           // 상호작용 가능한 프로그램 ID
    // 예: Jupiter, Raydium 등 DeFi 프로토콜
  };

  // 시간 제어 (선택)
  schedule?: {
    allowedDays: number[];       // 0-6 (일-토)
    allowedHours: [number, number]; // [시작시간, 종료시간]
    timezone: string;
  };

  // 긴급 제어
  emergency: {
    ownerOverride: boolean;      // 주인이 언제든 개입 가능
    autoFreeze: {
      enabled: boolean;
      triggerConditions: string[]; // 예: 'unusual_activity'
    };
  };
}
```

### 5.3 권한 검증 흐름

```
에이전트 거래 요청
        │
        ▼
┌───────────────────┐
│ 1. API 인증       │ ← Agent API Key 검증
│    (Agent ID)     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 2. 지갑 소유권    │ ← Agent가 해당 지갑에 등록되어 있는가?
│    확인           │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 3. 정책 로드      │ ← 해당 Agent의 Policy 조회
│                   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. 한도 검증      │ ← 일일/단건 한도 초과 여부
│                   │
└─────────┬─────────┘
          │ 통과
          ▼
┌───────────────────┐
│ 5. 자산 검증      │ ← 허용된 토큰인가?
│                   │
└─────────┬─────────┘
          │ 통과
          ▼
┌───────────────────┐
│ 6. 목적지 검증    │ ← 화이트리스트에 있는 주소인가?
│                   │
└─────────┬─────────┘
          │ 통과
          ▼
┌───────────────────┐
│ 7. 컨트랙트 검증  │ ← 허용된 프로그램 호출인가?
│                   │
└─────────┬─────────┘
          │ 통과
          ▼
┌───────────────────┐
│ 8. TX 시뮬레이션  │ ← 예상 결과 검증
│                   │
└─────────┬─────────┘
          │ 통과
          ▼
    ┌───────────┐
    │ 서명 실행 │
    └───────────┘
```

---

## 6. 키 관리 아키텍처

### 6.1 TEE 기반 키 관리 (권장)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trusted Execution Environment                 │
│                    (AWS Nitro Enclaves / Intel SGX)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Secure Enclave                          │ │
│  │                                                            │ │
│  │   ┌──────────────┐    ┌──────────────┐                    │ │
│  │   │ Key Store    │    │ Signing      │                    │ │
│  │   │              │    │ Logic        │                    │ │
│  │   │ - Agent Keys │───>│              │                    │ │
│  │   │ - Encrypted  │    │ - Ed25519    │                    │ │
│  │   │   at rest    │    │ - Policy     │                    │ │
│  │   │              │    │   Check      │                    │ │
│  │   └──────────────┘    └──────┬───────┘                    │ │
│  │                              │                             │ │
│  │                              │ Signed TX                   │ │
│  │                              ▼                             │ │
│  │                      ┌──────────────┐                     │ │
│  │                      │ Output       │                     │ │
│  │                      │ (Signature   │                     │ │
│  │                      │  Only)       │                     │ │
│  │                      └──────────────┘                     │ │
│  │                                                            │ │
│  │  [Key는 절대 Enclave 외부로 노출되지 않음]                 │ │
│  │  [Remote Attestation으로 무결성 검증 가능]                 │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 키 유형별 보관 방식

| 키 유형 | 보관 위치 | 접근 권한 | 백업/복구 |
|---------|----------|----------|----------|
| **Owner Key** | 사용자 지갑 (Phantom, Solflare 등) | 주인만 | 사용자 책임 |
| **Agent Key** | TEE 내 암호화 저장 | TEE 서명 함수만 | 암호화된 백업 + 복구 키 |
| **Recovery Key** | HSM 또는 Cold Storage | 긴급 시만 | 오프라인 다중 백업 |
| **Service Key** | 환경 변수 (Vault) | API 서버만 | 정기 로테이션 |

### 6.3 세션 기반 키 접근 (선택적 고급 기능)

```typescript
// 에이전트에게 임시 서명 세션 발급
interface SigningSession {
  sessionId: string;
  agentId: string;
  walletId: string;

  // 세션 제한
  constraints: {
    expiresAt: Date;           // 세션 만료 시간
    maxTransactions: number;   // 최대 거래 수
    maxAmount: number;         // 최대 금액
    allowedActions: string[];  // 허용된 작업
  };

  // 세션 상태
  status: 'active' | 'expired' | 'revoked';
  usedTransactions: number;
  usedAmount: number;
}

// 사용 예시: 에이전트가 1시간 동안 5건, 총 10 SOL까지 거래 가능
const session = await createSigningSession({
  agentId: 'agent-123',
  walletId: 'wallet-456',
  constraints: {
    expiresAt: new Date(Date.now() + 3600000), // 1시간
    maxTransactions: 5,
    maxAmount: 10,
    allowedActions: ['transfer', 'swap']
  }
});
```

---

## 7. 보안 경계

### 7.1 Trust Boundary 정의

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Trust Boundaries                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  UNTRUSTED ZONE (외부)                                          │    │
│  │                                                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │ AI Agents    │  │ External     │  │ Malicious    │          │    │
│  │  │ (클라이언트) │  │ RPC Nodes    │  │ Actors       │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                          ══════════════════════                          │
│                          ║ Security Boundary ║                           │
│                          ══════════════════════                          │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  SEMI-TRUSTED ZONE (DMZ)                                        │    │
│  │                                                                  │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │ API Gateway                                               │  │    │
│  │  │ - Rate Limiting                                           │  │    │
│  │  │ - Input Validation                                        │  │    │
│  │  │ - DDoS Protection                                         │  │    │
│  │  │ - Request Logging                                         │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                          ══════════════════════                          │
│                          ║ Service Boundary  ║                           │
│                          ══════════════════════                          │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  TRUSTED ZONE (내부 서비스)                                     │    │
│  │                                                                  │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │    │
│  │  │ Wallet     │  │ Transaction│  │ Policy     │                │    │
│  │  │ Service    │  │ Service    │  │ Engine     │                │    │
│  │  └────────────┘  └────────────┘  └────────────┘                │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                          ══════════════════════                          │
│                          ║ Cryptographic     ║                           │
│                          ║ Boundary          ║                           │
│                          ══════════════════════                          │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  HIGHLY TRUSTED ZONE (TEE/HSM)                                  │    │
│  │                                                                  │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │ Key Management Service                                    │  │    │
│  │  │ - Key Storage (암호화)                                    │  │    │
│  │  │ - Signing Operations                                      │  │    │
│  │  │ - Policy Enforcement (최종 검증)                          │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  │                                                                  │    │
│  │  [키는 이 경계를 절대 벗어나지 않음]                            │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 위협 모델 및 대응

| 위협 | 공격 벡터 | 대응 방안 |
|------|----------|----------|
| **키 탈취** | 메모리 덤프, 코드 분석 | TEE 내 키 격리, 절대 외부 노출 안함 |
| **API 남용** | 유효한 API 키로 과도한 요청 | Rate Limiting, Policy 한도 설정 |
| **정책 우회** | 조작된 거래 요청 | TEE 내 최종 정책 검증, TX 시뮬레이션 |
| **중간자 공격** | 네트워크 가로채기 | TLS 1.3 강제, 요청 서명 |
| **재생 공격** | 이전 요청 재전송 | Nonce/타임스탬프 검증 |
| **내부자 위협** | 운영자 키 접근 시도 | 비수탁 구조, TEE 격리 |
| **스마트컨트랙트 취약점** | 악성 컨트랙트 호출 | 컨트랙트 화이트리스트, 시뮬레이션 |

### 7.3 보안 체크리스트

```markdown
## 인증/인가
- [ ] API 키 해시 저장 (평문 저장 금지)
- [ ] JWT/토큰 만료 시간 제한
- [ ] 키 로테이션 정책 수립
- [ ] IP 화이트리스트 지원

## 데이터 보호
- [ ] 전송 중 암호화 (TLS 1.3)
- [ ] 저장 시 암호화 (AES-256)
- [ ] PII 데이터 최소 수집
- [ ] 로그에 민감 정보 마스킹

## 키 관리
- [ ] 키 생성은 TEE 내에서만
- [ ] 키 백업 암호화
- [ ] 복구 프로세스 테스트
- [ ] 키 폐기 절차 수립

## 운영 보안
- [ ] 취약점 스캔 자동화
- [ ] 의존성 보안 업데이트
- [ ] 침입 탐지 시스템
- [ ] 인시던트 대응 계획
```

---

## 8. 빌드 순서 및 의존성

### 8.1 컴포넌트 의존성 그래프

```
                    ┌─────────────────┐
                    │ 1. 인프라 기반  │
                    │                 │
                    │ - DB 스키마     │
                    │ - 메시지 큐     │
                    │ - 모니터링      │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌────────────────┐           ┌────────────────┐
     │ 2. Key Mgmt    │           │ 3. Blockchain  │
     │    Service     │           │    Adapter     │
     │                │           │                │
     │ - TEE 설정     │           │ - Solana RPC   │
     │ - 키 생성/저장 │           │ - TX 시리얼라이즈
     │ - 서명 함수    │           │ - 잔액 조회    │
     └────────┬───────┘           └────────┬───────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 4. Wallet       │
                    │    Service      │
                    │                 │
                    │ - 지갑 생성     │
                    │ - Smart Wallet  │
                    │   배포          │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 5. Policy       │
                    │    Engine       │
                    │                 │
                    │ - 정책 CRUD     │
                    │ - 검증 로직     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 6. Transaction  │
                    │    Service      │
                    │                 │
                    │ - TX 구성       │
                    │ - 시뮬레이션    │
                    │ - 제출          │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 7. API Gateway  │
                    │                 │
                    │ - 인증/인가     │
                    │ - Rate Limit    │
                    │ - 라우팅        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 8. Agent/Owner  │
                    │    APIs         │
                    │                 │
                    │ - 에이전트 API  │
                    │ - 주인 API      │
                    │ - 관리자 API    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 9. SDK & 통합   │
                    │                 │
                    │ - JavaScript SDK│
                    │ - Python SDK    │
                    │ - MCP 서버      │
                    └─────────────────┘
```

### 8.2 권장 빌드 순서 상세

| 단계 | 컴포넌트 | 설명 | 예상 기간 | 선행 조건 |
|------|----------|------|----------|----------|
| **Phase 1** | 인프라 기반 | DB, 캐시, 모니터링 설정 | 1주 | - |
| **Phase 2a** | Key Management | TEE 기반 키 생성/서명 | 2-3주 | Phase 1 |
| **Phase 2b** | Blockchain Adapter | Solana RPC 래퍼 | 1-2주 | Phase 1 (병렬 가능) |
| **Phase 3** | Wallet Service | 지갑 CRUD, Squads 통합 | 2주 | Phase 2a, 2b |
| **Phase 4** | Policy Engine | 정책 관리 및 검증 | 2주 | Phase 3 |
| **Phase 5** | Transaction Service | TX 구성, 시뮬, 제출 | 2주 | Phase 4 |
| **Phase 6** | API Gateway | 인증, 라우팅, Rate Limit | 1-2주 | Phase 5 |
| **Phase 7** | External APIs | Agent/Owner API 완성 | 1주 | Phase 6 |
| **Phase 8** | SDKs | JS/Python SDK | 2주 | Phase 7 |
| **Phase 9** | MCP Integration | MCP 서버 개발 | 1-2주 | Phase 8 |

### 8.3 MVP 범위 권장

**첫 번째 마일스톤 (MVP):**
- Phase 1-5 완료
- 기본 API (지갑 생성, 잔액 조회, 전송)
- 단순 정책 (일일 한도만)
- Solana Devnet 대상

**두 번째 마일스톤:**
- Phase 6-7 완료
- 전체 정책 엔진
- Owner API
- Solana Mainnet

**세 번째 마일스톤:**
- Phase 8-9 완료
- SDK 및 MCP 통합
- 고급 보안 기능

---

## 9. 참고 아키텍처 사례

### 9.1 Crossmint Agent Wallets

**아키텍처 특징:**
- Dual Key Architecture 채택
- Squads Protocol 기반 Smart Wallet
- TEE 내 Agent Key 보관
- 완전 비수탁 구조

**참고:**
- [AI Agent Wallet Architecture](https://blog.crossmint.com/ai-agent-wallet-architecture/)
- [Solana Agent App Guide](https://blog.crossmint.com/solana-ai-agent-app/)

### 9.2 Turnkey

**아키텍처 특징:**
- TEE 기반 (AWS Nitro Enclaves)
- 50-100ms 서명 지연
- 정책 기반 API 접근 제어
- MPC 미사용 (TEE 단독)

**참고:**
- [Turnkey Documentation](https://docs.turnkey.com/home)
- [Turnkey AI Agents](https://www.turnkey.com/solutions/ai-agents)

### 9.3 Dfns

**아키텍처 특징:**
- MPC + HSM + TEE 유연한 조합
- 마이크로서비스 기반
- Zero Trust 보안 모델

**참고:**
- [Dfns Wallets-as-a-Service](https://www.dfns.co/product/wallets-as-a-service)

---

## 10. 로드맵 영향

### 10.1 Phase 구조 권장

연구 결과를 바탕으로 권장하는 개발 Phase 구조:

1. **Phase 1: Foundation**
   - 인프라 설정
   - Solana 연동 기본 구현
   - 단순 지갑 생성 (EOA)

2. **Phase 2: Core Security**
   - TEE 기반 Key Management
   - Squads Smart Wallet 통합
   - Dual Key 구조 구현

3. **Phase 3: Policy & Control**
   - Policy Engine 개발
   - Owner-Agent 권한 모델
   - 거래 한도 시스템

4. **Phase 4: API & Integration**
   - 완전한 REST API
   - Agent SDK
   - 문서화

5. **Phase 5: Production**
   - 보안 감사
   - Mainnet 배포
   - 모니터링/알림

### 10.2 연구 플래그

| 영역 | 추가 연구 필요 | 이유 |
|------|--------------|------|
| TEE 구현 | 높음 | AWS Nitro vs Intel SGX 구체적 비교 필요 |
| Squads Protocol | 중간 | 상세 통합 가이드 확인 필요 |
| MCP 통합 | 높음 | 표준화 진행 중, 최신 스펙 확인 필요 |
| 규제/컴플라이언스 | 높음 | 국가별 수탁 규정 확인 필요 |

---

## 11. 출처

### 신뢰도 높음 (HIGH)
- [Turnkey Documentation](https://docs.turnkey.com/home)
- [Crossmint Blog - AI Agent Wallet Architecture](https://blog.crossmint.com/ai-agent-wallet-architecture/)
- [Fireblocks Documentation](https://developers.fireblocks.com/docs/wallet-as-a-service)
- [Solana Agent Kit - GitHub](https://github.com/sendaifun/solana-agent-kit)

### 신뢰도 중간 (MEDIUM)
- [OpenWallet Foundation Reference Architecture](https://github.com/openwallet-foundation/architecture-sig/blob/main/docs/papers/architecture-whitepaper.md)
- [Helius Blog - Secure AI Agent on Solana](https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana)
- [Google Cloud - Agent Payments Protocol](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)
- [arXiv - Autonomous Agents on Blockchains](https://arxiv.org/html/2601.04583v1)

### 신뢰도 낮음 (LOW) - 검증 필요
- 각종 Medium 블로그 글
- 일반 WebSearch 결과

---

*최종 업데이트: 2026-02-04*
