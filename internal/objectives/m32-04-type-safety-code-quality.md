# 마일스톤 m32-04: 타입 안전 + 코드 품질

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

프로덕션 코드의 `as any` 24건과 `as unknown as` 캐스팅을 제거하고, `JSON.parse()` 14건에 Zod 런타임 검증을 추가하며, 중복 코드를 SSoT로 통합하고, 레이어 위반을 수정하여 타입 시스템의 신뢰성과 코드 유지보수성을 확보한다.

---

## 배경

코드베이스 분석에서 타입 안전과 코드 품질에 관한 이슈가 4개 카테고리에서 확인되었다:

### 1. 타입 안전 위반 (`as any` 24건, `as unknown as` 다수)

| 위치 | 패턴 | 건수 | 원인 |
|------|------|------|------|
| `wc.ts` | `(db as any).session?.client` | 8 | Drizzle ORM이 raw SQLite 클라이언트 타입 미노출 |
| `hot-reload.ts` | `'solana' as any` | 4 | `evict()` 파라미터가 string인데 `ChainType` 요구 |
| `stages.ts` | `(ctx.request as any).type` | 1 | discriminatedUnion 내로잉 누락 |
| `daemon.ts` | `policyEngine: null as any` | 2 | `PipelineContext`에서 optional 미지원 |
| `solana/adapter.ts` | `instruction as any`, `any[]` 반환 | 3 | `@solana/kit` branded generic 비호환 |
| `wc-session-service.ts` | ESM interop, storage, namespace | 3 | WC SDK 타입 불일치 |
| `wc-signing-bridge.ts` | `catch (error: any)` | 1 | `unknown` 미사용 |
| 기타 | `payment-signer.ts`, `adapter.ts` | 2 | branded type 우회 |

### 2. Zod 런타임 검증 부재 (`JSON.parse` 14건)

`DatabasePolicyEngine`이 DB에서 정책 규칙을 읽을 때 TypeScript 타입 단언만 사용하고 Zod 런타임 검증 없이 보안 결정을 내린다:

```typescript
// database-policy-engine.ts — 현재
const rules: SpendingLimitRules = JSON.parse(spendingPolicy.rules);  // 타입 단언만
const rules: WhitelistRules = JSON.parse(whitelist.rules);           // Zod 검증 없음
```

`SpendingLimitRules`, `WhitelistRules` 등이 Zod가 아닌 로컬 `interface`로 정의되어 SSoT 원칙("Zod → TypeScript types") 위반.

추가 위치: `daemon.ts` (3건), `notification-service.ts` (2건), `jwt-secret-manager.ts` (2건).

### 3. 코드 중복 (SSoT 위반 6건)

| 중복 대상 | 위치 수 | 통합 위치 |
|----------|---------|----------|
| `NATIVE_DECIMALS` / `NATIVE_SYMBOLS` 상수 | 5곳 | `@waiaas/core` |
| `sleep()` 유틸리티 | 4곳 | `@waiaas/core` |
| `formatDisplayCurrency` | 2곳 (core + admin 재구현) | `@waiaas/core` import |
| Staking aggregation 로직 | 2곳 (staking.ts + admin.ts) | 공유 함수 추출 |
| `config.rpc as unknown as Record<string, string>` | 8곳 | `resolveRpcUrl` 시그니처 수정 |
| Balance formatting `Number(balance) / 10 ** decimals` | 6곳 | `formatAmount` 사용 |

### 4. 레이어 위반 + 인터페이스 누락

| 위반 | 내용 |
|------|------|
| `services/` → `api/middleware/` import | `wc-signing-bridge.ts`가 `siwe-verify.ts`, `address-validation.ts` import |
| `infrastructure/` → `api/middleware/` import | `settings-service.ts`가 `MasterPasswordRef` import |
| `IChainSubscriber` 인터페이스 불완전 | `pollAll()`, `checkFinalized()` 미선언 → `as unknown as` 캐스팅 4건 |
| `IAsyncStatusTracker` 위치 부적절 | `@waiaas/actions`에 위치 → `@waiaas/core`로 이동 필요 |
| `INTERNAL_ERROR` 미등록 | error-handler가 사용하나 `ERROR_CODES` 레지스트리에 없음 |
| `ACTION_VALIDATION_FAILED` 오용 | 일반 Zod 검증 에러에 action 도메인 코드 사용 |

