# Phase 35: DX + 설계 문서 통합 - Research

**Researched:** 2026-02-09
**Domain:** CLI DX 설계 + 설계 문서 통합 (v0.8 Owner 선택적 모델)
**Confidence:** HIGH

## Summary

Phase 35는 v0.8 마일스톤의 마지막 페이즈로, 세 가지 산출물을 생성한다: (1) CLI 명령어 변경 설계 (agent create --owner 선택, set-owner, remove-owner, agent info 안내 메시지, --quickstart 간소화), (2) Owner 상태 분기 매트릭스 SSoT 작성 (API x OwnerState NONE/GRACE/LOCKED 전체 동작 표), (3) 14개 기존 설계 문서에 [v0.8] 태그로 일관된 변경 반영.

이 페이즈는 코드 구현이 아닌 **설계 문서 수정**이 산출물이다. Phase 31-34에서 이미 10개 설계 문서에 v0.8 변경이 반영되었으나, 4개 문서(30-session, 31-solana, 54-cli-flow, 40-telegram-docker)와 3개 참조 문서(57/60/61)에는 아직 v0.8 변경이 없다. 또한 54-cli-flow-redesign.md는 v0.5 시점에 --owner 필수로 설계되어 있어 v0.8에서 전면 갱신이 필요하다.

**Primary recommendation:** 35-01에서 54-cli-flow-redesign.md를 v0.8 기준으로 전면 갱신(--owner 선택, set-owner/remove-owner 신규, agent info 안내, --quickstart 간소화)하고, 35-02에서 API x OwnerState 매트릭스를 SSoT로 작성한 뒤, 35-03에서 남은 문서 4개의 첫 v0.8 반영 + 기존 10개 문서의 교차 일관성 검증을 수행한다.

## Standard Stack

이 페이즈는 코드 구현이 아닌 설계 문서 수정 작업이므로 외부 라이브러리 도입이 없다.

### Core

| 항목 | 용도 | 비고 |
|------|------|------|
| Markdown | 설계 문서 형식 | 기존 30개 설계 문서와 동일 |
| [v0.8] 태그 | 버전 변경 추적 | Phase 31-34에서 확립된 패턴 |
| Mermaid 다이어그램 | 상태 머신/시퀀스 | 기존 문서에서 사용 중 |

### Supporting

| 항목 | 용도 | 비고 |
|------|------|------|
| objectives/v0.8-optional-owner-progressive-security.md | v0.8 원본 스펙 | 모든 변경의 근거 |
| STATE.md | 누적 결정 사항 | Phase 31-34 결정 참조 |
| ROADMAP.md / REQUIREMENTS.md | 요구사항 추적 | DX-01~05, INTEG-01~02 |

## Architecture Patterns

### Pattern 1: [v0.8] 태그 일관성 패턴

**What:** 기존 설계 문서에 v0.8 변경 사항을 반영할 때, 변경된 부분에 `[v0.8]` 태그를 부착하여 변경 추적을 용이하게 한다.
**When to use:** Phase 31-34에서 이미 10개 문서에 적용된 패턴. 총 101개 [v0.8] 태그가 이미 존재.
**Example:**
```markdown
// 기존 (v0.5)
owner_address TEXT NOT NULL,                    -- Owner 지갑 주소

// v0.8 변경
owner_address TEXT,                              -- [v0.8] NOT NULL -> nullable
owner_verified INTEGER NOT NULL DEFAULT 0,       -- [v0.8] 신규: ownerAuth 사용 이력
```

**Confidence:** HIGH -- Phase 31-34에서 이미 확립된 패턴.

### Pattern 2: SSoT 매트릭스 패턴

**What:** 여러 문서에 분산된 Owner 상태별 동작 분기를 단일 매트릭스 테이블로 통합하여 SSoT를 확보한다.
**When to use:** 문서 간 동작 정합성을 보장해야 할 때.
**Example:**
```markdown
| API 엔드포인트 | NONE (Owner 없음) | GRACE (유예) | LOCKED (잠금) |
|--------------|-------------------|--------------|---------------|
| POST /v1/transactions (APPROVAL) | DELAY 다운그레이드 | DELAY 다운그레이드 | ownerAuth 승인 대기 |
```

**Confidence:** HIGH -- v0.8 objective에서 명시적으로 요구하는 패턴.

