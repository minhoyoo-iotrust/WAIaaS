# #238 Push Relay SSE 구독을 fetch()로 단순화 — node:http 수동 디컴프레션 제거

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **발견일:** 2026-03-03
- **마일스톤:** —
- **상태:** FIXED
- **선행 이슈:** #222, #235, #236

## 증상

Push Relay의 ntfy SSE 구독 코드(`ntfy-subscriber.ts`)에서 디컴프레션 관련 버그가 4회 반복 발생(#222 → #235 → #236 → 최종 node:http 전환). 동일 ntfy 서버를 구독하는 Wallet SDK(`wallet-sdk/src/channels/ntfy.ts`)는 한 번도 문제가 없었음.

## 근본 원인

Push Relay와 Wallet SDK의 구현 방식이 근본적으로 다름:

| | Wallet SDK (`fetch`) | Push Relay (`node:http`) |
|---|---|---|
| HTTP 클라이언트 | undici `fetch()` | `node:http`/`node:https` `get()` |
| 디컴프레션 | **자동** (undici 내부 처리) | **수동** (`Content-Encoding` 헤더 확인 + zlib pipe) |
| Stream API | WHATWG ReadableStream (`getReader()`) | Node.js Readable (`on('data')`) |
| 디컴프레션 코드 | **0줄** | **~15줄** (헤더 분기 + pipe 연결) |
| 총 코드량 | **~30줄** | **~90줄** |

Wallet SDK는 `fetch()` 한 줄로 SSE 연결 후 `res.body.getReader()`로 읽기만 하면 되는데, Push Relay는 `node:http`로 연결 → `Content-Encoding` 헤더 확인 → `createUnzip()`/`createBrotliDecompress()` pipe → Node.js Readable 이벤트 리스너 패턴을 사용. 수동 디컴프레션 경로가 존재하는 한 CDN/프로토콜 변경에 따라 버그 재발 가능성이 있음.

### Wallet SDK 코드 (정상 동작, ~10줄)

```typescript
const res = await fetch(url, { signal: abortController.signal });
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (!abortController.signal.aborted) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // ... SSE line 파싱
}
```

### Push Relay 코드 (복잡, ~50줄)

```typescript
const req = getter(url, { headers: { 'Accept': 'text/event-stream' } }, resolve);
// ... status 확인
const encoding = res.headers['content-encoding'];
if (encoding === 'gzip' || encoding === 'x-gzip' || encoding === 'deflate') {
  dataStream = res.pipe(createUnzip());
} else if (encoding === 'br') {
  dataStream = res.pipe(createBrotliDecompress());
}
// ... AbortController 연결
dataStream.on('data', (chunk) => { /* SSE line 파싱 */ });
dataStream.on('end', () => resolve());
dataStream.on('error', (err) => reject(err));
res.on('close', () => resolve());
```

## 수정 방안

Push Relay의 `NtfySubscriber.connectSse()`를 Wallet SDK와 동일한 `fetch()` 기반으로 전환:

1. `node:http`/`node:https` import 제거, `node:zlib` import 제거
2. `connectSse()`를 `fetch()` + `res.body.getReader()` + `TextDecoder` 패턴으로 재작성
3. 수동 `Content-Encoding` 분기 및 zlib pipe 로직 전체 제거
4. AbortController 시그널을 `fetch()` 옵션으로 직접 전달 (현재 `req.destroy()` 수동 연결 불필요)
5. 기존 테스트를 `fetch()` 기반으로 전환 (node:http 테스트 서버는 유지 가능)

## 기대 효과

- 디컴프레션 관련 버그 재발 원천 차단 (수동 디컴프레션 코드 자체가 없어짐)
- 코드량 ~60% 감소 (~90줄 → ~35줄)
- Wallet SDK와 동일 패턴으로 유지보수 용이

## 테스트 항목

- [ ] `fetch()` 기반 SSE 연결 + 미압축 응답 정상 수신
- [ ] ntfy.sh(Cloudflare CDN) gzip 압축 응답 자동 해제 확인
- [ ] AbortController signal → fetch abort 정상 전파 (graceful shutdown)
- [ ] 연결 실패 시 exponential backoff reconnect 유지
- [ ] 동적 토픽 추가/제거 (addTopics/removeTopics) 정상 동작
- [ ] 메시지 파싱 + walletName 라우팅 기존 동작 보존
- [ ] 기존 ntfy-subscriber.test.ts 전체 통과
