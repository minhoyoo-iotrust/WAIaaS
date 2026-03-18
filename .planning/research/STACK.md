# Technology Stack

**Project:** v32.10 에이전트 스킬 정리 + OpenClaw 플러그인
**Researched:** 2026-03-18

## Recommended Stack

### OpenClaw Plugin SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `openclaw/plugin-sdk/core` | latest (peer) | Plugin type definitions | OpenClawPluginDefinition, OpenClawPluginApi 타입 제공. peerDependency로 선언하여 OpenClaw Gateway 런타임이 제공하는 실제 구현체와 버전 충돌 방지. |

### Plugin Package Dependencies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@waiaas/sdk` | `^2.11.0` | WAIaaS daemon REST API client | 플러그인이 데몬과 통신하는 유일한 인터페이스. zero-dependency SDK이므로 번들 크기 부담 없음. |

### Build & Test (devDependencies)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | `^5.7` | 타입 체크 + 빌드 | 기존 모노레포 tsconfig 재활용. ESM output. |
| vitest | `^3.0` | 테스트 | 기존 모노레포 표준 테스트 러너. |

### Documentation (기존 site/build.mjs 확장)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| gray-matter | (기존) | Markdown frontmatter 파싱 | site/build.mjs에 이미 사용 중. 변경 불필요. |
| marked + marked-highlight | (기존) | Markdown to HTML 변환 | site/build.mjs에 이미 사용 중. 변경 불필요. |
| highlight.js | (기존) | 빌드타임 코드 구문 강조 | site/build.mjs에 이미 사용 중. 변경 불필요. |

## New Technology: NONE

이번 마일스톤에서 신규 라이브러리 도입은 사실상 불필요하다. OpenClaw plugin-sdk는 타입 정의 전용 peerDependency이고, 실제 런타임 코드는 기존 `@waiaas/sdk`만 사용한다. 문서 빌드도 기존 `site/build.mjs` 파이프라인을 그대로 활용한다.

## OpenClaw Plugin Interface Specification

### Manifest (openclaw.plugin.json)

**Confidence: HIGH** -- OpenClaw 공식 문서 + GitHub 소스 확인.

```json
{
  "id": "waiaas",
  "name": "WAIaaS Wallet",
  "configSchema": {
    "type": "object",
    "properties": {
      "daemonUrl": {
        "type": "string",
        "description": "WAIaaS daemon URL",
        "default": "http://localhost:3100"
      },
      "sessionToken": {
        "type": "string",
        "description": "WAIaaS session token (JWT)"
      }
    },
    "required": ["sessionToken"]
  },
  "uiHints": {
    "sessionToken": { "label": "Session Token", "sensitive": true },
    "daemonUrl": { "label": "Daemon URL" }
  }
}
```

**Manifest 필수 필드:**
- `id` (string): canonical plugin id. `"waiaas"` 사용.
- `configSchema` (object): JSON Schema. 빈 스키마라도 반드시 필요함 -- OpenClaw 런타임이 manifest 먼저 읽고 config 검증한 후에만 코드 실행.

**Manifest 선택 필드:**
- `name` (string): 표시 이름
- `description` (string): 짧은 설명
- `uiHints` (object): config 필드별 UI 메타데이터 (label, sensitive 등)
- `kind` (string): "memory", "context-engine" 등 슬롯 타입. WAIaaS는 해당 없으므로 생략.
- `channels`, `providers`, `providerAuthEnvVars`: 해당 없음.

**IMPORTANT: `version` 필드는 manifest에 없다.** 버전은 package.json의 version 필드에서 관리. manifest에 version을 넣으면 불필요한 중복.

**목표 문서의 manifest 수정 필요**: 목표 문서(m32-10)에는 `configSchema`에 `daemonUrl`을 required로 포함했으나, default 값이 있으므로 required에서 제외해야 함. `sessionToken`만 required.

### register(api) 진입점

**Confidence: HIGH** -- 공식 문서 + 커뮤니티 딥다이브 기사 교차 확인.

