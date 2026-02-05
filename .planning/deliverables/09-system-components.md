# 시스템 컴포넌트 다이어그램 (ARCH-02)

**문서 ID:** ARCH-02
**작성일:** 2026-02-04
**상태:** 완료
**참조:** ARCH-01, CUST-04, 03-CONTEXT.md, 03-RESEARCH.md

---

## 1. Executive Summary

### 1.1 시스템 개요

WAIaaS (Wallet-as-a-Service for AI Agents)는 AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있게 하는 지갑 서비스다. **모놀리식 아키텍처**를 기반으로 하되, **키 관리 로직을 인터페이스로 추상화**하여 향후 마이크로서비스로 분리 가능하도록 설계한다.

### 1.2 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **모놀리식 우선** | 단일 배포 단위로 운영 복잡도 최소화 |
| **인터페이스 추상화** | 키 관리, 정책 엔진 등 핵심 로직 인터페이스화 |
| **환경별 빌드** | 공통 코어 + 클라우드/셀프호스트 별도 빌드 |
| **보안 최우선** | Fail-safe, 이중 검증, 최소 권한 |
| **기능 동등성** | 클라우드/셀프호스트 동일 기능, 인프라만 다름 |

### 1.3 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                    WAIaaS 시스템 아키텍처                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    Client (AI Agent / Dashboard)                                │
│              │                                                   │
│              ▼                                                   │
│    ┌─────────────────┐                                          │
│    │   API Gateway   │ ◄── Rate Limit, Auth                     │
│    └────────┬────────┘                                          │
│              │                                                   │
│              ▼                                                   │
│    ┌─────────────────────────────────────────────────────┐     │
│    │              WAIaaS Monolith                          │     │
│    │  ┌─────────────────────────────────────────────────┐ │     │
│    │  │                 packages/core                    │ │     │
│    │  │  ┌──────────────┬──────────────┬──────────────┐ │ │     │
│    │  │  │ WalletService│TransactionSvc│ PolicyEngine │ │ │     │
│    │  │  └──────────────┴──────────────┴──────────────┘ │ │     │
│    │  │  ┌────────────────────────────────────────────┐ │ │     │
│    │  │  │         IKeyManagementService              │ │ │     │
│    │  │  └────────────────────────────────────────────┘ │ │     │
│    │  └─────────────────────────────────────────────────┘ │     │
│    │                          │                            │     │
│    │          ┌───────────────┼───────────────┐            │     │
│    │          │               │               │            │     │
│    │          ▼               ▼               ▼            │     │
│    │  ┌────────────┐  ┌────────────┐  ┌────────────┐      │     │
│    │  │ packages/  │  │ packages/  │  │ packages/  │      │     │
│    │  │   cloud    │  │  selfhost  │  │    api     │      │     │
│    │  └────────────┘  └────────────┘  └────────────┘      │     │
│    └─────────────────────────────────────────────────────┘     │
│                          │                                       │
│          ┌───────────────┼───────────────┐                      │
│          │               │               │                      │
│          ▼               ▼               ▼                      │
│    ┌──────────┐   ┌──────────┐   ┌──────────────┐             │
│    │PostgreSQL│   │  Redis   │   │ Blockchain   │             │
│    │(RDS/Local)│   │(ElastiC) │   │(Solana/Helius)│             │
│    └──────────┘   └──────────┘   └──────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 고수준 아키텍처 다이어그램

### 2.1 시스템 컨텍스트 다이어그램 (C4 Level 1)

```mermaid
graph TB
    subgraph External["외부 시스템"]
        AIAgent["AI Agent<br/>(Claude, GPT 등)"]
        Dashboard["관리자 대시보드"]
        Webhook["Webhook 수신자"]
    end

    subgraph WAIaaS["WAIaaS 시스템"]
        API["WAIaaS API Server"]
    end

    subgraph Blockchain["블록체인 인프라"]
        Solana["Solana Network"]
        Helius["Helius RPC"]
        Squads["Squads Protocol"]
    end

    subgraph CloudInfra["클라우드 인프라"]
        KMS["AWS KMS"]
        Enclave["Nitro Enclave"]
    end

    AIAgent -->|"REST API<br/>트랜잭션 요청"| API
    Dashboard -->|"REST API<br/>지갑 관리"| API
    API -->|"Webhook<br/>트랜잭션 결과"| Webhook

    API -->|"RPC<br/>트랜잭션 제출"| Helius
    Helius -->|"네트워크"| Solana
    API -->|"SDK<br/>멀티시그 관리"| Squads

    API -->|"Sign<br/>Owner Key"| KMS
    API -->|"vsock<br/>Agent Key"| Enclave
```

### 2.2 컨테이너 다이어그램 (C4 Level 2)

```mermaid
graph TB
    subgraph Clients["클라이언트"]
        Agent["AI Agent"]
        Admin["Admin Dashboard"]
    end

    subgraph WAIaaS["WAIaaS System Boundary"]
        subgraph APILayer["API Layer"]
            Gateway["API Gateway<br/>(Rate Limit, Auth)"]
            Fastify["Fastify Server<br/>(packages/api)"]
        end

        subgraph ServiceLayer["Service Layer"]
            WalletSvc["WalletService"]
            TxSvc["TransactionService"]
            PolicyEng["PolicyEngine"]
        end

        subgraph KeyMgmt["Key Management"]
            KMSAdapter["CloudKeyManagementService<br/>(packages/cloud)"]
            LocalAdapter["SelfHostedKeyManagementService<br/>(packages/selfhost)"]
        end

        subgraph DataLayer["Data Layer"]
            Prisma["Prisma ORM"]
            Cache["Redis Cache"]
        end
    end

    subgraph External["External Systems"]
        PG["PostgreSQL"]
        Redis["Redis"]
        KMS["AWS KMS"]
        Enclave["Nitro Enclave"]
        Helius["Helius RPC"]
        Squads["Squads Protocol"]
    end

    Agent -->|HTTPS| Gateway
    Admin -->|HTTPS| Gateway
    Gateway --> Fastify

    Fastify --> WalletSvc
    Fastify --> TxSvc
    Fastify --> PolicyEng

    WalletSvc --> KMSAdapter
    WalletSvc --> LocalAdapter
    TxSvc --> KMSAdapter
    TxSvc --> LocalAdapter
    TxSvc --> PolicyEng

    WalletSvc --> Prisma
    TxSvc --> Prisma
    PolicyEng --> Cache

    Prisma --> PG
    Cache --> Redis

    KMSAdapter -->|IAM Role| KMS
    KMSAdapter -->|vsock| Enclave
    LocalAdapter -->|암호화 파일| PG

    TxSvc --> Helius
    WalletSvc --> Squads
```

