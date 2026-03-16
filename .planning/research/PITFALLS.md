# Pitfalls Research

**Domain:** Type Safety + Code Quality Improvements for Production TypeScript Monorepo
**Researched:** 2026-03-16
**Confidence:** HIGH (based on direct codebase analysis + established TypeScript migration patterns)

## Critical Pitfalls

### Pitfall 1: Zod Schema Too Strict for Existing DB Data

**What goes wrong:**
Zod 검증을 `JSON.parse()` 결과에 추가할 때, 기존 DB에 저장된 데이터가 현재 스키마와 불일치하여 런타임 에러 발생. 현재 `database-policy-engine.ts`에 21개의 `JSON.parse(policy.rules)` 호출이 type assertion만 사용 중 (`as SpendingLimitRules` 등). Zod로 전환 시 과거 마이그레이션 이전에 저장된 정책 데이터(예: `instant_max`가 required였던 시기의 데이터)가 즉시 실패할 수 있음.

**Why it happens:**
- 스키마가 시간에 따라 진화했지만 DB 데이터는 저장 시점의 구조를 유지 (Phase 235에서 `instant_max`가 optional로 변경된 것이 대표적 예)
- `JSON.parse() as Type`은 런타임 검증 없이 통과하지만, Zod `.parse()`는 즉시 throw
- SQLite의 JSON 컬럼은 스키마 제약이 없어 다양한 형태의 데이터가 공존

**How to avoid:**
1. **`.safeParse()` + fallback 패턴**: `.parse()` 대신 `.safeParse()`를 사용하고, 실패 시 레거시 호환 파싱 경로 제공
2. **Permissive schema first**: `.passthrough()` + `.partial()`로 시작, 점진적으로 strict 전환
3. **DB 스캔 먼저**: 변경 전에 기존 데이터를 모두 읽어 스키마 호환성 확인하는 마이그레이션 스크립트 작성
4. **정책 rules 스키마를 `z.preprocess()`로 감싸기**: 레거시 필드명/구조를 정규화한 후 검증

**Warning signs:**
- 테스트는 통과하지만 실제 운영 DB에서 실패 (테스트 픽스처는 최신 스키마로만 작성)
- `safeParse`가 아닌 `parse`를 바로 사용하는 코드
- Zod 스키마에 `.default()` 없이 새 필드를 required로 추가

**Phase to address:**
Phase 1 (DatabasePolicyEngine Zod 검증). 가장 먼저 해결해야 함 -- 21개 `JSON.parse` 지점이 집중되어 있고 정책 평가 실패는 트랜잭션 차단으로 이어짐.

---

### Pitfall 2: `as any` 제거 시 런타임 동작 변경

**What goes wrong:**
`as any`는 타입 시스템만 우회하는 것이 아니라, 해당 코드가 특정 런타임 동작에 의존하고 있을 수 있음. 제거 후 올바른 타입을 부여하면 TypeScript 컴파일러가 다른 코드 경로를 선택하게 만들거나, 타입 narrowing이 달라져 런타임 동작이 변경됨.

**Why it happens:**
현재 코드베이스의 프로덕션 `as any` 패턴별 위험도가 다름:

| 패턴 | 건수 | 위험도 | 예시 |
|------|------|--------|------|
| WC `(db as any).session?.client` | 8건 | HIGH | Drizzle 내부 구조 접근, 버전 업시 깨짐 |
| `policyEngine: null as any` | 2건 | MEDIUM | null을 주입하는 의도적 우회, 실제 호출 시 NPE |
| `network as any` (CAIP 변환) | 6건 | LOW | 타입 좁히기 부족, 수정 안전 |
| Solana `instruction as any` | 5건 | HIGH | @solana/kit 6.x 타입 불일치, 라이브러리 제약 |
| hot-reload `pool.evict('solana' as any)` | 4건 | MEDIUM | 함수 시그니처와 실제 사용 불일치 |
| `bundlerClient as any` (AA pipeline) | 4건 | HIGH | permissionless/viem 타입 불일치, 메서드 존재 여부 보장 없음 |
| action-provider-registry mutation | 3건 | LOW | 타입에 없는 필드 추가, 오브젝트 mutation |
| eip712-signer domain/types/message | 3건 | MEDIUM | viem EIP-712 타입과 내부 타입 불일치 |
| external-action-pipeline | 4건 | MEDIUM | 파이프라인 context 타입 확장 필요 |

