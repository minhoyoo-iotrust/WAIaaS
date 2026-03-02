# Phase 301: MCP + CLI + SDK + Admin UI + Skill Files

## Goal
모든 통합 계층(MCP, CLI, SDK, Admin UI, Skill Files)이 새 세션 점진적 보안 모델을 올바르게 반영하여, 사용자가 어떤 인터페이스에서든 무제한/유한 세션을 일관되게 생성하고 관리할 수 있다

## Requirements Coverage
MCP-01, MCP-02, CLI-01, CLI-02, CLI-03, ADUI-01, ADUI-02, ADUI-03, SDK-01, SDK-02, SKIL-01

## Plans

### Plan 301-1: MCP SessionManager Unlimited Session Support

**Files:**
- `packages/mcp/src/session-manager.ts` — applyToken(), start() 수정

**Changes:**

1. **applyToken()** (MCP-01): exp 클레임 없는 JWT 수용
   - 현재: `typeof exp !== 'number'` → state='error' (line 177)
   - 변경: exp가 undefined이면 무제한 세션으로 처리
   ```typescript
   const exp = payload['exp'];
   if (exp !== undefined) {
     if (typeof exp !== 'number') {
       this.state = 'error';
       return false;
     }
     // Existing range validation (C-03)
     const tenYears = 10 * 365 * 24 * 60 * 60;
     const oneYear = 365 * 24 * 60 * 60;
     if (exp < now - tenYears || exp > now + oneYear) {
       this.state = 'error';
       return false;
     }
     this.expiresAt = exp;
     if (exp < now) {
       this.state = 'expired';
       return false;
     }
   } else {
     // No exp claim → unlimited session
     this.expiresAt = 0;
   }
   this.state = 'active';
   return true;
   ```

2. **start()** (MCP-02): 무제한 세션에 갱신 스케줄링 건너뛰기
   ```typescript
   if (this.state === 'active') {
     if (this.expiresAt > 0) {
       this.scheduleRenewal();
       console.error(`${LOG_PREFIX} Started with active session, renewal scheduled`);
     } else {
       console.error(`${LOG_PREFIX} Started with unlimited session, no renewal needed`);
     }
   }
   ```

**Verification:** 기존 36개 테스트 통과 + 무제한 세션 테스트 (Plan 301-6)

---

### Plan 301-2: CLI Flag Rename + Default Unlimited

**Files:**
- `packages/cli/src/index.ts` — --expires-in → --ttl, 기본값 제거
- `packages/cli/src/commands/mcp-setup.ts` — expiresIn → ttl, 기본 무제한, API 필드명 수정
- `packages/cli/src/commands/session.ts` — expiresIn → ttl
- `packages/cli/src/commands/quickstart.ts` — expiresIn → ttl, 기본 무제한

**Changes:**

1. **CLI index.ts — 플래그 리네이밍**:
   - `--expires-in <seconds>` → `--ttl <seconds>` (3곳: mcp setup, quickset/quickstart, session prompt)
   - 기본값 `'86400'` → 제거 (undefined = 무제한)
   - `--max-renewals <count>` 플래그 추가 (optional)
   - `--lifetime <seconds>` 플래그 추가 (optional)

2. **mcp-setup.ts — 무제한 기본 + API 필드명 수정**:
   - `McpSetupOptions`: `expiresIn?` → `ttl?`, `maxRenewals?`, `absoluteLifetime?` 추가
   - `setupWallet()`: body에 `expiresIn` → `ttl` 전송, maxRenewals/absoluteLifetime도 전송
   - 기본값: `const expiresIn = opts.expiresIn ?? 86400` 제거 → ttl이 undefined면 body에 ttl 포함 안 함
   - 24시간 경고 메시지 제거 (더 이상 기본이 24시간이 아님)
   - 무제한 세션이면 "Session created (unlimited, no expiration)" 출력

3. **session.ts — expiresIn 리네이밍**:
   - `SessionPromptOptions`: `expiresIn?` → `ttl?`
   - body 조건: `if (opts.expiresIn) body.ttl = opts.expiresIn` → `if (opts.ttl) body.ttl = opts.ttl`
   - 만료 표시: expiresAt === 0이면 "Expires: Never (unlimited)" 출력