```typescript
import type { OpenClawPluginApi, OpenClawPluginDefinition } from "openclaw/plugin-sdk/core";
import { WAIaaSClient } from "@waiaas/sdk";

const plugin: OpenClawPluginDefinition = {
  id: "waiaas",
  name: "WAIaaS Wallet",
  description: "AI Agent Wallet-as-a-Service",

  register(api: OpenClawPluginApi) {
    // config는 openclaw.json의 plugins.entries.waiaas.config에서 주입됨
    // register()는 동기 함수여야 함 (async 반환 시 경고 + 무시됨)

    api.registerTool({
      id: "waiaas_get_balance",
      name: "Get Wallet Balance",
      description: "Get native token balance for a wallet",
      inputSchema: {
        type: "object",
        properties: {
          network: { type: "string", description: "Network (e.g., ethereum-mainnet or eip155:1)" }
        }
      },
      handler: async (input, ctx) => {
        const client = createClient(ctx);
        const balance = await client.getBalance({ network: input.network });
        return balance;
      }
    });

    // ... 나머지 ~22개 도구 등록
  }
};

export default plugin;
```

**Key Constraints:**
1. `register()` 는 **동기**여야 함. async register()는 경고 후 결과 무시됨. 비동기 초기화가 필요하면 `api.registerService()`로 백그라운드 서비스 등록.
2. 플러그인은 **in-process**로 Gateway에서 실행됨. 샌드박싱 없음. SDK fetch 호출은 Gateway 프로세스의 네트워크 권한으로 실행.
3. tool handler는 `async (input, ctx) => result` 시그니처. ctx에서 config 등 런타임 정보 접근 가능.

### Tool Registration API

**Confidence: HIGH** -- 공식 문서 확인.

```typescript
api.registerTool({
  id: string,           // kebab-case 식별자
  name: string,         // 표시 이름
  description: string,  // 도구 설명 (LLM이 참조)
  inputSchema: {         // JSON Schema
    type: "object",
    properties: { ... },
    required?: string[]
  },
  handler: async (input: Record<string, unknown>, ctx: ToolContext) => {
    return { /* result object */ };
  }
});
```

**Alternative: Factory Pattern** (다수 도구 일괄 등록):
```typescript
api.registerTool(
  (ctx) => {
    // ctx에서 config 접근 가능
    return [tool1, tool2, tool3]; // 배열 반환으로 다수 등록
  },
  { names: ["tool1", "tool2", "tool3"] }
);
```

WAIaaS 플러그인은 22개 도구를 등록하므로 **도메인별 그룹 함수 + 개별 registerTool 호출** 패턴이 적합. Factory 패턴은 동적 도구 목록이 필요할 때만 사용.

### Additional API (사용 가능하지만 이번 마일스톤에서 사용하지 않을 것)

| Method | Purpose | 비사용 이유 |
|--------|---------|------------|
| `api.registerProvider()` | 모델 추론 제공자 | WAIaaS는 LLM 제공자가 아님 |
| `api.registerChannel()` | 메시징 채널 | 비목표(Non-Goal)에 명시 |
| `api.registerService()` | 백그라운드 서비스 | 비목표(Non-Goal)에 명시 |
| `api.registerHttpRoute()` | HTTP 엔드포인트 | 데몬이 이미 API 제공 |
| `api.on()` | 라이프사이클 훅 | 현재 불필요 |

## npm Packaging Considerations

### Package Structure

```
packages/openclaw-plugin/
├── openclaw.plugin.json       # OpenClaw manifest (npm에 포함)
├── package.json               # @waiaas/openclaw-plugin
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   ├── index.ts               # default export: OpenClawPluginDefinition
│   ├── tools/                 # 도메인별 도구 등록
│   │   ├── wallet.ts
│   │   ├── transfer.ts
│   │   ├── defi.ts
│   │   ├── nft.ts
│   │   └── utility.ts
│   ├── config.ts              # configSchema 타입 + client factory
│   └── client.ts              # WAIaaSClient wrapper
└── test/
    ├── register.test.ts       # register() 호출 시 도구 등록 검증
    └── tools/                 # 도구별 handler 단위 테스트
```

