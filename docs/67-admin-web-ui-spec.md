# 67. Admin Web UI 설계 문서

> WAIaaS 데몬 내장 경량 관리 웹 UI — Preact SPA, masterAuth 전용, 5 페이지

---

## 1. 개요 + 포지셔닝

### 1.1 목적

Admin Web UI는 **개발자/관리자용 경량 관리 도구**로, 데몬이 정적 파일을 직접 서빙하는 내장형 SPA이다. Tauri Desktop(v1.6 예정)의 풀 GUI와 명확히 역할을 구분한다:

| 구분 | Admin Web UI (v1.3.2) | Tauri Desktop (v1.6) |
|------|----------------------|---------------------|
| 목적 | 핵심 관리 기능 5 페이지 | 풀 UX 8 화면 |
| 접근 | `http://127.0.0.1:{port}/admin` | 네이티브 앱 |
| 인증 | masterAuth 전용 | masterAuth + ownerAuth + sessionAuth |
| 범위 | 에이전트/세션/정책 CRUD, 상태 모니터링, Kill Switch | 트랜잭션 전송/이력/승인, 지갑 잔액 조회 포함 |

### 1.2 접근 방식

```
http://127.0.0.1:{port}/admin
```

데몬 프로세스가 Hono `serveStatic()` 미들웨어로 SPA 빌드 산출물을 직접 서빙한다. 별도 웹 서버 불필요.

### 1.3 대상 사용자

- **Self-Hosted 운영자**: 로컬 또는 서버에서 WAIaaS 데몬을 운영하는 관리자
- **AI 에이전트 개발자**: 에이전트 등록, 세션 생성, 정책 설정을 웹 UI로 수행하는 개발자
- **Docker 환경 관리자**: 컨테이너 환경에서 데몬을 관리하는 DevOps 엔지니어

### 1.4 비대상

- **최종 사용자용 풀 대시보드**: Tauri Desktop 영역
- **트랜잭션 전송/지갑 조회**: SDK, MCP, CLI를 통해 수행 (sessionAuth 필요)

### 1.5 범위 외 명시

다음 기능은 Admin UI 범위에 포함하지 않는다:

| 기능 | 제외 사유 | 대안 |
|------|----------|------|
| 트랜잭션 전송/이력/승인 | sessionAuth/ownerAuth 필요 | SDK, MCP, CLI |
| 지갑 잔액 조회 | sessionAuth 필요 | SDK, MCP, CLI |
| Owner 등록 | SIWS/SIWE 서명 필요 (브라우저 지갑 연동) | CLI `waiaas owner register` |

> masterAuth로 보호되는 관리 엔드포인트(`/v1/agents`, `/v1/policies`, `/v1/sessions`, `/v1/admin/*`)만 Admin UI 범위이다.

### 1.6 5 페이지 요약

| 화면 | 주요 기능 | API 요약 |
|------|----------|---------|
| **Dashboard** | 데몬 상태, 버전, uptime, 에이전트 수, 활성 세션 수, Kill Switch 상태. 30초 폴링 | `GET /v1/admin/status` |
| **Agents** | 목록 조회, 생성, 이름 수정, 상세(주소/네트워크/Owner 상태 읽기 전용), 삭제(terminate) | `GET/POST /v1/agents`, `GET/PUT/DELETE /v1/agents/{id}` |
| **Sessions** | 에이전트 선택 -> 세션 생성, 전체 목록(에이전트별 필터), 폐기, JWT 토큰 복사 | `GET /v1/agents`, `GET/POST /v1/sessions`, `DELETE /v1/sessions/{id}` |
| **Policies** | 정책 목록, 생성/수정, 티어별 한도 시각화(INSTANT/DELAY/BLOCKED 색상 구분), 삭제 | `GET/POST /v1/policies`, `PUT/DELETE /v1/policies/{id}` |
| **Settings** | 데몬 상태 읽기 전용, Kill Switch 토글(활성화/복구), JWT 시크릿 회전, 데몬 종료 | `GET /v1/admin/status`, `POST /v1/admin/kill-switch`, `POST /v1/admin/recover`, `POST /v1/admin/rotate-secret`, `POST /v1/admin/shutdown` |

---

## 2. 기술 스택

### 2.1 기술 결정 사항

