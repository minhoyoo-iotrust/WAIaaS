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

### 3.1 WalletLinkConfig Zod 스키마

지갑 개발사가 자사 지갑의 유니버셜 링크, 딥링크, ntfy 토픽 설정을 등록하기 위한 설정 스키마이다.

```typescript
import { z } from 'zod';

const WalletLinkConfigSchema = z.object({
  /** 지갑 식별자 (kebab-case, 소문자+숫자+하이픈만 허용) */
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),           // "dcent"

  /** 사용자에게 표시되는 지갑 이름 */
  displayName: z.string().min(1).max(100),                          // "D'CENT Wallet"

  /** iOS AASA / Android App Links 기반 유니버셜 링크 설정 */
  universalLink: z.object({
    /** 지갑 개발사의 유니버셜 링크 도메인 (HTTPS URL) */
    base: z.string().url(),                                         // "https://link.dcentwallet.com"
    /** WAIaaS 서명 전용 경로 (/ 시작) */
    signPath: z.string().startsWith('/'),                           // "/waiaas/sign"
  }),

  /** 유니버셜 링크 실패 시 커스텀 딥링크 fallback (선택) */
  deepLink: z.object({
    /** 커스텀 URL 스킴 */
    scheme: z.string(),                                             // "dcent"
    /** 서명 전용 경로 */
    signPath: z.string(),                                           // "/waiaas-sign"
  }).optional(),

  /** ntfy 직접 푸시 구독 설정 (선택, ntfy 채널 사용 시 필수) */
  ntfy: z.object({
    /** ntfy 요청 토픽 패턴. {walletId}는 런타임에 치환 */
    requestTopicPattern: z.string(),                                // "{prefix}-{walletId}"
  }).optional(),

  /** 지원하는 블록체인 종류 (최소 1개) */
  supportedChains: z.array(z.enum(['solana', 'evm'])).min(1),
});

type WalletLinkConfig = z.infer<typeof WalletLinkConfigSchema>;
```

#### 필드 상세

| 필드 | 타입 | 필수 | 설명 | 제약 조건 | 예시 |
|------|------|------|------|-----------|------|
| `name` | `string` | O | 지갑 고유 식별자 | 1-50자, `/^[a-z0-9-]+$/` | `"dcent"` |
| `displayName` | `string` | O | UI 표시용 지갑 이름 | 1-100자 | `"D'CENT Wallet"` |
| `universalLink.base` | `string` | O | 유니버셜 링크 도메인 | 유효한 URL | `"https://link.dcentwallet.com"` |
| `universalLink.signPath` | `string` | O | 서명 경로 | `/`로 시작 | `"/waiaas/sign"` |
| `deepLink.scheme` | `string` | X | 커스텀 URL 스킴 | - | `"dcent"` |
| `deepLink.signPath` | `string` | X | 딥링크 서명 경로 | - | `"/waiaas-sign"` |
| `ntfy.requestTopicPattern` | `string` | X | ntfy 토픽 패턴 | `{walletId}` 플레이스홀더 포함 | `"{prefix}-{walletId}"` |
| `supportedChains` | `('solana' \| 'evm')[]` | O | 지원 체인 목록 | 최소 1개 | `['solana', 'evm']` |

#### D'CENT 지갑 설정 예시

```typescript
const dcentConfig: WalletLinkConfig = {
  name: 'dcent',
  displayName: "D'CENT Wallet",
  universalLink: {
    base: 'https://link.dcentwallet.com',
    signPath: '/waiaas/sign',
  },
  deepLink: {
    scheme: 'dcent',
    signPath: '/waiaas-sign',
  },
  ntfy: {
    requestTopicPattern: '{prefix}-{walletId}',
  },
  supportedChains: ['solana', 'evm'],
};
```

### 3.2 registerWallet() 인터페이스

SDK 내부 레지스트리에 지갑 메타데이터를 등록한다. 등록된 지갑 설정은 URL 생성과 채널 선택에 사용된다.

```typescript
/**
 * 지갑 메타데이터를 SDK 내부 레지스트리에 등록한다.
 *
 * - 동일 name으로 중복 등록 시 기존 설정을 덮어씌운다
 * - SDK 초기화 시(앱 시작 시) 호출
 * - 데몬 측 WalletLinkRegistry와는 별개 (SDK는 지갑 앱 내부용)
 *
 * @param config - WalletLinkConfig 스키마를 만족하는 지갑 설정
 * @throws WalletConfigValidationError - Zod 스키마 검증 실패
 */
function registerWallet(config: WalletLinkConfig): void;
```

#### SDK 초기화 예시

```typescript
import { registerWallet, subscribeToRequests } from '@waiaas/wallet-sdk';

// 1. 앱 시작 시 지갑 설정 등록
registerWallet({
  name: 'dcent',
  displayName: "D'CENT Wallet",
  universalLink: {
    base: 'https://link.dcentwallet.com',
    signPath: '/waiaas/sign',
  },
  deepLink: {
    scheme: 'dcent',
    signPath: '/waiaas-sign',
  },
  ntfy: {
    requestTopicPattern: '{prefix}-{walletId}',
  },
  supportedChains: ['solana', 'evm'],
});

// 2. ntfy 서명 요청 구독 시작
const unsubscribe = subscribeToRequests(
  `waiaas-sign-${walletId}`,
  (request) => {
    showSigningUI(request);
  },
);

// 3. 유니버셜 링크 수신 핸들러 등록
registerUniversalLinkHandler('/waiaas/sign', async (url) => {
  const request = await parseSignRequest(url);
  showSigningUI(request);
});
```

### 3.3 지갑 개발사 통합 작업 목록

D'CENT 지갑을 레퍼런스로 한 통합 체크리스트:

#### Phase 1: 인프라 준비

- [ ] **AASA 파일 수정** -- `link.dcentwallet.com/.well-known/apple-app-site-association`에 `"/waiaas/*"` 경로 추가 (doc 73 Section 6.4 참조)
- [ ] **assetlinks.json 확인** -- `link.dcentwallet.com/.well-known/assetlinks.json`에 Android 앱 패키지 등록 확인 (doc 73 Section 6.5 참조)
- [ ] **AndroidManifest.xml** -- `android:pathPrefix="/waiaas"` intent-filter 추가

#### Phase 2: SDK 통합

- [ ] **SDK 설치** -- `npm install @waiaas/wallet-sdk` (React Native 프로젝트)
- [ ] **registerWallet() 호출** -- 앱 시작 시 지갑 설정 등록
- [ ] **URL 핸들러 구현** -- `/waiaas/sign` 경로 수신 시 `parseSignRequest()` 호출 + 서명 UI 표시

#### Phase 3: 서명 플로우 구현

- [ ] **서명 UI 구현** -- `formatDisplayMessage()`로 트랜잭션 상세 표시 + 승인/거부 버튼
- [ ] **서명 생성** -- 지갑 앱 내부 키로 메시지 서명 (EVM: `personal_sign`, Solana: Ed25519)
- [ ] **응답 전송** -- `buildSignResponse()` + `sendViaNtfy()` 또는 `sendViaTelegram()`

#### Phase 4: ntfy 구독 (선택)

- [ ] **ntfy 구독 설정** -- `subscribeToRequests('waiaas-sign-{walletId}')` 백그라운드 구독
- [ ] **푸시 알림 처리** -- ntfy 푸시 알림 수신 시 앱 활성화 + 서명 UI 표시

#### Phase 5: 웹 Fallback (선택)

- [ ] **웹 fallback 페이지 구현** -- `link.dcentwallet.com/waiaas/sign` 웹페이지
  - 앱 미설치 시: 스토어 설치 안내
  - PC 접근 시: QR 코드 표시 (동일 유니버셜 링크 URL 인코딩)

---

## 4. 패키지 구조 + 빌드/배포

### 4.1 디렉토리 구조

```
packages/wallet-sdk/
  src/
    index.ts                        # re-export 공개 API (6개 함수 + 타입 + 에러 클래스)
    schemas.ts                      # SignRequest/SignResponse Zod 스키마 (doc 73에서 정의)
    parse-request.ts                # parseSignRequest()
    build-response.ts               # buildSignResponse()
    display.ts                      # formatDisplayMessage()
    channels/
      ntfy.ts                       # sendViaNtfy(), subscribeToRequests()
      telegram.ts                   # sendViaTelegram()
      index.ts                      # 채널 re-export
    wallet-config.ts                # registerWallet(), WalletLinkConfig, 내부 Registry
    utils/
      base64url.ts                  # base64url encode/decode
      platform.ts                   # detectPlatform() (android/ios/other)
    errors.ts                       # SDK 전용 에러 클래스 (Section 2.7)
  tests/
    parse-request.test.ts           # parseSignRequest 단위 테스트
    build-response.test.ts          # buildSignResponse 단위 테스트
    display.test.ts                 # formatDisplayMessage 단위 테스트
    channels/
      ntfy.test.ts                  # sendViaNtfy, subscribeToRequests 단위 테스트
      telegram.test.ts              # sendViaTelegram 단위 테스트
    wallet-config.test.ts           # registerWallet, WalletLinkConfig 단위 테스트
  package.json
  tsconfig.json
  tsup.config.ts
  README.md
```