### package.json 핵심 설정

```json
{
  "name": "@waiaas/openclaw-plugin",
  "version": "2.11.0-rc.1",
  "description": "WAIaaS plugin for OpenClaw AI agent",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "openclaw.plugin.json"
  ],
  "openclaw": {
    "extensions": ["./dist/index.js"]
  },
  "peerDependencies": {
    "openclaw": ">=0.4.0"
  },
  "peerDependenciesMeta": {
    "openclaw": { "optional": true }
  },
  "dependencies": {
    "@waiaas/sdk": "^2.11.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Critical packaging decisions:**

1. **`openclaw.plugin.json`을 files에 포함**: OpenClaw가 npm 패키지 설치 후 manifest를 발견하려면 패키지 루트에 이 파일이 있어야 함.

2. **`openclaw` 필드를 package.json에 추가**: `"openclaw": { "extensions": ["./dist/index.js"] }` -- OpenClaw가 패키지 스캔 시 진입점을 발견하는 메커니즘.

3. **`openclaw`을 peerDependency + optional로 선언**: 플러그인은 OpenClaw Gateway 런타임 내에서만 실행됨. optional로 하면 npm install 시 OpenClaw 없이도 빌드/테스트 가능 (타입만 devDependencies로 별도 설치).

4. **`@waiaas/sdk`는 regular dependency**: 플러그인의 실제 런타임 의존성. OpenClaw Gateway가 제공하지 않으므로 직접 포함.

5. **ESM only (`"type": "module"`)**: OpenClaw는 jiti로 플러그인을 로드하므로 ESM/CJS 모두 지원하지만, WAIaaS 모노레포 표준은 ESM.

### Installation Flow

사용자 입장 설치 커맨드:
```bash
openclaw plugins install @waiaas/openclaw-plugin
```

이후 `~/.openclaw/openclaw.json` 설정:
```json
{
  "plugins": {
    "entries": {
      "waiaas": {
        "enabled": true,
        "config": {
          "daemonUrl": "http://localhost:3100",
          "sessionToken": "wai_sess_..."
        }
      }
    }
  }
}
```

### CI/CD Integration

기존 모노레포 인프라 그대로 활용:

| 항목 | 설정 |
|------|------|
| release-please-config.json | `"packages/openclaw-plugin": {}` 추가 |
| .release-please-manifest.json | `"packages/openclaw-plugin": "0.0.0"` 추가 |
| turbo.json | 빌드/테스트/린트 태스크 자동 탐지 (package.json scripts) |
| npm trusted publishing | 기존 GitHub Actions workflow가 `packages/*/package.json` glob으로 자동 포함 |
| coverage-gate.sh | 새 패키지 기준 추가 |

## Documentation Tooling

### site/build.mjs 충분성 평가

**결론: 기존 site/build.mjs로 충분하다.** 단, `EXCLUDE_DIRS` 설정 변경이 필요하다.

**현재 상태:**
- `site/build.mjs`는 `docs/**/*.md` 글로브로 마크다운 파일을 수집
- `EXCLUDE_DIRS = ['admin-manual']`로 admin-manual 디렉토리를 제외 중
- frontmatter 필수 필드: title, description, date
- section별 URL 구조: `/{section}/{slug}/index.html`
- sitemap.xml, llms-full.txt 자동 생성

**필요한 변경:**

1. **EXCLUDE_DIRS에서 'admin-manual' 제거**: 이번 마일스톤에서 admin-manual 페이지를 SEO 빌드에 포함해야 하므로 `EXCLUDE_DIRS = []`로 변경하거나 해당 항목만 제거.

2. **admin-manual 8개 파일에 frontmatter 추가**: build.mjs가 title/description/date를 필수로 검증하므로 각 파일에 표준 frontmatter 작성 필요.

3. **section 값 결정**: admin-manual 파일에 `section: "docs"` 설정하면 기존 docs 목록 페이지에 자동 포함. 별도 섹션(`section: "admin"`)으로 분리할 수도 있으나, 기존 docs 안에 category: "Admin Manual"로 구분하는 것이 simpler.

4. **신규 라이브러리 불필요**: gray-matter + marked + highlight.js 조합이 admin manual의 마크다운 → HTML 변환에 완벽히 충분.

### 추가 빌드 도구 검토

| 도구 | 도입 필요성 | 판단 |
|------|------------|------|
| VitePress/Docusaurus | 전용 문서 사이트 프레임워크 | **불필요**. 기존 CRT 테마 + build.mjs로 충분. 별도 프레임워크는 오버킬. |
| MDX | JSX in Markdown | **불필요**. Admin manual은 순수 마크다운으로 충분. 인터랙티브 컴포넌트 불필요. |
| Mermaid | 다이어그램 렌더링 | **불필요**. Admin manual에 다이어그램이 필요하면 코드 블록으로 충분. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Plugin SDK import | `openclaw/plugin-sdk/core` | `openclaw/plugin-sdk` (monolithic) | 공식 문서에서 subpath import 권장. monolithic import은 불필요한 의존성 포함. |
| Plugin packaging | npm + openclaw.plugin.json | Standalone script | OpenClaw 공식 플러그인 설치 방식(`openclaw plugins install`)에 맞춰야 사용자 경험 일관성 유지. |
| Tool registration | 개별 registerTool 호출 | Factory pattern (배열 반환) | 22개 정적 도구 목록이므로 개별 등록이 더 명시적. Factory는 동적 도구에 적합. |
| Admin manual tooling | site/build.mjs 확장 | VitePress | 기존 빌드 파이프라인 재활용. 새 프레임워크 도입은 유지보수 부담만 증가. |
| Plugin config access | ctx.config in handler | 환경 변수 | OpenClaw config 시스템이 JSON Schema 기반 타입 안전 config를 제공. 환경변수보다 구조화됨. |

## What NOT to Add

1. **MCP SDK / @modelcontextprotocol/sdk**: 플러그인은 MCP가 아님. OpenClaw 자체 도구 등록 API를 사용.
2. **openclaw (full package) as dependency**: peerDependency로만. 런타임은 Gateway가 제공.
3. **Express/Fastify/Hono**: 플러그인이 자체 HTTP 서버를 띄울 이유 없음. 데몬이 API를 제공하고 플러그인은 SDK로 호출만 함.
4. **Any database library**: 플러그인에 자체 상태 저장 없음. 모든 상태는 WAIaaS 데몬의 SQLite DB에 있음.
5. **Bundler (esbuild/rollup)**: tsc 빌드만으로 충분. OpenClaw가 jiti로 로드하므로 번들링 불필요.

## Installation

```bash
# Plugin package (in packages/openclaw-plugin/)
# dependencies
npm install @waiaas/sdk

