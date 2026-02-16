# Roadmap: WAIaaS v1.7 품질 강화 + CI/CD

## Overview

설계 문서(46-51, 64) 기반 테스트 시나리오 전수 구현과 GitHub Actions CI/CD 파이프라인 구축으로, ~249건 보안 시나리오, ~148건 확장 테스트, 84건 플랫폼 테스트, Contract Test 7개, 블록체인 3단계, Enum SSoT 검증을 달성하고 4-stage CI/CD(ci/nightly/release/coverage-report)로 지속적 품질 게이트를 확보하는 마일스톤.

## Phases

- [ ] **Phase 151: 커버리지 + Mock 인프라** - 테스트 기반 인프라 구축 (커버리지 설정, Mock 경계, Turborepo 태스크)
- [ ] **Phase 152: Enum 검증 + Config 테스트** - 빌드타임 SSoT 방어 체계 구축
- [ ] **Phase 153: Contract Test** - 7개 인터페이스 Mock vs 실제 구현체 동작 동일성 검증
- [ ] **Phase 154: 블록체인 3단계 테스트** - Mock RPC -> Local Validator -> Devnet 계층별 블록체인 테스트
- [ ] **Phase 155: 보안 테스트 Part 1 (3계층 보안)** - 세션/정책/Kill Switch/키스토어/경계값 71건 공격 시나리오 검증
- [ ] **Phase 156: 보안 테스트 Part 2 (확장 보안)** - 토큰/컨트랙트/Approve/배치/Oracle/Action/x402 ~178건 보안 시나리오 검증
- [ ] **Phase 157: 확장 기능 테스트** - 토큰/컨트랙트/Approve/배치/Oracle/Action/ChainError ~148건 기능 테스트
- [ ] **Phase 158: 플랫폼 테스트** - CLI/Docker/Telegram 84건 배포 타겟별 테스트
- [ ] **Phase 159: CI/CD 파이프라인** - 4개 GitHub Actions YAML + Composite Action + 커버리지 게이트 스크립트

## Phase Details

### Phase 151: 커버리지 + Mock 인프라
**Goal**: 전체 테스트 스위트를 실행하고 패키지별 커버리지를 측정할 수 있는 인프라가 갖춰진 상태
**Depends on**: Nothing (first phase)
**Requirements**: COV-01, COV-02, COV-03, MOCK-01
**Success Criteria** (what must be TRUE):
  1. `pnpm test:unit` 명령으로 전 패키지 유닛 테스트가 vitest workspace 기반으로 한 번에 실행된다
  2. 각 패키지의 커버리지 리포트가 v8 프로바이더로 생성되며, 패키지별 Hard 임계값(core 90%+, daemon 85%+, cli 70%+ 등)이 설정되어 미달 시 실패한다
  3. `test:unit`, `test:integration`, `test:security`, `test:chain`, `test:platform` 5개 Turborepo 태스크가 분리 실행된다
  4. Mock 10개 경계(M1~M10) 중 신규 5개(Jupiter msw, 가격 API msw, 온체인 오라클, MockPriceOracle, MockActionProvider)가 구축되어 테스트에서 import 가능하다
**Plans**: 2 plans

Plans:
- [ ] 151-01-PLAN.md — Vitest workspace + 커버리지 임계값 + Turborepo 태스크 분리
- [ ] 151-02-PLAN.md — Mock 5개 신규 경계 인프라 구축

### Phase 152: Enum 검증 + Config 테스트
**Goal**: 16개 Enum SSoT가 빌드타임에 4단계 방어로 검증되고, config.toml 로딩이 12건 시나리오에서 정확하게 동작하는 상태
**Depends on**: Phase 151
**Requirements**: ENUM-01, ENUM-02, ENUM-03
**Success Criteria** (what must be TRUE):
  1. 빌드타임 검증 스크립트가 16개 Enum의 as const -> TS -> Zod -> Drizzle -> DB CHECK 4단계 일관성을 자동 검증하고, 불일치 시 빌드가 실패한다
  2. config.toml 로딩 테스트 12건(기본값, TOML 오버라이드, 환경변수, 잘못된 값 등)이 통과한다
  3. NOTE-01~11 매핑 중 테스트 필요 4건(22 테스트 케이스)이 모두 통과한다
**Plans**: TBD

Plans:
- [ ] 152-01: Enum SSoT 빌드타임 검증 스크립트 + config 테스트 + NOTE 매핑 테스트

