# Phase 18: 배포 타겟별 테스트 - Research

**Researched:** 2026-02-06
**Domain:** Platform-level testing for 4 deployment targets (CLI Daemon, Docker, Desktop/Tauri, Telegram Bot)
**Confidence:** HIGH

## Summary

Phase 18은 WAIaaS의 4개 배포 타겟(CLI Daemon, Docker Container, Tauri Desktop, Telegram Bot) 각각에 대한 테스트 범위, 시나리오, 검증 방법, 자동화 전략을 확정하는 설계 페이즈이다. Phase 14에서 정의한 Platform 테스트 레벨(릴리스 시 실행)과 Phase 17의 CI/CD Stage 4(릴리스 파이프라인)에 통합되는 구체적인 테스트 계획을 산출한다.

4개 타겟 각각은 기존 설계 문서(28, 39, 40번)에 상세 스펙이 확정되어 있으므로, 이 연구는 "무엇을 테스트할지"보다 "어떻게 테스트하고 자동화 한계가 어디인지"에 초점을 맞춘다. CLI Daemon과 Docker는 자동화 가능 범위가 넓고(child_process spawn + docker CLI), Tauri Desktop은 자동화 한계가 크며(WebDriver macOS 미지원, Sidecar SEA 크로스 컴파일), Telegram Bot은 Mock 서버를 활용한 자동화가 가능하다.

**Primary recommendation:** 4개 타겟별로 자동화 가능 테스트와 수동 QA 체크리스트를 명확히 분리하고, Phase 17의 release.yml Stage 4 파이프라인에 CLI/Docker 자동 테스트를 통합하되, Tauri/Telegram은 로컬 검증 절차로 관리한다.

---

## Standard Stack

Phase 18은 설계 문서 산출 페이즈이므로 새로운 라이브러리 도입은 없다. 테스트 시 사용할 기존 스택과 도구를 정리한다.

### Core (Phase 14에서 확정)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Jest | 30.x | 테스트 러너 | Phase 14 TLVL-01에서 확정, @swc/jest 트랜스폼 |
| child_process (Node.js) | 22.x builtin | CLI 프로세스 spawn/signal 테스트 | Node.js 내장, 외부 의존성 없음 |
| Docker CLI | latest | Docker build/run/healthcheck 자동화 | CI runner에 기본 설치 |
| docker compose | v2+ | compose 통합 테스트 | GitHub Actions runner에 포함 |

### Supporting (Platform 테스트 전용)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| execa 또는 Node.js child_process | builtin | CLI 바이너리 실행 + exit code 검증 | CLI Platform 테스트 |
| telegram-test-api | 3.x | Telegram Bot API 로컬 에뮬레이터 | Telegram Bot 자동 테스트 |
| WebdriverIO (wdio) | 8.x+ | Tauri E2E (선택적) | Desktop 자동화 테스트 (macOS 제한 있음) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| telegram-test-api | jest.fn() 직접 mock | 직접 mock이 더 간단하나 Long Polling 루프 통합 검증 불가 |
| WebdriverIO | Playwright | Tauri는 WebdriverIO 공식 지원. Playwright는 Tauri 미지원 |
| child_process 직접 사용 | execa | execa가 API 편리하나 0-dep 원칙 위배. child_process로 충분 |

---

## Architecture Patterns

### 테스트 디렉토리 구조

```
packages/
├── cli/
│   └── __tests__/
│       └── platform/           # PLAT-01: CLI Platform 테스트
│           ├── init.platform.test.ts
│           ├── start-stop.platform.test.ts
│           ├── status.platform.test.ts
│           └── signal.platform.test.ts
├── daemon/
│   └── __tests__/
│       └── platform/           # PLAT-02: Docker + 일부 통합
│           └── docker.platform.test.ts  (선택: 스크립트로 대체 가능)
├── desktop/
│   └── __tests__/
│       └── platform/           # PLAT-03: Tauri 빌드/IPC 테스트
│           └── QA-CHECKLIST.md  (수동 QA 체크리스트)
└── daemon/
    └── __tests__/
        └── platform/
            └── telegram-bot.platform.test.ts  # PLAT-04: Telegram Bot 테스트
```

### Pattern 1: CLI Process Spawn 테스트

