---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/release.yml
autonomous: true
requirements: [ISSUE-093]

must_haves:
  truths:
    - "deploy 잡에서 npm publish 전에 루트 README.md가 8개 패키지 디렉토리로 복사된다"
    - "publish-check 잡에서도 dry-run 전에 동일하게 README가 복사되어 검증 가능하다"
    - "로컬 개발 환경에 영향 없다 (CI에서만 복사)"
  artifacts:
    - path: ".github/workflows/release.yml"
      provides: "README copy step in deploy and publish-check jobs"
      contains: "Copy root README to packages"
  key_links:
    - from: "README.md (root)"
      to: "packages/*/README.md"
      via: "cp command in CI step"
      pattern: 'cp README\.md'
---

<objective>
Issue 093 수정: release.yml의 deploy 잡과 publish-check 잡에 루트 README.md를 8개 패키지 디렉토리로 복사하는 스텝을 추가하여, npm publish 시 각 패키지에 README가 포함되도록 한다.

Purpose: npmjs.com 패키지 페이지에 README가 표시되어야 사용자가 패키지 사용법을 확인할 수 있다.
Output: 수정된 release.yml
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.github/workflows/release.yml
@internal/objectives/issues/093-npm-packages-missing-readme.md
@README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: release.yml에 README 복사 스텝 추가</name>
  <files>.github/workflows/release.yml</files>
  <action>
release.yml에서 두 곳에 "Copy root README to packages" 스텝을 추가한다.

1. **publish-check 잡**: "Build" 스텝 다음, "Verify Admin UI in daemon" 스텝 직전에 추가.
2. **deploy 잡**: "Build" 스텝 다음, "Ensure npm >= 11.5.1" 스텝 직전에 추가.

두 곳 모두 동일한 스텝 내용을 사용:

```yaml
      - name: Copy root README to packages
        run: |
          PACKAGES=(
            packages/core
            packages/daemon
            packages/cli
            packages/sdk
            packages/mcp
            packages/skills
            packages/adapters/solana
            packages/adapters/evm
          )
          for pkg_path in "${PACKAGES[@]}"; do
            cp README.md "$pkg_path/README.md"
            echo "Copied README.md -> $pkg_path/README.md"
          done
```

PACKAGES 배열은 이미 두 잡에서 사용하는 것과 동일한 8개 패키지 경로이다.
admin 패키지는 npm에 발행하지 않으므로 포함하지 않는다.

주의사항:
- 기존 PACKAGES 배열이 사용되는 publish 스텝과 별도의 스텝으로 추가 (publish 루프 내부가 아닌 독립 스텝)
- `$GITHUB_WORKSPACE` 기준이므로 루트 README.md 경로는 그대로 사용 가능
  </action>
  <verify>
yaml 문법 확인:
```
npx yaml-lint .github/workflows/release.yml || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
```

스텝 위치 확인: publish-check 잡에서 Build 다음/Verify Admin UI 전, deploy 잡에서 Build 다음/Ensure npm 전에 "Copy root README to packages" 스텝이 있는지 확인.
  </verify>
  <done>
release.yml의 publish-check 잡과 deploy 잡 모두에 "Copy root README to packages" 스텝이 Build 이후, publish 관련 스텝 이전에 위치한다.
  </done>
</task>

<task type="auto">
  <name>Task 2: 이슈 상태 업데이트 및 TRACKER 반영</name>
  <files>internal/objectives/issues/093-npm-packages-missing-readme.md, internal/objectives/issues/TRACKER.md</files>
  <action>
1. `internal/objectives/issues/093-npm-packages-missing-readme.md`에서 상태를 OPEN -> RESOLVED로 변경.
2. `internal/objectives/issues/TRACKER.md`에서 093 항목의 상태를 RESOLVED로 업데이트.
  </action>
  <verify>
grep으로 093 이슈의 상태가 RESOLVED인지 확인:
```
grep -A1 "093" internal/objectives/issues/TRACKER.md
grep "RESOLVED" internal/objectives/issues/093-npm-packages-missing-readme.md
```
  </verify>
  <done>
093 이슈 파일의 상태가 RESOLVED이고 TRACKER.md에도 반영되어 있다.
  </done>
</task>

</tasks>

<verification>
1. release.yml YAML 문법이 유효하다
2. publish-check 잡에 "Copy root README to packages" 스텝이 존재한다
3. deploy 잡에 "Copy root README to packages" 스텝이 존재한다
4. 8개 패키지 경로가 모두 포함되어 있다 (core, daemon, cli, sdk, mcp, skills, adapters/solana, adapters/evm)
5. 복사 스텝이 Build 이후, publish/dry-run 이전에 위치한다
</verification>

<success_criteria>
- release.yml에 README 복사 스텝이 publish-check와 deploy 잡 모두에 추가됨
- 다음 릴리스 시 npm 패키지에 README.md가 포함되어 npmjs.com에 표시됨
- 이슈 093 상태가 RESOLVED로 업데이트됨
</success_criteria>

<output>
After completion, create `.planning/quick/2-issue-093-npm-readme/2-SUMMARY.md`
</output>
