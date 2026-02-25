# #184 테스트 커버리지 임계값 상향 + 미설정 패키지 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** OPEN

---

## 증상

다수 패키지에서 실제 커버리지가 설정된 임계값보다 훨씬 높아 임계값이 안전망 역할을 하지 못함. 또한 `@waiaas/actions` 패키지는 임계값이 아예 없어 커버리지 하락을 감지할 수 없음.

---

## 현황 비교

| 패키지 | 항목 | 현재 기준 | 실제 수치 | 여유 |
|--------|------|-----------|-----------|------|
| **adapters-evm** | branches | 45 | 73.63 | +28.63 |
| | functions | 50 | 95.23 | +45.23 |
| | lines | 50 | 94.52 | +44.52 |
| | statements | 50 | 94.52 | +44.52 |
| **cli** | branches | 65 | 84.83 | +19.83 |
| | functions | 70 | 97.67 | +27.67 |
| | lines | 70 | 82.78 | +12.78 |
| | statements | 70 | 82.78 | +12.78 |
| **mcp** | branches | 65 | 85.18 | +20.18 |
| | functions | 70 | 95.23 | +25.23 |
| | lines | 70 | 89.77 | +19.77 |
| | statements | 70 | 89.77 | +19.77 |
| **admin** | branches | 65 | 82.39 | +17.39 |
| | functions | 70 | 73.55 | +3.55 |
| | lines | 70 | 89.39 | +19.39 |
| | statements | 70 | 89.39 | +19.39 |
| **push-relay** | branches | 70 | 91.35 | +21.35 |
| | functions | 70 | 95.74 | +25.74 |
| | lines | 80 | 84.21 | +4.21 |
| | statements | 80 | 84.21 | +4.21 |
| **adapters-solana** | branches | 75 | 82.53 | +7.53 |
| | functions | 80 | 91.80 | +11.80 |
| | lines | 80 | 91.82 | +11.82 |
| | statements | 80 | 91.82 | +11.82 |
| **sdk** | branches | 75 | 94.73 | +19.73 |
| | functions | 80 | 81.66 | +1.66 |
| | lines | 80 | 80.99 | +0.99 |
| | statements | 80 | 80.99 | +0.99 |
| **wallet-sdk** | branches | 75 | 78.26 | +3.26 |
| | functions | 80 | 100.00 | +20.00 |
| | lines | 80 | 89.84 | +9.84 |
| | statements | 80 | 89.84 | +9.84 |
| **daemon** | branches | 80 | 81.52 | +1.52 |
| | functions | 85 | 92.64 | +7.64 |
| | lines | 85 | 85.08 | +0.08 |
| | statements | 85 | 85.08 | +0.08 |
| **core** | branches | 85 | 93.44 | +8.44 |
| | functions | 90 | 95.45 | +5.45 |
| | lines | 90 | 97.54 | +7.54 |
| | statements | 90 | 97.54 | +7.54 |
| **actions** | (미설정) | — | 84.27/97.36/88.75/88.75 | — |

---

## 수정 방안

### 원칙

- 실제 수치에서 **5%p 마진**을 두고 임계값 설정 (소수점 버림)
- 여유가 5%p 이하인 항목은 현행 유지 (daemon lines/statements, sdk lines/statements 등)
- `@waiaas/actions`에 신규 임계값 추가

### 예상 변경

| 패키지 | branches | functions | lines | statements |
|--------|----------|-----------|-------|------------|
| adapters-evm | 45 → **68** | 50 → **90** | 50 → **89** | 50 → **89** |
| cli | 65 → **79** | 70 → **92** | 70 → **77** | 70 → **77** |
| mcp | 65 → **80** | 70 → **90** | 70 → **84** | 70 → **84** |
| admin | 65 → **77** | 70 (유지) | 70 → **84** | 70 → **84** |
| push-relay | 70 → **86** | 70 → **90** | 80 (유지) | 80 (유지) |
| adapters-solana | 75 → **77** | 80 → **86** | 80 → **86** | 80 → **86** |
| sdk | 75 → **89** | 80 (유지) | 80 (유지) | 80 (유지) |
| wallet-sdk | 75 (유지) | 80 → **95** | 80 → **84** | 80 → **84** |
| daemon | 80 (유지) | 85 → **87** | 85 (유지) | 85 (유지) |
| core | 85 → **88** | 90 (유지) | 90 → **92** | 90 → **92** |
| actions (신규) | — → **79** | — → **92** | — → **83** | — → **83** |

---

## 관련 파일

- `packages/adapters/evm/vitest.config.ts`
- `packages/adapters/solana/vitest.config.ts`
- `packages/cli/vitest.config.ts`
- `packages/core/vitest.config.ts`
- `packages/mcp/vitest.config.ts`
- `packages/sdk/vitest.config.ts`
- `packages/admin/vitest.config.ts`
- `packages/wallet-sdk/vitest.config.ts`
- `packages/push-relay/vitest.config.ts`
- `packages/daemon/vitest.config.ts`
- `packages/actions/vitest.config.ts`

---

## 테스트 항목

- [ ] 11개 패키지 전체 `pnpm turbo run test` 통과 확인 (새 임계값 기준)
- [ ] `@waiaas/actions` vitest.config.ts에 coverage thresholds 추가 확인
- [ ] 임계값 상향 후 CI 파이프라인 통과 확인
- [ ] 기존 임계값보다 낮아진 항목이 없는지 검증 (절대 하향 금지 원칙)
