# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1 Research & Design** — Phases 1-5 (shipped 2026-02-05)
- ✅ **v0.2 Self-Hosted Secure Wallet Design** — Phases 6-9 (shipped 2026-02-05)
- ✅ **v0.3 설계 논리 일관성 확보** — Phases 10-13 (shipped 2026-02-06)
- ✅ **v0.4 테스트 전략 및 계획 수립** — Phases 14-18 (shipped 2026-02-07)
- ✅ **v0.5 인증 모델 재설계 + DX 개선** — Phases 19-21 (shipped 2026-02-07)
- ✅ **v0.6 블록체인 기능 확장 설계** — Phases 22-25 (shipped 2026-02-08)
- ✅ **v0.7 구현 장애 요소 해소** — Phases 26-30 (shipped 2026-02-08)
- ✅ **v0.8 Owner 선택적 등록 + 점진적 보안** — Phases 31-35 (shipped 2026-02-09)
- ✅ **v0.9 MCP 세션 관리 자동화 설계** — Phases 36-40 (shipped 2026-02-09)
- ✅ **v0.10 구현 전 설계 완결성 확보** — Phases 41-44 (shipped 2026-02-09)
- ✅ **v1.0 구현 계획 수립** — Phases 45-47 (shipped 2026-02-09)
- ✅ **v1.1 코어 인프라 + 기본 전송** — Phases 48-51 (shipped 2026-02-10, 281 tests, 10,925 LOC)
- ✅ **v1.2 인증 + 정책 엔진** — Phases 52-57 (shipped 2026-02-10, 457 tests, 25,526 LOC)
- ✅ **v1.3 SDK + MCP + 알림** — Phases 58-63 (shipped 2026-02-11, 784 tests, 33,929 LOC)
- ✅ **v1.3.1 Admin Web UI 설계** — Phases 64-65 (shipped 2026-02-11)
- ✅ **v1.3.2 Admin Web UI 구현** — Phases 66-70 (shipped 2026-02-11, 816 tests, 45,332 LOC)
- ✅ **v1.3.3 MCP 다중 에이전트 지원** — Phases 71-72 (shipped 2026-02-11, 847 tests, 44,639 LOC)
- 🚧 **v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널** — Phases 73-75 (in progress)

## Phases

<details>
<summary>v0.1 Research & Design (Phases 1-5) -- SHIPPED 2026-02-05</summary>

- [x] Phase 1: AI 에이전트 지갑 요구사항 분석 (3 plans)
- [x] Phase 2: 커스터디 모델 비교 연구 (3 plans)
- [x] Phase 3: Solana 기술 스택 조사 (3 plans)
- [x] Phase 4: 주인-에이전트 관계 모델 설계 (3 plans)
- [x] Phase 5: 오픈소스/기존 솔루션 조사 + 에이전트 프레임워크 통합 (3 plans)

</details>

<details>
<summary>v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) -- SHIPPED 2026-02-05</summary>

- [x] Phase 6: 코어 지갑 서비스 설계 (4 plans)
- [x] Phase 7: 세션 + 체인 추상화 설계 (4 plans)
- [x] Phase 8: 보안 계층 설계 (4 plans)
- [x] Phase 9: 통합 + 배포 설계 (4 plans)

</details>

<details>
<summary>v0.3 설계 논리 일관성 확보 (Phases 10-13) -- SHIPPED 2026-02-06</summary>

- [x] Phase 10: v0.1 잔재 정리 + 변경 매핑 (2 plans)
- [x] Phase 11: CRITICAL 의사결정 확정 (2 plans)
- [x] Phase 12: Enum/상태값 통합 대응표 (2 plans)
- [x] Phase 13: REST API<>Framework 스펙 통일 (2 plans)

</details>

<details>
<summary>v0.4 테스트 전략 및 계획 수립 (Phases 14-18) -- SHIPPED 2026-02-07</summary>

- [x] Phase 14: 테스트 레벨/매트릭스/커버리지 정의 (2 plans)
- [x] Phase 15: 보안 공격 시나리오 71건 (2 plans)
- [x] Phase 16: 블록체인 3단계 테스트 환경 (2 plans)
- [x] Phase 17: CI/CD 4단계 파이프라인 (1 plan)
- [x] Phase 18: 배포 타겟별 테스트 시나리오 (2 plans)

</details>

<details>
<summary>v0.5 인증 모델 재설계 + DX 개선 (Phases 19-21) -- SHIPPED 2026-02-07</summary>

