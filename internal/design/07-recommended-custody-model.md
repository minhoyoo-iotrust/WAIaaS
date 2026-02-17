# WAIaaS 권장 커스터디 모델 제안서 (CUST-04)

**문서 ID:** CUST-04
**작성일:** 2026-02-04
**상태:** 완료
**참조:** CUST-01, CUST-02, CUST-03, 02-RESEARCH.md, 02-CONTEXT.md

---

## 1. Executive Summary

### 1.1 권장 모델

**하이브리드 KMS + TEE + 온체인 멀티시그**

WAIaaS의 AI 에이전트 지갑에 권장하는 커스터디 모델은 **AWS KMS (ED25519) + AWS Nitro Enclaves + Squads Protocol v4** 조합의 하이브리드 아키텍처다.

### 1.2 핵심 구성

| 구성 요소 | 기술 | 역할 |
|----------|------|------|
| **Owner Key** | AWS KMS (ED25519) | 소유자 마스터 키, 긴급 대응 |
| **Agent Key** | AWS Nitro Enclaves | 에이전트 자율 운영, 정책 기반 서명 |
| **Smart Wallet** | Squads Protocol v4 | 온체인 멀티시그, 정책 강제 |

### 1.3 선택 이유

이 조합은 **보안성, 자율성, 통제권의 균형**을 달성한다. Owner Key는 KMS의 FIPS 140-2 Level 3 인증 환경에서 안전하게 보관되어 소유자의 최종 통제권을 보장한다. Agent Key는 TEE(Trusted Execution Environment) 내에서 격리 운영되어 빠른 서명과 동시에 키 유출 위험을 최소화한다. Squads Protocol은 온체인에서 정책을 강제하여 서버 침해 시에도 정책 우회가 불가능하다. 외부 프로바이더 의존 없이 직접 구축하여 벤더 락인을 방지하고, 장기적으로 36% 이상의 비용 절감이 가능하다.

---

## 2. 권장 아키텍처 개요

### 2.1 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                    Squads Smart Wallet (온체인)                  │
│              (Solana Program - Multisig / Smart Wallet)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   멤버 1: Owner Key (AWS KMS)                                    │
│     - 권한: Permissions.all()                                    │
│     - 역할: 마스터 권한, 에이전트 관리, 긴급 대응               │
│                                                                  │
│   멤버 2: Agent Key (Nitro Enclave)                              │
│     - 권한: Permissions.execute() (제한됨)                       │
│     - 역할: 일상 운영, 정책 범위 내 자율 서명                   │
│                                                                  │
│   온체인 정책:                                                   │
│     - spending_limit: 트랜잭션/일/주 한도                        │
│     - time_lock: 고액 거래 지연 실행                             │
│     - threshold: 금액 기반 동적 조정 (소액 1-of-2, 고액 2-of-2) │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               │               ▼
┌─────────────────────────┐    │    ┌─────────────────────────┐
│      Owner Key          │    │    │      Agent Key          │
│    (AWS KMS ED25519)    │    │    │   (AWS Nitro Enclave)   │
├─────────────────────────┤    │    ├─────────────────────────┤
│                         │    │    │                         │
│  ■ 마스터 권한          │    │    │  ■ 일상 운영            │
│    - 모든 자산 통제     │    │    │    - 정책 범위 내 거래  │
│                         │    │    │                         │
│  ■ 에이전트 관리        │    │    │  ■ 자율적 서명          │
│    - Agent Key 등록     │    │    │    - 사람 개입 없이     │
│    - Agent Key 교체     │    │    │    - 밀리초 단위 응답   │
│    - Agent Key 해제     │    │    │                         │
│                         │    │    │  ■ TEE 격리             │
│  ■ 긴급 대응            │    │    │    - 호스트 접근 차단   │
│    - 에이전트 즉시 중지 │    │    │    - 메모리 암호화      │
│    - 자금 회수          │    │    │    - Attestation 검증   │
│    - 정책 변경          │    │    │                         │
│                         │    │    │  ■ 정책 강제            │
│  ■ 고액 거래 승인       │    │    │    - Enclave 내 검증    │
│    - threshold 초과 시  │    │    │    - 위반 시 서명 거부  │
│                         │    │    │                         │
└─────────────────────────┘    │    └─────────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │       WAIaaS API Server         │
              │                                 │
              │  ■ 트랜잭션 요청 검증           │
              │  ■ 정책 평가 (서버 레벨)        │
              │  ■ 서명 조율 (Owner 승인 필요 시)│
              │  ■ 감사 로그 기록               │
              │  ■ 이상 탐지 및 알림            │
              └─────────────────────────────────┘
```

### 2.2 Dual Key Architecture 설명

**Dual Key Architecture**는 AI 에이전트 지갑의 핵심 설계 패턴으로, 두 가지 역할이 다른 키를 분리하여 "자율성"과 "통제권"의 균형을 달성한다.

| 키 | 보관 위치 | 주요 역할 | 사용 빈도 |
|----|----------|----------|----------|
| **Owner Key** | AWS KMS | 마스터 권한, 에이전트 관리, 긴급 대응 | 드물게 (관리 작업) |
| **Agent Key** | Nitro Enclave | 일상 운영, 정책 범위 내 자율 서명 | 빈번하게 (일상 거래) |

**핵심 원칙:**
1. **단독 권한 제한:** 어느 한 키만으로는 전체 자산 이동 불가 (Squads threshold)
2. **즉시 중지:** Owner는 언제든 Agent 권한 해제 가능
3. **정책 강제:** 온체인(Squads) + 오프체인(Enclave + Server) 이중 검증

### 2.3 트랜잭션 흐름

#### 패턴 A: Agent 자율 트랜잭션 (소액, 정책 범위 내)

```
AI 의사결정 → API 요청 → 서버 정책 검증 → Enclave 정책 검증 → Agent Key 서명 → Squads 실행
                                                    │
                                                    └── 전 과정 밀리초 단위