| # | 항목 | 결정 | 버전 | 번들 크기 | 근거 |
|---|------|------|------|----------|------|
| 1 | SPA 프레임워크 | Preact | 10.x | ~3KB gzip | React 호환 API, hooks/signals, Vite 공식 플러그인(`@preact/preset-vite`). 실용적 SPA 중 최경량 |
| 2 | 라우터 | preact-iso hash router | latest | ~1KB gzip | `#/agents` 등 해시 라우팅. 서버 설정 불필요, 정적 서빙과 완벽 호환 |
| 3 | 상태 관리 | @preact/signals | latest | ~1KB gzip | Auth Store 전역 signal + 컴포넌트 로컬 상태. 5 페이지 규모에서 별도 상태 라이브러리 불필요 |
| 4 | 빌드 도구 | Vite + @preact/preset-vite | 6.x | - | tree-shaking, 해시 파일명, HMR 개발 경험 |
| 5 | 스타일 | Custom CSS + CSS Variables | - | 0KB 프레임워크 | 5 페이지 관리 도구에 CSS 프레임워크는 과도. CSS 변수로 색상/간격 토큰 관리 |
| 6 | HTTP 클라이언트 | 내장 fetch API | - | 0KB | 외부 라이브러리 없음. X-Master-Password 헤더 자동 주입하는 래퍼 사용 |
| 7 | 번들 크기 목표 | 100KB 이하 (gzip) | - | - | Preact(3KB) + router(1KB) + signals(1KB) + 앱 코드 + CSS. 충분한 여유 |
| 8 | 다국어 | 영문 단일 | - | - | 관리자 도구이므로 영문만. 에러 메시지도 영문 단일 |
| 9 | API 캐싱 | 없음 (매번 fetch) | - | - | 관리 도구 특성상 항상 최신 데이터 필요 |

### 2.2 번들 크기 분석

```
Preact 10.x         ~3KB gzip
preact-iso           ~1KB gzip
@preact/signals      ~1KB gzip
─────────────────────────────
프레임워크 합계       ~5KB gzip
앱 코드 + CSS        ~50-80KB gzip (예상)
─────────────────────────────
총 번들              ~55-85KB gzip (목표 100KB 이하)
```

> React(~45KB gzip) 대비 프레임워크 오버헤드가 약 1/9 수준이다.

---

## 3. Hono 서빙 설정 (INFRA-01, INFRA-04)

### 3.1 경로 분리

| 경로 패턴 | 처리 | 비고 |
|-----------|------|------|
| `/admin/*` | SPA 정적 파일 서빙 | Hono `serveStatic()` |
| `/v1/admin/*` | 기존 REST 엔드포인트 | `/v1/` 프리픽스로 SPA 경로와 충돌 없음 |
| `/health` | 기존 health check | 변경 없음 |

> SPA 경로(`/admin/*`)와 API 경로(`/v1/admin/*`)는 `/v1/` 프리픽스로 자연스럽게 분리된다.

### 3.2 Hono serveStatic 설정

```typescript
// packages/daemon/src/api/server.ts — createApp() 내부
// admin_ui=true일 때만 등록

if (config.daemon.admin_ui) {
  // 1. CSP 헤더 미들웨어 (/admin/* 경로에만 적용)
  app.use('/admin/*', adminCspMiddleware);

  // 2. 정적 파일 서빙 — /admin/assets/* (Vite 해시 파일명)
  //    Cache-Control: public, max-age=31536000, immutable
  app.use('/admin/assets/*', serveStatic({
    root: './public',
    onFound: (_path, c) => {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  // 3. SPA 엔트리 — /admin (정확히 일치)
  //    Cache-Control: no-cache, no-store, must-revalidate
  app.get('/admin', serveStatic({
    path: './public/admin/index.html',
    onFound: (_path, c) => {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }));

  // 4. SPA 정적 파일 직접 서빙 시도 — /admin/*
  app.use('/admin/*', serveStatic({ root: './public' }));

  // 5. SPA fallback — /admin/* 에서 정적 파일 미발견 시 index.html 반환
  //    해시 라우팅이므로 모든 /admin/* 경로에서 index.html 제공
  app.get('/admin/*', serveStatic({
    path: './public/admin/index.html',
    onFound: (_path, c) => {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }));
}

// admin_ui=false → 위 핸들러 미등록 → Hono 기본 404 반환
```

