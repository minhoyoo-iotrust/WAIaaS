---
phase: quick-6
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/admin/src/utils/agent-prompt.ts
  - packages/admin/src/pages/dashboard.tsx
  - packages/admin/src/pages/wallets.tsx
  - packages/admin/src/api/endpoints.ts
  - packages/cli/src/commands/quickstart.ts
  - packages/skills/skills/quickstart.skill.md
autonomous: true
requirements: [ISSUE-087]
must_haves:
  truths:
    - "Dashboard has 'Copy Agent Prompt' button that copies all-wallet connection text to clipboard"
    - "Wallet detail has 'Copy Agent Prompt' button that copies single-wallet connection text to clipboard"
    - "CLI quickstart outputs magic word block after MCP config"
    - "quickstart.skill.md includes magic word recognition guide section"
  artifacts:
    - path: "packages/admin/src/utils/agent-prompt.ts"
      provides: "Magic word text generation utility"
      exports: ["buildAgentPrompt", "buildSingleWalletPrompt"]
    - path: "packages/admin/src/pages/dashboard.tsx"
      provides: "Copy All Wallets Prompt button"
      contains: "Copy Agent Prompt"
    - path: "packages/admin/src/pages/wallets.tsx"
      provides: "Copy Wallet Prompt button in detail view"
      contains: "Copy Agent Prompt"
    - path: "packages/cli/src/commands/quickstart.ts"
      provides: "Magic word block terminal output"
      contains: "[WAIaaS Connection]"
    - path: "packages/skills/skills/quickstart.skill.md"
      provides: "Magic word recognition guide"
      contains: "[WAIaaS Connection]"
  key_links:
    - from: "packages/admin/src/pages/dashboard.tsx"
      to: "packages/admin/src/utils/agent-prompt.ts"
      via: "import buildAgentPrompt"
      pattern: "buildAgentPrompt"
    - from: "packages/admin/src/pages/wallets.tsx"
      to: "packages/admin/src/utils/agent-prompt.ts"
      via: "import buildSingleWalletPrompt"
      pattern: "buildSingleWalletPrompt"
---

<objective>
Issue 087: AI 에이전트용 연결 프롬프트(매직워드) 복사 기능 구현.

Purpose: 스킬 파일만 설치한 AI 에이전트가 데몬 URL, 월렛 ID, 세션 토큰을 한 번에 전달받아 즉시 연결할 수 있도록 구조화된 "매직워드" 텍스트를 생성/복사하는 기능 추가.
Output: agent-prompt.ts 유틸리티, Dashboard/WalletDetail 복사 버튼, CLI quickstart 출력, skill 가이드 업데이트
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@internal/objectives/issues/087-agent-connection-prompt-magic-word.md
@packages/admin/src/utils/agent-prompt.ts (new file)
@packages/admin/src/pages/dashboard.tsx
@packages/admin/src/pages/wallets.tsx
@packages/admin/src/api/endpoints.ts
@packages/admin/src/api/client.ts
@packages/admin/src/components/copy-button.tsx
@packages/admin/src/components/toast.tsx
@packages/cli/src/commands/quickstart.ts
@packages/skills/skills/quickstart.skill.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create agent-prompt utility + Admin UI buttons (Dashboard + WalletDetail)</name>
  <files>
    packages/admin/src/utils/agent-prompt.ts
    packages/admin/src/pages/dashboard.tsx
    packages/admin/src/pages/wallets.tsx
    packages/admin/src/api/endpoints.ts
  </files>
  <action>
1. Create `packages/admin/src/utils/agent-prompt.ts` with two exported functions:

```typescript
interface WalletPromptInfo {
  id: string;
  name: string;
  chain: string;
  defaultNetwork: string;
  sessionToken: string;
}

export function buildAgentPrompt(baseUrl: string, wallets: WalletPromptInfo[]): string
export function buildSingleWalletPrompt(baseUrl: string, wallet: WalletPromptInfo): string
```

- `buildAgentPrompt`: Generates the full multi-wallet magic word block per issue 087 format:
```
[WAIaaS Connection]
- URL: {baseUrl}

Wallets:
1. {name} ({id}) -- {defaultNetwork}
   Session: {sessionToken}
2. ...

세션이 만료되면(401 Unauthorized)
POST /v1/wallets/{walletId}/sessions/{sessionId}/renew 으로 갱신하세요.

위 정보로 WAIaaS 지갑에 연결하여 잔액을 확인하고 관리해주세요.
```

