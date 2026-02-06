# Roadmap: WAIaaS

## Milestones

- :white_check_mark: **v0.1 Research & Design** - Phases 1-5 (shipped 2026-02-05)
- :white_check_mark: **v0.2 Self-Hosted Secure Wallet Design** - Phases 6-9 (shipped 2026-02-05)
- :construction: **v0.3 설계 논리 일관성 확보** - Phases 10-13 (in progress)

## Phases

<details>
<summary>v0.1 Research & Design (Phases 1-5) - SHIPPED 2026-02-05</summary>

5개 페이즈, 15개 플랜, 23개 요구사항 완료.
기술 스택 확정, 커스터디 모델, Dual Key 아키텍처, 소유자-에이전트 관계 모델, API 스펙 완성.

Git range: first commit → `fbceed0`

</details>

<details>
<summary>v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) - SHIPPED 2026-02-05</summary>

4개 페이즈, 16개 플랜, 45개 요구사항, 17개 설계 문서 완료.

- Phase 6: Core Architecture Design (5 plans) — 모노레포, SQLite 스키마, 키스토어, ChainAdapter, 데몬 라이프사이클
- Phase 7: Session & Transaction Protocol (3 plans) — JWT 세션, SolanaAdapter, 6단계 파이프라인
- Phase 8: Security Layers Design (4 plans) — 4-tier 정책, WalletConnect, 알림, Kill Switch
- Phase 9: Integration & Client Interface (4 plans) — REST API, SDK, MCP, Tauri Desktop, Telegram Bot

Git range: `5be4181` → `fec9f88`

</details>

### :construction: v0.3 설계 논리 일관성 확보 (진행 중)

**마일스톤 목표:** v0.1(리서치 & 기획)과 v0.2(Self-Hosted 설계) 전체 산출물 40건을 크로스체크하여, 구현 단계 진입 전에 설계 문서 간 논리적 모순을 해소한다. Enum/상태값, 설정 스펙, API 스키마, 수치 기준을 단일 진실 소스(Single Source of Truth)로 통일한다.

**산출물:** 수정된 설계 문서, v0.1→v0.2 변경 매핑 문서, Enum/상태값 통합 대응표, 구현 노트

- [x] **Phase 10: v0.1 잔재 정리** — SUPERSEDED 표기, 변경 매핑 문서 작성 ✓
- [x] **Phase 11: CRITICAL 의사결정 확정** — 포트, Enum, Docker 바인딩, 자금 충전 모델 ✓
- [x] **Phase 12: HIGH 스키마/수치 통일** — Enum 통일, config.toml 보완, API 스펙 통일 ✓
- [ ] **Phase 13: MEDIUM 구현 노트** — 11개 구현 시 주의사항 문서화

## Phase Details

### Phase 10: v0.1 잔재 정리

**Goal**: v0.2에서 대체된 v0.1 설계에 SUPERSEDED 표기를 추가하고, 변경 매핑 문서를 작성하여 잘못된 참조를 방지한다.

**Depends on**: v0.2 완료 (40개 설계 문서 분석)

**Requirements**: LEGACY-01, LEGACY-02, LEGACY-03, LEGACY-04, LEGACY-05, LEGACY-06, LEGACY-07, LEGACY-08, LEGACY-09

**Plans:** 2 plans

**Success Criteria** (what must be TRUE):
  1. v0.1 → v0.2 변경 매핑 문서가 작성됨 (40개 문서 간 대체/계승 관계 명시)
  2. v0.1 문서 중 v0.2에서 대체된 항목에 SUPERSEDED 표기가 추가됨 (C4~C7 해당 문서)
  3. IBlockchainAdapter → IChainAdapter 참조가 모든 문서에서 수정됨 (H1)
  4. v0.1의 Squads 메서드, RFC 9457 에러 코드, 4단계 에스컬레이션이 v0.2 대체 항목으로 매핑됨 (H10, H11, H13)
  5. 구현 시 참조해야 할 문서가 명확히 구분됨

Plans:
- [x] 10-01-PLAN.md — v0.1 → v0.2 변경 매핑 문서 작성 + SUPERSEDED 표기 추가
- [x] 10-02-PLAN.md — 인터페이스명/에러코드/에스컬레이션 모델 대응표 작성

---

### Phase 11: CRITICAL 의사결정 확정

**Goal**: 시스템의 기본 동작에 영향을 미치는 CRITICAL 모순 4건을 단일 값으로 확정하고 해당 설계 문서에 반영한다.

**Depends on**: Phase 10 (v0.1 잔재 정리 완료)

**Requirements**: CRIT-01, CRIT-02, CRIT-03, CRIT-04

**Plans:** 1 plan

