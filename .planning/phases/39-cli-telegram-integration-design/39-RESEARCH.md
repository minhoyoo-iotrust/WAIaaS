# Phase 39: CLI + Telegram 연동 설계 - Research

**Researched:** 2026-02-09
**Domain:** CLI subcommand design + Telegram Bot command integration for MCP session management
**Confidence:** HIGH

## Summary

Phase 39는 CLI `waiaas mcp setup` / `waiaas mcp refresh-token` 두 개의 서브커맨드와 Telegram `/newsession` 명령어를 설계하는 단계다. 이 세 기능은 모두 Phase 36에서 확정된 토큰 파일 인프라(`writeMcpToken`, `readMcpToken`, `getMcpTokenPath`)를 공유하며, 세션 생성 API(`POST /v1/sessions`)를 호출한 뒤 결과 토큰을 `~/.waiaas/mcp-token` 파일에 저장하는 동일한 패턴을 따른다.

주요 설계 결정 포인트는 다음과 같다: (1) CLI `mcp` 서브커맨드 그룹을 기존 CLI 진입점 구조(54-cli-flow-redesign.md)에 어떻게 추가하는지, (2) `mcp refresh-token`에서 기존 세션의 constraints를 어떻게 계승하는지, (3) Claude Desktop `claude_desktop_config.json` 안내 출력의 구체적 포맷, (4) Telegram `/newsession`의 인라인 키보드 기반 에이전트 선택 플로우, (5) 기본 constraints 결정 규칙의 3-level 우선순위 체계.

기존 설계 문서가 매우 상세하게 각 컴포넌트의 아키텍처를 정의하고 있으므로, Phase 39는 "설계 문서에 새 섹션을 추가"하는 문서 작업이 주가 된다. 새로운 라이브러리 도입이나 아키텍처 변경은 없다.

**Primary recommendation:** 54-cli-flow-redesign.md에 `mcp` 서브커맨드 그룹(setup + refresh-token)을 추가하고, 40-telegram-bot-docker.md에 `/newsession` 명령어를 추가하며, 기본 constraints 우선순위를 config.toml `[session]` 섹션 + 하드코딩 기본값의 2-level로 확정한다 (agents.default_constraints DB 컬럼은 EXT-03으로 이연, v0.9 아키텍처 리서치 결정 준수).

## Standard Stack

이 Phase는 순수 설계 문서 작업이므로 새 라이브러리 도입이 없다. 기존 프로젝트 스택을 그대로 사용한다.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:util` (parseArgs) | Node.js 22 내장 | CLI 인자 파싱 | 54-cli-flow-redesign.md에서 모든 커맨드에 사용 중 |
| `@waiaas/core` (token-file.ts) | workspace | getMcpTokenPath, writeMcpToken, readMcpToken | Phase 36에서 확정된 공유 유틸리티 |
| Telegram Bot API | native fetch | Long Polling + sendMessage + InlineKeyboard | 40-telegram-bot-docker.md에서 확정 (외부 프레임워크 미사용) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jose` | v6.x | JWT 디코딩 (decodeJwt) | refresh-token에서 기존 토큰의 sessionId 추출 시 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| parseArgs (내장) | commander / yargs | 외부 의존성 추가. 프로젝트 규칙상 parseArgs 사용 확정 |
| native fetch (Telegram) | telegraf / grammY | 외부 봇 프레임워크. Phase 8에서 native fetch 전용 결정 확정 |

## Architecture Patterns

### CLI 서브커맨드 구조 (기존 패턴)

54-cli-flow-redesign.md 섹션 5.4에서 정의된 CLI 진입점 패턴을 따른다.

```typescript
// packages/cli/src/index.ts -- 기존 switch 구조에 'mcp' case 추가
switch (subcommand) {
  case 'init':    return runInit(process.argv.slice(3))
  case 'start':   return runStart(process.argv.slice(3))
  // ... 기존 커맨드
  case 'mcp':     return runMcp(subAction, process.argv.slice(4))  // 신규
  default: /* ... */
}
```

`mcp` 서브커맨드 그룹은 `agent`, `session`, `owner`, `backup`과 동일한 레벨의 1차 서브커맨드이며, `setup`과 `refresh-token`을 2차 액션으로 갖는다.

### Pattern 1: CLI MCP Setup (세션 생성 + 파일 저장 + 안내 출력)

