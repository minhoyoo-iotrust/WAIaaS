# Phase 2: 커스터디 모델 분석 - Research

**Researched:** 2026-02-04
**Domain:** 커스터디 모델 / 키 관리 / MPC-TSS / AI 에이전트 지갑 보안
**Confidence:** MEDIUM

## Summary

본 리서치는 AI 에이전트 지갑에 최적화된 커스터디 모델 분석을 위해 직접 구축 방식(HSM, KMS, MPC)과 외부 프로바이더를 비교 분석하였다. 2025-2026년 시장 동향에서 MPC(Multi-Party Computation) 기반 아키텍처가 엔터프라이즈 표준으로 자리잡았으며, 특히 AWS Nitro Enclaves 기반 TEE(Trusted Execution Environment) 구현이 Coinbase, Fireblocks 등 주요 기관에서 수십억 달러 규모의 자산을 보호하는 데 활용되고 있다.

AI 에이전트 지갑의 핵심 과제는 "자율적 운영"과 "소유자 통제권 유지"라는 상충 요구사항을 해결하는 것이다. Crossmint이 제안한 **Dual Key Architecture**(Owner Key + Agent Key)가 이 문제의 표준 해법으로 부상했으며, Solana 환경에서는 **Squads Protocol**을 통한 스마트 월렛 구현이 권장된다. 또한 AWS KMS가 2025년 11월 ED25519 지원을 발표하면서 Solana 트랜잭션 서명에 직접 KMS를 활용하는 것이 가능해졌다.

직접 구축 시 추천 아키텍처는: (1) AWS KMS ED25519로 Owner Key 관리, (2) AWS Nitro Enclaves 기반 TEE에서 Agent Key 운영, (3) Squads Protocol 기반 Solana 스마트 월렛으로 권한 분리 구현이다. 이 조합은 외부 프로바이더 의존 없이 보안성과 자율성을 모두 확보할 수 있다.

**Primary recommendation:** AWS KMS (ED25519) + Nitro Enclaves TEE + Squads Protocol 기반 Dual Key 아키텍처를 직접 구축하라.

## Standard Stack

### 자체 구축 권장 스택

| 구성 요소 | 기술 | 용도 | 선택 이유 |
|----------|------|------|----------|
| Owner Key 관리 | AWS KMS (ECC_NIST_EDWARDS25519) | 소유자 마스터 키 보관/서명 | FIPS 140-2 Level 3 검증, ED25519 공식 지원 (2025-11) |
| Agent Key 런타임 | AWS Nitro Enclaves | 에이전트 키 격리 실행 환경 | Coinbase, Fireblocks 검증, 메모리 암호화, 호스트 접근 차단 |
| 스마트 월렛 | Squads Protocol v4 | Solana 멀티시그/권한 제어 | $10B+ 자산 보호, formal verification, OtterSec/Trail of Bits 감사 |
| MPC 라이브러리 (선택) | CGGMP21 (Dfns Rust) | 자체 MPC 구현 시 | 4라운드 서명, Kudelski Security 감사, MIT/Apache 라이선스 |
| KMS 서명 SDK | solana-kms-signer | KMS 기반 Solana 서명 | TypeScript, VersionedTransaction 지원, tweetnacl 검증 |

### Supporting Stack

| 라이브러리 | 버전 | 용도 | 사용 시점 |
|-----------|------|------|----------|
| @aws-sdk/client-kms | latest | AWS KMS 클라이언트 | Owner Key 서명 요청 |
| @solana/kit | 3.x | Solana 트랜잭션 구성 | 모든 Solana 작업 |
| @sqds/sdk | latest | Squads 멀티시그 SDK | 스마트 월렛 생성/관리 |
| tweetnacl | latest | ED25519 서명 검증 | 로컬 서명 검증 |

### 외부 프로바이더 비교 (참고용)

| 프로바이더 | 보안 모델 | Solana 지원 | AI 에이전트 특화 | 비용 모델 |
|-----------|----------|-------------|----------------|----------|
| Turnkey | TEE (Nitro Enclaves) | O | 정책 엔진 | 트랜잭션 기반 |
| Dfns | MPC (CGGMP21) | O | - | 프리미엄 |
| Crossmint | Smart Wallet + 2FA | O | Agent Wallets | API 호출 기반 |
| Privy | SSS + Enclaves | O | - | MAU 기반 ($299/500 MAU) |
| Dynamic | TSS-MPC | O | - | MAU 기반 ($249/5K MAU) |

