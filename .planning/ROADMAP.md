# Roadmap: WAIaaS v1.4.4

## Overview

Admin UI 설정 관리(DB 저장 + hot-reload), MCP 5-type feature parity(BUG-017 해소), AI 에이전트용 스킬 파일 5개를 구현한다. Settings 인프라(DB 테이블, 암호화, fallback, import)를 먼저 구축하고, 그 위에 REST API + hot-reload, Admin UI 설정 페이지를 순차 구축한다. MCP 도구 확장과 스킬 파일은 독립적으로 병렬 진행 가능하다.

## Phases

**Phase Numbering:** v1.4.3이 Phase 99에서 종료. v1.4.4는 Phase 100부터 시작.

- [x] **Phase 100: Settings 인프라** - DB 테이블 + credential 암호화 + config.toml fallback + 자동 import
- [ ] **Phase 101: Settings API + Hot-Reload** - REST 엔드포인트 3개 + 알림/RPC/보안 hot-reload
- [ ] **Phase 102: Admin UI 설정 페이지** - 알림/RPC/보안/WalletConnect/log_level 5개 섹션
- [ ] **Phase 103: MCP 5-type Feature Parity** - call_contract/approve_token/send_batch 도구 + 설계 문서 갱신
- [ ] **Phase 104: API 스킬 파일** - quickstart/wallet/transactions/policies/admin 5개 마크다운

## Phase Details

### Phase 100: Settings 인프라
**Goal**: 운영 설정을 DB에 안전하게 저장하고, config.toml/환경변수/기본값 fallback 체인이 동작한다
**Depends on**: Nothing (first phase)
**Requirements**: SETTINGS-01, SETTINGS-02, SETTINGS-03, SETTINGS-04
**Success Criteria** (what must be TRUE):
  1. settings key-value 테이블이 schema_version 5 마이그레이션으로 생성되고, 기존 DB가 데이터 손실 없이 마이그레이션된다
  2. credential(bot token, webhook URL)이 AES-GCM으로 암호화 저장되고, 평문으로 DB에 노출되지 않는다
  3. 설정 조회 시 DB > config.toml > 환경변수 > 기본값 순서로 fallback이 동작한다
  4. 데몬 최초 기동 시 config.toml에 설정된 운영 설정 값이 DB로 자동 import된다
**Plans**: 2 plans

Plans:
- [x] 100-01-PLAN.md -- settings 테이블 Drizzle 스키마 + DDL + v5 마이그레이션 + AES-GCM 암호화 모듈
- [x] 100-02-PLAN.md -- SettingsService fallback 체인 + config.toml 자동 import + daemon.ts 통합

### Phase 101: Settings API + Hot-Reload
**Goal**: Admin이 REST API로 설정을 조회/수정하고, 변경 사항이 데몬 재시작 없이 즉시 반영된다
**Depends on**: Phase 100
**Requirements**: API-01, API-02, API-03, SETTINGS-05, SETTINGS-06, SETTINGS-07
**Success Criteria** (what must be TRUE):
  1. GET /v1/admin/settings가 전체 설정을 반환하되, credential 값은 마스킹된다
  2. PUT /v1/admin/settings로 설정을 수정하면 DB에 저장되고 hot-reload가 즉시 트리거된다
  3. 알림 채널 credential 변경 시 채널 인스턴스가 재생성되어 새 credential로 발송된다
  4. RPC 엔드포인트 URL 변경 시 adapter가 재연결되어 새 URL로 체인 요청이 전달된다
  5. POST /v1/admin/settings/test-rpc로 RPC URL 연결 테스트가 가능하다
**Plans**: TBD

Plans:
- [ ] 101-01: GET/PUT /v1/admin/settings + POST test-rpc 엔드포인트
- [ ] 101-02: 알림 채널 + RPC 어댑터 + 보안 파라미터 hot-reload

### Phase 102: Admin UI 설정 페이지
**Goal**: Admin Web UI에서 알림/RPC/보안/WalletConnect/log_level 설정을 시각적으로 관리한다
**Depends on**: Phase 101
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05
**Success Criteria** (what must be TRUE):
  1. 알림 설정 섹션에서 Telegram/Discord/Ntfy credential을 입력하고 테스트 발송할 수 있다
  2. RPC 설정 섹션에서 Solana 3개 + EVM 13개 엔드포인트를 수정하고 연결 테스트할 수 있다
  3. 보안 파라미터 섹션에서 session_ttl, rate_limit 등을 변경하면 즉시 반영된다
  4. WalletConnect 섹션에서 project_id를 입력하고 획득 방법 안내가 표시된다
  5. log_level을 Admin UI에서 변경하면 데몬 로그 수준이 즉시 변경된다
**Plans**: TBD

Plans:
- [ ] 102-01: Settings 페이지 리뉴얼 - 알림/RPC/보안 섹션
- [ ] 102-02: WalletConnect + log_level 섹션 + 통합 테스트

### Phase 103: MCP 5-type Feature Parity
**Goal**: MCP 에이전트가 REST API/SDK와 동등하게 CONTRACT_CALL/APPROVE/BATCH 트랜잭션을 실행한다
**Depends on**: Nothing (독립)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04
**Success Criteria** (what must be TRUE):
  1. MCP call_contract 도구로 CONTRACT_WHITELIST에 등록된 컨트랙트를 호출할 수 있다
  2. MCP approve_token 도구로 APPROVED_SPENDERS에 등록된 spender에게 토큰 승인을 실행할 수 있다
  3. MCP send_batch 도구로 여러 트랜잭션을 원자적 배치로 실행할 수 있다
  4. 설계 문서 38(sdk-mcp)에서 MCPSDK-04 결정이 철회되고, feature parity 원칙이 명시된다
**Plans**: TBD

Plans:
- [ ] 103-01: call_contract + approve_token + send_batch MCP 도구 구현
- [ ] 103-02: MCPSDK-04 철회 + 설계 문서 38 갱신 + MCP 통합 테스트

### Phase 104: API 스킬 파일
**Goal**: AI 에이전트가 마크다운 스킬 파일을 로드하는 것만으로 WAIaaS API를 즉시 사용한다
**Depends on**: Nothing (독립, 단 Phase 101 API 변경 반영을 위해 후순위 배치)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05
**Success Criteria** (what must be TRUE):
  1. quickstart.skill.md를 로드한 AI 에이전트가 월렛 생성 -> 세션 -> 잔액 -> 첫 전송 워크플로우를 수행할 수 있다
  2. transactions.skill.md가 5-type(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH) 전송을 모두 커버한다
  3. 각 스킬 파일에 YAML 프론트매터, 워크플로우, curl 예시, 파라미터 설명, 에러 핸들링이 포함된다
  4. 5개 스킬 파일이 skills/ 디렉토리에 배치되고, 기존 how-to-test/waiass-api.skill.md를 대체한다
**Plans**: TBD

Plans:
- [ ] 104-01: quickstart + wallet + transactions 스킬 파일
- [ ] 104-02: policies + admin 스킬 파일 + 기존 파일 정리

## Progress

**Execution Order:**
Phase 100 -> 101 -> 102 순차. Phase 103, 104는 독립적이며 100~102와 병렬 가능.
권장 순서: 100 -> 101 -> 102 -> 103 -> 104

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 100. Settings 인프라 | 2/2 | ✓ Complete | 2026-02-13 |
| 101. Settings API + Hot-Reload | 0/2 | Not started | - |
| 102. Admin UI 설정 페이지 | 0/2 | Not started | - |
| 103. MCP 5-type Feature Parity | 0/2 | Not started | - |
| 104. API 스킬 파일 | 0/2 | Not started | - |
