# Requirements: WAIaaS v27.3

**Defined:** 2026-02-22
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v27.3 Requirements

### Schema (Zod SSoT)

- [x] **SCHM-01**: TokenLimitSchema(instant_max/notify_max/delay_max 사람 읽기 단위) Zod 스키마가 정의됨
- [x] **SCHM-02**: raw 필드(instant_max/notify_max/delay_max)가 optional로 전환됨
- [x] **SCHM-03**: token_limits 필드가 CAIP-19 키 기반 z.record로 추가됨
- [x] **SCHM-04**: superRefine으로 "USD/token_limits/raw 중 하나 이상 필수" 검증이 동작함
- [x] **SCHM-05**: token_limits 내 instant_max <= notify_max <= delay_max 순서가 검증됨
- [x] **SCHM-06**: token_limits 키가 native/native:{chain}/CAIP-19 형식만 허용됨

### Engine (정책 평가)

- [x] **ENGN-01**: TransactionParam에 tokenDecimals 필드가 추가되고 3곳 인터페이스가 동기화됨
- [x] **ENGN-02**: buildTransactionParam()이 TOKEN_TRANSFER/APPROVE에서 tokenDecimals를 전달함
- [x] **ENGN-03**: evaluateSpendingLimit()에 tokenContext 파라미터가 추가됨
- [x] **ENGN-04**: evaluateTokenTier() 함수가 CAIP-19 키 매칭 순서(정확→native:{chain}→native→raw 폴백)로 평가함
- [x] **ENGN-05**: 토큰별 한도 매칭 시 raw amount를 decimal 변환하여 사람 읽기 단위로 비교함
- [x] **ENGN-06**: token_limits 매칭 없을 때 기존 raw 필드로 폴백함
- [x] **ENGN-07**: raw 필드도 없을 때 네이티브 티어 평가를 스킵하고 USD만으로 판정함
- [x] **ENGN-08**: per-tx 최종 티어가 maxTier(USD 티어, 토큰별 티어)로 결정됨
- [x] **ENGN-09**: APPROVE + APPROVE_TIER_OVERRIDE 존재 시 token_limits가 무시됨
- [x] **ENGN-10**: CONTRACT_CALL/BATCH에서 token_limits가 적용되지 않음

### Admin (UI 폼)

- [x] **ADMN-01**: USD Tiers 섹션이 최상단에 렌더링됨
- [x] **ADMN-02**: Token-Specific Limits 섹션에서 네이티브 토큰 한도를 설정할 수 있음
- [ ] **ADMN-03**: "+ Add Token Limit" 버튼으로 CAIP-19 기반 토큰 한도를 추가/삭제할 수 있음
- [x] **ADMN-04**: 네이티브 심볼이 정책 network에 따라 올바르게 표시됨 (SOL/ETH/POL)
- [ ] **ADMN-05**: Legacy 섹션에 deprecated 안내가 표시됨
- [x] **ADMN-06**: 신규 정책 생성 시 raw 필드 미입력으로 저장할 수 있음
- [ ] **ADMN-07**: 토큰 레지스트리에서 선택 시 CAIP-19 ID가 자동 생성됨

### Compat (하위 호환 + 문서)

- [ ] **CMPT-01**: 기존 정책(raw 필드만, token_limits 없음)이 변경 없이 동일하게 동작함
- [ ] **CMPT-02**: raw + token_limits 동시 존재 시 token_limits가 우선함
- [ ] **CMPT-03**: 누적 한도(daily/monthly_limit_usd) 평가가 영향받지 않음
- [ ] **CMPT-04**: policies.skill.md에 token_limits 필드가 문서화됨

## Future Requirements

(없음 — v27.3은 단일 기능 집중 마일스톤)

## Out of Scope

| Feature | Reason |
|---------|--------|
| token_limits per-token 누적 한도 (daily/monthly) | 현재 누적 한도는 USD 기반만 — token별 누적은 복잡도 높음, 향후 확장 |
| DB 마이그레이션 | rules JSON 컬럼에 optional 필드 추가뿐, DDL 변경 불필요 |
| SDK/MCP token_limits 전용 도구 | 기존 정책 CRUD API로 충분 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 235 | Complete |
| SCHM-02 | Phase 235 | Complete |
| SCHM-03 | Phase 235 | Complete |
| SCHM-04 | Phase 235 | Complete |
| SCHM-05 | Phase 235 | Complete |
| SCHM-06 | Phase 235 | Complete |
| ENGN-01 | Phase 236 | Complete |
| ENGN-02 | Phase 236 | Complete |
| ENGN-03 | Phase 236 | Complete |
| ENGN-04 | Phase 236 | Complete |
| ENGN-05 | Phase 236 | Complete |
| ENGN-06 | Phase 236 | Complete |
| ENGN-07 | Phase 236 | Complete |
| ENGN-08 | Phase 236 | Complete |
| ENGN-09 | Phase 236 | Complete |
| ENGN-10 | Phase 236 | Complete |
| ADMN-01 | Phase 237 | Complete |
| ADMN-02 | Phase 237 | Complete |
| ADMN-03 | Phase 237 | Pending |
| ADMN-04 | Phase 237 | Complete |
| ADMN-05 | Phase 237 | Pending |
| ADMN-06 | Phase 237 | Complete |
| ADMN-07 | Phase 237 | Pending |
| CMPT-01 | Phase 238 | Pending |
| CMPT-02 | Phase 238 | Pending |
| CMPT-03 | Phase 238 | Pending |
| CMPT-04 | Phase 238 | Pending |

**Coverage:**
- v27.3 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation*
