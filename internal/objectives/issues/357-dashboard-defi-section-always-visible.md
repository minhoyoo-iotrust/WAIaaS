# 357 — 대시보드 DeFi Positions 섹션이 포지션 없으면 숨겨짐

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **발견일:** 2026-03-16
- **수정일:** 2026-03-16

## 현상

대시보드에서 DeFi Positions 섹션이 `activeCount > 0`일 때만 표시됨. 포지션이 없으면 섹션 자체가 숨겨져서 DeFi 기능의 존재를 인지하기 어려움.

## 원인

`dashboard.tsx:536`의 렌더링 조건:

```ts
{defiData.value && defiData.value.activeCount > 0 && (
```

## 수정 방안

조건에서 `activeCount > 0`을 제거:

```ts
{defiData.value && (
```

포지션이 없을 때의 빈 상태 메시지는 600행에 이미 구현되어 있음:

```ts
{defiData.value.positions.length === 0 && (
  No active DeFi positions
)}
```

### 변경 파일

- `packages/admin/src/pages/dashboard.tsx` — 536행 조건 수정 (1줄)

## 테스트 항목

1. 포지션이 없을 때 DeFi Positions 섹션이 "No active DeFi positions" 메시지와 함께 표시되는지 확인
2. 포지션이 있을 때 기존과 동일하게 렌더링되는지 확인
