# Architecture Patterns: Type Safety + Code Quality Refactoring

**Domain:** 타입 안전 개선 및 코드 품질 리팩토링
**Researched:** 2026-03-16

## Recommended Architecture

기존 WAIaaS 모노레포 아키텍처를 변경하지 않고, 4개 핵심 영역에서 점진적 타입 안전 강화를 수행한다. 행위 변경 없음, API 변경 없음, DB 마이그레이션 없음.

### Component Boundaries (현재 패키지 의존 그래프)

```
@waiaas/core          <- 모든 패키지가 의존 (Zod SSoT, 인터페이스, 에러)
  ^
@waiaas/actions       <- core만 의존 (ActionProvider, IAsyncStatusTracker)
  ^
@waiaas/daemon        <- core + actions + adapters 의존
  |-- api/            <- Hono 라우트, 미들웨어
  |-- services/       <- 비즈니스 로직
  |-- pipeline/       <- 6-stage 트랜잭션 파이프라인
  |-- infrastructure/ <- DB, 설정, 키스토어
  |-- workflow/       <- 지연/승인 워크플로우
  |-- notifications/  <- 알림 서비스
  +-- signing/        <- 서명 기능
```

### 데이터 흐름 (Policy Rule JSON.parse 경로)

```
DB (policies.rules TEXT) -> JSON.parse() -> as Type 캐스팅 (현재, 위험)
                         -> JSON.parse() -> Zod safeParse -> typed result (목표)
```

## 질문 1: Policy Rule Schema 위치 -- core에 유지

**결론: `@waiaas/core/schemas/policy.schema.ts`에 유지한다.**

현재 상태 분석:
- `core/schemas/policy.schema.ts`에 이미 13개 PolicyType별 rules 스키마가 존재한다 (`AllowedTokensRulesSchema`, `SpendingLimitRulesSchema`, `WhitelistRulesSchema` 등)
- `POLICY_RULES_SCHEMAS` 레코드가 이미 타입-스키마 매핑을 관리한다
- `CreatePolicyRequestSchema.superRefine`에서 입력 시점 검증에 사용 중
- `database-policy-engine.ts`에서 DB 읽기 시에는 검증 없이 `JSON.parse(row.rules) as Type`으로 캐스팅 중 (문제 지점)

**왜 core인가:**
1. 이미 core에 존재하므로 이동이 불필요하다
2. `POLICY_RULES_SCHEMAS` 매핑은 API 라우트(입력 검증)와 파이프라인(DB 읽기 검증) 양쪽에서 필요하다
3. core는 daemon/actions/sdk 모두가 의존하는 공유 계층이므로 SSoT로 적합하다

**필요한 변경:**
- `POLICY_RULES_SCHEMAS` 매핑을 export해야 한다 (현재 모듈 내부 const)
- `database-policy-engine.ts`에서 `JSON.parse(row.rules) as Type` 패턴을 `safeParse` 패턴으로 교체

```typescript
// core/schemas/policy.schema.ts -- 기존 내부 매핑을 export
export const POLICY_RULES_SCHEMAS: Record<string, z.ZodTypeAny> = { ... };

// daemon/pipeline/database-policy-engine.ts -- 사용 패턴
import { POLICY_RULES_SCHEMAS } from '@waiaas/core';

function parsePolicyRules<T>(type: string, rawJson: string): T {
  const parsed: unknown = JSON.parse(rawJson);
  const schema = POLICY_RULES_SCHEMAS[type];
  if (!schema) return parsed as T; // 전용 스키마 없는 타입은 pass-through
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ChainError('POLICY_INVALID', `Invalid ${type} rules: ${result.error.message}`);
  }
  return result.data as T;
}
```

### 컴포넌트 영향도

| 컴포넌트 | 변경 유형 | 상세 |
|----------|----------|------|
| `core/schemas/policy.schema.ts` | export 추가 | `POLICY_RULES_SCHEMAS` export |
| `core/index.ts` | re-export 추가 | `POLICY_RULES_SCHEMAS` |
| `daemon/pipeline/database-policy-engine.ts` | 수정 | ~20개 `JSON.parse as` -> `parsePolicyRules` |
| `daemon/services/x402/x402-domain-policy.ts` | 수정 | 1개 `JSON.parse` |
| `daemon/services/erc8128/erc8128-domain-policy.ts` | 수정 | 1개 `JSON.parse` |