### Phase 153: Contract Test
**Goal**: 7개 핵심 인터페이스의 Mock 구현체와 실제 구현체가 동일한 Contract Test를 통과하여 동작 동일성이 보장되는 상태
**Depends on**: Phase 151
**Requirements**: CTST-01, CTST-02, CTST-03, CTST-04, CTST-05, CTST-06, CTST-07
**Success Criteria** (what must be TRUE):
  1. IChainAdapter Contract Test로 MockChainAdapter와 SolanaAdapter가 22 메서드에서 동일한 동작을 보인다
  2. IChainAdapter Contract Test로 MockChainAdapter와 EvmAdapter가 22 메서드에서 동일한 동작을 보인다 (buildBatch -> BATCH_NOT_SUPPORTED 포함)
  3. IPolicyEngine, INotificationChannel, IClock, IPriceOracle, IActionProvider 5개 인터페이스의 Contract Test가 모두 통과한다
  4. Contract Test 실패 시 어떤 메서드가 어떻게 다른지 명확한 에러 메시지가 출력된다
**Plans**: TBD

Plans:
- [ ] 153-01: IChainAdapter Contract Test (Mock vs Solana vs EVM)
- [ ] 153-02: IPolicyEngine + INotificationChannel + IClock + IPriceOracle + IActionProvider Contract Test

### Phase 154: 블록체인 3단계 테스트
**Goal**: 블록체인 테스트가 Mock RPC -> Local Validator -> Devnet 3단계로 계층화되어 실행되는 상태
**Depends on**: Phase 151, Phase 153
**Requirements**: CHAIN-01, CHAIN-02, CHAIN-03, CHAIN-04
**Success Criteria** (what must be TRUE):
  1. Level 1 Mock RPC 13개 시나리오(SOL 전송/잔액/수수료/RPC 실패/잔액 부족/Blockhash 만료 등)가 외부 의존 없이 통과한다
  2. Level 2 Local Validator로 solana-test-validator E2E 5개 흐름(SOL/SPL 전송/배치/에러 복구/성능)이 통과한다
  3. Level 2 Local Validator로 Anvil EVM E2E(ETH/ERC-20 전송/gas 추정)가 통과한다
  4. Level 3 Devnet 3건(SOL 전송/잔액 조회/헬스 체크)이 continue-on-error로 실행되며, 실패해도 전체 빌드를 중단하지 않는다
**Plans**: TBD

Plans:
- [ ] 154-01: Level 1 Mock RPC + Level 2 Solana Local Validator
- [ ] 154-02: Level 2 EVM Anvil + Level 3 Devnet

### Phase 155: 보안 테스트 Part 1 (3계층 보안)
**Goal**: 3계층 보안 모델(세션 인증 -> 정책 엔진 -> Kill Switch)의 71건 공격 시나리오가 모두 방어됨이 테스트로 증명된 상태
**Depends on**: Phase 151
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):
  1. 세션 인증 공격 20건(JWT 위조/만료 우회/세션 탈취 등)이 모두 적절히 거부된다
  2. 정책 우회 공격 9건(TOCTOU 경합/금액 에스컬레이션 등)이 모두 방어된다
  3. Kill Switch 복구 공격 8건(상태 전이 위조/dual-auth 우회 등)이 모두 차단된다
  4. 키스토어+외부 보안 10건(키스토어 공격 6건 + 외부 위협 4건)이 모두 방어된다
  5. 경계값+연쇄 공격 24건(금액/시간/TOCTOU 경계값 19건 + E2E 연쇄 5건)이 모두 통과한다
**Plans**: TBD

Plans:
- [ ] 155-01: 세션 인증 + 정책 우회 공격 테스트 (SEC-01, SEC-02)
- [ ] 155-02: Kill Switch + 키스토어 + 경계값/연쇄 공격 테스트 (SEC-03, SEC-04, SEC-05)

### Phase 156: 보안 테스트 Part 2 (확장 보안)
**Goal**: 확장 기능(토큰/컨트랙트/Approve/배치/Oracle/Action/Swap/ChainError/x402) ~178건 보안 시나리오가 모두 방어됨이 테스트로 증명된 상태
**Depends on**: Phase 151, Phase 155
**Requirements**: SEC-06, SEC-07, SEC-08, SEC-09, SEC-10, SEC-11, SEC-12, SEC-13, SEC-14
**Success Criteria** (what must be TRUE):
  1. 토큰 정책(32건) + 컨트랙트 화이트리스트(28건) + Approve(24건) 보안 우회가 모두 방어된다
  2. 배치 분할 우회(22건) + Oracle 가격 조작(20건) 보안 시나리오가 모두 방어된다
  3. Action Provider(16건) + Swap 슬리피지/MEV(12건) + ChainError(12건) 보안 시나리오가 모두 방어된다
  4. x402 결제 보안(~12건, SSRF 우회/도메인 정책 우회/금액 조작)이 모두 방어된다
**Plans**: TBD