### 2.3 외부 연동

| 외부 시스템 | 용도 | 연동 방식 |
|------------|------|----------|
| **Solana RPC (Helius)** | 트랜잭션 제출, 상태 조회 | HTTPS RPC |
| **Squads Protocol** | 멀티시그 관리, 온체인 정책 | @sqds/multisig SDK |
| **AWS KMS** | Owner Key 서명, 시드 암호화 | @aws-sdk/client-kms |
| **Nitro Enclave** | Agent Key 서명, 정책 검증 | vsock (AF_VSOCK) |

---

## 3. 모노레포 패키지 구조

### 3.1 전체 디렉토리 구조

```
waiass/
├── packages/
│   ├── core/                      # 공통 코어 (모든 환경에서 공유)
│   │   ├── src/
│   │   │   ├── domain/            # 도메인 모델
│   │   │   │   ├── wallet/
│   │   │   │   │   ├── Wallet.ts
│   │   │   │   │   ├── WalletPolicy.ts
│   │   │   │   │   └── WalletStatus.ts
│   │   │   │   ├── transaction/
│   │   │   │   │   ├── Transaction.ts
│   │   │   │   │   ├── TransactionRequest.ts
│   │   │   │   │   └── TransactionResult.ts
│   │   │   │   └── policy/
│   │   │   │       ├── AgentPolicy.ts
│   │   │   │       ├── PolicyRule.ts
│   │   │   │       └── PolicyViolation.ts
│   │   │   ├── interfaces/        # 인터페이스 정의 (키 관리 추상화)
│   │   │   │   ├── IKeyManagementService.ts
│   │   │   │   ├── IPolicyEngine.ts
│   │   │   │   ├── IBlockchainAdapter.ts
│   │   │   │   └── IWalletRepository.ts
│   │   │   ├── services/          # 비즈니스 로직
│   │   │   │   ├── WalletService.ts
│   │   │   │   ├── TransactionService.ts
│   │   │   │   └── PolicyEngine.ts
│   │   │   └── utils/
│   │   │       ├── crypto.ts
│   │   │       └── validation.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cloud/                     # 클라우드 환경 (AWS)
│   │   ├── src/
│   │   │   ├── infrastructure/
│   │   │   │   ├── kms/           # AWS KMS Owner Key
│   │   │   │   │   ├── KmsOwnerKeySigner.ts
│   │   │   │   │   └── KmsKeyPolicy.ts
│   │   │   │   ├── enclave/       # Nitro Enclave Agent Key
│   │   │   │   │   ├── EnclaveClient.ts
│   │   │   │   │   └── VsockProtocol.ts
│   │   │   │   └── monitoring/    # CloudWatch, CloudTrail
│   │   │   │       ├── CloudWatchMetrics.ts
│   │   │   │       └── AuditLogger.ts
│   │   │   └── adapters/
│   │   │       └── CloudKeyManagementService.ts
│   │   ├── enclave/               # Enclave 이미지 소스
│   │   │   ├── src/
│   │   │   │   ├── main.rs        # Enclave 메인 (Rust)
│   │   │   │   ├── signing.rs     # ED25519 서명
│   │   │   │   ├── policy.rs      # 정책 검증
│   │   │   │   └── vsock.rs       # vsock 서버
│   │   │   ├── Cargo.toml
│   │   │   ├── Dockerfile
│   │   │   └── enclave.eif        # 빌드된 Enclave 이미지
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── selfhost/                  # 셀프호스트 환경 (Docker Compose)
│   │   ├── src/
│   │   │   ├── infrastructure/
│   │   │   │   ├── encrypted-keystore/   # 암호화 키스토어
│   │   │   │   │   ├── SodiumKeyStore.ts
│   │   │   │   │   └── Argon2KeyDerivation.ts
│   │   │   │   └── local-policy/         # 로컬 정책 엔진
│   │   │   │       └── LocalPolicyEngine.ts
│   │   │   └── adapters/
│   │   │       └── SelfHostedKeyManagementService.ts
│   │   ├── docker/
│   │   │   ├── Dockerfile
│   │   │   └── docker-compose.yml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── api/                       # API 서버 (Fastify)
│       ├── src/
│       │   ├── routes/
│       │   │   ├── wallets.ts     # /api/v1/wallets
│       │   │   ├── transactions.ts # /api/v1/transactions
│       │   │   └── health.ts      # /health
│       │   ├── middleware/
│       │   │   ├── auth.ts        # API Key 인증
│       │   │   ├── rateLimit.ts   # Rate Limiting
│       │   │   └── validation.ts  # 요청 검증
│       │   ├── handlers/
│       │   │   ├── WalletHandler.ts
│       │   │   └── TransactionHandler.ts
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
│
├── prisma/
│   ├── schema.prisma              # 데이터베이스 스키마
│   └── migrations/                # 마이그레이션 파일
│
├── docs/
│   └── architecture/              # 아키텍처 문서
│       ├── ARCH-01-dual-key.md
│       ├── ARCH-02-components.md
│       └── ...
│
├── turbo.json                     # 모노레포 빌드 설정
├── pnpm-workspace.yaml            # pnpm 워크스페이스
└── package.json                   # 루트 패키지
```

### 3.2 패키지별 역할

| 패키지 | 역할 | 의존성 |
|--------|------|--------|
| `packages/core` | 공통 도메인, 인터페이스, 비즈니스 로직 | 없음 (독립적) |
| `packages/cloud` | AWS 클라우드 환경 구현 (KMS, Enclave) | `@waiass/core`, `@aws-sdk/*` |
| `packages/selfhost` | 셀프호스트 환경 구현 (암호화 키스토어) | `@waiass/core`, `libsodium-wrappers` |
| `packages/api` | Fastify API 서버 | `@waiass/core`, `@waiass/cloud` or `@waiass/selfhost` |

### 3.3 패키지 의존성 그래프

