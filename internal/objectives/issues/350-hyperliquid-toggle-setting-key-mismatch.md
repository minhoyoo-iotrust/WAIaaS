# #350 Admin UI Hyperliquid 프로바이더 활성화 토글 설정 키 불일치로 에러 발생

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.17
- **상태:** FIXED

## 증상

Admin UI Actions 페이지에서 Hyperliquid Perp/Spot/Sub 프로바이더 활성화 토글 클릭 시 에러 토스트 표시. 활성화/비활성화 불가.

에러: `ACTION_VALIDATION_FAILED: Unknown setting key: actions.hyperliquid_perp_enabled`

## 근본 원인

**Admin UI가 생성하는 설정 키와 백엔드 SETTING_DEFINITIONS에 등록된 키 불일치.**

Hyperliquid는 3개 프로바이더(perp/spot/sub)가 **단일 활성화 키** `actions.hyperliquid_enabled`를 공유하는 설계이나, Admin UI의 `handleToggle`은 프로바이더 키 기반으로 개별 키를 생성함.

### Admin UI 토글 (actions.tsx:137)

```typescript
const settingKey = `actions.${providerKey}_enabled`;
// providerKey = 'hyperliquid_perp' → 'actions.hyperliquid_perp_enabled' ❌
// providerKey = 'hyperliquid_spot' → 'actions.hyperliquid_spot_enabled' ❌
// providerKey = 'hyperliquid_sub'  → 'actions.hyperliquid_sub_enabled'  ❌
```

### 백엔드 설정 키 (setting-keys.ts:304)

```typescript
{ key: 'actions.hyperliquid_enabled', ... }  // 단일 키로 3개 프로바이더 공유 ✅
```

### registerBuiltInProviders (index.ts:330-331)

```typescript
{ key: 'hyperliquid_perp', enabledKey: 'actions.hyperliquid_enabled', ... }
// perp 등록 시 spot/sub도 함께 등록 (공유 클라이언트)
```

`getSettingDefinition('actions.hyperliquid_perp_enabled')`이 `undefined`를 반환하여 PUT /v1/admin/settings에서 `ACTION_VALIDATION_FAILED` 에러 발생.

## 영향 범위

1. **Hyperliquid Perp** — 토글 불가
2. **Hyperliquid Spot** — 토글 불가
3. **Hyperliquid Sub** — 토글 불가
4. 상태 표시도 항상 Inactive (동일한 키 불일치로 설정값 읽기도 실패)

## 이전 관련 이슈

- **#257** (FIXED v31.3): Admin UI Drift Perp 활성화 상태가 항상 Inactive — BUILTIN_PROVIDERS key `drift_perp` vs DB key `drift` 불일치
- **#307** (FIXED v31.8): Hyperliquid 액션 프로바이더 설정 키 불일치 + 기본값 비활성 — 토글 무동작 + Inactive 고정
- **#319** (FIXED v31.8): Hyperliquid Admin UI 활성화 불가 — MarketData null + Hot-Reload BUILTIN_NAMES 누락 (3중 결함)

## 해결 방안

Admin UI BUILTIN_PROVIDERS에 `enabledKey` 오버라이드 필드를 추가하여, 공유 키를 사용하는 프로바이더를 올바르게 처리:

### 방안 A: BUILTIN_PROVIDERS에 enabledKey 오버라이드 (권장)

```typescript
interface BuiltinProvider {
  key: string;
  enabledKey?: string;  // 추가: 설정 키가 providerKey와 다를 때 사용
  // ...
}

const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  // ...
  { key: 'hyperliquid_perp', enabledKey: 'hyperliquid', ... },
  { key: 'hyperliquid_spot', enabledKey: 'hyperliquid', ... },
  { key: 'hyperliquid_sub',  enabledKey: 'hyperliquid', ... },
];

// handleToggle 수정
const handleToggle = async (providerKey: string, newEnabled: boolean) => {
  const provider = BUILTIN_PROVIDERS.find(p => p.key === providerKey);
  const baseKey = provider?.enabledKey ?? providerKey;
  const settingKey = `actions.${baseKey}_enabled`;
  // ...
};
```

이 방식은 공유 키 그룹에 속한 프로바이더는 하나만 토글해도 3개 모두 동시에 활성화/비활성화됨 (설계 의도에 부합).

### 방안 B: 상태 표시에서도 enabledKey 반영

```typescript
// isEnabled 판별 (현재 providerKey 기반)
const isEnabled = settings.value[`actions.${providerKey}_enabled`] === 'true';
// 수정: enabledKey 반영
const baseKey = provider.enabledKey ?? provider.key;
const isEnabled = settings.value[`actions.${baseKey}_enabled`] === 'true';
```

## 수정 대상 파일

1. `packages/admin/src/pages/actions.tsx` — BUILTIN_PROVIDERS 타입 + 데이터 + handleToggle + isEnabled 판별

## 재발 방지

### 1. 테스트 추가

```typescript
// actions.test.tsx
it('Hyperliquid Perp toggle sends actions.hyperliquid_enabled key', async () => {
  // 토글 클릭 후 PUT /v1/admin/settings 요청 바디에
  // { settings: [{ key: 'actions.hyperliquid_enabled', value: 'true' }] } 포함 확인
});
```

### 2. 컨벤션 강화

공유 활성화 키를 사용하는 프로바이더 추가 시, BUILTIN_PROVIDERS에 반드시 `enabledKey` 명시. 이 패턴은 이미 `@waiaas/actions`의 `registerBuiltInProviders`에 `enabledKey` 필드로 존재하므로, Admin UI도 동일 필드를 미러링.

## 테스트 항목

1. **단위 테스트**: Hyperliquid 3개 프로바이더 토글 시 올바른 설정 키(`actions.hyperliquid_enabled`) 전송 확인
2. **단위 테스트**: Hyperliquid 활성 상태 표시가 `actions.hyperliquid_enabled` 기준으로 판별 확인
3. **수동 검증**: Admin UI → Actions → Hyperliquid Perp 토글 → 성공 토스트 + Active 배지 표시
4. **수동 검증**: Hyperliquid Perp 활성화 후 Spot/Sub도 동시에 Active로 표시 확인
