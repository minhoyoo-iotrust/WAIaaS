# Feature Landscape

**Domain:** Type Safety + Code Quality Refactoring (WAIaaS v32.4)
**Researched:** 2026-03-16

## Table Stakes

Features users expect. Missing = refactoring feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `as any` 제거 (production code ~40건) | `as any`는 타입 시스템을 무력화하여 런타임 버그의 원인이 됨. 리팩토링 마일스톤에서 가장 기본적인 기대 | Med | wc.ts(8건), stages.ts(6건), external-action-pipeline.ts(4건), Solana adapter(5건), daemon lifecycle(3건), eip712-signer(3건), routes(~10건) 등 카테고리별 접근 필요 |
| DatabasePolicyEngine JSON.parse Zod 검증 | DB에 JSON 문자열로 저장된 정책 rules를 `JSON.parse()` 후 TypeScript interface로만 캐스팅 중. 손상된 DB 데이터가 런타임 크래시 유발 가능 | Med | 20건 이상의 `JSON.parse(policy.rules)` 호출. @waiaas/core에 Zod 스키마가 이미 존재(13개 policy type)하나 engine 내부에서 사용하지 않음 |
| NATIVE_DECIMALS 상수 SSoT 통합 | 동일한 `Record<string, number>` 정의가 5곳에 중복. 값 불일치 시 금액 계산 오류 직결 | Low | dry-run.ts, resolve-effective-amount-usd.ts, stages.ts, database-policy-engine.ts, admin-wallets.ts |
| sleep 유틸리티 SSoT 통합 | 동일한 `sleep(ms)` 함수가 5곳에 중복 정의 | Low | core, cli, solana adapter, daemon pipeline, x402 routes. daemon/src/pipeline/sleep.ts가 이미 존재하나 다른 패키지에서 사용하지 않음 |
| wc.ts Drizzle DB 접근 패턴 수정 | `(db as any).session?.client`로 Drizzle 내부 구현에 접근하는 코드 8건. Drizzle 버전 업그레이드 시 깨짐 | Med | raw SQL을 Drizzle query builder로 교체하거나, 명시적 sqlite 참조를 DI로 전달 |
| 정책 rules 인터페이스 중복 제거 | database-policy-engine.ts에 12개 plain interface 정의, core/schemas/policy.schema.ts에 동일한 Zod 스키마 존재. 양쪽이 drift하면 런타임/타입 불일치 | Low | engine 내부 interface 제거 -> core Zod infer 타입 사용 |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| JSON.parse 안전 파서 유틸리티 | `safeParseJson<T>(json, schema): T` 유틸리티로 Zod 검증 + 에러 컨텍스트를 한 곳에서 제공. 향후 모든 JSON.parse를 대체하는 패턴 확립 | Low | @waiaas/core에 배치. try/catch + ZodError -> WAIaaSError 변환 포함 |
| bundlerClient 타입 안전 래퍼 | stages.ts의 `(bundlerClient as any).prepareUserOperation` 등 3건을 타입 안전 래퍼로 교체. viem/permissionless AA 타입이 불완전한 부분을 래퍼로 격리 | Med | viem bundler 타입이 실제로 지원하는지 확인 필요. 미지원 시 래퍼 인터페이스로 `as any` 격리 |
| Solana adapter 제네릭 타입 수정 | `appendTransactionMessageInstruction` 호출 시 `as any` + `as unknown as typeof txMessage` 5건. @solana/kit 제네릭 타입 불일치 원인 분석 후 근본 해결 | High | @solana/kit 6.x 타입 시스템 조사 필요. 제네릭 파라미터 명시로 해결 가능할 수 있으나, 라이브러리 자체 제한일 수도 있음 |
| external-action-pipeline 타입 정밀화 | `as any` 4건 + `as unknown as` 4건. ResolvedAction union 타입의 kind별 narrowing 미적용이 원인 | Med | discriminatedUnion narrowing + 적절한 타입 가드 추가로 대부분 해결 가능 |
| Admin UI formatDisplayCurrency 중복 제거 | @waiaas/core의 함수를 인라인 복사한 packages/admin 내 중복 구현 | Low | Admin이 브라우저 번들이므로 core에서 직접 import 불가한 사정이 있을 수 있음. 확인 후 shared 유틸리티 또는 core에서 export하는 방향 |
| `as unknown as` 캐스트 격리 | Solana adapter, external-action-pipeline 등에서 `as unknown as` 캐스트가 타입 안전성을 우회. 래퍼 함수로 캐스트를 한 곳에 격리하고 JSDoc으로 이유 문서화 | Low | 라이브러리 타입 불일치로 불가피한 캐스트는 `// SAFETY: ...` 주석 + 래퍼 격리 |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| `@ts-expect-error`로 일괄 대체 | `as any`를 `@ts-expect-error`로 바꾸면 타입 에러를 숨길 뿐, 근본 해결이 아님 | 각 `as any`의 근본 원인(타입 불일치, 라이브러리 제한, 잘못된 타입 설계)을 분석하여 적절한 해결 |
| 테스트 코드의 `as any` 제거 | 테스트 코드의 `as any`는 mock/stub 구성에 필수적인 경우가 많음. 프로덕션 코드와 다른 기준 적용 필요 | 프로덕션 코드만 대상. 테스트 코드는 별도 마일스톤에서 검토 |
| scripts/ 내 `as any` 제거 | extract-openapi.ts 등은 stub 객체를 의도적으로 `as any`로 생성. 빌드 도구의 타입 정밀화는 ROI가 낮음 | scripts/는 제외. 프로덕션 런타임 코드만 대상 |
| 전체 JSON.parse에 Zod 추가 | MCP 테스트 파일, 스크립트 내 JSON.parse는 검증 불필요(이미 타입 검증된 입력). 무분별한 Zod 추가는 성능 오버헤드 | DatabasePolicyEngine(20건) + wallet-sdk parse-request(3건) + MCP session-manager(1건) 등 외부 입력만 대상 |
| strict mode 전환 | tsconfig strict 옵션 전환은 파급 범위가 너무 큼 | 현재 설정 유지. 점진적으로 타입 안전성 향상 |
| Drizzle 버전 업그레이드 | wc.ts 문제 해결을 위해 Drizzle를 업그레이드하면 마이그레이션 위험 | 현재 Drizzle 버전 내에서 query builder 사용 또는 sqlite 참조 DI |