- `buildSingleWalletPrompt`: Same format but for a single wallet (no numbered list, just one entry).

2. In `packages/admin/src/api/endpoints.ts`, add endpoint for generating agent prompt:
```typescript
ADMIN_AGENT_PROMPT: '/v1/admin/agent-prompt',
ADMIN_WALLET_AGENT_PROMPT: (id: string) => `/v1/admin/wallets/${id}/agent-prompt`,
```

These endpoints will be called by the Dashboard and WalletDetail buttons. They need server-side session creation because the Admin UI only has masterAuth and can't generate session tokens client-side.

IMPORTANT: The daemon does NOT have these admin endpoints yet. Instead, use the existing session creation endpoint (`POST /v1/sessions`) to create sessions for each wallet. The flow:
- Fetch all wallets via `GET /v1/wallets`
- For each active wallet, create a session via `POST /v1/sessions` with `{ walletId, ttl: 86400 }`
- Build the magic word text from the collected data
- Copy to clipboard

Actually, SIMPLER approach -- do NOT add new endpoints. The Admin UI already has masterAuth. Use the existing APIs directly from the client:
- `apiGet(API.WALLETS)` to list wallets
- `apiPost(API.SESSIONS, { walletId, expiresIn: 86400 })` for each wallet to create sessions

So revert the endpoints.ts change -- no new endpoints needed.

3. In `packages/admin/src/pages/dashboard.tsx`:
- Add a "Copy Agent Prompt" button in the stat-grid area (after the existing stat cards, or as a dedicated action row below the stat grids and above Recent Activity).
- On click: fetch all wallets, create a session for each active wallet, build magic word via `buildAgentPrompt()`, copy to clipboard, show toast "Agent prompt copied!".
- Show loading state during the multi-step process.
- Use `window.location.origin` as baseUrl (falls back to `http://localhost:3100` if origin is empty).
- Import `apiGet`, `apiPost` from `../api/client`, `API` from `../api/endpoints`, `showToast` from `../components/toast`, and `buildAgentPrompt` from `../utils/agent-prompt`.

4. In `packages/admin/src/pages/wallets.tsx` (`WalletDetailView` function):
- Add a "Copy Agent Prompt" button in the `detail-header` div next to "Terminate Wallet" button.
- On click: create a session for this wallet via `apiPost(API.SESSIONS, { walletId: id, expiresIn: 86400 })`, build magic word via `buildSingleWalletPrompt()`, copy to clipboard, show toast "Agent prompt copied!".
- Use wallet.value data for name, chain, defaultNetwork.
- Show loading state.

IMPORTANT clipboard pattern -- use the same pattern as CopyButton component for fallback:
```typescript
try {
  await navigator.clipboard.writeText(text);
} catch {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
```

Do NOT modify endpoints.ts -- no new server endpoints needed.
  </action>
  <verify>
- `pnpm turbo run typecheck --filter=@waiaas/admin` passes
- `pnpm turbo run lint --filter=@waiaas/admin` passes
- Verify `agent-prompt.ts` exports both functions
- Verify Dashboard.tsx imports and uses buildAgentPrompt
- Verify wallets.tsx WalletDetailView imports and uses buildSingleWalletPrompt
  </verify>
  <done>
- agent-prompt.ts utility exists with buildAgentPrompt and buildSingleWalletPrompt functions
- Dashboard page has "Copy Agent Prompt" button that creates sessions for all wallets and copies magic word
- Wallet detail page has "Copy Agent Prompt" button that creates session for single wallet and copies magic word
- Both buttons show loading state and toast on completion
  </done>
</task>

<task type="auto">
  <name>Task 2: CLI quickstart magic word output + skill file update</name>
  <files>
    packages/cli/src/commands/quickstart.ts
    packages/skills/skills/quickstart.skill.md
  </files>
  <action>
1. In `packages/cli/src/commands/quickstart.ts`, after the MCP config snippet output (after `printConfigPath()` call at line ~266), add the magic word block output:

