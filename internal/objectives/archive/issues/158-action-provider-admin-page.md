# 158 — 빌트인 액션 프로바이더 Admin UI 페이지 + API 키 미설정 알림

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v28.2
- **상태:** OPEN
- **발견일:** 2026-02-23

## 요약

빌트인 액션 프로바이더(Jupiter Swap 등) 설정을 config.toml이 아닌 Admin UI 전용 페이지에서 관리하고,
API 키가 필요한 프로바이더를 에이전트가 사용 시도할 때 키 미설정이면 사용자에게 알림을 보낸다.

## 현재 문제

1. 빌트인 프로바이더 활성화가 config.toml (`actions.jupiter_swap_enabled = false`)에만 의존 — 데몬 재시작 필요
2. 기본값이 `false`여서 사용자가 수동으로 설정해야 함
3. API 키 관리 UI가 System 페이지에 묻혀 있어 발견이 어려움
4. 에이전트가 API 키 필요 프로바이더 호출 시 키 미설정이면 에러만 반환 — 사용자에게 설정 안내 없음

## 변경 범위

### A. 빌트인 프로바이더 기본 활성화

- `packages/daemon/src/infrastructure/config/loader.ts`: `jupiter_swap_enabled` 기본값 `false` → `true`
- `packages/actions/src/index.ts`: `registerBuiltInProviders()`에서 `enabled` 미지정 시 기본 `true`로 처리

### B. SettingsService에 actions 카테고리 추가

- `packages/daemon/src/infrastructure/settings/setting-keys.ts`:
  - `SETTING_CATEGORIES`에 `'actions'` 추가
  - `SETTING_DEFINITIONS`에 `actions.jupiter_swap_enabled`, `actions.jupiter_swap_default_slippage_bps`, `actions.jupiter_swap_max_slippage_bps`, `actions.jupiter_swap_max_price_impact_pct` 등 런타임 조정 가능 설정 등록
- `packages/daemon/src/lifecycle/daemon.ts`: 프로바이더 등록 시 SettingsService 값 참조 (config.toml → SettingsService 폴백)

### C. Admin UI Actions 페이지 신설

- `packages/admin/src/components/layout.tsx`: NAV_ITEMS에 `{ path: '/actions', label: 'Actions' }` 추가
- `packages/admin/src/pages/actions.tsx` 신규:
  - 빌트인 프로바이더 목록 (GET /actions/providers 또는 GET /admin/api-keys)
  - 프로바이더별 활성화 토글 (SettingsService PUT)
  - 프로바이더별 설정 필드 (슬리피지, 가격 영향 한도 등)
  - API 키 관리 (설정/변경/삭제 — 기존 system.tsx API Keys 섹션 이관)
- `packages/admin/src/pages/system.tsx`: API Keys 섹션 제거 (Actions 페이지로 이관)
- `packages/admin/src/utils/settings-search-index.ts`: actions 카테고리 검색 인덱스 추가

### D. API 키 미설정 시 에이전트 알림

- `packages/daemon/src/api/routes/actions.ts` (`POST /actions/:provider/:action`):
  - 실행 전 `requiresApiKey && !apiKeyStore.has(provider)` 체크
  - 에러 응답에 `adminUrl` 필드 포함 (예: `/admin#/actions`)
  - `EventBus.emit('action:api_key_required', { provider, action })` 발행
- `packages/core/src/events.ts`: `ACTION_API_KEY_REQUIRED` 이벤트 타입 추가
- `packages/daemon/src/notifications/`: `ACTION_API_KEY_REQUIRED` 이벤트 → 알림 매핑
  - 메시지: "{providerName} 프로바이더에 API 키 설정이 필요합니다. Admin UI에서 설정해주세요."
  - 카테고리: SYSTEM
  - 중복 알림 방지: 프로바이더별 쿨다운 적용
- MCP 에이전트에게는 도구 실행 결과로 직접 안내 메시지 반환

## 테스트 항목

- [ ] 빌트인 프로바이더가 config 미설정 시 기본 활성화 확인
- [ ] Admin UI Actions 페이지에서 프로바이더 목록 표시 확인
- [ ] Admin UI에서 프로바이더 활성화/비활성화 토글 + 저장 확인
- [ ] Admin UI에서 API 키 설정/변경/삭제 확인
- [ ] SettingsService에서 actions 카테고리 get/set 정상 동작 확인
- [ ] API 키 필요 프로바이더 호출 시 키 미설정이면 적절한 에러 응답 + adminUrl 포함 확인
- [ ] API 키 미설정 호출 시 ACTION_API_KEY_REQUIRED 알림 발송 확인
- [ ] 알림 쿨다운: 동일 프로바이더 반복 호출 시 중복 알림 미발송 확인
- [ ] MCP 도구 실행 시 API 키 미설정 안내 메시지 반환 확인
- [ ] system.tsx에서 API Keys 섹션 제거 후 기존 기능 정상 동작 확인
