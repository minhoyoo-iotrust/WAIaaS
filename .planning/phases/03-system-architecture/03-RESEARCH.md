# Phase 3: 시스템 아키텍처 설계 - Research

**Researched:** 2026-02-04
**Domain:** 시스템 아키텍처 / Dual Key 설계 / 보안 위협 모델 / 멀티체인 확장
**Confidence:** HIGH

## Summary

본 리서치는 Phase 2에서 확정된 AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처를 기반으로 시스템 아키텍처 설계에 필요한 기술적 요소들을 조사하였다. 조사 결과, 이 아키텍처 조합은 2026년 현재 기관급 암호화폐 지갑 보안의 표준으로 확립되어 있으며, Coinbase, Fireblocks 등 주요 기업들이 동일한 패턴을 사용하고 있다.

핵심 발견사항: (1) AWS KMS ED25519는 2025년 11월 공식 지원 발표 이후 Solana 트랜잭션 직접 서명이 가능해졌으며 FIPS 140-2 Level 3 검증 환경 제공, (2) Nitro Enclaves는 최대 4개 인스턴스 제한, 영구 저장소 없음, vsock 통신만 허용하는 고립 특성 보유, (3) Squads Protocol v4는 spending limits, time locks, roles, sub-accounts 지원으로 AI 에이전트 정책 강제에 적합, (4) 2026년 암호화폐 위협은 피싱, 주소 오염, AI 기반 악성코드가 주류로 $3.4B+ 피해 발생.

모놀리식 아키텍처 선택은 2026년 트렌드와 부합한다. CNCF 조사에 따르면 마이크로서비스를 채택한 조직의 42%가 현재 서비스를 더 큰 배포 단위로 통합 중이며, "모듈형 모놀리스 + 필요시 선택적 추출"이 권장된다. 키 관리 로직을 인터페이스로 추상화하면 향후 분리가 용이하다.

**Primary recommendation:** 모놀리식 구조에서 키 관리 인터페이스를 추상화하고, Nitro Enclaves의 고립 특성을 최대 활용하며, Squads v4의 spending limits와 time locks로 온체인 정책을 강제하라.

## Standard Stack

Phase 2에서 확정된 스택을 기반으로 Phase 3 아키텍처 설계에 필요한 구성 요소.

### Core

| 구성 요소 | 버전/스펙 | 용도 | 선택 이유 |
|----------|----------|------|----------|
| AWS KMS | ECC_NIST_EDWARDS25519 | Owner Key 관리, ED25519 서명 | FIPS 140-2 Level 3 검증, CloudTrail 불변 감사 로그 |
| AWS Nitro Enclaves | EC2 c5.xlarge+ | Agent Key 격리 실행 환경 | 하드웨어 수준 메모리 격리, 추가 비용 없음 |
| Squads Protocol | v4 (SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf) | 온체인 멀티시그, 정책 강제 | $10B+ 자산 보호 실적, OtterSec/Trail of Bits 감사 |
| solana-kms-signer | latest | KMS ED25519 Solana 서명 | TypeScript, VersionedTransaction 지원 |
| @sqds/multisig | latest | Squads SDK | 공식 TypeScript SDK |

### Supporting

| 라이브러리 | 용도 | 사용 시점 |
|-----------|------|----------|
| @aws-sdk/client-kms | KMS API 호출 | Owner Key 서명, Enclave 시드 암호화 |
| aws-nitro-enclaves-sdk-c | Enclave 애플리케이션 개발 | Agent Key 서명 로직 |
| vsock (AF_VSOCK) | Enclave-호스트 통신 | 서명 요청/응답 전달 |
| CloudTrail | 감사 로그 | KMS 작업 모니터링 |

### Alternatives Considered

| 대신 | 대안 | 트레이드오프 |
|------|------|-------------|
| Nitro Enclaves (클라우드) | 암호화된 파일 시스템 + HSM (셀프호스트) | 외부 의존성 최소화 필요시, 하지만 보안 수준 낮음 |
| KMS ED25519 | CloudHSM ED25519 | CloudHSM은 ~$1,168/월 비용, ED25519 미지원 확인 필요 |
| Squads v4 | 커스텀 Solana 프로그램 | Squads 기능 부족시에만, 높은 구현/감사 비용 |

## Architecture Patterns

### Pattern 1: 모놀리식 + 키 관리 인터페이스 추상화

**What:** 단일 배포 단위로 유지하되, 키 관리 로직은 인터페이스로 격리하여 향후 분리 가능하게 설계

**Why:** 2026년 트렌드 - 42%의 조직이 마이크로서비스에서 모듈형 모놀리스로 회귀 중 (CNCF 조사). 운영 복잡도와 비용 절감.

**When to use:** 초기 구축, 소규모 팀, 운영 복잡도 최소화 필요시