## Feature Dependencies

```
NATIVE_DECIMALS SSoT -> (독립, 의존성 없음)
sleep SSoT -> (독립, 의존성 없음)
정책 rules interface 중복 제거 -> DatabasePolicyEngine JSON.parse Zod 검증
  (interface를 먼저 core Zod infer 타입으로 교체한 후, JSON.parse에 Zod 검증 추가)
safeParseJson 유틸리티 -> DatabasePolicyEngine JSON.parse Zod 검증
  (유틸리티를 먼저 만든 후, engine에서 사용)
wc.ts DB 접근 수정 -> (독립, 그러나 Drizzle API 확인 필요)
bundlerClient 래퍼 -> stages.ts as any 제거
external-action-pipeline 타입 정밀화 -> (ResolvedAction Zod 스키마 이미 존재)
Solana adapter 타입 수정 -> (@solana/kit 타입 조사 선행 필요)
```

## MVP Recommendation

Prioritize:
1. **NATIVE_DECIMALS + sleep SSoT** - 가장 간단하고 즉시 효과적. 중복 5곳씩 통합
2. **safeParseJson 유틸리티 + 정책 rules 타입 통합 + DatabasePolicyEngine Zod 검증** - 정책 엔진이 코어 보안 계층이므로 런타임 검증 추가가 가장 높은 ROI
3. **wc.ts DB 접근 패턴 수정** - 8건의 `(db as any).session?.client` 일괄 해결
4. **stages.ts/userop.ts bundlerClient as any** - 래퍼 격리로 6건 해결
5. **external-action-pipeline 타입 정밀화** - discriminatedUnion narrowing으로 4건 해결
6. **EIP-712 signer + route 파일 as any** - 개별 수정 (~10건)
7. **Solana adapter as any** - @solana/kit 타입 조사 후 가능한 범위에서 수정

Defer:
- **Solana adapter `as unknown as typeof txMessage`**: @solana/kit 6.x 제네릭 타입 제한으로 불가피할 수 있음. 조사 후 판단
- **Admin UI formatDisplayCurrency 통합**: 브라우저 번들 제약 확인 후 별도 처리
- **테스트/스크립트 코드 타입 개선**: 다른 마일스톤에서

## Complexity Assessment

| Category | 건수 | Complexity | Rationale |
|----------|------|------------|-----------|
| SSoT 통합 (NATIVE_DECIMALS, sleep) | ~10곳 | **Low** | 단순 import 교체, 행위 변경 없음 |
| DatabasePolicyEngine Zod 검증 | ~20건 JSON.parse | **Med** | 기존 Zod 스키마 재사용 가능하나, 에러 핸들링 전략 결정 필요 (fail-open vs fail-closed) |
| wc.ts DB 접근 | 8건 | **Med** | Drizzle raw SQL API 또는 DI 패턴 결정 필요 |
| bundlerClient 래퍼 | 3-4건 | **Med** | viem/permissionless 타입 조사 필요 |
| external-action-pipeline | ~8건 | **Med** | discriminatedUnion narrowing 패턴 적용 |
| Solana adapter | ~5건 | **High** | @solana/kit 제네릭 타입 시스템 깊은 이해 필요 |
| 기타 개별 as any | ~10건 | **Low-Med** | 각각 원인이 다름 (server timeout, networkToCaip2, eip712 등) |

## Sources

- 코드베이스 직접 조사: `grep -rn "as any"`, `grep -rn "JSON.parse"`, `grep -rn "NATIVE_DECIMALS"`, `grep -rn "sleep"` 결과 기반
- @waiaas/core/src/schemas/policy.schema.ts: 13개 정책 타입별 Zod 스키마 이미 존재 확인
- packages/daemon/src/pipeline/database-policy-engine.ts: 12개 plain interface + 20건 bare JSON.parse 확인
- packages/daemon/src/api/routes/wc.ts: 8건 `(db as any).session?.client` 확인
- v31.10 마일스톤 히스토리: 이전 리팩토링에서 `as any` 24곳 제거 + admin.ts 분할 완료 확인 (현재 남은 건은 그때 해결하지 않은 것)
