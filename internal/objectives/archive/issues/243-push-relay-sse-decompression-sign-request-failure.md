# 243 — Push Relay SSE 압축 해제 반복 실패로 서명 요청 미수신

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **마일스톤:** —
- **관련 이슈:** #222, #235, #236, #238 (동일 근본 원인 — 5회차 재발)

## 증상

- 데몬에서 서명 요청이 ntfy sign_topic으로 정상 발송됨 (확인됨)
- Push Relay가 sign_topic SSE 스트림에서 수신한 데이터를 파싱 실패
- 에러: `Unexpected token 'b', "b··yǢ··Z~)^j·Zr····" is not valid JSON`
- 일반 알림(notify_topic)은 수신되지만 서명 요청(sign_topic)만 실패
- curl로 동일 포맷 직접 발송해도 같은 에러 발생 → 데몬 포맷 문제 아님 확인

## 원인 분석

### 직접 원인
`ntfy-subscriber.ts`의 `fetch()` (Node.js undici) SSE 연결에서 ntfy.sh (Cloudflare CDN)가 보내는 압축(brotli/gzip) 응답을 자동 디코딩하지 못함. 압축된 바이너리가 TextDecoder → JSON.parse 경로로 전달되어 파싱 실패.

### 토픽별 차이 원인
sign_topic과 notify_topic은 각각 **별도 SSE 연결** (`subscribeTopic()` → `connectSse()`)을 생성. Cloudflare CDN의 압축 결정이 연결 단위로 달라질 수 있어 한쪽만 실패 가능. 서명 요청 메시지가 `actions`, `click` 필드를 포함해 더 크므로 압축 적용 확률이 높음.

### 수정 히스토리 (4회 수정 후 재발)
| 이슈 | 시도 | 결과 |
|------|------|------|
| #222 | `Accept-Encoding: identity` 헤더 추가 | Cloudflare가 헤더 무시 — gzip 그대로 전송 |
| #235 | node:http 수동 decompression | 복잡성 증가, 불완전 |
| #236 | undici fetch() 완전 제거 → node:http | 동작했으나 유지보수 부담 |
| #238 | 다시 fetch()로 단순화 | 재발 — 현재 상태 |

## 재현 방법

1. Push Relay를 실행하여 임의의 sign_topic을 구독하게 함
2. `send-test-sign-request.sh` 스크립트로 해당 sign_topic에 서명 요청 발송
3. Push Relay 로그에서 `Unexpected token` JSON 파싱 에러 확인

```bash
# 테스트 토픽으로 전송 (실제 토픽 대신 테스트용 토픽 사용)
SIGN_TOPIC=waiaas-sign-test-$(openssl rand -hex 4) ./send-test-sign-request.sh
```

## 수정 방향

undici `fetch()`의 SSE auto-decompression이 Cloudflare CDN 환경에서 본질적으로 불안정함이 4회 수정으로 확인됨. 근본적 해결 필요:

1. **`node:http`/`node:https` + 명시적 decompression** — `zlib.createGunzip()` / `zlib.createBrotliDecompress()`를 `Content-Encoding` 헤더 기반으로 파이프라인 구성. `fetch()` 의존성 완전 제거.
2. **Self-hosted ntfy** — CDN 압축 경로를 우회. 운영 복잡성 증가.
3. **EventSource polyfill** (eventsource 패키지) — SSE 전용 라이브러리가 decompression 처리. 의존성 추가.

**적용:** 옵션 1. `node:http`/`node:https` + 명시적 zlib decompression. undici `fetch()` 완전 제거하여 Cloudflare CDN 스트리밍 압축의 비결정적 동작을 근본적으로 회피.

## 테스트 항목

- [ ] sign_topic SSE 메시지 수신 + JSON 파싱 성공 (서명 요청)
- [ ] notify_topic SSE 메시지 수신 유지 (일반 알림 — 사이드 이펙트 없음)
- [ ] gzip 압축 응답 정상 해제
- [ ] brotli 압축 응답 정상 해제
- [ ] 비압축(identity) 응답 정상 처리
- [ ] SSE 연결 끊김 후 재연결 시 동일 안정성 유지
- [ ] `send-test-sign-request.sh` 스크립트로 E2E 검증