**Example:**
```typescript
// Source: Architecture best practices 2026
// 인터페이스 정의 - 향후 별도 서비스 분리 가능
interface IKeyManagementService {
  // Owner Key 작업 (AWS KMS)
  signWithOwnerKey(keyId: string, message: Uint8Array): Promise<Uint8Array>;
  getOwnerPublicKey(keyId: string): Promise<PublicKey>;

  // Agent Key 작업 (Nitro Enclave)
  signWithAgentKey(walletId: string, transaction: Transaction, policy: AgentPolicy): Promise<SignedTransaction | PolicyViolation>;
  initializeAgentKey(walletId: string): Promise<PublicKey>;
  rotateAgentKey(walletId: string): Promise<PublicKey>;
}

// 클라우드 구현
class CloudKeyManagementService implements IKeyManagementService {
  constructor(
    private readonly kmsClient: KMSClient,
    private readonly enclaveClient: EnclaveClient
  ) {}

  async signWithOwnerKey(keyId: string, message: Uint8Array): Promise<Uint8Array> {
    // AWS KMS ED25519_SHA_512 서명
    const response = await this.kmsClient.send(new SignCommand({
      KeyId: keyId,
      Message: message,
      MessageType: 'RAW',  // ED25519_SHA_512 필수 조건
      SigningAlgorithm: 'ED25519_SHA_512'
    }));
    return response.Signature;
  }

  async signWithAgentKey(walletId: string, transaction: Transaction, policy: AgentPolicy): Promise<SignedTransaction | PolicyViolation> {
    // Enclave에 vsock으로 서명 요청
    return this.enclaveClient.requestSignature(walletId, transaction, policy);
  }
}

// 셀프호스트 구현 (외부 의존성 최소화)
class SelfHostedKeyManagementService implements IKeyManagementService {
  constructor(
    private readonly encryptedKeyStore: EncryptedKeyStore,
    private readonly policyEngine: PolicyEngine
  ) {}

  async signWithOwnerKey(keyId: string, message: Uint8Array): Promise<Uint8Array> {
    // 로컬 암호화 키스토어에서 서명
    const keypair = await this.encryptedKeyStore.getOwnerKey(keyId);
    return nacl.sign.detached(message, keypair.secretKey);
  }

  async signWithAgentKey(walletId: string, transaction: Transaction, policy: AgentPolicy): Promise<SignedTransaction | PolicyViolation> {
    // 정책 검증 후 로컬 서명
    const validation = this.policyEngine.validate(transaction, policy);
    if (!validation.valid) return { violation: validation.reason };

    const keypair = await this.encryptedKeyStore.getAgentKey(walletId);
    return signTransaction(transaction, keypair);
  }
}
```

### Pattern 2: Dual Key Architecture - 역할 분리

**What:** Owner Key(마스터 권한)와 Agent Key(제한된 권한)의 명확한 역할 분리

**When to use:** 모든 AI 에이전트 지갑 구현시 (필수 패턴)

```typescript
// Source: Crossmint Dual Key Architecture + Phase 2 CUST-04

// 키별 역할 정의
interface DualKeyRoles {
  ownerKey: {
    permissions: [
      'WALLET_FULL_CONTROL',      // 모든 자산 이동
      'AGENT_REGISTER',            // Agent Key 등록
      'AGENT_REVOKE',              // Agent Key 해제
      'POLICY_MODIFY',             // 정책 변경
      'EMERGENCY_FREEZE',          // 긴급 동결
      'FUNDS_RECOVERY'             // 자금 회수
    ];
    storage: 'AWS_KMS_ED25519';
    accessPattern: 'RARE';         // 드물게 사용 (관리 작업)
    mfaRequired: true;
  };

  agentKey: {
    permissions: [
      'POLICY_BOUNDED_EXECUTE'     // 정책 범위 내 실행만
    ];
    storage: 'NITRO_ENCLAVE' | 'ENCRYPTED_LOCAL';
    accessPattern: 'FREQUENT';     // 빈번하게 사용 (일상 거래)
    policyEnforcement: 'ENCLAVE_INTERNAL';
  };
}

// Squads 멀티시그 구성
interface SquadsWalletConfig {
  members: [
    {
      key: PublicKey;  // Owner Key
      permissions: 'Permissions.all()';
    },
    {
      key: PublicKey;  // Agent Key
      permissions: 'Permissions.execute()';  // 실행만, 설정 변경 불가
    }
  ];

  // 동적 threshold (금액 기반)
  thresholdPolicy: {
    smallAmount: {             // < 1 SOL
      threshold: 1;            // Agent 단독
      timeLock: 0;
    };
    mediumAmount: {            // 1-10 SOL
      threshold: 1;
      timeLock: 3600;          // 1시간 지연
    };
    largeAmount: {             // > 10 SOL
      threshold: 2;            // Owner + Agent 필수
      timeLock: 86400;         // 24시간 지연
    };
  };

  configAuthority: PublicKey;  // Owner만 설정 변경 가능
}
```

### Pattern 3: Fail-Safe Transaction Flow

**What:** 장애 시 모든 트랜잭션 거부, 이중 정책 검증 (API + 서명 전)

**When to use:** 보안 최우선 원칙 적용시 (확정된 결정)