### Pattern 3: 54-cli-flow-redesign.md v0.8 갱신 패턴

**What:** v0.5에서 --owner 필수로 설계된 CLI 문서를 v0.8의 --owner 선택으로 전환한다.
**When to use:** 이 페이즈에서만 (54 문서 갱신).

**변경 규모 분석 (54-cli-flow-redesign.md):**

| 섹션 | 현재 (v0.5) | v0.8 변경 | 변경 규모 |
|------|------------|----------|----------|
| 섹션 1.2 요구사항 매핑 | DX-02: --owner 필수 | DX-02: --owner 선택 | 소 |
| 섹션 1.4 변경 요약 | owner_address NOT NULL 근거 | nullable 근거 | 소 |
| 섹션 2.2 init 플로우 | 다음단계 `agent create --owner <addr>` | `agent create` (--owner 선택) | 소 |
| 섹션 2.3 출력 예시 | `waiaas agent create --owner <owner-address>` | `waiaas agent create` | 소 |
| 섹션 2.8 제거 단계 | NOT NULL 필수 근거 | nullable 전환 근거 | 소 |
| **섹션 3 agent create** | **--owner Required** | **--owner Optional + 두 가지 출력** | **대** |
| 섹션 3.2 커맨드 인터페이스 | Required: --owner | Options: --owner (선택) | 중 |
| 섹션 3.3 동작 설명 | ownerAddress 필수 Body | ownerAddress 선택적 Body | 소 |
| 섹션 3.4 출력 예시 | Owner 있는 경우만 | Owner 없음 + 있음 두 가지 | 중 |
| 섹션 3.5 에러 처리 | --owner 미지정 에러 | 에러 제거, 안내 메시지 추가 | 중 |
| 섹션 3.6 parseArgs | owner: required validation | owner: optional | 소 |
| 섹션 3.7 API 호출 | ownerAddress 필수 | ownerAddress 선택적 | 소 |
| **섹션 5 전체 커맨드** | **set-owner, remove-owner 없음** | **신규 2개 추가** | **대** |
| **섹션 6 --quickstart** | **--owner Required** | **--owner Optional, --chain만 필수** | **대** |
| 섹션 6.2 커맨드 인터페이스 | Required: --owner | Options: --owner (선택) | 중 |
| 섹션 6.3 필수 옵션 | --owner 필수 | --owner 선택 | 중 |
| 섹션 6.5 출력 예시 | Owner 항상 표시 | Owner 유무별 출력 | 중 |
| 섹션 6.7 비대화형 예시 | --owner 필수 | --owner 선택 | 소 |
| 섹션 6.8 구현 수도코드 | options.owner 필수 체크 | options.owner 선택적 | 소 |
| 섹션 8 마이그레이션 | NOT NULL 마이그레이션 | nullable 마이그레이션 | 중 |
| 부록 A 검증 체크리스트 | NOT NULL 참조 | nullable 참조 | 소 |

**총 22개 위치에서 변경 필요.** 대규모 변경 3개 (섹션 3 agent create, 섹션 5 커맨드 표, 섹션 6 quickstart), 중규모 7개, 소규모 12개.

**Confidence:** HIGH -- 54 문서를 직접 분석하여 변경 포인트를 식별함.

### Anti-Patterns to Avoid

- **"NOT NULL" 잔존:** v0.5에서 `agents.owner_address NOT NULL`이 전제인 문장이 54-cli 외에도 존재할 수 있다. 14개 문서 전체에서 `NOT NULL` + `owner_address` 조합을 검색하여 잔존 참조를 제거해야 한다.
- **분산된 동작 분기:** Owner 상태별 동작이 여러 문서에 별도 테이블로 존재하면 일관성이 깨진다. 35-02 매트릭스가 SSoT로 기능해야 한다.
- **누락된 문서 갱신:** 14개 문서 중 일부만 갱신하고 나머지를 빠뜨리면 문서 간 불일치가 발생한다.

## Don't Hand-Roll

이 페이즈는 설계 문서 수정이므로 해당 없음.

## Common Pitfalls

### Pitfall 1: 54-cli-flow-redesign.md의 v0.5 잔존 참조

