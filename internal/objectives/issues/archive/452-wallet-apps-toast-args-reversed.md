# 452 — Human Wallet Apps 페이지에서 showToast 인자 순서가 반대

- **유형:** BUG
- **심각도:** LOW
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

Human Wallet Apps 페이지의 토스트 메시지에 배경색이 없고 "success" 또는 "error" 텍스트만 표시된다. 다른 페이지의 토스트는 정상이다.

## 원인

`showToast` 함수의 시그니처는 `(type, message)`이지만, `human-wallet-apps.tsx`에서는 `(message, type)` 순서로 호출하고 있다.

```typescript
// toast.tsx 시그니처
export function showToast(type: Toast['type'], message: string): void

// human-wallet-apps.tsx 호출 (잘못됨)
showToast('Test notification sent successfully', 'success');  // type='Test...', message='success'
showToast('Failed to update toggle', 'error');                // type='Failed...', message='error'
```

`type`에 메시지 문자열이 들어가면 `.toast-Test notification sent successfully` 같은 존재하지 않는 CSS 클래스가 적용되어 배경색이 없고, `message`에 'success'/'error'가 들어가 화면에 그것만 표시된다.

## 영향

`human-wallet-apps.tsx`의 `showToast` 호출 **18곳** 전부 인자 순서가 반대:
- Line 67, 102, 104, 118, 120, 137, 166, 179, 201, 204, 206, 224, 226, 243, 245, 260, 262, 455

## 수정 방안

모든 `showToast` 호출의 인자 순서를 `(type, message)`로 수정:

```typescript
// 변경 전
showToast('Test notification sent successfully', 'success');
// 변경 후
showToast('success', 'Test notification sent successfully');
```

## 테스트 항목

### 수동 확인
- 토글 변경, 테스트 알림, 앱 등록/삭제 등 모든 동작에서 토스트 배경색이 표시되는지
- 토스트 메시지 내용이 올바르게 표시되는지 (type이 아닌 실제 메시지)
