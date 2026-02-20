# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** — Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) — See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** — Phases 178-181 (shipped 2026-02-18)
- ✅ **v2.3 Admin UI 기능별 메뉴 재구성** — Phases 182-187 (shipped 2026-02-18)
- ✅ **v2.4 npm Trusted Publishing 전환** — Phases 188-190 (shipped 2026-02-19)
- ✅ **v2.4.1 Admin UI 테스트 커버리지 복원** — Phases 191-193 (shipped 2026-02-19)
- ✅ **v2.5 DX 품질 개선** — Phases 194-197 (shipped 2026-02-19)
- ✅ **v2.6 Wallet SDK 설계** — Phases 198-201 (shipped 2026-02-20)
- 🚧 **v2.6.1 WAIaaS Wallet Signing SDK** — Phases 202-203 (in progress)

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

<details>
<summary>✅ v2.6 Wallet SDK 설계 (Phases 198-201) — SHIPPED 2026-02-20</summary>

- [x] Phase 198: Signing Protocol v1 설계 (2/2 plans) — completed 2026-02-19
- [x] Phase 199: Wallet SDK + 데몬 컴포넌트 설계 (2/2 plans) — completed 2026-02-19
- [x] Phase 200: 알림 채널 + Push Relay Server 설계 (2/2 plans) — completed 2026-02-19
- [x] Phase 201: 기존 설계 문서 갱신 + 교차 검증 (1/1 plan) — completed 2026-02-20

See `.planning/milestones/v2.6-ROADMAP.md` for full details.

</details>

### 🚧 v2.6.1 WAIaaS Wallet Signing SDK (In Progress)

**Milestone Goal:** v2.6 설계(docs 73-75)를 코드로 실현하여, 지갑 개발사가 @waiaas/wallet-sdk를 통합하고 Owner가 지갑 앱에서 트랜잭션을 승인/거부할 수 있는 상태 달성

- [ ] **Phase 202: 서명 프로토콜 + 데몬 인프라 + SDK 패키지 + ntfy 채널** - SignRequest/Response Zod 스키마, 데몬 측 Builder/Handler, WalletLinkRegistry, DB 마이그레이션, SettingsService 키, NtfySigningChannel, @waiaas/wallet-sdk 신규 패키지
- [ ] **Phase 203: Telegram 채널 + 채널 라우팅 + REST API + Admin UI** - TelegramSigningChannel, ApprovalChannelRouter 5단계 우선순위, PUT /wallets/:id/owner approval_method 확장, Admin UI Owner 승인 방법 설정

## Phase Details

### Phase 202: 서명 프로토콜 + 데몬 인프라 + SDK 패키지 + ntfy 채널
**Goal**: PENDING_APPROVAL 트랜잭션에서 SignRequest를 생성하여 ntfy로 지갑 앱에 전달하고, 지갑 앱이 @waiaas/wallet-sdk로 서명 응답을 반환하여 트랜잭션이 승인/거부되는 E2E 플로우가 동작하는 상태
**Depends on**: Nothing (first phase of v2.6.1)
**Requirements**: PROTO-01, PROTO-02, PROTO-03, PROTO-04, PROTO-05, CHAN-01, CHAN-02, SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06, WALLET-01, WALLET-02, WALLET-03, CONF-01, CONF-02
**Success Criteria** (what must be TRUE):
  1. PENDING_APPROVAL 트랜잭션에서 SignRequest가 생성되어 유니버셜 링크 URL로 인코딩되고, 만료/서명오류에 대해 적절한 에러가 반환된다
  2. NtfySigningChannel이 요청 토픽에 SignRequest를 publish하고 응답 토픽을 subscribe하여 SignResponse 수신 시 트랜잭션을 승인/취소한다
  3. @waiaas/wallet-sdk 패키지의 parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests 6개 함수가 모두 정상 동작한다
  4. WalletLinkRegistry에 지갑 메타데이터를 등록/조회할 수 있고, SettingsService에 signing_sdk.* 6개 키 + wallets JSON이 런타임 변경 가능하다
  5. wallets 테이블에 owner_approval_method 컬럼이 추가되고 DB 마이그레이션이 정상 동작한다
**Plans**: TBD

Plans:
- [ ] 202-01: TBD
- [ ] 202-02: TBD
- [ ] 202-03: TBD

### Phase 203: Telegram 채널 + 채널 라우팅 + REST API + Admin UI
**Goal**: Owner가 지갑별로 승인 방법(sdk_ntfy/sdk_telegram/walletconnect/telegram_bot/rest)을 설정하고, ApprovalChannelRouter가 설정에 따라 올바른 채널로 라우팅하며, Admin UI에서 시각적으로 관리할 수 있는 상태
**Depends on**: Phase 202
**Requirements**: CHAN-03, CHAN-04, CHAN-05, CHAN-06, CHAN-07, WALLET-04, WALLET-05, WALLET-06, WALLET-07
**Success Criteria** (what must be TRUE):
  1. TelegramSigningChannel이 유니버셜 링크 인라인 버튼 메시지를 전송하고, /sign_response 명령어로 SignResponse를 수신하여 트랜잭션을 처리한다
  2. ApprovalChannelRouter가 지갑별 owner_approval_method 설정에 따라 올바른 채널로 라우팅하고, 미설정 시 글로벌 5단계 우선순위로 fallback한다
  3. PUT /v1/wallets/:id/owner 요청에 approval_method 필드를 포함하여 승인 방법을 설정할 수 있고, 유효하지 않은 값에 대해 400 에러를 반환한다
  4. Admin UI 지갑 상세 페이지에서 Owner 승인 방법을 라디오 선택으로 변경할 수 있고, 미구성 인프라 선택 시 경고를 표시한다
**Plans**: TBD

Plans:
- [ ] 203-01: TBD
- [ ] 203-02: TBD

## Progress

**Execution Order:** 202 → 203

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-173 | v0.1-v2.0 | — | Complete | 2026-02-18 |
| 178-181 | v2.2 | 6/6 | Complete | 2026-02-18 |
| 182-187 | v2.3 | 11/11 | Complete | 2026-02-18 |
| 188-190 | v2.4 | 4/4 | Complete | 2026-02-19 |
| 191-193 | v2.4.1 | 5/5 | Complete | 2026-02-19 |
| 194-197 | v2.5 | 8/8 | Complete | 2026-02-19 |
| 198-201 | v2.6 | 7/7 | Complete | 2026-02-20 |
| 202 | v2.6.1 | 0/TBD | Not started | - |
| 203 | v2.6.1 | 0/TBD | Not started | - |