```typescript
// Source: Phase 3 CONTEXT.md decisions

// 트랜잭션 승인 흐름 (두 단계 정책 평가)
async function processTransaction(
  request: TransactionRequest
): Promise<TransactionResult> {

  // Step 1: API 진입 시 정책 평가 (서버 레벨)
  const apiPolicyCheck = await serverPolicyEngine.evaluate(request);
  if (!apiPolicyCheck.allowed) {
    return {
      status: 'REJECTED',
      stage: 'API_POLICY',
      reason: apiPolicyCheck.reason,
      escalation: determineEscalation(apiPolicyCheck.violation)
    };
  }

  // Step 2: 트랜잭션 구성
  const transaction = await buildTransaction(request);

  // Step 3: 시뮬레이션 (선택적)
  const simulation = await simulateTransaction(transaction);
  if (!simulation.success) {
    return { status: 'SIMULATION_FAILED', error: simulation.error };
  }

  // Step 4: Enclave 내부 정책 평가 + 서명 (서명 전 최종 검증)
  // Fail-safe: Enclave 연결 실패 시 거부
  let signedTx: SignedTransaction;
  try {
    signedTx = await keyManagement.signWithAgentKey(
      request.walletId,
      transaction,
      request.policy
    );

    if ('violation' in signedTx) {
      return {
        status: 'REJECTED',
        stage: 'ENCLAVE_POLICY',
        reason: signedTx.violation,
        escalation: determineEscalation(signedTx.violation)
      };
    }
  } catch (error) {
    // Fail-safe: 장애 시 거부
    logger.error('Enclave communication failed', { error });
    return {
      status: 'REJECTED',
      stage: 'ENCLAVE_ERROR',
      reason: 'Key management service unavailable',
      failSafe: true
    };
  }

  // Step 5: 온체인 제출 (재시도 없음 - 호출자가 결정)
  const result = await submitTransaction(signedTx);

  // Step 6: Webhook 전송 (선택적)
  if (request.webhookUrl) {
    await sendWebhook(request.webhookUrl, result);
  }

  return result;
}

// 에스컬레이션 결정 (단계별)
function determineEscalation(violation: PolicyViolation): EscalationType {
  switch (violation.severity) {
    case 'LOW':      // 한도 약간 초과
      return { type: 'NOTIFY_OWNER', channel: 'PUSH' };
    case 'MEDIUM':   // 화이트리스트 외 주소
      return { type: 'REQUIRE_OWNER_APPROVAL', timeout: '1h' };
    case 'HIGH':     // 의심스러운 패턴
      return { type: 'FREEZE_AND_ALERT', requireManualUnfreeze: true };
    case 'CRITICAL': // 명백한 공격 시도
      return { type: 'EMERGENCY_LOCKDOWN', revokeAgentKey: true };
  }
}
```

### Anti-Patterns to Avoid

- **정책 검증을 한 곳에서만 수행:** API 레벨에서만 검증하면 서버 침해 시 우회 가능. 반드시 Enclave 내부에서도 검증.

- **재시도 자동화:** 트랜잭션 실패 시 자동 재시도는 에이전트 버그로 인한 반복 손실 위험. 호출자가 재시도 결정.

- **장애 시 허용 (Fail-open):** 보안 서비스 장애 시 거래를 허용하면 공격자가 의도적 장애 유발 가능. 반드시 거부.

- **동기 응답만 지원:** 긴 트랜잭션 처리 시 타임아웃 위험. Webhook을 통한 비동기 알림도 지원.

## Recommended Project Structure

```
waiass/
├── packages/
│   ├── core/                      # 공통 코어 (모든 환경에서 공유)
│   │   ├── src/
│   │   │   ├── domain/            # 도메인 모델
│   │   │   │   ├── wallet/
│   │   │   │   ├── transaction/
│   │   │   │   └── policy/
│   │   │   ├── interfaces/        # 인터페이스 정의 (키 관리 추상화)
│   │   │   │   ├── IKeyManagementService.ts
│   │   │   │   ├── IPolicyEngine.ts
│   │   │   │   └── IBlockchainAdapter.ts
│   │   │   ├── services/          # 비즈니스 로직
│   │   │   │   ├── WalletService.ts
│   │   │   │   ├── TransactionService.ts
│   │   │   │   └── PolicyEngine.ts
│   │   │   └── utils/
│   │   └── package.json
│   │
│   ├── cloud/                     # 클라우드 환경 (AWS)
│   │   ├── src/
│   │   │   ├── infrastructure/
│   │   │   │   ├── kms/           # AWS KMS Owner Key
│   │   │   │   ├── enclave/       # Nitro Enclave Agent Key
│   │   │   │   └── monitoring/    # CloudWatch, CloudTrail
│   │   │   └── adapters/
│   │   │       └── CloudKeyManagementService.ts
│   │   ├── enclave/               # Enclave 이미지 소스
│   │   │   ├── src/
│   │   │   │   ├── main.rs        # Enclave 메인 (Rust 권장)
│   │   │   │   ├── signing.rs
│   │   │   │   └── policy.rs
│   │   │   ├── Dockerfile
│   │   │   └── enclave.eif        # 빌드된 Enclave 이미지
│   │   └── package.json
│   │
│   ├── selfhost/                  # 셀프호스트 환경 (Docker Compose)
│   │   ├── src/
│   │   │   ├── infrastructure/
│   │   │   │   ├── encrypted-keystore/   # 암호화 키스토어
│   │   │   │   └── local-policy/         # 로컬 정책 엔진
│   │   │   └── adapters/
│   │   │       └── SelfHostedKeyManagementService.ts
│   │   ├── docker-compose.yml
│   │   └── package.json
│   │
│   └── api/                       # API 서버 (Fastify)
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/
│       │   └── handlers/
│       └── package.json
│
├── docs/
│   └── architecture/              # 아키텍처 문서
│       ├── ARCH-01-dual-key.md
│       ├── ARCH-02-components.md
│       ├── ARCH-03-transaction-flow.md
│       ├── ARCH-04-threat-model.md
│       └── ARCH-05-multichain.md
│
└── turbo.json                     # 모노레포 빌드 설정
```

## Don't Hand-Roll

| 문제 | 직접 구현 시도 | 대신 사용할 것 | 이유 |
|------|--------------|---------------|------|
| ED25519 서명 | crypto 직접 호출 | AWS KMS / tweetnacl | 사이드채널 공격, 타이밍 공격 방어 필요 |
| TEE 격리 | 자체 샌드박스 | AWS Nitro Enclaves | 하드웨어 수준 격리만이 실제 보호 제공 |
| Solana 멀티시그 | 커스텀 프로그램 | Squads Protocol v4 | formal verification 완료, $10B+ 실사용 검증 |
| 키 백업/복구 | 자체 암호화 로직 | KMS 봉투 암호화 | 키 관리의 키 관리가 새로운 문제 생성 |
| 감사 로그 | 자체 로깅 | CloudTrail + S3 WORM | 불변성 보장, 규정 준수 |
| vsock 통신 | TCP/HTTP | AF_VSOCK | Enclave 공식 통신 채널, 네트워크 격리 유지 |

