# Phase 148: WC 서명 요청 - Research

**Researched:** 2026-02-16
**Domain:** WalletConnect v2 SignClient.request() + ApprovalWorkflow 브릿지
**Confidence:** HIGH

## Summary

Phase 148은 APPROVAL 정책 거래 발생 시 WalletConnect 세션을 통해 Owner 지갑에 서명 요청을 보내고, 그 결과(승인/거부)를 기존 ApprovalWorkflow에 반영하는 기능이다. 핵심은 Stage 4에서 APPROVAL로 PIPELINE_HALTED된 후, WC 세션이 있으면 fire-and-forget으로 `SignClient.request()`를 호출하여 Owner 지갑에 `personal_sign`(EVM) 또는 `solana_signMessage`(Solana) 요청을 전송하는 것이다.

기존 코드베이스 분석 결과: (1) `ApprovalWorkflow.requestApproval()`은 pending_approvals 레코드를 생성하고 tx를 QUEUED로 설정, (2) `ApprovalWorkflow.approve(txId, ownerSignature)`는 ownerSignature를 저장하고 tx를 EXECUTING으로 전환, (3) `pending_approvals` 테이블에 `approval_channel` 컬럼(DB v16)이 이미 존재하며 기본값 'rest_api', (4) 기존 REST `/transactions/:id/approve` 엔드포인트는 ownerAuth 미들웨어로 서명 검증 후 approve() 호출, (5) Telegram 봇도 별도의 approve 경로를 가짐. WC는 세 번째 채널로 추가된다.

**Primary recommendation:** WcSessionService에 `requestSignature(walletId, txId, message)` 메서드를 추가하고, stage4Wait의 APPROVAL 분기에서 fire-and-forget으로 호출한다. WC 응답이 오면 기존 `verifySIWE`/Ed25519 검증을 재사용하여 `approvalWorkflow.approve()`를 호출한다.

## User Constraints (from prior decisions)

### Locked Decisions
- WC는 "선호 채널"이지 유일 채널이 아님
- 3중 승인 채널 (WC > Telegram > REST) 우선순위
- fire-and-forget 패턴 (WC 서명 요청은 백그라운드)
- 기존 REST API(SIWE/SIWS) 직접 승인 경로 절대 유지

### Claude's Discretion
- WC 서명 요청 메시지 포맷 (SIWE vs 평문)
- 타임아웃 동기화 구현 방식
- 에러 핸들링 세부 전략

### Deferred Ideas (OUT OF SCOPE)
- WC 거래 재실행 (stage5/6) 자동 트리거 -- 현재 REST approve도 stage5/6 실행하지 않음
- 다중 WC 세션 지원

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @walletconnect/sign-client | ^2.23.5 | WC v2 세션 기반 서명 요청 | 이미 daemon package.json에 설치됨 |
| viem | 2.x | SIWE 메시지 생성/검증, EIP-191 서명 검증 | 이미 사용 중 (siwe-verify.ts) |
| sodium-native | - | Ed25519 서명 검증 (Solana) | 이미 사용 중 (owner-auth.ts) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| viem/siwe | 2.x | createSiweMessage() 함수 | EVM personal_sign 메시지 구성 시 |

### Alternatives Considered
없음. 기존 스택을 그대로 재사용한다.

## Architecture Patterns

### 통합 지점 (Integration Points)

```
Stage 3 (Policy)
  └── tier = APPROVAL (+ TX_APPROVAL_REQUIRED 알림)
       │
Stage 4 (Wait)
  ├── approvalWorkflow.requestApproval(txId)  ← 기존
  ├── [NEW] wcSigningBridge.requestSignature(walletId, txId)  ← fire-and-forget
  └── throw PIPELINE_HALTED  ← 기존
       │
[Background: WC response handler]
  ├── Owner 서명 수신
  ├── verifySIWE / Ed25519 검증 (기존 로직 재사용)
  ├── approvalWorkflow.approve(txId, signature)
  └── approval_channel = 'walletconnect' UPDATE
```

