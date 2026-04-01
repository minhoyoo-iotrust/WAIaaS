# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- ✅ **v32.8 테스트 커버리지 강화** — Phases 444-448.1 (shipped 2026-03-18)
- ✅ **v32.9 Push Relay 직접 연동 (ntfy.sh 제거)** — Phases 449-451 (shipped 2026-03-18)
- ✅ **v32.10 에이전트 스킬 정리 + OpenClaw 플러그인** — Phases 452-455 (shipped 2026-03-18)
- ✅ **v33.0 Desktop App 아키텍처 재설계** — Phases 456-458 (shipped 2026-03-31)
- ✅ **v33.2 Tauri Desktop App** — Phases 459-463 (shipped 2026-04-01)

<details>
<summary>✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Phases 432-434) — SHIPPED 2026-03-16</summary>

- [x] Phase 432: Interface Extension (2/2 plans) — completed 2026-03-16
- [x] Phase 433: Multichain Positions (4/4 plans) — completed 2026-03-16
- [x] Phase 434: Testnet Toggle (2/2 plans) — completed 2026-03-16

</details>

See `.planning/milestones/v32.5-ROADMAP.md` for full details.

<details>
<summary>✅ v32.6 성능 + 구조 개선 (Phases 435-438) — SHIPPED 2026-03-17</summary>

- [x] Phase 435-438: 4 phases completed — 2026-03-17

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

<details>
<summary>✅ v33.2 Tauri Desktop App (Phases 459-463) — SHIPPED 2026-04-01</summary>

- [x] Phase 459: WalletConnect Spike (1/1 plans) — completed 2026-03-31
- [x] Phase 460: Tauri Shell + Sidecar Manager (3/3 plans) — completed 2026-03-31
- [x] Phase 461: IPC Bridge + System Tray (2/2 plans) — completed 2026-03-31
- [x] Phase 462: Setup Wizard + WalletConnect + Desktop UI (3/3 plans) — completed 2026-03-31
- [x] Phase 463: GitHub Releases CI + Auto-Update (3/3 plans) — completed 2026-03-31

</details>

See `.planning/milestones/v33.2-ROADMAP.md` for full details.

## Phases

- [x] **Phase 464: Desktop Installation Guide** - OS별 설치 절차, 보안 경고 해제, Setup Wizard 안내 문서 작성 (completed 2026-04-01)
- [x] **Phase 465: Download Page** - OS 자동 감지, GitHub Releases API 연동, 폴백 처리가 포함된 다운로드 페이지 구축 (completed 2026-04-01)
- [x] **Phase 466: Site Integration & Distribution** - 네비게이션 링크 추가, sitemap 등록, SUBMISSION_KIT 업데이트 (completed 2026-04-01)

## Phase Details

### Phase 464: Desktop Installation Guide
**Goal**: 사용자가 macOS/Windows/Linux에서 Desktop App을 설치하고 초기 설정을 완료할 수 있는 문서가 존재한다
**Depends on**: Nothing (first phase)
**Requirements**: IG-01, IG-02, IG-03, IG-04, IG-05, IG-06, IG-07
**Success Criteria** (what must be TRUE):
  1. macOS 사용자가 .dmg 설치 절차와 Gatekeeper 경고 해제 방법(macOS 14 이하 + Sequoia 15+ 분리)을 문서에서 확인할 수 있다
  2. Windows 사용자가 .msi 설치 절차와 SmartScreen 허용 방법을 문서에서 확인할 수 있다
  3. Linux 사용자가 .AppImage/.deb 설치 절차와 권한 설정을 문서에서 확인할 수 있다
  4. Setup Wizard 5단계와 자동 업데이트(Ed25519) 동작 설명이 포함되어 있다
  5. docs/admin-manual/ README 목차에 desktop-installation.md 링크가 포함되어 있다
**Plans**: 1 plan

Plans:
- [x] 464-01-PLAN.md — Desktop Installation Guide 작성 + admin-manual 목차 연동

### Phase 465: Download Page
**Goal**: 사용자가 waiaas.ai/download 페이지에서 자신의 OS에 맞는 Desktop App을 다운로드할 수 있다
**Depends on**: Phase 464
**Requirements**: DL-01, DL-02, DL-03, DL-04, DL-05, DL-06, DL-07
**Success Criteria** (what must be TRUE):
  1. 사용자가 다운로드 페이지에 접속하면 자신의 OS에 맞는 다운로드 버튼이 주요 CTA로 표시된다
  2. GitHub Releases API에서 desktop-v* 태그를 필터링하여 최신 버전 번호, 릴리스 날짜, 바이너리 URL이 동적으로 표시된다
  3. GitHub API 실패 시 "GitHub Releases에서 직접 다운로드" 폴백 링크가 표시되고, API 응답에 5분 TTL 캐시가 적용된다
  4. npm, Docker 대체 설치법이 다운로드 페이지에 명시된다
**Plans**: 1 plan

Plans:
- [x] 465-01-PLAN.md — Download page HTML + OS 감지 + GitHub API 연동 + 스타일링 + 폴백 + 대체 설치법

### Phase 466: Site Integration & Distribution
**Goal**: 다운로드 페이지가 사이트 전체 네비게이션에 통합되고 배포 추적 문서가 업데이트된다
**Depends on**: Phase 465
**Requirements**: DL-08, DIST-01
**Success Criteria** (what must be TRUE):
  1. 사이트의 모든 페이지 네비게이션에 Download 링크가 표시된다
  2. sitemap.xml에 /download/ URL이 포함된다
  3. SUBMISSION_KIT.md에 Desktop App 배포 채널(다운로드 페이지, GitHub Releases) 항목이 존재한다
**Plans**: 1 plan

Plans:
- [x] 466-01-PLAN.md — 네비게이션 Download 링크 + sitemap 등록 + SUBMISSION_KIT 업데이트

## Progress

**Execution Order:**
Phases execute in numeric order: 464 → 465 → 466

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 464. Desktop Installation Guide | 1/1 | Complete    | 2026-04-01 |
| 465. Download Page | 1/1 | Complete    | 2026-04-01 |
| 466. Site Integration & Distribution | 1/1 | Complete   | 2026-04-01 |
