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
| 범위 | 지갑/세션/정책 CRUD, 상태 모니터링, Kill Switch | 트랜잭션 전송/이력/승인, 지갑 잔액 조회 포함 |

### 1.2 접근 방식

```
http://127.0.0.1:{port}/admin
```

데몬 프로세스가 Hono `serveStatic()` 미들웨어로 SPA 빌드 산출물을 직접 서빙한다. 별도 웹 서버 불필요.

### 1.3 대상 사용자

- **Self-Hosted 운영자**: 로컬 또는 서버에서 WAIaaS 데몬을 운영하는 관리자
- **AI 에이전트 개발자**: 지갑 등록, 세션 생성, 정책 설정을 웹 UI로 수행하는 개발자
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

> masterAuth로 보호되는 관리 엔드포인트(`/v1/wallets`, `/v1/policies`, `/v1/sessions`, `/v1/admin/*`)만 Admin UI 범위이다.

### 1.6 5 페이지 요약

| 화면 | 주요 기능 | API 요약 |
|------|----------|---------|
| **Dashboard** | 데몬 상태, 버전, uptime, 지갑 수, 활성 세션 수, Kill Switch 상태. 30초 폴링 | `GET /v1/admin/status` |
| **Wallets** | 목록 조회, 생성, 이름 수정, 상세(주소/네트워크/Owner 상태 읽기 전용), 삭제(terminate) | `GET/POST /v1/wallets`, `GET/PUT/DELETE /v1/wallets/{id}` |
| **Sessions** | 지갑 선택 -> 세션 생성, 전체 목록(지갑별 필터), 폐기, JWT 토큰 복사 | `GET /v1/wallets`, `GET/POST /v1/sessions`, `DELETE /v1/sessions/{id}` |
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

---

## 4. 패키지 구조 + 빌드 전략 (INFRA-02)

### 4.1 packages/admin 디렉토리 레이아웃

```
packages/admin/
  package.json                     # name: @waiaas/admin, private: true
  tsconfig.json                    # Preact JSX 설정 (jsxImportSource: 'preact')
  vite.config.ts                   # Vite 6.x + @preact/preset-vite
  index.html                       # SPA 엔트리 포인트
  src/
    main.tsx                       # Preact render + 해시 라우터 초기화
    app.tsx                        # 루트 컴포넌트 (라우터 + auth guard)
    api/
      client.ts                    # fetch 래퍼 (X-Master-Password 자동 주입, 401 처리)
      endpoints.ts                 # API 엔드포인트 상수 + 응답 타입
    auth/
      login.tsx                    # 로그인 화면
      store.ts                     # @preact/signals auth signal + 비활성 타임아웃
    pages/
      dashboard.tsx                # Dashboard (30초 폴링)
      agents.tsx                   # Agents CRUD
      sessions.tsx                 # Sessions 관리
      policies.tsx                 # Policies 관리
      settings.tsx                 # Settings + Kill Switch
    components/
      layout.tsx                   # 사이드바 + 헤더 + 콘텐츠 레이아웃
      table.tsx                    # 재사용 테이블
      form.tsx                     # 재사용 폼 (입력, 셀렉트, 버튼)
      modal.tsx                    # 확인 다이얼로그
      toast.tsx                    # 성공/에러 토스트
      copy-button.tsx              # 클립보드 복사 버튼
      empty-state.tsx              # 데이터 0건 안내
    styles/
      global.css                   # CSS 변수 + 글로벌 스타일
    utils/
      error-messages.ts            # 68 에러 코드 → 영문 메시지 매핑
      format.ts                    # 날짜, 주소 포맷팅
```

**디렉토리 구조 근거**:
- `api/`: 모든 HTTP 통신을 단일 래퍼(`client.ts`)로 집중하여 인증 헤더와 에러 처리를 SSoT로 관리
- `auth/`: 로그인 화면과 인증 상태를 별도 디렉토리로 분리 (페이지와 구분)
- `pages/`: 5개 페이지 각각 독립 파일. 해시 라우터 경로와 1:1 매핑
- `components/`: 2개 이상 페이지에서 재사용되는 공통 컴포넌트
- `styles/`: CSS 변수(디자인 토큰)와 글로벌 스타일
- `utils/`: 순수 함수 유틸리티 (UI 무관)

### 4.2 package.json 핵심 설정

```jsonc
{
  "name": "@waiaas/admin",
  "private": true,                       // npm 배포하지 않음
  "type": "module",
  "scripts": {
    "dev": "vite",                       // HMR 개발 서버 (port 5173)
    "build": "vite build",
    "postbuild": "cp -r dist/* ../daemon/public/admin/"  // 빌드 산출물 자동 복사
  },
  "devDependencies": {
    "preact": "^10.x",
    "@preact/signals": "^latest",
    "preact-iso": "^latest",
    "vite": "^6.x",
    "@preact/preset-vite": "^latest",
    "typescript": "^5.x"
  }
}
```

**핵심 원칙**:
- **데몬 런타임 의존성 0개**: Preact, Vite 등 모든 의존성은 `devDependencies`. 빌드 산출물(HTML/JS/CSS)만 데몬에 포함
- **npm 배포 안 함**: `private: true`로 실수로 퍼블리시 방지
- **ESM 전용**: `"type": "module"` — Vite + Preact 모두 ESM 네이티브

### 4.3 Vite 빌드 설정

```typescript
// packages/admin/vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: '/admin/',                       // 모든 asset 경로에 /admin/ 접두사
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    target: 'es2022',                    // 최신 브라우저만 지원 (Chrome 94+, Firefox 93+, Safari 16+)
    minify: 'esbuild',                   // 빠른 minification
    rollupOptions: {
      output: {
        // Vite 해시 파일명 → 캐시 무효화 + 영구 캐시 활용
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 개발 시 API 프록시: /v1/* → 데몬 서버
      '/v1': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: false,
      },
    },
  },
});
```

**빌드 설정 근거**:
- `base: '/admin/'`: 빌드 산출물의 모든 asset 참조가 `/admin/` 접두사를 포함하여 데몬 서빙 경로와 일치
- `target: 'es2022'`: 관리자 도구이므로 최신 브라우저만 지원. 불필요한 폴리필 제거로 번들 최소화
- `emptyDirBeforeWrite: true`: 이전 빌드 잔재 제거
- `proxy`: 개발 시 Vite HMR 서버(5173)에서 `/v1/*` 요청을 데몬(3100)으로 프록시

### 4.4 빌드 산출물 복사 전략

| 항목 | 설정 |
|------|------|
| **시점** | `pnpm --filter @waiaas/admin build` 실행 시 `postbuild` 스크립트가 자동 실행 |
| **방법** | `cp -r dist/* ../daemon/public/admin/` — 빌드 산출물 전체 복사 |
| **대상 경로** | `packages/daemon/public/admin/` |
| **git 추적** | `.gitignore`에 `packages/daemon/public/admin/` 추가. 빌드 산출물은 git 추적하지 않음 |
| **CI/CD** | CI에서 `pnpm --filter @waiaas/admin build` 실행 후 daemon 패키징 |

**Turborepo 의존성 선언**:

```jsonc
// turbo.json (루트)
{
  "pipeline": {
    "@waiaas/daemon#build": {
      "dependsOn": ["@waiaas/admin#build"]   // admin 빌드 후 daemon 빌드
    }
  }
}
```

> `@waiaas/daemon` 빌드 시 `@waiaas/admin` 빌드가 먼저 실행되어 빌드 산출물 복사 순서가 보장된다.

### 4.5 개발 워크플로우

| 모드 | 명령어 | 설명 |
|------|--------|------|
| **개발** | `pnpm --filter @waiaas/admin dev` | Vite HMR 개발 서버 (port 5173). API 프록시로 `/v1/*` -> `127.0.0.1:3100` |
| **빌드** | `pnpm --filter @waiaas/admin build` | Vite 빌드 -> `dist/` -> `postbuild`로 daemon에 복사 |
| **프로덕션** | 데몬 시작 | 데몬이 `public/admin/` 정적 파일 직접 서빙 |

**개발 시 주의사항**:
- Vite HMR 서버와 데몬을 동시에 실행해야 함 (별도 터미널)
- HMR 서버는 `http://localhost:5173/admin/`에서 SPA 제공, API는 프록시 경유
- 프로덕션 빌드는 항상 `pnpm build` 후 데몬 재시작으로 반영

### 4.6 빌드 산출물 구조 (예상)

```
packages/daemon/public/admin/
  index.html                          # SPA 엔트리
  assets/
    index-[hash].js                   # 메인 번들 (Preact + 앱 코드)
    index-[hash].css                  # 글로벌 CSS
```

> 해시 파일명으로 브라우저 캐시 무효화가 자동 처리된다. `index.html`만 no-cache로 매번 최신 버전 로드.

---

## 5. config.toml 확장 (INFRA-03)

### 5.1 신규 키

`[daemon]` 섹션에 2개 키 추가:

| 키 | 타입 | 기본값 | 범위 | 설명 |
|---|------|-------|------|------|
| `admin_ui` | boolean | `true` | - | Admin Web UI 활성화 여부. `false`시 `/admin` 404 반환 |
| `admin_timeout` | number (초) | `900` | 60~7200 | 비활성 타임아웃. 900초 = 15분 |

> 기존 `[daemon]` 섹션의 8개 키(port, hostname, log_level, log_file, log_max_size, log_max_files, pid_file, shutdown_timeout)에 2개가 추가되어 총 11개.

### 5.2 환경변수 오버라이드

기존 `WAIAAS_{SECTION}_{KEY}` 패턴을 그대로 활용:

| 환경변수 | 효과 |
|---------|------|
| `WAIAAS_DAEMON_ADMIN_UI=false` | `admin_ui = false` |
| `WAIAAS_DAEMON_ADMIN_TIMEOUT=1800` | `admin_timeout = 1800` (30분) |

기존 `applyEnvOverrides()` 함수가 자동 처리한다 (`parseEnvValue()`가 `'false'` -> `false`, `'1800'` -> `1800` 변환).

### 5.3 DaemonConfigSchema 확장 (Zod)

```typescript
// packages/daemon/src/infrastructure/config/loader.ts — DaemonConfigSchema
daemon: z.object({
  // ... 기존 9개 키 유지 (port, hostname, log_level, log_file, log_max_size,
  //     log_max_files, pid_file, shutdown_timeout, dev_mode) ...
  admin_ui: z.boolean().default(true),
  admin_timeout: z.number().int().min(60).max(7200).default(900),
}).default({}),
```