### Pattern 1: Fire-and-Forget WC 서명 요청
**What:** Stage 4에서 APPROVAL 분기 시 WC 세션이 있으면 백그라운드로 서명 요청을 전송한다. 파이프라인은 PIPELINE_HALTED로 즉시 반환하고, WC 응답은 비동기 처리된다.
**When to use:** APPROVAL tier 거래가 발생하고 해당 wallet에 WC 세션이 활성화된 경우.
**Example:**
```typescript
// stage4Wait APPROVAL 분기에 추가
if (tier === 'APPROVAL') {
  ctx.approvalWorkflow.requestApproval(ctx.txId);

  // fire-and-forget: WC 서명 요청 (파이프라인 블로킹 없음)
  if (ctx.wcSigningBridge) {
    void ctx.wcSigningBridge.requestSignature(
      ctx.walletId,
      ctx.txId,
      ctx.wallet.chain,
    );
  }

  throw new WAIaaSError('PIPELINE_HALTED', { ... });
}
```

### Pattern 2: SignClient.request() 호출
**What:** WC 서명 요청은 `signClient.request()` API를 사용한다. EVM은 `personal_sign`, Solana는 `solana_signMessage` 메서드를 사용한다.
**When to use:** WC 세션이 활성화된 wallet에 대해 APPROVAL 서명 요청 시.
**Example:**
```typescript
// EVM (personal_sign)
const result = await signClient.request({
  topic: sessionTopic,
  chainId: 'eip155:1', // CAIP-2
  request: {
    method: 'personal_sign',
    params: [
      `0x${Buffer.from(siweMessage, 'utf8').toString('hex')}`, // hex-encoded message
      ownerAddress, // 0x address
    ],
  },
  // expiry는 초 단위 (WC SDK v2.2.1+)
});
// result: 0x-prefixed hex signature

// Solana (solana_signMessage)
const result = await signClient.request({
  topic: sessionTopic,
  chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // CAIP-2
  request: {
    method: 'solana_signMessage',
    params: {
      message: base58EncodedMessage, // base58-encoded UTF-8 message
      pubkey: ownerAddress, // base58 public key
    },
  },
});
// result: { signature: 'base58-encoded-signature' }
```

### Pattern 3: 서명 메시지 구성
**What:** WC로 전송할 서명 메시지는 기존 ownerAuth 검증과 호환되어야 한다. EVM은 SIWE (EIP-4361) 메시지, Solana는 평문 challenge를 사용한다.
**When to use:** WC 서명 요청 메시지 생성 시.
**Example:**
```typescript
// EVM: createSiweMessage() 사용 (viem/siwe)
import { createSiweMessage } from 'viem/siwe';

function buildApprovalSiweMessage(ownerAddress: string, txId: string): string {
  return createSiweMessage({
    address: ownerAddress as `0x${string}`,
    chainId: 1, // or resolved from wallet
    domain: 'waiaas.local',
    nonce: randomBytes(16).toString('hex'),
    uri: 'http://localhost:3000',
    version: '1',
    statement: `Approve transaction ${txId}`,
    expirationTime: new Date(Date.now() + timeoutMs),
  });
}

// Solana: 평문 challenge
function buildApprovalSolanaMessage(txId: string): string {
  return `WAIaaS: Approve transaction ${txId}`;
}
```

### Pattern 4: WC 응답 처리 및 검증
**What:** WC로부터 서명 응답을 받으면 기존 ownerAuth 검증 함수를 재사용한다.
**When to use:** SignClient.request() Promise가 resolve된 경우.
**Example:**
```typescript
// EVM: verifySIWE 재사용
const verifyResult = await verifySIWE({
  message: siweMessage,
  signature: wcSignature, // 0x-prefixed hex from WC
  expectedAddress: ownerAddress,
});

if (verifyResult.valid) {
  approvalWorkflow.approve(txId, wcSignature);
  // UPDATE approval_channel = 'walletconnect'
  sqlite.prepare(
    'UPDATE pending_approvals SET approval_channel = ? WHERE tx_id = ?'
  ).run('walletconnect', txId);
}

// Solana: Ed25519 검증 재사용
const sodium = require('sodium-native');
const signatureBytes = Buffer.from(wcSignature, 'base64');
const messageBytes = Buffer.from(challengeMessage, 'utf8');
const publicKeyBytes = decodeBase58(ownerAddress);
const valid = sodium.crypto_sign_verify_detached(signatureBytes, messageBytes, publicKeyBytes);
```