**Installation (자체 구축):**
```bash
# AWS SDK
pnpm add @aws-sdk/client-kms

# Solana KMS Signer
pnpm add solana-kms-signer

# Squads Protocol SDK
pnpm add @sqds/sdk

# Solana 기본
pnpm add @solana/kit @solana/web3.js
```

## Architecture Patterns

### Recommended: Dual Key Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         Squads Smart Wallet             │
                    │   (Solana Program - Multisig)           │
                    ├─────────────────────────────────────────┤
                    │  - 소유자 권한: Owner Key               │
                    │  - 에이전트 권한: Agent Key             │
                    │  - 정책: 금액한도, 화이트리스트, 시간   │
                    └──────────────┬──────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    │                    ▼
    ┌─────────────────┐           │          ┌─────────────────┐
    │   Owner Key     │           │          │   Agent Key     │
    │  (AWS KMS)      │           │          │ (Nitro Enclave) │
    ├─────────────────┤           │          ├─────────────────┤
    │ - 마스터 권한   │           │          │ - 일상 운영     │
    │ - 자금 회수     │           │          │ - 정책 범위 내  │
    │ - 에이전트 중지 │           │          │ - 자율적 서명   │
    │ - 키 교체       │           │          │ - TEE 격리      │
    └─────────────────┘           │          └─────────────────┘
              │                    │                    │
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────┐
    │                   WAIaaS API Server                     │
    │   - 트랜잭션 요청 검증                                  │
    │   - 정책 평가 (금액, 화이트리스트, 시간)                │
    │   - 서명 조율 (Owner 승인 필요 시 알림)                 │
    └─────────────────────────────────────────────────────────┘
```

### Pattern 1: Owner Key with AWS KMS

**What:** AWS KMS ED25519 키로 소유자의 마스터 키를 관리
**When to use:** 소유자가 에이전트 중지, 자금 회수, 권한 변경 시

```typescript
// Source: AWS KMS CreateKey API + solana-kms-signer
import { SolanaKmsSigner } from 'solana-kms-signer';
import { KMSClient, CreateKeyCommand } from '@aws-sdk/client-kms';

// 1. KMS 키 생성 (최초 1회)
const kms = new KMSClient({ region: 'ap-northeast-2' });
const createKeyResponse = await kms.send(new CreateKeyCommand({
  KeySpec: 'ECC_NIST_EDWARDS25519',
  KeyUsage: 'SIGN_VERIFY',
  Description: 'Owner Key for AI Agent Wallet',
  Tags: [{ TagKey: 'Purpose', TagValue: 'WAIaaS-OwnerKey' }]
}));
const ownerKeyId = createKeyResponse.KeyMetadata?.KeyId;

// 2. Solana 서명자 초기화
const ownerSigner = new SolanaKmsSigner({
  region: 'ap-northeast-2',
  keyId: ownerKeyId
});

// 3. 공개키 조회 (Squads 등록용)
const ownerPublicKey = await ownerSigner.getPublicKey();

// 4. 트랜잭션 서명
const signedTx = await ownerSigner.signTransaction(transaction);
```

### Pattern 2: Agent Key with Nitro Enclaves

**What:** Nitro Enclave 내에서 Agent Key 생성 및 서명
**When to use:** AI 에이전트의 자율적 트랜잭션 서명

```typescript
// Source: AWS Nitro Enclaves Guidance
// Enclave 내부 코드 (agent-enclave.ts)

import { Keypair } from '@solana/web3.js';

// Enclave 내부에서만 키 생성/보관
// 키는 암호화되어 Enclave 메모리에만 존재
let agentKeypair: Keypair | null = null;

// Enclave 초기화 시 키 생성 또는 복구
async function initializeAgentKey(encryptedSeed?: Buffer): Promise<PublicKey> {
  if (encryptedSeed) {
    // KMS로 암호화된 시드 복호화 (attestation 필요)
    const seed = await decryptWithAttestation(encryptedSeed);
    agentKeypair = Keypair.fromSeed(seed);
  } else {
    // 새 키 생성
    agentKeypair = Keypair.generate();
    // 시드를 KMS로 암호화하여 외부 저장
    await encryptAndStoreSeep(agentKeypair.secretKey);
  }
  return agentKeypair.publicKey;
}

