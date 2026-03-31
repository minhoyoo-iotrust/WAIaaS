# 마일스톤 m33-02: Tauri Desktop App

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

Tauri 2 기반 데스크탑 앱으로 WAIaaS 데몬을 GUI에서 관리할 수 있는 상태. Sidecar로 데몬 바이너리를 내장하고, **기존 Admin Web UI(`packages/admin/`)를 WebView에 그대로 로드**하여 코드 중복 없이 전체 기능을 제공한다. Desktop 전용 기능(Sidecar Manager, 시스템 트레이, Setup Wizard, WalletConnect)만 Tauri 네이티브 레이어에서 추가한다.

---

## 구현 대상 설계 문서

| 문서 | 이름 | 구현 범위 | 전체/부분 |
|------|------|----------|----------|
| 39 | tauri-desktop-architecture | Tauri 2 Desktop App: Rust Backend(Sidecar Manager, 시스템 트레이 3색 상태 아이콘), WebView(기존 Admin Web UI 로드 + Desktop 전용 확장), Setup Wizard 5단계, WalletConnect @reown/appkit Tauri 통합 | 부분 (UI 재구현 → Admin Web UI 재사용으로 변경) |

### 아키텍처 변경: Admin Web UI 재사용

기존 설계(문서 39 v0.5)는 React 18 + TailwindCSS 4로 8개 화면을 별도 구현하는 구조였으나, **v33.0 재설계로 기존 Admin Web UI(Preact 10.x + @preact/signals)를 WebView에서 로드**하는 방식으로 변경 완료.

| 항목 | 문서 39 v0.5 기존 설계 | 문서 39 v33.0 현재 설계 |
|------|------------------|--------|
| UI 프레임워크 | React 18 + TailwindCSS 4 (신규) | 기존 Admin Web UI (Preact 10.x) 재사용 |
| 화면 구현 | 8개 화면 별도 구현 | `http://localhost:{port}/admin` 로드 |
| 코드 위치 | `apps/desktop/src/pages/` | `packages/admin/src/desktop/` (Desktop 전용 확장) |
| Desktop 환경 감지 | `window.__TAURI__` (미구체화) | `window.__TAURI_INTERNALS__` (Tauri 2.x) + 모듈 레벨 캐싱 |
| IPC 명령 | 미명세 | 6개 명령 (start/stop/restart_daemon, get_sidecar_status, get_daemon_logs, send_notification) |
| 포트 할당 | 고정 포트 (config.toml) | TCP bind(0) 동적 할당 + stdout/tempfile 프로토콜 |
| 번들 전략 | React 18 + TailwindCSS 추가 | 4-layer tree-shaking (dynamic import + optional peer deps + build constant + CI verification) |
| 기능 동기화 | Admin Web UI와 별도 유지보수 | 자동 동기화 (동일 코드) |

#### 변경 근거

1. **코드 중복 제거**: 동일 기능을 Preact(Admin)와 React(Desktop)로 두 번 만들 필요 없음
2. **기능 자동 동기화**: Admin Web UI에 기능 추가하면 Desktop에도 즉시 반영
3. **유지보수 비용 절감**: UI 버그 수정, 정책 폼 개선(v1.5.2) 등이 한 곳에서만 이루어짐
4. **일관된 UX**: 브라우저와 Desktop에서 동일한 UI/UX 제공

### v1.6에서 이미 구현된 부분 (m31-02에서 활용)

- Kill Switch KillSwitchService (3-state 상태 머신, 6-step cascade, dual-auth 복구) -- v1.6에서 구현
- AutoStop Engine AutoStopService (5 규칙 기반 자동 정지) -- v1.6에서 구현
- Telegram Bot 연동 (Long Polling, 명령 수신) -- v1.6에서 구현
- Docker 배포 -- v1.6에서 구현
- REST API 38+ 엔드포인트 전체 (v1.3에서 완성)
- @waiaas/sdk TypeScript SDK (v1.3에서 구현)
- Admin Web UI 6페이지 (대시보드, 월렛, 세션, 정책, 알림, 설정) -- v1.3.2에서 구현
- 세션 인증(sessionAuth), 마스터 인증(masterAuth), Owner 인증(ownerAuth) -- v1.2에서 구현

### m31-02에서 새로 추가하는 부분

