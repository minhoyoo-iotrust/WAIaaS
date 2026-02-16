# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.6 Phase 145 -- Docker

## Current Position

Phase: 145 of 145 (Docker)
Plan: 1 of 2 in current phase
Status: Ready
Last activity: 2026-02-16 -- 144-02 AutoStop + Monitoring Settings UI 완료 (Phase 144 완료)

Progress: [############░░] 86% (12/14 plans)

## Performance Metrics

**Cumulative:** 33 milestones, 139 phases, 301 plans, 850 reqs, ~2,150 tests, ~191,000 LOC

**v1.6 Milestone:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 140. Event Bus + Kill Switch | 3/3 | 38m | 13m |
| 141. AutoStop Engine | 2/2 | 13m | 7m |
| 142. Balance Monitoring | 2/2 | 7m | 4m |
| 143. Telegram Bot | 3/3 | 34m | 11m |
| 144. Admin UI Integration | 2/2 | 8m | 4m |
| 145. Docker | 0/2 | - | - |

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.
- v1.6: Kill Switch 상태명 변경 (NORMAL->ACTIVE, ACTIVATED->SUSPENDED, LOCKED 신규)
- v1.6: AutoStop DAILY_SPENDING_LIMIT 제거 (v1.5.3 CUMULATIVE_SPENDING_DAILY 중복)
- v1.6: EventEmitter 이벤트 버스 신규 도입 (AutoStop/BalanceMonitor 구독용)
- v1.6: EventBus emit()에서 리스너별 try/catch 에러 격리 선택 (파이프라인 안전성)
- v1.6: eventBus optional chaining(?.) 패턴 -- 기존 코드 무중단 호환
- v1.6: CAS ACID 패턴 (BEGIN IMMEDIATE + UPDATE WHERE value = expected) KillSwitchService에 적용
- v1.6: RECOVERING 상태 제거, ACTIVE로 통합 (3-state: ACTIVE/SUSPENDED/LOCKED)
- v1.6: 6-step cascade (세션 무효화->거래 중단->월렛 정지->API 503->알림->감사 로그) 순차 실행
- v1.6: LOCKED 복구 대기 시간 5초, Owner 미등록 시 Master-only 복구 허용
- v1.6: kill-switch:state-changed EventBus 이벤트 추가 (AutoStop/BalanceMonitor 구독용)
- v1.6: 기존 ACTIVATED 상태명을 SUSPENDED로, NORMAL을 ACTIVE로 전환
- v1.6: AutoStop better-sqlite3 직접 SQL (KillSwitchService 패턴 동일)
- v1.6: AutoStop 규칙 트리거 후 카운터 리셋 (재축적 필요)
- v1.6: AutoStop 알림 fire-and-forget (규칙 엔진 안전성)
- v1.6: MANUAL_TRIGGER -> Kill Switch 전체 발동, 나머지 3규칙 -> 개별 월렛 정지
- v1.6: auto_stop_consecutive_failures_threshold(기본값 3) -> autostop_consecutive_failures_threshold(기본값 5) 교체
- v1.6: autostop 키는 security TOML 섹션 flat key, Admin Settings는 별도 autostop 카테고리
- v1.6: AUTO_STOP_TRIGGERED i18n 범용 {walletId}/{reason}/{rule} 템플릿
- v1.6: HotReloadOrchestrator autostop 동기 처리 (updateConfig만)
- v1.6: BalanceMonitorService setInterval 폴링 (EventBus 구독 대신 5분 주기)
- v1.6: 잔액 비교 Number(balance)/10**decimals decimal 변환 후 임계값 비교
- v1.6: 중복 알림 방지 wasLow 플래그 + 24시간 쿨다운, 회복 후 재하락 시 새 알림 허용
- v1.6: monitoring_* flat key를 security TOML 섹션에 배치 (autostop 패턴 동일)
- v1.6: monitoring Admin Settings 별도 카테고리 (autostop 패턴 동일)
- v1.6: DaemonLifecycle Step 4c-4에서 BalanceMonitorService fail-soft 초기화
- v1.6: telegram.bot_token을 notifications.telegram_bot_token과 별도 섹션으로 분리 (Bot 수신 vs 알림 발송 독립 제어)
- v1.6: KillSwitchService.getState().state 문자열로 상태 표시 (KillSwitchStateInfo 구조체 접근)
- v1.6: MarkdownV2 이스케이프 유틸 TelegramChannel 패턴 재사용 (telegram-bot-service.ts에 독립 정의)
- v1.6: DaemonLifecycle Step 4c-5에서 TelegramBotService fail-soft 초기화
- v1.6: i18n bot_pending/bot_approve/bot_reject 텍스트를 거래 승인 의미로 변경
- v1.6: AdminRouteDeps에 sqlite 옵션 추가 (telegram_users 직접 SQL 접근)
- v1.6: callback_query에서도 2-Tier auth 적용 (인라인 키보드 권한 검증)
- v1.6: WALLET_NOT_FOUND 에러 코드를 telegram user not found에 재사용
- v1.6: 인라인 키보드 빌더를 telegram-keyboard.ts로 분리 (buildConfirmKeyboard/buildWalletSelectKeyboard/buildApprovalKeyboard)
- v1.6: /newsession에서 JWT 직접 발급 (jwtSecretManager.signToken + sessions INSERT + 감사 로그)
- v1.6: vi.useFakeTimers로 backoff 테스트 제어 (vi.waitFor flaky 방지)
- v1.6: Kill Switch 3-state UI (settings-section -> settings-category 패턴, ACTIVE/SUSPENDED/LOCKED 상태별 버튼)
- v1.6: Telegram Users 관리 페이지 (Table + Badge + Modal 패턴, Approve/Delete 액션)
- v1.6: AutoStop/Monitoring Settings UI fields map 배열 + checkbox/number 분기 패턴 (SecuritySettings 확장)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- Pre-existing 3 sessions.test.tsx failures -- not blocking

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 144-02-PLAN.md (AutoStop + Monitoring Settings UI -- Phase 144 완료)
Resume file: None
