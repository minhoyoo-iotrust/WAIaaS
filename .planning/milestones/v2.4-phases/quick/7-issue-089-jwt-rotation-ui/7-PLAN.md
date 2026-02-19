---
phase: quick-7
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/admin/src/pages/security.tsx
  - packages/admin/src/pages/settings.tsx
  - packages/admin/src/__tests__/settings-coverage.test.tsx
autonomous: true
requirements: [ISSUE-089]

must_haves:
  truths:
    - "Security 페이지 JWT 탭이 'Invalidate Sessions'으로 표시된다"
    - "JWT 섹션 제목이 'Invalidate All Session Tokens'으로 표시된다"
    - "버튼과 모달이 사용자 관점의 결과(세션 토큰 무효화)를 설명한다"
    - "Settings 레거시 페이지에도 동일한 텍스트가 적용된다"
    - "기존 테스트가 새 텍스트로 업데이트되어 통과한다"
  artifacts:
    - path: "packages/admin/src/pages/security.tsx"
      provides: "Updated JWT rotation UI text (security page)"
      contains: "Invalidate All Session Tokens"
    - path: "packages/admin/src/pages/settings.tsx"
      provides: "Updated JWT rotation UI text (legacy settings page)"
      contains: "Invalidate All Session Tokens"
    - path: "packages/admin/src/__tests__/settings-coverage.test.tsx"
      provides: "Updated test assertions matching new text"
      contains: "Invalidate All Tokens"
  key_links:
    - from: "packages/admin/src/__tests__/settings-coverage.test.tsx"
      to: "packages/admin/src/pages/settings.tsx"
      via: "text matching assertions"
      pattern: "Invalidate All Tokens"
---

<objective>
Issue 089 수정: Admin UI JWT Rotation 기능의 명칭/설명을 내부 구현 용어에서 사용자 관점 용어로 변경.