```

#### 패턴 B: 에스컬레이션 트랜잭션 (고액, 정책 범위 외)

```
AI 의사결정 → API 요청 → 서버 정책 검증 → 에스컬레이션 탐지 → Owner 알림
                                                                    │
                                                                    ▼
                                          Owner 검토 → Owner Key 서명 → Squads 실행 (2-of-2)
```

#### 패턴 C: 긴급 중지

```
이상 탐지 → Owner 알림 → Owner 결정 → Owner Key로 Agent 멤버 제거 → Agent 무력화
```

---

## 3. 구성 요소별 상세 분석

### 3.1 Owner Key 관리: AWS KMS (ED25519)

#### 3.1.1 역할

| 역할 | 설명 | 사용 빈도 |
|------|------|----------|
| **마스터 권한** | 지갑의 모든 자산에 대한 최종 통제권 | 거의 없음 |
| **에이전트 관리** | Agent Key 등록, 교체, 해제 | 월 1-2회 |
| **긴급 대응** | 에이전트 즉시 중지, 자금 회수 | 비상 시 |
| **정책 변경** | 한도, 화이트리스트 등 정책 수정 | 필요 시 |
| **고액 거래 승인** | threshold 초과 거래에 대한 공동 서명 | 주 1-5회 |

#### 3.1.2 선택 근거

| 근거 | 상세 |
|------|------|
| **FIPS 140-2 Level 3 검증** | AWS KMS는 FIPS 140-2 Level 3 인증을 받은 HSM에서 키를 관리. 미국 연방 정부 수준의 보안 인증 |
| **ED25519 공식 지원** | 2025년 11월 AWS가 ECC_NIST_EDWARDS25519 키 타입 공식 지원 발표. Solana 트랜잭션 직접 서명 가능 |
| **Solana 직접 서명** | solana-kms-signer 라이브러리로 KMS 키로 Solana 트랜잭션 직접 서명. VersionedTransaction 지원 |
| **IAM 기반 접근 제어** | AWS IAM으로 세밀한 접근 권한 관리. 역할 분리, 조건부 접근, MFA 강제 가능 |
| **CloudTrail 감사 로그** | 모든 KMS 작업이 CloudTrail에 자동 기록. 불변 감사 로그로 컴플라이언스 충족 |
| **Attestation 조건** | Nitro Enclave의 attestation을 KMS 키 정책 조건으로 설정 가능. Enclave만 복호화 허용 |

#### 3.1.3 구현 방식

```typescript
// AWS KMS ED25519 키 생성 및 Solana 서명
import { SolanaKmsSigner } from 'solana-kms-signer';
import { KMSClient, CreateKeyCommand } from '@aws-sdk/client-kms';

// 1. KMS 키 생성 (최초 1회)
const kms = new KMSClient({ region: 'ap-northeast-2' });
const createKeyResponse = await kms.send(new CreateKeyCommand({
  KeySpec: 'ECC_NIST_EDWARDS25519',
  KeyUsage: 'SIGN_VERIFY',
  Description: 'WAIaaS Owner Key for AI Agent Wallet',
  Tags: [
    { TagKey: 'Purpose', TagValue: 'WAIaaS-OwnerKey' },
    { TagKey: 'Environment', TagValue: 'production' }
  ]
}));
const ownerKeyId = createKeyResponse.KeyMetadata?.KeyId;

// 2. Solana 서명자 초기화
const ownerSigner = new SolanaKmsSigner({
  region: 'ap-northeast-2',
  keyId: ownerKeyId
});

// 3. 공개키 조회 (Squads 등록용)
const ownerPublicKey = await ownerSigner.getPublicKey();
console.log('Owner PublicKey:', ownerPublicKey.toBase58());

// 4. 트랜잭션 서명
const signedTx = await ownerSigner.signTransaction(transaction);
```

#### 3.1.4 KMS 키 정책 예시

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOwnerOperations",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/WAIaaS-OwnerRole"
      },
      "Action": [
        "kms:Sign",
        "kms:GetPublicKey",
        "kms:DescribeKey"
      ],
      "Resource": "*",
      "Condition": {
        "Bool": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    },
    {
      "Sid": "AllowEnclaveDecrypt",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/WAIaaS-EnclaveRole"
      },
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "*",
      "Condition": {
        "StringEqualsIgnoreCase": {
          "kms:RecipientAttestation:PCR0": "<enclave-pcr0-hash>"
        }
      }
    }
  ]
}
```

#### 3.1.5 비용

| 항목 | 비용 |
|------|------|
| 키 저장 | $1/월/키 |
| 서명 요청 | $0.03 ~ $0.0001/요청 (볼륨 따라) |
| **예상 월간 비용** | **$10 ~ $50** (서명 빈도에 따라) |

---

### 3.2 Agent Key 런타임: AWS Nitro Enclaves

#### 3.2.1 역할

| 역할 | 설명 |
|------|------|
| **자율 운영** | 정책 범위 내 트랜잭션 자동 서명, 24/7 무중단 |
| **정책 강제** | Enclave 내부에서 정책 검증 후 서명 (검증 실패 시 서명 거부) |
| **키 보호** | TEE 격리로 호스트 OS, 관리자로부터 키 유출 방지 |
| **빠른 응답** | 로컬 서명으로 밀리초 단위 응답 (MPC 대비 100배 이상 빠름) |

#### 3.2.2 선택 근거

| 근거 | 상세 |
|------|------|
| **하드웨어 수준 메모리 격리** | Nitro Hypervisor가 Enclave 메모리를 호스트로부터 완전 격리. root 권한으로도 접근 불가 |
| **호스트 OS에서 접근 차단** | 네트워크 직접 접근 불가, vsock 통신만 허용. 디버거 연결 불가 |
| **Attestation 기반 검증** | PCR(Platform Configuration Register) 값으로 Enclave 이미지 무결성 검증. 변조된 이미지 실행 차단 |
| **실사용 검증** | Coinbase (수십억 달러 자산 보호), Fireblocks, Turnkey 등 기관급 서비스에서 검증 |
| **EC2 비용만** | Enclave 자체는 추가 비용 없음. 호스팅하는 EC2 인스턴스 비용만 발생 |

