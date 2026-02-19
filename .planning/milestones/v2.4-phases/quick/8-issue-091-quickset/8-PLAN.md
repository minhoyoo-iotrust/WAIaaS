---
phase: quick-8
plan: 8
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/cli/src/index.ts
  - packages/cli/src/commands/quickstart.ts
  - packages/cli/src/__tests__/quickstart.test.ts
  - README.md
  - packages/skills/skills/quickstart.skill.md
  - skills/quickstart.skill.md
autonomous: true
requirements: [ISSUE-091]

must_haves:
  truths:
    - "waiaas quickset --mode testnet 실행 시 quickstart와 동일한 결과 생성"
    - "waiaas quickstart 기존 명령어가 동일하게 동작 (하위 호환)"
    - "waiaas --help 에서 quickset이 주 명령어로 표시, quickstart가 alias로 표시"
    - "README/스킬 파일에서 quickset으로 안내 통일"
  artifacts:
    - path: "packages/cli/src/index.ts"
      provides: "quickset 주 명령어 등록 + quickstart alias 등록"
      contains: "quickset"
    - path: "packages/cli/src/commands/quickstart.ts"
      provides: "출력 텍스트 Quickset 반영"
      contains: "Quickset"
    - path: "README.md"
      provides: "quickset 명령어 안내"
      contains: "quickset"
  key_links:
    - from: "packages/cli/src/index.ts quickset command"
      to: "packages/cli/src/commands/quickstart.ts quickstartCommand"
      via: "동일 handler 함수 호출"
      pattern: "quickstartCommand"
---

<objective>
Issue 091 수정: `quickset` 명령어를 추가하여 `quickstart`와 `start` 이름 혼동 해소.

Purpose: `start`(데몬 시작)와 `quickstart`(빠른 설정) 이름이 혼동되므로, `quickset`을 주 명령어로 추가하고 문서를 통일. `quickstart`는 하위 호환으로 조용히 유지.
Output: CLI에 quickset 명령어 등록, 문서/스킬파일 quickset 통일
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@internal/objectives/issues/091-quickset-command-alias.md
@packages/cli/src/index.ts
@packages/cli/src/commands/quickstart.ts
@packages/cli/src/__tests__/quickstart.test.ts
@README.md
@packages/skills/skills/quickstart.skill.md
@skills/quickstart.skill.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: CLI quickset 명령어 등록 + quickstart alias 변경 + 출력 텍스트 수정</name>
  <files>
    packages/cli/src/index.ts
    packages/cli/src/commands/quickstart.ts
    packages/cli/src/__tests__/quickstart.test.ts
  </files>
  <action>
1. `packages/cli/src/index.ts` 수정:
   - 기존 `quickstart` 명령어 블록을 `quickset`으로 변경 (주 명령어):
     ```typescript
     program
       .command('quickset')
       .description('Quick setup: create wallets, sessions, and MCP tokens')
       .option('--data-dir <path>', 'Data directory path')
       .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
       .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'testnet')
       .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
       .option('--password <password>', 'Master password')
       .action(async (opts) => { /* 기존 동일 로직 */ });
     ```
   - 바로 아래에 `quickstart` alias 추가:
     ```typescript
     program
       .command('quickstart')
       .description('(alias for quickset) Quick setup: create wallets, sessions, and MCP tokens')
       .option('--data-dir <path>', 'Data directory path')
       .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
       .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'testnet')
       .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
       .option('--password <password>', 'Master password')
       .action(async (opts) => { /* quickset과 동일 handler */ });
     ```
   - 파일 상단 주석 업데이트: `quickstart` 라인을 `quickset` + `quickstart (alias)` 로 변경

2. `packages/cli/src/commands/quickstart.ts` 수정:
   - 파일 상단 JSDoc: `waiaas quickstart` -> `waiaas quickset` (주 명령어로 표기)
   - 출력 텍스트 변경: `'WAIaaS Quickstart Complete!'` -> `'WAIaaS Quickset Complete!'`
   - 나머지 함수명/인터페이스명(`quickstartCommand`, `QuickstartOptions`)은 변경하지 않음 (내부 코드 안정성 유지, 파일명도 유지)

