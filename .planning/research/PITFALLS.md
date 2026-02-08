# Domain Pitfalls: Owner 선택적 등록 + 점진적 보안 모델

**Domain:** Self-hosted AI agent wallet daemon -- optional owner/guardian registration and progressive security unlock
**Project:** WAIaaS v0.8
**Researched:** 2026-02-08
**Overall Confidence:** MEDIUM-HIGH (cross-referenced with v0.5-v0.7 design documents, Argent guardian model, Solana token program, PortSwigger state machine research, SQLite migration patterns)

---

## Overview

이 문서는 **기존에 Owner 필수(NOT NULL)로 설계된 시스템에 Owner 선택적 등록(nullable)과 점진적 보안 해금 모델을 추가할 때** 발생하는 함정을 다룬다. 기존 v0.2 PITFALLS.md의 일반적 보안 함정(AES-GCM nonce 재사용, Argon2id 파라미터, 메모리 안전 등)과는 달리, v0.8 특유의 상태 전이, 정책 다운그레이드, 자금 회수, 스키마 마이그레이션 위험에 집중한다.

각 함정은 **Critical(재작성 수준)**, **High(보안 열화 또는 자금 위험)**, **Moderate(기술 부채 또는 UX 혼란)** 3단계로 분류한다.

---

## Critical Pitfalls

재작성 수준의 보안 결함 또는 자금 손실을 야기하는 실수.

---

### C-01: Grace-to-Locked 전이 레이스 컨디션 -- Owner 주소 탈취 윈도우

**Severity:** CRITICAL
**Confidence:** HIGH (PortSwigger state machine research, Argent 36h guardian delay 패턴, WAIaaS v0.8 objective 분석)

**What goes wrong:**
유예 구간(owner_verified = 0)에서 잠금 구간(owner_verified = 1)으로 전이하는 순간에 레이스 컨디션이 존재한다. 공격 시나리오:

1. 공격자가 masterAuth를 탈취한다
2. 공격자가 `agent set-owner`로 자신의 주소를 등록한다 (유예 구간이므로 masterAuth만 필요)
3. 공격자가 자신의 주소로 ownerAuth를 수행한다 (owner_verified = 1로 전이)
4. 이제 잠금 구간이므로 원래 사용자는 ownerAuth(공격자 주소) + masterAuth 없이 변경 불가
5. 공격자가 `withdraw` API로 전 자산을 자신의 owner_address로 회수

핵심 문제: **ownerAuth 최초 사용(owner_verified 0->1 전이)과 masterAuth 주소 변경 사이에 원자성이 보장되지 않으면, 두 연산이 동시 실행될 수 있다.** 예를 들어:
- Thread A: ownerAuth 검증 중 (아직 owner_verified 갱신 전)
- Thread B: masterAuth로 주소 변경 요청 처리 중 (아직 유예 구간으로 판단)

**Why it happens:**
- owner_verified 플래그 갱신과 ownerAuth 검증이 단일 트랜잭션 안에 있지 않음
- Node.js 이벤트 루프에서 동시에 두 HTTP 요청이 처리될 때, SQLite 읽기 시점과 쓰기 시점 사이에 갭 존재
- 유예→잠금 전이가 명시적 상태 머신이 아닌 단순 플래그 토글로 구현됨

**Warning signs:**
- owner_verified 갱신이 ownerAuth 미들웨어에서 "사후" 처리됨 (검증 성공 후 별도 UPDATE)
- 주소 변경 API에서 owner_verified를 SELECT한 뒤 별도 트랜잭션으로 판단
- 두 엔드포인트(ownerAuth 사용 / 주소 변경)가 같은 DB 행을 동시에 읽고 쓸 수 있는 구조

**Prevention:**
1. **BEGIN IMMEDIATE 트랜잭션으로 owner_verified 전이를 원자화:** ownerAuth가 최초 사용되는 순간, 같은 DB 트랜잭션 안에서 owner_verified = 1을 SET하고 응답을 반환한다. 별도 비동기 갱신 금지.
2. **주소 변경 API에서 owner_verified를 트랜잭션 내 재확인:** `SELECT owner_verified FROM agents WHERE id = ? FOR UPDATE` 패턴으로 읽기 시점의 상태를 잠근다. SQLite에서는 `BEGIN IMMEDIATE` + `SELECT ... WHERE owner_verified = 0`으로 경합 방지.
3. **상태 전이 이벤트 로깅:** owner_verified 0->1 전이 시 audit_log에 즉시 기록. 이후 24시간 내 주소 변경 시도가 있으면 추가 알림.
4. **owner_verified 전이 후 쿨다운:** 전이 후 최소 5분간 주소 변경 불가 (Argent의 36h 대기 패턴의 최소 적용).

**Phase:** Owner 등록/변경 API 구현 시 (v1.2 인증+정책 단계)

---

### C-02: Security Downgrade Attack -- masterAuth로 Owner 제거 후 APPROVAL 우회

**Severity:** CRITICAL
**Confidence:** HIGH (v0.8 objective 분석, Argent guardian removal 36h delay 패턴 참조)