#### 3.2.3 구현 방식

```typescript
// Enclave 내부 코드 (agent-enclave.ts)
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';

// Agent Key는 Enclave 메모리에만 존재
let agentKeypair: Keypair | null = null;

// Enclave 초기화 시 키 생성 또는 복구
async function initializeAgentKey(encryptedSeed?: Buffer): Promise<PublicKey> {
  if (encryptedSeed) {
    // KMS로 암호화된 시드 복호화 (attestation 필요)
    const seed = await decryptWithKmsAttestation(encryptedSeed);
    agentKeypair = Keypair.fromSeed(seed);
  } else {
    // 새 키 생성
    agentKeypair = Keypair.generate();
    // 시드를 KMS로 암호화하여 외부 백업
    await encryptAndStoreSeed(agentKeypair.secretKey.slice(0, 32));
  }
  return agentKeypair.publicKey;
}

// 정책 검증 후 서명 (Enclave 내부에서만 실행)
async function signIfPolicyAllows(
  transaction: Transaction,
  policy: AgentPolicy,
  dailySpent: bigint
): Promise<Buffer | null> {
  if (!agentKeypair) throw new Error('Agent key not initialized');

  // 정책 검증 (Enclave 내부)
  const validation = validatePolicy(transaction, policy, dailySpent);
  if (!validation.valid) {
    console.log(`Policy violation: ${validation.reason}`);
    return null; // 정책 위반 시 서명 거부
  }

  // 서명 (정책 통과 시에만)
  transaction.sign(agentKeypair);
  return transaction.serialize();
}

// 정책 검증 함수
function validatePolicy(
  transaction: Transaction,
  policy: AgentPolicy,
  dailySpent: bigint
): { valid: boolean; reason?: string } {
  const txAmount = extractTransferAmount(transaction);

  // 1. 단일 트랜잭션 한도
  if (txAmount > policy.limits.perTransaction) {
    return { valid: false, reason: 'Exceeds per-transaction limit' };
  }

  // 2. 일일 총 한도
  if (dailySpent + txAmount > policy.limits.dailyTotal) {
    return { valid: false, reason: 'Exceeds daily limit' };
  }

  // 3. 화이트리스트 검증
  const recipients = extractRecipients(transaction);
  for (const recipient of recipients) {
    if (!policy.whitelist.addresses.some(w => w.equals(recipient))) {
      return { valid: false, reason: `Recipient not whitelisted: ${recipient}` };
    }
  }

  // 4. 프로그램 화이트리스트
  const programs = extractProgramIds(transaction);
  for (const program of programs) {
    if (!policy.whitelist.programs.some(p => p.equals(program))) {
      return { valid: false, reason: `Program not whitelisted: ${program}` };
    }
  }

  // 5. 시간 제어
  const currentHour = new Date().getUTCHours();
  const { start, end } = policy.timeControls.allowedHours;
  if (currentHour < start || currentHour > end) {
    return { valid: false, reason: 'Outside allowed hours' };
  }

  return { valid: true };
}
```

#### 3.2.4 Nitro Enclave 보안 특성

```
┌─────────────────────────────────────────────────────────────────┐
│                    Nitro Enclave 보안 모델                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 격리 (Isolation)                                            │
│     ■ 호스트 OS에서 Enclave 메모리 접근 불가                    │
│     ■ root 권한으로도 접근 불가                                 │
│     ■ 디버거 연결 불가                                          │
│     ■ SSH, shell 접근 불가                                      │
│                                                                  │
│  2. 암호화 (Encryption)                                         │
│     ■ Enclave 메모리 전체 암호화                                │
│     ■ Enclave 종료 시 메모리 자동 소거                          │
│     ■ 영구 저장소 없음 (stateless)                              │
│                                                                  │
│  3. 인증 (Attestation)                                          │
│     ■ PCR (Platform Configuration Register) 검증               │
│     ■ Enclave 이미지 해시 검증                                  │
│     ■ KMS 키 정책에 attestation 조건 추가 가능                  │
│     ■ 변조된 이미지는 KMS 접근 불가                             │
│                                                                  │
│  4. 통신 (Communication)                                        │
│     ■ vsock만 허용 (가상 소켓)                                  │
│     ■ 네트워크 직접 접근 불가                                   │
│     ■ 호스트를 통한 프록시 필수                                 │
│     ■ 통신 내용 암호화 권장                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.2.5 비용

| 항목 | 비용 |
|------|------|
| EC2 인스턴스 (c5.xlarge 기준) | ~$124/월 |
| Nitro Enclave 자체 | **$0** (추가 비용 없음) |
| **예상 월간 비용** | **$200 ~ $500** (인스턴스 크기에 따라) |

---

### 3.3 온체인 권한 제어: Squads Protocol v4

#### 3.3.1 역할

| 역할 | 설명 |
|------|------|
| **멀티시그** | Owner + Agent 키의 협력 서명 (threshold 기반) |
| **스마트 월렛** | 온체인 정책 강제, 프로그램 레벨 권한 제어 |
| **정책 강제** | spending limits, time locks 온체인 강제 (서버 우회 불가) |
| **투명성** | 모든 정책과 트랜잭션이 온체인에 기록 |

#### 3.3.2 선택 근거

| 근거 | 상세 |
|------|------|
| **$10B+ 자산 보호 실적** | Squads Protocol은 Solana 생태계에서 100억 달러 이상의 자산을 보호한 실적 보유 |
| **Formal Verification 완료** | 스마트 컨트랙트의 수학적 검증 완료, 버그 가능성 최소화 |
| **OtterSec, Trail of Bits 감사** | 업계 최고 수준의 보안 감사 기관에서 감사 완료 |
| **Spending Limits 기본 제공** | 트랜잭션당, 일/주/월 한도 설정 가능 |
| **Time Locks 기본 제공** | 고액 거래에 대한 지연 실행 가능 |
| **멤버 권한 차등** | 멤버별로 다른 권한 부여 가능 (Owner: all, Agent: execute only) |

#### 3.3.3 구현 방식

```typescript
// Squads Protocol v4 SDK를 활용한 스마트 월렛 생성
import * as multisig from '@sqds/sdk';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

