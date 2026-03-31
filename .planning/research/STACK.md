# Stack Research

**Domain:** Tauri Desktop App (Admin Web UI reuse via WebView)
**Researched:** 2026-03-31
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Tauri | 2.10.x (Rust crate) | Desktop shell (Rust backend + WebView) | 2.x stable since Oct 2024, v2.10.3 latest. Sidecar, system tray, auto-updater 모두 built-in. Electron 대비 ~10x 작은 바이너리. Rust backend가 Sidecar Manager/시스템 트레이에 적합. capabilities 기반 최소 권한 모델이 WAIaaS 보안 원칙과 일치 |
| @tauri-apps/api | 2.10.x | WebView-side IPC bridge (`invoke()`, events) | Tauri core와 버전 동기화 필수. `window.__TAURI_INTERNALS__.invoke()` 래핑. Desktop 환경 감지(`'__TAURI__' in window`)의 근거. Admin Web UI에서 dynamic import로 사용 |
| @tauri-apps/plugin-shell | 2.x | Sidecar 프로세스 spawn/kill | `Command.sidecar('binaries/waiaas-daemon')` API 제공. 프로세스 stdout/stderr 스트리밍, kill 지원. 데몬 라이프사이클 관리의 핵심 |
| @tauri-apps/plugin-updater | 2.10.x | 자동 업데이트 (GitHub Releases 기반) | Tauri 공식 updater. GitHub Releases의 `latest.json` 엔드포인트 자동 생성. 코드 사이닝 검증 내장. 기존 release-please 워크플로우와 자연스럽게 통합 |
| @reown/appkit | 1.8.x | WalletConnect v2 QR 코드 페어링 | 공식 WalletConnect SDK (Reown 리브랜딩). **vanilla JavaScript 모드** 사용 -- Preact에 직접 호환. React 어댑터 불필요. Dynamic import로 Desktop 전용 로드하여 브라우저 번들에 미포함 |
| Node.js SEA | 22.x built-in | 데몬 바이너리 변환 (Single Executable Application) | Node.js 22 내장 기능. `sea-config.json`으로 assets(native addon .node 파일) 번들. 별도 패키지 불필요. pkg(Vercel) deprecated 이후 공식 대안 |

### Supporting Libraries (Tauri Plugins)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tauri-apps/plugin-notification | 2.x | OS 네이티브 알림 전달 | 데몬 이벤트(거래 승인 요청, Kill Switch 등)를 OS 알림센터로 전달 |
| @tauri-apps/plugin-process | 2.x | 앱 종료 제어 (`exit()`, `relaunch()`) | 시스템 트레이 "Quit" 메뉴, 자동 업데이트 후 재시작 |
| @tauri-apps/plugin-dialog | 2.x | 네이티브 다이얼로그 (파일 선택, 확인) | Setup Wizard에서 config.toml 위치 선택, 백업 파일 내보내기 등 |
| @tauri-apps/plugin-autostart | 2.x | OS 로그인 시 자동 시작 | 선택적 기능. Setup Wizard 완료 후 "시스템 시작 시 자동 실행" 옵션 |
| @tauri-apps/plugin-log | 2.x | 구조화된 로깅 (파일 + 콘솔) | Rust backend 로그를 파일로 기록. 디버깅용 |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @tauri-apps/cli | 2.x | `tauri dev`, `tauri build`, `tauri init` CLI | `pnpm add -D @tauri-apps/cli`. Rust 빌드 자동화 + dev server 연동 |
| tauri-apps/tauri-action@v1 | GitHub Actions CI/CD | 3-platform 빌드 매트릭스. `.dmg`, `.msi`, `.AppImage` 자동 생성 + GitHub Releases 업로드 |
| Rust toolchain (stable) | Tauri Rust backend 빌드 | `rustup` 설치 필요. CI에서 `dtolnay/rust-toolchain@stable` action 사용 |

## Installation