- Tauri 2 Desktop Shell (Rust Backend + WebView)
- Sidecar Manager (Node.js SEA 바이너리 관리, crash detection, graceful 종료)
- 시스템 트레이 (3색 상태 아이콘: 녹=정상, 주황=경고, 빨강=정지, 컨텍스트 메뉴)
- Setup Wizard 5단계 (Admin Web UI에 페이지 추가, Desktop 최초 실행 시 자동 진입)
- WalletConnect @reown/appkit 통합 (Admin Web UI에 컴포넌트 추가, Desktop에서만 활성화)
- Admin Web UI 확장: Desktop 환경 감지 → Setup Wizard, WalletConnect 컴포넌트 조건부 렌더링
- **GitHub Releases CI**: `tauri-action`으로 3 플랫폼(macOS arm64/x64, Windows x64, Linux x64) 빌드 매트릭스 → `.dmg`, `.msi`, `.AppImage` 자동 릴리스
- **Tauri 자동 업데이트**: 앱 내 업데이트 확인 → GitHub Releases에서 최신 버전 다운로드 → 자동 패치 (설계 문서 39 섹션 10)

---

## 산출물

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| Tauri Shell | Tauri 2 (Rust). WebView가 내장 데몬의 Admin Web UI(`http://localhost:{port}/admin`)를 로드. IPC 브릿지로 네이티브 기능(Sidecar 상태, 시스템 트레이 제어) 연동 |
| Sidecar Manager | Node.js SEA 바이너리 시작/종료/crash detection. graceful shutdown 5초 타임아웃 후 SIGKILL. 데몬 포트 동적 할당 → WebView URL에 반영 |
| 시스템 트레이 | 3색 상태 아이콘(녹=정상, 주황=경고, 빨강=정지) + 컨텍스트 메뉴(Open Dashboard / Pause / Resume / Quit). 데몬 상태 30초 폴링 |
| IPC 브릿지 | Tauri `invoke()` → Rust 커맨드. Desktop 전용 기능을 Admin Web UI에서 호출할 수 있도록 `window.__TAURI_INTERNALS__` 감지 기반 조건부 연동. 커맨드 6개: `start_daemon`, `stop_daemon`, `restart_daemon`, `get_sidecar_status`, `get_daemon_logs`, `send_notification` (설계 문서 39 섹션 3.6) |
| Setup Wizard | Admin Web UI에 추가하는 5단계 페이지: (1)마스터 패스워드 설정 (2)체인 선택(Solana/EVM/Both) (3)첫 월렛 이름+생성 (4)Owner 지갑 연결(WalletConnect, "나중에" 스킵 가능) (5)완료 요약+대시보드 이동. Desktop 환경(`window.__TAURI_INTERNALS__` 존재)에서만 렌더링. `isDesktop()` 가드 + dynamic import 패턴. 초기 설정 완료 여부는 데몬의 설정 상태로 판단 |
| WalletConnect 컴포넌트 | Admin Web UI의 월렛 상세 페이지에 추가. @reown/appkit으로 QR 코드 페어링 → WalletConnect 세션 → SIWS(Solana)/SIWE(EVM) 서명 요청 → Owner 등록 API 호출. Phantom/Backpack(Solana), MetaMask/Rainbow(EVM) 지원. Desktop 환경에서만 활성화 (브라우저에서는 숨김 또는 비활성) |
| GitHub Releases CI | `tauri-action` GitHub Actions 워크플로우. 3 플랫폼 빌드 매트릭스: macOS(arm64/x64 universal), Windows(x64 `.msi`+`.nsis`), Linux(x64 `.AppImage`+`.deb`). 태그 푸시 시 자동 빌드 → GitHub Releases에 아티팩트 업로드. 코드 사이닝: macOS(Developer ID), Windows(선택적) |
| Tauri Updater | Tauri built-in updater 플러그인. GitHub Releases를 업데이트 소스로 사용. 앱 시작 시 최신 버전 확인 → 사용자 확인 후 다운로드 + 자동 패치. `latest.json` 엔드포인트 자동 생성 |

### Desktop 환경 감지

Admin Web UI가 Desktop WebView에서 실행되는지 판별하여 조건부 기능을 활성화한다:

```typescript
// packages/admin/src/desktop/utils/platform.ts
let _isDesktop: boolean | undefined;

export function isDesktop(): boolean {
  if (_isDesktop === undefined) {
    _isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
  return _isDesktop;
}
```

> **Tauri 2.x 감지:** `window.__TAURI_INTERNALS__`는 Tauri 2.x에서 WebView에 주입되는 전역 객체. Tauri 1.x의 `window.__TAURI__`와 다름. 모듈 레벨 캐싱으로 반복 호출 시 성능 보장, SSR 안전.

