# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- ✅ **v32.8 테스트 커버리지 강화** — Phases 444-448.1 (shipped 2026-03-18)
- 🚧 **v32.9 Push Relay 직접 연동 (ntfy.sh 제거)** — Phases 449-451 (in progress)

<details>
<summary>✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Phases 432-434) — SHIPPED 2026-03-16</summary>

- [x] Phase 432: Interface Extension (2/2 plans) — completed 2026-03-16
- [x] Phase 433: Multichain Positions (4/4 plans) — completed 2026-03-16
- [x] Phase 434: Testnet Toggle (2/2 plans) — completed 2026-03-16

</details>

See `.planning/milestones/v32.5-ROADMAP.md` for full details.

<details>
<summary>✅ v32.6 성능 + 구조 개선 (Phases 435-438) — SHIPPED 2026-03-17</summary>

- [x] Phase 435: N+1 쿼리 해소 (2/2 plans) — completed 2026-03-17
- [x] Phase 436: 페이지네이션 추가 (2/2 plans) — completed 2026-03-17
- [x] Phase 437: 대형 파일 분할 (3/3 plans) — completed 2026-03-17
- [x] Phase 438: 파이프라인 분할 + 추가 정리 (2/2 plans) — completed 2026-03-17

</details>

See `.planning/milestones/v32.6-ROADMAP.md` for full details.

<details>
<summary>✅ v32.7 SEO/AEO 최적화 (Phases 439-443) — SHIPPED 2026-03-17</summary>

- [x] Phase 439: Build Infrastructure (1/1 plan) — completed 2026-03-17
- [x] Phase 440: Content Publishing + Navigation (1/1 plan) — completed 2026-03-17
- [x] Phase 441: Technical SEO & AEO (2/2 plans) — completed 2026-03-17
- [x] Phase 442: CI Integration (1/1 plan) — completed 2026-03-17
- [x] Phase 443: SEO Landing Pages + External Distribution (2/2 plans) — completed 2026-03-17

</details>

See `.planning/milestones/v32.7-ROADMAP.md` for full details.

<details>
<summary>✅ v32.8 테스트 커버리지 강화 (Phases 444-448.1) — SHIPPED 2026-03-18</summary>

- [x] Phase 444: daemon DeFi Provider + Pipeline 테스트 강화 (3/3 plans) — completed 2026-03-17
- [x] Phase 445: daemon Infra + Admin API + Notification 테스트 (3/3 plans) — completed 2026-03-17
- [x] Phase 446: evm Branches + wallet-sdk Branches 강화 (2/2 plans) — completed 2026-03-17
- [x] Phase 447: admin Functions + cli Lines/Branches 강화 (3/3 plans) — completed 2026-03-17
- [x] Phase 448: sdk + shared + 나머지 패키지 + 임계값 최종 인상 (3/3 plans) — completed 2026-03-17
- [x] Phase 448.1: 커버리지 갭 클로저 (3/3 plans) — completed 2026-03-18

</details>

See `.planning/milestones/v32.8-ROADMAP.md` for full details.

### 🚧 v32.9 Push Relay 직접 연동 (ntfy.sh 제거) (In Progress)

**Milestone Goal:** ntfy.sh SSE 의존성을 제거하고, 데몬-Push Relay 간 HTTP 직접 연동으로 전환한다.

## Phases

- [ ] **Phase 449: Foundation -- Core 타입 + DB 마이그레이션 + Push Relay 서버** - 모든 패키지가 의존하는 타입 변경, DB 스키마, Push Relay 서버 자체 응답 저장소 전환
- [ ] **Phase 450: Daemon 서명 채널 재작성** - NtfySigningChannel을 PushRelaySigningChannel로 교체하고, ntfy 설정/코드 제거, 에러 핸들링 구현
- [ ] **Phase 451: 클라이언트 업데이트 -- SDK deprecated + Admin UI** - Wallet SDK ntfy 함수 deprecated 처리, Admin UI의 ntfy 참조를 Push Relay로 전환

## Phase Details