```typescript
// Step 7: Agent connection prompt (magic word)
console.log('');
console.log('AI Agent Connection Prompt:');
console.log('(Copy and paste the block below to your AI agent)');
console.log('\u2500'.repeat(40));
console.log('[WAIaaS Connection]');
console.log(`- URL: ${baseUrl}`);
console.log('');
console.log('Wallets:');
createdWallets.forEach((wallet, index) => {
  const network = wallet.defaultNetwork ?? wallet.environment;
  console.log(`${index + 1}. ${wallet.name} (${wallet.id}) \u2014 ${network}`);
  console.log(`   Session: ${wallet.sessionToken ?? 'N/A'}`);
});
console.log('');
console.log('\uC138\uC158\uC774 \uB9CC\uB8CC\uB418\uBA74(401 Unauthorized)');
console.log('POST /v1/wallets/{walletId}/sessions/{sessionId}/renew \uC73C\uB85C \uAC31\uC2E0\uD558\uC138\uC694.');
console.log('');
console.log('\uC704 \uC815\uBCF4\uB85C WAIaaS \uC9C0\uAC11\uC5D0 \uC5F0\uACB0\uD558\uC5EC \uC794\uC561\uC744 \uD655\uC778\uD558\uACE0 \uAD00\uB9AC\uD574\uC8FC\uC138\uC694.');
console.log('\u2500'.repeat(40));
```

Use the Korean strings directly (not escaped unicode): "세션이 만료되면(401 Unauthorized)", "POST /v1/wallets/{walletId}/sessions/{sessionId}/renew 으로 갱신하세요.", "위 정보로 WAIaaS 지갑에 연결하여 잔액을 확인하고 관리해주세요."

The `wallet.sessionToken` is already available from the `CreatedWallet` interface (set in Step 3 of quickstartCommand or via fallback session creation).

2. In `packages/skills/skills/quickstart.skill.md`, replace the existing "## 0. Connection Discovery" section (lines ~16-43) with a new section that includes both connection discovery AND magic word recognition:

Replace the existing `## 0. Connection Discovery` section with:

```markdown
## 0. Connection Info

### Magic Word (Agent Connection Prompt)

If the user provides a `[WAIaaS Connection]` block, extract connection info and start API calls immediately:

- `URL` -> API base URL
- `Wallets` -> numbered list with wallet name, ID, network, session token
- `Session` -> use as `Authorization: Bearer {token}` header

Example format:
\```
[WAIaaS Connection]
- URL: http://localhost:3100

Wallets:
1. solana-testnet (019c6fb6-...) -- solana-devnet
   Session: eyJhbG...
\```

### Session Renewal

On `401 Unauthorized` response:
1. Extract `sessionId` from JWT payload `sub` claim
2. `POST /v1/wallets/{walletId}/sessions/{sessionId}/renew`
3. Use the new token from response for subsequent requests

### No Connection Info?

Ask the user:
"WAIaaS 연결 정보가 필요합니다. Admin UI 대시보드 또는 `waiaas quickstart` 완료 화면에서 'Copy Agent Prompt'로 연결 정보를 복사해서 알려주세요."

### Manual Discovery

If no magic word is provided, check the daemon manually:
```

Keep the existing "### Health Check" and "### List Existing Wallets" subsections that follow. Only restructure the section header and add the magic word recognition content above the existing manual discovery steps.
  </action>
  <verify>
- `pnpm turbo run typecheck --filter=@waiaas/cli` passes
- `pnpm turbo run lint --filter=@waiaas/cli` passes
- Verify quickstart.ts includes magic word output block after MCP config
- Verify quickstart.skill.md contains `[WAIaaS Connection]` recognition guide
  </verify>
  <done>
- CLI quickstart outputs magic word block with all wallet connection info after MCP config snippet
- quickstart.skill.md has structured magic word recognition guide including session renewal instructions
- AI agents receiving the magic word can parse URL, wallet IDs, networks, and session tokens immediately
  </done>
</task>

</tasks>

<verification>
1. `pnpm turbo run typecheck` -- all packages pass
2. `pnpm turbo run lint` -- all packages pass
3. Manual verification: agent-prompt.ts generates correct format matching issue 087 spec
4. Manual verification: Dashboard button triggers fetch+session+copy flow
5. Manual verification: WalletDetail button triggers session+copy flow
6. Manual verification: quickstart.ts outputs magic word block
7. Manual verification: quickstart.skill.md includes magic word section
</verification>

<success_criteria>
- Dashboard "Copy Agent Prompt" button copies all-wallet magic word to clipboard
- WalletDetail "Copy Agent Prompt" button copies single-wallet magic word to clipboard
- CLI quickstart prints magic word block in terminal after MCP config
- quickstart.skill.md documents magic word format and parsing guide
- All typecheck and lint pass
</success_criteria>

<output>
After completion, create `.planning/quick/6-issue-087-ai/6-SUMMARY.md`
</output>