#### 파일별 역할

| 파일 | 책임 | 의존 |
|------|------|------|
| `index.ts` | 공개 API re-export | 모든 모듈 |
| `schemas.ts` | SignRequestSchema, SignResponseSchema Zod 정의 + 타입 derive | zod |
| `parse-request.ts` | URL 파싱, base64url 디코딩, Zod 검증, 만료 체크 | schemas, utils/base64url, errors |
| `build-response.ts` | SignResponse 생성, approve 시 signature 필수 검증 | schemas, errors |
| `display.ts` | SignRequest -> 사람 읽기 텍스트 변환 | schemas |
| `channels/ntfy.ts` | ntfy HTTP POST publish, SSE subscribe | schemas, utils/base64url, errors |
| `channels/telegram.ts` | 플랫폼 감지 + Telegram 딥링크/유니버셜 링크 | utils/base64url, utils/platform |
| `wallet-config.ts` | WalletLinkConfigSchema, registerWallet(), 내부 Map 레지스트리 | zod |
| `utils/base64url.ts` | base64url encode/decode (URL-safe, padding 없음) | - |
| `utils/platform.ts` | `detectPlatform()`: userAgent 또는 React Native Platform API | - |
| `errors.ts` | 에러 클래스 계층 (WalletSdkError 기반) | - |

### 4.2 package.json 핵심 설정

```json
{
  "name": "@waiaas/wallet-sdk",
  "version": "0.0.0",
  "description": "WAIaaS Wallet Signing SDK for wallet developers",
  "type": "module",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "zod": "^3.22.0"
  },
  "keywords": ["waiaas", "wallet", "signing", "sdk", "blockchain"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/minhoyoo-iotrust/WAIaaS",
    "directory": "packages/wallet-sdk"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

#### 의존성 설계

| 구분 | 패키지 | 이유 |
|------|--------|------|
| `peerDependencies` | `zod ^3.22.0` | SignRequest/SignResponse 스키마 검증. 호스트 앱(지갑 앱)과 버전 공유 |
| `devDependencies` | `tsup`, `typescript`, `vitest`, `zod` | 빌드, 타입 체크, 테스트 |
| **없음** | `node-fetch`, `eventsource` 등 | `fetch`는 Node.js 18+, React Native, 브라우저 모두 내장. `EventSource`는 SSE용으로 내장 |

**의존성 최소화 원칙**: zod만 peer dependency로 요구한다. fetch, EventSource, URL, TextEncoder 등은 모든 대상 환경에서 내장 제공된다.

### 4.3 빌드 설정 (tsup)

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],             // ESM + CJS dual output
  dts: true,                           // TypeScript 타입 선언 파일 생성
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',                    // Node.js 18+ / React Native Hermes
  treeshake: true,
  minify: false,                       // SDK는 minify하지 않음 (디버깅 편의)
});
```

#### 빌드 출력

```
dist/
  index.js          # ESM (import)
  index.cjs         # CJS (require)
  index.d.ts        # ESM 타입 선언
  index.d.cts       # CJS 타입 선언
  index.js.map      # 소스맵
  index.cjs.map     # 소스맵
```

### 4.4 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 4.5 대상 환경별 호환성

| 환경 | 지원 | fetch | EventSource | URL/URLSearchParams | 비고 |
|------|------|-------|------------|--------------------|----|
| React Native (Hermes) | O | 내장 | 내장 | 내장 | D'CENT 브릿지 앱 등 지갑 앱 메인 타겟 |
| Electron | O | 내장 (Chromium) | 내장 | 내장 | 데스크탑 지갑 앱 |
| Node.js 18+ | O | 내장 (`globalThis.fetch`) | 폴리필 필요 (선택) | 내장 | CLI 도구, 테스트 환경 |
| 브라우저 (모던) | 부분 | 내장 | 내장 | 내장 | `sendViaTelegram`만 사용 가능 (딥링크). ntfy 직접 구독은 CORS 제약 |

#### Node.js EventSource 참고

Node.js 환경에서 `subscribeToRequests()`의 SSE 기능을 사용하려면 EventSource 폴리필이 필요할 수 있다. SDK는 `globalThis.EventSource`가 존재하면 사용하고, 없으면 `fetch` 기반 SSE 파싱으로 fallback한다.

### 4.6 배포

기존 모노레포의 release-please + OIDC Trusted Publishing 파이프라인에 통합한다.

#### release-please 설정 추가

```json
// release-please-config.json에 추가
{
  "packages": {
    "packages/wallet-sdk": {
      "release-type": "node",
      "component": "wallet-sdk",
      "changelog-path": "CHANGELOG.md"
    }
  }
}
```

#### 모노레포 통합

| 항목 | 설정 |
|------|------|
| pnpm workspace | `pnpm-workspace.yaml`에 `packages/wallet-sdk` 추가 |
| turbo | `turbo.json`에 `@waiaas/wallet-sdk` 빌드 태스크 추가 |
| npm publish | 기존 release.yml OIDC Trusted Publishing 파이프라인 자동 적용 |
| CI | `pnpm turbo run lint typecheck test` 기존 파이프라인에 자동 포함 |

#### 배포 순서

1. milestone 브랜치에서 코드 구현 + 테스트
2. PR → main 머지 (conventional commits: `feat(wallet-sdk): ...`)
3. release-please가 자동으로 Release PR 생성
4. Release PR 머지 → npm OIDC Trusted Publishing → `@waiaas/wallet-sdk` 패키지 배포

---

## 5. 데몬 측 컴포넌트 개요

### 5.1 컴포넌트 책임 매트릭스

PENDING_APPROVAL 트랜잭션에 대해 Owner의 서명을 요청하고 응답을 처리하는 데몬 측 6개 컴포넌트의 역할, 의존 관계, 파일 위치를 정리한다.

| 컴포넌트 | 역할 | 의존 | 위치 |
|----------|------|------|------|
| **SignRequestBuilder** | PENDING_APPROVAL 트랜잭션 → SignRequest 생성 + 유니버셜 링크 URL 조립 | WalletLinkRegistry, SettingsService | `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` |
| **SignResponseHandler** | SignResponse 파싱 + 만료/중복/서명 검증 + 트랜잭션 상태 전환 | ownerAuth, TransactionService | `packages/daemon/src/services/signing-sdk/sign-response-handler.ts` |
| **NtfySigningChannel** | ntfy 기반 서명 채널: 요청 토픽 publish + 응답 토픽 SSE subscribe | SettingsService(ntfy_server, 토픽 접두어), fetch | `packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts` |
| **TelegramSigningChannel** | Telegram 기반 서명 채널: Bot API sendMessage + Long Polling /sign_response 핸들러 | TelegramNotificationService(v1.6 Bot 인프라) | `packages/daemon/src/services/signing-sdk/channels/telegram-signing-channel.ts` |
| **WalletLinkRegistry** | 통합 지갑별 유니버셜 링크/딥링크 설정 관리 (CRUD) | SettingsService(signing_sdk.wallets JSON) | `packages/daemon/src/services/signing-sdk/wallet-link-registry.ts` |
| **ApprovalChannelRouter** | 지갑별 승인 채널 5단계 우선순위 라우팅 | SettingsService, WcSigningBridge, NtfySigningChannel, TelegramSigningChannel | `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` |

### 5.2 컴포넌트 간 데이터 흐름

PENDING_APPROVAL 트랜잭션이 발생하면 다음 순서로 데몬 컴포넌트가 동작한다:

