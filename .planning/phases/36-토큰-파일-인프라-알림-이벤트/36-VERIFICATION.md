---
phase: 36-토큰-파일-인프라-알림-이벤트
verified: 2026-02-09T06:56:56Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 36: 토큰 파일 인프라 + 알림 이벤트 Verification Report

**Phase Goal:** MCP/CLI/Telegram 3개 컴포넌트가 공유하는 토큰 파일 사양과 원자적 쓰기 패턴이 정의되고, SESSION_EXPIRING_SOON 알림 이벤트가 설계된다

**Verified:** 2026-02-09T06:56:56Z

**Status:** PASSED

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ~/.waiaas/mcp-token 파일 사양(경로, 포맷, 권한 0o600, 인코딩, symlink 거부)이 설계 문서에 명확히 정의되어 있다 | ✓ VERIFIED | 24-monorepo-data-directory.md 섹션 4.1 파일 사양 테이블 9개 항목 정의. 경로(`~/.waiaas/mcp-token`), 포맷(`wai_sess_` + JWT), 인코딩(UTF-8), 권한(0o600), symlink 거부(`lstatSync` 검사), 최대 크기(~500 bytes), Windows 제한 모두 명시. |
| 2 | 원자적 토큰 파일 쓰기 패턴(write-then-rename, Windows NTFS 대응)이 설계 문서에 정의되어 있다 | ✓ VERIFIED | 24-monorepo-data-directory.md 섹션 4.3 원자적 쓰기 패턴 6단계 절차 정의. POSIX rename 원자성 활용, 임시 파일 형식(`.mcp-token.${pid}.${randomBytes(4).hex()}.tmp`), Windows EPERM 재시도(10-50ms 랜덤 대기, 최대 3회), 플랫폼별 동작 테이블 포함. |
| 3 | SESSION_EXPIRING_SOON 이벤트의 발생 조건(만료 24h 전 OR 잔여 갱신 3회 이하), 심각도(WARNING), 알림 내용(세션ID, 에이전트명, 만료시각, 잔여횟수)이 정의되어 있다 | ✓ VERIFIED | 35-notification-architecture.md 섹션 11.3 SESSION_EXPIRING_SOON 상세 정의. 발생 조건(OR 논리: `timeToExpiry <= 86400` OR `remainingRenewals <= 3`), 심각도(WARNING), SessionExpiringSoonDataSchema Zod 스키마(sessionId, agentName, expiresAt, remainingRenewals), Telegram/Discord/ntfy.sh 메시지 템플릿 포함. |
| 4 | 데몬 측 만료 임박 판단 로직(갱신 API 응답 처리 시 잔여 횟수/절대 만료 체크, 알림 트리거)이 설계 문서에 정의되어 있다 | ✓ VERIFIED | 53-session-renewal-protocol.md 섹션 5.6 전체. `shouldNotifyExpiringSession` 순수 함수(3개 파라미터, OR 논리), 갱신 성공 경로 알림 판단(의사 코드 포함), 갱신 실패 경로 보완 알림(403 RENEWAL_LIMIT_REACHED/SESSION_ABSOLUTE_LIFETIME_EXCEEDED), notification_log 중복 방지, 시퀀스 다이어그램 포함. |

