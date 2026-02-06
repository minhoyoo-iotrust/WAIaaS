# Requirements: WAIaaS v0.4 테스트 전략 및 계획 수립

**Defined:** 2026-02-06
**Core Value:** v0.2 설계 + v0.3 일관성 확보를 역방향 검증하여, 구현 단계에서 "무엇을 어떻게 테스트할 것인가"가 명확한 상태를 만든다.

## v0.4 Requirements

### 테스트 레벨 & 모듈 매트릭스

- [x] **TLVL-01**: 6개 테스트 레벨(Unit/Integration/E2E/Chain Integration/Security/Platform)의 범위, 실행 환경, 실행 빈도가 정의됨
- [x] **TLVL-02**: 7개 모노레포 패키지 + Python SDK + Desktop App에 대해 어떤 테스트 레벨을 적용할지 매트릭스로 정의됨
- [x] **TLVL-03**: 패키지별 커버리지 목표가 정의됨 (core/daemon 90%+, adapter-solana 80%+, cli 70%+ 등)

### Mock 경계 & 테스트 인터페이스

- [x] **MOCK-01**: 5개 외부 의존성(블록체인 RPC, 알림 채널, 파일시스템, 시간, Owner 서명)에 대한 Mock 방식이 Unit/Integration/E2E 레벨별로 정의됨
- [x] **MOCK-02**: 기존 v0.2 인터페이스 4개(IChainAdapter, INotificationChannel, ILocalKeyStore, IPolicyEngine)의 Mock 가능성이 검증됨
- [x] **MOCK-03**: 신규 테스트 인터페이스 IClock(시간 추상화)과 ISigner(서명 추상화)의 인터페이스 스펙이 정의됨
- [x] **MOCK-04**: Mock과 실제 구현의 동작 일치를 보장하는 Contract Test 전략이 정의됨

### 보안 테스트 시나리오

- [x] **SEC-01**: Layer 1 세션 인증 공격 시나리오 9개 이상이 정의됨 (만료 토큰, 위조 JWT, 한도 초과, 폐기 재사용, Nonce 재사용 등)
- [x] **SEC-02**: Layer 2 정책 우회 공격 시나리오 6개 이상이 정의됨 (금액 분할, 시간 조작, TOCTOU, 대기 중 변조, 타임아웃, Owner 취소)
- [x] **SEC-03**: Layer 3 Kill Switch 및 복구 시나리오 6개 이상이 정의됨 (동시 거래, AutoStop 트리거 3종, Agent 복구 시도, Owner 복구)
- [x] **SEC-04**: 키스토어 보안 시나리오 4개 이상이 정의됨 (파일 변조, 틀린 패스워드, 파일 권한, 메모리 잔존)
- [x] **SEC-05**: 경계값 테스트 케이스가 정의됨 (4-tier 경계: 0.1/1/10 SOL, 한도 ±1, 만료 직전/직후)

### 블록체인 테스트 전략

- [x] **CHAIN-01**: Solana 테스트 3단계 환경(Mock RPC / Local Validator / Devnet)별 실행 범위와 시나리오가 정의됨
- [x] **CHAIN-02**: Mock RPC 클라이언트의 시나리오(성공/실패/지연/Blockhash 만료)가 명세됨
- [x] **CHAIN-03**: Local Validator(solana-test-validator) 기반 E2E 테스트 흐름이 정의됨 (세션→정책→서명→전송→확인)
- [x] **CHAIN-04**: EVM 테스트 범위가 정의됨 (EvmAdapterStub IChainAdapter 타입 준수 + CHAIN_NOT_SUPPORTED throw 확인)

### Enum & 설정 일관성 검증

- [x] **ENUM-01**: 9개 Enum(TransactionStatus/Tier/AgentStatus/PolicyType/NotificationChannelType/AuditLogSeverity/EventType/KillSwitchStatus/AutoStopRuleType)의 DB CHECK = Drizzle = Zod = TypeScript 동기화 검증 방법이 정의됨
- [x] **ENUM-02**: config.toml 검증 전략이 정의됨 (기본값, 부분 오버라이드, Zod 검증, Docker 환경변수 우선순위, 중첩 섹션)
- [x] **ENUM-03**: v0.3 구현 노트(NOTE-01~11)의 제약/경고가 테스트 케이스로 변환 가능한 형태로 매핑됨