4. **quickstart.ts — 무제한 기본**:
   - `QuickstartOptions`: `expiresIn?` → `ttl?`
   - `const ttl = opts.expiresIn ?? 2592000` → `const ttl = opts.ttl` (undefined = 무제한)
   - body에 ttl이 undefined면 ttl 필드 포함 안 함

**Verification:** `pnpm turbo run typecheck --filter=@waiaas/cli` 통과

---

### Plan 301-3: Admin UI Session Settings Removal + Create Modal Advanced Section

**Files:**
- `packages/admin/src/pages/sessions.tsx` — SESSION_KEYS에서 3개 제거, Create Session 모달 Advanced 추가
- `packages/admin/src/utils/settings-search-index.ts` — 3개 엔트리 제거
- `packages/admin/src/utils/settings-helpers.ts` — 3개 라벨 제거

**Changes:**

1. **SESSION_KEYS 수정** (ADUI-01):
   - 제거: `security.session_ttl`, `security.session_absolute_lifetime`, `security.session_max_renewals`
   - 유지: `security.max_sessions_per_wallet`, `security.max_pending_tx`, `security.rate_limit_session_rpm`, `security.rate_limit_tx_rpm`

2. **SessionSettingsTab — Lifetime FieldGroup 축소** (ADUI-01):
   - session_ttl, session_absolute_lifetime, session_max_renewals 3개 FormField 제거
   - max_sessions_per_wallet만 유지하여 "Limits" FieldGroup으로 리네이밍
   - Rate Limits FieldGroup은 유지

3. **Create Session 모달 — Advanced 섹션 추가** (ADUI-02):
   - 기존 wallet 선택 아래에 접힌(collapsed) Advanced 섹션 추가
   - 토글 버튼: "Advanced Options" (클릭 시 펼침/접힘)
   - 필드 3개:
     - TTL (days): number input, min=0, placeholder="Unlimited" — 값 × 86400 초 변환
     - Max Renewals: number input, min=0, placeholder="Unlimited" — 0 = 무제한
     - Absolute Lifetime (days): number input, min=0, placeholder="Unlimited" — 값 × 86400 초 변환
   - handleCreate에서 body에 ttl/maxRenewals/absoluteLifetime 포함 (값이 있을 때만)

4. **Session 리스트 표시** (ADUI-03):
   - expiresAt === 0 → "Never" 표시 (기존 날짜 표시 대신)

5. **settings-search-index.ts**:
   - `sessions.settings.session_ttl`, `sessions.settings.session_absolute_lifetime`, `sessions.settings.session_max_renewals` 3개 엔트리 제거

6. **settings-helpers.ts**:
   - `session_ttl`, `session_absolute_lifetime`, `session_max_renewals` 3개 라벨 매핑 제거

**Verification:** `pnpm turbo run typecheck --filter=@waiaas/admin` 통과

---

### Plan 301-4: SDK expiresIn → ttl Rename + New Params

**Files:**
- `packages/sdk/src/types.ts` — CreateSessionParams 수정
- `packages/sdk/src/client.ts` — createSession() body 필드 수정

**Changes:**

1. **CreateSessionParams** (SDK-01):
   ```typescript
   export interface CreateSessionParams {
     walletIds?: string[];
     walletId?: string;
     /** Session TTL in seconds (omit for unlimited session) */
     ttl?: number;
     /** Maximum number of renewals (0 = unlimited) */
     maxRenewals?: number;
     /** Absolute session lifetime in seconds (0 = unlimited) */
     absoluteLifetime?: number;
     constraints?: Record<string, unknown>;
     source?: 'api' | 'mcp';
   }
   ```

2. **createSession() body 수정** (SDK-02):
   ```typescript
   if (params.ttl !== undefined) body['ttl'] = params.ttl;
   if (params.maxRenewals !== undefined) body['maxRenewals'] = params.maxRenewals;
   if (params.absoluteLifetime !== undefined) body['absoluteLifetime'] = params.absoluteLifetime;
   ```
   - `params.expiresIn` 참조 모두 제거

**Verification:** `pnpm turbo run typecheck --filter=@waiaas/sdk` 통과

---

### Plan 301-5: Core Config Schema Cleanup

**Files:**
- `packages/core/src/schemas/config.schema.ts` — 4개 세션 필드 제거

**Changes:**

1. **ConfigSchema에서 제거**:
   - `session_default_ttl` 제거
   - `session_max_ttl` 제거
   - `session_max_renewals` 제거
   - `session_absolute_lifetime` 제거