---

## 구현 대상

### Phase 1: DatabasePolicyEngine Zod 검증 + 정책 룰 스키마 SSoT

| 대상 | 내용 |
|------|------|
| `@waiaas/core` 스키마 추가 | `SpendingLimitRulesSchema`, `WhitelistRulesSchema`, `AllowedTokensRulesSchema`, `LendingAssetWhitelistRulesSchema`, `LendingLtvLimitRulesSchema` Zod 스키마 생성 |
| 로컬 인터페이스 제거 | `database-policy-engine.ts`의 로컬 `interface` → Zod `z.infer<>` 타입으로 교체 |
| `JSON.parse` → `safeParse` | 14건의 `JSON.parse()` 호출에 Zod `safeParse` 적용. 실패 시 `WAIaaSError('POLICY_RULES_CORRUPT')` |
| Lifecycle/Notification 검증 | `daemon.ts`, `notification-service.ts`, `jwt-secret-manager.ts`의 `JSON.parse`에도 Zod 검증 추가 |
| 테스트 | 정상 규칙 파싱, corrupt JSON 처리, 스키마 불일치 처리 테스트 |

### Phase 2: IChainSubscriber 인터페이스 확장 + 레이어 위반 수정

| 대상 | 내용 |
|------|------|
| `IChainSubscriber` 확장 | `pollAll(): Promise<void>`, `checkFinalized(txHash: string): Promise<boolean>` 메서드 추가 |
| `as unknown as` 제거 | `incoming-tx-monitor-service.ts`, `subscription-multiplexer.ts`의 4건 캐스팅 제거 |
| 유틸리티 이동 | `verifySIWE`, `decodeBase58` → `infrastructure/crypto/` 또는 `utils/`로 이동 |
| `MasterPasswordRef` 이동 | `api/middleware/master-auth.ts` → `infrastructure/auth/types.ts`로 타입 이동 |
| `IAsyncStatusTracker` 이동 | `@waiaas/actions` → `@waiaas/core` 인터페이스 이동 |
| ERROR_CODES 보완 | `INTERNAL_ERROR` 등록, `VALIDATION_FAILED` 추가 (일반 Zod 에러용) |
| 테스트 | 인터페이스 contract 테스트 갱신, import 경로 정합성 테스트 |

### Phase 3: `as any` 제거 (wc.ts, hot-reload, daemon lifecycle)

| 대상 | 내용 |
|------|------|
| `getSqliteClient(db)` 헬퍼 | Drizzle DB에서 raw SQLite 클라이언트를 안전하게 추출하는 typed 헬퍼 생성 |
| `wc.ts` 8건 수정 | `(db as any).session?.client` → `getSqliteClient(db)` |
| `hot-reload.ts` 4건 수정 | `evict()` 파라미터 타입을 `string`으로 확장하거나 string→ChainType 변환 함수 사용 |
| `daemon.ts` 2건 수정 | `PipelineContext.policyEngine`을 optional로 변경하거나 null-object 패턴 적용 |
| `stages.ts` 1건 수정 | `'type' in ctx.request` 타입 가드 사용 |
| `wc-signing-bridge.ts` | `catch (error: any)` → `catch (error: unknown)` + 타입 내로잉 |
| `wc-session-service.ts` 3건 | storage에 `implements IKeyValueStorage` 추가, namespace 타입 가드 생성 |
| 테스트 | 기존 WC 테스트 통과 확인 |

### Phase 4: 중복 코드 SSoT 통합

| 대상 | 내용 |
|------|------|
| `@waiaas/core` 상수 추가 | `NATIVE_DECIMALS`, `NATIVE_SYMBOLS` 상수를 `CHAIN_TYPES` 옆에 정의 |
| 5곳 참조 교체 | `stages.ts`, `database-policy-engine.ts`, `resolve-effective-amount-usd.ts`, `admin.ts`, `incoming-tx-monitor-service.ts` |
| `sleep()` 통합 | `@waiaas/core`에서 export, 4곳 로컬 정의 제거 |
| `formatDisplayCurrency` | Admin UI에서 `@waiaas/core` import (빌드타임 번들링이므로 CSP 영향 없음) |
| Staking aggregation | `aggregateStakingBalance` → 공유 모듈로 추출, `admin.ts` 인라인 복제 제거 |
| `resolveRpcUrl` 시그니처 | `Record<string, string>` → typed config 수용하도록 수정, 8곳 `as unknown as` 제거 |
| Balance formatting | `Number(balance) / 10 ** decimals` 6곳 → `formatAmount()` 사용 |
| 테스트 | 기존 테스트 전체 통과 + core export 테스트 |

