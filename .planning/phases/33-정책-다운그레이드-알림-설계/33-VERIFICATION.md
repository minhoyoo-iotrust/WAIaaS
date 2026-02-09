---
phase: 33-정책-다운그레이드-알림-설계
verified: 2026-02-08T23:39:01Z
status: passed
score: 5/5 must-haves verified
---

# Phase 33: 정책 다운그레이드 알림 설계 Verification Report

**Phase Goal:** Owner 없는 에이전트의 APPROVAL 거래가 차단 없이 DELAY로 다운그레이드되어 실행되고, 알림에 Owner 등록 안내가 포함되는 설계가 완성된다

**Verified:** 2026-02-08T23:39:01Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | evaluate() Step 9 이후 APPROVAL->DELAY 다운그레이드 삽입 지점과 로직이 명세되어 있다 | ✓ VERIFIED | 33-time-lock-approval-mechanism.md 섹션 11.6에 Step 9.5 삽입 지점 명시. "Step 9: SPENDING_LIMIT → Step 9.5: APPROVAL->DELAY 다운그레이드 → Step 10: APPROVE_TIER_OVERRIDE" 순서 확인. 의사코드 포함 (라인 2437-2457) |
| 2 | PolicyDecision에 downgraded 플래그와 originalTier가 포함되어 알림 분기 조건이 명세되어 있다 | ✓ VERIFIED | 33-time-lock-approval-mechanism.md 라인 2451-2452, 2471: `downgraded: true, originalTier: 'APPROVAL'` 설정. Stage 4에서 알림 분기 로직 (라인 2669-2675): `decision.downgraded ? 'TX_DOWNGRADED_DELAY' : 'TX_DELAY_QUEUED'` |
| 3 | Owner 등록 후 동일 금액 거래가 정상 APPROVAL로 처리되는 흐름이 명세되어 있다 | ✓ VERIFIED | 33-time-lock-approval-mechanism.md 섹션 11.7 "Owner LOCKED 후 정상 APPROVAL 복원 흐름" (라인 2521-2549). 5단계 흐름: Owner 등록 → ownerAuth 검증 → LOCKED → 대액 거래 → Step 9.5 스킵 → 정상 APPROVAL. 비교 테이블 포함 (라인 2598-2602) |
| 4 | 다운그레이드 알림 템플릿에 Owner 등록 CLI 안내 메시지가 포함되어 있다 | ✓ VERIFIED | 35-notification-architecture.md 라인 451, 468, 486, 506: Telegram/Discord/ntfy 3채널 모두 `waiaas agent set-owner {agentName} <address>` 포함. 차이점 테이블 (라인 447-452)에서 TX_DELAY_QUEUED vs TX_DOWNGRADED_DELAY 구분 명시 |
| 5 | Owner 있는 에이전트의 APPROVAL 대기 알림에 [승인]/[거부] 버튼이 채널별로 명세되어 있다 | ✓ VERIFIED | 35-notification-architecture.md 섹션 11.2.3.2 [v0.8] TX_APPROVAL_REQUEST 승인/거부 버튼 확장 (라인 2036-2136). Telegram InlineKeyboard url 버튼 (라인 2066-2069), Discord Embed markdown 링크 (라인 2091), ntfy.sh Actions view (라인 2110) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/deliverables/33-time-lock-approval-mechanism.md` | Step 9.5 다운그레이드 로직, evaluateBatch 다운그레이드, evaluate 시그니처 확장, 감사 로그, 정상 APPROVAL 복원 흐름 | ✓ VERIFIED | Exists (2838 lines), substantive (complex policy logic), wired (referenced from 32-transaction-pipeline, 35-notification). Contains all 5 required sections: 11.6 Step 9.5, 11.5 evaluateBatch (line 2336+), 3.2 시그니처 확장 (agentOwnerInfo optional param), 8.3 TX_DOWNGRADED 감사 로그 (line 2066), 11.7 LOCKED 복원 흐름 (line 2517+) |
| `.planning/deliverables/35-notification-architecture.md` | TX_DOWNGRADED_DELAY 이벤트, 3채널 다운그레이드 템플릿, APPROVAL 승인/거부 버튼 3채널 | ✓ VERIFIED | Exists (2599 lines), substantive (comprehensive notification architecture), wired (referenced from 33-time-lock). Contains: NotificationEventType enum with TX_DOWNGRADED_DELAY (line 210), 심각도 매핑 (line 249), 호출 포인트 (line 73), 3채널 템플릿 (Telegram line 454-473, Discord 476-492, ntfy 494-508), 3채널 승인/거부 버튼 (Telegram 2048-2072, Discord 2078-2102, ntfy 2104-2122) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| evaluate() Step 9.5 | resolveOwnerState() | OwnerState 산출 | ✓ WIRED | Line 2440, 2661: `const ownerState = resolveOwnerState(ownerInfo)` called in Step 9.5. Function defined in section 12 (line 2729+). NONE/GRACE pattern confirmed (line 2441, 2464) |
| evaluate() Step 9.5 | PolicyDecision.downgraded | 다운그레이드 플래그 설정 | ✓ WIRED | Line 2451-2452: `downgraded: true, originalTier: 'APPROVAL'` set in return statement. Referenced in Stage 4 (line 2646, 2670) |
| evaluateBatch() | Step 9.5 | 합산 티어 다운그레이드 | ✓ WIRED | Line 2367-2379: evaluateBatch() applies Step 9.5 to sumTierDecision. Comment confirms: "[v0.8] maxTier 결과에도 Step 9.5 다운그레이드 적용" (line 2367) |
| Stage 4 (downgraded === true) | NotificationService.notify(TX_DOWNGRADED_DELAY) | 알림 이벤트 분기 | ✓ WIRED | 33-time-lock line 2669-2675: `const notifEvent = decision.downgraded ? 'TX_DOWNGRADED_DELAY' : 'TX_DELAY_QUEUED'`. Notification call with event type branching confirmed |
| Stage 4 (tier === APPROVAL, LOCKED) | NotificationService.notify(TX_APPROVAL_REQUEST) | APPROVAL 승인 요청 알림 | ✓ WIRED | 35-notification line 74-75: TX_APPROVAL_REQUEST triggered when `decision.tier === 'APPROVAL' && !decision.downgraded (OwnerState LOCKED만)`. Precondition stated in line 2038 |
| Telegram InlineKeyboardMarkup | 승인 URL (127.0.0.1:3100) | url 기반 버튼 | ✓ WIRED | 35-notification line 2066-2069: InlineKeyboard with url type (not callback_data). approve/reject URLs include nonce (line 2042-2043) |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| POLICY-01: Owner 없는 에이전트의 APPROVAL이 DELAY로 다운그레이드되어 실행 | ✓ SATISFIED | None — Step 9.5 logic handles NONE/GRACE downgrade |
| POLICY-02: downgraded 플래그로 알림 분기 조건 제공 | ✓ SATISFIED | None — PolicyDecision.downgraded: true, originalTier: 'APPROVAL' |
| POLICY-03: Owner LOCKED 후 동일 금액 정상 APPROVAL 처리 | ✓ SATISFIED | None — Section 11.7 with 5-step flow + comparison table |
| NOTIF-01: 다운그레이드 알림에 Owner 등록 안내 포함 | ✓ SATISFIED | None — 3 channels include `waiaas agent set-owner` command |
| NOTIF-02: APPROVAL 대기 알림에 승인/거부 버튼 | ✓ SATISFIED | None — 3 channels (Telegram url buttons, Discord markdown links, ntfy Actions) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 33-time-lock-approval-mechanism.md | 2477 | Anti-pattern documented: evaluate() 외부 다운그레이드 | ℹ️ Info | Documented as anti-pattern with correct approach (evaluate() 내부 Step 9.5) |
| 33-time-lock-approval-mechanism.md | 2478 | Anti-pattern documented: GRACE 상태 APPROVAL 허용 | ℹ️ Info | Documented as anti-pattern with correct approach (GRACE도 다운그레이드) |
| 33-time-lock-approval-mechanism.md | 2479 | Anti-pattern documented: delaySeconds = 0 | ℹ️ Info | Documented as anti-pattern with mitigation (Math.max(rawDelay, 60)) |
| 33-time-lock-approval-mechanism.md | 2480 | Anti-pattern documented: Step 10 이후 다운그레이드 | ℹ️ Info | Documented as anti-pattern with correct approach (Step 9.5 return 스킵) |
| 33-time-lock-approval-mechanism.md | 2481 | Anti-pattern documented: 개별 instruction 다운그레이드 | ℹ️ Info | Documented as anti-pattern with correct approach (합산 1회만) |

**Note:** All anti-patterns are documented preventively in the design with correct approaches specified. No actual anti-pattern implementations found. This is best practice design documentation.

### Human Verification Required

None. All design specifications can be verified structurally through document content analysis. Functional verification will occur during implementation phase when code is written.

---

## Detailed Verification Results

### Truth 1: Step 9.5 삽입 지점과 로직 명세

**Verification Method:**
- Searched for "Step 9.5" pattern in 33-time-lock-approval-mechanism.md
- Found 11 occurrences across evaluate() implementation, evaluateBatch(), flowchart, and detailed section

**Evidence:**
- Section 11.6 "Step 9.5: OwnerState 기반 APPROVAL -> DELAY 다운그레이드 상세" (line 2420)
- Insertion point explicitly stated: "Step 9 이후, Step 10 전" with diagram (line 2426-2431)
- Complete pseudocode with resolveOwnerState(), NONE/GRACE branch, delaySeconds calculation (line 2437-2457)
- Design rationale table with 11 항목 (line 2461-2471)
- Integration in main evaluate() algorithm (line 653-674)
- Mermaid flowchart updated with Step 9.5 node (line 960-962)

**Assessment:** ✓ VERIFIED — Insertion point, branch conditions, delaySeconds fallback (300s), minimum (60s), and return-to-skip-Step-10 all specified.

### Truth 2: PolicyDecision downgraded 플래그와 originalTier

**Verification Method:**
- Grepped for "downgraded" pattern in 33-time-lock-approval-mechanism.md
- Found 30+ occurrences including data structure, Stage 4 branching, metadata storage

**Evidence:**
- PolicyDecision return structure in Step 9.5: `downgraded: true, originalTier: 'APPROVAL'` (line 2451-2452)
- Reference to 32-transaction-pipeline §3.1 for optional field definition (line 2471, 657)
- Stage 4 notification branching logic: `const notifEvent = decision.downgraded ? 'TX_DOWNGRADED_DELAY' : 'TX_DELAY_QUEUED'` (line 2669-2675)
- Metadata storage in transactions table: `metadata: { downgraded: true, originalTier: 'APPROVAL' }` (line 2640, 2682)
- Audit log recording: `if (decision.downgraded)` condition (line 2646-2660)

**Assessment:** ✓ VERIFIED — downgraded flag enables notification branching (POLICY-02 requirement). Stage 4 implementation specified with conditional logic.

### Truth 3: Owner LOCKED 후 정상 APPROVAL 복원 흐름

**Verification Method:**
- Located Section 11.7 "[v0.8] Owner LOCKED 후 정상 APPROVAL 복원 흐름" (line 2517)
- Verified presence of step-by-step flow, GRACE/NONE comparison flows, and state transition table

**Evidence:**
- Complete 5-step "Owner LOCKED 후 정상 APPROVAL 흐름" (line 2521-2549):
  1. Owner 등록 (NONE → GRACE)
  2. ownerAuth 최초 사용 + markOwnerVerified() (GRACE → LOCKED)
  3. 대액 거래 (15 SOL) → Step 9.5 ownerState === LOCKED → 다운그레이드 스킵
  4. Stage 4: APPROVAL 큐잉 + TX_APPROVAL_REQUEST
  5. Owner 승인 → 실행
- GRACE 다운그레이드 흐름 (line 2551-2573)
- NONE 다운그레이드 흐름 (line 2575-2594)
- Comparison table: NONE vs GRACE vs LOCKED (line 2598-2602) showing identical 15 SOL transaction produces different outcomes

**Assessment:** ✓ VERIFIED — Complete lifecycle from NONE → GRACE → LOCKED with explicit demonstration that LOCKED state skips Step 9.5 downgrade, allowing normal APPROVAL processing (POLICY-03 requirement).

### Truth 4: 다운그레이드 알림 템플릿에 Owner 등록 CLI 안내

**Verification Method:**
- Grepped for "waiaas agent set-owner" in 35-notification-architecture.md
- Verified presence in all 3 channel templates (Telegram, Discord, ntfy)

**Evidence:**
- TX_DOWNGRADED_DELAY event added to NotificationEventType enum (line 210)
- Event severity mapping: TX_DOWNGRADED_DELAY = INFO (line 249)
- Trigger condition in call point table: `decision.downgraded === true` (line 73)
- Difference table: TX_DELAY_QUEUED vs TX_DOWNGRADED_DELAY (line 447-452) — Owner 등록 안내 column shows "포함"
- **Telegram template** (line 454-473): Line 468 contains `waiaas agent set\-owner {agentName} <address>` with context explanation
- **Discord template** (line 476-492): Line 486 field "💡 Owner 등록 안내" with command and explanation
- **ntfy.sh template** (line 494-508): Line 506 contains `Owner 등록: waiaas agent set-owner {agentName} <address>`

**Assessment:** ✓ VERIFIED — All 3 channels include CLI command with contextual explanation (NOTIF-01 requirement). Templates distinguish downgrade from normal DELAY.

### Truth 5: APPROVAL 대기 알림의 채널별 승인/거부 버튼

**Verification Method:**
- Located Section 11.2.3.2 "[v0.8] TX_APPROVAL_REQUEST 승인/거부 버튼 확장" (line 2036)
- Verified button specifications for each channel with platform-specific constraints

**Evidence:**
- Precondition stated: "TX_APPROVAL_REQUEST는 OwnerState === LOCKED인 에이전트에서만 발생" (line 2038, 74-75)
- Approval URL pattern defined: `http://127.0.0.1:3100/v1/owner/approvals/{approvalId}/approve?nonce={nonce}` (line 2042-2043)
- **Telegram InlineKeyboardMarkup** (line 2062-2072):
  - url-based buttons (not callback_data) — Line 2066-2069
  - Design decision: ownerAuth signature required, so browser redirect needed (line 2075-2076)
