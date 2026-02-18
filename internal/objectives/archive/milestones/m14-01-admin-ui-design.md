# 마일스톤 m14-01: Admin Web UI 설계

## 목표

데몬에 내장된 경량 관리 웹 UI를 **설계**하는 상태. 에이전트 등록, 정책 설정, 세션 관리 등 핵심 관리 기능을 브라우저에서 수행할 수 있는 SPA의 화면 구성, 기술 스택, 인증 흐름, API 연동 방식이 설계 문서로 확정되어 v1.3.2에서 즉시 구현할 수 있다.

> **v1.3.1 = 설계, v1.3.2 = 구현**

---

## 산출물

### 설계 문서

| 문서 | 이름 | 범위 |
|------|------|------|
| 67 | admin-web-ui-spec | 전체 Admin Web UI 설계 |

### 설계 문서 67 목차 (예상)

#### 1. 개요 + 포지셔닝

| 항목 | 설계 범위 |
|------|----------|
| 목적 | 개발자/관리자용 경량 관리 도구. Tauri Desktop(v1.6)의 풀 GUI와 구분 |
| 접근 | `http://127.0.0.1:{port}/admin` — 데몬이 정적 파일 직접 서빙 |
| 대상 | Self-Hosted 운영자, AI 에이전트 개발자, Docker 환경 관리자 |
| 비대상 | 최종 사용자용 풀 대시보드 (→ Tauri Desktop 영역), 트랜잭션 전송/지갑 조회 (→ SDK/MCP 영역) |

#### 2. 화면 구성 (5 페이지)

| 화면 | 주요 기능 | 사용 API |
|------|----------|----------|
| **Dashboard** | 데몬 상태, 버전, uptime, 에이전트 수, 활성 세션 수, Kill Switch 상태 요약. 30초 자동 폴링 | `GET /v1/admin/status` |
| **Agents** | 목록 조회, 생성 폼, 이름 수정, 상세(주소/네트워크/Owner 상태 읽기 전용), 삭제(terminate) | `GET/POST /v1/agents`, `GET/PUT/DELETE /v1/agents/{id}`, `PUT /v1/agents/{id}/owner` (읽기만 — Owner 등록은 CLI/SDK) |
| **Sessions** | 에이전트 선택(드롭다운) → 세션 생성, 전체 목록(에이전트별 필터 지원), 폐기, JWT 토큰 복사 버튼 | `GET /v1/agents` (드롭다운), `GET/POST /v1/sessions`, `DELETE /v1/sessions/{id}` |
| **Policies** | 정책 목록, 생성/수정 폼, 티어별 한도 시각화(INSTANT/DELAY/BLOCKED 색상 구분), 삭제 | `GET/POST /v1/policies`, `PUT/DELETE /v1/policies/{id}` |
| **Settings** | 데몬 상태 읽기 전용, Kill Switch 토글(활성화/복구), JWT 시크릿 회전, 데몬 종료 | `GET /v1/admin/status`, `POST /v1/admin/kill-switch`, `POST /v1/admin/recover`, `POST /v1/admin/rotate-secret`, `POST /v1/admin/shutdown` |

> **범위 외**: 트랜잭션 전송·이력·승인(sessionAuth/ownerAuth 필요)과 지갑 잔액 조회(sessionAuth 필요)는 Admin UI 범위에 포함하지 않는다. 이들은 SDK, MCP, CLI를 통해 수행한다. Owner 등록(`PUT /v1/agents/{id}/owner`)은 SIWS/SIWE 서명이 필요하므로 Admin UI에서 호출하지 않으며, 상세 페이지에서 현재 Owner 상태만 읽기 전용으로 표시한다.

#### 3. 인증 흐름

Admin UI는 **masterAuth 전용**으로 동작한다. JWT 세션을 생성하지 않으며, 마스터 비밀번호를 `X-Master-Password` 헤더로 매 요청 전송한다.

