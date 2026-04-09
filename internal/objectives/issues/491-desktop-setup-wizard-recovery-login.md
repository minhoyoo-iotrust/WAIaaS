# 491 — Desktop Setup Wizard가 bootstrap recovery.key와 충돌해 master password 설정 불가

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-04-09
- **발견 경위:** v2.14.1-rc DMG 설치·실행 검증 중. 스플래시 → Setup Wizard Step 1/5 (Set Password) 진입 → 사용자가 임의의 비밀번호 입력·확인 → **"Invalid master password"** 에러로 진행 불가

## 증상

- Desktop 앱 첫 실행 시 Setup Wizard Step 1에서 master password 입력 강제
- 사용자가 어떤 비밀번호를 입력해도 `PUT /v1/admin/master-password` 호출이 401 반환
- 결과 화면에 "Invalid master password" 출력 → Step 2로 진행 불가

## 원인

이슈 488 수정으로 `sidecar.rs::ensure_recovery_key()`가 **첫 실행 전** `{data_dir}/recovery.key`에 32바이트 랜덤 hex를 생성합니다. 데몬 CLI의 `resolvePassword()`가 이 파일을 읽어 master password로 사용하여 bootstrap → `daemon-startup.ts::Step 2b` 가 DB에 해당 값의 `master_password_hash`를 저장하고 부팅합니다.

문제는 Setup Wizard Step 1(`packages/admin/src/desktop/wizard/steps/password-step.tsx`):

```tsx
const res = await fetch(API.ADMIN_MASTER_PASSWORD, {
  method: 'PUT',
  headers: {
    'X-Master-Password': password.value,         // ← 사용자 입력을 "기존 비밀번호"로
  },
  body: JSON.stringify({ password: password.value }),
});
```

`PUT /v1/admin/master-password`는 **비밀번호 변경** 엔드포인트로:
- `X-Master-Password` 헤더: **현재** master password (검증용)
- body: **새로운** master password

Step 1은 동일 값을 양쪽에 넣기 때문에 "사용자 입력 == 현재 DB hash의 역문자열" 이 성립해야 통과합니다. Bootstrap recovery.key가 대신 들어가 있으므로 사용자 입력은 항상 틀리고 401이 반환됩니다.

즉 Setup Wizard의 password step은 "데몬에 master password가 아직 없는 상태" 라는, 이슈 488 이전의 가정 위에서 작성되어 있어 현재 bootstrap 흐름과 직접 충돌합니다.

또한 2회차 이후 실행에도 같은 충돌이 재발합니다. `wizardComplete` 플래그가 localStorage에 있으면 wizard를 건너뛰고 `Login` 페이지로 넘어가는데, 사용자는 recovery.key 값(랜덤 hex)을 알 방법이 없어 어떤 경우에도 로그인 불가.

## 수정 방향

Setup Wizard를 "사용자가 master password를 정한다" 모델에서 **"bootstrap recovery.key로 이미 로그인 되어 있는 상태"** 모델로 전환. 대시보드의 기존 Security 페이지(Master Password tab, `pages/security.tsx:438`)가 변경 UI를 이미 제공하므로 사용자가 원하면 그쪽에서 바꿀 수 있음.

### 1. Tauri IPC 명령 추가

`apps/desktop/src-tauri/src/commands.rs`:
- `get_recovery_key` — `{data_dir}/recovery.key` 내용 반환 (없으면 `None`)
- `clear_recovery_key` — 파일 삭제 (Security 페이지에서 master password 변경 성공 후 호출)

`main.rs`의 `invoke_handler!`에 등록, `sidecar.rs`에 `pub get_data_dir()` 노출.

### 2. Admin UI 자동 로그인

`packages/admin/src/app.tsx`:
- `isDesktop()` 블록의 `useEffect` 안에서 wizard/banner 로드 전 `getDesktopRecoveryKey()` 호출
- 키가 있으면 `fetch(API.ADMIN_STATUS, { headers: { 'X-Master-Password': key } })`
- 200 OK이면 `login(key, adminTimeout)` → `masterPassword` signal 설정, 대시보드 이동
- 401 또는 키 없음이면 기존 `Login` 페이지로 폴백 (사용자가 이미 password 를 바꾼 경우)

### 3. Wizard password step 제거