// 정책 검증 후 서명 (Enclave 내부에서만 실행)
async function signIfPolicyAllows(
  transaction: Transaction,
  policy: AgentPolicy
): Promise<Buffer | null> {
  if (!agentKeypair) throw new Error('Agent key not initialized');

  // 정책 검증
  if (!validatePolicy(transaction, policy)) {
    return null; // 정책 위반
  }

  transaction.sign(agentKeypair);
  return transaction.serialize();
}
```

### Pattern 3: Squads Protocol Integration

**What:** Squads v4로 멀티시그 스마트 월렛 구성
**When to use:** Owner Key + Agent Key의 권한 분리 온체인 구현

```typescript
// Source: Squads Protocol v4 SDK
import * as multisig from '@sqds/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// 1. Squads 멀티시그 생성
async function createAgentWallet(
  connection: Connection,
  ownerPubkey: PublicKey,
  agentPubkey: PublicKey
) {
  // 2-of-2 멀티시그: Owner + Agent 모두 필요 (고액 거래)
  // 또는 1-of-2: Agent 단독 가능 (소액 거래)
  const multisigPda = await multisig.Multisig.create({
    connection,
    creator: ownerPubkey,
    members: [
      { key: ownerPubkey, permissions: multisig.Permissions.all() },
      { key: agentPubkey, permissions: multisig.Permissions.execute() }
    ],
    threshold: 1, // Agent 단독 서명으로 기본 실행 가능
    timeLock: 0
  });

  return multisigPda;
}

