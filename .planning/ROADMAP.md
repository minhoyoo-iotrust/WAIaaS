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
- 🚧 **v1.3.1 Admin Web UI 설계** — Phases 64-65 (in progress)

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

### 🚧 v1.3.1 Admin Web UI 설계 (In Progress)

**Milestone Goal:** 데몬 내장 경량 관리 웹 UI(5 페이지 SPA)의 설계 문서(67-admin-web-ui-spec.md)를 작성하여 v1.3.2 구현 착수에 필요한 모든 설계 결정을 완료한다

#### Phase 64: 인프라 + 인증 + 보안 기반 설계 — completed 2026-02-11
**Goal**: SPA 서빙 방식, 패키지 구조, 빌드 전략, config.toml 확장, masterAuth 인증 흐름, 보안 제약이 설계 문서에 확정되어 페이지 설계의 기반이 준비된다
**Status**: ✓ Complete (1/1 plans, 5/5 must-haves verified)

Plans:
- [x] 64-01-PLAN.md — 설계 문서 67 섹션 1-7 (개요, 기술 스택, Hono 서빙, 패키지 구조, config 확장, 인증 흐름, 보안)

#### Phase 65: 페이지 + 컴포넌트 + API 연동 설계
**Goal**: Dashboard/Agents/Sessions/Policies/Settings 5개 화면의 레이아웃, 컴포넌트 구조, 데이터 흐름과 공통 컴포넌트 체계, API 연동 패턴이 설계 문서에 확정되어 v1.3.2에서 즉시 구현 착수할 수 있다
**Depends on**: Phase 64
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, COMP-01, COMP-02, COMP-03, APIC-01, APIC-02, APIC-03
**Success Criteria** (what must be TRUE):
  1. Dashboard 화면의 위젯 레이아웃, 30초 폴링 구조, 데몬 상태/버전/에이전트 수/세션 수/Kill Switch 표시가 설계되어 있다
  2. Agents/Sessions/Policies/Settings 4개 화면의 목록, 폼, 상세, 삭제 등 모든 사용자 인터랙션과 데이터 흐름이 설계되어 있다
  3. Preact 컴포넌트 트리(App -> Router -> Page -> Section -> Widget)와 preact-iso 해시 라우터 경로 매핑이 정의되어 있다
  4. CSS Variables 디자인 토큰(색상, 간격, 타이포그래피)과 공통 컴포넌트(Table, Form, Modal, Toast, Button, Badge) 인터페이스가 정의되어 있다
  5. fetch 래퍼(X-Master-Password 자동 주입), 68개 에러 코드 -> 사용자 메시지 매핑, 로딩/빈 상태/연결 실패 UX 패턴, 폼 검증 방침이 정의되어 있다
**Plans:** 1 plan

Plans:
- [ ] 65-01-PLAN.md — 설계 문서 67 섹션 8-10 (5개 페이지 화면 설계 + 공통 컴포넌트 + API 연동 패턴)

## Progress

**Execution Order:** 64 -> 65

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
| **v1.3.1 Admin Web UI 설계** | **64-65** | **1/2** | **In progress** | — |

**Total:** 15 milestones shipped, 63 phases completed, 151 plans completed + v1.3.1 in progress (2 phases, 2 plans)

---

*Last updated: 2026-02-11 after Phase 64 completed*