**What goes wrong:** v0.5에서 `--owner` 필수, `agents.owner_address NOT NULL`을 전제로 작성된 문장이 v0.8 변경 후에도 남아 모순이 발생한다.
**Why it happens:** 54 문서는 v0.5에서 9개 섹션에 걸쳐 `--owner` 필수를 전제로 설계되었다. 부분적으로만 수정하면 나머지 섹션에서 충돌.
**How to avoid:** 위 섹션별 변경 분석표의 22개 위치를 체계적으로 순회하며 갱신. 완료 후 `NOT NULL` + `owner` 키워드 검색으로 잔존 확인.
**Warning signs:** `NOT NULL`, `필수`, `required` 키워드가 owner_address와 함께 사용되는 곳.

### Pitfall 2: --quickstart의 --owner 선택 전환 시 Stage 3 변경 누락

**What goes wrong:** --quickstart의 Stage 3(agent create)에서 ownerAddress를 선택적으로 전달하도록 변경하지 않으면, quickstart가 --owner 없이 실행 시 실패한다.
**Why it happens:** 섹션 6.8 구현 수도코드의 `createAgentViaApi({ ownerAddress: options.owner })` 호출부를 놓침.
**How to avoid:** --quickstart 수도코드 전체를 재검토하여 options.owner가 undefined일 때의 동작을 명시.
**Warning signs:** quickstart 출력 예시에 Owner가 항상 표시되는 경우.

### Pitfall 3: set-owner/remove-owner CLI 설계 시 34-owner-wallet-connection 섹션 10과의 불일치

**What goes wrong:** CLI 명령어(set-owner, remove-owner)의 인증 요건이 34 문서 섹션 10에 정의된 OwnerLifecycleService의 인증 요건과 다르다.
**Why it happens:** 34 문서에서 REST API 수준으로 정의된 인증 요건을 CLI에서 다른 수준으로 변환하면 불일치 발생.
**How to avoid:** 34 문서 섹션 10.3의 인증 맵을 CLI 명령어에 1:1 매핑. set-owner는 masterAuth(implicit), remove-owner는 masterAuth(implicit) + GRACE 상태 검증.
**Warning signs:** CLI 에러 메시지가 REST API 에러 코드와 불일치.

### Pitfall 4: 14개 문서 갱신 범위 누락

**What goes wrong:** 14개 문서 중 일부를 빠뜨려 [v0.8] 태그가 누락된다.
**Why it happens:** 10개 문서에 이미 [v0.8] 태그가 있어 "이미 완료"로 오인하지만, 35-03의 통합 반영은 기존 변경의 교차 일관성 검증 + 누락 보완도 포함한다.
**How to avoid:** 명시적 체크리스트 관리.

**14개 문서 v0.8 현황:**

| # | 문서 | 위치 | Phase 31-34에서 변경 | Phase 35 필요 작업 |
|---|------|------|---------------------|-------------------|
| 1 | 25-sqlite-schema | .planning/deliverables/ | 18개 [v0.8] 태그 | 교차 검증만 |
| 2 | 52-auth-model-redesign | .planning/deliverables/ | 10개 [v0.8] 태그 | 교차 검증만 |
| 3 | 33-time-lock-approval | .planning/deliverables/ | 25개 [v0.8] 태그 | 교차 검증만 |
| 4 | 34-owner-wallet-connection | .planning/deliverables/ | 9개 [v0.8] 태그 | 교차 검증만 |
| 5 | 37-rest-api-complete | .planning/deliverables/ | 10개 [v0.8] 태그 | withdraw CLI 연계 확인 |
| 6 | 27-chain-adapter-interface | .planning/deliverables/ | 1개 [v0.8] 태그 | sweepAll 참조 보강 |
| 7 | 36-killswitch-autostop-evm | .planning/deliverables/ | 9개 [v0.8] 태그 | 교차 검증만 |
| 8 | 53-session-renewal-protocol | .planning/deliverables/ | 5개 [v0.8] 태그 | 교차 검증만 |
| 9 | 35-notification-architecture | .planning/deliverables/ | 11개 [v0.8] 태그 | 교차 검증만 |
| 10 | 32-transaction-pipeline | .planning/deliverables/ | 3개 [v0.8] 태그 | 교차 검증만 |
| 11 | **30-session-token-protocol** | .planning/deliverables/ | **0개 -- 미변경** | **첫 v0.8 반영 필요** |
| 12 | **31-solana-adapter-detail** | .planning/deliverables/ | **0개 -- 미변경** | **첫 v0.8 반영 필요** |
| 13 | **54-cli-flow-redesign** | .planning/deliverables/ | **0개 -- 미변경** | **전면 갱신 필요 (22개 위치)** |
| 14 | **40-telegram-bot-docker** | .planning/deliverables/ | **0개 -- 미변경** | **첫 v0.8 반영 필요** |
| (+) | 57-asset-query | docs/ | 0개 -- 미변경 | 참조 보강 (sweepAll이 getAssets 사용) |
| (+) | 60-batch-transaction | docs/ | 0개 -- 미변경 | 참조 보강 (sweepAll이 buildBatch 사용) |
| (+) | 61-price-oracle | docs/ | 0개 -- 미변경 | 참조 보강 (다운그레이드가 USD 평가 사용) |