```bash
# Tauri CLI (dev dependency, apps/desktop level)
pnpm add -D @tauri-apps/cli

# Tauri JS API + plugins (apps/desktop 또는 packages/admin level)
pnpm add @tauri-apps/api @tauri-apps/plugin-shell @tauri-apps/plugin-updater \
  @tauri-apps/plugin-notification @tauri-apps/plugin-process @tauri-apps/plugin-dialog

# Optional plugins
pnpm add @tauri-apps/plugin-autostart @tauri-apps/plugin-log

# WalletConnect (packages/admin level -- Desktop 전용 dynamic import)
pnpm add @reown/appkit

# Rust plugins (src-tauri/Cargo.toml에 추가)
# tauri = { version = "2", features = ["tray-icon", "image-png"] }
# tauri-plugin-shell = "2"
# tauri-plugin-updater = "2"
# tauri-plugin-notification = "2"
# tauri-plugin-process = "2"
# tauri-plugin-dialog = "2"
# tauri-plugin-autostart = "2"  (optional)
# tauri-plugin-log = "2"  (optional)
```

## Architecture Decisions

### 1. WebView가 localhost URL을 로드하는 구조

Desktop App의 WebView는 `http://localhost:{dynamic_port}/admin`을 로드한다. Tauri 자체 asset 서빙(custom protocol)이 아닌 **Sidecar 데몬이 이미 서빙하는 Admin Web UI**를 직접 로드한다.

**구현 방식 (Rust 개념):**
```rust
// src-tauri/src/main.rs
let port = find_available_port();  // 동적 포트 할당
start_sidecar(port);               // SEA 바이너리 spawn
wait_for_health(port);             // GET /health 폴링

let url = format!("http://localhost:{}/admin", port);

// localhost URL에 IPC 권한 부여 (핵심!)
let cap = CapabilityBuilder::new("localhost-ipc")
    .remote(url.clone())
    .permission("shell:default")
    .permission("updater:default")
    .permission("notification:default")
    .permission("process:default")
    .build();
app.add_capability(cap);

WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
    .title("WAIaaS Desktop")
    .build()?;
```

**핵심 포인트:** `CapabilityBuilder.remote(url)`로 외부 URL에 IPC 접근 권한을 부여해야 `window.__TAURI__`가 주입된다. 이것 없이 External URL을 로드하면 IPC invoke가 동작하지 않는다.

**CORS 설정 (데몬 측):** 기존 Hono CORS 허용 목록에 Tauri WebView Origin 3종 추가:
```typescript
cors({
  origin: [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'tauri://localhost',         // macOS (WKWebView), Linux (WebKitGTK)
    'http://tauri.localhost',    // Windows (WebView2, Tauri 2.x 기본)
    'https://tauri.localhost',   // Windows (WebView2, useHttpsScheme: true)
  ],
})
```

### 2. IPC Bridge: `window.__TAURI__` 감지 기반 조건부 연동

Admin Web UI가 브라우저/Desktop 양쪽에서 동작하도록 `isDesktop()` 유틸리티로 분기:

```typescript
// packages/admin/src/utils/platform.ts
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI__' in window;
```

Desktop 전용 IPC 호출은 `@tauri-apps/api`를 **dynamic import**:

```typescript
// packages/admin/src/bridge/tauri-ipc.ts
export async function getSidecarStatus(): Promise<SidecarStatus> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('get_sidecar_status');
}

export async function restartSidecar(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('restart_sidecar');
}

export async function quitApp(): Promise<void> {
  const { exit } = await import('@tauri-apps/plugin-process');
  return exit(0);
}
```

### 3. @reown/appkit은 vanilla JavaScript 모드 사용

@reown/appkit은 React/Vue/JavaScript 등 8개 프레임워크를 지원한다. Preact는 공식 지원 목록에 없으나, **vanilla JavaScript 모드**(core API)가 프레임워크 무관하게 동작하므로 Preact에서 직접 사용 가능하다.

React 어댑터(`@reown/appkit-adapter-react`)는 사용하지 않는다 -- Preact와 React의 JSX 런타임 차이로 충돌 위험.

