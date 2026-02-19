# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** — Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) — See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** — Phases 178-181 (shipped 2026-02-18)
- ✅ **v2.3 Admin UI 기능별 메뉴 재구성** — Phases 182-187 (shipped 2026-02-18)
- ✅ **v2.4 npm Trusted Publishing 전환** — Phases 188-190 (shipped 2026-02-19)
- ✅ **v2.4.1 Admin UI 테스트 커버리지 복원** — Phases 191-193 (shipped 2026-02-19)
- ✅ **v2.5 DX 품질 개선** — Phases 194-197 (shipped 2026-02-19)
- 🚧 **v2.6 Wallet SDK 설계** — Phases 198-201 (in progress)

## Phases

<details>
<summary>✅ v0.1-v2.0 (Phases 1-173) — SHIPPED 2026-02-18</summary>

See `.planning/milestones/` for archived phase details (v0.1-ROADMAP.md through v2.0-ROADMAP.md).

</details>

<details>
<summary>✅ v2.2 테스트 커버리지 강화 (Phases 178-181) — SHIPPED 2026-02-18</summary>

- [x] Phase 178: adapter-solana 브랜치 커버리지 (2/2 plans) — completed 2026-02-18
- [x] Phase 179: admin 함수 커버리지 (2/2 plans) — completed 2026-02-18
- [x] Phase 180: CLI 라인/구문 커버리지 (1/1 plan) — completed 2026-02-18
- [x] Phase 181: 임계값 검증 및 복원 (1/1 plan) — completed 2026-02-18

See `.planning/milestones/v2.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.3 Admin UI 기능별 메뉴 재구성 (Phases 182-187) — SHIPPED 2026-02-18</summary>

- [x] Phase 182: UI 공용 컴포넌트 (2/2 plans) — completed 2026-02-18
- [x] Phase 183: 메뉴 재구성 + 신규 페이지 (3/3 plans) — completed 2026-02-18
- [x] Phase 184: Settings 분산 배치 (2/2 plans) — completed 2026-02-18
- [x] Phase 185: UX 강화 (2/2 plans) — completed 2026-02-18
- [x] Phase 186: 마무리 (1/1 plan) — completed 2026-02-18
- [x] Phase 187: 감사 갭 수정 (1/1 plan) — completed 2026-02-18

See `.planning/milestones/v2.3-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.4 npm Trusted Publishing 전환 (Phases 188-190) — SHIPPED 2026-02-19</summary>

- [x] Phase 188: 사전 준비 (1/1 plan) — completed 2026-02-19
- [x] Phase 189: OIDC 전환 (2/2 plans) — completed 2026-02-19
- [x] Phase 190: 검증 및 정리 (1/1 plan) — completed 2026-02-19

See `.planning/milestones/v2.4-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.4.1 Admin UI 테스트 커버리지 복원 (Phases 191-193) — SHIPPED 2026-02-19</summary>

- [x] Phase 191: Security + WalletConnect 페이지 테스트 (2/2 plans) — completed 2026-02-19
- [x] Phase 192: System 페이지 테스트 (1/1 plan) — completed 2026-02-19
- [x] Phase 193: 공용 컴포넌트 + 기존 페이지 개선 + 임계값 복원 (2/2 plans) — completed 2026-02-19

See `.planning/milestones/v2.4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.5 DX 품질 개선 (Phases 194-197) — SHIPPED 2026-02-19</summary>

- [x] Phase 194: CLI + 데몬 시작 DX (2/2 plans) — completed 2026-02-19
- [x] Phase 195: Quickstart + MCP DX (2/2 plans) — completed 2026-02-19
- [x] Phase 196: README + SDK 문서 정합성 (2/2 plans) — completed 2026-02-19
- [x] Phase 197: Docker + Python SDK DX (2/2 plans) — completed 2026-02-19

See `.planning/milestones/v2.5-ROADMAP.md` for full details.

</details>

### v2.6 Wallet SDK 설계 (In Progress)