```
PENDING_APPROVAL 트랜잭션 발생
  |
  v
ApprovalChannelRouter.resolveChannel(wallet)
  |  5단계 우선순위 라우팅으로 채널 결정
  |  (sdk_ntfy / sdk_telegram / walletconnect / telegram_bot / rest)
  |
  v (sdk_ntfy 또는 sdk_telegram인 경우)
SignRequestBuilder.build(transaction, wallet, channel)
  |  (1) requestId 생성 (UUID v7)
  |  (2) 서명 메시지 텍스트 생성 (doc 73 Section 5 템플릿)
  |  (3) displayMessage 생성
  |  (4) expiresAt 계산 (SettingsService 조회)
  |  (5) responseChannel 구성 (채널별)
  |  (6) SignRequest 조립
  |  (7) 유니버셜 링크 URL 생성 (WalletLinkRegistry)
  |  (8) base64url 인코딩 + 2KB 초과 체크
  |
  v
ISigningChannel.sendRequest(signRequest, universalLinkUrl, wallet)
  |  NtfySigningChannel: ntfy 요청 토픽에 JSON publish (Priority:5, Actions 헤더)
  |  TelegramSigningChannel: Bot API sendMessage (InlineKeyboardMarkup + 유니버셜 링크)
  |
  v [Owner가 지갑 앱에서 서명]
  |
  v
ISigningChannel.waitForResponse(requestId, expiresAt, signal?)
  |  NtfySigningChannel: ntfy 응답 토픽 SSE 구독 → SignResponse 수신
  |  TelegramSigningChannel: Long Polling /sign_response 명령어 핸들러 → Promise resolve
  |
  v
SignResponseHandler.handle(signResponse, sourceChannel, telegramChatId?)
  |  (1) requestId로 원본 SignRequest 조회
  |  (2) 만료 확인 (expiresAt)
  |  (3) 이미 처리 여부 확인 (SIGN_REQUEST_ALREADY_PROCESSED)
  |  (4) signerAddress 검증 (Owner 주소 매칭)
  |  (5) Telegram인 경우 chatId 검증
  |  (6) action=approve: 서명 검증 (ownerAuth EIP-191/Ed25519)
  |  (7) 트랜잭션 상태 전환 (EXECUTING / CANCELLED)
  |  (8) 결과 반환
```

### 5.3 파일 구조

m26-01 구현 시 실제 생성할 파일 목록:

```
packages/daemon/src/services/signing-sdk/
  sign-request-builder.ts          # ISignRequestBuilder 구현
  sign-response-handler.ts         # ISignResponseHandler 구현
  wallet-link-registry.ts          # IWalletLinkRegistry 구현
  channels/
    signing-channel.interface.ts   # ISigningChannel 공통 인터페이스
    ntfy-signing-channel.ts        # NtfySigningChannel 구현
    telegram-signing-channel.ts    # TelegramSigningChannel 구현
  approval-channel-router.ts       # IApprovalChannelRouter 구현
```

#### 기존 코드 재사용 지점

| 기존 모듈 | 마일스톤 | 재사용 대상 | 사용 위치 |
|-----------|---------|------------|----------|
| `NtfyChannel` (알림) | v1.3 | ntfy HTTP publish 로직 | NtfySigningChannel.sendRequest() |
| `TelegramNotificationService` | v1.6 | Bot API sendMessage + Long Polling | TelegramSigningChannel |
| `ownerAuth` | v1.2 | EIP-191/Ed25519 서명 검증 | SignResponseHandler.handle() |
| `WcSigningBridge` | v1.6.1 | WC 세션 활성 여부 확인 | ApprovalChannelRouter.resolveChannel() |
| `TransactionService` | v1.1 | 트랜잭션 상태 전환 (EXECUTING/CANCELLED) | SignResponseHandler.handle() |
| `SettingsService` | v1.4.4 | signing_sdk 키 조회, 런타임 변경 감지 | 전체 컴포넌트 |

---

## 6. SignRequestBuilder + SignResponseHandler

### 6.1 ISignRequestBuilder 인터페이스

PENDING_APPROVAL 상태의 트랜잭션을 입력받아 SignRequest 객체와 유니버셜 링크 URL을 생성한다.

```typescript
interface ISignRequestBuilder {
  build(params: BuildSignRequestParams): Promise<SignRequestResult>;
}

type BuildSignRequestParams = {
  transaction: Transaction;           // PENDING_APPROVAL 상태의 트랜잭션
  wallet: Wallet;                     // 지갑 정보 (chain, owner 주소)
  channel: 'ntfy' | 'telegram';      // 선택된 응답 채널
};

type SignRequestResult = {
  signRequest: SignRequest;
  universalLinkUrl: string;
  deepLinkUrl?: string;               // deepLink 설정이 있는 경우
  responseTopic?: string;             // ntfy 채널인 경우
};
```

#### 의존

| 의존 대상 | 용도 |
|----------|------|
| WalletLinkRegistry | `preferred_wallet` 또는 지갑별 설정에서 유니버셜 링크 정보 조회, URL 생성 |
| SettingsService | `signing_sdk.request_expiry_min`(만료 시간), `signing_sdk.ntfy_request_topic_prefix`/`ntfy_response_topic_prefix`(토픽 접두어), `notifications.ntfy_server`(ntfy 서버 URL) |

#### build() 내부 로직 (7단계)

```typescript
async function build(params: BuildSignRequestParams): Promise<SignRequestResult> {
  const { transaction, wallet, channel } = params;

  // 1. requestId 생성 (UUID v7)
  const requestId = generateUUIDv7();

  // 2. 서명 메시지 텍스트 생성 (doc 73 Section 5 템플릿)
  const message = formatSigningMessage({
    txId: transaction.id,
    type: transaction.type,
    from: transaction.from,
    to: transaction.to,
    amount: transaction.amount,
    symbol: transaction.symbol,
    network: transaction.network,
    policyTier: transaction.policyTier,
    timestamp: new Date().toISOString(),
    nonce: requestId,    // requestId 재사용 (doc 73 Section 5.2)
  });

  // 3. displayMessage 생성 (사람 읽기용 요약)
  const displayMessage = formatDisplaySummary(transaction);

  // 4. expiresAt 계산 (SettingsService에서 만료 시간 조회)
  const expiryMin = await settingsService.get('signing_sdk.request_expiry_min') ?? 30;
  const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000).toISOString();

  // 5. responseChannel 구성 (채널별)
  const responseChannel = channel === 'ntfy'
    ? {
        type: 'ntfy' as const,
        responseTopic: `${await settingsService.get('signing_sdk.ntfy_response_topic_prefix') ?? 'waiaas-response'}-${requestId}`,
        serverUrl: await settingsService.get('notifications.ntfy_server') ?? undefined,
      }
    : {
        type: 'telegram' as const,
        botUsername: await settingsService.get('notifications.telegram_bot_username') ?? '',
      };

  // 6. SignRequest 조립
  const signRequest: SignRequest = {
    version: '1',
    requestId,
    chain: wallet.chain,
    network: wallet.network,
    message,
    displayMessage,
    metadata: {
      txId: transaction.id,
      type: transaction.type,
      from: transaction.from,
      to: transaction.to,
      amount: transaction.amount,
      symbol: transaction.symbol,
      policyTier: transaction.policyTier,
    },
    responseChannel,
    expiresAt,
  };

  // 7. 유니버셜 링크 URL 생성 (WalletLinkRegistry 조회)
  const walletName = await resolveWalletName(wallet);
  const universalLinkUrl = walletLinkRegistry.buildUniversalLinkUrl(walletName, signRequest);
  const deepLinkUrl = walletLinkRegistry.buildDeepLinkUrl(walletName, signRequest);

  // 8. base64url 인코딩 + 2KB 초과 체크
  const encoded = base64url.encode(JSON.stringify(signRequest));
  const fullUrl = `${universalLinkUrl}?data=${encoded}`;

  if (fullUrl.length > 2048) {
    // 2KB 초과 시 requestId 기반 fallback (doc 73 Section 6.7)
    // URL에는 requestId만 포함, 전체 데이터는 ntfy 토픽에서 조회
    const fallbackUrl = walletLinkRegistry.buildUniversalLinkUrl(walletName, signRequest)
      + `?requestId=${requestId}&channel=ntfy&server=${encodeURIComponent(responseChannel.type === 'ntfy' ? responseChannel.serverUrl ?? 'https://ntfy.sh' : 'https://ntfy.sh')}`;
    return {
      signRequest,
      universalLinkUrl: fallbackUrl,
      deepLinkUrl: deepLinkUrl ?? undefined,
      responseTopic: responseChannel.type === 'ntfy' ? responseChannel.responseTopic : undefined,
    };
  }

  return {
    signRequest,
    universalLinkUrl: fullUrl,
    deepLinkUrl: deepLinkUrl ? `${deepLinkUrl}?data=${encoded}` : undefined,
    responseTopic: responseChannel.type === 'ntfy' ? responseChannel.responseTopic : undefined,
  };
}
```

#### resolveWalletName 헬퍼