**등록 위치**: 기존 server.ts의 글로벌 미들웨어(requestId, hostGuard, killSwitchGuard, requestLogger) 이후, 라우트 등록 이전에 배치한다. 정적 파일 서빙은 인증 미들웨어(masterAuth/sessionAuth) 적용 범위 밖이므로 인증 없이 접근 가능하다 (SPA 자체는 공개, API 호출 시 masterAuth 검증).

**Hono 4.x serveStatic API 참조**:
- `root`: 정적 파일 루트 디렉토리 (프로세스 CWD 기준)
- `path`: 특정 파일을 직접 서빙
- `onFound`: 파일 발견 시 콜백 (헤더 설정에 활용)

### 3.3 CSP 헤더 미들웨어

`/admin/*` 경로에만 적용되는 Content-Security-Policy 미들웨어:

```typescript
// packages/daemon/src/api/middleware/csp.ts
import { createMiddleware } from 'hono/factory';

const CSP_VALUE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const adminCspMiddleware = createMiddleware(async (c, next) => {
  await next();
  c.header('Content-Security-Policy', CSP_VALUE);
});
```

**CSP 지시문 근거**:

| 지시문 | 값 | 근거 |
|--------|---|------|
| `default-src` | `'none'` | 기본 차단 후 필요한 것만 허용 (가장 엄격한 기본값) |
| `script-src` | `'self'` | 인라인 스크립트, eval(), 외부 스크립트 실행 차단. Vite 빌드 산출물만 실행 |
| `style-src` | `'self' 'unsafe-inline'` | CSS 파일 + Preact 인라인 style 속성 허용. CSS-in-JS 미사용이지만 동적 스타일 가능 |
| `connect-src` | `'self'` | 동일 origin API 호출만 허용. 외부 서버 통신 차단 |
| `img-src` | `'self' data:` | 로컬 이미지 + data URI (아이콘 등) 허용 |
| `font-src` | `'self'` | 외부 폰트 CDN 차단. 시스템 폰트 또는 로컬 폰트만 사용 |
| `base-uri` | `'self'` | `<base>` 태그 주입 공격 방어 |
| `form-action` | `'self'` | 폼 제출 대상 제한 (CSRF 보조 방어) |

### 3.4 캐시 정책

| 경로 | 캐시 헤더 | 근거 |
|------|----------|------|
| `/admin/assets/*` | `Cache-Control: public, max-age=31536000, immutable` | Vite 해시 파일명(`[name]-[hash].js`)이므로 내용 변경 시 파일명 변경. 영구 캐시 안전 |
| `/admin/index.html` | `Cache-Control: no-cache, no-store, must-revalidate` | SPA 엔트리 포인트. 항상 최신 버전 로드 필요 (빌드 시 asset 참조 변경) |
| `/admin/*` (기타 정적 파일) | 기본 (헤더 미설정) | Hono 기본 동작. ETag 기반 조건부 요청 |

### 3.5 CORS

**불필요**: SPA와 API가 동일 origin(`http://127.0.0.1:{port}`)에서 서빙되므로 CORS 설정이 필요 없다. 브라우저의 same-origin policy가 자동 적용된다.

### 3.6 admin_ui=false 동작 (INFRA-04)

`config.toml`에서 `admin_ui = false` 설정 시:

1. **SPA 서빙 미등록**: 3.2절의 `serveStatic` 핸들러가 등록되지 않음
2. **404 반환**: `/admin`, `/admin/*` 요청에 Hono 기본 404 응답
3. **API 엔드포인트 유지**: `/v1/admin/*` REST API는 `admin_ui` 설정과 **무관하게 항상 사용 가능**
4. **CSP 미적용**: CSP 미들웨어도 미등록 (SPA가 없으므로 불필요)

```toml
# config.toml — Admin UI 비활성화
[daemon]
admin_ui = false    # /admin 404 반환, /v1/admin/* API는 정상 동작
```

> Docker 환경에서 포트가 외부에 노출되는 경우 `admin_ui = false`로 SPA 접근을 차단하고, API만 CLI/SDK로 사용하는 것을 권장한다.
