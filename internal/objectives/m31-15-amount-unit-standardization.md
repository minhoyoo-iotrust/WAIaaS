# 마일스톤 m31-15: Amount 단위 표준화 및 AI 에이전트 DX 개선

- **Status:** PLANNED
- **Milestone:** v31.10

## 목표

WAIaaS 전체 인터페이스(REST API, Action Provider, MCP, SDK)에서 **amount 단위 규칙을 통일**하고, AI 에이전트가 금액 파라미터의 단위를 **호출 전에 명확히 파악**할 수 있도록 스키마 기술을 강화한다. 동시에 응답에 `amountFormatted`를 포함하고, `humanAmount` 대안 파라미터를 지원하여 AI 에이전트의 단위 변환 오류를 원천 차단한다.

> **선행**: 없음 (기존 parseTokenAmount, formatAmount 유틸리티 활용)
> **참조**: packages/actions/src/common/amount-parser.ts, packages/core/src/utils/format-amount.ts, packages/mcp/src/tools/action-provider.ts

---

## 배경

### 현재 문제

AI 에이전트가 WAIaaS Action Provider를 호출할 때 amount 단위를 혼동하는 사례가 반복 발생한다:

```
# 에이전트가 0x swap 호출 시 0.001 ETH를 그대로 전달 → 400 에러
POST /v1/actions/zerox_swap/swap
{ "sellAmount": "0.001" }  ← 실제로는 wei 단위 "1000000000000000" 필요

# 에이전트가 Aave supply 호출 시 wei 단위 전달 → 의도하지 않은 대량 예치
POST /v1/actions/aave_v3/supply
{ "amount": "1000000000000000000" }  ← 실제로는 human-readable "1.0" 필요
```

### 근본 원인

| 문제 | 현재 상태 | 영향 |
|------|----------|------|
| Provider별 단위 불일치 | 14개 provider 중 일부는 smallest unit, 일부는 human-readable | 에이전트가 provider마다 다른 규칙을 알아야 함 |
| MCP 도구 스키마 부재 | `z.record(z.unknown())` — 파라미터 타입/단위 정보 없음 | 에이전트가 실패해봐야 단위를 알 수 있음 |
| 응답에 변환 정보 없음 | `amount: "1000000000000000000"` 만 반환 | decimals 조회 없이 해석 불가 |
| human-readable 입력 불가 | REST API는 smallest unit만 허용 | 에이전트가 직접 단위 변환해야 함 |

### Provider별 현재 단위 규칙

| Provider | Amount 필드 | 현재 단위 | 변경 필요 |
|----------|------------|----------|----------|
| jupiter-swap | `amount` | smallest unit | 통일 대상 |
| zerox-swap | `sellAmount` | smallest unit | 통일 대상 |
| across | `amount` | smallest unit (wei) | 통일 대상 |
| aave-v3 | `amount` | human-readable | 기준 패턴 |
| kamino | `amount` | human-readable | 기준 패턴 |
| lido-staking | `amount` | human-readable (ETH) | 기준 패턴 |
| jito-staking | `amount` | human-readable (SOL) | 기준 패턴 |
| hyperliquid | `amount` | human-readable | 기준 패턴 |
| drift | `size` | human-readable | 기준 패턴 |
| pendle | `amountOut` | API 응답 값 | 확인 필요 |
| lifi | `fromAmount` | API 응답 값 | 확인 필요 |
| dcent-swap | `fromAmount` | API 응답 값 | 확인 필요 |
| polymarket | `size`, `price` | 토큰 수량/가격 | 별도 규칙 유지 |
| erc8004 | (없음) | N/A | 해당 없음 |

---

## 요구사항

### R1. Action Provider 단위 통일 — smallest unit 기준

모든 Action Provider의 amount 입력을 **smallest unit (wei/lamports)** 으로 통일한다. 블록체인 API 표준을 따르며, 정밀도 손실을 방지한다.

- **R1-1.** 현재 human-readable 단위를 사용하는 provider(aave-v3, kamino, lido-staking, jito-staking, hyperliquid, drift)의 입력 스키마를 smallest unit으로 변경
- **R1-2.** 각 provider의 내부 로직에서 `parseTokenAmount()` 호출을 제거하고, 입력값을 bigint로 직접 사용
- **R1-3.** 하위 호환성: 입력값에 소수점(`.`)이 포함되면 human-readable로 간주하여 자동 변환 + deprecation 경고 로그 출력
- **R1-4.** Zod 스키마 description에 단위 명시: `'Amount in smallest units (wei/lamports). Example: "1000000000000000" = 0.001 ETH'`
- **R1-5.** `max` 키워드 지원 유지 (kamino repay/withdraw, aave-v3 repay/withdraw)

### R2. MCP 도구 Typed Schema 전환