### CI/CD 파이프라인

- [x] **CICD-01**: 4단계 파이프라인 구조가 정의됨 (매 커밋: lint→type-check→unit→coverage / 매 PR: +integration+e2e+security+enum / nightly: devnet / 릴리스: full suite)
- [x] **CICD-02**: GitHub Actions 워크플로우 구조가 설계됨 (push/PR/schedule/release 트리거별)
- [x] **CICD-03**: 커버리지 게이트(기준 미달 시 CI 실패) 및 리포트 자동 생성 방식이 정의됨

### 배포 타겟별 테스트

- [ ] **PLAT-01**: CLI Daemon 테스트 범위가 정의됨 (init/start/stop/status, 시그널 처리, Windows fallback)
- [ ] **PLAT-02**: Docker 테스트 범위가 정의됨 (빌드, compose, named volume, 환경변수, hostname 오버라이드, grace period)
- [ ] **PLAT-03**: Desktop App(Tauri) 테스트 범위가 정의됨 (빌드, Sidecar SEA, 수동 QA 체크리스트)
- [ ] **PLAT-04**: Telegram Bot 테스트 범위가 정의됨 (Long Polling, 2-Tier 인증, 인라인 키보드)

## Future Requirements

### v0.5+ (구현 마일스톤)

- **IMPL-01**: 테스트 코드 자체의 구현 (이 마일스톤은 전략/계획만)
- **IMPL-02**: Mock RPC 클라이언트 구현체 코딩
- **IMPL-03**: CI 워크플로우 YAML 작성 및 실행
- **PERF-01**: 성능/부하 테스트 (별도 마일스톤)
- **AUDIT-01**: 외부 보안 감사 (펜테스트 업체)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 테스트 코드 구현 | v0.4는 전략/계획만 -- 실제 테스트 코드는 구현 마일스톤에서 |
| 성능/부하 테스트 계획 | 기능 구현 완료 후 별도 마일스톤으로 분리 |
| Formal verification | 수학적 증명은 현 단계에서 과도 |
| 외부 보안 감사 계획 | 구현 완료 후 외부 업체 선정 |
| Mainnet 테스트 | Devnet까지만 -- Mainnet은 프로덕션 릴리스 시점 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TLVL-01 | Phase 14 | Complete |
| TLVL-02 | Phase 14 | Complete |
| TLVL-03 | Phase 14 | Complete |
| MOCK-01 | Phase 14 | Complete |
| MOCK-02 | Phase 14 | Complete |
| MOCK-03 | Phase 14 | Complete |
| MOCK-04 | Phase 14 | Complete |
| SEC-01 | Phase 15 | Complete |
| SEC-02 | Phase 15 | Complete |
| SEC-03 | Phase 15 | Complete |
| SEC-04 | Phase 15 | Complete |
| SEC-05 | Phase 15 | Complete |
| CHAIN-01 | Phase 16 | Complete |
| CHAIN-02 | Phase 16 | Complete |
| CHAIN-03 | Phase 16 | Complete |
| CHAIN-04 | Phase 16 | Complete |
| ENUM-01 | Phase 16 | Complete |
| ENUM-02 | Phase 16 | Complete |
| ENUM-03 | Phase 16 | Complete |
| CICD-01 | Phase 17 | Complete |
| CICD-02 | Phase 17 | Complete |
| CICD-03 | Phase 17 | Complete |
| PLAT-01 | Phase 18 | Pending |
| PLAT-02 | Phase 18 | Pending |
| PLAT-03 | Phase 18 | Pending |
| PLAT-04 | Phase 18 | Pending |

**Coverage:**
- v0.4 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-02-06*
*Last updated: 2026-02-06 after roadmap creation*
