---
phase: 158-platform-test
plan: 02
subsystem: platform-tests
tags: [docker, telegram, platform-test, deployment]
dependency-graph:
  requires: []
  provides: [PLAT-02, PLAT-03]
  affects: [Dockerfile, docker-compose.yml, entrypoint.sh, telegram-bot-service, telegram-auth]
tech-stack:
  added: []
  patterns: [file-parsing-tests, in-memory-db-mock-api, update-simulation]
key-files:
  created:
    - packages/daemon/src/__tests__/platform/docker.platform.test.ts
    - packages/daemon/src/__tests__/platform/telegram-bot.platform.test.ts
  modified: []
decisions:
  - COMPOSE-02 healthcheck regex를 CMD 배열 포맷 호환하도록 완화 (curl.*-f.*)
metrics:
  duration: 5min
  completed: 2026-02-17
---

# Phase 158 Plan 02: Docker + Telegram Bot Platform Tests Summary

Docker 파일 파싱 테스트 18건 + Telegram Bot 인메모리 DB/Mock API 테스트 34건으로 배포 타겟별 구조적 정합성과 운영 안정성을 검증.

## Tasks Completed

### Task 1: Docker Platform Tests (18 scenarios)

**Commit:** `c6a6154`

Dockerfile, docker-compose.yml, docker-compose.secrets.yml, entrypoint.sh를 readFileSync + 정규식으로 파싱하여 Docker 없이 CI에서 검증 가능한 구조 테스트를 작성.

| Category | Count | Verified |
|----------|-------|----------|
| Build (multi-stage) | 2 | builder+runner 2단계, --prod 플래그 |
| Compose | 2 | waiaas-daemon 서비스, healthcheck |
| Volume | 2 | waiaas-data:/data, WAIAAS_DATA_DIR |
| Env | 2 | NODE_ENV/HOSTNAME/DATA_DIR, env_file |
| Hostname | 1 | 0.0.0.0 바인딩 |
| Graceful Shutdown | 2 | exec PID 1, entrypoint chain |
| Secrets | 2 | file_env 3변수, secrets.yml 경로 |
| Healthcheck | 2 | 타이밍 파라미터, Dockerfile/compose 동일 URL |
| Non-root | 2 | waiaas:1001, /data /app ownership |
| Auto-init | 1 | start --data-dir 명령어 |

### Task 2: Telegram Bot Platform Tests (34 scenarios)

**Commit:** `3df88e8`

인메모리 SQLite + Mock TelegramApi로 외부 의존 없이 전체 명령어/콜백/인증/에러복구 흐름을 검증.

| Category | Count | Verified |
|----------|-------|----------|
| Polling | 5 | start/stop/backoff/reset/fatal-401 |
| Commands | 10 | /start(2), /help, /status, /wallets(2), /pending(2), /approve, /reject |
| Callbacks | 7 | approve/reject/killswitch-confirm/cancel/newsession/unauth/unknown |
| Auth | 4 | PENDING/READONLY/unregistered denied, ADMIN all-access |
| Format | 2 | escapeMarkdownV2 전체 특수문자, /status MarkdownV2 |
| CallbackData | 2 | 4-prefix 라우팅, 콜론 ID 파싱 |
| DirectApprove | 2 | /approve + /reject 직접 명령어 |
| Shutdown | 2 | stop 플래그, DaemonLifecycle 소스 검증 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] docker-compose.yml healthcheck regex 수정**
- **Found during:** Task 1
- **Issue:** docker-compose.yml healthcheck이 `["CMD", "curl", "-f", ...]` 배열 포맷으로 되어 있어 `curl\s+-f` 정규식이 매치하지 않음
- **Fix:** `curl.*-f.*` 패턴으로 완화하여 문자열/배열 포맷 모두 호환
- **Files modified:** docker.platform.test.ts
- **Commit:** c6a6154

## Requirements Coverage

| Requirement | Status | Tests |
|-------------|--------|-------|
| PLAT-02 Docker 플랫폼 테스트 | PASS | 18/18 |
| PLAT-03 Telegram Bot 플랫폼 테스트 | PASS | 34/34 |

## Verification

```
Test Files  2 passed (2)
Tests       52 passed (52)
Duration    ~10s
```

기존 Telegram 테스트 3개 파일 (68건) 모두 통과 확인.

## Self-Check: PASSED

- FOUND: packages/daemon/src/__tests__/platform/docker.platform.test.ts
- FOUND: packages/daemon/src/__tests__/platform/telegram-bot.platform.test.ts
- FOUND: commit c6a6154
- FOUND: commit 3df88e8
