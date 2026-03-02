# #213 — Admin UI 지갑 리스트에서 BALANCE 컬럼 제거

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **마일스톤:** —
- **등록일:** 2026-02-28

## 현상

v29.3에서 기본 네트워크 개념이 제거되었으나, Admin UI 지갑 리스트 페이지에 여전히 BALANCE 컬럼이 남아 있음. 기본 네트워크가 없으므로 단일 잔액 표시가 의미 불명확 — EVM 지갑은 ethereum-mainnet, base-mainnet, polygon-mainnet 등 여러 네트워크에 잔액이 분산되어 있을 수 있음.

## 기대 동작

지갑 리스트 페이지에서 BALANCE 컬럼을 제거한다. 잔액 확인은 지갑 상세 페이지에서 네트워크별로 제공.

## 영향 범위

- `packages/admin/src/pages/wallets.tsx` — 지갑 리스트 테이블 BALANCE 컬럼 제거
- 관련 API 호출 제거 (리스트 시 잔액 조회 불필요)

## 테스트 항목

- [ ] 지갑 리스트 페이지에 BALANCE 컬럼이 표시되지 않음
- [ ] 지갑 상세 페이지에서 네트워크별 잔액 정상 표시 (기존 기능 유지)
- [ ] 기존 Admin UI 테스트 통과