**검증 규칙**:
- `admin_ui`: boolean 타입. 기본값 `true` (UI 활성화가 기본 동작)
- `admin_timeout`: 정수, 최소 60초(1분), 최대 7200초(2시간). 기본값 900초(15분)
- Zod `.default()`로 config.toml에 키가 없으면 자동 적용

### 5.4 config.toml 예시

```toml
[daemon]
port = 3100
admin_ui = true
admin_timeout = 900
```

**최소 설정 (기본값 사용)**:

```toml
[daemon]
port = 3100
# admin_ui = true (기본값)
# admin_timeout = 900 (기본값)
```

**Docker 환경 권장 설정**:

```toml
[daemon]
hostname = "0.0.0.0"
admin_ui = false          # 외부 접근 차단
```

### 5.5 admin_timeout 전달 방식

SPA가 서버 설정의 `admin_timeout` 값을 알아야 비활성 타임아웃을 정확히 적용할 수 있다. 전달 방식:

1. **`GET /v1/admin/status` 응답에 `adminTimeout` 필드 추가**
   - 로그인 성공 시(200 응답) SPA가 `adminTimeout` 값을 읽어 Auth Store에 저장
   - 별도 엔드포인트 추가 없이 기존 API 활용

2. **로그인 전에는 기본값 사용**
   - SPA 초기 로드 시 클라이언트 기본값 900초(15분) 적용
   - 로그인 성공 후 서버에서 받은 값으로 갱신

3. **별도 `/admin/config.js` 엔드포인트는 사용하지 않음**
   - 추가 엔드포인트 회피. 기존 API에 필드 추가로 해결

```typescript
// GET /v1/admin/status 응답 예시 (admin_timeout 필드 추가)
{
  "version": "1.3.2",
  "uptime": 3600,
  "walletCount": 3,
  "activeSessionCount": 5,
  "killSwitch": { "state": "NORMAL" },
  "adminTimeout": 900          // 신규 필드: 서버 설정 admin_timeout 값
}
```

---

## 6. masterAuth 인증 흐름 (AUTH-01, AUTH-02)

### 6.1 인증 모델

Admin UI는 **masterAuth 전용**으로 동작한다:

| 항목 | 설계 |
|------|------|
| 인증 방식 | X-Master-Password 헤더로 매 요청 전송 |
| JWT 세션 | 미사용. 갱신/만료 관리 불필요 |
| 서버 검증 | 기존 `createMasterAuth` 미들웨어가 Argon2id로 검증 (변경 없음) |
| 비밀번호 보관 | 메모리(JavaScript 변수)에만 보관 |
| 비활성 타임아웃 | 기본 15분(900초), config.toml `admin_timeout`으로 조정 가능 |

> masterAuth는 요청별 Argon2id 검증 방식이다. JWT처럼 토큰 발급/갱신/블랙리스트 관리가 불필요하므로 구현이 단순하다. 단, Argon2id 검증은 의도적으로 느린 연산(~300ms)이므로 Admin UI의 요청 빈도(관리 작업, 수 초 간격)에서 문제없다.

### 6.2 Auth Store 설계 (@preact/signals)

```typescript
// packages/admin/src/auth/store.ts
import { signal, computed } from '@preact/signals';

// ─── 상태 (메모리 전용 — localStorage/cookie 저장 금지) ─────────────
export const masterPassword = signal<string | null>(null);
export const isAuthenticated = computed(() => masterPassword.value !== null);
export const adminTimeout = signal<number>(900);  // 기본 15분, 서버에서 갱신

// ─── 비활성 타임아웃 관리 ────────────────────────────────────────────
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

export function resetInactivityTimer(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!masterPassword.value) return;
  inactivityTimer = setTimeout(() => {
    logout();  // 타임아웃 → 메모리 클리어 → 로그인 리다이렉트
  }, adminTimeout.value * 1000);
}

// ─── 로그인 ─────────────────────────────────────────────────────────
export function login(password: string, serverTimeout?: number): void {
  masterPassword.value = password;
  if (serverTimeout) adminTimeout.value = serverTimeout;
  startInactivityTracking();
}

// ─── 로그아웃 ───────────────────────────────────────────────────────
export function logout(): void {
  masterPassword.value = null;
  stopInactivityTracking();
  window.location.hash = '#/login';  // 해시 라우터로 로그인 화면 이동
}

// ─── 비활성 추적 내부 함수 ──────────────────────────────────────────
function startInactivityTracking(): void {
  resetInactivityTimer();
  document.addEventListener('mousemove', resetInactivityTimer);
  document.addEventListener('keydown', resetInactivityTimer);
  document.addEventListener('click', resetInactivityTimer);
}

function stopInactivityTracking(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  document.removeEventListener('mousemove', resetInactivityTimer);
  document.removeEventListener('keydown', resetInactivityTimer);
  document.removeEventListener('click', resetInactivityTimer);
}
```

**설계 근거**:
- `signal<string | null>`: Preact signals는 값 변경 시 구독 컴포넌트만 자동 리렌더링. React useState보다 세밀한 업데이트
- `computed`: `isAuthenticated`는 `masterPassword`에서 파생. 별도 상태 관리 불필요
- `resetInactivityTimer`: mousemove/keydown/click 이벤트마다 타이머 리셋. 사용자 활동이 있으면 타임아웃 연장

### 6.3 로그인 흐름

```
사용자 → [마스터 비밀번호 입력] → [Submit]
                                    │
                                    ▼
                          GET /v1/admin/status
                          X-Master-Password: {입력값}
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                    200 OK                401 Unauthorized
                         │                     │
                         ▼                     ▼
              login(password,          "Invalid master
              response.adminTimeout)    password" 에러 표시
                         │
                         ▼
                   #/dashboard 이동
```

**상세 단계**:

1. 사용자가 마스터 비밀번호 입력 후 Submit 클릭
2. `GET /v1/admin/status` 호출 (X-Master-Password 헤더 포함)
3. **200 응답**: `login(password, response.adminTimeout)` -> Auth Store에 비밀번호 저장 + 비활성 타이머 시작 -> `#/dashboard`로 해시 라우팅 이동
4. **401 응답**: "Invalid master password" 에러 메시지 표시. 비밀번호 입력 필드 유지
5. **네트워크 에러**: "Cannot connect to daemon" 메시지 표시. 데몬 실행 여부 확인 안내

> 로그인 검증에 `GET /v1/admin/status`를 사용하는 이유: 별도 로그인 엔드포인트 없이 기존 API를 재활용. masterAuth가 200을 반환하면 비밀번호가 유효한 것이고, 동시에 adminTimeout 값도 받을 수 있다.

### 6.4 API 호출 시 인증

```typescript
// packages/admin/src/api/client.ts — fetch 래퍼 (설계)
import { masterPassword, logout } from '../auth/store';

export async function apiCall<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  // X-Master-Password 헤더 자동 주입
  if (masterPassword.value) {
    headers.set('X-Master-Password', masterPassword.value);
  }
  headers.set('Content-Type', 'application/json');

  const response = await fetch(path, {
    ...options,
    headers,
    signal: AbortSignal.timeout(10_000),   // 10초 타임아웃
  });

  // 401 응답 → 로그아웃 + 로그인 리다이렉트
  if (response.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body);
  }

  return response.json() as Promise<T>;
}
```

**설계 포인트**:
- 모든 API 호출이 `apiCall()`을 거치므로 인증 헤더 주입과 401 처리가 SSoT
- `AbortSignal.timeout(10_000)`: 10초 타임아웃으로 데몬 무응답 시 빠른 실패
- 401 응답 시 자동 `logout()`: 메모리 클리어 + `#/login` 리다이렉트

### 6.5 비활성 타임아웃 (AUTH-02)

| 항목 | 설정 |
|------|------|
| **기본값** | 900초 (15분) |
| **설정 방법** | config.toml `[daemon] admin_timeout = 900` (60~7200초) |
| **추적 이벤트** | `mousemove`, `keydown`, `click` |
| **타임아웃 발생 시** | `logout()` -> 메모리 클리어 -> `#/login` 이동 |
| **로그인 화면** | 비활성 타이머 비활성 (사용자가 비밀번호 입력 중이므로) |
| **이벤트 리스너 해제** | `logout()` 시 `removeEventListener`로 정리 (메모리 누수 방지) |

**타임아웃 흐름**:

```
[사용자 활동] → resetInactivityTimer() → 타이머 리셋 (15분 연장)
                                          │
                              [15분 무활동]
                                          │
                                          ▼
                                    logout()
                                          │
                               ┌──────────┴──────────┐
                               │                     │
                    masterPassword = null    이벤트 리스너 해제
                               │
                               ▼
                        #/login 리다이렉트
```

### 6.6 로그아웃

| 트리거 | 동작 |
|--------|------|
| 헤더 로그아웃 버튼 클릭 | `logout()` -> 메모리 클리어 + 타이머 해제 -> `#/login` |
| 비활성 타임아웃 (15분) | `logout()` -> 동일 |
| 401 API 응답 | `logout()` -> 동일 |
| 페이지 새로고침/닫기 | JavaScript 변수 소실 -> 자동 미인증 상태 -> `#/login` |

> 4가지 경로 모두 최종적으로 `logout()` 함수를 호출하거나 메모리 소실로 동일한 결과(미인증 상태 + 로그인 화면)에 도달한다.

### 6.7 Auth Guard (라우터 수준)

```typescript
// packages/admin/src/app.tsx — 루트 컴포넌트 (설계)
import { isAuthenticated } from './auth/store';
import { LocationProvider, Router, Route } from 'preact-iso';

export function App() {
  // 미인증 시 모든 라우트를 #/login으로 리다이렉트
  if (!isAuthenticated.value) {
    window.location.hash = '#/login';
    return <Login />;
  }

  return (
    <LocationProvider>
      <Layout>
        <Router>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/agents" component={Agents} />
          <Route path="/sessions" component={Sessions} />
          <Route path="/policies" component={Policies} />
          <Route path="/settings" component={Settings} />
          <Route default component={Dashboard} />
        </Router>
      </Layout>
    </LocationProvider>
  );
}
```

**Auth Guard 동작**:
- `isAuthenticated`가 Preact signal의 `computed`이므로 `masterPassword` 변경 시 자동 리렌더링
- 미인증 상태: `Login` 컴포넌트만 렌더링 (Layout/Router 미렌더)
- 인증 상태: Layout + Router로 5개 페이지 라우팅
- 로그인 화면(`#/login`)은 인증 불필요

