# 마일스톤 m31: Desktop App 아키텍처 재설계

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

설계 문서 39(Tauri Desktop Architecture)를 Admin Web UI 재사용 아키텍처로 변경한다. React 18로 8개 화면을 별도 구현하는 기존 설계를 폐기하고, 기존 Admin Web UI(Preact 10.x)를 Tauri WebView에서 로드하는 구조로 전환한다.

---

## 배경

### 기존 설계의 문제

설계 문서 39는 Desktop App의 UI를 React 18 + TailwindCSS 4로 **별도 구현**하도록 설계했다:

| 항목 | Admin Web UI | Desktop App (문서 39) |
|------|---|---|
| 프레임워크 | Preact 10.x + @preact/signals | React 18 + TailwindCSS 4 |
| 화면 | 6페이지 | 8화면 (별도 구현) |
| 코드 | `packages/admin/` | `apps/desktop/src/pages/` |

이 설계는 다음 문제를 야기한다:

1. **동일 기능 이중 구현**: 대시보드, 월렛 관리, 정책 관리 등을 Preact와 React로 두 번 만듦
2. **기능 비동기화**: Admin Web UI에 기능이 추가될 때 Desktop App에 별도 반영 필요
3. **유지보수 비용 2배**: 버그 수정, UI 개선이 양쪽에서 독립적으로 이루어짐
4. **v1.5.2 정책 폼 UX 개선이 Desktop에 자동 반영되지 않음**

### 변경 방향

```
변경 전: Desktop App = Tauri Shell + React 18 SPA (8화면 별도 구현)
변경 후: Desktop App = Tauri Shell + 기존 Admin Web UI (WebView 로드)
                        + Desktop 전용 기능 (Sidecar, 트레이, Wizard, WalletConnect)
```

---

## 설계 변경 범위

### 설계 문서 39 수정 대상 섹션

| 섹션 | 현재 | 변경 |
|------|------|------|
| 2.1 아키텍처 다이어그램 | WebView: React 18 SPA | WebView: Admin Web UI (`http://localhost:{port}/admin`) 로드 |
| 2.2 계층 역할 분리 | WebView Frontend: React 18 + TailwindCSS 4 | WebView Frontend: 기존 Admin Web UI (Preact 10.x) — 코드 공유 |
| 3.3 HTTP localhost | WebView → Hono API 직접 호출 | WebView(Admin Web UI) → Hono API — 기존 `packages/admin/src/api/client.ts` 재사용 |
| 6 프로젝트 구조 | `apps/desktop/src/pages/` 8개 화면 | `apps/desktop/src/` 제거, `packages/admin/src/` 확장 |
| 7 UI 화면별 플로우 | 8개 화면 별도 설계 | 기존 Admin Web UI 6페이지 + Desktop 전용 확장(Wizard, WalletConnect) |
| 13 구현 노트 | React 18 관련 노트 | Admin Web UI 재사용 + `isDesktop()` 환경 감지 |

### 신규 설계 항목

| 항목 | 내용 |
|------|------|
| Desktop 환경 감지 | `window.__TAURI__` 존재 여부로 Desktop/브라우저 분기. `isDesktop()` 유틸리티 |
| 조건부 렌더링 전략 | Desktop 전용 컴포넌트(Setup Wizard, WalletConnect, Sidecar 상태)를 `isDesktop()` 가드 + dynamic import로 로드 |
| IPC 브릿지 | `window.__TAURI__.invoke()` 래퍼. Sidecar 상태 조회, 앱 종료 등 네이티브 기능 호출 |
| 데몬 포트 동적 할당 | Sidecar Manager가 빈 포트를 할당하고 WebView URL에 반영 |
| 번들 최적화 | Desktop 전용 모듈(@reown/appkit 등)을 lazy load하여 브라우저 배포 번들 크기에 영향 없음 |

### 변경하지 않는 섹션

| 섹션 | 이유 |
|------|------|
| 4 Sidecar 관리 | Rust Backend 로직은 변경 없음 |
| 5 시스템 트레이 | 네이티브 기능, UI와 무관 |
| 8 WalletConnect | 프로토콜 흐름은 동일, 호스팅 위치만 Admin Web UI로 이동 |
| 9 OS 네이티브 알림 | Rust Backend, 변경 없음 |
| 10 자동 업데이트 | Rust Backend, 변경 없음 |
| 11 크로스 플랫폼 빌드 | SEA 바이너리 전략 변경 없음 |
| 12 보안 고려사항 | 동일 |

---

## 산출물

| 산출물 | 내용 |
|--------|------|
| 설계 문서 39 수정본 | 6개 섹션 변경 + 2개 신규 항목 추가 |
| 아키텍처 다이어그램 갱신 | WebView 계층이 Admin Web UI를 로드하는 구조로 변경 |
| 프로젝트 구조 갱신 | `apps/desktop/src/` 프론트엔드 제거, `packages/admin/src/` 확장 명세 |
| Desktop 환경 감지 설계 | `isDesktop()`, IPC 브릿지, 조건부 렌더링 전략 문서화 |
| 번들 최적화 전략 | dynamic import 경계, lazy load 대상 모듈 목록 |

---

## E2E 검증 시나리오

설계 마일스톤이므로 코드 검증은 없다. 설계 일관성을 검증한다.

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 설계 문서 39의 변경 섹션이 m31-01 objectives와 일치 | 문서 39의 아키텍처 → m31-01 컴포넌트 테이블 교차 검증 | [REVIEW] |
| 2 | Admin Web UI 기존 6페이지가 Desktop 전용 확장과 충돌하지 않음 | 기존 라우팅 + 신규 라우팅(wizard, walletconnect) 경로 충돌 검사 | [REVIEW] |
| 3 | `isDesktop()` 분기가 브라우저 Admin Web UI에 영향 없음 | 브라우저에서 Desktop 전용 코드가 로드/실행되지 않는 설계 확인 | [REVIEW] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.3.2 (Admin Web UI) | 재사용 대상인 Admin Web UI가 구현되어 있어야 함 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 1개 (설계 문서 39 수정 + 리뷰) |
| 수정 파일 | 1개 (`.planning/deliverables/39-tauri-desktop-architecture.md`) |
| 신규 파일 | 없음 |

> **이연 사유**: Desktop App은 배포 채널이지 핵심 기능이 아님. 모든 코어 기능(월렛, 트랜잭션, 정책, 세션, 인증)은 CLI + REST API + Admin Web UI + MCP로 동작. m20은 npm/Docker/CLI 중심으로 릴리스하고, Desktop은 이후 진행.

---

*생성일: 2026-02-14*
*m20 이후로 이연: 2026-02-16 — Desktop은 배포 채널이므로 m20 릴리스 후 진행*
*선행: v1.3.2 (Admin Web UI)*
*후행: m31-01 (Tauri Desktop App 구현)*