```typescript
async function resolveWalletName(wallet: Wallet): Promise<string> {
  // 1. 지갑별 owner_approval_method에서 연결된 지갑 이름 조회
  //    (wallet.ownerApprovalMethod → SDK 채널 사용 시 preferred_wallet 참조)
  // 2. 글로벌 signing_sdk.preferred_wallet 조회
  // 3. WalletLinkRegistry에 등록된 첫 번째 지갑 반환
  // 4. 없으면 WALLET_NOT_REGISTERED 에러
  const preferred = await settingsService.get('signing_sdk.preferred_wallet');
  if (preferred) return preferred;

  const allWallets = walletLinkRegistry.getAllWallets();
  if (allWallets.length === 0) throw new WAIaaSError('WALLET_NOT_REGISTERED', 404);
  return allWallets[0].name;
}
```

### 6.2 ISignResponseHandler 인터페이스

ntfy 또는 Telegram 채널에서 수신한 SignResponse를 검증하고 트랜잭션 상태를 전환한다.

```typescript
interface ISignResponseHandler {
  handle(params: HandleSignResponseParams): Promise<HandleSignResponseResult>;
}

type HandleSignResponseParams = {
  signResponse: SignResponse;
  sourceChannel: 'ntfy' | 'telegram';
  telegramChatId?: number;            // telegram 채널인 경우 chatId 검증용
};

type HandleSignResponseResult = {
  action: 'approved' | 'rejected';
  transactionId: string;
};
```

#### 의존

| 의존 대상 | 용도 |
|----------|------|
| ownerAuth | 기존 v1.2 EIP-191/Ed25519 서명 검증 로직 재사용 |
| TransactionService | 트랜잭션 상태 전환 (PENDING_APPROVAL → EXECUTING 또는 CANCELLED) |
| SignRequest 저장소 | requestId → 원본 SignRequest 조회 (메모리 Map 또는 DB) |

#### handle() 내부 로직 (8단계)

```typescript
async function handle(params: HandleSignResponseParams): Promise<HandleSignResponseResult> {
  const { signResponse, sourceChannel, telegramChatId } = params;

  // 1. requestId로 원본 SignRequest 조회
  const signRequest = await findSignRequest(signResponse.requestId);
  if (!signRequest) {
    throw new WAIaaSError('SIGN_REQUEST_NOT_FOUND', 404);
  }

  // 2. 만료 확인 (expiresAt)
  if (new Date() > new Date(signRequest.expiresAt)) {
    throw new WAIaaSError('SIGN_REQUEST_EXPIRED', 408);
  }

  // 3. 이미 처리 여부 확인
  if (signRequest.processed) {
    throw new WAIaaSError('SIGN_REQUEST_ALREADY_PROCESSED', 409);
  }

  // 4. signerAddress 검증 (Owner 주소 매칭)
  const wallet = await findWalletByTransactionId(signRequest.metadata.txId);
  if (signResponse.signerAddress !== wallet.ownerAddress) {
    throw new WAIaaSError('SIGNER_ADDRESS_MISMATCH', 403);
  }

  // 5. Telegram인 경우 chatId 검증
  if (sourceChannel === 'telegram' && telegramChatId) {
    const owner = await findOwnerByChatId(telegramChatId);
    if (!owner || owner.address !== signResponse.signerAddress) {
      throw new WAIaaSError('SIGNER_ADDRESS_MISMATCH', 403);
    }
  }

  // 6. action=approve: 서명 검증 (ownerAuth EIP-191/Ed25519)
  if (signResponse.action === 'approve') {
    if (!signResponse.signature) {
      throw new WAIaaSError('INVALID_SIGN_RESPONSE', 400);
    }

    const isValid = wallet.chain === 'evm'
      ? await verifyEvmSignature(signRequest.message, signResponse.signature, signResponse.signerAddress)
      : verifySolanaSignature(signRequest.message, signResponse.signature, signResponse.signerAddress);

    if (!isValid) {
      throw new WAIaaSError('INVALID_SIGNATURE', 401);
    }
  }

  // 7. 트랜잭션 상태 전환
  const transactionId = signRequest.metadata.txId;
  if (signResponse.action === 'approve') {
    await transactionService.transition(transactionId, 'EXECUTING');
  } else {
    await transactionService.transition(transactionId, 'CANCELLED');
  }

  // SignRequest를 처리 완료로 표시
  await markSignRequestProcessed(signResponse.requestId);

  // 8. 결과 반환
  return {
    action: signResponse.action === 'approve' ? 'approved' : 'rejected',
    transactionId,
  };
}
```

#### 에러 코드 매핑

doc 73 Section 11의 8개 에러 코드를 handle() 검증 단계에 매핑:

| 검증 단계 | 실패 조건 | 에러 코드 | HTTP |
|----------|----------|----------|------|
| 1. requestId 조회 | 해당 요청 없음 | `SIGN_REQUEST_NOT_FOUND` | 404 |
| 2. 만료 확인 | expiresAt 초과 | `SIGN_REQUEST_EXPIRED` | 408 |
| 3. 중복 처리 확인 | 이미 approve/reject 완료 | `SIGN_REQUEST_ALREADY_PROCESSED` | 409 |
| 4. signerAddress 검증 | Owner 주소 불일치 | `SIGNER_ADDRESS_MISMATCH` | 403 |
| 5. chatId 검증 (Telegram) | Telegram chatId 불일치 | `SIGNER_ADDRESS_MISMATCH` | 403 |
| 6-a. signature 존재 확인 | approve인데 signature 없음 | `INVALID_SIGN_RESPONSE` | 400 |
| 6-b. 서명 값 검증 | EIP-191/Ed25519 검증 실패 | `INVALID_SIGNATURE` | 401 |
| (사전 조건) | signing_sdk.enabled = false | `SIGNING_SDK_DISABLED` | 403 |

### 6.3 SignRequest 저장소

SignRequest는 build() 시점에 생성되고 handle() 시점에 조회되므로, 요청과 응답을 매칭하기 위한 임시 저장소가 필요하다.

| 저장 방식 | 장점 | 단점 | 결정 |
|----------|------|------|------|
| 메모리 Map | 단순, 빠름 | 데몬 재시작 시 유실 | **기본 사용** |
| SQLite 테이블 | 영속, 재시작 안전 | 복잡도 증가 | 후속 고려 |

**기본 설계**: `Map<string, StoredSignRequest>` (requestId → SignRequest + metadata)

```typescript
type StoredSignRequest = {
  signRequest: SignRequest;
  transactionId: string;
  walletId: string;
  createdAt: Date;
  processed: boolean;
};
```

- 만료된 요청은 주기적으로 정리 (5분 간격 cleanup)
- 데몬 재시작 시 PENDING_APPROVAL 상태 트랜잭션에 대해 새 SignRequest를 생성하여 재전송

---

## 7. NtfySigningChannel + TelegramSigningChannel

### 7.1 ISigningChannel 공통 인터페이스

ntfy와 Telegram 두 채널을 교체 가능하게 만드는 공통 인터페이스:

```typescript
interface ISigningChannel {
  /** 채널 타입 식별자 */
  readonly type: 'ntfy' | 'telegram';

  /**
   * 서명 요청을 Owner에게 전송한다.
   * - ntfy: 요청 토픽에 JSON publish (Priority:5, Actions 헤더)
   * - telegram: Bot API sendMessage (InlineKeyboardMarkup + 유니버셜 링크)
   */
  sendRequest(signRequest: SignRequest, universalLinkUrl: string, wallet: Wallet): Promise<void>;

  /**
   * 서명 응답을 대기한다.
   * - ntfy: 응답 토픽 SSE 구독 → SignResponse 수신
   * - telegram: /sign_response 명령어 핸들러 → Promise resolve
   *
   * @returns SignResponse 수신 시 resolve, 만료/취소 시 reject
   */
  waitForResponse(requestId: string, expiresAt: Date, signal?: AbortSignal): Promise<SignResponse>;
}
```

### 7.2 NtfySigningChannel 구현 설계

#### 클래스 개요

```typescript
class NtfySigningChannel implements ISigningChannel {
  readonly type = 'ntfy' as const;

  constructor(
    private readonly settingsService: SettingsService,
  ) {}

  async sendRequest(signRequest: SignRequest, universalLinkUrl: string, wallet: Wallet): Promise<void>;
  async waitForResponse(requestId: string, expiresAt: Date, signal?: AbortSignal): Promise<SignResponse>;
}
```

#### sendRequest() -- doc 73 Section 7.2 프로토콜

ntfy 요청 토픽에 서명 요청을 JSON 형태로 publish한다. 기존 v1.3 NtfyChannel의 HTTP publish 로직을 재사용한다.