- **Discord Embed markdown links** (line 2078-2102):
  - Constraint documented: "Discord Webhook은 Interactive Components(Button)를 지원하지 않는다" (line 2080)
  - Markdown links in field: `[✅ 승인]({approveUrl}) | [❌ 거부]({rejectUrl})` (line 2091)
  - Future upgrade path noted: "Bot Token 전환 시 Button Component 업그레이드 가능" (line 2102)
- **ntfy.sh Actions view** (line 2104-2122):
  - Actions header: `view, ✅ 승인 대시보드, {approveUrl}; view, ❌ 거부, {rejectUrl}` (line 2110)
  - Design decision: view type only (not http type) — ownerAuth required (line 2120-2121)
- Security consideration table (line 2397-2405): nonce, localhost, ownerAuth required

**Assessment:** ✓ VERIFIED — All 3 channels include approval/reject buttons adapted to platform constraints (NOTIF-02 requirement). Discord Webhook limitation explicitly documented with workaround.

---

## Must-Haves Cross-Reference

### Plan 33-01 Must-Haves

From `.planning/phases/33-정책-다운그레이드-알림-설계/33-01-PLAN.md`:

1. ✓ "evaluate() Step 9 이후, Step 10 전에 APPROVAL->DELAY 다운그레이드 삽입 지점(Step 9.5)이 명세되어 있다" — Section 11.6, line 2426-2431
2. ✓ "OwnerState가 NONE 또는 GRACE일 때 APPROVAL이 DELAY로 다운그레이드되고, LOCKED일 때 정상 APPROVAL로 처리된다" — Line 2441-2455, comparison table 2598-2602
3. ✓ "evaluateBatch()의 합산 티어 결정에도 동일한 다운그레이드 로직이 적용된다" — Line 2336+, 2367-2379, 2388-2400
4. ✓ "다운그레이드 시 delaySeconds가 SPENDING_LIMIT 규칙의 delay_seconds로 설정되고, 없으면 300초 fallback이 명세되어 있다" — Line 2445-2446, 2466-2468
5. ✓ "Owner 등록+LOCKED 이후 동일 금액 거래가 정상 APPROVAL 흐름으로 처리되는 경로가 명세되어 있다" — Section 11.7, line 2521-2549

