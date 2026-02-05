---
phase: 09-integration-client-interface-design
plan: 04
subsystem: telegram-bot-docker
tags: [telegram-bot, docker, inline-keyboard, long-polling, 2-tier-auth, docker-compose, named-volume, docker-secrets]
requires:
  - "09-01 (API-SPEC: REST API 전체 스펙 -- Owner API 엔드포인트 참조)"
  - "08-03 (NOTI-ARCH: TelegramChannel 알림 발송, native fetch 결정)"
  - "08-02 (OWNR-CONN: ownerAuth 인증 모델, 2-Tier 갭 분석)"
  - "08-04 (KILL-AUTO-EVM: Kill Switch API)"
  - "06-04 (CORE-05: 데몬 라이프사이클, Graceful Shutdown)"
  - "06-01 (CORE-01: ~/.waiaas/ 디렉토리 구조)"
provides:
  - "TGBOT-DOCK: Telegram 인터랙티브 봇 + Docker 배포 스펙 설계 문서"
  - "Phase 9 Success Criteria #5: Telegram Bot + Docker 설계 완성"
affects:
  - "v0.3 구현 (Telegram Bot + Docker 실제 구현)"
tech-stack:
  added: []
  patterns:
    - "Long Polling (getUpdates) native fetch 기반 -- Webhook 대신"
    - "2-Tier 인증 모델 (chatId Tier 1 / ownerAuth Tier 2)"
    - "TELEGRAM_PRE_APPROVED 거래 상태 (사전 승인 -> 지갑 서명 최종)"
    - "Docker Multi-stage build (builder + production)"
    - "Docker Secrets + _FILE 환경변수 패턴"
    - "Named volume (SQLite WAL 호환)"
key-files:
  created:
    - ".planning/deliverables/40-telegram-bot-docker.md"
  modified: []
key-decisions:
  - "Long Polling 선택 (Self-Hosted에 외부 Webhook URL 불필요)"
  - "native fetch 전용 (NOTI-ARCH 결정 유지, Bot 프레임워크 미사용)"
  - "2-Tier 인증: Tier 1 chatId (방어적), Tier 2 ownerAuth (자금 이동)"
  - "TELEGRAM_PRE_APPROVED 상태 추가 (Telegram 의향 표시 + Desktop/CLI 최종 서명)"
  - "6자리 코드 기반 /auth 명령 (chatId 안전 교차 검증)"
  - "direct_approve 기본 비활성 (보안 최우선, 소액 편의는 명시적 활성화)"
  - "Named volume 필수 (bind mount + SQLite WAL + macOS VirtioFS 호환성 문제)"
  - "Docker Secrets + _FILE 패턴 (docker inspect 노출 방지)"
  - "Non-root waiaas:1001 (최소 권한 원칙)"
  - "stop_grace_period 35s (데몬 30초 graceful shutdown + 5초 마진)"
  - "wget healthcheck (Alpine 기본 포함, curl 추가 설치 불필요)"
  - "Telegram Bot은 outbound HTTPS만 필요 (인바운드 포트 추가 불필요)"
duration: "~8min"
completed: "2026-02-05"
---

# Phase 9 Plan 04: Telegram 인터랙티브 봇 + Docker 배포 스펙 Summary

**One-liner:** TelegramBotService Long Polling 8개 명령어 + 인라인 키보드 승인/거부 + 2-Tier chatId/ownerAuth 인증 모델 + Docker multi-stage + named volume + Secrets + 15개 섹션 완전 설계

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 minutes |
| Started | 2026-02-05T12:57:15Z |
| Completed | 2026-02-05T13:05:01Z |
| Tasks | 2/2 |
| Files created | 1 |
| Lines written | 2163 |

## Accomplishments

### Task 1: Telegram 인터랙티브 봇 명령 체계 + 인라인 키보드 + 인증 모델 설계
- TelegramBotService 아키텍처: TelegramChannel (NOTI-ARCH 알림 발송)을 확장하여 명령 수신 + 인터랙션 기능 추가
- Long Polling 설계: getUpdates offset/timeout=30/allowed_updates, 에러 5초/30초 백오프
- 8개 봇 명령어: /start, /auth (6자리 코드 교차 검증), /status, /sessions, /revoke, /killswitch (확인 키보드), /pending, /help
- 인라인 키보드: callback_data approve:{txId}/reject:{txId}/revoke:{sessionId}/killswitch_confirm/killswitch_cancel, 64바이트 이내
- 2-Tier 승인 모델: Tier 1 (chatId) 방어적 동작 (reject, revoke, kill switch, read-only) / Tier 2 (ownerAuth SIWS/SIWE) 자금 이동/복구
- TELEGRAM_PRE_APPROVED 상태: Telegram Approve -> 중간 상태 -> Desktop/CLI 최종 서명으로 APPROVED 전이
- direct_approve 선택 옵션: 소액 APPROVAL 직접 승인 (기본 비활성, config.toml 명시 활성화)
- chatId 인증: Telegram Bot API from.id 서버 측 검증 신뢰, Bot 토큰 보안이 핵심 전제

