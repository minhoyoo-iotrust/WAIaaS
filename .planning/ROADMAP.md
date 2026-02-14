# Roadmap: WAIaaS v1.4.7

## Overview

v1.4.7은 외부 dApp/프로토콜이 빌드한 unsigned 트랜잭션을 WAIaaS가 정책 평가 후 서명하여 반환하는 sign-only API를 제공한다. 코어 타입/DB 마이그레이션/파서를 기반으로, sign-only 파이프라인, 기본 거부 토글, EVM calldata 인코딩 유틸리티를 구현하고, SDK/MCP/스킬 리소스/알림 보강으로 마무리한다.

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** - Phases 109-114 (shipped 2026-02-14)
- 🚧 **v1.4.7 임의 트랜잭션 서명 API** - Phases 115-119 (in progress)

## Phases

<details>
<summary>v1.4.6 멀티체인 월렛 구현 (Phases 109-114) - SHIPPED 2026-02-14</summary>

- [x] **Phase 109: DB 마이그레이션 + 환경 모델 SSoT** - 2/2 plans
- [x] **Phase 110: 스키마 전환 + 정책 엔진** - 2/2 plans
- [x] **Phase 111: 파이프라인 네트워크 해결** - 2/2 plans
- [x] **Phase 112: REST API 네트워크 확장** - 2/2 plans
- [x] **Phase 113: MCP + SDK + Admin UI** - 3/3 plans
- [x] **Phase 114: CLI Quickstart + DX 통합** - 2/2 plans

</details>

### v1.4.7 임의 트랜잭션 서명 API (In Progress)

- [ ] **Phase 115: Core Types + DB Migration + Parsers** - SIGNED 상태/SIGN 타입 추가, IChainAdapter 파서 메서드, Solana/EVM unsigned tx 파싱 구현
- [ ] **Phase 116: Default Deny Toggles** - ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS 기본 거부 정책 ON/OFF 토글
- [ ] **Phase 117: Sign-Only Pipeline + REST API** - POST /v1/transactions/sign 엔드포인트, 정책 평가 후 동기 서명 반환
- [ ] **Phase 118: EVM Calldata Encoding** - POST /v1/utils/encode-calldata 유틸리티 엔드포인트
- [ ] **Phase 119: SDK + MCP + Notifications + Skill Resources** - TS/Python SDK, MCP 도구, 스킬 리소스 노출, 알림 보강

## Phase Details

### Phase 115: Core Types + DB Migration + Parsers
**Goal**: 모든 downstream 컴포넌트가 의존하는 타입, DB 스키마, unsigned tx 파서가 준비된 상태
**Depends on**: Nothing (first phase)
**Requirements**: SIGN-09, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-14
**Success Criteria** (what must be TRUE):
  1. TransactionStatus에 SIGNED, TransactionType에 SIGN이 추가되어 DB CHECK 제약이 업데이트된다
  2. SolanaAdapter.parseTransaction()이 base64 unsigned tx를 받아 SystemProgram.transfer, SPL Token transfer, Anchor program call을 ParsedTransaction으로 식별한다
  3. EvmAdapter.parseTransaction()이 hex unsigned tx를 받아 ETH transfer, ERC-20 transfer/approve, 임의 contract call을 ParsedTransaction으로 식별한다
  4. IChainAdapter.signExternalTransaction()이 unsigned tx에 월렛 키로 서명하여 SignedTransaction을 반환한다
  5. 잘못된 rawTx, 월렛 미포함 서명자, 지원하지 않는 체인 등 에러가 명확한 에러 코드로 반환된다
**Plans**: TBD

Plans:
- [ ] 115-01: Core 타입 확장 + DB 마이그레이션 v9 (SIGNED 상태, SIGN 타입, ParsedTransaction 타입, 에러 코드)
- [ ] 115-02: IChainAdapter parseTransaction/signExternalTransaction + SolanaAdapter 구현
- [ ] 115-03: EvmAdapter parseTransaction/signExternalTransaction 구현

### Phase 116: Default Deny Toggles
**Goal**: 관리자가 기본 거부 정책을 개별적으로 ON/OFF 전환하여 운영 유연성을 확보한 상태
**Depends on**: Nothing (independent)
**Requirements**: TOGGLE-01, TOGGLE-02, TOGGLE-03, TOGGLE-04, TOGGLE-05
**Success Criteria** (what must be TRUE):
  1. Admin UI/API에서 default_deny_tokens를 OFF로 전환하면 ALLOWED_TOKENS 미설정 월렛도 토큰 전송이 허용된다
  2. Admin UI/API에서 default_deny_contracts를 OFF로 전환하면 CONTRACT_WHITELIST 미설정 월렛도 컨트랙트 호출이 허용된다
  3. Admin UI/API에서 default_deny_spenders를 OFF로 전환하면 APPROVED_SPENDERS 미설정 월렛도 토큰 승인이 허용된다
  4. 화이트리스트 정책이 설정된 월렛은 토글과 무관하게 정상 화이트리스트 평가가 수행된다
  5. 3개 토글의 기본값은 모두 ON(기본 거부 유지)이며 변경 시 hot-reload로 즉시 반영된다