**How to avoid:**
1. **카테고리별 분류 후 접근**: 각 `as any`의 이유를 파악하고 제거 전략을 카테고리별로 수립
2. **외부 라이브러리 타입 불일치 (`@solana/kit`, WalletConnect, permissionless)**: 타입 단언을 제거하는 대신 wrapper function으로 타입 경계를 명시. 라이브러리 타입이 불완전한 경우 `.d.ts` 확장 사용
3. **의도적 우회 (`policyEngine: null as any`)**: 타입을 `IPolicyEngine | null`로 확장하거나, optional parameter로 리팩토링
4. **각 제거 건에 대해 기존 테스트 + regression 테스트 실행**: 특히 WC 8건과 bundlerClient 4건은 E2E 시나리오 필수

**Warning signs:**
- `as any` 제거 후 TypeScript가 다른 오버로드를 선택
- 제거 후 새로운 `Property does not exist` 에러가 나타남 (실제 런타임에서도 없을 수 있음)
- 테스트에서 mock이 `as any`를 사용하여 실제 타입과 괴리

**Phase to address:**
Phase 3 (`as any` 24건 제거). WC/bundlerClient 같은 외부 라이브러리 의존은 별도 단계로 분리하여 안전하게 처리.

---

### Pitfall 3: SSoT 통합 시 Export 변경으로 다운스트림 깨짐

**What goes wrong:**
중복 코드를 SSoT로 통합할 때 (예: `NATIVE_DECIMALS`, `sleep`, `formatDisplayCurrency`를 `@waiaas/core` 또는 `@waiaas/shared`로 이동), 기존 import 경로가 변경되면서:
- 다른 패키지의 빌드가 실패
- re-export를 빼먹어 외부 사용자(SDK 사용자)의 코드가 깨짐
- 번들 사이즈가 증가 (barrel export로 tree-shaking 실패)

**Why it happens:**
- 12개 패키지 모노레포에서 `@waiaas/core`가 중앙 허브 역할, 이동 시 영향 범위가 넓음
- `@waiaas/shared`가 이미 상수 모듈로 존재하지만, core와 shared의 경계가 불명확
- TypeScript `composite: true` 프로젝트에서 export 변경은 다운스트림 `.d.ts` 재생성 필요

**How to avoid:**
1. **Re-export bridge**: 원래 위치에서 새 위치를 re-export하여 하위 호환 유지, deprecation 주석 추가
2. **`pnpm turbo run typecheck` 전체 실행**: 이동 후 반드시 전 패키지 typecheck
3. **SDK public API는 건드리지 않기**: `@waiaas/sdk`의 public export는 유지, 내부 이동만 수행
4. **barrel export 대신 named import 유지**: `@waiaas/core`에서 모든 것을 re-export하지 말고 서브패스 import 사용

**Warning signs:**
- `pnpm turbo run typecheck`에서 일부 패키지만 실패
- import 경로가 3단계 이상 깊어짐 (architecture smell)
- `@waiaas/core`의 index.ts가 비대해짐

**Phase to address:**
Phase 4 (중복 코드 SSoT 통합). typecheck gate를 phase 진입 조건으로 설정.

---

### Pitfall 4: 레이어 위반 수정 시 Import Cycle 생성

**What goes wrong:**
레이어 위반을 수정하면서 (예: service 레이어가 route 레이어를 import) 의존성 방향을 바꾸면, 간접적으로 순환 참조가 발생. Node.js ESM에서 순환 참조는 `undefined` import로 나타나 런타임에 `TypeError: X is not a function` 에러.

