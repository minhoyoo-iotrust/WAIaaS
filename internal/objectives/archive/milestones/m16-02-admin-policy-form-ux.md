# 마일스톤 m16-02: Admin UI 정책 폼 UX 개선

## 목표

Admin UI에서 정책을 JSON 직접 입력 없이 구조화된 폼으로 생성/수정할 수 있는 상태. 12개 정책 타입 각각에 맞는 전용 입력 UI를 제공하여 운영자 DX를 개선한다.

---

## 배경

### 현재 문제점

정책 생성/수정 시 `rules` 필드를 JSON textarea에 직접 입력해야 한다:

```json
{
  "tokens": [
    { "address": "0x779877a7b0d9e8603169ddbd7836e478b4624789", "symbol": "LINK", "chain": "ethereum" }
  ]
}
```

- JSON 문법 오류(쉼표, 따옴표)로 생성 실패가 잦음
- 각 정책 타입별 필수/선택 필드를 사용자가 기억해야 함
- SPENDING_LIMIT만 목록에서 시각화(tier bars)가 되고 나머지 11개는 JSON 요약만 표시

### 개선 방향

정책 타입을 선택하면 해당 타입 전용 폼이 렌더링되어, 필드별 입력/유효성 검증/도움말이 제공된다. Zod 스키마(`policy.schema.ts`의 `superRefine` 규칙)가 이미 타입별 구조를 정의하고 있으므로 이를 폼 구조의 근거로 사용한다.

---

## 구현 대상

### 타입별 폼 컴포넌트

| 정책 타입 | 현재 (JSON) | 개선 후 (전용 폼) |
|-----------|------------|------------------|
| SPENDING_LIMIT | `{"instant_max":"1000000", ...}` | 3개 네이티브 금액 입력 (Instant/Notify/Delay) + 3개 USD 금액 입력 (선택, instant_max_usd/notify_max_usd/delay_max_usd) + 지연 시간(초) |
| WHITELIST | `{"allowed_addresses":[...]}` | 주소 목록 — 행 추가/삭제 버튼, 주소 텍스트 입력 |
| TIME_RESTRICTION | `{"allowed_hours":{"start":0,"end":24}, ...}` | 시작/종료 시간 셀렉트 + 요일 체크박스 7개 |
| RATE_LIMIT | `{"max_requests":100, "window_seconds":3600}` | 최대 요청 수(숫자) + 윈도우(초, 숫자) |
| ALLOWED_TOKENS | `{"tokens":[{"address":"0x...", ...}]}` | 토큰 행 추가/삭제 — address(텍스트), symbol(텍스트), chain(셀렉트) |
| CONTRACT_WHITELIST | `{"contracts":[{"address":"0x...", ...}]}` | 컨트랙트 행 추가/삭제 — address(텍스트), name(텍스트), chain(셀렉트) |
| METHOD_WHITELIST | `{"methods":[{"contractAddress":"0x...", "selectors":["0xa9059cbb"]}]}` | 컨트랙트별 메서드 셀렉터 목록 — 2단계 중첩 행 추가/삭제 |
| APPROVED_SPENDERS | `{"spenders":[{"address":"0x...", ...}]}` | Spender 행 추가/삭제 — address(텍스트), name(텍스트), maxAmount(숫자, 선택) |
| APPROVE_AMOUNT_LIMIT | `{"maxAmount":"1000000", "blockUnlimited":true}` | 최대 금액(숫자) + 무제한 차단 체크박스 |
| APPROVE_TIER_OVERRIDE | `{"tier":"DELAY"}` | 티어 셀렉트 (INSTANT/NOTIFY/DELAY/APPROVAL) |
| ALLOWED_NETWORKS | `{"networks":[{"network":"ethereum-sepolia","name":"Sepolia"}]}` | 네트워크 행 추가/삭제 — network(셀렉트, NetworkTypeEnum 기반), name(텍스트, 선택) |
| X402_ALLOWED_DOMAINS | `{"domains":["api.example.com","*.service.io"]}` | 도메인 패턴 행 추가/삭제 — domain(텍스트, 와일드카드 지원) |