**What:** `waiaas mcp setup`은 세션을 생성하고 토큰 파일에 저장한 뒤 Claude Desktop 설정 안내를 출력한다.
**When to use:** MCP 환경 최초 설정 시
**Flow:**
```
1. 데몬 실행 확인 (GET /health)
2. POST /v1/sessions (masterAuth implicit)
   - agentId: --agent 옵션 또는 에이전트 자동 선택
   - expiresIn: 604800 (7일, MCP 전용 장기 세션)
   - constraints: 기본 constraints 결정 규칙 적용
3. writeMcpToken(getMcpTokenPath(), token)  // 원자적 파일 쓰기
4. stdout: 세션 정보 + Claude Desktop config.json 안내
```

**Source:** v0.9-ARCHITECTURE.md 섹션 5.3 + 38-sdk-mcp-interface.md 섹션 6.2

### Pattern 2: CLI MCP Refresh-Token (폐기 + 재생성 + constraints 계승)

**What:** `waiaas mcp refresh-token`은 기존 세션을 폐기하고 동일 constraints로 새 세션을 생성한다.
**When to use:** 절대 수명 만료, 수동 토큰 교체 시
**Flow:**
```
1. 데몬 실행 확인 (GET /health)
2. readMcpToken(getMcpTokenPath()) -> 기존 토큰 로드
3. GET /v1/sessions/:sessionId -> 기존 세션의 constraints + agentId 조회
   - sessionId는 기존 토큰에서 jose decodeJwt로 sid claim 추출
4. DELETE /v1/sessions/:sessionId -> 기존 세션 폐기
5. POST /v1/sessions -> 새 세션 생성 (기존 agentId + constraints 계승)
6. writeMcpToken(getMcpTokenPath(), newToken)
7. stdout: 갱신 완료 안내
```

**핵심:** constraints 계승. 기존 세션의 제약 조건을 그대로 새 세션에 적용하여 보안 수준을 유지한다.

### Pattern 3: Telegram /newsession (인라인 키보드 + 기본 constraints)

**What:** `/newsession` 명령어로 Telegram에서 세션을 재생성한다.
**When to use:** 절대 수명 만료 후 원격 세션 재생성
**Flow:**
```
1. isAuthorizedOwner(chatId) 검증 (Tier 1)
2. agentService.listActive() -> 에이전트 목록
3. 인라인 키보드로 에이전트 선택 UI 제공
4. Owner가 에이전트 선택 (callback_data: "newsession:{agentId}")
5. 기본 constraints 결정 (3-level 우선순위)
6. sessionService.create({ agentId, constraints }) -- masterAuth implicit
7. writeMcpToken(getMcpTokenPath(), token)
8. Telegram 완료 메시지: "New session created. Token file updated."
```

**Source:** v0.9-ARCHITECTURE.md 섹션 5.2 + 40-telegram-bot-docker.md 섹션 4

### Pattern 4: 기본 Constraints 결정 규칙 (3-level 우선순위)

**What:** CLI `mcp setup`과 Telegram `/newsession`에서 명시적 constraints를 지정하지 않을 때 적용되는 기본값 결정 규칙.
**When to use:** MCP 세션 생성 시 constraints가 명시되지 않은 경우

```
우선순위 1 (최우선): agents.default_constraints (DB 컬럼)
  - v0.9에서는 미구현 (EXT-03으로 이연)
  - 향후 에이전트별 역할 기반 프리셋 지원 시 사용

우선순위 2: config.toml 기본값
  - [security].default_max_renewals = 30
  - [security].default_renewal_reject_window = 3600
  - (신규 검토) [session].default_expires_in = 604800 (MCP 전용)
  - (신규 검토) [session].default_max_amount_per_tx
  - (신규 검토) [session].default_allowed_operations

우선순위 3 (기본값): 하드코딩
  - expiresIn: 604800 (7일)
  - maxRenewals: 30
  - renewalRejectWindow: 3600 (1시간)
  - allowedOperations: 미설정 (모두 허용)
  - maxAmountPerTx: 미설정 (제한 없음)
```

**Source:** v0.9-ARCHITECTURE.md 섹션 9.3 결정 -- "선택지 2+3 조합 추천: config.toml 전역 기본값 + 하드코딩 기본값"

### Anti-Patterns to Avoid

