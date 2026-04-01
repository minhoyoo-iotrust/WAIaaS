# 447 — DELAY Cancel 키보드 버튼 레이블이 locale을 반영하지 않음

- **유형:** BUG
- **심각도:** LOW
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

DELAY 티어 TX_QUEUED 알림의 Cancel 인라인 키보드 버튼이 locale 설정(`ko`)과 무관하게 항상 영어 "Cancel"로 표시된다. 또한 버튼 레이블에 TX ID 앞 8자가 포함되어 있으나, 메시지 본문에 이미 TX ID가 표시되므로 불필요하다.

## 원인

`stage4-wait.ts`에서 `buildCancelKeyboard` 함수를 사용하지 않고, `reply_markup`을 직접 하드코딩하여 영어 "Cancel"을 사용한다:

```typescript
// stage4-wait.ts:42-47
reply_markup: {
  inline_keyboard: [[{
    text: `Cancel ${ctx.txId.slice(0, 8)}`,  // ← 영어 하드코딩 + 불필요한 TX ID
    callback_data: `cancel:${ctx.txId}`,
  }]],
},
```

## 수정 방안

### 1. buildCancelKeyboard 사용

`stage4-wait.ts`에서 `buildCancelKeyboard`를 사용하도록 변경. locale 기반 메시지 객체(`msgs.keyboard_cancel`)를 사용하여 한국어 "취소", 영어 "Cancel"로 표시.

### 2. 버튼 레이블에서 TX ID 제거

메시지 본문에 이미 TX ID가 표시되므로, 버튼 레이블은 "취소" / "Cancel"만으로 충분하다.

변경 전: `Cancel 019d1f9f`
변경 후: `취소` (ko) / `Cancel` (en)

`buildCancelKeyboard` 함수도 함께 수정:
```typescript
// 현재: text: `${msgs.keyboard_cancel} ${txId.slice(0, 8)}`
// 변경: text: msgs.keyboard_cancel
```

## 테스트 항목

### 수동 확인
- locale `ko` 설정 시 Cancel 버튼이 "취소"로 표시되는지
- locale `en` 설정 시 Cancel 버튼이 "Cancel"로 표시되는지
- 버튼 레이블에 TX ID가 포함되지 않는지