```mermaid
graph TB
    subgraph Packages["모노레포 패키지"]
        Core["@waiass/core<br/>(도메인, 인터페이스, 서비스)"]
        Cloud["@waiass/cloud<br/>(AWS KMS, Nitro Enclave)"]
        SelfHost["@waiass/selfhost<br/>(암호화 키스토어)"]
        API["@waiass/api<br/>(Fastify 서버)"]
    end

    subgraph External["외부 의존성"]
        Solana["@solana/web3.js"]
        Squads["@sqds/multisig"]
        AWS["@aws-sdk/*"]
        Sodium["libsodium-wrappers"]
        Prisma["@prisma/client"]
        Fastify["fastify"]
    end

    Cloud -->|implements| Core
    SelfHost -->|implements| Core
    API -->|uses| Core
    API -.->|cloud build| Cloud
    API -.->|selfhost build| SelfHost

    Core --> Solana
    Core --> Squads
    Core --> Prisma
    Cloud --> AWS
    SelfHost --> Sodium
    API --> Fastify
```

---

## 4. 핵심 인터페이스 정의

### 4.1 IKeyManagementService

키 관리 로직을 추상화하여 클라우드/셀프호스트 환경에서 동일한 인터페이스로 사용.

```typescript
// packages/core/src/interfaces/IKeyManagementService.ts

import { PublicKey, Transaction } from '@solana/web3.js';
import { AgentPolicy, PolicyViolation } from '../domain/policy';

/**
 * 키 관리 서비스 인터페이스
 *
 * 클라우드 환경: CloudKeyManagementService (KMS + Enclave)
 * 셀프호스트 환경: SelfHostedKeyManagementService (암호화 키스토어)
 */
export interface IKeyManagementService {
  // ─────────────────────────────────────────
  // Owner Key 작업 (마스터 키, 관리 용도)
  // ─────────────────────────────────────────

  /**
   * Owner Key로 메시지에 서명
   * @param walletId - 지갑 ID
   * @param message - 서명할 메시지 (직렬화된 트랜잭션 등)
   * @returns ED25519 서명 (64바이트)
   */
  signWithOwnerKey(walletId: string, message: Uint8Array): Promise<Uint8Array>;

  /**
   * Owner Key 공개키 조회
   * @param walletId - 지갑 ID
   * @returns Solana PublicKey
   */
  getOwnerPublicKey(walletId: string): Promise<PublicKey>;

  /**
   * 새 Owner Key 생성 (지갑 생성 시)
   * @param walletId - 지갑 ID
   * @returns 생성된 공개키
   */
  createOwnerKey(walletId: string): Promise<PublicKey>;

  // ─────────────────────────────────────────
  // Agent Key 작업 (일상 운영, 정책 기반 서명)
  // ─────────────────────────────────────────

  /**
   * Agent Key로 트랜잭션에 서명 (정책 검증 포함)
   * @param walletId - 지갑 ID
   * @param transaction - 서명할 트랜잭션
   * @param policy - 적용할 정책
   * @returns 서명 결과 또는 정책 위반
   */
  signWithAgentKey(
    walletId: string,
    transaction: Transaction,
    policy: AgentPolicy
  ): Promise<SignResult>;

  /**
   * Agent Key 공개키 조회
   * @param walletId - 지갑 ID
   * @returns Solana PublicKey
   */
  getAgentPublicKey(walletId: string): Promise<PublicKey>;

  /**
   * 새 Agent Key 생성 (지갑 생성 시)
   * @param walletId - 지갑 ID
   * @returns 생성된 공개키
   */
  initializeAgentKey(walletId: string): Promise<PublicKey>;

  /**
   * Agent Key 로테이션
   * @param walletId - 지갑 ID
   * @returns 새로 생성된 공개키
   */
  rotateAgentKey(walletId: string): Promise<PublicKey>;

  /**
   * Agent Key 폐기 (비상 시)
   * @param walletId - 지갑 ID
   */
  revokeAgentKey(walletId: string): Promise<void>;

  // ─────────────────────────────────────────
  // 상태 확인
  // ─────────────────────────────────────────

  /**
   * 키 관리 서비스 상태 확인
   * @returns 서비스 정상 여부
   */
  healthCheck(): Promise<boolean>;
}

/**
 * 서명 결과 타입
 */
export type SignResult =
  | { success: true; signature: Uint8Array; signedTransaction: Transaction }
  | { success: false; violation: PolicyViolation };

/**
 * 키 메타데이터
 */
export interface KeyMetadata {
  walletId: string;
  keyType: 'owner' | 'agent';
  publicKey: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  rotatedAt: Date | null;
  status: 'active' | 'suspended' | 'revoked';
}
```

### 4.2 IPolicyEngine

정책 평가 로직을 추상화.

```typescript
// packages/core/src/interfaces/IPolicyEngine.ts

import { Transaction } from '@solana/web3.js';
import { AgentPolicy, PolicyViolation, PolicyEvaluationResult } from '../domain/policy';

/**
 * 정책 엔진 인터페이스
 */
export interface IPolicyEngine {
  /**
   * 트랜잭션에 대한 정책 평가
   * @param transaction - 평가할 트랜잭션
   * @param policy - 적용할 정책
   * @param context - 평가 컨텍스트 (누적 사용량 등)
   * @returns 평가 결과
   */
  evaluate(
    transaction: Transaction,
    policy: AgentPolicy,
    context: PolicyContext
  ): Promise<PolicyEvaluationResult>;

  /**
   * 정책 유효성 검증 (정책 생성/수정 시)
   * @param policy - 검증할 정책
   * @returns 유효성 검사 결과
   */
  validate(policy: AgentPolicy): ValidationResult;

  /**
   * 에스컬레이션 필요 여부 확인
   * @param violation - 정책 위반 내용
   * @returns 에스컬레이션 타입
   */
  determineEscalation(violation: PolicyViolation): EscalationType;
}

/**
 * 정책 평가 컨텍스트
 */
export interface PolicyContext {
  walletId: string;
  dailySpentLamports: bigint;
  weeklySpentLamports: bigint;
  monthlySpentLamports: bigint;
  lastTransactionAt: Date | null;
  consecutiveFailures: number;
}

/**
 * 정책 평가 결과
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  violations: PolicyViolation[];
  escalation?: EscalationType;
}

/**
 * 에스컬레이션 타입
 */
export type EscalationType =
  | { type: 'NOTIFY_OWNER'; channel: 'push' | 'email' | 'sms' }
  | { type: 'REQUIRE_OWNER_APPROVAL'; timeoutSeconds: number }
  | { type: 'FREEZE_AND_ALERT'; requireManualUnfreeze: boolean }
  | { type: 'EMERGENCY_LOCKDOWN'; revokeAgentKey: boolean };

/**
 * 유효성 검사 결과
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

### 4.3 IBlockchainAdapter

블록체인 상호작용을 추상화 (멀티체인 확장 대비).

```typescript
// packages/core/src/interfaces/IBlockchainAdapter.ts

