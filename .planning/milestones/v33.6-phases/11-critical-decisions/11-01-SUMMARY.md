---
phase: 11-critical-decisions
plan: 01
outcome: success
subsystem: design-consistency
tags: [port, hostname, docker, transaction-status, fund-deposit, zod]

requires:
  - phase-10 (v0.1 잔재 정리 완료)

provides:
  - CRIT-01 해결: 기본 포트 3100 통일 (24-monorepo, 28-daemon)
  - CRIT-02 해결: TransactionStatusEnum 8개 SSoT + 클라이언트 표시 가이드 (37-rest-api)
  - CRIT-03 해결: WAIAAS_DAEMON_HOSTNAME 환경변수 오버라이드 설계 (29-api, 24-monorepo, 40-telegram)
  - CRIT-04 해결: 자금 충전 사용 사례 문서화 (37-rest-api)

affects:
  - phase-12 (HIGH 스키마/수치 통일 -- config.toml 정합성)
  - phase-13 (MEDIUM 구현 노트)

tech-stack:
  patterns:
    - z.union hostname validation (127.0.0.1 | 0.0.0.0)
    - WAIAAS_DAEMON_HOSTNAME environment variable override
    - TransactionStatus + Tier combination mapping

key-files:
  modified:
    - .planning/deliverables/24-monorepo-data-directory.md
    - .planning/deliverables/28-daemon-lifecycle-cli.md
    - .planning/deliverables/29-api-framework-design.md
    - .planning/deliverables/37-rest-api-complete-spec.md
    - .planning/deliverables/40-telegram-bot-docker.md

decisions:
  - CRIT-01: 기본 포트 3100 확정 (3000/3001/8080 충돌 회피)
  - CRIT-02: DB 8개 상태 SSoT 확인, 클라이언트 표시는 상태+tier 조합
  - CRIT-03: hostname z.union 허용 (기본 127.0.0.1, Docker 전용 0.0.0.0)
  - CRIT-04: 자금 충전은 Owner 외부 지갑에서 Agent 주소로 직접 전송

metrics:
  duration: ~5min
  completed: 2026-02-06
---

# Phase 11 Plan 01: CRITICAL 의사결정 확정 Summary

CRITICAL 4건 의사결정을 확정하고 5개 설계 문서에 반영. 포트 3100 통일, Docker hostname 오버라이드 z.union 설계, 트랜잭션 상태 SSoT 표시 가이드, 자금 충전 사용 사례 문서화 완료.

---

## Task Commits

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | 기본 포트 3100 통일 (CRIT-01) | `7125d93` | 24-monorepo: port/cors 3000->3100, Zod default. 28-daemon: CLI 예시 8곳 수정 |
| 2 | Docker hostname 오버라이드 설계 (CRIT-03) | `b4907ec` | 29-api: z.literal->z.union + 보안 경고. 24-monorepo: hostname 0.0.0.0 허용 + 환경변수. 40-telegram: docker-compose 환경변수 |
| 3 | 상태 표시 가이드 + 자금 충전 문서화 (CRIT-02, CRIT-04) | `c4305cf` | 37-rest-api: 8개 상태+tier 매핑 테이블, Owner->Agent 직접 전송 절차 |

---

## Decisions Made

### CRIT-01: 기본 포트 3100 확정

- **결정**: 모든 문서에서 기본 포트를 3100으로 통일
- **근거**: 3000/3001/8080 등 흔히 사용되는 포트와 충돌 회피 (CORE-06에서 이미 결정)
- **수정 범위**: 24-monorepo (config.toml SSoT, Zod 스키마, cors_origins), 28-daemon (CLI 예시 8곳)
- **영향**: 이미 3100을 사용하던 29-api, 37-rest-api, 40-telegram과 이제 일관됨

### CRIT-02: TransactionStatusEnum 8개 SSoT + 클라이언트 표시 가이드

- **결정**: DB 상태 8개가 SSoT이며, 클라이언트 표시 텍스트는 상태+tier 조합으로 결정
- **근거**: v0.1의 14개 상태를 8개로 간소화한 결정 유지. 클라이언트별 표시는 재량이지만 가이드 제공
- **추가 내용**: QUEUED+INSTANT="실행 준비됨", QUEUED+DELAY="대기 중 (15분 후 실행)", QUEUED+APPROVAL="Owner 승인 대기 중"
- **영향**: Telegram Bot, Tauri Desktop 모두 이 매핑을 참조

