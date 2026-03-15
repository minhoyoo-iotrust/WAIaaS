# 356 — 지갑 상세 Overview 탭 Owner Protection 섹션 위치 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **발견일:** 2026-03-16

## 현상

지갑 상세 Overview 탭에서 Owner Protection 섹션이 최하단에 위치하여 스크롤 없이 접근 어려움. 보안 설정은 지갑 기본 정보 다음에 바로 노출되어야 함.

## 현재 레이아웃 (wallets.tsx OverviewTab)

1. Detail Grid (ID, Public Key, Chain, Status 등) — 779~949행
2. Balances — 951~1004행
3. Available Networks — 1006~1025행
4. **Owner Protection — 1027~끝** ← 최하단

## 변경 후 레이아웃

1. Detail Grid (기존 그대로)
2. **Owner Protection** ← Balances 위로 이동
3. Balances
4. Available Networks

## 수정 방안

`packages/admin/src/pages/wallets.tsx`의 `OverviewTab()` 함수에서 Owner Protection 블록(1027~끝)을 Balances 섹션(951행) 앞으로 이동.

## 테스트 항목

1. Owner Protection 섹션이 Detail Grid 바로 아래에 표시되는지 확인
2. Owner 등록/수정/검증/WalletConnect 연동 동작이 이동 후에도 정상인지 확인
3. Balances, Available Networks 섹션이 그 아래에 정상 렌더링되는지 확인
