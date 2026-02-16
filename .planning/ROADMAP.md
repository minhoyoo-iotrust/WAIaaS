# Roadmap: WAIaaS v1.6.1 WalletConnect Owner 승인

## Overview

WalletConnect v2 경유 Push 모델을 기존 ApprovalWorkflow에 추가하여, Owner가 MetaMask/Phantom 등 외부 지갑으로 QR 스캔 후 거래 승인/거절을 할 수 있게 한다. WC 인프라 세팅부터 시작하여 QR 페어링, 서명 요청 통합, Telegram fallback, Admin/MCP/SDK DX까지 5단계로 구현한다. 기존 REST API(SIWE/SIWS) 직접 승인 경로는 절대 제거하지 않으며, WC는 "선호 채널"로 위치한다.

## Milestones

- ✅ **v1.6 운영 인프라 + 잔액 모니터링** - Phases 140-145 (shipped 2026-02-16)
- 🚧 **v1.6.1 WalletConnect Owner 승인** - Phases 146-150 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (146, 147, ...): Planned milestone work
- Decimal phases (147.1, 147.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 146: WC 인프라 세팅** - SignClient 초기화/종료, DB v16 마이그레이션, SQLite 세션 저장소
- [ ] **Phase 147: QR 페어링 + REST API** - pairing URI 생성, QR 코드, 세션 CRUD API, Admin QR 표시, CLI QR
- [ ] **Phase 148: WC 서명 요청** - APPROVAL 이벤트 시 WC session_request 전송, 서명 검증, approve/reject 연동
- [ ] **Phase 149: Telegram Fallback** - WC 실패 시 Telegram 자동 전환, 단일 승인 소스 원칙, 채널 전환 알림
- [ ] **Phase 150: Admin UI + DX** - WC 세션 관리 페이지, MCP 도구, SDK 메서드, Skill 파일 업데이트

## Phase Details

### Phase 146: WC 인프라 세팅
**Goal**: WalletConnect SignClient가 데몬 라이프사이클에 통합되어 시작/종료/재시작 시 안정적으로 동작한다
**Depends on**: v1.6 완료 (Phase 145)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. 데몬 시작 시 WalletConnect SignClient가 초기화되고, 데몬 종료 시 정상 해제된다
  2. DB v16 마이그레이션으로 wc_sessions 테이블과 pending_approvals.approval_channel 컬럼이 존재한다
  3. WC SDK의 세션 데이터가 SQLite에 영속화되어 데몬 재시작 후에도 기존 세션이 복구된다
  4. Admin Settings에서 walletconnect.project_id와 relay URL을 변경할 수 있다
**Plans**: 2 plans

Plans:
- [ ] 146-01-PLAN.md -- WcSessionService + SignClient 초기화/종료 + DB v16 마이그레이션
- [ ] 146-02-PLAN.md -- Admin Settings 확장 + 세션 복구 테스트 + migration-chain 업데이트

### Phase 147: QR 페어링 + REST API
**Goal**: Owner가 외부 지갑으로 QR 코드를 스캔하여 WC 세션을 성립시키고, 세션 상태를 관리할 수 있다
**Depends on**: Phase 146
**Requirements**: PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05, PAIR-06
**Success Criteria** (what must be TRUE):
  1. REST API 호출로 WC pairing URI가 생성되고 QR 코드 base64가 반환된다
  2. Owner가 외부 지갑(MetaMask/Phantom)으로 QR 스캔 시 WC 세션이 성립되고 DB에 기록된다
  3. REST API로 WC 세션 상태 조회 및 세션 해제가 가능하다
  4. Admin UI에서 QR 코드를 모달로 표시하고 세션 상태를 실시간 확인할 수 있다
  5. CLI `waiaas owner connect` 명령으로 터미널에 QR 코드가 출력된다
**Plans**: 2 plans

Plans:
- [ ] 147-01-PLAN.md -- WcSessionService 페어링/세션 메서드 + REST API 4개 엔드포인트 + 테스트
- [ ] 147-02-PLAN.md -- Admin UI QR 모달 + CLI owner connect/disconnect/status 명령

### Phase 148: WC 서명 요청
**Goal**: APPROVAL 거래 발생 시 WC 세션을 통해 Owner에게 서명을 요청하고, 승인/거절 결과가 ApprovalWorkflow에 반영된다
**Depends on**: Phase 147
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-06
**Success Criteria** (what must be TRUE):
  1. APPROVAL 정책 거래 발생 시 WC 세션이 있으면 Owner 지갑에 서명 요청이 자동 전송된다
  2. Owner가 WC에서 서명하면 ownerAuth 검증을 거쳐 거래가 승인되고, 거부하면 reject 처리된다
  3. EVM(personal_sign)과 Solana(solana_signMessage) 양쪽 체인의 서명 요청이 동작한다
  4. pending_approvals에 approval_channel(wc/telegram/rest)이 기록되어 감사 추적이 가능하다
  5. WC 서명 요청 타임아웃이 ApprovalWorkflow 타임아웃과 동기화된다
**Plans**: TBD

Plans:
- [ ] 148-01: ApprovalWorkflow-WC 브릿지 (session_request 전송, EVM/Solana 분기, 타임아웃 동기화)
- [ ] 148-02: WC 서명 응답 처리 (ownerAuth 검증, approve/reject, approval_channel 기록)

### Phase 149: Telegram Fallback
**Goal**: WC 채널이 불가능할 때 Telegram Bot으로 자동 전환되며, 어떤 경우에도 단일 채널에서만 승인이 처리된다
**Depends on**: Phase 148
**Requirements**: FALL-01, FALL-02, FALL-03
**Success Criteria** (what must be TRUE):
  1. WC 세션이 없거나 서명 요청 타임아웃 시 Telegram Bot으로 승인 요청이 자동 전환된다
  2. 동일 거래에 대해 WC와 Telegram에서 동시 승인이 불가능하다 (단일 승인 소스 원칙)
  3. 승인 채널 전환 시 EventBus 이벤트가 발생하고 알림이 전송된다
**Plans**: TBD

Plans:
- [ ] 149-01: 채널 우선순위 전략 + Telegram fallback + 단일 승인 소스 + 채널 전환 알림

### Phase 150: Admin UI + DX
**Goal**: WC 세션 관리가 Admin UI, MCP, SDK, Skill 파일 전체 인터페이스에서 가능하다
**Depends on**: Phase 148, Phase 149
**Requirements**: DX-01, DX-02, DX-03, DX-04
**Success Criteria** (what must be TRUE):
  1. Admin UI에 WC 세션 관리 페이지가 존재하며, 페어링 시작/상태 확인/해제가 가능하다
  2. MCP 도구로 WC 페어링 시작, 상태 조회, 해제가 가능하다
  3. TypeScript/Python SDK 메서드로 WC 페어링 시작, 상태 조회, 해제가 가능하다
  4. Skill 파일이 WC 관련 API/도구를 반영하여 업데이트되어 있다
**Plans**: TBD

Plans:
- [ ] 150-01: Admin UI WC 세션 관리 페이지
- [ ] 150-02: MCP 도구 + SDK 메서드 + Skill 파일 업데이트

## Progress

**Execution Order:**
Phases execute in numeric order: 146 → 147 → 148 → 149 → 150

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 146. WC 인프라 세팅 | v1.6.1 | 2/2 | Complete | 2026-02-16 |
| 147. QR 페어링 + REST API | v1.6.1 | 0/2 | Not started | - |
| 148. WC 서명 요청 | v1.6.1 | 0/2 | Not started | - |
| 149. Telegram Fallback | v1.6.1 | 0/1 | Not started | - |
| 150. Admin UI + DX | v1.6.1 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-16*
*Last updated: 2026-02-16 -- Phase 147 계획 수립*
