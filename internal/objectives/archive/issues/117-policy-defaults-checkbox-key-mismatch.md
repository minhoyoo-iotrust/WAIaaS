# 117. Admin UI 정책 기본값 체크박스 클릭 시 즉시 반영 안 됨

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v26.3
- **상태:** FIXED

## 증상

Admin UI > Policies > Policy Defaults 탭에서 Default Deny 체크박스(Tokens, Contracts, Spenders)를 클릭해도 UI 상 체크 상태가 즉시 변경되지 않는다. 저장 확인 후에야 체크 상태가 반영된다.

## 원인

`getEffectiveBoolValue` 호출 시 카테고리를 `'security'`로 전달하여 dirty 키를 `security.default_deny_*`로 조회하지만, `handleFieldChange`는 `'policy.default_deny_*'` 키로 dirty에 저장한다. 키 불일치로 dirty 값이 있어도 읽지 못해 체크박스 value가 갱신되지 않는다.

### 코드 위치

`packages/admin/src/pages/policies.tsx` (lines 328-351)

```tsx
// value는 'security' 카테고리로 읽음 → dirty['security.default_deny_tokens'] 조회
value={getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_tokens')}
// onChange는 'policy' 카테고리로 씀 → dirty['policy.default_deny_tokens'] 저장
onChange={(v) => handleFieldChange('policy.default_deny_tokens', v)}
```

`POLICY_DEFAULTS_KEYS`에 정의된 실제 키는 `'policy.default_deny_*'`이므로, `getEffectiveBoolValue`의 카테고리 인자를 `'policy'`로 수정해야 한다.

## 수정 방안

`policies.tsx`의 3개 Default Deny 체크박스에서 `getEffectiveBoolValue` 호출 시 카테고리를 `'security'` → `'policy'`로 변경.

```diff
- value={getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_tokens')}
+ value={getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_tokens')}

- value={getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_contracts')}
+ value={getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_contracts')}

- value={getEffectiveBoolValue(settings.value, dirty.value, 'security', 'default_deny_spenders')}
+ value={getEffectiveBoolValue(settings.value, dirty.value, 'policy', 'default_deny_spenders')}
```

## 테스트 항목

- [ ] Default Deny Tokens 체크박스 클릭 시 즉시 체크 상태 토글 확인
- [ ] Default Deny Contracts 체크박스 클릭 시 즉시 체크 상태 토글 확인
- [ ] Default Deny Spenders 체크박스 클릭 시 즉시 체크 상태 토글 확인
- [ ] 체크박스 토글 후 저장 시 서버에 올바른 값 전송 확인 (키: `policy.default_deny_*`)
- [ ] 저장 후 페이지 새로고침 시 체크 상태 유지 확인
