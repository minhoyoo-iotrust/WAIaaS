# #319 — Hyperliquid 통합 Admin UI 활성화 불가 — MarketData null + Hot-Reload 누락

- **Type:** BUG
- **Severity:** HIGH
- **Status:** OPEN
- **Component:** `packages/daemon/src/lifecycle/`, `packages/daemon/src/infrastructure/settings/`

## 증상

Admin UI에서 Hyperliquid를 활성화해도 API 호출 시 항상 비활성화 에러:

```json
{"code":"ACTION_VALIDATION_FAILED","message":"Hyperliquid integration is not enabled"}
```

## 원인 (3중 결함)

### 1. HyperliquidMarketData가 HTTP 라우트에 전달되지 않음
- **위치:** `daemon.ts` (createApp 호출)
- `server.ts`의 `createHyperliquidRoutes`에 `deps.hyperliquidMarketData`를 전달하지만, daemon lifecycle에서 이 값을 설정하지 않아 항상 `null`
- MarketData 인스턴스는 `registerBuiltInProviders()` 내부에서 생성되어 외부로 노출되지 않음

### 2. Hot-Reload BUILTIN_NAMES에 Hyperliquid 누락
- **위치:** `hot-reload.ts` (line ~502)
- `BUILTIN_NAMES` 배열에 `'hyperliquid_perp'`, `'hyperliquid_spot'`, `'hyperliquid_sub_account'`가 누락
- 설정 변경 후 hot-reload 시 Hyperliquid 프로바이더가 재등록되지 않음

### 3. MarketData가 팩토리 클로저에 갇힘
- **위치:** `packages/actions/src/index.ts` (line ~314-341)
- HyperliquidMarketData가 provider factory 내부에서 생성되어 레지스트리 외부에서 접근 불가
- HTTP 라우트에 전달할 방법이 없음

## 수정 방향

1. `registerBuiltInProviders()`가 HyperliquidMarketData 인스턴스를 반환하도록 수정
2. `daemon.ts`에서 반환된 MarketData를 `createApp`의 deps에 전달
3. `hot-reload.ts`의 BUILTIN_NAMES에 `'hyperliquid_perp'`, `'hyperliquid_spot'`, `'hyperliquid_sub_account'` 추가
4. hot-reload 시 MarketData도 재생성하여 라우트 deps 갱신

## 테스트 항목

- [ ] Admin UI에서 Hyperliquid 활성화 후 API 정상 동작
- [ ] Hot-reload 후 Hyperliquid 프로바이더 재등록 확인
- [ ] Hyperliquid 비활성화 상태에서 명확한 에러 메시지
- [ ] MarketData가 라우트에 정상 전달 (null 아님)