**Milestone Goal:** 지갑 개발사(D'CENT 등)가 WAIaaS와 통합하기 위한 Wallet Signing SDK, 개방형 서명 프로토콜, 지갑 앱 알림 채널, Push Relay Server의 공통 설계를 확정한다.

- [x] **Phase 198: Signing Protocol v1 설계** - SignRequest/SignResponse 스키마, 유니버셜 링크, ntfy/Telegram 채널 프로토콜 확정
- [ ] **Phase 199: Wallet SDK + 데몬 컴포넌트 설계** - @waiaas/wallet-sdk 공개 API, 데몬 측 서명 컴포넌트, 채널 라우팅, DB 스키마 설계 확정
- [ ] **Phase 200: 알림 채널 + Push Relay Server 설계** - 지갑 앱 알림 채널, IPushProvider 인터페이스, Push Relay 아키텍처 설계 확정
- [ ] **Phase 201: 기존 설계 문서 갱신 + 교차 검증** - doc 35/37/25/67 업데이트, 설계 간 일관성 검증

## Phase Details

### Phase 198: Signing Protocol v1 설계
**Goal**: WAIaaS Signing Protocol v1의 모든 스키마와 전송 채널이 확정되어, SDK와 데몬이 이 프로토콜을 기반으로 설계를 진행할 수 있는 상태
**Depends on**: Nothing (first phase)
**Requirements**: PROTO-01, PROTO-02, PROTO-03, PROTO-04
**Success Criteria** (what must be TRUE):
  1. SignRequest/SignResponse Zod 스키마가 모든 필드, 타입, 제약 조건과 함께 확정되고, 서명 메시지 포맷(EIP-191/Ed25519)이 명시되어 있다
  2. 유니버셜 링크 URL 구조(지갑 도메인 활용, base64url 인코딩, 길이 제한 대응)가 확정되어 지갑 개발사가 AASA/assetlinks.json에 추가할 경로를 알 수 있다
  3. ntfy 요청/응답 토픽 네이밍 규칙과 보안 모델(requestId 기반 1회용 토픽, 만료 정책)이 확정되어 있다
  4. Telegram 인라인 버튼 + 공유 인텐트 응답 플로우가 PC/모바일 양쪽 시나리오에서 확정되어 있다
**Plans**: 2 plans

Plans:
- [x] 198-01-PLAN.md — 프로토콜 개요 + SignRequest/SignResponse 스키마 + 서명 메시지 포맷 + 유니버셜 링크 URL 구조
- [x] 198-02-PLAN.md — ntfy 채널 프로토콜 + Telegram 채널 프로토콜 + 만료 정책 + 보안 모델 + 에러 코드

### Phase 199: Wallet SDK + 데몬 컴포넌트 설계
**Goal**: @waiaas/wallet-sdk 패키지의 공개 API와 데몬 측 서명 컴포넌트(빌더/핸들러/채널/라우터)의 인터페이스가 확정되어, m26-01에서 바로 구현을 시작할 수 있는 상태
**Depends on**: Phase 198
**Requirements**: WSDK-01, WSDK-02, WSDK-03, DMON-01, DMON-02, DMON-03, DMON-04, DMON-05
**Success Criteria** (what must be TRUE):
  1. @waiaas/wallet-sdk 6개 공개 함수(parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests)의 시그니처와 반환 타입이 확정되어 있다
  2. WalletLinkConfig 스키마와 registerWallet() 등록 플로우가 확정되어 지갑 개발사 통합 작업 목록이 명확하다
  3. SignRequestBuilder/SignResponseHandler/NtfySigningChannel/TelegramSigningChannel의 인터페이스와 책임 경계가 확정되어 있다
  4. WalletLinkRegistry + ApprovalChannelRouter의 라우팅 로직(지갑별 설정 > 글로벌 fallback, 5단계 우선순위)이 확정되어 있다
  5. wallets.owner_approval_method 컬럼 설계와 SettingsService signing_sdk 6개 키가 확정되어 있다
**Plans**: 2 plans

Plans:
- [ ] 199-01-PLAN.md — SDK 공개 API 6개 함수 시그니처 + WalletLinkConfig 스키마 + 패키지 구조
- [ ] 199-02-PLAN.md — 데몬 컴포넌트 인터페이스 + 채널 라우팅 + SettingsService 키 + DB 스키마

### Phase 200: 알림 채널 + Push Relay Server 설계
**Goal**: 지갑 앱 알림 채널과 Push Relay Server의 인터페이스가 확정되어, m26-02/m26-03에서 바로 구현을 시작할 수 있는 상태
**Depends on**: Phase 198, Phase 199
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, RELAY-01, RELAY-02, RELAY-03, RELAY-04
**Success Criteria** (what must be TRUE):
  1. 서명/알림 토픽 분리 구조(waiaas-sign-{walletId} vs waiaas-notify-{walletId})와 ntfy priority 차등 정책이 확정되어 있다
  2. NotificationMessage 스키마(6개 카테고리)와 SDK subscribeToNotifications() 인터페이스가 확정되어 있다
  3. WalletNotificationChannel과 기존 INotificationChannel의 통합 지점(NotificationService 확장 방식)이 확정되어 있다
  4. IPushProvider 인터페이스와 PushPayload/PushResult 스키마가 확정되고, PushwooshProvider/FcmProvider의 API 인증 + 페이로드 매핑이 설계되어 있다
  5. Push Relay Server의 디바이스 토큰 등록 API, config.toml 스키마, Docker 배포 설정이 확정되어 있다
**Plans**: TBD

Plans:
- [ ] 200-01: TBD
- [ ] 200-02: TBD

### Phase 201: 기존 설계 문서 갱신 + 교차 검증
**Goal**: 모든 신규 설계가 기존 설계 문서(doc 35/37/25/67)에 반영되고, 설계 간 일관성이 교차 검증되어 설계 부채 0건을 유지하는 상태
**Depends on**: Phase 198, Phase 199, Phase 200
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. doc 35(알림 아키텍처)에 지갑 앱 채널과 서명/알림 토픽 구조가 추가되어 있다
  2. doc 37(REST API)에 PUT /wallets/:id/owner approval_method 필드 확장이 반영되어 있다
  3. doc 25(SQLite)에 wallets.owner_approval_method 컬럼과 마이그레이션 스키마가 추가되어 있다
  4. doc 67(Admin UI)에 Owner Settings > Approval Method UI 와이어프레임과 컴포넌트 설계가 추가되어 있다
**Plans**: TBD

Plans:
- [ ] 201-01: TBD

## Progress

**Execution Order:** 198 -> 199 -> 200 -> 201

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 198. Signing Protocol v1 설계 | 2/2 | Complete | 2026-02-19 |
| 199. Wallet SDK + 데몬 컴포넌트 설계 | 0/2 | Not started | - |
| 200. 알림 채널 + Push Relay Server 설계 | 0/2 | Not started | - |
| 201. 기존 설계 문서 갱신 + 교차 검증 | 0/1 | Not started | - |
