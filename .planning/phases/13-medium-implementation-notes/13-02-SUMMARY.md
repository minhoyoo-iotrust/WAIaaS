# Phase 13 Plan 02: 통합/인증/배포 구현 노트 Summary

**One-liner:** Tauri IPC+HTTP 이중 채널 에러 분류표, Setup Wizard vs CLI init 역할 분담, Telegram SIWS 대체 TELEGRAM_PRE_APPROVED 패턴을 3개 설계 문서에 구현 노트로 추가

---

phase: 13-medium-implementation-notes
plan: 02
subsystem: client-integration
tags: [tauri, ipc, http, setup-wizard, cli-init, telegram, siws, tier-2, implementation-notes]

dependency-graph:
  requires: [phase-12]
  provides: [NOTE-05-ipc-http-error, NOTE-06-setup-wizard-cli-init, NOTE-07-telegram-siws-alternative]
  affects: [v0.4-implementation]

tech-stack:
  added: []
  patterns: [ipc-http-hybrid-error-handling, telegram-pre-approved-pattern, wizard-cli-role-separation]

key-files:
  created: []
  modified:
    - .planning/deliverables/39-tauri-desktop-architecture.md
    - .planning/deliverables/28-daemon-lifecycle-cli.md
    - .planning/deliverables/40-telegram-bot-docker.md

decisions:
  - id: NOTE-05
    decision: "Tauri IPC + HTTP 이중 채널 에러를 4가지 유형으로 분류하고, ECONNREFUSED 시 자동 데몬 시작 시도"
    rationale: "두 채널의 에러 유형이 다르므로 통합 처리 전략이 구현 전 필요"
  - id: NOTE-06
    decision: "패스워드 최소 길이 12자로 통일 권장, CLI=최소 초기화 / Wizard=CLI init+API 호출 조합"
    rationale: "보안 우선 원칙, CLI와 Wizard의 역할 분담 명확화"
  - id: NOTE-07
    decision: "Telegram Tier 2 인증은 TELEGRAM_PRE_APPROVED 패턴으로 대체, SIWS는 Desktop/CLI 필수"
    rationale: "Telegram에서 지갑 서명 UX 복잡도가 높아 실용성 부족, 보안 원칙 유지"

metrics:
  duration: "~4min"
  completed: "2026-02-06"

---

## Task Commits

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Tauri 이중 채널 + Setup Wizard 순서 + Telegram SIWS 구현 노트 | `1fe33fd` | 3개 문서에 NOTE-05, NOTE-06, NOTE-07 추가 |

## Changes Made

### NOTE-05: IPC + HTTP 이중 채널 에러 처리 전략 (39-tauri-desktop-architecture.md)

- **에러 분류표:** IPC 에러, HTTP 에러, ECONNREFUSED, 혼합 시퀀스 에러 4가지 유형
- **ECONNREFUSED 처리:** HTTP 실패 -> IPC로 데몬 상태 확인 -> 미실행이면 자동 시작 -> HTTP 재시도 (최대 1회)
- **상태 동기화 패턴:** IPC DaemonStatus + HTTP /health 조합으로 5가지 최종 상태 결정
- **React 에러 통합:** useDaemonHealth() hook, Toast(일시적) vs Banner(지속적) 패턴

### NOTE-06: Setup Wizard vs CLI init 초기화 순서 관계 (39-tauri + 28-daemon)

- **차이점 비교표:** 패스워드 길이, 에이전트 생성, Owner 연결, 알림 채널, 순서 5개 항목 비교
- **통합 근거:** CLI = 최소 초기화(데몬 실행 최소 상태), Wizard = CLI init + 데몬 시작 + API 호출
- **패스워드 통일:** CLI 12자 유지, Wizard 8자 -> 12자 통일 권장 (설계 변경은 v0.4)
- **양쪽 문서 크로스레퍼런스:** 39-tauri에서 28-daemon 참조, 28-daemon에서 39-tauri 참조

### NOTE-07: Telegram Tier 2 인증 SIWS 대체 방안 (40-telegram-bot-docker.md)

- **TELEGRAM_PRE_APPROVED 패턴:** 4단계 흐름 (Pre-Approve -> 중간 상태 -> Desktop/CLI 최종 승인)
- **Tier별 동작 분류표:** Tier 1(chatId) 4개 동작, Tier 2(ownerAuth) 4개 동작 명확 분리
- **보안 근거:** 자금 이동/복구는 지갑 서명 필수, Telegram은 알림 + 방어적 동작 채널
- **v0.3+ 확장:** Telegram Mini App + WalletConnect DeepLink 연동 가능성 언급

## 13-01 병렬 실행 조율

Plan 13-01이 병렬 실행 중이었으며, 다음과 같이 조율됨:
- **28-daemon-lifecycle-cli.md:** 13-01이 섹션 9.1 (NOTE-08) 추가 완료. 13-02는 섹션 9.2 (NOTE-06)로 소제목 추가.
- **40-telegram-bot-docker.md:** 13-01이 blockquote 참조만 추가 (섹션 헤더 미추가). 13-02가 섹션 16 "구현 노트" 생성 + 16.1 (NOTE-07) 추가.
- **39-tauri-desktop-architecture.md:** 13-01 수정 없음. 13-02가 섹션 13 "구현 노트" 생성 + 13.1 (NOTE-05), 13.2 (NOTE-06) 추가.

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 패스워드 12자 통일은 "권장"으로 표현 | 설계 변경이 아닌 구현 시 참고 (v0.3 범위 유지) |
| Tauri 에러 표시는 Toast/Banner 이분법 | React UI 패턴으로 적절한 수준의 가이드 |
| TELEGRAM_PRE_APPROVED는 기존 설계 보강 | 섹션 6에서 이미 정의된 패턴을 구현 노트로 명시화 |

## Verification Results

All success criteria met:
- [x] 39-tauri에 IPC/HTTP 에러 분류표 + ECONNREFUSED 전략 + Setup Wizard 차이점 표 존재
- [x] 28-daemon에 CLI init vs Setup Wizard 역할 분담 설명 존재
- [x] 40-telegram에 TELEGRAM_PRE_APPROVED 패턴 상세 + Tier 1/2 동작 분류 존재
- [x] 3개 문서 모두 기존 설계 미변경 (구현 노트 섹션만 추가/확장)
- [x] 28-daemon, 40-telegram에서 13-01과 13-02 구현 노트가 같은 섹션 내 공존

## Next Phase Readiness

v0.3 Phase 13 (13-02) 완료. Phase 13 전체 완료 시 v0.3 마일스톤이 종료된다.

## Self-Check: PASSED