**What:** child_process.spawn으로 실제 CLI 바이너리를 실행하고 exit code, stdout, stderr을 검증
**When to use:** CLI init/start/stop/status 전체 흐름 검증
**Confidence:** HIGH (Node.js child_process API는 안정적이고 잘 문서화됨)

```typescript
// Source: Node.js child_process documentation
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
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

// 테스트 예시
test('init creates data directory', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'waiaas-test-'))
  const result = await runCli(['init', '--non-interactive', '--data-dir', tmpDir], {
    WAIAAS_MASTER_PASSWORD: 'test-password-12345',
  })
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain('initialized successfully')
})
```

### Pattern 2: Docker 빌드 + Healthcheck 테스트

**What:** docker build -> docker run -> healthcheck 폴링 -> 검증 -> docker stop
**When to use:** Docker 이미지 빌드 가능 여부, 컨테이너 기동 및 헬스 확인
**Confidence:** HIGH (Phase 17 release.yml에 이미 골격 존재)

```bash
# Phase 17 release.yml platform-docker job에서 정의된 패턴
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

### Pattern 3: Telegram Bot Mock 테스트

**What:** Telegram API 호출을 mock/intercept하여 명령어 핸들러 + 인라인 키보드 콜백을 검증
**When to use:** TelegramBotService의 8개 명령어와 5개 콜백 액션 검증
**Confidence:** HIGH (native fetch mock은 Jest에서 잘 지원됨)

```typescript
// fetch를 mock하여 Telegram API 응답을 시뮬레이션
// TelegramBotService를 직접 인스턴스화하고 서비스 의존성을 Mock 주입

const mockFetch = jest.fn()
global.fetch = mockFetch

// getUpdates 응답 mock (Long Polling 시뮬레이션)
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    ok: true,
    result: [{
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123456, is_bot: false, first_name: 'Owner' },
        chat: { id: 123456, type: 'private' },
        text: '/status',
        date: Date.now() / 1000,
      },
    }],
  }),
})

// sendMessage 응답 mock
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({ ok: true, result: { message_id: 2 } }),
})
```

### Pattern 4: Tauri 빌드 검증 + 수동 QA 체크리스트

**What:** tauri build 성공 여부를 CI에서 확인하고, UI/UX는 수동 QA 체크리스트로 관리
**When to use:** Tauri Desktop 앱의 릴리스 전 검증
**Confidence:** MEDIUM (Tauri 자동 테스트는 macOS WebDriver 미지원으로 제한적)

```bash
# CI에서 빌드만 검증 (UI 테스트 없음)
cd packages/desktop
pnpm tauri build --debug  # 또는 --ci 모드

