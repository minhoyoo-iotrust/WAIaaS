# 268 - Admin UI 슬리피지 설정 단위를 % 표시로 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **마일스톤:** —

## 현황

Admin UI의 슬리피지 설정이 bps(basis points) 단위로 표시되어 직관적이지 않다.
일반적으로 슬리피지는 % 단위로 설정하는데, 현재는 `100`(= 1%), `500`(= 5%) 같은 bps 값을 직접 입력해야 한다.

### 대상 설정 키 (4개 프로바이더, 8개 키)

| 프로바이더 | 설정 키 | 기본값 (bps) | 표시 (%) |
|---|---|---|---|
| Jupiter Swap | `jupiter_swap_default_slippage_bps` | 50 | 0.5% |
| Jupiter Swap | `jupiter_swap_max_slippage_bps` | 500 | 5% |
| 0x EVM DEX | `zerox_swap_default_slippage_bps` | 100 | 1% |
| 0x EVM DEX | `zerox_swap_max_slippage_bps` | 500 | 5% |
| Pendle Yield | `pendle_yield_default_slippage_bps` | 100 | 1% |
| Pendle Yield | `pendle_yield_max_slippage_bps` | 500 | 5% |
| DCent Swap | `dcent_swap_default_slippage_bps` | 100 | 1% |
| DCent Swap | `dcent_swap_max_slippage_bps` | 500 | 5% |

> 참고: LI.FI는 이미 `pct` 단위(소수, 0.03 = 3%)를 사용하므로 제외.

## 변경 방안

**Admin UI 표시 레이어에서만 변환** — 내부 저장/전송은 bps 유지.

1. **`keyToLabel` 라벨 변경**: `"Dcent Swap Default Slippage Bps"` → `"Default Slippage (%)"` 등
2. **표시 시 변환**: 로드 시 `bps / 100` → % 값으로 표시
3. **저장 시 변환**: 입력값 `* 100` → bps로 저장
4. **입력 검증**: 0~100% 범위, 소수점 2자리까지 허용 (0.01% = 1bps 단위)

### 변경 파일

- `packages/admin/src/utils/settings-helpers.ts` — keyToLabel 맵에 슬리피지 키 추가
- `packages/admin/src/pages/actions.tsx` — 슬리피지 필드에 bps↔% 변환 로직 추가
- `packages/admin/src/__tests__/actions.test.tsx` — 테스트 업데이트

### 변경하지 않는 것

- setting-keys.ts (키 이름 유지)
- config.toml 스키마 (bps 단위 유지)
- daemon.ts 프로바이더 설정 주입 (bps 단위 유지)
- 각 프로바이더의 내부 슬리피지 처리 로직

## 테스트 항목

1. **라벨 표시 테스트**: 각 슬리피지 키가 `(%)` 라벨로 렌더링되는지 확인
2. **bps→% 변환 테스트**: 저장값 100 → 화면 표시 1(%), 50 → 0.5(%)
3. **%→bps 저장 테스트**: 입력값 1(%) → API 전송값 100(bps), 0.5(%) → 50(bps)
4. **기존 프로바이더 동작 무영향**: 변환이 UI 레이어에서만 일어나고, 프로바이더가 받는 bps 값은 동일한지 확인