### Phase 5: 팬텀 설정 정리 + 기타 정리

| 대상 | 내용 |
|------|------|
| `rpc.evm_default_network` 등록 | `SETTING_DEFINITIONS`에 등록하거나 하드코딩 제거 후 명시적 파라미터 전달 |
| Settings `configPath` 정리 | `oracle`, `signing_sdk`, `gas_condition`, `rpc_pool`, `position_tracker` — 실제 동작에 맞게 configPath 수정 또는 제거 |
| `Partial<any>` 수정 | `hot-reload.ts`의 `Partial<any>` → 실제 config 타입 사용 |
| `hintedTokens` 내부화 | export 제거, 테스트에서 모킹으로 전환 |
| Stale 주석 정리 | "Phase 80", "Phase 50-04" 등 40+건의 stale phase 참조 제거 |
| `sweepAll()` stub 처리 | 인터페이스에서 제거하거나 구현 (구현 불필요 시 제거) |
| `stage3_5GasCondition` 네이밍 | 일관된 네이밍으로 변경 |
| 테스트 | 설정 키 등록 검증, stale 참조 부재 확인 (grep 기반) |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Policy rules Zod 검증 시점 | read 시 `safeParse` vs write 시만 검증 | **read 시 `safeParse`** — DB 수동 편집, 마이그레이션 오류 등으로 corrupt 가능. 보안 정책은 양쪽 모두 검증 |
| 2 | Corrupt 정책 규칙 처리 | 무시(skip) vs 에러 throw | **에러 throw** — corrupt 정책을 무시하면 보안 홀 발생 (e.g., spending limit 미적용). 파싱 실패 시 명시적 에러 |
| 3 | `getSqliteClient` 구현 | Drizzle 내부 API 의존 vs DB 초기화 시 참조 저장 | **DB 초기화 시 참조 저장** — Drizzle 내부 API는 불안정. DB 생성 시 SQLite 인스턴스를 별도 저장하여 typed 접근 |
| 4 | `PipelineContext.policyEngine` | optional로 변경 vs null-object 패턴 | **optional (`?`)** — stages 5-6에서 사용하지 않으므로 optional이 의미적으로 정확. 접근 시 nullish check 강제 |
| 5 | `IAsyncStatusTracker` 위치 | core로 이동 vs actions에서 core로 re-export | **core로 이동** — 인터페이스는 core 소유. actions는 구현체만 소유 |
| 6 | `NATIVE_DECIMALS` 구조 | `Record<ChainType, number>` vs chain adapter 메서드 | **`Record<ChainType, number>` 상수** — 파이프라인/정책 엔진에서 adapter 없이 사용하므로 정적 상수가 적합 |
| 7 | `formatDisplayCurrency` Admin UI import | 빌드타임 import vs runtime fetch | **빌드타임 import** — Vite 번들링이므로 CSP 영향 없음. Admin UI 빌드 시 core 코드가 인라인됨 |
| 8 | `sweepAll()` 처리 | 구현 vs 인터페이스에서 제거 | **인터페이스에서 제거** — Phase 80 이후 미구현으로 1년+ 경과. 필요 시 별도 마일스톤에서 재설계 |
| 9 | Solana adapter `as any` (branded generics) | 타입 수정 vs `@ts-expect-error` + 주석 | **`@ts-expect-error` + 명시적 주석** — `@solana/kit` branded generics는 외부 라이브러리 타입 제한. `as any`보다 `@ts-expect-error`가 라이브러리 업데이트 시 자동 감지 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### Zod 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 정상 정책 규칙 파싱 | 유효한 JSON rules → Zod safeParse 성공 assert | [L0] |
| 2 | Corrupt 정책 규칙 → 에러 | 잘못된 JSON → `POLICY_RULES_CORRUPT` 에러 assert | [L0] |
| 3 | 스키마 불일치 규칙 → 에러 | 필수 필드 누락 JSON → Zod 검증 실패 assert | [L0] |
| 4 | JWT secret corrupt 처리 | 잘못된 형식 JSON → 명시적 에러 assert | [L0] |