```typescript
// packages/admin/src/desktop/walletconnect.ts (Desktop 전용, dynamic import)
export async function initWalletConnect(projectId: string) {
  const { createAppKit } = await import('@reown/appkit');
  const appkit = createAppKit({
    projectId,
    // vanilla JS mode -- no React/Vue adapter needed
    // networks, metadata 등 추가 설정
  });
  return appkit;
}
```

### 4. Sidecar 바이너리: Node.js SEA + native addon 번들

Node.js 22의 SEA 기능으로 데몬을 단일 바이너리로 변환. Native addon(sodium-native, better-sqlite3, argon2)은 SEA `assets`로 번들, 런타임에 `process.dlopen()`으로 로딩.

**타겟 바이너리 (5종):**
```
src-tauri/binaries/
  waiaas-daemon-aarch64-apple-darwin       (macOS Apple Silicon)
  waiaas-daemon-x86_64-apple-darwin        (macOS Intel)
  waiaas-daemon-x86_64-pc-windows-msvc.exe (Windows x64)
  waiaas-daemon-x86_64-unknown-linux-gnu   (Linux x64)
  waiaas-daemon-aarch64-unknown-linux-gnu  (Linux ARM64)
```

ARM64 Windows는 제외 (sodium-native/argon2 prebuild 미제공, Tauri ARM64 Windows 실험적).

**SEA config:**
```json
{
  "main": "dist/daemon-bundle.js",
  "output": "dist/waiaas-daemon",
  "assets": {
    "sodium-native.node": "node_modules/sodium-native/prebuilds/{platform}-{arch}/sodium-native.node",
    "better_sqlite3.node": "node_modules/better-sqlite3/prebuilds/{platform}-{arch}/better_sqlite3.node",
    "argon2.node": "node_modules/argon2/lib/binding/napi-v3-{platform}-{arch}/argon2.node"
  }
}
```

### 5. Dynamic Import 경계: Desktop 전용 모듈 분리

브라우저 배포 번들에 Desktop 전용 코드가 포함되지 않도록 **dynamic import + `isDesktop()` 가드** 조합:

| 모듈 | 대략적 크기 | 로드 조건 |
|------|-----------|----------|
| `@tauri-apps/api` | ~15KB | `isDesktop()` true일 때 dynamic import |
| `@tauri-apps/plugin-shell` | ~5KB | Sidecar 상태 조회 시 |
| `@tauri-apps/plugin-updater` | ~5KB | 업데이트 확인 시 |
| `@reown/appkit` | ~200KB+ | WalletConnect 페이지 진입 시 (Desktop only) |
| Setup Wizard 컴포넌트 | ~10KB | Desktop 최초 실행 시 |

Vite 코드 스플리팅이 dynamic import 경계에서 자동으로 chunk를 분리하므로, 브라우저 빌드에서 이 모듈들은 별도 chunk로 생성되고 `isDesktop()` false 경로에서는 로드되지 않는다.

### 6. Tauri Capabilities 설정

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "WAIaaS Desktop default capability",
  "windows": ["main"],
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "binaries/waiaas-daemon", "sidecar": true, "args": true }
      ]
    },
    "shell:allow-spawn",
    "shell:allow-kill",
    "shell:allow-stdin-write",
    "updater:default",
    "notification:default",
    "process:default",
    "dialog:default"
  ]
}
```

### 7. System Tray (Rust 측, 플러그인 아닌 core 기능)

시스템 트레이는 별도 플러그인이 아닌 Tauri core의 `tray-icon` feature로 구현:

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
```

3색 상태 아이콘(녹=정상, 주황=경고, 빨강=정지) + 컨텍스트 메뉴(Open Dashboard / Pause / Resume / Quit). JavaScript 측에서도 `@tauri-apps/api`의 `tray` 네임스페이스로 제어 가능하나, 주로 Rust 측에서 관리.

### 8. 자동 업데이트 (tauri-plugin-updater + GitHub Releases)