# 빌드 산출물 존재 확인
ls src-tauri/target/release/bundle/
```

### Anti-Patterns to Avoid

- **Anti-pattern: Docker 테스트에서 bind mount 사용:** SQLite WAL 모드가 macOS VirtioFS에서 불안정. 반드시 named volume 사용 (문서 40 섹션 10.2 결정사항)
- **Anti-pattern: Tauri UI 자동화에 Playwright 사용:** Tauri는 Playwright를 공식 지원하지 않음. WebdriverIO만 공식 지원하나 macOS에서도 제한적
- **Anti-pattern: Telegram Bot 테스트에서 실제 API 호출:** 외부 서비스 의존성으로 테스트 불안정. Phase 14 MOCK-ALL-LEVELS-NOTIFICATION 결정에 따라 전 레벨 Mock 필수
- **Anti-pattern: CLI 테스트에서 Windows SIGTERM 의존:** Windows에서 SIGTERM이 동작하지 않으므로 HTTP /v1/admin/shutdown fallback 테스트 필수

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram API Mock | HTTP 서버 직접 구현 | jest.fn() + global.fetch mock 또는 telegram-test-api | native fetch mock이 더 간단하고 Jest 생태계에 통합됨 |
| CLI exit code 테스트 | process.exit mock | child_process.spawn + close event | 실제 프로세스 실행이 exit code/signal을 정확히 검증 |
| Docker healthcheck 폴링 | 커스텀 폴링 루프 | curl + retry 또는 docker wait --condition | 쉘 스크립트로 충분, 별도 도구 불필요 |
| Process liveness check | OS-specific 코드 | process.kill(pid, 0) | Node.js 크로스 플랫폼 지원 (ESRCH 에러로 판별) |

---

## Common Pitfalls

### Pitfall 1: CLI 테스트에서 포트 충돌

**What goes wrong:** 여러 CLI 테스트가 동시 실행되면 동일 포트(3100)에 바인딩 시도하여 EADDRINUSE 에러
**Why it happens:** Jest 기본 --maxWorkers=75%로 병렬 실행, 각 테스트가 데몬을 spawn
**How to avoid:** Platform 테스트는 `--runInBand` (순차 실행) 필수. 또는 테스트별 고유 포트 할당 (3100 + workerIndex)
**Warning signs:** CI에서 간헐적 실패, 로컬에서는 성공

### Pitfall 2: Docker 테스트에서 이전 컨테이너 잔존

**What goes wrong:** 이전 테스트의 컨테이너/볼륨이 정리되지 않아 다음 테스트에 영향
**Why it happens:** 테스트 실패 시 teardown이 실행되지 않음
**How to avoid:** beforeAll/afterAll에서 `docker rm -f waiaas-test` + `docker volume rm` 강제 정리. CI에서는 각 job이 새 runner이므로 덜 문제
**Warning signs:** 로컬에서 반복 실행 시 "container name already in use" 에러

### Pitfall 3: Telegram Long Polling 테스트에서 무한 루프

**What goes wrong:** TelegramBotService.start()가 while(running) 무한 루프이므로 테스트가 hang
**Why it happens:** start() 를 await하면 영원히 해결되지 않는 Promise
**How to avoid:** start()를 fire-and-forget으로 실행하고, running=false 설정 후 루프 탈출 대기. 또는 1회 getUpdates만 호출하는 단위 메서드를 별도 노출하여 테스트
**Warning signs:** Jest --forceExit 없이 테스트가 종료되지 않음

### Pitfall 4: Tauri Sidecar SEA에 native addon 미포함

**What goes wrong:** Node.js SEA 바이너리에 sodium-native, better-sqlite3 등 C++ addon이 포함되지 않아 런타임 에러
**Why it happens:** Node.js SEA는 JavaScript만 번들링, native addon은 별도 처리 필요
**How to avoid:** SEA 빌드 후 반드시 실행 테스트(import 성공 여부) 수행. 크로스 컴파일 환경에서 addon 호환성 검증
**Warning signs:** "Cannot find module" 또는 "ELF header" 에러

### Pitfall 5: Docker hostname 오버라이드 미테스트

**What goes wrong:** 컨테이너 내부에서 127.0.0.1로 바인딩하면 Docker port mapping이 동작하지 않음
**Why it happens:** Zod literal('127.0.0.1')로 hostname이 고정되어 있는데 Docker에서는 0.0.0.0 필수
**How to avoid:** WAIAAS_DAEMON_HOSTNAME=0.0.0.0 환경변수 오버라이드가 정상 동작하는지 반드시 검증. config.toml Zod 스키마에서 환경변수 오버라이드 경로 확인
**Warning signs:** docker run 후 curl이 "connection refused"

### Pitfall 6: Windows 시그널 테스트 누락

**What goes wrong:** Linux/macOS에서만 테스트하면 Windows에서 SIGTERM 미동작으로 데몬 종료 불가
**Why it happens:** Windows는 SIGTERM을 보낼 수 없음 (listen만 가능). HTTP /v1/admin/shutdown fallback 필요
**How to avoid:** Windows fallback 경로를 명시적으로 문서화하고, CI에서 Windows runner 테스트 또는 조건부 분기 코드를 Unit 테스트로 검증
**Warning signs:** Windows 사용자가 `waiaas stop` 실행 시 데몬이 종료되지 않음

---

## 4개 타겟별 상세 조사 결과

### PLAT-01: CLI Daemon 테스트

**기반 문서:** 28-daemon-lifecycle-cli.md (CORE-05)
**Confidence:** HIGH

#### 테스트 시나리오 카테고리

| Category | Scenarios | Automation |
|----------|-----------|------------|
| init | 정상 초기화, 이미 초기화됨 에러, --force 재초기화, --non-interactive | 자동화 가능 (child_process spawn) |
| start | 정상 시작, 미초기화 exit(3), 이미 실행중 exit(2), 패스워드 오류 exit(4), 포트 충돌 exit(1), --daemon 모드 | 자동화 가능 |
| stop | 정상 종료, PID 파일 없음 exit(3), stale PID 정리, --force SIGKILL, 타임아웃 exit(5) | 자동화 가능 |
| status | 데몬 실행 중 상태, 데몬 중지 상태, --json 출력 | 자동화 가능 |
| Signal | SIGINT graceful, SIGTERM graceful, SIGHUP config reload, SIGUSR1 상태 덤프, 이중 시그널 방지 | 자동화 가능 (Linux/macOS) |
| Windows | HTTP /v1/admin/shutdown fallback, SIGBREAK 핸들링 | 조건부 (Windows CI runner 필요) |
| Exit Codes | 0 성공, 1 일반에러, 2 이미실행중, 3 미초기화, 4 인증실패, 5 타임아웃 | 자동화 가능 |

#### 검증 방법

1. **프로세스 spawn 방식:** `child_process.spawn`으로 실제 CLI 바이너리 실행, exit code와 stdout/stderr 캡처
2. **임시 데이터 디렉토리:** 각 테스트마다 `mkdtempSync`로 독립된 `--data-dir` 사용하여 격리
3. **시그널 테스트:** `process.kill(pid, signal)` 호출 후 프로세스 종료 확인
4. **포트 할당:** 테스트별 고유 포트 (3100 + offset) 사용하여 충돌 방지
5. **타임아웃 제어:** `--timeout 5` 등 짧은 타임아웃으로 테스트 속도 확보

#### 전체 흐름 시나리오 (E2E-like)

```
init --non-interactive --data-dir $TMPDIR
  -> start --data-dir $TMPDIR --port $PORT
    -> status --data-dir $TMPDIR --json (running 확인)
      -> stop --data-dir $TMPDIR
        -> status --data-dir $TMPDIR (stopped 확인)