### 공통 UI 패턴

| 패턴 | 설명 |
|------|------|
| 동적 행 목록 | WHITELIST, ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS, ALLOWED_NETWORKS, X402_ALLOWED_DOMAINS에 사용. [+ 추가] 버튼으로 행 추가, 각 행에 [×] 삭제 버튼 |
| chain 셀렉트 | ALLOWED_TOKENS, CONTRACT_WHITELIST에서 사용. 옵션: solana / ethereum / (선택 안 함 = 전체 체인) |
| 실시간 유효성 검증 | 필수 필드 미입력, 주소 형식, 숫자 범위 등을 입력 시점에 검증하여 필드 하단에 에러 표시 |
| JSON 폴백 토글 | 고급 사용자를 위해 [JSON 직접 편집] 토글 — 기존 JSON textarea로 전환 가능 |

### 목록 시각화 개선

현재 SPENDING_LIMIT만 tier bars로 시각화되고 나머지는 JSON 요약 텍스트(`rules-summary`)를 표시한다. 개선 후:

| 정책 타입 | 목록 표시 |
|-----------|----------|
| SPENDING_LIMIT | 기존 tier bars 유지 |
| WHITELIST | 주소 수 배지 (예: "3 addresses") |
| ALLOWED_TOKENS | 토큰 심볼 배지 목록 (예: `LINK` `USDC` `WETH`) |
| CONTRACT_WHITELIST | 컨트랙트명/주소 축약 목록 |
| METHOD_WHITELIST | 컨트랙트 수 + 메서드 수 배지 |
| APPROVED_SPENDERS | Spender 수 배지 |
| RATE_LIMIT | "100 req / 1h" 형식 |
| TIME_RESTRICTION | "Mon-Fri 09:00-18:00" 형식 |
| APPROVE_AMOUNT_LIMIT | 최대 금액 표시 |
| APPROVE_TIER_OVERRIDE | 티어 배지 (색상 코드) |
| ALLOWED_NETWORKS | 네트워크명 배지 목록 (예: `ethereum-sepolia` `polygon-mainnet`) |
| X402_ALLOWED_DOMAINS | 도메인 패턴 배지 목록 (예: `api.example.com` `*.service.io`) |

---

## 산출물

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| PolicyFormRouter | 정책 타입에 따라 해당 전용 폼 컴포넌트를 렌더링하는 라우터. 생성 모달과 수정 모달 양쪽에서 사용 |
| SpendingLimitForm | 3개 네이티브 금액(instant/notify/delay_max) + 3개 USD 금액(선택) + 지연 시간 입력. 기존 TierVisualization과 스타일 일관성 유지 |
| WhitelistForm | 주소 동적 행 목록 |
| TimeRestrictionForm | 시간 범위 + 요일 체크박스 |
| RateLimitForm | 숫자 2개 (요청 수, 윈도우) |
| AllowedTokensForm | 토큰 동적 행 (address, symbol, chain) |
| ContractWhitelistForm | 컨트랙트 동적 행 (address, name, chain) |
| MethodWhitelistForm | 2단계 중첩 동적 행 (contract → selectors[]) |
| ApprovedSpendersForm | Spender 동적 행 (address, name, maxAmount) |
| ApproveAmountLimitForm | 금액 입력 + 체크박스 |
| ApproveTierOverrideForm | 티어 셀렉트 |
| AllowedNetworksForm | 네트워크 동적 행 — network(셀렉트, NetworkTypeEnum 기반), name(텍스트, 선택) |
| X402AllowedDomainsForm | 도메인 패턴 동적 행 (텍스트, 와일드카드 지원) |
| DynamicRowList | 재사용 가능한 동적 행 추가/삭제 컴포넌트 |
| PolicyRulesSummary | 목록에서 타입별 시각화를 렌더링하는 컴포넌트 (기존 `rules-summary` 대체) |