import { PublicKey } from '@solana/web3.js';
import { WalletConfig } from '../domain/wallet';
import { TransactionRequest, TransactionResult } from '../domain/transaction';

/**
 * 블록체인 어댑터 인터페이스
 *
 * Solana 구현: SolanaAdapter (Phase 3)
 * EVM 구현: EVMAdapter (추후)
 */
export interface IBlockchainAdapter {
  // ─────────────────────────────────────────
  // 지갑 관리
  // ─────────────────────────────────────────

  /**
   * 스마트 월렛 생성 (Squads 멀티시그)
   * @param ownerKey - Owner 공개키
   * @param agentKey - Agent 공개키
   * @param config - 지갑 설정
   * @returns 생성된 지갑 주소
   */
  createSmartWallet(
    ownerKey: PublicKey,
    agentKey: PublicKey,
    config: WalletConfig
  ): Promise<WalletCreationResult>;

  /**
   * 지갑에 멤버 추가 (Agent Key 로테이션 등)
   * @param walletAddress - 지갑 주소
   * @param memberKey - 추가할 멤버 공개키
   * @param permissions - 권한
   */
  addMember(
    walletAddress: string,
    memberKey: PublicKey,
    permissions: MemberPermissions
  ): Promise<void>;

  /**
   * 지갑에서 멤버 제거
   * @param walletAddress - 지갑 주소
   * @param memberKey - 제거할 멤버 공개키
   */
  removeMember(walletAddress: string, memberKey: PublicKey): Promise<void>;

  // ─────────────────────────────────────────
  // 트랜잭션 처리
  // ─────────────────────────────────────────

  /**
   * 트랜잭션 구성
   * @param request - 트랜잭션 요청
   * @returns 미서명 트랜잭션
   */
  buildTransaction(request: TransactionRequest): Promise<UnsignedTransaction>;

  /**
   * 트랜잭션 시뮬레이션
   * @param transaction - 시뮬레이션할 트랜잭션
   * @returns 시뮬레이션 결과
   */
  simulateTransaction(transaction: UnsignedTransaction): Promise<SimulationResult>;

  /**
   * 트랜잭션 제출
   * @param signedTransaction - 서명된 트랜잭션
   * @returns 트랜잭션 결과
   */
  submitTransaction(signedTransaction: SignedTransaction): Promise<TransactionResult>;

  // ─────────────────────────────────────────
  // 조회
  // ─────────────────────────────────────────

  /**
   * 잔액 조회
   * @param address - 조회할 주소
   * @param asset - 자산 (SOL, SPL 토큰 등)
   */
  getBalance(address: string, asset?: AssetIdentifier): Promise<Balance>;

  /**
   * 트랜잭션 상태 조회
   * @param signature - 트랜잭션 서명
   */
  getTransactionStatus(signature: string): Promise<TransactionStatus>;
}

/**
 * 지갑 생성 결과
 */
export interface WalletCreationResult {
  multisigPda: string;
  vaultPda: string;
  transactionSignature: string;
}

/**
 * 멤버 권한
 */
export interface MemberPermissions {
  initiate: boolean;
  vote: boolean;
  execute: boolean;
  settings: boolean;
  addMember: boolean;
  removeMember: boolean;
}

/**
 * 시뮬레이션 결과
 */
export interface SimulationResult {
  success: boolean;
  logs: string[];
  computeUnitsConsumed: number;
  error?: string;
}

/**
 * 잔액
 */
export interface Balance {
  amount: bigint;
  decimals: number;
  uiAmount: number;
}

/**
 * 트랜잭션 상태
 */
export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'finalized'
  | 'failed';
```

---

## 5. 컴포넌트별 책임 정의

### 5.1 컴포넌트 책임 테이블

| 컴포넌트 | 책임 | 주요 메서드 | 의존성 |
|----------|------|------------|--------|
| **WalletService** | 지갑 생성, 조회, 설정 변경 | `create()`, `get()`, `updatePolicy()` | IKeyManagementService, IBlockchainAdapter, IWalletRepository |
| **TransactionService** | 트랜잭션 구성, 시뮬레이션, 제출 | `build()`, `simulate()`, `submit()` | IKeyManagementService, IPolicyEngine, IBlockchainAdapter |
| **PolicyEngine** | 정책 평가, 에스컬레이션 결정 | `evaluate()`, `validate()` | Redis (캐시) |
| **KeyManagementService** | 키 서명, 로테이션, 조회 | `signWithOwnerKey()`, `signWithAgentKey()` | KMS/Enclave (클라우드), 암호화 키스토어 (셀프호스트) |

### 5.2 WalletService

```typescript
// packages/core/src/services/WalletService.ts

import { IKeyManagementService } from '../interfaces/IKeyManagementService';
import { IBlockchainAdapter } from '../interfaces/IBlockchainAdapter';
import { IWalletRepository } from '../interfaces/IWalletRepository';
import { Wallet, WalletConfig, WalletPolicy } from '../domain/wallet';

export class WalletService {
  constructor(
    private readonly keyManagement: IKeyManagementService,
    private readonly blockchain: IBlockchainAdapter,
    private readonly repository: IWalletRepository
  ) {}

  /**
   * 새 지갑 생성
   */
  async create(config: WalletConfig): Promise<Wallet> {
    // 1. Owner Key 생성 (KMS 또는 로컬)
    const ownerPublicKey = await this.keyManagement.createOwnerKey(config.walletId);

    // 2. Agent Key 생성 (Enclave 또는 로컬)
    const agentPublicKey = await this.keyManagement.initializeAgentKey(config.walletId);

    // 3. Squads 멀티시그 생성
    const { multisigPda, vaultPda } = await this.blockchain.createSmartWallet(
      ownerPublicKey,
      agentPublicKey,
      config
    );

    // 4. 지갑 메타데이터 저장
    const wallet = await this.repository.create({
      id: config.walletId,
      multisigAddress: multisigPda,
      vaultAddress: vaultPda,
      ownerPublicKey: ownerPublicKey.toBase58(),
      agentPublicKey: agentPublicKey.toBase58(),
      policy: config.defaultPolicy,
      status: 'active',
      createdAt: new Date()
    });

    return wallet;
  }

