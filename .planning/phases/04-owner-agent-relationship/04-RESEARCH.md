# Phase 4: 소유자-에이전트 관계 모델 - Research

**Researched:** 2026-02-05
**Domain:** Owner-Agent relationship modeling / Fund flow design / Agent lifecycle / Emergency recovery / Multi-agent management
**Confidence:** HIGH

## Summary

Phase 4는 Phase 3에서 확정된 Dual Key Architecture (Owner Key + Agent Key), Squads 2-of-2 멀티시그, 3중 정책 검증 레이어를 기반으로 소유자와 에이전트 간의 실제 운영 시나리오를 구체화하는 설계 문서를 작성한다. 본 리서치는 자금 충전/회수 프로세스, 에이전트 키 관리(생성/정지/폐기), 비상 회수 메커니즘, 멀티 에이전트 관리 모델의 5개 요구사항(REL-01 ~ REL-05)을 충족하기 위해 필요한 기술적 패턴과 설계 원칙을 조사하였다.

핵심 발견사항: (1) Squads v4의 Spending Limits는 Period 기반(OneTime/Day/Week/Month) 자동 리셋으로 예산 한도 설계에 직접 활용 가능하며, Vault에서 멀티시그 승인 없이 허용된 멤버가 직접 인출하는 구조를 지원한다. (2) 에이전트 생명주기 상태 모델은 CREATING -> ACTIVE -> SUSPENDED -> TERMINATED 4단계가 업계 표준이며, Squads의 configAuthority를 Owner Key 전용으로 설정함으로써 멤버 추가/제거를 통한 상태 전환이 온체인에서 강제된다. (3) Solana 생태계에는 전용 dead man's switch 메커니즘이 없어 비상 회수는 Owner Key 단독 서명 + 서버 측 자동 트리거 혼합 방식으로 설계해야 한다. (4) 멀티 에이전트 관리는 Squads 멀티시그를 에이전트별로 생성하되, 동일 Owner Key를 모든 멀티시그의 configAuthority로 지정하는 "Hub-and-Spoke" 패턴이 적합하다.

**Primary recommendation:** Squads v4의 Spending Limits와 configAuthority를 최대한 활용하여 온체인 정책 강제를 기반으로 하되, 복잡한 비즈니스 로직(자동 보충, 합산 예산, 상태 관리)은 서버 레벨에서 구현하여 온체인/오프체인 역할을 명확히 분리하라.

## Standard Stack

Phase 3에서 확정된 기술 스택 위에 Phase 4 설계에 필요한 핵심 구성 요소.

### Core

| 구성 요소 | 버전/스펙 | 용도 | 선택 이유 |
|----------|----------|------|----------|
| Squads Protocol v4 | SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf | 온체인 멀티시그, Spending Limits, Time Locks | $10B+ 보호 실적, formal verification 완료 |
| @sqds/multisig | latest | TypeScript SDK: 멀티시그 생성, 멤버 관리, Spending Limit 설정 | 공식 SDK, 5개 네임스페이스 (instructions/rpc/transactions/accounts/utils) |
| AWS KMS ED25519 | ECC_NIST_EDWARDS25519 | Owner Key: configAuthority 역할, 비상 회수 서명 | FIPS 140-2 Level 3, CloudTrail 불변 감사 |
| Nitro Enclaves | EC2 c5.xlarge+ | Agent Key: Spending Limit 범위 내 자율 서명 | 하드웨어 격리, vsock 통신 |
| PostgreSQL | 15+ (Prisma 6.x ORM) | 에이전트 상태 관리, 예산 추적, 감사 로그 | Phase 1에서 확정, ACID 보장 |
| Redis | ioredis | 실시간 잔액 캐시, Circuit Breaker 상태, 알림 큐 | Phase 1에서 확정, 밀리초 응답 |

### Supporting

| 구성 요소 | 용도 | 사용 시점 |
|----------|------|----------|
| solana-kms-signer | KMS ED25519로 Solana 트랜잭션 서명 | Owner Key 비상 회수 서명 시 |
| @solana/kit 또는 @solana/web3.js | RPC 호출, 잔액 조회, 트랜잭션 구성 | 자금 충전/회수 트랜잭션 구성 |
| CloudTrail | 불변 감사 로그 | 모든 Owner Key 작업 추적 |
| Webhook/SNS | 알림 전달 | 보충 알림, 비상 회수 알림, 에스컬레이션 |

### 설계 도구 (이 단계에서 사용)

| 도구 | 용도 |
|------|------|
| Mermaid | 상태 전이 다이어그램, 시퀀스 다이어그램 |
| TypeScript 인터페이스 | 데이터 모델, API 계약 정의 |
| 표 형식 정책 매트릭스 | 예산 한도, 권한 매핑 문서화 |

## Architecture Patterns

### Pattern 1: Hub-and-Spoke 멀티 에이전트 구조

**What:** 하나의 Owner Key가 여러 Squads 멀티시그의 configAuthority로 등록되어, 각 에이전트별 독립 지갑을 중앙에서 관리하는 패턴.

**When to use:** 한 소유자가 다수의 에이전트를 운영할 때 (REL-05).

