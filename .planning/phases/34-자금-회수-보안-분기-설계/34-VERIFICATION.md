---
phase: 34-자금-회수-보안-분기-설계
verified: 2026-02-09T11:30:00Z
status: passed
score: 5/5 success-criteria verified
re_verification: false
---

# Phase 34: 자금 회수 + 보안 분기 설계 Verification Report

**Phase Goal:** Owner 등록된 에이전트의 자금 전량 회수 프로토콜과, Owner 유무별 Kill Switch 복구/세션 갱신 분기가 설계된다

**Verified:** 2026-02-09T11:30:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /v1/owner/agents/:agentId/withdraw API 스펙이 명세되어 있다 | ✓ VERIFIED | 37-rest-api §8.18 -- 요청/응답 Zod 스키마, HTTP 200/207/403/404/500, masterAuth(implicit) |
| 2 | WithdrawService 도메인 서비스 설계가 명세되어 있다 | ✓ VERIFIED | 37-rest-api §8.18.1 -- OwnerState 검증 → scope 분기 → sweepAll/sendNative → HTTP 매핑 |
| 3 | sweepAll Solana 4단계 실행 순서가 명세되어 있다 | ✓ VERIFIED | 27-chain-adapter §6.11.1-6.11.4 -- getAssets → SPL 배치 → closeAccount → SOL 마지막 |
| 4 | scope "all"/"native" 분기가 명세되어 있다 | ✓ VERIFIED | 37-rest-api §8.18 scope 테이블 + 27-chain-adapter §6.11.5 sendNative 조합 |
| 5 | 부분 실패 시 HTTP 207 응답이 명세되어 있다 | ✓ VERIFIED | 37-rest-api §8.18 HTTP 상태 코드 매트릭스 + failed 배열 + 207 Multi-Status 예시 |
| 6 | 유예 구간 withdraw 비활성화 정책이 명세되어 있다 | ✓ VERIFIED | 37-rest-api §8.18 WITHDRAW_LOCKED_ONLY 에러 코드 + 보안 근거(H-02 방어) |
| 7 | Kill Switch 복구 Owner 유무 분기가 명세되어 있다 | ✓ VERIFIED | 36-killswitch §4.7 -- Owner 없음: 24h, Owner 있음: 30min + ownerAuth |
| 8 | 2단계 복구 패턴이 명세되어 있다 | ✓ VERIFIED | 36-killswitch §4.7.3 -- Step 1(ACTIVATED→RECOVERING) + Step 2(대기 확인→NORMAL) |
| 9 | 세션 갱신 Owner 분기가 명세되어 있다 | ✓ VERIFIED | 53-session §6.6.1 -- NONE/GRACE: 즉시 확정, LOCKED: [거부하기] 활성 |
| 10 | [거부하기] 버튼 3채널 명세가 있다 | ✓ VERIFIED | 35-notification §SESSION_RENEWED -- Telegram(url), Discord(Embed 링크), ntfy.sh(view) |

**Score:** 10/10 truths verified

---

## Success Criteria Verification

### SC-1: POST /v1/owner/agents/:agentId/withdraw API 스펙

**Status:** ✓ VERIFIED

**Evidence:**
- **File:** `.planning/deliverables/37-rest-api-complete-spec.md`
- **Section:** §8.18
- **Location:** Lines 2625-2850

**Verified artifacts:**
1. **Request Schema:**
   ```typescript
   WithdrawRequestSchema = z.object({
     scope: z.enum(['all', 'native']).default('all')
   })
   ```
   ✓ Found at line 2657

2. **Response Schema:**
   ```typescript
   WithdrawResponseSchema = z.object({
     totalTransactions, nativeRecovered, tokensRecovered,
     rentRecovered (optional), failed
   })
   ```
   ✓ Found at lines 2665-2700

3. **HTTP Status Codes:**
   - 200: `failed.length === 0` (전량 성공)
   - 207: `failed.length > 0 && totalTransactions > 0` (부분 성공)
   - 403: WITHDRAW_LOCKED_ONLY | AGENT_SUSPENDED
   - 404: AGENT_NOT_FOUND | NO_OWNER
   - 500: SWEEP_TOTAL_FAILURE
   ✓ Found at lines 2710-2714

