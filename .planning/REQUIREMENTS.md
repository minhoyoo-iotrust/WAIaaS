# Requirements: WAIaaS v30.11

**Defined:** 2026-03-05
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v30.11 Requirements

Requirements for Admin UI DX 개선 — 메뉴 재구성 + 액션 Tier 오버라이드.

### Menu (메뉴 재구성)

- [ ] **MENU-01**: Actions 메뉴를 DeFi로 변경 (페이지 타이틀, 네비게이션 라벨, 서브타이틀)
- [ ] **MENU-02**: ERC-8004 메뉴를 Agent Identity로 변경 (페이지 타이틀, 네비게이션 라벨, 서브타이틀)
- [ ] **MENU-03**: URL 해시 라우트 변경 (`#/actions` → `#/defi`, `#/erc8004` → `#/agent-identity`)
- [ ] **MENU-04**: Agent Identity 메뉴를 DeFi 바로 다음에 배치

### Toggle (ERC-8004 토글 통합)

- [ ] **TOGL-01**: DeFi 페이지(구 Actions)에서 ERC-8004 프로바이더 카드 제거
- [ ] **TOGL-02**: Agent Identity 페이지(구 ERC-8004) 상단에 활성화/비활성화 토글 배치
- [ ] **TOGL-03**: 토글 변경 시 PUT /v1/admin/settings 호출하여 actions.erc8004_agent_enabled 값 변경
- [ ] **TOGL-04**: 비활성 상태에서도 토글은 항상 표시 — 토글 아래에 비활성 안내 메시지
- [ ] **TOGL-05**: 비활성 시 Registered Actions 테이블 읽기 전용 표시 (Tier 드롭다운 disabled) + 관리 탭 숨김, 활성화 시 전체 UI 렌더링

### Gate (Feature gate 수정 + 기본 활성화)

- [ ] **GATE-01**: Agent Identity 페이지의 settings 파싱을 Actions 페이지와 동일한 방식으로 통일
- [ ] **GATE-02**: 전체 액션 프로바이더 10개 기본값을 true로 변경 (jupiter_swap, zerox_swap, lifi, lido_staking, jito_staking, aave_v3, kamino, pendle_yield, drift_perp, erc8004_agent)
- [ ] **GATE-03**: DB v42 마이그레이션 — 10개 _enabled 설정 INSERT OR IGNORE (기존 운영자 설정 존중)
- [ ] **GATE-04**: 기본값 변경에 따른 기존 feature gate 및 등록 테스트 수정

### Desc (액션 설명 추가)

- [ ] **DESC-01**: 액션 프로바이더 메타데이터에 description 필드 추가 (각 액션의 영문 한 줄 설명)
- [ ] **DESC-02**: DeFi + Agent Identity 페이지의 Registered Actions 테이블에 Description 컬럼 추가

### Tier (액션별 Tier 오버라이드)

- [ ] **TIER-01**: Settings 키 패턴 `actions.{provider_key}_{action_name}_tier` 정의 (밑줄 구분, 점 3단계 회피)
- [ ] **TIER-02**: 허용 값 INSTANT/NOTIFY/DELAY/APPROVAL — Zod enum 검증
- [ ] **TIER-03**: 미설정 시 프로바이더 코드의 하드코딩 기본값 유지 (fallback)
- [ ] **TIER-04**: 파이프라인 Stage에서 tier 결정 시 Settings override → 프로바이더 기본값 순으로 조회
- [ ] **TIER-05**: Admin UI Registered Actions 테이블의 Default Tier 셀을 드롭다운으로 변경
- [ ] **TIER-06**: 드롭다운 변경 시 PUT /v1/admin/settings로 즉시 반영 (hot-reload)
- [ ] **TIER-07**: 오버라이드된 tier 시각적 구분 표시 (뱃지 색상 변경 또는 "customized" 라벨)
- [ ] **TIER-08**: Reset to default 기능 — 오버라이드 제거 시 프로바이더 기본값으로 복원

### Skill (스킬 파일 동기화)

- [ ] **SKIL-01**: admin.skill.md — 메뉴 이름 변경, tier 오버라이드 설정 방법 추가
- [ ] **SKIL-02**: erc8004.skill.md — 메뉴 경로 변경, 기본 활성화 반영
- [ ] **SKIL-03**: actions.skill.md — 메뉴 이름 변경, tier 오버라이드 기능 문서화, 전 프로바이더 기본 활성화 반영
- [ ] **SKIL-04**: policies.skill.md — tier 오버라이드와 정책 tier 에스컬레이션의 관계 명시

## Out of Scope

| Feature | Reason |
|---------|--------|
| 구 라우트 리다이렉트 (`#/actions`, `#/erc8004`) | Admin UI는 내부 전용, 외부 링크/북마크 시나리오 없음 |
| Tier 하향 차단 | 운영자 자율 결정, 경고만 표시 (D2) |
| 국제화 (i18n) | 액션 설명은 영어 코드 상수, 국제화 불필요 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MENU-01 | Phase 330 | Pending |
| MENU-02 | Phase 330 | Pending |
| MENU-03 | Phase 330 | Pending |
| MENU-04 | Phase 330 | Pending |
| TOGL-01 | Phase 330 | Pending |
| TOGL-02 | Phase 330 | Pending |
| TOGL-03 | Phase 330 | Pending |
| TOGL-04 | Phase 330 | Pending |
| TOGL-05 | Phase 330 | Pending |
| GATE-01 | Phase 330 | Pending |
| GATE-02 | Phase 330 | Pending |
| GATE-03 | Phase 330 | Pending |
| GATE-04 | Phase 330 | Pending |
| DESC-01 | Phase 331 | Pending |
| DESC-02 | Phase 331 | Pending |
| TIER-01 | Phase 331 | Pending |
| TIER-02 | Phase 331 | Pending |
| TIER-03 | Phase 331 | Pending |
| TIER-04 | Phase 331 | Pending |
| TIER-05 | Phase 331 | Pending |
| TIER-06 | Phase 331 | Pending |
| TIER-07 | Phase 331 | Pending |
| TIER-08 | Phase 331 | Pending |
| SKIL-01 | Phase 332 | Pending |
| SKIL-02 | Phase 332 | Pending |
| SKIL-03 | Phase 332 | Pending |
| SKIL-04 | Phase 332 | Pending |

**Coverage:**
- v30.11 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation*
