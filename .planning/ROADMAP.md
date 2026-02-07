# Roadmap: WAIaaS v0.5

## Milestones

- v0.1 Research & Design (Phases 1-5) -- shipped 2026-02-05
- v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) -- shipped 2026-02-05
- v0.3 설계 논리 일관성 확보 (Phases 10-13) -- shipped 2026-02-06
- v0.4 테스트 전략 및 계획 수립 (Phases 14-18) -- shipped 2026-02-07
- **v0.5 인증 모델 재설계 + DX 개선 (Phases 19-21) -- shipped 2026-02-07**

## Overview

v0.2에서 설계한 인증 모델을 masterAuth/ownerAuth/sessionAuth 3-tier로 재분리하고, Owner 주소를 시스템 전역에서 에이전트별 속성으로 이동하며, 세션 낙관적 갱신 프로토콜을 추가하고, CLI 개발자 경험을 개선한다. 기존 설계 문서 11개를 수정하고 신규 스펙 문서 4개를 추가하는 설계 마일스톤이다. 24개 요구사항을 3개 페이즈에 걸쳐 순차적으로 해결한다.

## Phases

- [x] **Phase 19: 인증 모델 + Owner 주소 재설계** -- 3-tier 인증 책임 분리와 Owner 주소 에이전트 귀속 ✓ 2026-02-07
- [x] **Phase 20: 세션 갱신 프로토콜** -- 에이전트 자체 갱신 + Owner 사후 거부 패턴 ✓ 2026-02-07
- [x] **Phase 21: DX 개선 + 설계 문서 통합** -- CLI 간소화, 개발 모드, actionable 에러, 통합 반영 ✓ 2026-02-07

## Phase Details

### Phase 19: 인증 모델 + Owner 주소 재설계

**Goal**: masterAuth/ownerAuth/sessionAuth 3-tier 인증 수단의 책임이 분리되고, Owner 주소가 에이전트별 속성으로 이동하여, 모든 엔드포인트의 인증 맵이 재배치된 상태
**Depends on**: Nothing (v0.5 첫 페이즈)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, OWNR-01, OWNR-02, OWNR-03, OWNR-04, OWNR-05, OWNR-06
**Success Criteria** (what must be TRUE):
  1. 인증 모델 재설계 문서가 존재하며, masterAuth/ownerAuth/sessionAuth 3가지 인증 수단의 대상, 방법, 적용 범위가 명확히 구분되어 있다
  2. 31개 REST API 엔드포인트 각각에 대해 어떤 인증 수단이 적용되는지 재배치 맵이 작성되어 있고, ownerAuth가 거래 승인과 Kill Switch 복구 2곳에만 한정되어 있다
  3. agents 테이블 스키마에 owner_address 컬럼이 추가되고, config.toml [owner] 섹션 제거 및 owner_wallets -> wallet_connections 전환이 명세되어 있다
  4. WalletConnect 미연결 상태에서도 CLI 수동 서명으로 모든 ownerAuth 기능이 동작하는 플로우가 정의되어 있다
  5. 보안 비다운그레이드 검증 -- APPROVAL 티어 거래와 KS 복구에서 ownerAuth가 유지됨이 v0.2 대비 매핑표로 확인 가능하다
**Plans**: 3 plans

Plans:
- [x] 19-01-PLAN.md -- 3-tier 인증 모델 정의 + 31 엔드포인트 인증 맵 + 보안 비다운그레이드 검증
- [x] 19-02-PLAN.md -- Owner 주소 에이전트 귀속 (agents.owner_address NOT NULL) + wallet_connections + config.toml
- [x] 19-03-PLAN.md -- 기존 설계 문서 반영 (34-owner-wallet-connection.md + 37-rest-api-complete-spec.md)

**Key Deliverables:**
- 신규: 인증 모델 재설계 문서 (masterAuth/ownerAuth/sessionAuth 3-tier 정의)
- 수정 (대규모): 34-owner-wallet-connection.md
- 수정 (중규모): 25-sqlite-schema.md, 37-rest-api-complete-spec.md
- 수정 (소규모): 24-monorepo-data-directory.md

### Phase 20: 세션 갱신 프로토콜

**Goal**: 에이전트가 sessionAuth만으로 세션을 갱신할 수 있고, 안전 장치 5종과 Owner 사후 거부 메커니즘이 정의된 상태
**Depends on**: Phase 19 (sessionAuth 정의 확정 필요, agents.owner_address로 Owner 식별 방법 확정 필요)
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. PUT /v1/sessions/:id/renew 엔드포인트가 sessionAuth 인증으로 동작하는 API 스펙(요청/응답/에러)이 정의되어 있다
  2. 세션 갱신 안전 장치 5종(maxRenewals 30, 총 수명 30일, 50% 시점 갱신, 거부 윈도우, 갱신 단위 고정)이 명세되고, 각 장치의 위반 시 동작이 정의되어 있다
  3. sessions 테이블 스키마 변경(renewal_count, max_renewals, last_renewed_at)과 SessionConstraints 확장(maxRenewals, renewalRejectWindow)이 명세되어 있다
  4. Owner 거부 플로우와 SESSION_RENEWED/SESSION_RENEWAL_REJECTED 알림 이벤트 2종이 알림 아키텍처에 추가되어 있다
