---
phase: 08-security-layers-design
plan: 04
subsystem: security
tags: [kill-switch, auto-stop, evm-adapter, cascade, state-machine, recovery, viem, autostop-engine]

# Dependency graph
requires:
  - phase: 08-security-layers-design
    plan: 01
    provides: DatabasePolicyEngine, DELAY/APPROVAL 플로우, reserved_amount 패턴
  - phase: 08-security-layers-design
    plan: 02
    provides: ownerAuth 미들웨어, Owner 전용 API, owner_wallets 스키마
  - phase: 08-security-layers-design
    plan: 03
    provides: NotificationService broadcast/notify, INotificationChannel, notification_channels 스키마
  - phase: 06-core-architecture-design
    provides: CORE-04 IChainAdapter 13메서드, CORE-05 10-step shutdown, CORE-03 키스토어 잠금/해제, CORE-02 agents/sessions/transactions 스키마
provides:
  - Kill Switch 6단계 캐스케이드 프로토콜 (시퀀스 다이어그램)
  - Kill Switch 상태 머신 (NORMAL/ACTIVATED/RECOVERING)
  - Kill Switch 복구 이중 인증 (Owner 서명 + 마스터 패스워드)
  - system_state 테이블 (Kill Switch 상태 영속)
  - killSwitchGuard 미들웨어
  - KillSwitchService 인터페이스
  - AutoStopEngine (IAutoStopEngine, SecurityEvent, AutoStopDecision)
  - auto_stop_rules 테이블 스키마 + 기본 규칙 세트 3개
  - 자동 정지 규칙 5개 타입 (CONSECUTIVE_FAILURES, TIME_RESTRICTION, DAILY_LIMIT_THRESHOLD, HOURLY_RATE, ANOMALY_PATTERN)
  - EvmAdapterStub (IChainAdapter 13메서드 stub)
  - POST /v1/owner/kill-switch, POST /v1/owner/recover API 스펙
  - 데몬 라이프사이클 Kill Switch 통합 (시작 시 상태 확인, 종료 시 상태 유지)
affects: [09-01-api-spec, 09-03-tauri-desktop, 09-04-telegram-bot]

# Tech tracking
tech-stack:
  added: []
  patterns: [Kill Switch 6-step cascade BEGIN IMMEDIATE, system_state key-value persistent config, killSwitchGuard middleware, AutoStopEngine event-driven evaluation, EvmAdapterStub notImplemented pattern, recovery dual-auth (signature + master password)]

key-files:
  created: [.planning/deliverables/36-killswitch-autostop-evm.md]
  modified: []

key-decisions:
  - "Kill Switch 캐스케이드 Step 1-3 원자적 (BEGIN IMMEDIATE), Step 4-6 순차 best-effort"
  - "Kill Switch 상태: system_state 테이블 (데몬 재시작 시에도 유지)"
  - "killSwitchGuard 미들웨어: Rate Limiter 이후, Auth 이전 위치"
  - "ACTIVATED 상태: /v1/owner/recover + /v1/health + /v1/admin/status만 허용"
  - "복구 이중 인증: Owner 서명 + 마스터 패스워드 (키스토어 해제)"
  - "복구 brute-force 방지: 5회 실패 -> 30분 lockout"
  - "복구 후: 세션/거래 복원 안 함 (새 세션 생성 필요), KILL_SWITCH로 정지된 에이전트만 ACTIVE 복원"
  - "AutoStopEngine: 이벤트 기반 비동기 평가 (파이프라인 블로킹 안 함)"
  - "기본 규칙 세트 3개: CONSECUTIVE_FAILURES(3), DAILY_LIMIT(80%/100%), HOURLY_RATE(50/h)"
  - "기본 규칙에 KILL_SWITCH action 없음: 모든 기본 규칙은 SUSPEND_AGENT까지만 (의도적 실패 유발 방지)"
  - "auto_stop_rules override: policies와 동일 패턴 (에이전트별 우선, 없으면 글로벌)"
  - "EvmAdapterStub: isConnected()=false, getHealth()={healthy:false} (에러 안 던짐), 나머지 13메서드 에러"
  - "EVM chain='ethereum' 에이전트 생성 시 stub 경고 메시지 출력"

patterns-established:
  - "Kill Switch 6-step cascade: DB 원자적(1-3) + best-effort(4-6) 이중 구조"
  - "system_state 테이블: key-value 패턴으로 시스템 전역 상태 영속"
  - "killSwitchGuard: 미들웨어 체인에서 인증 이전 시스템 상태 확인"
  - "AutoStopEngine: 사후 이벤트 기반 패턴 감시 (DatabasePolicyEngine의 사전 검증과 상호보완)"
  - "EvmAdapterStub: notImplemented() 단일 메서드로 모든 stub 에러 통일"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 8 Plan 04: Kill Switch + 자동 정지 규칙 엔진 + EVM Adapter Stub Summary

**Kill Switch 6단계 캐스케이드 프로토콜 + 3상태 머신 + 이중 인증 복구 + AutoStopEngine 5개 규칙 타입 + auto_stop_rules 테이블 + EvmAdapterStub 13메서드 전체 설계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T11:50:21Z
- **Completed:** 2026-02-05T11:57:42Z
- **Tasks:** 2 (combined into 1 commit -- see Deviations)
- **Files created:** 1