**What goes wrong:**
유예 구간(owner_verified = 0)에서 masterAuth만으로 Owner를 제거(`remove-owner`)할 수 있다. 공격 시나리오:

1. 운영자가 에이전트 생성 시 Owner를 등록한다 (`--owner 7xKXtg...`)
2. 아직 ownerAuth를 사용하지 않았으므로 유예 구간
3. masterAuth가 유출된다 (에이전트 코드, 환경 변수, 설정 파일 등)
4. 공격자가 `remove-owner`로 Owner를 제거한다
5. APPROVAL 티어가 DELAY로 다운그레이드된다
6. 이전에 APPROVAL로 차단되던 고액 거래가 이제 DELAY(15분 대기)만으로 실행된다
7. Kill Switch 복구도 24시간 대기(Owner 없음)로 변경되어 오히려 악용 가능

**핵심 위험:** Owner 등록 직후~ownerAuth 최초 사용 사이의 유예 구간이 길수록, masterAuth 유출 시 보안 다운그레이드 윈도우가 넓어진다. 사용자는 "Owner를 등록했으니 안전하다"고 믿지만, 실제로는 ownerAuth를 한 번도 사용하지 않으면 보호 효과가 없다.

**Why it happens:**
- 유예 구간의 존재 의의("오타 교정")와 보안 보장 사이의 근본적 긴장
- 사용자가 Owner 등록 후 ownerAuth를 즉시 사용하지 않을 합리적 기대
- Owner 등록 시 서명 검증을 하지 않는 설계 결정(주소는 공개 정보)

**Warning signs:**
- Owner 등록 후 ownerAuth 사용까지의 평균 시간이 24시간 이상
- `remove-owner` 명령에 추가 확인 메커니즘이 없음
- Owner 등록/제거 이벤트 알림이 없거나 선택적

**Prevention:**
1. **유예 구간 시간 제한:** Owner 등록 후 최대 1시간까지만 유예 구간 유지. 이후 자동으로 유예 구간이 만료되어 변경 시 ownerAuth 필요. (owner_verified는 여전히 0이지만, 유예 기간 경과 후에는 ownerAuth가 필요한 "준잠금" 상태로 전환)
2. **Owner 등록/제거 시 전 채널 알림:** Owner 등록, 변경, 제거 시 즉시 모든 알림 채널로 통보. 특히 제거 시 "보안 수준이 저하됩니다" 경고 포함.
3. **remove-owner에 확인 지연:** 유예 구간에서도 제거 요청 후 5분 쿨다운. 이 시간 동안 알림 수신 후 취소 가능.
4. **CLI 경고 메시지:** `remove-owner` 실행 시 "APPROVAL 티어가 비활성화됩니다. 계속하시겠습니까?" 명시적 확인.
5. **audit_log에 보안 수준 변경 기록:** `SECURITY_LEVEL_DOWNGRADE` 이벤트 타입으로 Owner 제거를 기록.

**Phase:** Owner 등록/변경/해제 API 및 CLI 구현 시 (v1.2 인증+정책)

---

### C-03: sweepAll 부분 실패 시 잔여 자산 고립 (Partial Sweep Orphan)

**Severity:** CRITICAL
**Confidence:** HIGH (Solana CloseAccount 문서, 토큰 계정 rent recovery 메커니즘 검증)

**What goes wrong:**
sweepAll의 207(부분 성공) 응답 시, 이후 상태가 불일치한다. 구체적 시나리오:

1. 에이전트가 SOL + USDC + BONK + 3개 소액 토큰을 보유
2. Owner가 `withdraw(scope: all)` 호출
3. SOL 전송 성공, USDC 전송 성공
4. BONK 전송 실패 (네트워크 일시 장애)
5. 소액 토큰 3개의 closeAccount 실패 (BONK 토큰 계정에 잔액 남아 close 불가)
6. 응답: 207 + `failed: [{ mint: "DezXA...", error: "transfer failed" }]`

**이후 문제:**
- SOL이 이미 전송되었으므로 남은 토큰의 재시도에 필요한 tx fee가 없을 수 있음
- 네이티브 SOL 전량 전송을 마지막에 실행하면, 중간 토큰 실패 시 SOL은 아직 남아 있지만 재시도 로직이 없으면 수동 개입 필요
- 부분 성공 상태에서 에이전트가 남은 토큰으로 거래를 계속 시도할 수 있음
- Kill Switch 상태에서의 sweepAll 부분 실패 시, 재시도 경로가 killSwitchGuard에 의해 차단될 수 있음

**Solana 특유의 edge case:**
- 토큰 계정 잔액이 0이 아니면 `CloseAccount` instruction 실패 -- transfer + closeAccount를 같은 배치에 넣어야 원자적
- 토큰 계정이 ATA(Associated Token Account)가 아닌 보조 계정일 수 있음 -- `getTokenAccountsByOwner`로 전수 조사 필요
- Solana 단일 트랜잭션에 최대 ~24개 계정 참조 가능 -- 토큰 종류가 많으면 여러 트랜잭션 필요
- 각 트랜잭션의 blockhash가 만료되면 재시도 시 새 blockhash 필요