// 1. Squads 스마트 월렛 생성
async function createAgentWallet(
  connection: Connection,
  ownerPubkey: PublicKey,
  agentPubkey: PublicKey
): Promise<PublicKey> {
  // 2-of-2 또는 1-of-2 멀티시그 구성
  const multisigPda = await multisig.Multisig.create({
    connection,
    creator: ownerPubkey,
    members: [
      {
        key: ownerPubkey,
        permissions: multisig.Permissions.all() // 모든 권한
      },
      {
        key: agentPubkey,
        permissions: multisig.Permissions.execute() // 실행 권한만
      }
    ],
    threshold: 1, // 기본: Agent 단독 실행 가능 (소액)
    timeLock: 0,  // 기본: 지연 없음
    configAuthority: ownerPubkey // 설정 변경은 Owner만
  });

  return multisigPda;
}

// 2. 트랜잭션 제안 및 실행 (Agent)
async function proposeAndExecute(
  connection: Connection,
  multisigPda: PublicKey,
  instruction: TransactionInstruction,
  agentSigner: Keypair
): Promise<string> {
  // 트랜잭션 제안
  const proposalPda = await multisig.Proposal.create({
    connection,
    multisig: multisigPda,
    creator: agentSigner.publicKey,
    instructions: [instruction]
  });

  // Agent 승인
  await multisig.Proposal.approve({
    connection,
    proposal: proposalPda,
    member: agentSigner
  });

  // 실행 (threshold 충족 시)
  const signature = await multisig.Proposal.execute({
    connection,
    proposal: proposalPda
  });

  return signature;
}

// 3. 긴급 중지: Agent 권한 해제 (Owner)
async function revokeAgentAccess(
  connection: Connection,
  multisigPda: PublicKey,
  agentPubkey: PublicKey,
  ownerSigner: SolanaKmsSigner
): Promise<string> {
  // Agent 멤버 제거
  const removeMemberIx = await multisig.Multisig.removeMember({
    multisig: multisigPda,
    memberToRemove: agentPubkey,
    configAuthority: ownerSigner.publicKey
  });

  const transaction = new Transaction().add(removeMemberIx);
  const signedTx = await ownerSigner.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  return signature;
}
```

#### 3.3.4 Squads 정책 구성

```typescript
// Squads 스마트 월렛 정책 구성 예시
interface SquadsWalletConfig {
  // 기본 설정
  multisig: {
    threshold: number;           // 기본 threshold (1 = Agent 단독)
    timeLock: number;            // 기본 time lock (초)
    rentCollector: PublicKey;    // rent 회수 주소
  };

  // 동적 threshold (금액 기반)
  dynamicThreshold: {
    // 소액: Agent 단독 (1-of-2)
    small: {
      maxAmount: bigint;         // 예: 1 SOL
      threshold: 1;
    };
    // 중액: Agent 제안, Owner 자동 승인 (time-locked)
    medium: {
      maxAmount: bigint;         // 예: 10 SOL
      threshold: 1;
      timeLockSeconds: 3600;     // 1시간 대기
    };
    // 고액: Owner + Agent 필수 (2-of-2)
    large: {
      threshold: 2;
      timeLockSeconds: 86400;    // 24시간 대기
    };
  };

