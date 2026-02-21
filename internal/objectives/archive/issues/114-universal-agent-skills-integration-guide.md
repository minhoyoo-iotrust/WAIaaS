# 114 — 범용 Agent Skills 연동 가이드 + 설치 명령어

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** RESOLVED
- **등록일:** 2026-02-20

## 배경

Agent Skills 오픈 표준(agentskills.io)은 27개 이상의 플랫폼이 채택한 AI 에이전트 스킬 포맷이다. WAIaaS 스킬 파일을 이 표준에 맞춰 제공하면, Claude Code·OpenClaw 외에도 OpenAI Codex, Gemini CLI, Cursor, GitHub Copilot, Goose, Amp, Roo Code 등에서 즉시 사용 가능하다.

## 구현 범위

### 1. `docs/agent-skills-integration.md` — 범용 가이드 (영문)

섹션 구성:

- What is Agent Skills? (표준 소개 + 27개 플랫폼 호환)
- Prerequisites (WAIaaS daemon 실행)
- Quick Setup:
  1. `waiaas quickset` (지갑/세션 생성)
  2. `npx @waiaas/skills agent-skills` (`.agents/skills/` 표준 경로에 설치)
  3. 환경변수 설정 안내
- Platform-Specific Setup (플랫폼별 디스커버리 경로):
  - OpenAI Codex: `.agents/skills/waiaas-*/SKILL.md`
  - Gemini CLI: `.agents/skills/waiaas-*/SKILL.md`
  - Cursor: `.cursor/skills/waiaas-*/SKILL.md`
  - GitHub Copilot: `.github/skills/waiaas-*/SKILL.md`
  - Goose / Amp / Roo Code: `.agents/skills/waiaas-*/SKILL.md`
  - 기타: 플랫폼 문서 참조 안내
- Available Skills 테이블 (7개)
- Dedicated Guides 링크 (Claude Code, OpenClaw 별도 가이드)

### 2. `packages/skills/src/agent-skills.ts` — 표준 경로 설치 로직 (신규)

핵심 함수: `installAgentSkills(opts: { force: boolean; target?: string }): void`

**동작:**
1. 대상 경로 결정:
   - 기본값: `.agents/skills/` (Codex/Gemini CLI/Goose 표준)
   - `--target cursor`: `.cursor/skills/`
   - `--target github`: `.github/skills/`
2. 각 스킬별 디렉토리 생성: `{target}/waiaas-{name}/`
3. 소스 `.skill.md` 읽기 → Agent Skills 표준 frontmatter로 변환 → `SKILL.md`로 쓰기

**Frontmatter 변환 규칙 (Agent Skills 표준):**

| WAIaaS 필드 | 표준 변환 |
|------------|----------|
| `name: "WAIaaS Quickset"` | `name: waiaas-quickstart` (lowercase hyphenated, 디렉토리명 일치) |
| `description` | 그대로 유지 |
| `dispatch.allowedCommands: ["curl"]` | `allowed-tools: Bash(curl:*)` |
| `category`, `tags` | `metadata.category`, `metadata.tags` 로 이동 |
| `version` | `metadata.version` 으로 이동 |
| `dispatch` | 제거 |

### 3. `packages/skills/src/cli.ts` — 커맨드 추가

- `main()` switch문에 `agent-skills` 케이스 추가
- `--target` 옵션 파싱
- `printHelp()`에 설명 추가:

```
  agent-skills       Install skills to .agents/skills/ (Codex, Gemini CLI, Goose, Amp)
                     --target cursor    Install to .cursor/skills/
                     --target github    Install to .github/skills/
```

### 4. 공통 변환 로직 리팩토링

이슈 111(OpenClaw), 113(Claude Code), 114(범용) 모두 "소스 읽기 → frontmatter 변환 → 디렉토리 구조 쓰기" 패턴이 동일하다. 공통 유틸리티로 추출:

```typescript
// packages/skills/src/transform.ts
interface TransformOptions {
  namePrefix: string;         // "waiaas-"
  targetDir: string;          // 설치 대상 경로
  frontmatterTransform: (original: Frontmatter) => Record<string, unknown>;
}

function transformAndInstall(registry: SkillEntry[], opts: TransformOptions): void
```

각 플랫폼 모듈은 `frontmatterTransform` 함수만 다르게 제공하면 된다.

## 수정/생성 파일

| 파일 | 변경 |
|------|------|
| `docs/agent-skills-integration.md` | 신규 — 범용 가이드 |
| `packages/skills/src/agent-skills.ts` | 신규 — 표준 경로 설치 로직 |
| `packages/skills/src/transform.ts` | 신규 — 공통 변환 유틸리티 (111, 113, 114 공유) |
| `packages/skills/src/cli.ts` | 수정 — `agent-skills` 커맨드 + `--target` 옵션 |

## 선행 의존

- 이슈 112 (기본 모드 mainnet 전환) — 가이드 예시의 일관성
- 이슈 111, 113과 공통 변환 로직 공유 → 동일 마일스톤에서 구현 권장

## 테스트 항목

### 단위 테스트
1. 공통 변환 함수가 WAIaaS frontmatter를 Agent Skills 표준 형식으로 변환하는지 확인
2. `--target` 옵션별 설치 경로가 올바른지 확인 (기본/cursor/github)
3. `metadata` 필드에 category, tags, version이 이동되는지 확인
4. 본문 마크다운이 변환 없이 보존되는지 확인

### 통합 테스트
5. `node dist/cli.js agent-skills` → `.agents/skills/waiaas-*/SKILL.md` 7개 생성 확인
6. `node dist/cli.js agent-skills --target cursor` → `.cursor/skills/waiaas-*/SKILL.md` 확인
