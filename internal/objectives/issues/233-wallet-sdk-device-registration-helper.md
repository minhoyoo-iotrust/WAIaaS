# #233 Wallet SDK에 Push Relay 디바이스 등록 헬퍼 추가

- **유형:** MISSING
- **심각도:** MEDIUM
- **발견일:** 2026-03-02
- **마일스톤:** —

## 현상

Wallet SDK(`@waiaas/wallet-sdk`)에 Push Relay 디바이스 등록/해제 및 subscription token 조회 함수가 없다. 지갑 앱 개발자가 Push Relay 시나리오를 구현하려면 REST API를 직접 호출해야 한다.

v29.10(#230, #231)에서 subscription token 기반 토픽 라우팅이 도입되면서, 지갑 앱은 다음 흐름을 수동으로 구현해야 한다:

1. `POST {pushRelayUrl}/devices` — 디바이스 등록 → `subscription_token` 수신
2. `PUT {daemonUrl}/v1/wallet-apps/:id` — 받은 `subscription_token`을 daemon에 전달
3. 토픽 자동 생성 (`waiaas-sign-{walletType}-{token}`, `waiaas-notify-{walletType}-{token}`)

SDK에 이 흐름을 캡슐화하는 헬퍼 함수가 필요하다.

## 기대 동작

SDK에 Push Relay 디바이스 관리 함수 추가:

```typescript
// 디바이스 등록 — subscription token 반환
registerDevice(pushRelayUrl: string, apiKey: string, opts: {
  walletName: string;
  pushToken: string;
  platform: 'ios' | 'android';
}): Promise<{ subscriptionToken: string }>

// 디바이스 해제
unregisterDevice(pushRelayUrl: string, apiKey: string, pushToken: string): Promise<void>

// subscription token 조회
getSubscriptionToken(pushRelayUrl: string, apiKey: string, pushToken: string): Promise<string | null>
```

## 영향 범위

### 코드 변경
- `packages/wallet-sdk/src/channels/relay.ts` — 디바이스 등록/해제/조회 함수 추가
- `packages/wallet-sdk/src/channels/index.ts` — re-export 추가
- `packages/wallet-sdk/src/index.ts` — public API 등록
- `packages/wallet-sdk/src/__tests__/channels.test.ts` — 테스트 추가

### 문서 업데이트
1. **`docs/wallet-sdk-integration.md`** — Scenario 3 (Push Relay) 섹션에 SDK 헬퍼 사용 예제 추가, 기존 raw fetch 예제를 SDK 함수로 교체
2. **`skills/wallet.skill.md`** — 새 SDK 함수 목록 추가 (AI 에이전트 스킬 동기)
3. **`packages/wallet-sdk/src/index.ts`** — JSDoc Public API 목록 갱신
4. **`packages/wallet-sdk/README.md`** — npm 패키지 페이지 API 목록 갱신

## 테스트 항목

- [ ] `registerDevice` 정상 등록 시 `subscriptionToken` 반환 확인
- [ ] `registerDevice` HTTP 에러 시 예외 throw 확인
- [ ] `unregisterDevice` 정상 해제 시 204 처리 확인
- [ ] `unregisterDevice` 미존재 토큰 시 404 예외 확인
- [ ] `getSubscriptionToken` 정상 조회 확인
- [ ] `getSubscriptionToken` 미존재 디바이스 시 null 반환 확인
- [ ] 기본 URL trailing slash 정규화 확인