- `setup-wizard.tsx`: `STEP_NAMES`에서 'Set Password' 제거, `TOTAL_STEPS = 4`, `StepContent` switch 케이스 1-4 재매핑
- `wizard-store.ts`: `nextStep` 상한 `< 4`, `completeWizard()`에서 `login()` 호출 제거 (이미 로그인 됨), 단순 navigate 처리
- `steps/password-step.tsx` 파일 삭제
- 관련 테스트(`setup-wizard.test.tsx`, `wizard-steps.test.tsx`, `wizard-store.test.ts`) 4-step 모델로 갱신

### 4. 플랫폼 헬퍼

`packages/admin/src/utils/platform.ts`:
- `getDesktopRecoveryKey(): Promise<string | null>`
- `clearDesktopRecoveryKey(): Promise<void>`
- 내부 `tauriInvoke()` 헬퍼 — `@tauri-apps/api` 의존성 추가 없이 `window.__TAURI_INTERNALS__.invoke` 직접 호출

### 5. Security 페이지에서 Master Password 탭 숨김 (Desktop 전용)

`packages/admin/src/pages/security.tsx`:
- `SECURITY_TABS` 배열을 `isDesktop()` 기준으로 분기 → Desktop 에서는 `password` 탭 제외
- 이유: Desktop 에서 사용자가 master password 를 바꿀 경우, 다음 부팅 시 sidecar 가 자동 로그인에 쓸 값을 알 방법이 없음 (OS Keychain 통합 없이는). CLI(`waiaas set-master`)로 관리하도록 유도.
- 브라우저 배포(self-hosted)에서는 기존대로 노출

### 6. `ensure_recovery_key` 방어적 에러

사용자가 수동으로 `recovery.key` 를 삭제·이동한 edge case 를 방어하기 위해, **DB 또는 keystore 가 이미 존재하는 상태에서 recovery.key 가 없으면 새로 생성하지 않고** 명확한 에러로 종료:

```rust
if db_path.exists() || keystore_dir.exists() {
    return Err("RecoveryKeyMissing: ...복구 안내문...".to_string());
}
```

이렇게 하면:
- 랜덤 키 재생성으로 기존 `master_password_hash` 와 mismatch 되어 daemon 이 TTY 프롬프트에서 hang 되는 사태 방지
- splash 화면에 구체적 복구 안내가 표시됨 (restore 백업 / CLI 로 관리 / 완전 초기화)

### 사용자 시나리오

| 시나리오 | 동작 |
|----------|------|
| Desktop 첫 실행 | sidecar 가 recovery.key 생성 → 데몬 부팅 → UI 자동 로그인 → Wizard Step 1 = Chain |
| 2회차 이후 실행 | recovery.key 유지 → 자동 로그인 → 바로 대시보드 |
| 사용자가 master password 관리하고 싶음 | Desktop UI 에는 탭 없음 → `waiaas set-master --data-dir=<desktop data dir>` 로 CLI 관리 |
| recovery.key 수동 삭제·손상 (DB 존재) | splash 에 "RecoveryKeyMissing" 에러 — 복구 안내 표시, hang 방지 |
| 완전 초기화 원할 때 | `~/Library/Application Support/dev.waiaas.desktop/` 디렉터리 삭제 후 재실행 |

## 테스트 항목

- [ ] Clean 환경에서 Desktop 앱 실행 → Wizard가 Step 1 = Chain 으로 시작
- [ ] Wizard 완주 → 대시보드 진입
- [ ] 앱 재시작 → 자동 로그인, Wizard/Login 미표시, 바로 대시보드
- [ ] Security 페이지에서 master password 변경 → 자동 logout → 재시작 → Login 페이지에 바뀐 비밀번호 입력 → 대시보드
- [ ] `recovery.key` 수동 삭제 → 앱 재시작 → Login 페이지 표시
- [ ] Browser 빌드에서 Wizard/login 흐름 회귀 없음 (`getDesktopRecoveryKey` null 반환)
- [ ] `pnpm --filter @waiaas/admin test` / `lint` / `typecheck` 통과

## 관련 이슈

- **488** (recovery.key bootstrap) — 이 이슈가 유발한 회귀. 488 자체는 유지 (데몬 first-run 자동화에 필수).
- **485/486/487/489/490** — v2.14.1-rc 에 포함된 선행 수정. 이 이슈는 v2.14.1-rc 에서 관찰됨.
