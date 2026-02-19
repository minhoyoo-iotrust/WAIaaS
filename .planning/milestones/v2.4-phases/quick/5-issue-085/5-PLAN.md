---
phase: quick-5
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/skills/scripts/sync-version.mjs
  - packages/skills/package.json
  - packages/skills/skills/quickstart.skill.md
  - packages/skills/skills/wallet.skill.md
  - packages/skills/skills/transactions.skill.md
  - packages/skills/skills/policies.skill.md
  - packages/skills/skills/admin.skill.md
  - packages/skills/skills/actions.skill.md
  - packages/skills/skills/x402.skill.md
  - turbo.json
autonomous: true
requirements: ["ISSUE-085"]

must_haves:
  truths:
    - "prebuild 스크립트 실행 시 모든 .skill.md frontmatter version이 package.json 버전과 일치"
    - "pnpm turbo run build --filter=@waiaas/skills 실행 시 prebuild가 자동 트리거"
    - "quickstart.skill.md에 데몬 연결 확인 + 기존 월렛 조회 디스커버리 흐름이 존재"
  artifacts:
    - path: "packages/skills/scripts/sync-version.mjs"
      provides: "버전 자동 주입 스크립트"
      min_lines: 10
    - path: "packages/skills/package.json"
      provides: "prebuild 스크립트 등록"
      contains: "prebuild"
    - path: "packages/skills/skills/quickstart.skill.md"
      provides: "디스커버리 섹션"
      contains: "Connection Discovery"
  key_links:
    - from: "packages/skills/package.json"
      to: "packages/skills/scripts/sync-version.mjs"
      via: "prebuild script hook"
      pattern: "prebuild.*sync-version"
    - from: "packages/skills/scripts/sync-version.mjs"
      to: "packages/skills/skills/*.skill.md"
      via: "frontmatter version replacement"
      pattern: "version.*replace"
---

<objective>
Issue 085 수정: 스킬 파일 버전 자동 동기화 + quickstart 디스커버리 가이드 추가

Purpose: 스킬 파일 frontmatter version이 수동 관리되어 실제 패키지 버전과 불일치하는 문제 해결 + AI 에이전트가 실행 중인 데몬에 연결하는 방법을 스킬 파일만으로 알 수 있도록 개선
Output: sync-version.mjs 스크립트, 7개 스킬 파일 버전 갱신, quickstart 디스커버리 섹션
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@internal/objectives/issues/085-skill-files-version-sync-and-discovery.md
@packages/skills/package.json
@packages/skills/skills/quickstart.skill.md
@turbo.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: 빌드 시점 버전 자동 주입 스크립트 + prebuild 훅 설정</name>
  <files>
    packages/skills/scripts/sync-version.mjs
    packages/skills/package.json
    turbo.json
  </files>
  <action>
1. `packages/skills/scripts/sync-version.mjs` 생성:
   - `packages/skills/package.json`에서 `version` 필드를 읽음
   - `packages/skills/skills/` 디렉토리의 모든 `.skill.md` 파일을 순회
   - 각 파일의 frontmatter에서 `version: "..."` 패턴을 찾아 package.json 버전으로 교체
   - 변경된 파일만 콘솔에 `SYNC {filename} -> v{version}` 출력
   - ESM 방식 (`import`), `node:fs`, `node:path`, `node:url` 사용

2. `packages/skills/package.json`의 scripts에 prebuild 추가:
   ```json
   "prebuild": "node scripts/sync-version.mjs"
   ```
   기존 "build"과 "clean"은 유지.

