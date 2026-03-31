# Requirements: WAIaaS v33.0 Desktop App 아키텍처 재설계

**Defined:** 2026-03-31
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v33.0. Each maps to roadmap phases.

### 설계 문서 39 수정 (DOC)

- [x] **DOC-01**: 설계 문서 39 아키텍처 다이어그램이 WebView→Admin Web UI(localhost) 로드 구조로 변경됨
- [x] **DOC-02**: 계층 역할 분리가 React 18 SPA 대신 기존 Preact Admin Web UI 재사용으로 기술됨
- [x] **DOC-03**: HTTP localhost 통신 섹션이 apiCall() 상대 경로 재사용 패턴으로 갱신됨
- [x] **DOC-04**: 프로젝트 구조 섹션에서 apps/desktop/src/pages/ 8화면이 제거되고 packages/admin/src/ 확장으로 대체됨
- [x] **DOC-05**: UI 화면별 플로우가 기존 Admin Web UI 19페이지 + Desktop 전용 확장(Wizard, WalletConnect, Sidecar 상태)으로 갱신됨
- [x] **DOC-06**: 구현 노트가 React 18 관련 내용에서 Admin Web UI 재사용 + isDesktop() 패턴으로 변경됨

### Desktop 환경 감지 + IPC 설계 (IPC)

- [ ] **IPC-01**: isDesktop() 환경 감지 전략(window.__TAURI_INTERNALS__ 체크)이 문서화됨
- [ ] **IPC-02**: IPC 브릿지 설계가 6개 명령(start/stop/restart/status/logs/notification)으로 문서화됨
- [ ] **IPC-03**: Tauri CapabilityBuilder.remote() URL 패턴(http://127.0.0.1:*/*) 설계가 포함됨
- [ ] **IPC-04**: CSP 예외 전략(Tauri WebView에서의 connect-src 조정)이 문서화됨
- [ ] **IPC-05**: 조건부 렌더링 전략(isDesktop() 가드 + dynamic import)이 Desktop 전용 컴포넌트별로 명세됨

### 번들 + 빌드 설계 (BLD)

- [ ] **BLD-01**: packages/admin/src/desktop/ 모듈 경계가 정의되고 dynamic import 규칙이 문서화됨
- [ ] **BLD-02**: Desktop-only 의존성 목록(@tauri-apps/api, @reown/appkit 등)이 명시되고 lazy load 대상으로 지정됨
- [ ] **BLD-03**: 브라우저 배포 번들에 Desktop 전용 코드가 포함되지 않는 tree-shaking 전략이 문서화됨
- [ ] **BLD-04**: Vite 빌드 설정 변경사항(dev 서버 + Tauri 개발 워크플로우)이 설계됨

### 프로젝트 구조 + 정합성 (STR)

- [ ] **STR-01**: 데몬 포트 동적 할당 프로토콜(TCP bind(0) + stdout/tempfile 전달)이 설계됨
- [ ] **STR-02**: m33-02 Desktop App 구현 objectives가 변경된 아키텍처와 정합하도록 갱신됨
- [ ] **STR-03**: 설계 문서 39의 변경하지 않는 섹션(4,5,8,9,10,11,12)과 변경 섹션 간 일관성이 검증됨

## v2 Requirements

Deferred to m33-02 (Desktop App 구현) milestone.

### Desktop App 구현

- **IMPL-01**: Tauri 2.x 셸 스캐폴드 (apps/desktop/)
- **IMPL-02**: Sidecar Manager 구현 (Node.js SEA 바이너리 패키징)
- **IMPL-03**: isDesktop() + IPC 브릿지 코드 구현
- **IMPL-04**: Desktop 전용 UI 확장 (Setup Wizard, Sidecar Status Panel)
- **IMPL-05**: WalletConnect QR 데스크탑 통합 (@reown/appkit vanilla JS)
- **IMPL-06**: 자동 업데이트 (tauri-plugin-updater, Ed25519 서명)
- **IMPL-07**: 크로스 플랫폼 빌드 파이프라인 (macOS/Windows/Linux)

## Out of Scope

| Feature | Reason |
|---------|--------|
| React 18 SPA 구현 | 기존 설계 폐기 — Admin Web UI 재사용으로 전환 |
| Desktop App 코드 구현 | m33-02에서 수행, 본 마일스톤은 설계 전용 |
| 신규 Admin Web UI 페이지 | 기존 19페이지를 그대로 재사용, 추가 불필요 |
| Linux Wayland 호환성 검증 | m33-02 구현 시점에 검증, 설계 단계에서 불필요 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOC-01 | Phase 456 | Complete |
| DOC-02 | Phase 456 | Complete |
| DOC-03 | Phase 456 | Complete |
| DOC-04 | Phase 456 | Complete |
| DOC-05 | Phase 456 | Complete |
| DOC-06 | Phase 456 | Complete |
| IPC-01 | Phase 457 | Pending |
| IPC-02 | Phase 457 | Pending |
| IPC-03 | Phase 457 | Pending |
| IPC-04 | Phase 457 | Pending |
| IPC-05 | Phase 457 | Pending |
| BLD-01 | Phase 457 | Pending |
| BLD-02 | Phase 457 | Pending |
| BLD-03 | Phase 457 | Pending |
| BLD-04 | Phase 457 | Pending |
| STR-01 | Phase 458 | Pending |
| STR-02 | Phase 458 | Pending |
| STR-03 | Phase 458 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation*