## 질문 2: Raw SQLite Client 노출 방식 -- DatabaseConnection 인터페이스 유지

**결론: 현재 `DatabaseConnection { sqlite, db }` 패턴을 유지한다. 추상화를 강화하지 않는다.**

현재 상태:
- `infrastructure/database/connection.ts`가 `DatabaseConnection { sqlite: DatabaseType; db: BetterSQLite3Database }` 반환
- `DatabasePolicyEngine` 생성자가 `db` (Drizzle) + optional `sqlite` (raw) 이중 패턴 사용
- `delay-queue.ts`도 동일한 이중 패턴
- `api/routes/incoming.ts`가 `deps.sqlite.prepare()` 직접 사용 (GROUP BY + date formatting)
- Raw SQLite가 필요한 이유: `BEGIN IMMEDIATE` 트랜잭션 (Drizzle에서 미지원), 복잡한 집계 SQL

**왜 추상화를 강화하지 않는가:**
1. `DatabaseConnection`이 이미 명시적 인터페이스로 양쪽을 노출한다
2. Raw SQLite 사용처가 정당한 사유를 갖고 있다 (BEGIN IMMEDIATE, 복잡 집계)
3. 래퍼를 추가하면 Drizzle의 타입 안전성을 raw 쿼리에 적용할 수 없어 실익이 없다
4. 이 마일스톤의 범위는 기존 `as any` 제거이지 DB 추상화 재설계가 아니다

**타입 안전 관점에서 필요한 변경:**
- Raw SQLite 사용 시 결과를 `as` 캐스팅 대신 Zod 스키마로 검증
- `incoming.ts`의 `rawRows = deps.sqlite.prepare(sqlQuery).all(...params) as RawRow[]` -> 명시적 타입 가드

```typescript
// 현재 (위험)
const rawRows = deps.sqlite.prepare(sqlQuery).all(...params) as RawRow[];

// 개선 (Zod 검증)
const RawRowSchema = z.object({
  date: z.string(),
  count: z.number(),
  // ...
});
const rawRows = z.array(RawRowSchema).parse(
  deps.sqlite.prepare(sqlQuery).all(...params)
);
```

## 질문 3: IAsyncStatusTracker 패키지 이동 -- 이동 불필요, 이미 올바른 위치

**결론: `@waiaas/actions`에 유지한다. 이동이 필요하지 않다.**

현재 상태 분석:
- `IAsyncStatusTracker`는 `@waiaas/actions/src/common/async-status-tracker.ts`에 정의
- `actions/src/index.ts`에서 re-export
- daemon이 `@waiaas/actions`에서 import하여 사용 (`async-polling-service.ts`, `gas-condition-tracker.ts`)
- actions 패키지의 구현체들이 이 인터페이스를 implement (`bridge-status-tracker.ts`, `withdrawal-tracker.ts`, `epoch-tracker.ts`)

**의존 방향:**
```
core <- actions(인터페이스 정의 + 구현체) <- daemon(소비자)
```

이 의존 방향은 정상이다:
1. actions 패키지가 인터페이스를 정의하고 구현체를 제공하는 것은 올바른 소유권
2. daemon이 actions에 의존하는 것은 기존 패키지 그래프에 부합
3. core로 올리면 core가 비대해지고, actions 패키지 존재 이유가 약화됨

**만약 미래에 이동이 필요해진다면 (예: 새 패키지가 actions 없이 인터페이스만 필요할 때):**

```typescript
// Step 1: core에 인터페이스 추가
// core/src/interfaces/async-status-tracker.ts

// Step 2: actions에서 re-export (하위 호환)
// actions/src/common/async-status-tracker.ts
export type { IAsyncStatusTracker } from '@waiaas/core';

// Step 3: daemon import 경로는 변경 불필요 (actions re-export 유지)
```

이 패턴은 "re-export bridge"로, 소비자 코드 변경 없이 인터페이스를 이동할 수 있다. **하지만 현재는 불필요하다.**

## 질문 4: 레이어 위반 수정 -- 유틸리티 승격 패턴

**결론: `services/ -> api/middleware/` 방향 import를 유틸리티 모듈 추출로 해결한다.**

### 현재 위반 지점

```typescript
// daemon/src/services/wc-signing-bridge.ts (서비스 계층)
import { verifySIWE } from '../api/middleware/siwe-verify.js';      // <- api 계층 import (위반)
import { decodeBase58 } from '../api/middleware/address-validation.js'; // <- api 계층 import (위반)
```