**Key insight:** 2024년 암호화폐 해킹 피해의 43.8%가 개인키 침해에서 발생 (Chainalysis). "간단해 보이는" 키 관리도 수십 가지 공격 벡터 존재.

## Common Pitfalls

### Pitfall 1: Enclave 이미지 무결성 미검증

**What goes wrong:** 변조된 Enclave 이미지가 배포되어 Agent Key 유출
**Why it happens:** PCR (Platform Configuration Register) 검증 생략, CI/CD 해시 검증 누락
**How to avoid:**
1. KMS 키 정책에 `kms:RecipientAttestation:PCR0` 조건 필수 추가
2. CI/CD에서 Enclave 이미지 빌드 후 PCR 값 기록
3. 배포 전 PCR 화이트리스트 검증
4. CloudWatch 알람으로 승인되지 않은 PCR 감지
**Warning signs:** KMS 키 정책에 attestation 조건 없음, 이미지 버전 관리 부재

### Pitfall 2: 네트워크 분리 공격으로 정책 우회

**What goes wrong:** 서버-Enclave 연결 끊김 시 정책 검증 없이 서명 시도
**Why it happens:** Enclave가 오프라인 상태에서 독립 동작하도록 설계
**How to avoid:**
1. Fail-safe 원칙: Enclave 연결 실패 시 모든 서명 거부
2. 서버-Enclave heartbeat 모니터링
3. Enclave 단독 서명 기능 비활성화
4. 다중 RPC 프로바이더로 네트워크 장애 대응
**Warning signs:** Enclave가 서버 연결 없이 서명 가능, heartbeat 없음

### Pitfall 3: Owner Key 복구 경로 미설계

**What goes wrong:** IAM 접근 권한 상실 시 Owner Key 접근 불가, 자금 영구 손실
**Why it happens:** 단일 IAM 사용자/역할에만 KMS 키 접근 권한 부여
**How to avoid:**
1. 별도 IAM 역할 분리 (admin, service, emergency)
2. 백업 AWS 계정에 봉인된 자격 증명 보관
3. Squads guardian recovery 사전 설정 (time-locked)
4. 분기별 접근 테스트 절차 수립
**Warning signs:** 단일 IAM 사용자만 KMS 접근 가능, guardian 미설정

### Pitfall 4: 셀프호스트 Agent Key 보안 취약

**What goes wrong:** Docker 컨테이너에 평문 키 노출, 호스트에서 키 접근 가능
**Why it happens:** Nitro Enclave 없이 동일 보안 수준 달성 어려움
**How to avoid:**
1. 암호화 키스토어 사용 (libsodium sealed box)
2. 키 복호화 시 메모리에서만 유지, 디스크 기록 금지
3. Docker secrets 또는 Vault 연동
4. 호스트 침해 시 자동 키 무효화 메커니즘
**Warning signs:** 환경변수에 키 저장, 암호화되지 않은 볼륨 마운트

### Pitfall 5: Squads 정책 vs 서버 정책 불일치

**What goes wrong:** 서버 정책 통과 후 Squads에서 거부, UX 혼란
**Why it happens:** 온체인 정책과 오프체인 정책의 동기화 미흡
**How to avoid:**
1. 정책 변경 시 서버와 온체인 동시 업데이트
2. 온체인 정책을 source of truth로 설정
3. 서버 정책은 온체인 정책의 superset (더 엄격하게)
4. 정책 동기화 상태 모니터링
**Warning signs:** 서버 승인 후 온체인 거부 발생, 정책 버전 불일치

## Code Examples

### AWS KMS ED25519 Owner Key 서명

```typescript
// Source: AWS KMS Documentation + solana-kms-signer
import { KMSClient, SignCommand, GetPublicKeyCommand } from '@aws-sdk/client-kms';
import { PublicKey, Transaction } from '@solana/web3.js';

class OwnerKeySigner {
  constructor(
    private readonly kmsClient: KMSClient,
    private readonly keyId: string
  ) {}

  async getPublicKey(): Promise<PublicKey> {
    const response = await this.kmsClient.send(new GetPublicKeyCommand({
      KeyId: this.keyId
    }));
    // KMS 반환값에서 Solana 공개키 추출
    // ED25519 공개키는 32바이트
    const publicKeyBytes = response.PublicKey!.slice(-32);
    return new PublicKey(publicKeyBytes);
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const response = await this.kmsClient.send(new SignCommand({
      KeyId: this.keyId,
      Message: message,
      MessageType: 'RAW',  // ED25519_SHA_512 필수 조건
      SigningAlgorithm: 'ED25519_SHA_512'
    }));
    return new Uint8Array(response.Signature!);
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    const message = transaction.serializeMessage();
    const signature = await this.signMessage(message);
    transaction.addSignature(await this.getPublicKey(), Buffer.from(signature));
    return transaction;
  }
}

// KMS 키 정책 (Enclave attestation 조건 포함)
const kmsKeyPolicy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'AllowOwnerOperations',
      Effect: 'Allow',
      Principal: { AWS: 'arn:aws:iam::ACCOUNT:role/WAIaaS-OwnerRole' },
      Action: ['kms:Sign', 'kms:GetPublicKey', 'kms:DescribeKey'],
      Resource: '*',
      Condition: {
        Bool: { 'aws:MultiFactorAuthPresent': 'true' }
      }
    },
    {
      Sid: 'AllowEnclaveDecrypt',
      Effect: 'Allow',
      Principal: { AWS: 'arn:aws:iam::ACCOUNT:role/WAIaaS-EnclaveRole' },
      Action: ['kms:Decrypt'],
      Resource: '*',
      Condition: {
        StringEqualsIgnoreCase: {
          'kms:RecipientAttestation:PCR0': '<enclave-pcr0-hash>'
        }
      }
    }
  ]
};
```

