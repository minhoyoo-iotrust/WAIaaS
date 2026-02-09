# Requirements: WAIaaS v1.0

**Defined:** 2026-02-09
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.0 Requirements

v0.1~v0.10 설계 산출물을 코드로 전환하기 위한 구현 계획 문서를 확정한다.

### Objective 문서 생성

- [ ] **OBJ-01**: v1.1 코어 인프라 + 기본 전송 objective 문서 생성 (설계 문서 24-29, 31, 45, 54 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-02**: v1.2 인증 + 정책 엔진 objective 문서 생성 (설계 문서 30, 32-34, 52-53 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-03**: v1.3 SDK + MCP + 알림 objective 문서 생성 (설계 문서 35, 37-38, 55, v0.9 SessionManager 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-04**: v1.4 토큰 + 컨트랙트 확장 objective 문서 생성 (설계 문서 27, 36, 56-60 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-05**: v1.5 DeFi + 가격 오라클 objective 문서 생성 (설계 문서 61-63 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-06**: v1.6 Desktop + Telegram + Docker objective 문서 생성 (설계 문서 36, 39-40 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-07**: v1.7 품질 강화 + CI/CD objective 문서 생성 (설계 문서 46-51, 64 범위 정의 + E2E 검증 시나리오)
- [ ] **OBJ-08**: v2.0 전 기능 완성 릴리스 objective 문서 생성 (릴리스 체크리스트 + 배포 전략)

### 운영 도구

- [ ] **TOOL-01**: 설계 부채 추적 파일 초기화 (objectives/design-debt.md)
- [ ] **TOOL-02**: 구현 로드맵 최종 검증 (objectives/v1.0-implementation-planning.md 기준, 설계 문서 30개 전수 매핑 확인)

## Future Requirements

### v1.1 이후 (구현 마일스톤)

- **IMPL-01**: 코어 인프라 구현 (모노레포, SQLite, 키스토어, 데몬, CLI)
- **IMPL-02**: 인증 + 정책 엔진 구현 (세션, masterAuth, ownerAuth, DatabasePolicyEngine)
- **IMPL-03**: SDK + MCP + 알림 구현 (TS/Python SDK, MCP Server, 알림 채널)
- **IMPL-04**: 토큰 + 컨트랙트 확장 구현 (SPL/ERC-20, 컨트랙트, Approve, Batch, EVM)
- **IMPL-05**: DeFi + 가격 오라클 구현 (IPriceOracle, Action Provider, Jupiter Swap)
- **IMPL-06**: Desktop + Telegram + Docker 구현 (Tauri, Bot, Kill Switch, Docker)
- **IMPL-07**: 품질 강화 + CI/CD 구현 (300+ 테스트, 보안 시나리오, 파이프라인)
- **IMPL-08**: 전 기능 완성 릴리스 (문서, 배포, 릴리스)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 실제 코드 구현 | v1.0은 계획 마일스톤 — 코드 작성은 v1.1부터 |
| 새로운 기능 설계 | v0.1~v0.10에서 설계 완료 — v1.0은 기존 설계를 구현 계획으로 전환 |
| 설계 문서 수정 | 구현 중 발견되는 설계 변경은 v1.1+ 인라인 수정으로 처리 |
| CI/CD 파이프라인 구축 | v1.7에서 구현 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBJ-01 | Phase 45 | Pending |
| OBJ-02 | Phase 45 | Pending |
| OBJ-03 | Phase 45 | Pending |
| OBJ-04 | Phase 45 | Pending |
| OBJ-05 | Phase 46 | Pending |
| OBJ-06 | Phase 46 | Pending |
| OBJ-07 | Phase 46 | Pending |
| OBJ-08 | Phase 46 | Pending |
| TOOL-01 | Phase 47 | Pending |
| TOOL-02 | Phase 47 | Pending |

**Coverage:**
- v1.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after roadmap creation — traceability confirmed*
