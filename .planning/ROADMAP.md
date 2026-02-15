# Roadmap: WAIaaS

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** -- Phases 109-114 (shipped 2026-02-14)
- ✅ **v1.4.7 임의 트랜잭션 서명 API** -- Phases 115-119 (shipped 2026-02-15)
- ✅ **v1.4.8 Admin DX + 알림 개선** -- Phases 120-124 (shipped 2026-02-15)
- ✅ **v1.5 DeFi Price Oracle + Action Provider Framework** -- Phases 125-129 (shipped 2026-02-15)
- [ ] **v1.5.1 x402 클라이언트 지원** -- Phases 130-133 (in progress)

## Phases

<details>
<summary>v1.4.6 멀티체인 월렛 구현 (Phases 109-114) -- SHIPPED 2026-02-14</summary>

- [x] Phase 109: DB 마이그레이션 + 환경 모델 SSoT (2/2 plans) -- completed 2026-02-14
- [x] Phase 110: 스키마 전환 + 정책 엔진 (2/2 plans) -- completed 2026-02-14
- [x] Phase 111: 파이프라인 네트워크 해결 (2/2 plans) -- completed 2026-02-14
- [x] Phase 112: REST API 네트워크 확장 (2/2 plans) -- completed 2026-02-14
- [x] Phase 113: MCP + SDK + Admin UI (3/3 plans) -- completed 2026-02-14
- [x] Phase 114: CLI Quickstart + DX 통합 (2/2 plans) -- completed 2026-02-14

</details>

<details>
<summary>v1.4.7 임의 트랜잭션 서명 API (Phases 115-119) -- SHIPPED 2026-02-15</summary>

- [x] Phase 115: Core Types + DB Migration + Parsers (3/3 plans) -- completed 2026-02-15
- [x] Phase 116: Default Deny Toggles (2/2 plans) -- completed 2026-02-15
- [x] Phase 117: Sign-Only Pipeline + REST API (2/2 plans) -- completed 2026-02-15
- [x] Phase 118: EVM Calldata Encoding (2/2 plans) -- completed 2026-02-15
- [x] Phase 119: SDK + MCP + Notifications + Skill Resources (3/3 plans) -- completed 2026-02-15

</details>

<details>
<summary>v1.4.8 Admin DX + 알림 개선 (Phases 120-124) -- SHIPPED 2026-02-15</summary>

- [x] Phase 120: DB 마이그레이션 안정성 (1/1 plans) -- completed 2026-02-15
- [x] Phase 121: MCP 안정성 (1/1 plans) -- completed 2026-02-15
- [x] Phase 122: MCP 도구 + 멀티체인 DX (2/2 plans) -- completed 2026-02-15
- [x] Phase 123: Admin UI 개선 (2/2 plans) -- completed 2026-02-15
- [x] Phase 124: 알림 시스템 개선 (2/2 plans) -- completed 2026-02-15

</details>

<details>
<summary>v1.5 DeFi Price Oracle + Action Provider Framework (Phases 125-129) -- SHIPPED 2026-02-15</summary>

- [x] Phase 125: Design Docs + Oracle Interfaces (2/2 plans) -- completed 2026-02-15
- [x] Phase 126: Oracle Implementations (3/3 plans) -- completed 2026-02-15
- [x] Phase 127: USD Policy Integration (3/3 plans) -- completed 2026-02-15
- [x] Phase 128: Action Provider + API Key (4/4 plans) -- completed 2026-02-15
- [x] Phase 129: MCP/Admin/Skill Integration (2/2 plans) -- completed 2026-02-15

</details>

### v1.5.1 x402 클라이언트 지원 (In Progress)

**Milestone Goal:** AI 에이전트가 x402 프로토콜로 보호된 외부 유료 API를 자동 결제하며 사용할 수 있는 상태

- [x] **Phase 130: Core 타입 + CAIP-2 매핑 + DB 마이그레이션** (2/2 plans) -- completed 2026-02-15
- [x] **Phase 131: SSRF 가드 + x402 핸들러 + 결제 서명** (3/3 plans) -- completed 2026-02-15
- [ ] **Phase 132: REST API + 정책 통합 + 감사 로그** (3 plans) - 엔드포인트 노출, 정책 평가, 트랜잭션 기록
- [ ] **Phase 133: SDK + MCP + 스킬 파일** - TS/Python SDK, MCP 도구, 문서 통합

