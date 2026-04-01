# 473: Desktop 앱 동적 포트로 외부 에이전트 접속 불가

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 증상

데스크탑 앱이 `--port=0`으로 데몬을 실행하여 OS가 임의 포트를 할당함. 외부 AI 에이전트(MCP/SDK/REST)가 데몬 엔드포인트를 알 수 없어 접속 불가.

WAIaaS의 핵심 유스케이스가 외부 에이전트 연동인데, 데스크탑 앱에서 이를 사용할 수 없는 상태.

## 원인

`apps/desktop/src-tauri/src/sidecar.rs:89`에서 `--port=0`으로 데몬을 실행. 이는 v33.0 설계 시 포트 충돌 방지를 위해 도입되었으나, 외부 에이전트 DX를 고려하지 않은 결정.

CLI는 config.toml 기본값 `port = 3100`을 사용하여 에이전트가 `localhost:3100`으로 접속 가능.

## 해결 방안

1. `sidecar.rs`에서 `--port=0` → `--port=3100` (CLI와 동일한 기본값)으로 변경
2. EADDRINUSE 발생 시 Setup Wizard/트레이에서 에러 표시 및 포트 변경 안내
3. 사용자가 config.toml 또는 환경변수(`WAIAAS_DAEMON_PORT`)로 포트 변경 가능하도록 문서화

## 영향 범위

- `apps/desktop/src-tauri/src/sidecar.rs` — 포트 인자 변경 + EADDRINUSE 에러 핸들링
- 프론트엔드 에러 표시 (splash/tray)

## 테스트 항목

- [ ] 데스크탑 앱 실행 시 `localhost:3100`으로 데몬 접속 확인
- [ ] 3100 포트 사용 중일 때 에러 메시지 표시 확인
- [ ] 외부 에이전트(SDK/MCP)에서 `localhost:3100`으로 데스크탑 데몬 접속 확인
- [ ] config.toml에서 포트 변경 후 변경된 포트로 데몬 실행 확인