**Artifact:** `.planning/deliverables/33-time-lock-approval-mechanism.md`
- Contains "Step 9.5": ✓ (11 occurrences)
- resolveOwnerState call + NONE/GRACE branch: ✓ (line 2440-2441)
- delaySeconds fallback 300초: ✓ (line 2445)
- agentOwnerInfo optional parameter: ✓ (line 657, 2439, 2367, 2391)
- TX_DOWNGRADED 감사 로그: ✓ (line 2066, 2483-2515)
- Step 10 스킵 return: ✓ (line 2453, 2470)

**Key Links:**
- evaluate() Step 9.5 → resolveOwnerState(): ✓ WIRED (line 2440, 2661)
- evaluate() Step 9.5 → PolicyDecision.downgraded: ✓ WIRED (line 2451-2452, 2471)
- evaluateBatch() → Step 9.5: ✓ WIRED (line 2367-2379)

### Plan 33-02 Must-Haves

From `.planning/phases/33-정책-다운그레이드-알림-설계/33-02-PLAN.md`:

1. ✓ "TX_DOWNGRADED_DELAY 이벤트가 NotificationEventType에 추가되어 기존 TX_DELAY_QUEUED와 분리되어 있다" — Line 210, 249, 73
2. ✓ "다운그레이드 알림 템플릿에 Owner 등록 CLI 안내 메시지(waiaas agent set-owner)가 포함되어 있다" — Line 451, 468, 486, 506
3. ✓ "Telegram/Discord/ntfy.sh 3채널의 다운그레이드 알림 템플릿이 채널별 제약에 맞게 명세되어 있다" — Telegram 454-473, Discord 476-492, ntfy 494-508
4. ✓ "Owner 있는 에이전트의 APPROVAL 대기 알림에 [승인]/[거부] 버튼이 채널별로 명세되어 있다" — Telegram 2048-2072, Discord 2078-2102, ntfy 2104-2122
5. ✓ "Discord Webhook은 Button 미지원이므로 Embed footer에 승인 URL을 안내하는 방식이 명세되어 있다" — Line 2080, 2091, 2100-2102