### Pitfall 5: agent info 안내 메시지 누락

**What goes wrong:** DX-05 요구사항(Owner 미등록 에이전트의 agent info 출력에 등록 안내 메시지)이 54 문서에 반영되지 않는다.
**Why it happens:** 현재 54 문서 섹션 5.1에 `agent info`가 "유지"로 표시되어 있어 변경 대상에서 빠뜨릴 수 있다.
**How to avoid:** agent info 출력 예시(Owner 없음/있음 두 가지)를 54 문서에 신규 추가.

### Pitfall 6: Kill Switch withdraw Open Question 미결정

**What goes wrong:** 34-01 Summary에서 Kill Switch 상태에서의 withdraw를 Open Question으로 남겨두었다. Phase 35 CLI 설계 시 결정해야 하나 빠뜨린다.
**Why it happens:** 방안 A(killSwitchGuard 허용 목록 추가) vs 방안 B(CLI 직접 실행) 결정이 아직 이루어지지 않았다.
**How to avoid:** 35-01 plan에서 이 Open Question을 명시적으로 다루고 결정. CLI 명령 `waiaas owner withdraw`를 설계할 때 Kill Switch 상태 처리를 함께 결정.

## Code Examples

이 페이즈는 설계 문서 수정이므로 코드 예제 대신 문서 변경 예시를 제공한다.

### 54-cli-flow agent create 변경 예시

```markdown
// v0.5 현재
Required:
  --owner <address>        Owner 지갑 주소 (Solana base58 또는 EVM 0x)

// v0.8 변경
Options:
  --owner <address>        [v0.8] Owner 지갑 주소 (선택, Solana base58 또는 EVM 0x)
```

### agent info Owner 미등록 출력 예시 (신규)

```
$ waiaas agent info trading-bot

Agent: trading-bot
  ID:       01950288-...
  Chain:    solana
  Network:  devnet
  Address:  9bKrTD...
  Status:   ACTIVE
  Owner:    (미등록)

  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등
  추가 보안 기능을 사용할 수 있습니다:
    waiaas agent set-owner trading-bot <owner-address>
```

### set-owner CLI 명령 예시 (신규)

```
waiaas agent set-owner <agent-name|id> <address>

  인증: masterAuth (implicit)
  동작: POST /v1/agents/:agentId/owner (34-owner-wallet-connection.md §10.6)
  제약: LOCKED 상태에서는 ownerAuth + masterAuth 필요
  에러:
    - 에이전트 미존재: AGENT_NOT_FOUND
    - 잘못된 주소 형식: INVALID_OWNER_ADDRESS
    - LOCKED + ownerAuth 없음: OWNER_CHANGE_REQUIRES_CURRENT_OWNER
    - Kill Switch ACTIVATED: 503 SYSTEM_LOCKED
```

### remove-owner CLI 명령 예시 (신규)

```
waiaas agent remove-owner <agent-name|id>

  인증: masterAuth (implicit)
  동작: DELETE /v1/agents/:agentId/owner (34-owner-wallet-connection.md §10.6)
  제약: GRACE 상태에서만 동작 (LOCKED에서 불가)
  에러:
    - 에이전트 미존재: AGENT_NOT_FOUND
    - Owner 미등록: OWNER_NOT_FOUND (또는 NO_OWNER)
    - LOCKED 상태: OWNER_REMOVAL_BLOCKED (보안 다운그레이드 방지)
    - Kill Switch ACTIVATED: 503 SYSTEM_LOCKED
```