### Squads v4 스마트 월렛 생성

```typescript
// Source: Squads Protocol v4 SDK
import * as multisig from '@sqds/multisig';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

interface CreateWalletParams {
  ownerPublicKey: PublicKey;
  agentPublicKey: PublicKey;
  spendingLimit: {
    mint: PublicKey;
    amount: bigint;
    period: 'daily' | 'weekly' | 'monthly';
  };
}

async function createAgentWallet(
  connection: Connection,
  params: CreateWalletParams,
  payer: Keypair
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey }> {
  const createKey = Keypair.generate();

  // 멀티시그 PDA 계산
  const [multisigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('multisig'), createKey.publicKey.toBuffer()],
    new PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf')
  );

  // 멀티시그 생성 (Owner + Agent)
  const createMultisigIx = await multisig.instructions.multisigCreate({
    createKey: createKey.publicKey,
    creator: payer.publicKey,
    multisigPda,
    configAuthority: params.ownerPublicKey,  // Owner만 설정 변경
    timeLock: 0,
    threshold: 1,  // 기본: Agent 단독 실행 (소액)
    members: [
      {
        key: params.ownerPublicKey,
        permissions: multisig.types.Permissions.all()  // 모든 권한
      },
      {
        key: params.agentPublicKey,
        permissions: multisig.types.Permissions.fromPermissions({
          initiate: true,
          vote: true,
          execute: true,
          // 아래는 Agent에게 없는 권한
          settings: false,      // 설정 변경 불가
          addMember: false,     // 멤버 추가 불가
          removeMember: false   // 멤버 제거 불가
        })
      }
    ],
    rentCollector: params.ownerPublicKey
  });

  // Spending Limit 설정 (v4 기능)
  const spendingLimitIx = await multisig.instructions.configTransactionCreate({
    multisigPda,
    actions: [
      {
        __kind: 'AddSpendingLimit',
        createKey: Keypair.generate().publicKey,
        mint: params.spendingLimit.mint,
        amount: params.spendingLimit.amount,
        period: mapPeriodToSlots(params.spendingLimit.period),
        members: [params.agentPublicKey],  // Agent만 사용 가능
        destinations: []  // 모든 목적지 허용, 또는 화이트리스트
      }
    ],
    creator: payer.publicKey
  });

  // 트랜잭션 실행...

  return { multisigPda, vaultPda: /* vault PDA 계산 */ };
}

function mapPeriodToSlots(period: 'daily' | 'weekly' | 'monthly'): bigint {
  const SLOTS_PER_DAY = 216000n;  // ~400ms per slot
  switch (period) {
    case 'daily': return SLOTS_PER_DAY;
    case 'weekly': return SLOTS_PER_DAY * 7n;
    case 'monthly': return SLOTS_PER_DAY * 30n;
  }
}
```

### Nitro Enclave vsock 통신

```rust
// Source: AWS Nitro Enclaves User Guide
// enclave/src/main.rs

use nix::sys::socket::{socket, bind, listen, accept, AddressFamily, SockType, SockFlag, VsockAddr};
use std::os::unix::io::RawFd;

const VSOCK_PORT: u32 = 5000;
const CID_ANY: u32 = 0xFFFFFFFF;

struct EnclaveServer {
    agent_keypair: ed25519_dalek::SigningKey,
}

impl EnclaveServer {
    fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        // vsock 소켓 생성
        let socket_fd = socket(
            AddressFamily::Vsock,
            SockType::Stream,
            SockFlag::empty(),
            None
        )?;

        // 바인드 및 리스닝
        let addr = VsockAddr::new(CID_ANY, VSOCK_PORT);
        bind(socket_fd, &addr)?;
        listen(socket_fd, 128)?;

        println!("Enclave listening on vsock port {}", VSOCK_PORT);

        loop {
            let client_fd = accept(socket_fd)?;
            self.handle_connection(client_fd)?;
        }
    }

    fn handle_connection(&self, fd: RawFd) -> Result<(), Box<dyn std::error::Error>> {
        // 요청 읽기
        let request: SignRequest = read_request(fd)?;

        // 정책 검증 (Enclave 내부)
        let policy_result = self.validate_policy(&request);
        if !policy_result.valid {
            write_response(fd, SignResponse::PolicyViolation(policy_result.reason))?;
            return Ok(());
        }

        // 서명 (정책 통과 시에만)
        let signature = self.agent_keypair.sign(&request.message);
        write_response(fd, SignResponse::Signature(signature.to_bytes()))?;

        Ok(())
    }

    fn validate_policy(&self, request: &SignRequest) -> PolicyResult {
        // Enclave 내부 정책 검증
        // - 금액 한도
        // - 화이트리스트
        // - 시간 제어
        // - 일일 누적 한도
        PolicyResult { valid: true, reason: None }
    }
}
```

## State of the Art