```

### PLAT-02: Docker 테스트

**기반 문서:** 40-telegram-bot-docker.md (TGBOT-DOCK) 섹션 8-15
**Confidence:** HIGH

#### 테스트 시나리오 카테고리

| Category | Scenarios | Automation |
|----------|-----------|------------|
| 빌드 | Multi-stage build 성공, 이미지 크기 확인 (<400MB) | 자동화 가능 (docker build) |
| compose | docker-compose up 정상 기동, docker-compose down graceful | 자동화 가능 |
| named volume | 데이터 영속화 (stop -> start 후 DB 유지), 볼륨 삭제 시 초기화 | 자동화 가능 |
| 환경변수 | WAIAAS_DAEMON_HOSTNAME=0.0.0.0 오버라이드 동작, WAIAAS_DAEMON_PORT 커스텀 | 자동화 가능 |
| hostname 오버라이드 | 컨테이너 내 0.0.0.0 바인딩 + 호스트 측 127.0.0.1 포트 매핑 | 자동화 가능 |
| grace period | stop_grace_period: 35s 내 graceful shutdown 완료 | 자동화 가능 (docker stop --time) |
| Secrets | _FILE 패턴 (WAIAAS_MASTER_PASSWORD_FILE) | 자동화 가능 |
| healthcheck | 30s 주기 healthcheck 동작, unhealthy 판정 | 자동화 가능 (docker inspect) |
| non-root | waiaas:1001 사용자로 실행 확인 | 자동화 가능 (docker exec whoami) |
| 첫 실행 | config.toml 없을 때 auto-init | 자동화 가능 |

#### 검증 방법

1. **빌드 테스트:** `docker build -t waiaas:test .` 성공 + 이미지 크기 어서션
2. **기동 + healthcheck:** `docker run` -> 폴링 -> `/health` 200 OK
3. **named volume 영속성:** run -> init -> stop -> run -> DB 데이터 존재 확인
4. **hostname 오버라이드:** `WAIAAS_DAEMON_HOSTNAME=0.0.0.0` 환경변수 + 호스트에서 curl 127.0.0.1:3100 접근
5. **grace period:** `docker stop --time 35 waiaas-test` -> exit code 0 (graceful) 확인
6. **Secrets:** /run/secrets/ 에 파일 마운트 후 데몬이 정상 시작하는지 확인

#### CI 통합 (Phase 17 release.yml)

Phase 17에서 이미 platform-docker job이 정의됨:
```yaml
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
```

Phase 18에서 이 골격을 확장하여 named volume, 환경변수, grace period 시나리오를 추가한다.

### PLAT-03: Desktop App (Tauri) 테스트

**기반 문서:** 39-tauri-desktop-architecture.md (TAURI-DESK)
**Confidence:** MEDIUM (자동화 한계로 인해 수동 QA 비중 높음)

#### 자동화 가능 범위

| Category | Automation | Method |
|----------|------------|--------|
| Tauri 빌드 | 자동화 가능 | `pnpm tauri build --ci` (빌드 성공 여부만) |
| Sidecar SEA 패키징 | 자동화 가능 | Node.js SEA 생성 -> 실행 테스트 (import 성공) |
| IPC 커맨드 정의 | 자동화 가능 | Rust 단위 테스트 (`cargo test`) |
| React 컴포넌트 | 자동화 가능 | Jest + @testing-library/react (UI 로직만) |
| Sidecar <-> Daemon HTTP | 자동화 가능 | Mock daemon 서버 + fetch 호출 테스트 |

#### 수동 QA 필수 범위

| Category | Why Manual | Checklist Items |
|----------|-----------|-----------------|
| Setup Wizard 5단계 | UI 흐름 + 사용자 입력 검증 | 각 단계 진입/완료, 뒤로가기, 에러 상태 |
| 시스템 트레이 3색 | OS 네이티브 트레이 아이콘 | 초록/노랑/빨강 상태 전환, 메뉴 항목 동작 |
| WalletConnect QR | 외부 지갑 앱 연동 | QR 표시, 모바일 스캔, 서명 완료 |
| 8개 화면 UI | 시각적 검증 | 대시보드, 세션 관리, 거래 승인, 에이전트 관리, 설정, Kill Switch, 알림, 로그 |
| Sidecar 크래시 복구 | 2회 실패 -> 자동 재시작 max 3x | 크래시 시뮬레이션, 재시작 카운터, 에러 상태 전환 |
| OS 네이티브 알림 | macOS/Windows/Linux 별도 동작 | 알림 표시, 클릭 시 앱 포커스 |
| 크로스 플랫폼 | macOS/Windows/Linux 3종 | 각 OS에서 빌드 + 실행 + 기본 동작 |

#### 자동화 한계 명시

| Limitation | Reason | Workaround |
|-----------|--------|------------|
| macOS WebDriver 미지원 | Tauri 공식 문서 확인: "macOS lacks desktop WebDriver client support" | 수동 QA 체크리스트 |
| Sidecar native addon 크로스 컴파일 | sodium-native, better-sqlite3가 플랫폼별 C++ 빌드 필요 | CI matrix (ubuntu/macos/windows) 빌드만 검증 |
| 시스템 트레이 자동화 불가 | OS 레벨 UI 요소 접근 불가 | 스크린샷 기반 수동 검증 |
| WalletConnect QR 흐름 | 외부 모바일 앱 연동 | 수동 QA (릴리스마다 1회) |

### PLAT-04: Telegram Bot 테스트

**기반 문서:** 40-telegram-bot-docker.md (TGBOT-DOCK) 섹션 2-7
**Confidence:** HIGH

#### 테스트 시나리오 카테고리

| Category | Scenarios | Automation |
|----------|-----------|------------|
| Long Polling | getUpdates 정상 응답, 네트워크 에러 재시도 (5s), 3회 연속 실패 -> 30s 백오프, running=false 시 루프 종료 | 자동화 가능 (fetch mock) |
| 8개 명령어 | /start, /auth, /status, /sessions, /revoke, /killswitch, /pending, /help | 자동화 가능 |
| 인라인 키보드 | approve:{txId}, reject:{txId}, revoke:{sessionId}, killswitch_confirm, killswitch_cancel | 자동화 가능 |
| 2-Tier 인증 | Tier 1 chatId 검증 (read-only), 미인증 사용자 거부, /auth 6자리 코드 플로우 | 자동화 가능 |
| MarkdownV2 포맷 | 특수 문자 이스케이프 (`.`, `-`, `(`, `)` 등) | 자동화 가능 (출력 문자열 검증) |
| callback_data | 64바이트 이내 검증, 액션:ID 파싱 | 자동화 가능 |
| 직접 승인 | directApproveEnabled + threshold 이하 소액 직접 승인 | 자동화 가능 |
| Graceful shutdown | stop() 호출 -> running=false -> 현재 폴링 완료 후 종료 | 자동화 가능 |

#### Mock 전략

| Dependency | Mock Method | Rationale |
|-----------|-------------|-----------|
| Telegram API (fetch) | jest.fn() + global.fetch 교체 | native fetch 사용이므로 글로벌 mock 간단 |
| SessionService | Mock 구현체 (listActive, revoke 등) | DI로 주입, Phase 14 Mock 패턴 적용 |
| TransactionService | Mock 구현체 (listPending, approve, setPreApproved) | 동일 |
| KillSwitchService | Mock 구현체 (getStatus, activate) | 동일 |
| HealthService | Mock 구현체 (getHealth) | 동일 |
| TelegramChannel (NOTI-ARCH) | Mock 구현체 (send) | Phase 14 MOCK-ALL-LEVELS-NOTIFICATION 결정 |

#### 테스트 구조

```typescript
describe('TelegramBotService', () => {
  let bot: TelegramBotService
  let mockServices: MockServiceDependencies

  beforeEach(() => {
    mockServices = createMockServices()
    bot = new TelegramBotService(testConfig, mockServices)
    global.fetch = jest.fn()
  })

  describe('Command Handlers', () => {
    // 8개 명령어 각각 테스트
    test('/status returns system summary for authorized owner')
    test('/status rejects unauthorized chatId')
    test('/pending lists transactions with inline keyboard')
    test('/killswitch shows confirmation keyboard')
    test('/auth generates 6-digit code')
  })

  describe('Callback Query Handlers', () => {
    // 5개 콜백 액션 테스트
    test('approve:{txId} sets TELEGRAM_PRE_APPROVED')
    test('reject:{txId} rejects transaction')
    test('killswitch_confirm activates kill switch')
  })

  describe('Long Polling', () => {
    test('processes updates and advances offset')
    test('retries on network error with 5s delay')
    test('backs off 30s after 3 consecutive errors')
    test('stops when running is set to false')
  })

  describe('2-Tier Auth', () => {
    test('Tier 1: authorized owner can read status')
    test('Tier 1: unauthorized chatId gets rejection')
    test('direct approve for small amounts when enabled')
  })
})
```

---

## Phase 14/17 연동 포인트

### Phase 14 연동

| Phase 14 결정 | Phase 18 적용 |
|--------------|--------------|
| TLVL-01: Platform 레벨은 릴리스 시 실행 | 4개 타겟 테스트 모두 release.yml Stage 4에 배치 |
| MOCK-ALL-LEVELS-NOTIFICATION | Telegram Bot 테스트에서 알림 채널 완전 Mock |
| Contract Test 팩토리 패턴 | 서비스 의존성(Session, Transaction 등) Mock 시 Contract Test 통과 보장 |
| CI-GATE Soft->Hard | Platform 테스트는 Hard gate 대상 아님 (빌드/기동 성공 여부만 게이트) |

### Phase 17 연동

| Phase 17 구조 | Phase 18 확장 |
|--------------|--------------|
| release.yml platform-cli job | CLI init/start/stop/status + signal + exit code 시나리오 상세화 |
| release.yml platform-docker job | named volume, 환경변수, grace period, non-root 시나리오 추가 |
| Tauri 빌드는 Stage 4에 미포함 | Tauri는 수동 QA 체크리스트 + 별도 빌드 검증 job (선택적) |
| Telegram Bot은 Stage 4에 미포함 | Telegram Bot은 Unit/Integration 레벨로 매 PR 실행 (Platform 레벨이 아닌 서비스 테스트) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Docker 테스트에 docker-compose v1 | docker compose v2 (plugin) | 2023 | `docker-compose` -> `docker compose` 명령어 변경 |
| Tauri 1 WebDriver | Tauri 2 WebdriverIO (제한적) | 2024-2025 | macOS WebDriver 여전히 미지원 |
| telegraf/grammY 기반 봇 | native fetch Long Polling | v0.2 설계 결정 | 프레임워크 의존성 없음, mock이 더 간단 |
| Node.js SEA 초기 (20.x) | Node.js 22 SEA (안정화) | 2024 | native addon 포함은 여전히 제한적 |

---

## Open Questions

1. **Tauri CI 빌드 matrix**
   - What we know: macOS/Windows/Linux 3종 빌드가 필요하나 CI 시간이 상당함 (~30min/platform)
   - What's unclear: Phase 18 설계 범위에서 CI matrix를 어디까지 정의할지
   - Recommendation: 빌드 성공 여부만 검증하고, Sidecar SEA + native addon 호환성은 구현 단계에서 검증

2. **Windows CI runner 비용**
   - What we know: GitHub Actions Windows runner는 Linux 대비 2x 비용 (분 단위 과금)
   - What's unclear: Windows fallback (HTTP /v1/admin/shutdown) 테스트를 CI에서 할지 로컬에서 할지
   - Recommendation: Windows 특화 코드 경로는 Unit 테스트(조건부 분기)로 커버하고, 실제 Windows 프로세스 테스트는 수동/선택적

3. **Telegram Bot Integration vs Platform 레벨 분류**
   - What we know: Phase 14에서 Telegram Bot은 daemon 패키지 내부 서비스이므로 별도 Platform이 아님
   - What's unclear: PLAT-04가 Integration 수준 테스트인지 Platform 수준인지
   - Recommendation: 명령어/콜백 핸들러는 Integration(매 PR), Long Polling 루프 + Docker 통합은 Platform(릴리스)으로 분리

---

## Sources

### Primary (HIGH confidence)
- 28-daemon-lifecycle-cli.md -- CLI 7-step startup, 10-step shutdown, exit codes 0-5, signal handling, Windows fallback 전체 스펙
- 39-tauri-desktop-architecture.md -- Sidecar SEA, IPC commands, System Tray 3-color, 8 screens, crash recovery
- 40-telegram-bot-docker.md -- TelegramBotService, Long Polling, 8 commands, inline keyboard, Docker Dockerfile/compose/secrets/volume
- 41-test-levels-matrix-coverage.md -- Platform 레벨 정의, 모듈 매트릭스 (@waiaas/cli O, Desktop App O)
- 50-cicd-pipeline-coverage-gate.md -- release.yml platform-cli, platform-docker job 골격
- 42-mock-boundaries-interfaces-contracts.md -- Mock 경계 매트릭스, Contract Test 패턴

### Secondary (MEDIUM confidence)
- [Tauri 2 Testing Documentation](https://v2.tauri.app/develop/tests/) -- Mock runtime, WebDriver E2E (macOS 미지원 확인)
- [telegram-test-api](https://github.com/jehy/telegram-test-api) -- Telegram Bot API 로컬 에뮬레이터 (native fetch와의 호환성 검증 필요)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) -- spawn, exit code, signal 처리

### Tertiary (LOW confidence)
- [Docker Compose Health Check GitHub Action](https://github.com/marketplace/actions/docker-compose-health-check) -- compose 헬스체크 자동화 (직접 스크립트로 대체 가능)
- [TestDriver.ai for Tauri](https://docs.testdriver.ai/v6/apps/tauri-apps) -- AI 기반 Tauri 테스트 도구 (실험적, 프로덕션 검증 미흡)

---

## Metadata

**Confidence breakdown:**
- CLI Daemon 테스트 (PLAT-01): HIGH -- 설계 문서 28번이 매우 상세하고, child_process 테스트 패턴은 잘 확립됨
- Docker 테스트 (PLAT-02): HIGH -- 설계 문서 40번 + Phase 17 release.yml에 골격 존재
- Desktop App 테스트 (PLAT-03): MEDIUM -- 자동화 한계가 명확하나, 수동 QA 범위 정의에 주관성 존재
- Telegram Bot 테스트 (PLAT-04): HIGH -- fetch mock 패턴이 단순하고, 서비스 DI 구조가 테스트에 유리

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- stable design phase, no fast-moving dependencies)