  // 화이트리스트 (온체인 강제)
  whitelist: {
    allowedPrograms: PublicKey[];   // 허용된 프로그램 ID
    allowedTokenMints: PublicKey[]; // 허용된 토큰 민트
  };
}
```

#### 3.3.5 비용

| 항목 | 비용 |
|------|------|
| 월렛 생성 | ~0.01 SOL (rent exempt) |
| 트랜잭션 | 기본 Solana 수수료 (~0.000005 SOL) |
| 멀티시그 오버헤드 | 약간의 추가 compute unit |
| **예상 월간 비용** | **트랜잭션 수수료만** (~$5-20) |

---

## 4. 선택 근거 종합

### 4.1 CUST-01 ~ CUST-03 분석 결과 기반 결정

본 권장 모델은 Phase 2에서 수행한 다음 분석 결과를 종합하여 도출되었다:

- **CUST-01 (커스터디 모델 비교 분석):** Custodial, Non-Custodial, MPC-TSS 모델 비교
- **CUST-02 (AI 에이전트 특화 고려사항):** Dual Key, 정책 설계, 장애 복구
- **CUST-03 (프로바이더 비교):** Turnkey, Dfns, Crossmint 등 벤치마킹

### 4.2 배제된 옵션과 이유

#### 4.2.1 Custodial 모델 배제

| 배제 이유 | 상세 |
|----------|------|
| **수탁 규제 복잡** | 한국: 가상자산이용자보호법, EU: MiCA 라이선스 필요. 규제 준수 비용과 시간 증가 |
| **외부 의존** | 수탁자(제3자)에 대한 전적인 의존. 수탁자 파산/서비스 중단 시 접근 불가 |
| **자율성 제한** | AI 에이전트의 자율적 트랜잭션 실행이 수탁자 정책에 의해 제한될 수 있음 |
| **단일 장애점** | 수탁자 해킹 시 대규모 자산 손실 위험 |

**결론:** AI 에이전트의 자율성과 상충, 규제 복잡성으로 부적합.

#### 4.2.2 Pure Non-Custodial 모델 배제

| 배제 이유 | 상세 |
|----------|------|
| **에이전트 키 노출 위험** | AI 에이전트가 키를 직접 보유하면, 에이전트 침해 시 전체 자산 손실 |
| **소유자 통제 어려움** | 에이전트를 즉시 중지하거나 자금을 회수하기 어려움 |
| **정책 강제 불가** | 온체인 정책 없이 에이전트가 모든 거래를 자유롭게 실행 가능 |
| **단일 장애점** | 키 저장 위치가 단일 장애점이 됨 |

**결론:** 에이전트 침해 시 전체 자산 위험으로 부적합.

#### 4.2.3 Pure MPC 모델 배제

| 배제 이유 | 상세 |
|----------|------|
| **서명 지연** | CGGMP21도 4라운드 통신 필요, 2-5초 지연. 실시간 DeFi 거래에 부적합 |
| **운영 복잡도** | 다중 MPC 노드 운영, 키 갱신, 장애 복구 등 운영 부담 높음 |
| **구현 난이도** | MPC 프로토콜 자체 구현은 BitForge 등 취약점 위험. 검증된 라이브러리 필요 |
| **네트워크 의존성** | 서명 시 모든 파티 간 통신 필요, 네트워크 장애 시 서명 불가 |

**결론:** 서명 지연과 운영 복잡도로 AI 에이전트 실시간 운영에 부적합.

#### 4.2.4 외부 WaaS 프로바이더 배제

| 배제 이유 | 상세 |
|----------|------|
| **벤더 락인** | 프로바이더 서비스 중단, 가격 인상, 기능 제한 시 대응 어려움 |
| **데이터 주권** | 키 관리 데이터가 제3자 인프라에 존재. 규제 변경 시 데이터 이전 강제 가능 |
| **커스터마이징 제한** | WAIaaS 특화 기능(AI 에이전트 정책 등) 구현에 제약 |
| **장기 비용** | 트래픽 증가에 따른 비용 급증. 5년 기준 직접 구축 대비 36% 이상 비용 증가 |

**결론:** 기술 차별화와 장기 비용 효율성을 위해 직접 구축 선택.

### 4.3 하이브리드 모델 선택 이유

| 선택 이유 | 상세 |
|----------|------|
| **Owner Key는 KMS** | 고보안 + 낮은 빈도 = KMS 최적. FIPS 검증, 감사 로그, IAM 제어 |
| **Agent Key는 TEE** | 빠른 서명 + 격리 = TEE 최적. 밀리초 응답, 하드웨어 격리 |
| **온체인 정책으로 이중 보호** | 서버 침해 시에도 Squads가 정책 강제. 정책 우회 불가 |
| **유연한 threshold** | 소액은 Agent 단독, 고액은 Owner 승인. UX와 보안 균형 |
| **즉시 복구** | Owner가 언제든 Agent 권한 해제 가능. 침해 시 빠른 대응 |

---

## 5. AI 에이전트 요구사항 충족 매핑

### 5.1 CUST-02 요구사항별 대응

CUST-02 (AI 에이전트 특화 커스터디 고려사항)에서 정의한 요구사항에 대해 권장 모델이 어떻게 대응하는지 매핑한다.

| 요구사항 | 권장 모델의 대응 | 구현 위치 |
|----------|----------------|----------|
| **자율적 트랜잭션** | Agent Key (TEE)가 정책 범위 내에서 사람 개입 없이 자율 서명 | Nitro Enclave |
| **소유자 통제권** | Owner Key (KMS)로 언제든 에이전트 중지, 자금 회수 가능 | AWS KMS + Squads |
| **에이전트-서버 분리** | Agent Key (Enclave) + Owner Key (KMS) 물리적 분리 | 아키텍처 전체 |
| **장애 복구** | KMS 암호화 시드 백업, Squads guardian 복구, Multi-AZ | AWS + Squads |
| **자율성 제한** | Squads 온체인 정책 + Enclave 서버 정책 이중 검증 | Squads + Enclave |

### 5.2 상세 대응 분석

#### 5.2.1 자율적 트랜잭션 실행

```
요구사항: AI 에이전트가 사람 승인 없이 트랜잭션을 실행할 수 있어야 한다.

대응:
1. Agent Key가 Nitro Enclave 내에서 상시 가용
2. 정책 범위 내 트랜잭션은 Agent 단독 서명 (1-of-2 threshold)
3. 밀리초 단위 응답으로 실시간 DeFi 거래 가능
4. 24/7 무중단 운영 지원

검증 시점: Enclave 내부 (서명 전)
정책 적용: 금액 한도, 화이트리스트, 시간 제어
```

#### 5.2.2 소유자 통제권 유지

```
요구사항: 에이전트 주인(사람)이 언제든 에이전트를 중지하고 자금을 회수할 수 있어야 한다.

대응:
1. Owner Key로 Squads 멤버에서 Agent 제거 → 즉시 권한 해제
2. Owner Key로 모든 자금을 안전 주소로 이동 가능
3. Owner만 정책 변경 가능 (configAuthority)
4. 실시간 알림으로 이상 행동 인지

긴급 대응 시간: 수 분 이내
권한 범위: Owner는 모든 권한 (Permissions.all())
```

#### 5.2.3 에이전트-서버 비밀값 분리

```
요구사항: 에이전트와 서버의 비밀값이 분리되어 어느 한쪽만으로 유효한 서명이 불가능해야 한다.

대응:
1. Owner Key: AWS KMS에 보관 (서버 인프라)
2. Agent Key: Nitro Enclave에 보관 (격리 환경)
3. Squads 2-of-2: 고액 거래는 양쪽 키 모두 필요
4. 단독 침해 시 최대 손실: 정책 한도 내 (소액만)

분리 구조:
- 에이전트 침해 → Agent Key만 탈취 → 정책 한도 내 손실
- 서버 침해 → Owner Key 탈취 시도 → MFA + IAM으로 방어
- 양쪽 동시 침해 → 확률적으로 극히 낮음
```

#### 5.2.4 장애 복구

```
요구사항: 에이전트 장애 시 소유자가 즉각 복구하고 키를 교체할 수 있어야 한다.

대응:
1. Agent 크래시: 암호화된 시드 복구 → 동일 공개키 유지 → Squads 재등록 불필요
2. Agent 침해: Owner Key로 Agent 권한 해제 → 새 Agent Key 등록
3. Owner Key 분실: Time-locked guardian recovery (사전 설정 필수)
4. Server 장애: Multi-AZ 자동 전환

복구 시간:
- Agent 크래시: 수 분 (자동 재시작)
- Agent 침해: 수 분 (Owner 수동 대응)
- Owner Key 분실: 수 일 ~ 수 주 (time lock)
```

#### 5.2.5 자율성 제한 (정책 강제)

```
요구사항: AI 에이전트의 자율성이 사전 정의된 정책 범위 내로 제한되어야 한다.