MCP Action Provider 도구의 파라미터를 generic `z.record(z.unknown())`에서 **action별 typed schema**로 전환한다.

- **R2-1.** Action Provider 메타데이터 API(`GET /v1/actions/providers`)가 각 action의 **input schema JSON**을 반환하도록 확장
- **R2-2.** MCP tool 등록 시 provider 메타데이터에서 input schema를 가져와 **Zod schema로 변환** — 파라미터별 타입, description, 단위 정보 포함
- **R2-3.** schema 변환 불가 시 기존 `z.record(z.unknown())` fallback 유지
- **R2-4.** MCP tool description에 amount 파라미터의 단위 예시 포함: `"sellAmount: amount in smallest units (e.g., '1000000000000000' = 0.001 ETH)"`
- **R2-5.** 기존 빌트인 MCP 도구(send-token, transfer-nft 등)의 amount description도 단위 명시로 업데이트

### R3. 응답에 amountFormatted 추가

트랜잭션 및 action 응답에 **사람이 읽을 수 있는 금액 정보**를 함께 반환한다.

- **R3-1.** 트랜잭션 응답(`TxDetailResponseSchema`)에 `amountFormatted: string | null` 필드 추가 — `formatAmount(amount, decimals)` 결과
- **R3-2.** `decimals: number | null` 필드 추가 — 해당 토큰의 소수점 자릿수
- **R3-3.** `symbol: string | null` 필드 추가 — 토큰 심볼 (ETH, SOL, USDC 등)
- **R3-4.** Action Provider 실행 결과(`ActionResult`)에도 동일한 formatted 정보 포함
- **R3-5.** 잔액 조회 API(`GET /v1/wallets/:id/balance`)는 이미 `balance` + `decimals`를 반환하므로 `balanceFormatted` 추가
- **R3-6.** native token의 decimals/symbol은 chain config에서 조회, ERC-20/SPL은 token registry에서 조회

### R4. humanAmount 대안 파라미터 지원

AI 에이전트가 단위 변환 없이 **사람 친화적 금액을 직접 입력**할 수 있도록 대안 파라미터를 추가한다.

- **R4-1.** REST API 트랜잭션 요청(TRANSFER, TOKEN_TRANSFER, APPROVE)에 `humanAmount: string` 옵션 파라미터 추가
- **R4-2.** `amount`와 `humanAmount` 동시 지정 시 에러 반환 (둘 중 하나만 허용)
- **R4-3.** `humanAmount` 지정 시 토큰 decimals 조회 → `parseAmount()` 로 smallest unit 변환 후 파이프라인에 주입
- **R4-4.** TRANSFER(native token): chain의 native decimals 사용 (ETH=18, SOL=9)
- **R4-5.** TOKEN_TRANSFER: token registry에서 decimals 조회, 미등록 토큰이면 에러 반환 + decimals 명시 안내
- **R4-6.** Action Provider에도 동일 패턴 적용: `humanSellAmount`, `humanAmount` 등 대안 파라미터 추가
- **R4-7.** MCP 도구 schema에 humanAmount 파라미터 반영
- **R4-8.** Zod schema description: `'Human-readable amount (e.g., "0.001" for 0.001 ETH). Alternative to amount in smallest units.'`

### R5. SDK 및 Skill 파일 동기화

- **R5-1.** SDK 메서드의 amount 파라미터에 `humanAmount` 옵션 추가 (TypeScript overload 또는 union)
- **R5-2.** 모든 skill 파일(transactions, actions, wallet 등)에 단위 규칙 설명 섹션 추가
- **R5-3.** skill 파일에 `humanAmount` 사용 예시 우선 안내 (에이전트 친화적)
- **R5-4.** quickstart.skill.md에 amount 단위 가이드 추가

### R6. 테스트

- **R6-1.** 각 Action Provider의 단위 통일 테스트: smallest unit 입력 → 정상 실행 확인
- **R6-2.** 하위 호환성 테스트: human-readable 입력 시 자동 변환 + deprecation 경고 확인
- **R6-3.** MCP typed schema 테스트: 동적 도구 등록 시 올바른 schema 생성 확인
- **R6-4.** amountFormatted 테스트: 다양한 decimals(6, 8, 9, 18)에 대해 올바른 포맷 확인
- **R6-5.** humanAmount 테스트: amount/humanAmount 상호 배타 검증, decimals 조회 + 변환 정확성
- **R6-6.** humanAmount + 미등록 토큰 에러 테스트
- **R6-7.** `max` 키워드 호환성 테스트 (aave/kamino repay/withdraw)
- **R6-8.** E2E 시나리오: AI 에이전트가 humanAmount로 swap/transfer/supply 실행

---

## 설계 결정

### D1. Smallest Unit을 기준 단위로 선택

