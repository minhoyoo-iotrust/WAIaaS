# 487 — Desktop 사이드카가 daemon CLI에 잘못된 인자를 전달 (start 서브커맨드 누락 + 지원되지 않는 --port)

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-08
- **발견 경위:** 이슈 485/486 수정 후 SEA 데몬이 V8 초기화와 모듈 로딩을 통과하자 commander가 `--port=0`을 `unknown option`으로 거부하고 종료

## 증상

```
error: unknown option '--port=0'
```

- `SidecarManager::start()`(sidecar.rs:87)가 사이드카 바이너리 `waiaas-daemon`을 스폰할 때 `["--port=3100", "--data-dir=..."]`을 전달
- 하지만 `waiaas-daemon`의 CLI(`packages/cli/src/index.ts`)는
  - 최상위에 `--port` 옵션 없음
  - 데몬 기동은 `waiaas start --data-dir <path>` 서브커맨드로만 가능
  - `start` 서브커맨드는 `--port` 옵션을 받지 않음 (포트는 `config.toml`의 `[daemon] port` 기본값 3100 또는 env `WAIAAS_DAEMON_PORT`로 결정)
- 결과: commander가 첫 번째 인자 `--port=0` / `--port=3100`을 거부하고 종료

## 원인

v33.2(Phase 460-01)에서 `sidecar.rs`를 작성할 때 "Phase 460-02에서 데몬 CLI가 `--port` 옵션을 지원할 것"이라는 전제하에 인자를 넣었지만, 해당 CLI 옵션이 실제로는 구현되지 않았습니다. Phase 460-02는 `WAIAAS_PORT` stdout 프로토콜과 `daemon.port` 파일 폴백은 추가했지만, CLI 파서 수정은 누락되었습니다.

이 버그는 이슈 485(JIT 엔타이틀먼트)와 486(SEA require)가 동시에 존재해서 지금까지 노출되지 않았습니다. 두 선행 버그가 V8 init과 모듈 로딩 단계에서 먼저 죽었기 때문에 commander 파싱까지 도달한 적이 없었습니다.

## 수정 방향

### 1. `sidecar.rs` — 올바른 CLI 인자 사용

```rust
// Before
.args(["--port=3100", &format!("--data-dir={}", data_dir)]);

// After
.args(["start", &format!("--data-dir={}", data_dir)]);
```

포트는 CLI 옵션이 아니라 `{data_dir}/config.toml` 또는 env var `WAIAAS_DAEMON_PORT`로 주입. 기본값(3100)을 그대로 쓰므로 이슈 473의 "고정 포트 3100" 정책은 유지됩니다.

### 2. 사이드카 env 주입

SidecarManager::start()에서 사이드카 spawn 시 `WAIAAS_MASTER_PASSWORD_FILE=...`을 env로 전달 (이슈 488과 연동). 현재 `tauri-plugin-shell`의 `.env(...)` 호출로 처리.

### 3. (불필요) 포트 옵션 추가 안 함

원래 설계 문서 39는 "동적 포트(`--port=0`) + stdout `WAIAAS_PORT` 프로토콜"이었으나, 이슈 473에서 "외부 에이전트가 고정 엔드포인트로 접근할 수 있도록" 3100 고정으로 변경됨. 따라서 CLI에 `--port` 옵션을 다시 추가할 필요 없음. stdout `WAIAAS_PORT` 프로토콜은 이미 `daemon-startup.ts:1480`에 존재하므로 SidecarManager의 포트 discovery 로직도 그대로 유지됨 (포트는 3100으로 고정이지만 discovery 프로토콜을 통해 확인).

## 테스트 항목

- [ ] `waiaas-daemon start --data-dir=<tmp>` 직접 호출이 commander 파싱 에러 없이 진행 (이슈 488 해소 후 실제 HTTP 서버 기동까지)
- [ ] SidecarManager::start() 가 사이드카를 정상 스폰하여 `WAIAAS_PORT=3100` 을 stdout으로 수신
- [ ] `{data_dir}/daemon.port` 파일이 3100으로 생성됨
- [ ] 기존 외부 에이전트(MCP/SDK/REST)가 여전히 `http://127.0.0.1:3100`으로 접근 가능 (이슈 473 요구사항 보존)

## 관련 이슈

- **485** (JIT 엔타이틀먼트), **486** (SEA require) — 선행 수정 필수
- **488** (Desktop 사이드카 첫 실행 master password) — 같은 픽스 브랜치에서 함께 수정
- **473** (Desktop 동적 포트로 외부 에이전트 접속 불가) — 고정 포트 3100 정책 유지