**정상 레이어 방향:**
```
api/ -> services/ -> infrastructure/   (상위 -> 하위만 허용)
```

**수정 전략: 순수 함수를 적절한 계층으로 이동**

`verifySIWE`와 `decodeBase58`는 HTTP 컨텍스트에 의존하지 않는 순수 함수이므로 미들웨어가 아닌 유틸리티에 속한다.

```
수정 전:
  api/middleware/siwe-verify.ts      (verifySIWE 정의)
  api/middleware/address-validation.ts (decodeBase58 정의)
  services/wc-signing-bridge.ts      (위 두 파일 import -- 위반)

수정 후:
  infrastructure/crypto/siwe-verify.ts     (verifySIWE 이동)
  infrastructure/crypto/address-validation.ts (decodeBase58 이동)
  api/middleware/siwe-verify.ts            -> re-export from infrastructure (하위 호환)
  api/middleware/address-validation.ts     -> re-export from infrastructure (하위 호환)
  services/wc-signing-bridge.ts            -> import from infrastructure (정상 방향)
```

**단계별 실행 계획:**

1. **신규 파일 생성**: `infrastructure/crypto/siwe-verify.ts`, `infrastructure/crypto/address-validation.ts`
2. **기존 미들웨어 파일을 re-export로 변환**: 기존 import 경로를 사용하는 다른 코드가 깨지지 않도록
3. **서비스 레이어 import 경로 변경**: `../api/middleware/` -> `../infrastructure/crypto/`
4. **테스트 확인**: 행위 변경 없으므로 기존 테스트 통과 확인만

```typescript
// infrastructure/crypto/siwe-verify.ts (신규, 순수 함수)
export { verifySIWE, type VerifySIWEParams } from './siwe-verify-impl.js';

// api/middleware/siwe-verify.ts (기존, re-export로 변환)
// 하위 호환: 기존 api/ 내부 import는 그대로 작동
export { verifySIWE, type VerifySIWEParams } from '../../infrastructure/crypto/siwe-verify.js';
```

## Patterns to Follow

### Pattern 1: Zod safeParse for DB JSON columns

**What:** DB에서 읽은 JSON 문자열을 Zod 스키마로 검증 후 사용
**When:** `JSON.parse()` 결과를 `as Type` 캐스팅하는 모든 곳
**Example:**

```typescript
// 범용 헬퍼 (daemon/pipeline/policy-rule-parser.ts)
import { POLICY_RULES_SCHEMAS } from '@waiaas/core';

export function parsePolicyRules(type: string, rulesJson: string): unknown {
  const parsed: unknown = JSON.parse(rulesJson);
  const schema = POLICY_RULES_SCHEMAS[type];
  if (!schema) return parsed;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ChainError('POLICY_INVALID',
      `Corrupted ${type} policy rules in DB: ${result.error.message}`);
  }
  return result.data;
}
```

### Pattern 2: Re-export Bridge for Cross-Package Migration

**What:** 인터페이스/유틸리티를 다른 패키지로 이동할 때 원래 위치에 re-export를 남겨 소비자 코드 변경을 최소화
**When:** 패키지 간 또는 레이어 간 코드 이동 시
**Example:**

```typescript
// 원래 위치 (api/middleware/siwe-verify.ts)
// 구현은 infrastructure로 이동, 여기는 re-export만
export { verifySIWE, type VerifySIWEParams } from '../../infrastructure/crypto/siwe-verify.js';
```

### Pattern 3: SSoT 통합 (중복 유틸리티)

**What:** 동일 함수가 여러 패키지에 중복 정의된 경우 하나로 통합
**When:** `sleep`, `NATIVE_DECIMALS` 등 4+ 중복 정의가 발견될 때
**Example:**