// 2. 거래 제안 및 실행
async function proposeAndExecute(
  multisigPda: PublicKey,
  instruction: TransactionInstruction,
  agentSigner: Keypair
) {
  // 트랜잭션 제안
  const proposalPda = await multisig.Proposal.create({
    multisig: multisigPda,
    creator: agentSigner.publicKey,
    instructions: [instruction]
  });

  // Agent 승인
  await multisig.Proposal.approve({
    proposal: proposalPda,
    member: agentSigner.publicKey
  });

  // 실행 (threshold 충족 시)
  await multisig.Proposal.execute({
    proposal: proposalPda
  });
}
```

### Anti-Patterns to Avoid

- **서버 메모리에 Private Key 직접 보관:** 환경변수나 메모리에 평문 키 저장은 메모리 덤프, 로그 유출 위험. 반드시 TEE 또는 KMS 사용.
- **단일 키로 모든 권한 부여:** Owner와 Agent 키를 분리하지 않으면 에이전트 침해 시 전체 자산 위험.
- **MPC 직접 구현:** GG18/GG20의 BitForge 취약점 등 복잡한 보안 이슈. 검증된 라이브러리(CGGMP21) 사용 필수.
- **Threshold 없는 단순 멀티시그:** 금액 기반 동적 threshold 없이 고정 threshold만 사용하면 UX 저하 또는 보안 취약.

## Don't Hand-Roll

| 문제 | 직접 구현 시도 | 대신 사용할 것 | 이유 |
|------|--------------|---------------|------|
| ED25519 서명 | crypto 직접 호출 | AWS KMS / tweetnacl | 사이드채널 공격, 타이밍 공격 방어 필요 |
| MPC 프로토콜 | GG18/GG20 직접 구현 | CGGMP21 (Dfns) | BitForge 취약점, 영지식 증명 검증 복잡 |
| 키 분산 저장 | 자체 샤딩 로직 | Shamir's Secret Sharing 라이브러리 | 수학적 검증 필요, 재구성 로직 복잡 |
| Solana 멀티시그 | 커스텀 프로그램 | Squads Protocol v4 | formal verification, $10B+ 실사용 검증 |
| TEE 격리 | 자체 샌드박스 | AWS Nitro Enclaves | 하드웨어 수준 격리 필요 |

**Key insight:** 암호화폐 키 관리는 "간단해 보이는 문제"의 대표적 사례. 단순 서명 로직도 사이드채널 공격, 재생 공격, 키 유출 등 수십 가지 공격 벡터가 존재. 2024년 암호화폐 해킹 피해의 43.8%가 개인키 침해에서 발생 (Chainalysis).

## Common Pitfalls

### Pitfall 1: Owner Key 복구 경로 미설계

**What goes wrong:** 소유자가 Owner Key 접근 권한을 상실하면 자금 영구 손실
**Why it happens:** "나중에 구현"으로 미루다가 장애 발생
**How to avoid:**
- AWS KMS 키에 대한 IAM 역할 분리 및 백업 계정 설정
- Squads의 time-locked recovery 기능 활용
- Social recovery 또는 M-of-N guardian 구조 설계
**Warning signs:** 단일 IAM 사용자만 KMS 키 접근 권한 보유

### Pitfall 2: Agent Key 정책 우회

**What goes wrong:** 에이전트가 정책 검증을 우회하여 무제한 트랜잭션 실행
**Why it happens:** 정책 검증이 서버 레벨에서만 이루어지고 온체인 강제가 없음
**How to avoid:**
- Squads v4의 spending limits, time locks 온체인 강제
- Nitro Enclave 내부에서 정책 검증 후 서명
- 이중 검증: 서버 + 온체인
**Warning signs:** 정책 로직이 API 서버에만 존재

### Pitfall 3: Enclave Attestation 미검증

**What goes wrong:** 변조된 Enclave 코드가 실행되어 키 유출
**Why it happens:** PCR (Platform Configuration Register) 검증 생략
**How to avoid:**
- AWS KMS 키 정책에 attestation 조건 추가
- 배포 시 PCR 값 화이트리스트 관리
- CI/CD에서 Enclave 이미지 해시 검증
**Warning signs:** KMS 키 정책에 `kms:RecipientAttestation` 조건 없음

### Pitfall 4: 네트워크 지연으로 인한 MPC 서명 실패

**What goes wrong:** MPC 멀티파티 서명 시 타임아웃으로 트랜잭션 실패
**Why it happens:** MPC는 여러 라운드의 통신 필요 (CGGMP21도 4라운드)
**How to avoid:**
- 자체 MPC 대신 KMS + TEE 단일 서명 구조 권장
- MPC 필요 시 pre-signing (offline phase) 활용
- 지역별 MPC 노드 배치로 지연 최소화
**Warning signs:** 서명 지연이 2-5초 이상

### Pitfall 5: GDPR 개인정보 온체인 기록

**What goes wrong:** 블록체인의 불변성으로 "삭제권" 행사 불가, GDPR 위반
**Why it happens:** 지갑 주소와 개인 식별 정보 연결 데이터를 온체인에 저장
**How to avoid:**
- 개인정보는 오프체인(PostgreSQL)에만 저장
- 온체인에는 해시 또는 암호화된 참조만 기록
- 지갑 주소-사용자 매핑은 API 서버에서만 관리
**Warning signs:** 트랜잭션 memo에 사용자 식별 정보 포함

## Code Examples

### AWS KMS 키 생성 CLI

```bash
# Source: AWS KMS CLI Documentation
# ED25519 키 생성
aws kms create-key \
  --key-spec ECC_NIST_EDWARDS25519 \
  --key-usage SIGN_VERIFY \
  --description "WAIaaS Owner Key" \
  --region ap-northeast-2

# Enclave attestation 조건 추가 (키 정책)
aws kms put-key-policy \
  --key-id <key-id> \
  --policy-name default \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCOUNT:role/EnclaveRole"},
      "Action": ["kms:Sign", "kms:GetPublicKey"],
      "Resource": "*",
      "Condition": {
        "StringEqualsIgnoreCase": {
          "kms:RecipientAttestation:PCR0": "<enclave-pcr0-hash>"
        }
      }
    }]
  }'
```

### Agent Policy 구조

```typescript
// Source: Crossmint AI Agent Wallet Architecture + Industry Best Practices
interface AgentPolicy {
  // 금액 한도
  limits: {
    perTransaction: bigint;      // 단일 트랜잭션 최대 금액 (lamports)
    dailyTotal: bigint;          // 일일 총 한도
    weeklyTotal: bigint;         // 주간 총 한도
  };