### Pattern 5: WC 거부/타임아웃 처리
**What:** Owner가 WC에서 거부하면 approvalWorkflow.reject()를 호출한다. 타임아웃은 ApprovalWorkflow의 기존 만료 메커니즘에 의존한다.
**When to use:** SignClient.request() Promise가 reject된 경우.
**Example:**
```typescript
try {
  const signature = await signClient.request({ ... });
  // 승인 처리
} catch (error: any) {
  // WC 에러 코드: 4001/5000 = 사용자 거부, 8000 = 요청 만료
  if (error?.code === 5000 || error?.code === 4001) {
    // Owner가 명시적으로 거부 -> reject 처리
    approvalWorkflow.reject(txId);
    sqlite.prepare(
      'UPDATE pending_approvals SET approval_channel = ? WHERE tx_id = ? AND approval_channel = ?'
    ).run('walletconnect', txId, 'rest_api');
  }
  // 타임아웃/네트워크 에러: 무시 (기존 approval-expired 워커가 처리)
}
```

### Anti-Patterns to Avoid
- **WC 응답을 파이프라인에서 동기 대기:** WC 요청은 반드시 fire-and-forget이어야 한다. HTTP 응답이 WC를 기다려서는 안 된다.
- **approval_channel 업데이트를 approve() 내부에 넣기:** approve()는 채널에 무관한 범용 메서드. channel 업데이트는 호출자가 별도로 수행한다.
- **WC 전용 승인 경로 만들기:** WC 응답도 기존 approve()/reject() 메서드를 그대로 사용해야 한다. 별도 경로를 만들면 DB 무결성이 깨진다.