  /**
   * 지갑 조회
   */
  async get(walletId: string): Promise<Wallet | null> {
    return this.repository.findById(walletId);
  }

  /**
   * 지갑 정책 업데이트 (Owner 권한 필요)
   */
  async updatePolicy(walletId: string, newPolicy: WalletPolicy): Promise<Wallet> {
    // 1. 지갑 조회
    const wallet = await this.repository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);

    // 2. 정책 유효성 검증
    // (실제 업데이트는 Owner 서명 필요)

    // 3. 정책 업데이트
    return this.repository.updatePolicy(walletId, newPolicy);
  }

  /**
   * Agent Key 로테이션
   */
  async rotateAgentKey(walletId: string): Promise<{ oldKey: string; newKey: string }> {
    const wallet = await this.repository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);

    const oldKey = wallet.agentPublicKey;

    // 1. 새 Agent Key 생성
    const newAgentPublicKey = await this.keyManagement.rotateAgentKey(walletId);

    // 2. Squads 멤버 교체 (Owner 서명 필요)
    await this.blockchain.addMember(
      wallet.multisigAddress,
      newAgentPublicKey,
      { initiate: true, vote: true, execute: true, settings: false, addMember: false, removeMember: false }
    );
    await this.blockchain.removeMember(
      wallet.multisigAddress,
      new PublicKey(oldKey)
    );

    // 3. 메타데이터 업데이트
    await this.repository.updateAgentKey(walletId, newAgentPublicKey.toBase58());

    return { oldKey, newKey: newAgentPublicKey.toBase58() };
  }
}
```

### 5.3 TransactionService

```typescript
// packages/core/src/services/TransactionService.ts

import { IKeyManagementService } from '../interfaces/IKeyManagementService';
import { IPolicyEngine } from '../interfaces/IPolicyEngine';
import { IBlockchainAdapter } from '../interfaces/IBlockchainAdapter';
import { TransactionRequest, TransactionResult } from '../domain/transaction';

export class TransactionService {
  constructor(
    private readonly keyManagement: IKeyManagementService,
    private readonly policyEngine: IPolicyEngine,
    private readonly blockchain: IBlockchainAdapter,
    private readonly repository: ITransactionRepository
  ) {}

  /**
   * 트랜잭션 실행 (Fail-safe 원칙)
   */
  async execute(request: TransactionRequest): Promise<TransactionResult> {
    // 1. 지갑 정책 조회
    const policy = await this.repository.getWalletPolicy(request.walletId);
    const context = await this.repository.getPolicyContext(request.walletId);

    // 2. 서버 레벨 정책 평가 (1차 검증)
    const serverEvaluation = await this.policyEngine.evaluate(
      request.transaction,
      policy,
      context
    );

    if (!serverEvaluation.allowed) {
      return {
        status: 'rejected',
        stage: 'server_policy',
        violations: serverEvaluation.violations,
        escalation: serverEvaluation.escalation
      };
    }

    // 3. 트랜잭션 구성
    const unsignedTx = await this.blockchain.buildTransaction(request);

    // 4. 시뮬레이션
    const simulation = await this.blockchain.simulateTransaction(unsignedTx);
    if (!simulation.success) {
      return {
        status: 'simulation_failed',
        error: simulation.error,
        logs: simulation.logs
      };
    }

    // 5. Agent Key 서명 (Enclave 내부 정책 2차 검증 포함)
    // Fail-safe: Enclave 연결 실패 시 거부
    let signResult;
    try {
      signResult = await this.keyManagement.signWithAgentKey(
        request.walletId,
        unsignedTx,
        policy
      );
    } catch (error) {
      // Fail-safe: 장애 시 거부
      return {
        status: 'rejected',
        stage: 'key_management_error',
        error: 'Key management service unavailable',
        failSafe: true
      };
    }

    if (!signResult.success) {
      return {
        status: 'rejected',
        stage: 'enclave_policy',
        violations: [signResult.violation]
      };
    }

    // 6. 온체인 제출 (재시도 없음 - 호출자가 결정)
    const result = await this.blockchain.submitTransaction(signResult.signedTransaction);

    // 7. 트랜잭션 기록
    await this.repository.recordTransaction({
      walletId: request.walletId,
      signature: result.signature,
      status: result.status,
      amount: request.amount,
      createdAt: new Date()
    });

    return result;
  }
}
```

### 5.4 PolicyEngine

```typescript
// packages/core/src/services/PolicyEngine.ts

import { Transaction, PublicKey } from '@solana/web3.js';
import { IPolicyEngine, PolicyContext, PolicyEvaluationResult, EscalationType } from '../interfaces/IPolicyEngine';
import { AgentPolicy, PolicyViolation, ViolationSeverity } from '../domain/policy';