**Plans**: TBD

Plans:
- [ ] 116-01: SettingsService 3개 토글 추가 + DatabasePolicyEngine 분기 로직 + Admin UI 자동 노출
- [ ] 116-02: 토글 동작 검증 테스트 (기본 거부 ON/OFF, 화이트리스트 공존, hot-reload)

### Phase 117: Sign-Only Pipeline + REST API
**Goal**: 외부 dApp이 빌드한 unsigned 트랜잭션을 POST /v1/transactions/sign으로 제출하면 정책 평가 후 서명된 트랜잭션을 동기 응답으로 받을 수 있는 상태
**Depends on**: Phase 115
**Requirements**: SIGN-01, SIGN-06, SIGN-07, SIGN-08, SIGN-10
**Success Criteria** (what must be TRUE):
  1. POST /v1/transactions/sign에 unsigned tx를 제출하면 파싱된 operations가 기존 정책 엔진으로 평가되어 모든 operation 통과 시 서명된 트랜잭션이 반환된다
  2. DELAY/APPROVAL 티어에 해당하는 sign-only 요청은 즉시 거부되고 명확한 에러 메시지가 반환된다
  3. 서명 결과가 transactions 테이블에 type='SIGN', status='SIGNED'로 기록된다
  4. 서명 시 reserved_amount에 누적되어 SPENDING_LIMIT 이중 지출이 방지된다
**Plans**: TBD

Plans:
- [ ] 117-01: sign-only 파이프라인 (executeSignOnly, stage5SignOnly) + DELAY/APPROVAL 즉시 거부 + reservation
- [ ] 117-02: POST /v1/transactions/sign REST API 라우트 + OpenAPI 스키마 + 통합 테스트

### Phase 118: EVM Calldata Encoding
**Goal**: AI 에이전트가 ABI + 함수명 + 인자를 보내면 인코딩된 calldata hex를 받을 수 있는 상태
**Depends on**: Nothing (independent)
**Requirements**: ENCODE-01, ENCODE-02, ENCODE-03, ENCODE-04, ENCODE-05
**Success Criteria** (what must be TRUE):
  1. POST /v1/utils/encode-calldata에 ABI + 함수명 + 인자를 보내면 인코딩된 calldata hex가 반환된다
  2. TS SDK encodeCalldata()와 Python SDK encode_calldata()로 동일 기능을 호출할 수 있다
  3. MCP encode_calldata 도구로 동일 기능을 사용할 수 있다
  4. 존재하지 않는 함수명이나 타입 불일치 시 ABI_ENCODING_FAILED 에러가 반환된다
**Plans**: TBD

Plans:
- [ ] 118-01: POST /v1/utils/encode-calldata REST API + viem encodeFunctionData 래핑 + 에러 처리
- [ ] 118-02: TS/Python SDK encodeCalldata + MCP encode_calldata 도구

### Phase 119: SDK + MCP + Notifications + Skill Resources
**Goal**: sign-only API가 TS/Python SDK, MCP에서 사용 가능하고, MCP 스킬 리소스로 API 문서가 노출되며, 정책 거부 알림이 보강된 상태
**Depends on**: Phase 117, Phase 118
**Requirements**: SIGN-11, SIGN-12, SIGN-13, SIGN-15, MCPRES-01, MCPRES-02, MCPRES-03, NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. TS SDK signTransaction()과 Python SDK sign_transaction()으로 sign-only API를 호출할 수 있다
  2. MCP sign_transaction 도구로 sign-only API를 사용할 수 있다
  3. MCP resources/list에 waiaas://skills/{name} URI로 5개 스킬 파일이 포함되고 resources/read로 내용을 조회할 수 있다
  4. POLICY_VIOLATION 알림에 contractAddress, tokenAddress, policyType 필드와 Admin UI 딥링크가 포함된다
  5. transactions.skill.md가 sign-only API와 calldata encoding을 포함하도록 업데이트된다
**Plans**: TBD

Plans:
- [ ] 119-01: TS/Python SDK signTransaction + MCP sign_transaction 도구
- [ ] 119-02: MCP 스킬 리소스 (waiaas://skills/{name}) + GET /v1/skills/:name 엔드포인트
- [ ] 119-03: 알림 보강 (POLICY_VIOLATION 상세 필드) + 스킬 파일 업데이트

## Progress

**Execution Order:**
Phases execute in numeric order: 115 -> 116 -> 117 -> 118 -> 119
(Phase 116 and 118 are independent; 117 depends on 115; 119 depends on 117+118)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 115. Core Types + DB Migration + Parsers | v1.4.7 | 0/3 | Not started | - |
| 116. Default Deny Toggles | v1.4.7 | 0/2 | Not started | - |
| 117. Sign-Only Pipeline + REST API | v1.4.7 | 0/2 | Not started | - |
| 118. EVM Calldata Encoding | v1.4.7 | 0/2 | Not started | - |
| 119. SDK + MCP + Notifications + Skill Resources | v1.4.7 | 0/3 | Not started | - |