| 기능 | 브라우저 (`/admin`) | Desktop (Tauri WebView) |
|------|:---:|:---:|
| 6페이지 (대시보드~설정) | O | O |
| Setup Wizard | X | O (최초 실행 시) |
| WalletConnect Owner 연결 | X | O |
| Sidecar 상태 표시 | X | O (대시보드에 추가) |

### 파일/모듈 구조

```
apps/desktop/
  src-tauri/
    src/
      main.rs                            # Tauri 메인 + 시스템 트레이 + WebView URL 설정
      commands/
        mod.rs                           # IPC 커맨드 (sidecar 상태, 트레이 제어, quit)
      sidecar/
        manager.rs                       # Sidecar Manager (SEA 바이너리 관리)
    Cargo.toml
    tauri.conf.json                      # sidecar 설정, window URL, 권한

packages/admin/src/
  desktop/                               # Desktop 전용 모듈 경계 (isDesktop() 가드 내에서만 dynamic import)
    pages/
      setup-wizard.tsx                   # Setup Wizard 5단계 (신규, Desktop 전용)
    components/
      wallet-connect.tsx                 # WalletConnect QR 페어링 (신규, Desktop 전용)
      desktop-status.tsx                 # Sidecar 상태 카드 (신규, Desktop 전용)
    hooks/
      useDaemon.ts                       # Sidecar 상태 조회/제어 (IPC 브릿지 래퍼)
      useWalletConnect.ts                # WalletConnect 연결 상태 관리
      useOwnerApi.ts                     # Owner API 서명 요청
    lib/
      wallet-connect.ts                  # @reown/appkit 초기화
      notifications.ts                   # OS 네이티브 알림 변경 감지
      updater.ts                         # Tauri 자동 업데이트
    utils/
      platform.ts                        # isDesktop() 환경 감지 (__TAURI_INTERNALS__)
      tauri-bridge.ts                    # invoke() 래퍼 (6개 IPC 명령)

.github/workflows/
  desktop-release.yml                    # tauri-action 3 플랫폼 빌드 + GitHub Releases 업로드
```

> **모듈 경계 규칙:** `desktop/` 디렉토리의 import는 `isDesktop()` 가드 내에서만 dynamic import로 사용한다. ESLint `no-restricted-imports` 규칙으로 static import를 차단하여 브라우저 번들에 Desktop 전용 코드가 포함되지 않도록 보장한다 (4-layer tree-shaking 전략, 설계 문서 39 섹션 6.4).

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Desktop UI 구현 | 기존 Admin Web UI 재사용 (WebView 로드) | React 18로 재구현하면 동일 기능을 두 번 만들고 유지보수 비용 2배. Admin Web UI를 그대로 로드하면 기능 자동 동기화 |
| 2 | Desktop 전용 기능 분기 | `window.__TAURI_INTERNALS__` 감지 → 조건부 렌더링 | Tauri 2.x WebView에서만 `__TAURI_INTERNALS__` 전역 객체가 존재. 모듈 레벨 캐싱으로 성능 보장, SSR 안전 |
| 3 | WalletConnect 라이브러리 | @reown/appkit | WalletConnect v2 공식 SDK. Tauri WebView 환경에서 QR 코드 페어링 + 서명 요청 지원. 호환성 검증은 스파이크에서 수행 |
| 4 | Sidecar Node.js SEA 빌드 | esbuild single-file → node --experimental-sea-config | esbuild로 단일 .cjs 파일 번들 → Node.js SEA config로 바이너리 생성 → postject로 Tauri sidecar에 주입. v0.7 prebuildify 전략과 연동(native addon은 사전 빌드 바이너리 포함) |
| 5 | 데몬 포트 관리 | TCP bind(0) + stdout/tempfile 프로토콜 (설계 문서 39 섹션 4.2.1) | --port=0으로 OS가 빈 포트 할당. stdout `WAIAAS_PORT={port}` 파싱 (primary), `{data_dir}/daemon.port` 파일 (fallback). 다중 인스턴스/포트 충돌 방지 |
| 10 | 번들 최적화 | 4-layer tree-shaking (설계 문서 39 섹션 6.4, 13.3) | dynamic import + optional peer deps + build constant + CI verification. 브라우저 번들에 Desktop 전용 코드 미포함 보장 |
| 11 | 개발 워크플로우 | HMR-first dev workflow (Vite dev server devUrl) | tauri.conf.json devUrl로 Vite dev server 지정. 프로덕션에서만 Daemon URL 사용. 코드 변경 즉시 반영 |
| 6 | i18n | Admin Web UI의 기존 i18n 구조 확장 | Desktop 별도 i18n 불필요. Admin Web UI에 i18n을 추가하면 Desktop에도 자동 적용. 시스템 트레이 라벨만 Rust 측에서 별도 처리 |
| 7 | CI 빌드 전략 | `tauri-action` GitHub Actions | Tauri 공식 CI action. 3 OS 매트릭스(macOS/Windows/Linux) 빌드 + GitHub Releases 자동 업로드. 태그 기반 트리거(`desktop-v*`). 기존 release-please와 독립 운영 |
| 8 | 업데이트 메커니즘 | Tauri built-in updater | Tauri `@tauri-apps/plugin-updater`. GitHub Releases의 `latest.json`을 업데이트 소스로 사용. 별도 서버 불필요. 서명 검증 내장 |
| 9 | macOS 코드 사이닝 | Apple Developer ID | Gatekeeper 통과 필수. 미사이닝 시 "개발자를 확인할 수 없습니다" 경고. CI에서 `APPLE_CERTIFICATE` + `APPLE_ID` + `APPLE_PASSWORD` 환경변수로 notarize |

