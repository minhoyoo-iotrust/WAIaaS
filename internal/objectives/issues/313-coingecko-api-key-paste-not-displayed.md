# #313 — CoinGecko API Key 붙여넣기 시 입력값 미표시

- **유형:** BUG
- **심각도:** LOW
- **상태:** OPEN
- **발견일:** 2026-03-10

## 현상

Admin UI System 페이지에서 CoinGecko API Key 필드에 값을 붙여넣기하면:
- 입력 필드에 붙여넣은 값이 표시되지 않음 (placeholder만 보임)
- "1 unsaved change" 배너는 정상 표시됨
- 다른 API 키 필드(Pimlico, Alchemy 등)는 정상 동작

## 원인

`packages/admin/src/pages/system.tsx:316`에서 CoinGecko credential 필드의 `value` prop이 `icc()` 기반 하드코딩 패턴 사용:

```tsx
// system.tsx:316 — 문제 코드
value={icc('oracle', 'coingecko_api_key') ? '••••••••' : ''}
```

반면 다른 credential 필드(settings.tsx)는 `getEffectiveValue()`를 사용:

```tsx
// settings.tsx:975 — 정상 코드
value={getEffectiveValue('smart_account', 'pimlico.api_key')}
```

`getEffectiveValue()`는 dirty 값이 있으면 dirty 값을 우선 반환하지만, `icc()` 패턴은 dirty 여부만 판단하고 실제 dirty 값을 표시하지 않음.

## 수정 방안

`icc()` 패턴을 `ev()` (getEffectiveValue) 패턴으로 변경:

```tsx
// AS-IS (system.tsx:316)
value={icc('oracle', 'coingecko_api_key') ? '••••••••' : ''}

// TO-BE
value={ev('oracle', 'coingecko_api_key')}
placeholder={icc('oracle', 'coingecko_api_key') ? '(configured)' : 'Enter CoinGecko Pro API key (optional)'}
```

## 테스트 항목

1. **단위 테스트**: CoinGecko API Key 필드에 onInput 이벤트 발생 후 input value가 입력값으로 표시되는지 확인
2. **단위 테스트**: Discard 클릭 시 원래 상태로 복원되는지 확인