- **config.toml에 [session] 중첩 섹션 추가하지 않기:** v0.7에서 config.toml 평탄화 규칙이 확정됨. 중첩 금지. `[session]` 같은 새 최상위 섹션은 가능하나 내부에 중첩 금지.
- **agents.default_constraints DB 컬럼을 v0.9에서 추가하지 않기:** EXT-03으로 이연 확정. 구현 시점(v1.x)에 결정.
- **Telegram /newsession에서 constraints 입력 UI 만들지 않기:** Telegram 인라인 키보드 callback_data 64바이트 제한으로 복잡한 입력 불가. 기본 constraints 자동 적용이 핵심.
- **CLI mcp refresh-token에서 기존 세션 폐기 없이 새 세션만 생성하지 않기:** Last-Writer-Wins로 토큰 파일은 교체되지만, 구 세션이 DB에 ACTIVE로 남아 보안 위험.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 토큰 파일 읽기/쓰기 | 직접 fs API 호출 | `readMcpToken` / `writeMcpToken` (Phase 36) | 원자적 쓰기, symlink 방어, 포맷 검증 내장 |
| 토큰 파일 경로 계산 | 하드코딩 경로 | `getMcpTokenPath()` (Phase 36) | WAIAAS_DATA_DIR 환경변수 오버라이드 지원 |
| JWT 디코딩 | `JSON.parse(atob(...))` | `jose.decodeJwt()` | 10+ 엣지 케이스 방어 (SM-05 결정) |
| CLI 인자 파싱 | 직접 파싱 | `parseArgs` (node:util) | 프로젝트 표준 |
| Telegram 메시지 전송 | 외부 봇 프레임워크 | native fetch + Telegram Bot API | Phase 8 결정 |

**Key insight:** Phase 36 / Phase 37에서 확정된 공유 유틸리티와 패턴을 재사용하는 것이 핵심. 새로운 인프라 구축은 불필요하다.

## Common Pitfalls

### Pitfall 1: Claude Desktop config.json 경로 플랫폼 차이

**What goes wrong:** macOS와 Windows에서 Claude Desktop 설정 파일 경로가 다르다.
**Why it happens:** 안내 출력에 단일 경로만 표시하면 다른 플랫폼 사용자가 혼란.
**How to avoid:** 플랫폼별 경로를 모두 안내하거나, `process.platform` 기반으로 적절한 경로만 표시.
**Warning signs:** 사용자가 설정 파일을 찾지 못하는 이슈.

**경로 정보:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json` (추정, 공식 미확인)

### Pitfall 2: mcp refresh-token에서 기존 세션 조회 실패

**What goes wrong:** 기존 토큰이 이미 만료되어 sessionAuth로 세션 정보를 조회할 수 없다.
**Why it happens:** `GET /v1/sessions/:id`가 sessionAuth를 요구하면 만료 토큰으로 조회 불가.
**How to avoid:** `mcp refresh-token`은 masterAuth(implicit) 기반으로 동작해야 한다. CLI는 데몬의 localhost에서 실행되므로 masterAuth implicit 범위. `GET /v1/sessions/:id`를 masterAuth implicit으로 호출하여 constraints를 조회한다.
**Warning signs:** 만료된 세션의 constraints를 조회하지 못하는 경우.

### Pitfall 3: Telegram /newsession의 callback_data 크기 제한

**What goes wrong:** callback_data가 64바이트를 초과하면 Telegram API가 에러 반환.
**Why it happens:** UUID v7(36자) + 접두사를 합치면 쉽게 64바이트에 근접.
**How to avoid:** `newsession:{agentId}` 포맷 = `newsession:` (11) + UUID v7 (36) = 47바이트 < 64바이트. 안전하지만 추가 데이터를 포함하지 않도록 주의.
**Warning signs:** Telegram sendMessage API 에러.

### Pitfall 4: 기본 constraints 없이 MCP 세션 생성

**What goes wrong:** 제한 없는 세션이 생성되어 보안 위험.
**Why it happens:** CLI/Telegram에서 constraints를 명시하지 않고 세션 생성 시 모든 제한이 해제된 상태.
**How to avoid:** 기본 constraints 결정 규칙을 반드시 적용. 최소한 expiresIn(604800)과 maxRenewals(30)은 하드코딩 기본값이 적용되어야 한다.
**Warning signs:** constraints가 빈 객체 `{}` 인 세션.

### Pitfall 5: mcp refresh-token에서 기존 세션 폐기-생성 사이의 갭

**What goes wrong:** 폐기 후 새 세션 생성 전에 MCP 프로세스가 API 호출하면 401 에러.
**Why it happens:** DELETE -> POST 사이 수 밀리초의 갭.
**How to avoid:** 순서를 변경: 새 세션을 먼저 생성하고, 토큰 파일을 쓰고, 이후 구 세션을 폐기한다. 이렇게 하면 갭 없이 전환된다. 단, 짧은 기간 두 세션이 동시 존재하지만 보안 위험은 미미하다 (구 세션은 즉시 폐기).
**Warning signs:** refresh-token 실행 중 MCP 프로세스의 401 에러.

## Code Examples

### CLI mcp 서브커맨드 그룹 진입점 패턴

```typescript
// packages/cli/src/commands/mcp.ts
// Source: 54-cli-flow-redesign.md 섹션 5.4 패턴 확장