**Success Criteria** (what must be TRUE):
  1. 기본 포트가 3100으로 통일됨 — config.toml(24-monorepo) 수정, 모든 문서 일관
  2. 트랜잭션 상태 Enum이 통일됨 — DB 8개 상태 + 클라이언트 표시 상태 분리 명확
  3. Docker 바인딩 전략이 확정됨 — WAIAAS_HOST 환경변수 오버라이드 설계 추가
  4. 자금 충전 모델이 문서화됨 — Owner → Agent 직접 SOL 전송 방식 명시

Plans:
- [x] 11-01-PLAN.md — CRITICAL 4건 의사결정 확정 및 문서 반영 (C1, C2, C3, C8)

---

### Phase 12: HIGH 스키마/수치 통일

**Goal**: 문서 간 충돌하는 Enum, 수치, 스키마를 하나로 통일하고 config.toml 누락 설정을 추가한다.

**Depends on**: Phase 11 (CRITICAL 확정 완료)

**Requirements**: ENUM-01, ENUM-02, ENUM-03, ENUM-04, CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, API-01, API-02, API-03, API-04, API-05, API-06

**Plans:** 3 plans

**Success Criteria** (what must be TRUE):
  1. 모든 Enum/상태값이 SQLite CHECK 제약과 1:1로 대응하는 통합표가 존재함
  2. 세션 TTL 24h, jwt_secret 필드가 config.toml에 추가됨
  3. 연속 실패 임계값, Nonce 캐시 크기, Kill Switch 쿨다운이 config.toml에 설정화됨
  4. 메모 길이 제한(256 bytes/200 chars)이 통일됨
  5. REST API와 API Framework 간 CORS, Health, Rate Limiter, SuccessResponse가 일치함
  6. ownerAuth 미들웨어 상세가 REST API 스펙에 정의됨

Plans:
- [x] 12-01-PLAN.md — Enum/상태값 통합 대응표 작성 + SQLite CHECK 일치 검증
- [x] 12-02-PLAN.md — config.toml 누락 설정 추가 (jwt_secret, 임계값, 쿨다운 등)
- [x] 12-03-PLAN.md — REST API ↔ API Framework 스펙 통일 (CORS, Health, Rate Limiter, ownerAuth)

---

### Phase 13: MEDIUM 구현 노트

**Goal**: 구현 시 주의해야 할 MEDIUM 사항 11건을 해당 v0.2 설계 문서에 "구현 노트" 섹션으로 추가한다.

**Depends on**: Phase 12 (HIGH 통일 완료)

**Requirements**: NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06, NOTE-07, NOTE-08, NOTE-09, NOTE-10, NOTE-11

**Plans:** 2 plans

**Success Criteria** (what must be TRUE):
  1. BalanceInfo.amount lamports/SOL 변환 규칙이 문서화됨
  2. 알림 채널 최소 2개 요구가 config 표현과 일치함
  3. MCP 6개 도구 ↔ REST 31개 엔드포인트 기능 패리티 매트릭스가 존재함
  4. SDK 에러 타입 매핑 전략이 정의됨 (36개 에러 코드)
  5. Tauri IPC + HTTP 이중 채널 에러 처리 전략이 문서화됨
  6. Setup Wizard vs CLI init 초기화 순서가 통일됨
  7. Telegram SIWS 서명 방안(Tier 2 인증)이 정의됨
  8. Docker graceful shutdown 35초 + 10단계 합산이 검증됨
  9. 에이전트 생명주기 5단계 ↔ agents.status 매핑이 검증됨
  10. Python SDK snake_case 변환 일관성이 검증됨
  11. 커서 페이지네이션 파라미터명이 통일됨

Plans:
- [ ] 13-01-PLAN.md — 단위 변환/매핑/패리티 구현 노트 (NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-08, NOTE-09, NOTE-10, NOTE-11)
- [ ] 13-02-PLAN.md — 통합/인증/배포 구현 노트 (NOTE-05, NOTE-06, NOTE-07)

## Progress

**Execution Order:** Phase 10 → 11 → 12 → 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5 | v0.1 | 15/15 | Complete | 2026-02-05 |
| 6-9 | v0.2 | 16/16 | Complete | 2026-02-05 |
| 10. v0.1 잔재 정리 | v0.3 | 2/2 | Complete | 2026-02-06 |
| 11. CRITICAL 의사결정 | v0.3 | 1/1 | Complete | 2026-02-06 |
| 12. HIGH 스키마/수치 통일 | v0.3 | 3/3 | Complete | 2026-02-06 |
| 13. MEDIUM 구현 노트 | v0.3 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-05*
*Last updated: 2026-02-06 (Phase 12 complete)*
