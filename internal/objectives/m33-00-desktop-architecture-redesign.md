# 마일스톤 m33-00: Desktop App 아키텍처 재설계

- **Status:** IN_PROGRESS
- **Milestone:** v33.0

## 목표

설계 문서 39(Tauri Desktop Architecture)를 Admin Web UI 재사용 아키텍처로 변경한다. React 18로 8개 화면을 별도 구현하는 기존 설계를 폐기하고, 기존 Admin Web UI(Preact 10.x)를 Tauri WebView에서 로드하는 구조로 전환한다.

---

## 배경

### 기존 설계의 문제

설계 문서 39는 Desktop App의 UI를 React 18 + TailwindCSS 4로 **별도 구현**하도록 설계했다:

| 항목 | Admin Web UI | Desktop App (문서 39) |
|------|---|---|
| 프레임워크 | Preact 10.x + @preact/signals | React 18 + TailwindCSS 4 |
| 화면 | 19페이지 (v32.10 기준) | 8화면 (별도 구현) |
| 코드 | `packages/admin/` | `apps/desktop/src/pages/` |

이 설계는 다음 문제를 야기한다:

1. **동일 기능 이중 구현**: 대시보드, 월렛 관리, 정책 관리 등을 Preact와 React로 두 번 만듦
2. **기능 비동기화**: Admin Web UI에 기능이 추가될 때 Desktop App에 별도 반영 필요 — v32.10 기준 19페이지로 확장된 상태에서 이중 구현 비용이 초기 설계(6페이지) 시점보다 3배 이상 증가
3. **유지보수 비용 2배**: 버그 수정, UI 개선이 양쪽에서 독립적으로 이루어짐
4. **v1.5.2 이후 누적된 UI 개선이 Desktop에 자동 반영되지 않음**: 정책 폼 UX(v1.5.2), IA 재구조화(v31.18), 멀티체인 DeFi 포지션(v32.5) 등

### 변경 방향

```
변경 전: Desktop App = Tauri Shell + React 18 SPA (8화면 별도 구현)
변경 후: Desktop App = Tauri Shell + 기존 Admin Web UI (WebView 로드)
                        + Desktop 전용 기능 (Sidecar, 트레이, Wizard, WalletConnect)
```

---

## 설계 변경 범위

### 설계 문서 39 현재 상태

문서 39는 v0.5(2026-02-07) 이후 갱신되지 않았다. 현재 코드베이스와 주요 괴리점:

| 항목 | 문서 39 기술 | 현재 상태 |
|------|------------|----------|
| UI 화면 수 | DESK-02: 8개 화면 | Admin Web UI 19페이지 |
| Auth 모델 | v0.5 시점 참조 | session 모델 대폭 변경(v29.9), SIWE/SIWS 안정화 |
| WalletConnect | 미래형 설계 | v1.6.1에서 Owner 승인 구현 완료 |
| 알림 | Telegram/Discord 중심 | Push Relay 직접 연동(v32.9), ntfy.sh 제거 |

이 괴리를 해소하는 것이 본 마일스톤의 핵심 작업이다.

### 설계 문서 39 수정 대상 섹션

| 섹션 | 현재 | 변경 |
|------|------|------|
| 2.1 아키텍처 다이어그램 | WebView: React 18 SPA | WebView: Admin Web UI (`http://localhost:{port}/admin`) 로드 |
| 2.2 계층 역할 분리 | WebView Frontend: React 18 + TailwindCSS 4 | WebView Frontend: 기존 Admin Web UI (Preact 10.x) — 코드 공유 |
| 3.3 HTTP localhost | WebView → Hono API 직접 호출 | WebView(Admin Web UI) → Hono API — 기존 `packages/admin/src/api/client.ts` 재사용 |
| 6 프로젝트 구조 | `apps/desktop/src/pages/` 8개 화면 | `apps/desktop/src/` 제거, `packages/admin/src/` 확장 |
| 7 UI 화면별 플로우 | 8개 화면 별도 설계 | 기존 Admin Web UI 19페이지 + Desktop 전용 확장(Wizard, WalletConnect) |
| 13 구현 노트 | React 18 관련 노트 | Admin Web UI 재사용 + `isDesktop()` 환경 감지 |

### 신규 설계 항목 (Phase 457-458에서 설계 완료)

| 항목 | 내용 | 설계 문서 39 섹션 |
|------|------|------------------|
| Desktop 환경 감지 | `window.__TAURI_INTERNALS__` (Tauri 2.x) 기반 `isDesktop()`. 모듈 레벨 캐싱, SSR 안전 | 3.5 |
| 조건부 렌더링 전략 | Desktop 전용 컴포넌트를 `isDesktop()` 가드 + dynamic import로 로드 | 3.7 |
| IPC 브릿지 | `tauri-bridge.ts` invoke 래퍼. 6개 명령: start/stop/restart_daemon, get_sidecar_status, get_daemon_logs, send_notification | 3.6 |
| 데몬 포트 동적 할당 | TCP bind(0) + stdout WAIAAS_PORT={port} (primary) + tempfile (fallback) | 4.2.1 |
| 번들 최적화 | 4-layer tree-shaking: dynamic import + optional peer deps + build constant + CI verification | 6.4, 13.3 |
| CSP 예외 전략 | tauri.conf.json security.csp로 HTML meta CSP 오버라이드. 동적 포트: `http://127.0.0.1:*` 와일드카드 | 3.8 |
| Capability 설정 | CapabilityBuilder.remote() URL 패턴. 6개 IPC 명령 퍼미션 | 3.9 |