대응:
1. 서버 정책: API 레벨에서 트랜잭션 요청 검증
2. Enclave 정책: TEE 내부에서 서명 전 최종 검증
3. 온체인 정책: Squads spending limits, time locks 강제

이중 검증 흐름:
요청 → 서버 정책 검증 → Enclave 정책 검증 → Squads 온체인 정책 → 실행

정책 구성 요소:
- 금액 한도: perTransaction, dailyTotal, weeklyTotal
- 화이트리스트: addresses, programs, tokens
- 시간 제어: allowedHours, cooldownSeconds
- 에스컬레이션: thresholdAmount, requireOwnerApproval
```

---

## 6. 구현 로드맵

### 6.1 Phase 3 (시스템 아키텍처) 연결

Phase 3에서 구현할 순서와 상세 계획:

| 순서 | 구현 항목 | 상세 | 예상 기간 |
|------|----------|------|----------|
| **1** | AWS KMS ED25519 키 생성 | IAM 역할 설정, 키 정책 구성, solana-kms-signer 통합 | 1-2일 |
| **2** | Nitro Enclave 기반 Agent Key 서비스 | Enclave 이미지 빌드, 키 생성/복구 로직, 정책 검증 | 1주 |
| **3** | Squads Smart Wallet 생성 | 멀티시그 생성 API, 멤버 관리, threshold 설정 | 3-5일 |
| **4** | 정책 엔진 구현 | 서버 정책 + Enclave 정책 + 온체인 정책 통합 | 1주 |
| **5** | 장애 복구 메커니즘 | 시드 암호화 백업, guardian 설정, Multi-AZ 배포 | 3-5일 |

### 6.2 구현 의존성 다이어그램

```
Phase 3 구현 순서:

[1. AWS KMS 설정] ────────────────────────────┐
        │                                      │
        ▼                                      │
[2. Nitro Enclave 구축] ─────────────────────┐│
        │                                    ││
        └────────────────────────────────────┼┼──┐
                                             ││  │
[3. Squads 통합] ◄───────────────────────────┘│  │
        │                                      │  │
        ▼                                      │  │
[4. 정책 엔진] ◄───────────────────────────────┘  │
        │                                         │
        ▼                                         │
[5. 장애 복구] ◄──────────────────────────────────┘
```

### 6.3 MVP 범위

Phase 3 MVP에서 구현할 최소 기능:

| 구분 | MVP 포함 | 추후 구현 |
|------|---------|----------|
| **Owner Key** | KMS 키 생성, 기본 서명 | 하드웨어 지갑 연동 |
| **Agent Key** | Enclave 키 생성, 기본 정책 | 정기 키 로테이션 |
| **Squads** | 2-of-2 멀티시그, 기본 threshold | 동적 threshold, time lock |
| **정책** | 금액 한도, 화이트리스트 | 시간 제어, 복합 정책 |
| **복구** | 시드 암호화 백업 | Guardian, Social recovery |

---

## 7. 위험 요소 및 완화 방안

### 7.1 위험 매트릭스

| 위험 | 발생 가능성 | 영향도 | 위험 수준 | 완화 방안 |
|------|------------|--------|----------|----------|
| **KMS 키 접근 상실** | 낮음 | 치명적 | 높음 | IAM 역할 분리, 백업 계정, Guardian 복구 |
| **Enclave 이미지 변조** | 낮음 | 높음 | 중간 | PCR 화이트리스트, attestation 검증, CI/CD 해시 검증 |
| **Squads 프로그램 취약점** | 매우 낮음 | 높음 | 낮음 | 최신 버전 사용, 감사 보고서 확인, 모니터링 |
| **네트워크 분리 공격** | 중간 | 중간 | 중간 | 다중 RPC, 상태 모니터링, 오프라인 감지 시 정지 |
| **에이전트 로직 오류** | 높음 | 중간 | 높음 | 정책 한도, 시뮬레이션, Circuit Breaker |
| **내부자 공격** | 낮음 | 높음 | 중간 | IAM 최소 권한, MFA 필수, 불변 감사 로그 |

### 7.2 상세 완화 전략

#### 7.2.1 KMS 키 접근 상실

```
위험: Owner가 KMS 키에 접근할 수 없게 되면 자금 영구 손실

완화 방안:
1. IAM 역할 분리
   - 별도의 관리자 역할과 서비스 역할 분리
   - 관리자 역할에 MFA 필수

2. 백업 계정
   - 별도 AWS 계정에 백업 IAM 사용자 생성
   - 비상시에만 사용 (봉인된 자격 증명)

3. Guardian 복구
   - Squads에 guardian 주소 사전 등록
   - Time-locked recovery (예: 7일)
   - 복구 기간 동안 원래 Owner가 취소 가능

4. 정기 접근 테스트
   - 분기별 KMS 접근 및 서명 테스트
   - 접근 실패 시 즉시 조치
```

#### 7.2.2 Enclave 이미지 변조

```
위험: 악성 코드가 삽입된 Enclave 이미지가 배포되면 Agent Key 유출

완화 방안:
1. PCR 화이트리스트
   - 승인된 PCR0 해시만 KMS 키 정책에 등록
   - 변조된 이미지는 KMS 복호화 불가

2. CI/CD 해시 검증
   - 빌드 파이프라인에서 이미지 해시 계산
   - 배포 전 해시 검증 필수

3. 서명된 이미지
   - Enclave 이미지에 디지털 서명
   - 서명 검증 실패 시 실행 거부

4. 이미지 버전 관리
   - 모든 이미지 버전 기록
   - 롤백 가능하도록 이전 버전 보관
```

#### 7.2.3 Squads 프로그램 취약점

```
위험: Squads 스마트 컨트랙트에 취약점이 발견되면 자금 탈취 가능

완화 방안:
1. 최신 버전 사용
   - Squads v4 릴리스 모니터링
   - 보안 패치 즉시 적용