**Why it happens:**
- sweepAll을 단일 원자적 연산으로 설계하기 불가능 (토큰 수에 따라 여러 tx 필요)
- 실패 시 재시도 로직이 없거나 불완전
- SOL 전송 순서가 잘못됨 (SOL을 먼저 보내면 토큰 tx fee 부족)

**Prevention:**
1. **SOL 전송을 반드시 마지막에 실행:** v0.8 objective의 5.4절 순서를 엄격 준수. 토큰 전부 처리 후 `잔액 - estimated_fee`만큼 SOL 전송.
2. **토큰별 transfer + closeAccount를 같은 Solana 트랜잭션에 원자적으로 묶기:** `buildBatch()`로 `transferChecked + closeAccount`를 하나의 배치 instruction으로.
3. **부분 실패 시 자동 재시도 (최대 3회):** 실패한 토큰만 별도 트랜잭션으로 재시도. 재시도 사이에 2초 간격.
4. **sweepAll 전용 SOL 예약:** 토큰 sweep 전에 예상 tx fee(토큰 수 x 5000 lamports + 여유분)를 계산하고, 이 금액은 SOL sweep에서 제외하여 재시도에 사용.
5. **207 응답 시 잔여 자산 목록 반환 + 재시도 가이드:** `failed` 배열에 mint 주소, 잔액, 실패 원인을 상세히 포함. CLI에서 `waiaas agent sweep-retry <agentId>` 명령 제공.
6. **Kill Switch 상태에서의 sweepAll 경로 확보:** killSwitchGuard 허용 목록에 withdraw 엔드포인트를 추가하거나, 복구 프로세스 내에서 sweepAll을 호출하는 방식으로 경로 보장.

**Phase:** sweepAll 구현 시 (v1.4 토큰+컨트랙트 확장 -- IChainAdapter.sweepAll)

---

## High Pitfalls

보안 열화, 자금 위험, 또는 주요 재작업을 야기하는 실수.

---

### H-01: APPROVAL->DELAY 다운그레이드 레이스 컨디션 -- Owner 등록 직후의 정책 갭

**Severity:** HIGH
**Confidence:** HIGH (v0.8 objective 3절 다운그레이드 삽입 지점 분석)

**What goes wrong:**
Owner가 등록되는 순간과 정책 엔진이 이를 반영하는 순간 사이에 갭이 존재한다:

1. 에이전트에 Owner가 없음 (APPROVAL -> DELAY 다운그레이드 활성)
2. 15 SOL 거래 요청 → evaluate() → APPROVAL → **DELAY로 다운그레이드** → 15분 대기 시작
3. 대기 중(DELAY 쿨다운 진행 중) 운영자가 `set-owner`로 Owner 등록
4. 15분 경과 → DELAY 큐 처리기가 거래를 자동 실행
5. **문제:** Owner 등록 후에는 이 거래가 APPROVAL 티어여야 했음 -- Owner의 서명 없이 실행됨

반대 방향도 위험:
1. 에이전트에 Owner 있음 → 15 SOL 거래 → APPROVAL → Owner 서명 대기
2. 유예 구간에서 `remove-owner` 실행
3. APPROVAL 대기 중이던 거래의 처리 방식이 불분명 (계속 대기? 자동 실행? 취소?)

**Why it happens:**
- 정책 평가(evaluate)가 요청 시점에 1회만 실행되고, 실행 시점에 재평가하지 않음
- Owner 등록/제거가 기존 대기 중 거래에 영향을 주는지 명시적 정의 없음
- DELAY/APPROVAL 대기 큐에 "평가 시점의 Owner 상태"가 기록되지 않음

**Warning signs:**
- pending_transactions 테이블에 평가 시점의 owner_address 스냅샷이 없음
- Owner 변경 시 pending queue를 재검토하는 로직이 없음
- 큐 처리기에서 실행 전 re-evaluate를 하지 않음

**Prevention:**
1. **실행 시점 재평가(re-validate):** 이미 v0.2 PITFALLS H-01에서 제시한 "실행 시점 재검증" 원칙을 Owner 상태에도 확장. DELAY 만료 시 `agent.owner_address`를 재확인하고, Owner가 추가되었으면 APPROVAL로 재분류.
2. **Owner 변경 시 pending queue 재분류:** `set-owner` 또는 `remove-owner` 실행 시 해당 에이전트의 모든 PENDING 거래를 재평가. Owner 추가 시: DELAY(다운그레이드된 것) -> APPROVAL로 승격, Owner 제거 시: APPROVAL 대기 -> 취소(Owner 서명을 받을 수 없으므로).
3. **pending_transactions에 evaluated_with_owner 플래그 저장:** 평가 시 Owner 존재 여부를 기록하여 상태 변경 감지에 활용.

**Phase:** 정책 엔진 다운그레이드 로직 구현 시 (v1.2)

---

### H-02: withdraw 엔드포인트의 Owner 미검증 상태 악용 -- 유예 구간 자금 탈취 경로

**Severity:** HIGH
**Confidence:** HIGH (v0.8 objective 5.2절 보안 분석 직접 파생)

**What goes wrong:**
v0.8 objective 5.2절에서 `withdraw`가 masterAuth만으로 동작하는 이유를 "자금이 항상 owner_address로만 이동하므로 안전"이라고 설명한다. 그러나 유예 구간에서는:

