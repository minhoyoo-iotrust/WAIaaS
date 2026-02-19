---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - packages/core/package.json
  - packages/daemon/package.json
  - packages/cli/package.json
  - packages/sdk/package.json
  - packages/mcp/package.json
  - packages/admin/package.json
  - packages/skills/package.json
  - packages/adapters/solana/package.json
  - packages/adapters/evm/package.json
autonomous: true
requirements: [ISSUE-092]

must_haves:
  truths:
    - "All package.json homepage URLs point to minhoyoo-iotrust/WAIaaS"
    - "All package.json have bugs.url pointing to correct issues URL"
    - "repository.url remains correct (already correct, no regression)"
  artifacts:
    - path: "package.json"
      provides: "Root package metadata with correct homepage and bugs URL"
      contains: "minhoyoo-iotrust/WAIaaS"
    - path: "packages/core/package.json"
      provides: "Core package metadata with correct homepage and bugs URL"
      contains: "minhoyoo-iotrust/WAIaaS"
  key_links:
    - from: "all package.json files"
      to: "https://github.com/minhoyoo-iotrust/WAIaaS"
      via: "homepage and bugs.url fields"
      pattern: "minhoyoo-iotrust/WAIaaS"
---

<objective>
Issue 092 수정: 모든 package.json의 homepage URL을 올바른 GitHub 리포지토리 URL로 수정하고, bugs.url 필드도 추가하여 npm 패키지 페이지에서 리포지토리 및 이슈 트래커에 정상 접근 가능하게 함.

Purpose: npmjs.com 패키지 페이지에서 Homepage/Repository/Bug Tracker 링크가 모두 정상 동작하도록 보장
Output: 10개 package.json 파일의 메타데이터 URL 수정
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@internal/objectives/issues/092-npm-package-metadata-urls.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix homepage and add bugs URL in all package.json files</name>
  <files>
    package.json
    packages/core/package.json
    packages/daemon/package.json
    packages/cli/package.json
    packages/sdk/package.json
    packages/mcp/package.json
    packages/admin/package.json
    packages/skills/package.json
    packages/adapters/solana/package.json
    packages/adapters/evm/package.json
  </files>
  <action>
    In ALL 10 package.json files, make the following changes:

    1. **Fix `homepage` field** — change from the wrong URL to the correct one:
       - Wrong: `"https://github.com/minho-yoo/waiaas#readme"`
       - Correct: `"https://github.com/minhoyoo-iotrust/WAIaaS#readme"`
       - For root package.json: ADD the homepage field (currently missing) with the correct URL.

    2. **Add `bugs` field** — add to all 10 files (none currently have it):
       ```json
       "bugs": {
         "url": "https://github.com/minhoyoo-iotrust/WAIaaS/issues"
       }
       ```

    3. **Verify `repository.url` unchanged** — confirm each file still has:
       `"url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git"`
       (already correct, do NOT change)

    Place `homepage` and `bugs` near the `repository` field for JSON readability/consistency.
  </action>
  <verify>
    Run the following validation commands:
    - `node -e "const fs=require('fs');const g=require('glob');const files=['package.json','packages/core/package.json','packages/daemon/package.json','packages/cli/package.json','packages/sdk/package.json','packages/mcp/package.json','packages/admin/package.json','packages/skills/package.json','packages/adapters/solana/package.json','packages/adapters/evm/package.json'];let ok=true;files.forEach(f=>{const p=JSON.parse(fs.readFileSync(f,'utf8'));if(!p.homepage||!p.homepage.includes('minhoyoo-iotrust/WAIaaS')){console.error('BAD homepage:',f);ok=false}if(!p.bugs||!p.bugs.url||!p.bugs.url.includes('minhoyoo-iotrust/WAIaaS')){console.error('BAD bugs:',f);ok=false}if(!p.repository||!p.repository.url||!p.repository.url.includes('minhoyoo-iotrust/WAIaaS')){console.error('BAD repo:',f);ok=false}});if(ok)console.log('ALL 10 files OK');else process.exit(1)"`
    - Verify NO file contains the old URL: `grep -r "minho-yoo/waiaas" package.json packages/*/package.json packages/adapters/*/package.json` should return empty
  </verify>
  <done>
    All 10 package.json files have:
    - homepage: "https://github.com/minhoyoo-iotrust/WAIaaS#readme"
    - bugs.url: "https://github.com/minhoyoo-iotrust/WAIaaS/issues"
    - repository.url: "git+https://github.com/minhoyoo-iotrust/WAIaaS.git" (unchanged)
    No file contains the old "minho-yoo/waiaas" URL pattern.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update issue 092 status and TRACKER</name>
  <files>
    internal/objectives/issues/092-npm-package-metadata-urls.md
    internal/objectives/issues/TRACKER.md
  </files>
  <action>
    1. In `092-npm-package-metadata-urls.md`: Change status from OPEN to RESOLVED. Add resolution date 2026-02-19.
    2. In `TRACKER.md`: Update issue 092 status to RESOLVED.
  </action>
  <verify>
    - `grep "RESOLVED" internal/objectives/issues/092-npm-package-metadata-urls.md` returns match
    - `grep "092.*RESOLVED" internal/objectives/issues/TRACKER.md` returns match
  </verify>
  <done>
    Issue 092 marked RESOLVED in both the issue file and TRACKER.
  </done>
</task>

</tasks>

<verification>
1. `grep -r "minho-yoo/waiaas" package.json packages/*/package.json packages/adapters/*/package.json` returns no results
2. All 10 package.json files have correct homepage, bugs, and repository URLs
3. Issue 092 marked RESOLVED
</verification>

<success_criteria>
- Zero occurrences of "minho-yoo/waiaas" across all package.json files
- All 10 files have homepage pointing to minhoyoo-iotrust/WAIaaS#readme
- All 10 files have bugs.url pointing to minhoyoo-iotrust/WAIaaS/issues
- Issue 092 status is RESOLVED in tracker
</success_criteria>

<output>
After completion, create `.planning/quick/3-issue-092-npm-homepage-repository-url/3-SUMMARY.md`
</output>
