# #222 Push Relay ntfy SSE gzip 미해제로 JSON 파싱 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.9
- **상태:** OPEN

## 증상

Push Relay 서버가 ntfy SSE 스트림을 구독할 때, ntfy 서버가 gzip 압축된 응답을 보내면 JSON 파싱 에러 발생:

```
[push-relay] Error: Unexpected token '�', "��bs�i�>�"... is not valid JSON
```

## 원인

`packages/push-relay/src/subscriber/ntfy-subscriber.ts:74`에서 `fetch()` 호출 시 `Accept-Encoding` 헤더를 지정하지 않음.

```typescript
// 현재 코드 (line 73-74)
const url = `${this.opts.ntfyServer}/${topic}/sse`;
const res = await fetch(url, { signal: controller.signal });
```

Node.js의 `fetch()`(undici 기반)는 gzip 응답을 자동 해제하지 않는 경우가 있어, ntfy 서버가 `Content-Encoding: gzip`으로 응답하면 `TextDecoder`가 압축된 바이너리를 UTF-8 텍스트로 해석 → `JSON.parse()` 실패.

## 수정 방안

`fetch()` 호출에 `Accept-Encoding: identity` 헤더 추가하여 ntfy 서버가 비압축 응답을 보내도록 요청:

```typescript
const res = await fetch(url, {
  signal: controller.signal,
  headers: { 'Accept-Encoding': 'identity' },
});
```

## 영향 범위

- Push Relay의 **모든 ntfy 토픽 구독** (서명 요청 + 일반 알림)
- ntfy.sh(공용 서버) 및 자체 호스팅 ntfy 서버 모두 해당
- 구독 자체는 `connected: true`로 표시되지만 메시지 수신이 전혀 안 됨

## 테스트 항목

- [ ] gzip 응답하는 ntfy 서버 구독 시 JSON 파싱 에러 없이 메시지 수신 확인
- [ ] `Accept-Encoding: identity` 헤더 추가 후 SSE 스트림 정상 수신 확인
- [ ] 기존 비압축 ntfy 서버와의 호환성 유지 확인