### Recommended Service Structure
```
packages/daemon/src/
├── services/
│   ├── wc-session-service.ts       # 기존 (Phase 146-147)
│   └── wc-signing-bridge.ts        # [NEW] WC 서명 요청/응답 브릿지
├── workflow/
│   └── approval-workflow.ts        # 기존 (변경 최소화)
├── pipeline/
│   └── stages.ts                   # stage4Wait에 wcSigningBridge 연동
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SIWE 메시지 생성 | 문자열 수동 조립 | `createSiweMessage()` (viem/siwe) | EIP-4361 형식 정확성 보장 |
| SIWE 서명 검증 | 커스텀 검증 | `verifySIWE()` (기존 siwe-verify.ts) | 이미 검증된 코드 재사용 |
| Ed25519 서명 검증 | 커스텀 검증 | sodium-native `crypto_sign_verify_detached` (기존 owner-auth.ts) | 이미 검증된 코드 재사용 |
| WC 세션/토픽 관리 | 직접 관리 | `WcSessionService.getSessionTopic(walletId)` | Phase 146에서 이미 구현 |
| 타임아웃 만료 처리 | 별도 타이머 | `ApprovalWorkflow.processExpiredApprovals()` (기존 워커) | 30초 주기 기존 워커가 처리 |

**Key insight:** Phase 148의 WC 브릿지는 기존 ownerAuth 검증 함수와 ApprovalWorkflow를 재사용하는 "접착 레이어"다. 새로운 암호학적 검증 로직을 만들 필요가 없다.

## Common Pitfalls

### Pitfall 1: personal_sign 파라미터 순서
**What goes wrong:** personal_sign의 params는 `[hexMessage, address]` 순서다. 순서가 바뀌면 지갑이 파싱에 실패한다.
**Why it happens:** EVM JSON-RPC 메서드마다 파라미터 순서가 다르다.
**How to avoid:** EVM: `params: [0x${Buffer.from(msg).toString('hex')}, ownerAddress]`, Solana: `params: { message, pubkey }`
**Warning signs:** 지갑에서 "invalid params" 에러 또는 의미 없는 메시지가 표시된다.

### Pitfall 2: solana_signMessage 메시지 인코딩
**What goes wrong:** Solana signMessage는 base58 인코딩된 메시지를 기대한다. UTF-8 원본을 보내면 실패한다.
**Why it happens:** WC Solana 네임스페이스 스펙이 base58 인코딩을 요구한다.
**How to avoid:** 메시지를 UTF-8 -> base58로 인코딩하여 전송한다.
**Warning signs:** "invalid message" 에러 또는 지갑에서 메시지가 깨져 보인다.

### Pitfall 3: WC 서명과 ownerAuth 검증 메시지 불일치
**What goes wrong:** WC로 보낸 메시지와 검증 시 사용하는 메시지가 다르면 서명 검증이 실패한다.
**Why it happens:** SIWE 메시지를 생성할 때와 검증할 때 동일한 문자열을 사용해야 한다.
**How to avoid:** WC 요청 전에 메시지를 생성하고, 해당 메시지를 DB에 저장한 후 검증 시 DB에서 꺼내 사용한다. 또는 pending_approvals에 `challenge_message` 컬럼을 추가한다.
**Warning signs:** WC에서 서명을 받았지만 verifySIWE가 실패한다.

### Pitfall 4: 이중 승인/거부 레이스 컨디션
**What goes wrong:** Owner가 WC와 REST 동시에 승인하면 approve()가 두 번 호출될 수 있다.
**Why it happens:** WC fire-and-forget과 REST 엔드포인트가 병렬로 동작한다.
**How to avoid:** `ApprovalWorkflow.approve()`는 이미 `BEGIN IMMEDIATE` 트랜잭션으로 원자적이며, `approved_at IS NULL AND rejected_at IS NULL` 조건으로 중복 방지. 두 번째 호출은 APPROVAL_NOT_FOUND 에러로 자연스럽게 실패한다.
**Warning signs:** 없음 (이미 안전한 구조).

### Pitfall 5: WC 타임아웃과 Approval 타임아웃 불일치
**What goes wrong:** WC request의 기본 타임아웃은 5분이지만, ApprovalWorkflow 타임아웃은 설정에 따라 최대 3600초(1시간).
**Why it happens:** WC SDK 기본값과 WAIaaS 설정이 독립적이다.
**How to avoid:** `signClient.request()`에 expiry 파라미터를 전달하여 ApprovalWorkflow 타임아웃과 동기화한다. `request({ ..., expiry: approvalTimeout })` 사용 (WC SDK v2.2.1+ 지원, 초 단위).
**Warning signs:** WC에서 5분 후 timeout 에러가 발생하지만 approval은 아직 유효한 상태.

### Pitfall 6: WC 세션 끊김 중 서명 요청
**What goes wrong:** WC 세션이 끊겼지만 in-memory sessionMap에 아직 반영되지 않은 경우.
**Why it happens:** session_delete/session_expire 이벤트가 비동기로 전달된다.
**How to avoid:** signClient.request() 실패를 graceful하게 처리하고, 세션 유효성은 최선 노력(best-effort)으로 확인한다. 실패 시 다른 채널(Telegram, REST)로 fallback은 자동이다 (fire-and-forget이므로 WC 실패해도 approval은 여전히 다른 경로로 가능).
**Warning signs:** signClient.request()가 "No session for topic" 에러를 던진다.

## Code Examples

### WcSigningBridge 핵심 구조
```typescript
// Source: 코드베이스 분석 기반 설계
import type SignClient from '@walletconnect/sign-client';
import type { WcSessionService } from './wc-session-service.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { verifySIWE } from '../api/middleware/siwe-verify.js';

export class WcSigningBridge {
  constructor(private deps: {
    wcSessionService: WcSessionService;
    approvalWorkflow: ApprovalWorkflow;
    sqlite: Database;
  }) {}

  /**
   * Fire-and-forget: WC 세션이 있으면 서명 요청을 전송한다.
   * 없으면 조용히 반환 (다른 채널이 처리).
   */
  async requestSignature(walletId: string, txId: string, chain: string): Promise<void> {
    const signClient = this.deps.wcSessionService.getSignClient();
    const topic = this.deps.wcSessionService.getSessionTopic(walletId);
    if (!signClient || !topic) return; // WC 없으면 무시

    const sessionInfo = this.deps.wcSessionService.getSessionInfo(walletId);
    if (!sessionInfo) return;

    try {
      // 1. 서명 메시지 구성 (체인별 분기)
      const { message, method, params } = this.buildSignRequest(
        chain, sessionInfo.ownerAddress, txId, sessionInfo.chainId,
      );

      // 2. pending_approvals에 challenge_message 저장 (검증용)
      this.deps.sqlite
        .prepare('UPDATE pending_approvals SET approval_channel = ? WHERE tx_id = ?')
        .run('walletconnect', txId);

      // 3. WC 서명 요청 전송 (타임아웃 동기화)
      const approvalTimeout = this.getApprovalTimeout(txId);
      const result = await signClient.request({
        topic,
        chainId: sessionInfo.chainId,
        request: { method, params },
        expiry: approvalTimeout, // 초 단위
      });

      // 4. 서명 검증 + approve
      await this.handleSignatureResponse(chain, walletId, txId, message, result, sessionInfo.ownerAddress);
    } catch (error: any) {
      this.handleSignatureError(txId, error);
    }
  }
}
```

### approval_channel UPDATE 패턴
```typescript
// Source: pending_approvals 스키마 (DB v16)
// pending_approvals.approval_channel: TEXT DEFAULT 'rest_api'
// 가능한 값: 'rest_api' | 'walletconnect' | 'telegram'