## Accomplishments
- Kill Switch 3상태 머신 (NORMAL/ACTIVATED/RECOVERING) Mermaid stateDiagram으로 정의
- Kill Switch 6단계 캐스케이드 프로토콜 시퀀스 다이어그램 완성 (세션 폐기 -> 거래 취소 -> 에이전트 정지 -> 키스토어 잠금 -> 알림 -> 감사)
- Kill Switch 복구 이중 인증 시퀀스 다이어그램 완성 (Owner 서명 + 마스터 패스워드)
- system_state 테이블 + killSwitchGuard 미들웨어 + KillSwitchService 인터페이스
- POST /v1/owner/kill-switch, POST /v1/admin/kill-switch, POST /v1/owner/recover 3개 API 스펙
- 복구 brute-force 방지 (5회 실패 -> 30분 lockout)
- AutoStopEngine 인터페이스 (IAutoStopEngine, SecurityEvent, AutoStopDecision 타입)
- 자동 정지 규칙 5개 타입 상세 설계 (조건/기본값/동작/DB 쿼리/config JSON)
- auto_stop_rules 테이블 Drizzle ORM + SQL DDL + 기본 규칙 세트 3개
- AutoStopEngine 평가 흐름 Mermaid flowchart + 구현 의사 코드
- EvmAdapterStub 클래스: IChainAdapter 13메서드 + 2 readonly 프로퍼티 stub 설계
- viem v2.45.x 기반 v0.3 구현 노트 (메서드별 viem API 매핑 테이블)
- 데몬 라이프사이클 통합 (시작 시 Kill Switch 상태 확인, 종료 시 상태 유지)
- 보안 고려사항 5개 (AutoStop 공격 벡터, 복구 brute-force, 감사 불변성, EVM stub 안전성, 캐스케이드 최소 시간)

## Task Commits

Each task was committed atomically:

1. **Task 1: Kill Switch 캐스케이드 + 상태 머신 + 복구 + AutoStopEngine + EVM Stub** - `f75514d` (feat)

## Files Created/Modified
- `.planning/deliverables/36-killswitch-autostop-evm.md` - Kill Switch 프로토콜, 자동 정지 규칙 엔진, EVM Adapter stub 전체 설계 (12개 섹션, 1795줄, KILL-AUTO-EVM)

## Decisions Made
1. **캐스케이드 원자성 이중 구조**: Step 1-3 (DB 변경) = 단일 BEGIN IMMEDIATE 원자적, Step 4-6 (키스토어/알림/감사) = 순차 best-effort
2. **system_state 테이블**: Kill Switch 상태를 DB에 영속 (데몬 재시작 후에도 ACTIVATED 유지)
3. **killSwitchGuard 미들웨어 위치**: Rate Limiter 이후, Auth 이전 (ACTIVATED 상태에서 불필요한 인증 DB 조회 방지)
4. **ACTIVATED 허용 엔드포인트**: /v1/owner/recover, /v1/health, /v1/admin/status만 허용
5. **복구 이중 인증**: Owner 서명(신원 확인) + 마스터 패스워드(키스토어 해제) 동시 요구
6. **복구 후 세션/거래 미복원**: 보안상 기존 세션은 폐기 유지, CANCELLED 거래는 복원 불가
7. **AutoStopEngine 비동기**: 파이프라인 이후 이벤트 기반 (거래 응답 블로킹 안 함)
8. **기본 규칙 KILL_SWITCH action 없음**: 의도적 실패 유발로 시스템 전체 정지 방지 -- SUSPEND_AGENT까지만
9. **EvmAdapterStub 안전 메서드**: isConnected()와 getHealth()는 에러 대신 안전한 기본값 반환 (데몬 크래시 방지)
10. **auto_stop_rules override**: policies 테이블과 동일 패턴 (에이전트별 > 글로벌)

## Deviations from Plan

### Minor Structure Deviation

**Task 1과 Task 2를 단일 커밋으로 통합**
- **사유:** 두 Task가 동일 파일(36-killswitch-autostop-evm.md)에 섹션을 추가하는 구조. 12개 섹션을 하나의 일관된 문서로 작성하는 것이 문서 품질과 상호 참조에 유리
- **영향:** 기능적 영향 없음. 모든 요구사항(NOTI-03~05, CHAIN-03) 충족. 2개 Task의 전체 검증 기준 통과

## Issues Encountered

None

## User Setup Required

None - no external service configuration required for design docs.

## Next Phase Readiness
- Kill Switch API 스펙 (kill-switch, recover) -> 09-01 (REST API 전체 스펙)에서 OpenAPI 정의 포함
- killSwitchGuard 미들웨어 -> 09-01에서 미들웨어 체인 최종 문서화
- AutoStopEngine 알림 연동 -> 09-04 (Telegram Bot)에서 AUTO_STOP_TRIGGERED 인라인 키보드 확장
- EvmAdapterStub -> v0.3 마일스톤에서 viem 기반 본구현 교체
- **Phase 8 완료:** 4-tier 보안 분류 + Owner 지갑 연결 + 알림 아키텍처 + Kill Switch 프로토콜 전체 설계 완성

---
*Phase: 08-security-layers-design*
*Completed: 2026-02-05*
