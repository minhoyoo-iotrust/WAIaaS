# Issue #173: Admin UI 정책 기본값 체크박스가 항상 해제 상태로 표시

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.4
- **상태:** FIXED

## 현상

Admin UI Policies > Defaults 탭에서 Default Deny 체크박스 4개가 항상 해제(false) 상태로 표시된다.
운영자가 변경한 적 없음에도 불구하고 백엔드 실제 값(`defaultValue: 'true'`)과 UI 표시가 불일치.

## 원인

`policies.tsx`에서 `getEffectiveBoolValue()` 호출 시 카테고리를 `'policy'`로 전달하지만,
백엔드 `SETTING_DEFINITIONS`에서 해당 설정들은 `category: 'security'`로 정의되어 있다.

API 응답에 `policy` 카테고리가 존재하지 않아 `settings['policy']` → `undefined` → `false` 반환.

```tsx
// policies.tsx:368 — 버그: 'policy' 카테고리로 조회
getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_tokens')

// settings.tsx:594 — 정상: 'security' 카테고리로 조회
getEffectiveBoolValue('security', 'default_deny_tokens')
```

참고: `settings.tsx`(Settings 페이지)에서는 `'security'` 카테고리를 사용하여 정상 표시됨.

## 영향

- 운영자가 default-deny가 꺼져 있다고 오인
- Policies 페이지에서 저장하면 체크 해제 상태가 백엔드에 `'false'`로 기록될 수 있음
- 보안 기본값이 의도치 않게 변경될 위험

## 수정 방안

`policies.tsx`의 4개 `getEffectiveBoolValue()` 호출에서 카테고리를 `'policy'` → `'security'`로 변경:

```tsx
// 변경 전
getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_tokens')
getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_contracts')
getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_spenders')
getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_x402_domains')

// 변경 후
getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_tokens')
getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_contracts')
getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_spenders')
getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_x402_domains')
```

## 관련 파일

- `packages/admin/src/pages/policies.tsx` (lines 365-395)
- `packages/admin/src/pages/settings.tsx` (lines 590-617) — 정상 동작 참고
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` (lines 98-101) — category: 'security'

## 테스트 항목

- [ ] Policies > Defaults 탭에서 default-deny 체크박스 4개가 백엔드 값과 일치하는지 확인
- [ ] Settings 페이지와 Policies > Defaults 탭의 표시 상태가 동일한지 확인
- [ ] 체크박스 토글 → 저장 → 새로고침 후 상태 유지 확인
- [ ] 백엔드 초기 상태(true)에서 UI에 체크됨으로 표시되는지 확인
