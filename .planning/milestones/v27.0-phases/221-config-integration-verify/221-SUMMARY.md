# Phase 221 Summary: 설정 구조 + 설계 통합 검증

## Completed
- [x] 221-01: config.toml [incoming] 섹션 + 지갑별 opt-in + 환경변수 매핑 명세
- [x] 221-02: 기존 설계 문서 영향 분석 + 검증 시나리오 + 교차 검증 체크리스트

## Key Decisions
1. [incoming] 섹션 6키 flat (incoming_enabled, incoming_mode, incoming_poll_interval, incoming_retention_days, incoming_suspicious_dust_usd, incoming_suspicious_amount_multiplier)
2. 6키 모두 SettingsService hot-reload 가능 (재시작 불필요)
3. WAIAAS_INCOMING_* 환경변수 매핑 (기존 패턴 일치)
4. 전역 게이트(incoming_enabled) + 지갑별 opt-in(monitor_incoming) 2단계
5. HotReloadOrchestrator에 incoming prefix 감지 추가
6. DaemonLifecycle Step 4c-9 fail-soft 배치
7. BackgroundWorkers 4개 등록 (flush, retention, confirm-solana, confirm-evm)
8. 기존 설계 문서 9개 영향 분석 완료 — 모두 확장(추가)이며 수정 없음
9. 17개 핵심 + 4개 보안 검증 시나리오 정의
10. 12개 교차 검증 항목 모두 PASS

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 8
- 설계 결정 17개 (D-01 ~ D-17)

## Requirements Covered
- CFG-01: [incoming] 6키 정의 ✅
- CFG-02: wallets.monitor_incoming opt-in + API 필드 확장 ✅
- CFG-03: WAIAAS_INCOMING_* 환경변수 매핑 ✅
- VER-01: 기존 설계 문서 9개 영향 분석 ✅
- VER-02: T-01~T-17 + S-01~S-04 검증 시나리오 ✅
- VER-03: Zod SSoT, config.toml 평탄화, 에러 코드 체계 충돌 없음 ✅