**Artifact:** `.planning/deliverables/35-notification-architecture.md`
- "TX_DOWNGRADED_DELAY" in enum: ✓ (line 210)
- 심각도 매핑 TX_DOWNGRADED_DELAY = INFO: ✓ (line 249)
- 호출 포인트 decision.downgraded === true: ✓ (line 73)
- Telegram "waiaas agent set-owner": ✓ (line 468)
- Discord "waiaas agent set-owner": ✓ (line 486)
- ntfy.sh "waiaas agent set-owner": ✓ (line 506)
- TX_DELAY_QUEUED vs TX_DOWNGRADED_DELAY 차이점: ✓ (line 447-452)

**Key Links:**
- Stage 4 (downgraded === true) → TX_DOWNGRADED_DELAY: ✓ WIRED (33-time-lock line 2669-2675)
- Stage 4 (tier === APPROVAL, LOCKED) → TX_APPROVAL_REQUEST: ✓ WIRED (35-notification line 74-75)
- Telegram InlineKeyboardMarkup → 승인 URL: ✓ WIRED (line 2066-2069, url type)

---

## Phase Goal Achievement

**Goal:** Owner 없는 에이전트의 APPROVAL 거래가 차단 없이 DELAY로 다운그레이드되어 실행되고, 알림에 Owner 등록 안내가 포함되는 설계가 완성된다