---

## 7. 보안 고려사항 (SEC-01)

### 7.1 localhost 전용 접근

- 데몬이 기본 `127.0.0.1`에 바인딩 -> 외부 네트워크 접근 차단
- `hostGuard` 미들웨어(기존 구현)가 요청 `Host` 헤더를 검증하여 DNS rebinding 공격 방어
- `hostname = '0.0.0.0'` 설정 시 hostGuard가 외부 Host도 허용 -> masterAuth가 유일한 방어선

### 7.2 Content-Security-Policy

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self';
img-src 'self' data:;
font-src 'self';
base-uri 'self';
form-action 'self'
```

**보안 효과**:
- `script-src 'self'`: 인라인 스크립트, `eval()`, 외부 CDN 스크립트 실행 차단. XSS 공격의 주요 벡터 무력화
- `style-src 'unsafe-inline'`: Preact의 인라인 `style` 속성은 허용하되, CSS-in-JS 프레임워크는 미사용
- `connect-src 'self'`: 동일 origin API 호출만 허용. 외부 서버로의 데이터 유출 차단
- `default-src 'none'`: 명시적으로 허용하지 않은 리소스 유형은 모두 차단

### 7.3 비밀번호 보관 정책

| 허용 | 금지 |
|------|------|
| JavaScript 변수 (`masterPassword` signal) | localStorage |
| - | sessionStorage |
| - | cookie (document.cookie) |
| - | IndexedDB |

**근거**:
- 메모리(JavaScript 변수)에만 보관하면 페이지 새로고침/닫기 시 자동 소실
- `masterPassword` signal이 유일한 보관 위치 (SSoT)
- 브라우저 개발자 도구 메모리 덤프에서 노출 가능하지만, localhost 전용 + 관리자 도구이므로 수용 가능한 위험
- 재로그인 필요: 보안과 편의의 트레이드오프. 비활성 타임아웃(15분)과 함께 적절한 균형

### 7.4 민감 데이터 노출 금지

| 데이터 | UI 표시 | 근거 |
|--------|---------|------|
| 개인 키 (Private Key) | **절대 노출 금지** | 지갑 상세에서 publicKey(공개 키)만 표시 |
| 마스터 비밀번호 해시 | API 응답에 미포함 | 기존 구현에서 이미 제외 |
| JWT 시크릿 | rotate-secret 결과에 미포함 | 성공/실패만 반환 |
| 세션 토큰 (JWT) | 생성 시 1회만 표시 | 이후 마스킹 처리 (`eyJhb...****`) |
| Argon2id 파라미터 | 상세 미표시 | 공격자에게 해싱 난이도 정보 제공 방지 |

### 7.5 Docker 환경 보안 고려

Docker에서 포트 포워딩(`-p 3100:3100`) 사용 시 외부 네트워크에서 Admin UI 접근이 가능하다:

| 위협 | 대응 |
|------|------|
| 외부에서 `/admin` 접근 | masterAuth 인증 필수. 비밀번호 없이 SPA 로드는 가능하지만 API 호출 불가 |
| 브루트포스 공격 | Argon2id 의도적 지연(~300ms/요청)으로 초당 시도 횟수 제한 |
| SPA 코드 노출 | 프론트엔드 코드는 원래 공개. 비밀 정보 미포함 |

**권고사항**:

1. Docker 환경에서는 `admin_ui = false` 설정 권장
2. `admin_ui = true` 필요 시 방화벽으로 3100 포트 접근 제한
3. `hostname = '0.0.0.0'` + `admin_ui = true` 조합은 가장 높은 위험. 강력한 마스터 비밀번호 필수
4. Docker Compose 사용 시 포트를 `127.0.0.1:3100:3100`으로 제한하는 것을 권장

### 7.6 XSS 방어

**다층 방어 전략**:

| 레이어 | 방어 수단 |
|--------|----------|
| CSP | `script-src 'self'`로 인라인/외부 스크립트 실행 차단 |
| Preact JSX | JSX 자동 이스케이프로 반사형 XSS 방어. `{userInput}`은 텍스트 노드로 렌더링 |
| innerHTML 금지 | `dangerouslySetInnerHTML` 미사용. 사용자 입력(지갑 이름 등)은 항상 텍스트로 렌더링 |
| URL 검증 | 해시 라우터가 URL 파라미터를 직접 사용하지 않음 (반사형 XSS 벡터 제거) |

### 7.7 CSRF 방어

**기본 방어가 충분한 이유**:

1. **커스텀 헤더**: `X-Master-Password` 헤더는 simple request에 포함되지 않으므로, cross-origin 요청 시 CORS preflight가 필수
2. **CORS 미설정**: 데몬이 Admin UI에 대한 CORS 헤더를 설정하지 않으므로 cross-origin 요청은 브라우저가 차단
3. **same-origin fetch**: SPA가 동일 origin에서 fetch API로 요청하므로 CORS preflight 불필요

> 결론: 추가 CSRF 토큰 불필요. 커스텀 헤더(`X-Master-Password`) + CORS 미설정 조합이 CSRF를 원천 차단한다.

---

## 8. 화면 설계 (PAGE-01 ~ PAGE-05)

5개 페이지의 상세 레이아웃, 데이터 흐름, 사용자 인터랙션, 상태 관리를 정의한다.

### 8.1 Dashboard (PAGE-01)

**목적**: 데몬 상태를 한눈에 파악하는 대시보드. 30초 자동 폴링으로 실시간 모니터링.

**와이어프레임**:

```
┌─────────────────────────────────────────────────────┐
│  Dashboard                                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐
│  │  Version  │ │  Uptime   │ │  Agents   │ │ Sessions │
│  │  1.3.2    │ │ 2d 5h 12m │ │    12     │ │    8     │
│  └───────────┘ └───────────┘ └───────────┘ └──────────┘
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │  Kill Switch: [NORMAL] ●                        ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
└─────────────────────────────────────────────────────┘
```

**레이아웃**: 2행 그리드. 상단 = 4개 StatCard, 하단 = Kill Switch 상태 배지.

**컴포넌트 구성**:

```
DashboardPage
├── StatCard × 4
│   ├── Version (string)
│   ├── Uptime (formatted: "Xd Xh Xm")
│   ├── Agents (number)
│   └── Active Sessions (number)
└── KillSwitchBadge
    └── Badge (NORMAL=success, ACTIVATED=danger)
```

**데이터 흐름**:

| API | 시점 | 응답 필드 → 위젯 |
|-----|------|-------------------|
| `GET /v1/admin/status` | 마운트 즉시 + 30초 간격 | `version` → Version 카드, `uptime` → Uptime 카드 (초 → "Xd Xh Xm" 변환), `walletCount` → Wallets 카드, `activeSessionCount` → Sessions 카드, `killSwitchState` → Kill Switch 배지 |

**30초 폴링 구현**:

```typescript
// pages/dashboard.tsx — 설계
const dashboardData = signal<AdminStatus | null>(null);
const loading = signal(true);
const error = signal<string | null>(null);

useEffect(() => {
  let timer: ReturnType<typeof setInterval>;

  async function fetchStatus() {
    try {
      const data = await apiGet<AdminStatus>(API.ADMIN_STATUS);
      dashboardData.value = data;
      error.value = null;
    } catch (e) {
      error.value = 'Cannot connect to daemon';
    } finally {
      loading.value = false;
    }
  }

  fetchStatus();                          // 즉시 1회 호출
  timer = setInterval(fetchStatus, 30_000); // 30초 간격 폴링

  return () => clearInterval(timer);      // 언마운트 시 정리
}, []);
```

**UX 상태**:

| 상태 | 트리거 | UI |
|------|--------|-----|
| Loading | 최초 마운트, 아직 응답 없음 | Skeleton 카드 (회색 직사각형 4개 + 배지 자리) |
| Success | 데이터 로드 완료 | 정상 카드 표시 |
| Error | fetch 실패 | "Cannot connect to daemon" 배너 + Retry 버튼 |

**상태 관리**: `dashboardData`는 페이지 로컬 `signal()`. 전역 상태 불필요 (Dashboard 페이지에서만 사용).

**Uptime 포맷팅**:

```typescript
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
```

### 8.2 Agents (PAGE-02)

**목적**: 지갑 목록 조회, 생성, 상세 보기, 이름 수정, 삭제(terminate).

**두 가지 모드**: List 뷰 (기본) / Detail 뷰 (라우트 파라미터).

#### 8.2.1 List 뷰 (`#/agents`)

**와이어프레임**:

```
┌─────────────────────────────────────────────────────┐
│  Agents                          [+ Create Agent]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌ Create Agent Form (인라인, 펼침/접힘) ──────────┐│
│  │ Name: [________] Chain: [solana ▼]              ││
│  │ Network: [devnet ▼]        [Create] [Cancel]    ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Name     │ Chain  │ Network │ Public Key  │ Status │
│  ─────────┼────────┼─────────┼─────────────┼────────│
│  bot-1    │ solana │ devnet  │ 7xKp..📋   │ ACTIVE │
│  bot-2    │ solana │ mainnet │ 3mNq..📋   │ ACTIVE │
│  trader   │ eth    │ testnet │ 0x4f..📋   │ SUSP.  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**테이블 컬럼**:

| 컬럼 | 데이터 | 렌더링 |
|------|--------|--------|
| Name | `name` | 텍스트 |
| Chain | `chain` | 텍스트 |
| Network | `network` | 텍스트 |
| Public Key | `publicKey` | 앞 4자리 + `..` + 뒤 4자리 + CopyButton |
| Status | `status` | Badge (ACTIVE=success, SUSPENDED=warning, TERMINATED=danger, CREATING=info) |
| Created | `createdAt` | 날짜 포맷 (YYYY-MM-DD HH:mm) |

**사용자 인터랙션**:

| 동작 | 효과 |
|------|------|
| "Create Agent" 버튼 클릭 | 인라인 폼 펼침 (모달 아님) |
| 폼 Submit | `POST /v1/wallets` → 201: toast "Wallet created" + 목록 새로고침. 에러: toast에 매핑된 에러 메시지 |
| 폼 Cancel | 폼 접힘 |
| 행 클릭 | `#/agents/{id}`로 이동 (Detail 뷰) |
| CopyButton 클릭 | 공개 키 클립보드 복사 |

**Create 폼 필드**:

| 필드 | 타입 | 검증 | 기본값 |
|------|------|------|--------|
| name | text | 1-100자, 트림 후 비어있지 않음 | - |
| chain | select | "solana" 또는 "ethereum" | "solana" |
| network | select | "devnet", "testnet", "mainnet" | "devnet" |

**데이터 흐름**:

- 마운트 시: `GET /v1/wallets` → 목록 표시
- 생성: `POST /v1/wallets` `{ name, chain, network }` → 201 → toast + `GET /v1/wallets` 재호출
- 행 클릭: `window.location.hash = '#/agents/' + id`

#### 8.2.2 Detail 뷰 (`#/agents/:id`)

**와이어프레임**:

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Agents                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Agent: bot-1 ✏️                                    │
│                                                     │
│  ID:            019234ab-cdef-7890-...              │
│  Public Key:    7xKpQ3nR...mZw9 📋                 │
│  Chain:         solana                              │
│  Network:       devnet                              │
│  Status:        [ACTIVE]                            │
│  Owner Address: (not set)                           │
│  Owner State:   [NONE]                              │
│  Created:       2026-02-10 14:30                    │
│  Updated:       2026-02-10 15:22                    │
│                                                     │
│                                                     │
│  -- Owner Settings -------------------------------- │
│                                                     │
│  Owner Address: 0x1234...5678                       │
│  Owner State:   [LOCKED]                            │
│                                                     │
│  Approval Method                                    │
│  (*) Use default (from global config)               │
│  ( ) SDK + ntfy (direct push)                       │
│  ( ) SDK + Telegram (messenger)                     │
│  ( ) WalletConnect                                  │
│  ( ) Telegram Bot (/approve command)                │
│  ( ) Manual REST API                                │
│                                                     │
│  [Save Approval Method]                             │
│                                                     │
│  ------------------------------------------------- │
│                                                     │
│  [🗑 Terminate Agent]                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**읽기 전용 필드**: ID, Public Key (전체, CopyButton), Chain, Network, Owner Address (설정된 경우), Owner State (NONE=neutral, GRACE=warning, LOCKED=success 배지), Status, Created, Updated.

**수정 가능 필드**: Name (인라인 편집 — 연필 아이콘 → 텍스트 입력 → Save/Cancel).

| 동작 | 효과 |
|------|------|
| 연필 아이콘 클릭 | 이름 필드가 텍스트 입력으로 전환 |
| Save 클릭 | `PUT /v1/wallets/{id}` `{ name }` → 200: toast "Wallet updated" |
| Cancel 클릭 | 원래 이름으로 복원 |
| "Terminate Wallet" 클릭 | Modal: "Terminate wallet {name}? This action cannot be undone." → 확인 시 `DELETE /v1/wallets/{id}` → toast + `#/wallets`로 이동 |

**데이터 흐름**:

- 마운트 시: `GET /v1/wallets/{id}` → 상세 표시
- 이름 수정: `PUT /v1/wallets/{id}` `{ name }` → 200 → toast + 데이터 갱신
- 삭제: `DELETE /v1/wallets/{id}` → 200 → `window.location.hash = '#/wallets'`

**Owner 필드**: Owner Address/State는 읽기 전용. [v2.6] Approval Method는 Owner 등록 후 수정 가능 (라디오 선택 + Save).

#### [v2.6] Owner Settings > Approval Method 컴포넌트

**컴포넌트:** `ApprovalMethodSelector`

**props:**

| prop | 타입 | 설명 |
|------|------|------|
| walletId | string | 대상 지갑 ID |
| currentMethod | string \| null | 현재 설정값 (null = Use default) |
| ownerAddress | string \| null | Owner 주소 (null이면 전체 비활성) |
| ownerState | 'NONE' \| 'GRACE' \| 'LOCKED' | Owner 상태 |

**라디오 옵션:**

| 값 | 라벨 | DB 값 |
|-----|------|-------|
| default | Use default (from global config) | NULL |
| sdk_ntfy | SDK + ntfy (direct push) | 'sdk_ntfy' |
| sdk_telegram | SDK + Telegram (messenger) | 'sdk_telegram' |
| walletconnect | WalletConnect | 'walletconnect' |
| telegram_bot | Telegram Bot (/approve command) | 'telegram_bot' |
| rest | Manual REST API | 'rest' |

**UI 동작 규칙:**

| 조건 | 동작 |
|------|------|
| Owner 미등록 (ownerAddress === null) | 라디오 전체 disabled. 안내: "Register an owner first" |
| Owner 등록됨 | 라디오 활성. 현재값 선택 상태 |
| Save 클릭 | PUT /v1/wallets/{id}/owner { approval_method: selectedValue } |
| "Use default" 선택 후 Save | PUT /v1/wallets/{id}/owner { approval_method: null } |

**데이터 흐름:**
- 마운트 시: GET /v1/wallets/{id} 응답의 owner_approval_method 값으로 초기 선택
- Save: PUT /v1/wallets/{id}/owner { approval_method } -> 200: toast "Approval method updated" -> 데이터 갱신
- 에러: 400 시 toast에 에러 메시지 표시

**경고 메시지 (조건부):**

| 조건 | 경고 텍스트 |
|------|-----------|
| SDK 옵션 + signing_sdk.enabled = false | "Signing SDK is not enabled. Enable it in System > Settings." |
| SDK 옵션 + signing_sdk.wallets = [] | "No wallet registered in Signing SDK settings." |

상세: doc 74 (74-wallet-sdk-daemon-components.md) 섹션 10.3 참조.

### 8.3 Sessions (PAGE-03)

**목적**: 지갑별 세션 생성, 목록 조회, 폐기(revoke). 생성 시 JWT 토큰 1회 표시.

**와이어프레임**:

```
┌─────────────────────────────────────────────────────┐
│  Sessions                                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Agent: [bot-1 (019234ab...) ▼]  [+ Create Session]│
│                                                     │
│  ID       │ Status  │ Expires At      │ Renewals │  │
│  ─────────┼─────────┼─────────────────┼──────────┤  │
│  a1b2..   │ ACTIVE  │ 2026-02-11 15:00│   2/30   │🗑│
│  c3d4..   │ EXPIRED │ 2026-02-10 09:00│   0/30   │🗑│
│  e5f6..   │ ACTIVE  │ 2026-02-12 03:00│   5/30   │🗑│
│                                                     │
└─────────────────────────────────────────────────────┘
```

**레이아웃**: 상단 = 지갑 셀렉터 드롭다운 + "Create Session" 버튼. 하단 = 세션 테이블.

**컴포넌트 구성**:

```
SessionsPage
├── AgentSelector (dropdown)
│   └── 옵션: GET /v1/wallets → wallet name + ID
├── CreateSessionButton
│   └── disabled if no agent selected
├── Table (sessions data)
│   └── 행마다 Revoke 버튼
└── Modal (토큰 표시 / 폐기 확인)
```

**테이블 컬럼**:

| 컬럼 | 데이터 | 렌더링 |
|------|--------|--------|
| ID | `id` | 앞 4자리 + `..` + 뒤 4자리 |
| Status | 만료 여부 | Badge (ACTIVE=success, EXPIRED=neutral) |
| Expires At | `expiresAt` | 날짜 포맷 (YYYY-MM-DD HH:mm) |
| Renewals | `renewalCount` / `maxRenewals` | 텍스트 (e.g., "2/30") |
| Created | `createdAt` | 날짜 포맷 |
| Actions | - | Revoke 버튼 (🗑) |

**토큰 표시 정책**: 세션 생성 시 JWT 토큰은 응답에 1회만 포함된다. DB에는 해시만 저장되므로 이후 재조회 불가. 생성 직후 Modal로 토큰을 표시하고 CopyButton을 제공한다.

**사용자 인터랙션**:

| 동작 | 효과 |
|------|------|
| 지갑 드롭다운 선택 | `GET /v1/sessions?walletId={id}` → 테이블 갱신 |
| "Create Session" 클릭 | `POST /v1/sessions` `{ walletId }` → 201 → Modal: 토큰 표시 + CopyButton. 경고: "Copy this token now. It will not be shown again." |
| Modal 닫기 | 목록 새로고침 |
| Revoke 버튼 클릭 | Modal: "Revoke this session?" → 확인 시 `DELETE /v1/sessions/{id}` → toast + 목록 새로고침 |

**데이터 흐름**:

- 마운트 시: `GET /v1/wallets` → 드롭다운 채움
- 지갑 선택: `GET /v1/sessions?walletId={id}` → 세션 목록 표시
- 세션 생성: `POST /v1/sessions` → 201 → 토큰 Modal → 닫기 시 목록 재호출
- 세션 폐기: `DELETE /v1/sessions/{id}` → 200 → 목록 재호출

**상태 관리**:

```typescript
const selectedAgentId = signal<string | null>(null);
const agents = signal<Agent[]>([]);
const sessionList = signal<Session[]>([]);
const showTokenModal = signal<{ token: string } | null>(null);
```

### 8.4 Policies (PAGE-04)

**목적**: 정책 목록 조회, 생성/수정, SPENDING_LIMIT 티어 시각화, 삭제.

**와이어프레임**:

```
┌─────────────────────────────────────────────────────┐
│  Policies                        [+ Create Policy]  │
├─────────────────────────────────────────────────────┤
│  Agent Filter: [All ▼]                              │
│                                                     │
│  Type           │ Agent  │ Pri │ Enabled │ Rules    │
│  ───────────────┼────────┼─────┼─────────┼──────────│
│  SPENDING_LIMIT │ bot-1  │  10 │   ✓     │ max $100 │
│  WHITELIST      │ Global │   5 │   ✓     │ 3 addrs  │
│  RATE_LIMIT     │ bot-2  │   0 │   ✗     │ 10/min   │
│                                                     │
│  ┌ Create/Edit Policy Form (인라인, 테이블 하단) ──┐│
│  │ Type: [SPENDING_LIMIT ▼]  Agent: [bot-1 ▼]     ││
│  │ Priority: [10]  Enabled: [✓]                    ││
│  │                                                 ││
│  │ SPENDING_LIMIT Rules:                           ││
│  │ instant_max: [1000000]                          ││
│  │ notify_max:  [5000000]                          ││
│  │ delay_max:   [10000000]                         ││
│  │                                                 ││
│  │ ┌──────────────────────────────────────────┐    ││
│  │ │ ■■■■■ INSTANT  ■■■■ DELAY  ■■ BLOCKED   │    ││
│  │ │ $0───$1M──────$5M────$10M────→           │    ││
│  │ └──────────────────────────────────────────┘    ││
│  │                             [Save] [Cancel]     ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
└─────────────────────────────────────────────────────┘
```

