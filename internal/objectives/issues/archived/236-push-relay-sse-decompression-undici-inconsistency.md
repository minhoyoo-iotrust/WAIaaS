# #236 Push Relay ntfy SSE 압축 해제 4회 수정 후 재발 — undici fetch() 완전 제거 필요

- **유형:** BUG
- **심각도:** CRITICAL
- **발견일:** 2026-03-02
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-02
- **선행 이슈:** #222, #235

## 증상

Push Relay v2.9.0-rc.14 (이슈 #236 magic-bytes 감지 수정 포함)에서 ntfy SSE 스트림 구독 시 동일 에러 재발:

```
[push-relay] Error: Unexpected token 'X', "Xi+^⬛⬛'"... is not valid JSON
```

압축된 바이너리(deflate 헤더 `0x5869`)가 JSON.parse()에 도달하고 있음.

## 근본 원인

undici `fetch()`의 auto-decompression 동작이 **HTTP/2 + Cloudflare CDN** 환경에서 스트리밍 응답의 **일부 청크만** 처리하는 불안정 동작. 4차례 우회 시도(identity 헤더, auto-decompress 의존, Content-Encoding 헤더 확인, magic-bytes 감지) 모두 undici의 비결정적 동작으로 실패.

## 수정 내용

`fetch()`를 완전히 제거하고 `node:http`/`node:https`의 `get()`으로 교체:

- `connectSse()`를 `node:http`/`node:https` 기반으로 전면 재작성
- `Content-Encoding` 헤더 기반 decompression (`pipe(createUnzip())` / `pipe(createBrotliDecompress())`)
- `isLikelyCompressed()`, `selectDecompressor()`, `buildDecompressedReader()`, `buildPassthroughReader()` 헬퍼 제거
- 테스트를 `node:http` `createServer()` 기반 통합 테스트로 전환

## 테스트 항목

- [x] `node:http` 기반 SSE 연결 + 미압축 응답 정상 수신
- [x] `Content-Encoding: deflate` 응답에서 `pipe(createUnzip())` 정상 해제
- [x] `Content-Encoding: gzip` 응답에서 `pipe(createUnzip())` 정상 해제
- [x] `Content-Encoding: br` 응답에서 `pipe(createBrotliDecompress())` 정상 해제
- [x] 비압축 응답(Content-Encoding 없음)에서 직접 읽기
- [x] AbortController signal → `req.destroy()` 전파 확인 (graceful shutdown)
- [x] HTTP/HTTPS URL 자동 판별
- [x] 연결 실패 시 exponential backoff reconnect 정상 동작
- [x] 기존 테스트를 `node:http` 기반 통합 테스트로 전환
