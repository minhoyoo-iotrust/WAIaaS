# #275 AA 프로바이더 글로벌 기본 API Key / Policy ID 설정

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-07

## 현상

Smart Account 지갑을 만들 때마다 동일한 Pimlico/Alchemy API 키를 반복 입력해야 한다. 같은 프로바이더를 사용하는 지갑이 여러 개면 매번 동일한 값을 넣는 것이 번거롭다. 또한 `aaPaymasterPolicyId`는 DB 컬럼과 API는 있지만 Admin UI에 입력 필드가 없어 설정 불가.

## 설계

### 1. 글로벌 프로바이더 기본값 (Admin Settings)

프로바이더별로 독립적인 기본 API Key와 Paymaster Policy ID를 등록:

| 설정 키 | 카테고리 | 기본값 | isCredential |
|---------|---------|--------|-------------|
| `smart_account.pimlico.api_key` | smart_account | `''` | true |
| `smart_account.pimlico.paymaster_policy_id` | smart_account | `''` | false |
| `smart_account.alchemy.api_key` | smart_account | `''` | true |
| `smart_account.alchemy.paymaster_policy_id` | smart_account | `''` | false |

### 2. 폴백 규칙

```
resolveWalletBundlerUrl(wallet, networkId, settingsService?)
  1. wallet.aaProviderApiKey가 있으면 → per-wallet 사용
  2. 없으면 → settingsService.get(`smart_account.{provider}.api_key`) 폴백
  3. 둘 다 없으면 → CHAIN_ERROR (기존과 동일)

resolveWalletPaymasterPolicyId(wallet, settingsService?)
  1. wallet.aaPaymasterPolicyId가 있으면 → per-wallet 사용
  2. 없으면 → settingsService.get(`smart_account.{provider}.paymaster_policy_id`) 폴백
  3. 둘 다 없으면 → null (페이마스터 미사용, 기존과 동일)
```

- `custom` 프로바이더는 글로벌 폴백 불가 (URL이 지갑마다 다를 수 있으므로 per-wallet만).

### 3. Admin UI 변경

**글로벌 설정 (Smart Account 설정 섹션):**
- 프로바이더별 API Key 입력 필드 (Pimlico, Alchemy)
- 프로바이더별 Paymaster Policy ID 입력 필드

**지갑 프로바이더 설정 폼 (PUT /wallets/:id/provider):**
- "Use global default" 토글 (기본 ON)
- OFF 시 API Key / Policy ID 직접 입력 필드 노출
- 글로벌 값이 설정되어 있으면 "(Global default configured)" 표시

### 4. 하위 호환성

- 기존 per-wallet 값이 있는 지갑 → 변경 없음 (per-wallet 우선)
- `aaProvider = null` (Lite 모드) → 글로벌 폴백과 무관하게 Lite 유지
- `aaProvider = 'custom'` → 글로벌 폴백 불가, 기존대로 per-wallet URL 필수

## 변경 범위

1. `setting-keys.ts` — 설정 키 4개 추가
2. `smart-account-clients.ts` — `resolveWalletBundlerUrl/PaymasterUrl`에 settingsService 파라미터 추가, API 키 null 시 글로벌 폴백
3. `stages.ts` / `pipeline.ts` — WalletProviderData 조립 시 settingsService 전달
4. `wallets.ts` — 지갑 프로바이더 설정 API에 글로벌 기본값 참조 로직
5. Admin UI Smart Account 설정 섹션 — 글로벌 키 입력 필드
6. Admin UI 지갑 프로바이더 설정 폼 — "Use global default" 토글 + policyId 필드 노출
7. 테스트 추가

## 관련 이슈

- #252: Paymaster Policy ID 전달 경로 추가 (v31.2 FIXED — API만, Admin UI 미구현)

## 테스트 항목

1. **단위 테스트**: 글로벌 API 키 설정 시 per-wallet 키 없는 지갑이 글로벌 키로 번들러 URL 생성하는지 검증
2. **단위 테스트**: per-wallet 키가 있으면 글로벌 키보다 우선하는지 검증
3. **단위 테스트**: 글로벌 + per-wallet 둘 다 없으면 CHAIN_ERROR 발생 검증
4. **단위 테스트**: custom 프로바이더는 글로벌 폴백 불가 검증
5. **단위 테스트**: Lite 모드(aaProvider=null)는 글로벌 설정과 무관하게 Lite 유지 검증
6. **단위 테스트**: 글로벌 paymaster_policy_id 폴백 검증
7. **통합 테스트**: Admin UI에서 글로벌 키 설정 후 지갑 생성 → 프로바이더 키 미입력으로 Full 모드 동작 검증