4. **Authentication:**
   - masterAuth(implicit) only
   - ownerAuth 불필요 근거: 수신 주소 owner_address 고정 (v0.8 §5.2)
   ✓ Found at lines 2638-2645

5. **Endpoint count updated:**
   - Total endpoints: 37 → 38
   - Authentication map table updated
   ✓ Found at line 56, 272

**Wiring check:**
- ✓ Endpoint registered in authentication map (line 272)
- ✓ Endpoint listed in endpoint summary table (line 56)
- ✓ Error codes integrated into domain error section (§10.9)

---

### SC-2: sweepAll Solana 실행 순서 + HTTP 207

**Status:** ✓ VERIFIED

**Evidence:**
- **File:** `.planning/deliverables/27-chain-adapter-interface.md`
- **Section:** §6.11
- **Location:** Lines 2294-2550

**Verified execution order (4 stages):**

1. **Stage 1: getAssets(address)**
   - AssetInfo[] 조회
   - v0.6 57-asset-query 참조
   ✓ Found at §6.11.1 line 2306

2. **Stage 2: SPL 토큰 필터링**
   - `type === 'spl' && balance > 0n`
   ✓ Found at §6.11.1 line 2307

3. **Stage 3: 토큰 배치 전송 + closeAccount**
   - buildBatch() 활용 (v0.6 60-batch-transaction)
   - Max 10 tokens/batch (1232 byte limit)
   - Batch failure → individual fallback
   - closeAccount → rent 회수 to rentRecovered
   ✓ Found at §6.11.1 lines 2308-2311

4. **Stage 4: SOL 전량 전송 (마지막)**
   - getBalance(address) → 현재 SOL 잔액
   - estimateFee(transferTx) → 예상 fee
   - amount = balance - estimatedFee
   - sendTransaction(signedTx) → SOL 전송
   ✓ Found at §6.11.1 lines 2312-2317

**SOL 마지막 전송 근거 (WITHDRAW-07):**
- 토큰 전송 + closeAccount에 SOL tx fee 필요
- SOL 먼저 전송 시 이후 토큰 전송 fee 부족 실패
- 모든 토큰 처리 후 잔여 SOL에서 마지막 tx fee만 차감하여 최대 회수
✓ Found at §6.11.2 lines 2331-2347

**HTTP 207 부분 실패 처리:**
- **File:** `.planning/deliverables/37-rest-api-complete-spec.md`
- HTTP 207 조건: `failed.length > 0 && totalTransactions > 0`
- failed 배열 구조: `{ mint: string, error: string }[]`
- 207 Multi-Status 응답 예시 제공
✓ Found at 37-rest-api §8.18 line 2710, 2742-2754

**Batch fallback strategy:**
- Level 1: 배치 내 특정 instruction 실패 → failed 배열 추가
- Level 2: 배치 전체 실패 → 개별 토큰 전송 재시도
- Level 3: 개별 전송도 실패 → failed 배열 추가
- 핵심: 모든 토큰 실패해도 SOL 전송 반드시 시도
✓ Found at 27-chain-adapter §6.11.3 lines 2349-2382

**Implementation code:**
- SolanaAdapter.sweepAll() 전체 의사 코드 제공
- executeSweepBatch() + transferAndClose() 패턴
- SweepResult 반환 구조 명세
✓ Found at §6.11.4 lines 2384-2540

---

### SC-3: scope "all"/"native" 분기

**Status:** ✓ VERIFIED

**Evidence:**

**Part 1: scope 분기 정의**
- **File:** `.planning/deliverables/37-rest-api-complete-spec.md`
- **Section:** §8.18 Request Schema

**scope 테이블:**
| scope | 동작 | IChainAdapter 호출 |
|-------|------|-------------------|
| "all" | 네이티브 + SPL 토큰 + rent 전량 회수 | sweepAll(from, to) |
| "native" | 네이티브 자산만 회수 | getBalance() + estimateFee() + sendNative() |
✓ Found at line 2665

**Part 2: scope "native" WithdrawService 로직**
- **File:** `.planning/deliverables/27-chain-adapter-interface.md`
- **Section:** §6.11.5

