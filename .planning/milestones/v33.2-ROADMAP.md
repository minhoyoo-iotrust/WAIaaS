# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- ✅ **v32.8 테스트 커버리지 강화** — Phases 444-448.1 (shipped 2026-03-18)
- ✅ **v32.9 Push Relay 직접 연동 (ntfy.sh 제거)** — Phases 449-451 (shipped 2026-03-18)
- ✅ **v32.10 에이전트 스킬 정리 + OpenClaw 플러그인** — Phases 452-455 (shipped 2026-03-18)
- ✅ **v33.0 Desktop App 아키텍처 재설계** — Phases 456-458 (shipped 2026-03-31)

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

- [x] Phase 439-443: 5 phases completed — 2026-03-17

</details>

See `.planning/milestones/v32.7-ROADMAP.md` for full details.

<details>
<summary>✅ v32.8 테스트 커버리지 강화 (Phases 444-448.1) — SHIPPED 2026-03-18</summary>

- [x] Phase 444-448.1: 6 phases completed — 2026-03-18

</details>

See `.planning/milestones/v32.8-ROADMAP.md` for full details.

<details>
<summary>✅ v32.9 Push Relay 직접 연동 (Phases 449-451) — SHIPPED 2026-03-18</summary>

- [x] Phase 449-451: 3 phases completed — 2026-03-18

</details>

See `.planning/milestones/v32.9-ROADMAP.md` for full details.

<details>
<summary>✅ v32.10 에이전트 스킬 정리 + OpenClaw 플러그인 (Phases 452-455) — SHIPPED 2026-03-18</summary>

- [x] Phase 452-455: 4 phases completed — 2026-03-18

</details>

See `.planning/milestones/v32.10-ROADMAP.md` for full details.

<details>
<summary>✅ v33.0 Desktop App 아키텍처 재설계 (Phases 456-458) — SHIPPED 2026-03-31</summary>

- [x] Phase 456-458: 3 phases completed — 2026-03-31

</details>

See `.planning/milestones/v33.0-ROADMAP.md` for full details.

---

## v33.2 Tauri Desktop App (In Progress)

**Milestone Goal:** Tauri 2 기반 데스크탑 앱으로 WAIaaS 데몬을 GUI에서 관리 — 기존 Admin Web UI를 WebView에 로드하여 코드 중복 없이 전체 기능 제공

## Phases

**Phase Numbering:**
- Integer phases (459, 460, ...): Planned milestone work
- Decimal phases (460.1, etc.): Urgent insertions (marked with INSERTED)
- Phase 459 and Phase 460 are parallelizable (no dependency between them)

- [x] **Phase 459: WalletConnect Spike** - @reown/appkit Tauri WebView 호환성 Go/No-Go 검증 (completed 2026-03-31)
- [x] **Phase 460: Tauri Shell + Sidecar Manager** - Tauri 프로젝트 구조 + SEA 바이너리 빌드 + 사이드카 라이프사이클 + WebView 로드 (completed 2026-03-31)
- [x] **Phase 461: IPC Bridge + System Tray** - 7개 IPC 명령 + 시스템 트레이 3색 상태 + isDesktop() + 4-layer tree-shaking (completed 2026-03-31)
- [x] **Phase 462: Setup Wizard + WalletConnect + Desktop UI 확장** - 5단계 Setup Wizard + WalletConnect QR 페어링 + Desktop 전용 컴포넌트 (completed 2026-03-31)
- [x] **Phase 463: GitHub Releases CI + Auto-Update** - 3 플랫폼 빌드 매트릭스 + 코드 사이닝 + 자동 업데이트 (completed 2026-03-31)

## Phase Details

