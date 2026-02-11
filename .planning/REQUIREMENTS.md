# Requirements: WAIaaS

**Defined:** 2026-02-11
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.3.2 Requirements

Requirements for Admin Web UI 구현. 설계 문서 67 + objective v1.3.2 기반.

### 인프라 (INFRA)

- [ ] **INFRA-01**: packages/admin Preact + Vite 패키지 스캐폴드 + 빌드 파이프라인 (postbuild → daemon/public/admin/)
- [ ] **INFRA-02**: daemon에서 /admin 정적 파일 서빙 + SPA fallback (serveStatic, admin_ui 설정 조건부)
- [ ] **INFRA-03**: CSP 미들웨어 (/admin/* 경로 전용, script-src 'self')
- [ ] **INFRA-04**: Kill Switch guard에 /admin bypass 추가 (Kill Switch 활성 시에도 SPA 로딩 가능)
- [ ] **INFRA-05**: config.toml [daemon] 섹션에 admin_ui, admin_timeout 키 추가 + AdminStatusResponse에 adminTimeout 포함
- [ ] **INFRA-06**: turbo.json 명시적 빌드 의존 (@waiaas/daemon#build → @waiaas/admin#build)
- [ ] **INFRA-07**: version 하드코딩 '0.0.0' → package.json 실제 버전으로 수정

### 인증 (AUTH)

- [ ] **AUTH-01**: 마스터 비밀번호 로그인 화면 (입력 → GET /v1/admin/status 검증 → Dashboard 이동)
- [ ] **AUTH-02**: @preact/signals 기반 Auth Store (masterPassword signal, 비활성 타임아웃 → 자동 로그아웃)
- [ ] **AUTH-03**: API Client fetch 래퍼 (X-Master-Password 자동 주입, 10초 타임아웃, 에러 코드 파싱, 401 분기)

### 페이지 (PAGE)

- [ ] **PAGE-01**: Dashboard 페이지 (데몬 상태/버전/uptime/에이전트 수/활성 세션 수/Kill Switch 카드, 30초 폴링)
- [ ] **PAGE-02**: Agents 페이지 (목록/생성/이름수정/상세/삭제, Owner 상태 읽기 전용)
- [ ] **PAGE-03**: Sessions 페이지 (에이전트 드롭다운 → 생성/조회/폐기, JWT 토큰 복사)
- [ ] **PAGE-04**: Policies 페이지 (10 유형 드롭다운, rules JSON 편집, 4-tier 색상 시각화)
- [ ] **PAGE-05**: Settings 페이지 (Kill Switch 토글, JWT 회전, 데몬 종료 + 확인 모달)

### 컴포넌트 (COMP)

- [ ] **COMP-01**: Layout 컴포넌트 (사이드바 + 헤더 + 콘텐츠) + 해시 라우터
- [ ] **COMP-02**: 재사용 컴포넌트 (Table, Form, Modal, Toast, CopyButton, EmptyState)
- [ ] **COMP-03**: 68 에러 코드 → 영문 사용자 친화적 메시지 매핑 + 날짜/주소 포맷팅 유틸

### 테스트 (TEST)

- [ ] **TEST-01**: 인증 테스트 4건 (로그인 성공/실패, 비활성 타임아웃, 로그아웃)
- [ ] **TEST-02**: Dashboard + Agents + Sessions + Policies + Settings 페이지 테스트 14건
- [ ] **TEST-03**: 보안 + 서빙 테스트 4건 (SPA 로드, admin_ui=false, CSP 헤더, Kill Switch bypass)

## Future Requirements

### v1.4 토큰 + 컨트랙트 확장
- **TOKEN-01**: SPL/ERC-20 토큰 전송
- **CONTRACT-01**: 컨트랙트 호출 + CONTRACT_WHITELIST
- **APPROVE-01**: Approve 관리 + 무제한 차단
- **BATCH-01**: Solana 원자적 배치

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dark mode 토글 UI | CSS Variables dark mode ready 설계 완료, 실제 전환 UI는 향후 |
| i18n (다국어) | 영문 단일 언어로 시작, 향후 ko 추가 |
| E2E 브라우저 테스트 (Playwright) | Vitest + Testing Library 단위/통합 테스트로 충분 |
| 실시간 WebSocket 업데이트 | 30초 폴링으로 시작, 향후 개선 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (roadmap 생성 시 채워짐) | | |

**Coverage:**
- v1.3.2 requirements: 22 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 22

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after initial definition*
