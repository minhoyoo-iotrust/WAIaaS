# 113 — Claude Code 연동 퀵 가이드

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** RESOLVED
- **등록일:** 2026-02-20

## 배경

WAIaaS는 이미 `npx @waiaas/skills add` 커맨드로 스킬 파일을 제공하지만, Claude Code 사용자를 위한 전용 퀵 가이드가 없다. Claude Code는 `.claude/skills/<name>/SKILL.md` 디렉토리 구조로 스킬을 디스커버하므로, 현재 플랫 파일 방식(`*.skill.md`)과 구조가 다르다.

## 구현 범위

### 1. `docs/claude-code-integration.md` — 퀵 가이드 (영문)

섹션 구성:

- Prerequisites (WAIaaS daemon + Claude Code 설치)
- Quick Setup 3단계:
  1. `waiaas quickset` (지갑/세션 생성)
  2. `npx @waiaas/skills claude-code` (`.claude/skills/` 디렉토리에 스킬 설치)
  3. Claude Code에서 `/waiaas-quickstart` 슬래시 명령 또는 자동 디스커버리 확인
- MCP 연동 (대안 경로): `waiaas mcp setup` 으로 MCP 서버 직접 연결
- Available Skills 테이블 (7개)
- Skills vs MCP 비교표 (어떤 상황에서 어떤 방식이 적합한지)
- Troubleshooting

### 2. `packages/skills/src/claude-code.ts` — Claude Code 설치 로직 (신규)

핵심 함수: `installClaudeCodeSkills(opts: { force: boolean }): void`

**동작:**
1. 프로젝트 루트의 `.claude/skills/` 경로 resolve (존재하지 않으면 mkdir -p)
2. 각 스킬별 디렉토리 생성: `.claude/skills/waiaas-{name}/`
3. 소스 `.skill.md` 읽기 → frontmatter 변환 → `SKILL.md`로 쓰기
4. 설치 결과 출력

**Frontmatter 변환 규칙:**

| WAIaaS 필드 | Claude Code 변환 |
|------------|-----------------|
| `name: "WAIaaS Quickset"` | `name: waiaas-quickstart` (디렉토리명과 일치) |
| `description` | 그대로 유지 |
| `dispatch.allowedCommands: ["curl"]` | `allowed-tools: Bash(curl:*)` |
| `category`, `tags`, `version`, `dispatch` | 제거 |

### 3. `packages/skills/src/cli.ts` — 커맨드 추가

- `main()` switch문에 `claude-code` 케이스 추가
- `printHelp()`에 설명 추가

## 수정/생성 파일

| 파일 | 변경 |
|------|------|
| `docs/claude-code-integration.md` | 신규 — 퀵 가이드 |
| `packages/skills/src/claude-code.ts` | 신규 — Claude Code 설치 로직 |
| `packages/skills/src/cli.ts` | 수정 — `claude-code` 커맨드 추가 |

## 테스트 항목

### 단위 테스트
1. frontmatter 변환이 `allowed-tools: Bash(curl:*)` 를 포함하는지 확인
2. 디렉토리 구조가 `.claude/skills/waiaas-{name}/SKILL.md` 패턴인지 확인
3. `--force` 플래그 동작 확인
4. `.claude/skills/` 미존재 시 자동 생성 확인
