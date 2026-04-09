# 488 — Desktop 사이드카 첫 실행 시 master password 대화형 입력 요구로 기동 불가

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-08
- **발견 경위:** 이슈 487 수정 후 `waiaas-daemon start --data-dir=<X>`가 정상 파싱되면 CLI의 `resolvePassword()`가 TTY 대화형 입력을 요청 → 사이드카는 TTY가 없어 무한 대기 또는 에러

## 증상

- `waiaas start`가 내부적으로 `resolvePassword(dataDir)` 호출
- 우선순위: (1) `WAIAAS_MASTER_PASSWORD` env, (2) `WAIAAS_MASTER_PASSWORD_FILE`, (3) `{data_dir}/recovery.key`, (4) TTY 대화형 프롬프트
- Tauri 사이드카는 위 4개 중 아무것도 제공하지 않음 → stdin에서 readline 대기 → 영구 hang 또는 EOF 에러

## 원인

Desktop 앱 첫 실행 사이드카 스폰 경로에 **마스터 비밀번호 bootstrap 메커니즘이 없습니다.**

### 설계 의도 vs 현실

설계 문서 39의 Setup Wizard 플로우는 "WebView가 Setup Wizard에서 master password 를 받아서 daemon에 전달"이 암시되어 있지만, 실제 구현은:

1. **Daemon이 master password 없이는 기동 불가** — `startDaemon(state, dataDir, masterPassword)` 시그니처가 필수 인자로 받음. 첫 실행에서는 DB에 hash가 없으므로 임의의 비밀번호가 그대로 저장되지만, **일단 값이 들어와야 함**.
2. **Admin Web UI의 Setup Wizard는 master password 를 생성/설정하는 로직이 없음** — daemon이 이미 실행 중이어야 Admin UI에 접속 가능하므로 순환 의존.
3. **Tauri 사이드카 스폰 경로에 env/파일 주입 없음** — `sidecar.rs`가 단순히 바이너리를 spawn만 함.

결과적으로 **데몬은 비밀번호 없이 bootstrap할 수 없고, 비밀번호를 제공할 UI도 없는** 상태.

## 수정 방향 — Tauri가 auto-provision recovery key를 생성

CLI의 `resolvePassword()`는 이미 **recovery key 자동 폴백**을 지원합니다 (`packages/cli/src/utils/password.ts:32`):

```ts
if (dataDir) {
  const recoveryPath = join(dataDir, 'recovery.key');
  if (existsSync(recoveryPath)) {
    return readFileSync(recoveryPath, 'utf-8').trim();
  }
}
```

따라서 Tauri SidecarManager가 사이드카 spawn 전에 **최초 1회** 고엔트로피 랜덤 비밀번호를 생성해 `{data_dir}/recovery.key`(mode 0600)에 기록하면, 이후 데몬 startup은 이 파일을 읽어 자동으로 진행됩니다.

### 구현 포인트

1. `apps/desktop/src-tauri/src/sidecar.rs`
   - `ensure_recovery_key(data_dir: &str) -> Result<(), String>` 헬퍼 추가
   - 파일 존재 여부 확인 → 없으면 `rand::thread_rng()`로 32 바이트 생성 → hex 인코딩 → 0600 권한으로 저장 (Unix `std::os::unix::fs::OpenOptionsExt::mode(0o600)`)
   - Windows는 기본 NTFS 권한(사용자 프로필 디렉터리 상속)에 맡김
   - `SidecarManager::start()` 상단에서 호출 (PID 락 확보 직후)
2. `Cargo.toml`에 `rand = "0.8"` 추가
3. 후속 세션/UX 개선으로는 recovery key를 OS Keychain으로 이관하는 것이 더 안전하지만, 이 이슈 범위에서는 `recovery.key` 파일 방식으로 우선 동작 확보

### 보안 고려

- `recovery.key`는 data-dir 내부에 저장되며 mode 0600으로 다른 OS 사용자로부터 격리됨
- 동일 사용자 계정 내 다른 프로세스는 접근 가능하지만, daemon data-dir 전체가 동일한 신뢰 경계에 있으므로 허용 가능 (keystore 파일과 동일 수준 보호)
- 32바이트 무작위 hex는 공격자가 brute force할 수 없는 엔트로피 제공
- 추후 OS Keychain 이관 시 이 파일을 삭제하고 keychain lookup으로 대체 가능

## 테스트 항목

- [ ] Tauri 사이드카 스폰 경로에서 `{data_dir}/recovery.key`가 자동 생성됨 (첫 실행)
- [ ] 파일 모드가 0600 (Unix), 내용이 64자 hex 문자열
- [ ] 두 번째 실행에서는 기존 파일을 재사용 (재생성 없음)
- [ ] `waiaas-daemon start --data-dir=<X>` 호출이 `recovery.key`를 읽어 master password로 사용
- [ ] 데몬이 HTTP 서버를 listen하여 `WAIAAS_PORT=3100`을 stdout 으로 출력
- [ ] WebView 가 Setup Wizard 에 도달 (v2.14.0 증상 완전 해소)
- [ ] 이미 `recovery.key`가 있는 기존 설치에서도 변경 없이 정상 동작

## 관련 이슈

- **485** (JIT), **486** (SEA require), **487** (sidecar CLI args) — 순차적 선행 수정
