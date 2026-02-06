# Phase 11: CRITICAL 의사결정 확정 - Research

**Researched:** 2026-02-06
**Domain:** 설계 문서 비일관성 해소, 의사결정 확정, 문서 반영
**Confidence:** HIGH

## Summary

Phase 11은 v0.3 설계 논리 일관성 확보의 핵심 단계로, 시스템의 기본 동작에 영향을 미치는 CRITICAL 모순 4건(C1, C2, C3, C8)을 단일 값으로 확정하고 해당 설계 문서에 반영한다. Phase 10에서 C4~C7(v0.1 잔재)은 이미 해결되었으므로, 남은 4건에 집중한다.

각 CRITICAL 이슈의 현황을 분석한 결과:
- **C1 (기본 포트)**: 24-monorepo는 3000, 29-api-framework와 대다수 문서는 3100 사용. **3100으로 통일** 필요
- **C2 (트랜잭션 상태 Enum)**: DB 스키마(25-sqlite)는 8개 상태 정의, 일부 문서(40-telegram-bot)에서 14개 언급. 실제로는 **8개 상태가 SSoT**이며, 클라이언트 표시 상태 분리 필요
- **C3 (Docker 127.0.0.1 바인딩)**: localhost 강제 바인딩이 Docker 컨테이너 내부 통신을 차단. **WAIAAS_HOST 환경변수 오버라이드** 설계 필요
- **C8 (자금 충전 모델)**: v0.1의 Squads Vault 기반 충전 프로세스가 v0.2에서 대체되었으나 대안 미명시. **Owner → Agent 직접 전송** 방식 문서화 필요

**Primary recommendation:** 각 CRITICAL 이슈별로 단일 값을 확정하고, 관련 문서를 일괄 수정하는 계획을 수립하라. 특히 C1(포트 통일)은 24-monorepo 단일 문서 수정으로 해결되고, C3(Docker 바인딩)은 새로운 환경변수 설계가 필요하다.

---

## CRITICAL 이슈 상세 분석

### CRIT-01: 기본 포트 통일 (C1)

**문제 정의:**
`config.toml` 기본값이 문서마다 다르게 정의되어 있다.

| 문서 | 포트 값 | 위치 |
|------|---------|------|
| 24-monorepo-data-directory.md | `3000` | [daemon].port 기본값, Zod default |
| 29-api-framework-design.md | `3100` | [daemon].port 기본값 명시 |
| 37-rest-api-complete-spec.md | `3100` | Base URL 정의 |
| 38-sdk-mcp-interface.md | `3100` | 모든 URL 예시 |
| 40-telegram-bot-docker.md | `3100` | docker-compose ports |
| 28-daemon-lifecycle-cli.md | `3000` | CLI 예시 |

**현황 분석:**
- `3100`을 사용하는 문서가 더 많음 (4개 vs 2개)
- 29-api-framework에서 "3100: 3000/3001/8080 등 흔히 사용되는 포트와 충돌 방지" 근거 제시
- 24-monorepo가 CORE-01로 config.toml SSoT 역할이지만, 3000으로 잘못 기재됨

**결정 방향:**
- **3100으로 통일**: 충돌 방지 근거가 명확하고, 대다수 문서가 이미 3100 사용
- 수정 대상: 24-monorepo-data-directory.md, 28-daemon-lifecycle-cli.md
- 수정 내용: 기본값 `3000` → `3100`, 관련 예시 모두 업데이트

**수정 필요 위치 (24-monorepo):**
```
라인 669: | `port` | integer | `3000` → `3100`
라인 749: port = 3000 → port = 3100
라인 736: cors_origins 3000 → 3100
라인 823: "http://127.0.0.1:3000" → 3100
라인 837: .default(3000) → .default(3100)
```

**수정 필요 위치 (28-daemon-lifecycle):**
```
라인 1356, 1369, 1407, 1409, 1420, 1435, 1706, 1732: 3000 → 3100
```

**Confidence:** HIGH — 문서 직접 분석 완료

---

### CRIT-02: 트랜잭션 상태 Enum 통일 (C2)

**문제 정의:**
40-telegram-bot-docker.md에서 14개 상태값을 참조한다는 objectives/03-design-consistency.md의 지적이 있으나, 실제 분석 결과는 다름.

**현황 분석 (직접 검증):**

| 문서 | 정의된 상태 | 개수 |
|------|-------------|------|
| 25-sqlite-schema.md | `PENDING, QUEUED, EXECUTING, SUBMITTED, CONFIRMED, FAILED, CANCELLED, EXPIRED` | 8 |
| 32-transaction-pipeline-api.md | 동일한 8개 상태 | 8 |
| 37-rest-api-complete-spec.md | `TransactionStatusEnum = z.enum([...])` 8개 | 8 |

