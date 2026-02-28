# #214 — API 키 이중 저장소 비동기화로 프로바이더에 키 미전달

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** m29-05 (v29.5)
- **상태:** FIXED
- **수정일:** 2026-02-28

## 증상

Admin UI에서 0x Swap API 키를 설정하고 `hasApiKey: true`로 확인했지만, 실제 스왑 요청 시 0x API가 401 `"No API key provided"` 에러를 반환한다. Jupiter, LI.FI 등 모든 `requiresApiKey` 프로바이더에서 동일 증상 발생 가능.

## 근본 원인

API 키 저장소가 이중으로 존재하며 동기화되지 않음:

| 저장소 | 테이블 | 쓰기 경로 | 읽기 경로 |
|--------|--------|-----------|-----------|
| `ApiKeyStore` | `api_keys` | Admin UI → `PUT /admin/api-keys/:provider` | action route 가드 (`apiKeyStore.has(name)`) |
| `SettingsService` | `settings` | `PUT /admin/settings` | `registerBuiltInProviders()` → 프로바이더 config |

**흐름:**
1. Admin UI `actions.tsx` → `PUT /admin/api-keys/zerox_swap` → `apiKeyStore.set()` → `api_keys` 테이블에만 저장
2. Action route 가드 → `apiKeyStore.has('zerox_swap')` → `api_keys`에서 확인 → **통과** ✅
3. `registerBuiltInProviders()` → `settingsService.get('actions.zerox_swap_api_key')` → `settings` 테이블에서 읽음 → **빈 문자열** ❌
4. `ZeroExApiClient` → `if (config.apiKey)` → falsy → `0x-api-key` 헤더 미설정
5. 0x API → 401 `"No API key provided"`

## 영향 범위

- `jupiter_swap`, `zerox_swap`, `lifi` — 모든 `requiresApiKey: true` 프로바이더
- Admin UI의 `PUT /admin/api-keys/:provider` 경로로 설정된 모든 API 키

## 해결 방법 비교

| 방법 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A. Dual Write** | `PUT /admin/api-keys`에서 `settingsService`에도 동기화 + hot-reload 트리거 | 최소 변경, 하위 호환 | 이중 SSoT 유지 |
| **B. ApiKeyStore 제거** | `SettingsService`를 유일한 SSoT로, `api_keys` 테이블 제거, Admin UI가 `PUT /admin/settings` 사용 | 단일 SSoT, 깔끔한 아키텍처 | DB 마이그레이션, API 재설계, Admin UI 변경 |
| **C. Provider가 ApiKeyStore에서 읽기** | `registerBuiltInProviders`에 ApiKeyStore 주입 | 기존 API 유지 | `@waiaas/actions` → `ApiKeyStore` 크로스 패키지 결합 |
| **D. 내부 위임** | `/admin/api-keys/*` 유지하되 내부적으로 `SettingsService`에 위임 | API 호환성 + 단일 SSoT | `ApiKeyStore`가 thin wrapper로 남음 |

**권장:** B (깔끔한 아키텍처) — `actions.{name}_api_key` 설정 키가 이미 `setting-keys.ts`에 정의되어 있어 `ApiKeyStore`는 중복. 단, 변경 범위가 크므로 A로 즉시 핫픽스 후 B로 정리하는 2단계 접근도 가능.

## 관련 코드

- `packages/admin/src/pages/actions.tsx:146` — Admin UI가 `PUT /admin/api-keys/:provider`로 키 저장
- `packages/daemon/src/api/routes/admin.ts:1768` — `apiKeyStore.set(provider, body.apiKey)` only
- `packages/daemon/src/api/routes/actions.ts:240` — `apiKeyStore.has()` 가드 체크
- `packages/actions/src/index.ts:131` — `settingsReader.get('actions.zerox_swap_api_key')` 프로바이더 키 읽기
- `packages/actions/src/providers/zerox-swap/zerox-api-client.ts:20-22` — `if (config.apiKey)` 헤더 설정
- `packages/daemon/src/infrastructure/action/api-key-store.ts` — 레거시 API 키 전용 저장소
- `packages/daemon/src/infrastructure/settings/setting-keys.ts:175,182,187` — `actions.*_api_key` 설정 키 정의

## 부수 버그: hot-reload BUILTIN_NAMES 미갱신

`hot-reload.ts:472`의 `BUILTIN_NAMES` 목록에 `'aave_v3'`, `'kamino'`가 누락. hot-reload 시 이 프로바이더들은 unregister되지 않아 중복 등록될 수 있음.

## 테스트 항목

1. Admin UI에서 API 키 저장 후 `settings` 테이블에도 값이 동기화되는지 확인
2. API 키 저장 후 프로바이더 hot-reload가 트리거되어 새 키로 재생성되는지 확인
3. API 키 삭제 시 `settings` 테이블에서도 값이 제거되는지 확인
4. 0x/Jupiter/LI.FI 스왑이 API 키 설정 후 정상 동작하는지 E2E 확인
5. (B 방안 적용 시) `api_keys` 테이블 제거 후 기존 키가 `settings`로 마이그레이션되는지 확인
6. `BUILTIN_NAMES`에 `aave_v3`, `kamino` 추가 후 hot-reload 시 중복 등록 방지 확인
