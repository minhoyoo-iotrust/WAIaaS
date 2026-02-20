# 116 — Telegram Bot Enabled 저장 후 비활성화로 되돌림

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** FIXED
- **등록일:** 2026-02-20

## 증상

Admin UI Notifications > Settings 탭에서 Telegram Bot 섹션의 "Bot Enabled"를 "Yes"로 변경하고 저장하면, 같은 탭에서 즉시 "No"로 되돌아감. 탭을 전환하지 않고도 동일 현상 발생.

## 분석

정적 코드 분석상 데이터 흐름 경로가 정상으로 보임:

1. **PUT 요청:** `handleSave` → `apiPut(settings: [{ key: 'telegram.enabled', value: 'true' }])` → 서버 `setMany()` → DB UPSERT (value='true')
2. **GET 재조회:** `dirty.value = {}` → `fetchSettings()` → `apiGet` → `getAllMasked()` → `settings.value` 갱신
3. **렌더링:** `getEffectiveValue(settings.value, dirty.value, 'telegram', 'enabled')` → `'true'` 반환 예상

### 가능한 원인

1. **Signal 타이밍 이슈:** `dirty.value = {}` 설정 시 Preact signals가 즉시 re-render를 트리거. 이 시점에 `settings.value`는 아직 이전 값(기본값 `'false'`)을 가지고 있어 폼이 "No"로 표시됨. 이후 `fetchSettings()`가 완료되어야 "Yes"로 갱신되나, 갱신이 실패하거나 타이밍 문제 발생 가능.

2. **fetchSettings() 실패:** `fetchSettings()` 내부에서 에러 발생 시 catch 블록에서 toast만 표시하고 `settings.value`는 갱신되지 않음. 사용자가 에러 toast를 놓쳤을 가능성.

3. **정적 config 간섭:** 이슈 115와 동일 패턴 — 다른 API 응답이나 상태가 정적 config를 참조하여 UI에 영향을 줄 가능성.

### 확인 필요 사항 (런타임 디버깅)

- 브라우저 Network 탭에서 PUT 응답 코드 확인 (200 OK)
- PUT 후 GET 요청 발생 여부 + 응답의 `telegram.enabled` 값 확인
- 브라우저 콘솔에 에러 출력 여부 확인

## 수정 방향

런타임 디버깅으로 정확한 실패 지점 특정 후 수정. 가능한 수정:

1. `dirty.value = {}` 전에 PUT 응답의 settings로 `settings.value`를 즉시 업데이트
2. fetchSettings 완료 후에만 dirty 클리어: `await fetchSettings(); dirty.value = {};`
3. PUT 응답에 포함된 settings 객체를 직접 사용하여 재조회 제거

## 관련 파일

| 파일 | 위치 |
|------|------|
| `packages/admin/src/pages/notifications.tsx` | 라인 103-118 — `handleSave` 함수 |
| `packages/admin/src/pages/notifications.tsx` | 라인 246-257 — Bot Enabled FormField |
| `packages/admin/src/utils/settings-helpers.ts` | 라인 132-151 — `getEffectiveValue` |
| `packages/admin/src/components/form.tsx` | 라인 79-91 — FormField select 렌더링 |
| `packages/daemon/src/infrastructure/settings/settings-service.ts` | 라인 192-236 — `getAllMasked()` |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | 라인 128 — `telegram.enabled` 정의 |

## 테스트 항목

### 단위 테스트
1. `telegram.enabled = 'true'` PUT 저장 후 GET 재조회 시 값이 `'true'`(문자열)로 반환되는지 확인
2. `getEffectiveValue()`가 `telegram.enabled = 'true'` 설정 데이터에 대해 `'true'`를 반환하는지 확인
3. `handleSave` 실행 후 `settings.value.telegram.enabled`가 `'true'`로 갱신되는지 확인

### 통합 테스트
4. Settings 탭에서 Bot Enabled 저장 → 새로고침 → 값 유지 확인
