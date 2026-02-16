# Requirements: WAIaaS v1.6.1 WalletConnect Owner 승인

**Defined:** 2026-02-16
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v1.6.1 release. Each maps to roadmap phases.

### WC 인프라

- [ ] **INFRA-01**: WalletConnect SignClient가 데몬 시작 시 초기화되고 종료 시 정상 해제된다
- [ ] **INFRA-02**: DB v16 마이그레이션으로 wc_sessions 테이블과 pending_approvals.approval_channel 컬럼이 추가된다
- [ ] **INFRA-03**: SqliteKeyValueStorage가 WC SDK의 세션 데이터를 SQLite에 영속화한다
- [ ] **INFRA-04**: 데몬 재시작 시 기존 WC 세션이 자동으로 복구된다
- [ ] **INFRA-05**: WC 관련 설정(projectId, relay URL)이 Admin Settings에서 변경 가능하다

### QR 페어링

- [ ] **PAIR-01**: REST API로 WC pairing URI를 생성하고 QR 코드 base64를 반환한다
- [ ] **PAIR-02**: Owner가 외부 지갑으로 QR 코드를 스캔하면 WC 세션이 성립된다
- [ ] **PAIR-03**: REST API로 현재 WC 세션 상태를 조회할 수 있다
- [ ] **PAIR-04**: REST API로 WC 세션을 해제(disconnect)할 수 있다
- [ ] **PAIR-05**: Admin UI에서 QR 코드를 표시하고 세션 상태를 실시간 확인할 수 있다
- [ ] **PAIR-06**: CLI에서 `waiaas owner connect` 명령으로 터미널에 QR 코드를 표시할 수 있다

### WC 서명 요청

- [ ] **SIGN-01**: APPROVAL 거래 발생 시 WC 세션이 있으면 자동으로 서명 요청이 전송된다
- [ ] **SIGN-02**: Owner의 WC 경유 서명이 기존 ownerAuth로 검증되어 거래가 승인된다
- [ ] **SIGN-03**: Owner가 WC에서 거부하면 거래가 reject 처리된다
- [ ] **SIGN-04**: EVM(personal_sign)과 Solana(solana_signMessage) 모두 지원한다
- [ ] **SIGN-05**: pending_approvals에 approval_channel(wc/telegram/rest)이 기록된다
- [ ] **SIGN-06**: WC 서명 요청 타임아웃이 ApprovalWorkflow와 동기화된다

### Telegram Fallback

- [ ] **FALL-01**: WC 세션이 없거나 타임아웃 시 Telegram Bot으로 자동 전환된다
- [ ] **FALL-02**: WC와 Telegram에서 동시 승인이 불가능하다 (단일 승인 소스 원칙)
- [ ] **FALL-03**: 채널 전환 시 알림이 발생한다 (EventBus 이벤트)

### Admin UI / DX

- [ ] **DX-01**: Admin UI에 WC 세션 관리 페이지가 추가된다
- [ ] **DX-02**: MCP 도구로 WC 페어링 시작/상태 조회/해제가 가능하다
- [ ] **DX-03**: SDK 메서드로 WC 페어링 시작/상태 조회/해제가 가능하다
- [ ] **DX-04**: Skill 파일이 WC 관련 API/도구를 반영하여 업데이트된다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### WC 확장

- **WCX-01**: 멀티 Owner 지갑 동시 연결 (현재는 단일 세션만)
- **WCX-02**: WC Extended Sessions (7일 TTL) 지원
- **WCX-03**: WC Notify API를 통한 비서명 알림 전송
- **WCX-04**: WC Auth (Sign-In with Ethereum via WC) 통합

## Out of Scope

| Feature | Reason |
|---------|--------|
| WC 트랜잭션 서명 (eth_sendTransaction) | WAIaaS가 키 보관자이므로 WC로는 메시지 서명만 요청, 트랜잭션은 데몬이 직접 서명 |
| @reown/appkit 사용 | 브라우저 전용 UI 모달 -- 서버 데몬에 불필요, @walletconnect/sign-client가 적합 |
| WC를 유일한 승인 채널로 사용 | self-hosted 철학상 외부 relay 의존성 최소화, REST API 항상 유지 |
| 멀티 Owner 지갑 | v1.6.1은 단일 세션 정책, 멀티 Owner는 v2로 연기 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 146 | Pending |
| INFRA-02 | Phase 146 | Pending |
| INFRA-03 | Phase 146 | Pending |
| INFRA-04 | Phase 146 | Pending |
| INFRA-05 | Phase 146 | Pending |
| PAIR-01 | Phase 147 | Pending |
| PAIR-02 | Phase 147 | Pending |
| PAIR-03 | Phase 147 | Pending |
| PAIR-04 | Phase 147 | Pending |
| PAIR-05 | Phase 147 | Pending |
| PAIR-06 | Phase 147 | Pending |
| SIGN-01 | Phase 148 | Pending |
| SIGN-02 | Phase 148 | Pending |
| SIGN-03 | Phase 148 | Pending |
| SIGN-04 | Phase 148 | Pending |
| SIGN-05 | Phase 148 | Pending |
| SIGN-06 | Phase 148 | Pending |
| FALL-01 | Phase 149 | Pending |
| FALL-02 | Phase 149 | Pending |
| FALL-03 | Phase 149 | Pending |
| DX-01 | Phase 150 | Pending |
| DX-02 | Phase 150 | Pending |
| DX-03 | Phase 150 | Pending |
| DX-04 | Phase 150 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after roadmap creation (traceability updated)*
