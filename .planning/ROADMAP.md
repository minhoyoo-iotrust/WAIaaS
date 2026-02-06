# Roadmap: WAIaaS v0.4 테스트 전략 및 계획 수립

## Milestones

- v0.1 Research & Design (Phases 1-5) -- shipped 2026-02-05
- v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) -- shipped 2026-02-05
- v0.3 설계 논리 일관성 확보 (Phases 10-13) -- shipped 2026-02-06
- **v0.4 테스트 전략 및 계획 수립 (Phases 14-18)** -- in progress

## Overview

v0.2에서 완성한 17개 설계 문서와 v0.3에서 확보한 일관성 대응표를 역방향 검증하는 테스트 전략을 수립한다. 테스트 레벨 정의와 Mock 경계 설정을 기반으로, 보안 공격 시나리오 25건 이상, 블록체인 3단계 테스트 환경, Enum/설정 일관성 자동 검증, CI/CD 파이프라인, 배포 타겟별 테스트 범위를 확정하여 구현 단계에서 "무엇을 어떻게 테스트할 것인가"가 명확한 상태를 만든다.

## Phases

**Phase Numbering:**
- Integer phases (14, 15, ...): Planned milestone work
- Decimal phases (14.1, 14.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 14: 테스트 기반 정의** - 테스트 레벨, 모듈 매트릭스, Mock 경계, 테스트 인터페이스 확정
- [ ] **Phase 15: 보안 테스트 시나리오** - 3계층 보안 공격 시나리오 25건 이상 + 키스토어 + 경계값
- [ ] **Phase 16: 블록체인 & 일관성 검증 전략** - 블록체인 3단계 테스트 환경 + Enum/설정 검증 방법
- [ ] **Phase 17: CI/CD 파이프라인 설계** - 4단계 파이프라인, GitHub Actions, 커버리지 게이트
- [ ] **Phase 18: 배포 타겟별 테스트** - CLI/Docker/Desktop/Telegram 각 플랫폼 테스트 범위

## Phase Details

### Phase 14: 테스트 기반 정의
**Goal**: 전체 테스트 전략의 뼈대가 확정되어, 이후 도메인별 시나리오 작성 시 "어떤 레벨에서, 어떤 Mock으로, 어떤 커버리지 목표로" 테스트할지 참조할 수 있다
**Depends on**: Nothing (v0.4 첫 페이즈)
**Requirements**: TLVL-01, TLVL-02, TLVL-03, MOCK-01, MOCK-02, MOCK-03, MOCK-04
**Success Criteria** (what must be TRUE):
  1. 6개 테스트 레벨(Unit/Integration/E2E/Chain Integration/Security/Platform)의 범위, 실행 환경, 실행 빈도를 읽고 각 레벨의 차이를 설명할 수 있다
  2. 9개 모듈(7 모노레포 패키지 + Python SDK + Desktop App)별로 어떤 테스트 레벨이 적용되는지 매트릭스에서 확인할 수 있다
  3. 패키지별 커버리지 목표 수치가 명시되어 있고, 기준 근거가 설명되어 있다
  4. 5개 외부 의존성(블록체인 RPC, 알림 채널, 파일시스템, 시간, Owner 서명)의 Mock 방식이 레벨별로 조회 가능하다
  5. IClock/ISigner 인터페이스 스펙이 정의되어 있고, 기존 4개 인터페이스의 Mock 가능성 검증 결과와 Contract Test 전략이 문서화되어 있다
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md -- 테스트 레벨 정의, 모듈 매트릭스, 커버리지 목표 (TLVL-01, TLVL-02, TLVL-03)
- [x] 14-02-PLAN.md -- Mock 경계 매트릭스, 인터페이스 스펙, Contract Test 전략 (MOCK-01, MOCK-02, MOCK-03, MOCK-04)

### Phase 15: 보안 테스트 시나리오
**Goal**: WAIaaS 3계층 보안 모델의 모든 공격 벡터가 시나리오로 문서화되어, 구현 시 "이 보안 계층이 올바르게 동작하는가"를 체계적으로 검증할 수 있다
**Depends on**: Phase 14 (테스트 레벨 및 Mock 경계 참조)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):
  1. Layer 1 세션 인증 공격 시나리오 9개 이상이 각각 "공격 방법 / 기대 방어 동작 / 테스트 레벨"과 함께 정의되어 있다
  2. Layer 2 정책 우회 공격 시나리오 6개 이상이 정의되어 있고, TOCTOU 등 동시성 공격이 포함되어 있다
  3. Layer 3 Kill Switch/AutoStop 시나리오 6개 이상이 정의되어 있고, 복구 흐름까지 포함한다
  4. 키스토어 보안 시나리오 4개 이상(파일 변조, 틀린 패스워드, 권한, 메모리 잔존)이 정의되어 있다
  5. 4-tier 경계값(0.1/1/10 SOL), 한도 +/-1, 만료 직전/직후 등 경계값 테스트 케이스가 표로 정리되어 있다