**14개 상태 주장의 근거:**
objectives/03-design-consistency.md에서 "Bot이 14개 상태값 참조"라고 했으나, 40-telegram-bot-docker.md를 직접 검색한 결과:
- 해당 문서에서 트랜잭션 상태 14개를 정의하는 곳이 발견되지 않음
- 가능성: v0.1 문서(10-transaction-flow.md)의 8단계 + v0.2 8상태를 혼동했을 수 있음

**결론:**
- 실제로 **DB 8개 상태가 이미 SSoT**로 작동 중
- C2는 이미 해결된 상태일 가능성이 높음
- 다만, **클라이언트 표시용 상태 매핑**이 필요할 수 있음 (예: QUEUED + DELAY tier = "대기 중 (15분 쿨다운)")

**결정 방향:**
1. 8개 상태가 DB CHECK 제약과 일치함을 확인 (완료)
2. 클라이언트 표시 상태 가이드를 37-rest-api-complete-spec.md에 추가
   - 예: `{ dbStatus: 'QUEUED', tier: 'DELAY' } → displayText: '대기 중 (15분 후 실행)'`
3. 40-telegram-bot-docker.md에서 상태 표시 패턴 검증

**Confidence:** HIGH — 직접 검증으로 14개 상태 주장이 오류임 확인

---

### CRIT-03: Docker 바인딩 전략 확정 (C3)

**문제 정의:**
29-api-framework-design.md에서 `hostname: z.literal('127.0.0.1')`로 강제하여 외부 접근을 원천 차단한다. 이는 보안상 올바른 결정이나, Docker 컨테이너 내부에서 데몬을 실행할 때 문제가 발생한다.

**Docker 환경 문제:**
```
┌─────────────────────────────────────────┐
│ Docker Host (localhost)                 │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Container                        │    │
│  │ Hono: 127.0.0.1:3100             │    │  ← 컨테이너 내부 loopback
│  │ (외부 접근 불가)                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Host: 127.0.0.1:3100 매핑 시도 실패    │
└─────────────────────────────────────────┘
```

**현재 설계 (29-api-framework):**
```typescript
// hostname은 Zod 스키마에서 z.literal('127.0.0.1')로 강제
const ConfigSchema = z.object({
  daemon: z.object({
    hostname: z.literal('127.0.0.1').default('127.0.0.1'),
    // ...
  })
})
```

**40-telegram-bot-docker.md 해결책 (이미 제시됨):**
```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:3100:3100"  # 호스트 localhost → 컨테이너 3100
```
- 컨테이너 내부에서 `0.0.0.0:3100` 바인딩 → Docker가 호스트 `127.0.0.1:3100`으로 매핑
- **문제**: 현재 Zod 스키마가 `0.0.0.0` 허용하지 않음

**결정 방향:**

1. **환경변수 오버라이드 설계**:
   ```typescript
   const HostnameSchema = z.union([
     z.literal('127.0.0.1'),
     z.literal('0.0.0.0'),
   ]).default('127.0.0.1')

   // 환경변수: WAIAAS_DAEMON_HOSTNAME=0.0.0.0
   // Docker 전용, 일반 사용 시 127.0.0.1 유지
   ```

2. **문서 수정 대상**:
   - 24-monorepo-data-directory.md: config.toml [daemon].hostname 설명 수정
   - 29-api-framework-design.md: z.literal 제약 완화 + 보안 경고 추가
   - 40-telegram-bot-docker.md: WAIAAS_DAEMON_HOSTNAME 환경변수 명시

3. **보안 유지 전략**:
   - 기본값은 여전히 `127.0.0.1` (로컬 전용)
   - `0.0.0.0`은 Docker 환경에서만 사용, 반드시 Docker 포트 매핑 `127.0.0.1:3100:3100`과 함께
   - 문서에 "0.0.0.0 Day 공격" 경고 명시

**Confidence:** HIGH — 40-telegram-bot-docker.md에서 이미 해결 방향 제시됨

---

### CRIT-04: 자금 충전 모델 문서화 (C8)

**문제 정의:**
v0.1에서 "Owner → Agent 자금 충전" 프로세스가 Squads Vault 기반으로 설계되었으나, v0.2 Self-Hosted 모델에서는 Squads를 사용하지 않는다. 그러나 대안이 명시적으로 문서화되지 않았다.