  // 화이트리스트
  whitelist: {
    addresses: PublicKey[];      // 허용된 수신 주소
    programs: PublicKey[];       // 허용된 프로그램 ID
    tokens: PublicKey[];         // 허용된 토큰 민트
  };

  // 시간 제어
  timeControls: {
    allowedHours: [number, number]; // UTC 기준 허용 시간대
    cooldownSeconds: number;        // 트랜잭션 간 최소 간격
  };

  // 에스컬레이션
  escalation: {
    thresholdAmount: bigint;     // 이 금액 초과 시 Owner 승인 필요
    requireOwnerApproval: PublicKey[]; // Owner 승인 필요한 프로그램
  };
}

// 정책 검증 함수
function validatePolicy(
  transaction: Transaction,
  policy: AgentPolicy,
  dailySpent: bigint
): { valid: boolean; reason?: string } {
  // 1. 금액 한도 검증
  const txAmount = extractTransferAmount(transaction);
  if (txAmount > policy.limits.perTransaction) {
    return { valid: false, reason: 'Exceeds per-transaction limit' };
  }
  if (dailySpent + txAmount > policy.limits.dailyTotal) {
    return { valid: false, reason: 'Exceeds daily limit' };
  }

  // 2. 화이트리스트 검증
  const recipients = extractRecipients(transaction);
  for (const recipient of recipients) {
    if (!policy.whitelist.addresses.some(w => w.equals(recipient))) {
      return { valid: false, reason: `Recipient not whitelisted: ${recipient}` };
    }
  }

  // 3. 시간 제어 검증
  const currentHour = new Date().getUTCHours();
  const [startHour, endHour] = policy.timeControls.allowedHours;
  if (currentHour < startHour || currentHour > endHour) {
    return { valid: false, reason: 'Outside allowed hours' };
  }

  // 4. 에스컬레이션 체크
  if (txAmount > policy.escalation.thresholdAmount) {
    return { valid: false, reason: 'Requires owner approval' };
  }

  return { valid: true };
}
```

## State of the Art

| 이전 방식 | 현재 방식 | 변경 시점 | 영향 |
|----------|----------|----------|------|
| GG18/GG20 MPC | CGGMP21 | 2021 | BitForge 취약점 해결, 4라운드로 성능 개선 |
| HSM 전용 하드웨어 | Cloud HSM (AWS CloudHSM) | 2018~ | 초기 비용 $1000/월 → $1.6/시간 |
| 외부 프로바이더 의존 | 자체 TEE + KMS | 2024~ | 벤더 락인 탈피, 비용 절감, 데이터 주권 |
| 단일 키 지갑 | Dual Key (Owner + Agent) | 2025 | AI 에이전트 지갑 표준 아키텍처 |
| 서버 사이드 키 | KMS ED25519 | 2025-11 | AWS KMS에서 Solana 직접 서명 가능 |

**Deprecated/outdated:**
- **GG18/GG20 MPC 직접 구현:** BitForge 취약점으로 CGGMP21로 대체 권장
- **환경변수 키 저장:** 메모리 덤프 공격 취약, TEE 또는 KMS 필수
- **외부 HSM 박스:** 클라우드 HSM (CloudHSM, KMS)으로 대체

## Custody Model Comparison

### 모델별 상세 비교

| 기준 | Custodial | Non-Custodial (Self-Custody) | MPC-TSS |
|------|-----------|------------------------------|---------|
| **키 소유권** | 제3자 | 사용자 | 분산 (N parties) |
| **단일 장애점** | 있음 (제3자) | 있음 (사용자 기기) | 없음 |
| **복구 가능성** | 높음 (제3자 제공) | 낮음 (시드 분실 시) | 중간 (threshold) |
| **AI 에이전트 적합성** | 낮음 (수탁 규제) | 중간 (키 노출 위험) | 높음 (분산 서명) |
| **규제 준수** | 쉬움 (기존 프레임워크) | 어려움 (책임 소재) | 중간 (새로운 영역) |
| **운영 복잡도** | 낮음 | 중간 | 높음 |
| **비용** | 높음 (수수료) | 낮음 | 중간 (인프라) |

### AI 에이전트 시나리오별 비교

| 시나리오 | 일반 사용자 | AI 에이전트 |
|----------|------------|------------|
| 트랜잭션 승인 | 매번 수동 확인 | 정책 기반 자동 승인 |
| 키 접근 | 필요 시 잠금 해제 | 상시 접근 필요 (TEE 내) |
| 복구 | 시드 문구 보관 | 자동화된 키 교체 |
| 한도 관리 | 자기 통제 | 정책 엔진 강제 |
| 장애 시 | 본인이 조치 | Owner가 원격으로 중지 |

### 권장 모델: 하이브리드 MPC-TEE

AI 에이전트 지갑에는 순수 MPC 또는 순수 TEE가 아닌 **하이브리드 모델** 권장:

1. **Owner Key:** KMS 관리 (FIPS 검증, 감사 로그)
2. **Agent Key:** TEE 내 생성/운영 (빠른 서명, 정책 강제)
3. **온체인 정책:** Squads 멀티시그 (threshold 기반 에스컬레이션)

이 조합으로:
- Owner는 언제든 Agent를 중지/교체 가능
- Agent는 정책 범위 내 자율 운영
- 키 유출 시에도 단독으로 자산 이동 불가

## AI Agent Specific Considerations

### 에이전트-서버 비밀값 분리 설계

```
┌──────────────────┐     ┌──────────────────┐
│   AI Agent       │     │   WAIaaS Server  │
│  (TEE Enclave)   │     │   (API + KMS)    │
├──────────────────┤     ├──────────────────┤
│ agent_secret     │  +  │ server_share     │ = Valid Signature
│ (Enclave 메모리) │     │ (KMS 암호화)     │
└──────────────────┘     └──────────────────┘
        │                         │
        └─────────┬───────────────┘
                  │
                  ▼
         Combined Signing
         (Neither alone can sign)