---

## E2E 검증 시나리오

**자동화 비율: 75%+ — `[HUMAN]` 5건, `[L1]` 15건**

### Sidecar Manager

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Sidecar 시작 → 데몬 health check 성공 | Desktop 앱 실행 → Sidecar Manager가 SEA 바이너리 시작 → GET /health 200 assert | [L1] |
| 2 | Sidecar crash detection → 자동 재시작 | 데몬 프로세스 강제 종료 → Sidecar Manager crash 감지 → 자동 재시작 → health check 성공 assert | [L1] |
| 3 | Sidecar graceful shutdown(5초 타임아웃) | Desktop 앱 종료 → SIGTERM 전송 → 5초 내 정상 종료 assert. 미종료 시 SIGKILL assert | [L1] |

### Admin Web UI 로드

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | WebView에서 Admin Web UI 로드 | Desktop 앱 실행 → WebView에 대시보드 렌더링 → 기존 6페이지 네비게이션 정상 동작 assert | [L1] |
| 5 | Desktop 환경 감지 | WebView에서 `isDesktop()` === true assert (`__TAURI_INTERNALS__` 기반). 브라우저에서 `isDesktop()` === false assert | [L1] |
| 6 | Desktop 전용 기능 조건부 렌더링 | Desktop: Setup Wizard + Sidecar 상태 카드 표시 assert. 브라우저: 해당 요소 미렌더링 assert | [L1] |

### Setup Wizard

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | Wizard 5단계 전체 흐름 완료 | 앱 최초 실행 → 패스워드 설정 → 체인 선택(Solana) → 월렛 생성 → Owner 스킵 → 완료 → 대시보드 이동 assert | [L1] |
| 8 | Wizard Owner 연결(WalletConnect) | 4단계에서 WalletConnect QR 표시 → 지갑 연결 → SIWS 서명 → Owner 등록 성공 assert | [L1] |
| 9 | 초기 설정 완료 후 Wizard 미표시 | 설정 완료 상태에서 앱 재실행 → Wizard 건너뛰고 대시보드 직행 assert | [L1] |

### IPC 브릿지

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | Sidecar 상태 IPC 조회 | Admin Web UI에서 `invoke('get_sidecar_status')` → { running: true, pid, uptime } 반환 assert | [L1] |
| 11 | 앱 종료 IPC | `invoke('quit_app')` → Sidecar 종료 + 앱 종료 assert | [L1] |

### GitHub Releases CI + 자동 업데이트

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | 태그 푸시 → 3 플랫폼 빌드 성공 | `desktop-v0.1.0` 태그 푸시 → GitHub Actions 매트릭스 3 OS 모두 green assert | [L1] |
| 13 | GitHub Releases 아티팩트 업로드 | 릴리스 페이지에 `.dmg`, `.msi`, `.AppImage`, `.deb`, `latest.json` 존재 assert | [L1] |
| 14 | 자동 업데이트 감지 | 구버전 앱 실행 → 업데이트 알림 표시 → 사용자 확인 → 다운로드 + 패치 완료 assert | [L1] |
| 15 | 업데이트 서명 검증 | 변조된 바이너리로 업데이트 시도 → 서명 불일치 → 업데이트 거부 assert | [L1] |

