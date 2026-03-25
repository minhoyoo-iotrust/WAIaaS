# #461 — Admin UI 테스트 서명 요청이 여전히 base64 래핑 포맷으로 전송됨

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **등록일:** 2026-03-26
- **관련 이슈:** #456 (Push Relay 서명 요청 payload 포맷 불일치)
- **발견 경위:** Push Relay 디버그 로그에서 Admin 테스트 서명 요청의 `request` 필드가 base64 blob으로 전송되는 것 확인

## 현상

Admin UI의 "Test Sign Request" 기능(`POST /admin/wallet-apps/:id/test-sign-request`)이 D'CENT 기대 포맷(플랫 필드)이 아닌 base64 래핑 포맷으로 Push Relay에 전송한다.

**현재 (base64 래핑 — D'CENT 파싱 불가):**
```json
{
  "title": "WAIaaS Test Sign Request",
  "body": "Test sign request for D'CENT Wallet",
  "request": "eyJ2ZXJzaW9uIjoiMSIs..."
}
```

**기대 (플랫 필드 — D'CENT 정상 파싱):**
```json
{
  "title": "WAIaaS Test Sign Request",
  "body": "Test sign request for D'CENT Wallet",
  "version": "1",
  "requestId": "019d2589-04c0-...",
  "caip2ChainId": "eip155:1",
  "signerAddress": "0x0000...",
  "message": "WAIaaS Test Sign Request for D'CENT Wallet\n...",
  "displayMessage": "Test sign request for D'CENT Wallet",
  "expiresAt": "2026-03-25T15:07:39.888Z",
  "metadata": "{\"txId\":\"test-019d2589\",\"type\":\"SIGN\",...}",
  "responseChannel": "{\"type\":\"push_relay\"}"
}
```

## 근본 원인

**push payload 구성 로직이 2곳에 중복 존재하여 #456 수정 시 1곳이 누락됨.**

| 경로 | 파일 | #456에서 수정 여부 |
|------|------|-------------------|
| 실제 서명 채널 | `push-relay-signing-channel.ts` (line 111-125) | **수정됨** — 플랫 필드 |
| Admin 테스트 서명 | `wallet-apps.ts` (line 369-384) | **누락** — base64 래핑 그대로 |

#450에서 Admin 테스트 서명 엔드포인트를 추가할 때, `PushRelaySigningChannel`을 재사용하지 않고 fetch로 직접 Push Relay를 호출하는 별도 코드를 작성했다. 이로 인해 payload 구성 로직이 중복되었고, #456에서 포맷을 수정할 때 한 곳만 반영되어 불일치가 발생했다.

#456 이슈의 테스트 항목 4번("Admin UI 테스트 서명 요청 → Push Relay 통합 테스트")이 명시되어 있었으나 실제 수정에 반영되지 않았다.

## 수정 방안

**payload 구성 로직을 공유 헬퍼로 추출하여 중복 제거.**

1. `buildSignRequestPushPayload(request: SignRequest): Record<string, string>` 헬퍼를 `push-relay-signing-channel.ts`에 export하거나 별도 유틸로 추출
   - `version`, `requestId`, `caip2ChainId`, `networkName`, `signerAddress`, `message`, `displayMessage`, `expiresAt` → 플랫 전달
   - `metadata`, `responseChannel` → `JSON.stringify()` 직렬화
   - `title`, `body` 포함
2. `PushRelaySigningChannel.sendRequest()` — 헬퍼 호출로 교체
3. `wallet-apps.ts` 테스트 엔드포인트 — 동일 헬퍼 호출로 교체, base64 인코딩 코드 제거

> `PushRelaySigningChannel` 자체를 재사용하지 않는 이유: 테스트 엔드포인트는 long-polling 등 부수효과 없이 독립적으로 동작해야 하므로, payload 구성만 공유하는 것이 적절하다.

## 테스트 항목

- [ ] Admin 테스트 서명 요청 payload에 플랫 필드(`version`, `requestId`, `caip2ChainId`, `signerAddress` 등)가 포함되는지 확인
- [ ] payload에 base64 인코딩된 `request` 필드가 더 이상 포함되지 않는지 확인
- [ ] `metadata`/`responseChannel`이 JSON 문자열로 직렬화되는지 확인
- [ ] `PushRelaySigningChannel.sendRequest()`와 테스트 엔드포인트가 동일한 헬퍼를 사용하는지 확인
- [ ] 실제 Push Relay 경유 Pushwoosh 전달에서 D'CENT 기대 포맷과 일치하는지 E2E 확인