```

**구현 방식 옵션:**

1. **2-of-2 MPC:** Agent와 Server가 각각 키 조각 보유, 협력 서명
2. **KMS + Local Encryption:** Server가 KMS로 암호화한 키를 Agent가 복호화하여 사용 (Enclave attestation 필요)
3. **Squads 2-of-2:** Owner Key (Server) + Agent Key (Enclave) 멀티시그

**권장:** 옵션 3 (Squads 2-of-2) - 온체인에서 정책 강제 가능, 복잡도 낮음

### 장애 복구 메커니즘

| 장애 유형 | 복구 방법 |
|----------|----------|
| Agent 크래시 | 새 Enclave에서 암호화된 키 복구, 동일 공개키 유지 |
| Agent 침해 | Owner Key로 Agent 권한 즉시 해제, 새 Agent Key 등록 |
| Owner Key 분실 | Time-locked guardian recovery (사전 설정된 복구 주소) |
| Server 장애 | 다중 가용 영역 배포, 읽기 전용 복구 모드 |

### 자율성 제한 복합 정책

```typescript
// 복합 정책 예시
const agentPolicy: AgentPolicy = {
  limits: {
    perTransaction: 1_000_000_000n,   // 1 SOL
    dailyTotal: 10_000_000_000n,       // 10 SOL
    weeklyTotal: 50_000_000_000n       // 50 SOL
  },
  whitelist: {
    addresses: [TREASURY, STAKING_POOL], // 허용된 수신자
    programs: [TOKEN_PROGRAM, JUPITER],  // 허용된 DeFi
    tokens: [USDC_MINT, SOL]             // 허용된 토큰
  },
  timeControls: {
    allowedHours: [9, 18],              // UTC 9-18시만
    cooldownSeconds: 60                  // 1분 간격
  },
  escalation: {
    thresholdAmount: 5_000_000_000n,   // 5 SOL 초과 시
    requireOwnerApproval: [UNSTAKE_PROGRAM] // 언스테이킹은 Owner 필요
  }
};
```

## Compliance Considerations

### SOC2 요구사항

| 요구사항 | 구현 방법 |
|----------|----------|
| 접근 통제 | IAM 역할 분리, KMS 키 정책 |
| 변경 관리 | Enclave 이미지 버전 관리, PCR 화이트리스트 |
| 위험 평가 | 정기 침투 테스트, 위협 모델링 문서화 |
| 모니터링 | CloudWatch, CloudTrail 로그, 알림 |
| 암호화 | 전송 중 TLS, 저장 시 KMS 암호화 |

### GDPR 준수

- 개인정보(이메일, 이름 등)는 PostgreSQL에만 저장
- 온체인에는 지갑 주소만 기록 (익명화)
- 삭제 요청 시 오프체인 데이터만 삭제 (온체인 불변)
- 데이터 처리 동의 기록 보관

### 암호화폐 규제 (2026)

- 한국: 가상자산이용자보호법 (거래소 대상, B2B는 현재 제외)
- 미국: GENIUS Act (스테이블코인 규제 강화 예상)
- EU: MiCA (2024 시행, 커스터디 서비스 라이선스 필요)

**권장:** 직접 구축 + 비수탁 모델로 규제 적용 범위 최소화

## Open Questions

### 1. Nitro Enclave 키 백업 전략

- **What we know:** Enclave 재시작 시 메모리 내 키 소실. KMS로 암호화된 시드 외부 저장 필요.
- **What's unclear:** 다중 리전 백업 시 attestation 일관성 유지 방법
- **Recommendation:** 단일 리전에서 시작, 추후 다중 리전 확장 시 별도 설계

### 2. Squads v4 vs 커스텀 프로그램

- **What we know:** Squads v4는 spending limits, time locks 등 기본 기능 제공
- **What's unclear:** AI 에이전트 특화 정책(화이트리스트 DeFi, 동적 한도)이 Squads로 충분한지
- **Recommendation:** Squads v4로 시작, 부족 시 커스텀 정책 프로그램 추가 개발

### 3. 비용 모델 정량화

- **What we know:** AWS KMS ~$1/10,000 요청, CloudHSM ~$1.6/시간, Nitro Enclave 추가 비용 없음 (EC2 비용만)
- **What's unclear:** 트래픽 증가 시 KMS 비용 vs CloudHSM 손익분기점
- **Recommendation:** 초기 KMS로 시작, 월 100만 서명 초과 시 CloudHSM 검토

## Sources

### Primary (HIGH confidence)
- [AWS KMS ED25519 Support Announcement (2025-11)](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-kms-edwards-curve-digital-signature-algorithm/) - ED25519 공식 지원 발표
- [AWS KMS Key Spec Reference](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html) - ECC_NIST_EDWARDS25519 스펙
- [Squads Protocol v4 GitHub](https://github.com/Squads-Protocol/v4) - Solana 멀티시그 표준
- [CGGMP21 Dfns Implementation](https://www.dfns.co/article/cggmp21-in-rust-at-last) - Kudelski 감사 완료

### Secondary (MEDIUM confidence)
- [Crossmint AI Agent Wallet Architecture](https://blog.crossmint.com/ai-agent-wallet-architecture/) - Dual Key 아키텍처 상세
- [AWS Nitro Enclaves Coinbase Case Study](https://aws.amazon.com/blogs/web3/powering-programmable-crypto-wallets-at-coinbase-with-aws-nitro-enclaves/) - 실제 구현 사례
- [Fystack MPC Wallet Best Practices](https://fystack.io/blog/mpc-wallets-the-critical-infrastructure-for-enterprise-grade-web3-security) - 엔터프라이즈 MPC 가이드
- [solana-kms-signer GitHub](https://github.com/gtg7784/solana-kms-signer) - TypeScript KMS 서명 라이브러리

### Tertiary (LOW confidence)
- [MPC Wallet Market 2026 Calibraint](https://www.calibraint.com/blog/mpc-crypto-wallet-security-2026) - 시장 동향 (검증 필요)
- [Provider Pricing Comparisons](https://hackmd.io/@KiiHolding/SktNAOPybl) - 프로바이더별 가격 비교 (변동 가능)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - AWS KMS ED25519는 공식 발표, Squads는 실사용 검증, 하지만 조합의 완전한 레퍼런스 부족
- Architecture: HIGH - Dual Key는 Crossmint/Turnkey 등 다수 프로바이더 채택, 개념 검증됨
- Pitfalls: MEDIUM - 업계 사고 분석 및 보안 연구 기반, 일부는 추정

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (AWS, Solana 생태계 빠른 변화로 30일 권장)