### --quickstart 간소화 출력 예시

```
$ waiaas init --quickstart --chain solana

  WAIaaS Quickstart
  -----------------

  [1/4] Initializing...
        Data directory: ~/.waiaas/
        Master password: auto-generated
        Saved to: ~/.waiaas/.master-password (chmod 600)

  [2/4] Starting daemon...
        WAIaaS daemon v0.8.0 ready on 127.0.0.1:3100

  [3/4] Creating agent...
        Name:    agent-01
        Chain:   solana (devnet)
        Address: 9wB3Lz8n...
        Owner:   (미등록)

  [4/4] Creating session...
        Expires: 2026-02-10T10:30:00.000Z (24h)

  -----------------
  Quickstart complete!

  Session token:
  wai_sess_eyJhbGciOiJIUzI1NiIs...

  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등
  추가 보안 기능을 사용할 수 있습니다:
    waiaas agent set-owner agent-01 <owner-address>
```

### Owner 상태 분기 매트릭스 SSoT 예시

```markdown
## Owner 상태 분기 매트릭스 (SSoT)

| 기능/API | NONE (Owner 없음) | GRACE (유예) | LOCKED (잠금) |
|----------|-------------------|--------------|---------------|
| 에이전트 생성 (POST /v1/agents) | ownerAddress 선택적 | - | - |
| INSTANT 거래 | 즉시 실행 | 즉시 실행 | 즉시 실행 |
| NOTIFY 거래 | 즉시 + 알림 | 즉시 + 알림 | 즉시 + 알림 |
| DELAY 거래 | 쿨다운 + 알림 | 쿨다운 + 알림 | 쿨다운 + 알림 |
| APPROVAL 거래 | **DELAY 다운그레이드** | **DELAY 다운그레이드** | ownerAuth 승인 대기 |
| 다운그레이드 알림 | 안내 메시지 O | 안내 메시지 O | 해당 없음 |
| 자금 회수 (withdraw) | 불가 | **불가** (LOCKED만) | masterAuth |
| Kill Switch 발동 | masterAuth | masterAuth | masterAuth 또는 ownerAuth |
| Kill Switch 복구 | masterAuth + 24h | masterAuth + 24h | ownerAuth + masterAuth + 30min |
| 세션 갱신 | 즉시 확정 | 즉시 확정 | [거부하기] 활성 |
| Owner 등록 (set-owner) | masterAuth | - (이미 등록) | - (이미 등록) |
| Owner 변경 (set-owner) | - | masterAuth | ownerAuth + masterAuth |
| Owner 해제 (remove-owner) | - | masterAuth | **불가** |
| agent info 출력 | 등록 안내 메시지 | Owner 주소 표시 | Owner 주소 + "verified" |
```

## State of the Art

| 항목 | v0.5 (현재 문서 기준) | v0.8 (목표) | 영향 |
|------|---------------------|------------|------|
| agents.owner_address | NOT NULL (필수) | nullable (선택) | 14개 문서 전체 |
| --owner CLI 옵션 | Required | Optional | 54-cli-flow 전면 갱신 |
| --quickstart --owner | Required | Optional (--chain만 필수) | 54-cli-flow 섹션 6 |
| agent set-owner | 없음 | 신규 CLI 명령 | 54-cli-flow 섹션 5 |
| agent remove-owner | 없음 | 신규 CLI 명령 (GRACE만) | 54-cli-flow 섹션 5 |
| agent info Owner 안내 | 없음 | Owner 미등록 시 안내 | 54-cli-flow 섹션 5 |
| Owner 상태 분기 | 문서별 개별 테이블 | SSoT 매트릭스 | 신규 산출물 |

## Open Questions

### 1. Kill Switch 상태에서 withdraw CLI

- **What we know:** 34-01에서 Open Question으로 남김. 방안 A(killSwitchGuard 허용 목록 추가) vs 방안 B(CLI 직접 실행).
- **What's unclear:** CLI `waiaas owner withdraw` 명령이 Kill Switch ACTIVATED 상태에서 어떻게 동작해야 하는가.
- **Recommendation:** 방안 A 채택 권장. killSwitchGuard의 허용 경로에 `POST /v1/owner/agents/:agentId/withdraw`를 추가하면 기존 API 인프라를 재사용할 수 있다. 방안 B(CLI 직접 실행)는 데몬 API를 우회하므로 일관성이 떨어진다. 35-01 plan에서 결정하고 37-rest-api, 36-killswitch에 반영.

