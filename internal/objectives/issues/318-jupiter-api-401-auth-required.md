# #318 — Jupiter API 401 Unauthorized — 인증 필수 전환 대응

- **Type:** BUG
- **Severity:** HIGH
- **Status:** FIXED
- **Component:** `packages/actions/src/providers/jupiter-swap/`

## 증상

`jupiter_swap/swap` 액션 실행 시 Jupiter API 401 에러:

```
ACTION_RESOLVE_FAILED: API error 401: {"code":401,"message":"Unauthorized"}
```

직접 API 호출도 동일하게 401 반환:

```bash
$ curl -s 'https://api.jup.ag/swap/v1/quote?inputMint=So111...&outputMint=EPjF...&amount=5000000&slippageBps=50'
{"code":401,"message":"Unauthorized"}
```

## 원인

Jupiter API(`https://api.jup.ag/swap/v1`)가 최근 **인증 필수**(API 키 또는 토큰 필요)로 변경됨. 이전에는 무료 공개 API였으나 현재 401 반환.

프로바이더 메타데이터에 `requiresApiKey: false`로 등록되어 있어 사용자가 API 키를 설정하지 않은 상태.

## 수정 방향

1. Jupiter 현재 인증 방식 확인 (API 키 발급, 헤더 형식)
2. 대안 API 엔드포인트 존재 여부 확인 (무료 공개 엔드포인트, Jupiter Ultra API 등)
3. `requiresApiKey`를 `true`로 변경하고 Admin Settings에서 Jupiter API 키 설정 유도
4. `config.ts`의 `apiBaseUrl` 업데이트 (엔드포인트 변경 시)
5. API 키 미설정 시 명확한 에러 메시지 반환 (현재 401 원문 노출)

## 관련 파일

- `packages/actions/src/providers/jupiter-swap/config.ts` (apiBaseUrl)
- `packages/actions/src/providers/jupiter-swap/jupiter-api-client.ts` (API 키 헤더)
- `packages/actions/src/index.ts` (requiresApiKey 메타데이터)

## 테스트 항목

- [ ] API 키 설정 후 Jupiter swap 정상 동작
- [ ] API 키 미설정 시 명확한 에러 메시지 반환
- [ ] Admin Settings에서 Jupiter API 키 설정 가능
- [ ] 프로바이더 메타데이터 `requiresApiKey: true` 반영