### Phase 449: Foundation -- Core 타입 + DB 마이그레이션 + Push Relay 서버
**Goal**: ntfy.sh 의존성을 제거하기 위한 기반을 마련한다 -- 공유 타입, DB 스키마, Push Relay 서버가 모두 Push Relay 직접 연동 모델로 전환된 상태
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, DB-01, DB-02, DB-03, DB-04, DB-05, RELAY-01, RELAY-02, RELAY-03, RELAY-04, RELAY-05, RELAY-06, RELAY-07
**Success Criteria** (what must be TRUE):
  1. ResponseChannelSchema에 type: 'push_relay'만 존재하고 type: 'ntfy'는 없다
  2. APPROVAL_METHODS에 'sdk_push'가 존재하고 'sdk_ntfy'는 없다
  3. wallet_apps 테이블에 push_relay_url 컬럼이 존재하고, dcent 프리셋은 자동으로 DCent Push Relay URL이 설정된다
  4. Push Relay 서버가 POST /v1/push, POST /v1/sign-response, GET /v1/sign-response/:requestId long-polling API를 제공하고, ntfy SSE 코드가 완전히 제거된다
  5. sign_responses 테이블의 만료 레코드가 자동 정리된다
**Plans**: 3 plans

Plans:
- [ ] 449-01: Core 타입 변경 (ResponseChannelSchema, APPROVAL_METHODS, sign-request-builder)
- [ ] 449-02: DB v60 마이그레이션 (wallet_apps.push_relay_url, sign_topic/notify_topic 정리)
- [ ] 449-03: Push Relay 서버 ntfy 제거 + 자체 응답 저장소 전환

### Phase 450: Daemon 서명 채널 재작성
**Goal**: 데몬의 서명/알림 채널이 ntfy SSE 대신 Push Relay HTTP를 직접 사용하며, ntfy 관련 설정과 코드가 완전히 제거된 상태
**Depends on**: Phase 449
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, CONF-01, CONF-02, CONF-03, ERR-01, ERR-02
**Success Criteria** (what must be TRUE):
  1. PushRelaySigningChannel이 서명 요청을 Push Relay HTTP POST로 전송하고, long-polling으로 응답을 수신한다
  2. wallet-notification-channel이 Push Relay HTTP POST로 알림을 전송한다
  3. approval-channel-router가 sdk_push 메서드로 올바르게 라우팅한다
  4. NtfyChannel과 ntfy 관련 config/hot-reload 코드가 완전히 제거된다
  5. Push Relay 다운 시 PENDING_APPROVAL 유지 + 에러 로그, long-polling 실패 시 지수 백오프 재시도 후 서명 요청 만료 처리가 동작한다
**Plans**: TBD

Plans:
- [ ] 450-01: PushRelaySigningChannel 구현 (서명 요청 POST + long-polling 응답 수신)
- [ ] 450-02: 알림 채널 + 라우터 + NtfyChannel 제거 + config 정리

### Phase 451: 클라이언트 업데이트 -- SDK deprecated + Admin UI
**Goal**: Wallet SDK의 ntfy 함수가 deprecated 표시되고, Admin UI가 Push Relay URL 기반 워크플로우를 제공하는 상태
**Depends on**: Phase 450
**Requirements**: SDK-01, SDK-02, ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Wallet SDK의 sendViaNtfy, subscribeToRequests 등 ntfy 함수가 @deprecated JSDoc으로 표시되고, sendViaRelay 등 Push Relay 함수는 정상 동작한다
  2. Register Wallet App 다이얼로그에서 Push Relay URL을 입력할 수 있고, 프리셋 wallet type은 자동으로 채워진다
  3. Registered Apps 카드에서 Push Relay URL과 Subscription Token이 표시된다 (ntfy Topics 미표시)
  4. Approval Method 라벨이 "Wallet App (Push)"로 표시되고, 프리셋 wallet type은 라디오가 비활성화된다
**Plans**: TBD

Plans:
- [ ] 451-01: Wallet SDK ntfy 함수 deprecated 처리
- [ ] 451-02: Admin UI Push Relay 전환 (다이얼로그, 카드, 라벨, 프리셋)

## Progress

**Execution Order:**
Phases execute in numeric order: 449 -> 450 -> 451

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 449. Foundation | 0/3 | Not started | - |
| 450. Daemon 서명 채널 재작성 | 0/2 | Not started | - |
| 451. 클라이언트 업데이트 | 0/2 | Not started | - |