3. `packages/cli/src/__tests__/quickstart.test.ts` 수정:
   - 테스트 describe/it 문자열에 quickset 반영 (예: `'quicksetCommand (formerly quickstart)'`)
   - 출력 검증: `'WAIaaS Quickstart Complete!'` -> `'WAIaaS Quickset Complete!'` 로 expect 업데이트
   - 기존 기능 테스트는 모두 유지 (동일 handler이므로)
  </action>
  <verify>
    `cd /Users/minho.yoo/dev/wallet/WAIaaS && pnpm --filter @waiaas/cli run test` 를 실행하여 모든 테스트 통과 확인
  </verify>
  <done>
    - `quickset` 명령어가 CLI에 등록되어 quickstart와 동일 handler 호출
    - `quickstart`가 alias description으로 등록되어 하위 호환 유지
    - 출력 텍스트가 "Quickset"으로 변경됨
    - 기존 테스트가 업데이트된 텍스트로 통과
  </done>
</task>

<task type="auto">
  <name>Task 2: 문서 및 스킬 파일 quickset 통일</name>
  <files>
    README.md
    packages/skills/skills/quickstart.skill.md
    skills/quickstart.skill.md
  </files>
  <action>
1. `README.md` 수정:
   - `waiaas quickstart --mode testnet` -> `waiaas quickset --mode testnet`
   - `The \`quickstart\` command does everything` -> `The \`quickset\` command does everything`
   - `waiaas quickstart --mode mainnet` -> `waiaas quickset --mode mainnet`
   - `After quickstart, choose one of two` -> `After quickset, choose one of two`
   - `# quickstart already printed` -> `# quickset already printed`
   - 스킬 목록의 `quickstart` 언급은 스킬파일 이름이므로 유지 (파일명 변경 없음)

2. `packages/skills/skills/quickstart.skill.md` 수정:
   - frontmatter `name`: "WAIaaS Quickstart" -> "WAIaaS Quickset"
   - frontmatter `description`: "End-to-end quickstart:" -> "End-to-end quickset:"
   - frontmatter `tags`: `quickstart` -> `quickset` (+ `quickstart` 유지 검색 호환)
   - 본문 "CLI Quickstart (Alternative)" 섹션의 `waiaas quickstart --mode testnet` -> `waiaas quickset --mode testnet`
   - "No Connection Info?" 섹션의 `waiaas quickstart` -> `waiaas quickset` 언급 수정
   - 제목 `# WAIaaS Quickstart` -> `# WAIaaS Quickset`

3. `skills/quickstart.skill.md` (root copy) 수정:
   - packages/skills 버전과 동일하게 변경 적용

4. `packages/skills/src/registry.ts` 수정 (quickstart 이름 유지하되 description만):
   - `description`: "End-to-end quickstart:" -> "End-to-end quickset:"
   - `name`과 `filename`은 변경하지 않음 (파일명 변경 불필요, 하위 호환 유지)

Note: 파일 이름(quickstart.skill.md, quickstart.ts 등)은 변경하지 않음. 내부 식별자 안정성과 하위 호환 우선.
  </action>
  <verify>
    `cd /Users/minho.yoo/dev/wallet/WAIaaS && pnpm turbo run typecheck --filter @waiaas/cli --filter @waiaas/skills` 를 실행하여 타입 에러 없음 확인
  </verify>
  <done>
    - README에서 모든 사용자 안내가 quickset으로 통일
    - 스킬 파일 제목/설명이 quickset으로 변경
    - CLI 섹션 예제가 `waiaas quickset`으로 표시
    - 파일명은 유지되어 하위 호환 보장
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter @waiaas/cli run test` -- CLI 테스트 전체 통과
2. `pnpm turbo run typecheck` -- 타입 에러 없음
3. README.md에서 quickstart CLI 명령 안내가 없음 (grep 확인, 스킬파일명 제외)
4. packages/cli/src/index.ts에 quickset + quickstart 두 명령어 모두 등록
</verification>

<success_criteria>
- `waiaas quickset --mode testnet` 실행 시 기존 quickstart와 동일한 월렛+세션+MCP 토큰 생성
- `waiaas quickstart` 하위 호환 유지 (동일 handler)
- `waiaas --help`에서 quickset이 주 명령어, quickstart가 alias로 표시
- README/스킬파일에서 quickset으로 사용자 안내 통일
- 모든 기존 테스트 통과
</success_criteria>

<output>
After completion, create `.planning/quick/8-issue-091-quickset/8-SUMMARY.md`
</output>
