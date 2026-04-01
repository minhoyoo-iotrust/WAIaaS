# 438 — 테스트 알림 "fetch failed" 에러 메시지에 실제 원인이 표시되지 않음

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **등록일:** 2026-03-24

## 현상

Admin UI에서 지갑 앱(DCent)의 테스트 알림(Test 버튼)을 클릭하면 `fetch failed`라는 불친절한 에러만 표시된다.

실제 Push Relay URL(`http://192.168.0.43:3200`)에 연결할 수 없는 상황인데, 연결 실패의 구체적 원인(ECONNREFUSED, ENOTFOUND, ETIMEDOUT 등)이 사용자에게 전달되지 않는다.

## 원인

Node.js의 undici(내장 fetch)는 네트워크 에러 시 `TypeError: fetch failed`를 던지고, 실제 원인은 `err.cause`에 담긴다. 현재 데몬 코드(`packages/daemon/src/api/routes/wallet-apps.ts:283-285`)에서 `err.message`만 반환하고 `err.cause`를 무시한다:

```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : 'Unknown error';
  return c.json({ success: false, error: msg }, 200);
}
```

## 수정 방안

`err.cause`가 Error 인스턴스인 경우 해당 메시지를 함께 반환한다:

```typescript
} catch (err) {
  let msg = err instanceof Error ? err.message : 'Unknown error';
  if (err instanceof Error && err.cause instanceof Error) {
    msg = `${msg}: ${err.cause.message}`;
  }
  return c.json({ success: false, error: msg }, 200);
}
```

## 영향 범위

- `packages/daemon/src/api/routes/wallet-apps.ts` — test-notification 엔드포인트 catch 블록

## 테스트 항목

### 단위 테스트 (wallet-apps route)

1. **err.cause 전파:** fetch가 `TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED ...') })`를 던질 때 응답 `error` 필드에 `"fetch failed: connect ECONNREFUSED ..."` 형태로 포함되는지 확인
2. **err.cause 없는 경우:** 일반 Error (cause 없음) 시 기존대로 `err.message`만 반환되는지 확인
3. **err.cause가 Error가 아닌 경우:** `err.cause`가 문자열 등 비-Error 타입일 때 `err.message`만 반환되는지 확인
4. **정상 응답 회귀:** Push Relay 정상 연결 시 기존 동작(success: true)에 영향 없는지 확인

### 수동 확인

- Push Relay가 꺼진 상태에서 테스트 알림 전송 시 `fetch failed: connect ECONNREFUSED ...` 형태의 상세 에러 메시지가 Admin UI에 표시되는지 확인
- 잘못된 호스트명으로 테스트 시 `fetch failed: getaddrinfo ENOTFOUND ...` 형태로 표시되는지 확인