**scope "native" 구현 패턴:**
```typescript
// WithdrawService.sendNative() 의사 코드
async sendNative(agent: Agent): Promise<WithdrawResult> {
  const balance = await chainAdapter.getBalance(agent.publicKey)
  if (balance === '0') return { /* empty result */ }
  const fee = await chainAdapter.estimateFee({ /* transfer */ })
  const amount = BigInt(balance) - BigInt(fee)
  if (amount <= 0n) throw new InternalError('INSUFFICIENT_FOR_FEE')
  const txHash = await chainAdapter.sendNative(from, to, amount.toString())
  return { totalTransactions: 1, nativeRecovered: amount.toString(), ... }
}
```
✓ Found at §6.11.5 lines 2491-2540

**Scope 분기 테이블:**
| scope | Service 호출 | Adapter 호출 | 실행 내용 | rent 회수 |
|-------|-------------|-------------|----------|-----------|
| "all" | sweepAll(agent) | sweepAll(from, to) | 전량 전송+closeAccount | 포함 |
| "native" | sendNative(agent) | getBalance+estimateFee+sendNative | 네이티브만 전송 (fee 차감) | 미포함 |
✓ Found at §6.11.5 line 2543

**Design decision:**
- scope 분기는 WithdrawService 수준
- IChainAdapter.sweepAll()에 scope 파라미터 추가하지 않음 (31-02 결정)
- scope "native"는 신규 IChainAdapter 메서드 추가 없음 (기존 메서드 조합)
✓ Found at §6.11.5 lines 2487-2489

---

### SC-4: 유예 구간 withdraw 비활성화 보안 정책

**Status:** ✓ VERIFIED

**Evidence:**
- **File:** `.planning/deliverables/37-rest-api-complete-spec.md`
- **Section:** §8.18 에러 코드 매트릭스

**WITHDRAW_LOCKED_ONLY 에러 코드:**
```
에러 코드: WITHDRAW_LOCKED_ONLY
HTTP: 403
retryable: false
조건: resolveOwnerState() !== LOCKED (유예 구간 포함)
```
✓ Found at line 2721

**보안 근거 (WITHDRAW-08):**
> "유예 구간(owner_verified = 0)에서 withdraw를 허용하면, 공격자가 masterAuth 탈취 후 
> `set-owner(자기 주소)` -> 즉시 withdraw로 자금을 탈취할 수 있다. 
> LOCKED 상태(owner_verified = 1)에서만 활성화하여 이 공격을 차단한다 (32-02 H-02 방어). 
> resolveOwnerState(agent) !== 'LOCKED'이면 GRACE, NONE 모두 거부된다."
✓ Found at lines 2725-2726

**Attack scenario table:**
| 공격 시나리오 | 결과 |
|-------------|------|
| masterAuth 유출 -> withdraw 호출 | 자금 -> Owner 지갑 (공격자 이득 없음) |
| masterAuth 유출 -> 주소 변경 -> withdraw | 잠금 구간이면 ownerAuth 필요 -> 차단 |
| masterAuth 유출 -> 유예 구간에서 주소 변경 -> withdraw | **withdraw 비활성화** (WITHDRAW_LOCKED_ONLY) |
✓ Found at lines 2643-2645

**WithdrawService validation:**
```typescript
if (resolveOwnerState(agent) !== 'LOCKED') {
  throw new ForbiddenError('WITHDRAW_LOCKED_ONLY')
}
```
✓ Found in WithdrawService pseudocode at line 2806

**Wiring to resolveOwnerState():**
- WithdrawService imports resolveOwnerState() from Phase 31
- OwnerState calculation: (ownerAddress, ownerVerified) → NONE/GRACE/LOCKED
- GRACE (owner_verified=0) and NONE (owner_address=null) both blocked
✓ Found at §8.18.1 line 2787

---

### SC-5: Kill Switch 복구 + 세션 갱신 Owner 분기

**Status:** ✓ VERIFIED

**Part A: Kill Switch 복구 대기 시간 분기**

**Evidence:**
- **File:** `.planning/deliverables/36-killswitch-autostop-evm.md`
- **Section:** §4.7
- **Location:** Lines 642-740