1. 공격자가 masterAuth 탈취
2. `set-owner <공격자 주소>` 실행 (유예 구간이므로 masterAuth만 필요)
3. 즉시 `withdraw(scope: all)` 호출 -- 자금이 공격자의 owner_address로 이동
4. 공격 완료 -- ownerAuth 불필요, 서명 검증 한 번도 없이 전 자산 탈취

v0.8 objective 5.2절의 표에서도 이 시나리오를 인식하고 있으나 "ownerAuth 미사용 = 아직 Owner 검증 전 (등록 직후)"로 경시한다. 문제는 이것이 **의도적 운영 패턴**(Owner 등록 후 ownerAuth를 바로 사용하지 않는 경우)과 겹친다는 것이다.

**Why it happens:**
- withdraw가 recipient를 owner_address로 고정하는 것은 잠금 구간에서만 안전
- 유예 구간에서는 owner_address 자체가 masterAuth만으로 변경 가능
- "주소 등록" -> "주소 변경" -> "회수"가 모두 masterAuth 하나로 가능한 체인

**Warning signs:**
- owner_verified = 0인 상태에서 withdraw 호출이 성공하는 테스트 케이스
- 유예 구간 withdraw에 추가 보호 장치(지연, 알림)가 없음

**Prevention:**
1. **유예 구간에서 withdraw 시 강제 대기:** owner_verified = 0이면 withdraw 요청 후 최소 1시간 대기. 이 시간 동안 전 채널 알림.
2. **주소 변경 후 즉시 withdraw 차단:** owner_address 변경 후 최소 24시간 동안 withdraw 불가. "주소 변경 → 즉시 회수" 공격 체인 차단.
3. **유예 구간 withdraw 시 ownerAuth 요구 검토:** 유예 구간이라도 자금 이동에는 서명 검증을 요구하는 옵션. 이 경우 Owner가 아직 서명하지 않았으면 withdraw 자체가 불가능 (기능적으로는 자연스러움 -- Owner 검증 전에는 회수 불가).
4. **가장 간단한 해법: 유예 구간에서 withdraw 비활성화.** owner_verified = 1(잠금 구간)에서만 withdraw 활성화. Owner가 실제 서명으로 검증된 후에만 자금 회수 허용.

**Phase:** withdraw API 구현 시 (v1.2 또는 v1.4)

---

### H-03: Kill Switch 복구 시간 역전 -- Owner 제거로 복구 지연 증가 악용

**Severity:** HIGH
**Confidence:** MEDIUM (v0.8 objective 6절 분석, 아키텍처적 추론)

**What goes wrong:**
v0.8에서 Kill Switch 복구 시간이 Owner 유무에 따라 분기된다:
- Owner 있음: ownerAuth + masterAuth + 30분
- Owner 없음: masterAuth + 24시간

공격 시나리오 (DoS 공격):
1. 공격자가 masterAuth 탈취
2. Kill Switch 발동 (정상 -- 시스템 보호)
3. 유예 구간이면: `remove-owner` 실행 -> 복구 시간이 30분 -> 24시간으로 증가
4. 시스템이 24시간 동안 사용 불가 (피해 확대)

반대 방향 (보안 우회):
1. 공격자가 masterAuth 탈취
2. Owner 미등록 상태에서 Kill Switch 발동
3. masterAuth만으로 24시간 후 복구 가능 -- 이 24시간 동안 공격자는 다른 준비 가능
4. 복구 후 즉시 자금 탈취 시도

**Why it happens:**
- Kill Switch 복구 요건이 현재 Owner 상태를 기준으로 동적 판단
- Kill Switch 발동 시점의 보안 상태가 스냅샷으로 기록되지 않음
- Owner 제거와 Kill Switch 상태가 독립적으로 변경 가능

**Warning signs:**
- Kill Switch ACTIVATED 상태에서 Owner 변경/제거 API가 동작함
- recover 엔드포인트에서 현재 owner_address만 확인하고 발동 시점 상태를 무시

**Prevention:**
1. **Kill Switch ACTIVATED 상태에서 Owner 변경/제거 금지:** Kill Switch 상태에서는 모든 구성 변경을 차단 (이미 killSwitchGuard에서 제한된 4개 경로만 허용하는 구조와 일관).
2. **Kill Switch 발동 시 보안 상태 스냅샷:** 발동 시점의 owner_address, owner_verified를 kill_switch 레코드에 기록. 복구 시 발동 시점 기준으로 인증 요건 결정.
3. **복구 인증 요건 결정 시 "더 엄격한 쪽" 적용:** 발동 시점과 현재 시점의 인증 요건 중 더 엄격한 쪽을 적용 (보수적 접근).

**Phase:** Kill Switch 복구 분기 구현 시 (v1.6 Kill Switch + AutoStop)

---

### H-04: 14개 설계 문서 동시 수정의 일관성 붕괴 -- Cross-Reference Drift

**Severity:** HIGH
**Confidence:** HIGH (v0.3 마일스톤에서 설계 논리 일관성 확보에 전체 마일스톤을 소요한 전례)