## Phase Details

### Phase 130: Core 타입 + CAIP-2 매핑 + DB 마이그레이션
**Goal**: x402 기능의 타입 시스템과 데이터베이스 기반이 준비되어 후속 구현이 컴파일 타임 안전성을 가지는 상태
**Depends on**: Nothing (v1.5 shipped 기반)
**Requirements**: X4CORE-01, X4CORE-02, X4CORE-03, X4CORE-04, X4CORE-05, X4CORE-06, X4CORE-07
**Success Criteria** (what must be TRUE):
  1. @x402/core 패키지에서 PaymentRequirements/PaymentPayload Zod 스키마를 import하여 x402 v2 타입 검증이 동작한다
  2. TransactionType.X402_PAYMENT과 PolicyType.X402_ALLOWED_DOMAINS가 기존 Enum SSoT에 통합되어 discriminatedUnion 파이프라인과 정책 엔진이 새 타입을 인식한다
  3. CAIP-2 식별자(eip155:1, solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp)를 WAIaaS NetworkType으로 변환하는 매핑이 동작한다
  4. DB 마이그레이션 v12가 적용되어 transactions/policies 테이블이 새 타입을 수용하고, 기존 데이터가 보존된다
  5. x402 전용 에러 코드 8개가 정의되어 에러 핸들러와 i18n 템플릿에서 사용 가능하다
**Plans**: 2 plans (2 waves)

Plans:
- [x] 130-01-PLAN.md — @x402/core 의존성 + Enum 확장 + x402.types.ts + 에러 코드 + i18n + 테스트 (Wave 1)
- [x] 130-02-PLAN.md — DB 마이그레이션 v12 (transactions + policies CHECK 재생성) + 마이그레이션 테스트 (Wave 2)

### Phase 131: SSRF 가드 + x402 핸들러 + 결제 서명
**Goal**: 외부 URL에 대한 안전한 HTTP 요청, 402 응답 파싱, 체인별 결제 서명 생성이 단위 테스트 수준에서 동작하는 상태
**Depends on**: Phase 130
**Requirements**: X4SEC-01, X4SEC-02, X4SEC-03, X4SEC-04, X4SEC-05, X4HAND-01, X4HAND-02, X4HAND-03, X4HAND-04, X4HAND-05, X4HAND-06, X4SIGN-01, X4SIGN-02, X4SIGN-03, X4SIGN-04
**Success Criteria** (what must be TRUE):
  1. 사설 IP/localhost/링크 로컬/IPv4-mapped IPv6/옥탈/16진수 등 SSRF 우회 벡터가 모두 차단되고, HTTPS만 허용되며, 리다이렉트 매 hop에서 IP가 재검증된다
  2. HTTP 402 응답의 PAYMENT-REQUIRED 헤더에서 PaymentRequirements가 파싱되고, 비-402 응답은 그대로 패스스루된다
  3. accepts 배열에서 WAIaaS가 지원하는 (scheme, network) 쌍이 자동 선택되고, 지원 불가 시 X402_UNSUPPORTED_SCHEME 에러가 반환된다
  4. EVM EIP-3009 transferWithAuthorization 서명(viem signTypedData)과 Solana SPL TransferChecked 부분 서명(@solana/kit signBytes)이 각각 생성되고, 키스토어 복호화/해제가 finally 블록으로 안전하게 처리된다
  5. 결제 서명 재요청 후 다시 402를 받으면 1회만 재시도하고 X402_PAYMENT_REJECTED 에러로 종료된다
**Plans**: 3 plans (2 waves)

Plans:
- [x] 131-01-PLAN.md — SSRF 가드 TDD: DNS resolve + 사설 IP 차단 + 리다이렉트 재검증 + URL 정규화 (Wave 1)
- [x] 131-03-PLAN.md — 결제 서명 TDD: EVM EIP-3009 signTypedData + Solana TransferChecked 부분 서명 + 키 관리 (Wave 1)
- [x] 131-02-PLAN.md — x402 핸들러 TDD: 402 파싱 + scheme 선택 + 재요청 오케스트레이션 (Wave 2)

