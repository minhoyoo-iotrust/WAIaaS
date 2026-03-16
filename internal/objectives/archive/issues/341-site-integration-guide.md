# #341 — GitHub Pages 사이트에 에이전트 연동 가이드 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **수정일:** 2026-03-14

## 설명

현재 GitHub Pages 사이트(`site/index.html`)에 Core Capabilities, Architecture, Quick Start 섹션만 있고 실제 에이전트 연동 방법이 없다. OpenClaw 사용자와 MCP 연동 사용자를 위한 가이드 섹션을 추가한다.

## 추가 위치

Quick Start 섹션과 Resources 섹션 사이에 "Connect Your Agent" 섹션 추가.

## 추가 내용

### 탭 UI: OpenClaw / MCP 전환

**[OpenClaw] 탭:**
- Step 1: 스킬 설치 — `npx @waiaas/skills openclaw`
- Step 2: `~/.openclaw/openclaw.json` 설정 — `WAIAAS_BASE_URL` + `WAIAAS_SESSION_TOKEN` JSON 예시
- Step 3: 검증 — "Check my WAIaaS wallet balance" 프롬프트 예시
- 8개 스킬 목록 테이블 (setup, quickstart, wallet, transactions, policies, admin, actions, x402)

**[MCP] 탭:**
- Step 1: MCP 셋업 — `waiaas mcp setup`
- Step 2: 생성된 `mcpServers` 설정을 원하는 클라이언트에 붙여넣기
  - Claude Code: `.claude/settings.json`
  - Cursor: `.cursor/mcp.json`
  - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - 기타 MCP 호환 클라이언트
- Step 3: `connect_info` 도구로 자동 발견 — 18개 MCP 도구 사용 가능
- Skills vs MCP 비교 테이블 (셋업 방법, 동작 원리, 적합 용도)

### 디자인 요구사항
- 기존 터미널 테마와 동일한 스타일 (녹색/시안/노란 색상, JetBrains Mono, 박스 보더)
- 탭 버튼으로 OpenClaw / MCP 전환 (JavaScript 최소한)
- 코드 블록은 기존 `$ prompt` 스타일 유지
- JSON 설정 예시는 프롬프트 없는 코드 블록

## 참조 문서
- `docs/guides/openclaw-integration.md` — OpenClaw 연동 가이드 원본
- `docs/guides/claude-code-integration.md` — Claude Code 연동 가이드 원본 (MCP 섹션 포함)
- `packages/cli/src/commands/mcp-setup.ts` — MCP 셋업 CLI 구현

## MCP 클라이언트 설정 예시

모든 MCP 클라이언트가 동일한 `mcpServers` 형식을 사용:

```json
{
  "mcpServers": {
    "waiaas-my-wallet": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": {
        "WAIAAS_DATA_DIR": "~/.waiaas",
        "WAIAAS_BASE_URL": "http://localhost:3100",
        "WAIAAS_WALLET_ID": "<wallet-id>"
      }
    }
  }
}
```

클라이언트별 설정 파일 위치:
| 클라이언트 | 설정 파일 |
|---|---|
| Claude Code | `.claude/settings.json` (프로젝트) 또는 `~/.claude/settings.json` (글로벌) |
| Cursor | `.cursor/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |

## 테스트 항목

- [ ] OpenClaw 탭: 3단계 가이드가 정확한 명령어와 설정 예시를 포함하는지 확인
- [ ] MCP 탭: `waiaas mcp setup` 명령어 + 3개 클라이언트 설정 경로가 정확한지 확인
- [ ] 탭 전환 JavaScript가 정상 동작하는지 확인
- [ ] 모바일 반응형 레이아웃에서 탭 및 코드 블록이 깨지지 않는지 확인
- [ ] 기존 터미널 테마 스타일과 일관성 유지 확인