**Why it happens:**
- `IChainSubscriber` 인터페이스 확장 + 레이어 위반 수정이 milestone 대상
- 현재 daemon 패키지의 레이어 구조: `api/routes` -> `services` -> `infrastructure` -> `core`
- 수정 시 interface를 상위 레이어로 올리면 하위 레이어에서 import해야 하는 역방향 의존 발생
- TypeScript에서는 컴파일 시점에 cycle을 감지하지 못하고, ESM 런타임에서만 문제 발생

**How to avoid:**
1. **Interface는 항상 core/types 레벨에 배치**: 구현체와 인터페이스를 분리, 인터페이스는 가장 하위 레이어에
2. **`madge --circular` 또는 `dpdm` 도구로 cycle 탐지**: 레이어 이동 후 반드시 실행
3. **`import type` 분리**: `import type`은 cycle을 만들지 않으므로, runtime import와 type import를 구분
4. **Dependency Inversion**: 콘크리트 클래스 대신 인터페이스에 의존, DI 컨테이너에서 조립

**Warning signs:**
- `import type` 아닌 `import`로 인터페이스를 가져오는 코드
- 한 파일이 같은 패키지의 상위/하위 레이어를 동시에 import
- 런타임에만 발생하는 `undefined` 에러 (테스트에서는 mock으로 우회되어 발견 안 됨)

**Phase to address:**
Phase 2 (IChainSubscriber 인터페이스 확장 + 레이어 위반 수정). `madge` 도구를 CI에 추가하는 것을 고려.

---

### Pitfall 5: @ts-expect-error 제거 대신 축적

**What goes wrong:**
현재 코드베이스에 `@ts-expect-error`가 프로덕션 코드 0건이지만, `as any` 제거 과정에서 임시로 `@ts-expect-error`를 추가하여 "나중에 고치겠다"는 패턴이 축적됨. 이는 `as any`보다 위험한데, TypeScript 업그레이드 시 에러가 해소되면 `@ts-expect-error`가 unused가 되어 반대로 빌드가 깨짐.

**Why it happens:**
- `as any`를 제거하면서 올바른 타입을 즉시 찾지 못할 때 임시 방편으로 사용
- 코드 리뷰에서 `as any`보다 `@ts-expect-error`가 "더 나은 것"으로 오해
- TypeScript strict 옵션 변경 시 새로운 에러 -> `@ts-expect-error`로 빠르게 해결하려는 유혹

**How to avoid:**
1. **Zero @ts-expect-error 정책 유지**: 현재 0건 상태를 ESLint 규칙으로 강제 (`@typescript-eslint/ban-ts-comment`)
2. **`as any` 대체로 `@ts-expect-error`를 허용하지 않기**: 올바른 타입을 찾거나, 타입 선언을 확장하거나, wrapper를 만들기
3. **CI에서 `@ts-expect-error` count 체크**: 0이 아니면 실패하도록 설정

**Warning signs:**
- PR에 `@ts-expect-error` 추가가 포함됨
- "임시" 주석과 함께 사용
- 같은 파일에 `@ts-expect-error`가 여러 개 나타남

**Phase to address:**
전 phase에 걸쳐 적용. Phase 1 시작 전에 ESLint 규칙으로 강제 설정.

---

### Pitfall 6: 테스트 Mock의 `as any`가 실제 타입 불일치를 숨김

**What goes wrong:**
테스트 코드에서 `as any`가 ~800건 사용 중. 프로덕션 코드의 타입을 강화하면 테스트 mock이 실제 런타임 타입과 괴리가 커짐. 테스트는 통과하지만 실제 환경에서 타입 에러 발생.

**Why it happens:**
- Mock 객체를 빠르게 만들기 위해 `{} as any` 패턴 사용
- 프로덕션 인터페이스가 변경되어도 mock은 업데이트되지 않음
- `as any`가 TypeScript의 "미사용 필드" 경고를 억제

**How to avoid:**
1. **이번 milestone에서 테스트 `as any`는 건드리지 않기**: 프로덕션 코드 ~55건 제거가 우선, 테스트 ~785건은 별도 milestone
2. **새로 작성하는 테스트는 `satisfies` + `Partial<T>` 패턴 사용**: mock 타입 안전성 확보
3. **향후 mock factory 패턴 도입 고려**: `createMockPolicyEngine()` 같은 헬퍼로 중앙 관리