**What goes wrong:**
v0.8은 14개 기존 설계 문서를 수정한다. Owner nullable 변경이 각 문서에 미치는 영향은 서로 연쇄적이다:

- 25-sqlite-schema: `owner_address TEXT` (nullable) + `owner_verified INTEGER`
- 33-time-lock: evaluate()에 다운그레이드 삽입
- 34-owner-wallet: 등록/변경/해제 생명주기 전면 재설계
- 37-rest-api: withdraw 엔드포인트 추가, 인증 맵 분기
- 52-auth-model: Owner 선택적 모델 반영

**구체적 drift 시나리오:**
1. 25-sqlite-schema에서 owner_address를 nullable로 변경
2. 52-auth-model에서 ownerAuth 미들웨어를 Owner 없는 경우 스킵하도록 수정
3. 하지만 37-rest-api의 인증 맵에서 특정 엔드포인트가 여전히 ownerAuth를 필수로 명시
4. 결과: 구현 시 API 스펙과 인증 미들웨어가 충돌

**v0.3 교훈:** v0.3 마일스톤(설계 논리 일관성 확보)에서 5개 대응표(41-45)를 만들어 해결하는 데 전체 마일스톤(8 plans, 37 reqs)을 소요했다. v0.8은 더 많은 문서(14개)를 수정하면서 비슷한 일관성 문제가 반복될 수 있다.

**Prevention:**
1. **Owner 상태 분기표(decision matrix) 먼저 작성:** 각 API 엔드포인트 x Owner 유무 x 유예/잠금 구간 조합의 동작을 하나의 매트릭스로 정의. 모든 문서 수정은 이 매트릭스를 SSoT로 참조.
2. **문서 수정 순서 고정:** 25(스키마) -> 52(인증) -> 33(정책) -> 34(Owner) -> 37(API) -> 나머지. 상위 문서의 결정이 하위 문서에 전파되는 순서로.
3. **Cross-reference 체크리스트:** 각 문서 수정 시 영향받는 다른 문서를 명시적으로 나열하고, 수정 완료 후 체크.
4. **v0.3 패턴 재사용:** Owner 상태 관련 enum/타입 통합 대응표를 작성하여 구현 시 SSoT로 활용.

**Phase:** v0.8 설계 문서 수정 단계 (구현 전, 로드맵 첫 phase)

---

## Moderate Pitfalls

기술 부채, UX 혼란, 또는 지연을 야기하는 실수.

---

### M-01: SQLite NOT NULL -> nullable 마이그레이션의 테이블 재생성 필요