**레이아웃**: 상단 = "Create Policy" 버튼 + 지갑 필터 드롭다운. 중앙 = 정책 테이블. 하단 = 인라인 폼 (생성/수정 모드).

**테이블 컬럼**:

| 컬럼 | 데이터 | 렌더링 |
|------|--------|--------|
| Type | `type` | Badge (info 변형) |
| Wallet | `walletId` | 지갑 이름 또는 "Global" (walletId=null) |
| Priority | `priority` | 숫자 |
| Enabled | `enabled` | 토글 아이콘 (✓/✗) |
| Rules | `rules` | 요약 텍스트 (타입별 상이) |
| Created | `createdAt` | 날짜 포맷 |
| Actions | - | Delete 버튼 (🗑) |

**Rules 요약 텍스트 생성 규칙**:

| 정책 타입 | 요약 형식 |
|-----------|----------|
| SPENDING_LIMIT | `max $${delay_max}` |
| WHITELIST | `${count} addresses` |
| RATE_LIMIT | rules JSON에서 limit/window 추출하여 `${limit}/${window}` |
| 기타 | `{n} rules` (JSON 키 개수) |

**Create/Edit 폼 필드**:

| 필드 | 타입 | 생성 시 | 수정 시 | 검증 |
|------|------|---------|---------|------|
| type | select | 선택 가능 (10 타입) | 불변 (읽기 전용) | 필수 |
| walletId | select | 선택 가능 (지갑 목록 + "Global") | 불변 (읽기 전용) | - |
| priority | number | 입력 | 수정 가능 | 정수 |
| enabled | checkbox | 기본 true | 수정 가능 | - |
| rules | 동적 폼 | 타입에 따라 분기 | 수정 가능 | 타입별 검증 |

**동적 Rules 폼 (타입별 분기)**:

| 타입 | 입력 필드 |
|------|----------|
| SPENDING_LIMIT | instant_max (digit string), notify_max (digit string), delay_max (digit string), delay_seconds (number, 선택), approval_timeout (number, 선택) |
| WHITELIST | allowed_addresses (textarea, 줄바꿈으로 주소 분리) |
| 기타 | rules JSON textarea (자유 형식 JSON 객체) |

**SPENDING_LIMIT 티어 시각화 (TierVisualization)**:

SPENDING_LIMIT 정책에서 instant_max, delay_max 값을 기반으로 수평 막대를 표시:

```
┌──────────────────────────────────────────────────────┐
│ ████████ INSTANT  ████████ DELAY  ████ BLOCKED       │
│ $0─────$instant_max─────$delay_max─────→             │
└──────────────────────────────────────────────────────┘
```

| 구간 | 범위 | 색상 | CSS 변수 |
|------|------|------|----------|
| INSTANT | 0 ~ instant_max | 녹색 | `--color-tier-instant` |
| DELAY | instant_max ~ delay_max | 황색 | `--color-tier-delay` |
| BLOCKED | delay_max 초과 | 적색 | `--color-tier-blocked` |

**사용자 인터랙션**:

| 동작 | 효과 |
|------|------|
| 지갑 필터 선택 | "All": `GET /v1/policies`, 특정 지갑: `GET /v1/policies?walletId={id}` |
| "Create Policy" 클릭 | 인라인 폼 펼침 (생성 모드) |
| 행 클릭 | 인라인 폼 펼침 (수정 모드, 기존 값 채움) |
| 폼 Save | 생성: `POST /v1/policies` → 201 → toast + 목록 새로고침. 수정: `PUT /v1/policies/{id}` → 200 → toast + 목록 새로고침 |
| Delete 버튼 | Modal: "Delete this policy?" → 확인 시 `DELETE /v1/policies/{id}` → toast + 목록 새로고침 |

**데이터 흐름**:

- 마운트 시: `GET /v1/wallets` (필터 드롭다운) + `GET /v1/policies` (전체 목록)
- 필터 변경: `GET /v1/policies?walletId={id}` 또는 `GET /v1/policies`
- 생성: `POST /v1/policies` → 201 → 목록 재호출
- 수정: `PUT /v1/policies/{id}` → 200 → 목록 재호출
- 삭제: `DELETE /v1/policies/{id}` → 200 → 목록 재호출

### 8.5 Settings (PAGE-05)

**목적**: 데몬 상태 확인, Kill Switch 토글, JWT 시크릿 회전, 데몬 종료.

**와이어프레임**:

```
┌─────────────────────────────────────────────────────┐
│  Settings                                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Daemon Status ──────────────────────────────────┐
│  │ Version: 1.3.2    Uptime: 2d 5h 12m             │
│  │ Agents: 12        Active Sessions: 8   [Refresh] │
│  └──────────────────────────────────────────────────┘
│                                                     │
│  ┌─ Kill Switch ────────────────────────────────────┐
│  │ State: [NORMAL] ●                               │
│  │                          [Activate Kill Switch]  │
│  └──────────────────────────────────────────────────┘
│                                                     │
│  ┌─ JWT Secret ─────────────────────────────────────┐
│  │ Rotate the JWT signing secret. Old tokens remain │
│  │ valid for 5 minutes after rotation.              │
│  │                          [Rotate JWT Secret]     │
│  └──────────────────────────────────────────────────┘
│                                                     │
│  ┌─ Shutdown ───────────────────────────────────────┐
│  │ Shut down the daemon process. You will need to   │
│  │ restart it manually.                             │
│  │                          [Shutdown Daemon] (red) │
│  └──────────────────────────────────────────────────┘
│                                                     │
└─────────────────────────────────────────────────────┘
```

**레이아웃**: 수직 카드 4개.

**컴포넌트 구성**:

```
SettingsPage
├── DaemonStatusCard
│   ├── Version, Uptime, Agent Count, Session Count (읽기 전용)
│   └── Refresh 버튼
├── KillSwitchCard
│   ├── 상태 배지 (NORMAL=success, ACTIVATED=danger)
│   └── 토글 버튼 → Modal
├── JwtRotationCard
│   └── "Rotate JWT Secret" 버튼 → Modal
└── ShutdownCard
    └── "Shutdown Daemon" 버튼 (danger variant) → Modal
```

**Section 1 — Daemon Status (읽기 전용)**:

- API: `GET /v1/admin/status` (수동 Refresh 버튼, 자동 폴링 없음 — Dashboard와 차별)
- 표시 데이터: Version, Uptime (포맷: "Xd Xh Xm"), Agent Count, Active Session Count
- Refresh 버튼: 클릭 시 `GET /v1/admin/status` 재호출

**Section 2 — Kill Switch**:

- 상태 조회: `GET /v1/admin/kill-switch` (public 엔드포인트이지만, Admin UI의 글로벌 fetch 래퍼가 X-Master-Password 헤더를 항상 포함)
- 현재 상태 표시: NORMAL (녹색 배지) 또는 ACTIVATED (적색 배지)

| 현재 상태 | 버튼 텍스트 | Modal 메시지 | API |
|-----------|------------|-------------|-----|
| NORMAL | "Activate Kill Switch" | "Activate Kill Switch? All operations will be suspended." | `POST /v1/admin/kill-switch` |
| ACTIVATED | "Recover" | "Recover from Kill Switch?" | `POST /v1/admin/recover` |

- 성공 시: 상태 재조회하여 배지 갱신

**Section 3 — JWT Secret Rotation**:

- "Rotate JWT Secret" 버튼 → Modal: "Rotate JWT secret? Old tokens will remain valid for 5 minutes."
- 확인 시: `POST /v1/admin/rotate-secret`
- 200 응답: toast "JWT secret rotated"
- ROTATION_TOO_RECENT 에러: toast에 매핑된 메시지 ("Secret rotation was performed too recently. Please wait.")

**Section 4 — Shutdown**:

- "Shutdown Daemon" 버튼 (danger variant, 적색 스타일링)
- Modal: "Shutdown daemon? This will stop all operations. You will need to restart the daemon process manually."
- 확인 시: `POST /v1/admin/shutdown`
- 200 응답 수신 후: **전체 화면 오버레이** 표시

**Shutdown 오버레이**:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│         Daemon has been shut down.                  │
│                                                     │
│         Restart the daemon process                  │
│         to continue.                                │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- 오버레이는 모든 네비게이션과 API 호출을 차단
- 전역 `daemonShutdown` signal로 제어: `const daemonShutdown = signal(false);`
- Auth Guard가 이 signal을 확인: true이면 인증 상태와 무관하게 오버레이 렌더링
- 이후 API 호출은 연결 오류로 실패 → 오버레이가 추가 인터랙션 방지

**데이터 흐름**:

- 마운트 시: `GET /v1/admin/status` (Daemon Status) + `GET /v1/admin/kill-switch` (Kill Switch 상태)
- Kill Switch 토글: `POST /v1/admin/kill-switch` 또는 `POST /v1/admin/recover` → 상태 재조회
- JWT 회전: `POST /v1/admin/rotate-secret` → toast
- Shutdown: `POST /v1/admin/shutdown` → `daemonShutdown.value = true` → 오버레이

### 8.6 컴포넌트 트리 + 라우팅 (COMP-01 부분)

페이지 수준 라우팅 계층:

```
App (app.tsx)
├── Login (auth/login.tsx) — !isAuthenticated 일 때
└── Layout (components/layout.tsx) — isAuthenticated 일 때
    ├── Sidebar (nav links: Dashboard, Agents, Sessions, Policies, Settings)
    │   └── NavLink × 5 (활성 상태 표시)
    ├── Header (현재 페이지 제목 + Logout 버튼)
    └── Router (preact-iso)
        ├── #/dashboard  → DashboardPage
        ├── #/agents     → AgentListPage
        ├── #/wallets/:id → WalletDetailPage
        ├── #/sessions   → SessionsPage
        ├── #/policies   → PoliciesPage
        ├── #/settings   → SettingsPage
        └── default      → DashboardPage
```

> Shutdown 오버레이는 Auth Guard보다 우선: `daemonShutdown.value === true`이면 App이 오버레이만 렌더링한다.

---

## 9. 공통 컴포넌트 (COMP-01, COMP-02, COMP-03)

### 9.1 Preact 컴포넌트 트리 (COMP-01)

파일-컴포넌트 매핑을 포함한 전체 트리:

