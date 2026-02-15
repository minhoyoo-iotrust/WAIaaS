# Requirements: WAIaaS v1.5.2

**Defined:** 2026-02-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.5.2 Requirements

Admin UI에서 정책을 JSON 직접 입력 없이 12개 정책 타입별 구조화된 폼으로 생성/수정할 수 있는 상태를 달성하여 운영자 DX를 개선한다.

### 폼 인프라 (FORM)

- [x] **FORM-01**: 운영자가 정책 생성 시 타입을 선택하면 해당 타입 전용 폼이 렌더링된다
- [x] **FORM-02**: 운영자가 동적 행 목록에서 [+ 추가] 버튼으로 행을 추가할 수 있다
- [x] **FORM-03**: 운영자가 동적 행 목록에서 각 행의 [×] 버튼으로 행을 삭제할 수 있다
- [x] **FORM-04**: 운영자가 [JSON 직접 편집] 토글로 구조화 폼과 JSON textarea를 전환할 수 있다

### 타입별 전용 폼 (PFORM)

- [x] **PFORM-01**: SPENDING_LIMIT 폼 — 3개 네이티브 금액 입력(instant_max, notify_max, delay_max) + 3개 USD 금액 입력(선택, instant_max_usd, notify_max_usd, delay_max_usd) + 지연 시간(delay_seconds) 입력
- [x] **PFORM-02**: WHITELIST 폼 — 주소 동적 행 목록 (allowed_addresses[])
- [x] **PFORM-03**: TIME_RESTRICTION 폼 — 시작/종료 시간 셀렉트(allowed_hours.start/end) + 요일 체크박스 7개(allowed_days[])
- [x] **PFORM-04**: RATE_LIMIT 폼 — 최대 요청 수(max_requests, 숫자) + 윈도우(window_seconds, 숫자) 입력
- [x] **PFORM-05**: ALLOWED_TOKENS 폼 — 토큰 동적 행 (tokens[].address, tokens[].symbol, tokens[].chain 셀렉트)
- [x] **PFORM-06**: CONTRACT_WHITELIST 폼 — 컨트랙트 동적 행 (contracts[].address, contracts[].name, contracts[].chain 셀렉트)
- [x] **PFORM-07**: METHOD_WHITELIST 폼 — 2단계 중첩 동적 행 (methods[].contractAddress + methods[].selectors[] 목록)
- [x] **PFORM-08**: APPROVED_SPENDERS 폼 — Spender 동적 행 (spenders[].address, spenders[].name, spenders[].maxAmount 선택)
- [x] **PFORM-09**: APPROVE_AMOUNT_LIMIT 폼 — 최대 금액(maxAmount, 숫자) 입력 + 무제한 차단(blockUnlimited) 체크박스
- [x] **PFORM-10**: APPROVE_TIER_OVERRIDE 폼 — 티어 셀렉트 (INSTANT / NOTIFY / DELAY / APPROVAL)
- [x] **PFORM-11**: ALLOWED_NETWORKS 폼 — 네트워크 동적 행 (networks[].network 셀렉트 NetworkTypeEnum 기반, networks[].name 텍스트 선택)
- [x] **PFORM-12**: X402_ALLOWED_DOMAINS 폼 — 도메인 패턴 동적 행 (domains[] 텍스트, 와일드카드 지원)

### 유효성 검증 (VALID)

- [x] **VALID-01**: 4개 미등록 타입(WHITELIST, TIME_RESTRICTION, RATE_LIMIT, X402_ALLOWED_DOMAINS)의 Zod rules 스키마가 @waiaas/core POLICY_RULES_SCHEMAS에 추가된다
- [x] **VALID-02**: 폼 입력 시 필수 필드 미입력, 주소 형식, 숫자 범위 등을 실시간 검증하여 필드 하단에 에러 메시지를 표시한다
- [x] **VALID-03**: 빈 목록(행 0개)으로 생성 시도 시 "최소 1개 항목 필요" 에러를 표시한다

### 목록 시각화 (VIS)

- [x] **VIS-01**: ALLOWED_TOKENS 목록에서 토큰 심볼 배지 목록으로 표시된다 (예: `LINK` `USDC` `WETH`)
- [x] **VIS-02**: RATE_LIMIT 목록에서 "100 req / 1h" 형식으로 표시된다
- [x] **VIS-03**: 나머지 10개 타입도 각각 의미 있는 시각화로 표시된다 (WHITELIST 주소 수 배지, TIME_RESTRICTION "Mon-Fri 09:00-18:00", CONTRACT_WHITELIST 컨트랙트명 축약, METHOD_WHITELIST 컨트랙트+메서드 수, APPROVED_SPENDERS Spender 수, APPROVE_AMOUNT_LIMIT 최대 금액, APPROVE_TIER_OVERRIDE 티어 색상 배지, ALLOWED_NETWORKS 네트워크명 배지, X402_ALLOWED_DOMAINS 도메인 패턴 배지, SPENDING_LIMIT 기존 tier bars 유지)

### 수정 통합 (EDIT)

- [x] **EDIT-01**: 기존 정책 수정 클릭 시 전용 폼에 현재 rules 값이 프리필된다
- [x] **EDIT-02**: 수정 후 저장 시 올바른 PUT /v1/policies/{id} API 호출이 발생한다

## Future Requirements

없음 — 이 마일스톤에서 전체 scope 처리.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 정책 타입 신규 추가 | 기존 12개 타입에 대한 폼 구현만 진행 |
| 서버 사이드 Zod 검증 변경 | 기존 서버 Zod 검증은 그대로 유지, 클라이언트 폼 검증만 추가 |
| 모바일 레이아웃 최적화 | 데스크톱 우선, 모바일은 JSON 폴백 권장 |
| 정책 복제/내보내기 기능 | 별도 마일스톤 |
| 정책 템플릿 프리셋 | 별도 마일스톤 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FORM-01 | Phase 134 | Done |
| FORM-02 | Phase 134 | Done |
| FORM-03 | Phase 134 | Done |
| FORM-04 | Phase 134 | Done |
| PFORM-01 | Phase 134 | Done |
| PFORM-02 | Phase 134 | Done |
| PFORM-03 | Phase 135 | Done |
| PFORM-04 | Phase 134 | Done |
| PFORM-05 | Phase 135 | Done |
| PFORM-06 | Phase 135 | Done |
| PFORM-07 | Phase 135 | Done |
| PFORM-08 | Phase 135 | Done |
| PFORM-09 | Phase 134 | Done |
| PFORM-10 | Phase 134 | Done |
| PFORM-11 | Phase 135 | Done |
| PFORM-12 | Phase 135 | Done |
| VALID-01 | Phase 134 | Done |
| VALID-02 | Phase 134 | Done |
| VALID-03 | Phase 134 | Done |
| VIS-01 | Phase 135 | Done |
| VIS-02 | Phase 135 | Done |
| VIS-03 | Phase 135 | Done |
| EDIT-01 | Phase 135 | Done |
| EDIT-02 | Phase 135 | Done |

**Coverage:**
- v1.5.2 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-16 -- Phase 135 완료 (24/24 requirements done, v1.5.2 마일스톤 완료)*
