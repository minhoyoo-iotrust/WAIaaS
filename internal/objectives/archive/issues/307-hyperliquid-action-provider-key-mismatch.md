# #307 — Hyperliquid 액션 프로바이더 설정 키 불일치 + 기본값 비활성

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-10

## 설명

Hyperliquid 액션 프로바이더(Perp/Spot/Sub)가 Admin UI에서 활성화되지 않는 두 가지 문제가 있다.

### 문제 1: Admin UI 설정 키와 서버 설정 키 불일치

Admin UI `actions.tsx`의 `BUILTIN_PROVIDERS`에서 Hyperliquid를 3개 프로바이더로 분리 등록:
- `hyperliquid_perp` → 토글 시 `actions.hyperliquid_perp_enabled` 저장/조회
- `hyperliquid_spot` → 토글 시 `actions.hyperliquid_spot_enabled` 저장/조회
- `hyperliquid_sub` → 토글 시 `actions.hyperliquid_sub_enabled` 저장/조회

서버 `setting-keys.ts`에는 **단일 키**만 등록:
- `actions.hyperliquid_enabled` (3개 프로바이더 공통)

Admin UI가 존재하지 않는 키를 저장/조회하므로 체크박스를 켜도 서버에 반영되지 않고,
서버의 실제 키 값을 읽지도 못해 항상 Inactive로 표시된다.

**동일 패턴의 선행 이슈:** #257 (Drift `drift_perp` vs `drift` 키 불일치)

### 문제 2: 기본값이 비활성(`'false'`)

서버 `setting-keys.ts`에서:
- `actions.hyperliquid_enabled` → `defaultValue: 'false'`
- `actions.across_bridge_enabled` → `defaultValue: 'false'`

다른 모든 액션 프로바이더는 `defaultValue: 'true'`이므로 일관성이 없다.
사용자가 별도 설정 없이도 프로바이더를 사용할 수 있어야 하므로 기본값은 `'true'`여야 한다.

## 수정 방안

### 방안 A: Admin UI 키를 서버에 맞춤 (권장)

서버의 단일 키 `actions.hyperliquid_enabled`를 유지하고,
Admin UI에서 3개 프로바이더가 동일한 `hyperliquid` 키를 참조하도록 수정한다.
또는 `isEnabled()` 함수에서 `hyperliquid_perp` → `hyperliquid`로 매핑하는 로직을 추가한다.

### 방안 B: 서버에 개별 키 추가

서버 `setting-keys.ts`에 `hyperliquid_perp_enabled`, `hyperliquid_spot_enabled`,
`hyperliquid_sub_enabled` 3개 키를 추가하여 Admin UI의 개별 제어를 지원한다.
이 경우 `ActionProviderRegistry`의 활성화 체크 로직도 개별 키를 참조하도록 수정해야 한다.

### 기본값 수정

`actions.hyperliquid_enabled`와 `actions.across_bridge_enabled`의 `defaultValue`를 `'true'`로 변경한다.

## 수정 대상 파일

1. `packages/daemon/src/infrastructure/settings/setting-keys.ts` — 기본값 `'false'` → `'true'` 변경
2. `packages/admin/src/pages/actions.tsx` — `BUILTIN_PROVIDERS` 키 매핑 수정 또는 `isEnabled()` 매핑 추가
3. `packages/daemon/src/actions/` — 방안 B 선택 시 레지스트리 활성화 로직 수정

## 관련 이슈

- #257: Drift Perp 활성화 상태가 항상 Inactive — `drift_perp` vs `drift` 키 불일치 (동일 패턴, FIXED)

## 테스트 항목

1. Admin UI Actions 페이지에서 Hyperliquid Perp/Spot/Sub 기본 Active 표시 확인
2. Admin UI에서 Enabled 체크박스 토글 시 서버 설정 반영 확인
3. 체크박스 해제 후 재로드 시 Inactive 상태 유지 확인
4. Across Bridge도 기본 Active 표시 확인
5. 데몬 재시작 후에도 설정 상태 유지 확인