### CRIT-03: WAIAAS_DAEMON_HOSTNAME 환경변수 오버라이드

- **결정**: hostname을 z.union([z.literal('127.0.0.1'), z.literal('0.0.0.0')])으로 제한. 기본값 127.0.0.1 유지
- **근거**: Docker 컨테이너 내부에서 127.0.0.1 바인딩은 Docker bridge 네트워크를 통한 포트 매핑이 불가. 0.0.0.0 바인딩이 필요하되, 호스트 측 ports에서 127.0.0.1:3100:3100으로 제한
- **보안 원칙**: 기본값은 항상 127.0.0.1 (보안 최우선). 0.0.0.0은 Docker 전용, 호스트 포트 매핑에서 반드시 127.0.0.1 제한 필수
- **수정 범위**: 29-api (Zod 스키마 + 보안 경고), 24-monorepo (설정 테이블 + 환경변수), 40-telegram (docker-compose 환경변수 + 네트워킹 설명)

### CRIT-04: 자금 충전 사용 사례

- **결정**: WAIaaS API에 "자금 입금" 전용 엔드포인트 없음. Owner 외부 지갑에서 Agent 주소로 직접 전송
- **근거**: v0.2는 Owner Private Key에 접근하지 않음 (Self-Hosted 보안 원칙). Squads Vault PDA 경유 없이 직접 전송
- **절차**: GET /v1/wallet/address -> Owner 외부 전송 -> GET /v1/wallet/balance 확인
- **v0.1 대비**: Squads Vault PDA -> 직접 전송, 다층 예산 관리 -> policies 테이블 대체

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Files Modified

| File | Changes |
|------|---------|
| `24-monorepo-data-directory.md` | port 3000->3100 (5곳), hostname z.union + 0.0.0.0 허용, WAIAAS_DAEMON_HOSTNAME 환경변수, 섹션 3.6 보안 정책 업데이트 |
| `28-daemon-lifecycle-cli.md` | 127.0.0.1:3000->3100 (8곳): mermaid 다이어그램, CLI usage, 출력 예시, status 출력 |
| `29-api-framework-design.md` | z.literal->z.union hostname, serve() hostname config 참조, Docker 보안 경고 추가, WAIAAS_DAEMON_HOSTNAME 환경변수 설명 |
| `37-rest-api-complete-spec.md` | 클라이언트 상태 표시 가이드 섹션 추가 (10행 매핑 테이블), 자금 충전 사용 사례 섹션 추가 (v0.1 비교표 포함) |
| `40-telegram-bot-docker.md` | docker-compose WAIAAS_DAEMON_HOSTNAME=0.0.0.0, 호스트 포트 매핑 설명 명확화, 환경변수 참조 테이블에 추가, full docker-compose에도 반영 |

---

## Verification Results

| Check | Result |
|-------|--------|
| Port 3000 absent in 24-monorepo | PASS |
| Port 3000 absent in 28-daemon | PASS |
| Port 3100 present in 24-monorepo | PASS |
| 127.0.0.1:3100 present in 28-daemon | PASS |
| z.union in 29-api-framework | PASS |
| WAIAAS_DAEMON_HOSTNAME in 40-telegram | PASS |
| hostname 0.0.0.0 in 24-monorepo | PASS |
| Client status guide in 37-rest-api | PASS |
| QUEUED+DELAY mapping in 37-rest-api | PASS |
| Fund deposit section in 37-rest-api | PASS |
| Squads Vault comparison in 37-rest-api | PASS |
| Cross-doc: 24-monorepo <-> 29-api hostname | PASS |
| Cross-doc: 29-api <-> 40-telegram WAIAAS_DAEMON_HOSTNAME | PASS |

---

## Next Phase Readiness

- Phase 12 (HIGH 스키마/수치 통일) 진행 가능
- 포트/hostname 통일이 완료되어 config.toml SSoT 기반 정합성 작업에 참조 가능
- 트랜잭션 상태 SSoT 확정으로 Enum 대응표 작업 기반 확보

## Self-Check: PASSED