### 2. CLI withdraw 명령어 설계

- **What we know:** REST API `POST /v1/owner/agents/:agentId/withdraw`는 34-01에서 확정. CLI 커맨드는 아직 미정의.
- **What's unclear:** `waiaas owner withdraw` vs `waiaas agent withdraw` 명명 규칙. v0.8 §5 기준으로 Owner 전용 기능이므로 `waiaas owner withdraw --agent <name>`이 의미론적으로 적합하나, CLI 그룹 구조 일관성도 고려 필요.
- **Recommendation:** `waiaas owner withdraw --agent <name>` 채택. 54 문서 섹션 5의 owner 커맨드 그룹에 추가. 자금 회수는 Owner 전용 기능이므로 owner 그룹이 적절.

### 3. GRACE 상태에서 APPROVAL 티어 동작

- **What we know:** v0.8 objective에서 "Owner 등록 -> APPROVAL 해금"이라고 기술. 33-time-lock 섹션에서 APPROVAL 다운그레이드는 `!agent.owner_address` 조건으로 판단.
- **What's unclear:** GRACE 상태(owner_address 있음, owner_verified=0)에서 APPROVAL 티어 거래 시 ownerAuth 서명 대기가 가능한가? GRACE에서는 아직 ownerAuth를 사용한 적이 없으므로 Owner 주소의 진위가 미확인.
- **Recommendation:** 이미 33-01 plan에서 결정됨. evaluate() Step 9.5의 조건은 `!agent.owner_address`이므로, GRACE(owner_address 있음)에서는 다운그레이드가 발생하지 않고 정상 APPROVAL로 처리된다. 다만 GRACE에서 ownerAuth 첫 사용 시 자동으로 LOCKED로 전이되므로 자연스럽게 해결. SSoT 매트릭스에서 GRACE의 APPROVAL을 "DELAY 다운그레이드"로 표시할지 "ownerAuth 승인 대기"로 표시할지 결정 필요. **기존 코드 로직(33-01)에 따르면 GRACE에서도 owner_address가 존재하므로 APPROVAL로 처리됨.** 매트릭스 반영 시 정확히 표기.

**수정:** 재검토 결과, GRACE에서 APPROVAL 거래 -> ownerAuth 서명 요청 -> 첫 ownerAuth 사용으로 LOCKED 전이. 이는 의도된 동작이다. 매트릭스에서 GRACE의 APPROVAL은 "ownerAuth 승인 대기 (첫 사용 시 LOCKED 자동 전이)"로 표기.

## Plan별 상세 분석

### 35-01: CLI 명령어 변경 + 출력 메시지 + --quickstart 간소화 설계

**대상 문서:** 54-cli-flow-redesign.md (전면 갱신)
**변경 규모:** 대 (22개 위치, 3개 대규모 변경)
**핵심 작업:**
1. 섹션 3 `agent create`: --owner Required -> Optional, 두 가지 출력(Owner 없음/있음)
2. 섹션 5 커맨드 표: set-owner, remove-owner, withdraw 3개 신규 추가
3. 섹션 6 --quickstart: --owner Required -> Optional, --chain만 필수
4. agent info: Owner 미등록 시 안내 메시지 출력 (신규 섹션 또는 기존 섹션 확장)
5. Kill Switch withdraw Open Question 결정
6. 요구사항 매핑, 변경 요약, 에러 처리, parseArgs, 수도코드 전체 갱신
7. 부록 A 검증 체크리스트 v0.8 갱신

**의존:** Phase 31-34 산출물 (34-owner-wallet-connection 섹션 10, 37-rest-api withdraw API)

### 35-02: Owner 상태 분기 매트릭스 SSoT 작성

**대상 산출물:** 신규 매트릭스 (objectives/v0.8 문서 내 또는 별도 SSoT 문서)
**변경 규모:** 중 (신규 작성, 기존 문서 변경 없음)
**핵심 작업:**
1. API 엔드포인트 x OwnerState(NONE/GRACE/LOCKED) 전체 동작 매트릭스 작성
2. 매트릭스 내용이 Phase 31-34에서 각 문서에 반영된 동작과 일치하는지 교차 검증
3. 매트릭스 위치 결정 (34-owner-wallet-connection 문서에 추가 vs 별도 SSoT)

