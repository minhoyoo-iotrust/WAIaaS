# 490 — Desktop 사이드카 lockfile이 daemon CLI의 PID 파일과 충돌

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-08
- **발견 경위:** 이슈 485-489 수정 후 Tauri desktop 앱에서 사이드카를 띄우면 sub-second 안에 `Daemon already running (PID: <tauri-desktop-pid>)` 로 데몬이 거부됨. 실제로는 아무 데몬도 뜨지 않은 상태

## 증상

```
[ERR] [stderr] Daemon already running (PID: 24563)
[TERM] code=Some(1) signal=None
```

- `waiaas-desktop`(Tauri 앱) 스폰 직후 `~/Library/Application Support/dev.waiaas.desktop/daemon.pid`에 **Tauri 앱 자신의 PID**가 기록됨
- 이어서 스폰되는 `waiaas-daemon` 사이드카의 `start.ts`가 이 파일을 읽어 PID를 검사 → "이 PID 살아있음" → "Daemon already running" 으로 종료 (exit code 1)
- 실제 데몬은 단 한 번도 Step 1에 도달 못함
- 데이터 디렉터리에는 `recovery.key`만 남고 `data/`, `keystore/` 생성 안됨

## 원인

`apps/desktop/src-tauri/src/lockfile.rs:32`

```rust
// Write current process PID (we'll update with child PID after spawn)
fs::write(&lockfile_path, std::process::id().to_string())
```

sidecar.rs `start()`가 `lockfile::create_lockfile(&data_dir)`를 호출할 때 **Tauri 앱(waiaas-desktop)의 PID**를 `{data_dir}/daemon.pid`에 기록합니다. 주석은 "we'll update with child PID after spawn" 이라고 하지만 `update_lockfile_pid` 함수는 정의만 있고 어디에서도 호출되지 않습니다.

그 결과:
- `daemon.pid` 파일 용도 충돌:
  - **Tauri 사이드카**: "Tauri 앱의 단일 인스턴스 lock"
  - **waiaas-daemon CLI**: "실행 중인 데몬 프로세스 PID"
- `packages/cli/src/commands/start.ts`가 `daemon.pid`를 읽고 Tauri 앱 PID를 발견 → `process.kill(pid, 0)`로 살아있음 확인 → "already running" 에러로 즉시 종료
- 이슈 485-489가 모두 선행 수정된 상태에서도 데몬 startup은 이 검사 때문에 결코 시작되지 못함

## 수정 방향

sidecar.rs의 단일 인스턴스 lock과 daemon CLI의 PID 파일을 **서로 다른 파일**로 분리합니다.

### 옵션 A (채택): lockfile 이름 변경

`lockfile.rs`에서 파일명을 `daemon.pid` → `desktop.lock`으로 변경. Tauri가 자체 single-instance 체크에 쓰고, daemon CLI는 기존대로 `daemon.pid`를 사용.

```rust
// Before
let lockfile_path = Path::new(data_dir).join("daemon.pid");

// After
let lockfile_path = Path::new(data_dir).join("desktop.lock");
```

`update_lockfile_pid` 함수는 미사용이므로 제거.

### 옵션 B (미채택): lockfile 완전 제거

sidecar.rs가 lockfile 없이 동작하고, daemon 내부의 `acquireDaemonLock()` (proper-lockfile 기반)에 일관된 단일 인스턴스 제어를 위임.

- 장점: 코드 감소
- 단점: Tauri 앱이 여러 번 실행될 때 splash 단계에서 빠르게 감지 불가

옵션 A가 관심사 분리 면에서 더 명확.

## 테스트 항목

- [ ] Tauri 앱 첫 실행 시 사이드카가 `waiaas-daemon start` 를 성공적으로 호출하고 Step 1-6 완료
- [ ] `daemon.pid`에 실제 데몬 프로세스 PID 기록 (Tauri 앱 PID 아님)
- [ ] `desktop.lock`에 Tauri 앱 PID 기록 (또는 옵션 B 채택 시 파일 자체 미생성)
- [ ] `http://127.0.0.1:3100/admin/` 에 curl 시 index.html 응답 (이슈 489)
- [ ] 앱 종료 후 `desktop.lock` / `daemon.pid` 모두 정리됨
- [ ] 이미 `waiaas start` 가 3100에 떠 있는 상태에서 desktop 앱을 띄우면 EADDRINUSE 에러 발생 (설계 대로 동작)
- [ ] Tauri 앱 두 번 실행 방지: 두 번째 실행 시 desktop.lock 으로 감지

## 관련 이슈

- **485/486/487/488/489** — 선행 수정. 이 이슈까지 해소해야 Desktop 앱 v2.14.0 첫 실행이 실제로 완료됨.
