# #242 — BUG: WalletNotificationChannel 비ASCII Title 헤더로 ntfy 발송 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **마일스톤:** —
- **발견일:** 2026-03-03

## 증상

- 실제 트랜잭션 알림(TX_CONFIRMED 등)이 지갑 앱으로 전달되지 않음
- 테스트 알림(`POST /admin/wallet-apps/{id}/test-notification`)은 정상 동작
- 텔레그램 알림은 정상 동작
- Push Relay 콘솔에 TX 관련 수신 로그가 전혀 찍히지 않음
- 데몬 측에도 에러 로그 없음 (silent failure)

## 원인

`WalletNotificationChannel.publishNotification()`이 ntfy에 POST할 때 HTTP `Title` 헤더에
한국어 문자열(예: `"송금 완료"`, `"거래 확인"`)을 직접 설정함.

```typescript
// wallet-notification-channel.ts:148
headers: {
  'Priority': String(priority),
  'Title': message.title,     // ← 한국어 문자열
  'Tags': `waiaas,${message.category}`,
},
```

Node.js 22의 `fetch()` (undici 기반)는 비ASCII 문자가 HTTP 헤더 값에 포함되면 예외를 던짐:

```
Error: Cannot convert argument to a ByteString because the character at
index 0 has a value of 49569 which is greater than 255.
```

외부 `catch {}` 블록(113행, `// DAEMON-06: never throw`)이 이 에러를 로그 없이 삼켜서
데몬 콘솔에도 아무런 에러가 표시되지 않음.

## 테스트 알림이 동작하는 이유

테스트 알림 엔드포인트는 `'Title': 'Test Notification'` (순수 ASCII)을 사용하므로
`fetch()` 헤더 검증을 통과함. 실제 TX 알림만 i18n 로케일(ko)에 의해 한국어 title이 생성되어
실패함.

## 영향 범위

- locale이 `ko`인 환경에서 모든 트랜잭션/보안/세션 알림이 지갑 앱으로 전달 안 됨
- locale이 `en`인 환경에서는 ASCII title이므로 정상 동작
- 비ASCII 문자가 포함될 수 있는 모든 언어에서 동일 이슈 발생 가능

## 수정 방안

ntfy는 RFC 2047 인코딩을 지원함. 비ASCII title을 감지하여 Base64 인코딩:

```typescript
const safeTitle = /^[\x20-\x7E]*$/.test(message.title)
  ? message.title
  : `=?UTF-8?B?${Buffer.from(message.title, 'utf-8').toString('base64')}?=`;
```

검증 완료: ntfy.sh가 RFC 2047 `=?UTF-8?B?...?=` 형식을 디코딩하여 원문 title로 저장함.

추가로 `catch {}` 블록에 에러 로깅 추가 필요 — silent failure 방지.

## 테스트 항목

1. **단위 테스트**: 한국어 title로 `publishNotification()` 호출 시 fetch 에러 없이 전송 확인
2. **단위 테스트**: ASCII title은 인코딩 없이 그대로 전달되는지 확인
3. **단위 테스트**: RFC 2047 인코딩된 title이 올바른 형식(`=?UTF-8?B?...?=`)인지 검증
4. **통합 테스트**: locale=ko 환경에서 TX_CONFIRMED 이벤트 발생 시 ntfy에 메시지 도착 확인
5. **회귀 테스트**: 테스트 알림(ASCII title)이 기존대로 정상 동작하는지 확인