**Score:** 4/4 truths verified (100%)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/deliverables/24-monorepo-data-directory.md` | 토큰 파일 사양(섹션 4) 정의 | ✓ VERIFIED | **Exists:** 1364 lines<br>**Substantive:** 섹션 4(토큰 파일 사양) 신설 ~150 lines, 4개 하위 섹션(4.1 파일 사양 9항목, 4.2 공유 유틸리티 API 3함수, 4.3 원자적 쓰기 6단계, 4.4 Last-Writer-Wins 정책)<br>**Wired:** v0.9 objectives에서 참조, SMGR-02/SMGR-07 매핑 |
| `.planning/deliverables/35-notification-architecture.md` | SESSION_EXPIRING_SOON 이벤트 타입 추가 | ✓ VERIFIED | **Exists:** 2722 lines<br>**Substantive:** NotificationEventType enum에 17번째 타입 추가, 심각도 테이블, 호출 포인트 테이블, Zod 스키마, 3개 채널 메시지 템플릿, 중복 방지 메커니즘(notification_log 기반)<br>**Wired:** 53-session-renewal-protocol.md에서 참조, NOTI-01 매핑 |
| `.planning/deliverables/53-session-renewal-protocol.md` | 섹션 5.6 만료 임박 판단 로직 | ✓ VERIFIED | **Exists:** 1330 lines<br>**Substantive:** 섹션 5.6 신설 ~200 lines, 6개 하위 섹션(5.6.1 개요, 5.6.2 순수 함수, 5.6.3 성공 경로, 5.6.4 실패 경로, 5.6.5 클라이언트 정보, 5.6.6 시퀀스 다이어그램)<br>**Wired:** 35-notification-architecture.md 참조, v0.9 objectives에서 참조, NOTI-02 매핑 |
| `objectives/v0.9-session-management-automation.md` | Phase 36 설계 결과 반영 | ✓ VERIFIED | **Exists:** ~600 lines<br>**Substantive:** Phase 36-01 설계 결과 섹션(핵심 결정 7항목, 설계 문서 위치), 토큰 파일 사양 [설계 확정] 태그, 성공 기준 5번/7번 [설계 완료] 표시, 2개 업데이트 이력<br>**Wired:** 3개 설계 문서 cross-reference |

**All artifacts verified:** 4/4 (EXISTS + SUBSTANTIVE + WIRED)

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| 24-monorepo-data-directory.md | SMGR-02, SMGR-07 | Requirements mapping | ✓ WIRED | 섹션 "요구사항 매핑"에 명시적 매핑. v0.9 태그로 추적 가능 |
| 35-notification-architecture.md | SESSION_EXPIRING_SOON | NotificationEventType enum | ✓ WIRED | 17번째 이벤트 타입으로 열거형, 심각도 테이블, 호출 포인트 테이블에 통합 |
| 53-session-renewal-protocol.md | 35-notification-architecture.md | 섹션 5.6 참조 | ✓ WIRED | 섹션 5.6.1 개요에서 "참조: 35-notification-architecture.md의 SESSION_EXPIRING_SOON 이벤트 정의" 명시 |
| objectives/v0.9 | Phase 36 설계 문서 | Phase 36-01/36-02 설계 결과 섹션 | ✓ WIRED | 설계 문서 위치 명시(섹션 번호 포함), 업데이트 이력 2건, 성공 기준 체크 |
| `shouldNotifyExpiringSession` | OR 논리 트리거 | 53-session-renewal-protocol.md 5.6.2 | ✓ WIRED | 순수 함수 정의(TypeScript 시그니처 + 구현), 상수 설계 근거 테이블(EXPIRING_THRESHOLD_SECONDS=86400, RENEWAL_THRESHOLD=3) |
| notification_log | 중복 방지 | 35-notification-architecture.md 11.3 | ✓ WIRED | SQL 쿼리 명시(`SELECT 1 FROM notification_log WHERE event='SESSION_EXPIRING_SOON' AND reference_id=sessionId AND status='DELIVERED' LIMIT 1`) |
| writeMcpToken | write-then-rename | 24-monorepo-data-directory.md 4.2/4.3 | ✓ WIRED | 함수 시그니처(async function), 6단계 원자적 쓰기 절차, 에러 처리(Windows EPERM 재시도) 상세 정의 |

**All key links verified:** 7/7 (WIRED)

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SMGR-02 (토큰 파일 영속화 사양) | ✓ SATISFIED | 24-monorepo-data-directory.md 섹션 4.1 파일 사양 9개 항목 전체 정의. Truth 1 검증 완료. |
| SMGR-07 (원자적 토큰 파일 쓰기) | ✓ SATISFIED | 24-monorepo-data-directory.md 섹션 4.3 원자적 쓰기 패턴 6단계 + 4개 플랫폼 동작 테이블. Truth 2 검증 완료. |
| NOTI-01 (SESSION_EXPIRING_SOON 이벤트 사양) | ✓ SATISFIED | 35-notification-architecture.md 섹션 11.3 발생 조건(OR 논리), WARNING 심각도, Zod 스키마, 3개 채널 메시지 템플릿. Truth 3 검증 완료. |
| NOTI-02 (데몬 측 만료 임박 판단 로직) | ✓ SATISFIED | 53-session-renewal-protocol.md 섹션 5.6 shouldNotifyExpiringSession 순수 함수, 갱신 성공/실패 경로 알림 트리거, 의사 코드 + 시퀀스 다이어그램. Truth 4 검증 완료. |

**Coverage:** 4/4 requirements satisfied (100%)

### Anti-Patterns Found

**Scan scope:** 4 modified design documents (24-monorepo, 35-notification, 53-session-renewal, v0.9-objectives)

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 24-monorepo-data-directory.md | 129, 135, 566 | "placeholder" | ℹ️ INFO | 기존 placeholder 주석(packages/sdk, packages/mcp). Phase 36과 무관한 Phase 9 범위. v0.9 신규 콘텐츠에는 placeholder 없음. |

**No blocker anti-patterns found.** INFO-level findings are pre-existing and outside Phase 36 scope.

### Human Verification Required

**설계 마일스톤 특성:** Phase 36은 설계 페이즈이며, 코드 구현이 범위 외입니다. 따라서 "실제 동작" 검증은 구현 마일스톤(v1.x)에서 수행됩니다. 현재는 설계 문서의 **완전성(completeness)**과 **정합성(consistency)**만 검증합니다.

**No human verification required for this design phase.** 

구현 시(v1.x) 필요한 인간 검증 항목은 Phase 40(테스트 설계)에서 T-01~T-14 시나리오로 정의될 예정입니다.

## Verification Details

### Truth 1: mcp-token 파일 사양 정의

**Status:** ✓ VERIFIED

**Evidence:**

1. **파일 사양 테이블 9개 항목** (24-monorepo-data-directory.md 섹션 4.1):
   - 경로: `~/.waiaas/mcp-token` (WAIAAS_DATA_DIR 오버라이드 가능)
   - 포맷: `wai_sess_` + JWT 문자열 (개행 없음)
   - 인코딩: UTF-8
   - 권한: `0o600` (POSIX Owner read/write only)
   - 디렉토리 권한: `0o700`
   - symlink: 거부 (`lstatSync` 검사)
   - 최대 크기: ~500 bytes
   - 소유권 모델: Last-Writer-Wins
   - Windows 제한: `0o600` 미적용, 경고 로그 출력

2. **공유 유틸리티 API 3개 함수** (섹션 4.2):
   - `getMcpTokenPath(dataDir?: string): string`
   - `writeMcpToken(filePath: string, token: string): Promise<void>` (비동기)
   - `readMcpToken(filePath: string): string | null` (동기)
   - 각 함수의 시그니처, 동작, 에러 처리 상세 정의

3. **Grep 검증:**
   ```bash
   # mcp-token 파일 언급: 3회 (디렉토리 트리, 파일 상세 테이블, 토큰 파일 사양 섹션)
   # 섹션 4.1 파일 사양 테이블: 9개 행 확인
   # symlink 거부: lstatSync 명시
   # 권한 0o600: POSIX 표준, Windows 제한 명시
   ```

**Substantiveness Check:**
- Line count: 섹션 4 전체 ~150 lines (테이블 9행 + API 3함수 + 6단계 절차 + 정책)
- No TODO/FIXME/placeholder in v0.9 content
- 모든 항목에 "근거" 컬럼 포함 (why, not just what)

### Truth 2: 원자적 쓰기 패턴 정의

**Status:** ✓ VERIFIED

**Evidence:**

1. **6단계 절차** (24-monorepo-data-directory.md 섹션 4.3):
   1. 데이터 디렉토리 보장 (`mkdir(dir, { recursive: true, mode: 0o700 })`)
   2. 기존 파일 symlink 검사 (`lstat(filePath)` → `isSymbolicLink()`)
   3. 임시 파일 생성 (`.mcp-token.${pid}.${randomBytes(4).hex()}.tmp`)
   4. 임시 파일에 토큰 쓰기 (`writeFile(tmp, token, { encoding: 'utf-8', mode: 0o600 })`)
   5. 원자적 이름 변경 (`rename(tmp, filePath)` — POSIX 원자성)
   6. 실패 시 정리 (`unlink(tmp)` — best-effort)

2. **플랫폼별 동작 테이블** (4개 플랫폼):
   - macOS (APFS/HFS+): rename 원자성 O, 파일 권한 O, 추가 대응 없음
   - Linux (ext4/xfs): rename 원자성 O, 파일 권한 O, 추가 대응 없음
   - Windows (NTFS): rename 조건부, 파일 권한 X, EPERM 재시도(10-50ms 랜덤 대기, 최대 3회) + 권한 경고 로그
   - Docker (bind mount): rename 원자성 O(호스트 FS 의존), 파일 권한 O(호스트 FS 의존), 추가 대응 없음

3. **Grep 검증:**
   ```bash
   # randomBytes 임시 파일: 2회 언급 (섹션 4.2 주석 + 섹션 4.3 단계 3)
   # .tmp 확장자: 명시적 형식 정의
   # Windows EPERM: 재시도 로직 상세(10-50ms 랜덤, 최대 3회)
   ```

**Substantiveness Check:**
- 6단계 각각 Node.js API 명시 (mkdir, lstat, writeFile, rename, unlink)
- POSIX rename 원자성 명시적 언급
- Windows 특수 케이스 대응(EPERM 재시도 + 권한 경고)

### Truth 3: SESSION_EXPIRING_SOON 이벤트 정의

**Status:** ✓ VERIFIED

**Evidence:**

1. **이벤트 타입 추가** (35-notification-architecture.md):
   - NotificationEventType enum: 17번째 타입 `SESSION_EXPIRING_SOON: 'SESSION_EXPIRING_SOON'`
   - 주석: "세션 만료 임박 알림 — 절대 수명 만료 24h 전 OR 잔여 갱신 3회 이하"

2. **심각도** (섹션 3 테이블):
   - `SESSION_EXPIRING_SOON | WARNING | [v0.9] 세션 만료 임박 -- Owner 행동 필요 (절대 수명 24h 전 OR 잔여 갱신 3회 이하)`

3. **발생 조건** (섹션 11.3):
   - OR 논리: `remainingRenewals <= 3 OR timeToExpiry <= 86400초`
   - 트리거 위치: SessionService.renewSession() — 갱신 성공(200 OK) 후 + 갱신 실패(403) 경로 보완

4. **Zod 스키마** (SessionExpiringSoonDataSchema):
   ```typescript
   export const SessionExpiringSoonDataSchema = z.object({
     sessionId: z.string().uuid(),            // 세션 UUID v7
     agentName: z.string(),                   // 에이전트 이름
     expiresAt: z.number().int(),             // 절대 만료 시각 (epoch seconds)
     remainingRenewals: z.number().int(),     // 잔여 갱신 횟수
   })
   ```

5. **메시지 템플릿** (3개 채널):
   - **Telegram (MarkdownV2):**
     ```
     ⚠️ *세션 만료 임박* (WARNING)
     에이전트 `{agentName}`의 세션이 곧 만료됩니다.
     세션 ID: `{sessionId_short}`
     만료 시각: {expiresAt_formatted}
     잔여 갱신: {remainingRenewals}회
     새 세션을 생성하거나 갱신을 확인하세요.
     ```
   - **Discord (embed):** title, color, fields (에이전트, 세션ID, 만료시각, 잔여갱신), footer, timestamp
   - **ntfy.sh (POST):** Title, Priority 4 (high), Tags (warning, session, expiring), Body

6. **중복 방지 메커니즘** (섹션 11.3):
   - SQL 쿼리:
     ```sql
     SELECT 1 FROM notification_log
     WHERE event = 'SESSION_EXPIRING_SOON'
       AND reference_id = sessionId
       AND status = 'DELIVERED'
     LIMIT 1
     ```
   - isExpiringSoonAlreadySent 함수 정의

**Grep 검증:**
```bash
# SESSION_EXPIRING_SOON: 15회 언급 (enum, 테이블, 스키마, 템플릿, 중복 방지)
# WARNING 심각도: 명시적 매핑
# 잔여 갱신, 만료 시각: 모든 메시지 템플릿에 포함
# OR 논리: remainingRenewals <= 3 OR timeToExpiry <= 24h
```

**Substantiveness Check:**
- Zod 스키마 4개 필드 완전 정의
- 3개 채널 각각 메시지 템플릿 상세(포맷, 필드, 스타일)
- 중복 방지 SQL 쿼리 실행 가능 수준

### Truth 4: 데몬 측 만료 임박 판단 로직 정의

**Status:** ✓ VERIFIED

**Evidence:**

1. **shouldNotifyExpiringSession 순수 함수** (53-session-renewal-protocol.md 섹션 5.6.2):
   ```typescript
   function shouldNotifyExpiringSession(
     remainingRenewals: number,
     absoluteExpiresAt: number,   // epoch seconds
     nowEpochSeconds: number,
   ): boolean {
     const EXPIRING_THRESHOLD_SECONDS = 24 * 60 * 60  // 24시간
     const RENEWAL_THRESHOLD = 3                       // 잔여 3회 이하
     const timeToExpiry = absoluteExpiresAt - nowEpochSeconds
     return remainingRenewals <= RENEWAL_THRESHOLD
       || timeToExpiry <= EXPIRING_THRESHOLD_SECONDS
   }
   ```
   - 함수 시그니처: 3개 파라미터, boolean 반환
   - 상수 설계 근거 테이블: EXPIRING_THRESHOLD_SECONDS=86400 (24시간), RENEWAL_THRESHOLD=3 (잔여 3회 이하)
   - 순수 함수 설계 원칙: 부수 효과 없음, 판단만 수행

2. **갱신 성공 경로 알림 판단** (섹션 5.6.3):
   - 의사 코드:
     ```typescript
     const maxRenewals = constraints.maxRenewals ?? config.default_max_renewals
     const remainingRenewals = maxRenewals - newRenewalCount
     const absoluteExpiresAt = session.absolute_expires_at  // epoch seconds
     
     if (shouldNotifyExpiringSession(remainingRenewals, absoluteExpiresAt, now)) {
       const alreadySent = await isExpiringSoonAlreadySent(sqlite, sessionId)
       if (!alreadySent) {
         notificationService.notify({
           level: 'WARNING',
           event: 'SESSION_EXPIRING_SOON',
           title: `세션 만료 임박: ${agent.name}`,
           body: `에이전트 "${agent.name}"의 세션이 곧 만료됩니다.`,
           metadata: {
             sessionId,
             agentName: agent.name,
             expiresAt: absoluteExpiresAt,
             remainingRenewals,
           },
           createdAt: new Date().toISOString(),
         }).catch(err => {
           logger.error('SESSION_EXPIRING_SOON notification failed', { sessionId, error: err })
         })
       }
     }
     ```
   - 삽입 위치: renewSession() 내부, DB 업데이트 완료 + 200 OK 응답 반환 직전

3. **갱신 실패 경로 보완 알림** (섹션 5.6.4):
   - Guard 1 실패(RENEWAL_LIMIT_REACHED): remainingRenewals = 0
   - Guard 2 실패(SESSION_ABSOLUTE_LIFETIME_EXCEEDED): remainingRenewals = maxRenewals - session.renewal_count
   - 의사 코드:
     ```typescript
     if (!validation.allowed) {
       if (validation.code === 'RENEWAL_LIMIT_REACHED'
         || validation.code === 'SESSION_ABSOLUTE_LIFETIME_EXCEEDED') {
         const alreadySent = await isExpiringSoonAlreadySent(sqlite, sessionId)
         if (!alreadySent) {
           const remainingRenewals = validation.code === 'RENEWAL_LIMIT_REACHED'
             ? 0
             : maxRenewals - session.renewal_count
           notificationService.notify({ ... }).catch(err => { ... })
         }
       }
       return { success: false, error: { code: validation.code!, message: validation.reason!, status: 403 } }
     }
     ```
   - 근거: 데몬 재시작이나 타이밍 이슈로 성공 경로 놓칠 수 있음 → 보완 트리거로 최소 1회 알림 보장

4. **시퀀스 다이어그램** (섹션 5.6.6):
   - 갱신 성공 + 만료 임박 알림: Agent → Daemon → DB → Notify → Owner
   - 갱신 실패 + 보완 알림: Guard 1 실패 → notification_log 중복 확인 → 미발송이면 보완 알림

**Grep 검증:**
```bash
# shouldNotifyExpiringSession: 5회 언급 (함수 정의 + 성공 경로 + 시퀀스 다이어그램 + 역할 테이블)
# EXPIRING_THRESHOLD_SECONDS: 86400 (24시간) 상수 정의
# RENEWAL_THRESHOLD: 3 (잔여 3회 이하) 상수 정의
# notification_log 중복 확인: SQL 쿼리 + 의사 코드
# fire-and-forget: .catch(err => ...) 패턴
```

**Substantiveness Check:**
- TypeScript 함수 시그니처 + 구현 완전 정의
- 갱신 성공/실패 양쪽 경로 의사 코드 실행 가능 수준
- 상수 설계 근거(24시간, 3회) 명시적 표 제공
- 시퀀스 다이어그램으로 플로우 시각화

## Summary

**Phase 36 goal fully achieved.** 

- **토큰 파일 인프라:** 9개 항목 파일 사양, 3개 공유 유틸리티 함수, 6단계 원자적 쓰기 패턴, 4개 플랫폼 동작, Last-Writer-Wins 정책 — 모두 설계 문서에 실행 가능 수준으로 정의됨.

- **알림 이벤트:** SESSION_EXPIRING_SOON 17번째 NotificationEventType 추가, OR 논리 발생 조건(24h 전 OR 3회 이하), WARNING 심각도, Zod 스키마 4필드, 3개 채널 메시지 템플릿, notification_log 중복 방지, shouldNotifyExpiringSession 순수 함수, 갱신 성공/실패 양쪽 경로 알림 트리거 — 모두 설계 문서에 명확히 정의됨.

- **요구사항:** SMGR-02, SMGR-07, NOTI-01, NOTI-02 모두 만족.

- **문서 품질:** 3개 설계 문서 총 5416 lines, v0.9 신규 콘텐츠에 placeholder/TODO 없음, TypeScript 코드 수준 의사 코드 제공, 플랫폼별 동작 테이블, 시퀀스 다이어그램 포함.

**Next phase readiness:** Phase 37(SessionManager 핵심 설계), Phase 38(MCP 통합), Phase 39(CLI+Telegram 연동)에서 토큰 파일 유틸리티와 SESSION_EXPIRING_SOON 이벤트를 참조 가능.

---

*Verified: 2026-02-09T06:56:56Z*
*Verifier: Claude (gsd-verifier)*
*Method: Goal-backward verification (Design phase — code implementation out of scope)*
