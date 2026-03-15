# 354 — 기본 비활성 빌트인 프로바이더가 Admin UI Actions 페이지에 미표시

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-16

## 현상

`defaultValue: 'false'`인 빌트인 프로바이더(Hyperliquid, Polymarket)가 Admin UI Actions 페이지에 표시되지 않아 UI에서 활성화할 방법이 없음. API 직접 호출(`PUT /v1/admin/settings`)로만 활성화 가능.

## 원인

`GET /v1/actions/providers` API가 `registry.listProviders()`만 반환하는데, 비활성 프로바이더는 registry에 등록되지 않으므로 API 응답에서 누락됨.

**흐름:**
1. 데몬 시작 → `registerBuiltInProviders()` → `settingsReader.get(enabledKey) === 'true'`인 프로바이더만 registry에 등록
2. `GET /v1/actions/providers` → `registry.listProviders()` → 등록된 프로바이더만 반환
3. Admin UI → API 응답 기반으로 목록 렌더링 → 비활성 프로바이더 미표시

**닭과 달걀 문제:** UI에 안 보이니까 UI에서 활성화 불가 → 활성화 안 되니까 UI에 안 보임.

**영향 범위:**
- `actions.hyperliquid_enabled` — `defaultValue: 'false'`
- `actions.polymarket_enabled` — `defaultValue: 'false'`
- (Across Bridge는 이전에 API로 활성화하여 DB에 `'true'` 저장됨 — 정상 표시)

## 수정 방안

### 1. `@waiaas/actions` — 빌트인 프로바이더 메타데이터 상수 export

기존 `registerBuiltInProviders()`의 providers 배열에서 메타데이터(name, description, category, enabledKey, chains, requiresApiKey)를 추출하여 `BUILTIN_PROVIDER_METADATA` 상수로 export.

### 2. `actions.ts` 라우트 — 미등록 빌트인 병합

`GET /v1/actions/providers` 핸들러에서 `registry.listProviders()` 결과에 미등록 빌트인 프로바이더를 `isEnabled: false`, `actions: []`로 병합하여 반환.

```ts
const registered = deps.registry.listProviders();
const registeredNames = new Set(registered.map(p => p.name));

const providers = [...activeProviders];
for (const builtin of BUILTIN_PROVIDER_METADATA) {
  if (!registeredNames.has(builtin.name)) {
    providers.push({
      ...builtin,
      isEnabled: false,
      actions: [],
    });
  }
}
```

**변경 없는 부분:**
- Admin UI 코드 (이미 `isEnabled` 기반 토글 렌더링)
- 활성 프로바이더 동작
- hot-reload 로직 (토글 ON → 설정 변경 → registry 등록 → 다음 fetch에서 actions 포함)

## 테스트 항목

1. 기본 비활성 프로바이더(Hyperliquid, Polymarket)가 Actions 페이지에 Inactive 상태로 표시되는지 확인
2. Inactive 프로바이더 토글 ON → hot-reload 후 Active로 전환 + actions 목록 표시 확인
3. 기존 활성 프로바이더 목록/토글/설정이 영향받지 않는지 확인
4. `BUILTIN_PROVIDER_METADATA`와 실제 프로바이더 factory 배열의 일관성 테스트