```typescript
// packages/admin/src/desktop/auto-updater.ts
export async function checkForUpdates() {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (update) {
    // update.version, update.body (release notes) 표시
    await update.downloadAndInstall();
    // 설치 후 앱 재시작
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }
}
```

Rust 측 설정:
```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/minhoyoo-iotrust/WAIaaS/releases/latest/download/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Tauri 2.x | Electron | Electron은 Chromium 번들링으로 200MB+. WAIaaS는 Node.js를 Sidecar로 사용하므로 Tauri의 OS WebView + Rust shell이 바이너리 크기(~20MB)와 보안(capabilities) 모두 우월 |
| Node.js SEA | pkg (Vercel) | pkg는 2024년 deprecated. Node.js 22 SEA가 공식 대안. 사용하지 말 것 |
| @reown/appkit vanilla JS | @reown/appkit-adapter-react | React 어댑터는 Preact와 JSX 런타임 충돌 위험. Preact 프로젝트에서는 vanilla JS 모드만 사용 |
| WebviewUrl::External (localhost) | tauri-plugin-localhost | tauri-plugin-localhost는 Tauri 자체 asset을 localhost로 서빙하는 플러그인. 데몬이 이미 Admin UI를 서빙하므로 불필요. 포트 충돌 위험만 추가 |
| GitHub Releases updater | CrabNebula Cloud | CrabNebula는 유료 배포 서비스. GitHub Releases가 무료이고 release-please 워크플로우와 자연스럽게 통합 |
| Dynamic import 분리 | Vite define + tree-shaking | `import.meta.env.TAURI` 같은 빌드 타임 플래그도 가능하나, dynamic import가 더 명시적이고 런타임 유연성이 높음 |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React 18 for Desktop UI | Admin Web UI(Preact 10.x) 19페이지와 이중 구현. 기능 비동기화 지속 발생 | 기존 Admin Web UI를 WebView에서 로드 |
| TailwindCSS 4 | Admin Web UI는 vanilla CSS. 새 CSS 프레임워크 도입은 기존 스타일과 충돌 | 기존 Admin CSS 재사용 |
| @reown/appkit-adapter-react | Preact compat 모드에서도 React JSX 런타임 충돌 가능. 번들 크기 증가 | `@reown/appkit` vanilla JS 모드 |
| pkg (Vercel) | 2024년 deprecated. 유지보수 종료 | Node.js 22 SEA (built-in) |
| tauri-plugin-localhost | 데몬이 Admin UI를 서빙하므로 Tauri 측 localhost 서빙 불필요 | `WebviewUrl::External` 직접 사용 |
| Tauri IPC for API calls | Rust에서 HTTP 프록시 구현 필요. @waiaas/sdk 재사용 불가 | HTTP localhost fetch (기존 `api/client.ts` 재사용) |
| preact-compat + React libs | React compat layer는 불안정. 번들 크기 증가. WalletConnect에서 예측 불가 이슈 | @reown/appkit vanilla JS 모드로 React 의존 없이 구현 |

## Stack Patterns by Variant

**브라우저에서 Admin Web UI 접속 (`http://localhost:3100/admin`):**
- `isDesktop()` = false
- `@tauri-apps/*` dynamic import 미실행
- WalletConnect, Setup Wizard, Sidecar 상태 UI 숨김
- 기존과 동일한 19페이지 Admin UI. 번들 크기 증가 없음

**Tauri Desktop에서 Admin Web UI 접속:**
- `isDesktop()` = true
- `@tauri-apps/api` dynamic import로 IPC bridge 활성화
- Setup Wizard (최초 실행 시), WalletConnect, Sidecar 상태 UI 표시
- 시스템 트레이 3색 상태 아이콘 + 컨텍스트 메뉴

