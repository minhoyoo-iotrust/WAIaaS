# 267 — D'CENT Swap Aggregator DEX-only 정리 + URL/이름 변경

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **상태:** FIXED
- **수정일:** 2026-03-07
- **마일스톤:** —
- **발견일:** 2026-03-07

## 설명

D'CENT Swap Aggregator에서 Exchange(교환소 크로스체인) 기능을 완전 제거하고 DEX 전용으로 전환한다. URL을 프로덕션 엔드포인트로 변경하고, 이름을 공식 명칭으로 통일한다.

## 변경 사항 (5건)

### 1. URL 변경
- **Before:** `https://swapbuy-beta.dcentwallet.com`
- **After:** `https://agent-swap.dcentwallet.com`
- 코드, 설정, 테스트, 문서 등 모든 참조 일괄 변경

### 2. 이름 변경
- **Before:** "DCent Swap" / "DCent Swap aggregator"
- **After:** "D'CENT Swap Aggregator"
- 코드 주석, 설명 문자열, Admin UI, 스킬 파일 등

### 3. exchange 액션 완전 제거
- `exchange` 액션 정의 제거 (index.ts)
- `exchange.ts` 파일 삭제
- `ExchangeInputSchema`, `executeExchange`, `getExchangeQuotes` 제거
- `queryExchangeQuotes()`, `executeExchangeAction()` 쿼리 메서드 제거
- resolve() case 'exchange' 분기 제거
- re-export 제거: `ExchangeQuoteResult`, `ExecuteExchangeParams`, `ExchangeResult`

### 4. Exchange Poll 관련 코드 전체 삭제
- `exchange-status-tracker.ts` 파일 삭제
- `ExchangeStatusTracker` export 및 재공 제거 (actions/index.ts)
- Daemon에서 ExchangeStatusTracker 등록 코드 제거 (daemon.ts Step 4f-5)
- `swap_status` 액션 제거 (exchange 전용이므로)
- `querySwapStatus()` 메서드 제거
- `SwapStatusInputSchema` 제거
- API client에서 `createExchangeTransaction()`, `getTransactionsStatus()` 메서드 제거
- schemas.ts에서 `DcentExchangeResponseSchema`, `DcentExchangeStatus`, `DcentStatusResponseSchema` 등 제거
- config.ts에서 `exchangePollIntervalMs`, `exchangePollMaxMs` 설정 제거

### 5. DEX 전용 정리
- `DcentQuoteResult.exchangeProviders` 필드 제거 (dex-swap.ts)
- `providerType` enum에서 `'exchange'` 제거 (schemas.ts)
- Admin Settings에서 exchange poll 키 2건 제거:
  - `actions.dcent_swap_exchange_poll_interval_ms`
  - `actions.dcent_swap_exchange_poll_max_ms`
- Admin UI actions.tsx에서 exchange poll 설정 필드 제거 + 설명 "DEX swap aggregator" 로 변경
- connect-info.ts에서 "cross-chain exchanges" 문구 제거
- SDK client.ts에서 `dcentExchange()`, `getDcentSwapStatus()` 메서드 제거
- SDK types.ts에서 `DcentExchangeParams`, `DcentSwapStatusParams` 제거
- 스킬 파일에서 exchange/swap_status 관련 항목 제거

## 영향 범위

### 소스 파일 수정
| 파일 | 변경 |
|------|------|
| `packages/actions/src/providers/dcent-swap/config.ts` | exchangePoll 설정 제거, URL 변경 |
| `packages/actions/src/providers/dcent-swap/schemas.ts` | exchange/status 스키마 제거, providerType 'exchange' 제거 |
| `packages/actions/src/providers/dcent-swap/dcent-api-client.ts` | exchange/status API 메서드 제거, ExchangeParams/StatusParams 제거 |
| `packages/actions/src/providers/dcent-swap/index.ts` | exchange/swap_status 액션 제거, 쿼리 메서드 제거, re-export 제거 |
| `packages/actions/src/providers/dcent-swap/dex-swap.ts` | exchangeProviders 필드 제거 |
| `packages/actions/src/index.ts` | ExchangeStatusTracker 및 exchange 타입 export 제거 |
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4f-5 ExchangeStatusTracker 등록 블록 제거 |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | exchange poll 키 2건 제거, URL 기본값 변경 |
| `packages/daemon/src/api/routes/connect-info.ts` | "cross-chain exchanges" 문구 제거 |
| `packages/admin/src/pages/actions.tsx` | exchange poll 설정 UI 제거, 이름/설명 변경 |
| `packages/sdk/src/client.ts` | dcentExchange, getDcentSwapStatus 메서드 제거 |
| `packages/sdk/src/types.ts` | DcentExchangeParams, DcentSwapStatusParams 제거 |
| `skills/actions.skill.md` | exchange/swap_status 섹션 제거, URL/이름 변경 |

### 파일 삭제
| 파일 | 사유 |
|------|------|
| `packages/actions/src/providers/dcent-swap/exchange.ts` | exchange 액션 구현 |
| `packages/actions/src/providers/dcent-swap/exchange-status-tracker.ts` | exchange 폴링 트래커 |

### 테스트 파일 수정/삭제
| 파일 | 변경 |
|------|------|
| `packages/actions/src/__tests__/dcent-exchange.test.ts` | **삭제** — exchange 전체 테스트 |
| `packages/actions/src/__tests__/dcent-api-client.test.ts` | exchange/status API 테스트 제거, URL 변경 |
| `packages/actions/src/__tests__/dcent-provider-integration.test.ts` | exchange 관련 테스트 제거, URL 변경, actions 수 4→2 |
| `packages/actions/src/__tests__/dcent-policy-integration.test.ts` | exchange TRANSFER 테스트 제거, URL 변경, actions 수 4→2 |
| `packages/actions/src/__tests__/dcent-dex-swap.test.ts` | URL 변경, exchangeProviders 참조 제거 |
| `packages/actions/src/__tests__/dcent-auto-router.test.ts` | URL 변경 |
| `packages/actions/src/__tests__/dcent-auto-router-exec.test.ts` | URL 변경 |

## 테스트 항목

1. **단위 테스트**: DcentSwapApiClient에서 exchange 메서드 호출 시 컴파일 에러 확인
2. **단위 테스트**: DcentSwapActionProvider.actions가 2건(get_quotes, dex_swap)만 반환
3. **단위 테스트**: resolve('exchange', ...) 호출 시 unknown action 에러
4. **단위 테스트**: resolve('swap_status', ...) 호출 시 unknown action 에러
5. **단위 테스트**: DcentQuoteResult에 exchangeProviders 필드 없음
6. **통합 테스트**: DEX swap(native/ERC-20) 기존 테스트 전체 통과
7. **통합 테스트**: 2-hop auto-routing 기존 테스트 전체 통과
8. **빌드 테스트**: `pnpm turbo run typecheck` 전 패키지 통과
9. **린트 테스트**: `pnpm turbo run lint` 전 패키지 통과
10. **Admin UI**: D'CENT Swap 설정에 exchange poll 필드 미표시 확인
11. **설정**: 새 URL `https://agent-swap.dcentwallet.com` 기본값 확인