**Owner 유무별 복구 대기 시간 테이블:**
| 시나리오 | 인증 | 대기 시간 | 근거 |
|---------|------|----------|------|
| Owner 있음 (시스템 내 1개라도) | ownerAuth + masterAuth | 30분 (1,800초) | Owner 서명이 이중 인증 역할 |
| Owner 없음 (모든 에이전트 미등록) | masterAuth만 | 24시간 (86,400초) | 이중 인증 부재를 시간으로 보상 |
✓ Found at §4.7.1 line 653

**Owner 유무 판단 기준:**
- 시스템 전체 동작 (에이전트별 분기 부적절)
- 판단 쿼리: `SELECT 1 FROM agents WHERE owner_address IS NOT NULL LIMIT 1`
- 한 명이라도 Owner 있으면 "Owner 있음" 시나리오 적용
✓ Found at §4.7.2 lines 653-680

**2단계 복구 패턴:**

**Step 1: 복구 개시 (최초 요청)**
1. kill_switch_status === 'ACTIVATED' 확인
2. masterAuth 검증 (Argon2id)
3. Owner 유무 판단 (쿼리 실행)
4. Owner 있음: ownerAuth 검증 추가 (action='recover')
5. waitSeconds 결정: hasOwner ? 1800 : 86400
6. system_state 기록:
   - kill_switch_status = 'RECOVERING'
   - recovery_eligible_at = now + waitSeconds
   - recovery_wait_seconds = waitSeconds
7. 응답: 202 Accepted + { recoveryEligibleAt, waitSeconds, hasOwner }
✓ Found at §4.7.3 lines 684-710

**Step 2: 복구 완료 (대기 후 요청)**
1. kill_switch_status === 'RECOVERING' 확인
2. now >= recovery_eligible_at 확인
3. 미경과 시: 409 RECOVERY_WAIT_REQUIRED + { remainingSeconds }
4. 경과 시: 실제 복구 수행 (RECOVERING → NORMAL)
5. 응답: 200 OK + { status: 'NORMAL' }
✓ Found at §4.7.3 lines 711-730

**system_state 키 추가:**
- `recovery_eligible_at`: Unix epoch 초
- `recovery_wait_seconds`: 1800 또는 86400
- `kill_switch_status`: NORMAL | ACTIVATED | **RECOVERING** (3-state)
✓ Found at §4.7 line 691, 789

**config.toml 설정:**
```toml
[security]
kill_switch_recovery_wait_owner = 1800
kill_switch_recovery_wait_no_owner = 86400
```
✓ Mentioned at §4.7.3 (config.toml 설정 가능 여부)

**Error codes:**
- KILL_SWITCH_NOT_ACTIVE (409)
- OWNER_AUTH_REQUIRED (401)
- RECOVERY_WAIT_REQUIRED (409)
- RECOVERY_ALREADY_STARTED (409)
✓ Error codes section present (verified via grep)

---

**Part B: 세션 갱신 Owner 분기**

**Evidence:**
- **File:** `.planning/deliverables/53-session-renewal-protocol.md`
- **Section:** §6.6
- **Location:** Lines 779-900

**OwnerState별 갱신 분기 테이블:**
| OwnerState | 갱신 동작 | 알림 내용 | 거부 윈도우 | 근거 |
|-----------|---------|---------|-----------|------|
| NONE (Owner 없음) | 즉시 확정 | "세션 갱신됨 (3/30)" 정보성 | 없음 | 거부할 Owner가 없음 |
| GRACE (Owner 유예) | 즉시 확정 | "세션 갱신됨 (3/30)" 정보성 | 없음 | Owner 검증 미완료 |
| LOCKED (Owner 잠금) | 갱신 후 알림 | "세션 갱신됨" + [거부하기] | 활성 (1시간) | Owner 검증 완료 |
✓ Found at §6.6.1 line 783

**갱신 처리 후 알림 분기 코드:**
```typescript
const ownerState = resolveOwnerState({
  ownerAddress: agent.owner_address,
  ownerVerified: !!agent.owner_verified,
})

if (ownerState === 'LOCKED') {
  notificationService.notify({
    type: 'SESSION_RENEWED',
    context: {
      rejectButton: true,
      rejectWindowExpiry,
      rejectUrl,
    }
  })
} else {
  notificationService.notify({
    type: 'SESSION_RENEWED',
    context: { rejectButton: false }
  })
}
```
✓ Found at §6.6.2 lines 795-844