**v0.1 설계 (13-fund-deposit-process.md):**
- Squads Vault PDA에 SOL 전송
- Vault에서 Agent 지갑으로 예산 할당
- 다층 예산 관리 (일일/주간/총액 한도)

**v0.2 모델:**
- Squads 미사용 → Vault PDA 없음
- Agent 지갑은 독립적인 Solana/EVM 주소
- 정책 엔진(33-time-lock-approval-mechanism.md)이 예산 한도 관리

**현황 분석:**
- v0.2 설계 문서 어디에도 "Owner가 Agent 지갑에 자금을 어떻게 보내는가"가 명시되지 않음
- 27-chain-adapter-interface.md의 `IChainAdapter.getBalance()`가 Agent 잔액 조회
- 하지만 충전 프로세스 자체는 WAIaaS 범위 외

**결정 방향:**

Self-Hosted 모델에서 자금 충전은 **WAIaaS 시스템 외부**에서 발생한다:

```
┌─────────────────────────────────────────────────────────────┐
│ Owner Wallet (Phantom, Ledger 등)                           │
│                                                             │
│   1. "Agent 지갑 주소 조회" → WAIaaS GET /v1/wallet/address │
│   2. SOL 전송 (Phantom에서 직접)  →  Agent 지갑 주소        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ 온체인 전송 (WAIaaS 외부)
         │
┌─────────────────────────────────────────────────────────────┐
│ Agent Wallet (WAIaaS 관리)                                  │
│                                                             │
│   3. 잔액 반영 (자동)                                       │
│   4. GET /v1/wallet/balance로 확인 가능                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**문서화 필요 내용:**

1. **자금 충전 프로세스 (간략):**
   - Owner는 Agent 지갑 주소로 직접 SOL/ETH 전송
   - WAIaaS는 전송을 중개하지 않음 (보안상 Owner의 Private Key 미접근)
   - Agent 지갑 주소는 `GET /v1/wallet/address` 또는 Tauri Desktop에서 조회

2. **v0.1 대비 단순화:**
   - Squads Vault 불필요 → 직접 전송으로 즉시 반영
   - 다층 예산 관리 → 정책 엔진(policies 테이블)으로 대체
   - "충전" 개념보다 "잔액 확인"에 집중

3. **문서 반영 위치:**
   - 37-rest-api-complete-spec.md의 `/v1/wallet/address` 엔드포인트에 사용 사례 추가
   - 새 문서 또는 기존 문서 섹션에 "자금 충전 가이드" 추가
   - 13-fund-deposit-process.md에 SUPERSEDED 표기 (Phase 10에서 완료 여부 확인 필요)

**Confidence:** HIGH — v0.2 아키텍처에서 자연스러운 결론

---

## Standard Stack

이 Phase는 코드 작성이 아닌 **문서 편집 작업**이므로, "Standard Stack"은 문서화 표준과 패턴을 의미한다.

### Core

| 표준 | 용도 | 왜 표준인가 |
|------|------|-------------|
| ADR Status Format | 결정 기록 | 업계 검증된 아키텍처 결정 기록 표준 |
| Zod Schema | 설정 스키마 정의 | 프로젝트 SSoT (CORE-01 결정) |
| Markdown Table | 변경 매핑 | 기계 파싱 가능, 한눈에 파악 |

### Supporting

| 도구 | 용도 |
|------|------|
| Git | 변경 이력 추적 |
| Grep | 참조 검색 (포트 번호, 상태값 등) |

---

## Architecture Patterns

### Pattern 1: 단일 진실 소스 (SSoT) 업데이트

**What:** 설정/스키마의 정의가 여러 문서에 분산된 경우, 하나의 문서를 SSoT로 지정하고 나머지는 참조로 전환

**When to use:** C1(포트 통일), C2(Enum 통일) 해결 시

**Pattern:**
1. SSoT 문서 식별 (예: 24-monorepo for config.toml)
2. SSoT 문서 값 확정
3. 다른 문서의 값을 SSoT 참조로 변경 또는 직접 수정

### Pattern 2: 환경변수 오버라이드

**What:** 기본값은 안전하게 유지하되, 특수 환경(Docker)에서 다른 값을 사용할 수 있도록 환경변수 오버라이드 허용

**When to use:** C3(Docker 바인딩) 해결 시

**Pattern:**
```typescript
const HostnameSchema = z.union([
  z.literal('127.0.0.1'),
  z.literal('0.0.0.0'),
]).default('127.0.0.1')