### Task 2: Docker 배포 스펙 (Dockerfile + docker-compose + 볼륨 + 시크릿)
- Docker 이미지: node:22-alpine Multi-stage build (builder + production), ~250-350MB 예상
- Dockerfile: Stage 1 builder (pnpm + native addon 빌드), Stage 2 production (non-root waiaas:1001)
- Entrypoint: 마스터 패스워드/Bot 토큰 _FILE 패턴, 첫 실행 시 waiaas init 자동 실행
- docker-compose.yml: named volume, Docker Secrets (master_password), 127.0.0.1 바인딩, healthcheck wget
- Named volume: SQLite WAL 호환성, macOS Docker Desktop VirtioFS bind mount 문제 회피
- Docker Secrets: /run/secrets/ tmpfs 저장, 환경변수 직접 전달 비추천
- 네트워킹: 127.0.0.1 전용, SSH 터널/Reverse Proxy 외부 접근 가이드
- Docker 라이프사이클: up/down/logs/restart/update, stop_grace_period 35s graceful shutdown
- Telegram Bot + Docker 통합: docker-compose.telegram.yml override, outbound HTTPS만 필요
- 보안: non-root, no-new-privileges, read-only FS 옵션, Trivy/cosign, 디스크 암호화 권장

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1+2 | Telegram Bot + Docker 전체 설계 | 8e0f923 | 40-telegram-bot-docker.md (15 sections, 2163 lines) |

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `.planning/deliverables/40-telegram-bot-docker.md` | 2163 | TGBOT-DOCK: Telegram Bot + Docker 배포 스펙 |

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Long Polling (Webhook 대신) | Self-Hosted에 외부 접근 가능한 URL 불필요. Telegram getUpdates로 충분 |
| 2 | native fetch 전용 (telegraf/grammY 미사용) | NOTI-ARCH 결정 유지. 의존성 최소화 |
| 3 | 2-Tier 인증 모델 | Telegram에서 지갑 서명 불가 -> chatId로 방어적 동작만 허용 |
| 4 | TELEGRAM_PRE_APPROVED 상태 추가 | 거래 상태 머신 확장: Telegram 의향 -> Desktop/CLI 서명 분리 |
| 5 | 6자리 코드 /auth 명령 | chatId 교차 검증의 유일한 안전 경로 |
| 6 | direct_approve 기본 비활성 | 보안 최우선. 소액 편의는 Owner가 명시적으로 활성화 |
| 7 | Named volume (bind mount 금지) | SQLite WAL + macOS Docker VirtioFS mmap() 호환성 문제 |
| 8 | Docker Secrets + _FILE 패턴 | docker inspect에 시크릿 노출 방지 |
| 9 | Non-root waiaas:1001 | 컨테이너 탈출 시 영향 최소화 |
| 10 | stop_grace_period: 35s | CORE-05 30초 graceful shutdown + 5초 마진 |
| 11 | wget healthcheck | Alpine busybox 기본 포함, curl 추가 설치 불필요 |
| 12 | Telegram Bot outbound only | Long Polling은 인바운드 포트 불필요, 방화벽 설정 최소화 |

## Deviations from Plan

None -- plan executed exactly as written. Task 1과 Task 2가 동일 파일을 대상으로 하므로 단일 커밋으로 통합함.

## Issues Encountered

None.

## Next Phase Readiness

- **v0.3 구현:** Telegram Bot 명령어 핸들러, Long Polling 루프, Callback Query 처리 구현 가능
- **v0.3 Docker:** Dockerfile + docker-compose.yml + entrypoint.sh 작성 가능
- **Phase 9 완료 시:** 모든 외부 인터페이스 (REST API, SDK, MCP, Desktop, Telegram, Docker) 설계 완성

**Blockers:** None
**Concerns:** None