### Phase 132: REST API + 정책 통합 + 감사 로그
**Goal**: x402 결제가 기존 정책 엔진으로 제어되고, REST API로 노출되며, 모든 결제가 감사 추적되는 상태
**Depends on**: Phase 131
**Requirements**: X4POL-01, X4POL-02, X4POL-03, X4POL-04, X4POL-05, X4POL-06, X4POL-07, X4POL-08, X4API-01, X4API-02, X4API-03, X4API-04
**Success Criteria** (what must be TRUE):
  1. X402_ALLOWED_DOMAINS 정책이 기본 거부로 동작하여, 허용된 도메인(와일드카드 포함)에만 x402 결제가 실행되고, 미등록 도메인은 X402_DOMAIN_NOT_ALLOWED로 차단된다
  2. x402 결제 금액이 기존 SPENDING_LIMIT 4-tier(AUTO/NOTIFY/DELAY/APPROVAL)로 평가되되, DELAY는 request_timeout 내 대기 후 타임아웃 시 거부되고, APPROVAL은 즉시 거부된다
  3. POST /v1/x402/fetch 엔드포인트가 sessionAuth로 보호되어 AI 에이전트가 URL을 전달하면 자동 결제 후 응답을 받을 수 있다
  4. x402 결제가 transactions 테이블에 type=X402_PAYMENT으로 기록되고, 기존 알림 트리거(TX_REQUESTED/TX_CONFIRMED/TX_FAILED)가 연동된다
  5. Kill Switch 활성 시 x402 결제를 포함한 모든 거래가 차단된다
**Plans**: 3 plans (2 waves)

Plans:
- [ ] 132-01-PLAN.md — X402_ALLOWED_DOMAINS 도메인 정책 TDD + config.toml [x402] 섹션 (Wave 1)
- [ ] 132-02-PLAN.md — x402 결제 금액 USD 환산 TDD (USDC $1 직접 + IPriceOracle) (Wave 1)
- [ ] 132-03-PLAN.md — POST /v1/x402/fetch 라우트 + server.ts 등록 + 통합 테스트 (Wave 2)

### Phase 133: SDK + MCP + 스킬 파일
**Goal**: AI 에이전트가 TS SDK, Python SDK, MCP 도구를 통해 x402 유료 API를 자율적으로 호출하고, 스킬 파일로 사용법을 학습할 수 있는 상태
**Depends on**: Phase 132
**Requirements**: X4DX-01, X4DX-02, X4DX-03, X4DX-04, X4DX-05
**Success Criteria** (what must be TRUE):
  1. TS SDK의 client.x402Fetch(url, options)와 Python SDK의 client.x402_fetch(url, options)가 POST /v1/x402/fetch를 호출하여 유료 리소스를 가져온다
  2. MCP x402_fetch 도구로 AI 에이전트가 유료 API URL을 전달하면 자동 결제 후 응답을 받을 수 있다
  3. x402.skill.md 스킬 파일이 생성되어 MCP 스킬 리소스(waiaas://skills/x402)로 노출되고, transactions.skill.md에 x402 결제 내역 조회가 반영된다
**Plans**: TBD

Plans:
- [ ] 133-01: TS SDK + Python SDK x402Fetch 메서드
- [ ] 133-02: MCP x402_fetch 도구 + 스킬 파일

## Progress

**Execution Order:**
Phases execute in numeric order: 130 -> 131 -> 132 -> 133

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 130. Core 타입 + CAIP-2 + DB | v1.5.1 | 2/2 | ✓ Complete | 2026-02-15 |
| 131. SSRF + 핸들러 + 서명 | v1.5.1 | 3/3 | ✓ Complete | 2026-02-15 |
| 132. API + 정책 + 감사 | v1.5.1 | 0/3 | Not started | - |
| 133. SDK + MCP + 스킬 | v1.5.1 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-15*
*Last updated: 2026-02-15*