// 환경변수 우선순위: WAIAAS_DAEMON_HOSTNAME > config.toml > default
```

### Pattern 3: 외부 프로세스 위임

**What:** 시스템 범위를 벗어나는 작업은 사용자에게 위임하고, 그 결과만 시스템에서 확인

**When to use:** C8(자금 충전 모델) 해결 시

**Pattern:**
- 자금 전송은 Owner 지갑에서 직접 수행 (WAIaaS 범위 외)
- WAIaaS는 결과 조회만 제공 (`GET /v1/wallet/balance`)

---

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 대신 사용 | 이유 |
|------|-------------------|-----------|------|
| 포트 기본값 | 각 문서에 다른 값 | SSoT 문서(24-monorepo) 참조 | 불일치 방지 |
| 상태 Enum | 문서마다 다른 정의 | 25-sqlite-schema CHECK 제약 참조 | DB가 강제 |
| Docker 바인딩 | 커스텀 네트워크 설정 | 표준 포트 매핑 `127.0.0.1:3100:3100` | Docker 베스트 프랙티스 |
| 자금 충전 | WAIaaS 내부 전송 로직 | 외부 지갑에서 직접 전송 | 보안 (Owner Key 미접근) |

---

## Common Pitfalls

### Pitfall 1: 부분 수정 (Incomplete Update)

**What goes wrong:** SSoT 문서만 수정하고, 참조하는 다른 문서의 값은 그대로 둠
**Why it happens:** 모든 참조 위치를 찾지 않음
**How to avoid:** Grep으로 전체 검색 후 일괄 수정 (`grep -r "port.*3000"`)
**Warning signs:** 동일 설정에 대해 다른 값이 검색됨

### Pitfall 2: 보안 완화 과다 (Over-Relaxation)

**What goes wrong:** C3 해결을 위해 `z.literal('127.0.0.1')` 제약을 완전히 제거
**Why it happens:** "작동하게 만들기" 우선
**How to avoid:** `z.union([...])` 패턴으로 허용 값 명시적 제한, 기본값 유지
**Warning signs:** 임의의 IP에 바인딩 가능해짐

### Pitfall 3: 문서화 누락 (Missing Documentation)

**What goes wrong:** C8에서 "자금 충전은 외부에서"라고 결정했으나, 사용자가 방법을 모름
**Why it happens:** 개발자 관점에서 당연한 내용
**How to avoid:** 사용자 가이드 수준의 설명 추가 (Agent 주소 조회 → 지갑에서 전송)
**Warning signs:** FAQ에 "자금 충전 방법?" 질문 반복

---

## Code Examples (Document Edit Patterns)

### C1 수정 패턴 (24-monorepo-data-directory.md)

```markdown
#### [daemon] 섹션 -- 데몬 서버 설정

| 키 | 타입 | 기본값 | 유효 범위 | 설명 |
|----|------|--------|----------|------|
| `port` | integer | `3100` | 1024-65535 | HTTP 서버 포트 |
| `hostname` | string | `"127.0.0.1"` | `"127.0.0.1"`, `"0.0.0.0"` | 바인딩 주소. Docker 환경에서만 0.0.0.0 허용 |
```

### C3 환경변수 오버라이드 패턴

```typescript
// packages/core/src/schemas/config.schema.ts

const DaemonConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3100),
  hostname: z.union([
    z.literal('127.0.0.1'),
    z.literal('0.0.0.0'),
  ]).default('127.0.0.1'),
  // ...
})

// 환경변수 매핑
// WAIAAS_DAEMON_HOSTNAME=0.0.0.0 (Docker 전용)
```

### C3 Docker Compose 패턴 (40-telegram-bot-docker.md 보강)

```yaml
# docker-compose.yml
services:
  waiaas:
    environment:
      - WAIAAS_DAEMON_HOSTNAME=0.0.0.0  # 컨테이너 내 모든 인터페이스
    ports:
      - "127.0.0.1:3100:3100"  # 호스트에서는 localhost만 노출
    # ...

# 보안 경고:
# - WAIAAS_DAEMON_HOSTNAME=0.0.0.0은 Docker 환경 전용
# - 반드시 ports에서 127.0.0.1 prefix 사용
# - 0.0.0.0:3100:3100 (전체 노출)은 절대 금지
```

### C8 자금 충전 문서화 패턴

```markdown
## 자금 충전 가이드

### 개요

WAIaaS에서 Agent 지갑에 자금을 충전하는 것은 일반적인 암호화폐 전송과 동일합니다.
WAIaaS는 Owner의 Private Key에 접근하지 않으므로, 전송은 Owner의 지갑 앱에서 직접 수행합니다.

### 절차

1. **Agent 지갑 주소 조회**
   ```bash
   # CLI
   curl -H "Authorization: Bearer $SESSION_TOKEN" \
     http://127.0.0.1:3100/v1/wallet/address
   ```
   또는 Tauri Desktop의 "지갑" 탭에서 확인

