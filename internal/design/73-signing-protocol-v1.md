# 73. WAIaaS Signing Protocol v1

> **Note (v32.9):** ntfy.sh 직접 연동은 v32.9에서 제거됨. 현재는 Push Relay HTTP POST + long-polling 방식으로 동작. 본 문서의 ntfy 관련 설명은 초기 설계 기록으로 보존.

## 목차

1. [개요](#1-개요)
2. [설계 원칙](#2-설계-원칙)
3. [SignRequest 스키마](#3-signrequest-스키마)
4. [SignResponse 스키마](#4-signresponse-스키마)
5. [서명 메시지 포맷](#5-서명-메시지-포맷)
6. [유니버셜 링크 URL 구조](#6-유니버셜-링크-url-구조)
7. [ntfy 채널 프로토콜](#7-ntfy-채널-프로토콜)
8. [Telegram 채널 프로토콜](#8-telegram-채널-프로토콜)
9. [요청 만료 + 재시도 정책](#9-요청-만료--재시도-정책)
10. [보안 모델](#10-보안-모델)
11. [에러 코드](#11-에러-코드)
12. [기술 결정 요약](#12-기술-결정-요약)

---

## 1. 개요

### 1.1 문서 목적

이 문서는 WAIaaS Signing Protocol v1의 모든 스키마, 전송 채널, 보안 모델을 확정한다. m26-01(@waiaas/wallet-sdk + 데몬 컴포넌트), m26-02(알림 채널), m26-03(Push Relay Server) 구현의 입력 사양으로 사용된다.

### 1.2 프로토콜 개요

WAIaaS Signing Protocol v1은 **세션 관리 없는 1회성 서명 프로토콜**이다.

AI 에이전트의 트랜잭션이 정책 엔진에 의해 `PENDING_APPROVAL` 상태가 되면, Owner의 지갑 앱으로 서명 요청(SignRequest)을 전달하고, Owner가 서명한 응답(SignResponse)을 받아 트랜잭션을 실행하는 단방향 요청-응답 플로우를 정의한다.

WalletConnect v2(v1.6.1)와 달리 세션 연결, 세션 만료 관리, 재연결이 불필요하며, 요청마다 독립적으로 동작한다.

```
AI 에이전트
  → 고액 트랜잭션 요청
    → 정책 평가 → PENDING_APPROVAL
      → WAIaaS 데몬: SignRequest 생성 + 유니버셜 링크 URL
        → 응답 채널(ntfy / Telegram)을 통해 Owner 지갑 앱에 전달
          → Owner: 지갑 앱에서 트랜잭션 확인 + 서명
            → SignResponse를 응답 채널로 반환
              → WAIaaS 데몬: 서명 검증(ownerAuth) + 트랜잭션 실행
```

### 1.3 적용 범위

이 프로토콜을 기반으로 다음 마일스톤이 설계/구현된다:

| 마일스톤 | 내용 | 관계 |
|----------|------|------|
| m26-01 | @waiaas/wallet-sdk + 데몬 서명 컴포넌트 | 프로토콜의 SDK/데몬 구현 |
| m26-02 | 지갑 앱 알림 채널 | 서명 채널과 일관된 토픽 구조 공유 |
| m26-03 | Push Relay Server | ntfy 토픽 → 기존 푸시 인프라 변환 |

### 1.4 응답 채널

Signing Protocol v1은 2가지 응답 채널을 지원한다:

#### 채널 A: ntfy 직접 푸시 (메신저 불필요)

```
WAIaaS ──(publish)──→ ntfy 토픽 ──(네이티브 푸시)──→ 지갑 앱
                                                        ↓
                                                    사용자 서명
                                                        ↓
WAIaaS ←──(subscribe)── ntfy 응답 토픽 ←──(publish)── 지갑 앱
```

Owner가 메신저를 설치할 필요 없이, 지갑 앱만으로 전체 플로우가 완성된다.

#### 채널 B: Telegram 메신저 중계

```
WAIaaS ──(Bot API)──→ Telegram ──→ Owner 폰 ──(유니버셜 링크)──→ 지갑 앱
                                                                    ↓
                                                                사용자 서명
                                                                    ↓
WAIaaS ←──(Long Polling)── Telegram ←──(공유 인텐트)── 지갑 앱
```

Owner가 이미 Telegram을 사용 중이면, 기존 메신저 인프라를 활용한다.

### 1.5 승인 채널 전체 구조

m26-01 완료 시 Owner는 5가지 승인 채널을 선택할 수 있다:

| 우선순위 | 채널 | 마일스톤 | 특징 |
|---------|------|---------|------|
| 1 | WAIaaS SDK + ntfy | m26-01 | 메신저 불필요, 지갑 앱만으로 동작 |
| 2 | WAIaaS SDK + Telegram | m26-01 | 메신저 중계, 파트너 지갑 전용 |
| 3 | WalletConnect | v1.6.1 | 세션 기반, 범용 지갑 |
| 4 | Telegram Bot `/approve` | v1.6 | chatId 기반, 텍스트 명령 |
| 5 | REST API 직접 호출 | v1.2 | 서명 수동 생성 |

ApprovalChannelRouter는 지갑별 `owner_approval_method` 설정에 따라 채널을 결정하며, 미설정 시 위 우선순위 순서로 fallback한다.

---

## 2. 설계 원칙

### 2.1 세션리스 (Stateless per Request)

WalletConnect v2는 세션 연결(QR 스캔), 세션 유지(7일 TTL + extend), 세션 만료 시 재연결이 필요하다. Signing Protocol v1은 요청마다 독립적으로 동작하며 세션 상태를 관리하지 않는다. requestId 기반 1회용 토픽으로 요청과 응답을 매칭한다.

| 비교 | WalletConnect v2 | Signing Protocol v1 |
|------|-------------------|---------------------|
| 세션 관리 | 필요 (7일 TTL + extend) | **불필요 (1회성)** |
| 초기 설정 | QR 스캔 → 세션 연결 | **설정 없음** |
| 오프라인 복구 | 세션 만료 시 QR 재스캔 | **항상 동작 (세션 없음)** |
| 외부 의존 | WC relay 서버 + Project ID | **ntfy 또는 Telegram** |

### 2.2 Self-Hosted 호환

WAIaaS는 self-hosted 로컬 데몬이다. Signing Protocol v1은 WAIaaS 도메인을 요구하지 않으며, 유니버셜 링크는 지갑 개발사의 도메인(예: `link.dcentwallet.com`)을 활용한다. ntfy 서버도 self-hosted로 운영 가능하다.

### 2.3 Zod SSoT

WAIaaS의 타입 시스템 원칙을 따른다. 모든 스키마는 Zod로 정의하고, TypeScript 타입은 `z.infer<>`로 derive한다. 파생 순서: Zod -> TypeScript types -> OpenAPI.

```typescript
// 정의
const SignRequestSchema = z.object({ ... });
// 파생
type SignRequest = z.infer<typeof SignRequestSchema>;
```

### 2.4 기존 인프라 재사용

새로운 인증/검증 로직을 만들지 않는다:

| 재사용 대상 | 원본 마일스톤 | 용도 |
|-------------|-------------|------|
| ownerAuth (Ed25519/SIWE) | v1.2 | SignResponse 서명 검증 |
| ntfy HTTP publish/subscribe | v1.3 | 서명 요청/응답 전달 채널 |
| Telegram Bot API + Long Polling | v1.6 | Telegram 서명 채널 |
| UUID v7 | v1.1 | requestId 생성 + 1회용 토픽 |

### 2.5 보안 기본

- **requestId 기반 1회용 토픽**: 응답 토픽 이름에 UUID v7 requestId를 포함하여 추측 불가. `waiaas-response-{requestId}` 형태
- **서명 검증**: ownerAuth(Ed25519/SIWE)로 SignResponse의 서명을 검증하여 위조 응답 방지
- **만료 정책**: 모든 요청에 `expiresAt`을 설정하여 오래된 요청이 처리되지 않도록 함 (기본 30분)
- **self-hosted ntfy**: ntfy 서버를 self-hosted로 운영하면 외부 노출 없이 로컬 네트워크에서만 통신 가능

---

## 3. SignRequest 스키마

### 3.1 Zod 스키마 정의

```typescript
import { z } from 'zod';

const NtfyResponseChannelSchema = z.object({
  type: z.literal('ntfy'),
  responseTopic: z.string(),               // 지갑이 서명 결과를 publish할 ntfy 토픽
  serverUrl: z.string().url().optional(),   // self-hosted ntfy URL (기본: https://ntfy.sh)
});

const TelegramResponseChannelSchema = z.object({
  type: z.literal('telegram'),
  botUsername: z.string(),                  // WAIaaS Telegram Bot username
});

const ResponseChannelSchema = z.discriminatedUnion('type', [
  NtfyResponseChannelSchema,
  TelegramResponseChannelSchema,
]);

const SignRequestMetadataSchema = z.object({
  txId: z.string().uuid(),
  type: z.string(),                         // TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | APPROVE | BATCH
  from: z.string(),
  to: z.string(),
  amount: z.string().optional(),
  symbol: z.string().optional(),
  policyTier: z.enum(['APPROVAL', 'DELAY']),
});

const SignRequestSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  chain: z.enum(['solana', 'evm']),
  network: z.string(),                      // "ethereum-mainnet", "devnet" 등
  message: z.string(),                      // 서명할 메시지 (hex 또는 base64)
  displayMessage: z.string(),               // 사람이 읽을 수 있는 요약
  metadata: SignRequestMetadataSchema,
  responseChannel: ResponseChannelSchema,
  expiresAt: z.string().datetime(),
});

type SignRequest = z.infer<typeof SignRequestSchema>;
```

### 3.2 필드 상세

| 필드 | 타입 | 필수 | 설명 | 제약 조건 |
|------|------|------|------|-----------|
| `version` | `z.literal('1')` | O | 프로토콜 버전 | 현재 `'1'`만 허용. 향후 호환성 분기에 사용 |
| `requestId` | `z.string().uuid()` | O | 요청 고유 ID | UUID v7. 응답 매칭 + ntfy 응답 토픽 이름에 사용 |
| `chain` | `z.enum(['solana', 'evm'])` | O | 블록체인 종류 | 서명 방식 결정에 사용 (EIP-191 vs Ed25519) |
| `network` | `z.string()` | O | 네트워크 식별자 | `resolveNetwork()` 출력과 동일. 예: `"ethereum-mainnet"`, `"devnet"`, `"polygon-mainnet"` |
| `message` | `z.string()` | O | 서명할 메시지 | Section 5의 포맷으로 생성. EVM: hex 인코딩, Solana: base64 인코딩 |
| `displayMessage` | `z.string()` | O | UI 표시용 요약 | 지갑 앱에서 사용자에게 보여줄 사람 읽기용 텍스트 |
| `metadata` | `object` | O | 트랜잭션 메타데이터 | 아래 metadata 상세 참조 |
| `responseChannel` | `discriminatedUnion` | O | 응답 채널 정보 | ntfy 또는 telegram. 아래 responseChannel 상세 참조 |
| `expiresAt` | `z.string().datetime()` | O | 요청 만료 시각 | ISO 8601 형식. 기본 30분 후. 만료된 요청의 응답은 거부됨 |

### 3.3 metadata 필드 상세

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `txId` | `z.string().uuid()` | O | WAIaaS 내부 트랜잭션 ID (UUID v7) |
| `type` | `z.string()` | O | 5-type discriminatedUnion: `TRANSFER`, `TOKEN_TRANSFER`, `CONTRACT_CALL`, `APPROVE`, `BATCH` |
| `from` | `z.string()` | O | 송신 지갑 주소 |
| `to` | `z.string()` | O | 수신 주소 |
| `amount` | `z.string().optional()` | X | 전송 금액 (사람 읽기용). TOKEN_TRANSFER, TRANSFER 시 포함 |
| `symbol` | `z.string().optional()` | X | 토큰 심볼 (예: `"ETH"`, `"SOL"`, `"USDC"`). amount와 함께 포함 |
| `policyTier` | `z.enum(['APPROVAL', 'DELAY'])` | O | 정책 티어. `APPROVAL`: 즉시 승인 필요, `DELAY`: 시간 지연 후 자동 실행(Owner가 거부 가능) |

### 3.4 responseChannel 서브타입 상세

#### ntfy 채널

```typescript
{
  type: 'ntfy',
  responseTopic: 'waiaas-response-01935a3b-7c8d-7e00-b123-456789abcdef',
  serverUrl: 'https://ntfy.example.com'  // optional, 기본: https://ntfy.sh
}
```

| 필드 | 설명 |
|------|------|
| `responseTopic` | 지갑이 SignResponse를 publish할 ntfy 토픽. `waiaas-response-{requestId}` 패턴. requestId 기반이므로 추측 불가 |
| `serverUrl` | self-hosted ntfy 서버 URL. 생략 시 `https://ntfy.sh` 사용 |

#### Telegram 채널

```typescript
{
  type: 'telegram',
  botUsername: 'waiaas_bot'
}
```

| 필드 | 설명 |
|------|------|
| `botUsername` | WAIaaS Telegram Bot의 username. 지갑 앱이 공유 인텐트로 응답을 전송할 대상 |

### 3.5 base64url 인코딩 시 크기 분석

SignRequest JSON을 base64url 인코딩하여 유니버셜 링크 URL 쿼리 파라미터에 포함한다.

| 항목 | 예상 크기 |
|------|----------|
| SignRequest JSON (일반 TRANSFER) | ~500 바이트 |
| SignRequest JSON (CONTRACT_CALL, metadata 풍부) | ~800 바이트 |
| base64url 인코딩 (4/3 비율) | JSON 크기 x 1.37 |
| base64url 결과 (일반) | ~700자 |
| base64url 결과 (최대) | ~1,100자 |
| 전체 URL (base URL + path + `?data=`) | ~800-1,200자 |

**결론**: 일반적인 SignRequest는 전체 URL이 **2KB 이내**로 유지되므로 대부분의 브라우저/앱/메신저에서 안전하게 처리 가능하다. 2KB 초과 시 fallback 전략은 Section 6.6 참조.

---

## 4. SignResponse 스키마

### 4.1 Zod 스키마 정의

```typescript
import { z } from 'zod';

const SignResponseSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  signature: z.string().optional(),         // approve 시 필수, reject 시 optional
  signerAddress: z.string(),
  signedAt: z.string().datetime(),
});

type SignResponse = z.infer<typeof SignResponseSchema>;
```

### 4.2 필드 상세

| 필드 | 타입 | 필수 | 설명 | 제약 조건 |
|------|------|------|------|-----------|
| `version` | `z.literal('1')` | O | 프로토콜 버전 | SignRequest의 version과 일치해야 함 |
| `requestId` | `z.string().uuid()` | O | 요청 ID | SignRequest의 requestId와 일치해야 함. 불일치 시 `SIGN_REQUEST_NOT_FOUND` 에러 |
| `action` | `z.enum(['approve', 'reject'])` | O | 승인/거부 | `approve`: 트랜잭션 실행 진행, `reject`: 트랜잭션 취소 |
| `signature` | `z.string().optional()` | 조건부 | 서명값 | `action='approve'`일 때 **필수**. Section 5의 메시지를 서명한 결과. EVM: hex 인코딩(0x 접두어), Solana: base64 인코딩 |
| `signerAddress` | `z.string()` | O | 서명자 주소 | Owner의 등록된 주소와 일치해야 함. 불일치 시 `INVALID_SIGNER` 에러 |
| `signedAt` | `z.string().datetime()` | O | 서명 시각 | ISO 8601 형식. 서명 시점 기록용 |

### 4.3 action별 검증 규칙

#### action = 'approve'

1. `signature` 필드가 **반드시** 존재해야 함 (없으면 `MISSING_SIGNATURE` 에러)
2. `signerAddress`가 해당 지갑의 Owner 등록 주소와 일치하는지 확인
3. 서명 검증 (ownerAuth 재사용):
   - **EVM**: `ethers.verifyMessage(message, signature)` 또는 `viem.verifyMessage()`로 복구한 주소가 `signerAddress`와 일치
   - **Solana**: `nacl.sign.detached.verify(message, signature, publicKey)`로 서명 유효성 확인
4. SignRequest의 `expiresAt` 이전인지 확인 (만료 시 `SIGN_REQUEST_EXPIRED` 에러)
5. 검증 성공 → 트랜잭션 상태를 `EXECUTING`으로 전환 + 실행

#### action = 'reject'

1. `signature`는 optional (거부 시 서명 불필요할 수 있음. 단, 서명이 있으면 검증하여 Owner 본인 확인)
2. `signerAddress`가 Owner 주소와 일치하는지 확인
3. 검증 성공 → 트랜잭션 상태를 `CANCELLED`로 전환

### 4.4 signerAddress 검증

`signerAddress`는 Owner 등록 시 설정된 주소와 일치해야 한다. 검증 로직은 기존 ownerAuth를 재사용한다:

| 체인 | Owner 등록 | 서명 검증 | 마일스톤 |
|------|-----------|----------|---------|
| EVM | SIWE (Sign-In with Ethereum) | EIP-191 personal_sign 서명 복구 → 주소 비교 | v1.4.1 |
| Solana | SIWS (Sign-In with Solana) | Ed25519 detached verify → 공개키 비교 | v1.2 |

---

## 5. 서명 메시지 포맷

### 5.1 텍스트 템플릿

SignRequest의 `message` 필드에 포함되는 서명 대상 메시지의 텍스트 템플릿:

```
WAIaaS Transaction Approval

Transaction: {txId}
Type: {type}
From: {fromAddress}
To: {toAddress}
Amount: {amount} {symbol}
Network: {network}
Policy Tier: {policyTier}

Approve this transaction by signing this message.
Timestamp: {ISO 8601}
Nonce: {nonce}
```

#### 필드 설명

| 플레이스홀더 | 소스 | 예시 |
|-------------|------|------|
| `{txId}` | `metadata.txId` | `01935a3b-7c8d-7e00-b123-456789abcdef` |
| `{type}` | `metadata.type` | `TRANSFER`, `TOKEN_TRANSFER`, `CONTRACT_CALL`, `APPROVE`, `BATCH` |
| `{fromAddress}` | `metadata.from` | `0x1234...5678` 또는 `7xKXtg2C...` |
| `{toAddress}` | `metadata.to` | `0xabcd...ef01` |
| `{amount} {symbol}` | `metadata.amount` + `metadata.symbol` | `1.5 ETH`, `100 USDC`. amount/symbol이 없으면 이 줄 생략 |
| `{network}` | `network` | `ethereum-mainnet`, `devnet` |
| `{policyTier}` | `metadata.policyTier` | `APPROVAL`, `DELAY` |
| `{ISO 8601}` | 요청 생성 시각 | `2026-02-19T14:30:00Z` |
| `{nonce}` | `requestId` 재사용 | `01935a3b-7c8d-7e00-b123-456789abcdef` |

#### 예시 (TRANSFER)

```
WAIaaS Transaction Approval

Transaction: 01935a3b-7c8d-7e00-b123-456789abcdef
Type: TRANSFER
From: 0x1234567890abcdef1234567890abcdef12345678
To: 0xabcdef0123456789abcdef0123456789abcdef01
Amount: 1.5 ETH
Network: ethereum-mainnet
Policy Tier: APPROVAL

Approve this transaction by signing this message.
Timestamp: 2026-02-19T14:30:00Z
Nonce: 01935a3b-7c8d-7e00-b123-456789abcdef
```

#### 예시 (CONTRACT_CALL, amount 없음)

```
WAIaaS Transaction Approval

Transaction: 01935a3b-8888-7e00-aaaa-bbbbccccdddd
Type: CONTRACT_CALL
From: 0x1234567890abcdef1234567890abcdef12345678
To: 0xContractAddress...
Network: polygon-mainnet
Policy Tier: APPROVAL

Approve this transaction by signing this message.
Timestamp: 2026-02-19T15:00:00Z
Nonce: 01935a3b-8888-7e00-aaaa-bbbbccccdddd
```

### 5.2 Nonce 생성 규칙

Nonce는 별도 생성하지 않고 `requestId` (UUID v7)를 재사용한다.

- UUID v7은 시간 기반으로 정렬 가능하며 충돌 확률이 극히 낮음
- requestId와 nonce가 동일하므로 메시지 위조 시 requestId도 알아야 함
- 응답 토픽(`waiaas-response-{requestId}`)과 함께 1회성 보장

### 5.3 EVM 체인: EIP-191 서명

EVM 체인에서는 [EIP-191](https://eips.ethereum.org/EIPS/eip-191) `personal_sign` 방식을 사용한다.

#### 서명 과정 (지갑 앱 측)

```typescript
// 1. 메시지 텍스트를 UTF-8 바이트 배열로 변환
const messageBytes = new TextEncoder().encode(messageText);

// 2. EIP-191 접두어 추가 (ethers/viem이 자동 처리)
// "\x19Ethereum Signed Message:\n{length}{message}"
// ethers: wallet.signMessage(messageText)
// viem: walletClient.signMessage({ message: messageText })

// 3. 서명 결과: hex 인코딩 (0x 접두어)
const signature = await wallet.signMessage(messageText);
// "0x1234...abcd" (65 bytes: r(32) + s(32) + v(1))
```

#### 검증 과정 (WAIaaS 데몬 측)

```typescript
// viem의 verifyMessage로 서명자 주소 복구
import { verifyMessage } from 'viem';

const isValid = await verifyMessage({
  address: signerAddress,   // SignResponse.signerAddress
  message: messageText,     // SignRequest.message (원문 텍스트)
  signature: signature,     // SignResponse.signature (0x hex)
});
```

#### 인코딩

| 항목 | 인코딩 |
|------|--------|
| SignRequest.message | UTF-8 원문 텍스트 (hex 인코딩하지 않음) |
| SignResponse.signature | hex 인코딩, `0x` 접두어 포함 (65 bytes) |

### 5.4 Solana 체인: Ed25519 서명

Solana 체인에서는 Ed25519 메시지 서명을 사용한다.

#### 서명 과정 (지갑 앱 측)

```typescript
// 1. 메시지 텍스트를 UTF-8 바이트 배열로 변환
const messageBytes = new TextEncoder().encode(messageText);

// 2. Ed25519 서명 (nacl.sign.detached 또는 @solana/kit)
const signature = nacl.sign.detached(messageBytes, secretKey);

// 3. 서명 결과: base64 인코딩
const signatureBase64 = Buffer.from(signature).toString('base64');
// "abc123..." (64 bytes Ed25519 서명)
```

#### 검증 과정 (WAIaaS 데몬 측)

```typescript
import nacl from 'tweetnacl';

// base64 → Uint8Array
const signatureBytes = Buffer.from(signature, 'base64');
const messageBytes = new TextEncoder().encode(messageText);
const publicKeyBytes = bs58.decode(signerAddress);

const isValid = nacl.sign.detached.verify(
  messageBytes,
  signatureBytes,
  publicKeyBytes,
);
```

#### 인코딩

| 항목 | 인코딩 |
|------|--------|
| SignRequest.message | UTF-8 원문 텍스트 (base64 인코딩하지 않음) |
| SignResponse.signature | base64 인코딩 (64 bytes Ed25519 서명) |

### 5.5 인코딩 요약

| 체인 | message 필드 | signature 필드 | 서명 방식 |
|------|-------------|---------------|----------|
| EVM | UTF-8 텍스트 | hex (`0x` 접두어, 65 bytes) | EIP-191 personal_sign |
| Solana | UTF-8 텍스트 | base64 (64 bytes) | Ed25519 detached sign |

> **설계 결정**: `message` 필드에 원문 텍스트를 저장하고 인코딩은 서명/검증 시 각 체인 라이브러리가 처리한다. 이렇게 하면 `displayMessage`와 `message`가 동일한 텍스트 기반이 되어 가독성과 검증 가능성을 모두 확보한다.

---

## 6. 유니버셜 링크 URL 구조

### 6.1 URL 패턴

```
https://{wallet.universalLink.base}{wallet.universalLink.signPath}?data={base64url(JSON.stringify(SignRequest))}
```

- **base**: 지갑 개발사의 유니버셜 링크 도메인 (예: `link.dcentwallet.com`)
- **signPath**: WAIaaS 서명 전용 경로 (예: `/waiaas/sign`)
- **data**: SignRequest JSON을 base64url 인코딩한 값

### 6.2 구체 예시

#### D'CENT 지갑 예시

```
https://link.dcentwallet.com/waiaas/sign?data=eyJ2ZXJzaW9uIjoiMSIsInJlcXVlc3RJZCI6IjAxOTM1YTNiLTdjOGQtN2UwMC1iMTIzLTQ1Njc4OWFiY2RlZiIsImNoYWluIjoiZXZtIiwibmV0d29yayI6ImV0aGVyZXVtLW1haW5uZXQiLCJtZXNzYWdlIjoiV0FJYWFTIFRyYW5zYWN0aW9uLi4uIiwiZGlzcGxheU1lc3NhZ2UiOiJUbzogMHg1Njc4Li4uXG5BbW91bnQ6IDEuNSBFVEgiLCJtZXRhZGF0YSI6eyJ0eElkIjoiMDE5MzVhM2ItN2M4ZC03ZTAwLWIxMjMtNDU2Nzg5YWJjZGVmIiwidHlwZSI6IlRSQU5TRkVSIiwiZnJvbSI6IjB4MTIzNC4uLiIsInRvIjoiMHg1Njc4Li4uIiwiYW1vdW50IjoiMS41Iiwic3ltYm9sIjoiRVRIIiwicG9saWN5VGllciI6IkFQUFJPVkFMIn0sInJlc3BvbnNlQ2hhbm5lbCI6eyJ0eXBlIjoibnRmeSIsInJlc3BvbnNlVG9waWMiOiJ3YWlhYXMtcmVzcG9uc2UtMDE5MzVhM2ItN2M4ZC03ZTAwLWIxMjMtNDU2Nzg5YWJjZGVmIn0sImV4cGlyZXNBdCI6IjIwMjYtMDItMTlUMTU6MDA6MDBaIn0
```

### 6.3 플랫폼별 동작

| 상황 | 동작 | 설명 |
|------|------|------|
| 모바일 + 앱 설치됨 | 앱 바로 열림 (유니버셜 링크) | iOS: AASA 매칭으로 앱 실행. Android: assetlinks.json 매칭으로 앱 실행 |
| 모바일 + 앱 미설치 | 웹페이지 이동 (설치 안내) | `link.dcentwallet.com/waiaas/sign` 웹페이지에서 앱 설치 안내 + 스토어 링크 |
| PC 메신저에서 클릭 | 웹페이지 이동 (QR 코드) | 웹페이지에 QR 코드를 표시하여 모바일에서 스캔 → 앱 열림 |

### 6.4 Apple App Site Association (AASA) 설정 가이드

지갑 개발사는 자사 유니버셜 링크 도메인의 AASA 파일에 WAIaaS 경로를 추가해야 한다.

**파일 위치**: `https://{domain}/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "{TeamID}.{BundleID}",
        "paths": [
          "/waiaas/*"
        ]
      }
    ]
  }
}
```

#### D'CENT 예시

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM123456.com.iotrust.dcent",
        "paths": [
          "/existing-path/*",
          "/waiaas/*"
        ]
      }
    ]
  }
}
```

**핵심**: 기존 paths 배열에 `"/waiaas/*"` 한 줄만 추가하면 된다. 나머지 기존 설정은 변경 불필요.

### 6.5 Android assetlinks.json 설정 가이드

**파일 위치**: `https://{domain}/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "{패키지명}",
      "sha256_cert_fingerprints": ["{인증서 지문}"]
    }
  }
]
```

#### D'CENT 예시

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.iotrust.dcent",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:..."
      ]
    }
  }
]
```

Android App Links는 도메인 전체에 대해 설정되므로, 기존 assetlinks.json이 올바르게 설정되어 있다면 `/waiaas/*` 경로도 자동으로 앱에서 처리된다. 별도 경로 설정이 필요하지 않다 (앱의 AndroidManifest.xml에서 intent-filter를 추가하여 `/waiaas/sign` 경로를 핸들링).

**AndroidManifest.xml (지갑 앱 측)**:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https"
        android:host="link.dcentwallet.com"
        android:pathPrefix="/waiaas" />
</intent-filter>
```

### 6.6 딥링크 Fallback

유니버셜 링크가 동작하지 않는 환경(일부 앱 내 WebView 등)을 위해 커스텀 딥링크를 fallback으로 제공한다.

```
{scheme}://{deepLink.signPath}?data={base64url(SignRequest)}
```

#### D'CENT 예시

```
dcent:///waiaas-sign?data=eyJ2ZXJzaW9uIjoiMSIs...
```

WalletLinkConfig에 `deepLink` 설정이 있는 경우, SDK는 유니버셜 링크 실패 시 딥링크를 시도한다.

### 6.7 URL 길이 제한 대응

#### 일반적인 경우 (2KB 이내)

| 항목 | 크기 |
|------|------|
| SignRequest JSON (일반) | ~500-800 바이트 |
| base64url 인코딩 | ~700-1,100자 |
| base URL + path + `?data=` | ~60-80자 |
| **전체 URL** | **~800-1,200자** |

대부분의 브라우저와 앱에서 URL 길이 제한은 2,048자 이상이므로, 일반적인 SignRequest는 문제없이 전달된다.

#### 2KB 초과 시 Fallback 전략

극히 드문 경우(매우 긴 contract call data 등) SignRequest가 커져 URL이 2KB를 초과할 수 있다. 이 경우:

1. **URL에는 requestId만 포함**: `https://link.dcentwallet.com/waiaas/sign?requestId={requestId}&channel=ntfy&server={serverUrl}`
2. **전체 SignRequest 데이터는 ntfy 토픽에서 조회**: 지갑 앱은 `waiaas-sign-{walletId}` 토픽에서 해당 requestId의 메시지를 조회
3. SDK의 `parseSignRequest(url)` 함수가 자동으로 두 가지 형태를 감지하여 처리

```typescript
// SDK 내부 로직 (의사코드)
function parseSignRequest(url: string): SignRequest {
  const params = new URL(url).searchParams;

  // Case 1: data 파라미터에 전체 SignRequest 포함
  if (params.has('data')) {
    const json = base64url.decode(params.get('data')!);
    return SignRequestSchema.parse(JSON.parse(json));
  }

  // Case 2: requestId만 포함 → ntfy에서 조회
  if (params.has('requestId')) {
    const requestId = params.get('requestId')!;
    const channel = params.get('channel') || 'ntfy';
    const serverUrl = params.get('server') || 'https://ntfy.sh';
    // ntfy 토픽에서 SignRequest 조회
    return await fetchSignRequestFromNtfy(requestId, serverUrl);
  }

  throw new Error('Invalid sign request URL');
}
```

---

## 7. ntfy 채널 프로토콜

### 7.1 토픽 네이밍 규칙

| 토픽 | 패턴 | 용도 | 생명주기 |
|------|------|------|---------|
| 요청 토픽 | `waiaas-sign-{walletId}` | 데몬이 서명 요청을 publish, 지갑 앱이 subscribe | 지갑 존재 기간 동안 유지 (장기) |
| 응답 토픽 | `waiaas-response-{requestId}` | 지갑 앱이 서명 응답을 publish, 데몬이 subscribe | 요청별 1회용 (단기) |

- **walletId**: 지갑 UUID (DB PK). UUID v7 형식이므로 122비트 엔트로피. 예: `01935a3b-7c8d-7e00-b123-456789abcdef`
- **requestId**: 요청별 UUID v7. 1회용이며 추측 불가. 응답 토픽 이름에 포함되어 토픽 자체가 인증 역할

토픽 접두어는 SettingsService에서 변경 가능:
- `signing_sdk.ntfy_request_topic_prefix` (기본: `waiaas-sign`)
- `signing_sdk.ntfy_response_topic_prefix` (기본: `waiaas-response`)

### 7.2 요청 publish 프로토콜

데몬이 PENDING_APPROVAL 트랜잭션에 대해 ntfy 요청 토픽에 서명 요청을 전송한다.

**HTTP 요청:**

```http
POST https://{ntfy_server}/{requestTopic}
Content-Type: application/json
Title: WAIaaS Sign Request
Priority: 5
Tags: waiaas,sign
Actions: view, 지갑에서 승인하기, {universalLinkUrl}
```

**Body (JSON):**

```json
{
  "topic": "waiaas-sign-{walletId}",
  "message": "{displayMessage}",
  "title": "WAIaaS Sign Request",
  "priority": 5,
  "tags": ["waiaas", "sign"],
  "actions": [
    {
      "action": "view",
      "label": "지갑에서 승인하기",
      "url": "https://link.dcentwallet.com/waiaas/sign?data={base64url(SignRequest)}"
    }
  ],
  "attach": null,
  "click": "https://link.dcentwallet.com/waiaas/sign?data={base64url(SignRequest)}"
}
```

**주요 필드 설명:**

| 필드 | 값 | 설명 |
|------|-----|------|
| `topic` | `waiaas-sign-{walletId}` | 지갑별 요청 토픽 |
| `priority` | `5` (urgent) | 즉시 알림. 진동/소리 활성화 |
| `actions[0].url` | 유니버셜 링크 URL | 모바일 알림에서 탭 시 지갑 앱 열림 |
| `click` | 유니버셜 링크 URL | ntfy 알림 자체를 탭할 때도 지갑 앱으로 이동 |

### 7.3 응답 subscribe 프로토콜

데몬이 SignRequest를 publish한 직후, 해당 요청의 응답 토픽을 SSE로 구독하여 SignResponse를 기다린다.

**SSE 구독 시작:**

```http
GET https://{ntfy_server}/{responseTopic}/sse
```

- `{responseTopic}`: `waiaas-response-{requestId}`
- 구독 시작 시점: SignRequest publish 직후 (거의 동시)

**구독 종료 조건:**

| 조건 | 동작 |
|------|------|
| SignResponse 수신 | 응답 파싱 + 검증 → 토픽 구독 종료 |
| expiresAt 도달 | 타임아웃 → SIGN_REQUEST_EXPIRED 처리 → 구독 종료 |
| 네트워크 에러 | 재연결 시도 (최대 3회, 5초 간격) → 실패 시 구독 종료 |

**SSE 메시지 수신 처리:**

```typescript
// 1. SSE 이벤트에서 data 필드 추출
const sseData = event.data;

// 2. ntfy JSON 메시지에서 message 필드 추출
const ntfyMessage = JSON.parse(sseData);

// 3. base64url 디코딩
const json = base64url.decode(ntfyMessage.message);

// 4. JSON 파싱
const parsed = JSON.parse(json);

// 5. Zod 검증
const signResponse = SignResponseSchema.parse(parsed);

// 6. requestId 매칭 확인
if (signResponse.requestId !== expectedRequestId) {
  throw new Error('SIGN_REQUEST_NOT_FOUND');
}
```

### 7.4 응답 publish (지갑 앱 측)

지갑 앱이 Owner 서명을 완료한 후, ntfy 응답 토픽에 SignResponse를 publish한다.

**HTTP 요청:**

```http
POST https://{ntfy_server}/{responseTopic}
Content-Type: text/plain
```

**Body:**

```
{base64url(JSON.stringify(SignResponse))}
```

- 응답 토픽: `waiaas-response-{requestId}` (SignRequest의 `responseChannel.responseTopic` 필드에서 획득)
- ntfy 서버 URL: SignRequest의 `responseChannel.serverUrl` 필드 (생략 시 `https://ntfy.sh`)
- **1회 publish 후 토픽 사용 종료** — 동일 토픽에 다시 publish하지 않음

**SDK 코드 (지갑 앱 측):**

```typescript
// @waiaas/wallet-sdk
async function sendViaNtfy(
  response: SignResponse,
  responseTopic: string,
  serverUrl: string = 'https://ntfy.sh'
): Promise<void> {
  const encoded = base64url.encode(JSON.stringify(response));

  await fetch(`${serverUrl}/${responseTopic}`, {
    method: 'POST',
    body: encoded,
  });
}
```

### 7.5 E2E 시퀀스 다이어그램

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ AI Agent │     │  WAIaaS  │     │   ntfy   │     │ 지갑 앱   │
│          │     │  데몬    │     │  서버    │     │(SDK내장) │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 1. 고액 TX     │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ 2. 정책 평가    │                │
     │                │  → PENDING_APPROVAL             │
     │                │                │                │
     │                │ 3. POST /waiaas-sign-{walletId} │
     │                │  SignRequest JSON               │
     │                │  + 유니버셜 링크 액션 버튼       │
     │                │───────────────>│                │
     │                │                │                │
     │                │ 4. GET /waiaas-response-{requestId}/sse
     │                │  (SSE 구독 시작)│                │
     │                │───────────────>│                │
     │                │                │                │
     │                │                │ 5. 푸시 알림    │
     │                │                │───────────────>│
     │                │                │                │
     │                │                │    6. Owner 확인│
     │                │                │    서명 생성    │
     │                │                │                │
     │                │                │ 7. POST /waiaas-response-{requestId}
     │                │                │  base64url(SignResponse)
     │                │                │<───────────────│
     │                │                │                │
     │                │ 8. SSE 이벤트  │                │
     │                │  SignResponse 수신              │
     │                │<───────────────│                │
     │                │                │                │
     │                │ 9. 서명 검증 (ownerAuth)         │
     │                │  → 트랜잭션 실행                 │
     │                │                │                │
     │ 10. TX 완료    │                │                │
     │<───────────────│                │                │
     │                │                │                │
```

**단계별 상세:**

| 단계 | 주체 | 동작 | HTTP 상세 |
|------|------|------|-----------|
| 1 | AI Agent | 고액 트랜잭션 요청 | POST /v1/transactions |
| 2 | 데몬 | 정책 평가 → PENDING_APPROVAL | 내부 Pipeline Stage 4 |
| 3 | 데몬 | ntfy 요청 토픽에 publish | POST ntfy.sh/waiaas-sign-{walletId} (JSON, Priority:5) |
| 4 | 데몬 | ntfy 응답 토픽 SSE 구독 시작 | GET ntfy.sh/waiaas-response-{requestId}/sse |
| 5 | ntfy | 지갑 앱으로 네이티브 푸시 전송 | ntfy 서버 → FCM/APNs → 지갑 앱 |
| 6 | Owner | 트랜잭션 내용 확인 + 서명 | 지갑 앱 UI |
| 7 | 지갑 앱 | 응답 토픽에 SignResponse publish | POST ntfy.sh/waiaas-response-{requestId} (base64url body) |
| 8 | 데몬 | SSE 이벤트로 SignResponse 수신 | SSE data 이벤트 파싱 |
| 9 | 데몬 | 서명 검증 + 트랜잭션 실행 | ownerAuth(EIP-191/Ed25519) → EXECUTING → CONFIRMED |
| 10 | 데몬 | AI Agent에 결과 반환 | 트랜잭션 상태 CONFIRMED |

### 7.6 self-hosted ntfy 지원

WAIaaS는 self-hosted 데몬이므로 ntfy 서버도 self-hosted로 운영할 수 있다.

**ntfy 서버 URL 결정 순서:**

1. SignRequest의 `responseChannel.serverUrl` 필드 (요청별 지정)
2. 데몬의 기존 `[notifications] ntfy_server` 설정 (전역 설정, SettingsService)
3. 기본값: `https://ntfy.sh` (공개 서버)

**self-hosted ntfy의 장점:**

| 항목 | 공개 ntfy.sh | self-hosted ntfy |
|------|-------------|-----------------|
| 설정 | 없음 | Docker/바이너리 설치 필요 |
| 네트워크 | 인터넷 경유 | 로컬 네트워크 가능 |
| 토픽 보안 | 공개 (누구나 구독 가능) | 인증 설정 가능 (Authorization 헤더) |
| 데이터 노출 | ntfy.sh 서버에 메시지 경유 | 자체 서버에서만 처리 |
| 가용성 | ntfy.sh 서비스 의존 | 자체 관리 |

**설정 예시:**

```toml
# config.toml — 기존 알림 설정과 공유
[notifications]
ntfy_server = "https://ntfy.example.com"
```

> **참고**: 서명 채널과 알림 채널은 동일한 ntfy 서버를 공유하지만, 토픽은 완전히 분리된다. 알림 토픽(`waiaas-notify-*`)과 서명 토픽(`waiaas-sign-*`, `waiaas-response-*`)은 접두어로 구분된다.

---

## 8. Telegram 채널 프로토콜

### 8.1 요청 전송 (Bot API)

PENDING_APPROVAL 트랜잭션에 대해 Telegram Bot API를 통해 Owner의 chatId로 서명 요청 메시지를 전송한다.

**Bot API 호출:**

```http
POST https://api.telegram.org/bot{token}/sendMessage
Content-Type: application/json
```

**Body:**

```json
{
  "chat_id": "{ownerChatId}",
  "text": "🔐 WAIaaS 트랜잭션 승인 요청\n\nTo: {to}\nAmount: {amount} {symbol}\nType: {type}\nNetwork: {network}\n\n만료: {expiresAt}",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "지갑에서 승인하기",
          "url": "https://link.dcentwallet.com/waiaas/sign?data={base64url(SignRequest)}"
        }
      ]
    ]
  }
}
```

**주요 필드:**

| 필드 | 설명 |
|------|------|
| `chat_id` | Owner의 Telegram chat ID (기존 v1.6 알림 설정에서 획득) |
| `text` | 트랜잭션 요약 정보. 사람이 읽을 수 있는 형식 |
| `reply_markup.inline_keyboard` | 인라인 버튼 1개: "지갑에서 승인하기" + 유니버셜 링크 URL |

**유니버셜 링크 URL**은 Section 6의 구조를 따른다:
```
https://{wallet.universalLink.base}{wallet.universalLink.signPath}?data={base64url(SignRequest)}
```

### 8.2 모바일 시나리오

Owner가 모바일 Telegram 앱에서 서명 요청 알림을 수신하는 플로우:

```
1. Telegram 푸시 알림 수신
   → Owner가 알림 탭

2. Telegram 앱에서 메시지 확인
   → 트랜잭션 요약 + [지갑에서 승인하기] 인라인 버튼

3. [지갑에서 승인하기] 탭
   → 유니버셜 링크 → 지갑 앱 열림 (앱 설치 시)
   → 또는 웹페이지 이동 (앱 미설치 시 → 설치 안내)

4. 지갑 앱에서 SignRequest 파싱 → 서명 UI 표시
   → Owner가 트랜잭션 내용 확인
   → 승인(서명 생성) 또는 거부

5. 응답 전송: Telegram 공유 인텐트
   → WAIaaS Bot 채팅으로 /sign_response {base64url(SignResponse)} 전송
   → Owner는 Telegram으로 전환 후 [보내기] 1탭
```

**핵심 UX**: Owner 액션은 총 3탭 — (1) Telegram 알림 탭, (2) 지갑 앱에서 승인/거부, (3) Telegram [보내기] 탭.

### 8.3 PC 시나리오

Owner가 PC Telegram 데스크탑 앱에서 서명 요청을 수신하는 플로우:

```
1. PC Telegram 데스크탑에서 메시지 확인
   → [지갑에서 승인하기] 인라인 버튼 클릭

2. 기본 브라우저에서 웹페이지 열림
   → URL: https://link.dcentwallet.com/waiaas/sign?data={base64url(SignRequest)}
   → 웹페이지 내용:
     - SignRequest 정보 표시 (트랜잭션 요약)
     - QR 코드 생성 (QR 내용 = 동일 유니버셜 링크 URL)

3. Owner가 모바일로 QR 코드 스캔
   → 카메라 앱 또는 QR 스캐너 사용
   → 유니버셜 링크 인식 → 지갑 앱 열림

4. 지갑 앱에서 서명 (모바일 시나리오 4단계와 동일)
   → SignRequest 파싱 → 서명 UI → 승인/거부

5. 응답 전송 (모바일 시나리오 5단계와 동일)
   → Telegram 공유 인텐트 → /sign_response 전송
```

**PC 시나리오 핵심**: 지갑 앱은 모바일에서만 동작하므로, PC에서는 QR 코드를 통해 모바일로 브릿지한다. QR 코드의 내용은 동일한 유니버셜 링크 URL이므로 모바일에서 스캔 시 지갑 앱이 바로 열린다.

> **참고**: 이 웹페이지는 지갑 개발사(D'CENT 등)가 제공한다. WAIaaS는 웹페이지를 호스팅하지 않는다 (self-hosted 철학 유지).

### 8.4 응답 수신 (Bot Long Polling)

기존 Telegram Bot의 Long Polling 핸들러에 `/sign_response` 명령어를 추가하여 서명 응답을 수신한다.

**명령어 형식:**

```
/sign_response {base64url(JSON.stringify(SignResponse))}
```

**파싱 프로세스:**

```typescript
// 1. 메시지에서 명령어와 데이터 분리
const match = message.text.match(/^\/sign_response\s+(.+)$/);
if (!match) return; // 무시

const base64urlData = match[1];

// 2. base64url 디코딩
const json = base64url.decode(base64urlData);

// 3. JSON 파싱
const parsed = JSON.parse(json);

// 4. Zod 검증
const signResponse = SignResponseSchema.parse(parsed);

// 5. chatId로 Owner 식별
const owner = await findOwnerByChatId(message.chat.id);
if (!owner) throw new Error('UNKNOWN_CHAT_ID');

// 6. signerAddress로 이중 확인
if (signResponse.signerAddress !== owner.address) {
  throw new Error('SIGNER_ADDRESS_MISMATCH');
}

// 7. SignResponseHandler로 전달
await signResponseHandler.handle(signResponse);
```

**이중 확인:**

| 확인 단계 | 방법 | 설명 |
|----------|------|------|
| 1차: chatId | `message.chat.id` → Owner 조회 | Telegram 메시지 발신자가 등록된 Owner인지 확인 |
| 2차: signerAddress | SignResponse.signerAddress === owner.address | 서명자 주소가 Owner 등록 주소와 일치하는지 확인 |
| 3차: 서명 검증 | ownerAuth (EIP-191/Ed25519) | 서명이 실제로 해당 주소의 개인키로 생성되었는지 검증 |

### 8.5 Telegram 공유 인텐트 URL 구조

지갑 앱이 서명 완료 후 Telegram Bot으로 응답을 전송하기 위한 플랫폼별 URL:

**Android (Telegram 딥링크):**

```
tg://msg?text=/sign_response {base64url(SignResponse)}&to={botUsername}
```

**iOS (Telegram 유니버셜 링크):**

```
https://t.me/{botUsername}?text=/sign_response {base64url(SignResponse)}
```

**Fallback (클립보드 복사):**

```
지갑 앱 → 클립보드에 "/sign_response {base64url(SignResponse)}" 복사
→ 사용자에게 안내: "WAIaaS Bot 채팅에 붙여넣기 해주세요"
```

**SDK 구현 (플랫폼 감지):**

```typescript
// @waiaas/wallet-sdk
function sendViaTelegram(
  response: SignResponse,
  botUsername: string
): void {
  const encoded = base64url.encode(JSON.stringify(response));
  const text = `/sign_response ${encoded}`;

  const platform = detectPlatform();

  if (platform === 'android') {
    // Android: Telegram 딥링크
    window.location.href = `tg://msg?text=${encodeURIComponent(text)}&to=${botUsername}`;
  } else if (platform === 'ios') {
    // iOS: Telegram 유니버셜 링크
    window.location.href = `https://t.me/${botUsername}?text=${encodeURIComponent(text)}`;
  } else {
    // Fallback: 클립보드 복사 + 안내
    navigator.clipboard.writeText(text);
    alert('응답이 클립보드에 복사되었습니다. WAIaaS Bot 채팅에 붙여넣기 해주세요.');
  }
}
```

### 8.6 E2E 시퀀스 다이어그램

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ AI Agent │     │  WAIaaS  │     │ Telegram │     │  Owner   │     │ 지갑 앱   │
│          │     │  데몬    │     │  서버    │     │  (모바일)│     │(SDK내장) │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 1. 고액 TX     │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ 2. 정책 평가    │                │                │
     │                │  → PENDING_APPROVAL             │                │
     │                │                │                │                │
     │                │ 3. sendMessage │                │                │
     │                │  (인라인 버튼   │                │                │
     │                │   + 유니버셜 링크)               │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 4. 푸시 알림    │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ 5. [지갑에서    │
     │                │                │                │  승인하기] 탭   │
     │                │                │                │  유니버셜 링크  │
     │                │                │                │───────────────>│
     │                │                │                │                │
     │                │                │                │    6. Owner 확인│
     │                │                │                │    서명 생성    │
     │                │                │                │                │
     │                │                │                │ 7. 공유 인텐트  │
     │                │                │                │  /sign_response│
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │                │ 8. [보내기] 탭  │                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │ 9. Long Polling│                │                │
     │                │  /sign_response 수신             │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │ 10. 서명 검증 (ownerAuth)         │                │
     │                │   → 트랜잭션 실행                 │                │
     │                │                │                │                │
     │ 11. TX 완료    │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
```

**단계별 상세:**

| 단계 | 주체 | 동작 | 상세 |
|------|------|------|------|
| 1 | AI Agent | 고액 트랜잭션 요청 | POST /v1/transactions |
| 2 | 데몬 | 정책 평가 → PENDING_APPROVAL | 내부 Pipeline Stage 4 |
| 3 | 데몬 | Telegram Bot sendMessage | InlineKeyboardMarkup에 유니버셜 링크 버튼 포함 |
| 4 | Telegram | Owner에게 푸시 알림 | Telegram 앱 알림 (모바일/PC) |
| 5 | Owner | 인라인 버튼 탭 | 유니버셜 링크 → 지갑 앱 열림 (모바일) 또는 웹 QR (PC) |
| 6 | Owner | 트랜잭션 확인 + 서명 | 지갑 앱 서명 UI |
| 7 | 지갑 앱 | Telegram 공유 인텐트 실행 | `/sign_response {base64url(SignResponse)}` 메시지 준비 |
| 8 | Owner | Telegram에서 [보내기] 탭 | 1탭으로 Bot에 응답 전송 |
| 9 | 데몬 | Long Polling으로 응답 수신 | `/sign_response` 명령어 파싱 + chatId 확인 |
| 10 | 데몬 | 서명 검증 + 트랜잭션 실행 | ownerAuth(EIP-191/Ed25519) → EXECUTING → CONFIRMED |
| 11 | 데몬 | AI Agent에 결과 반환 | 트랜잭션 상태 CONFIRMED |

---

## 9. 요청 만료 + 재시도 정책

### 9.1 만료 시간 설정

| 항목 | 값 | 설명 |
|------|-----|------|
| 기본 만료 시간 | **30분** | SettingsService `signing_sdk.request_expiry_min` |
| 최소값 | 1분 | 너무 짧으면 Owner가 확인할 시간 부족 |
| 최대값 | 1440분 (24시간) | 보안상 장기간 열린 요청은 위험 |
| 계산 방식 | `new Date(Date.now() + expiryMin * 60 * 1000).toISOString()` | ISO 8601 UTC 기준 |

### 9.2 만료 확인 시점

| 시점 | 주체 | 동작 |
|------|------|------|
| SignResponse 수신 시 | 데몬 | `new Date(signResponse.signedAt) > new Date(signRequest.expiresAt)` → `SIGN_REQUEST_EXPIRED` |
| ntfy SSE 구독 타임아웃 | 데몬 | expiresAt 도달 시 SSE 연결 종료 → 트랜잭션 상태 유지 (PENDING_APPROVAL) |
| 유니버셜 링크 열기 시 | 지갑 앱 | SignRequest.expiresAt 확인 → 만료 시 서명 UI 비활성화 + "요청이 만료되었습니다" 안내 |
| `/sign_response` 수신 시 | 데몬 | requestId로 원본 SignRequest 조회 → expiresAt 확인 |

### 9.3 만료 후 처리

**데몬 측:**

```typescript
// SignResponseHandler
async handle(signResponse: SignResponse): Promise<void> {
  const signRequest = await this.findRequest(signResponse.requestId);
  if (!signRequest) throw new WAIaaSError('SIGN_REQUEST_NOT_FOUND', 404);

  // 만료 확인
  if (new Date() > new Date(signRequest.expiresAt)) {
    throw new WAIaaSError('SIGN_REQUEST_EXPIRED', 408);
  }

  // ... 이하 서명 검증 + 실행
}
```

- 만료된 SignResponse를 수신해도 **트랜잭션 상태는 변경하지 않음** (PENDING_APPROVAL 유지)
- 데몬은 만료 에러를 로그에 기록하고, ntfy 채널인 경우 SSE 구독을 이미 종료한 상태

**지갑 앱 측:**

```typescript
// @waiaas/wallet-sdk — parseSignRequest 내부
function parseSignRequest(url: string): SignRequest {
  const request = /* ... 파싱 로직 ... */;

  // 만료 확인 (경고용, 최종 검증은 데몬 측)
  if (new Date() > new Date(request.expiresAt)) {
    throw new SignRequestExpiredError(
      '이 서명 요청은 만료되었습니다. 새로운 요청을 기다려주세요.'
    );
  }

  return request;
}
```

### 9.4 재시도 정책

**원칙: 자동 재시도 없음 (1회성 요청)**

| 상황 | 처리 |
|------|------|
| 요청 만료 (Owner 미응답) | 트랜잭션 PENDING_APPROVAL 상태 유지. 새 승인 필요 시 **새 SignRequest 생성** (새 requestId) |
| Owner 거부 (action='reject') | 트랜잭션 CANCELLED. 동일 트랜잭션 재시도 불가. AI Agent가 새 트랜잭션을 생성해야 함 |
| 네트워크 오류 (ntfy 전달 실패) | 데몬이 ntfy publish 실패 감지 → 트랜잭션 PENDING_APPROVAL 유지 |
| 서명 검증 실패 | INVALID_SIGNATURE 에러. 트랜잭션 상태 변경 없음. Owner가 올바른 키로 재서명 필요 |

**Admin 수동 재승인:**

Admin이 PENDING_APPROVAL 상태의 트랜잭션에 대해 기존 approve API(`POST /v1/transactions/:id/approve`)를 사용하여 수동 재승인 요청을 생성할 수 있다. 이때 새로운 SignRequest가 생성되며 새 requestId가 부여된다.

---

## 10. 보안 모델

### 10.1 위협 분석

#### 위협 1: 토픽 스니핑 (요청 엿보기)

| 항목 | 내용 |
|------|------|
| **공격 시나리오** | 공격자가 요청 토픽(`waiaas-sign-{walletId}`)을 구독하여 서명 요청을 엿본다 |
| **위험도** | 낮음 |
| **대응** | walletId는 UUID v7 (122비트 엔트로피, 추측 어려움). 요청 자체는 공개 데이터이며, 서명 능력 없이는 무해하다. 서명 요청을 엿보더라도 Owner의 개인키 없이는 유효한 응답을 생성할 수 없다 |
| **추가 대응** | self-hosted ntfy 사용 시 토픽 인증(Authorization 헤더) 추가 가능 |

#### 위협 2: 위조 응답 (가짜 SignResponse)

| 항목 | 내용 |
|------|------|
| **공격 시나리오** | 공격자가 응답 토픽(`waiaas-response-{requestId}`)에 가짜 SignResponse를 publish |
| **위험도** | 차단됨 |
| **대응** | signerAddress 서명 검증 (ownerAuth: EIP-191/SIWE 또는 Ed25519/SIWS). Owner 개인키 없이는 유효한 서명을 생성할 수 없다. 서명 검증 실패 시 `INVALID_SIGNATURE` 에러로 즉시 거부 |

#### 위협 3: 리플레이 공격 (응답 재전송)

| 항목 | 내용 |
|------|------|
| **공격 시나리오** | 과거의 유효한 SignResponse를 캡처하여 새 요청에 재전송 |
| **위험도** | 차단됨 |
| **대응** | (1) requestId 매칭 — 응답의 requestId가 현재 활성 요청과 일치해야 함. (2) 이미 처리된 requestId는 거부 (`SIGN_REQUEST_ALREADY_PROCESSED`). (3) expiresAt 확인 — 만료된 요청의 응답은 거부 |

#### 위협 4: 중간자 공격 (통신 가로채기)

| 항목 | 내용 |
|------|------|
| **공격 시나리오** | ntfy 서버와의 통신을 가로채어 요청을 변조하거나 응답을 탈취 |
| **위험도** | 낮음 (HTTPS 강제) |
| **대응** | (1) ntfy 서버와의 모든 통신은 HTTPS 강제. (2) self-hosted ntfy 사용 시 TLS 인증서 필수. (3) Telegram Bot API도 HTTPS 전용 |

#### 위협 5: 응답 토픽 추측

| 항목 | 내용 |
|------|------|
| **공격 시나리오** | 공격자가 응답 토픽 이름(`waiaas-response-{requestId}`)을 추측하여 구독 |
| **위험도** | 무시 가능 |
| **대응** | requestId는 UUID v7 (122비트 엔트로피). 무작위 대입으로 추측할 확률은 `1/2^122` ≈ `1/5.3 x 10^36`. 또한 추측에 성공하더라도 위협 2의 서명 검증에 의해 차단됨 |

### 10.2 ntfy 토픽 보안

| 토픽 | 보안 수준 | 설명 |
|------|----------|------|
| 요청 토픽 `waiaas-sign-{walletId}` | 중간 | walletId는 UUID v7이지만 장기 사용. 지갑 소유자만 알 수 있으나, 노출 시 요청 내용 열람 가능 (서명 불가) |
| 응답 토픽 `waiaas-response-{requestId}` | 높음 | requestId는 요청별 UUID v7. 1회용이며 추측 불가. 토픽 자체가 인증 역할 |

**공개 ntfy.sh vs self-hosted:**

| 구분 | 공개 ntfy.sh | self-hosted ntfy |
|------|-------------|-----------------|
| 토픽 접근 | 토픽 이름을 아는 누구나 구독/publish 가능 | Authorization 헤더 기반 접근 제어 가능 |
| 서버 신뢰 | ntfy.sh 운영자가 메시지 열람 가능 (평문) | 자체 서버에서만 처리, 외부 노출 없음 |
| 권장 | 개발/테스트 환경, 민감하지 않은 데이터 | 프로덕션, 민감 데이터, 규정 준수 필요 시 |

### 10.3 서명 검증 플로우

기존 ownerAuth 인프라(v1.2 구현 완료)를 재사용한다.

**EVM 체인:**

```typescript
import { verifyMessage } from 'viem';

async function verifyEvmSignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  const isValid = await verifyMessage({
    address: expectedAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });
  return isValid;
}
```

**Solana 체인:**

```typescript
import nacl from 'tweetnacl';
import bs58 from 'bs58';

function verifySolanaSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = Buffer.from(signature, 'base64');
  const publicKeyBytes = bs58.decode(expectedAddress);

  return nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    publicKeyBytes,
  );
}
```

**검증 실패 처리:**

| 실패 원인 | 에러 코드 | 트랜잭션 상태 |
|----------|----------|-------------|
| 서명 값 검증 실패 | `INVALID_SIGNATURE` (401) | 변경 없음 (PENDING_APPROVAL 유지) |
| signerAddress와 Owner 주소 불일치 | `SIGNER_ADDRESS_MISMATCH` (403) | 변경 없음 |
| signature 필드 누락 (approve 시) | `INVALID_SIGN_RESPONSE` (400) | 변경 없음 |

### 10.4 향후 보안 강화 옵션 (범위 외)

아래 옵션은 Signing Protocol v1 범위에 포함하지 않으며, 보안 요구사항 증가 시 후속 마일스톤에서 추가한다.

| 옵션 | 설명 | 효과 |
|------|------|------|
| ntfy 토픽 인증 | Authorization 헤더 기반 토픽 접근 제어. self-hosted ntfy에서 사용자/비밀번호 또는 토큰 인증 | 토픽 스니핑 + 위조 응답을 네트워크 레벨에서 차단 |
| E2E 암호화 | SignRequest/SignResponse를 Owner 공개키로 암호화. ntfy 서버에서도 내용 열람 불가 | 서버 신뢰 불필요. 완전한 기밀성 확보 |
| 응답 토픽 TTL | ntfy 서버 설정으로 만료된 토픽의 메시지 자동 삭제 | 만료된 응답 데이터 잔존 방지 |
| SignRequest HMAC | 데몬이 SignRequest에 HMAC을 추가하여 무결성 검증 | 전달 과정에서 요청 변조 감지 |

---

## 11. 에러 코드

기존 WAIaaS 에러 코드 체계(ChainError extends Error → Stage 5에서 WAIaaSError 변환)에 서명 프로토콜 전용 에러를 추가한다.

### 11.1 서명 프로토콜 에러 코드

| 에러 코드 | HTTP | 설명 | 발생 시점 |
|-----------|------|------|----------|
| `SIGN_REQUEST_EXPIRED` | 408 | 서명 요청 만료 (expiresAt 초과) | SignResponse 수신 시 expiresAt 검증 |
| `SIGN_REQUEST_NOT_FOUND` | 404 | requestId에 해당하는 요청 없음 | SignResponse의 requestId 매칭 실패 |
| `SIGN_REQUEST_ALREADY_PROCESSED` | 409 | 이미 처리된 서명 요청 (approve/reject 완료) | 동일 requestId로 중복 응답 수신 |
| `INVALID_SIGN_RESPONSE` | 400 | SignResponse Zod 검증 실패 (필수 필드 누락, 형식 오류) | SignResponse 파싱/검증 단계 |
| `INVALID_SIGNATURE` | 401 | 서명 검증 실패 (ownerAuth EIP-191/Ed25519) | 서명 값 검증 단계 |
| `SIGNER_ADDRESS_MISMATCH` | 403 | signerAddress와 Owner 등록 주소 불일치 | signerAddress 검증 단계 |
| `SIGNING_SDK_DISABLED` | 403 | signing_sdk.enabled = false 상태에서 SDK 채널 요청 | SignRequest 생성 시 |
| `WALLET_NOT_REGISTERED` | 404 | WalletLinkRegistry에 등록되지 않은 지갑 | 유니버셜 링크 URL 생성 시 |

### 11.2 에러 응답 형식

기존 WAIaaS 에러 응답 형식을 따른다:

```json
{
  "error": {
    "code": "SIGN_REQUEST_EXPIRED",
    "message": "서명 요청이 만료되었습니다. 새로운 요청을 생성해주세요.",
    "details": {
      "requestId": "01935a3b-7c8d-7e00-b123-456789abcdef",
      "expiresAt": "2026-02-19T15:00:00Z",
      "expiredAt": "2026-02-19T15:35:00Z"
    }
  }
}
```

### 11.3 에러 처리 매트릭스

| 에러 코드 | 트랜잭션 상태 변경 | 재시도 가능 | 로그 레벨 |
|-----------|-------------------|------------|----------|
| `SIGN_REQUEST_EXPIRED` | 없음 (PENDING_APPROVAL 유지) | 새 요청 생성 필요 | WARN |
| `SIGN_REQUEST_NOT_FOUND` | 없음 | 올바른 requestId로 재시도 | WARN |
| `SIGN_REQUEST_ALREADY_PROCESSED` | 없음 (이미 완료) | 불가 | INFO |
| `INVALID_SIGN_RESPONSE` | 없음 | 올바른 형식으로 재시도 | WARN |
| `INVALID_SIGNATURE` | 없음 | 올바른 키로 재서명 | ERROR |
| `SIGNER_ADDRESS_MISMATCH` | 없음 | 올바른 Owner 키 사용 필요 | ERROR |
| `SIGNING_SDK_DISABLED` | 없음 | Admin이 SDK 활성화 후 | WARN |
| `WALLET_NOT_REGISTERED` | 없음 | Admin이 지갑 등록 후 | WARN |

---

## 12. 기술 결정 요약

m26-01(Wallet Signing SDK)의 기술 결정 사항 11개를 정리한다. 각 결정은 설계 문서 전체에 반영되어 있다.

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 링크 방식 | 지갑 도메인 유니버셜 링크 | WAIaaS 도메인 불필요. 지갑 개발사가 AASA/assetlinks.json 자체 관리. PC 클릭 시 웹페이지 fallback(QR 표시). self-hosted 철학 유지 |
| 2 | 직접 푸시 채널 | ntfy publish/subscribe | 메신저 없이 지갑 앱만으로 동작. self-hostable. 양방향 pub/sub 지원. WAIaaS가 이미 ntfy를 알림 채널로 지원(v1.3). 요청/응답 토픽 분리로 단순한 구조 유지 |
| 3 | 메신저 채널 | Telegram만 (초기) | v1.6에서 이미 양방향(Bot API + Long Polling) 구현 완료. Slack(Socket Mode)/Discord(Gateway Bot)는 양방향 미구현이므로 후속 확장으로 분리 |
| 4 | 프로토콜 형식 | JSON + base64url 인코딩 | Zod 스키마 검증, URL-safe 인코딩, 유니버셜 링크 쿼리 파라미터에 포함 가능 |
| 5 | SDK 패키지 | @waiaas/wallet-sdk (npm, TypeScript) | React Native(D'CENT 브릿지 앱), Electron, Node.js 환경 모두 사용 가능 |
| 6 | 서명 검증 | 기존 ownerAuth 로직 재사용 | Ed25519(Solana) / EIP-191(EVM) 검증 로직이 v1.2에서 구현 완료 |
| 7 | 승인 채널 우선순위 | config 기반 5단계 | SDK(ntfy) > SDK(Telegram) > WalletConnect > Telegram Bot `/approve` > REST API. config에서 `preferred_channel` 설정 가능 |
| 8 | ntfy 토픽 보안 | requestId 기반 1회용 토픽 | 응답 토픽에 UUID v7 requestId 포함하여 추측 불가. 만료 후 자동 폐기. self-hosted ntfy로 추가 보안 확보 |
| 9 | 딥링크 fallback | 유니버셜 링크 실패 시 커스텀 딥링크 | 유니버셜 링크가 동작하지 않는 환경 대비. `deepLink.scheme` + `deepLink.signPath` 설정 시 fallback |
| 10 | 승인 방법 범위 | 지갑별 `owner_approval_method` | 다중 지갑 환경에서 각각 다른 승인 채널 설정 가능. Solana 지갑은 SDK+ntfy, EVM 지갑은 WalletConnect처럼 지갑마다 최적 채널 선택. 미설정 시 글로벌 fallback |
| 11 | Admin UI 승인 방법 | 지갑 상세 > Owner Settings 섹션 | REST API만으로도 설정 가능하나, Owner 등록과 승인 방법 설정을 한 화면에서 제공하여 DX 향상. 미구성 인프라 선택 시 경고로 사전 오류 방지 |

---

*문서 번호: 73*
*생성일: 2026-02-19*
*최종 수정: 2026-02-20*
*선행 문서: 35(알림 아키텍처), 34(Owner 지갑 연결), 37(REST API)*
*관련 마일스톤: m26-00(설계), m26-01(구현)*
*범위: WAIaaS Signing Protocol v1 스키마 + 전송 채널 + 보안 모델*