**SESSION_RENEWED context 확장:**
| 필드 | 타입 | 조건 | 설명 |
|------|------|------|------|
| rejectButton | boolean | 항상 | true = [거부하기] 렌더링, false = 버튼 없음 |
| rejectWindowExpiry | string | rejectButton=true | 거부 윈도우 만료 시각 |
| rejectUrl | string | rejectButton=true | [거부하기] URL (nonce 포함) |
✓ Found at §6.6.3 line 852

**거부 메커니즘:**
- 기존 DELETE /v1/sessions/:id 재활용 (새 엔드포인트 없음)
- [거부하기] URL → 대시보드 → masterAuth(implicit) → DELETE
✓ Found at §6.6.4 line 863

**거부 윈도우 의미:**
- 알림 문구에 표시되는 안내일 뿐
- Owner는 세션 유효 시 언제든 DELETE 가능 (하드 차단 없음)
- [거부하기] URL 유효 기간: 세션 유효 기간 내 항상 동작
✓ Found at §6.6.5 line 874

---

**Part C: [거부하기] 버튼 3채널 명세**

**Evidence:**
- **File:** `.planning/deliverables/35-notification-architecture.md`
- **Section:** SESSION_RENEWED Owner LOCKED
- **Location:** Lines 2215-2375

**[거부하기] 버튼 3채널 구현:**

**1. Telegram (InlineKeyboardMarkup url 기반):**
```json
{
  "reply_markup": {
    "inline_keyboard": [[
      { 
        "text": "❌ 거부하기 (세션 폐기)", 
        "url": "http://127.0.0.1:3100/v1/dashboard/sessions/{sessionId}/reject?nonce={nonce}" 
      }
    ]]
  }
}
```
- url 기반 (callback_data 아님)
- TX_APPROVAL_REQUEST와 동일 패턴 (33-02 확정)
✓ Found at lines 2294-2304

**2. Discord (Embed markdown 링크):**
```json
{
  "embeds": [{
    "fields": [
      { 
        "name": "❌ 거부하기", 
        "value": "[세션 폐기]({rejectUrl})\n예상치 못한 갱신이라면 위 링크로 세션을 폐기하세요." 
      }
    ]
  }]
}
```
- Webhook은 Button 미지원 → Embed markdown 링크 사용
- 33-02 확정 패턴과 동일
✓ Found at lines 2306-2330

**3. ntfy.sh (Actions view 타입):**
```
Actions: view, ❌ 거부하기, {rejectUrl}
```
- `view` 타입으로 브라우저에서 URL 열기
- `http` 타입 사용하지 않음 (대시보드 거쳐야 함)
- 33-02 확정 패턴과 동일
✓ Found at lines 2339-2349

**[거부하기] URL 보안 테이블:**
| 보안 항목 | 대책 |
|---------|------|
| nonce 1회용 | nonce는 1회용 토큰, 세션 폐기 완료 시 무효화 |
| localhost 한정 | 127.0.0.1:3100로 외부 노출 없음 |
| masterAuth(implicit) | 데몬 접근 = masterAuth 충족 |
| DELETE 재활용 | 새 엔드포인트 없음, 기존 API 사용 |
| 거부 윈도우 비강제 | URL은 세션 유효 시 항상 동작 |
| APPROVAL과의 차이 | APPROVAL은 ownerAuth 필수, 거부는 masterAuth만 |
✓ Found at lines 2352-2362

**Owner 분기 템플릿 2종:**
1. Owner 없음/GRACE (rejectButton=false): 정보성 알림만
2. Owner LOCKED (rejectButton=true): 정보성 + [거부하기] 버튼
✓ Both templates found at §SESSION_RENEWED lines 2226-2349

---

## Required Artifacts Verification

### Artifact 1: 37-rest-api-complete-spec.md

**Status:** ✓ VERIFIED

| Check | Result | Details |
|-------|--------|---------|
| Exists | ✓ | File present at deliverables/ |
| Substantive | ✓ | 3,581 lines (exceeds 15-line minimum for docs) |
| Stub patterns | ✓ NO_STUBS | No TODO/FIXME/placeholder patterns found |
| v0.8 tags | ✓ | [v0.8] tags present for all Phase 34 additions |

