# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-08)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- Owner 등록 없이도 기본 보안을 제공하고, Owner 등록 시 강화된 보안이 점진적으로 해금된다.
**현재 초점:** Phase 35 -- DX + 설계 문서 통합

## 현재 위치

마일스톤: v0.8 Owner 선택적 등록 + 점진적 보안 모델
페이즈: 35 of 35 (DX + 설계 문서 통합)
플랜: 1 of 3 in current phase
상태: In progress -- 35-01 완료, 35-02 대기
마지막 활동: 2026-02-09 -- 35-01 CLI 플로우 v0.8 전면 갱신 완료

Progress: █████████████████░░░ 82% (9/11 plans)

## 성과 지표

**v0.1-v0.7 누적:** 79 plans, 210 reqs, 30 phases, 30 설계 문서 (24-64)
**v0.8 현재:** 9 plans complete, 33 reqs, 5 phases (31-35), 11 plans 예정

## 누적 컨텍스트

### 결정 사항

전체 결정 사항은 PROJECT.md 참조.
v0.8 관련:
- Owner 선택적 등록 (필수 -> 선택): 자율 에이전트 시나리오 지원 + 온보딩 마찰 제거
- 점진적 보안 해금 (Base/Enhanced): DELAY 다운그레이드로 차단 없이 보안 유도
- sweepAll masterAuth만: 수신 주소 owner_address 고정이므로 공격자 이득 없음
- [31-01] OwnerState는 DB 컬럼이 아닌 런타임 파생 상태 (동기화 오류 방지)
- [31-01] SweepResult.tokensRecovered는 v0.6 AssetInfo 직접 재사용 (중복 정의 금지)
- [31-01] PolicyDecision 확장은 optional 필드로 하위 호환성 유지
- [31-01] v0.8 마이그레이션에서 PRAGMA foreign_keys OFF/ON 패턴 적용
- [31-02] sweepAll 정책 엔진 우회: 수신 주소 owner_address 고정이므로 공격자 이득 없음
- [31-02] OwnerState DB 비저장: 순수 함수로 런타임 산출하여 SSoT 유지
- [31-02] owner_verified 타임스탬프는 audit_log OWNER_VERIFIED 이벤트로 추적
- [31-02] Grace->Locked 전이: BEGIN IMMEDIATE + WHERE owner_verified = 0 직렬화
- [32-01] 인증 분기를 비즈니스 로직(OwnerLifecycleService)에서 처리 -- 미들웨어 정적 결정 불가
- [32-01] LOCKED 주소 변경 시 owner_verified 리셋 금지 -- 보안 다운그레이드 방지
- [32-01] Kill Switch ACTIVATED에서 Owner 변경 자동 차단 -- killSwitchGuard 4개 허용 경로 외 503
- [32-01] OWNER_REMOVED severity = warning -- 보안 수준 다운그레이드 동반
- [32-02] Step 8.5는 next() 전에 실행 -- 핸들러 실행 전 LOCKED 보장 (보수적 접근)
- [32-02] change_owner action: authRouter 미등록, 핸들러 레벨 ownerAuth 검증
- [32-02] setOwner BEGIN IMMEDIATE 트랜잭션 -- resolveOwnerState 재확인 + 주소변경 + 감사로그 일체화
- [32-02] 보안 공격 방어 4건 확정: C-01(레이스 3중), C-02(다운그레이드 3중), H-02(withdraw LOCKED만), H-03(killSwitchGuard)
- [33-01] evaluate() 시그니처에 optional agentOwnerInfo 추가 -- IPolicyEngine 인터페이스 미변경 (하위 호환)
- [33-01] Step 9.5에서 return으로 Step 10 스킵 -- APPROVE_TIER_OVERRIDE 다운그레이드 복원 방지
- [33-01] delaySeconds: SPENDING_LIMIT delay_seconds 우선, fallback 300초, 최소 60초
- [33-01] TX_DOWNGRADED 독립 감사 이벤트 -- audit_log 쿼리 직접 집계 지원
- [33-01] evaluateBatch() 개별 instruction 다운그레이드 불적용 -- 합산 1회만 (이중 방지)
- [33-02] TX_DOWNGRADED_DELAY를 별도 이벤트로 분리 -- TX_DELAY_QUEUED + metadata 방식 대신 (하위 호환)
- [33-02] Telegram 승인/거부 버튼은 url 기반 -- ownerAuth 서명이 필요하므로 callback_data 불가
- [33-02] Discord Webhook은 Button 미지원 -- Embed markdown 링크로 대체
- [33-02] ntfy.sh Actions는 view 타입만 -- http 타입은 ownerAuth 서명 불가
- [34-01] withdraw API masterAuth(implicit)만 -- 수신 주소 owner_address 고정으로 ownerAuth 불필요 (v0.8 §5.2)
- [34-01] scope 분기 WithdrawService 수준 -- IChainAdapter.sweepAll에 scope 파라미터 없음 (31-02 결정)
- [34-01] WITHDRAW 에러 코드 4개 신설 + AGENT 도메인 2개 재사용 (중복 정의 금지)
- [34-01] 감사 로그 3종: FUND_WITHDRAWN/FUND_PARTIALLY_WITHDRAWN/FUND_WITHDRAWAL_FAILED
- [34-02] Kill Switch 복구는 시스템별 분기 -- agents.owner_address IS NOT NULL 존재 여부로 판단
- [34-02] config.toml로 복구 대기 시간 재정의 가능 (kill_switch_recovery_wait_owner/no_owner)
- [34-02] Step 2에서 masterAuth만 재검증 -- ownerAuth는 Step 1에서 완료
- [34-02] SESSION_RENEWED [거부하기]는 masterAuth(implicit)만 -- APPROVAL ownerAuth와 다름
- [34-02] 거부 윈도우 비강제 -- Owner는 세션 유효 시 언제든 DELETE 가능
- [35-01] Kill Switch withdraw 방안 A 채택 -- killSwitchGuard 허용 경로 4->5개 (POST /v1/owner/agents/:agentId/withdraw 추가)
- [35-01] set-owner LOCKED 분기: CLI에서 SIWS/SIWE 수동 서명 플로우 시작
- [35-01] remove-owner GRACE 제약: LOCKED 해제 불가, 확인 프롬프트 포함
- [35-01] quickstart --chain만 필수: --owner 선택으로 온보딩 마찰 최소화
- [35-01] agent info 안내 메시지: NONE 상태에서 set-owner 가이드 표시 (DX-05)

### 차단 요소/우려 사항

- Grace->Locked 레이스 컨디션 (C-01): 3중 보호 **설계 완료** (31-02, 32-02)
- 유예 구간 withdraw 공격 (H-02): owner_verified=1에서만 withdraw 활성화 **설계 완료** (32-02, 34-01 API 스펙 확정)
- 보안 다운그레이드 공격 (C-02): LOCKED 해제 금지 + 알림 + killSwitchGuard **설계 완료** (32-02)
- sweepAll 부분 실패 (C-03): SOL 마지막 전송 + HTTP 207 부분 성공 처리 **설계 완료** (31-02, 34-01 상세 확정)
- Kill Switch Owner 변경 (H-03): killSwitchGuard 4개 허용 경로 외 503 차단 **설계 완료** (32-02)
- Kill Switch withdraw: **방안 A 채택 완료** -- killSwitchGuard 5번째 허용 경로 추가 (35-01)

## 세션 연속성

마지막 세션: 2026-02-09
중단 지점: 35-01 완료. 35-02 (Owner 상태 분기 매트릭스 SSoT) 실행 대기.
재개 파일: .planning/phases/35-dx-설계-문서-통합/35-02-PLAN.md