```typescript
async sendRequest(signRequest: SignRequest, universalLinkUrl: string, wallet: Wallet): Promise<void> {
  const ntfyServer = await this.settingsService.get('notifications.ntfy_server') ?? 'https://ntfy.sh';
  const topicPrefix = await this.settingsService.get('signing_sdk.ntfy_request_topic_prefix') ?? 'waiaas-sign';
  const requestTopic = `${topicPrefix}-${wallet.id}`;

  const body = JSON.stringify({
    topic: requestTopic,
    message: signRequest.displayMessage,
    title: 'WAIaaS Sign Request',
    priority: 5,
    tags: ['waiaas', 'sign'],
    actions: [
      {
        action: 'view',
        label: '지갑에서 승인하기',
        url: universalLinkUrl,
      },
    ],
    click: universalLinkUrl,
  });

  const response = await fetch(`${ntfyServer}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new WAIaaSError('NTFY_PUBLISH_FAILED', response.status,
      `Failed to publish sign request to ntfy topic '${requestTopic}': ${response.status} ${response.statusText}`);
  }
}
```

#### waitForResponse() -- doc 73 Section 7.3 SSE 프로토콜

ntfy 응답 토픽을 SSE로 구독하여 SignResponse를 수신한다.

```typescript
async waitForResponse(requestId: string, expiresAt: Date, signal?: AbortSignal): Promise<SignResponse> {
  const ntfyServer = await this.settingsService.get('notifications.ntfy_server') ?? 'https://ntfy.sh';
  const topicPrefix = await this.settingsService.get('signing_sdk.ntfy_response_topic_prefix') ?? 'waiaas-response';
  const responseTopic = `${topicPrefix}-${requestId}`;

  return new Promise<SignResponse>((resolve, reject) => {
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000;
    let aborted = false;

    // 만료 타이머
    const timeoutMs = expiresAt.getTime() - Date.now();
    const expiryTimer = setTimeout(() => {
      aborted = true;
      reject(new WAIaaSError('SIGN_REQUEST_EXPIRED', 408));
    }, timeoutMs);

    // 외부 AbortSignal 연결
    signal?.addEventListener('abort', () => {
      aborted = true;
      clearTimeout(expiryTimer);
      reject(new Error('Subscription aborted'));
    });

    const connect = async () => {
      if (aborted) return;

      try {
        const response = await fetch(`${ntfyServer}/${responseTopic}/sse`, {
          signal: signal ?? AbortSignal.timeout(timeoutMs),
        });

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            try {
              const ntfyMessage = JSON.parse(data);
              if (ntfyMessage.event === 'message') {
                const decoded = base64url.decode(ntfyMessage.message);
                const parsed = JSON.parse(decoded);
                const signResponse = SignResponseSchema.parse(parsed);

                if (signResponse.requestId === requestId) {
                  clearTimeout(expiryTimer);
                  resolve(signResponse);
                  return;
                }
              }
            } catch {
              // 파싱 실패 시 무시, 구독 유지
            }
          }
        }
      } catch (error) {
        if (aborted) return;
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          connect();
        } else {
          clearTimeout(expiryTimer);
          reject(new Error(`SSE connection failed after ${MAX_RETRIES} retries`));
        }
      }
    };

    connect();
  });
}
```

#### 종료 조건 요약

| 조건 | 동작 | 결과 |
|------|------|------|
| SignResponse 수신 (requestId 매칭) | SSE 종료 + Promise resolve | `SignResponse` 반환 |
| expiresAt 도달 | 타이머 트리거 + SSE 종료 + Promise reject | `SIGN_REQUEST_EXPIRED` 에러 |
| 네트워크 에러 | 재연결 시도 (최대 3회, 5초 간격) | 3회 실패 시 reject |
| AbortSignal abort | SSE 종료 + Promise reject | 취소 에러 |

#### 기존 인프라 재사용

| 재사용 대상 | 출처 | 재사용 지점 |
|------------|------|------------|
| ntfy HTTP publish 로직 | v1.3 `NtfyChannel` | `sendRequest()`의 fetch POST 호출 |
| ntfy 서버 URL 조회 | `SettingsService` `notifications.ntfy_server` | 서버 URL 결정 |
| fetch API | Node.js 22 내장 | SSE 구독 및 publish |

### 7.3 TelegramSigningChannel 구현 설계

#### 클래스 개요

```typescript
class TelegramSigningChannel implements ISigningChannel {
  readonly type = 'telegram' as const;

  // /sign_response 수신 대기 중인 요청들의 Promise resolver
  private readonly pendingResponses = new Map<string, {
    resolve: (response: SignResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(
    private readonly telegramService: TelegramNotificationService,  // v1.6 Bot 인프라
  ) {}

  async sendRequest(signRequest: SignRequest, universalLinkUrl: string, wallet: Wallet): Promise<void>;
  async waitForResponse(requestId: string, expiresAt: Date, signal?: AbortSignal): Promise<SignResponse>;

  /**
   * Telegram Bot Long Polling 핸들러에서 호출되는 내부 메서드.
   * /sign_response 명령어 수신 시 해당 requestId의 Promise를 resolve한다.
   */
  handleSignResponseCommand(chatId: number, signResponse: SignResponse): void;
}
```

#### sendRequest() -- doc 73 Section 8.1 Bot API 프로토콜

기존 v1.6 TelegramNotificationService의 sendMessage를 재사용하여 Owner의 chatId로 서명 요청 메시지를 전송한다.

```typescript
async sendRequest(signRequest: SignRequest, universalLinkUrl: string, wallet: Wallet): Promise<void> {
  const chatId = await this.resolveChatId(wallet);

  // InlineKeyboardMarkup에 유니버셜 링크 포함
  const text = [
    '🔐 WAIaaS 트랜잭션 승인 요청',
    '',
    `To: ${signRequest.metadata.to}`,
    signRequest.metadata.amount
      ? `Amount: ${signRequest.metadata.amount} ${signRequest.metadata.symbol ?? ''}`
      : null,
    `Type: ${signRequest.metadata.type}`,
    `Network: ${signRequest.network}`,
    '',
    `만료: ${signRequest.expiresAt}`,
  ].filter(Boolean).join('\n');

  await this.telegramService.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '지갑에서 승인하기',
            url: universalLinkUrl,
          },
        ],
      ],
    },
  });
}
```

#### waitForResponse() -- Long Polling 기반

기존 Telegram Bot Long Polling에 `/sign_response` 명령어 핸들러를 등록한다. `waitForResponse()` 호출 시 Promise를 생성하고, `/sign_response` 수신 시 `handleSignResponseCommand()`에서 resolve한다.

```typescript
async waitForResponse(requestId: string, expiresAt: Date, signal?: AbortSignal): Promise<SignResponse> {
  return new Promise<SignResponse>((resolve, reject) => {
    // 만료 타이머
    const timeoutMs = expiresAt.getTime() - Date.now();
    const timer = setTimeout(() => {
      this.pendingResponses.delete(requestId);
      reject(new WAIaaSError('SIGN_REQUEST_EXPIRED', 408));
    }, timeoutMs);

    // Promise resolver 등록
    this.pendingResponses.set(requestId, { resolve, reject, timer });

    // 외부 AbortSignal 연결
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      this.pendingResponses.delete(requestId);
      reject(new Error('Subscription aborted'));
    });
  });
}

/**
 * Telegram Bot의 /sign_response 명령어 핸들러에서 호출.
 * 기존 Long Polling 루프에 이 핸들러를 등록한다.
 */
handleSignResponseCommand(chatId: number, signResponse: SignResponse): void {
  const pending = this.pendingResponses.get(signResponse.requestId);
  if (!pending) return; // 대기 중인 요청 없음 (이미 만료/처리됨)

  clearTimeout(pending.timer);
  this.pendingResponses.delete(signResponse.requestId);
  pending.resolve(signResponse);
}
```

#### resolveChatId 헬퍼

```typescript
private async resolveChatId(wallet: Wallet): Promise<number> {
  // Owner의 Telegram chatId를 조회한다.
  // 기존 v1.6 Telegram 알림 설정에서 chatId 매핑을 가져온다.
  // chatId가 없으면 에러 (Telegram 채널 사용 불가)
  const chatId = await this.telegramService.getChatIdForWallet(wallet.id);
  if (!chatId) {
    throw new WAIaaSError('TELEGRAM_CHAT_ID_NOT_FOUND', 400,
      `Telegram chatId not configured for wallet '${wallet.id}'`);
  }
  return chatId;
}
```

#### /sign_response 명령어 등록

기존 Telegram Bot Long Polling 핸들러에 `/sign_response` 명령어를 추가한다:

```typescript
// packages/daemon/src/services/notifications/telegram-notification-service.ts
// 기존 handleUpdate() 메서드에 추가