### 파일/모듈 구조

```
packages/admin/src/
  pages/
    policies.tsx                    # 기존 — PolicyFormRouter 사용으로 리팩터링
  components/
    policy-forms/
      index.ts                      # PolicyFormRouter export
      spending-limit-form.tsx        # SPENDING_LIMIT 전용 폼
      whitelist-form.tsx             # WHITELIST 전용 폼
      time-restriction-form.tsx      # TIME_RESTRICTION 전용 폼
      rate-limit-form.tsx            # RATE_LIMIT 전용 폼
      allowed-tokens-form.tsx        # ALLOWED_TOKENS 전용 폼
      contract-whitelist-form.tsx    # CONTRACT_WHITELIST 전용 폼
      method-whitelist-form.tsx      # METHOD_WHITELIST 전용 폼
      approved-spenders-form.tsx     # APPROVED_SPENDERS 전용 폼
      approve-amount-limit-form.tsx  # APPROVE_AMOUNT_LIMIT 전용 폼
      approve-tier-override-form.tsx # APPROVE_TIER_OVERRIDE 전용 폼
      allowed-networks-form.tsx      # ALLOWED_NETWORKS 전용 폼
      x402-allowed-domains-form.tsx  # X402_ALLOWED_DOMAINS 전용 폼
    dynamic-row-list.tsx             # 재사용 동적 행 컴포넌트
    policy-rules-summary.tsx         # 목록 시각화 컴포넌트
  styles/
    global.css                       # 폼 관련 CSS 추가
```

---

## E2E 검증 시나리오

**자동화 비율: 100% — JSDOM + Preact Testing Library**

### 폼 렌더링

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 타입 선택 시 전용 폼 렌더링 | SPENDING_LIMIT 선택 → 3개 네이티브 금액 필드 + 3개 USD 금액 필드 존재 assert | [L0] |
| 2 | 타입 변경 시 폼 전환 | WHITELIST → ALLOWED_TOKENS 변경 → 토큰 행 입력 UI 렌더링 assert | [L0] |
| 3 | JSON 폴백 토글 | [JSON 직접 편집] 클릭 → textarea 표시 → 다시 클릭 → 구조화 폼 복원 assert | [L0] |

### 동적 행 목록

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | ALLOWED_TOKENS 행 추가 | [+ 추가] 클릭 → 새 행(address, symbol, chain) 렌더링 assert | [L0] |
| 5 | 행 삭제 | 3행 중 2번째 [×] 클릭 → 2행으로 감소 assert | [L0] |
| 6 | 빈 목록으로 생성 시도 → 유효성 에러 | ALLOWED_TOKENS 행 0개 상태에서 생성 → "최소 1개 항목 필요" 에러 assert | [L0] |

### 타입별 폼 입력 → 생성

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | SPENDING_LIMIT 폼 입력 → API 호출 | 3개 네이티브 금액 + delay_seconds 입력 + 생성 → POST /v1/policies body에 올바른 rules 포함 assert | [L0] |
| 8 | WHITELIST 주소 3개 입력 → 생성 | 주소 3행 입력 + 생성 → rules.allowed_addresses 길이 3 assert | [L0] |
| 9 | ALLOWED_TOKENS 토큰 2개 → 생성 | address+symbol+chain 2행 → rules.tokens 길이 2 assert | [L0] |
| 10 | CONTRACT_WHITELIST 컨트랙트 1개 → 생성 | address+name+chain 1행 → rules.contracts 길이 1 assert | [L0] |
| 11 | RATE_LIMIT 숫자 입력 → 생성 | max_requests=50, window_seconds=1800 입력 → rules 일치 assert | [L0] |
| 12 | APPROVE_TIER_OVERRIDE 셀렉트 → 생성 | DELAY 선택 → rules.tier='DELAY' assert | [L0] |
| 13 | ALLOWED_NETWORKS 네트워크 2개 → 생성 | network 셀렉트 + name 입력 2행 → rules.networks 길이 2, 각 항목 {network, name} 구조 assert | [L0] |
| 14 | X402_ALLOWED_DOMAINS 도메인 2개 → 생성 | 도메인 2행 입력 → rules.domains 길이 2 assert | [L0] |