| 이전 방식 | 현재 방식 | 변경 시점 | 영향 |
|----------|----------|----------|------|
| 마이크로서비스 기본 | 모듈형 모놀리스 + 선택적 추출 | 2025-2026 | 42% 조직이 통합 중, 비용/복잡도 절감 |
| HSM 전용 하드웨어 | Cloud HSM/KMS + TEE | 2018-2024 | 비용 절감, 탄력적 확장 |
| GG18/GG20 MPC | CGGMP21 | 2021 | BitForge 취약점 해결 |
| 서버 사이드 ED25519 | AWS KMS ED25519 | 2025-11 | FIPS 인증 서명, Solana 직접 지원 |
| 단일 키 지갑 | Dual Key Architecture | 2025 | AI 에이전트 표준 패턴 |
| EVM only 멀티체인 | MetaMask 통합 EVM+Solana | 2025-10 | 단일 계정으로 다중 체인 |

**Deprecated/outdated:**
- **환경변수 키 저장:** 메모리 덤프 공격 취약, TEE/KMS 필수
- **동기 전용 응답:** Webhook 지원이 표준, 긴 트랜잭션 처리 필수
- **단일 정책 검증:** 서버+온체인 이중 검증이 표준

## Security Threat Model

### 위협 매트릭스 (ARCH-04 대응)

| 위협 | 공격 벡터 | 발생 가능성 | 영향도 | 대응 방안 |
|------|----------|------------|--------|----------|
| **Agent Key 탈취** | Enclave 이미지 변조, 호스트 침해 | 낮음 | 치명적 | PCR attestation, 메모리 암호화 |
| **Owner Key 탈취** | IAM 자격 증명 유출, 피싱 | 중간 | 치명적 | MFA 필수, 역할 분리, CloudTrail 감시 |
| **정책 우회** | 서버 침해, API 조작 | 중간 | 높음 | Enclave+온체인 이중 검증 |
| **네트워크 분리 공격** | MITM, DDoS | 중간 | 중간 | Fail-safe, 다중 RPC |
| **에이전트 로직 오류** | AI 버그, 잘못된 의사결정 | 높음 | 중간 | 한도 제한, Circuit Breaker |
| **내부자 공격** | 운영자 키 접근 | 낮음 | 높음 | IAM 최소 권한, MFA, 불변 로그 |
| **AI 기반 피싱** | Deepfake, 소셜 엔지니어링 | 높음 | 중간 | 자동화된 서명, 사람 개입 최소화 |
| **Squads 취약점** | 스마트 컨트랙트 버그 | 매우 낮음 | 높음 | 최신 버전, 감사 확인, 모니터링 |

### 핵심 대응 전략

**1. 계층적 방어 (Defense in Depth)**
```
외부 요청 → API Gateway (인증/Rate Limit)
           → 서버 정책 엔진 (1차 검증)
           → Enclave 정책 엔진 (2차 검증, 격리된 환경)
           → Squads 온체인 정책 (3차 검증, 불변)
           → 블록체인 제출
```

**2. 키 탈취 대응 메커니즘**
- **Agent Key 탈취 시:**
  - Owner Key로 즉시 Agent 멤버 제거 (Squads)
  - 새 Agent Key 생성 및 등록
  - 손실 한도: 정책 범위 내 (소액만)

- **Owner Key 탈취 시:**
  - Guardian recovery 활성화 (사전 설정 필수)
  - Time-locked recovery로 원래 소유자에게 취소 기회
  - CloudTrail 실시간 알림으로 조기 감지

**3. 내부자 위협 방어**
- 키 작업(Sign, Decrypt)에 MFA 필수
- IAM 최소 권한 원칙: 단일 역할로 전체 시스템 접근 불가
- CloudTrail → S3 WORM: 불변 감사 로그
- 고위험 작업 2인 승인 (PR 리뷰, 배포 승인)

**4. 이상 탐지**
- 비정상 트랜잭션 패턴 감지 (빈도, 금액, 시간)
- Circuit Breaker: 연속 실패 3회 시 자동 정지
- 실시간 알림: Slack/PagerDuty 연동
- 월간 보안 리뷰 및 침투 테스트

## Multichain Extension Path (ARCH-05)

### Solana → EVM 확장 경로

**확장 전략:** 공통 인터페이스 기반, 체인별 어댑터 패턴

```typescript
// 블록체인 어댑터 인터페이스
interface IBlockchainAdapter {
  // 지갑 생성
  createSmartWallet(ownerKey: string, agentKey: string, config: WalletConfig): Promise<string>;

  // 트랜잭션 구성
  buildTransaction(request: TransactionRequest): Promise<UnsignedTransaction>;

  // 시뮬레이션
  simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult>;

  // 제출
  submitTransaction(signedTx: SignedTransaction): Promise<TransactionResult>;

  // 잔액 조회
  getBalance(address: string, asset?: string): Promise<Balance>;
}

// Solana 어댑터 (Phase 3 구현)
class SolanaAdapter implements IBlockchainAdapter {
  // Squads Protocol v4 기반
  async createSmartWallet(ownerKey: string, agentKey: string, config: WalletConfig): Promise<string> {
    // Squads 멀티시그 생성
  }
}

// EVM 어댑터 (Phase 3 경로 정의, 추후 구현)
class EVMAdapter implements IBlockchainAdapter {
  // ERC-4337 Account Abstraction 기반
  // 또는 Safe (구 Gnosis Safe) 멀티시그
  async createSmartWallet(ownerKey: string, agentKey: string, config: WalletConfig): Promise<string> {
    // ERC-4337 배포 또는 Safe 생성
  }
}
```

**EVM 확장 시 고려사항:**

| 항목 | Solana | EVM (Ethereum/L2) |
|------|--------|-------------------|
| **스마트 월렛** | Squads Protocol v4 | ERC-4337 / Safe |
| **서명 알고리즘** | ED25519 | ECDSA (secp256k1) |
| **KMS 키 스펙** | ECC_NIST_EDWARDS25519 | ECC_SECG_P256K1 |
| **가스비** | 낮음 (~0.000005 SOL) | 높음 (가변) |
| **Account Abstraction** | 네이티브 (Programs) | ERC-4337 (EntryPoint) |