**Key sections verified:**
- §1.4: Endpoint count updated (37 → 38) ✓
- §8.18: POST /v1/owner/agents/:agentId/withdraw complete spec ✓
- §8.18.1: WithdrawService domain service design ✓
- §10.9: WITHDRAW domain error codes (4 new codes) ✓
- Authentication map: withdraw endpoint added ✓

---

### Artifact 2: 27-chain-adapter-interface.md

**Status:** ✓ VERIFIED

| Check | Result | Details |
|-------|--------|---------|
| Exists | ✓ | File present at deliverables/ |
| Substantive | ✓ | 3,502 lines (exceeds 15-line minimum for docs) |
| Stub patterns | ✓ NO_STUBS | No TODO/FIXME/placeholder patterns found |
| v0.8 tags | ✓ | [v0.8] tags present for Phase 34 additions |

**Key sections verified:**
- §3.2: sweepAll method signature (20th method) ✓
- §6.11: sweepAll Solana implementation guidance ✓
- §6.11.1: 4-stage execution order detailed ✓
- §6.11.2: SOL last transfer rationale (WITHDRAW-07) ✓
- §6.11.3: Partial failure handling (batch → fallback) ✓
- §6.11.4: SolanaAdapter.sweepAll implementation code ✓
- §6.11.5: scope "native" WithdrawService logic ✓
- §6.11.6: EVM sweepAll reference (EvmStub) ✓

**Technical details verified:**
- buildBatch() usage: 24 occurrences ✓
- closeAccount for rent recovery: 24 occurrences ✓
- Max 10 tokens/batch (1232 byte limit) ✓
- Batch failure → individual fallback pattern ✓

---

### Artifact 3: 36-killswitch-autostop-evm.md

**Status:** ✓ VERIFIED

| Check | Result | Details |
|-------|--------|---------|
| Exists | ✓ | File present at deliverables/ |
| Substantive | ✓ | 2,175 lines (exceeds 15-line minimum for docs) |
| Stub patterns | ✓ NO_STUBS | No TODO/FIXME/placeholder patterns found |
| v0.8 tags | ✓ | [v0.8] tags present for Phase 34 additions |

**Key sections verified:**
- §4.7: Owner 유무별 복구 대기 시간 분기 ✓
- §4.7.1: Owner branching table (30min vs 24h) ✓
- §4.7.2: Owner existence query (system-level) ✓
- §4.7.3: 2-step recovery pattern ✓
- State diagram: RECOVERING state added ✓
- system_state keys: recovery_eligible_at, recovery_wait_seconds ✓
- IKillSwitchService: recover() interface updated ✓
- Error codes: 4 new codes (RECOVERY_WAIT_REQUIRED, etc.) ✓

---

### Artifact 4: 53-session-renewal-protocol.md

**Status:** ✓ VERIFIED

| Check | Result | Details |
|-------|--------|---------|
| Exists | ✓ | File present at deliverables/ |
| Substantive | ✓ | 1,100 lines (exceeds 15-line minimum for docs) |
| Stub patterns | ✓ NO_STUBS | No TODO/FIXME/placeholder patterns found |
| v0.8 tags | ✓ | [v0.8] tags present for Phase 34 additions |

**Key sections verified:**
- §6.6: 세션 갱신 Owner 분기 ✓
- §6.6.1: OwnerState별 갱신 분기 테이블 ✓
- §6.6.2: 갱신 처리 후 알림 분기 의사 코드 ✓
- §6.6.3: SESSION_RENEWED context 확장 (rejectButton/rejectUrl/rejectWindowExpiry) ✓
- §6.6.4: 거부 메커니즘 (DELETE 재활용) ✓
- §6.6.5: 거부 윈도우 의미 명확화 ✓

---

### Artifact 5: 35-notification-architecture.md

**Status:** ✓ VERIFIED

| Check | Result | Details |
|-------|--------|---------|
| Exists | ✓ | File present at deliverables/ |
| Substantive | ✓ | 2,602 lines (exceeds 15-line minimum for docs) |
| Stub patterns | ✓ NO_STUBS | No TODO/FIXME/placeholder patterns found |
| v0.8 tags | ✓ | [v0.8] tags present for Phase 34 additions |