```
App (app.tsx)
├── Login (auth/login.tsx) — !isAuthenticated 일 때
└── Layout (components/layout.tsx) — isAuthenticated 일 때
    ├── Sidebar — 네비게이션 링크 (활성 상태 표시)
    │   └── NavLink × 5 (Dashboard, Agents, Sessions, Policies, Settings)
    ├── Header — 현재 페이지 제목 + Logout 버튼
    └── Router (preact-iso)
        ├── #/dashboard → DashboardPage (pages/dashboard.tsx)
        │   ├── StatCard × 4 (version, uptime, agents, sessions)
        │   └── KillSwitchBadge
        ├── #/agents → AgentListPage (pages/agents.tsx)
        │   ├── CreateAgentForm
        │   ├── Table (agents data)
        │   └── CopyButton (per public key)
        ├── #/wallets/:id → WalletDetailPage (pages/agents.tsx)
        │   ├── ReadOnlyFieldGroup
        │   ├── InlineEditField (name)
        │   ├── CopyButton (public key)
        │   └── DeleteButton → Modal
        ├── #/sessions → SessionsPage (pages/sessions.tsx)
        │   ├── AgentSelector (dropdown)
        │   ├── CreateSessionButton → Modal (token display)
        │   ├── Table (sessions data)
        │   └── CopyButton (token, one-time)
        ├── #/policies → PoliciesPage (pages/policies.tsx)
        │   ├── AgentFilterDropdown
        │   ├── PolicyForm (create/edit)
        │   │   ├── TypeSelector
        │   │   ├── RulesEditor (dynamic per type)
        │   │   └── TierVisualization (SPENDING_LIMIT only)
        │   ├── Table (policies data)
        │   └── DeleteButton → Modal
        └── #/settings → SettingsPage (pages/settings.tsx)
            ├── DaemonStatusCard
            ├── KillSwitchCard → Modal
            ├── JwtRotationCard → Modal
            └── ShutdownCard → Modal
```

**해시 라우터 경로 매핑 테이블**:

| 해시 경로 | 컴포넌트 | 파일 |
|-----------|----------|------|
| `#/login` | Login | `auth/login.tsx` |
| `#/dashboard` | DashboardPage | `pages/dashboard.tsx` |
| `#/agents` | AgentListPage | `pages/agents.tsx` |
| `#/wallets/:id` | WalletDetailPage | `pages/wallets.tsx` |
| `#/sessions` | SessionsPage | `pages/sessions.tsx` |
| `#/policies` | PoliciesPage | `pages/policies.tsx` |
| `#/settings` | SettingsPage | `pages/settings.tsx` |

> `#/agents`와 `#/agents/:id`는 동일 파일(`pages/agents.tsx`)에서 URL 파라미터 유무로 분기한다.

### 9.2 CSS Variables 디자인 토큰 (COMP-02)

`packages/admin/src/styles/global.css`에 정의하는 전체 토큰 세트:

```css
:root {
  /* ─── Primary ──────────────────────────────────── */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-light: #eff6ff;

  /* ─── Neutral ──────────────────────────────────── */
  --color-bg: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary: #f1f5f9;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-text-secondary: #64748b;
  --color-text-muted: #94a3b8;

  /* ─── Status ───────────────────────────────────── */
  --color-success: #16a34a;
  --color-success-bg: #f0fdf4;
  --color-warning: #d97706;
  --color-warning-bg: #fffbeb;
  --color-danger: #dc2626;
  --color-danger-bg: #fef2f2;
  --color-info: #2563eb;
  --color-info-bg: #eff6ff;

  /* ─── Tier colors (policy visualization) ───────── */
  --color-tier-instant: #16a34a;  /* green — INSTANT */
  --color-tier-delay: #d97706;    /* amber — DELAY */
  --color-tier-blocked: #dc2626;  /* red — BLOCKED */

  /* ─── Spacing (4px base) ───────────────────────── */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */

  /* ─── Typography ───────────────────────────────── */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-size-xs: 0.75rem;   /* 12px */
  --font-size-sm: 0.875rem;  /* 14px */
  --font-size-base: 1rem;    /* 16px */
  --font-size-lg: 1.125rem;  /* 18px */
  --font-size-xl: 1.25rem;   /* 20px */
  --font-size-2xl: 1.5rem;   /* 24px */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --line-height: 1.5;

  /* ─── Borders ──────────────────────────────────── */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
  --border-width: 1px;

  /* ─── Shadows ──────────────────────────────────── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);

  /* ─── Layout ───────────────────────────────────── */
  --sidebar-width: 220px;
  --header-height: 56px;
  --content-max-width: 1200px;
}
```

**토큰 설계 근거**:

| 카테고리 | 근거 |
|----------|------|
| Primary (#2563eb) | Tailwind blue-600 계열. 접근성 대비비(contrast ratio) 4.5:1 이상 |
| Neutral | Slate 계열 (cool gray). 텍스트 가독성 우선 |
| Status 4색 | 녹색(성공), 황색(경고), 적색(위험), 청색(정보) — 표준 의미 색상 |
| Tier 3색 | 정책 티어(INSTANT/DELAY/BLOCKED)와 1:1 매핑 |
| Spacing 4px base | 일관된 8px 그리드 시스템 (4, 8, 12, 16, 24, 32) |
| Typography | 시스템 폰트 스택. 외부 폰트 CDN 불필요. CSP `font-src 'self'`와 호환 |

> 다크 모드: 현재 범위 외. CSS Variables 구조이므로 향후 `@media (prefers-color-scheme: dark)` 또는 `.dark` 클래스로 확장 가능.

### 9.3 공통 컴포넌트 인터페이스 (COMP-02)

2개 이상 페이지에서 재사용되는 공통 컴포넌트의 TypeScript props 인터페이스와 동작 명세.

#### 9.3.1 Table (`components/table.tsx`)

```typescript
interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => preact.VNode;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;       // default: "No data"
  loading?: boolean;
}
```

**동작**:

| 상태 | 렌더링 |
|------|--------|
| `loading=true` | Skeleton 행 3개 (회색 직사각형 플레이스홀더) |
| `data.length === 0` | EmptyState 컴포넌트 (`emptyMessage` 표시) |
| `data.length > 0` | `<table>` + `<thead>` + `<tbody>` 정상 렌더링 |

- `render` 함수가 있으면 커스텀 렌더링 (Badge, CopyButton 등)
- `render` 없으면 `row[column.key]` 텍스트 출력
- `onRowClick`: 행 클릭 시 콜백 (커서 pointer 표시)

#### 9.3.2 Form / FormField (`components/form.tsx`)

```typescript
interface FormFieldProps {
  label: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  options?: { value: string; label: string }[];  // select 타입용
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}
```

**동작**:

- 각 필드: `<label>` + `<input>` (또는 `<select>`, `<textarea>`, `<input type="checkbox">`) + 에러 메시지
- `error` 문자열이 있으면 입력 아래 적색 텍스트로 표시
- `disabled=true`: 입력 비활성화 (수정 불가, 읽기 전용 스타일)
- `type="select"`: `options` 배열로 `<option>` 렌더링
- `type="textarea"`: 여러 줄 입력 (WHITELIST 주소 목록, JSON 편집)
- `type="checkbox"`: 체크박스 (Enabled 토글)

#### 9.3.3 Modal (`components/modal.tsx`)

```typescript
interface ModalProps {
  open: boolean;
  title: string;
  children: preact.ComponentChildren;
  onConfirm?: () => void;
  onCancel: () => void;
  confirmText?: string;            // default: "Confirm"
  cancelText?: string;             // default: "Cancel"
  confirmVariant?: 'primary' | 'danger';  // default: "primary"
  loading?: boolean;
}
```

**동작**:

- `open=true`: 반투명 오버레이 + 중앙 정렬 카드
- `open=false`: 렌더링하지 않음 (DOM에서 제거)
- ESC 키: `onCancel` 호출 → 모달 닫기
- 오버레이 클릭 (모달 외부): `onCancel` 호출 → 모달 닫기
- `onConfirm` 미제공 시: 확인 버튼 미표시 (정보 표시 전용 모달)
- `loading=true`: 확인 버튼에 로딩 스피너 + 비활성화
- `confirmVariant='danger'`: 확인 버튼 적색 스타일 (삭제, 종료 등 위험 동작)

#### 9.3.4 Toast (`components/toast.tsx`)

```typescript
type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// 전역 signal — 앱 전체에서 공유
const toasts = signal<Toast[]>([]);

// 호출 인터페이스
function showToast(type: ToastType, message: string): void;
```

**동작**:

| 속성 | 값 |
|------|-----|
| 위치 | 화면 우상단 (`position: fixed`) |
| 자동 닫기 | 5초 후 자동 제거 |
| 다중 표시 | 수직 스택 (최신이 위) |
| success | 녹색 좌측 보더 (`--color-success`) |
| error | 적색 좌측 보더 (`--color-danger`) |
| info | 청색 좌측 보더 (`--color-info`) |

**사용 예시**:

```typescript
showToast('success', 'Agent created');
showToast('error', getErrorMessage(response.code));
```

#### 9.3.5 Button (`components/form.tsx`)

Button은 FormField와 함께 `components/form.tsx`에서 export.

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';  // default: 'md'
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: preact.ComponentChildren;
}
```

**variant 스타일 매핑**:

| Variant | 배경 | 텍스트 | 보더 | 용도 |
|---------|------|--------|------|------|
| primary | `--color-primary` | white | none | 주요 동작 (Create, Save) |
| secondary | `--color-bg` | `--color-text` | `--color-border` | 보조 동작 (Cancel, Refresh) |
| danger | `--color-danger` | white | none | 위험 동작 (Delete, Shutdown) |
| ghost | transparent | `--color-text-secondary` | none | 최소 강조 (Logout) |

- `loading=true`: 텍스트 대신 로딩 스피너 표시 + 버튼 비활성화
- `disabled=true`: 연한 색상 + 커서 `not-allowed`

#### 9.3.6 Badge (`components/form.tsx`)

Badge도 FormField와 함께 export.

```typescript
interface BadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: preact.ComponentChildren;
}
```

**variant 스타일 매핑**:

| Variant | 배경 | 텍스트 | 사용처 |
|---------|------|--------|--------|
| success | `--color-success-bg` | `--color-success` | ACTIVE, NORMAL, LOCKED (owner) |
| warning | `--color-warning-bg` | `--color-warning` | SUSPENDED, GRACE (owner) |
| danger | `--color-danger-bg` | `--color-danger` | TERMINATED, ACTIVATED (kill switch) |
| info | `--color-info-bg` | `--color-info` | CREATING, 정책 타입 |
| neutral | `--color-bg-tertiary` | `--color-text-secondary` | NONE (owner), EXPIRED |

**상태-variant 매핑 규칙**:

| 데이터 | 값 → Variant |
|--------|-------------|
| Agent status | CREATING=info, ACTIVE=success, SUSPENDED=warning, TERMINATING=warning, TERMINATED=danger |
| Kill Switch | NORMAL=success, ACTIVATED=danger |
| Session status | ACTIVE=success, EXPIRED=neutral |
| Owner state | NONE=neutral, GRACE=warning, LOCKED=success |
| Policy type | 모든 타입 = info |

#### 9.3.7 CopyButton (`components/copy-button.tsx`)

```typescript
interface CopyButtonProps {
  value: string;
  label?: string;  // default: "Copy"
}
```

**동작**:

1. 클릭: `navigator.clipboard.writeText(value)` 호출
2. 성공: 아이콘이 체크마크(✓)로 2초간 변경 → 원래 복사 아이콘으로 복원
3. 실패 (Clipboard API 미지원 시): 숨겨진 textarea에 값 설정 → `select()` + `document.execCommand('copy')` 폴백
4. `label` 제공 시: 아이콘 옆에 텍스트 표시

#### 9.3.8 EmptyState (`components/empty-state.tsx`)

```typescript
interface EmptyStateProps {
  title: string;            // e.g., "No agents yet"
  description?: string;     // e.g., "Create your first agent to get started"
  actionLabel?: string;     // e.g., "Create Agent"
  onAction?: () => void;
}
```

**동작**:

- 중앙 정렬: 아이콘(빈 상자) + 제목 + 설명 + (선택) 액션 버튼
- Table 컴포넌트의 빈 데이터 상태에서 사용
- `onAction` 제공 시: primary 버튼 표시 (바로 생성 동작 유도)

**페이지별 EmptyState 메시지**:

| 페이지 | title | description | actionLabel |
|--------|-------|-------------|-------------|
| Agents | "No agents yet" | "Create your first agent to get started" | "Create Agent" |
| Sessions | "No sessions" | "Select an agent and create a session" | - |
| Policies | "No policies" | "Create a policy to define transaction rules" | "Create Policy" |

### 9.4 폼 유효성 검증 방침 (COMP-03)

**전략: 클라이언트 독립 검증 (서버 Zod 스키마를 재사용하지 않음)**

**근거**: `packages/admin`은 `@waiaas/core`에 런타임 의존성이 없는 Preact 프론트엔드이다. Zod 스키마를 임포트하면 Zod(~13KB gzip)가 프론트엔드 번들에 추가되고 빌드 타임 커플링이 발생한다. 대신 서버 규칙을 미러링하는 경량 검증 함수를 admin 패키지 내에 정의한다.

**필드별 검증 규칙** (서버 `@waiaas/core` 스키마 미러):

| 필드 | 페이지 | 규칙 | 에러 메시지 |
|------|--------|------|-------------|
| Agent name | Agents | 1-100자, 트림 후 비어있지 않음 | "Name must be 1-100 characters" |
| Chain | Agents | `"solana"` 또는 `"ethereum"` 중 하나 | "Select a chain" |
| Network | Agents | `"devnet"`, `"testnet"`, `"mainnet"` 중 하나 | "Select a network" |
| Policy type | Policies | 10개 POLICY_TYPES 값 중 하나 | "Select a policy type" |
| Priority | Policies | 정수 (기본값 0) | "Priority must be an integer" |
| instant_max | Policies (SPENDING_LIMIT) | 숫자 문자열 (regex: `/^\d+$/`) | "Must be a positive number string" |
| notify_max | Policies (SPENDING_LIMIT) | 숫자 문자열 | "Must be a positive number string" |
| delay_max | Policies (SPENDING_LIMIT) | 숫자 문자열 | "Must be a positive number string" |
| allowed_addresses | Policies (WHITELIST) | 비어있지 않은 문자열 배열 | "Enter at least one address" |
| Rules JSON | Policies (기타 타입) | 유효한 JSON 객체 | "Invalid JSON format" |

**검증 시점**: Submit 시 검증 (blur 시 아님). 유효하지 않은 필드 아래에 에러 메시지 표시. 사용자가 필드를 다시 편집하기 시작하면 해당 에러 클리어.

**검증 함수 구조**:

```typescript
// packages/admin/src/utils/validators.ts — 설계

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;  // fieldName → error message
}

