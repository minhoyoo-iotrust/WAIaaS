---
phase: 06-core-architecture-design
plan: 04
subsystem: daemon, cli
tags: [daemon-lifecycle, graceful-shutdown, signal-handling, pid-management, cli, parseArgs, npm-global, hono-server, background-workers]

requires:
  - phase: 06-01
    provides: 모노레포 패키지 구조 (packages/cli, packages/daemon/lifecycle), ~/.waiaas/ 데이터 디렉토리, config.toml [daemon] 섹션, SQLite PRAGMA 설정
  - phase: 06-02
    provides: ILocalKeyStore unlock()/lock() 인터페이스, sodium guarded memory 수명주기, 마스터 패스워드 3경로 해석
  - phase: 06-03
    provides: AdapterRegistry 팩토리 패턴, connect()/disconnectAll() 메서드, 4단계 트랜잭션 파이프라인 (shutdown 시 in-flight 완료 보장)
provides:
  - 데몬 라이프사이클 7단계 시작 시퀀스 (환경검증 -> DB -> 키스토어 -> 어댑터 -> HTTP -> 워커 -> PID/Ready)
  - 데몬 Graceful Shutdown 10단계 캐스케이드 (시그널 -> 서버종료 -> 요청완료 -> 서명완료 -> 큐저장 -> 워커중지 -> WAL -> 키잠금 -> DB닫기 -> PID삭제)
  - 신호 처리 체계 (SIGINT/SIGTERM/SIGHUP/SIGUSR1 + Windows SIGBREAK + Docker PID 1)
  - PID 파일 관리 프로토콜 (O_EXCL 경쟁조건 방지, stale PID 감지, background fork+detach)
  - CLI 4개 커맨드 상세 (init/start/stop/status) -- 옵션, 출력, 에러, exit code
  - waiaas init 대화형 4단계 플로우 + 비대화형 모드
  - npm 글로벌 패키지 구조 (@waiaas/cli bin 필드, shebang, lockstep versioning)
  - 보조 커맨드 구조 (agent/backup/password/kill-switch -- Phase 7-8 상세)
affects: [06-05 (API 프레임워크 -- Health API 엔드포인트, shutdown 미들웨어), Phase 7 (세션/트랜잭션 -- agent create CLI, 세션 만료 워커), Phase 8 (보안 계층 -- kill-switch CLI, password change, SIGHUP config reload), Phase 9 (Desktop -- Tauri 사이드카 foreground 연동, Docker init: true)]

tech-stack:
  added: []
  patterns: [7-step startup sequence, 10-step graceful shutdown cascade, isShuttingDown guard, socket tracking for keep-alive, O_EXCL PID file creation, fork+detach background mode, util.parseArgs subcommand routing, lockstep versioning]

key-files:
  created:
    - .planning/deliverables/28-daemon-lifecycle-cli.md
  modified: []

key-decisions:
  - "데몬 foreground 기본 + --daemon background 지원 (06-RESEARCH.md 결정 반영)"
  - "Graceful Shutdown 10단계 캐스케이드 (06-RESEARCH.md 결정 반영)"
  - "키스토어: 데몬 실행 중 = 상시 열림, 종료 시 sodium_memzero (06-CONTEXT.md 결정 반영)"
  - "하이브리드 로깅: 데몬 로그는 파일, 감사 로그는 SQLite (06-RESEARCH.md 결정 반영)"
  - "CLI 파싱: Node.js 내장 parseArgs (util.parseArgs, 외부 의존성 제로)"
  - "Exit code 6단계 체계 (0=성공, 1=에러, 2=중복실행, 3=미초기화, 4=인증실패, 5=타임아웃)"
  - "Background 모드 IPC: fork -> child sends { type: 'ready' } -> parent exits"
  - "Windows stop 호환: SIGTERM 불가 -> HTTP API /v1/admin/shutdown 폴백"
  - "어댑터 초기화 실패는 경고(warn), fail-fast 아님 -- 다른 체인 에이전트에 영향 방지"

patterns-established:
  - "시작 순서: Config -> DB -> KeyStore -> Adapters -> Server -> Workers -> PID (의존 관계 순방향)"
  - "종료 순서: Signal -> Server -> In-flight -> Signing -> Queue -> Workers -> WAL -> KeyStore -> DB -> PID (의존 관계 역방향)"
  - "isShuttingDown 가드로 다중 시그널 race condition 방지"
  - "소켓 추적 + destroySoon()으로 Hono keep-alive 미종료 대응 (Pitfall 6)"
  - "PID 파일: O_EXCL 생성 -> isProcessRunning(kill(pid,0)) stale 감지"
  - "서브커맨드: positionals[0] 추출 -> switch/case 라우팅"
  - "Background IPC: fork(detached) -> process.send({ type, pid }) -> parent.unref()"

duration: 8min
completed: 2026-02-05
---

# Phase 6 Plan 4: 데몬 라이프사이클 + CLI 커맨드 설계 Summary