**Severity:** MEDIUM
**Confidence:** HIGH (SQLite ALTER TABLE 제한, Drizzle ORM 이슈 #1313, #2795)

**What goes wrong:**
SQLite의 `ALTER TABLE`은 기존 컬럼의 NOT NULL 제약을 제거하는 것을 지원하지 않는다. `owner_address TEXT NOT NULL`을 `owner_address TEXT`로 변경하려면 **테이블 재생성(create-copy-rename)** 패턴이 필요하다:

```sql
-- 1. 임시 테이블 생성 (새 스키마)
CREATE TABLE agents_new (..., owner_address TEXT, owner_verified INTEGER NOT NULL DEFAULT 0, ...);
-- 2. 데이터 복사
INSERT INTO agents_new SELECT ..., owner_address, 0, ... FROM agents;
-- 3. 원본 삭제
DROP TABLE agents;
-- 4. 이름 변경
ALTER TABLE agents_new RENAME TO agents;
-- 5. 인덱스 재생성
CREATE UNIQUE INDEX ...;
```

**Drizzle ORM 특유의 문제:**
- `drizzle-kit push:sqlite`가 테이블 재생성 시 데이터를 올바르게 복사하지 못하는 버그 보고 (Issue #1313)
- ALTER TABLE 마이그레이션에서 기본값이 보존되지 않는 버그 (Issue #2795)
- 자동 생성 마이그레이션이 아닌 수동 마이그레이션 SQL 작성 필요

**Why it happens:**
- SQLite의 ALTER TABLE 제한은 설계 결함이 아닌 의도적 단순성
- Drizzle의 SQLite 마이그레이션 지원이 PostgreSQL 대비 제한적
- NOT NULL -> nullable은 "추가"가 아닌 "제약 변경"이라 복잡

**Warning signs:**
- `drizzle-kit generate` 출력에 `ALTER TABLE ... ALTER COLUMN` 시도가 보임
- 마이그레이션 후 agents 테이블의 인덱스가 사라짐
- 마이그레이션 후 FOREIGN KEY 제약이 깨짐 (sessions.agent_id 등)

**Prevention:**
1. **수동 마이그레이션 SQL 작성:** Drizzle의 자동 생성에 의존하지 않고, 위 create-copy-rename 패턴의 마이그레이션을 직접 작성.
2. **마이그레이션 전 백업 필수:** `db.backup()` API로 마이그레이션 직전 스냅샷.
3. **PRAGMA foreign_keys=OFF 후 작업, 완료 후 ON + integrity_check:**
```sql
PRAGMA foreign_keys=OFF;
BEGIN;
-- create-copy-rename
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
```
4. **마이그레이션 후 검증 쿼리:** 모든 인덱스 존재 확인, FOREIGN KEY 무결성, 데이터 행 수 일치.
5. **Drizzle 스키마에서 NOT NULL -> optional 변경 시 `.notNull()` 제거 + 기존 데이터 DEFAULT 처리 확인.**
6. **첫 구현 시 고려:** v0.8은 아직 설계 단계이고 v1.1에서 최초 DB 생성이므로, 마이그레이션 문제는 v1.1에서 처음부터 nullable로 시작하면 회피 가능. 그러나 v1.1 후 스키마 변경이 필요한 경우를 대비하여 마이그레이션 패턴을 확립해야 함.

**Phase:** DB 스키마 구현 시 (v1.1 코어 인프라) -- 처음부터 v0.8 스키마 반영

---

### M-02: 점진적 보안 해금의 UX 혼란 -- 사용자가 현재 보안 수준을 이해하지 못함

**Severity:** MEDIUM
**Confidence:** MEDIUM (UX 패턴 분석, 점진적 기능 해금 제품 사례)

**What goes wrong:**
점진적 보안 모델에서 사용자가 현재 에이전트의 보안 수준을 정확히 파악하지 못한다:

1. **"Owner 등록 = 안전" 오해:** Owner를 등록했지만 ownerAuth를 사용하지 않아 유예 구간인 상태에서, 사용자는 이미 3계층 보안이 적용되었다고 믿음
2. **"DELAY = APPROVAL" 혼동:** Owner 없는 에이전트에서 고액 거래 시 DELAY로 다운그레이드되지만, 사용자는 이것이 APPROVAL과 같은 수준이라고 오해
3. **Kill Switch 복구 시간 혼란:** Owner 유무에 따라 복구 시간이 24시간 vs 30분으로 극적으로 다른데, 사용자가 이를 인지하지 못함
4. **세션 갱신 거부 윈도우 미인지:** Owner 있음/없음에 따라 세션 갱신 시 거부 가능 여부가 달라지는데, 이 차이를 사용자가 모름

**UX 혼란 사례:**
```
$ waiaas agent info trading-bot
Agent "trading-bot"
  Status: ACTIVE
  Owner:  7xKXtg... (등록됨)    <-- "등록됨"만 보이면 안전하다고 착각
  보안 수준: ???                  <-- 이 정보가 표시되지 않으면 혼란
```

**Prevention:**
1. **agent info에 보안 수준 명시 표시:**
```
$ waiaas agent info trading-bot
Agent "trading-bot"
  Status: ACTIVE
  Owner:  7xKXtg... (등록됨, 유예 구간 - ownerAuth 미사용)
  보안 수준: BASE + OWNER_REGISTERED
    - INSTANT/NOTIFY/DELAY: 활성
    - APPROVAL: 활성 (Owner 등록)
    - 자금 회수: 활성 (Owner 등록)
    - 세션 거부: 활성 (Owner 등록)
    - Kill Switch 복구: 30분 (Owner 서명)
    ⚠ Owner 검증 미완료 - ownerAuth를 1회 사용하면 잠금 구간으로 전환됩니다
```
2. **보안 수준 API 엔드포인트:** `GET /v1/agents/:id/security-level` -- Base/Enhanced 수준 + 각 기능 활성화 상태 반환.
3. **다운그레이드 알림에 보안 수준 차이 명시:** "이 거래는 APPROVAL 티어이지만, Owner가 없어 DELAY(15분)로 처리됩니다. Owner를 등록하면 서명 승인으로 전환됩니다."
4. **유예 구간 경고 알림:** Owner 등록 후 1시간 이내에 ownerAuth를 사용하지 않으면 알림: "Owner 주소가 아직 검증되지 않았습니다. ownerAuth를 사용하여 보안을 완성하세요."

**Phase:** CLI + API + 알림 구현 시 (v1.2-v1.3)

---

### M-03: owner_verified 플래그의 단일 비트 의존 -- 복잡한 상태를 boolean으로 축소

**Severity:** MEDIUM
**Confidence:** MEDIUM (상태 머신 설계 패턴 분석)

**What goes wrong:**
`owner_verified INTEGER NOT NULL DEFAULT 0`은 0/1 boolean이지만, 실제 Owner 상태는 더 복잡하다:

| 상태 | owner_address | owner_verified | 설명 |
|------|:------------:|:--------------:|------|
| 미등록 | NULL | 0 | Owner 없음 |
| 유예 | NOT NULL | 0 | 등록됨, ownerAuth 미사용 |
| 잠금 | NOT NULL | 1 | ownerAuth 사용 완료 |
| 유예 만료? | NOT NULL | 0 | 등록 후 시간 경과 (C-02 Prevention 적용 시) |
| 변경 중? | NOT NULL | 1 | Owner 변경 요청 대기 중 |

C-02에서 제시한 "유예 구간 시간 제한"을 도입하면, owner_verified = 0이면서 유예 기간 경과 후의 상태가 필요하다. 이때 boolean 하나로는 표현 불가.

**Why it happens:**
- 초기 설계에서 "유예/잠금" 2상태만 고려
- 방어적 기능(유예 기간 만료, 변경 대기 등)을 추가하면 상태 공간 확장
- boolean 플래그 하나에 여러 의미를 부여하면 코드 전반에 `if (owner_verified === 0 && owner_registered_at + GRACE_PERIOD > now)` 같은 분산된 판단 로직 발생

**Prevention:**
1. **owner_verified를 enum 컬럼으로 확장 검토:**
```sql
owner_status TEXT NOT NULL DEFAULT 'NONE'
  CHECK (owner_status IN ('NONE', 'GRACE', 'LOCKED'))
```
- NONE: Owner 미등록
- GRACE: Owner 등록, ownerAuth 미사용 (유예)
- LOCKED: ownerAuth 사용 완료 (잠금)

이렇게 하면 `owner_address IS NOT NULL AND owner_status = 'GRACE'` 형태의 명시적 쿼리가 가능.

2. **대안: owner_verified 유지 + owner_registered_at 추가:**
```sql
owner_verified  INTEGER NOT NULL DEFAULT 0,
owner_registered_at  INTEGER,  -- Owner 주소 등록 시각 (유예 기간 계산용)
```
유예 기간 판단: `owner_verified = 0 AND owner_registered_at IS NOT NULL AND (now - owner_registered_at) < GRACE_PERIOD`

3. **어느 쪽이든 Zod 스키마에서 상태를 discriminated union으로 표현:**
```typescript
const OwnerState = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({ status: z.literal('grace'), address: z.string(), registeredAt: z.number() }),
  z.object({ status: z.literal('locked'), address: z.string(), verifiedAt: z.number() }),
])
```

**Phase:** 스키마 설계 확정 단계 (v0.8 설계 문서 수정 시 결정)

---

### M-04: 기존 테스트/보안 시나리오 무효화 -- v0.4 테스트 전략 46-51 갱신 누락

**Severity:** MEDIUM
**Confidence:** HIGH (v0.4 문서에 Owner 필수 전제한 테스트 케이스 다수 존재)

**What goes wrong:**
v0.4에서 수립한 테스트 전략(46-51)과 보안 시나리오(237건)가 Owner 필수를 전제로 작성되었다. v0.8에서 Owner를 선택적으로 변경하면:

1. **43-layer1-session-auth-attacks:** ownerAuth 관련 테스트가 "Owner 없는 경우" 분기 미포함
2. **44-layer2-policy-bypass-attacks:** APPROVAL 우회 시나리오가 "Owner 없는 경우 DELAY 다운그레이드" 경로 미포함
3. **45-layer3-killswitch-recovery-attacks:** Kill Switch 복구 시나리오가 24시간 vs 30분 분기 미포함
4. **46-keystore-external-security-scenarios:** withdraw/sweepAll 시나리오 미포함
5. **51-platform-test-scope:** CLI `set-owner`, `remove-owner` 테스트 미포함

**Why it happens:**
- 테스트 문서가 설계 문서와 별도 마일스톤(v0.4)에서 작성되어, 이후 설계 변경이 자동 반영되지 않음
- "기존 기능은 그대로 유지" 원칙이 테스트 커버리지 갱신 누락을 유발

**Prevention:**
1. **v0.8 설계 문서 수정 시 영향받는 테스트 문서도 동시 갱신:** 14개 설계 문서 수정 목록에 테스트 문서 3-4개 추가.
2. **Owner 상태 분기 테스트 매트릭스 별도 작성:** 각 보안 시나리오를 `Owner 없음 / 유예 / 잠금` 3가지 상태로 확장.
3. **v1.2 구현 시 새 테스트 시나리오 추가:** APPROVAL 다운그레이드, 유예→잠금 전이, withdraw 보안 등 v0.8 특유 시나리오.

**Phase:** v0.8 설계 문서 수정 시 + v1.7 품질 강화 시

---

### M-05: Notification 채널의 Owner 등록 안내 피로감 -- 반복 알림에 의한 무시 패턴

**Severity:** MEDIUM
**Confidence:** MEDIUM (알림 피로 UX 패턴 연구)

**What goes wrong:**
Owner 없는 에이전트에서 APPROVAL -> DELAY 다운그레이드가 발생할 때마다 알림에 Owner 등록 안내가 포함된다:

```
⏳ 대액 거래 대기 중 (APPROVAL -> DELAY 다운그레이드)
에이전트: trading-bot
금액: 15 SOL ($2,250) -> 9bKrTD...
실행 예정: 15분 후

💡 Owner 지갑을 등록하면 대액 거래에
   승인 정책을 적용할 수 있습니다.
   waiaas agent set-owner trading-bot <address>
```

고빈도 트레이딩 봇에서 하루 50-100건의 다운그레이드가 발생하면:
1. Owner 등록 안내가 50-100번 반복 → 알림 자체를 무시하는 패턴 형성
2. 실제 중요한 알림(비정상 거래, Kill Switch)도 함께 무시
3. 알림 채널의 메시지 크기 증가 (Telegram 4096자 제한에 근접)

**Prevention:**
1. **Owner 등록 안내는 최초 5회만 포함:** 이후에는 다운그레이드 사실만 알리고, 안내 생략. 매일 1회 일일 요약에서만 안내 재표시.
2. **일일 요약 알림:** "오늘 23건의 거래가 DELAY로 다운그레이드되었습니다. Owner를 등록하면 승인 정책을 적용할 수 있습니다."
3. **알림 템플릿 분리:** 다운그레이드 알림과 등록 안내를 별도 메시지로 전송하여, 사용자가 중요 알림을 놓치지 않도록.

**Phase:** 알림 시스템 구현 시 (v1.3)

---

## Phase-Specific Warning Summary

| Phase Topic | Likely Pitfall | Severity | Mitigation Key |
|-------------|---------------|----------|---------------|
| **설계 문서 수정 (v0.8)** | H-04: 14개 문서 cross-reference drift | HIGH | Owner 상태 분기 매트릭스 SSoT |
| **설계 문서 수정 (v0.8)** | M-03: owner_verified boolean 부족 | MEDIUM | enum 또는 timestamp 추가 검토 |
| **스키마/DB (v1.1)** | M-01: SQLite NOT NULL -> nullable 재생성 | MEDIUM | 수동 마이그레이션 + 검증 쿼리 |
| **인증+정책 (v1.2)** | C-01: Grace-to-Locked 레이스 컨디션 | CRITICAL | BEGIN IMMEDIATE 원자화 |
| **인증+정책 (v1.2)** | C-02: Owner 제거 → APPROVAL 우회 | CRITICAL | 유예 구간 시간 제한 + 알림 |
| **인증+정책 (v1.2)** | H-01: APPROVAL->DELAY 다운그레이드 레이스 | HIGH | 실행 시점 재평가 |
| **인증+정책 (v1.2)** | H-02: 유예 구간 withdraw 자금 탈취 | HIGH | 유예 구간 withdraw 비활성화 |
| **알림 (v1.3)** | M-05: 등록 안내 알림 피로 | MEDIUM | 최초 5회 제한 + 일일 요약 |
| **CLI+UX (v1.2-v1.3)** | M-02: 보안 수준 UX 혼란 | MEDIUM | 명시적 보안 수준 표시 |
| **토큰 확장 (v1.4)** | C-03: sweepAll 부분 실패 자산 고립 | CRITICAL | SOL 마지막, 자동 재시도, fee 예약 |
| **Kill Switch (v1.6)** | H-03: Kill Switch 복구 시간 역전 | HIGH | ACTIVATED 상태에서 Owner 변경 금지 |
| **테스트 (v1.7)** | M-04: 기존 테스트 시나리오 무효화 | MEDIUM | Owner 상태 3분기 확장 매트릭스 |

---

## Sources

### HIGH Confidence
- [Solana CloseAccount Documentation](https://solana.com/docs/tokens/basics/close-account) -- 토큰 계정 폐쇄 요건, 잔액 0 필수
- [Solana Closing Accounts and Revival Attacks](https://solana.com/developers/courses/program-security/closing-accounts) -- 계정 폐쇄 보안 에지 케이스
- [Drizzle ORM Issue #1313](https://github.com/drizzle-team/drizzle-orm/issues/1313) -- SQLite push 시 테이블 재생성 데이터 손실 버그
- [Drizzle ORM Issue #2795](https://github.com/drizzle-team/drizzle-orm/issues/2795) -- ALTER TABLE 마이그레이션 기본값 미보존
- [SQLite ALTER TABLE Limitations](https://www.sqlite.org/lang_altertable.html) -- NOT NULL 제약 변경 불가
- WAIaaS v0.8 objective (objectives/v0.8-optional-owner-progressive-security.md) -- 설계 변경 명세 전문
- WAIaaS v0.2 PITFALLS.md (.planning/research/PITFALLS.md) -- 기존 함정 목록 (H-01 TOCTOU 재참조)
- WAIaaS v1.0 implementation planning (objectives/v1.0-implementation-planning.md) -- 구현 마일스톤 매핑

### MEDIUM Confidence
- [PortSwigger - Smashing the State Machine](https://portswigger.net/research/smashing-the-state-machine) -- HTTP 요청 간 sub-state 레이스 컨디션
- [Argent Guardian Removal Security](https://support.argent.xyz/hc/en-us/articles/360022520932) -- 36h 대기 기간, 지갑 잠금 방어
- [Argent Guardian Recovery Guide](https://support.argent.xyz/hc/en-us/articles/360007338877) -- 48h 복구, 시간 기반 보안
- [Safe{Wallet} Bybit Incident](https://thehackernews.com/2025/03/safewallet-confirms-north-korean.html) -- 지갑 인프라 침해 사례
- [Coinbase CDP Wallet Policies](https://www.coinbase.com/developer-platform/discover/launches/policy-engine) -- 정책 엔진 설계 참고
- [Safeheron Policy Engine](https://safeheron.com/blog/policy-engine/) -- 트랜잭션 승인 프로세스 최적화

### LOW Confidence (아키텍처적 추론 기반)
- Kill Switch 복구 시간 역전 공격 -- 특정 사례 미발견, 논리적 추론
- 알림 피로 패턴 -- 일반 UX 원칙 적용, 크립토 지갑 특화 연구 미발견