**구조:**
```
                   ┌──────────────┐
                   │  Owner Key   │
                   │ (AWS KMS)    │
                   └──────┬───────┘
                          │ configAuthority
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Squads #1 │  │  Squads #2 │  │  Squads #3 │
   │  Agent A   │  │  Agent B   │  │  Agent C   │
   │  Vault #1  │  │  Vault #2  │  │  Vault #3  │
   └────────────┘  └────────────┘  └────────────┘
```

**핵심 원칙:**
- 에이전트 간 자금 격리: 각 에이전트는 독립된 Squads Vault 보유
- 중앙 제어: Owner Key 하나로 모든 에이전트 관리 (추가/제거/정책 변경)
- 에이전트 간 자금 이동: Owner Key 서명을 통해 Vault 간 전송 (정책 범위 내)

### Pattern 2: 예산 풀 (Budget Pool) + Spending Limits 연동

**What:** 소유자가 Squads Vault에 자금을 예치하고, Squads Spending Limits로 에이전트의 인출 한도를 온체인에서 강제하는 패턴.

**When to use:** 자금 충전/사용 프로세스 설계 시 (REL-01).

**동작:**
```
소유자 지갑 ──(SOL/SPL 전송)──> Squads Vault (에이전트 예산 풀)
                                     │
                              Spending Limit 설정:
                              - mint: SOL 또는 USDC
                              - amount: 기간당 한도
                              - period: Day/Week/Month
                              - members: [Agent Key]
                              - destinations: [허용 주소]
                                     │
                              Agent Key가 SpendingLimitUse로
                              멀티시그 승인 없이 직접 인출
```

**Squads Spending Limit 파라미터 (검증됨):**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| create_key | PublicKey | SpendingLimit PDA 시드 |
| vault_index | u8 | 대상 Vault 인덱스 |
| mint | PublicKey | 토큰 민트 (default=SOL, NATIVE_MINT=wSOL) |
| amount | u64 | 기간당 허용 금액 (mint decimals 기준) |
| period | Period enum | OneTime(0), Day(1), Week(2), Month(3) |
| members | PublicKey[] | 사용 가능한 멤버 목록 |
| destinations | PublicKey[] | 허용 목적지 (빈 배열=모든 주소) |

**내부 상태:**
- remaining_amount: 현재 기간 내 잔여 한도
- last_reset: Unix timestamp 기반 리셋 시점

**Confidence:** HIGH - Squads v4 공식 문서, TypeDoc, docs.rs 소스 코드에서 직접 확인

### Pattern 3: 에이전트 상태 머신 (Agent Lifecycle State Machine)

**What:** 에이전트의 전체 생명주기를 유한 상태 머신으로 모델링하여 상태 전환 규칙을 명확히 정의하는 패턴.

**When to use:** 에이전트 생성/정지/폐기 프로세스 설계 시 (REL-03).

**권장 상태 모델:**

```
[*] ──> CREATING: 에이전트 생성 시작
        │
        ▼
     ACTIVE: 정상 운영
        │
        ├──> SUSPENDED: 일시 정지 (이상 탐지, 소유자 요청)
        │       │
        │       ├──> ACTIVE: 재활성화 (소유자 승인)
        │       └──> TERMINATING: 폐기 결정
        │
        └──> TERMINATING: 폐기 프로세스 시작
                │
                ├── 진행 중 트랜잭션 완료 대기 / 취소
                ├── 잔여 자금 소유자에게 회수
                ├── Squads 멤버에서 제거
                └── 키 메모리 삭제
                │
                ▼
           TERMINATED: 최종 상태 (불가역)
```

**각 상태별 온체인/오프체인 매핑:**

| 상태 | 서버 DB | Squads 온체인 | 트랜잭션 허용 |
|------|--------|-------------|-------------|
| CREATING | agent.status = 'creating' | 멤버 추가 중 | 불가 |
| ACTIVE | agent.status = 'active' | 멤버로 등록됨, Spending Limit 활성 | 정책 범위 내 허용 |
| SUSPENDED | agent.status = 'suspended' | 멤버 유지, 서버에서 요청 차단 | 불가 (서버 레벨 차단) |
| TERMINATING | agent.status = 'terminating' | 멤버 제거 진행 중 | 불가 |
| TERMINATED | agent.status = 'terminated' | 멤버 아님 | 불가 |

**설계 결정 - SUSPENDED 시 Squads 멤버 유지 이유:**
- 재활성화 시 Squads 멤버 재등록 트랜잭션 불필요 (비용/시간 절약)
- 서버 레벨에서 모든 요청 차단으로 충분한 보안
- Squads Spending Limit은 서버 없이 직접 사용 가능한 것이므로, SUSPENDED 시에도 온체인에서의 직접 SpendingLimitUse 호출 가능성이 이론적으로 존재 -> 위험 분석 필요 (Pitfall 2 참조)

### Pattern 4: 혼합 비상 회수 (Hybrid Emergency Recovery)

**What:** 소유자 수동 트리거와 시스템 자동 트리거를 결합한 비상 회수 메커니즘.

**When to use:** 에이전트 장애, 키 탈취 의심, 시스템 이상 시 자금 복구 (REL-04).

**트리거 유형:**

