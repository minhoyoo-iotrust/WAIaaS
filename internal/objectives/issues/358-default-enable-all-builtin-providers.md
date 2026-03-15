# 358 — Hyperliquid, Polymarket, Across Bridge 기본 활성화로 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **발견일:** 2026-03-16
- **수정일:** 2026-03-16

## 현상

3개 빌트인 액션 프로바이더가 `defaultValue: 'false'`로 설정되어 기본 비활성 상태. 나머지 11개 프로바이더는 모두 기본 활성.

## 대상

| 프로바이더 | 설정 키 | 현재 | 변경 |
|---|---|---|---|
| Hyperliquid | `actions.hyperliquid_enabled` | `'false'` | `'true'` |
| Polymarket | `actions.polymarket_enabled` | `'false'` | `'true'` |
| Across Bridge | `actions.across_bridge_enabled` | `'false'` | `'true'` |

## 수정 방안

`packages/daemon/src/infrastructure/settings/setting-keys.ts`에서 3개 항목의 `defaultValue`를 `'true'`로 변경.

### 변경 파일

- `packages/daemon/src/infrastructure/settings/setting-keys.ts` — 3곳 `defaultValue: 'false'` → `'true'`

## 테스트 항목

1. 신규 설치 시 3개 프로바이더가 기본 활성 상태로 Actions 페이지에 표시되는지 확인
2. 기존 설치(DB에 `'false'` 저장된 경우)에서 오버라이드가 유지되는지 확인 — DB 값이 default보다 우선
3. hot-reload 시 3개 프로바이더가 정상 등록/해제되는지 확인