**데몬 7단계 시작/10단계 종료 시퀀스 + SIGINT/SIGTERM/SIGHUP/SIGUSR1 신호 처리 + PID 파일 경쟁조건 방지 + init/start/stop/status 4개 CLI 커맨드 + npm 글로벌 패키지 @waiaas/cli**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-05T08:59:52Z
- **Completed:** 2026-02-05T09:07:47Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- 6개 서비스 컴포넌트(ConfigLoader, DatabaseManager, LocalKeyStore, AdapterRegistry, HonoServer, BackgroundWorkers)의 의존 관계를 Mermaid 다이어그램으로 정의하고, 시작/종료 순서 원칙을 확립
- 시작 7단계를 Mermaid 시퀀스 다이어그램으로 문서화. 각 단계의 실패 처리(fail-fast vs 경고 후 계속)를 명시. 시작 시간 추정(1.5-4.5초, Argon2id 지배적) 포함
- 06-RESEARCH.md 결정을 반영한 10단계 Graceful Shutdown 캐스케이드를 Mermaid 시퀀스 다이어그램으로 문서화. 진행 중 서명 작업의 CRITICAL 완료 보장(EVM nonce gap 방지) 포함
- 4개 시그널(SIGINT/SIGTERM/SIGHUP/SIGUSR1) + Windows SIGBREAK 처리. SIGHUP config 재로드 범위 정의. uncaughtException/unhandledRejection 핸들링
- PID 파일 프로토콜: O_EXCL 경쟁조건 방지, stale PID 감지(kill(pid,0)), 비정상 종료 대응. Background 모드 fork+detach IPC 프로토콜
- CLI 4개 커맨드(init/start/stop/status)를 옵션 테이블, 출력 예시, 에러 예시, exit code까지 상세 설계. waiaas init 대화형 4단계 플로우를 Mermaid flowchart로 정의
- npm 글로벌 패키지 구조(@waiaas/cli) bin 필드, shebang, lockstep versioning, workspace 프로토콜 해석까지 정의
- 보조 커맨드(agent/backup/password/kill-switch) 구조 표 + 서브커맨드 라우팅 패턴 정의 (상세는 Phase 7-8 이연)

## Task Commits

Each task was committed atomically:

1. **Task 1: 데몬 라이프사이클 설계 (아키텍처, 시작/종료 시퀀스, 신호, PID)** - `f26e57e` (docs)
2. **Task 2: CLI 커맨드 설계 (init/start/stop/status + npm 패키지 + 보조 커맨드)** - `fb12101` (docs)

## Files Created/Modified

- `.planning/deliverables/28-daemon-lifecycle-cli.md` - CORE-05: 데몬 아키텍처 개요(섹션1), 시작 시퀀스(섹션2), 종료 시퀀스(섹션3), 신호 처리(섹션4), PID 관리(섹션5), CLI 커맨드(섹션6), npm 패키지(섹션7), 보조 커맨드(섹션8), 요구사항 매핑(섹션9)

## Decisions Made

1. **어댑터 초기화 실패 = 경고, fail-fast 아님:** RPC 노드의 일시적 장애로 데몬 전체가 시작 불가하면 다른 체인 에이전트까지 영향. 해당 체인 에이전트가 트랜잭션 시도 시 런타임 에러로 처리
2. **Exit code 6단계 체계:** 0=성공, 1=일반에러, 2=이미실행중, 3=미초기화, 4=인증실패, 5=타임아웃. 스크립트/CI에서 에러 유형 구분 가능
3. **Background 시작 10초 타임아웃:** Argon2id 1-3초 + 어댑터 연결 시간 고려. 5초는 짧을 수 있어 10초로 설정
4. **Windows stop 호환 전략:** SIGTERM 미지원 -> HTTP API `POST /v1/admin/shutdown` 폴백 -> SIGINT 폴백. 크로스 플랫폼 안전
5. **waiaas stop 기본 타임아웃 35초:** 데몬의 shutdown_timeout(30초) + 5초 여유. SIGTERM 후 polling으로 종료 확인
6. **waiaas status JSON 모드:** `--json` 플래그로 스크립트/모니터링 도구 연동 지원. Health API 응답을 그대로 출력

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-05 (API 프레임워크): Health API 엔드포인트(`GET /v1/health`) 응답 스키마가 정의됨. Shutdown 미들웨어(`Connection: close` 헤더)가 설계됨. 소켓 추적 패턴이 서버 생성 시점에 통합 필요
- Phase 7 (세션 & 트랜잭션): agent create CLI 구조가 정의됨(상세 옵션은 Phase 7). 만료 세션 정리 워커가 1분 주기로 설계됨. In-flight 서명 완료 보장이 트랜잭션 파이프라인과 연동 필요
- Phase 8 (보안 계층): kill-switch CLI 구조가 정의됨. password change CLI 구조가 정의됨. SIGHUP config 재로드가 Phase 8 보안 설정에도 적용 가능
- Phase 9 (통합): Tauri 사이드카는 foreground 모드로 데몬을 관리. Docker는 `init: true` + tini 사용. `waiaas status --json`이 모니터링 통합에 활용 가능
- 차단 요소 없음

---
*Phase: 06-core-architecture-design*
*Completed: 2026-02-05*
