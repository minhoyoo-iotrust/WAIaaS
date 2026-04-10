# 495 — Desktop Setup Wizard에서 Owner 지갑 연결 단계 제거

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-04-10
- **발견 경위:** v2.14.1-rc.4 온보딩 테스트 중. Step 3 "Connect Owner"가 WalletConnect를 통한 외부 지갑 연결을 요구하여 온보딩 플로우를 불필요하게 복잡하게 만듦.

## 동기

- 온보딩은 **최대한 빠르게** 완료되어야 함 — 사용자가 Desktop 앱을 설치하고 바로 사용할 수 있어야 함
- Owner 지갑 연결은 WalletConnect QR 스캔 + 외부 앱 조작이 필요해 온보딩 마찰이 큼
- 기존에도 "Skip for now" 링크가 있어 대부분 사용자가 스킵할 것으로 예상
- Owner 연결은 대시보드의 Wallets 페이지에서 언제든 설정 가능 → 온보딩에 있을 필요 없음

## 수정 방향

### Setup Wizard: 4-step → 3-step

| Step | Before (4-step) | After (3-step) |
|------|-----------------|----------------|
| 1 | Select Chain | Select Chain |
| 2 | Create Wallet | Create Wallet |
| 3 | Connect Owner | **Complete** |
| 4 | Complete | — |

### 변경 파일

1. **`setup-wizard.tsx`**: `STEP_NAMES`에서 'Connect Owner' 제거, `TOTAL_STEPS = 3`, `StepContent` switch 재매핑
2. **`wizard-store.ts`**: `nextStep` 상한 `< 3`, `skipOwnerStep` 제거 (더 이상 불필요)
3. **`WizardData`**: `skipOwner` 필드 제거
4. **`owner-step.tsx`**: 파일 삭제 (더 이상 wizard에서 사용하지 않음)
5. **`complete-step.tsx`**: Owner 연결 상태 표시 행 제거 (항상 미연결이므로)
6. 관련 테스트 업데이트: `setup-wizard.test.tsx`, `wizard-steps.test.tsx`, `wizard-store.test.ts`

## 테스트 항목

- [ ] Setup Wizard가 3 단계로 표시: Chain → Wallet → Complete
- [ ] Complete 단계에서 Owner 관련 UI 미표시
- [ ] 대시보드 진입 후 Wallets 페이지에서 Owner 연결 가능 (기존 기능 유지)
- [ ] `pnpm vitest run src/__tests__/desktop` 통과
- [ ] 로컬 Tauri .app 빌드 → 실행 → 3-step wizard 완주 → 대시보드 도달

## 관련 이슈

- **491** (password step 제거) — 같은 패턴으로 wizard step 축소
- **492** (chain/wallet 수정) — wizard 기능 개선 흐름