export class PolicyEngine implements IPolicyEngine {
  /**
   * 정책 평가
   */
  async evaluate(
    transaction: Transaction,
    policy: AgentPolicy,
    context: PolicyContext
  ): Promise<PolicyEvaluationResult> {
    const violations: PolicyViolation[] = [];

    // 1. 금액 한도 검증
    const txAmount = this.extractTransferAmount(transaction);

    if (txAmount > policy.limits.perTransaction) {
      violations.push({
        code: 'AMOUNT_EXCEEDS_LIMIT',
        severity: 'medium',
        message: `트랜잭션 금액(${txAmount})이 한도(${policy.limits.perTransaction})를 초과`,
        details: { txAmount, limit: policy.limits.perTransaction }
      });
    }

    if (context.dailySpentLamports + txAmount > policy.limits.dailyTotal) {
      violations.push({
        code: 'DAILY_LIMIT_EXCEEDED',
        severity: 'medium',
        message: `일일 한도 초과`,
        details: {
          dailySpent: context.dailySpentLamports,
          txAmount,
          dailyLimit: policy.limits.dailyTotal
        }
      });
    }

    // 2. 화이트리스트 검증
    const recipients = this.extractRecipients(transaction);
    for (const recipient of recipients) {
      if (!policy.whitelist.addresses.includes(recipient.toBase58())) {
        violations.push({
          code: 'RECIPIENT_NOT_WHITELISTED',
          severity: 'high',
          message: `수신자(${recipient.toBase58()})가 화이트리스트에 없음`,
          details: { recipient: recipient.toBase58() }
        });
      }
    }

    // 3. 프로그램 화이트리스트 검증
    const programs = this.extractProgramIds(transaction);
    for (const program of programs) {
      if (!policy.whitelist.programs.includes(program.toBase58())) {
        violations.push({
          code: 'PROGRAM_NOT_WHITELISTED',
          severity: 'high',
          message: `프로그램(${program.toBase58()})이 화이트리스트에 없음`,
          details: { program: program.toBase58() }
        });
      }
    }

    // 4. 시간 제어 검증
    const currentHour = new Date().getUTCHours();
    if (policy.timeControls) {
      const { start, end } = policy.timeControls.allowedHours;
      if (currentHour < start || currentHour > end) {
        violations.push({
          code: 'OUTSIDE_ALLOWED_HOURS',
          severity: 'low',
          message: `허용 시간(${start}-${end}시) 외 요청`,
          details: { currentHour, allowedHours: { start, end } }
        });
      }

      // 쿨다운 검증
      if (context.lastTransactionAt) {
        const secondsSinceLastTx = (Date.now() - context.lastTransactionAt.getTime()) / 1000;
        if (secondsSinceLastTx < policy.timeControls.cooldownSeconds) {
          violations.push({
            code: 'COOLDOWN_ACTIVE',
            severity: 'low',
            message: `쿨다운(${policy.timeControls.cooldownSeconds}초) 중`,
            details: { secondsSinceLastTx, cooldownSeconds: policy.timeControls.cooldownSeconds }
          });
        }
      }
    }

    // 5. 결과 반환
    if (violations.length === 0) {
      return { allowed: true, violations: [] };
    }

    const maxSeverity = this.getMaxSeverity(violations);
    return {
      allowed: false,
      violations,
      escalation: this.determineEscalation({ code: violations[0].code, severity: maxSeverity, message: '', details: {} })
    };
  }

  /**
   * 에스컬레이션 결정
   */
  determineEscalation(violation: PolicyViolation): EscalationType {
    switch (violation.severity) {
      case 'low':
        return { type: 'NOTIFY_OWNER', channel: 'push' };
      case 'medium':
        return { type: 'REQUIRE_OWNER_APPROVAL', timeoutSeconds: 3600 };
      case 'high':
        return { type: 'FREEZE_AND_ALERT', requireManualUnfreeze: true };
      case 'critical':
        return { type: 'EMERGENCY_LOCKDOWN', revokeAgentKey: true };
      default:
        return { type: 'NOTIFY_OWNER', channel: 'email' };
    }
  }

  /**
   * 정책 유효성 검증
   */
  validate(policy: AgentPolicy): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (policy.limits.perTransaction <= 0) {
      errors.push('perTransaction 한도는 0보다 커야 함');
    }

    if (policy.limits.dailyTotal < policy.limits.perTransaction) {
      errors.push('dailyTotal은 perTransaction 이상이어야 함');
    }

    // ... 추가 검증

    return { valid: errors.length === 0, errors };
  }

  private extractTransferAmount(transaction: Transaction): bigint {
    // 트랜잭션에서 전송 금액 추출
    return 0n; // 구현 필요
  }

  private extractRecipients(transaction: Transaction): PublicKey[] {
    // 트랜잭션에서 수신자 주소 추출
    return []; // 구현 필요
  }

  private extractProgramIds(transaction: Transaction): PublicKey[] {
    // 트랜잭션에서 프로그램 ID 추출
    return []; // 구현 필요
  }

  private getMaxSeverity(violations: PolicyViolation[]): ViolationSeverity {
    const severityOrder: ViolationSeverity[] = ['low', 'medium', 'high', 'critical'];
    let maxIndex = 0;
    for (const v of violations) {
      const idx = severityOrder.indexOf(v.severity);
      if (idx > maxIndex) maxIndex = idx;
    }
    return severityOrder[maxIndex];
  }
}
```

---

## 6. 데이터 저장소

### 6.1 PostgreSQL 스키마

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// 지갑 관련 모델
// ─────────────────────────────────────────

model Wallet {
  id               String   @id @default(uuid())
  externalId       String   @unique  // 클라이언트 제공 ID
  multisigAddress  String   @unique
  vaultAddress     String   @unique
  ownerPublicKey   String
  agentPublicKey   String
  status           WalletStatus @default(ACTIVE)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  policy           WalletPolicy?
  transactions     Transaction[]
  keyRotations     KeyRotation[]

  @@index([multisigAddress])
  @@index([status])
}

enum WalletStatus {
  ACTIVE
  SUSPENDED
  FROZEN
  CLOSED
}

model WalletPolicy {
  id                    String   @id @default(uuid())
  walletId              String   @unique
  wallet                Wallet   @relation(fields: [walletId], references: [id])

  // 금액 한도 (lamports)
  perTransactionLimit   BigInt
  dailyTotalLimit       BigInt
  weeklyTotalLimit      BigInt
  monthlyTotalLimit     BigInt

  // 화이트리스트 (JSON)
  allowedAddresses      String[] // PublicKey[]
  allowedPrograms       String[] // ProgramId[]
  allowedTokenMints     String[] // TokenMint[]

  // 시간 제어
  allowedHoursStart     Int?     // UTC 시작 시간
  allowedHoursEnd       Int?     // UTC 종료 시간
  cooldownSeconds       Int      @default(0)

  // 에스컬레이션 설정
  escalationThreshold   BigInt?  // 이 금액 이상 시 Owner 승인 필요

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

// ─────────────────────────────────────────
// 트랜잭션 관련 모델
// ─────────────────────────────────────────

model Transaction {
  id               String   @id @default(uuid())
  walletId         String
  wallet           Wallet   @relation(fields: [walletId], references: [id])

  signature        String?  @unique  // 온체인 서명
  status           TransactionStatus
  type             TransactionType

  // 금액 정보
  amountLamports   BigInt
  tokenMint        String?  // SPL 토큰인 경우

  // 수신자
  recipientAddress String

  // 정책 평가 결과
  policyResult     Json?    // { allowed, violations, escalation }

  // 에스컬레이션 (필요시)
  escalationId     String?
  escalation       Escalation? @relation(fields: [escalationId], references: [id])

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([walletId, createdAt])
  @@index([status])
  @@index([signature])
}

enum TransactionStatus {
  PENDING
  POLICY_REJECTED
  SIMULATION_FAILED
  AWAITING_APPROVAL
  SUBMITTED
  CONFIRMED
  FINALIZED
  FAILED
}

enum TransactionType {
  TRANSFER
  TOKEN_TRANSFER
  PROGRAM_CALL
  STAKE
  UNSTAKE
}

model Escalation {
  id               String   @id @default(uuid())
  type             EscalationType
  status           EscalationStatus @default(PENDING)

  // 승인 정보
  approvedBy       String?  // Owner PublicKey
  approvedAt       DateTime?
  rejectedReason   String?

  timeoutAt        DateTime

  transactions     Transaction[]

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

enum EscalationType {
  OWNER_APPROVAL
  FREEZE_ALERT
  EMERGENCY_LOCKDOWN
}

enum EscalationStatus {
  PENDING
  APPROVED
  REJECTED
  TIMED_OUT
}

// ─────────────────────────────────────────
// 키 관리 관련 모델
// ─────────────────────────────────────────

model KeyRotation {
  id               String   @id @default(uuid())
  walletId         String
  wallet           Wallet   @relation(fields: [walletId], references: [id])

  keyType          KeyType
  oldPublicKey     String
  newPublicKey     String

  reason           String   // 'scheduled', 'security_incident', 'manual'
  status           KeyRotationStatus @default(IN_PROGRESS)

  initiatedAt      DateTime @default(now())
  completedAt      DateTime?

  @@index([walletId])
}

enum KeyType {
  OWNER
  AGENT
}

enum KeyRotationStatus {
  IN_PROGRESS
  COMPLETED
  FAILED
  ROLLED_BACK
}
```

