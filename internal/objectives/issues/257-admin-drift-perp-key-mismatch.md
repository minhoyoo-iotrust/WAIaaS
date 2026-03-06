# #257 Admin UI Drift Perp 활성화 상태가 항상 Inactive — key 불일치

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** OPEN

## 현상

Admin UI Actions 페이지에서 Drift Perp가 DB에 `actions.drift_enabled = 'true'`로 저장되어 있음에도 항상 Inactive로 표시된다. 토글을 켜도 반영되지 않는다.

## 원인

`packages/admin/src/pages/actions.tsx`의 BUILTIN_PROVIDERS에서 Drift의 key가 `'drift_perp'`로 정의되어 있다.

```typescript
{ key: 'drift_perp', name: 'Drift Perp', ... }
```

`isEnabled()` 함수는 `cat[`${providerKey}_enabled`]`로 조회하므로:
- 조회 키: `drift_perp_enabled`
- DB 실제 키: `drift_enabled`

결과적으로 항상 `undefined`가 되어 비활성화로 판단된다.

같은 문제가 `handleToggle()`에도 적용된다:
- 토글 시 저장 키: `actions.drift_perp_enabled`
- 실제 필요한 키: `actions.drift_enabled`

## 수정

`packages/admin/src/pages/actions.tsx` BUILTIN_PROVIDERS 배열에서:

```diff
- { key: 'drift_perp', name: 'Drift Perp', ... }
+ { key: 'drift', name: 'Drift Perp', ... }
```

`bp.key === 'drift_perp'` 참조도 `bp.key === 'drift'`로 변경 (Advanced Settings 섹션).

## 영향 범위

- `packages/admin/src/pages/actions.tsx`: key 변경 (2곳)
- `packages/admin/src/__tests__/actions.test.tsx`: 테스트 업데이트 (필요 시)

## 테스트 항목

1. Admin UI Actions 페이지에서 Drift Perp가 Active로 표시되는지 확인
2. Drift Perp 토글 on/off 시 DB에 `actions.drift_enabled`로 저장되는지 확인
3. Drift Perp 활성화 시 Advanced Settings(Max Leverage 등) 섹션이 노출되는지 확인
