# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- ✅ **v32.8 테스트 커버리지 강화** — Phases 444-448.1 (shipped 2026-03-18)
- ✅ **v32.9 Push Relay 직접 연동 (ntfy.sh 제거)** — Phases 449-451 (shipped 2026-03-18)
- ✅ **v32.10 에이전트 스킬 정리 + OpenClaw 플러그인** — Phases 452-455 (shipped 2026-03-18)
- 🚧 **v33.0 Desktop App 아키텍처 재설계** — Phases 456-458 (in progress)

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

<details>
<summary>✅ v32.9 Push Relay 직접 연동 (ntfy.sh 제거) (Phases 449-451) — SHIPPED 2026-03-18</summary>

- [x] Phase 449: Foundation -- Core 타입 + DB 마이그레이션 + Push Relay 서버 (3/3 plans) — completed 2026-03-18
- [x] Phase 450: Daemon 서명 채널 재작성 (2/2 plans) — completed 2026-03-18
- [x] Phase 451: 클라이언트 업데이트 -- SDK deprecated + Admin UI (2/2 plans) — completed 2026-03-18

</details>

See `.planning/milestones/v32.9-ROADMAP.md` for full details.

<details>
<summary>✅ v32.10 에이전트 스킬 정리 + OpenClaw 플러그인 (Phases 452-455) — SHIPPED 2026-03-18</summary>

- [x] Phase 452: Document Structure Rename (1/1 plan) — completed 2026-03-18
- [x] Phase 453: Skills Cleanup + Admin Manual (2/2 plans) — completed 2026-03-18
- [x] Phase 454: OpenClaw Plugin Package (2/2 plans) — completed 2026-03-18
- [x] Phase 455: CI/CD, Documentation, SEO (2/2 plans) — completed 2026-03-18

</details>

See `.planning/milestones/v32.10-ROADMAP.md` for full details.

### v33.0 Desktop App 아키텍처 재설계 (In Progress)

**Milestone Goal:** 설계 문서 39를 React 18 SPA 별도 구현에서 기존 Admin Web UI(Preact 10.x) 재사용 아키텍처로 전면 변경하고, Desktop 환경 감지/IPC/번들 전략을 신규 설계하며, m33-02 구현 objectives와의 정합성을 확보한다.

## Phases

- [x] **Phase 456: 설계 문서 39 기존 섹션 재작성** - React 18 SPA 구조를 Admin Web UI 재사용 구조로 6개 섹션 전면 변경 (2/2 plans) -- completed 2026-03-31
- [ ] **Phase 457: Desktop 환경 감지 + IPC + 번들 설계** - isDesktop() 전략, IPC 브릿지, CSP 예외, 조건부 렌더링, 번들 경계 신규 설계
- [ ] **Phase 458: 구조 검증 + Objectives 정합** - 포트 동적 할당 설계, 변경/미변경 섹션 일관성 검증, m33-02 objectives 갱신

## Phase Details

### Phase 456: 설계 문서 39 기존 섹션 재작성
**Goal**: 설계 문서 39의 기존 6개 섹션이 React 18 SPA 대신 Admin Web UI WebView 로드 아키텍처를 정확히 기술한다
**Depends on**: Nothing (first phase)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06
**Plans:** 2 plans
Plans:
- [ ] 456-01-PLAN.md — 아키텍처 다이어그램 + 계층 분리 + HTTP 통신 재작성 (Section 2.1, 2.2, 3.3)
- [ ] 456-02-PLAN.md — 프로젝트 구조 + UI 플로우 + 구현 노트 재작성 (Section 6, 7, 13)
**Success Criteria** (what must be TRUE):
  1. 아키텍처 다이어그램이 WebView에서 Admin Web UI(localhost)를 로드하는 구조를 보여준다
  2. 계층 역할 분리 섹션에서 React 18 언급이 완전히 제거되고 Preact Admin Web UI 재사용이 기술되어 있다
  3. HTTP localhost 통신 섹션이 apiCall() 상대 경로 재사용 패턴으로 갱신되어 있다
  4. 프로젝트 구조에서 apps/desktop/src/pages/ 8화면이 제거되고 packages/admin/src/ 확장으로 대체되어 있다
  5. UI 화면별 플로우가 기존 19페이지 + Desktop 전용 확장(Wizard, WalletConnect, Sidecar Status)으로 기술되어 있다