// WC 서명 요청 시 채널 마킹
sqlite.prepare(
  'UPDATE pending_approvals SET approval_channel = ? WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL'
).run('walletconnect', txId);

// Telegram 승인 시 채널 마킹 (Phase 148에서 Telegram도 업데이트 필요)
// 현재 Telegram 봇은 approval_channel을 업데이트하지 않음 (기본값 rest_api로 남음)
// Phase 148에서 함께 수정하거나 별도 이슈로 관리
```

### WC 에러 코드 처리
```typescript
// Source: WalletConnect Specs Error Codes
// https://specs.walletconnect.com/2.0/specs/clients/sign/error-codes

const WC_ERROR_USER_REJECTED = [4001, 5000]; // 사용자 거부
const WC_ERROR_REQUEST_EXPIRED = 8000;        // 요청 만료
const WC_ERROR_NO_SESSION = 7001;             // 세션 없음

function handleSignatureError(txId: string, error: any): void {
  const code = error?.code;

  if (WC_ERROR_USER_REJECTED.includes(code)) {
    // Owner가 명시적으로 거부 -> reject
    this.deps.approvalWorkflow.reject(txId);
    return;
  }

  if (code === WC_ERROR_REQUEST_EXPIRED || code === WC_ERROR_NO_SESSION) {
    // 타임아웃/세션 만료: 무시 (approval-expired 워커가 처리)
    return;
  }

  // 기타 에러: 무시 (REST/Telegram 경로로 승인 가능)
  console.warn(`[WcSigningBridge] request failed for tx ${txId}:`, error?.message);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WC v1 (polling) | WC v2 (relay + session) | 2023 | SignClient 기반 비동기 요청 |
| 5분 고정 타임아웃 | expiry 파라미터 지원 | WC SDK v2.2.1 | ApprovalWorkflow 타임아웃 동기화 가능 |
| single approval channel | 3-channel (WC/Telegram/REST) | Phase 146-148 | approval_channel 감사 추적 |

**Deprecated/outdated:**
- WC v1: 완전히 deprecated. v2만 사용 (@walletconnect/sign-client ^2.23.5)

## Critical Codebase Observations

### 1. ApprovalWorkflow.approve()는 순수 DB 갱신
`approve(txId, ownerSignature)`는 pending_approvals + transactions 상태만 업데이트한다. Stage 5/6 재진입(on-chain 실행)은 포함되지 않는다. 현재 REST `/approve` 엔드포인트도 마찬가지다. 이는 Phase 148 범위 밖의 문제이므로 WC 승인도 동일하게 DB 상태만 갱신하면 된다.

### 2. 이중 승인 방지는 이미 안전
`ApprovalWorkflow.approve()`는 `BEGIN IMMEDIATE` + `approved_at IS NULL AND rejected_at IS NULL` 조건으로 원자적이다. WC와 REST가 동시에 approve()를 호출해도 하나만 성공하고 다른 하나는 `APPROVAL_NOT_FOUND` 에러가 발생한다.

### 3. TransactionRouteDeps에 wcSessionService 없음
현재 `transactionRoutes`의 deps에 `wcSessionService`가 포함되어 있지 않다. WC 브릿지를 stage4Wait에 연결하려면 PipelineContext 또는 stage4Wait의 deps를 확장해야 한다.

### 4. Telegram 봇의 approval_channel 미갱신
현재 Telegram 봇(`handleApprove`)은 approval_channel을 'telegram'으로 업데이트하지 않는다 (기본값 'rest_api'로 남음). Phase 148에서 Telegram도 함께 수정할지 별도 이슈로 관리할지 결정 필요.

### 5. CAIP-2 Chain ID 매핑 이미 존재
`WcSessionService.CAIP2_CHAIN_IDS`에 Solana/EVM 네트워크별 CAIP-2 ID 매핑이 이미 정의되어 있다. `wc_sessions.chain_id`에도 저장되어 있으므로 별도 변환 불필요.

### 6. WC 세션의 ownerAddress 이미 저장
`wc_sessions.owner_address`에 CAIP-10에서 추출한 Owner 주소가 이미 저장되어 있다. 서명 검증 시 이 주소와 대조한다.

## Open Questions

1. **Challenge 메시지 저장 위치**
   - What we know: WC로 보낸 메시지와 검증 시 메시지가 동일해야 한다.
   - What's unclear: pending_approvals에 challenge_message 컬럼을 추가할지, 또는 메시지 포맷을 결정론적(deterministic)으로 만들어 재구성할지.
   - Recommendation: pending_approvals에 `challenge_message TEXT` 컬럼 추가 (DB v17은 불필요, Phase 149에서 다룰 예정이 아니라면 메시지를 결정론적으로 구성하여 txId로부터 재구성 가능하게 한다). **결정론적 재구성 방식 추천** -- 메시지 포맷을 `WAIaaS: Approve transaction {txId}`처럼 고정하면 DB 마이그레이션 없이 해결 가능.

2. **SIWE 메시지의 domain/uri 설정**
   - What we know: 현재 테스트에서 domain='localhost', uri='http://localhost:3000' 사용.
   - What's unclear: WC 경유 SIWE 메시지에도 동일한 값을 사용할지.
   - Recommendation: `waiaas.local` 또는 config.toml의 host 값 사용. nonce는 서버 측 검증 안 함(기존 결정).

3. **Solana signMessage 응답 형식**
   - What we know: WC 스펙에 따르면 `{ signature: 'base58-string' }` 반환.
   - What's unclear: 실제 지갑(Phantom 등)의 응답 형식이 스펙과 일치하는지.
   - Recommendation: `result.signature` (base58)를 base64로 변환하여 기존 ownerAuth Ed25519 검증 경로에 맞춘다.

## Sources

### Primary (HIGH confidence)
- `packages/daemon/src/workflow/approval-workflow.ts` -- ApprovalWorkflow 전체 코드
- `packages/daemon/src/pipeline/stages.ts` -- Stage 4 APPROVAL 분기 로직
- `packages/daemon/src/services/wc-session-service.ts` -- WcSessionService 전체 코드
- `packages/daemon/src/api/middleware/owner-auth.ts` -- ownerAuth SIWE/Ed25519 검증
- `packages/daemon/src/api/middleware/siwe-verify.ts` -- verifySIWE 구현
- `packages/daemon/src/infrastructure/database/schema.ts` -- pending_approvals 스키마 (approval_channel)
- `packages/daemon/src/api/routes/transactions.ts` -- REST approve/reject 엔드포인트

### Secondary (MEDIUM confidence)
- [WalletConnect Specs - Error Codes](https://specs.walletconnect.com/2.0/specs/clients/sign/error-codes) -- 에러 코드 4001, 5000, 8000
- [WalletConnect Specs - Client API](https://specs.walletconnect.com/2.0/specs/clients/sign/client-api) -- SignClient.request() 파라미터
- [WalletConnect Solana Docs](https://docs.walletconnect.network/wallet-sdk/chain-support/solana) -- solana_signMessage 요청/응답 형식
- [GitHub Issue #1739 - Timeout option](https://github.com/WalletConnect/walletconnect-monorepo/issues/1739) -- expiry 파라미터 (v2.2.1+)

### Tertiary (LOW confidence)
- personal_sign params 순서 `[hexMessage, address]` -- WebSearch에서 확인했지만 공식 스펙 직접 확인 못함. MetaMask/Ethereum 문서에서 일관되게 확인됨.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 기존 스택 100% 재사용, 새 라이브러리 없음
- Architecture: HIGH -- 기존 패턴(fire-and-forget, approve/reject) 직접 확인
- Pitfalls: HIGH -- 실제 코드베이스에서 레이스 컨디션, 메시지 인코딩 문제 분석
- WC SDK API: MEDIUM -- SignClient.request() 스펙을 공식 문서에서 확인, 일부 세부사항(Solana 응답 형식)은 스펙에서만 확인

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (안정적 도메인, 기존 코드 기반)