| 트리거 | 주체 | 조건 | 자동화 수준 |
|--------|------|------|------------|
| 수동 회수 | 소유자 | 소유자 판단 | MFA 인증 후 즉시 실행 |
| Circuit Breaker | 시스템 | 연속 5회 트랜잭션 실패 (Phase 3 확정) | 자동 정지 + 소유자 알림 |
| 이상 탐지 | 시스템 | 규칙 기반 이상 행위 (Phase 3 ARCH-04) | 자동 정지 + 수동 회수 대기 |
| 타임아웃 | 시스템 | 에이전트 heartbeat 미응답 (설정 가능) | 자동 정지 + 소유자 알림 |

**비상 회수 절차:**
```
트리거 발생
    │
    ▼
1. 에이전트 즉시 SUSPENDED 전환 (서버 레벨, ~ms)
    │
    ▼
2. 대기 중 트랜잭션 처리
   - 이미 온체인 제출된 것: 결과 대기 (취소 불가)
   - 서명 전 단계: 즉시 거부
   - Squads Proposal 상태: stale 처리 (실행 안 함)
    │
    ▼
3. Owner Key로 자금 회수 (configAuthority 사용)
   - Squads Vault Transfer (Owner Key 단독 서명)
   - 또는 Squads 멤버 제거 후 threshold 변경으로 단독 인출
    │
    ▼
4. Agent Key 폐기 (Squads RemoveMember + 키 삭제)
    │
    ▼
5. 감사 로그 기록 + 소유자 알림
```

**중요 제약 (Squads 관련):**
- Squads Protocol에는 전용 "break-glass" 메커니즘이 없음 (HIGH confidence, 검증됨)
- Owner Key가 configAuthority이므로 멤버 추가/제거는 가능하지만, threshold 이하 서명자로는 Vault 자금을 직접 이동할 수 없음
- 비상 회수 시 Owner Key로 Spending Limit을 새로 생성하여 Owner 자신에게 할당하는 방식 또는, Agent를 멤버에서 제거하여 threshold을 1-of-1로 만든 후 Owner 단독으로 Vault 트랜잭션 실행하는 방식 검토 필요

### Pattern 5: 계층적 예산 한도 체계

**What:** 건당/일일/주간/월간 한도를 계층적으로 적용하되, Squads 온체인 한도와 서버 오프체인 한도를 분리하는 패턴.