3. `turbo.json`에 `@waiaas/skills#build` 태스크 추가:
   - prebuild가 skills 디렉토리 내 `.skill.md` 파일을 수정하므로, outputs에 `skills/**` 추가
   - 다른 패키지에 의존하지 않으므로 `dependsOn: []`
   ```json
   "@waiaas/skills#build": {
     "dependsOn": [],
     "outputs": ["dist/**", "skills/**"]
   }
   ```
  </action>
  <verify>
    `cd /Users/minho.yoo/dev/wallet/WAIaaS && node packages/skills/scripts/sync-version.mjs` 실행 후 모든 .skill.md의 version이 package.json 버전(2.3.0-rc)으로 갱신 확인. `pnpm turbo run build --filter=@waiaas/skills` 빌드 성공 확인.
  </verify>
  <done>
    sync-version.mjs가 7개 스킬 파일의 frontmatter version을 package.json 버전과 동기화. prebuild 훅으로 빌드마다 자동 실행. turbo.json에 skills 패키지 빌드 태스크 등록.
  </done>
</task>

<task type="auto">
  <name>Task 2: quickstart.skill.md에 Connection Discovery 섹션 추가</name>
  <files>
    packages/skills/skills/quickstart.skill.md
  </files>
  <action>
quickstart.skill.md의 "## Base URL" 섹션 바로 위(즉, frontmatter와 첫 설명 문단 사이)에 "## 0. Connection Discovery" 섹션 삽입:

```markdown
## 0. Connection Discovery

Check if the daemon is running and discover existing wallets before starting.

### Health Check

```bash
curl -s http://localhost:3100/health
```

If successful, you get `{"status":"ok", ...}`. If the daemon is not running, start it with `waiaas start`.

### List Existing Wallets (requires masterAuth)

```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'X-Master-Password: <master-password>'
```

This returns all wallets. If wallets already exist, you can skip to Step 3 (Create a Session) using an existing wallet ID.

> **Note**: The master password is the value set during `waiaas init`.
>
> Skill files are API references. For interactive use with an AI agent,
> set up the MCP server (`waiaas mcp setup`) or provide the daemon URL
> and authentication credentials directly.
```

또한 quickstart.skill.md 하단 "## Next Steps" 섹션에 `actions.skill.md`과 `x402.skill.md` 참조 추가 (현재 누락):
- `- **actions.skill.md** -- DeFi action providers: list and execute DeFi actions through the transaction pipeline`
- `- **x402.skill.md** -- x402 auto-payment protocol for fetching paid URLs with cryptocurrency`
  </action>
  <verify>
    quickstart.skill.md에 "## 0. Connection Discovery" 섹션이 존재하고, `/health`와 `/v1/wallets` 엔드포인트 예시가 포함되어 있는지 확인. Next Steps에 7개 스킬 파일 모두 참조되는지 확인.
  </verify>
  <done>
    AI 에이전트가 스킬 파일만으로 실행 중인 데몬을 탐색하고 기존 월렛을 조회할 수 있는 디스커버리 흐름이 quickstart에 포함됨. Next Steps에서 모든 스킬 파일을 참조.
  </done>
</task>

</tasks>

<verification>
1. `node packages/skills/scripts/sync-version.mjs` -- 7개 파일 모두 SYNC 출력 (첫 실행)
2. `grep -r 'version:' packages/skills/skills/*.skill.md` -- 모든 파일이 동일한 버전
3. `pnpm turbo run build --filter=@waiaas/skills` -- 빌드 성공
4. `grep 'Connection Discovery' packages/skills/skills/quickstart.skill.md` -- 디스커버리 섹션 존재
5. `pnpm turbo run typecheck --filter=@waiaas/skills` -- 타입 체크 통과
</verification>

<success_criteria>
- 7개 스킬 파일의 frontmatter version이 모두 packages/skills/package.json 버전과 일치
- prebuild 스크립트가 빌드 시 자동 실행되어 향후 release-please 버전 업 시 자동 동기화
- quickstart.skill.md에 Connection Discovery 흐름이 포함되어 데몬 탐색 가능
- turbo.json에 skills 빌드 태스크가 등록되어 캐시 무효화 정상 동작
</success_criteria>

<output>
After completion, create `.planning/quick/5-issue-085/5-SUMMARY.md`
</output>