### 변경하지 않는 섹션 (Phase 458에서 일관성 수정 완료)

| 섹션 | 로직 변경 | 일관성 수정 (Phase 458) |
|------|----------|----------------------|
| 4 Sidecar 관리 | 없음 | 4.2.1 동적 포트 프로토콜 추가, 포트 충돌 행 수정 |
| 5 시스템 트레이 | 없음 | main.rs에 WebView URL 동적 포트 주석 추가 |
| 8 WalletConnect | 없음 | 경로 packages/admin/src/desktop/, React→Preact, 동적 포트 |
| 9 OS 네이티브 알림 | 없음 | 경로 수정, react-router→Admin Web UI router |
| 10 자동 업데이트 | 없음 | 경로 수정 |
| 11 크로스 플랫폼 빌드 | 없음 | 없음 |
| 12 보안 고려사항 | 없음 | CSP connect-src 동적 포트, killSwitch 동적 포트 |

---

## 산출물

| 산출물 | 내용 | 상태 |
|--------|------|------|
| 설계 문서 39 수정본 | 6개 섹션 변경(2.1, 2.2, 3.3, 6, 7, 13) + 5개 신규 섹션(3.6~3.9, 6.4) + 일관성 수정 | Phase 456-458 완료 |
| 아키텍처 다이어그램 갱신 | WebView 계층이 Admin Web UI를 로드하는 구조로 변경 | Phase 456 완료 |
| 프로젝트 구조 갱신 | `apps/desktop/src/` 프론트엔드 제거, `packages/admin/src/desktop/` 확장 명세 | Phase 456 완료 |
| Desktop 환경 감지 설계 | `isDesktop()` (`__TAURI_INTERNALS__`), IPC 브릿지 6명령, 조건부 렌더링 | Phase 457 완료 |
| 번들 최적화 전략 | 4-layer tree-shaking, HMR-first dev workflow, CI verification | Phase 457 완료 |
| 동적 포트 할당 프로토콜 | TCP bind(0) + stdout/tempfile dual-channel delivery | Phase 458 완료 |
| m33-02 objectives 정합 | v33.0 아키텍처 반영 (IPC, 감지, 포트, 경로, tree-shaking) | Phase 458 완료 |

---

## E2E 검증 시나리오

설계 마일스톤이므로 코드 검증은 없다. 설계 일관성을 검증한다.

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 설계 문서 39의 변경 섹션이 m33-02 objectives와 일치 | 문서 39의 아키텍처 → m33-02 컴포넌트 테이블 교차 검증 | [REVIEW] |
| 2 | Admin Web UI 기존 19페이지가 Desktop 전용 확장과 충돌하지 않음 | 기존 라우팅 + 신규 라우팅(wizard, walletconnect) 경로 충돌 검사 | [REVIEW] |
| 3 | `isDesktop()` 분기가 브라우저 Admin Web UI에 영향 없음 | 브라우저에서 Desktop 전용 코드가 로드/실행되지 않는 설계 확인 | [REVIEW] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| Admin Web UI (v32.10+) | 재사용 대상인 Admin Web UI 19페이지가 현재 상태로 안정화되어 있어야 함. v1.3.2 최초 구현 이후 v27.4(UX 개선), v31.18(IA 재구조화), v32.5(멀티체인 DeFi) 등으로 대폭 확장됨 |

---

## 예상 규모 (실적)

| 항목 | 예상 | 실적 |
|------|------|------|
| 페이즈 | 1개 | 3개 (Phase 456: 기존 섹션 재작성, 457: IPC/번들 설계, 458: 검증+정합) |
| 수정 파일 | 2개 | 3개 (`39-tauri-desktop-architecture.md`, `m33-02-desktop-app.md`, `m33-00-desktop-architecture-redesign.md`) |
| 신규 파일 | 없음 | 없음 |
| Plans | - | 6개 (456: 2, 457: 2, 458: 2) |

> **이연 사유**: Desktop App은 배포 채널이지 핵심 기능이 아님. 모든 코어 기능(월렛, 트랜잭션, 정책, 세션, 인증)은 CLI + REST API + Admin Web UI + MCP로 동작. m20은 npm/Docker/CLI 중심으로 릴리스하고, Desktop은 이후 진행.

---

*생성일: 2026-02-14*
*m20 이후로 이연: 2026-02-16 — Desktop은 배포 채널이므로 m20 릴리스 후 진행*
*v33.0 착수: 2026-03-31 — Admin Web UI 19페이지 + 113 마일스톤 안정화 완료*
*v33.0 Phase 456-458 진행 중: 2026-03-31 -- 설계 문서 39 6개 섹션 재작성 + IPC/번들 5개 섹션 신규 + 동적 포트 프로토콜 + 일관성 검증*
*선행: Admin Web UI (v32.10+)*
*후행: m33-02 (Tauri Desktop App 구현)*