Purpose: 사용자가 "JWT Secret Rotation"이라는 내부 메커니즘 용어 대신, 실제 효과(모든 세션 토큰 무효화)를 직관적으로 이해할 수 있도록 텍스트를 개선한다.
Output: security.tsx, settings.tsx, settings-coverage.test.tsx 텍스트 변경 완료.
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@internal/objectives/issues/089-jwt-rotation-ui-text-clarity.md
@packages/admin/src/pages/security.tsx
@packages/admin/src/pages/settings.tsx
@packages/admin/src/__tests__/settings-coverage.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update JWT rotation UI text in security.tsx and settings.tsx</name>
  <files>
    packages/admin/src/pages/security.tsx
    packages/admin/src/pages/settings.tsx
  </files>
  <action>
    Apply the following text replacements in BOTH files per the issue specification:

    **security.tsx:**
    1. Line 30: Tab label `'JWT Rotation'` -> `'Invalidate Sessions'`
    2. Line 403: Section heading `JWT Secret Rotation` -> `Invalidate All Session Tokens`
    3. Line 404: Section description `Invalidate all existing JWT tokens. Old tokens remain valid for 5 minutes.` -> `Revoke all active session tokens by rotating the signing key. Existing tokens remain valid for 5 minutes, then all wallets must create new sessions.`
    4. Line 408: Button text `Rotate JWT Secret` -> `Invalidate All Tokens`
    5. Line 416: Modal title `Rotate JWT Secret` -> `Invalidate All Session Tokens`
    6. Lines 424-426: Modal body text -> `This will rotate the signing key and invalidate all active session tokens after 5 minutes. Every wallet will need to create a new session to continue API access. Use this when a token may have been compromised.`
    7. Line 419: Modal confirmText `Rotate` -> `Invalidate`
    8. Line 390: Success toast `JWT secret rotated. Old tokens valid for 5 minutes.` -> `All session tokens invalidated. Old tokens remain valid for 5 minutes.`

    **settings.tsx:**
    1. Line 1103: Section heading `JWT Secret Rotation` -> `Invalidate All Session Tokens`
    2. Line 1104: Section description -> same new description as security.tsx
    3. Line 1108: Button text `Rotate JWT Secret` -> `Invalidate All Tokens`
    4. Line 1128: Modal title `Rotate JWT Secret` -> `Invalidate All Session Tokens`
    5. Lines 1136-1138: Modal body text -> same new body text as security.tsx
    6. Line 1132: Modal confirmText `Rotate` -> `Invalidate`
    7. Line 279: Success toast `JWT secret rotated. Old tokens valid for 5 minutes.` -> `All session tokens invalidated. Old tokens remain valid for 5 minutes.`

    Keep the comment "// JWT Rotation Tab" and "/* JWT Rotation Confirmation Modal */" as-is since these are code comments (not user-facing) and help with code navigation.
  </action>
  <verify>
    `grep -n "Rotate JWT Secret" packages/admin/src/pages/security.tsx packages/admin/src/pages/settings.tsx` returns no results.
    `grep -n "Invalidate All Session Tokens" packages/admin/src/pages/security.tsx packages/admin/src/pages/settings.tsx` returns matches in both files.
    `pnpm --filter @waiaas/admin run typecheck` passes.
  </verify>
  <done>
    Both security.tsx and settings.tsx use the new user-facing text per issue 089 specification. No internal implementation terms visible to users.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update test assertions in settings-coverage.test.tsx</name>
  <files>
    packages/admin/src/__tests__/settings-coverage.test.tsx
  </files>
  <action>
    Update the "Settings coverage: handleRotate" test suite (lines 523-591) to use new text strings:

    1. Lines 533, 558, 575: `screen.getByText('Rotate JWT Secret')` -> `screen.getByText('Invalidate All Tokens')` (this is the button text that opens the modal)
    2. Line 536: The modal body assertion text -> Update to match the new modal body: `'This will rotate the signing key and invalidate all active session tokens after 5 minutes. Every wallet will need to create a new session to continue API access. Use this when a token may have been compromised.'`
    3. Line 541: `screen.getByText('Rotate')` (the confirm button) -> `screen.getByText('Invalidate')`
    4. Line 547: Success toast assertion `'JWT secret rotated. Old tokens valid for 5 minutes.'` -> `'All session tokens invalidated. Old tokens remain valid for 5 minutes.'`
    5. Line 563: `screen.getByText('Rotate')` -> `screen.getByText('Invalidate')`
    6. Line 564: Same confirm button click update
    7. Line 579: `screen.getByText('Rotate')` confirm button -> `screen.getByText('Invalidate')`
    8. Line 588: `screen.queryByText('Are you sure you want to rotate the JWT secret?')` -> update to query new modal body text (use a substring via regex to avoid fragile full-text match)
  </action>
  <verify>
    `pnpm --filter @waiaas/admin run test -- --run settings-coverage` passes.
  </verify>
  <done>
    All test assertions match the new UI text. Test suite passes without failures.
  </done>
</task>

</tasks>

<verification>
1. `grep -rn "Rotate JWT Secret" packages/admin/src/` returns no results (old text fully removed from user-facing strings)
2. `grep -rn "JWT Secret Rotation" packages/admin/src/pages/` returns no results
3. `grep -rn "Invalidate All Session Tokens" packages/admin/src/pages/` returns matches in both security.tsx and settings.tsx
4. `pnpm --filter @waiaas/admin run typecheck` passes
5. `pnpm --filter @waiaas/admin run test -- --run settings-coverage` passes
</verification>

<success_criteria>
- security.tsx: Tab label = "Invalidate Sessions", heading = "Invalidate All Session Tokens", button = "Invalidate All Tokens", modal = new user-facing text, toast = new text
- settings.tsx: Same text changes applied to the legacy JWT section and modal
- settings-coverage.test.tsx: All assertions updated and passing
- No remaining "Rotate JWT Secret" or "JWT Secret Rotation" in user-facing strings
</success_criteria>

<output>
After completion, create `.planning/quick/7-issue-089-jwt-rotation-ui/7-SUMMARY.md`
</output>