**Phase 3 산출물:**
- Solana 구현 상세 설계
- EVM 확장 인터페이스 정의
- 공통 도메인 모델 설계
- 체인별 어댑터 템플릿

## Self-Hosted Architecture (Claude's Discretion 결정)

### 셀프호스트 Agent Key 저장 방식

**권장:** 암호화 키스토어 + 메모리 전용 복호화

Nitro Enclave 없는 환경에서 외부 의존성 최소화하면서 보안 유지.

```typescript
// 셀프호스트 키스토어 구현
import sodium from 'libsodium-wrappers';

interface EncryptedKeyStore {
  // 마스터 키 (PBKDF2로 비밀번호에서 파생)
  deriveMasterKey(password: string, salt: Uint8Array): Promise<Uint8Array>;

  // Agent Key 저장 (암호화)
  storeAgentKey(walletId: string, keypair: Keypair): Promise<void>;

  // Agent Key 로드 (메모리에서만 복호화)
  loadAgentKey(walletId: string): Promise<Keypair>;
}

class SodiumEncryptedKeyStore implements EncryptedKeyStore {
  private masterKey: Uint8Array | null = null;
  private decryptedKeys: Map<string, Keypair> = new Map();

  async deriveMasterKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    await sodium.ready;
    // Argon2id 키 파생 (메모리 하드)
    return sodium.crypto_pwhash(
      32,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );
  }

  async storeAgentKey(walletId: string, keypair: Keypair): Promise<void> {
    if (!this.masterKey) throw new Error('Master key not initialized');

    // sealed box로 암호화 (디스크 저장)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      keypair.secretKey,
      nonce,
      this.masterKey
    );

    // 암호화된 데이터만 디스크에 저장
    await this.writeToSecureStorage(walletId, { nonce, ciphertext });
  }

  async loadAgentKey(walletId: string): Promise<Keypair> {
    // 캐시 확인
    if (this.decryptedKeys.has(walletId)) {
      return this.decryptedKeys.get(walletId)!;
    }

    if (!this.masterKey) throw new Error('Master key not initialized');

    const { nonce, ciphertext } = await this.readFromSecureStorage(walletId);

    // 메모리에서만 복호화
    const secretKey = sodium.crypto_secretbox_open_easy(
      ciphertext,
      nonce,
      this.masterKey
    );

    const keypair = Keypair.fromSecretKey(secretKey);

    // 메모리 캐시 (디스크 쓰기 금지)
    this.decryptedKeys.set(walletId, keypair);

    return keypair;
  }

  // 서비스 종료 시 메모리 소거
  clearMemory(): void {
    if (this.masterKey) {
      sodium.memzero(this.masterKey);
      this.masterKey = null;
    }
    this.decryptedKeys.forEach(keypair => {
      sodium.memzero(keypair.secretKey);
    });
    this.decryptedKeys.clear();
  }
}
```

### Docker Compose 셀프호스트 구성

```yaml
# docker-compose.yml
version: '3.8'

services:
  waiass-api:
    build:
      context: .
      dockerfile: packages/selfhost/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://waiass:${DB_PASSWORD}@postgres:5432/waiass
      - REDIS_URL=redis://redis:6379
      # 키스토어 비밀번호는 시작 시 입력 또는 Docker secrets
    secrets:
      - keystore_password
    volumes:
      - keystore-data:/app/data/keystore  # 암호화된 키만 저장
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=64M,mode=1777

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

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    restart: unless-stopped

secrets:
  keystore_password:
    external: true
  db_password:
    external: true

volumes:
  keystore-data:
  postgres-data:
  redis-data:
```

## Open Questions

### 1. Squads v4 동적 Threshold 한계

- **What we know:** Squads v4는 spending limits, time locks 지원. 멤버별 권한 차등 가능.
- **What's unclear:** 금액 기반 동적 threshold (소액 1-of-2, 고액 2-of-2)가 단일 트랜잭션 레벨에서 자동 적용 가능한지
- **Recommendation:** 서버/Enclave 레벨에서 금액 기반 라우팅 구현. 소액은 Agent 단독 실행, 고액은 Owner 승인 대기 큐.

### 2. 다중 리전 Enclave Attestation

- **What we know:** 각 Enclave 인스턴스마다 고유한 PCR 값 생성됨
- **What's unclear:** 다중 AZ/리전 배포 시 모든 인스턴스의 PCR을 KMS 정책에 등록해야 하는지
- **Recommendation:** 단일 리전에서 시작, 다중 리전 필요시 별도 KMS 키 또는 PCR 관리 자동화 구축

### 3. 셀프호스트 보안 동등성

- **What we know:** Nitro Enclave는 하드웨어 수준 격리 제공
- **What's unclear:** 암호화 키스토어 + Docker만으로 어느 수준의 보안까지 달성 가능한지
- **Recommendation:** 셀프호스트는 "동일 기능, 다른 보안 보장"으로 문서화. 기관급 보안 필요시 클라우드 권장.

### 4. 키 로테이션 온체인 영향

- **What we know:** Agent Key 로테이션 시 Squads 멤버 교체 필요
- **What's unclear:** 대규모 지갑에서 동시 키 로테이션 시 온체인 트랜잭션 비용/시간
- **Recommendation:** 키 로테이션은 정기 스케줄 + 이벤트 트리거 조합. 한 번에 소수 지갑씩 순차 처리.

## Sources

