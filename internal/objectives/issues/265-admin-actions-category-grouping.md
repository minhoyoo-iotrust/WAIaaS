# 265 — Admin UI Actions 페이지 프로바이더 카테고리별 그룹핑

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **마일스톤:** —

## 현상

Admin UI Actions 페이지(`packages/admin/src/pages/actions.tsx`)에서 모든 DeFi 액션 프로바이더가 플랫 리스트로 나열되어 프로바이더 수가 늘어날수록 가독성이 떨어진다.

현재 9개 프로바이더(Jupiter, 0x, LI.FI, Lido, Jito, Aave V3, Kamino, Pendle, Drift)가 순서대로 나열되며, 종류가 다른 프로바이더가 섞여 있어 원하는 항목을 빠르게 찾기 어렵다.

## 기대 동작

프로바이더를 DeFi 카테고리별로 그룹핑하여 섹션 헤더와 함께 표시한다.

| 카테고리 | 프로바이더 |
|---------|-----------|
| Swap | Jupiter Swap, 0x Swap |
| Bridge | LI.FI |
| Staking | Lido Staking, Jito Staking |
| Lending | Aave V3, Kamino |
| Yield | Pendle Yield |
| Perp | Drift Perp |

- `BuiltinProvider` 인터페이스에 `category` 필드 추가
- 카테고리별 섹션 헤더(`<h2>` 또는 구분선)로 시각적 그룹 분리
- 카테고리 내 프로바이더 순서는 기존 배열 순서 유지
- 향후 프로바이더 추가 시 `category` 값만 지정하면 자동 분류

## 수정 대상

- `packages/admin/src/pages/actions.tsx` — `BuiltinProvider` 타입 + `BUILTIN_PROVIDERS` 배열 + 렌더링 로직

## 테스트 항목

- [ ] 카테고리별 섹션 헤더가 올바르게 렌더링되는지 확인
- [ ] 각 프로바이더가 올바른 카테고리에 배치되는지 확인
- [ ] 빈 카테고리(프로바이더 0개)는 헤더가 표시되지 않는지 확인
- [ ] 기존 토글/API 키/Advanced Settings 기능이 정상 동작하는지 확인