**When to use:** 예산 한도 단위 설계 시 (Claude's Discretion).

**권장 한도 구조:**

```
┌─────────────────────────────────────────────────────────┐
│                    예산 한도 계층                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Layer 1: 서버 정책 (오프체인, 빠른 거부)                │
│  ─────────────────────────────────                       │
│  - 건당 한도 (per-transaction limit)                     │
│  - 일일 한도 (daily aggregate)                           │
│  - 주간/월간 한도 (weekly/monthly aggregate)             │
│  - 전체 에이전트 합산 한도 (owner-level aggregate)       │
│  - 화이트리스트/시간 제어                                │
│                                                          │
│  Layer 2: Squads Spending Limits (온체인, 변조 불가)     │
│  ─────────────────────────────────                       │
│  - Period 기반 한도 (Day/Week/Month)                    │
│  - 토큰별 독립 한도 (SOL, USDC 등 개별 설정)           │
│  - 목적지 제한 (destinations 파라미터)                   │
│  - remaining_amount 자동 추적                            │
│                                                          │
│  Layer 3: Dynamic Threshold (서버 라우팅)                │
│  ─────────────────────────────────                       │
│  - 소액: Agent 단독 (1-of-2, SpendingLimitUse)          │
│  - 중액: Agent + Time Lock                              │
│  - 고액: Owner + Agent 2-of-2 필수                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**온체인 vs 오프체인 한도 분리 원칙:**

| 한도 유형 | 구현 위치 | 이유 |
|----------|----------|------|
| 건당 최대 금액 | 서버 + Enclave | Squads는 건당 한도 미지원, 기간 기반만 지원 |
| 일일/주간/월간 한도 | Squads Spending Limit (온체인) | 변조 불가, 서버 침해 시에도 강제 |
| 전체 에이전트 합산 한도 | 서버 (오프체인) | Squads는 개별 멀티시그 단위만 관리 |
| 목적지 화이트리스트 | 양쪽 모두 | Squads destinations + 서버 화이트리스트 |
| 시간 제어 (운영 시간) | 서버 + Enclave | Squads에 시간대 기반 제어 없음 |

### Anti-Patterns to Avoid

- **단일 Squads 멀티시그에 다수 에이전트 등록:** 한 Vault를 여러 에이전트가 공유하면 에이전트 간 자금 격리 불가. 에이전트별 독립 멀티시그 생성 필수.
- **SUSPENDED 상태에서 Squads 멤버 즉시 제거:** 재활성화 시 온체인 트랜잭션 비용 발생. TERMINATED에서만 멤버 제거.
- **서버 정책만 의존 (온체인 한도 미설정):** 서버 침해 시 정책 우회 가능. Squads Spending Limit은 최종 방어선으로 반드시 설정.
- **에이전트 폐기 시 자금 회수를 잊음:** 에이전트 키 폐기 전 반드시 Vault 잔액 소유자 회수 완료 확인.
- **멀티시그 계정 주소로 자금 전송:** Squads 공식 경고 - 반드시 Vault 계정 주소로 전송. 멀티시그 계정으로 보내면 복구 불가.

## Don't Hand-Roll

설계 문서 단계에서 커스텀 솔루션을 제안하면 안 되는 영역:

| 문제 | 커스텀 설계 금지 | 사용할 기존 솔루션 | 이유 |
|------|----------------|------------------|------|
| 기간별 예산 한도 | 커스텀 잔액 추적 로직 | Squads Spending Limits (Period enum) | 온체인 강제, remaining_amount 자동 추적 |
| 멀티시그 멤버 관리 | 커스텀 권한 시스템 | Squads configAuthority + Permissions | formal verification 완료, 감사 완료 |
| 온체인 시간 지연 | 커스텀 타이머 프로그램 | Squads Time Locks | 내장 기능, SetTimeLock config action |
| 목적지 화이트리스트 (온체인) | 커스텀 Solana 프로그램 | Squads Spending Limit destinations | 내장 파라미터 |
| Owner Key 서명 (HSM 수준) | 커스텀 키 관리 | AWS KMS ED25519 | FIPS 140-2 Level 3 인증 |

**Key insight:** Phase 3에서 확정된 아키텍처(Squads + KMS + Enclaves)가 Phase 4에서 필요한 대부분의 온체인 메커니즘을 이미 제공한다. 설계 문서는 이 기존 메커니즘 위에 비즈니스 로직(자동 보충, 합산 한도, 상태 관리)을 오프체인으로 구현하는 방법에 집중해야 한다.

## Common Pitfalls

### Pitfall 1: Squads Vault 주소 혼동

**What goes wrong:** 자금을 Squads 멀티시그 계정 주소로 보내면 복구가 불가능하거나 매우 어려움.
**Why it happens:** 멀티시그 PDA와 Vault PDA가 별개의 주소임을 인지하지 못함.
**How to avoid:** 설계 문서에서 자금 충전 흐름을 정의할 때, 반드시 Vault PDA (findProgramAddressSync(['vault', multisigPda, vaultIndex])) 주소를 명시. 멀티시그 계정 주소로의 전송을 API 레벨에서 차단.
**Warning signs:** 문서에서 "멀티시그 주소로 전송"이라는 표현이 등장하면 즉시 수정.
**Confidence:** HIGH - Squads 공식 문서에 명시된 경고.

### Pitfall 2: SUSPENDED 에이전트의 온체인 Spending Limit 접근

**What goes wrong:** 서버에서 SUSPENDED 상태로 전환했지만, Agent Key가 직접 Squads SpendingLimitUse instruction을 호출하여 서버를 우회할 수 있는 이론적 가능성.
**Why it happens:** SUSPENDED 시 Squads 멤버를 유지하기로 설계했기 때문에, Agent Key는 여전히 온체인에서 유효.
**How to avoid:** (1) SUSPENDED 전환 시 Squads Spending Limit의 members에서 해당 Agent Key를 제거하는 온체인 트랜잭션 실행 (Owner 서명). (2) 또는 SUSPENDED 시 Spending Limit amount를 0으로 설정하여 무력화. (3) 근본적으로 Agent Key는 Enclave/서버 내에서만 사용 가능하므로 외부에서 직접 호출할 가능성은 매우 낮음 (키가 외부로 유출되지 않는 한).
**Warning signs:** 설계 문서에서 SUSPENDED 상태의 온체인 영향을 다루지 않으면 보안 구멍.
**Confidence:** MEDIUM - Squads의 SpendingLimitUse는 멤버이기만 하면 호출 가능한 것으로 추정되나, Agent Key가 Enclave 내에만 있으므로 실제 위험도는 낮음.

### Pitfall 3: 키 로테이션 중 트랜잭션 레이스 컨디션

**What goes wrong:** 키 로테이션 도중 이전 키로 서명된 트랜잭션이 온체인에 제출되어 실패하거나, 새 키가 아직 등록되지 않은 상태에서 요청이 들어옴.
**Why it happens:** Squads 멤버 교체(addMember + removeMember)가 2개의 별도 온체인 트랜잭션이며, 사이에 지연 발생.
**How to avoid:** (1) 로테이션 시작 시 에이전트를 SUSPENDED로 전환하여 새 트랜잭션 차단. (2) 진행 중 트랜잭션 완료 대기 (타임아웃 설정). (3) 새 키 addMember 완료 후 기존 키 removeMember 순서 엄수. (4) 두 작업 사이 실패 시 롤백 절차 정의.
**Warning signs:** "키 로테이션은 간단하다"는 표현 -- 실제로는 분산 시스템의 상태 전환 문제.
**Confidence:** HIGH - 멀티시그 키 로테이션은 널리 알려진 문제 (Polygon Best Practices 가이드 등).

### Pitfall 4: 자금 회수 시 Squads Threshold 문제

**What goes wrong:** 2-of-2 멀티시그에서 Agent Key를 폐기한 후, Owner Key 단독으로 Vault 자금을 이동할 수 없음 (threshold=2인데 서명자 1명).
**Why it happens:** Agent 멤버 제거 후 threshold을 변경하지 않으면, 남은 멤버로 threshold을 충족할 수 없음.
**How to avoid:** 에이전트 폐기 절차: (1) 먼저 ChangeThreshold(1)로 threshold 변경. (2) 그 다음 Vault 자금 회수 트랜잭션 실행. (3) 마지막으로 RemoveMember로 Agent 멤버 제거. 순서가 중요.
**Warning signs:** 문서에서 폐기 절차를 "키 삭제 -> 자금 회수" 순서로 정의하면 잠김.
**Confidence:** HIGH - Squads 멀티시그의 threshold 메커니즘은 명확히 문서화됨.

### Pitfall 5: 자동 보충의 무한 루프

**What goes wrong:** 자동 보충 설정 시, 에이전트가 자금을 빠르게 소진하면 소유자 지갑에서 반복적으로 자금이 빠져나감.
**Why it happens:** 임계값 기반 자동 보충은 소유자 의사와 무관하게 실행될 수 있음.
**How to avoid:** (1) 일일/주간 최대 보충 횟수 제한. (2) 소유자 잔액 최소 보호 금액 설정. (3) 비정상적 보충 패턴 탐지 (짧은 시간 내 반복 보충 시 경고). (4) 전체 에이전트 합산 예산 한도로 총량 제어.
**Warning signs:** 자동 보충 설계에 "횟수 제한"이나 "소유자 보호 잔액"이 없으면 위험.
**Confidence:** HIGH - 일반적인 자동화 시스템의 안전 장치 원칙.

### Pitfall 6: 비상 회수 시 이미 제출된 온체인 트랜잭션

**What goes wrong:** 비상 회수를 트리거했지만, 이미 Solana 네트워크에 제출된 트랜잭션이 블록에 포함되어 자금이 이동됨.
**Why it happens:** 블록체인 트랜잭션은 일단 제출되면 취소할 수 없음.
**How to avoid:** (1) 이 한계를 설계 문서에 명시적으로 기술. (2) 정책 한도를 보수적으로 설정하여 단일 트랜잭션의 최대 손실을 제한. (3) Squads Spending Limits가 기간당 총액을 제한하므로 연쇄 손실 방지. (4) 실시간 모니터링으로 제출 시점과 확정 시점 사이 알림.
**Warning signs:** "비상 회수 시 모든 자금을 즉시 보호"라는 표현 -- 이미 전송 중인 것은 보호 불가.
**Confidence:** HIGH - 블록체인의 근본적 특성.

## Code Examples

설계 문서에 포함될 핵심 인터페이스와 데이터 모델 예시.

### 에이전트 데이터 모델

```typescript
// Source: Phase 3 ARCH-01 + Phase 4 설계
interface Agent {
  id: string;
  ownerId: string;
  walletId: string;

  // 상태
  status: AgentStatus;
  statusChangedAt: Date;
  statusReason: string;

  // Squads 연동
  multisigPda: PublicKey;
  vaultPda: PublicKey;
  agentPublicKey: PublicKey;

  // 예산 설정
  budgetConfig: BudgetConfig;

  // 보충 설정
  replenishmentConfig: ReplenishmentConfig;

  // 메타데이터
  createdAt: Date;
  lastActiveAt: Date;
  keyRotatedAt: Date | null;
}

enum AgentStatus {
  CREATING = 'creating',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated',
}
```

### 예산 설정 모델

```typescript
// Source: Squads v4 SpendingLimit + 서버 정책 확장
interface BudgetConfig {
  // 서버 정책 (오프체인)
  perTransactionLimit: bigint;    // 건당 최대 금액
  dailyLimit: bigint;             // 일일 합산 한도
  weeklyLimit: bigint;            // 주간 합산 한도
  monthlyLimit: bigint;           // 월간 합산 한도

  // Squads Spending Limit (온체인 - 변조 불가)
  onChainSpendingLimits: OnChainSpendingLimit[];

  // 화이트리스트
  allowedDestinations: PublicKey[];
  allowedPrograms: PublicKey[];

  // 시간 제어
  operatingHoursUtc: { start: number; end: number } | null;  // null = 24/7
}

interface OnChainSpendingLimit {
  spendingLimitPda: PublicKey;
  mint: PublicKey;              // SOL | USDC | etc.
  amount: bigint;              // 기간당 한도
  period: Period;              // Day | Week | Month | OneTime
  destinations: PublicKey[];   // 허용 목적지
}

// Squads v4 Period enum (verified from TypeDoc)
enum Period {
  OneTime = 0,
  Day = 1,
  Week = 2,
  Month = 3,
}
```

### 자금 보충 설정 모델

```typescript
// Source: CONTEXT.md 결정사항 - 자동/수동 보충 모두 지원
interface ReplenishmentConfig {
  mode: ReplenishmentMode;

  // 자동 보충 설정
  autoReplenish?: {
    thresholdAmount: bigint;       // 잔액이 이 금액 이하가 되면 보충
    replenishAmount: bigint;       // 보충할 금액
    maxDailyReplenishments: number; // 일일 최대 보충 횟수
    ownerMinBalance: bigint;       // 소유자 지갑 최소 보호 잔액
    sourceVault: PublicKey;         // 소유자 자금 출처
  };

  // 알림 설정
  notification?: {
    thresholdAmount: bigint;       // 알림 발송 임계값
    channels: NotificationChannel[];
  };
}

enum ReplenishmentMode {
  AUTO = 'auto',           // 자동 보충
  MANUAL = 'manual',       // 알림 후 수동 보충
}
```

### 비상 회수 인터페이스

```typescript
// Source: CONTEXT.md + Phase 3 ARCH-04
interface EmergencyRecoveryConfig {
  // 비상 트리거 설정
  triggers: EmergencyTrigger[];

  // 회수 목적지 (사전 등록)
  recoveryDestination: PublicKey;

  // 타임아웃 (에이전트 비활성 시)
  inactivityTimeoutMinutes: number | null;  // null = 비활성화

  // 대기 트랜잭션 처리 방침
  pendingTxPolicy: PendingTxPolicy;
}

interface EmergencyTrigger {
  type: 'manual' | 'circuit_breaker' | 'anomaly_detection' | 'inactivity_timeout';
  autoSuspend: boolean;     // 자동 SUSPENDED 전환 여부
  autoRecover: boolean;     // 자동 자금 회수 여부 (false 권장)
  notifyOwner: boolean;     // 소유자 알림 여부
}

enum PendingTxPolicy {
  WAIT_AND_TIMEOUT = 'wait_and_timeout',   // 제출된 건 완료 대기, 타임아웃 설정
  REJECT_ALL = 'reject_all',                // 서명 전 건 모두 거부
}
```

### 멀티 에이전트 통합 대시보드 데이터 모델

```typescript
// Source: CONTEXT.md 결정사항 - 통합 대시보드 API 필요
interface OwnerDashboard {
  ownerId: string;
  ownerPublicKey: PublicKey;

  // 전체 에이전트 합산 정보
  totalAgents: number;
  activeAgents: number;
  suspendedAgents: number;
  totalBalance: bigint;
  totalSpentToday: bigint;

  // 전체 합산 예산 한도
  globalBudgetLimit: GlobalBudgetLimit;

  // 에이전트별 상세
  agents: AgentSummary[];
}

interface AgentSummary {
  agentId: string;
  status: AgentStatus;
  vaultBalance: bigint;
  spentToday: bigint;
  remainingDailyLimit: bigint;
  lastTransactionAt: Date | null;
  alertCount: number;
}

interface GlobalBudgetLimit {
  dailyLimit: bigint;          // 전체 에이전트 합산 일일 한도
  weeklyLimit: bigint;         // 전체 에이전트 합산 주간 한도
  monthlyLimit: bigint;        // 전체 에이전트 합산 월간 한도
  currentDailySpend: bigint;   // 현재까지 합산 사용액
}
```

## State of the Art

| 이전 접근 | 현재 접근 | 변경 시점 | Phase 4 영향 |
|----------|----------|----------|-------------|
| 단일 키 지갑 + 수동 승인 | Dual Key + 정책 기반 자율 실행 | 2024-2025 AI Agent 부상 | 에이전트 자율성과 소유자 통제권의 균형 설계 필수 |
| 외부 WaaS 프로바이더 의존 | KMS + TEE + Squads 직접 구축 | Phase 2에서 결정 | 모든 설계가 Squads v4 기능 범위 내에서 가능해야 함 |
| 고정 threshold 멀티시그 | 서버 라우팅 동적 threshold | Phase 3에서 확정 | 금액 기반 에스컬레이션 로직이 서버에 위치 |
| Slot 기반 시간 계산 | Unix timestamp 기반 Spending Limit | Squads v4 현재 | Period(Day/Week/Month)는 시계 시간 기반, 슬롯이 아님 |
| AI 에이전트 단일 배포 | 멀티 에이전트 fleet 관리 | 2025-2026 트렌드 | Hub-and-Spoke 패턴으로 확장 가능한 멀티 에이전트 설계 |

**Deprecated/outdated:**
- Squads v3: v4로 업그레이드됨. v4의 spending limits, time locks, roles가 Phase 4 설계에 필수적이므로 v3 참조 금지.
- Slot 기반 기간 계산: Squads Spending Limit은 Unix timestamp 기반. Phase 3 문서의 SpendingPeriod enum (216,000 슬롯 등)은 수정 필요 -- 실제 Squads v4는 Period.Day/Week/Month로 시계 시간 기반 자동 리셋.

## Discretion Recommendations

CONTEXT.md에서 Claude's Discretion으로 지정된 항목에 대한 리서치 기반 권장사항.

### 1. 자금 회수 트리거 설계

**권장:** 혼합 방식 (수동 + 자동)
- 수동 회수: 소유자가 언제든 MFA 인증 후 부분/전체 회수 요청
- 자동 회수: 에이전트 TERMINATED 시에만 잔액 전액 자동 회수 (사용자 결정 사항 반영)
- Circuit Breaker/이상 탐지 시: 자동 SUSPENDED + 소유자 알림, 회수는 수동 (소유자 판단)

**이유:** 자동 회수는 의도치 않은 자금 이동 위험. 자동 정지 + 수동 회수가 안전한 기본값.

### 2. 예산 한도 단위 설계

**권장:** 4단계 계층 구조
1. **건당 한도** (per-transaction): 서버 + Enclave 정책 (오프체인)
2. **일일 한도** (daily): Squads Spending Limit Period.Day (온체인) + 서버 (오프체인)
3. **주간 한도** (weekly): Squads Spending Limit Period.Week (온체인)
4. **월간 한도** (monthly): Squads Spending Limit Period.Month (온체인)

추가: 전체 에이전트 합산 한도 (서버 오프체인, Squads는 개별 멀티시그 단위만 관리)

**이유:** Squads Spending Limit의 Period enum(Day/Week/Month)과 자연스럽게 매핑. 건당 한도는 Squads에서 미지원이므로 서버에서 보완.

### 3. 에이전트 생성 시 초기 설정 플로우

**권장 필수 입력:**
- 예산 한도 (일일/주간/월간 중 최소 1개)
- 보충 모드 (자동/수동)
- 허용 토큰 목록 (최소 1개)

**권장 기본값:**
- 보충 모드: 알림 후 수동 (manual) -- 자동보다 안전한 기본값
- 화이트리스트: 빈 목록 (모든 주소 허용) -- 운영 편의. 필요시 제한
- 운영 시간: 24/7 -- AI 에이전트 특성상 상시 운영이 기본
- 비활성 타임아웃: 60분 -- heartbeat 미응답 시 경고, 자동 SUSPENDED는 선택

### 4. 에이전트 상태 모델

**권장:** 5단계 (CREATING -> ACTIVE -> SUSPENDED -> TERMINATING -> TERMINATED)
- Pattern 3에서 상세 기술. TERMINATING 상태를 별도로 두어 폐기 프로세스(자금 회수, 멤버 제거, 키 삭제)의 원자성을 보장.

### 5. 키 로테이션 시 진행 중 트랜잭션 처리

**권장:** Drain-then-Rotate 패턴
1. 에이전트를 SUSPENDED로 전환 (새 요청 차단)
2. 이미 서명된 트랜잭션의 온체인 확정 대기 (타임아웃: 2분)
3. Squads Proposal 중 미실행 건은 stale 처리
4. 키 로테이션 실행 (addMember -> removeMember)
5. 에이전트를 ACTIVE로 복원

### 6. 비상 회수 트리거 주체

**권장:** 혼합 (소유자 수동 + 시스템 자동 정지)
- 시스템은 자동 정지(SUSPENDED)까지만. 실제 자금 회수는 항상 소유자 수동.
- 이유: 시스템 오류로 인한 불필요한 자금 이동 방지.

### 7. 타임락/비활성 자동 비상 모드

**권장:** 비활성 감지 -> 알림 -> SUSPENDED 전환 (자동 회수는 안 함)
- Solana에는 전용 dead man's switch가 없으므로 서버 레벨에서 heartbeat 모니터링
- 비활성 타임아웃 기본값: 60분 (설정 가능)
- 타임아웃 시: 자동 SUSPENDED + 소유자 알림
- 자금 회수는 소유자 수동 결정

### 8. 가디언 메커니즘 (소유자 키 분실 대비)

**권장:** 2단계 복구 경로
1. **KMS 자동 복구 (클라우드):** AWS KMS 키는 분실 불가 -- IAM Role 기반. Root 계정이 항상 접근 가능.
2. **소유자 변경 절차:** 만약 IAM 접근 자체를 잃은 경우, AWS 계정 복구 절차 통해 IAM 복구 -> KMS 접근 회복.
3. **셀프호스트:** 비밀번호 분실 시 복구 불가. 설계 문서에 "별도 안전한 위치에 비밀번호 백업" 절차를 필수로 명시.

**Solana 생태계 참고:** Gridlock Network 등 social recovery 솔루션이 존재하나, 이는 개인 키 직접 관리 시에 해당. KMS 환경에서는 AWS IAM이 사실상 가디언 역할.

### 9. 비상 회수 시 대기 트랜잭션 처리

**권장:** 3단계 분류 처리
1. **서명 전 (서버 큐):** 즉시 거부, 에이전트에게 REJECTED 응답
2. **서명 완료, 미제출:** 제출 안 함, 파기 (트랜잭션 blockhash 만료까지 대기)
3. **제출 완료, 미확정:** 취소 불가, 결과 대기 (모니터링). Spending Limit이 기간 총액을 제한하므로 추가 손실 방지.

### 10. 전체 에이전트 합산 예산 한도

**권장:** 서버 레벨 구현 (Owner-level aggregate limit)
- Squads는 개별 멀티시그 단위만 관리하므로, 소유자의 모든 에이전트 합산 한도는 서버 정책에서 관리
- 개별 에이전트 요청 시 서버가 전체 합산 사용액을 확인
- Redis에서 실시간 합산 추적 (owner:{ownerId}:daily_spend 등)

## Open Questions

### 1. Squads configAuthority로 Owner Key 단독 자금 회수 가능 여부

- **What we know:** configAuthority는 멤버 추가/제거, threshold 변경, spending limit 설정이 가능함. Vault 자금의 직접 전송은 일반적으로 proposal -> approve -> execute 워크플로 필요.
- **What's unclear:** configAuthority가 threshold 변경 후 단독으로 vault transaction을 실행할 수 있는지, 아니면 proposal 과정을 거쳐야 하는지.
- **Recommendation:** 설계 문서에서 비상 회수 절차를 두 가지 시나리오로 정의: (A) threshold=1로 변경 후 Owner 단독 vault transaction, (B) Owner에게 Spending Limit을 부여하여 직접 인출. 구현 시 테스트로 확인.
- **Confidence:** MEDIUM - Squads v4의 configAuthority와 vault transaction의 정확한 상호작용을 공식 문서에서 완전히 확인하지 못함.

### 2. Squads Spending Limit 업데이트 메커니즘

- **What we know:** AddSpendingLimit과 RemoveSpendingLimit config action이 존재함.
- **What's unclear:** 기존 Spending Limit의 amount나 period를 변경하려면 Remove -> Add를 해야 하는지, 아니면 직접 수정이 가능한지.
- **Recommendation:** Remove + Add 방식으로 설계 (안전한 방향). 구현 시 SDK 확인.
- **Confidence:** MEDIUM - 공식 문서에 UpdateSpendingLimit 같은 action이 보이지 않으므로 Remove -> Add가 유력.

### 3. 에이전트 간 자금 이동의 온체인 구현

- **What we know:** 사용자 결정: "에이전트 간 자금 이동 허용 -- 소유자 정책 범위 내". 각 에이전트는 별도의 Squads Vault를 가짐.
- **What's unclear:** Vault A -> Vault B 이동 시 Owner Key만으로 양쪽 멀티시그에서 서명이 가능한지, 각 멀티시그별로 별도 proposal이 필요한지.
- **Recommendation:** 출발지 Vault에서 Owner Key 서명으로 인출 (threshold 변경 또는 Spending Limit 사용) -> 도착지 Vault로 단순 전송. 서버에서 양쪽 정책 검증 후 실행.
- **Confidence:** MEDIUM - Squads 멀티시그 간 직접 전송 메커니즘이 별도로 있는지 확인 필요.

## Sources

### Primary (HIGH confidence)

- **Squads v4 SpendingLimit struct** - https://docs.rs/squads-multisig/latest/squads_multisig/state/struct.SpendingLimit.html - SpendingLimit 필드, Period enum, remaining_amount 메커니즘
- **Squads v4 TypeDoc Period enum** - https://typedoc.squads.so/enums/generated.Period.html - Period.OneTime(0), Day(1), Week(2), Month(3)
- **Squads v4 Config Transaction** - https://docs.squads.so/main/development/typescript/instructions/create-config-transaction - AddMember, RemoveMember, ChangeThreshold, SetTimeLock, AddSpendingLimit, RemoveSpendingLimit, SetRentCollector
- **Squads v4 SDK Overview** - https://docs.squads.so/main/development/typescript/overview - 5개 네임스페이스, Program ID
- **Squads v4 Quickstart** - https://docs.squads.so/main/development/introduction/quickstart - multisig 생성, proposal 워크플로
- **Squads v4 Spending Limits Reference** - https://docs.squads.so/main/development/reference/spending-limits
- **Squads v4 Time Locks Reference** - https://docs.squads.so/main/development/reference/time-locks
- **Phase 3 deliverables** - 08-dual-key-architecture.md, 09-system-components.md, 10-transaction-flow.md, 11-security-threat-model.md

### Secondary (MEDIUM confidence)

- **Squads Blog: Spending Limits** - https://squads.xyz/blog/spending-limits - 실제 사용 사례, 보안 고려사항
- **Squads Blog: v4 Features** - https://squads.xyz/blog/v4-and-new-squads-app - v4 새 기능 개요
- **Polygon Multisig Best Practices** - https://polygon.technology/blog/multisig-best-practices-to-maximize-transaction-security - 키 로테이션, pending 트랜잭션 처리
- **Multisig Key Rotation Guide** - https://www.bitvault.sv/blog/multisig-key-rotation-step-by-step-guide - 단계별 로테이션 절차

### Tertiary (LOW confidence)

- **Gridlock Network Social Recovery** - https://solanacompass.com/projects/category/identity/social-recovery - Solana 생태계 social recovery 현황 (Phase 4에서는 참고만)
- **Citi Research AI Wallets** - AI 에이전트 prefunded wallet 패턴 (일반 트렌드 참고)
- **MintMCP AI Agent Security Guide** - https://www.mintmcp.com/blog/ai-agent-security - AI 에이전트 보안 모범 사례 (일반적 가이드)
- **HedgeAgents Multi-Agent Finance** - https://arxiv.org/html/2502.13165v1 - 멀티 에이전트 예산 배분 패턴 (학술 참고)

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - Phase 3에서 확정된 기술 스택 위에 구축, Squads v4 기능은 공식 문서로 검증
- Architecture Patterns: HIGH - Squads v4 기능(Spending Limits, configAuthority, Period enum)을 공식 소스에서 직접 확인
- Discretion Recommendations: MEDIUM - 업계 표준 패턴 기반이나, Squads 일부 기능의 정확한 동작(configAuthority의 vault 접근 범위)은 구현 시 검증 필요
- Pitfalls: HIGH - 멀티시그 키 로테이션, threshold 문제 등은 잘 알려진 문제. Squads Vault 주소 혼동은 공식 경고.

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days - Squads v4는 안정 프로토콜, 큰 변경 가능성 낮음)
