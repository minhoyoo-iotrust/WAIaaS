# Requirements: WAIaaS v2.4.1

**Defined:** 2026-02-19
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

v2.3 Admin UI 메뉴 재구성으로 하락한 테스트 커버리지를 70%로 복원.

### 신규 페이지 테스트 (NEWPG)

- [ ] **NEWPG-01**: security.tsx 렌더링 + 탭 네비게이션 테스트
- [ ] **NEWPG-02**: security.tsx Kill Switch 활성화/비활성화 테스트
- [ ] **NEWPG-03**: security.tsx JWT Rotation 설정 테스트
- [ ] **NEWPG-04**: security.tsx Danger Zone 동작 테스트
- [ ] **NEWPG-05**: system.tsx 렌더링 + 탭 네비게이션 테스트
- [ ] **NEWPG-06**: system.tsx Daemon 설정 폼 제출 테스트
- [ ] **NEWPG-07**: system.tsx AutoStop 설정 토글 + 저장 테스트
- [ ] **NEWPG-08**: system.tsx Monitoring 설정 폼 테스트
- [ ] **NEWPG-09**: system.tsx API Keys CRUD 테스트
- [x] **NEWPG-10**: walletconnect.tsx 설정 폼 테스트
- [x] **NEWPG-11**: walletconnect.tsx 페어링/세션 목록 렌더링 테스트
- [x] **NEWPG-12**: walletconnect.tsx 미설정 상태 안내 UI 테스트

### 공용 컴포넌트 테스트 (COMP)

- [ ] **COMP-01**: empty-state.tsx 렌더링 + CTA 버튼 클릭 테스트
- [ ] **COMP-02**: unsaved-dialog.tsx 열기/닫기 + 확인/취소 핸들러 테스트
- [ ] **COMP-03**: settings-search.tsx 검색어 입력 + 필터링 + 결과 하이라이트 테스트
- [ ] **COMP-04**: policy-rules-summary.tsx 다양한 정책 타입별 요약 렌더링 테스트
- [ ] **COMP-05**: dirty-guard.ts 변경 감지 + 이탈 경고 테스트

### 기존 페이지 테스트 개선 (EXIST)

- [ ] **EXIST-01**: notifications.tsx 채널별 설정 폼 + 테스트 전송 흐름 커버리지 개선
- [ ] **EXIST-02**: sessions.tsx 세션 목록 + 생성/삭제 흐름 커버리지 개선
- [ ] **EXIST-03**: wallets.tsx 월렛 상세 + 네트워크 전환 + 잔액 표시 커버리지 개선

### 인프라 (INFRA)

- [ ] **INFRA-01**: vitest.config.ts 임계값을 lines/statements/functions 70%로 복원
- [ ] **INFRA-02**: CI 전체 통과 검증 (lint + typecheck + test:unit + coverage gate)

## v2 Requirements

없음 — 이 마일스톤은 v2.3에서 발생한 커버리지 부채 해소에 집중.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 신규 기능 추가 | 이 마일스톤은 순수 테스트 작성, 기능 변경 없음 |
| 75%+ 커버리지 목표 | 과도한 목표보다 실용적 70% 유지 |
| branches 임계값 상향 | UI 분기 특성상 65% 유지 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NEWPG-01 | Phase 191 | Pending |
| NEWPG-02 | Phase 191 | Pending |
| NEWPG-03 | Phase 191 | Pending |
| NEWPG-04 | Phase 191 | Pending |
| NEWPG-05 | Phase 192 | Pending |
| NEWPG-06 | Phase 192 | Pending |
| NEWPG-07 | Phase 192 | Pending |
| NEWPG-08 | Phase 192 | Pending |
| NEWPG-09 | Phase 192 | Pending |
| NEWPG-10 | Phase 191 | Complete |
| NEWPG-11 | Phase 191 | Complete |
| NEWPG-12 | Phase 191 | Complete |
| COMP-01 | Phase 193 | Pending |
| COMP-02 | Phase 193 | Pending |
| COMP-03 | Phase 193 | Pending |
| COMP-04 | Phase 193 | Pending |
| COMP-05 | Phase 193 | Pending |
| EXIST-01 | Phase 193 | Pending |
| EXIST-02 | Phase 193 | Pending |
| EXIST-03 | Phase 193 | Pending |
| INFRA-01 | Phase 193 | Pending |
| INFRA-02 | Phase 193 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
