# 51. 배포 타겟별 테스트 범위 및 검증 방법

**Version:** 0.4
**Phase:** 18 - 배포 타겟별 테스트
**Status:** Confirmed
**Created:** 2026-02-06
**Requirements:** PLAT-01 (CLI Daemon 테스트), PLAT-02 (Docker 테스트), PLAT-03 (Tauri Desktop 테스트), PLAT-04 (Telegram Bot 테스트)
**References:** 28-daemon-lifecycle-cli.md (CORE-05), 39-tauri-desktop-architecture.md (TAURI-DESK), 40-telegram-bot-docker.md (TGBOT-DOCK), 41-test-levels-matrix-coverage.md (TLVL-01~03), 42-mock-boundaries-interfaces-contracts.md, 50-cicd-pipeline-coverage-gate.md (CICD-01~03), 18-RESEARCH.md

---

## 목차

1. [개요](#1-개요)
2. [공통 원칙](#2-공통-원칙)
3. [PLAT-01: CLI Daemon 테스트](#3-plat-01-cli-daemon-테스트)
4. [PLAT-02: Docker 테스트](#4-plat-02-docker-테스트)
5. [PLAT-03: Desktop App (Tauri) 테스트](#5-plat-03-desktop-app-tauri-테스트)
6. [PLAT-04: Telegram Bot 테스트](#6-plat-04-telegram-bot-테스트)
7. [CI/CD 파이프라인 통합 매핑](#7-cicd-파이프라인-통합-매핑)
8. [Phase 14/17 결정 정합성 검증표](#8-phase-1417-결정-정합성-검증표)
9. [Pitfalls 요약](#9-pitfalls-요약)
10. [요약 통계](#10-요약-통계)
11. [참조 문서](#11-참조-문서)

---

## 1. 개요

### 1.1 목적

Phase 18은 WAIaaS의 4개 배포 타겟(CLI Daemon, Docker Container, Tauri Desktop, Telegram Bot) 각각에 대해 **무엇을 테스트하고, 어떻게 검증하며, 어디까지 자동화하고, 수동 QA는 무엇인가**를 확정하는 설계 문서를 산출한다. 이 문서는 v0.4 테스트 전략의 마지막 퍼즐로, 구현 단계에서 플랫폼별 테스트 코드를 작성할 때 참조하는 단일 소스(SSoT)이다.

### 1.2 4개 배포 타겟 요약

| 타겟 | 기반 문서 | 핵심 검증 범위 | 자동화 가능성 |
|------|----------|--------------|-------------|
| CLI Daemon | 28-daemon-lifecycle-cli.md (CORE-05) | init/start/stop/status, 시그널 처리, exit codes 0-5, Windows fallback | HIGH |
| Docker | 40-telegram-bot-docker.md 섹션 8-15 | 빌드, compose, named volume, Secrets, healthcheck, non-root | HIGH |
| Tauri Desktop | 39-tauri-desktop-architecture.md (TAURI-DESK) | 빌드, Sidecar SEA, IPC, React 컴포넌트 + 수동 QA(UI/UX) | MEDIUM |
| Telegram Bot | 40-telegram-bot-docker.md 섹션 2-7 | Long Polling, 8명령어, 5콜백, 2-Tier 인증, Mock 전략 | HIGH |

### 1.3 Phase 14/17 연동 관계

- **Phase 14 (TLVL-01):** Platform 테스트 레벨은 **릴리스 시** 실행 -- 4개 타겟 모두 이 원칙을 따른다
- **Phase 17 (CICD-4STAGE):** release.yml Stage 4에 `platform-cli`, `platform-docker` job이 이미 골격으로 존재 -- 본 문서에서 시나리오를 채워넣는다
- **Phase 14 (MOCK-ALL-LEVELS-NOTIFICATION):** Telegram Bot 테스트에서 알림 채널은 전 레벨 Mock

---

## 2. 공통 원칙

### 2.1 Platform 테스트 실행 조건

| 원칙 | 설명 | 근거 |
|------|------|------|
| **릴리스 시 실행** | Platform 테스트는 release 이벤트 또는 수동 workflow_dispatch로만 실행 | Phase 14 TLVL-01: Platform 레벨은 릴리스 시 실행 |
| **`--runInBand` 필수** | 모든 Platform 테스트는 순차 실행 (병렬 금지) | 포트 충돌, Docker 컨테이너 이름 충돌, 프로세스 경합 방지 |
| **테스트별 고유 포트** | CLI 테스트 시 각 테스트에 `3100 + offset` 고유 포트 할당 | EADDRINUSE 방지 (Pitfall 1) |
| **임시 데이터 디렉토리** | `mkdtempSync`로 테스트별 독립 `--data-dir` 생성 | 테스트 격리, 잔존 데이터 영향 제거 |
| **강제 정리 (teardown)** | afterAll에서 프로세스 kill, Docker rm -f, 임시 디렉토리 삭제를 **반드시** 수행 | CI에서 잔존 리소스로 인한 후속 테스트 실패 방지 (Pitfall 2) |
| **타임아웃 제어** | 짧은 타임아웃 (start: 10s, shutdown: 5s)으로 테스트 속도 확보 | 릴리스 파이프라인 전체 ~15min 이내 목표 |

### 2.2 테스트 파일 위치

```
packages/
├── cli/
│   └── __tests__/
│       └── platform/           # PLAT-01: CLI Platform 테스트
│           ├── init.platform.test.ts
│           ├── start-stop.platform.test.ts
│           ├── status.platform.test.ts
│           ├── signal.platform.test.ts
│           └── e2e-flow.platform.test.ts
├── daemon/
│   └── __tests__/
│       └── platform/           # PLAT-02 + PLAT-04
│           ├── docker.platform.test.ts
│           └── telegram-bot.platform.test.ts
└── desktop/
    └── __tests__/
        └── platform/           # PLAT-03
            ├── build.platform.test.ts
            └── QA-CHECKLIST.md
```

### 2.3 Anti-Pattern 4건

| # | Anti-Pattern | 이유 | 대안 |
|---|-------------|------|------|
| AP-1 | **Docker 테스트에서 bind mount 사용** | SQLite WAL 모드가 macOS VirtioFS에서 불안정 (40번 문서 섹션 10.2) | named volume 사용 |
| AP-2 | **Tauri UI 자동화에 Playwright 사용** | Tauri는 Playwright를 공식 지원하지 않음, WebdriverIO만 공식 지원 | 수동 QA 체크리스트 또는 WebdriverIO (macOS 제한 있음) |
| AP-3 | **Telegram Bot 테스트에서 실제 API 호출** | 외부 서비스 의존으로 테스트 불안정 + Phase 14 MOCK-ALL-LEVELS-NOTIFICATION | jest.fn() + global.fetch mock + 서비스 DI mock |
| AP-4 | **CLI 테스트에서 Windows SIGTERM 의존** | Windows에서 SIGTERM은 process.kill(pid, 'SIGTERM')이 동작하지 않음 | HTTP /v1/admin/shutdown fallback + 조건부 분기 Unit 테스트 |

---

## 3. PLAT-01: CLI Daemon 테스트

**기반 문서:** 28-daemon-lifecycle-cli.md (CORE-05)
**자동화 가능성:** HIGH
**검증 방법:** `child_process.spawn`으로 실제 CLI 바이너리 실행, exit code + stdout/stderr 캡처

### 3.1 검증 패턴

```typescript
// 구현 시 이 패턴을 따른다 (18-RESEARCH.md Pattern 1)
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function runCli(args: string[], env?: Record<string, string>): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
}> {
  return new Promise((resolve) => {
    const child = spawn('node', ['packages/cli/bin/waiaas.js', ...args], {
      env: { ...process.env, ...env },
      timeout: 30_000,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr })
    })
  })
}
```

**테스트별 격리:**
- 각 테스트는 `mkdtempSync(join(tmpdir(), 'waiaas-test-'))`로 독립 데이터 디렉토리 생성
- 테스트별 고유 포트: `3100 + testIndex`
- afterEach에서 `rmSync(tmpDir, { recursive: true, force: true })` 강제 정리

### 3.2 시나리오 테이블

#### Category 1: init (4건)

| ID | 시나리오 | 입력 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-01 | 정상 초기화 | `init --non-interactive --data-dir $TMP` + `WAIAAS_MASTER_PASSWORD` env | exit code 0, stdout에 "initialized" 포함, `$TMP/config.toml` 파일 존재 | O |
| PLAT-01-CLI-02 | 이미 초기화됨 에러 | 동일 디렉토리에 init 2회 실행 | exit code 1, stderr에 "Already initialized" 포함 | O |
| PLAT-01-CLI-03 | --force 재초기화 | 초기화 후 `init --force --non-interactive --data-dir $TMP` | exit code 0, config.toml 재생성 | O |
| PLAT-01-CLI-04 | --non-interactive 없이 패스워드 미제공 | `init --data-dir $TMP` (stdin TTY 아님, env 미설정) | exit code 1, stderr에 패스워드 관련 에러 | O |

#### Category 2: start (6건)

| ID | 시나리오 | 입력 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-05 | 정상 시작 | `start --data-dir $TMP --port $PORT` + `WAIAAS_MASTER_PASSWORD` env | exit code 0 (foreground 종료 시), stdout에 "ready on 127.0.0.1:$PORT" 포함 | O |
| PLAT-01-CLI-06 | 미초기화 상태에서 시작 | `start --data-dir $EMPTY_TMP` | exit code 3, stderr에 "not found" 또는 "Run 'waiaas init'" 포함 | O |
| PLAT-01-CLI-07 | 이미 실행 중 | init 후 start 2회 (첫 번째 실행 중에 두 번째 시도) | exit code 2, stderr에 "already running" 포함 | O |
| PLAT-01-CLI-08 | 패스워드 오류 | `start --data-dir $TMP` + `WAIAAS_MASTER_PASSWORD=wrong` | exit code 4, stderr에 "authentication" 또는 "password" 포함 | O |
| PLAT-01-CLI-09 | 포트 충돌 | 동일 포트에서 두 인스턴스 시작 시도 | exit code 1, stderr에 "EADDRINUSE" 또는 "port" 포함 | O |
| PLAT-01-CLI-10 | --daemon 모드 | `start --daemon --data-dir $TMP --port $PORT` | exit code 0 (즉시 반환), PID 파일 생성, /health 응답 200 | O |

#### Category 3: stop (5건)

| ID | 시나리오 | 입력 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-11 | 정상 종료 | 실행 중인 데몬에 `stop --data-dir $TMP` | exit code 0, PID 파일 삭제됨, 프로세스 종료 확인 | O |
| PLAT-01-CLI-12 | PID 파일 없음 (미실행) | `stop --data-dir $TMP` (데몬 미실행) | exit code 3, stderr에 "not running" 포함 | O |
| PLAT-01-CLI-13 | Stale PID 정리 | PID 파일이 존재하나 해당 프로세스 없음 | exit code 3 또는 0 (stale PID 정리 후), 경고 메시지 | O |
| PLAT-01-CLI-14 | --force SIGKILL | 응답하지 않는 데몬에 `stop --force --data-dir $TMP` | exit code 0, 프로세스 강제 종료 확인 | O |
| PLAT-01-CLI-15 | 종료 타임아웃 | 30초 이상 종료되지 않는 시나리오 (시뮬레이션) | exit code 5, stderr에 "timeout" 포함 | O |

#### Category 4: status (3건)

| ID | 시나리오 | 입력 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-16 | 데몬 실행 중 | 실행 중인 데몬에 `status --data-dir $TMP` | exit code 0, stdout에 "running", PID, 포트 정보 포함 | O |
| PLAT-01-CLI-17 | 데몬 중지 상태 | `status --data-dir $TMP` (미실행) | exit code 0 또는 3, stdout에 "stopped" 또는 "not running" 포함 | O |
| PLAT-01-CLI-18 | --json 출력 | `status --json --data-dir $TMP` | exit code 0, stdout이 유효한 JSON, `status` 필드 존재 | O |

#### Category 5: Signal (5건)

| ID | 시나리오 | 입력 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-19 | SIGINT graceful shutdown | 실행 중 데몬에 `process.kill(pid, 'SIGINT')` | exit code 0, "graceful shutdown" 로그 출력, PID 파일 삭제 | O (Linux/macOS) |
| PLAT-01-CLI-20 | SIGTERM graceful shutdown | `process.kill(pid, 'SIGTERM')` | exit code 0, 동일 graceful shutdown | O (Linux/macOS) |
| PLAT-01-CLI-21 | SIGHUP config reload | `process.kill(pid, 'SIGHUP')` | 프로세스 계속 실행, config reload 로그 출력 | O (Linux/macOS) |
| PLAT-01-CLI-22 | SIGUSR1 상태 덤프 | `process.kill(pid, 'SIGUSR1')` | 프로세스 계속 실행, 상태 정보 로그 출력 | O (Linux/macOS) |
| PLAT-01-CLI-23 | 이중 시그널 방지 | SIGINT 전송 후 즉시 SIGINT 재전송 | 두 번째 시그널 무시 ("already shutting down" 로그), exit code 0 | O (Linux/macOS) |

#### Category 6: Windows Fallback (2건)

| ID | 시나리오 | 입력 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-24 | HTTP /v1/admin/shutdown fallback | `POST http://127.0.0.1:$PORT/v1/admin/shutdown` | 데몬 graceful shutdown, exit code 0 | O (모든 OS) |
| PLAT-01-CLI-25 | Windows 조건부 분기 Unit 테스트 | `process.platform === 'win32'` 분기 코드의 SIGBREAK 핸들러 등록 | Unit 테스트로 조건부 코드 경로 검증 | O (Unit 레벨) |

#### Category 7: Exit Codes 검증 (6건)

| ID | 시나리오 | 기대 exit code | 검증 방법 | 자동화 |
|----|---------|---------------|----------|--------|
| PLAT-01-CLI-26 | 성공적 종료 | 0 | start -> stop -> exit code 확인 | O |
| PLAT-01-CLI-27 | 일반 에러 (설정 오류) | 1 | 잘못된 config.toml + start | O |
| PLAT-01-CLI-28 | 이미 실행 중 | 2 | start 2회 | O |
| PLAT-01-CLI-29 | 미초기화 | 3 | 빈 디렉토리에서 start | O |
| PLAT-01-CLI-30 | 인증 실패 | 4 | 잘못된 패스워드로 start | O |
| PLAT-01-CLI-31 | 타임아웃 | 5 | 종료 대기 초과 시나리오 | O |

### 3.3 전체 흐름 시나리오 (E2E-like)

| ID | 시나리오 | 단계 | 기대 결과 | 자동화 |
|----|---------|------|----------|--------|
| PLAT-01-CLI-32 | init -> start -> status -> stop -> status | 1. init --non-interactive, 2. start --port $PORT, 3. status --json (running), 4. stop, 5. status --json (stopped) | 각 단계 exit code 0, 상태 전이 확인 | O |

**총 시나리오 수: 32건**

---

## 4. PLAT-02: Docker 테스트

**기반 문서:** 40-telegram-bot-docker.md 섹션 8-15 (DOCK-01)
**자동화 가능성:** HIGH
**검증 방법:** Docker CLI 기반 bash 스크립트 또는 Jest에서 `child_process.exec` 래핑

### 4.1 검증 패턴

```bash
# 구현 시 이 패턴을 따른다 (18-RESEARCH.md Pattern 2)
# Docker CLI 기반 빌드 + 실행 + healthcheck 폴링 + 검증 + 정리
docker build -t waiaas:test .
docker run -d --name waiaas-test \
  -p 3100:3100 \
  -e WAIAAS_DAEMON_HOSTNAME=0.0.0.0 \
  -e WAIAAS_MASTER_PASSWORD=test-password-12345 \
  waiaas:test
# healthcheck 폴링 (start_period 15s 감안)
for i in $(seq 1 10); do
  sleep 3
  curl -sf http://127.0.0.1:3100/health && break
done
curl -sf http://127.0.0.1:3100/health || (docker logs waiaas-test && exit 1)
docker stop waiaas-test
docker rm waiaas-test
```

**강제 정리 (teardown):** 모든 테스트의 beforeAll/afterAll에서 `docker rm -f waiaas-test` + `docker volume rm waiaas-test-data` 강제 실행 (이전 테스트 잔존 방지).

### 4.2 시나리오 테이블

#### Category 1: 빌드 (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-01 | Multi-stage build 성공 | `docker build -t waiaas:test .` | exit code 0, 이미지 생성 | O |
| PLAT-02-DOCK-02 | 이미지 크기 확인 | `docker image inspect waiaas:test --format '{{.Size}}'` | < 400MB (예상 250-350MB) | O |

#### Category 2: compose (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-03 | docker compose up 정상 기동 | `docker compose up -d` | 컨테이너 running, /health 200 OK | O |
| PLAT-02-DOCK-04 | docker compose down graceful | `docker compose down` | 컨테이너 제거, 볼륨 보존 | O |

#### Category 3: named volume (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-05 | 데이터 영속성 검증 | run -> init -> stop -> run -> DB 데이터 존재 확인 | 두 번째 run에서 config.toml 존재, DB 데이터 유지 | O |
| PLAT-02-DOCK-06 | 볼륨 삭제 시 초기화 | `docker volume rm` 후 run | First run auto-init 실행, 새 config.toml 생성 | O |

#### Category 4: 환경변수 (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-07 | WAIAAS_DAEMON_HOSTNAME=0.0.0.0 오버라이드 | `-e WAIAAS_DAEMON_HOSTNAME=0.0.0.0` | 컨테이너 내부 0.0.0.0 바인딩, 호스트에서 curl 127.0.0.1:3100 접근 가능 | O |
| PLAT-02-DOCK-08 | WAIAAS_DAEMON_PORT 커스텀 | `-e WAIAAS_DAEMON_PORT=3200 -p 3200:3200` | 포트 3200에서 /health 응답 | O |

#### Category 5: hostname 오버라이드 (1건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-09 | hostname 미설정 시 접근 불가 | WAIAAS_DAEMON_HOSTNAME 미설정 (기본 127.0.0.1) | 컨테이너 내부에서만 접근 가능, 호스트에서 curl 실패 (connection refused) | O |

#### Category 6: grace period (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-10 | stop_grace_period 35s 내 graceful | `docker stop --time 35 waiaas-test` | exit code 0, graceful shutdown 로그 | O |
| PLAT-02-DOCK-11 | 짧은 타임아웃에서 강제 종료 | `docker stop --time 1 waiaas-test` | exit code 137 (SIGKILL), 강제 종료 | O |

#### Category 7: Secrets _FILE 패턴 (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-12 | WAIAAS_MASTER_PASSWORD_FILE | `/run/secrets/` 마운트 + `WAIAAS_MASTER_PASSWORD_FILE` env | 데몬 정상 시작, 패스워드 파일에서 로드 | O |
| PLAT-02-DOCK-13 | WAIAAS_TELEGRAM_BOT_TOKEN_FILE | `/run/secrets/` 마운트 + `WAIAAS_TELEGRAM_BOT_TOKEN_FILE` env | entrypoint에서 토큰 파일 로드 성공 | O |

#### Category 8: healthcheck (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-14 | healthcheck 정상 동작 | `docker inspect --format '{{.State.Health.Status}}' waiaas-test` | "healthy" (start_period 15s 이후) | O |
| PLAT-02-DOCK-15 | unhealthy 판정 | 데몬 프로세스 내부 kill 후 | "unhealthy" (3회 실패 후) | O |

#### Category 9: non-root (2건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-16 | whoami 확인 | `docker exec waiaas-test whoami` | "waiaas" | O |
| PLAT-02-DOCK-17 | uid/gid 확인 | `docker exec waiaas-test id` | uid=1001(waiaas) gid=1001(waiaas) | O |

#### Category 10: 첫 실행 auto-init (1건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-02-DOCK-18 | config.toml 없을 때 auto-init | 빈 named volume + `WAIAAS_MASTER_PASSWORD` env로 run | entrypoint에서 자동 init 실행, 데몬 정상 시작 | O |

### 4.3 Phase 17 release.yml platform-docker job 확장 포인트

Phase 17(50번 문서)에서 이미 정의된 `platform-docker` job 골격:

```yaml
# 기존 골격 (50번 문서 release.yml)
platform-docker:
  needs: [full-test-suite]
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - docker build -t waiaas:test .
    - docker run -d --name waiaas-test -p 3100:3100 waiaas:test
    - sleep 5
    - curl -sf http://127.0.0.1:3100/health
    - docker stop waiaas-test
    - docker rm waiaas-test
```

**Phase 18 확장 포인트:**

| 추가 검증 | 확장 내용 | 시나리오 ID |
|----------|----------|------------|
| 이미지 크기 | `docker image inspect` + size assertion | PLAT-02-DOCK-02 |
| named volume 영속성 | stop -> start -> DB 존재 확인 패턴 추가 | PLAT-02-DOCK-05 |
| 환경변수 오버라이드 | HOSTNAME=0.0.0.0 + 호스트 curl | PLAT-02-DOCK-07 |
| grace period | `docker stop --time 35` + exit code 0 | PLAT-02-DOCK-10 |
| non-root | `docker exec whoami` + `id` | PLAT-02-DOCK-16, -17 |
| auto-init | 빈 볼륨에서 첫 실행 | PLAT-02-DOCK-18 |

**Anti-pattern 재확인:** bind mount 금지 (AP-1). CI에서는 named volume만 사용한다.

**총 시나리오 수: 18건**

---

## 5. PLAT-03: Desktop App (Tauri) 테스트

**기반 문서:** 39-tauri-desktop-architecture.md (TAURI-DESK)
**자동화 가능성:** MEDIUM (빌드/IPC는 자동화, UI/UX는 수동 QA)

### 5.1 자동화 가능 범위

| ID | 카테고리 | 자동화 방법 | 검증 대상 | 자동화 |
|----|---------|-----------|----------|--------|
| PLAT-03-DESK-01 | Tauri 빌드 성공 | `pnpm tauri build --ci` (또는 `--debug`) | 빌드 산출물 존재 (bundle 디렉토리) | O |
| PLAT-03-DESK-02 | Sidecar SEA 패키징 | Node.js SEA 생성 + 실행 테스트 (import 성공) | waiaas-daemon 바이너리 실행 가능 | O |
| PLAT-03-DESK-03 | IPC 커맨드 정의 | `cargo test` (Rust 단위 테스트) | start_daemon, stop_daemon, get_daemon_status 등 IPC 함수 시그니처 | O |
| PLAT-03-DESK-04 | React 컴포넌트 | Jest + @testing-library/react | UI 로직, 상태 관리, API 호출 위임 | O |
| PLAT-03-DESK-05 | Sidecar-Daemon HTTP | Mock daemon 서버 + fetch 호출 | @waiaas/sdk를 통한 API 호출 정확성 | O |
| PLAT-03-DESK-06 | CI 빌드 matrix | macOS/Windows/Linux 3종 빌드 | 3종 OS에서 `tauri build --ci` 성공 여부 | O |

### 5.2 자동화 한계 명시

| 한계 사항 | 사유 | 대안 |
|----------|------|------|
| **macOS WebDriver 미지원** | Tauri 공식 문서: "macOS lacks desktop WebDriver client support" | 수동 QA 체크리스트 |
| **Sidecar native addon 크로스 컴파일** | sodium-native, better-sqlite3가 플랫폼별 C++ 빌드 필요 | CI matrix 빌드만 검증 (PLAT-03-DESK-06) |
| **시스템 트레이 OS 레벨 접근 불가** | OS 네이티브 UI 요소는 자동화 도구로 접근 불가 | 스크린샷 기반 수동 검증 |
| **WalletConnect QR 흐름** | 외부 모바일 지갑 앱 연동 필요 | 수동 QA (릴리스마다 1회) |

### 5.3 수동 QA 체크리스트

각 항목은 `[검증 단계]`, `[기대 결과]`, `[PASS/FAIL 체크]` 포맷으로 릴리스 QA 시 사용한다.

#### Setup Wizard 5단계 (5건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-01 | 앱 최초 실행 시 Setup Wizard 진입 | Step 1 "마스터 패스워드 설정" 화면 표시 | [ ] |
| PLAT-03-QA-02 | Step 1: 패스워드 입력 + 확인 | 12자 이상 입력 후 다음 단계 진행, 미달 시 에러 | [ ] |
| PLAT-03-QA-03 | Step 2: 체인 선택 (Solana) | Solana 체크박스 선택, EVM은 "Coming Soon" 표시 | [ ] |
| PLAT-03-QA-04 | Step 3: RPC 엔드포인트 설정 | 기본값 표시, 커스텀 입력 가능 | [ ] |
| PLAT-03-QA-05 | Step 4-5: 알림 + 완료 | 설정 요약 표시, "완료" 클릭 시 데몬 자동 시작 | [ ] |

#### 시스템 트레이 3색 (4건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-06 | 데몬 정상 동작 시 트레이 아이콘 | 초록색 아이콘 | [ ] |
| PLAT-03-QA-07 | 데몬 경고 상태 시 트레이 아이콘 | 노란색 아이콘 (어댑터 연결 실패 등) | [ ] |
| PLAT-03-QA-08 | 데몬 중지/에러 시 트레이 아이콘 | 빨간색 아이콘 | [ ] |
| PLAT-03-QA-09 | 트레이 메뉴 항목 동작 | "Open Dashboard", "Stop Daemon", "Quit" 메뉴 정상 동작 | [ ] |

#### WalletConnect QR (3건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-10 | QR 코드 표시 | 설정 > Owner Wallet 연결 > QR 코드 생성 및 표시 | [ ] |
| PLAT-03-QA-11 | 모바일 지갑 스캔 | QR 스캔 후 WalletConnect 세션 수립, 주소 표시 | [ ] |
| PLAT-03-QA-12 | 서명 요청 + 완료 | 거래 승인 시 모바일 지갑에서 서명 요청 수신 및 서명 완료 | [ ] |

#### 8개 화면 UI (8건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-13 | 대시보드 화면 | 잔액, 활성 세션, 대기 거래, Kill Switch 상태 표시 | [ ] |
| PLAT-03-QA-14 | 세션 관리 화면 | 활성 세션 목록, 개별 세션 상세, Revoke 버튼 | [ ] |
| PLAT-03-QA-15 | 거래 승인 화면 | 대기 거래 목록, Approve/Reject 인라인 액션 | [ ] |
| PLAT-03-QA-16 | 에이전트 관리 화면 | 등록된 에이전트 목록, 상태, 체인 정보 | [ ] |
| PLAT-03-QA-17 | 설정 화면 | 포트, 로그 레벨, RPC 엔드포인트, 알림 채널 설정 | [ ] |
| PLAT-03-QA-18 | Kill Switch 화면 | Kill Switch 상태, 활성화/복구 버튼 | [ ] |
| PLAT-03-QA-19 | 알림 화면 | 알림 채널(Telegram/Discord/ntfy.sh) 설정 + 테스트 전송 | [ ] |
| PLAT-03-QA-20 | 로그 화면 | 실시간 데몬 로그 스트리밍 표시 | [ ] |

#### Sidecar 크래시 복구 (3건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-21 | 1회 크래시 후 자동 재시작 | Sidecar 프로세스 kill 후 자동 재시작, 트레이 아이콘 복구 | [ ] |
| PLAT-03-QA-22 | 2회 연속 크래시 후 자동 재시작 | 2회 실패 후 자동 재시작 (max 3x), 경고 알림 | [ ] |
| PLAT-03-QA-23 | 3회 초과 크래시 시 중지 | 3회 재시작 실패 후 에러 상태 전환, 수동 재시작 필요 | [ ] |

#### OS 네이티브 알림 (2건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-24 | 거래 승인 요청 알림 | OS 알림 센터에 거래 승인 요청 표시 | [ ] |
| PLAT-03-QA-25 | 알림 클릭 시 앱 포커스 | 알림 클릭 시 해당 화면으로 앱 포커스 이동 | [ ] |

#### 크로스 플랫폼 (3건)

| ID | 검증 단계 | 기대 결과 | PASS/FAIL |
|----|----------|----------|-----------|
| PLAT-03-QA-26 | macOS 빌드 + 기본 동작 | .dmg 빌드, 설치, 실행, 기본 화면 확인 | [ ] |
| PLAT-03-QA-27 | Windows 빌드 + 기본 동작 | .msi/.exe 빌드, 설치, 실행, 기본 화면 확인 | [ ] |
| PLAT-03-QA-28 | Linux 빌드 + 기본 동작 | .deb/.AppImage 빌드, 설치, 실행, 기본 화면 확인 | [ ] |

### 5.4 CI 빌드 matrix 정의

Tauri 빌드 검증은 **선택적 Stage 4 job**으로, UI 테스트 없이 빌드 성공 여부만 CI에서 확인한다.

```yaml
# release.yml 확장 포인트 (선택적)
platform-tauri:
  needs: [full-test-suite]
  strategy:
    matrix:
      os: [macos-latest, windows-latest, ubuntu-latest]
  runs-on: ${{ matrix.os }}
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup
    - name: Install Tauri dependencies (Linux)
      if: runner.os == 'Linux'
      run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev
    - name: Build Tauri app
      run: pnpm --filter @waiaas/desktop tauri build --ci
```

**총 자동화 시나리오: 6건, 수동 QA 항목: 28건**

---

## 6. PLAT-04: Telegram Bot 테스트

**기반 문서:** 40-telegram-bot-docker.md 섹션 2-7 (TGBOT-DOCK)
**자동화 가능성:** HIGH
**검증 방법:** jest.fn() + global.fetch mock + 서비스 DI mock

### 6.1 Mock 전략 테이블

| 의존성 | Mock 방법 | 근거 |
|--------|----------|------|
| **Telegram API (fetch)** | `jest.fn()` + `global.fetch` 교체 | native fetch 사용이므로 글로벌 mock 간단 |
| **SessionService** | Mock 구현체 (listActive, revoke 등) | DI로 주입, Phase 14 Mock 패턴 적용 |
| **TransactionService** | Mock 구현체 (listPending, approve, reject, setPreApproved) | 동일 |
| **KillSwitchService** | Mock 구현체 (getStatus, activate) | 동일 |
| **HealthService** | Mock 구현체 (getHealth) | 동일 |
| **TelegramChannel** (NOTI-ARCH) | Mock 구현체 (send) | Phase 14 MOCK-ALL-LEVELS-NOTIFICATION 결정 |

### 6.2 검증 패턴

```typescript
// 구현 시 이 패턴을 따른다 (18-RESEARCH.md Pattern 3)
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('TelegramBotService', () => {
  let bot: TelegramBotService
  let mockServices: MockServiceDependencies

  beforeEach(() => {
    mockServices = createMockServices()
    bot = new TelegramBotService(testConfig, mockServices)
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
})
```

### 6.3 시나리오 테이블

#### Category 1: Long Polling (5건)

| ID | 시나리오 | 검증 대상 | 기대 결과 | 자동화 |
|----|---------|----------|----------|--------|
| PLAT-04-TGBOT-01 | getUpdates 정상 응답 처리 | 1회 폴링 결과에서 message 추출 | offset 업데이트, 핸들러 호출 | O |
| PLAT-04-TGBOT-02 | 네트워크 에러 후 5초 재시도 | fetch throw 후 sleep(5000) 호출 | consecutiveErrors 증가, 5초 대기 | O |
| PLAT-04-TGBOT-03 | 3회 연속 실패 -> 30초 백오프 | fetch 3회 연속 throw | consecutiveErrors=0 리셋, 30초 대기 | O |
| PLAT-04-TGBOT-04 | running=false 시 루프 종료 | start() fire-and-forget -> stop() 호출 | while 루프 탈출, "stopped" 로그 | O |
| PLAT-04-TGBOT-05 | 개별 핸들러 에러에 의한 루프 미중단 | 핸들러 throw 후 다음 update 처리 | 에러 로그만 출력, 폴링 계속 | O |

**Long Polling 테스트 주의점:** `start()`를 fire-and-forget으로 실행하고, `running=false` 설정으로 루프를 탈출시킨다. 또는 1회 `getUpdates`만 호출하는 단위 메서드(`processUpdates`)를 별도 노출하여 테스트한다.

#### Category 2: 8개 명령어 (10건)

| ID | 시나리오 | 명령어 | 기대 결과 | 자동화 |
|----|---------|-------|----------|--------|
| PLAT-04-TGBOT-06 | /start 환영 메시지 | `/start` | sendMessage 호출, "WAIaaS Wallet Bot" 포함 | O |
| PLAT-04-TGBOT-07 | /auth 6자리 코드 생성 | `/auth` (미인증 사용자) | sendMessage에 6자리 코드 포함, authCodes에 저장 | O |
| PLAT-04-TGBOT-08 | /auth 이미 인증됨 | `/auth` (인증된 Owner) | "Already connected" 메시지 | O |
| PLAT-04-TGBOT-09 | /status 시스템 요약 (인증됨) | `/status` (인증된 Owner) | HealthService.getHealth() 호출, 상태 정보 표시 | O |
| PLAT-04-TGBOT-10 | /status 미인증 거부 | `/status` (미인증 chatId) | "Unauthorized" 메시지 | O |
| PLAT-04-TGBOT-11 | /sessions 활성 세션 목록 | `/sessions` | SessionService.listActive() 호출, 인라인 키보드 포함 | O |
| PLAT-04-TGBOT-12 | /revoke 세션 폐기 | `/revoke ${sessionId}` | SessionService.revoke() 호출, "revoked" 메시지 | O |
| PLAT-04-TGBOT-13 | /killswitch 확인 키보드 | `/killswitch` | 확인 인라인 키보드(killswitch_confirm/cancel) 표시 | O |
| PLAT-04-TGBOT-14 | /pending 거래 목록 + 키보드 | `/pending` | TransactionService.listPending() 호출, approve/reject 키보드 | O |
| PLAT-04-TGBOT-15 | /help 도움말 | `/help` | 8개 명령어 설명 메시지 | O |

#### Category 3: 5개 인라인 키보드 콜백 (7건)

| ID | 시나리오 | callback_data | 기대 결과 | 자동화 |
|----|---------|--------------|----------|--------|
| PLAT-04-TGBOT-16 | approve:{txId} 사전 승인 | `approve:${txId}` | setPreApproved() 호출, "TELEGRAM_PRE_APPROVED" 메시지 | O |
| PLAT-04-TGBOT-17 | approve:{txId} 소액 직접 승인 | `approve:${txId}` (directApproveEnabled + 임계값 이하) | approve() 직접 호출, "APPROVED (direct)" 메시지 | O |
| PLAT-04-TGBOT-18 | reject:{txId} 거래 거부 | `reject:${txId}` | reject() 호출, "REJECTED" 메시지 | O |
| PLAT-04-TGBOT-19 | revoke:{sessionId} 세션 폐기 | `revoke:${sessionId}` | SessionService.revoke() 호출 | O |
| PLAT-04-TGBOT-20 | killswitch_confirm 활성화 | `killswitch_confirm` | KillSwitchService.activate() 호출, "ACTIVATED" 메시지 | O |
| PLAT-04-TGBOT-21 | killswitch_cancel 취소 | `killswitch_cancel` | editMessage "Cancelled", 상태 변경 없음 | O |
| PLAT-04-TGBOT-22 | 미인증 사용자 콜백 거부 | 임의 콜백 (미인증 chatId) | answerCallbackQuery "Unauthorized" | O |

#### Category 4: 2-Tier 인증 (4건)

| ID | 시나리오 | 검증 대상 | 기대 결과 | 자동화 |
|----|---------|----------|----------|--------|
| PLAT-04-TGBOT-23 | Tier 1: 인증된 Owner 읽기 | `/status` (ownerChatId 일치) | 정상 응답 | O |
| PLAT-04-TGBOT-24 | Tier 1: 미인증 사용자 거부 | `/status` (chatId 불일치) | sendUnauthorized() 호출 | O |
| PLAT-04-TGBOT-25 | /auth 코드 검증 성공 | verifyAuthCode("847291") | chatId 반환, config 업데이트 | O |
| PLAT-04-TGBOT-26 | /auth 코드 만료 | verifyAuthCode (5분 초과) | null 반환 | O |

#### Category 5: MarkdownV2 포맷 (2건)

| ID | 시나리오 | 검증 대상 | 기대 결과 | 자동화 |
|----|---------|----------|----------|--------|
| PLAT-04-TGBOT-27 | 특수 문자 이스케이프 | escapeMarkdownV2("1.5 SOL (test)") | `1\\.5 SOL \\(test\\)` | O |
| PLAT-04-TGBOT-28 | sendMessage parse_mode | 모든 sendMessage 호출 | `parse_mode: 'MarkdownV2'` 포함 확인 | O |

#### Category 6: callback_data 형식 (2건)

| ID | 시나리오 | 검증 대상 | 기대 결과 | 자동화 |
|----|---------|----------|----------|--------|
| PLAT-04-TGBOT-29 | callback_data 64바이트 이내 | 모든 인라인 키보드 콜백 | `approve:${uuid}` 등이 64바이트 미만 | O |
| PLAT-04-TGBOT-30 | action:id 파싱 | "approve:01234567-..." split(':') | [action, targetId] 정확 분리 | O |

#### Category 7: 직접 승인 설정 (2건)

| ID | 시나리오 | 검증 대상 | 기대 결과 | 자동화 |
|----|---------|----------|----------|--------|
| PLAT-04-TGBOT-31 | directApproveEnabled=true + 임계값 이하 | approve 콜백 + 소액 | approve() 직접 호출 (Tier 1 허용) | O |
| PLAT-04-TGBOT-32 | directApproveEnabled=false | approve 콜백 | setPreApproved()만 호출 (Tier 2 필요) | O |

#### Category 8: Graceful Shutdown (2건)

| ID | 시나리오 | 검증 대상 | 기대 결과 | 자동화 |
|----|---------|----------|----------|--------|
| PLAT-04-TGBOT-33 | stop() 호출 후 루프 종료 | stop() -> running=false | 현재 폴링 완료 후 루프 탈출 | O |
| PLAT-04-TGBOT-34 | 데몬 shutdown과 통합 | gracefulShutdown -> TelegramBotService.stop() | Bot이 데몬 종료 시퀀스에 통합 | O |

### 6.4 테스트 레벨 분류

| 레벨 | 범위 | 실행 빈도 | 포함 시나리오 |
|------|------|----------|-------------|
| **Integration** (매 PR) | 명령어/콜백 핸들러 개별 테스트 | Stage 2 | PLAT-04-TGBOT-06 ~ -34 (29건) |
| **Platform** (릴리스) | Long Polling 루프 + Docker 통합 | Stage 4 | PLAT-04-TGBOT-01 ~ -05 (5건) |

**근거:** Telegram Bot은 daemon 패키지 내부 서비스이므로 별도 Platform이 아니다. 명령어/콜백 핸들러는 서비스 로직이며 Integration 레벨에서 충분히 검증된다. Long Polling 루프의 무한 루프 동작과 Docker 컨테이너 내 통합 동작만 Platform 레벨로 분류한다.

**총 시나리오 수: 34건**

---

## 7. CI/CD 파이프라인 통합 매핑

### 7.1 4개 타겟 x Phase 17 4단계 매트릭스

| 타겟 | Stage 1 (매 커밋) | Stage 2 (매 PR) | Stage 3 (nightly) | Stage 4 (릴리스) |
|------|-------------------|-----------------|--------------------|-----------------|
| **CLI Daemon** | - | - | - | `platform-cli` job |
| **Docker** | - | - | - | `platform-docker` job |
| **Tauri Desktop** | - | - | - | `platform-tauri` job (선택적) |
| **Telegram Bot** | - | Integration (명령어/콜백) | - | Platform (Long Polling + Docker) |

### 7.2 Phase 17 release.yml 확장 포인트 상세

#### platform-cli job 확장

```yaml
# release.yml platform-cli job (Phase 18 확장)
platform-cli:
  needs: [full-test-suite]
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: ./.github/actions/setup
    - name: Run CLI platform tests
      run: turbo run test:platform --filter=@waiaas/cli -- --ci --runInBand
```

**실행 시나리오:** PLAT-01-CLI-01 ~ -32 (32건)
- init/start/stop/status 전체 명령어 검증
- SIGINT/SIGTERM signal 테스트 (Linux)
- exit codes 0-5 전체 검증
- E2E 전체 흐름 (init -> start -> status -> stop -> status)

#### platform-docker job 확장

```yaml
# release.yml platform-docker job (Phase 18 확장)
platform-docker:
  needs: [full-test-suite]
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - name: Docker platform tests
      run: |
        # 빌드
        docker build -t waiaas:test .
        # 이미지 크기 확인
        IMAGE_SIZE=$(docker image inspect waiaas:test --format '{{.Size}}')
        echo "Image size: $IMAGE_SIZE bytes"
        if [ "$IMAGE_SIZE" -gt 400000000 ]; then
          echo "::warning::Image size exceeds 400MB"
        fi
        # 기동 + healthcheck
        docker run -d --name waiaas-test \
          -p 3100:3100 \
          -v waiaas-test-data:/home/waiaas/.waiaas \
          -e WAIAAS_DAEMON_HOSTNAME=0.0.0.0 \
          -e WAIAAS_MASTER_PASSWORD=test-password-12345 \
          waiaas:test
        for i in $(seq 1 10); do
          sleep 3
          curl -sf http://127.0.0.1:3100/health && break
        done
        curl -sf http://127.0.0.1:3100/health || (docker logs waiaas-test && exit 1)
        # non-root 확인
        docker exec waiaas-test whoami | grep waiaas
        docker exec waiaas-test id | grep 1001
        # grace period
        docker stop --time 35 waiaas-test
        # 정리
        docker rm -f waiaas-test
        docker volume rm waiaas-test-data
```

**실행 시나리오:** PLAT-02-DOCK-01 ~ -18 (18건) 중 CI에서 실행 가능한 핵심 항목

#### platform-tauri job (선택적)

Tauri 빌드 검증은 CI 시간이 상당(~30min/platform)하므로 선택적 Stage 4 job으로 정의한다.

```yaml
# release.yml platform-tauri job (선택적)
platform-tauri:
  needs: [full-test-suite]
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: macos-latest
          target: aarch64-apple-darwin
        - os: windows-latest
          target: x86_64-pc-windows-msvc
        - os: ubuntu-latest
          target: x86_64-unknown-linux-gnu
  runs-on: ${{ matrix.os }}
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup
    - name: Install system dependencies (Linux)
      if: runner.os == 'Linux'
      run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev
    - name: Build Tauri app
      run: pnpm --filter @waiaas/desktop tauri build --ci
```

### 7.3 Telegram Bot Integration 실행 근거

Telegram Bot 명령어/콜백 핸들러는 Stage 2(매 PR)에서 Integration으로 실행된다. 근거:

1. **daemon 패키지 내부 서비스:** TelegramBotService는 `packages/daemon/src/infrastructure/telegram/`에 위치하며, 별도 배포 타겟이 아닌 daemon 서비스의 일부이다
2. **Mock 기반 검증:** Telegram API를 mock하고, 서비스 의존성(Session, Transaction 등)을 DI mock하므로 실제 환경 의존성이 없다
3. **Platform은 루프만:** Long Polling 무한 루프의 실행/중단 동작과 Docker 컨테이너 내 통합만이 환경 의존적이므로 Platform 레벨로 분류한다

---

## 8. Phase 14/17 결정 정합성 검증표

### 8.1 Phase 14 결정 정합성

| # | 결정 ID | 내용 | 본 문서 적용 | 정합 |
|---|---------|------|-------------|:----:|
| 1 | TLVL-01 | Platform 레벨은 릴리스 시 실행 | CLI/Docker는 Stage 4 `platform-cli`/`platform-docker` job, Tauri는 선택적 Stage 4 | O |
| 2 | TLVL-01 | Platform Jest 설정: 레벨별 개별 설정 | CLI는 `--runInBand` + spawn, Docker는 bash 스크립트, Tauri는 빌드만 | O |
| 3 | MOCK-ALL-LEVELS-NOTIFICATION | 알림 채널은 모든 테스트 레벨에서 Mock | PLAT-04 Telegram Bot 테스트에서 TelegramChannel Mock (AP-3) | O |
| 4 | CONTRACT-TEST-FACTORY-PATTERN | 5개 인터페이스 Contract Test 팩토리 | PLAT-04 서비스 Mock이 Contract Test를 통과하는 구현체 사용 | O |
| 5 | CI-GATE (Soft->Hard) | 패키지별 독립 전환, Soft gate 초기 | Platform 테스트는 Hard gate 대상 아님 (빌드/기동 성공 여부만 게이트) | O |

### 8.2 Phase 17 결정 정합성

| # | 결정 ID | 내용 | 본 문서 적용 | 정합 |
|---|---------|------|-------------|:----:|
| 6 | CICD-4STAGE | 4단계 파이프라인 (매커밋/매PR/nightly/릴리스) | CLI/Docker는 Stage 4, Telegram 핸들러는 Stage 2 Integration, Tauri는 선택적 Stage 4 | O |
| 7 | release.yml platform-cli | `turbo run test:platform --filter=@waiaas/cli -- --ci` | 32건 CLI 시나리오로 확장 (섹션 3) | O |
| 8 | release.yml platform-docker | `docker build + health check` 골격 | 18건 Docker 시나리오로 확장: named volume, 환경변수, grace period, non-root (섹션 4) | O |
| 9 | CICD-SOFT-HARD-PRIORITY | Soft->Hard 전환 우선순위 6단계 | Platform 테스트는 커버리지 게이트 대상 외 (빌드/기동 성공 = pass/fail) | O |
| 10 | CICD-TEST-NO-CACHE | turbo.json test:* 태스크 cache: false | test:platform 태스크도 cache: false 적용 | O |

### 8.3 기존 결정과의 불일치 사항

| # | 항목 | 불일치 내용 | 해결 방안 |
|---|------|-----------|----------|
| 1 | Telegram Bot이 Platform이 아닌 Integration | Phase 14 매트릭스에서 Telegram Bot이 명시적으로 분류되지 않음 | 명령어/콜백 핸들러는 Integration(매 PR), Long Polling 루프만 Platform(릴리스)으로 분리. 본 문서 섹션 6.4에서 명시 |
| 2 | Tauri 빌드가 Stage 4에 미포함 | Phase 17 release.yml에 Tauri job 없음 | 선택적 Stage 4 job으로 추가 (섹션 7.2). CI 시간 제약으로 필수가 아닌 선택 |

### 8.4 정합성 결과

- **Phase 14 결정 5건:** 5/5 정합 (O)
- **Phase 17 결정 5건:** 5/5 정합 (O)
- **불일치 2건:** 해결 방안 명시
- **총계:** 10/10 (100%) 정합성 확인

---

## 9. Pitfalls 요약

Research에서 도출한 6개 pitfall을 간결하게 정리한다.

| # | Pitfall | 발생 조건 | 대응 | Warning Sign |
|---|---------|----------|------|-------------|
| P1 | **포트 충돌** | 여러 CLI 테스트가 동일 포트 3100 바인딩 시도 | `--runInBand` 필수 + 테스트별 고유 포트 (3100 + offset) | CI에서 간헐적 EADDRINUSE |
| P2 | **Docker 잔존 컨테이너** | 이전 테스트 실패 시 teardown 미실행 | beforeAll/afterAll에서 `docker rm -f` + `docker volume rm` 강제 정리 | "container name already in use" |
| P3 | **Long Polling 무한 루프** | TelegramBotService.start()를 await하면 hang | start() fire-and-forget + running=false로 탈출, 또는 단위 메서드 노출 | Jest --forceExit 없이 미종료 |
| P4 | **SEA native addon 미포함** | Node.js SEA에 sodium-native/better-sqlite3 누락 | SEA 빌드 후 실행 테스트(import 성공 여부) 수행 | "Cannot find module" |
| P5 | **hostname 오버라이드 미테스트** | Docker 내부 127.0.0.1 바인딩 시 port mapping 미동작 | WAIAAS_DAEMON_HOSTNAME=0.0.0.0 검증 필수 (PLAT-02-DOCK-07) | "connection refused" |
| P6 | **Windows 시그널** | Linux/macOS에서만 테스트하면 Windows SIGTERM 미동작 | HTTP /v1/admin/shutdown fallback (PLAT-01-CLI-24) + 조건부 Unit 테스트 (PLAT-01-CLI-25) | Windows에서 stop 미동작 |

---

## 10. 요약 통계

### 10.1 타겟별 시나리오 수 합계

| 타겟 | 요구사항 | 자동화 가능 | 수동 QA | 합계 | 자동화 비율 |
|------|---------|-----------|---------|------|-----------|
| CLI Daemon | PLAT-01 | 32 | 0 | 32 | HIGH (100%) |
| Docker | PLAT-02 | 18 | 0 | 18 | HIGH (100%) |
| Tauri Desktop | PLAT-03 | 6 | 28 | 34 | MEDIUM (18%) |
| Telegram Bot | PLAT-04 | 34 | 0 | 34 | HIGH (100%) |
| **합계** | | **90** | **28** | **118** | - |

### 10.2 자동화 가능성 분류

| 분류 | 타겟 | 근거 |
|------|------|------|
| **HIGH** | CLI Daemon | child_process.spawn으로 전체 프로세스 라이프사이클 자동화 가능 |
| **HIGH** | Docker | docker CLI로 빌드/실행/검증/정리 전체 자동화 가능 |
| **MEDIUM** | Tauri Desktop | 빌드/IPC/React 컴포넌트는 자동화, UI/UX는 수동 QA 필수 (macOS WebDriver 미지원) |
| **HIGH** | Telegram Bot | jest.fn() + global.fetch mock + 서비스 DI mock으로 전체 자동화 가능 |

### 10.3 v0.4 테스트 전략 완결 선언

Phase 14~18을 통해 정의된 v0.4 테스트 전략 전체 범위:

| Phase | 주제 | 산출물 | 핵심 내용 |
|-------|------|--------|----------|
| **14** | 테스트 기반 정의 | 41-42 (2건) | 6개 레벨, 9모듈 매트릭스, 4-tier 커버리지, Mock 경계 + Contract Test |
| **15** | 보안 시나리오 | 43-47 (5건) | 71건 보안 시나리오 (5개 공격 레이어) |
| **16** | 블록체인/Enum/Config | 48-49 (2건) | Mock RPC 13건, E2E 5흐름, Devnet 3건, Enum SSoT 검증 |
| **17** | CI/CD 파이프라인 | 50 (1건) | 4단계 파이프라인, GitHub Actions 워크플로우 4개, 커버리지 게이트 |
| **18** | 배포 타겟별 테스트 | 51 (1건) | CLI 32건, Docker 18건, Tauri 6+28건, Telegram 34건 = 118건 시나리오 |

**총 설계 문서 11건, 총 시나리오 ~300건 이상 (보안 71 + 블록체인 21 + 플랫폼 118 + 기타).**

v0.4 테스트 전략 수립이 완결되었다. 구현 단계에서는 이 문서들을 참조하여 테스트 코드를 작성한다.

---

## 11. 참조 문서

| # | 문서 | 내용 | 참조 위치 |
|---|------|------|----------|
| 1 | 28-daemon-lifecycle-cli.md (CORE-05) | CLI 7-step startup, 10-step shutdown, exit codes 0-5, signal handling, Windows fallback | PLAT-01 전체 |
| 2 | 39-tauri-desktop-architecture.md (TAURI-DESK) | Sidecar SEA, IPC commands, System Tray 3-color, 8 screens, crash recovery | PLAT-03 전체 |
| 3 | 40-telegram-bot-docker.md (TGBOT-DOCK) | TelegramBotService 8 commands/5 callbacks, Docker Dockerfile/compose/secrets/volume | PLAT-02, PLAT-04 전체 |
| 4 | 41-test-levels-matrix-coverage.md (TLVL-01~03) | Platform 레벨 정의, 모듈 매트릭스, 커버리지 4-tier | 섹션 1.3, 7, 8 |
| 5 | 42-mock-boundaries-interfaces-contracts.md | Mock 경계 매트릭스, Contract Test 팩토리 패턴 | PLAT-04 Mock 전략 |
| 6 | 50-cicd-pipeline-coverage-gate.md (CICD-01~03) | release.yml platform-cli/platform-docker job 골격, 4단계 파이프라인 | 섹션 7 |

---

*문서 ID: 51-platform-test-scope*
*Phase: 18-deploy-target-test*
*Requirements: PLAT-01, PLAT-02, PLAT-03, PLAT-04*
*Status: Confirmed*