### Phase 459: WalletConnect Spike
**Goal**: @reown/appkit이 Tauri WebView(WebKit/WebView2) 내에서 QR 페어링 + SIWS/SIWE 서명을 완료할 수 있는지 검증하여 Go/No-Go를 결정한다
**Depends on**: Nothing (parallelizable with Phase 460)
**Requirements**: WCON-01
**Success Criteria** (what must be TRUE):
  1. Tauri WebView 내에서 `<w3m-modal>` Web Component가 렌더링되고 QR 코드가 표시된다
  2. WebSocket이 `wss://relay.walletconnect.com`에 CSP 충돌 없이 연결된다
  3. 외부 지갑(Phantom 또는 MetaMask)으로 QR 스캔 후 SIWS/SIWE 서명 플로우가 완료된다 (또는 실패 시 Plan B 전환 결정이 문서화된다)
**Plans:** 1/1 plans complete
Plans:
- [x] 459-01-PLAN.md — Tauri spike 프로젝트 + @reown/appkit QR 페어링 + Go/No-Go 결정

### Phase 460: Tauri Shell + Sidecar Manager
**Goal**: Tauri 앱이 WAIaaS 데몬 SEA 바이너리를 사이드카로 시작하고, 동적 포트를 발견하여 WebView에 Admin Web UI를 로드한다
**Depends on**: Nothing (parallelizable with Phase 459)
**Requirements**: SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06, SIDE-07, SIDE-08, VIEW-01, VIEW-03
**Success Criteria** (what must be TRUE):
  1. Tauri 앱 실행 시 스플래시 화면이 표시되고, SEA 바이너리 데몬이 자동으로 시작된다
  2. 데몬이 할당한 동적 포트가 stdout 파싱으로 발견되고, WebView가 `http://localhost:{port}/admin`으로 이동하여 Admin Web UI가 표시된다
  3. 데몬 crash 시 자동 재시작되고, graceful shutdown(SIGTERM -> 5s -> SIGKILL)이 동작한다
  4. PID lockfile로 다중 인스턴스가 방지되고, Windows에서 Job Object로 zombie 프로세스가 방지된다
  5. esbuild + SEA config로 3 플랫폼 바이너리가 생성되고, sodium-native/better-sqlite3 native addon이 올바르게 로드된다
**Plans:** 3/3 plans complete
Plans:
- [x] 460-01-PLAN.md — Tauri 2 프로젝트 스캐폴딩 + SidecarManager 구현 (Rust)
- [x] 460-02-PLAN.md — SEA 바이너리 빌드 파이프라인 + native-loader + 동적 포트 출력
- [x] 460-03-PLAN.md — 스플래시 -> 데몬 시작 -> WebView navigate 통합 + 검증

### Phase 461: IPC Bridge + System Tray
**Goal**: Desktop 전용 코드 아키텍처(isDesktop, tree-shaking)가 확립되고, 7개 IPC 명령으로 네이티브 기능을 사용할 수 있으며, 시스템 트레이에 데몬 상태가 표시된다
**Depends on**: Phase 460
**Requirements**: IPC-01, IPC-02, IPC-03, IPC-04, IPC-05, IPC-06, IPC-07, TRAY-01, TRAY-02, TRAY-03, VIEW-02, VIEW-04
**Success Criteria** (what must be TRUE):
  1. Admin Web UI에서 `invoke('start_daemon')`, `invoke('stop_daemon')`, `invoke('restart_daemon')` 등 7개 IPC 명령이 타입 안전하게 동작한다
  2. 시스템 트레이에 3색 상태 아이콘(녹/주황/빨강)이 표시되고, 30초 폴링으로 자동 업데이트된다
  3. 트레이 컨텍스트 메뉴(Open Dashboard / Pause / Resume / Quit)가 동작한다
  4. `isDesktop()` 함수가 `window.__TAURI_INTERNALS__` 기반으로 환경을 감지하고, Desktop 전용 코드가 4-layer tree-shaking으로 브라우저 번들에 포함되지 않는다
**Plans:** 2/2 plans complete
Plans:
- [x] 461-01-PLAN.md — IPC Bridge TS 래퍼 + isDesktop() + quit_app + 4-layer tree-shaking
- [x] 461-02-PLAN.md — System Tray 3색 아이콘 + 컨텍스트 메뉴 + 30초 폴링
**UI hint**: yes