| 단계 | 설명 |
|------|------|
| 로그인 | 마스터 비밀번호 입력 → `GET /v1/admin/status` 호출로 검증 → 성공 시 Dashboard 이동 |
| 비밀번호 보관 | 메모리(변수)에 보관. localStorage/cookie 저장 금지 (보안) |
| API 호출 | 모든 요청에 `X-Master-Password` 헤더 자동 주입 |
| 로그아웃 | 메모리에서 비밀번호 클리어 → 로그인 리다이렉트 |
| 비활성 타임아웃 | 비활성 15분 초과 → 메모리 클리어 → 재로그인 필요 (config.toml `admin_timeout`으로 조정 가능) |

> masterAuth는 요청별 Argon2id 검증 방식으로, 세션/JWT를 생성하지 않는다. 갱신·만료 관리가 불필요하다.

#### 4. 기술 스택

| 항목 | 결정 | 근거 |
|------|------|------|
| 프레임워크 | **Preact 10.x** (~3KB gzip) | 실용적 SPA 중 최경량. React 호환 API(hooks, JSX). Vite 공식 플러그인(`@preact/preset-vite`). Testing Library 지원 |
| 라우터 | **preact-iso** hash router (~1KB gzip) | `#/agents`, `#/policies` 해시 라우팅. 서버 설정 불필요, 정적 서빙과 완벽 호환 |
| 상태 관리 | **@preact/signals** (~1KB gzip) | 컴포넌트 로컬 상태 + Auth Store용 전역 signal. 5 페이지 규모에서 별도 상태 라이브러리 불필요 |
| 빌드 | **Vite 6.x** | Preact 공식 지원, tree-shaking, 해시 파일명, 빠른 빌드 |
| 스타일 | **Custom CSS + CSS Variables** | 0KB 프레임워크 오버헤드. 5 페이지 관리 도구에서 CSS 프레임워크는 과도. CSS 변수로 테마 토큰 관리 |
| 번들 크기 | 목표 **100KB 이하** (gzip) | Preact(3KB) + router(1KB) + signals(1KB) + 앱 코드 + CSS. 500KB 대비 대폭 여유 |
| 서빙 | Hono `serveStatic()` 미들웨어로 정적 파일 서빙 | 데몬 프로세스에 내장, 별도 서버 불필요 |
| 패키지 위치 | **`packages/admin/`** (별도 패키지) | devDependencies로 분리하여 데몬 런타임 의존성 0. 빌드 산출물만 `packages/daemon/public/admin/`에 복사 |

#### 5. Hono 서빙 설정

| 항목 | 설계 범위 |
|------|----------|
| 경로 분리 | SPA: `/admin/*` → 정적 파일. API: `/v1/admin/*` → 기존 REST 엔드포인트. `/v1/` 프리픽스로 충돌 없음 |
| SPA fallback | `/admin`, `/admin/` → `index.html` 반환. `/admin/assets/*` → 정적 파일 직접 서빙 |
| CORS | 불필요 — 동일 origin 서빙 |
| CSP | Content-Security-Policy: `script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:` |
| 캐시 | `/admin/assets/*` (해시 파일명) → `Cache-Control: public, max-age=31536000, immutable`. `/admin/index.html` → `Cache-Control: no-cache` |
| 비활성화 | `config.toml`의 `[daemon] admin_ui = false`로 비활성화 → `/admin` 요청 시 404 반환 |
| 신규 config 키 | `[daemon]` 섹션에 `admin_ui` (boolean, 기본 true), `admin_timeout` (초, 기본 900) 추가 |

#### 6. API 연동 패턴

| 항목 | 설계 범위 |
|------|----------|
| HTTP 클라이언트 | 내장 fetch API (외부 라이브러리 없음) |
| 인증 헤더 | 모든 요청에 `X-Master-Password` 헤더 자동 주입 (fetch 래퍼) |
| 에러 처리 | WAIaaS 68 에러 코드 → 영문 사용자 친화적 메시지 매핑 |
| 로딩 상태 | 각 API 호출 시 로딩 인디케이터 표시 |
| 데이터 갱신 | Dashboard 30초 폴링, 나머지 페이지는 사용자 액션 시 fetch |
| 빈 상태 | 에이전트/세션/정책 0건 시 "No items yet" + 생성 버튼 안내 |
| 페이지네이션 | 없음 — 관리 도구 특성상 소수 데이터. 필요 시 v1.4+ 추가 |
| 401 처리 | 401 응답 시 Auth Store 클리어 + 로그인 리다이렉트 |