### `as any` 제거

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | WalletConnect 라우트 정상 동작 | WC 세션 생성/승인/거부 플로우 기존 테스트 통과 | [L0] |
| 6 | Hot-reload RPC Pool eviction | 설정 변경 → RPC 풀 갱신 정상 | [L0] |
| 7 | Pipeline re-entry (stages 5-6) | 대기 중 트랜잭션 재실행 → 정상 완료 | [L0] |
| 8 | `typecheck` 통과 | `pnpm turbo run typecheck` 전체 패키지 통과 | [L0] |

### SSoT 통합

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | `NATIVE_DECIMALS` core export | `@waiaas/core`에서 import → 5곳 정상 사용 assert | [L0] |
| 10 | `sleep()` core export | `@waiaas/core`에서 import → 4곳 로컬 정의 부재 assert (grep) | [L0] |
| 11 | `formatAmount` 사용 | `Number(balance) / 10 ** decimals` 패턴 부재 assert (grep) | [L0] |
| 12 | `resolveRpcUrl` 캐스팅 제거 | `as unknown as Record<string, string>` 부재 assert (grep) | [L0] |

### 레이어 + 인터페이스

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | `services/` → `api/` import 부재 | grep `from '../api/'` in `services/`, `infrastructure/` → 0건 assert | [L0] |
| 14 | `IChainSubscriber.pollAll()` 정상 호출 | 캐스팅 없이 직접 호출 → 컴파일 + 런타임 정상 | [L0] |
| 15 | 전체 테스트 통과 | `pnpm turbo run test:unit` 전체 통과 | [L0] |

---

## 선행 조건

| 의존 대상 | 이유 |
|----------|------|
| m32-02 (보안 패치) | `ssrf-guard.ts` 이동이 선행되면 레이어 정리 범위 축소 |

선행 조건이 엄격하지 않음 — 병렬 진행 가능하나 m32-02가 먼저 완료되면 충돌 최소화.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Zod 검증 추가로 정상 데이터 거부 | 기존 저장된 정책이 새 스키마와 불일치하면 데몬 시작 실패 | Zod 스키마를 현재 DB 데이터 형식과 정확히 일치시키는 것을 우선. 기존 데이터 전수 조사 후 스키마 확정 |
| 2 | `IChainSubscriber` 확장으로 외부 구현체 영향 | 외부에서 IChainSubscriber를 구현하는 경우 없음 (daemon 내부 전용) | 내부 전용 인터페이스이므로 영향 없음 |
| 3 | `@waiaas/core` export 추가로 번들 사이즈 증가 | `sleep`, `NATIVE_DECIMALS` 등은 수 바이트 수준 | 영향 무시 가능 |
| 4 | Solana `@ts-expect-error` 누적 | `@solana/kit` 업데이트로 branded generic 변경 시 빌드 실패 | `@ts-expect-error`는 라이브러리 업데이트 시 자동 감지되므로 오히려 장점 |
| 5 | Admin UI core import 빌드 설정 변경 | Vite 빌드에서 `@waiaas/core` resolve 필요 | `vite.config.ts` alias 또는 workspace protocol로 해결 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 5개 |
| 신규 파일 | 6-8개 (Zod 스키마 모듈, 헬퍼 함수, 이동 대상 모듈) |
| 수정 파일 | 40-50개 |
| 삭제 파일 | 1-2개 (`api-key-store.ts` 급 제거 대상, 로컬 sleep 모듈) |
| 예상 LOC 변경 | +800/-600 (net +200 — 스키마 추가, 중복 제거 상쇄) |
| `as any` 제거 | 24건 → 0건 목표 (Solana branded 3건은 `@ts-expect-error`로 전환) |

---

*생성일: 2026-03-01*
*관련 분석: 코드베이스 타입 안전 + 코드 품질 감사 (2026-03-01)*
*선행: m32-02 (보안 패치) 권장*
