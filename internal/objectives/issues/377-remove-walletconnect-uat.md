# #377 — advanced-02 WalletConnect Owner 승인 UAT 시나리오 제거

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **카테고리:** agent-uat

## 설명

`advanced-02` (WalletConnect Owner 승인) UAT 시나리오를 제거한다.

Owner 지갑 테스트는 DCent 하드웨어 지갑 연동 중심으로 진행하므로, WalletConnect 기반 Owner 승인 시나리오는 UAT에서 불필요하다.

## 영향 범위

- `agent-uat/advanced/walletconnect-approval.md` — 시나리오 파일 삭제
- `agent-uat/_index.md` — advanced-02 항목 제거, ID 리넘버링
- `scripts/verify-agent-uat-index.ts` — 삭제 후 검증 통과 확인

## 대안

- DCent 지갑 연동 기반 Owner 승인 시나리오가 별도로 존재하거나 추가될 예정
- WalletConnect 통합 자체는 코드에 유지하되, UAT 시나리오만 제거

## 테스트 항목

- [ ] `walletconnect-approval.md` 삭제 후 `verify-agent-uat-index.ts` 통과
- [ ] `verify-agent-uat-format.ts` 통과
- [ ] `_index.md` 시나리오 수 46개로 감소 확인
