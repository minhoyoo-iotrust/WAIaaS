---
phase: 139-display-currency-integration
plan: "02"
subsystem: rest-api, mcp, openapi, skills
tags: [display-currency, forex, rest-api, mcp, i18n, skills]
dependency-graph:
  requires: ["139-01", "138-01", "138-02"]
  provides: ["REST API display_currency query parameter", "MCP display_currency tool parameter", "Skill file display currency docs"]
  affects: ["transactions-api", "wallet-api", "openapi-schemas", "mcp-tools", "skill-files"]
tech-stack:
  added: []
  patterns: ["display-currency-helper.ts shared module", "fetchDisplayRate batch optimization", "graceful null fallback"]
key-files:
  created:
    - packages/daemon/src/api/routes/display-currency-helper.ts
  modified:
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/mcp/src/tools/get-balance.ts
    - packages/mcp/src/tools/get-assets.ts
    - packages/mcp/src/tools/list-transactions.ts
    - packages/mcp/src/tools/get-transaction.ts
    - skills/transactions.skill.md
    - skills/wallet.skill.md
decisions:
  - "display-currency-helper.ts 별도 파일 -- transactions.ts/wallet.ts 공통 사용"
  - "balance displayBalance는 null 반환 -- 가격 오라클 + 네이티브 토큰 USD 변환은 복잡하여 향후 확장"
  - "assets displayValue는 usdValue 기반 변환 -- usdValue 있으면 환산, 없으면 null"
  - "POST /transactions/send는 display_currency 미지원 -- 201 응답 시점에 amountUsd 미산출"
  - "fetchDisplayRate 한 번 호출 후 items에 재사용 -- N+1 API 호출 방지"
metrics:
  duration: "504s"
  completed: "2026-02-16"
  tasks: 2
  files-created: 1
  files-modified: 10
---

# Phase 139 Plan 02: REST API + MCP display_currency 통합 Summary

REST API 4개 엔드포인트에 display_currency 쿼리 파라미터 추가, MCP 4개 도구에 display_currency 파라미터 추가, 스킬 파일 2개 업데이트 (v1.5.3)

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | REST API display_currency 쿼리 파라미터 + 환산 필드 추가 | 621c26f | display-currency-helper.ts, transactions.ts, wallet.ts, openapi-schemas.ts, server.ts |
| 2 | MCP 도구 환산 응답 + 스킬 파일 동기화 | 272a84f | get-balance.ts, get-assets.ts, list-transactions.ts, get-transaction.ts, transactions.skill.md, wallet.skill.md |

## Implementation Details

### Task 1: REST API display_currency

**display-currency-helper.ts** (신규): 3개 헬퍼 함수를 통해 transactions.ts/wallet.ts 공통 사용
- `resolveDisplayCurrencyCode(queryCurrency, settingsService)` -- 쿼리 > 서버 설정 > USD 우선순위
- `fetchDisplayRate(currencyCode, forexRateService)` -- 환율 1회 조회 (리스트 최적화)
- `toDisplayAmount(amountUsd, currencyCode, displayRate)` -- USD -> 표시 통화 변환

**GET /v1/transactions** 확장:
- 쿼리: `?display_currency=KRW` (optional)
- 응답: `items[].displayAmount` (string | null), `items[].displayCurrency` (string | null)
- amountUsd DB 컬럼 기반 환산, 환율은 한 번만 조회 후 전체 items에 적용

**GET /v1/transactions/:id** 확장:
- 쿼리: `?display_currency=KRW` (optional)
- 응답: `displayAmount`, `displayCurrency` 필드 추가

**GET /v1/wallet/balance** 확장:
- 쿼리: `?display_currency=KRW` (optional)
- 응답: `displayBalance` (현재 null -- 네이티브 토큰 USD 가격 조회 미지원), `displayCurrency`

**GET /v1/wallet/assets** 확장:
- 쿼리: `?display_currency=KRW` (optional)
- 응답: `assets[].displayValue` (usdValue 기반 환산), `displayCurrency`

**OpenAPI 스키마**: TxDetailResponseSchema, WalletBalanceResponseSchema, WalletAssetsResponseSchema에 display 관련 optional 필드 추가

**server.ts**: walletRoutes에 forexRateService/settingsService deps 전달

### Task 2: MCP + Skills

**MCP 도구 4개 업데이트:**
- `get_balance` -- display_currency 파라미터 추가, URLSearchParams 패턴으로 변경
- `get_assets` -- display_currency 파라미터 추가, URLSearchParams 패턴으로 변경
- `list_transactions` -- display_currency 파라미터 추가
- `get_transaction` -- display_currency 파라미터 추가

**스킬 파일 업데이트:**
- `transactions.skill.md` v1.5.3: 섹션 10 "Display Currency" 추가 (엔드포인트 표, 예시, MCP 도구 참조)
- `wallet.skill.md` v1.5.3: "Display Currency Support" 섹션 추가 (balance/assets 환산 필드 문서)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- daemon 빌드 성공 (tsc clean)
- daemon 테스트: 1280 passed, 5 pre-existing failures (migration/schema version assertions, api-policies)
- MCP 빌드 성공 (tsc clean)
- MCP 테스트: 170 passed, 1 pre-existing failure (server.test.ts tool count)
- 전체 모노레포 빌드 성공 (8 packages)

## Self-Check: PASSED

All 11 files found, both commits (621c26f, 272a84f) verified.
