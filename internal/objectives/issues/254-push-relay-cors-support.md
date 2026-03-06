# 254 — Push Relay 서버 CORS 미들웨어 추가

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** —

## 현상

지갑 앱(D'CENT WebView, `http://192.168.0.101:5173`)에서 Push Relay 서버(`http://192.168.0.43:3200/devices`)로 디바이스 등록 요청 시 CORS 에러로 차단됨. 브라우저 네트워크 탭에서 Status: —, No response headers로 표시.

## 원인

Push Relay 서버(`packages/push-relay/src/server.ts`)에 CORS 미들웨어가 없음. 브라우저가 cross-origin 요청 전 보내는 preflight `OPTIONS` 요청에 `Access-Control-Allow-Origin` 등 CORS 헤더가 응답에 포함되지 않아 본 요청이 차단됨.

## 수정 방안

`server.ts`에 Hono 빌트인 `hono/cors` 미들웨어 추가.

```typescript
import { cors } from 'hono/cors';

// createServer 내부
app.use('/*', cors());
```

## 영향 범위

- `packages/push-relay/src/server.ts` 1개 파일 수정
- 외부 의존성 추가 없음 (Hono 빌트인)

## 테스트 항목

- [ ] cross-origin 요청 시 `Access-Control-Allow-Origin` 헤더 응답 확인
- [ ] preflight OPTIONS 요청에 200 응답 확인
- [ ] `X-API-Key` 커스텀 헤더가 `Access-Control-Allow-Headers`에 포함 확인
- [ ] 기존 same-origin 요청 동작 유지 확인