2. 감사 보고서 확인
   - OtterSec, Trail of Bits 감사 결과 검토
   - 새 버전 사용 전 감사 완료 여부 확인

3. 온체인 모니터링
   - Squads 프로그램 업그레이드 감지
   - 예상치 못한 변경 시 알림

4. 탈출 경로
   - 심각한 취약점 발견 시 즉시 자금 이동 계획
   - 대체 멀티시그 프로그램 사전 조사
```

#### 7.2.4 네트워크 분리 공격

```
위험: Agent와 Server 간 네트워크가 분리되면 정책 검증 없이 서명 가능성

완화 방안:
1. 다중 RPC 프로바이더
   - Helius, QuickNode, Alchemy 등 다중 RPC
   - 하나 실패 시 자동 전환

2. 상태 모니터링
   - 서버-Agent 간 heartbeat
   - 연결 끊김 시 Agent 자율 동작 정지

3. 오프라인 감지 시 정지
   - 서버 연결 없이 Agent 단독 서명 금지
   - 재연결 후 상태 동기화 후 재개

4. 사전 서명 제한
   - 오프라인 사전 서명 기능 비활성화
   - 모든 서명은 실시간 정책 검증 필수
```

#### 7.2.5 에이전트 로직 오류

```
위험: AI 에이전트의 잘못된 의사결정으로 손실 발생

완화 방안:
1. 정책 한도
   - perTransaction, dailyTotal 한도로 최대 손실 제한
   - 버그로 인한 반복 오류도 일일 한도로 제한

2. 트랜잭션 시뮬레이션
   - 실행 전 Solana 시뮬레이션 API로 결과 예측
   - 예상 손실 시 실행 거부

3. Circuit Breaker
   - 연속 실패 (예: 3회) 시 자동 정지
   - Owner 재활성화 필요

4. Staging 환경
   - Devnet/Testnet에서 충분한 테스트
   - Mainnet 배포 전 시나리오 검증
```

#### 7.2.6 내부자 공격

```
위험: 운영자가 KMS 키를 무단 사용하거나 Enclave 코드를 변조

완화 방안:
1. IAM 최소 권한 원칙
   - 각 역할에 필요한 권한만 부여
   - 단일 역할로 전체 시스템 접근 불가

2. MFA 필수
   - KMS 키 사용 시 MFA 필수
   - IAM 콘솔 접근 시 MFA 필수

3. 불변 감사 로그
   - CloudTrail 로그를 S3 WORM(Write Once Read Many) 저장
   - 로그 조작 불가능

4. 다중 승인
   - 고위험 작업 (키 삭제, 정책 변경 등) 2인 이상 승인
   - PR 리뷰 필수 (Enclave 코드 변경 시)
```

---

## 8. 비용 분석

### 8.1 구성 요소별 월간 예상 비용

| 구성 요소 | 항목 | 월간 비용 | 비고 |
|----------|------|----------|------|
| **AWS KMS** | 키 저장 | $1 | 1개 키 |
| | 서명 요청 (10만 건) | $10 ~ $30 | 볼륨 할인 적용 |
| | **소계** | **$10 ~ $50** | |
| **EC2 + Nitro** | c5.xlarge (Enclave 호스트) | $124 | On-Demand |
| | 예약 인스턴스 (1년) | ~$80 | 35% 할인 |
| | 다중 AZ (x2) | ~$160 ~ $250 | 고가용성 |
| | **소계** | **$160 ~ $250** | |
| **Squads** | 월렛 rent | ~$0.02 | 1회성 |
| | 트랜잭션 수수료 (10만 건) | ~$5 | 0.000005 SOL x 100K |
| | **소계** | **~$5** | |
| **기타** | CloudWatch 모니터링 | ~$20 | |
| | CloudTrail 로그 | ~$5 | |
| | S3 (시드 백업) | ~$1 | |
| | **소계** | **~$30** | |

### 8.2 총 월간 비용

| 시나리오 | 월간 비용 | 연간 비용 |
|----------|----------|----------|
| **최소 (단일 AZ)** | ~$250 | ~$3,000 |
| **권장 (Multi-AZ)** | ~$400 | ~$4,800 |
| **고가용성 (확장)** | ~$600 | ~$7,200 |

### 8.3 외부 프로바이더 대비 비용 비교

| 비교 항목 | 직접 구축 | 외부 프로바이더 (Turnkey 기준) |
|----------|----------|------------------------------|
| **초기 비용** | 개발 인력 3개월 (~$30,000) | 없음 |
| **월간 비용** | ~$400 | ~$600 ~ $1,500 |
| **연간 비용** | ~$4,800 | ~$7,200 ~ $18,000 |
| **5년 총비용** | **~$57,600** (개발 포함) | **~$90,000** |
| **비용 절감** | **36%** | 기준 |

### 8.4 비용 최적화 전략

| 전략 | 절감 효과 | 적용 시점 |
|------|----------|----------|
| **EC2 예약 인스턴스** | 35% | 프로덕션 안정화 후 |
| **Savings Plan** | 최대 66% | 1년 이상 운영 시 |
| **스팟 인스턴스 (개발)** | 90% | 개발/테스트 환경 |
| **KMS 볼륨 할인** | 자동 적용 | 요청 증가 시 |

---

## 9. 대안 검토

### 9.1 대안 A: CloudHSM (HSM 전용)

**구성:** AWS CloudHSM으로 모든 키 관리

| 항목 | 상세 |
|------|------|
| **장점** | FIPS 140-2 Level 3, 전용 HSM 하드웨어 |
| **단점** | 비용 ~$1.6/시간 (~$1,168/월), ED25519 미지원 (2026년 기준) |
| **결론** | **불채택** - Solana ED25519 미지원, 비용 대비 효용 낮음 |

### 9.2 대안 B: 자체 MPC 구현

**구성:** CGGMP21 라이브러리로 자체 MPC 노드 구축

| 항목 | 상세 |
|------|------|
| **장점** | 완전한 통제, 단일 장애점 제거 |
| **단점** | 구현 복잡도 높음, 4라운드 서명 지연 (2-5초), 다중 노드 운영 부담 |
| **결론** | **불채택** - 서명 지연이 실시간 AI 에이전트 운영에 부적합 |

### 9.3 대안 C: 외부 WaaS 프로바이더 (Turnkey, Crossmint 등)

**구성:** Turnkey 또는 Crossmint 서비스 사용

| 항목 | 상세 |
|------|------|
| **장점** | 빠른 구현, 운영 부담 최소화, 검증된 보안 |
| **단점** | 벤더 락인, 장기 비용 증가, 커스터마이징 제한 |
| **결론** | **불채택** - 기술 차별화와 장기 비용 효율성을 위해 직접 구축 선택 |

### 9.4 대안 비교 매트릭스

| 기준 | 권장 (KMS+TEE+Squads) | CloudHSM | 자체 MPC | 외부 프로바이더 |
|------|----------------------|----------|----------|----------------|
| **보안성** | ★★★★★ | ★★★★★ | ★★★★☆ | ★★★★★ |
| **비용 효율** | ★★★★★ | ★★☆☆☆ | ★★★☆☆ | ★★★☆☆ |
| **구현 복잡도** | ★★★☆☆ | ★★★★☆ | ★☆☆☆☆ | ★★★★★ |
| **성능 (지연)** | ★★★★★ | - | ★★☆☆☆ | ★★★★☆ |
| **커스터마이징** | ★★★★★ | ★★★☆☆ | ★★★★★ | ★★☆☆☆ |
| **벤더 독립성** | ★★★★★ | ★★★★★ | ★★★★★ | ★★☆☆☆ |

---

## 10. 결론

### 10.1 권장 모델 최종 요약

WAIaaS AI 에이전트 지갑에 권장하는 커스터디 모델은 **AWS KMS (ED25519) + AWS Nitro Enclaves + Squads Protocol v4** 조합의 하이브리드 아키텍처다.

```
┌─────────────────────────────────────────────────────────────────┐
│                    WAIaaS 권장 아키텍처 요약                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Owner Layer:                                                    │
│  └─ AWS KMS (ED25519) ← FIPS 140-2 Level 3 검증                 │
│     • 마스터 권한, 에이전트 관리, 긴급 대응                     │
│     • IAM + MFA + CloudTrail 감사                               │
│                                                                  │
│  Agent Layer:                                                    │
│  └─ AWS Nitro Enclaves ← 하드웨어 수준 격리                     │
│     • 자율 운영, 정책 범위 내 서명                              │
│     • Attestation 기반 무결성 검증                              │
│                                                                  │
│  Smart Wallet:                                                   │
│  └─ Squads Protocol v4 ← $10B+ 실사용 검증                      │
│     • 온체인 정책 강제, 서버 우회 불가                          │
│     • 동적 threshold (소액 1-of-2, 고액 2-of-2)                 │
│                                                                  │
│  정책 엔진:                                                      │
│  └─ 금액 한도 + 화이트리스트 + 시간 제어 + 에스컬레이션        │
│     • 서버 + Enclave + 온체인 3중 검증                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 핵심 가치