**Warning signs:**
- 프로덕션 인터페이스 변경 후 테스트가 여전히 통과 (mock이 변경을 반영하지 않음)
- 새 필드 추가 후 해당 필드를 사용하는 코드가 테스트에서 undefined로 동작

**Phase to address:**
이번 milestone 범위 밖. 단, Phase 3에서 프로덕션 `as any` 제거 시 해당 코드를 테스트하는 mock도 함께 정합성 확인.

---

### Pitfall 7: JSON.parse + Zod 검증의 성능 오버헤드

**What goes wrong:**
`database-policy-engine.ts`의 21개 `JSON.parse()` 지점에 Zod 검증을 추가하면, 매 트랜잭션 평가마다 Zod schema 파싱이 실행됨. 정책 평가는 hot path이고 `BEGIN IMMEDIATE` 트랜잭션 내에서 실행되므로, 지연이 동시 요청 직렬화에 영향.

**Why it happens:**
- Zod `.parse()`는 런타임 검증이므로 `as Type` 대비 CPU 비용 존재
- `evaluateAndReserve`가 SQLite exclusive lock 내에서 실행
- 정책이 여러 개일 때 각 정책마다 JSON.parse + Zod 검증 반복

**How to avoid:**
1. **저장 시점 검증 (write-time validation)**: 정책 생성/수정 API에서 Zod 검증, 읽기 시에는 `as Type` 유지 또는 lightweight assert
2. **캐시**: 정책이 자주 변경되지 않으므로, parsed+validated 결과를 메모리 캐시
3. **`.safeParse()` 대신 custom assert**: 성능이 중요한 경로에서는 수동 type guard 사용

**Warning signs:**
- 트랜잭션 처리 지연 증가 (벤치마크 비교 필요)
- SQLite lock 대기 시간 증가
- `evaluateAndReserve` 호출 빈도가 높은 환경에서 병목

**Phase to address:**
Phase 1. Write-time validation 전략을 기본으로 채택, read-time에는 lightweight assert만 사용.

---

### Pitfall 8: 전체 `JSON.parse()` 46건 중 정책 외 지점 누락

**What goes wrong:**
`database-policy-engine.ts` 21건에 집중하면 나머지 25+건의 `JSON.parse()`가 방치됨. 특히 위험한 지점:
- `wc-storage.ts`: WalletConnect 세션 데이터 파싱 (외부 데이터)
- `backup-format.ts`: 백업 메타데이터 파싱 (파일 시스템 입력)
- `admin-wallets.ts`: 트랜잭션 metadata 파싱 (4건, DB 데이터)
- `daemon.ts`: config 파싱 + 트랜잭션 metadata 파싱 (4건)
- `notification-service.ts`: 이벤트 필터 파싱 (2건, DB 데이터)
- `webhook-service.ts`: 이벤트 구독 파싱

**Why it happens:**
- scope를 policy engine으로 한정하면 다른 위험 지점을 놓침
- 각 파일이 독립적으로 `JSON.parse` + type assertion 패턴을 사용

**How to avoid:**
1. **전수 조사 후 우선순위 분류**: 외부 입력 (HIGH) > DB 데이터 (MEDIUM) > 내부 데이터 (LOW)
2. **외부 입력**: `wc-storage.ts`, `backup-format.ts`, `config/loader.ts` -> 반드시 Zod 검증
3. **DB 데이터**: write-time validation이 보장되면 read-time은 assert로 충분
4. **이번 milestone에서 모두 커버할지 범위 결정 필요**

**Warning signs:**
- `JSON.parse` 검색 결과에서 policy engine 외 파일이 여전히 type assertion만 사용
- 외부 입력을 파싱하는 코드에 Zod 검증이 없음