### 수정 모달

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 15 | 기존 정책 수정 시 폼에 현재값 프리필 | SPENDING_LIMIT 수정 클릭 → 기존 금액값이 입력 필드에 표시 assert | [L0] |
| 16 | 수정 후 저장 → API 호출 | 금액 변경 + 저장 → PUT /v1/policies/{id} body 검증 assert | [L0] |

### 유효성 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 17 | SPENDING_LIMIT 금액 비숫자 입력 → 에러 | instant_max에 "abc" 입력 → 필드 에러 메시지 표시 assert | [L0] |
| 18 | ALLOWED_TOKENS address 빈 값 → 에러 | 토큰 행의 address 미입력 + 생성 → "주소 필수" 에러 assert | [L0] |

### 목록 시각화

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 19 | ALLOWED_TOKENS 목록에 토큰 심볼 배지 표시 | tokens: [{symbol:'LINK'}, {symbol:'USDC'}] → 배지 2개 렌더링 assert | [L0] |
| 20 | RATE_LIMIT "100 req / 1h" 형식 표시 | {max_requests:100, window_seconds:3600} → "100 req / 1h" 텍스트 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.5 (DeFi + 가격 오라클) | USD 환산 정책이 추가된 후 SPENDING_LIMIT 폼에 USD 금액 표시가 가능 |
| v1.4.4 (Admin Settings) | Settings API + hot-reload 인프라 활용 |

기존 12개 정책 타입과 Zod 스키마, Admin UI 컴포넌트 시스템(Preact + signals + FormField)을 그대로 활용한다. `POLICY_RULES_SCHEMAS`에 미등록인 4개 타입(WHITELIST, TIME_RESTRICTION, RATE_LIMIT, X402_ALLOWED_DOMAINS)의 Zod rules 스키마를 본 마일스톤에서 추가하여 전용 폼의 실시간 유효성 검증과 일관성을 확보한다. X402_ALLOWED_DOMAINS는 Admin UI 정책 타입 목록에도 미등록 상태이므로 함께 추가한다.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | METHOD_WHITELIST 2단계 중첩 UI 복잡도 | 컨트랙트 → 셀렉터 목록 중첩이 모바일에서 레이아웃 깨질 수 있음 | 데스크톱 우선 설계. 모바일은 JSON 폴백 권장 |
| 2 | v1.5 이후 새 정책 타입 추가 시 폼 누락 | 신규 정책 타입에 전용 폼이 없으면 JSON 폴백으로 동작 | PolicyFormRouter에 default → JSON textarea 폴백 포함. CLAUDE.md Interface Sync 규칙으로 누락 방지 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (동적 행 컴포넌트 + 5-type 폼 1 / 7-type 폼 + 목록 시각화 1) |
| 신규/수정 파일 | 17-20개 |
| 테스트 | 20-27개 |
| DB 마이그레이션 | 없음 (프론트엔드 전용 + core Zod 스키마 추가) |

---

*생성일: 2026-02-14*
*수정일: 2026-02-15 — ALLOWED_NETWORKS/X402_ALLOWED_DOMAINS 누락 보완 (10→12 타입), 4개 타입 Zod 스키마 등록, SPENDING_LIMIT 필드 실제 스키마 반영, ALLOWED_NETWORKS object array 구조 정정, PolicyFormRouter 생성+수정 양쪽 사용 명시*
*선행: v1.5 (DeFi + 가격 오라클)*
*관련: v1.4.4 (Admin Settings), 설계 문서 67 (Admin Web UI Spec)*
