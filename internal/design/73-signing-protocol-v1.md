# 73. WAIaaS Signing Protocol v1

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

<!-- Plan 02에서 작성 -->

---

## 8. Telegram 채널 프로토콜

<!-- Plan 02에서 작성 -->

---

## 9. 요청 만료 + 재시도 정책

<!-- Plan 02에서 작성 -->

---

## 10. 보안 모델

<!-- Plan 02에서 작성 -->

---

## 11. 에러 코드

<!-- Plan 02에서 작성 -->

---

## 12. 기술 결정 요약

<!-- Plan 02에서 작성 -->

---

*생성일: 2026-02-19*
*최종 수정: 2026-02-19*
*관련 objective: m26-00 (Wallet SDK 설계), m26-01 (Wallet Signing SDK)*
*관련 설계: doc 35 (알림), doc 37 (REST API), doc 25 (SQLite), doc 67 (Admin UI)*