```
sleep() 중복 현황:
  - daemon/src/pipeline/sleep.ts       (canonical, export됨)
  - core/src/interfaces/connection-state.ts (내부 함수)
  - cli/src/commands/stop.ts           (내부 함수)
  - adapters/solana/src/adapter.ts     (내부 함수)

통합 방향:
  - core/src/utils/sleep.ts 로 이동 -> 전 패키지에서 import
  - 내부 함수들은 core import로 교체
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: as any/as unknown as 캐스팅으로 타입 시스템 우회

**What:** 타입 불일치를 `as any` 또는 `as unknown as TargetType`으로 강제 캐스팅
**Why bad:** 런타임 타입 불일치를 컴파일 타임에 감지 불가, DB 스키마 변경 시 조용히 깨짐
**Instead:** Zod 스키마 검증, 제네릭 타입 제약, 명시적 타입 가드

### Anti-Pattern 2: 레이어 역방향 import

**What:** 하위 계층(services)이 상위 계층(api)의 코드를 import
**Why bad:** 순환 의존성 위험, 테스트 격리 불가, 변경 전파 범위 확대
**Instead:** 공유 기능을 하위 계층(infrastructure) 또는 공유 패키지(core)로 추출

### Anti-Pattern 3: 모듈 내부 유틸리티 함수 무분별 복제

**What:** `sleep()`, 포맷팅 함수 등을 각 파일에 로컬로 재정의
**Why bad:** 수정 시 모든 복사본을 찾아야 함, 일관성 보장 불가
**Instead:** `@waiaas/core/utils` 또는 패키지 내 공유 유틸리티로 단일 정의

## Build Order (의존성 기반 단계 순서)

타입 안전 리팩토링은 의존성 방향(core -> actions -> daemon)의 역순으로 진행해야 한다. 하위 계층부터 안전하게 만든 후 상위 계층을 수정한다.

```
Phase 1: Core 계층 export 정비
  |-- POLICY_RULES_SCHEMAS export
  |-- sleep() SSoT 이동 (core/utils/)
  +-- NATIVE_DECIMALS SSoT 확인

Phase 2: Infrastructure 계층 유틸리티 추출
  |-- infrastructure/crypto/siwe-verify.ts 신규
  |-- infrastructure/crypto/address-validation.ts 신규
  +-- api/middleware re-export 전환

Phase 3: Pipeline 계층 Zod 검증 적용
  |-- parsePolicyRules 헬퍼 생성
  |-- database-policy-engine.ts ~20개 JSON.parse 교체
  +-- 기타 서비스의 JSON.parse 교체

Phase 4: as any 제거 + 레이어 위반 수정
  |-- wc-signing-bridge.ts import 경로 변경
  |-- hot-reload.ts as any 제거
  |-- daemon lifecycle as any 제거
  +-- 기타 프로덕션 코드 as any 제거

Phase 5: 중복 코드 SSoT 통합 + 정리
  |-- sleep() 중복 4개 -> core import
  |-- formatDisplayCurrency 통합 확인
  +-- 팬텀 설정 정리
```

**Phase 순서 근거:**
- Phase 1이 먼저인 이유: Phase 3에서 사용할 export가 필요
- Phase 2가 Phase 4보다 앞인 이유: 레이어 위반 수정의 전제 조건 (이동 대상 먼저 생성)
- Phase 3이 Phase 4보다 앞인 이유: Zod 검증이 적용되어야 일부 `as any` 제거가 가능
- Phase 5가 마지막인 이유: 기능적 리스크가 가장 낮고 독립적

## Scalability Considerations

| Concern | 현재 상태 | 리팩토링 후 |
|---------|----------|------------|
| Zod 검증 성능 | JSON.parse만 (빠름) | JSON.parse + safeParse (미미한 오버헤드, policy는 요청당 수 회) |
| 패키지 빌드 시간 | core 변경 시 전체 재빌드 | 동일 (core export 추가는 minor) |
| 테스트 안정성 | `as any`로 타입 불일치 은폐 가능 | safeParse 실패 시 명시적 에러로 조기 발견 |
| DB 스키마 변경 안전성 | 런타임에서만 발견 | Zod 검증이 잘못된 데이터를 즉시 포착 |

## Sources

- `packages/core/src/schemas/policy.schema.ts` -- 기존 13개 policy rule 스키마 (직접 코드 분석)
- `packages/daemon/src/infrastructure/database/connection.ts` -- DatabaseConnection 인터페이스 (직접 코드 분석)
- `packages/actions/src/common/async-status-tracker.ts` -- IAsyncStatusTracker 위치 확인 (직접 코드 분석)
- `packages/daemon/src/services/wc-signing-bridge.ts` -- 레이어 위반 지점 확인 (직접 코드 분석)
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- JSON.parse as Type 패턴 20+ 지점 (직접 코드 분석)
