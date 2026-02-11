# Requirements: WAIaaS v1.3.1 Admin Web UI 설계

**Defined:** 2026-02-11
**Core Value:** 데몬에 내장된 경량 관리 웹 UI를 설계하여 v1.3.2에서 즉시 구현할 수 있는 상태를 확립

## v1 Requirements

### 화면 설계

- [ ] **PAGE-01**: Dashboard 화면의 레이아웃, 컴포넌트 구조, 30초 폴링 주기, 데몬 상태/버전/에이전트 수/세션 수/Kill Switch 표시가 설계된다
- [ ] **PAGE-02**: Agents 화면의 목록 테이블, 생성 폼(이름/네트워크), 상세 보기(주소/네트워크/Owner 상태 읽기 전용), 이름 수정, 삭제(확인 다이얼로그)가 설계된다
- [ ] **PAGE-03**: Sessions 화면의 에이전트 드롭다운 선택, 세션 생성, JWT 토큰 복사 버튼, 에이전트별 필터, 세션 폐기가 설계된다
- [ ] **PAGE-04**: Policies 화면의 정책 목록, 생성/수정 폼(필드 + 유효성 규칙), 티어별 한도 시각화(INSTANT/DELAY/BLOCKED 색상), 삭제(확인 다이얼로그)가 설계된다
- [ ] **PAGE-05**: Settings 화면의 데몬 상태 읽기 전용, Kill Switch 토글(GET 상태 조회 포함), JWT 시크릿 회전, 데몬 종료 + 종료 후 UI 동작이 설계된다

### 인증 설계

- [ ] **AUTH-01**: masterAuth 로그인 화면 + X-Master-Password 헤더 검증 + Auth Store(signal) 설계가 정의된다
- [ ] **AUTH-02**: 비활성 타임아웃(15분, config.toml admin_timeout) + 로그아웃 + 메모리 클리어 + 401 에러 시 리다이렉트가 정의된다

### 인프라 설계

- [ ] **INFRA-01**: Hono serveStatic SPA 서빙 설정(/admin/* → index.html fallback, /admin/assets/* → 정적 파일), CSP 헤더, 캐시 정책(해시 파일명 immutable + index.html no-cache)이 정의된다
- [ ] **INFRA-02**: packages/admin 패키지 구조(디렉토리 레이아웃), Vite 6.x 빌드 설정, daemon/public/admin/ 복사 전략(시점 + 방법 + git 추적 여부)이 정의된다
- [ ] **INFRA-03**: config.toml 신규 키(admin_ui boolean, admin_timeout 초) + WAIAAS_DAEMON_ADMIN_UI / WAIAAS_DAEMON_ADMIN_TIMEOUT 환경변수 오버라이드가 정의된다
- [ ] **INFRA-04**: admin_ui=false 시 /admin 404 반환 동작이 정의된다

### API 연동 설계

- [ ] **APIC-01**: fetch 래퍼 클라이언트(X-Master-Password 자동 주입, 에러 핸들링)가 설계된다
- [ ] **APIC-02**: 68개 WAIaaS 에러 코드 → 영문 사용자 친화적 메시지 매핑 테이블이 정의된다
- [ ] **APIC-03**: 로딩 인디케이터, 빈 상태("No items yet" + 생성 안내), 연결 실패 상태의 UX 패턴이 정의된다

### 컴포넌트 설계

- [ ] **COMP-01**: Preact 컴포넌트 트리(App → Router → Page → Section → Widget), preact-iso 해시 라우터 구조가 정의된다
- [ ] **COMP-02**: CSS Variables 디자인 토큰(색상, 간격, 타이포그래피), 공통 컴포넌트(Table, Form, Modal, Toast, Button, Badge) 인터페이스가 정의된다
- [ ] **COMP-03**: 폼 유효성 검증 방침(서버 Zod 스키마 재사용 vs 클라이언트 독자 검증) + 에이전트 이름/정책 한도 등 필드별 규칙이 정의된다

### 보안 설계

- [ ] **SEC-01**: CSP(script-src 'self'), 비밀번호 메모리 전용 보관, 민감 데이터 UI 노출 금지, Docker 포트 포워딩 시 보안 고려사항이 설계 문서에 정의된다

## Future Requirements

### v1.3.2 구현 (이 마일스톤에서 설계만)

- **IMPL-01**: packages/admin Preact SPA 구현
- **IMPL-02**: Hono serveStatic 미들웨어 통합
- **IMPL-03**: E2E 24건 시나리오 검증

## Out of Scope

| Feature | Reason |
|---------|--------|
| 트랜잭션 전송/이력/승인 UI | sessionAuth/ownerAuth 필요 — SDK/MCP/CLI 영역 |
| 지갑 잔액 조회 UI | sessionAuth 필요 — SDK/MCP/CLI 영역 |
| Owner 등록 UI | SIWS/SIWE 서명 필요 — CLI/SDK 영역 |
| 다국어 지원 | 관리자 도구이므로 영문 단일 |
| 페이지네이션 | 소수 데이터 관리 도구 특성, v1.4+ 필요 시 추가 |
| 다크 모드 | v1.3.1은 설계만, 테마 시스템은 CSS Variables로 확장 가능 |
| 실제 구현 코드 | v1.3.2에서 구현 — 이 마일스톤은 설계 문서 산출물만 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAGE-01 | Phase 65 | Pending |
| PAGE-02 | Phase 65 | Pending |
| PAGE-03 | Phase 65 | Pending |
| PAGE-04 | Phase 65 | Pending |
| PAGE-05 | Phase 65 | Pending |
| AUTH-01 | Phase 64 | Pending |
| AUTH-02 | Phase 64 | Pending |
| INFRA-01 | Phase 64 | Pending |
| INFRA-02 | Phase 64 | Pending |
| INFRA-03 | Phase 64 | Pending |
| INFRA-04 | Phase 64 | Pending |
| APIC-01 | Phase 65 | Pending |
| APIC-02 | Phase 65 | Pending |
| APIC-03 | Phase 65 | Pending |
| COMP-01 | Phase 65 | Pending |
| COMP-02 | Phase 65 | Pending |
| COMP-03 | Phase 65 | Pending |
| SEC-01 | Phase 64 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after roadmap created — traceability updated*
