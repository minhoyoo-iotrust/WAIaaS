# 485 — Desktop 앱 데몬 사이드카 V8 JIT 엔타이틀먼트 누락으로 즉시 크래시

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** OPEN
- **발견일:** 2026-04-08
- **발견 경위:** 정식 배포된 Desktop 앱 v2.14.0 (DMG 설치본) 첫 실행 시 `PortDiscoveryFailed: no port from stdout or file` 에러 화면이 뜨고 아무 기능도 사용 불가

## 증상

- `/Applications/WAIaaS Desktop.app` 실행 직후 스플래시 화면이 `PortDiscoveryFailed: no port from stdout or file` 에러로 전환됨
- Retry 버튼을 눌러도 동일 에러 반복
- `~/Library/Application Support/dev.waiaas.desktop/` 디렉터리가 비어 있음 (`daemon.port` 파일 미생성)
- macOS 크래시 리포터에 `waiaas-daemon` 프로세스가 연속으로 기록됨 (`~/Library/Logs/DiagnosticReports/waiaas-daemon-*.ips`)

## 원인

**Node.js SEA로 빌드된 `waiaas-daemon` 사이드카 바이너리가 macOS Hardened Runtime 하에서 JIT 엔타이틀먼트 없이 서명되어, V8 초기화 중 즉시 트랩**됩니다.

### 크래시 스택 (`waiaas-daemon-2026-04-08-230630.ips`)

```
exception: EXC_BREAKPOINT (SIGTRAP)
procPath : /Applications/WAIaaS Desktop.app/Contents/MacOS/waiaas-daemon
parentProc : waiaas-desktop
Thread 0 crashed:
  pthread_jit_write_protect_np    (libsystem_pthread.dylib)
  v8::internal::ThreadIsolation::Initialize(v8::ThreadIsolatedAllocator*)
  v8::internal::V8::Initialize()
  v8::V8::Initialize(int)
  node::InitializeOncePerProcessInternal(...)
  node::Start(int, char**)
  start
```

### 서명 상태

```
$ codesign -dvv /Applications/WAIaaS\ Desktop.app/Contents/MacOS/waiaas-daemon
flags=0x10000(runtime)           # Hardened Runtime 활성
(entitlements 없음)

$ codesign -d --entitlements - /Applications/WAIaaS\ Desktop.app/Contents/MacOS/waiaas-daemon
# 출력 없음 — entitlements 완전 부재
```

macOS Apple Silicon에서 V8는 JIT 코드 페이지의 쓰기 보호를 토글하기 위해 `pthread_jit_write_protect_np()`를 호출합니다. Hardened Runtime이 켜진 상태에서 **`com.apple.security.cs.allow-jit` 엔타이틀먼트가 없으면 이 호출이 즉시 SIGTRAP으로 종료**됩니다.

### 전체 실패 흐름

1. `SidecarManager::start()` (`apps/desktop/src-tauri/src/sidecar.rs:87`)가 `waiaas-daemon` 사이드카 스폰
2. 데몬 프로세스가 V8 초기화 단계에서 `pthread_jit_write_protect_np` 호출 → SIGTRAP으로 즉사
3. `daemon-startup.ts:1480`의 `console.log('WAIAAS_PORT=${actualPort}')`에 도달하지 못함
4. 폴백 파일 `{data_dir}/daemon.port`도 생성되지 못함 (Step 5까지 진행 안 됨)
5. SidecarManager의 10초 타임아웃 경과 후 스톡 fallback도 실패 → `PortDiscoveryFailed: no port from stdout or file` 반환 (`sidecar.rs:241`)

Retry를 눌러도 동일 크래시가 반복되므로 복구 불가능한 상태입니다.

## 수정 방향

### 1. 엔타이틀먼트 파일 추가

`apps/desktop/src-tauri/entitlements.plist` 신규 작성:

| Key | Value | 이유 |
|-----|-------|------|
| `com.apple.security.cs.allow-jit` | `true` | V8 JIT write-protect toggle 허용 (필수) |
| `com.apple.security.cs.allow-unsigned-executable-memory` | `true` | V8 내부 할당 보수적 폴백 |
| `com.apple.security.cs.disable-library-validation` | `true` | `sodium-native` 등 네이티브 애드온 dlopen 허용 |

### 2. Tauri 설정 업데이트

`apps/desktop/src-tauri/tauri.conf.json`의 `bundle.macOS`에 `entitlements` 경로 추가:

```json
"macOS": {
  "entitlements": "entitlements.plist",
  ...
}
```

### 3. 사이드카 재서명 보강

Tauri 2 번들러가 `externalBin`에 entitlements를 자동 전파하는지 버전별로 편차가 있으므로, `desktop-release.yml`에서 `tauri-action` 직후 · 노터라이즈 직전에 사이드카 재서명 단계를 추가하여 방어합니다:

```bash
codesign --force --sign "$APPLE_SIGNING_IDENTITY" \
  --options runtime \
  --entitlements apps/desktop/src-tauri/entitlements.plist \
  --timestamp \
  "$APP_PATH/Contents/MacOS/waiaas-daemon"
```

이후 메인 앱 재서명은 불필요 — 내부 바이너리 서명만 교체해도 번들 무결성이 유지됩니다 (단, 노터라이즈 제출 전이어야 함).

## 테스트 항목

- [ ] `codesign -d --entitlements - waiaas-daemon`이 JIT/unsigned-memory/library-validation 키를 모두 출력
- [ ] 로컬 빌드(`pnpm tauri build`)로 생성된 `.app`에서 데몬 스폰 직후 V8 초기화 통과 (크래시 없음)
- [ ] 데몬이 `WAIAAS_PORT=...`를 stdout에 출력하고 `{data_dir}/daemon.port` 파일 생성
- [ ] WebView가 `http://127.0.0.1:{port}/admin`을 로드하여 Setup Wizard가 표시됨
- [ ] Intel(x86_64) 빌드에서도 동일 확인 (CI matrix)
- [ ] 재서명 후 `spctl --assess -vv`가 번들 accept

## 검증 방법 (배포 없이)

1. 로컬에서 `cd apps/desktop && pnpm tauri build` 실행 → 로컬 Developer ID로 서명된 `.app` 생성
2. `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/WAIaaS Desktop.app` 직접 실행 (DMG·노터라이즈 불필요)
3. 크래시 리포트 없이 Setup Wizard 화면 도달하면 수정 완료
4. 필요 시 `~/Library/Logs/DiagnosticReports/waiaas-daemon-*.ips` 생성 여부로도 재검증