### Primary (HIGH confidence)
- [AWS KMS ED25519 Support (2025-11)](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-kms-edwards-curve-digital-signature-algorithm/) - ED25519 공식 지원
- [AWS KMS Key Spec Reference](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html) - ECC_NIST_EDWARDS25519 상세
- [AWS Nitro Enclaves User Guide](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave.html) - 아키텍처, 제한사항
- [Squads Protocol v4 GitHub](https://github.com/Squads-Protocol/v4) - spending limits, time locks, roles
- [solana-kms-signer](https://github.com/gtg7784/solana-kms-signer) - KMS Solana 서명 라이브러리

### Secondary (MEDIUM confidence)
- [CNCF Microservices Survey 2025](https://byteiota.com/modular-monolith-42-ditch-microservices-in-2026/) - 42% 모듈형 모놀리스 회귀
- [Cryptocurrency Wallet Security 2026](https://www.ledger.com/academy/topics/security/crypto-wallet-security-checklist-2025-protect-crypto-with-ledger) - 위협 동향
- [MetaMask Multichain (2025-10)](https://www.theblock.co/post/376450/metamask-multichain-account) - EVM+Solana 통합
- [AWS Nitro Enclaves Vault Architecture](https://aws-samples.github.io/sample-code-for-a-secure-vault-using-aws-nitro-enclaves/architecture/) - 베스트 프랙티스

### Tertiary (LOW confidence)
- [2026 Crypto Threat Landscape](https://bitcoinethereumnews.com/crypto/as-threats-increase-crypto-wallet-security-will-be-a-top-priority-in-2026/) - $3.4B+ 피해 추정
- [Key Rotation Best Practices](https://terrazone.io/key-rotation-cybersecurity/) - NIST 800-57 참조

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Phase 2에서 검증된 스택, AWS 공식 문서 확인
- Architecture patterns: HIGH - 2026년 트렌드 (모듈형 모놀리스), 검증된 패턴
- Security/Threat model: MEDIUM - 위협 동향은 변동성 있음, 대응 방안은 검증됨
- Multichain extension: MEDIUM - ERC-4337/Safe는 검증됨, 구체적 통합은 추후

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (AWS, Solana 생태계 빠른 변화로 30일 권장)

---

## Claude's Discretion Decisions

CONTEXT.md에서 Claude 재량으로 지정된 항목들에 대한 권장사항:

### 1. Owner Key AWS 접근 방식
**권장:** IAM Role 기반 (EC2 Instance Profile)

이유:
- 장기 자격 증명 노출 위험 없음
- 자동 자격 증명 로테이션
- Assume Role은 교차 계정 필요시에만

```typescript
// EC2 Instance Profile 사용 (자격 증명 자동 주입)
const kmsClient = new KMSClient({ region: 'ap-northeast-2' });
// 추가 자격 증명 설정 불필요
```

### 2. 셀프호스트 Agent Key 대체 저장소
**권장:** libsodium sealed box + Argon2id 키 파생

이유:
- 외부 의존성 없음 (순수 라이브러리)
- 메모리 하드 키 파생으로 무차별 대입 방어
- 메모리 전용 복호화로 디스크 유출 방지

### 3. 키 로테이션 정책
**권장:**
- Agent Key: 90일 정기 + 이상 징후 시 즉시
- Owner Key: 연 1회 (또는 침해 의심 시)

트리거 조건:
- 정기: Cron 기반 스케줄
- 이벤트: 연속 실패, 비정상 패턴, 운영자 요청

### 4. Agent Key 생성 위치
**권장:**
- 클라우드: Nitro Enclave 내부에서 생성, KMS로 시드 암호화 백업
- 셀프호스트: 서버 메모리에서 생성, 암호화 후 즉시 디스크 저장

### 5. 키 탈취 대응 메커니즘
**권장:** 위협 수준별 단계적 대응

| 수준 | 조건 | 대응 |
|------|------|------|
| LOW | 단일 실패, 경미한 이상 | 로그 기록, 알림 |
| MEDIUM | 연속 실패, 정책 경계 | Owner 알림, 임시 한도 축소 |
| HIGH | 명백한 비정상 패턴 | Agent 즉시 동결, Owner 승인 필요 |
| CRITICAL | 침해 확인 | Agent Key 해제, 새 키 발급, 포렌식 |

### 6. 내부자 위협 방어 수준
**권장:** 작업 민감도별 보호

| 작업 | 보호 수준 |
|------|----------|
| KMS 키 사용 (Sign) | MFA 필수 |
| 정책 변경 | 2인 승인 + 감사 로그 |
| Enclave 이미지 배포 | PR 리뷰 + 해시 검증 + 승인 |
| IAM 권한 변경 | 관리자 2인 승인 |

### 7. 이상 트랜잭션 탐지 방식
**권장:** 규칙 기반 + 통계적 이상치 (ML 없이 시작)

이유:
- 복잡도 최소화, 운영 비용 절감
- 초기에는 규칙 기반으로 충분
- 데이터 축적 후 ML 도입 검토

규칙 예시:
- 1분 내 10건 이상 요청
- 일일 한도 80% 초과
- 새벽 시간(UTC 0-6시) 대량 거래
- 화이트리스트 외 주소 반복 시도

### 8. 셀프호스트 키 저장 방식
**권장:** 암호화 파일 시스템 + Docker secrets

상세:
- 키스토어 비밀번호: Docker secrets 또는 시작 시 입력
- 암호화 알고리즘: XChaCha20-Poly1305 (libsodium)
- 키 파생: Argon2id (메모리 256MB, 시간 3회)
- 메모리 소거: 서비스 종료 시 명시적 소거