Plans:
- [ ] 156-01: 토큰 + 컨트랙트 + Approve 보안 테스트 (SEC-06, SEC-07, SEC-08)
- [ ] 156-02: 배치 + Oracle + Action + Swap 보안 테스트 (SEC-09, SEC-10, SEC-11, SEC-12)
- [ ] 156-03: ChainError + x402 보안 테스트 (SEC-13, SEC-14)

### Phase 157: 확장 기능 테스트
**Goal**: 확장 기능(토큰/컨트랙트/Approve/배치/Oracle/Action/ChainError) ~148건 기능 테스트로 정상 동작이 검증된 상태
**Depends on**: Phase 151
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06, EXT-07
**Success Criteria** (what must be TRUE):
  1. 토큰 전송 32건(SPL/ERC-20/Token-2022/ALLOWED_TOKENS 정책)이 모두 통과한다
  2. 컨트랙트 호출 28건 + Approve 관리 24건 + 배치 트랜잭션 22건이 모두 통과한다
  3. Oracle 20건(OracleChain fallback, TTL, 가격 나이, 교차 검증) + Action Provider 16건(resolve-then-execute, Registry, MCP Tool 변환)이 모두 통과한다
  4. ChainError 12건(3-카테고리 PERMANENT/TRANSIENT/STALE, retryable 자동 파생)이 모두 통과한다
**Plans**: TBD

Plans:
- [ ] 157-01: 토큰 전송 + 컨트랙트 호출 테스트 (EXT-01, EXT-02)
- [ ] 157-02: Approve + 배치 + Oracle 테스트 (EXT-03, EXT-04, EXT-05)
- [ ] 157-03: Action Provider + ChainError 테스트 (EXT-06, EXT-07)

### Phase 158: 플랫폼 테스트
**Goal**: CLI Daemon, Docker, Telegram Bot 3개 배포 타겟에서 84건 플랫폼 테스트로 배포 품질이 검증된 상태
**Depends on**: Phase 151
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. CLI Daemon 32건(init/start/stop/status/signal/exit codes/E2E)이 모두 통과한다
  2. Docker 18건(build/compose/volume/env/grace/secrets/healthcheck/non-root)이 모두 통과한다
  3. Telegram Bot 34건(polling/commands/callbacks/auth/format/shutdown)이 모두 통과한다
**Plans**: TBD

Plans:
- [ ] 158-01: CLI Daemon 플랫폼 테스트
- [ ] 158-02: Docker + Telegram Bot 플랫폼 테스트

### Phase 159: CI/CD 파이프라인
**Goal**: GitHub Actions 4-stage CI/CD 파이프라인이 동작하여 push/PR/nightly/release 각 시점에 적절한 테스트가 자동 실행되는 상태
**Depends on**: Phase 151, Phase 154, Phase 155, Phase 156, Phase 157, Phase 158
**Requirements**: CICD-01, CICD-02, CICD-03, CICD-04, CICD-05, CICD-06
**Success Criteria** (what must be TRUE):
  1. push 시 ci.yml Stage 1(lint+typecheck+unit)이 자동 실행되고, PR 시 Stage 2(full suite + coverage gate)가 추가 실행된다
  2. nightly.yml이 UTC 02:30에 full-suite + local-validator(solana-test-validator + Anvil) + devnet(continue-on-error)를 실행한다
  3. release.yml이 full-test-suite + chain-integration + platform 테스트 + coverage-report + Docker 빌드 + npm dry-run을 실행한다
  4. PR에 vitest-coverage-report-action으로 핵심 4 패키지 커버리지가 코멘트로 게시된다
  5. coverage-gate.sh가 Soft/Hard 모드로 패키지별 독립 임계값을 검증하며, Composite Action으로 Node.js 22 + pnpm + Turborepo 캐시가 공유된다
**Plans**: TBD

Plans:
- [ ] 159-01: Composite Action setup + ci.yml + coverage-gate.sh
- [ ] 159-02: nightly.yml + release.yml + coverage-report.yml

## Progress

**Execution Order:**
Phases execute in numeric order: 151 -> 152 -> 153 -> 154 -> 155 -> 156 -> 157 -> 158 -> 159

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 151. 커버리지 + Mock 인프라 | 0/2 | Not started | - |
| 152. Enum 검증 + Config 테스트 | 0/1 | Not started | - |
| 153. Contract Test | 0/2 | Not started | - |
| 154. 블록체인 3단계 테스트 | 0/2 | Not started | - |
| 155. 보안 테스트 Part 1 | 0/2 | Not started | - |
| 156. 보안 테스트 Part 2 | 0/3 | Not started | - |
| 157. 확장 기능 테스트 | 0/3 | Not started | - |
| 158. 플랫폼 테스트 | 0/2 | Not started | - |
| 159. CI/CD 파이프라인 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-16*
*Last updated: 2026-02-16*