**의존:** 35-01 (CLI 명령어가 확정되어야 매트릭스에 CLI 동작 포함 가능)

### 35-03: 14개 설계 문서 v0.8 통합 반영

**대상 문서:** 14개 (10개 교차 검증 + 4개 첫 v0.8 반영)
**변경 규모:** 중-대 (문서별 소-중 규모, 총량이 큼)
**핵심 작업:**

| 문서 | 작업 유형 | 구체적 변경 |
|------|----------|-----------|
| 30-session-token-protocol | 첫 v0.8 반영 | 세션 갱신 Owner 유무 분기 참조 추가, 헤더에 v0.8 업데이트 일자 |
| 31-solana-adapter-detail | 첫 v0.8 반영 | sweepAll Solana 구현 참조 (27 §6.11 연계), v0.8 메서드 수 19->20 반영, 헤더 |
| 54-cli-flow-redesign | 35-01에서 완료 | (35-01 산출물 -- 여기서 재처리 불필요) |
| 40-telegram-bot-docker | 첫 v0.8 반영 | 다운그레이드 알림 인라인 메시지, Owner 미등록 시 안내, [거부하기] 버튼 참조 |
| 57-asset-query | 참조 보강 | sweepAll이 getAssets() 결과를 활용한다는 참조 추가 |
| 60-batch-transaction | 참조 보강 | sweepAll 토큰 배치가 buildBatch()를 활용한다는 참조 추가 |
| 61-price-oracle | 참조 보강 | 다운그레이드 판단 시 resolveEffectiveAmountUsd() 참조 추가 |
| 25, 52, 33, 34, 37, 27, 36, 53, 35 | 교차 검증 | [v0.8] 태그 일관성, 매트릭스와의 정합성, 누락 보완 |
| 32-transaction-pipeline | 교차 검증 | PolicyDecision 확장, 다운그레이드 관련 참조 |

**의존:** 35-01 (54 문서 완료), 35-02 (매트릭스 완료)

## Sources

### Primary (HIGH confidence)

- `/Users/minho.yoo/dev/wallet/WAIaaS/objectives/v0.8-optional-owner-progressive-security.md` -- v0.8 원본 스펙, CLI 변경 섹션 3-4, 영향 문서 14개 목록
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/ROADMAP.md` -- Phase 35 정의, 성공 기준 5개
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/REQUIREMENTS.md` -- DX-01~05, INTEG-01~02 요구사항
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/STATE.md` -- Phase 31-34 결정 사항 25건
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/54-cli-flow-redesign.md` -- 현재 CLI 설계 (v0.5 기준, 22개 변경 위치 식별)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/34-owner-wallet-connection.md` -- Owner 생명주기 섹션 10 (3-State, 6전이)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/37-rest-api-complete-spec.md` -- withdraw API 스펙 (§8.18)
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/33-time-lock-approval-mechanism.md` -- APPROVAL 다운그레이드 Step 9.5
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/phases/34-자금-회수-보안-분기-설계/34-01-SUMMARY.md` -- Kill Switch withdraw Open Question
- `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/phases/34-자금-회수-보안-분기-설계/34-02-SUMMARY.md` -- 세션 갱신 Owner 분기 결정

### Secondary (MEDIUM confidence)

- 14개 설계 문서의 [v0.8] 태그 분포 (grep 결과: 10개 문서 101건, 4개 문서 0건)
- objectives/v1.0-implementation-planning.md -- 구현 로드맵에서 CLI/DX 관련 참조

## Metadata

**Confidence breakdown:**
- CLI 변경 설계: HIGH -- v0.8 objective + 54 문서 직접 분석 완료
- SSoT 매트릭스: HIGH -- Phase 31-34 산출물에서 모든 동작 분기 이미 확정
- 14개 문서 통합: HIGH -- 14개 문서 전체 v0.8 태그 현황 파악 완료
- Open Questions: MEDIUM -- Kill Switch withdraw 결정은 planner 판단 필요

**Research date:** 2026-02-09
**Valid until:** 2026-02-16 (설계 문서 수정이므로 안정적)