**Phase to address:**
Phase 1 확장 또는 별도 Phase. 최소한 외부 입력(`wc-storage.ts`, `backup-format.ts`)은 포함 권장.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `JSON.parse() as Type` (type assertion) | 빠른 구현, 컴파일 통과 | 런타임 데이터 불일치 시 디버깅 어려움 | Never (write-time validation으로 대체) |
| `as any`로 외부 라이브러리 타입 우회 | 외부 타입 불일치 해결 | 라이브러리 업데이트 시 실제 API 변경 감지 불가 | 라이브러리 타입이 명백히 잘못된 경우만, 반드시 주석과 함께 |
| 중복 유틸리티 (NATIVE_DECIMALS, sleep 등) | 패키지 간 의존성 없음 | 동기화 안 되면 동작 차이 발생 | Never (shared에 SSoT) |
| 테스트에서 `{} as any` mock | 빠른 테스트 작성 | 인터페이스 변경 감지 불가 | MVP/프로토타입 단계만, 이후 mock factory로 전환 |
| `policyEngine: null as any` 주입 | Stage 5-6에서 policy 불필요 | NPE 위험, 코드 의도 불명확 | Optional parameter로 리팩토링 |
| `(db as any).session?.client` Drizzle 내부 접근 | WC에 SQLite handle 전달 | Drizzle 버전 업 시 즉시 깨짐 | Never (공식 `$client` API 사용) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| WalletConnect SignClient | `(db as any).session?.client`로 Drizzle 내부 접근 (8건) | Drizzle의 `.$client` 프로퍼티 사용 (drizzle-orm v0.32+ 공식 API), 또는 별도 SQLite 인스턴스 주입 |
| @solana/kit 6.x | `instruction as any`로 타입 불일치 우회 (5건) | `IInstruction` 인터페이스에 맞는 변환 함수 작성, 또는 generic parameter 명시 |
| permissionless (AA) | `bundlerClient as any`로 메서드 호출 (4건) | `BundlerClient` 타입을 정확히 import하고 generic 파라미터 지정, 또는 adapter wrapper 패턴 |
| viem EIP-712 | `domain as any`, `types as any` (3건) | viem의 `TypedDataDefinition` 타입 활용, 또는 `satisfies` 패턴 |
| Zod + Drizzle schema 동기화 | Zod와 Drizzle 스키마를 별도 관리 | Zod SSoT에서 Drizzle 스키마 파생 (프로젝트 규칙 준수) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Zod validation in hot path (policy eval) | TX 처리 지연, SQLite lock 경합 증가 | Write-time validation, read-time lightweight assert | 동시 TX 10+/sec |
| 과도한 re-export barrel | 번들 사이즈 증가, tree-shaking 실패 | Named import, subpath export | Admin UI 번들 100KB+ 증가 시 |
| `safeParse` 에러 로깅 과다 | 로그 볼륨 폭증 (레거시 데이터 많을 때) | 첫 N건만 로깅, 이후 count만 기록 | 마이그레이션 직후 정책 100+ 건 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Zod schema가 `JSON.parse` 결과를 신뢰 | 악의적 JSON injection (policies.rules 컬럼) | Write-time strict validation + DB 레벨 CHECK |
| `as any` 제거 시 타입 가드 누락 | 검증 없이 데이터 사용 -> injection/overflow | 모든 외부 입력에 Zod, 내부 DB 데이터에는 assert |
| WC `(db as any)` 패턴으로 SQLite 직접 접근 | Drizzle 트랜잭션 격리 우회 | 별도 SQLite connection 또는 Drizzle 공식 API |
| 백업 파일 metadata JSON.parse 미검증 | 악의적 백업 파일로 코드 주입 가능 | `backup-format.ts`의 JSON.parse에 Zod 검증 추가 |

## "Looks Done But Isn't" Checklist