**Key sections verified:**
- SESSION_RENEWED Owner 분기 템플릿 2종 ✓
- [거부하기] 버튼 Telegram 구현 (InlineKeyboard url) ✓
- [거부하기] 버튼 Discord 구현 (Embed markdown 링크) ✓
- [거부하기] 버튼 ntfy.sh 구현 (Actions view) ✓
- [거부하기] URL 보안 테이블 ✓
- context 필드 확장 (rejectButton/rejectUrl/rejectWindowExpiry/nonce) ✓

---

## Key Link Verification

### Link 1: WithdrawService → IChainAdapter.sweepAll

**Pattern:** API Service → Chain Adapter

**From:** 37-rest-api-complete-spec.md WithdrawService
**To:** 27-chain-adapter-interface.md sweepAll
**Via:** scope "all" 분기 → chainAdapter.sweepAll(from, to) 호출

**Status:** ✓ WIRED

**Evidence:**
```typescript
// 37-rest-api §8.18.1 WithdrawService
const result = scope === 'all'
  ? await chainAdapter.sweepAll(agent.publicKey, agent.ownerAddress)
  : await this.sendNative(agent)
```
- WithdrawService pseudocode references sweepAll() ✓
- sweepAll() signature matches IChainAdapter §3.2 ✓
- scope "all" branch explicitly calls sweepAll() ✓

---

### Link 2: WithdrawService → OwnerState validation

**Pattern:** Service → State Validation

**From:** 37-rest-api WithdrawService
**To:** Phase 31 resolveOwnerState()
**Via:** `if (resolveOwnerState(agent) !== 'LOCKED') throw WITHDRAW_LOCKED_ONLY`

**Status:** ✓ WIRED

**Evidence:**
```typescript
// 37-rest-api §8.18.1 WithdrawService
if (resolveOwnerState(agent) !== 'LOCKED') {
  throw new ForbiddenError('WITHDRAW_LOCKED_ONLY')
}
```
- WithdrawService imports resolveOwnerState() from Phase 31 ✓
- LOCKED check implemented ✓
- GRACE/NONE both rejected ✓

---

### Link 3: Kill Switch recovery → Owner existence query

**Pattern:** System State → Database Query

**From:** 36-killswitch recovery Step 1
**To:** agents.owner_address IS NOT NULL query
**Via:** Owner 유무 판단으로 waitSeconds 결정

**Status:** ✓ WIRED

**Evidence:**
```sql
-- 36-killswitch §4.7.2
SELECT 1 FROM agents WHERE owner_address IS NOT NULL LIMIT 1
```
- Query explicitly specified ✓
- Result determines hasOwner boolean ✓
- hasOwner → waitSeconds branching (1800 vs 86400) ✓

---

### Link 4: Session renewal → resolveOwnerState()

**Pattern:** Service → State Validation

**From:** 53-session-renewal renewSession()
**To:** Phase 31 resolveOwnerState()
**Via:** OwnerState 산출로 rejectButton 플래그 설정

**Status:** ✓ WIRED

**Evidence:**
```typescript
// 53-session §6.6.2
const ownerState = resolveOwnerState({
  ownerAddress: agent.owner_address,
  ownerVerified: !!agent.owner_verified,
})

if (ownerState === 'LOCKED') {
  context.rejectButton = true
} else {
  context.rejectButton = false
}
```
- resolveOwnerState() called with agent data ✓
- Result used to set rejectButton flag ✓
- Flag controls notification template branching ✓

---

### Link 5: [거부하기] button → DELETE /v1/sessions/:id

**Pattern:** UI Action → API Endpoint

**From:** 35-notification [거부하기] URL
**To:** DELETE /v1/sessions/:id (existing endpoint)
**Via:** Dashboard page + masterAuth(implicit)

**Status:** ✓ WIRED

**Evidence:**
```
URL: http://127.0.0.1:3100/v1/dashboard/sessions/{sessionId}/reject?nonce={nonce}
→ Dashboard page loads
→ masterAuth(implicit) via daemon access
→ DELETE /v1/sessions/:id executed
```
- [거부하기] URL points to dashboard ✓
- Dashboard executes DELETE API ✓
- No new endpoint created (reuse confirmed) ✓
- masterAuth(implicit) authentication flow specified ✓

---

## Requirements Coverage