### 6.2 Redis 사용처

| 용도 | 키 패턴 | TTL | 설명 |
|------|--------|-----|------|
| **세션** | `session:{sessionId}` | 24h | API 세션 토큰 |
| **정책 컨텍스트 캐시** | `policy:ctx:{walletId}` | 5m | 누적 사용량 캐시 |
| **Rate Limit** | `ratelimit:{apiKey}:{window}` | 1m | API Rate Limiting |
| **지갑 잠금** | `lock:wallet:{walletId}` | 30s | 동시 트랜잭션 방지 |
| **Nonce 캐시** | `nonce:{walletId}` | 10s | 리플레이 공격 방지 |

```typescript
// Redis 키 관리
class RedisKeyManager {
  // 정책 컨텍스트 캐시
  async getPolicyContext(walletId: string): Promise<PolicyContext | null> {
    const key = `policy:ctx:${walletId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async setPolicyContext(walletId: string, context: PolicyContext): Promise<void> {
    const key = `policy:ctx:${walletId}`;
    await this.redis.setex(key, 300, JSON.stringify(context)); // 5분 TTL
  }

  // Rate Limit
  async checkRateLimit(apiKey: string, limit: number, windowSeconds: number): Promise<boolean> {
    const key = `ratelimit:${apiKey}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return current <= limit;
  }

  // 지갑 잠금 (분산 락)
  async acquireWalletLock(walletId: string, ttlSeconds: number = 30): Promise<boolean> {
    const key = `lock:wallet:${walletId}`;
    const lockId = crypto.randomUUID();
    const result = await this.redis.set(key, lockId, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseWalletLock(walletId: string): Promise<void> {
    const key = `lock:wallet:${walletId}`;
    await this.redis.del(key);
  }
}
```

### 6.3 암호화 키스토어 (셀프호스트)

셀프호스트 환경에서 Agent Key는 암호화된 파일로 저장.

```typescript
// packages/selfhost/src/infrastructure/encrypted-keystore/KeystoreFile.ts

interface KeystoreFileFormat {
  version: 1;
  walletId: string;
  keyType: 'owner' | 'agent';

  // 암호화된 비밀키
  encryptedSecretKey: string;  // base64

  // 암호화 메타데이터
  encryption: {
    algorithm: 'XChaCha20-Poly1305';
    nonce: string;             // base64
    kdf: {
      algorithm: 'Argon2id';
      salt: string;            // base64
      opsLimit: number;
      memLimit: number;
    };
  };

  // 공개키 (평문)
  publicKey: string;           // base58

  // 메타데이터
  createdAt: string;           // ISO 8601
  lastRotatedAt: string | null;
}
```

파일 저장 위치: `/app/data/keystore/{walletId}/{keyType}.json`

---

## 7. 배포 환경

### 7.1 클라우드 환경: EC2 + Nitro Enclave

```
┌─────────────────────────────────────────────────────────────────┐
│                    AWS 클라우드 아키텍처                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │                      VPC                                 │  │
│    │  ┌─────────────────┐     ┌─────────────────┐            │  │
│    │  │ Public Subnet   │     │ Private Subnet  │            │  │
│    │  │                 │     │                 │            │  │
│    │  │ ┌─────────────┐ │     │ ┌─────────────┐ │            │  │
│    │  │ │     ALB     │ │     │ │   EC2       │ │            │  │
│    │  │ │             │─┼─────┼─│  + Enclave  │ │            │  │
│    │  │ └─────────────┘ │     │ └──────┬──────┘ │            │  │
│    │  │                 │     │        │        │            │  │
│    │  └─────────────────┘     │ ┌──────┴──────┐ │            │  │
│    │                          │ │    RDS      │ │            │  │
│    │                          │ │ PostgreSQL  │ │            │  │
│    │                          │ └─────────────┘ │            │  │
│    │                          │                 │            │  │
│    │                          │ ┌─────────────┐ │            │  │
│    │                          │ │ ElastiCache │ │            │  │
│    │                          │ │   Redis     │ │            │  │
│    │                          │ └─────────────┘ │            │  │
│    │                          │                 │            │  │
│    │                          └─────────────────┘            │  │
│    └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│    ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│    │    AWS KMS     │  │  CloudWatch    │  │  CloudTrail    │   │
│    │  (Owner Key)   │  │  (Monitoring)  │  │  (Audit Log)   │   │
│    └────────────────┘  └────────────────┘  └────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**EC2 인스턴스 요구사항:**
- 인스턴스 타입: `c5.xlarge` 이상 (Nitro Enclave 지원)
- Enclave 활성화: `--enclave-options 'Enabled=true'`
- IAM Role: `WAIaaS-EC2-Role` (KMS 접근 권한)

### 7.2 셀프호스트 환경: Docker Compose

```yaml
# packages/selfhost/docker/docker-compose.yml

version: '3.8'

services:
  # ─────────────────────────────────────────
  # WAIaaS API 서버
  # ─────────────────────────────────────────
  waiass-api:
    build:
      context: ../..
      dockerfile: packages/selfhost/docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://waiass:${DB_PASSWORD}@postgres:5432/waiass
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - SOLANA_RPC_URL=${SOLANA_RPC_URL}
      - LOG_LEVEL=info
    secrets:
      - keystore_password
    volumes:
      - keystore-data:/app/data/keystore:rw
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=64M,mode=1777
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ─────────────────────────────────────────
  # PostgreSQL 데이터베이스
  # ─────────────────────────────────────────
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: waiass
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
      POSTGRES_DB: waiass
    volumes:
      - postgres-data:/var/lib/postgresql/data
    secrets:
      - db_password
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U waiass"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────
  # Redis 캐시
  # ─────────────────────────────────────────
  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

# ─────────────────────────────────────────
# Secrets (Docker Swarm 또는 외부 관리)
# ─────────────────────────────────────────
secrets:
  keystore_password:
    external: true
  db_password:
    external: true

# ─────────────────────────────────────────
# 볼륨
# ─────────────────────────────────────────
volumes:
  keystore-data:
    driver: local
  postgres-data:
    driver: local
  redis-data:
    driver: local

# ─────────────────────────────────────────
# 네트워크
# ─────────────────────────────────────────
networks:
  default:
    driver: bridge
```

**Dockerfile:**

```dockerfile
# packages/selfhost/docker/Dockerfile

FROM node:22-alpine AS builder

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@9 --activate

# 의존성 설치
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/selfhost/package.json packages/selfhost/
COPY packages/api/package.json packages/api/

RUN pnpm install --frozen-lockfile

# 소스 복사 및 빌드
COPY packages/core packages/core/
COPY packages/selfhost packages/selfhost/
COPY packages/api packages/api/
COPY tsconfig.json turbo.json ./

RUN pnpm turbo build --filter=@waiass/api --filter=@waiass/selfhost

# ─────────────────────────────────────────
# 프로덕션 이미지
# ─────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# 보안: 비-root 사용자
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 waiass

# 필요한 파일만 복사
COPY --from=builder --chown=waiass:nodejs /app/packages/core/dist packages/core/dist/
COPY --from=builder --chown=waiass:nodejs /app/packages/selfhost/dist packages/selfhost/dist/
COPY --from=builder --chown=waiass:nodejs /app/packages/api/dist packages/api/dist/
COPY --from=builder --chown=waiass:nodejs /app/node_modules node_modules/
COPY --from=builder --chown=waiass:nodejs /app/package.json ./

# 데이터 디렉토리
RUN mkdir -p /app/data/keystore && chown -R waiass:nodejs /app/data

USER waiass

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "packages/api/dist/server.js"]
```

---

## 8. Mermaid 다이어그램

### 8.1 시스템 컨텍스트 다이어그램 (C4 Level 1)

(섹션 2.1에서 이미 포함됨)

### 8.2 컨테이너 다이어그램 (C4 Level 2)

(섹션 2.2에서 이미 포함됨)

### 8.3 패키지 의존성 그래프

(섹션 3.3에서 이미 포함됨)

### 8.4 트랜잭션 처리 시퀀스

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant API as API Server
    participant Policy as PolicyEngine
    participant KMS as KeyManagement
    participant Enclave as Nitro Enclave
    participant Squads as Squads Protocol
    participant Solana as Solana RPC

    Agent->>API: POST /api/v1/transactions
    API->>API: 요청 검증 (Validation)

    API->>Policy: evaluate(tx, policy, context)
    Policy->>Policy: 금액/화이트리스트/시간 검증
    Policy-->>API: { allowed: true }

    API->>API: buildTransaction(request)

    API->>Solana: simulateTransaction(tx)
    Solana-->>API: { success: true }

    API->>KMS: signWithAgentKey(walletId, tx, policy)
    KMS->>Enclave: vsock: SIGN_REQUEST
    Enclave->>Enclave: 정책 2차 검증
    Enclave->>Enclave: ED25519 서명
    Enclave-->>KMS: SignResponse
    KMS-->>API: { success, signedTx }

    API->>Squads: submitProposal(signedTx)
    Squads->>Solana: 트랜잭션 제출
    Solana-->>Squads: signature
    Squads-->>API: { signature, status }

    API->>API: recordTransaction(result)
    API-->>Agent: { status: 'confirmed', signature }

    opt Webhook 설정 시
        API->>Agent: POST webhook (async)
    end
```

---

## 9. 참조 문서

### 9.1 내부 문서

| 문서 | 내용 | 위치 |
|------|------|------|
| **ARCH-01** | Dual Key 아키텍처 상세 설계 | .planning/deliverables/08-dual-key-architecture.md |
| **CUST-04** | 권장 커스터디 모델 제안서 | .planning/deliverables/07-recommended-custody-model.md |
| **03-CONTEXT** | Phase 3 컨텍스트 | .planning/phases/03-system-architecture/03-CONTEXT.md |
| **03-RESEARCH** | 시스템 아키텍처 리서치 | .planning/phases/03-system-architecture/03-RESEARCH.md |

### 9.2 외부 참조

| 참조 | 내용 | 신뢰도 |
|------|------|--------|
| [Fastify Documentation](https://fastify.dev/docs/latest/) | API 프레임워크 | HIGH |
| [Prisma Documentation](https://www.prisma.io/docs) | ORM | HIGH |
| [Squads Protocol v4](https://github.com/Squads-Protocol/v4) | Solana 멀티시그 | HIGH |
| [AWS Nitro Enclaves](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave.html) | TEE | HIGH |
| [Turborepo](https://turbo.build/repo/docs) | 모노레포 빌드 | HIGH |

---

*문서 ID: ARCH-02*
*작성일: 2026-02-04*
*Phase: 03-system-architecture*
*상태: 완료*
