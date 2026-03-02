# #236 Push Relay ntfy SSE 압축 해제 3회 수정 후 재발 — undici fetch() 환경별 동작 불일치

- **유형:** BUG
- **심각도:** CRITICAL
- **발견일:** 2026-03-02
- **마일스톤:** —
- **상태:** FIXED
- **선행 이슈:** #222, #235

## 증상

Push Relay v2.9.0-rc.13 (이슈 #234, #235 수정 포함)에서 ntfy SSE 스트림 구독 시 동일 에러 재발:

```
[push-relay] Error: Unexpected token 'X', "Xi+^⬛⬛'"... is not valid JSON
```

`0x5869`는 유효한 zlib deflate 헤더(CMF=0x58, FLG=0x69). 압축된 바이너리가 JSON.parse()에 도달하고 있음.

## 수정 이력 (3회 시도, 3회 실패)

| 시도 | 커밋 | 전략 | 실패 원인 |
|------|------|------|-----------|
| 1차 (#222 최초 수정) | `3e0bd42b` | `Accept-Encoding: identity` 설정 | ntfy.sh/Cloudflare CDN이 헤더를 무시하고 압축 응답 전송 → undici가 identity를 요청했으므로 auto-decompress 안 함 |
| 2차 (#222 재수정) | `718a8b0f` | `Accept-Encoding: identity` 제거, undici 기본 auto-decompress에 의존 | SSE 스트리밍 응답에서 undici auto-decompress가 환경에 따라 불안정 |
| 3차 (#235) | `312963df` | `Content-Encoding` 헤더 확인 후 수동 decompression | undici의 환경별 동작 불일치 — 아래 상세 분석 참조 |

## 근본 원인 분석

### Node.js 22 undici `fetch()`의 환경별 동작 불일치

Node.js 22의 `fetch()` (undici 기반)가 SSE 압축 응답을 처리할 때, **네트워크 환경에 따라** 4가지 상이한 동작을 보인다:

| 시나리오 | Content-Encoding 헤더 | Body 자동 압축 해제 | #235 수동 코드 동작 | 결과 |
|----------|----------------------|--------------------|--------------------|------|
| A) CDN 압축 + undici 정상 | 유지 (`deflate`) | O (자동 해제) | 이중 압축 해제 시도 → zlib 에러 | **실패** |
| B) CDN 압축 + undici 헤더 제거 | 제거 (`null`) | X (미해제) | 헤더 없으므로 skip | **실패** (현재 사용자 환경) |
| C) 서버 미압축 | 없음 (`null`) | 해당 없음 | skip | 정상 |
| D) CDN 압축 + undici 정상 해제 + 헤더 유지 | 유지 | O | 이중 해제 | **실패** |

**현재 사용자 환경은 시나리오 B**: Cloudflare CDN이 ntfy SSE 응답을 압축하지만, Node.js undici가 `Content-Encoding` 헤더를 제거하면서 실제 body는 압축 해제하지 않음.

### 검증 결과

로컬 테스트 서버(HTTP/1.1)에서의 동작:

```
Content-Encoding: deflate  ← 헤더 유지됨
Body: event: open\n...      ← 자동 압축 해제됨 (시나리오 A 또는 D)
```

ntfy.sh 직접 접속(한국/CDN 없이):

```
Content-Encoding: null      ← 헤더 없음
Body: event: open\n...      ← 원래 미압축 (시나리오 C)
```

사용자 환경(ntfy.sh, Cloudflare CDN 경유):

```
Content-Encoding: null(?)   ← undici가 제거 추정
Body: Xi+^⬛⬛'...          ← 압축 상태 그대로 (시나리오 B)
```

### #235 코드가 시나리오 B에서 실패하는 이유

```typescript
// ntfy-subscriber.ts:90-107
const contentEncoding = res.headers.get('content-encoding');  // → null (undici 제거)
if (contentEncoding && contentEncoding !== 'identity') {      // → false: 분기 진입 안 함
  // 수동 decompression 코드 — 실행되지 않음
}
// → 압축된 바이너리가 그대로 reader로 전달 → JSON.parse 실패
```

### 왜 테스트에서 발견되지 않았는가

`ntfy-subscriber.test.ts`는 `vi.spyOn(globalThis, 'fetch')`로 모킹:
- 모킹된 `Response` 객체는 `Content-Encoding` 헤더를 정직하게 유지
- undici의 헤더 제거 동작을 재현하지 않음
- 동기 압축(gzipSync/deflateSync)으로 스트리밍 환경 미재현

## 해결 방안

### 방안 A: `undici.request()` 직접 사용 (권장)

`fetch()` 대신 undici의 저수준 `request()` API를 사용하여 auto-decompression을 완전히 우회:

```typescript
import { request } from 'undici';

const { statusCode, headers, body } = await request(url, {
  method: 'GET',
  signal: controller.signal,
  headers: { 'Accept': 'text/event-stream' },
});

if (statusCode !== 200) {
  throw new Error(`SSE connection failed for ${topic}: HTTP ${statusCode}`);
}

// undici.request()는 auto-decompress하지 않음 → 헤더 신뢰 가능
const contentEncoding = headers['content-encoding'];
let readable: Readable = body;

if (contentEncoding && contentEncoding !== 'identity') {
  let decompressor;
  if (contentEncoding === 'gzip' || contentEncoding === 'x-gzip') {
    decompressor = createGunzip();
  } else if (contentEncoding === 'deflate') {
    decompressor = createInflate();
  } else if (contentEncoding === 'br') {
    decompressor = createBrotliDecompress();
  }
  if (decompressor) {
    readable = body.pipe(decompressor);
  }
}

// Node.js Readable → Web ReadableStream 변환 후 기존 reader 로직 사용
const bodyStream = Readable.toWeb(readable) as ReadableStream<Uint8Array>;
const reader = bodyStream.getReader();
```

**장점:**
- undici `request()`는 fetch() Spec의 auto-decompression을 수행하지 않음
- 응답 헤더가 원본 그대로 보존됨
- body가 Node.js Readable로 직접 반환되어 스트림 변환이 줄어듦
- 기존 수동 decompression 로직이 모든 환경에서 안정적으로 동작

**주의:**
- `undici`는 Node.js 22에 내장되어 있으나 `import { request } from 'undici'` 필요
- 반환 body 타입이 `Readable`이므로 `Readable.toWeb()` 변환 필요 (또는 Node.js Readable API로 직접 읽기)
- `signal` 옵션으로 AbortController 연동 지원

### 방안 B: Magic Bytes 기반 압축 감지 (보조 안전장치)

헤더에 의존하지 않고 응답 body의 첫 바이트로 압축 형식을 감지:

```typescript
// 첫 청크 읽기 후 압축 감지
const firstChunk = await reader.read();
if (!firstChunk.done) {
  const bytes = firstChunk.value;
  let encoding: string | null = null;

  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    encoding = 'gzip';
  } else if ((bytes[0] & 0x0f) === 0x08 && bytes.length > 1) {
    // deflate: CMF byte의 CM 필드가 8 (deflate method)
    encoding = 'deflate';
  }

  if (encoding) {
    // 첫 청크 + 나머지 스트림을 decompressor로 파이프
    // ...
  }
}
```

**장점:** 헤더 무관하게 작동
**단점:** 첫 청크를 소비한 후 스트림 재구성이 복잡; brotli 감지 불안정

### 방안 C: `Accept-Encoding: identity` + Magic Bytes 폴백

```typescript
const res = await fetch(url, {
  signal: controller.signal,
  headers: {
    'Accept': 'text/event-stream',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-transform',  // CDN에 변환 금지 요청
  },
});
```

**장점:** 대부분의 서버/CDN이 `no-transform`을 존중
**단점:** Cloudflare 무료 티어는 `Cache-Control: no-transform`을 무시할 수 있음; #222에서 실패한 접근법의 확장

### 권장 순서

**방안 A**를 주 구현, **방안 B**의 magic bytes 감지를 안전장치로 추가.

## 영향 범위

- `packages/push-relay/src/subscriber/ntfy-subscriber.ts` — `connectSse()` 메서드 전면 교체
- `packages/push-relay/src/__tests__/ntfy-subscriber.test.ts` — undici.request() 모킹으로 테스트 업데이트
- 실제 환경 차이(CDN 유무, HTTP/1.1 vs HTTP/2)를 테스트에 반영

## 테스트 항목

- [ ] `undici.request()` 전환 후 ntfy.sh SSE 스트림 정상 수신 확인 (CDN 경유 환경)
- [ ] `Content-Encoding: deflate` 응답에서 수동 decompression 정상 동작 확인
- [ ] `Content-Encoding: gzip` 응답에서 수동 decompression 정상 동작 확인
- [ ] `Content-Encoding: br` 응답에서 수동 decompression 정상 동작 확인
- [ ] 비압축 응답(Content-Encoding 없음)에서 정상 동작 확인
- [ ] 비압축 응답 + `Content-Encoding: identity`에서 정상 동작 확인
- [ ] 장시간 SSE 연결(1시간 이상)에서 decompression 안정성 확인
- [ ] 재연결 시 decompressor 리소스 정리 확인
- [ ] AbortController signal 전파 확인 (graceful shutdown)
- [ ] undici.request() API가 Node.js 22에서 정상 import 확인
- [ ] magic bytes 기반 압축 감지 안전장치 작동 확인 (헤더 누락 시)
- [ ] 기존 모킹 기반 테스트를 undici.request() 모킹으로 전환