#### 7. 보안 고려사항

| 항목 | 설계 범위 |
|------|----------|
| localhost 전용 | 데몬이 127.0.0.1 바인딩이므로 외부 접근 기본 차단 |
| 비밀번호 보관 | 메모리 전용. localStorage/cookie 미사용 |
| CSP | `script-src 'self'` — 인라인 스크립트/외부 스크립트 차단 |
| 민감 데이터 | 개인 키, 마스터 비밀번호 해시 등 UI에 노출 금지 |
| Docker 환경 | 포트 포워딩 시 외부 접근 가능하므로, 마스터 비밀번호 인증 필수 유지 |
| 비활성 타임아웃 | 15분 비활성 시 메모리 비밀번호 클리어. `[daemon] admin_timeout` 초 단위 설정 가능 |

---

## 관련 기존 설계 문서

| 문서 | 이름 | 관련 내용 |
|------|------|----------|
| 29 | api-framework-design | Hono 미들웨어 체계, serveStatic 지원 여부 |
| 37 | rest-api-complete-spec | 33 엔드포인트 전체 — Admin UI가 호출할 masterAuth API 목록 |
| 39 | tauri-desktop-architecture | Tauri Desktop 8 화면 — Admin UI와 기능 중복/차별 정의 |
| 52 | auth-model-redesign | masterAuth — Admin UI 인증 흐름의 기반 |
| 54 | cli-flow-redesign | CLI 명령 체계 — Admin UI와 기능 대응 |
| 55 | dx-improvement-spec | DX 개선 — Admin UI가 DX 향상의 핵심 수단 |

---

## 기술 결정 사항

| # | 결정 항목 | 결정 | 근거 |
|---|----------|------|------|
| 1 | SPA 프레임워크 | **Preact 10.x** | 3KB gzip, React 호환 API, hooks/signals, Vite 공식 플러그인, Testing Library 지원. 실용적 SPA 중 최경량 |
| 2 | CSS 프레임워크 | **Custom CSS + CSS Variables** | 0KB 오버헤드. 5 페이지 관리 도구에 CSS 프레임워크는 과도. 변수로 색상/간격 토큰 관리 |
| 3 | 빌드 도구 | **Vite 6.x** | Preact 공식 프리셋(`@preact/preset-vite`), tree-shaking, 해시 파일명, HMR 개발 경험 |
| 4 | 패키지 위치 | **`packages/admin/`** (별도 패키지) | devDependencies 분리 → 데몬 런타임 의존성 0. 빌드 산출물만 daemon/public/에 복사 |
| 5 | 비활성 타임아웃 | **15분** (config.toml `admin_timeout = 900`으로 조정 가능) | 보안과 편의 균형. 초 단위 설정 |
| 6 | 라우터 | **해시 라우터** (`#/agents`, `#/policies`) | HTML5 History API는 서버 fallback 설정 필요. 해시 라우터는 정적 서빙에서 추가 설정 없이 동작 |
| 7 | 상태 관리 | **@preact/signals + 컴포넌트 로컬 상태** | 5 페이지 규모에서 전역 상태 라이브러리는 과도. Auth Store만 전역 signal |
| 8 | API 응답 캐싱 | **없음** (매번 fetch) | 관리 도구 특성상 항상 최신 데이터 필요 |
| 9 | 다국어 | **영문 단일** | 관리자 도구이므로 영문만. 에러 메시지도 영문 단일 |

> **확정 사항**: Admin UI 인증은 masterAuth(X-Master-Password) 직접 사용. JWT 세션 기반 인증 불사용.

---

## E2E 검증 시나리오

> v1.3.1은 설계 마일스톤이므로 E2E 시나리오는 **v1.3.2 구현 시 검증 기준**으로 정의한다.