**Plans**: TBD

Plans:
- [ ] 15-01: 3계층 보안 공격 시나리오 및 경계값 테스트

### Phase 16: 블록체인 & 일관성 검증 전략
**Goal**: 블록체인 의존성을 3단계로 격리하는 테스트 환경 전략과, v0.3에서 확보한 Enum/설정 SSoT의 자동 검증 방법이 확정되어 있다
**Depends on**: Phase 14 (Mock 경계, 특히 블록체인 RPC Mock 방식 참조)
**Requirements**: CHAIN-01, CHAIN-02, CHAIN-03, CHAIN-04, ENUM-01, ENUM-02, ENUM-03
**Success Criteria** (what must be TRUE):
  1. Solana 3단계(Mock RPC / Local Validator / Devnet) 환경별 실행 범위와 시나리오가 구분되어 있다
  2. Mock RPC 클라이언트의 시나리오(성공/실패/지연/Blockhash 만료)가 입력-출력 형태로 명세되어 있다
  3. Local Validator 기반 E2E 흐름(세션 생성 -> 정책 평가 -> 서명 -> 전송 -> 확인)이 단계별로 정의되어 있다
  4. 9개 Enum SSoT 동기화 검증 방법(DB CHECK = Drizzle = Zod = TypeScript)이 자동화 가능한 수준으로 정의되어 있다
  5. config.toml 검증(기본값/부분 오버라이드/Docker 환경변수 우선순위)과 NOTE-01~11의 테스트 케이스 매핑이 완료되어 있다
**Plans**: TBD

Plans:
- [ ] 16-01: 블록체인 테스트 환경 전략
- [ ] 16-02: Enum/설정 일관성 검증 전략

### Phase 17: CI/CD 파이프라인 설계
**Goal**: 테스트 자동화 파이프라인 구조가 확정되어, 구현 단계에서 워크플로우 YAML을 바로 작성할 수 있다
**Depends on**: Phase 14, 15, 16 (모든 테스트 유형과 범위가 정의된 후)
**Requirements**: CICD-01, CICD-02, CICD-03
**Success Criteria** (what must be TRUE):
  1. 4단계 파이프라인(매 커밋 / 매 PR / nightly / 릴리스)의 실행 범위와 각 단계에 포함되는 테스트 유형이 명확히 구분되어 있다
  2. GitHub Actions 워크플로우 구조가 트리거(push/PR/schedule/release)별로 설계되어 있고, job 의존 관계가 시각화되어 있다
  3. 패키지별 커버리지 게이트 기준과 CI 실패 조건이 정의되어 있고, 리포트 자동 생성 방식이 명시되어 있다
**Plans**: TBD

Plans:
- [ ] 17-01: CI/CD 파이프라인 및 커버리지 게이트 설계

### Phase 18: 배포 타겟별 테스트
**Goal**: 4개 배포 타겟(CLI Daemon/Docker/Desktop/Telegram Bot) 각각의 테스트 범위와 검증 방법이 확정되어, 플랫폼별 품질 기준이 명확하다
**Depends on**: Phase 14 (테스트 레벨 중 Platform 레벨 참조), Phase 17 (CI 파이프라인에 통합 방법)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04
**Success Criteria** (what must be TRUE):
  1. CLI Daemon 테스트(init/start/stop/status, 시그널 처리, exit codes, Windows fallback)의 시나리오와 검증 방법이 정의되어 있다
  2. Docker 테스트(빌드/compose/named volume/환경변수/hostname 오버라이드/grace period)의 시나리오와 자동화 가능 여부가 정의되어 있다
  3. Desktop App(Tauri) 테스트(빌드/Sidecar SEA/수동 QA 체크리스트)가 정의되어 있고, 자동화 한계가 명시되어 있다
  4. Telegram Bot 테스트(Long Polling/2-Tier 인증/인라인 키보드)의 시나리오와 Mock 전략이 정의되어 있다
**Plans**: TBD

Plans:
- [ ] 18-01: 배포 타겟별 테스트 범위 정의

## Progress

**Execution Order:**
Phases execute in numeric order: 14 -> 15 -> 16 -> 17 -> 18

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 14. 테스트 기반 정의 | 2/2 | ✓ Complete | 2026-02-06 |
| 15. 보안 테스트 시나리오 | 0/1 | Not started | - |
| 16. 블록체인 & 일관성 검증 전략 | 0/2 | Not started | - |
| 17. CI/CD 파이프라인 설계 | 0/1 | Not started | - |
| 18. 배포 타겟별 테스트 | 0/1 | Not started | - |