private handleUpdate(update: TelegramUpdate): void {
  // ... 기존 명령어 핸들러 ...

  // /sign_response 명령어 처리 (SDK 서명 응답)
  if (text.startsWith('/sign_response ')) {
    const base64urlData = text.slice('/sign_response '.length).trim();
    try {
      const json = base64url.decode(base64urlData);
      const parsed = JSON.parse(json);
      const signResponse = SignResponseSchema.parse(parsed);

      // TelegramSigningChannel에 전달
      this.signingChannel?.handleSignResponseCommand(update.message.chat.id, signResponse);

      // 확인 메시지 전송
      this.sendMessage({
        chat_id: update.message.chat.id,
        text: signResponse.action === 'approve'
          ? '서명 응답이 접수되었습니다. 검증 중...'
          : '거부 응답이 접수되었습니다.',
      });
    } catch (error) {
      this.sendMessage({
        chat_id: update.message.chat.id,
        text: '서명 응답 형식이 올바르지 않습니다.',
      });
    }
  }
}
```

#### 기존 인프라 재사용

| 재사용 대상 | 출처 | 재사용 지점 |
|------------|------|------------|
| `sendMessage()` | v1.6 `TelegramNotificationService` | `sendRequest()`의 Bot API 메시지 전송 |
| Long Polling 루프 | v1.6 `TelegramNotificationService.handleUpdate()` | `/sign_response` 명령어 핸들러 등록 |
| chatId 매핑 | v1.6 알림 설정 | `resolveChatId()` 조회 |

#### Telegram 3중 보안 (doc 73 Section 8.4)

| 확인 단계 | 방법 | 설명 |
|----------|------|------|
| 1차: chatId | `message.chat.id` → Owner 조회 | Telegram 메시지 발신자가 등록된 Owner인지 확인 |
| 2차: signerAddress | `SignResponse.signerAddress === owner.address` | 서명자 주소가 Owner 등록 주소와 일치 |
| 3차: 서명 검증 | ownerAuth (EIP-191/Ed25519) | 서명이 해당 주소의 개인키로 생성되었는지 검증 |

---

## 8. WalletLinkRegistry + ApprovalChannelRouter

### 8.1 IWalletLinkRegistry 인터페이스

통합 지갑별 유니버셜 링크/딥링크 설정을 관리한다. 저장소는 SettingsService의 `signing_sdk.wallets` 키에 JSON 배열로 저장한다 (별도 DB 테이블 없이 settings 테이블 활용).

```typescript
interface IWalletLinkRegistry {
  /**
   * 등록된 지갑의 링크 설정을 조회한다.
   * @throws WALLET_NOT_REGISTERED - 미등록 지갑
   */
  getWalletLink(walletName: string): WalletLinkConfig;

  /** 등록된 모든 지갑 설정 목록을 반환한다. */
  getAllWallets(): WalletLinkConfig[];

  /**
   * 유니버셜 링크 URL을 생성한다.
   * @returns {universalLink.base}{universalLink.signPath}?data={base64url(SignRequest)} 형태의 URL
   */
  buildUniversalLinkUrl(walletName: string, signRequest: SignRequest): string;

  /**
   * 딥링크 URL을 생성한다 (deepLink 설정이 있는 경우).
   * @returns {deepLink.scheme}://{deepLink.signPath}?data={base64url(SignRequest)} 또는 null
   */
  buildDeepLinkUrl(walletName: string, signRequest: SignRequest): string | null;
}
```

#### 저장 구조

SettingsService의 `signing_sdk.wallets` 키에 JSON 배열로 저장한다:

```typescript
// settings 테이블
// key: "signing_sdk.wallets"
// value: JSON string
[
  {
    "name": "dcent",
    "displayName": "D'CENT Wallet",
    "universalLink": {
      "base": "https://link.dcentwallet.com",
      "signPath": "/waiaas/sign"
    },
    "deepLink": {
      "scheme": "dcent",
      "signPath": "/waiaas-sign"
    },
    "ntfy": {
      "requestTopicPattern": "{prefix}-{walletId}"
    },
    "supportedChains": ["solana", "evm"]
  }
]
```

**설계 근거**: 지갑 등록 수는 소수(일반적으로 1-3개)이므로 별도 테이블 없이 JSON 배열로 충분하다. SettingsService의 기존 캐시/무효화 패턴을 그대로 활용한다.

#### CRUD 관리

| 작업 | 경로 | 설명 |
|------|------|------|
| 조회 | `SettingsService.get('signing_sdk.wallets')` | JSON 파싱 → WalletLinkConfig[] |
| 추가/수정 | Admin UI > System > Settings > Signing SDK | JSON 배열에 항목 추가/수정 → SettingsService.set() |
| 삭제 | Admin UI에서 항목 제거 | JSON 배열에서 해당 name 항목 제거 → SettingsService.set() |

#### 캐시

SettingsService 값 변경 시 캐시가 자동 무효화된다 (기존 SettingsService 패턴):

```typescript
class WalletLinkRegistry implements IWalletLinkRegistry {
  private cache: WalletLinkConfig[] | null = null;

  constructor(private readonly settingsService: SettingsService) {
    // SettingsService의 onChange 이벤트 구독
    this.settingsService.on('change', (key) => {
      if (key === 'signing_sdk.wallets') {
        this.cache = null;
      }
    });
  }

  private async loadWallets(): Promise<WalletLinkConfig[]> {
    if (this.cache) return this.cache;
    const json = await this.settingsService.get('signing_sdk.wallets');
    const parsed = json ? JSON.parse(json) : [];
    this.cache = parsed.map((w: unknown) => WalletLinkConfigSchema.parse(w));
    return this.cache!;
  }
}
```

#### URL 생성 로직

```typescript
buildUniversalLinkUrl(walletName: string, signRequest: SignRequest): string {
  const config = this.getWalletLink(walletName);
  return `${config.universalLink.base}${config.universalLink.signPath}`;
  // 호출자가 ?data= 쿼리 파라미터를 추가한다 (SignRequestBuilder.build() 참조)
}

buildDeepLinkUrl(walletName: string, signRequest: SignRequest): string | null {
  const config = this.getWalletLink(walletName);
  if (!config.deepLink) return null;
  return `${config.deepLink.scheme}://${config.deepLink.signPath}`;
  // 호출자가 ?data= 쿼리 파라미터를 추가한다
}
```

### 8.2 IApprovalChannelRouter 인터페이스

지갑별 승인 채널을 5단계 우선순위로 결정한다.

```typescript
interface IApprovalChannelRouter {
  /**
   * 지갑에 대한 최적의 승인 채널을 결정한다.
   * 5단계 우선순위 fallback 로직을 적용한다.
   */
  resolveChannel(wallet: Wallet): Promise<ResolvedChannel>;
}

type ResolvedChannel = {
  type: 'sdk_ntfy' | 'sdk_telegram' | 'walletconnect' | 'telegram_bot' | 'rest';
  signingChannel?: ISigningChannel;    // sdk_ntfy / sdk_telegram 시 해당 채널 인스턴스
};
```

#### 의존

| 의존 대상 | 용도 |
|----------|------|
| SettingsService | `signing_sdk.enabled`, `signing_sdk.preferred_channel` 조회 |
| WcSigningBridge | WalletConnect 세션 활성 여부 확인 (기존 v1.6.1) |
| NtfySigningChannel | sdk_ntfy 채널 인스턴스 |
| TelegramSigningChannel | sdk_telegram 채널 인스턴스 |
| TelegramNotificationService | Telegram chatId 설정 여부 확인 |

#### 라우팅 로직 의사코드 (5단계 우선순위)

```
resolveChannel(wallet):

  1. wallet.ownerApprovalMethod가 설정됨?
     → YES: 해당 채널 반환
       - 'sdk_ntfy'       → { type: 'sdk_ntfy', signingChannel: ntfySigningChannel }
       - 'sdk_telegram'   → { type: 'sdk_telegram', signingChannel: telegramSigningChannel }
       - 'walletconnect'  → { type: 'walletconnect' }
       - 'telegram_bot'   → { type: 'telegram_bot' }
       - 'rest'           → { type: 'rest' }
     → NO: 2단계로

  2. signing_sdk.enabled === true?
     → NO: 4단계로

  3. signing_sdk.preferred_channel 확인
     → 'ntfy':     { type: 'sdk_ntfy', signingChannel: ntfySigningChannel }
     → 'telegram': { type: 'sdk_telegram', signingChannel: telegramSigningChannel }

  4. WalletConnect 세션 활성? (wcSigningBridge.hasActiveSession(wallet.id))
     → YES: { type: 'walletconnect' }
     → NO: 5단계로

  5. Telegram chatId 설정됨? (telegramService.getChatIdForWallet(wallet.id))
     → YES: { type: 'telegram_bot' }
     → NO: { type: 'rest' }
