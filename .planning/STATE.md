# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-09)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**현재 초점:** v0.9 Phase 40 진행 중 -- Plan 40-01 완료, Plan 40-02 대기

## 현재 위치

마일스톤: v0.9 MCP 세션 관리 자동화 설계
페이즈: 40 of 40 (테스트 설계 + 문서 통합) -- Phase 40 In Progress
플랜: 40-01 완료 (Phase 40 1/2)
상태: Phase 36, 37, 38, 39 완료. Phase 40 Plan 01 완료 (테스트 시나리오 18개 설계 문서 명시). Plan 02 대기
마지막 활동: 2026-02-09 — 40-01-PLAN.md 완료 (TEST-01, TEST-02 설계 완료)

Progress: ██████████████████░░ 90%

## 성과 지표

**v0.1-v0.8 누적:** 90 plans, 243 reqs, 35 phases, 8 milestones, 30 설계 문서 (24-64)

**v0.9 계획:** 5 phases (36-40), 10 plans, 21 requirements
**v0.9 진행:** 9/10 plans complete, 4/5 phases complete (Phase 36, 37, 38, 39 완료, Phase 40 진행중 1/2)

## 누적 컨텍스트

### 결정 사항

전체 결정 사항은 PROJECT.md 참조.

v0.9 로드맵 결정:
- Phase 38/39는 Phase 36 완료 후 병렬 진행 가능 (Phase 37->38은 순차, Phase 36->39는 독립)
- CLI + Telegram을 Phase 39에 통합 (둘 다 토큰 파일 인프라 기반 외부 연동, 규모 작음)
- 테스트 설계와 문서 통합을 Phase 40에 통합 (모든 설계 완료 후 일괄 검증)

Phase 36-01 설계 결정:
- TF-01: getMcpTokenPath/writeMcpToken/readMcpToken 3개 공유 유틸리티를 @waiaas/core utils/token-file.ts에 정의
- TF-02: write-then-rename 원자적 쓰기 패턴, 외부 라이브러리(write-file-atomic) 없이 Node.js 내장 API
- TF-03: readMcpToken 동기 함수 (readFileSync). ~500byte I/O 비용 무시 가능
- TF-04: Windows EPERM 10-50ms 랜덤 대기, 최대 3회 재시도
- TF-05: Last-Writer-Wins 소유권 모델 (MCP/CLI/Telegram 3개 쓰기 주체)

Phase 36-02 설계 결정:
- NOTI-01: 데몬 측 자동 판단 (MCP SessionManager가 별도 알림 발송하지 않음)
- NOTI-02: notification_log 기반 중복 방지 (sessions 테이블 컬럼 추가나 인메모리 Set 대신 기존 인프라 활용)
- NOTI-03: OR 논리 트리거 (잔여 3회 이하 OR 24h 전)
- NOTI-04: 갱신 실패 경로 보완 알림 (Guard 1/2 실패 시 미발송이면 보완 발송)
- NOTI-05: shouldNotifyExpiringSession 순수 함수 (판단과 부수효과 분리)

Phase 37-01 설계 결정:
- SM-01: SessionManager 단일 클래스, MCP SDK 독립 (Composition 패턴)
- SM-02: getToken/start/dispose 3개 public 메서드
- SM-03: 내부 상태 9개 (token, sessionId, expiresAt, expiresIn, renewalCount, maxRenewals, timer, isRenewing, state)
- SM-04: 토큰 로드 우선순위 파일 > env var
- SM-05: jose decodeJwt 기반 무검증 디코딩 + 방어적 범위 검증 (C-03 대응)
- SM-06: renewalCount/maxRenewals 초기값 0/Infinity, 첫 갱신 응답에서 업데이트
- SM-07: 데몬 미기동 시 graceful degradation (로컬 JWT exp 기준 동작)

Phase 37-02 설계 결정:
- SM-08: safeSetTimeout 래퍼로 32-bit overflow 방어 (C-01)
- SM-09: 서버 응답 expiresAt 기준 절대 시간 갱신 스케줄 (self-correcting timer, H-01 대응)
- SM-10: 파일-우선 쓰기 순서 (writeMcpToken -> 메모리 교체, H-02 대응)
- SM-11: 5종 에러 분기 (TOO_EARLY 30초x1, LIMIT 포기, LIFETIME 포기, NETWORK 60초x3, EXPIRED lazy reload)
- SM-12: handleUnauthorized 4-step (파일 재로드 -> 비교 -> 교체/에러)
- SM-13: MCP SessionManager는 알림 직접 발송하지 않음 (데몬 자동, NOTI-01)
- SM-14: 갱신 중 getToken()은 구 토큰 반환 (동시성 안전)

Phase 38-01 설계 결정:
- SMGI-D01: getState()를 4번째 public 메서드로 추가 (3-public -> 4-public: getToken/getState/start/dispose)

Phase 38-02 설계 결정:
- SMGI-D02: Mutex/Lock 미사용, 50ms 대기 + 401 재시도 (Node.js 단일 스레드, 차단 지연 방지)
- SMGI-D03: 에러 복구 루프 SessionManager 소속, 60초 polling (fs.watch 대신 안정적 polling, SM-12 일관)
- SMGI-D04: console.log 금지, console.error 통일 (stdio stdout 오염 → JSON-RPC 파싱 실패 방지)

Phase 39-01 설계 결정:
- CLI-01: mcp 서브커맨드 그룹 (setup + refresh-token) 진입점 패턴
- CLI-02: mcp setup 7단계 동작 플로우 (데몬확인 -> 에이전트결정 -> constraints -> 세션생성 -> 파일저장 -> 출력 -> config안내)
- CLI-03: mcp refresh-token 8단계 동작 플로우 (생성 -> 파일 -> 폐기 순서, Pitfall 5 대응)
- CLI-04: 에이전트 자동 선택 (1개면 자동, 0개 에러, 2개+ 필수)
- CLI-05: Claude Desktop config.json 플랫폼별 경로 안내 (macOS/Windows/Linux)
- CLI-06: constraints 계승 규칙 (기존 세션 constraints 그대로 전달, renewalCount 리셋)

Phase 39-02 설계 결정:
- TG-01: /newsession 9번째 명령어 등록 (Tier 1 chatId 인증)
- TG-02: 에이전트 인라인 키보드 (1개 자동, 2개+ 선택, callback_data 47바이트)
- TG-03: createNewSession private 메서드 (세션 생성 + writeMcpToken + 완료 메시지)
- TG-04: 기본 constraints 2-level (config.toml > 하드코딩), EXT-03 3-level 확장 예약
- TG-05: resolveDefaultConstraints 공용 함수 (CLI + Telegram 공유)
- TG-06: 최소 보안 보장 (expiresIn/maxRenewals 항상 값 존재, Pitfall 4 대응)

### 차단 요소/우려 사항

- Node.js SEA + native addon 크로스 컴파일 호환성 미검증 (v0.7 prebuildify 전략 설계 완료, 구현 시 스파이크 필요)

## 세션 연속성

마지막 세션: 2026-02-09
중단 지점: 40-01-PLAN.md 완료. 다음: 40-02-PLAN.md 실행 (설계 문서 v0.9 통합 + pitfall 반영)
재개 파일: .planning/phases/40-test-design-doc-integration/40-02-PLAN.md
