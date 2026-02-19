# 74. Wallet SDK + Daemon Components

## 목차

1. [개요](#1-개요)
2. [@waiaas/wallet-sdk 공개 API](#2-waiaaswallet-sdk-공개-api)
3. [WalletLinkConfig + registerWallet()](#3-walletlinkconfig--registerwallet)
4. [패키지 구조 + 빌드/배포](#4-패키지-구조--빌드배포)
5. [데몬 측 컴포넌트 개요](#5-데몬-측-컴포넌트-개요)
6. [SignRequestBuilder + SignResponseHandler](#6-signrequestbuilder--signresponsehandler)
7. [NtfySigningChannel + TelegramSigningChannel](#7-ntfysigningchannel--telegramsigningchannel)
8. [WalletLinkRegistry + ApprovalChannelRouter](#8-walletlinkregistry--approvalchannelrouter)
9. [SettingsService signing_sdk 키](#9-settingsservice-signing_sdk-키)
10. [wallets.owner_approval_method 컬럼 + REST API](#10-walletsowner_approval_method-컬럼--rest-api)
11. [기술 결정 요약](#11-기술-결정-요약)

---

## 1. 개요

### 1.1 문서 목적

이 문서는 doc 73(WAIaaS Signing Protocol v1)에서 확정된 프로토콜 스키마와 채널 프로토콜을 기반으로, **SDK 패키지(@waiaas/wallet-sdk)의 공개 API 인터페이스**와 **데몬 측 컴포넌트의 인터페이스/책임**을 확정한다.

m26-01(Wallet Signing SDK) 구현 시 SDK 패키지를 바로 생성하고 공개 API를 구현할 수 있도록 입력 사양을 제공한다.

### 1.2 적용 범위

| 범위 | 내용 | 대상 마일스톤 |
|------|------|-------------|
| SDK 공개 API | 6개 함수 시그니처 + 매개변수 + 반환 타입 + 에러 | m26-01 |
| WalletLinkConfig | Zod 스키마 + registerWallet() 등록 플로우 | m26-01 |
| 패키지 구조 | 디렉토리 + package.json + 빌드/배포 설정 | m26-01 |
| 데몬 컴포넌트 | SignRequestBuilder, SignResponseHandler, 채널, 라우터 | m26-01 |
| Admin/DB 확장 | SettingsService 키, wallets 테이블 컬럼, REST API | m26-01 |

### 1.3 doc 73과의 관계

| 참조 대상 | doc 73 섹션 | 본 문서 사용 위치 |
|-----------|------------|-----------------|
| SignRequestSchema | Section 3 | SDK parseSignRequest() 입력 타입 |
| SignResponseSchema | Section 4 | SDK buildSignResponse() 출력 타입 |
| 서명 메시지 포맷 | Section 5 | SDK formatDisplayMessage() 구현 기반 |
| 유니버셜 링크 URL 구조 | Section 6 | SDK parseSignRequest() URL 파싱 로직 |
| ntfy 채널 프로토콜 | Section 7 | SDK sendViaNtfy(), subscribeToRequests() + 데몬 NtfySigningChannel |
| Telegram 채널 프로토콜 | Section 8 | SDK sendViaTelegram() + 데몬 TelegramSigningChannel |
| 에러 코드 | Section 11 | SDK 에러 클래스 + 데몬 에러 처리 |

---

## 2. @waiaas/wallet-sdk 공개 API

@waiaas/wallet-sdk 패키지는 지갑 개발사(D'CENT 등)가 npm으로 설치하여 WAIaaS Signing Protocol v1을 통합하는 SDK이다. 6개 공개 함수를 제공한다.

### 2.1 parseSignRequest

유니버셜 링크/딥링크 URL에서 SignRequest를 추출하고 Zod 검증을 수행한다.

#### 시그니처

```typescript
/**
 * 유니버셜 링크 또는 딥링크 URL에서 SignRequest를 추출한다.
 *
 * - data 파라미터가 있으면 인라인 base64url 디코딩
 * - requestId 파라미터만 있으면 ntfy 토픽에서 조회
 * - 만료된 요청은 SignRequestExpiredError를 throw
 *
 * @param url - 유니버셜 링크 또는 딥링크 URL
 * @returns SignRequest 객체 (ntfy 조회 시 Promise)
 * @throws InvalidSignRequestUrlError - URL 형식이 올바르지 않거나 data/requestId 파라미터 없음
 * @throws SignRequestExpiredError - 요청의 expiresAt이 현재 시각을 초과
 * @throws SignRequestValidationError - Zod 스키마 검증 실패
 */
function parseSignRequest(url: string): SignRequest | Promise<SignRequest>;
```

#### 매개변수 상세

| 매개변수 | 타입 | 필수 | 설명 | 제약 조건 |
|---------|------|------|------|-----------|
| `url` | `string` | O | 유니버셜 링크 또는 딥링크 전체 URL | `?data=` 또는 `?requestId=` 쿼리 파라미터 필수 |

#### 반환 타입 상세

```typescript
// doc 73 Section 3에서 정의된 타입
type SignRequest = {
  version: '1';
  requestId: string;          // UUID v7
  chain: 'solana' | 'evm';
  network: string;
  message: string;
  displayMessage: string;
  metadata: {
    txId: string;
    type: string;             // TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | APPROVE | BATCH
    from: string;
    to: string;
    amount?: string;
    symbol?: string;
    policyTier: 'APPROVAL' | 'DELAY';
  };
  responseChannel:
    | { type: 'ntfy'; responseTopic: string; serverUrl?: string }
    | { type: 'telegram'; botUsername: string };
  expiresAt: string;          // ISO 8601 datetime
};
```

동기 반환(`SignRequest`)과 비동기 반환(`Promise<SignRequest>`)의 분기:

| 모드 | URL 형태 | 반환 | 설명 |
|------|---------|------|------|
| 인라인 | `?data={base64url(SignRequest)}` | `SignRequest` (동기) | URL에서 직접 추출 |
| ntfy 조회 | `?requestId={id}&channel=ntfy&server={url}` | `Promise<SignRequest>` (비동기) | ntfy 토픽에서 HTTP 조회 |

#### 에러 케이스

| 에러 클래스 | 조건 | 메시지 예시 |
|------------|------|-----------|
| `InvalidSignRequestUrlError` | URL에 `data` 또는 `requestId` 파라미터 없음 | `"Invalid sign request URL: missing 'data' or 'requestId' parameter"` |
| `InvalidSignRequestUrlError` | base64url 디코딩 실패 | `"Failed to decode base64url data parameter"` |
| `SignRequestExpiredError` | `expiresAt < Date.now()` | `"Sign request expired at 2026-02-19T15:00:00Z"` |
| `SignRequestValidationError` | Zod 스키마 검증 실패 | `"Invalid SignRequest: missing required field 'requestId'"` |

#### 코드 예시 (지갑 앱 통합)

```typescript
import { parseSignRequest } from '@waiaas/wallet-sdk';

// iOS AppDelegate / Android Activity에서 유니버셜 링크 수신
async function handleUniversalLink(url: string): Promise<void> {
  try {
    const request = await parseSignRequest(url);

    // 서명 UI에 트랜잭션 정보 표시
    showSigningUI({
      txId: request.metadata.txId,
      type: request.metadata.type,
      from: request.metadata.from,
      to: request.metadata.to,
      amount: request.metadata.amount,
      symbol: request.metadata.symbol,
      network: request.network,
      expiresAt: request.expiresAt,
    });
  } catch (error) {
    if (error instanceof SignRequestExpiredError) {
      showAlert('이 서명 요청은 만료되었습니다.');
    } else if (error instanceof InvalidSignRequestUrlError) {
      showAlert('올바르지 않은 서명 요청입니다.');
    }
  }
}
```

#### 내부 로직 (의사코드)

```typescript
function parseSignRequest(url: string): SignRequest | Promise<SignRequest> {
  const params = new URL(url).searchParams;

  // Case 1: 인라인 데이터
  if (params.has('data')) {
    const json = base64url.decode(params.get('data')!);
    const parsed = JSON.parse(json);
    const request = SignRequestSchema.parse(parsed);

    if (new Date() > new Date(request.expiresAt)) {
      throw new SignRequestExpiredError(request.expiresAt);
    }
    return request;
  }

  // Case 2: ntfy 조회
  if (params.has('requestId')) {
    const requestId = params.get('requestId')!;
    const serverUrl = params.get('server') || 'https://ntfy.sh';
    return fetchSignRequestFromNtfy(requestId, serverUrl);
  }

  throw new InvalidSignRequestUrlError(url);
}
```

---

### 2.2 buildSignResponse

SignResponse 객체를 생성한다. `signedAt`은 현재 시각으로 자동 설정된다.

#### 시그니처

```typescript
/**
 * 서명 응답 객체를 생성한다.
 *
 * - action='approve' 시 signature 필수
 * - signedAt은 현재 시각(ISO 8601)으로 자동 생성
 *
 * @param params - 응답 생성 매개변수
 * @returns SignResponse 객체
 * @throws MissingSignatureError - action='approve'인데 signature가 없을 때
 */
function buildSignResponse(params: BuildSignResponseParams): SignResponse;
```

#### 매개변수 상세

```typescript
interface BuildSignResponseParams {
  requestId: string;                    // SignRequest.requestId와 동일
  action: 'approve' | 'reject';        // 승인 또는 거부
  signature?: string;                   // approve 시 필수. EVM: hex(0x), Solana: base64
  signerAddress: string;                // Owner 지갑 주소
}
```

| 매개변수 | 타입 | 필수 | 설명 | 제약 조건 |
|---------|------|------|------|-----------|
| `requestId` | `string` | O | 원본 SignRequest의 requestId | UUID v7 형식 |
| `action` | `'approve' \| 'reject'` | O | 승인/거부 선택 | - |
| `signature` | `string` | 조건부 | 서명값 | `action='approve'` 시 **필수**. EVM: `0x` 접두어 hex, Solana: base64 |
| `signerAddress` | `string` | O | 서명자(Owner) 주소 | EVM: `0x` 접두어, Solana: base58 |

#### 반환 타입 상세

```typescript
// doc 73 Section 4에서 정의된 타입
type SignResponse = {
  version: '1';
  requestId: string;
  action: 'approve' | 'reject';
  signature?: string;
  signerAddress: string;
  signedAt: string;           // ISO 8601 datetime (자동 생성)
};
```

#### 에러 케이스

| 에러 클래스 | 조건 | 메시지 예시 |
|------------|------|-----------|
| `MissingSignatureError` | `action='approve'` && `signature` 미제공 | `"signature is required when action is 'approve'"` |

#### 코드 예시 (지갑 앱 통합)

```typescript
import { buildSignResponse } from '@waiaas/wallet-sdk';

// 사용자가 승인 버튼을 탭한 경우
async function onApprove(request: SignRequest): Promise<void> {
  // 지갑 앱 내부에서 서명 생성 (EVM 예시)
  const signature = await wallet.signMessage(request.message);

  const response = buildSignResponse({
    requestId: request.requestId,
    action: 'approve',
    signature,
    signerAddress: wallet.address,
  });

  // 응답 채널에 따라 전송
  if (request.responseChannel.type === 'ntfy') {
    await sendViaNtfy(
      response,
      request.responseChannel.responseTopic,
      request.responseChannel.serverUrl,
    );
  } else {
    sendViaTelegram(response, request.responseChannel.botUsername);
  }
}

// 사용자가 거부 버튼을 탭한 경우
function onReject(request: SignRequest): void {
  const response = buildSignResponse({
    requestId: request.requestId,
    action: 'reject',
    signerAddress: wallet.address,
  });
  // ... 전송
}
```

---

### 2.3 formatDisplayMessage

SignRequest를 사람이 읽을 수 있는 텍스트로 변환한다. 지갑 앱의 서명 확인 UI에 표시하기 위한 용도이다.

#### 시그니처

```typescript
/**
 * SignRequest를 사람 읽기용 텍스트로 변환한다.
 * 지갑 앱 UI에서 트랜잭션 상세를 표시할 때 사용한다.
 *
 * - amount/symbol이 없으면 해당 줄을 생략한다
 * - displayMessage가 있으면 우선 사용, 없으면 metadata에서 생성
 *
 * @param request - SignRequest 객체
 * @returns 사람 읽기용 텍스트 문자열
 */
function formatDisplayMessage(request: SignRequest): string;
```

#### 매개변수 상세

| 매개변수 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `request` | `SignRequest` | O | parseSignRequest()로 파싱된 SignRequest 객체 |

#### 반환 타입 상세

사람 읽기용 멀티라인 텍스트 문자열. 포맷:

```
Transaction: {txId}
Type: {type}
From: {from}
To: {to}
Amount: {amount} {symbol}       <-- amount/symbol 없으면 이 줄 생략
Network: {network}
Policy Tier: {policyTier}
Expires: {expiresAt}
```

#### 에러 케이스

이 함수는 에러를 throw하지 않는다. 입력이 유효한 SignRequest이면 항상 문자열을 반환한다.

#### 코드 예시 (지갑 앱 통합)

```typescript
import { parseSignRequest, formatDisplayMessage } from '@waiaas/wallet-sdk';

async function handleSignRequest(url: string): Promise<void> {
  const request = await parseSignRequest(url);

  // 서명 확인 화면에 트랜잭션 상세 표시
  const displayText = formatDisplayMessage(request);
  console.log(displayText);
  // 출력 예시:
  // Transaction: 01935a3b-7c8d-7e00-b123-456789abcdef
  // Type: TRANSFER
  // From: 0x1234...5678
  // To: 0xabcd...ef01
  // Amount: 1.5 ETH
  // Network: ethereum-mainnet
  // Policy Tier: APPROVAL
  // Expires: 2026-02-19T15:00:00Z

  // CONTRACT_CALL (amount 없음) 출력 예시:
  // Transaction: 01935a3b-8888-7e00-aaaa-bbbbccccdddd
  // Type: CONTRACT_CALL
  // From: 0x1234...5678
  // To: 0xContract...
  // Network: polygon-mainnet
  // Policy Tier: APPROVAL
  // Expires: 2026-02-19T16:00:00Z
}
```

---

### 2.4 sendViaNtfy

ntfy 응답 토픽에 SignResponse를 base64url 인코딩하여 POST 전송한다.

#### 시그니처

```typescript
/**
 * ntfy 응답 토픽에 SignResponse를 전송한다.
 *
 * - SignResponse를 JSON 직렬화 후 base64url 인코딩
 * - ntfy 서버에 HTTP POST
 * - 기본 서버: https://ntfy.sh
 *
 * @param response - buildSignResponse()로 생성된 SignResponse 객체
 * @param responseTopic - ntfy 응답 토픽 (SignRequest.responseChannel.responseTopic)
 * @param serverUrl - ntfy 서버 URL (기본: 'https://ntfy.sh')
 * @throws NtfyPublishError - ntfy 서버 응답이 2xx가 아닐 때
 * @throws NetworkError - 네트워크 연결 실패
 */
async function sendViaNtfy(
  response: SignResponse,
  responseTopic: string,
  serverUrl?: string,
): Promise<void>;
```

#### 매개변수 상세

| 매개변수 | 타입 | 필수 | 설명 | 기본값 |
|---------|------|------|------|--------|
| `response` | `SignResponse` | O | 서명 응답 객체 | - |
| `responseTopic` | `string` | O | ntfy 응답 토픽 이름 | - |
| `serverUrl` | `string` | X | ntfy 서버 URL | `'https://ntfy.sh'` |

#### 반환 타입

`Promise<void>` -- 성공 시 resolve, 실패 시 reject.

#### 에러 케이스

| 에러 클래스 | 조건 | 메시지 예시 |
|------------|------|-----------|
| `NtfyPublishError` | ntfy 서버 응답 상태 코드 != 2xx | `"Failed to publish to ntfy topic 'waiaas-response-{id}': 429 Too Many Requests"` |
| `NetworkError` | fetch 호출 자체 실패 (네트워크 오류) | `"Network error while publishing to ntfy: fetch failed"` |

#### 코드 예시 (지갑 앱 통합)

```typescript
import { buildSignResponse, sendViaNtfy } from '@waiaas/wallet-sdk';

async function submitApproval(
  request: SignRequest,
  signature: string,
  walletAddress: string,
): Promise<void> {
  const response = buildSignResponse({
    requestId: request.requestId,
    action: 'approve',
    signature,
    signerAddress: walletAddress,
  });

  // ntfy 채널인 경우
  if (request.responseChannel.type === 'ntfy') {
    await sendViaNtfy(
      response,
      request.responseChannel.responseTopic,
      request.responseChannel.serverUrl,  // undefined면 https://ntfy.sh 사용
    );
  }
}
```

#### 내부 로직

```typescript
async function sendViaNtfy(
  response: SignResponse,
  responseTopic: string,
  serverUrl: string = 'https://ntfy.sh',
): Promise<void> {
  const encoded = base64url.encode(JSON.stringify(response));

  const res = await fetch(`${serverUrl}/${responseTopic}`, {
    method: 'POST',
    body: encoded,
  });

  if (!res.ok) {
    throw new NtfyPublishError(responseTopic, res.status, res.statusText);
  }
}
```

---

### 2.5 sendViaTelegram

Telegram 딥링크 또는 유니버셜 링크를 통해 WAIaaS Bot에 SignResponse를 전송한다. 플랫폼(Android/iOS/기타)을 감지하여 최적의 방법을 선택한다.

#### 시그니처

```typescript
/**
 * Telegram을 통해 WAIaaS Bot에 SignResponse를 전송한다.
 *
 * - 플랫폼 감지 후 최적의 전송 방법 선택:
 *   1. Android: tg:// 딥링크
 *   2. iOS: https://t.me/ 유니버셜 링크
 *   3. 기타: 클립보드 복사 + 안내 메시지
 * - 전송 포맷: /sign_response {base64url(SignResponse)}
 *
 * @param response - buildSignResponse()로 생성된 SignResponse 객체
 * @param botUsername - WAIaaS Telegram Bot username (@ 없이)
 */
function sendViaTelegram(response: SignResponse, botUsername: string): void;
```

#### 매개변수 상세

| 매개변수 | 타입 | 필수 | 설명 | 예시 |
|---------|------|------|------|------|
| `response` | `SignResponse` | O | 서명 응답 객체 | - |
| `botUsername` | `string` | O | WAIaaS Telegram Bot username | `'waiaas_bot'` |

#### 반환 타입

`void` -- 동기 함수. URL 스킴 호출(Android/iOS)은 비동기 결과를 확인할 수 없으므로 void 반환.

#### 에러 케이스

이 함수는 에러를 throw하지 않는다. 각 전송 방법이 실패하면 다음 fallback으로 진행한다:

| 순서 | 플랫폼 | 방법 | 실패 시 |
|------|--------|------|--------|
| 1 | Android | `tg://msg?text=...&to=...` | iOS 방법 시도 |
| 2 | iOS | `https://t.me/{bot}?text=...` | 클립보드 방법 시도 |
| 3 | 기타 | `navigator.clipboard.writeText(...)` | 콘솔 경고 출력 |

#### 코드 예시 (지갑 앱 통합)

```typescript
import { buildSignResponse, sendViaTelegram } from '@waiaas/wallet-sdk';

function submitViaTelegram(
  request: SignRequest,
  signature: string,
  walletAddress: string,
): void {
  const response = buildSignResponse({
    requestId: request.requestId,
    action: 'approve',
    signature,
    signerAddress: walletAddress,
  });

  // Telegram 채널인 경우
  if (request.responseChannel.type === 'telegram') {
    sendViaTelegram(response, request.responseChannel.botUsername);
    // Android: tg://msg?text=/sign_response eyJ2ZXJzaW9u...&to=waiaas_bot
    // iOS:    https://t.me/waiaas_bot?text=/sign_response eyJ2ZXJzaW9u...
    // 기타:   클립보드에 "/sign_response eyJ2ZXJzaW9u..." 복사 + 안내
  }
}
```

#### 내부 로직

```typescript
function sendViaTelegram(response: SignResponse, botUsername: string): void {
  const encoded = base64url.encode(JSON.stringify(response));
  const text = `/sign_response ${encoded}`;
  const platform = detectPlatform();

  if (platform === 'android') {
    // Android: Telegram 딥링크
    openUrl(`tg://msg?text=${encodeURIComponent(text)}&to=${botUsername}`);
  } else if (platform === 'ios') {
    // iOS: Telegram 유니버셜 링크
    openUrl(`https://t.me/${botUsername}?text=${encodeURIComponent(text)}`);
  } else {
    // Fallback: 클립보드 복사
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }
}
```

---

### 2.6 subscribeToRequests

ntfy 요청 토픽을 SSE로 구독하여 새 서명 요청이 도착하면 콜백으로 전달한다. 지갑 앱이 백그라운드에서 서명 요청을 수신하기 위한 장기 구독용이다.

#### 시그니처

```typescript
/**
 * ntfy 요청 토픽을 SSE로 구독한다.
 *
 * - 새 서명 요청 수신 시 callback으로 SignRequest 전달
 * - AbortSignal로 구독 취소 가능
 * - 반환값 함수 호출로도 구독 취소 가능
 * - 네트워크 끊김 시 자동 재연결 (최대 3회, 5초 간격)
 *
 * @param topic - ntfy 요청 토픽 (예: 'waiaas-sign-{walletId}')
 * @param callback - 새 SignRequest 수신 시 호출되는 콜백
 * @param options - 옵션 (serverUrl, signal)
 * @returns unsubscribe 함수. 호출 시 SSE 연결 종료
 */
function subscribeToRequests(
  topic: string,
  callback: (request: SignRequest) => void,
  options?: SubscribeOptions,
): () => void;
```

#### 매개변수 상세

```typescript
interface SubscribeOptions {
  serverUrl?: string;          // ntfy 서버 URL (기본: 'https://ntfy.sh')
  signal?: AbortSignal;        // 외부에서 구독 취소하기 위한 AbortSignal
}
```

| 매개변수 | 타입 | 필수 | 설명 | 기본값 |
|---------|------|------|------|--------|
| `topic` | `string` | O | ntfy 요청 토픽 이름 | - |
| `callback` | `(request: SignRequest) => void` | O | 새 SignRequest 수신 콜백 | - |
| `options.serverUrl` | `string` | X | ntfy 서버 URL | `'https://ntfy.sh'` |
| `options.signal` | `AbortSignal` | X | 구독 취소용 AbortSignal | - |

#### 반환 타입

`() => void` -- unsubscribe 함수. 호출 시 SSE 연결을 종료한다.

구독 취소 방법은 2가지:

| 방법 | 코드 | 설명 |
|------|------|------|
| unsubscribe 함수 | `const unsub = subscribeToRequests(...); unsub();` | 반환된 함수 직접 호출 |
| AbortSignal | `const ctrl = new AbortController(); subscribeToRequests(..., { signal: ctrl.signal }); ctrl.abort();` | AbortController로 외부 제어 |

#### 에러 케이스

콜백 내부에서 에러가 발생해도 구독은 유지된다. 구독 자체의 에러는 다음과 같다:

| 상황 | 동작 |
|------|------|
| SSE 연결 실패 | 5초 후 재연결 시도 (최대 3회) |
| 3회 재연결 실패 | 구독 종료, 콘솔 에러 출력 |
| 잘못된 메시지 수신 | 해당 메시지 무시, 구독 유지 |
| Zod 검증 실패 | 해당 메시지 무시, 구독 유지 |

#### 코드 예시 (지갑 앱 통합)

```typescript
import { subscribeToRequests } from '@waiaas/wallet-sdk';

// 앱 시작 시 서명 요청 구독
const walletId = '01935a3b-7c8d-7e00-b123-456789abcdef';
const topic = `waiaas-sign-${walletId}`;

const unsubscribe = subscribeToRequests(
  topic,
  (request) => {
    // 새 서명 요청 수신 시 서명 UI 표시
    showSigningUI(request);
  },
  {
    serverUrl: 'https://ntfy.example.com',  // self-hosted ntfy 사용 시
  },
);

// 앱 종료 시 구독 해제
onAppClose(() => {
  unsubscribe();
});

// 또는 AbortController로 제어
const controller = new AbortController();
subscribeToRequests(
  topic,
  (request) => showSigningUI(request),
  { signal: controller.signal },
);

// 필요 시 취소
controller.abort();
```

#### 내부 로직

```typescript
function subscribeToRequests(
  topic: string,
  callback: (request: SignRequest) => void,
  options?: SubscribeOptions,
): () => void {
  const serverUrl = options?.serverUrl || 'https://ntfy.sh';
  const abortController = new AbortController();

  // 외부 AbortSignal과 내부 AbortController 연결
  if (options?.signal) {
    options.signal.addEventListener('abort', () => abortController.abort());
  }

  // SSE 연결 시작
  connectSSE(`${serverUrl}/${topic}/sse`, abortController.signal, (data) => {
    try {
      const ntfyMessage = JSON.parse(data);
      // ntfy 메시지에서 SignRequest 추출
      // click URL 또는 actions[0].url에서 data 파라미터 추출
      const url = ntfyMessage.click || ntfyMessage.actions?.[0]?.url;
      if (url) {
        const request = parseSignRequest(url);
        if (request instanceof Promise) {
          request.then(callback).catch(() => { /* 무시 */ });
        } else {
          callback(request);
        }
      }
    } catch {
      // 파싱 실패 시 무시, 구독 유지
    }
  });

  // unsubscribe 함수 반환
  return () => abortController.abort();
}
```

---

### 2.7 SDK 에러 클래스 계층

```typescript
// SDK 기본 에러
class WalletSdkError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'WalletSdkError';
  }
}

// parseSignRequest 에러
class InvalidSignRequestUrlError extends WalletSdkError {
  constructor(url: string) {
    super(`Invalid sign request URL: ${url}`, 'INVALID_SIGN_REQUEST_URL');
  }
}

class SignRequestExpiredError extends WalletSdkError {
  constructor(public readonly expiresAt: string) {
    super(`Sign request expired at ${expiresAt}`, 'SIGN_REQUEST_EXPIRED');
  }
}

class SignRequestValidationError extends WalletSdkError {
  constructor(message: string) {
    super(message, 'SIGN_REQUEST_VALIDATION_ERROR');
  }
}

// buildSignResponse 에러
class MissingSignatureError extends WalletSdkError {
  constructor() {
    super("signature is required when action is 'approve'", 'MISSING_SIGNATURE');
  }
}

// sendViaNtfy 에러
class NtfyPublishError extends WalletSdkError {
  constructor(topic: string, status: number, statusText: string) {
    super(`Failed to publish to ntfy topic '${topic}': ${status} ${statusText}`, 'NTFY_PUBLISH_ERROR');
  }
}

class NetworkError extends WalletSdkError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
  }
}
```

### 2.8 공개 API 요약

| # | 함수 | 입력 | 출력 | 동기/비동기 | 용도 |
|---|------|------|------|-----------|------|
| 1 | `parseSignRequest(url)` | URL string | `SignRequest \| Promise<SignRequest>` | 조건부 | URL에서 서명 요청 추출 |
| 2 | `buildSignResponse(params)` | `BuildSignResponseParams` | `SignResponse` | 동기 | 서명 응답 생성 |
| 3 | `formatDisplayMessage(request)` | `SignRequest` | `string` | 동기 | UI 표시용 텍스트 변환 |
| 4 | `sendViaNtfy(response, topic, serverUrl?)` | `SignResponse` + topic | `Promise<void>` | 비동기 | ntfy 응답 전송 |
| 5 | `sendViaTelegram(response, botUsername)` | `SignResponse` + bot | `void` | 동기 | Telegram 응답 전송 |
| 6 | `subscribeToRequests(topic, callback, options?)` | topic + callback | `() => void` | - | ntfy 서명 요청 구독 |

---

## 3. WalletLinkConfig + registerWallet()

> Plan 02에서 작성

---

## 4. 패키지 구조 + 빌드/배포

> Plan 02에서 작성

---

## 5. 데몬 측 컴포넌트 개요

> Plan 02에서 작성

---

## 6. SignRequestBuilder + SignResponseHandler

> Plan 02에서 작성

---

## 7. NtfySigningChannel + TelegramSigningChannel

> Plan 02에서 작성

---

## 8. WalletLinkRegistry + ApprovalChannelRouter

> Plan 02에서 작성

---

## 9. SettingsService signing_sdk 키

> Plan 02에서 작성

---

## 10. wallets.owner_approval_method 컬럼 + REST API

> Plan 02에서 작성

---

## 11. 기술 결정 요약

> Plan 02에서 작성

---

*문서 번호: 74*
*생성일: 2026-02-20*
*최종 수정: 2026-02-20*
*선행 문서: 73(Signing Protocol v1)*
*관련 마일스톤: m26-00(설계), m26-01(구현)*
*범위: @waiaas/wallet-sdk 공개 API + 데몬 컴포넌트 인터페이스*