import { parseArgs } from 'node:util'

export async function runMcp(action: string | undefined, args: string[]): Promise<void> {
  switch (action) {
    case 'setup':
      return runMcpSetup(args)
    case 'refresh-token':
      return runMcpRefreshToken(args)
    default:
      if (!action) {
        console.error('Usage: waiaas mcp <setup|refresh-token>')
      } else {
        console.error(`Unknown mcp action: ${action}`)
      }
      process.exit(1)
  }
}
```

### CLI mcp setup 커맨드 인터페이스 패턴

```typescript
// packages/cli/src/commands/mcp.ts
// Source: 54-cli-flow-redesign.md 섹션 4.7 parseArgs 패턴

function parseMcpSetupOptions(args: string[]): McpSetupOptions {
  const { values } = parseArgs({
    args,
    options: {
      agent: { type: 'string' },             // --agent <name|id>
      'expires-in': { type: 'string' },       // --expires-in <seconds>
      'max-amount': { type: 'string' },       // --max-amount <amount>
      'allowed-ops': { type: 'string' },      // --allowed-ops <ops>
      'data-dir': { type: 'string' },         // --data-dir <path>
      output: { type: 'string' },             // --output <format>
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  return {
    agent: values.agent,                      // 선택 (단일 에이전트 시 자동)
    expiresIn: values['expires-in']
      ? parseInt(values['expires-in'], 10)
      : 604800,                               // MCP 기본 7일
    maxAmount: values['max-amount'],
    allowedOps: values['allowed-ops']?.split(',').map(s => s.trim()),
    dataDir: values['data-dir'],
    output: (values.output ?? 'text') as 'text' | 'json',
  }
}
```

### CLI mcp setup 동작 패턴

```typescript
// packages/cli/src/commands/mcp.ts
// Source: v0.9-ARCHITECTURE.md 섹션 5.3

import { writeMcpToken, getMcpTokenPath } from '@waiaas/core/utils/token-file.js'

async function runMcpSetup(args: string[]): Promise<void> {
  const options = parseMcpSetupOptions(args)
  const config = loadCliConfig(options.dataDir)
  const baseUrl = `http://127.0.0.1:${config.port}`

  // 1. 데몬 실행 확인
  try {
    await fetch(`${baseUrl}/health`)
  } catch {
    console.error('Error: WAIaaS daemon is not running.')
    console.error("Start the daemon first: waiaas start")
    process.exit(1)
  }

  // 2. 에이전트 결정 (명시 또는 자동)
  const agentId = await resolveAgentId(baseUrl, options.agent)

  // 3. 기본 constraints 결정
  const constraints = resolveDefaultConstraints(config, options)

  // 4. POST /v1/sessions (masterAuth implicit)
  const response = await fetch(`${baseUrl}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, ...constraints }),
  })
  const session = await response.json()

  // 5. 토큰 파일 저장
  const tokenPath = getMcpTokenPath(options.dataDir)
  await writeMcpToken(tokenPath, session.token)

  // 6. 안내 출력
  console.log('MCP session created successfully!')
  console.log('')
  console.log(`  Agent:    ${session.agentName}`)
  console.log(`  Expires:  ${session.expiresAt} (7 days)`)
  console.log(`  Token:    ${tokenPath}`)
  console.log('')
  printClaudeDesktopConfig(session.token, baseUrl)
}
```

### Claude Desktop config.json 안내 출력 패턴

```typescript
// Source: 38-sdk-mcp-interface.md 섹션 6.2

function printClaudeDesktopConfig(token: string, baseUrl: string): void {
  const configPath = process.platform === 'darwin'
    ? '~/Library/Application Support/Claude/claude_desktop_config.json'
    : process.platform === 'win32'
    ? '%APPDATA%\\Claude\\claude_desktop_config.json'
    : '~/.config/Claude/claude_desktop_config.json'

  console.log(`Add this to your Claude Desktop config (first time only):`)
  console.log(`  ${configPath}`)
  console.log('')
  console.log(JSON.stringify({
    mcpServers: {
      'waiaas-wallet': {
        command: 'npx',
        args: ['@waiaas/mcp'],
        env: {
          WAIAAS_SESSION_TOKEN: token,
          WAIAAS_BASE_URL: baseUrl,
        },
      },
    },
  }, null, 2))
}
```

### Telegram /newsession 핸들러 패턴

```typescript
// packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
// Source: 40-telegram-bot-docker.md 섹션 4 + v0.9-ARCHITECTURE.md 섹션 5.2

async handleNewSession(message: TelegramMessage): Promise<void> {
  // Tier 1 인증
  if (!this.isAuthorizedOwner(message.from.id)) {
    await this.sendUnauthorized(message.chat.id)
    return
  }

  // 활성 에이전트 목록
  const agents = await this.agentService.listActive()

  if (agents.length === 0) {
    await this.sendMessage(message.chat.id,
      'No active agents\\. Create an agent first\\.')
    return
  }

  // 단일 에이전트: 직접 세션 생성 (키보드 생략)
  if (agents.length === 1) {
    await this.createNewSession(message.chat.id, agents[0].id, agents[0].name)
    return
  }

  // 복수 에이전트: 인라인 키보드로 선택
  const keyboard: InlineKeyboardButton[][] = agents.map(agent => [{
    text: agent.name ?? agent.id.slice(0, 8),
    callback_data: `newsession:${agent.id}`,  // 11 + 36 = 47 < 64
  }])

  await this.sendMessageWithKeyboard(message.chat.id,
    '*Select an agent for the new session:*', {
      inline_keyboard: keyboard,
    })
}

private async createNewSession(
  chatId: number | string,
  agentId: string,
  agentName: string,
): Promise<void> {
  // 기본 constraints 결정
  const constraints = this.resolveDefaultConstraints(agentId)

  // 세션 생성 (masterAuth implicit -- 봇은 데몬 내부)
  const session = await this.sessionService.create({
    agentId,
    ...constraints,
  })

  // 토큰 파일 저장
  await writeMcpToken(getMcpTokenPath(), session.token)

  // 완료 메시지
  const text = [
    '*New Session Created*',
    '',
    `Agent: \`${this.escapeMarkdownV2(agentName)}\``,
    `Expires: \`${this.escapeMarkdownV2(session.expiresAt)}\``,
    `Token file updated: \`~/.waiaas/mcp-token\``,
    '',
    '_MCP Server will automatically load the new token\\._',
  ].join('\n')

  await this.sendMessage(chatId, text)
}
```

### 기본 Constraints 결정 함수 패턴

```typescript
// 공통 유틸리티 (CLI + Telegram 공유)
// Source: v0.9-ARCHITECTURE.md 섹션 9.3, 53-session-renewal-protocol.md 섹션 8.3

function resolveDefaultConstraints(config: AppConfig): SessionConstraints {
  return {
    expiresIn: config.session?.default_expires_in ?? 604800,      // 7일
    maxRenewals: config.security?.default_max_renewals ?? 30,
    renewalRejectWindow: config.security?.default_renewal_reject_window ?? 3600,
    // maxAmountPerTx, allowedOperations 등은 config에 없으면 미설정 (제한 없음)
    // 향후 agents.default_constraints (EXT-03) 추가 시 최우선 적용
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP 토큰 수동 설정 (env var) | 토큰 파일 기반 자동 관리 | v0.9 Phase 36-37 | CLI/Telegram에서 토큰 파일에 쓰면 MCP가 자동 로드 |
| 세션 생성에 ownerAuth 필수 | masterAuth(implicit) | v0.5 Phase 19-21 | CLI/Telegram에서 서명 없이 세션 생성 가능 |
| 전역 config만 | config + 하드코딩 (2-level) | v0.9 결정 | agents.default_constraints는 EXT-03 이연 |

**Deprecated/outdated:**
- `WAIAAS_SESSION_TOKEN` 환경변수로 MCP 토큰 전달: 여전히 지원되지만 파일 기반이 우선 (SM-04 결정). 최초 부트스트랩 용도로만 사용.
- ownerAuth 기반 세션 생성: v0.5에서 masterAuth(implicit)로 전환됨.

## Open Questions

1. **config.toml에 `[session]` 섹션 추가 여부**
   - What we know: 현재 config.toml에 세션 관련 기본값은 `[security]` 섹션에 `default_max_renewals`, `default_renewal_reject_window`, `session_absolute_lifetime`로 존재한다.
   - What's unclear: MCP 전용 기본 expiresIn(604800), default_allowed_operations 등을 config.toml에 추가할지, 하드코딩으로 충분한지.
   - Recommendation: `[session]` 섹션을 신설하지 않고, MCP 전용 기본값은 하드코딩으로 유지한다. 이유: (1) config.toml 키 수 최소화 (v0.7 평탄화 원칙), (2) MCP 전용 설정은 극소수, (3) CLI `--expires-in` 옵션으로 오버라이드 가능. 만약 추가한다면 기존 `[security]` 섹션에 `default_session_expires_in` 키 1개만 추가하는 것이 적절하다.

2. **mcp refresh-token에서 구 세션 폐기 타이밍**
   - What we know: 폐기 -> 생성 순서면 갭 발생, 생성 -> 폐기 순서면 잠시 두 세션 공존.
   - What's unclear: 두 세션이 잠시 공존하는 것이 보안상 허용되는지.
   - Recommendation: 생성 -> 파일 쓰기 -> 폐기 순서를 채택한다. 두 세션 공존 기간은 수 밀리초이며, 구 세션은 즉시 폐기되므로 보안 위험이 사실상 없다. 갭으로 인한 MCP 401 에러를 방지하는 것이 더 중요하다.

3. **에이전트가 1개일 때 mcp setup의 --agent 생략 허용 여부**
   - What we know: `session create`는 `--agent` 필수. `mcp setup`은 DX 최적화가 목적.
   - What's unclear: 단일 에이전트 환경에서 --agent 생략이 적절한지.
   - Recommendation: 에이전트가 정확히 1개면 자동 선택하고, 0개면 에러, 2개 이상이면 --agent 필수로 에러. Telegram `/newsession`도 동일 패턴 (단일 에이전트면 키보드 생략).

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/54-cli-flow-redesign.md` -- CLI 커맨드 구조, parseArgs 패턴, session create 인터페이스, 전체 커맨드 목록
- `.planning/deliverables/40-telegram-bot-docker.md` -- TelegramBotService 아키텍처, 8개 명령어, 2-Tier 인증 모델, Long Polling, 인라인 키보드 패턴
- `.planning/deliverables/38-sdk-mcp-interface.md` -- MCP Server 구조, Claude Desktop 설정, SessionManager 설계, 토큰 전달 메커니즘
- `.planning/deliverables/30-session-token-protocol.md` -- SessionConstraints 8필드, JWT 구조, 세션 생성 API
- `.planning/deliverables/53-session-renewal-protocol.md` -- 갱신 프로토콜, 5종 안전 장치, config.toml 설정 우선순위
- `.planning/phases/36-토큰-파일-인프라-알림-이벤트/36-01-PLAN.md` -- 토큰 파일 사양, writeMcpToken/readMcpToken 유틸리티
- `.planning/phases/37-sessionmanager-core-design/37-01-SUMMARY.md` -- SM-01~SM-07 설계 결정
- `.planning/phases/37-sessionmanager-core-design/37-02-SUMMARY.md` -- SM-08~SM-14 설계 결정
- `.planning/research/v0.9-ARCHITECTURE.md` -- CLI mcp setup 흐름, Telegram /newsession 흐름, agents.default_constraints 결정, 의존 그래프
- `.planning/research/v0.9-FEATURES.md` -- DF-1 (/newsession 차별화), DF-3 (기본 constraints 프리셋)
- `.planning/REQUIREMENTS.md` -- CLIP-01, CLIP-02, TGSN-01, TGSN-02, EXT-03 요구사항
- `objectives/v0.9-session-management-automation.md` -- v0.9 목표, 핵심 원칙, 설계 대상

### Secondary (MEDIUM confidence)
- 없음 -- 모든 소스가 프로젝트 내부 설계 문서이며 HIGH confidence

### Tertiary (LOW confidence)
- Claude Desktop `claude_desktop_config.json`의 Linux 경로: `~/.config/Claude/` -- 공식 문서 미확인, 추정 값. macOS/Windows 경로는 38-sdk-mcp-interface.md에서 확인됨.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 도구/패턴이 기존 설계 문서에서 확정됨
- Architecture: HIGH - CLI 진입점 구조, Telegram 명령어 등록 패턴, 세션 API가 모두 기존 문서에서 상세 정의됨
- Pitfalls: HIGH - 프로젝트 내부 문서 분석 기반, 실제 패턴의 변주에 불과

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 마일스톤, 외부 의존성 변경 없으므로 안정적)