function validateCreateAgent(data: {
  name: string;
  chain: string;
  network: string;
}): ValidationResult;

function validateCreatePolicy(data: {
  type: string;
  rules: unknown;
  priority: number;
}): ValidationResult;
```

---

## 10. API 연동 패턴 (APIC-01, APIC-02, APIC-03)

### 10.1 fetch 래퍼 상세 (APIC-01)

섹션 6.4의 `apiCall()` 설계를 확장한 전체 명세:

```typescript
// packages/admin/src/api/client.ts

import { masterPassword, logout, resetInactivityTimer } from '../auth/store';
import { getErrorMessage } from '../utils/error-messages';

// ─── 에러 타입 ──────────────────────────────────────────

interface ApiErrorBody {
  code: string;       // WAIaaS 에러 코드 (e.g., 'WALLET_NOT_FOUND')
  message: string;    // 서버 에러 메시지
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public serverMessage: string,
  ) {
    super(serverMessage);
    this.name = 'ApiError';
  }
}

// ─── 핵심 호출 함수 ────────────────────────────────────

export async function apiCall<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  // X-Master-Password 헤더 자동 주입
  if (masterPassword.value) {
    headers.set('X-Master-Password', masterPassword.value);
  }
  headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      signal: AbortSignal.timeout(10_000),  // 10초 타임아웃
    });
  } catch (e) {
    // 네트워크 에러 (fetch 자체 실패)
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot connect to daemon');
  }

  // 401 응답 → 로그아웃 + 로그인 리다이렉트
  if (response.status === 401) {
    logout();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
  }

  // 비정상 응답 → body에서 code 추출 → ApiError
  if (!response.ok) {
    const body: ApiErrorBody = await response.json().catch(() => ({
      code: 'UNKNOWN',
      message: 'Unknown error',
    }));
    throw new ApiError(response.status, body.code, body.message);
  }

  // 성공 시 비활성 타이머 리셋
  resetInactivityTimer();

  return response.json() as Promise<T>;
}

// ─── 편의 헬퍼 ─────────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  return apiCall<T>(path, { method: 'GET' });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiCall<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiCall<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiCall<T>(path, { method: 'DELETE' });
}
```

**동작 요약**:

| 상황 | 처리 |
|------|------|
| 모든 요청 | `X-Master-Password` 헤더 자동 주입 (Auth Store에서) |
| 모든 요청 | `Content-Type: application/json` 설정 |
| 모든 요청 | `AbortSignal.timeout(10_000)` — 10초 타임아웃 |
| 401 응답 | `logout()` → `#/login` 리다이렉트 → `ApiError` throw |
| 비정상 응답 (non-200) | body 파싱 → `code` 추출 → `ApiError` throw |
| 네트워크 에러 | `ApiError(0, 'NETWORK_ERROR', ...)` throw |
| 성공 (200/201) | `resetInactivityTimer()` 호출 후 JSON 반환 |

**에러 처리 패턴 (페이지에서의 사용)**:

```typescript
try {
  await apiPost(API.AGENTS, { name, chain, network });
  showToast('success', 'Agent created');
  refreshList();
} catch (e) {
  if (e instanceof ApiError) {
    showToast('error', getErrorMessage(e.code));
  }
}
```

### 10.2 에러 코드 매핑 (APIC-02)

`packages/core/src/errors/error-codes.ts`의 68개 에러 코드 전체를 Admin UI 사용자 친화 메시지로 매핑. Admin UI는 masterAuth 엔드포인트만 사용하므로 TX/ACTION/WITHDRAW 에러를 직접 받을 가능성은 낮지만, 견고성을 위해 전체 매핑을 제공한다.