```

#### 구현

```typescript
class ApprovalChannelRouter implements IApprovalChannelRouter {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly wcSigningBridge: WcSigningBridge,
    private readonly ntfySigningChannel: NtfySigningChannel,
    private readonly telegramSigningChannel: TelegramSigningChannel,
    private readonly telegramService: TelegramNotificationService,
  ) {}

  async resolveChannel(wallet: Wallet): Promise<ResolvedChannel> {
    // 1. 지갑별 owner_approval_method 우선
    if (wallet.ownerApprovalMethod) {
      return this.resolveFromMethod(wallet.ownerApprovalMethod);
    }

    // 2. signing_sdk.enabled 확인
    const sdkEnabled = await this.settingsService.get('signing_sdk.enabled');
    if (sdkEnabled) {
      // 3. preferred_channel로 SDK 채널 결정
      const preferredChannel = await this.settingsService.get('signing_sdk.preferred_channel') ?? 'ntfy';
      if (preferredChannel === 'ntfy') {
        return { type: 'sdk_ntfy', signingChannel: this.ntfySigningChannel };
      }
      return { type: 'sdk_telegram', signingChannel: this.telegramSigningChannel };
    }

    // 4. WalletConnect 세션 확인
    const hasWcSession = await this.wcSigningBridge.hasActiveSession(wallet.id);
    if (hasWcSession) {
      return { type: 'walletconnect' };
    }

    // 5. Telegram chatId 확인
    const chatId = await this.telegramService.getChatIdForWallet(wallet.id);
    if (chatId) {
      return { type: 'telegram_bot' };
    }

    // 최종 fallback: REST API
    return { type: 'rest' };
  }

  private resolveFromMethod(method: string): ResolvedChannel {
    switch (method) {
      case 'sdk_ntfy':
        return { type: 'sdk_ntfy', signingChannel: this.ntfySigningChannel };
      case 'sdk_telegram':
        return { type: 'sdk_telegram', signingChannel: this.telegramSigningChannel };
      case 'walletconnect':
        return { type: 'walletconnect' };
      case 'telegram_bot':
        return { type: 'telegram_bot' };
      case 'rest':
      default:
        return { type: 'rest' };
    }
  }
}
```

---

## 9. SettingsService signing_sdk 키

### 9.1 키 정의

m26-01 objective에서 정의된 6개 키 + 지갑 목록 JSON을 공식화한다.

| 키 | 타입 | 기본값 | 검증 | 설명 |
|----|------|--------|------|------|
| `signing_sdk.enabled` | boolean | `false` | - | SDK 전체 활성/비활성. `false` 시 ApprovalChannelRouter가 SDK 채널 건너뜀 |
| `signing_sdk.request_expiry_min` | number | `30` | min:1, max:1440 | 서명 요청 유효 시간(분). SignRequestBuilder.build()에서 expiresAt 계산에 사용 |
| `signing_sdk.preferred_channel` | string | `"ntfy"` | enum: `ntfy`, `telegram` | 글로벌 기본 응답 채널. owner_approval_method 미설정 + SDK 활성 시 사용 |
| `signing_sdk.preferred_wallet` | string | `null` | WalletLinkRegistry에 등록된 name이어야 함 | 글로벌 기본 지갑. resolveWalletName() fallback에 사용 |
| `signing_sdk.ntfy_request_topic_prefix` | string | `"waiaas-sign"` | regex: `^[a-z0-9-]+$` | ntfy 요청 토픽 접두어. 토픽 이름: `{prefix}-{walletId}` |
| `signing_sdk.ntfy_response_topic_prefix` | string | `"waiaas-response"` | regex: `^[a-z0-9-]+$` | ntfy 응답 토픽 접두어. 토픽 이름: `{prefix}-{requestId}` |

### 9.2 signing_sdk.wallets (JSON 배열)

WalletLinkRegistry의 저장소로 사용되는 JSON 배열:

| 키 | 타입 | 기본값 | 검증 | 설명 |
|----|------|--------|------|------|
| `signing_sdk.wallets` | JSON string | `"[]"` | WalletLinkConfigSchema[] 배열 | 등록된 지갑 목록 (Section 3.1 WalletLinkConfig 스키마 준수) |

저장 예시:

```json
[
  {
    "name": "dcent",
    "displayName": "D'CENT Wallet",
    "universalLink": {
      "base": "https://link.dcentwallet.com",
      "signPath": "/waiaas/sign"
    },
    "deepLink": {
      "scheme": "dcent",
      "signPath": "/waiaas-sign"
    },
    "ntfy": {
      "requestTopicPattern": "{prefix}-{walletId}"
    },
    "supportedChains": ["solana", "evm"]
  }
]
```

### 9.3 ntfy 서버 URL

ntfy 서버 URL은 별도 signing_sdk 키를 추가하지 않고 기존 알림 설정을 재사용한다:

| 키 | 위치 | 용도 |
|----|------|------|
| `notifications.ntfy_server` | 기존 SettingsService 키 | 서명 채널과 알림 채널 모두에서 공유 |

**설계 근거**: 서명 채널과 알림 채널은 동일한 ntfy 서버를 사용하지만, 토픽 접두어(`waiaas-sign-*` vs `waiaas-notify-*`)로 완전히 분리된다. 별도 서버 URL을 추가하면 설정이 중복되고 불일치 위험이 생긴다.

### 9.4 Admin UI 표시 위치

System > Settings > Signing SDK 섹션에 7개 설정을 표시한다:

```
┌─────────────────────────────────────────────────────┐
│  Signing SDK                                         │
│                                                      │
│  Enabled           [Toggle: Off]                     │
│  Request Expiry    [30] min  (1-1440)               │
│  Preferred Channel [ntfy ▼]                          │
│  Preferred Wallet  [Select wallet... ▼]              │
│                                                      │
│  ntfy Topics                                         │
│  Request Prefix    [waiaas-sign]                     │
│  Response Prefix   [waiaas-response]                 │
│                                                      │
│  Registered Wallets                                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ D'CENT Wallet                   [Edit] [Del] │   │
│  │ dcent | solana, evm              │   │
│  │ https://link.dcentwallet.com/waiaas/sign     │   │
│  └──────────────────────────────────────────────┘   │
│  [+ Add Wallet]                                     │
│                                                      │
│  [Save]                                             │
└─────────────────────────────────────────────────────┘
```

---

## 10. wallets.owner_approval_method 컬럼 + REST API

### 10.1 DB 스키마 변경

wallets 테이블에 `owner_approval_method` 컬럼을 추가하여 지갑별 승인 방법을 설정한다.

#### SQL 마이그레이션

```sql
ALTER TABLE wallets ADD COLUMN owner_approval_method TEXT;
-- CHECK (owner_approval_method IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest'))
```

| 항목 | 값 |
|------|-----|
| 컬럼명 | `owner_approval_method` |
| 타입 | `TEXT` |
| NULL 허용 | YES (NULL = 글로벌 fallback, Section 8.2 라우팅 로직 적용) |
| CHECK 제약 | `IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest')` |
| 마이그레이션 버전 | 기존 `schema_version` 테이블 패턴 따름 |

#### 허용 값

| 값 | 설명 | 연동 마일스톤 |
|----|------|-------------|
| `sdk_ntfy` | WAIaaS SDK + ntfy 직접 푸시 (메신저 불필요) | m26-01 |
| `sdk_telegram` | WAIaaS SDK + Telegram 메신저 중계 | m26-01 |
| `walletconnect` | WalletConnect v2 세션 기반 | v1.6.1 |
| `telegram_bot` | Telegram Bot `/approve` 텍스트 명령 | v1.6 |
| `rest` | REST API 직접 호출 (서명 수동 생성) | v1.2 |
| `NULL` (미설정) | 글로벌 config 기본 우선순위 fallback | - |

#### Drizzle 스키마 변경

```typescript
// packages/daemon/src/infrastructure/database/schema/wallets.ts
import { text, sqliteTable } from 'drizzle-orm/sqlite-core';

export const wallets = sqliteTable('wallets', {
  // ... 기존 컬럼 ...

  /** 지갑별 Owner 승인 방법. NULL = 글로벌 fallback */
  ownerApprovalMethod: text('owner_approval_method'),
});
```

Zod 검증 (Zod SSoT 원칙):

```typescript
const OwnerApprovalMethodSchema = z.enum([
  'sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest',
]).nullable();
```

### 10.2 REST API 변경

#### PUT /v1/wallets/:id/owner -- 요청 스키마 변경

기존 `approval_method` optional 필드를 추가한다:

```typescript
// 기존 스키마
const UpdateOwnerSchema = z.object({
  owner_address: z.string(),
});

// 변경 후 스키마
const UpdateOwnerSchema = z.object({
  owner_address: z.string(),
  approval_method: z.enum([
    'sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest',
  ]).optional(),    // optional: 생략 시 기존 값 유지, 명시적으로 null 전송 시 초기화
});
```

**요청 예시:**

```json
{
  "owner_address": "0x1234...5678",
  "approval_method": "sdk_ntfy"
}
```

**검증 규칙:**

| 조건 | 결과 | HTTP |
|------|------|------|
| `approval_method`가 유효한 enum 값 | 정상 처리, DB 업데이트 | 200 |
| `approval_method`가 유효하지 않은 값 | 에러 | 400 `"Invalid approval method"` |
| `approval_method` 생략 | 기존 값 유지 (NULL 또는 이전 설정) | 200 |
| `approval_method: null` (명시적) | NULL로 초기화 (글로벌 fallback) | 200 |
| Owner 미등록 지갑에 `approval_method` 설정 시도 | 에러 | 400 `"Owner must be registered first"` |

#### GET /v1/wallets/:id -- 응답 스키마 변경

응답에 `owner_approval_method` 필드를 포함한다:

```json
{
  "id": "01935a3b-7c8d-7e00-b123-456789abcdef",
  "name": "my-wallet",
  "chain": "evm",
  "network": "ethereum-mainnet",
  "address": "0x1234...5678",
  "owner_address": "0xabcd...ef01",
  "owner_status": "LOCKED",
  "owner_approval_method": "sdk_ntfy",
  "created_at": "2026-02-19T14:00:00Z"
}
```

`owner_approval_method`는 설정되지 않은 경우 `null`로 반환된다.

### 10.3 Admin UI 변경

지갑 상세 페이지의 Owner Settings 섹션에 Approval Method 라디오 버튼을 추가한다:

```
┌─────────────────────────────────────────────────┐
│  Owner Settings                                  │
│                                                  │
│  Owner Address    0x1234...5678                  │
│  Owner Status     LOCKED                         │
│                                                  │
│  Approval Method                                 │
│  (*) Use default (from config)                   │
│  ( ) D'CENT + ntfy (SDK direct push)            │
│  ( ) D'CENT + Telegram (SDK messenger)          │
│  ( ) WalletConnect                              │
│  ( ) Telegram Bot (/approve command)            │
│  ( ) Manual REST API                            │
│                                                  │
│  [Save]                                         │
└─────────────────────────────────────────────────┘
```

#### UI 동작 규칙

| 조건 | UI 동작 |
|------|--------|
| Owner 미등록 | Approval Method 라디오 전체 비활성(disabled). "Register an owner first" 안내 텍스트 |
| Owner 등록됨 | 라디오 활성. 현재 설정값 선택 상태. "Use default" = `NULL` |
| SDK 옵션 선택 + `signing_sdk.enabled` = false | 경고: "Signing SDK is not enabled. Enable it in System > Settings." |
| SDK 옵션 선택 + `signing_sdk.wallets` = [] | 경고: "No wallet registered. Register a wallet in System > Settings > Signing SDK." |
| sdk_ntfy 선택 + `notifications.ntfy_server` 미설정 | 경고: "ntfy is not configured. Configure ntfy server in System > Settings > Notifications." |
| sdk_telegram 선택 + Telegram chatId 미설정 | 경고: "Telegram chat not configured for this wallet." |

#### SDK 옵션 라벨

`signing_sdk.wallets`에 등록된 지갑 목록을 기반으로 SDK 옵션 라벨에 지갑 이름을 표시한다:

- 지갑 1개 등록: `D'CENT + ntfy (SDK direct push)`, `D'CENT + Telegram (SDK messenger)`
- 지갑 미등록: `SDK + ntfy (no wallet registered)`, `SDK + Telegram (no wallet registered)`
- 다중 지갑: `preferred_wallet`에 설정된 지갑 이름을 표시. 미설정 시 첫 번째 지갑

---

## 11. 기술 결정 요약

Phase 199(Wallet SDK + 데몬 컴포넌트 설계)에서 내린 설계 결정을 정리한다.

### 11.1 SDK 측 결정 (Plan 01)

| # | 결정 항목 | 선택 | 근거 |
|---|----------|------|------|
| 1 | parseSignRequest 반환 타입 | `SignRequest \| Promise<SignRequest>` | data 파라미터(인라인) → 동기, requestId(ntfy 조회) → 비동기. 호출자는 `await`로 통일 가능 |
| 2 | SDK 외부 의존성 | zod만 peerDependency | fetch, EventSource, URL, TextEncoder는 모든 타겟 환경(React Native/Electron/Node.js 18+)에서 내장 |
| 3 | 빌드 포맷 | tsup ESM + CJS dual output, ES2022 타겟 | React Native Hermes, Node.js 18+, Electron 모두 지원 |
| 4 | sendViaTelegram 반환 타입 | `void` (동기) | URL 스킴 호출(tg://, https://t.me/)은 비동기 결과 확인 불가. fallback 체인: Android → iOS → clipboard |

### 11.2 데몬 측 결정 (Plan 02)

| # | 결정 항목 | 선택 | 근거 |
|---|----------|------|------|
| 5 | ISigningChannel 공통 인터페이스 | ntfy/telegram 채널 교체 가능 | sendRequest() + waitForResponse() 2메서드로 통일. 향후 Slack/Discord 채널 추가 시 동일 인터페이스 구현 |
| 6 | WalletLinkRegistry 저장소 | SettingsService `signing_sdk.wallets` JSON 배열 | 지갑 등록 수가 소수(1-3개)이므로 별도 테이블 불필요. SettingsService 캐시/무효화 패턴 재사용 |
| 7 | ApprovalChannelRouter 5단계 fallback | wallet.ownerApprovalMethod → SDK → WC → Telegram Bot → REST | 지갑별 설정 최우선, 글로벌 SDK 설정 차순위, 기존 인프라(WC/Telegram/REST) 순차 fallback |
| 8 | owner_approval_method CHECK 제약 | `IN ('sdk_ntfy', 'sdk_telegram', 'walletconnect', 'telegram_bot', 'rest')` + NULL 허용 | NULL = 글로벌 fallback (ApprovalChannelRouter 라우팅 진입). 유효하지 않은 값은 DB 레벨에서 차단 |
| 9 | SignRequest 임시 저장소 | 메모리 Map (기본), SQLite (후속 고려) | 데몬 재시작 시 PENDING_APPROVAL TX에 대해 새 SignRequest 재생성. 단순 + 빠름 우선 |
| 10 | ntfy 서버 URL | 기존 `notifications.ntfy_server` 재사용 | 서명 채널과 알림 채널이 동일 서버를 공유. 별도 키 추가 시 설정 중복/불일치 위험 |
| 11 | Telegram /sign_response 핸들러 | 기존 Long Polling handleUpdate()에 명령어 추가 | 별도 webhook 없이 기존 Bot 인프라를 확장. chatId + signerAddress + 서명의 3중 보안 |

### 11.3 문서 메타데이터

| 항목 | 값 |
|------|-----|
| 문서 번호 | 74 |
| 문서 제목 | Wallet SDK + Daemon Components |
| 생성일 | 2026-02-20 |
| 최종 수정 | 2026-02-20 |
| 선행 문서 | 73 (Signing Protocol v1) |
| 관련 마일스톤 | m26-00 (설계), m26-01 (구현) |
| 범위 | @waiaas/wallet-sdk 공개 API 6개 함수 + 데몬 컴포넌트 6개 인터페이스 + SettingsService 7키 + DB 스키마 + REST API |
| 전체 섹션 수 | 11 |
| SDK 공개 함수 | parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests |
| 데몬 컴포넌트 | SignRequestBuilder, SignResponseHandler, NtfySigningChannel, TelegramSigningChannel, WalletLinkRegistry, ApprovalChannelRouter |

---

*문서 번호: 74*
*생성일: 2026-02-20*
*최종 수정: 2026-02-20*
*선행 문서: 73(Signing Protocol v1)*
*관련 마일스톤: m26-00(설계), m26-01(구현)*
*범위: @waiaas/wallet-sdk 공개 API + 데몬 컴포넌트 인터페이스*