**개발 모드 (`tauri dev`):**
- 데몬을 수동으로 시작 (`pnpm dev`), Tauri가 해당 URL의 Admin UI를 WebView에 로드
- 또는 Vite dev server(`http://localhost:5173`)를 `devUrl`로 설정하고 HMR 사용
- Rust backend hot reload (Tauri CLI가 자동 재빌드)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `tauri@2.10.x` (Rust) | `@tauri-apps/api@2.10.x` | **메이저.마이너 버전 반드시 동기화**. `@tauri-apps/cli@2.10.x`도 동일 |
| `@tauri-apps/plugin-*@2.x` | `tauri@2.10.x` | 공식 플러그인은 Tauri 2.x 호환. 최신 마이너 권장 |
| `@reown/appkit@1.8.x` | Preact 10.x (vanilla JS) | React 어댑터 사용 금지. vanilla JS 모드로 독립 동작 |
| `vite@6.x` | `@tauri-apps/cli@2.10.x` | Tauri CLI가 Vite dev server 자동 감지. `tauri.conf.json`의 `devUrl` 설정 |
| Node.js SEA | Node.js 22.x | SEA assets 기능은 Node.js 21+에서 도입, 22.x에서 안정화 |
| Preact 10.x | `@tauri-apps/api@2.10.x` | `@tauri-apps/api`는 프레임워크 무관 (순수 JS). Preact에서 직접 사용 가능 |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Tauri 2.x core + plugins | HIGH | 2024-10 stable, v2.10.3. 공식 문서 충분. sidecar, tray, updater 모두 안정적 |
| WebView External URL + IPC | HIGH | `WebviewUrl::External` + `CapabilityBuilder.remote()` 공식 문서에 명시. localhost 패턴 다수 사례 |
| Sidecar + Node.js SEA | MEDIUM | Tauri sidecar는 안정적이나 SEA + native addon(sodium-native libsodium 동적 링크) 조합은 구현 시 검증 필요. Fallback: 동반 .node 파일 디렉토리 |
| @reown/appkit vanilla JS + Preact | MEDIUM | vanilla JS 모드는 공식 지원이나 Preact 환경 통합 테스트 사례 부족. QR 코드 렌더링/모달 동작 검증 필요 |
| tauri-action CI/CD | HIGH | 공식 action, v1. 3-platform 빌드 매트릭스 다수 사례 |
| Auto-updater (GitHub Releases) | HIGH | tauri-plugin-updater 공식 지원. GitHub Releases 기반 안정적 |

## Sources

- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/) -- Tauri 2.0 안정 릴리스 공지
- [Tauri Configuration Reference](https://v2.tauri.app/reference/config/) -- tauri.conf.json 스키마
- [Tauri Sidecar Documentation](https://v2.tauri.app/develop/sidecar/) -- externalBin 설정, 타겟 트리플 네이밍
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/) -- Node.js SEA 바이너리 sidecar 패턴
- [Tauri System Tray](https://v2.tauri.app/learn/system-tray/) -- tray-icon 기능, 이벤트 핸들링
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/) -- 자동 업데이트 설정
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/) -- 권한 시스템, remote URL 설정
- [Tauri Localhost Plugin](https://v2.tauri.app/plugin/localhost/) -- 사용하지 않으나 비교 참조
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/) -- sidecar spawn/kill API
- [Tauri GitHub Pipelines](https://v2.tauri.app/distribute/pipelines/github/) -- CI/CD 빌드 매트릭스
- [@tauri-apps/api npm](https://www.npmjs.com/package/@tauri-apps/api) -- v2.10.1 확인
- [@tauri-apps/plugin-updater npm](https://www.npmjs.com/package/@tauri-apps/plugin-updater) -- v2.10.0 확인
- [@reown/appkit npm](https://www.npmjs.com/package/@reown/appkit) -- v1.8.19 확인
- [Reown AppKit Overview](https://docs.reown.com/appkit/overview) -- 8 프레임워크(JS 포함) 지원 확인
- [tauri-action GitHub](https://github.com/tauri-apps/tauri-action) -- CI/CD action v1

---
*Stack research for: Tauri Desktop App Architecture Redesign (m33-00)*
*Researched: 2026-03-31*
