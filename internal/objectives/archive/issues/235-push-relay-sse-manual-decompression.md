# #235 Push Relay ntfy SSE 스트림 수동 decompression 필요 — #222 수정 불완전

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-02
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-02

## 증상

Push Relay가 ntfy.sh SSE 스트림 구독 시 JSON 파싱 에러 재발:

```
[push-relay] Error: Unexpected token 'X', "Xi+^���'"... is not valid JSON
```

#222에서 `Accept-Encoding: identity` 헤더를 제거하여 undici auto-decompression에 의존하도록 수정했으나, ntfy.sh(Cloudflare CDN 뒤) SSE 스트림에서 동일 증상 재발.

## 원인

Node.js 22 undici의 `fetch()` auto-decompression이 SSE(스트리밍) 응답에서 안정적으로 동작하지 않음:

1. ntfy.sh(Cloudflare CDN)가 `Content-Encoding: deflate/gzip` 응답 전송
2. undici가 `Accept-Encoding: gzip, deflate, br` 협상 수행
3. 그러나 스트리밍 `ReadableStream` 읽기 시 auto-decompression이 적용되지 않는 경우 발생
4. 압축된 바이너리(`0x5869` = zlib deflate 헤더)가 `TextDecoder`로 UTF-8 해석 → `JSON.parse()` 실패

`packages/push-relay/src/subscriber/ntfy-subscriber.ts:77-79` — 현재 코드:

```typescript
const res = await fetch(url, {
  signal: controller.signal,
});
```

## 수정 방안

응답의 `Content-Encoding` 헤더를 확인하고 수동 decompression 파이프라인 적용:

```typescript
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { Readable } from 'node:stream';

// ... connectSse() 내부:
const res = await fetch(url, { signal: controller.signal });

const contentEncoding = res.headers.get('content-encoding');
let bodyStream = res.body as ReadableStream<Uint8Array>;

if (contentEncoding && contentEncoding !== 'identity' && bodyStream) {
  const nodeStream = Readable.fromWeb(bodyStream as any);
  let decompressor;
  if (contentEncoding === 'gzip' || contentEncoding === 'x-gzip') {
    decompressor = createGunzip();
  } else if (contentEncoding === 'deflate') {
    decompressor = createInflate();
  } else if (contentEncoding === 'br') {
    decompressor = createBrotliDecompress();
  }
  if (decompressor) {
    const decompressed = nodeStream.pipe(decompressor);
    bodyStream = Readable.toWeb(decompressed) as ReadableStream<Uint8Array>;
  }
}

const reader = bodyStream.getReader();
```

## 영향 범위

- `packages/push-relay/src/subscriber/ntfy-subscriber.ts` — `connectSse()` 메서드에 수동 decompression 추가

## 테스트 항목

- [ ] ntfy.sh 공용 서버(Cloudflare CDN) SSE 스트림 정상 수신 확인
- [ ] 자체 호스팅 ntfy 서버(비압축) 정상 수신 확인
- [ ] gzip/deflate/br 각 Content-Encoding 처리 확인
- [ ] Content-Encoding 없는 응답(identity) 정상 처리 확인
- [ ] 장시간 SSE 연결에서 decompression 안정성 확인
- [ ] 재연결 시 decompressor 리소스 정리 확인