### Desktop UI/UX (HUMAN)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 16 | Admin Web UI 레이아웃 정합성 | Tauri WebView에서 기존 Admin Web UI 6페이지가 깨짐 없이 렌더링되는지, 스크롤/모달이 정상 동작하는지 확인 | [HUMAN] |
| 17 | Setup Wizard 사용자 경험 | 5단계 흐름이 직관적인지, 각 단계 입력이 명확한지, "나중에" 스킵이 눈에 띄는지, 진행 표시줄 적절성 확인 | [HUMAN] |
| 18 | Kill Switch 확인 다이얼로그 경고성 | 긴급 정지 버튼 클릭 시 충분히 경고하는지, 실수 방지가 되는지 확인 | [HUMAN] |
| 19 | 시스템 트레이 아이콘 가시성 | 3색 아이콘(녹/주/빨)이 macOS/Windows/Linux 시스템 트레이에서 명확히 구분되는지 확인 | [HUMAN] |
| 20 | WalletConnect QR 코드 흐름 | QR 코드 표시 → 모바일 지갑 스캔 → 연결 확인 → 서명 요청 → 완료 흐름이 자연스러운지 확인 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.6 (운영 인프라) | Kill Switch, AutoStop가 v1.6에서 구현. Admin Web UI에서 이들 기능을 표시/조작하므로 v1.6 완료 필요 |
| v1.5 (DeFi + 가격 오라클) | 정책 관리 화면에서 USD 기준 한도 표시 |
| v1.3.2 (Admin Web UI) | Desktop이 재사용하는 Admin Web UI가 v1.3.2에서 구현됨 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Node.js SEA 크로스 플랫폼 빌드 | macOS(arm64/x64), Windows(x64), Linux(x64) 3개 타겟. native addon(sodium-native, better-sqlite3) 플랫폼별 바이너리 필요 | v0.7 prebuildify 전략 활용. CI에서 3 플랫폼 빌드 매트릭스. 로컬 개발은 현재 플랫폼만 빌드 |
| 2 | Tauri WebView에서 @reown/appkit 호환성 | WalletConnect가 Tauri WebView 환경에서 정상 동작하지 않을 수 있음 | 스파이크: Tauri WebView에서 @reown/appkit QR 페어링 테스트. 실패 시 대안: WebSocket 직접 연결 또는 딥링크 방식 |
| 3 | Tauri WebView CSS 렌더링 차이 | Admin Web UI가 브라우저에서는 정상이나 Tauri WebView(각 OS별 WebKit/WebView2/WebKitGTK)에서 레이아웃이 다를 수 있음 | E2E [HUMAN] #12에서 3 OS 검증. CSP 헤더와 WebView 보안 설정 호환성 확인 |
| 4 | Setup Wizard 초기 설정 복잡도 | 5단계가 너무 많으면 사용자 이탈 가능 | 각 단계 최소 입력(패스워드, 체인 선택, 월렛 이름). Owner 연결은 "나중에" 스킵 가능. 진행 표시줄로 현재 단계 시각화 |
| 5 | Desktop 전용 코드가 Admin Web UI 번들 크기 증가 | WalletConnect 라이브러리가 브라우저 배포에도 포함됨 | dynamic import + `isDesktop()` 가드로 Desktop 전용 모듈을 lazy load. 브라우저에서는 로드하지 않음 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 4-5개 (Sidecar + Tauri Shell 1 / Setup Wizard + WalletConnect 1 / Admin Web UI 확장 + 통합 1 / GitHub Releases CI + 자동 업데이트 1) |
| 신규 파일 | 15-20개 (Rust 5-7개, packages/admin/src/desktop/ 확장 8-10개, CI 워크플로우 1-2개, Tauri 설정 1개) |
| 테스트 | 20-30개 |

> **이연 사유**: Desktop App은 배포 채널이지 핵심 기능이 아님. 모든 코어 기능은 CLI + REST API + Admin Web UI + MCP로 동작. m20은 npm/Docker/CLI 중심으로 릴리스하고, Desktop은 이후 진행.

---

*최종 업데이트: 2026-03-31. v33.0 아키텍처 재설계 반영 -- IPC 6명령, __TAURI_INTERNALS__ 감지, TCP bind(0) 동적 포트, 4-layer tree-shaking, packages/admin/src/desktop/ 경로 통일. 기술 결정 #10-11 추가.*
*이전: 2026-03-28. GitHub Releases CI + Tauri 자동 업데이트 범위 추가. E2E #12-15 추가. 기술 결정 #7-9 추가.*
*이전: 2026-02-16. m20 이후로 이연 — Desktop은 배포 채널이므로 m20 릴리스 후 진행. Admin Web UI 재사용 아키텍처로 변경.*
