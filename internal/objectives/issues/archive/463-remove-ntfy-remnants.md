# #463 — wallet-sdk 및 데몬에 ntfy.sh 잔재 코드 잔존

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **등록일:** 2026-03-26
- **관련:** v32.9 (Push Relay 직접 연동, ntfy.sh 제거)

## 현상

v32.9에서 ntfy.sh를 완전히 제거하고 Push Relay 직접 연동으로 전환했으나, wallet-sdk와 데몬에 ntfy 관련 코드가 잔존한다. Push Relay 서버는 `responseTopic`을 전혀 사용하지 않으며, ntfy 채널 함수는 호출처가 없다.

## 영향 범위

### wallet-sdk (`packages/wallet-sdk`)

1. **`src/channels/ntfy.ts`** — 파일 전체 삭제 대상
   - `sendViaNtfy()` — deprecated, Push Relay로 대체됨
   - `subscribeToRequests()` — deprecated, Push Relay device registration으로 대체
   - `subscribeToNotifications()` — deprecated, Push Relay로 대체
   - `parseNotification()` — deprecated, Push Relay로 대체

2. **`src/channels/relay.ts`** — `sendViaRelay()` 함수
   - `responseTopic` 파라미터 제거 (서버가 무시하는 필드)
   - JSDoc에서 ntfy 참조 제거 ("ntfy response topic" 등)

3. **`src/channels/index.ts`** — ntfy export 제거
   - `sendViaNtfy`, `subscribeToRequests`, `subscribeToNotifications`, `parseNotification` export 삭제

4. **`src/index.ts`** — ntfy export 및 JSDoc deprecated 항목 제거

5. **`src/parse-request.ts`** — ntfy fetch 모드 제거
   - `fetchSignRequestFromNtfy()` 함수 삭제
   - `parseSignRequest()`에서 `requestId` 파라미터 분기 제거 (inline `data` 모드만 유지)

6. **테스트 파일**
   - `src/__tests__/channels.test.ts` — `sendViaNtfy`, `subscribeToRequests`, `subscribeToNotifications`, `parseNotification`, SSE edge case 테스트 전체 삭제; `sendViaRelay` 테스트에서 `responseTopic` assertion 수정
   - `src/__tests__/parse-request.test.ts` — ntfy fetch 모드 테스트 삭제 (requestId 파라미터 기반 테스트 전부)

### 데몬 (`packages/daemon`)

7. **`SendRequestResult` 인터페이스** — `responseTopic` 필드 제거
   - `src/services/signing-sdk/channels/push-relay-signing-channel.ts:51-55`
   - `src/services/signing-sdk/channels/telegram-signing-channel.ts:41-45`
   - 양쪽 `sendRequest()` 반환값에서 `responseTopic: ''` 제거

8. **테스트 파일** — `responseTopic` assertion 제거
   - `src/__tests__/push-relay-signing-channel.test.ts:201`
   - `src/__tests__/telegram-signing-channel.test.ts:150`
   - `src/__tests__/approval-channel-router.test.ts:61,72`
   - `src/__tests__/signing-sdk-lifecycle.test.ts:102,113`

### core (`packages/core`)

9. **`src/__tests__/signing-protocol.test.ts`** — ntfy type 관련 테스트 정리
   - line 283-289: `type: 'ntfy'` 테스트 (이미 reject되므로 삭제 가능)
   - line 300-303: `type: 'discord'` 테스트의 `responseTopic` 참조 제거

## 수정 방향

- ntfy.ts 파일 삭제, relay.ts에서 `responseTopic` 파라미터 제거
- parse-request.ts에서 ntfy fetch 모드 제거 (inline data 전용)
- `SendRequestResult`에서 `responseTopic` 필드 제거
- 관련 테스트 정리 (ntfy 테스트 삭제, responseTopic assertion 제거)
- wallet-sdk public API에서 ntfy 함수 export 제거 (breaking change — 이미 deprecated)

## 테스트 항목

- [ ] wallet-sdk 빌드 성공 확인 (ntfy export 제거 후 타입 에러 없음)
- [ ] `parseSignRequest()` inline data 모드 정상 동작 확인
- [ ] `sendViaRelay()` 시그니처 변경 후 정상 동작 확인
- [ ] 데몬 `sendRequest()` 반환값에 `responseTopic` 없음 확인
- [ ] 전체 테스트 통과 (`pnpm turbo run test`)
- [ ] 타입체크 통과 (`pnpm turbo run typecheck`)