**Achievement:**

1. **다운그레이드 메커니즘 설계 완성** ✓
   - evaluate() Step 9.5 삽입 지점 명확히 정의 (Step 9 후, Step 10 전)
   - OwnerState 기반 분기 로직: NONE/GRACE → 다운그레이드, LOCKED → 정상 APPROVAL
   - delaySeconds 결정 로직: SPENDING_LIMIT delay_seconds 우선, fallback 300초, 최소 60초
   - evaluateBatch() 합산 티어 다운그레이드 적용
   - PolicyDecision 확장: downgraded: true, originalTier: 'APPROVAL'

2. **알림 분기 조건 설계 완성** ✓
   - TX_DOWNGRADED_DELAY 이벤트 추가 (16번째 NotificationEventType)
   - Stage 4 알림 분기: decision.downgraded ? TX_DOWNGRADED_DELAY : TX_DELAY_QUEUED
   - 3채널 다운그레이드 알림 템플릿 with `waiaas agent set-owner` CLI 명령어
   - TX_DELAY_QUEUED와 차이점 명시 (메시지 톤, Owner 안내 포함 여부)

3. **Owner LOCKED 후 정상 APPROVAL 복원 설계 완성** ✓
   - 5단계 흐름: Owner 등록 → ownerAuth 검증 → LOCKED → 대액 거래 → 정상 APPROVAL
   - NONE/GRACE/LOCKED 3가지 상태별 동일 금액 거래 처리 비교 테이블
   - Step 9.5에서 ownerState === LOCKED 시 다운그레이드 스킵 명시

4. **APPROVAL 승인/거부 버튼 설계 완성** ✓
   - Telegram: InlineKeyboardMarkup url 기반 버튼 (ownerAuth 필요하므로 callback 대신 url)
   - Discord: Webhook Button 미지원 제약 명시 + Embed markdown 링크 대체
   - ntfy.sh: Actions view 타입 (http 타입 불가 -- ownerAuth 필수)
   - 승인 URL 패턴: nonce 포함, localhost 127.0.0.1:3100, ownerAuth 서명 필수

5. **감사 로그 및 안티패턴 설계 완성** ✓
   - TX_DOWNGRADED 독립 감사 이벤트 (severity: info)
   - 5개 안티패턴 테이블로 문서화 (외부 다운그레이드, GRACE APPROVAL, 0초 delay, Step 10 이후 삽입, 개별 instruction 다운그레이드)
   - 각 안티패턴의 문제점과 올바른 접근 명시

**Conclusion:** Phase 33 goal fully achieved. All design specifications substantive, complete, and properly wired. Ready for implementation phase.

---

_Verified: 2026-02-08T23:39:01Z_
_Verifier: Claude (gsd-verifier)_