| 가치 | 달성 방법 |
|------|----------|
| **보안** | KMS FIPS 인증 + TEE 격리 + 온체인 정책 다층 보안 |
| **자율성** | Agent Key로 정책 범위 내 자율 트랜잭션 실행 |
| **통제권** | Owner Key로 언제든 에이전트 중지 및 자금 회수 |
| **비용 효율** | 직접 구축으로 5년 기준 36% 비용 절감 |
| **유연성** | 정책 커스터마이징, 체인 확장 자유로움 |

### 10.3 Phase 3 연결

이 권장 모델을 기반으로 Phase 3 (시스템 아키텍처)에서 다음을 구현한다:

| Phase 3 작업 | 이 문서 참조 섹션 |
|-------------|------------------|
| AWS KMS 키 생성 | 3.1 Owner Key 관리 |
| Nitro Enclave 구축 | 3.2 Agent Key 런타임 |
| Squads 통합 | 3.3 온체인 권한 제어 |
| 정책 엔진 | 5.2.5 자율성 제한 |
| 장애 복구 | 7.2 상세 완화 전략 |

---

## 11. 참조 문서

### 11.1 내부 문서

| 문서 | 내용 | 위치 |
|------|------|------|
| **CUST-01** | 커스터디 모델 비교 분석 | .planning/deliverables/04-custody-model-comparison.md |
| **CUST-02** | AI 에이전트 특화 커스터디 고려사항 | .planning/deliverables/06-ai-agent-custody-considerations.md |
| **CUST-03** | 외부 WaaS 프로바이더 비교표 | .planning/deliverables/05-provider-comparison.md |
| **02-RESEARCH** | 커스터디 모델 리서치 | .planning/phases/02-custody-model/02-RESEARCH.md |
| **02-CONTEXT** | Phase 2 컨텍스트 | .planning/phases/02-custody-model/02-CONTEXT.md |

### 11.2 외부 참조

| 참조 | 내용 | 신뢰도 |
|------|------|--------|
| [AWS KMS ED25519 발표](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-kms-edwards-curve-digital-signature-algorithm/) | ED25519 공식 지원 발표 | HIGH |
| [AWS KMS Key Spec](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html) | ECC_NIST_EDWARDS25519 스펙 | HIGH |
| [Squads Protocol v4](https://github.com/Squads-Protocol/v4) | Solana 멀티시그 표준 | HIGH |
| [AWS Nitro Enclaves Coinbase](https://aws.amazon.com/blogs/web3/powering-programmable-crypto-wallets-at-coinbase-with-aws-nitro-enclaves/) | 실제 구현 사례 | HIGH |
| [Crossmint Dual Key](https://blog.crossmint.com/ai-agent-wallet-architecture/) | Dual Key 아키텍처 상세 | MEDIUM |
| [solana-kms-signer](https://github.com/gtg7784/solana-kms-signer) | TypeScript KMS 서명 라이브러리 | MEDIUM |

---

*문서 ID: CUST-04*
*작성일: 2026-02-04*
*Phase: 02-custody-model*
*상태: 완료*
