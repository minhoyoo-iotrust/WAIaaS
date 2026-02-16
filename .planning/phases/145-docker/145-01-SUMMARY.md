---
phase: 145-docker
plan: "01"
subsystem: docker
tags: [docker, dockerfile, compose, entrypoint, multi-stage, non-root]
dependency-graph:
  requires: []
  provides: [Dockerfile, docker-compose.yml, docker/entrypoint.sh, .dockerignore]
  affects: [deployment, CI/CD]
tech-stack:
  added: [Docker multi-stage build, docker compose]
  patterns: [_FILE secret injection, exec PID 1 replacement, layer caching optimization]
key-files:
  created:
    - Dockerfile
    - docker-compose.yml
    - docker/entrypoint.sh
    - .dockerignore
  modified: []
decisions:
  - "node:22-slim 기반 (glibc 호환 -- native addon prebuildify 바이너리 사용)"
  - "builder 단계 python3/make/g++ 설치 (sodium-native, better-sqlite3, argon2 빌드용)"
  - "runner 단계 curl만 설치 (HEALTHCHECK용, 최소 런타임 의존성)"
  - "pnpm install --frozen-lockfile --prod (runner에서 devDependencies 제외)"
  - "127.0.0.1:3100 포트 매핑 (외부 노출 방지)"
  - "#!/bin/sh 사용 (slim 이미지 bash 미보장)"
metrics:
  duration: "2m 24s"
  completed: "2026-02-16"
  tasks: 2
  files: 4
---

# Phase 145 Plan 01: Dockerfile + docker-compose.yml + entrypoint.sh Summary

Multi-stage Dockerfile (builder: pnpm+turbo build, runner: non-root UID 1001) + docker-compose.yml (named volume + localhost 포트 매핑 + HEALTHCHECK) + entrypoint.sh (_FILE 패턴 시크릿 주입 + exec PID 1)

## What Was Built

### Task 1: .dockerignore + Multi-stage Dockerfile

**Dockerfile** -- 2-stage 빌드:
- **builder**: `node:22-slim` + python3/make/g++ (native addon) + pnpm + turbo build
  - 레이어 캐싱 최적화: workspace config -> package.json -> pnpm install -> source copy -> turbo build
  - `pnpm turbo build --filter=@waiaas/daemon...` (admin UI 포함)
- **runner**: `node:22-slim` + curl (HEALTHCHECK) + non-root waiaas(UID 1001)
  - `pnpm install --frozen-lockfile --prod` (production deps only)
  - 8개 패키지 dist 복사 (core, daemon, admin public, solana, evm, cli, sdk, mcp)
  - `EXPOSE 3100`, `HEALTHCHECK` (30s interval, /health), `USER waiaas`

**.dockerignore** -- 빌드 컨텍스트 최소화:
- node_modules, dist, .turbo, .git, .env*, .planning, objectives, docs, *.tsbuildinfo 제외

### Task 2: entrypoint.sh + docker-compose.yml

**docker/entrypoint.sh** -- Docker Secrets 통합:
- `file_env()` 함수: `*_FILE` 환경변수 파일 내용을 원본 변수로 설정
- 지원: `WAIAAS_MASTER_PASSWORD_FILE`, `WAIAAS_TELEGRAM_BOT_TOKEN_FILE`, `WAIAAS_NOTIFICATIONS_TELEGRAM_BOT_TOKEN_FILE`
- 동일 변수에 직접 값 + _FILE 동시 설정 시 에러 (안전장치)
- `exec node` -- PID 1 교체로 SIGTERM 직접 수신

**docker-compose.yml** -- 원클릭 배포:
- `waiaas-data` named volume -> `/data` (영속성, compose down에도 유지)
- `127.0.0.1:3100:3100` 포트 매핑 (외부 노출 방지)
- `.env` 파일 지원 (optional)
- `restart: unless-stopped`
- Docker Secrets 사용법 주석 안내 (Swarm + file-based)

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d40cce0 | Multi-stage Dockerfile + .dockerignore |
| 2 | 91a050a | entrypoint.sh + docker-compose.yml |

## Self-Check: PASSED

All 4 files exist. Both commit hashes verified in git log.
