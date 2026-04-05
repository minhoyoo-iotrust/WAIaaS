---
phase: 138-forex-display-currency
plan: "02"
subsystem: settings/admin-display
tags: [settings, display-currency, admin-ui, hot-reload, forex, preact]
dependency_graph:
  requires: [138-01-ForexRateService, settings-service, hot-reload, daemon-bootstrap]
  provides: [display.currency-setting, CurrencySelect-component, forex-admin-auth, daemon-forex-init]
  affects: [admin-settings-page, config-toml, settings-responses]
tech_stack:
  added: []
  patterns: [currency-dropdown-search, outside-click-dismiss, rate-preview-fetch]
key_files:
  created:
    - packages/admin/src/components/currency-select.tsx
  modified:
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/server.ts
    - packages/admin/src/pages/settings.tsx
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/styles/global.css
    - packages/daemon/src/__tests__/settings-service.test.ts
decisions:
  - "display.currency는 SettingsService DB 직접 읽기 -- hot-reload 시 별도 subsystem 재시작 불필요"
  - "CurrencySelect 43개 통화 인라인 -- daemon forex-currencies.ts와 동기화 (CSP로 import 불가)"
  - "GET/PUT /admin/settings 응답에 oracle+display 카테고리 포함 (기존 누락 보완)"
  - "/v1/admin/forex/* masterAuth 등록 (138-01에서 누락된 보안 수정)"
metrics:
  duration: "7m 36s"
  completed: "2026-02-16"
  tasks: 2
  tests_updated: 1
  files_created: 1
  files_modified: 10
---

# Phase 138 Plan 02: SettingsService display + Admin CurrencySelect + daemon 부트스트랩 Summary

config.toml display 섹션 + SettingsService display.currency 설정 + ForexRateService daemon 통합 + 검색 가능한 43개 통화 드롭다운 Admin 컴포넌트

## What Was Built

### 1. config.toml display 섹션

`packages/daemon/src/infrastructure/config/loader.ts`:
- DaemonConfigSchema에 `display.currency` 추가 (기본값 'USD')
- KNOWN_SECTIONS에 `'display'` 추가
- `WAIAAS_DISPLAY_CURRENCY=KRW` 환경변수 오버라이드 가능 (applyEnvOverrides 자동 처리)

### 2. SettingsService display 카테고리

`packages/daemon/src/infrastructure/settings/setting-keys.ts`:
- SETTING_CATEGORIES에 `'display'` 추가
- SETTING_DEFINITIONS에 `display.currency` 등록 (category: 'display', defaultValue: 'USD')
- SettingsService.get/set/getAllMasked CRUD 즉시 동작

### 3. Hot-reload display 변경 감지

`packages/daemon/src/infrastructure/settings/hot-reload.ts`:
- DISPLAY_KEYS Set 추가 (`display.currency`)
- handleChangedKeys에서 display 변경 시 로그 출력
- SettingsService.get()이 DB 직접 읽기이므로 별도 subsystem 재시작 불필요

### 4. ForexRateService daemon 부트스트랩

`packages/daemon/src/lifecycle/daemon.ts`:
- Step 4e-2: ForexRateService 인스턴스 생성 (fail-soft)
- InMemoryPriceCache 전용 인스턴스 (30분 TTL, 2시간 staleMax, 64 entries)
- CoinGeckoForexProvider에 oracle.coingecko_api_key 주입
- CreateAppDeps + adminRoutes deps에 forexRateService 전달

### 5. Admin settings 응답 보완

`packages/daemon/src/api/routes/admin.ts`:
- GET/PUT /admin/settings 응답에 `oracle`, `display` 카테고리 추가 (기존 5개 -> 7개)
- 설정 미사용 시 fallback에도 oracle/display 포함

### 6. Forex 엔드포인트 masterAuth

`packages/daemon/src/api/server.ts`:
- `/v1/admin/forex/*` masterAuth 등록 (138-01에서 route는 추가했으나 auth 누락)
- forexRateService를 CreateAppDeps에 추가하여 admin route에 전달

### 7. CurrencySelect 컴포넌트

`packages/admin/src/components/currency-select.tsx`:
- 43개 통화 메타데이터 인라인 (code, name, symbol)
- 검색 필터: code/name/symbol 매칭 (useComputed)
- 환율 미리보기: GET /admin/forex/rates 호출, 선택 변경 시 자동 fetch
- USD 선택 시 API 미호출 (1 USD = $1.00 즉시 표시)
- 외부 클릭 닫기: useRef + document mousedown listener
- 순수 Preact + @preact/signals (외부 라이브러리 0개)

### 8. Admin Settings Display 섹션

`packages/admin/src/pages/settings.tsx`:
- DisplaySettings 섹션 추가 (DaemonSettings 다음, ApiKeysSection 전)
- CurrencySelect value -> getEffectiveValue('display', 'currency')
- onChange -> handleFieldChange('display.currency', code)
- 안내 문구: USD 기준 정책, approx 변환 설명

### 9. CSS 스타일

`packages/admin/src/styles/global.css`:
- currency-select 17개 클래스 추가
- 기존 CSS 변수(--color-*, --space-*, --font-size-*, --radius-*) 활용
- 드롭다운: absolute 포지셔닝, max-height 300px, overflow-y auto
- 호버/활성 상태 스타일링

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] /v1/admin/forex/* masterAuth 등록**
- **Found during:** Task 1
- **Issue:** 138-01에서 GET /admin/forex/rates route를 추가했으나 server.ts의 masterAuth 등록이 누락
- **Fix:** server.ts에 `app.use('/v1/admin/forex/*', masterAuthForAdmin)` 추가
- **Files modified:** packages/daemon/src/api/server.ts
- **Commit:** 1a8a777

**2. [Rule 1 - Bug] GET/PUT /admin/settings 응답에 oracle/display 카테고리 누락**
- **Found during:** Task 1
- **Issue:** getAllMasked()는 모든 카테고리를 반환하나, 응답 객체에 notifications/rpc/security/daemon/walletconnect만 포함
- **Fix:** oracle과 display 카테고리를 GET/PUT 응답에 추가
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Commit:** 1a8a777

**3. [Rule 1 - Bug] settings-service.test.ts 카운트/카테고리 갱신**
- **Found during:** Task 1 verification
- **Issue:** SETTING_DEFINITIONS 개수 38->39, 유효 카테고리 Set에 'display' 누락
- **Fix:** 테스트 assertion 갱신
- **Files modified:** packages/daemon/src/__tests__/settings-service.test.ts
- **Commit:** 1a8a777

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1a8a777 | config.toml display + SettingsService display.currency + ForexRateService daemon 통합 |
| 2 | a84a0d7 | Admin CurrencySelect 컴포넌트 + Display 섹션 + CSS |

## Requirements Satisfied

- **DISP-03**: SettingsService display 카테고리 + hot-reload 즉시 반영
- **DISP-04**: Admin Settings 통화 드롭다운 + 환율 미리보기

## Self-Check: PASSED

- 1 created file: packages/admin/src/components/currency-select.tsx -- FOUND
- 10 modified files: all verified
- 2 task commits: 1a8a777, a84a0d7 -- all verified
- Full build: SUCCESS (8/8 tasks)
- Relevant tests: 96 passing (config-loader 36, settings-service 29, forex-rate-service 10, format-currency 21)