- [ ] **JSON.parse Zod 전환:** DB에 기존 데이터로 실제 테스트했는지 확인 -- fixture만으로는 레거시 데이터 커버 불가
- [ ] **`as any` 제거:** 해당 코드의 테스트 커버리지가 실제 런타임 경로를 커버하는지 확인 -- 타입만 맞추고 끝이 아님
- [ ] **SSoT 이동:** `pnpm turbo run typecheck && pnpm turbo run lint` 전체 통과 확인 -- 단일 패키지 빌드만으로는 부족
- [ ] **레이어 위반 수정:** `import type`과 `import`가 적절히 분리되었는지 확인 -- 순환 참조는 런타임에서만 발견됨
- [ ] **@ts-expect-error 0건 유지:** 제거 작업 중 임시로 추가된 것이 없는지 최종 확인
- [ ] **정책 rules 스키마:** 모든 정책 타입(17종)에 대해 Zod 스키마가 정의되었는지 확인 -- 일부만 하면 불완전
- [ ] **외부 라이브러리 as any:** @solana/kit, WC, permissionless 관련 건이 wrapper로 감싸졌는지 확인 -- 직접 `as any` 제거만으로는 타입 안전 미보장
- [ ] **JSON.parse 전수 조사:** policy engine 외 25건도 분류되었는지 확인

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Zod가 레거시 DB 데이터를 reject | LOW | `safeParse` fallback 추가 + 데이터 마이그레이션 스크립트 |
| `as any` 제거 후 런타임 에러 | MEDIUM | 해당 건만 `as any` 복원 + 이슈 등록 + 별도 해결 |
| SSoT 이동으로 SDK 깨짐 | HIGH | re-export bridge 긴급 추가, npm patch release |
| Import cycle 런타임 에러 | MEDIUM | 순환 참조 관련 import를 `import type`으로 변경, 인터페이스 위치 재조정 |
| @ts-expect-error 축적 | LOW | ESLint 규칙 강제 + CI gate 추가 |
| 정책 평가 성능 저하 | LOW | Write-time 전략으로 전환, hot path에서 Zod 제거 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Zod too strict for DB data | Phase 1 (DatabasePolicyEngine Zod) | 기존 DB 스냅샷으로 safeParse 성공률 100% 확인 |
| JSON.parse non-policy sites | Phase 1 확장 또는 별도 Phase | `JSON.parse` grep 결과에서 미처리 건 0 확인 |
| `as any` runtime behavior change | Phase 3 (as any 제거) | 카테고리별 분류 후 regression test, E2E 시나리오 |
| SSoT export breaking downstream | Phase 4 (중복 코드 SSoT) | `pnpm turbo run typecheck` 전체 통과 + SDK public API 변경 없음 확인 |
| Layer fix creating import cycles | Phase 2 (IChainSubscriber + 레이어) | `madge --circular` 0건, 런타임 import 성공 확인 |
| @ts-expect-error accumulation | 전 Phase (사전 ESLint 설정) | CI에서 `@ts-expect-error` count = 0 강제 |
| Test mock divergence | Phase 3 (as any 제거 시 동반 확인) | 변경된 인터페이스의 mock이 새 타입과 정합성 확인 |
| Zod in hot path performance | Phase 1 (write-time validation 전략) | TX 처리 latency 벤치마크 비교 (before/after) |

## Sources

- 직접 코드베이스 분석: `packages/daemon/src/pipeline/database-policy-engine.ts` (21 JSON.parse + type assertion, 17 정책 타입)
- 직접 코드베이스 분석: 프로덕션 `as any` ~55건 (daemon 44건, adapters 5건, actions 3건, core/shared 3건)
- 직접 코드베이스 분석: 테스트 `as any` ~785건 (136 파일)
- 직접 코드베이스 분석: `as unknown as` 패턴 전수 조사 (테스트 mock 중심 + 프로덕션 Solana adapter/EIP-712)
- 직접 코드베이스 분석: `@ts-expect-error` / `@ts-ignore` 프로덕션 코드 0건 (현재 clean 상태)
- 직접 코드베이스 분석: `JSON.parse` daemon 프로덕션 코드 46건 (21 policy + 25 기타)
- WAIaaS CLAUDE.md: Zod SSoT 원칙, 테스트 커버리지 규칙, 마이그레이션 전략
- TypeScript handbook: Project References + composite mode import resolution
- Node.js ESM circular dependency behavior: `undefined` import at runtime
- drizzle-orm `$client` API: Drizzle ORM v0.32+ public client accessor

---
*Pitfalls research for: Type Safety + Code Quality Improvements (v32.4)*
*Researched: 2026-03-16*