**Plans**: 2 plans

Plans:
- [x] 20-01-PLAN.md -- 핵심 프로토콜 정의 (53-session-renewal-protocol.md 신규) + 30-session-token-protocol.md 수명주기 확장
- [x] 20-02-PLAN.md -- 기존 설계 문서 반영 (25-sqlite-schema.md + 37-rest-api-complete-spec.md + 35-notification-architecture.md)

**Key Deliverables:**
- 신규: 세션 갱신 프로토콜 문서
- 수정 (대규모): 30-session-token-protocol.md
- 수정 (중규모): 25-sqlite-schema.md, 37-rest-api-complete-spec.md, 35-notification-architecture.md

### Phase 21: DX 개선 + 설계 문서 통합

**Goal**: 에이전트 개발자가 init부터 첫 거래까지 최소 마찰로 도달할 수 있는 CLI 플로우가 재설계되고, v0.5 전체 변경이 기존 11개 설계 문서에 반영된 상태
**Depends on**: Phase 19 (masterAuth 기반 init/session, owner 등록 방법 확정), Phase 20 (세션 갱신 엔드포인트 API 스펙 확정)
**Requirements**: DX-01, DX-02, DX-03, DX-04, DX-05, DX-06, DX-07, DX-08
**Success Criteria** (what must be TRUE):
  1. CLI 플로우 재설계 문서가 존재하며, waiaas init이 순수 인프라 초기화만 수행하고, agent create --owner로 Owner 등록이 분리되어 있다
  2. --quickstart 플래그로 init부터 세션 토큰 발급까지 단일 커맨드로 완료되는 흐름이 정의되어 있다
  3. --dev 모드(패스워드 프롬프트 없이 데몬 시작)와 actionable 에러 응답(hint 필드)의 스펙이 정의되어 있다
  4. MCP 데몬 내장 옵션의 검토 결과(채택/기각 + 근거)와 원격 에이전트 접근 가이드(SSH 터널, VPN, --expose)가 작성되어 있다
  5. v0.5에서 변경된 인증 모델, Owner 주소 모델, 세션 갱신이 기존 설계 문서 11개에 일관되게 반영되어 있다
**Plans**: 4 plans

Plans:
- [x] 21-01-PLAN.md -- CLI 플로우 재설계 문서 신규 작성 (54-cli-flow-redesign.md: DX-01~05)
- [x] 21-02-PLAN.md -- DX 개선 스펙 문서 신규 작성 (55-dx-improvement-spec.md: DX-06~08)
- [x] 21-03-PLAN.md -- 중규모 기존 문서 수정 (28, 37, 40: v0.5 CLI/인증/hint 반영)
- [x] 21-04-PLAN.md -- 소규모 기존 문서 수정 + 참조 노트 + 통합 일관성 검증 (24, 29, 38, 39, 33, 36)

**Key Deliverables:**
- 신규: CLI 플로우 재설계 문서, DX 개선 스펙 문서
- 수정 (중규모): 28-daemon-lifecycle-cli.md, 37-rest-api-complete-spec.md, 40-telegram-bot-docker.md
- 수정 (소규모): 24-monorepo-data-directory.md, 38-sdk-mcp-interface.md, 39-tauri-desktop-architecture.md
- 통합 검증: Phase 19-20 변경사항의 11개 설계 문서 일관성 반영

## Progress

**Execution Order:** Phase 19 -> Phase 20 -> Phase 21

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 19. 인증 모델 + Owner 주소 재설계 | v0.5 | 3/3 | Complete | 2026-02-07 |
| 20. 세션 갱신 프로토콜 | v0.5 | 2/2 | Complete | 2026-02-07 |
| 21. DX 개선 + 설계 문서 통합 | v0.5 | 4/4 | Complete | 2026-02-07 |

## Coverage

| Category | Requirements | Phase | Count |
|----------|-------------|-------|-------|
| AUTH | AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05 | Phase 19 | 5 |
| OWNR | OWNR-01, OWNR-02, OWNR-03, OWNR-04, OWNR-05, OWNR-06 | Phase 19 | 6 |
| SESS | SESS-01, SESS-02, SESS-03, SESS-04, SESS-05 | Phase 20 | 5 |
| DX | DX-01, DX-02, DX-03, DX-04, DX-05, DX-06, DX-07, DX-08 | Phase 21 | 8 |
| **Total** | | | **24** |

24/24 요구사항 매핑 완료. 고아 요구사항 없음.

---
*Roadmap created: 2026-02-07*
*Last updated: 2026-02-07 (v0.5 complete)*