```typescript
// packages/admin/src/utils/error-messages.ts

export const ERROR_MESSAGES: Record<string, string> = {
  // ─── AUTH domain (8) ──────────────────────────────
  INVALID_TOKEN: 'Invalid authentication token.',
  TOKEN_EXPIRED: 'Authentication token has expired.',
  SESSION_REVOKED: 'Session has been revoked.',
  INVALID_SIGNATURE: 'Invalid cryptographic signature.',
  INVALID_NONCE: 'Invalid or expired nonce.',
  INVALID_MASTER_PASSWORD: 'Invalid master password. Please check and try again.',
  MASTER_PASSWORD_LOCKED: 'Master password locked due to too many failed attempts. Please wait before trying again.',
  SYSTEM_LOCKED: 'System is locked. Kill switch may be active.',

  // ─── SESSION domain (8) ──────────────────────────
  SESSION_NOT_FOUND: 'Session not found.',
  SESSION_EXPIRED: 'Session has expired.',
  SESSION_LIMIT_EXCEEDED: 'Maximum session limit reached for this agent.',
  CONSTRAINT_VIOLATED: 'Session constraint violated.',
  RENEWAL_LIMIT_REACHED: 'Session renewal limit reached. Create a new session.',
  SESSION_ABSOLUTE_LIFETIME_EXCEEDED: 'Session has exceeded its absolute lifetime.',
  RENEWAL_TOO_EARLY: 'Session renewal attempted too early. Please wait.',
  SESSION_RENEWAL_MISMATCH: 'Session token mismatch. The session may have been renewed elsewhere.',

  // ─── PIPELINE domain (1) ─────────────────────────
  PIPELINE_HALTED: 'Transaction is queued for delay or requires approval.',

  // ─── TX domain (20) ──────────────────────────────
  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction.',
  INVALID_ADDRESS: 'Invalid blockchain address format.',
  TX_NOT_FOUND: 'Transaction not found.',
  TX_EXPIRED: 'Transaction has expired.',
  TX_ALREADY_PROCESSED: 'Transaction has already been processed.',
  CHAIN_ERROR: 'Blockchain RPC error. Please try again.',
  SIMULATION_FAILED: 'Transaction simulation failed.',
  TOKEN_NOT_FOUND: 'Token not found.',
  TOKEN_NOT_ALLOWED: 'Token is not allowed by the current policy.',
  INSUFFICIENT_TOKEN_BALANCE: 'Insufficient token balance.',
  CONTRACT_CALL_DISABLED: 'Contract calls are disabled. Configure CONTRACT_WHITELIST to enable.',
  CONTRACT_NOT_WHITELISTED: 'Contract address is not whitelisted.',
  METHOD_NOT_WHITELISTED: 'Contract method is not whitelisted.',
  APPROVE_DISABLED: 'Token approvals are disabled. Configure APPROVED_SPENDERS to enable.',
  SPENDER_NOT_APPROVED: 'Spender address is not in the approved list.',
  APPROVE_AMOUNT_EXCEEDED: 'Approve amount exceeds the configured limit.',
  UNLIMITED_APPROVE_BLOCKED: 'Unlimited token approval is blocked by policy.',
  BATCH_NOT_SUPPORTED: 'Batch transactions are not supported on this chain.',
  BATCH_SIZE_EXCEEDED: 'Batch instruction count exceeds the maximum (20).',
  BATCH_POLICY_VIOLATION: 'Policy violation in batch transaction.',

  // ─── POLICY domain (5) ───────────────────────────
  POLICY_NOT_FOUND: 'Policy not found.',
  POLICY_DENIED: 'Transaction denied by policy.',
  SPENDING_LIMIT_EXCEEDED: 'Spending limit exceeded.',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please wait before trying again.',
  WHITELIST_DENIED: 'Address is not in the whitelist.',

  // ─── OWNER domain (5) ────────────────────────────
  OWNER_ALREADY_CONNECTED: 'Owner wallet is already connected to this agent.',
  OWNER_NOT_CONNECTED: 'No owner wallet connected.',
  OWNER_NOT_FOUND: 'Owner not found.',
  APPROVAL_TIMEOUT: 'Approval request has timed out.',
  APPROVAL_NOT_FOUND: 'Approval request not found.',

  // ─── SYSTEM domain (6) ───────────────────────────
  KILL_SWITCH_ACTIVE: 'Kill switch is active. All operations are suspended.',
  KILL_SWITCH_NOT_ACTIVE: 'Kill switch is not currently active.',
  KEYSTORE_LOCKED: 'Keystore is locked. Please try again.',
  CHAIN_NOT_SUPPORTED: 'This blockchain is not supported.',
  SHUTTING_DOWN: 'Server is shutting down.',
  ADAPTER_NOT_AVAILABLE: 'Chain adapter is not available. Please try again.',

  // ─── AGENT domain (3) ────────────────────────────
  WALLET_NOT_FOUND: 'Wallet not found.',
  WALLET_SUSPENDED: 'Wallet is currently suspended.',
  WALLET_TERMINATED: 'Wallet has been terminated.',

  // ─── WITHDRAW domain (4) ─────────────────────────
  NO_OWNER: 'No owner registered for this agent.',
  WITHDRAW_LOCKED_ONLY: 'Withdrawal requires the owner to be in LOCKED state.',
  SWEEP_TOTAL_FAILURE: 'All sweep operations failed. Please try again.',
  INSUFFICIENT_FOR_FEE: 'Insufficient balance for transaction fee.',

  // ─── ACTION domain (7) ───────────────────────────
  ACTION_NOT_FOUND: 'Action not found.',
  ACTION_VALIDATION_FAILED: 'Action input validation failed.',
  ACTION_RESOLVE_FAILED: 'Action resolve failed. External API may be unavailable.',
  ACTION_RETURN_INVALID: 'Action returned an invalid result.',
  ACTION_PLUGIN_LOAD_FAILED: 'Action plugin failed to load.',
  ACTION_NAME_CONFLICT: 'Action name is already registered.',
  ACTION_CHAIN_MISMATCH: 'Action does not support the requested chain.',

  // ─── ADMIN domain (1) ────────────────────────────
  ROTATION_TOO_RECENT: 'Secret rotation was performed too recently. Please wait.',
};

/**
 * 에러 코드 → 사용자 친화 메시지 조회.
 * 매핑에 없는 코드는 fallback 메시지 반환.
 */
export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? `An unexpected error occurred (${code}).`;
}
```

**에러 코드 통계** (도메인별):

| 도메인 | 개수 | Admin UI에서 발생 가능성 |
|--------|------|------------------------|
| AUTH | 8 | 높음 (INVALID_MASTER_PASSWORD, MASTER_PASSWORD_LOCKED) |
| SESSION | 8 | 높음 (SESSION_NOT_FOUND, SESSION_LIMIT_EXCEEDED) |
| PIPELINE | 1 | 없음 (sessionAuth 파이프라인) |
| TX | 20 | 없음 (sessionAuth 트랜잭션) |
| POLICY | 5 | 높음 (POLICY_NOT_FOUND, POLICY_DENIED) |
| OWNER | 5 | 낮음 (OWNER_ALREADY_CONNECTED) |
| SYSTEM | 6 | 높음 (KILL_SWITCH_ACTIVE, SHUTTING_DOWN) |
| WALLET | 3 | 높음 (WALLET_NOT_FOUND, WALLET_TERMINATED) |
| WITHDRAW | 4 | 없음 (sessionAuth/ownerAuth) |
| ACTION | 7 | 없음 (sessionAuth) |
| ADMIN | 1 | 높음 (ROTATION_TOO_RECENT) |
| **합계** | **68** | |

### 10.3 UX 상태 패턴 (APIC-03)

모든 데이터 패칭 컴포넌트가 처리해야 하는 4가지 표준 UX 상태:

| 상태 | 트리거 | UI |
|------|--------|-----|
| Loading | 초기 fetch 또는 새로고침 진행 중 | Skeleton 플레이스홀더 (테이블: 회색 행 3개, 카드: 맥동 직사각형) |
| Success | 데이터 로드 완료, items > 0 | 정상 데이터 표시 |
| Empty | 데이터 로드 완료, items = 0 | EmptyState 컴포넌트 ("No {items} yet" + 생성 액션 링크) |
| Error | fetch 실패 또는 API 에러 | 에러 배너 (적색 배경) + 메시지 + "Retry" 버튼 |

**상태 관리 패턴** (각 페이지에서 반복):

```typescript
const data = signal<T[]>([]);
const loading = signal(true);
const error = signal<string | null>(null);

async function fetchData() {
  loading.value = true;
  error.value = null;
  try {
    const result = await apiGet<T[]>(path);
    data.value = result;
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = getErrorMessage(e.code);
    } else {
      error.value = 'Cannot connect to daemon. Is the daemon running?';
    }
  } finally {
    loading.value = false;
  }
}
```

**연결 실패 처리**:

| 상황 | 감지 방법 | UI |
|------|----------|-----|
| fetch throws (네트워크 에러) | `ApiError.code === 'NETWORK_ERROR'` | "Cannot connect to daemon. Is the daemon running?" + Retry 버튼 |
| Retry 버튼 클릭 | — | fetch 재실행 |

**Shutdown 상태 (전역)**:

```typescript
// packages/admin/src/auth/store.ts
export const daemonShutdown = signal(false);
```

- `POST /v1/admin/shutdown` 성공 후: `daemonShutdown.value = true`
- 전체 화면 오버레이: "Daemon has been shut down" + 인터랙티브 요소 없음
- Auth Guard 확인 순서: `daemonShutdown === true` → 오버레이 렌더링 (인증 상태 무시)
- 오버레이는 모든 네비게이션과 API 호출을 차단

**오버레이 렌더링 조건** (app.tsx 의사코드):

```typescript
function App() {
  // 1순위: Shutdown 오버레이
  if (daemonShutdown.value) {
    return <ShutdownOverlay />;
  }

  // 2순위: 인증 확인
  if (!isAuthenticated.value) {
    return <Login />;
  }

  // 3순위: 정상 라우팅
  return <Layout><Router>...</Router></Layout>;
}
```

### 10.4 폼 검증 참조

폼 검증 전략과 필드별 규칙은 **섹션 9.4**를 참조한다.

- 전략: 클라이언트 독립 검증 (Zod 미사용)
- 검증 시점: Submit 시
- 에러 표시: 필드 하단 적색 텍스트
- 에러 클리어: 사용자 편집 시작 시

### 10.5 API 엔드포인트 상수

타입 안전한 API 경로 관리를 위해 모든 엔드포인트를 상수로 정의:

```typescript
// packages/admin/src/api/endpoints.ts

export const API = {
  // Admin
  ADMIN_STATUS: '/v1/admin/status',
  ADMIN_KILL_SWITCH: '/v1/admin/kill-switch',
  ADMIN_RECOVER: '/v1/admin/recover',
  ADMIN_SHUTDOWN: '/v1/admin/shutdown',
  ADMIN_ROTATE_SECRET: '/v1/admin/rotate-secret',

  // Agents
  WALLETS: '/v1/wallets',
  WALLET: (id: string) => `/v1/wallets/${id}` as const,

  // Sessions
  SESSIONS: '/v1/sessions',
  SESSION: (id: string) => `/v1/sessions/${id}` as const,

  // Policies
  POLICIES: '/v1/policies',
  POLICY: (id: string) => `/v1/policies/${id}` as const,
} as const;
```

**사용 예시**:

```typescript
const status = await apiGet<AdminStatus>(API.ADMIN_STATUS);
const wallet = await apiGet<WalletDetail>(API.WALLET(walletId));
const sessions = await apiGet<Session[]>(`${API.SESSIONS}?walletId=${walletId}`);
```

> 모든 API 호출은 `endpoints.ts`의 상수를 사용한다. 문자열 직접 사용 금지 (타이포 방지, 리팩토링 용이).

---

## 관련 설계 문서

| 문서 | 이름 | 관련 내용 |
|------|------|----------|
| 29 | api-framework-design | Hono 미들웨어 체계, serveStatic 지원 여부 |
| 37 | rest-api-complete-spec | 33 엔드포인트 전체 — Admin UI가 호출할 masterAuth API 목록 |
| 39 | tauri-desktop-architecture | Tauri Desktop 8 화면 — Admin UI와 기능 중복/차별 정의 |
| 52 | auth-model-redesign | masterAuth — Admin UI 인증 흐름의 기반 |
| 54 | cli-flow-redesign | CLI 명령 체계 — Admin UI와 기능 대응 |
| 55 | dx-improvement-spec | DX 개선 — Admin UI가 DX 향상의 핵심 수단 |
| 74 | wallet-sdk-daemon-components | [v2.6] Wallet SDK + Daemon 컴포넌트 — Approval Method UI 원본 설계 |

---

*최종 업데이트: 2026-02-20 — v2.6 보완: Approval Method UI 와이어프레임 + ApprovalMethodSelector 컴포넌트 추가 (섹션 8.2.2).*
