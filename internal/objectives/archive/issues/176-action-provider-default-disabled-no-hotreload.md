# #176 액션 프로바이더 기본 비활성 + 런타임 활성화 시 레지스트리 미갱신

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.5
- **상태:** FIXED

---

## 증상

1. 데몬 시작 후 `GET /v1/actions/providers`가 빈 배열 반환 — 5개 빌트인 프로바이더 모두 미등록
2. Admin UI Actions 페이지에서 프로바이더 활성화 토글 → 저장 후에도 "등록된 프로바이더 없음" 표시
3. 데몬 재시작 후에야 활성화된 프로바이더가 등록됨

---

## 근본 원인 (2가지)

### 원인 1: 기본값 `'false'` — 모든 프로바이더 비활성 기본

`setting-keys.ts`에서 모든 액션 프로바이더 enabled 설정의 기본값이 `'false'`:

```typescript
// setting-keys.ts:156-181
{ key: 'actions.jupiter_swap_enabled', defaultValue: 'false', ... },
{ key: 'actions.zerox_swap_enabled',   defaultValue: 'false', ... },
{ key: 'actions.lifi_enabled',         defaultValue: 'false', ... },
{ key: 'actions.lido_staking_enabled', defaultValue: 'false', ... },
{ key: 'actions.jito_staking_enabled', defaultValue: 'false', ... },
```

데몬 시작 시 `registerBuiltInProviders()`가 enabled 설정을 확인하고, 모두 `'false'`이므로 전부 스킵:

```typescript
// packages/actions/src/index.ts:177
if (settingsReader.get(enabledKey) === 'true') {
  // register provider
} else {
  skipped.push(key);  // ← 모든 프로바이더가 여기로
}
```

### 원인 2: 핫 리로드 누락 — 런타임 활성화 무효

`HotReloadOrchestrator.handleChangedKeys()`에 `actions.*` 접두사 핸들러가 없음:

```typescript
// hot-reload.ts:50-97 — 등록된 핸들러 목록
// notifications, rpc, security, autostop, monitoring,
// walletconnect, telegram, incoming
// ← 'actions' 핸들러 없음
```

Admin UI에서 `actions.jupiter_swap_enabled = 'true'`로 저장하면:
1. SettingsService → DB 저장 ✅
2. HotReloadOrchestrator → `actions.*` 핸들러 없음 → 무시 ❌
3. ActionProviderRegistry → 여전히 빈 상태 ❌
4. `GET /v1/actions/providers` → 빈 배열 ❌

---

## 영향

- 초기 사용자가 액션 기능을 사용할 수 없음 (빈 프로바이더 목록)
- Admin UI에서 활성화해도 데몬 재시작 전까지 동작 안 함
- MCP/SDK의 `executeAction()` 호출이 항상 실패
- connect-info의 capabilities에 `actions`가 포함되지 않아 에이전트가 액션 기능을 인식 못함

---

## 수정 방안

### 1. 기본값 변경: `'false'` → `'true'`

모든 빌트인 프로바이더 enabled 설정의 defaultValue를 `'true'`로 변경:

```typescript
// setting-keys.ts
{ key: 'actions.jupiter_swap_enabled', defaultValue: 'true', ... },
{ key: 'actions.zerox_swap_enabled',   defaultValue: 'true', ... },
{ key: 'actions.lifi_enabled',         defaultValue: 'true', ... },
{ key: 'actions.lido_staking_enabled', defaultValue: 'true', ... },
{ key: 'actions.jito_staking_enabled', defaultValue: 'true', ... },
```

→ 데몬 시작 시 모든 빌트인 프로바이더가 자동 등록. 운영자가 필요 없는 프로바이더를 수동 비활성화.

### 2. 핫 리로드 핸들러 추가

`HotReloadOrchestrator`에 `actions.*` 키 변경 핸들러 등록:

```typescript
// hot-reload.ts
if (prefix === 'actions') {
  await this.reloadActionProviders(changedKeys);
}
```

`reloadActionProviders()` 구현:
- 변경된 키에서 프로바이더명 추출 (예: `actions.jupiter_swap_enabled` → `jupiter_swap`)
- enabled `'true'`: 레지스트리에 미등록이면 등록
- enabled `'false'`: 레지스트리에 등록되어 있으면 제거

→ Admin UI 토글 즉시 반영, 데몬 재시작 불필요.

---

## 관련 파일

- `packages/daemon/src/infrastructure/settings/setting-keys.ts` (lines 156-183) — defaultValue 변경
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` — actions 핸들러 추가
- `packages/actions/src/index.ts` — registerBuiltInProviders() 등록 조건
- `packages/daemon/src/lifecycle/daemon.ts` (Step 4f, lines 914-939) — 시작 시 등록
- `packages/daemon/src/api/routes/actions.ts` (lines 181-205) — GET /v1/actions/providers

## 관련 이슈

- #158: 빌트인 액션 프로바이더 Admin UI 페이지 + API 키 미설정 알림 (v28.2 FIXED — UI만 구현, 핫 리로드 미포함)

---

## 테스트 항목

- [ ] 데몬 시작 시 5개 빌트인 프로바이더가 모두 레지스트리에 등록되는지 확인
- [ ] `GET /v1/actions/providers`가 5개 프로바이더 메타데이터를 반환하는지 확인
- [ ] Admin UI에서 프로바이더 비활성화 → 저장 → 레지스트리에서 즉시 제거 확인
- [ ] Admin UI에서 프로바이더 재활성화 → 저장 → 레지스트리에 즉시 등록 확인
- [ ] connect-info capabilities에 `actions`가 포함되는지 확인
- [ ] 기존 DB에 `actions.*_enabled = 'false'`가 저장된 경우 defaultValue 변경 영향 없음 확인
