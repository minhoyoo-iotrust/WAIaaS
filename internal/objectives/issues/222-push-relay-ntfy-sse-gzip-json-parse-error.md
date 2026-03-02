# #222 Push Relay ntfy SSE gzip 미해제로 JSON 파싱 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.10
- **상태:** FIXED

## 증상

Push Relay 서버가 ntfy SSE 스트림을 구독할 때 JSON 파싱 에러 발생:

```
[push-relay] Error: Unexpected token 'X', "Xi)�'�q�"... is not valid JSON
```

`0x5869`는 유효한 zlib deflate 헤더 (CINFO=5, CM=8, 체크섬 통과). ntfy 서버가 deflate 압축된 SSE 응답을 보내고 있으나, 클라이언트가 이를 해제하지 못함.

## 원인

`packages/push-relay/src/subscriber/ntfy-subscriber.ts:74-77`에서 `Accept-Encoding: identity` 헤더를 명시적으로 설정:

```typescript
const res = await fetch(url, {
  signal: controller.signal,
  headers: { 'Accept-Encoding': 'identity' },
});
```

**문제:** `Accept-Encoding: identity`를 보내면:
1. ntfy 서버(ntfy.sh 공용 서버, Cloudflare CDN 뒤)가 이 헤더를 무시하고 deflate/gzip 압축 응답을 전송
2. Node.js undici는 `identity`를 요청했기 때문에 auto-decompression을 수행하지 않음
3. 압축된 바이너리가 `TextDecoder`를 통해 UTF-8로 해석 → `JSON.parse()` 실패

**이전 수정(3e0bd42b)이 역방향:** 원래 코드는 `Accept-Encoding` 헤더가 없었고(undici 기본값으로 auto-decompress 가능), "수정"에서 `identity`를 추가하여 오히려 문제를 유발.

## 수정 방안

`Accept-Encoding: identity` 헤더를 **제거**하여 undici 기본 동작(압축 협상 + 자동 해제)을 사용:

```typescript
const res = await fetch(url, {
  signal: controller.signal,
});
```

Node.js 22 undici의 기본 동작:
1. `Accept-Encoding: br, gzip, deflate` 전송
2. 서버 응답의 `Content-Encoding`에 따라 자동 decompress
3. `res.body` 스트림이 이미 해제된 텍스트 데이터 제공

## 영향 범위

- Push Relay의 **모든 ntfy 토픽 구독** (서명 요청 + 일반 알림)
- ntfy.sh(공용 서버, Cloudflare CDN) 및 CDN/프록시 뒤의 자체 호스팅 ntfy 서버
- 구독 자체는 `connected: true`로 표시되지만 메시지 수신이 전혀 안 됨

## 테스트 항목

- [ ] `Accept-Encoding: identity` 제거 후 ntfy.sh 공용 서버 SSE 스트림 정상 수신 확인
- [ ] 자체 호스팅 ntfy 서버(비압축)와의 호환성 유지 확인
- [ ] SSE 이벤트가 `data: {...}` JSON 형식으로 정상 파싱되는지 확인
- [ ] 장시간 연결에서 스트림 decompression 안정성 확인
