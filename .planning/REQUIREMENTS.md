# Requirements: WAIaaS v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선

**Defined:** 2026-03-14
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v31.15. Each maps to roadmap phases.

### Unit Standardization

- [ ] **UNIT-01**: 4개 provider(aave-v3, kamino, lido-staking, jito-staking) 입력 스키마를 smallest unit(wei/lamports)으로 전환
- [ ] **UNIT-02**: 전환 대상 provider에서 parseTokenAmount() 호출 제거, 입력값을 bigint로 직접 사용
- [ ] **UNIT-03**: migrateAmount(value, decimals) 공유 헬퍼 — 소수점 포함 입력 시 human-readable로 간주하여 자동 변환 + deprecation 경고 로그 출력
- [ ] **UNIT-04**: 모든 provider Zod schema description에 단위 명시 (예: 'Amount in smallest units (wei/lamports). Example: "1000000000000000" = 0.001 ETH')
- [ ] **UNIT-05**: max 키워드 호환성 유지 (aave/kamino repay/withdraw에서 max는 단위 변환과 독립적으로 동작)
- [ ] **UNIT-06**: CLOB 예외 provider(Hyperliquid, Drift, Polymarket) schema description에 human-readable 단위 사용 명시

### MCP Typed Schema

- [ ] **MCP-01**: GET /v1/actions/providers 메타데이터 API에 각 action의 inputSchema JSON 필드 추가 (zodToJsonSchema 변환)
- [ ] **MCP-02**: MCP tool 등록 시 provider 메타데이터의 typed Zod schema 적용 (z.record(z.unknown()) 대체)
- [ ] **MCP-03**: schema 변환 불가 시 기존 z.record(z.unknown()) fallback 유지
- [ ] **MCP-04**: MCP tool description에 amount 파라미터 단위 예시 포함
- [ ] **MCP-05**: 빌트인 MCP 도구(send-token, transfer-nft 등) amount description에 단위 명시

### Response Enrichment

- [ ] **RESP-01**: TxDetailResponseSchema에 amountFormatted: string | null, decimals: number | null, symbol: string | null 필드 추가
- [ ] **RESP-02**: Action Provider 실행 결과 data에 amountFormatted/decimals/symbol 추가 (smallest unit 사용 10개 provider, CLOB 예외 제외)
- [ ] **RESP-03**: 잔액 조회 API(GET /v1/wallets/:id/balance)에 balanceFormatted 추가
- [ ] **RESP-04**: native token은 chain config에서, ERC-20/SPL은 token registry에서 decimals/symbol 조회
- [ ] **RESP-05**: amountFormatted/decimals/symbol은 런타임 계산 필드 (DB 저장 없음, decimals 불명 시 null)

### humanAmount Parameter

- [ ] **HAMNT-01**: REST API 트랜잭션 요청(TRANSFER, TOKEN_TRANSFER, APPROVE)에 humanAmount: string 옵션 파라미터 추가
- [ ] **HAMNT-02**: amount와 humanAmount 동시 지정 시 에러 반환 (Zod superRefine XOR 검증)
- [ ] **HAMNT-03**: humanAmount 지정 시 토큰 decimals 조회 → parseAmount()로 smallest unit 변환 후 파이프라인 주입 (TRANSFER: native decimals, TOKEN_TRANSFER: registry 조회, 미등록 시 에러)
- [ ] **HAMNT-04**: Action Provider에 per-provider humanAmount 파라미터 추가 (amount→humanAmount, sellAmount→humanSellAmount 등, CLOB 예외 제외)
- [ ] **HAMNT-05**: MCP 도구 schema에 humanAmount 파라미터 반영

### SDK & Skills

- [ ] **SDK-01**: SDK 메서드의 amount 파라미터에 humanAmount 옵션 추가
- [ ] **SDK-02**: skill 파일(transactions, actions, wallet 등)에 단위 규칙 설명 섹션 추가
- [ ] **SDK-03**: skill 파일에 humanAmount 사용 예시 우선 안내 (에이전트 친화적)
- [ ] **SDK-04**: quickstart.skill.md에 amount 단위 가이드 추가

### Tests

- [ ] **TEST-01**: 각 Action Provider의 단위 통일 테스트 — smallest unit 입력 → 정상 실행 확인
- [ ] **TEST-02**: 하위 호환성 테스트 — human-readable 입력(소수점) 시 자동 변환 + deprecation 경고 확인
- [ ] **TEST-03**: MCP typed schema 테스트 — 동적 도구 등록 시 올바른 schema 생성 확인
- [ ] **TEST-04**: amountFormatted 테스트 — 다양한 decimals(6, 8, 9, 18)에 대해 올바른 포맷 확인
- [ ] **TEST-05**: humanAmount XOR 검증 + decimals 조회 + 변환 정확성 테스트
- [ ] **TEST-06**: humanAmount + 미등록 토큰 에러 테스트
- [ ] **TEST-07**: max 키워드 호환성 테스트 (aave/kamino repay/withdraw)
- [ ] **TEST-08**: E2E 시나리오 — AI 에이전트가 humanAmount로 swap/transfer/supply 실행

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Deprecation Removal

- **DEPR-01**: migrateAmount() 소수점 자동 변환 제거 (v31.17 이후 별도 마일스톤)
- **DEPR-02**: 크기 기반 의심 금액 경고 시스템 (price oracle 기반)

## Out of Scope

| Feature | Reason |
|---------|--------|
| amount 자동 단위 추론 ("100" → ETH? wei?) | 모호성 위험, 자금 손실 가능 — humanAmount 명시적 파라미터로 해결 |
| 모든 응답 USD 변환 | price oracle 의존, 별도 기능 — 기존 amountUsd 필드 활용 |
| CLI 인터랙티브 단위 선택 | CLI 범위 밖 — SDK humanAmount 사용 |
| 크기 기반 휴리스틱 자동 감지 | decimals 작은 토큰(USDC=6)에서 오판 → 자금 손실 위험 |
| DB 마이그레이션 | amountFormatted 등은 런타임 계산 — DB 변경 불필요 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UNIT-01 | — | Pending |
| UNIT-02 | — | Pending |
| UNIT-03 | — | Pending |
| UNIT-04 | — | Pending |
| UNIT-05 | — | Pending |
| UNIT-06 | — | Pending |
| MCP-01 | — | Pending |
| MCP-02 | — | Pending |
| MCP-03 | — | Pending |
| MCP-04 | — | Pending |
| MCP-05 | — | Pending |
| RESP-01 | — | Pending |
| RESP-02 | — | Pending |
| RESP-03 | — | Pending |
| RESP-04 | — | Pending |
| RESP-05 | — | Pending |
| HAMNT-01 | — | Pending |
| HAMNT-02 | — | Pending |
| HAMNT-03 | — | Pending |
| HAMNT-04 | — | Pending |
| HAMNT-05 | — | Pending |
| SDK-01 | — | Pending |
| SDK-02 | — | Pending |
| SDK-03 | — | Pending |
| SDK-04 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| TEST-06 | — | Pending |
| TEST-07 | — | Pending |
| TEST-08 | — | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 0
- Unmapped: 33 ⚠️

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after initial definition*