human-readable 대신 smallest unit을 표준으로 선택한 이유:
- **정밀도 보장**: `0.1 + 0.2 !== 0.3` 부동소수점 문제 회피, bigint 연산으로 정확한 값 보존
- **모호성 제거**: `"100"`이 100 ETH인지 100 wei인지 명확 (항상 smallest unit)
- **블록체인 표준 준수**: Ethereum JSON-RPC(wei), Solana RPC(lamports), Stripe(cents) 등 업계 표준
- **체인/토큰 독립**: decimals를 몰라도 API 호출 가능 (decimals 조회는 응답 해석 시에만 필요)

### D2. 하위 호환성을 위한 소수점 감지 자동 변환

기존 human-readable 입력을 즉시 거부하면 breaking change가 된다. 소수점 포함 여부로 자동 감지하여:
- `"1000000000000000"` → smallest unit으로 처리
- `"1.5"` → human-readable로 간주, 자동 변환 + deprecation 경고
- 전환 기간(2 minor 버전) 후 human-readable 자동 변환 제거 고려

### D3. humanAmount는 별도 파라미터로 분리

`amount` 필드 하나에 양쪽을 허용하면 모호성이 생긴다 (`"100"` = 100 wei? 100 ETH?). 별도 `humanAmount` 파라미터로 분리하면:
- 명시적 의도 표현: caller가 어떤 단위를 사용하는지 확실
- Zod discriminated validation 가능: `amount` XOR `humanAmount`
- 기존 API 100% 하위 호환

### D4. MCP Schema는 메타데이터 API 기반 동적 생성

Action Provider의 Zod schema를 MCP 도구에 정적으로 복제하면 동기화 부담이 생긴다. 대신:
- Action Provider가 메타데이터 API로 자신의 input schema를 JSON Schema 형태로 노출
- MCP tool 등록 시 이 JSON Schema를 Zod로 변환하여 사용
- Provider 추가/변경 시 MCP 도구가 자동으로 schema 업데이트

### D5. amountFormatted는 best-effort

모든 트랜잭션에 대해 decimals를 알 수 있는 것은 아니다 (미등록 토큰, CONTRACT_CALL의 arbitrary data 등). `amountFormatted`는:
- decimals를 알 수 있을 때만 값 반환, 그렇지 않으면 `null`
- native token은 항상 가능 (chain config에 decimals 존재)
- 등록된 토큰은 token registry에서 조회
- 미등록 토큰이면 `null` 반환 (에러 아님)

### D6. Polymarket은 예외 유지

Polymarket의 `size`(토큰 수량)와 `price`(0-1 범위)는 블록체인 smallest unit과 무관한 CLOB 거래소 고유 규칙이다. 이 provider는 현재 규칙을 유지하며, schema description에서 해당 사실을 명확히 기술한다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/actions/src/providers/aave-v3/` | 입력 단위 smallest unit 전환 + humanAmount 추가 |
| `packages/actions/src/providers/kamino/` | 동일 |
| `packages/actions/src/providers/lido-staking/` | 동일 |
| `packages/actions/src/providers/jito-staking/` | 동일 |
| `packages/actions/src/providers/hyperliquid/` | 동일 |
| `packages/actions/src/providers/drift/` | 동일 |
| `packages/actions/src/providers/jupiter-swap/` | schema description 강화 + humanAmount 추가 |
| `packages/actions/src/providers/zerox-swap/` | 동일 |
| `packages/actions/src/providers/across/` | 동일 |
| `packages/actions/src/common/amount-parser.ts` | 하위 호환 자동 변환 로직 추가 |
| `packages/mcp/src/tools/action-provider.ts` | typed schema 동적 생성 로직 |
| `packages/daemon/src/api/routes/` | humanAmount 파라미터 + amountFormatted 응답 |
| `packages/core/src/schemas/transaction.schema.ts` | humanAmount, amountFormatted, decimals, symbol 필드 |
| `packages/core/src/utils/format-amount.ts` | 포맷 유틸리티 확장 (symbol 포함) |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | 응답 스키마 확장 |
| `packages/sdk/src/` | humanAmount 옵션 추가 |
| `packages/skills/skills/` | 단위 가이드 섹션 추가 |
| `packages/mcp/src/tools/send-token.ts` 등 | description 단위 명시 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| amount 자동 단위 추론 (`"100"` → ETH? wei?) | 모호성 위험, 안전하지 않음 | humanAmount 명시적 파라미터 |
| 모든 응답의 USD 변환 | price oracle 의존, 별도 기능 | 기존 amountUsd 필드 활용 |
| CLI 인터랙티브 단위 선택 | CLI 범위 밖 | SDK humanAmount 사용 |
| human-readable 자동 변환 영구 유지 | deprecation 후 제거 예정 | 명시적 humanAmount 사용 권장 |