### Phase 462: Setup Wizard + WalletConnect + Desktop UI 확장
**Goal**: Desktop 최초 실행 사용자가 Setup Wizard로 안내받고, WalletConnect QR로 외부 지갑을 연결하며, Desktop 전용 UI 확장이 완성된다
**Depends on**: Phase 461, Phase 459 (spike 결과)
**Requirements**: WIZA-01, WIZA-02, WIZA-03, WIZA-04, WCON-02, WCON-03, WCON-04, WCON-05
**Success Criteria** (what must be TRUE):
  1. Desktop 최초 실행 시 5단계 Setup Wizard(패스워드 -> 체인 선택 -> 월렛 생성 -> Owner 연결 -> 완료)가 자동 진입한다
  2. Owner 연결 단계에서 "나중에" 스킵이 가능하고, 설정 완료 후 재실행 시 대시보드로 직행한다
  3. WalletConnect QR 코드로 외부 지갑(Phantom/MetaMask)과 페어링하여 SIWS/SIWE Owner 등록이 가능하다 (Plan A 실패 시 Plan B 대체)
  4. Setup Wizard와 WalletConnect 컴포넌트가 Desktop 환경에서만 렌더링되고 브라우저에서는 숨겨진다
**Plans:** 3/3 plans complete
Plans:
- [x] 462-01-PLAN.md — Setup Wizard 5단계 컴포넌트 + wizard-store + App.tsx 통합
- [x] 462-02-PLAN.md — WalletConnect QR 페어링 커넥터 + QR 모달 + tree-shaking 검증
- [x] 462-03-PLAN.md — Owner 단계 WC 와이어링 + 전체 플로우 통합 검증
**UI hint**: yes

### Phase 463: GitHub Releases CI + Auto-Update
**Goal**: 3 플랫폼 빌드 매트릭스로 데스크탑 앱이 GitHub Releases에 배포되고, 사용자 앱이 자동으로 업데이트를 확인/적용한다
**Depends on**: Phase 460, Phase 461, Phase 462
**Requirements**: DIST-01, DIST-02, DIST-03, UPDT-01, UPDT-02, UPDT-03
**Success Criteria** (what must be TRUE):
  1. `desktop-v*` 태그 푸시 시 tauri-action으로 macOS(arm64/x64), Windows(x64), Linux(x64) 빌드가 완료되고 GitHub Releases에 `.dmg`, `.msi`, `.AppImage`, `.deb` 아티팩트가 업로드된다
  2. macOS 빌드에 Developer ID 코드 사이닝 + notarization이 적용되어 Gatekeeper를 통과한다
  3. 앱 시작 시 `latest.json`에서 최신 버전을 확인하고, 사용자 확인 후 업데이트 다운로드 + 패치가 완료된다
  4. 변조된 바이너리의 업데이트가 Ed25519 서명 검증 실패로 거부된다
**Plans:** 3/3 plans complete
Plans:
- [x] 463-01-PLAN.md — Tauri updater 플러그인 등록 + Ed25519 키 설정
- [x] 463-02-PLAN.md — GitHub Actions 3-platform 빌드 매트릭스 + desktop-release.yml
- [x] 463-03-PLAN.md — 자동 업데이트 UI (UpdateBanner) + 전체 검증

## Progress

**Execution Order:**
Phase 459 and Phase 460 are parallelizable. After both complete: 461 -> 462 -> 463

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 459. WalletConnect Spike | 1/1 | Complete    | 2026-03-31 |
| 460. Tauri Shell + Sidecar Manager | 3/3 | Complete    | 2026-03-31 |
| 461. IPC Bridge + System Tray | 2/2 | Complete    | 2026-03-31 |
| 462. Setup Wizard + WalletConnect + Desktop UI 확장 | 3/3 | Complete    | 2026-03-31 |
| 463. GitHub Releases CI + Auto-Update | 3/3 | Complete    | 2026-03-31 |