### Phase 457: Desktop 환경 감지 + IPC + 번들 설계
**Goal**: Desktop 전용 기능의 환경 감지, IPC 브릿지, CSP 예외, 조건부 렌더링, 번들 경계가 설계 문서에 완전히 명세된다
**Depends on**: Phase 456
**Requirements**: IPC-01, IPC-02, IPC-03, IPC-04, IPC-05, BLD-01, BLD-02, BLD-03, BLD-04
**Success Criteria** (what must be TRUE):
  1. isDesktop() 환경 감지 전략(window.__TAURI_INTERNALS__ 체크)이 문서에 명세되어 있다
  2. IPC 브릿지 6개 명령의 시그니처와 동작이 문서화되어 있다
  3. Tauri CapabilityBuilder.remote() URL 패턴과 CSP 예외 전략이 명세되어 있다
  4. packages/admin/src/desktop/ 모듈 경계와 dynamic import 규칙이 정의되어 있다
  5. 브라우저 번들에 Desktop 전용 코드가 포함되지 않는 tree-shaking 전략이 문서화되어 있다
**Plans**: TBD

### Phase 458: 구조 검증 + Objectives 정합
**Goal**: 변경된 설계 문서 39가 내부적으로 일관되고, m33-02 Desktop App 구현 objectives가 새 아키텍처와 정합한다
**Depends on**: Phase 457
**Requirements**: STR-01, STR-02, STR-03
**Success Criteria** (what must be TRUE):
  1. 데몬 포트 동적 할당 프로토콜(TCP bind(0) + stdout/tempfile 전달)이 설계되어 있다
  2. 설계 문서 39의 변경하지 않는 섹션(4,5,8,9,10,11,12)과 변경 섹션 간에 모순이 없다
  3. m33-02 Desktop App 구현 objectives가 변경된 아키텍처를 반영하도록 갱신되어 있다
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 456 → 457 → 458

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 432. Interface Extension | v32.5 | 2/2 | Complete | 2026-03-16 |
| 433. Multichain Positions | v32.5 | 4/4 | Complete | 2026-03-16 |
| 434. Testnet Toggle | v32.5 | 2/2 | Complete | 2026-03-16 |
| 435. N+1 쿼리 해소 | v32.6 | 2/2 | Complete | 2026-03-17 |
| 436. 페이지네이션 추가 | v32.6 | 2/2 | Complete | 2026-03-17 |
| 437. 대형 파일 분할 | v32.6 | 3/3 | Complete | 2026-03-17 |
| 438. 파이프라인 분할 + 추가 정리 | v32.6 | 2/2 | Complete | 2026-03-17 |
| 439. Build Infrastructure | v32.7 | 1/1 | Complete | 2026-03-17 |
| 440. Content Publishing | v32.7 | 1/1 | Complete | 2026-03-17 |
| 441. Technical SEO & AEO | v32.7 | 2/2 | Complete | 2026-03-17 |
| 442. CI Integration | v32.7 | 1/1 | Complete | 2026-03-17 |
| 443. SEO Landing Pages | v32.7 | 2/2 | Complete | 2026-03-17 |
| 444. DeFi Provider Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 445. Infra Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 446. EVM/SDK Branches | v32.8 | 2/2 | Complete | 2026-03-17 |
| 447. Admin/CLI Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 448. SDK/Shared Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 448.1. 커버리지 갭 클로저 | v32.8 | 3/3 | Complete | 2026-03-18 |
| 449. Foundation | v32.9 | 3/3 | Complete | 2026-03-18 |
| 450. Daemon 서명 채널 재작성 | v32.9 | 2/2 | Complete | 2026-03-18 |
| 451. 클라이언트 업데이트 | v32.9 | 2/2 | Complete | 2026-03-18 |
| 452. Document Structure Rename | v32.10 | 1/1 | Complete | 2026-03-18 |
| 453. Skills Cleanup + Admin Manual | v32.10 | 2/2 | Complete | 2026-03-18 |
| 454. OpenClaw Plugin Package | v32.10 | 2/2 | Complete | 2026-03-18 |
| 455. CI/CD, Documentation, SEO | v32.10 | 2/2 | Complete | 2026-03-18 |
| 456. 설계 문서 39 기존 섹션 재작성 | v33.0 | 2/2 | Complete | 2026-03-31 |
| 457. Desktop 환경 감지 + IPC + 번들 설계 | v33.0 | 0/TBD | Not started | - |
| 458. 구조 검증 + Objectives 정합 | v33.0 | 0/TBD | Not started | - |