- [x] Phase 19: 3-Tier 인증 모델 재설계 (3 plans)
- [x] Phase 20: 세션 낙관적 갱신 + CLI DX (3 plans)
- [x] Phase 21: 기존 설계 문서 11개 v0.5 통합 (3 plans)

</details>

<details>
<summary>v0.6 블록체인 기능 확장 설계 (Phases 22-25) -- SHIPPED 2026-02-08</summary>

- [x] Phase 22: 토큰 확장 + 정책 (3 plans)
- [x] Phase 23: 트랜잭션 타입 확장 (3 plans)
- [x] Phase 24: 상위 추상화 레이어 (3 plans)
- [x] Phase 25: 테스트 전략 통합 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.7 구현 장애 요소 해소 (Phases 26-30) -- SHIPPED 2026-02-08</summary>

- [x] Phase 26: 체인 어댑터 안정화 (2 plans)
- [x] Phase 27: 데몬 보안 기반 확립 (3 plans)
- [x] Phase 28: 의존성 빌드 환경 해소 (2 plans)
- [x] Phase 29: API 통합 프로토콜 완성 (2 plans)
- [x] Phase 30: 스키마 설정 확정 (2 plans)

</details>

<details>
<summary>v0.8 Owner 선택적 등록 + 점진적 보안 (Phases 31-35) -- SHIPPED 2026-02-09</summary>

- [x] Phase 31: Owner 선택적 데이터 모델 (2 plans)
- [x] Phase 32: Owner 생명주기 상태 머신 (3 plans)
- [x] Phase 33: 정책 다운그레이드 메커니즘 (2 plans)
- [x] Phase 34: 자금 회수 프로토콜 (2 plans)
- [x] Phase 35: DX + 설계 문서 통합 (2 plans)

</details>

<details>
<summary>v0.9 MCP 세션 관리 자동화 설계 (Phases 36-40) -- SHIPPED 2026-02-09</summary>

- [x] Phase 36: 토큰 파일 인프라 (2 plans)
- [x] Phase 37: SessionManager 핵심 설계 (2 plans)
- [x] Phase 38: MCP 통합 설계 (2 plans)
- [x] Phase 39: CLI + Telegram 연동 (2 plans)
- [x] Phase 40: 테스트 설계 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.10 구현 전 설계 완결성 확보 (Phases 41-44) -- SHIPPED 2026-02-09</summary>

- [x] Phase 41: 정책 엔진 완결 (2 plans)
- [x] Phase 42: 에러 처리 체계 완결 (2 plans)
- [x] Phase 43: 동시성 + 실행 로직 완결 (3 plans)
- [x] Phase 44: 운영 로직 완결 (3 plans)

</details>

<details>
<summary>v1.0 구현 계획 수립 (Phases 45-47) -- SHIPPED 2026-02-09</summary>

- [x] Phase 45: 코어 구현 objective 문서 생성 (2 plans)
- [x] Phase 46: 확장 + 릴리스 objective 문서 생성 (2 plans)
- [x] Phase 47: 설계 부채 + 로드맵 최종 검증 (1 plan)

</details>

<details>
<summary>✅ v1.1 코어 인프라 + 기본 전송 (Phases 48-51) — SHIPPED 2026-02-10</summary>

- [x] Phase 48: 모노레포 스캐폴드 + @waiaas/core (3/3 plans) — completed 2026-02-10
- [x] Phase 49: 데몬 인프라 (3/3 plans) — completed 2026-02-10
- [x] Phase 50: API 서버 + SolanaAdapter + 파이프라인 (4/4 plans) — completed 2026-02-10
- [x] Phase 51: CLI + E2E 통합 검증 (2/2 plans) — completed 2026-02-10

</details>

<details>
<summary>✅ v1.2 인증 + 정책 엔진 (Phases 52-57) — SHIPPED 2026-02-10</summary>

- [x] Phase 52: 인증 기반 (2/2 plans) — completed 2026-02-10
- [x] Phase 53: 세션 관리 (2/2 plans) — completed 2026-02-10
- [x] Phase 54: 정책 엔진 (2/2 plans) — completed 2026-02-10
- [x] Phase 55: 워크플로우 + Owner 상태 (3/3 plans) — completed 2026-02-10
- [x] Phase 56: 파이프라인 통합 (2/2 plans) — completed 2026-02-10
- [x] Phase 57: 통합 테스트 (2/2 plans) — completed 2026-02-10