2. **Config type 자동 업데이트**: Zod infer로 자동 반영

**Verification:** `pnpm turbo run typecheck` 전체 통과 (config 참조 없음 확인 — Phase 300에서 daemon config에서 이미 제거)

---

### Plan 301-6: Tests

**Files:**
- `packages/mcp/src/__tests__/session-manager.test.ts` — 무제한 세션 테스트 추가
- `packages/cli/src/__tests__/mcp-setup.test.ts` — ttl 플래그 테스트 수정
- `packages/cli/src/__tests__/quickstart.test.ts` — ttl 테스트 수정
- `packages/admin/src/__tests__/sessions.test.tsx` — Settings Tab 테스트 수정

**Test Cases:**

1. **MCP SessionManager (무제한 세션)**:
   - applyToken: JWT에 exp 없음 → expiresAt=0, state='active'
   - start(): 무제한 세션 → scheduleRenewal() 호출 안 됨
   - getToken(): 무제한 세션에서 토큰 반환 성공
   - recovery poll: 무제한 JWT 파일 → state='active' 복구

2. **CLI mcp-setup**:
   - --ttl 없으면 body에 ttl 포함 안 됨 (무제한)
   - --ttl 7200 → body.ttl = 7200 (expiresIn이 아닌 ttl)
   - --max-renewals, --lifetime 플래그 전달 확인
   - 무제한 세션 출력 메시지 확인

3. **CLI quickstart**:
   - 기본 ttl 없음 (무제한)
   - body에 ttl 필드 미포함 확인

4. **Admin UI Sessions Settings Tab**:
   - Settings Tab에서 session_ttl/absolute_lifetime/max_renewals 필드 미렌더링
   - max_sessions_per_wallet 필드는 유지
   - Create Session 모달 Advanced 섹션 존재 확인

**Verification:** `pnpm turbo run test --filter=@waiaas/mcp --filter=@waiaas/cli --filter=@waiaas/admin` 통과

---

### Plan 301-7: Skill Files Update

**Files:**
- `skills/quickstart.skill.md` — 세션 생성 예제 업데이트
- `skills/admin.skill.md` — POST /v1/sessions 파라미터 업데이트
- `skills/session-recovery.skill.md` — 무제한 세션 설명 추가

**Changes:**

1. **quickstart.skill.md** (SKIL-01):
   - Step 3 세션 생성 예제: `"ttl": 2592000` → ttl 필드 생략 (무제한) 또는 ttl 옵션 설명
   - 무제한 세션이 기본임을 명시

2. **admin.skill.md** (SKIL-01):
   - POST /v1/sessions 파라미터: `expiresIn?` → `ttl?`, `maxRenewals?`, `absoluteLifetime?` 추가
   - 응답 expiresAt=0 설명 추가

3. **session-recovery.skill.md** (SKIL-01):
   - 무제한 세션 관련 내용 추가: RENEWAL_NOT_REQUIRED 에러 설명
   - 기본 TTL "30일" → "무제한" 업데이트
   - maxRenewals 기본값 업데이트

**Verification:** CLAUDE.md의 스킬 파일 보안 공지 포함 확인

## Execution Order

301-5 → 301-4 → 301-1 → 301-2 → 301-3 → 301-6 → 301-7

Plan 5(core schema)가 먼저, 그 다음 SDK(4), MCP(1), CLI(2), Admin UI(3) 순.
Plan 6(테스트)은 코드 변경 후, Plan 7(스킬 파일)은 마지막.

## Success Criteria Verification

| Criterion | Plan | Verification |
|-----------|------|-------------|
| 1. MCP SessionManager: exp 없는 JWT 수용, 무제한 세션 갱신 건너뜀 | 301-1, 301-6 | MCP 테스트 |
| 2. CLI mcp setup: 기본 무제한, --ttl/--max-renewals/--lifetime 플래그 | 301-2, 301-6 | CLI 테스트 |
| 3. Admin UI: 3개 키 제거, Create 모달 Advanced 섹션 | 301-3, 301-6 | Admin 테스트 |
| 4. SDK: expiresIn→ttl, maxRenewals/absoluteLifetime 추가 | 301-4 | typecheck |
| 5. Skill files 업데이트 | 301-7 | 내용 확인 |