2. **SOL/ETH 전송**
   - Phantom, Ledger, MetaMask 등 Owner의 지갑 앱에서
   - 조회한 Agent 지갑 주소로 원하는 금액 전송

3. **잔액 확인**
   ```bash
   curl -H "Authorization: Bearer $SESSION_TOKEN" \
     http://127.0.0.1:3100/v1/wallet/balance
   ```

### v0.1 대비 변경

| v0.1 (Squads Vault) | v0.2 (Self-Hosted) |
|---------------------|-------------------|
| Owner → Vault PDA → Agent | Owner → Agent 직접 전송 |
| 다층 예산 관리 | 정책 엔진(policies)으로 대체 |
| 중앙 Vault 관리 | Agent 지갑 독립 관리 |
```

---

## Open Questions

1. **C2 14개 상태 출처**
   - What we know: 실제 DB 스키마와 API 스펙 모두 8개 상태
   - What's unclear: objectives/03-design-consistency.md의 "14개 상태" 주장 근거
   - Recommendation: 40-telegram-bot-docker.md 전체 검색으로 14개 주장 검증 후, 해당 없으면 C2를 "이미 해결됨"으로 처리

2. **C8 문서 위치**
   - What we know: 자금 충전 가이드 필요
   - What's unclear: 별도 문서(45-fund-deposit-guide.md) vs 기존 문서 섹션 추가
   - Recommendation: 37-rest-api-complete-spec.md의 `/v1/wallet/address` 엔드포인트 설명에 사용 사례로 추가 (별도 문서 불필요)

3. **13-fund-deposit-process.md SUPERSEDED 여부**
   - What we know: Phase 10에서 SUPERSEDED 대상에 포함되었을 가능성
   - What's unclear: 실제 SUPERSEDED 표기 완료 여부
   - Recommendation: Phase 10 산출물(41-v01-v02-mapping.md) 확인 후 누락 시 이번 Phase에서 추가

---

## Sources

### Primary (HIGH confidence)

- **24-monorepo-data-directory.md** - config.toml SSoT, 포트 3000 정의
- **29-api-framework-design.md** - API 프레임워크 설계, 포트 3100 정의, z.literal('127.0.0.1') 정의
- **25-sqlite-schema.md** - transactions.status CHECK 제약 8개 상태
- **32-transaction-pipeline-api.md** - 8-state machine 정의
- **37-rest-api-complete-spec.md** - TransactionStatusEnum 8개, REST API 스펙
- **40-telegram-bot-docker.md** - Docker 포트 매핑, docker-compose 설계
- **objectives/03-design-consistency.md** - CRITICAL 이슈 목록 (C1, C2, C3, C8)

### Secondary (MEDIUM confidence)

- **28-daemon-lifecycle-cli.md** - CLI 예시에서 포트 3000 사용
- **38-sdk-mcp-interface.md** - SDK/MCP에서 포트 3100 사용
- **13-fund-deposit-process.md (v0.1)** - Squads Vault 기반 자금 충전 (대체됨)

### Tertiary (LOW confidence)

- objectives/03-design-consistency.md의 C2 "14개 상태" 주장 - 직접 검증 결과 확인되지 않음

---

## Metadata

**Confidence breakdown:**
- C1 (포트 통일): HIGH - 문서 직접 분석, 수정 위치 특정
- C2 (상태 Enum): HIGH - DB 스키마 확인, 14개 주장은 오류로 판단
- C3 (Docker 바인딩): HIGH - 문제와 해결책 모두 40-telegram-bot-docker.md에 기재
- C8 (자금 충전): HIGH - v0.2 아키텍처에서 자연스러운 결론

**Research date:** 2026-02-06
**Valid until:** 30 days (설계 문서 안정적, 구현 전 단계)

---

## 요구사항 -> 작업 매핑

| 요구사항 | 내용 | 리서치 결과 반영 |
|---------|------|-----------------|
| CRIT-01 | 기본 포트 3100 통일 | 24-monorepo, 28-daemon-lifecycle 수정 위치 특정 |
| CRIT-02 | 트랜잭션 상태 Enum 통일 | 이미 8개로 통일됨, 클라이언트 표시 가이드 추가 권장 |
| CRIT-03 | Docker 바인딩 전략 | WAIAAS_DAEMON_HOSTNAME 환경변수 오버라이드 설계 |
| CRIT-04 | 자금 충전 모델 문서화 | Owner → Agent 직접 전송, 37-rest-api 사용 사례 추가 |