</details>

<details>
<summary>✅ v1.3 SDK + MCP + 알림 (Phases 58-63) — SHIPPED 2026-02-11</summary>

- [x] Phase 58: OpenAPIHono 전환 + getAssets() (2/2 plans) — completed 2026-02-10
- [x] Phase 59: REST API 확장 (2/2 plans) — completed 2026-02-11
- [x] Phase 60: 알림 시스템 (2/2 plans) — completed 2026-02-11
- [x] Phase 61: TypeScript SDK (2/2 plans) — completed 2026-02-11
- [x] Phase 62: Python SDK (1/1 plan) — completed 2026-02-11
- [x] Phase 63: MCP Server (2/2 plans) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.1 Admin Web UI 설계 (Phases 64-65) — SHIPPED 2026-02-11</summary>

- [x] Phase 64: 인프라 + 인증 + 보안 기반 설계 (1/1 plan) — completed 2026-02-11
- [x] Phase 65: 페이지 + 컴포넌트 + API 연동 설계 (1/1 plan) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.2 Admin Web UI 구현 (Phases 66-70) — SHIPPED 2026-02-11</summary>

- [x] Phase 66: 인프라 + 빌드 파이프라인 (2/2 plans) — completed 2026-02-11
- [x] Phase 67: 인증 + API Client + 공통 컴포넌트 (2/2 plans) — completed 2026-02-11
- [x] Phase 68: Dashboard + Agents + Sessions 페이지 (2/2 plans) — completed 2026-02-11
- [x] Phase 69: Policies + Settings 페이지 (2/2 plans) — completed 2026-02-11
- [x] Phase 70: 통합 테스트 (2/2 plans) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.3 MCP 다중 에이전트 지원 (Phases 71-72) — SHIPPED 2026-02-11</summary>

- [x] Phase 71: MCP 토큰 경로 분리 + 에이전트 식별 (1/1 plan) — completed 2026-02-11
- [x] Phase 72: CLI mcp setup 다중 에이전트 (1/1 plan) — completed 2026-02-11

</details>

### 🚧 v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 (In Progress)

**Milestone Goal:** v1.3 알림 인프라(NotificationService, 3채널, 21 이벤트 템플릿)를 파이프라인/라우트에 실제 연결하고, 어드민 UI에 알림 상태/테스트/로그 패널을 추가하여, 데몬에서 발생하는 주요 이벤트가 실제로 사용자에게 알림으로 전달되는 상태를 달성한다.

- [x] **Phase 73: 알림 로그 인프라** (1/1 plan) — completed 2026-02-11
- [ ] **Phase 74: 파이프라인 이벤트 트리거 연결** — 파이프라인 8개 이벤트에서 notify() 호출 연결
- [ ] **Phase 75: 어드민 알림 API + UI** — 알림 상태/테스트/로그 API 3개 + 어드민 알림 패널

## Phase Details

### Phase 73: 알림 로그 인프라
**Goal**: 알림 발송 이력이 DB에 자동으로 기록되어 발송 성공/실패를 추적할 수 있다
**Depends on**: Nothing (v1.3 알림 인프라 위에 구축)
**Requirements**: LOG-01, LOG-02, LOG-03
**Success Criteria** (what must be TRUE):
  1. 데몬 시작 시 notification_logs 테이블이 증분 마이그레이션(ALTER TABLE 아님, CREATE TABLE IF NOT EXISTS + schema_version)으로 생성된다
  2. NotificationService.notify() 호출 후 발송 성공 시 notification_logs에 status='sent' 레코드가 존재한다
  3. 채널 발송 실패 시 notification_logs에 status='failed' + error 메시지가 기록된다
  4. 기존 847 테스트가 깨지지 않고, 신규 마이그레이션/로깅 테스트가 통과한다
**Plans**: 1 plan

Plans:
- [ ] 73-01-PLAN.md -- notification_logs 스키마 + 증분 마이그레이션 + NotificationService 로깅 통합 + 테스트