### 인증 (4건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 1 | 마스터 비밀번호 입력 → 로그인 성공 → Dashboard 표시 | [L0] |
| 2 | 잘못된 비밀번호 → 로그인 실패 + 에러 메시지 | [L0] |
| 3 | 비활성 타임아웃 (15분) → 메모리 클리어 → 로그인 리다이렉트 | [L0] |
| 4 | 로그아웃 버튼 → 메모리 클리어 → 로그인 화면 | [L0] |

### Dashboard (3건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 5 | Dashboard에 데몬 상태 + 버전 + 에이전트 수 + 활성 세션 수 + Kill Switch 상태 표시 | [L0] |
| 6 | 30초 자동 폴링으로 데이터 갱신 | [L0] |
| 7 | 데몬 미시작 시 연결 실패 메시지 | [L0] |

### Agents (5건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 8 | 에이전트 목록 조회 + 테이블 표시 | [L0] |
| 9 | 에이전트 생성 폼 → 제출 → 목록에 추가 | [L0] |
| 10 | 에이전트 상세 → 주소 + 네트워크 + Owner 상태(읽기 전용) 표시 | [L0] |
| 11 | 에이전트 이름 수정 → 반영 확인 | [L0] |
| 12 | 에이전트 삭제(terminate) → 확인 다이얼로그 → 목록에서 제거 | [L0] |

### Sessions (3건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 13 | 에이전트 드롭다운 선택 → 세션 생성 → JWT 토큰 표시 + 복사 버튼 | [L0] |
| 14 | 세션 목록 → 활성 세션 표시 (에이전트별 필터 지원) | [L0] |
| 15 | 세션 폐기 → 목록에서 제거 | [L0] |

### Policies (3건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 16 | 정책 목록 조회 + 티어별 한도 표시 | [L0] |
| 17 | 정책 생성/수정 폼 → 제출 → 반영 확인 | [L0] |
| 18 | 정책 삭제 → 확인 다이얼로그 → 목록에서 제거 | [L0] |

### Settings (3건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 19 | Kill Switch 활성화 토글 → 상태 반영 | [L0] |
| 20 | Kill Switch 복구 → 상태 반영 | [L0] |
| 21 | JWT 시크릿 회전 → 성공 메시지 | [L0] |

### 보안 + 서빙 (3건)

| # | 시나리오 | 태그 |
|---|---------|------|
| 22 | `/admin` 접근 → SPA 로드 + index.html 반환 | [L0] |
| 23 | `admin_ui = false` → `/admin` 404 반환 | [L0] |
| 24 | CSP 헤더 포함 확인 (`script-src 'self'`) | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.2 (인증 + 정책 엔진) | masterAuth, PolicyEngine이 구현되어야 Admin UI 인증 및 정책 관리 가능 |
| v1.3 (SDK + MCP + 알림) | REST API 33개 엔드포인트가 완료되어 Admin UI가 호출할 API 확보 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | SPA 번들 크기 과다 | 데몬 npm 패키지 크기 증가 → 설치 시간 증가 | Preact 선정으로 프레임워크 오버헤드 ~5KB. 목표 100KB 이하(gzip). tree-shaking + code splitting |
| 2 | 프론트엔드 프레임워크 의존성 | 데몬의 의존성 트리 복잡화 | 빌드 산출물만 포함 (devDependencies로 분리). 데몬 런타임 의존성 0 |
| 3 | Tauri Desktop과 기능 중복 | 유지보수 부담 증가 | Admin UI는 관리 핵심 5 페이지만, Tauri는 풀 UX 8 화면으로 역할 명확 구분 |
| 4 | Docker 환경 포트 노출 시 보안 | 외부에서 Admin UI 접근 가능 | masterAuth 인증 필수 + CSP + `admin_ui = false` 비활성화 옵션 |
| 5 | 정적 파일 서빙 성능 | Hono serveStatic이 프로덕션 부하 감당 가능한지 | localhost 단일 사용자 환경이므로 성능 문제 없음. ETag/Cache-Control 최적화 |

---

*최종 업데이트: 2026-02-11 — Preact 10.x 확정, 기술 결정 9건 확정, E2E 19→24건, 불명확 영역 전수 해소*