# devDependencies
npm install -D typescript vitest @types/node

# OpenClaw type definitions only (for development)
# Note: openclaw is peerDependency (optional) - Gateway provides runtime
npm install -D openclaw
```

기존 모노레포의 pnpm workspace가 자동으로 @waiaas/sdk를 로컬 패키지로 resolve.

## Sources

- [OpenClaw Plugin Documentation (official)](https://docs.openclaw.ai/tools/plugin) -- HIGH confidence
- [OpenClaw GitHub plugin.md](https://github.com/openclaw/openclaw/blob/main/docs/tools/plugin.md) -- HIGH confidence
- [OpenClaw Plugin Architecture (DeepWiki)](https://deepwiki.com/openclaw/openclaw/9.1-plugin-architecture) -- MEDIUM confidence
- [OpenClaw Plugin SDK Deep Dive (DEV Community)](https://dev.to/wonderlab/openclaw-deep-dive-4-plugin-sdk-and-extension-development-51ki) -- MEDIUM confidence
- [OpenClaw Plugin Manifest (LearnClawdBot)](https://www.learnclawdbot.org/docs/plugins/manifest) -- MEDIUM confidence
- [Plugin SDK Fundamentals (zread.ai)](https://zread.ai/openclaw/openclaw/18-plugin-sdk-fundamentals) -- MEDIUM confidence