### Phase 74: 파이프라인 이벤트 트리거 연결
**Goal**: 파이프라인 스테이지와 라우트 핸들러에서 주요 이벤트 발생 시 실제 알림이 발송된다
**Depends on**: Phase 73 (로그 테이블이 존재해야 notify()가 로그를 기록)
**Requirements**: TRIG-01, TRIG-02, TRIG-03, TRIG-04, TRIG-05, TRIG-06, TRIG-07, TRIG-08
**Success Criteria** (what must be TRUE):
  1. SOL 전송 요청 시 TX_REQUESTED 알림이 활성 채널로 발송된다
  2. 전송 성공 시 TX_SUBMITTED + TX_CONFIRMED 알림이 순차적으로 발송된다
  3. 전송 실패 시 TX_FAILED 알림이 발송되고, 정책 위반 시 POLICY_VIOLATION 알림이 발송된다
  4. 세션 생성 시 SESSION_CREATED, 세션 만료 시 SESSION_EXPIRED, Owner 등록 시 OWNER_SET 알림이 발송된다
  5. 알림 발송이 파이프라인 실행을 차단하지 않는다 (fire-and-forget)
**Plans**: 2 plans

Plans:
- [ ] 74-01-PLAN.md -- 파이프라인 stage 1/3/5/6에 fire-and-forget notify() 연결 + 단위 테스트
- [ ] 74-02-PLAN.md -- 라우트 핸들러(세션/Owner) + 백그라운드 워커 이벤트 트리거 연결 + 통합 테스트

### Phase 75: 어드민 알림 API + UI
**Goal**: 어드민이 브라우저에서 알림 채널 상태를 확인하고 테스트 발송하며 발송 이력을 조회할 수 있다
**Depends on**: Phase 73 (로그 조회 API), Phase 74 (트리거가 동작해야 의미 있는 로그 존재)
**Requirements**: API-01, API-02, API-03, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. 어드민 UI에서 Telegram/Discord/Ntfy 각 채널의 활성화 상태(연결됨/미설정)가 표시된다
  2. 어드민 UI에서 활성 채널에 테스트 알림을 발송하면 실제 메시지가 도착한다
  3. 어드민 UI에서 최근 알림 발송 로그(이벤트 타입, 채널, 상태, 시각)를 페이지네이션으로 조회할 수 있다
  4. 어드민 UI에 config.toml 설정 변경 안내 문구가 표시된다
  5. API 응답에 bot token, webhook URL 등 credential이 포함되지 않는다
**Plans**: TBD

Plans:
- [ ] 75-01: 알림 상태/테스트/로그 Admin API 3개 엔드포인트
- [ ] 75-02: 어드민 알림 패널 UI (채널 상태 + 테스트 + 로그 + 설정 안내)

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.1 Research & Design | 1-5 | 15 | Complete | 2026-02-05 |
| v0.2 Self-Hosted Design | 6-9 | 16 | Complete | 2026-02-05 |
| v0.3 설계 일관성 | 10-13 | 8 | Complete | 2026-02-06 |
| v0.4 테스트 전략 | 14-18 | 9 | Complete | 2026-02-07 |
| v0.5 인증 재설계 | 19-21 | 9 | Complete | 2026-02-07 |
| v0.6 블록체인 확장 | 22-25 | 11 | Complete | 2026-02-08 |
| v0.7 장애 요소 해소 | 26-30 | 11 | Complete | 2026-02-08 |
| v0.8 Owner 선택적 등록 | 31-35 | 11 | Complete | 2026-02-09 |
| v0.9 MCP 세션 자동화 | 36-40 | 10 | Complete | 2026-02-09 |
| v0.10 설계 완결성 | 41-44 | 10 | Complete | 2026-02-09 |
| v1.0 구현 계획 수립 | 45-47 | 5 | Complete | 2026-02-09 |
| v1.1 코어 인프라 | 48-51 | 12 | Complete | 2026-02-10 |
| v1.2 인증 + 정책 엔진 | 52-57 | 13 | Complete | 2026-02-10 |
| v1.3 SDK + MCP + 알림 | 58-63 | 11 | Complete | 2026-02-11 |
| v1.3.1 Admin Web UI 설계 | 64-65 | 2 | Complete | 2026-02-11 |
| v1.3.2 Admin Web UI 구현 | 66-70 | 10 | Complete | 2026-02-11 |
| v1.3.3 MCP 다중 에이전트 | 71-72 | 2 | Complete | 2026-02-11 |
| v1.3.4 알림 트리거 + 어드민 | 73-75 | 1/5 | In progress | - |

**Total:** 18 milestones shipped, 72 phases completed, 165 plans completed + v1.3.4 in progress (3 phases, ~5 plans)

---

*Last updated: 2026-02-11 after v1.3.4 roadmap created*