| Requirement | Status | Evidence |
|------------|--------|----------|
| WITHDRAW-01 | ✓ SATISFIED | POST /v1/owner/agents/:agentId/withdraw API spec (37 §8.18) |
| WITHDRAW-02 | ✓ SATISFIED | 수신 주소 owner_address 고정 명시 + ownerAuth 불필요 근거 (37 §8.18) |
| WITHDRAW-03 | ✓ SATISFIED | scope "all" 전량 회수 (37 §8.18 + 27 §6.11.4) |
| WITHDRAW-04 | ✓ SATISFIED | scope "native" 분기 (37 §8.18 + 27 §6.11.5) |
| WITHDRAW-05 | ✓ SATISFIED | HTTP 207 + failed 배열 (37 §8.18 line 2710, 2742) |
| WITHDRAW-07 | ✓ SATISFIED | SOL 마지막 전송 (27 §6.11.2) |
| WITHDRAW-08 | ✓ SATISFIED | 유예 구간 비활성화 WITHDRAW_LOCKED_ONLY (37 §8.18 line 2721, 2725) |
| SECURITY-01 | ✓ SATISFIED | Owner 없음 복구 24h (36 §4.7.1) |
| SECURITY-02 | ✓ SATISFIED | Owner 있음 복구 30min + ownerAuth (36 §4.7.1) |
| SECURITY-03 | ✓ SATISFIED | Owner 없음 세션 갱신 즉시 확정 (53 §6.6.1) |
| SECURITY-04 | ✓ SATISFIED | Owner 있음 세션 갱신 [거부하기] (53 §6.6.1) |
| NOTIF-03 | ✓ SATISFIED | [거부하기] 버튼 3채널 (35 §SESSION_RENEWED) |

**Total:** 12/12 requirements satisfied

---

## Anti-Patterns Scan

**Files scanned:**
- .planning/deliverables/37-rest-api-complete-spec.md
- .planning/deliverables/27-chain-adapter-interface.md
- .planning/deliverables/36-killswitch-autostop-evm.md
- .planning/deliverables/53-session-renewal-protocol.md
- .planning/deliverables/35-notification-architecture.md

**Scan results:**

| Pattern | Severity | Count | Details |
|---------|----------|-------|---------|
| TODO/FIXME comments | ⚠️ Warning | 0 | None found |
| Placeholder content | 🛑 Blocker | 0 | None found |
| Empty implementations | 🛑 Blocker | 0 | All pseudocode substantive |
| Console.log only | ⚠️ Warning | 0 | None found |

**Open Questions documented:**
1. Kill Switch withdraw 처리 방안 (37 §8.18.2)
   - 방안 A: killSwitchGuard 허용 목록 추가
   - 방안 B: CLI 직접 실행
   - **Status:** ℹ️ Info -- 구현 시 결정 (Phase 35 DX에서 함께 결정)

**Anti-pattern check:** ✓ PASSED (no blockers or warnings)

---

## Overall Assessment

**Status:** ✓ PASSED

**Summary:**
- All 5 success criteria verified
- All 12 requirements satisfied
- All 5 required artifacts substantive and wired
- All 5 key links verified as connected
- No anti-patterns or blockers found
- 1 open question documented for Phase 35

**Strengths:**
1. Comprehensive withdraw API specification with complete Zod schemas
2. Detailed 4-stage sweepAll execution order with batch fallback strategy
3. Clear Owner branching for both Kill Switch recovery and session renewal
4. Consistent [v0.8] tagging for traceability
5. Security rationales clearly documented (H-02 defense, attack scenarios)
6. 3-channel notification implementation with security considerations

**Quality indicators:**
- Total documentation: 12,960 lines across 5 files
- Audit log events: 5 references (FUND_WITHDRAWN, FUND_PARTIALLY_WITHDRAWN, etc.)
- Batch implementation: 24 references (buildBatch, closeAccount)
- All pseudocode includes error handling and edge cases
- Config.toml integration specified for recovery wait times

**Phase goal achievement:** ✓ FULLY ACHIEVED

> Owner 등록된 에이전트의 자금 전량 회수 프로토콜과, Owner 유무별 Kill Switch 복구/세션 갱신 분기가 설계되었다.

---

**Verification Complete**

_Verified: 2026-02-09T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Status: PASSED - All must-haves verified, goal achieved_
