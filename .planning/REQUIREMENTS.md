# Requirements: WAIaaS v32.4 타입 안전 + 코드 품질

**Defined:** 2026-03-16
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v32.4. Each maps to roadmap phases.

### Zod 런타임 검증

- [x] **ZOD-01**: safeJsonParse<T> 범용 헬퍼가 @waiaas/core에 존재하며 Zod 스키마 기반 JSON 파싱+검증을 수행한다
- [x] **ZOD-02**: POLICY_RULES_SCHEMAS 매핑이 @waiaas/core에서 export되어 외부 패키지에서 사용 가능하다
- [x] **ZOD-03**: DatabasePolicyEngine의 SpendingLimitRules JSON.parse가 Zod safeParse로 교체되어 corrupt 데이터 시 POLICY_RULES_CORRUPT 에러를 throw한다
- [x] **ZOD-04**: DatabasePolicyEngine의 WhitelistRules JSON.parse가 Zod safeParse로 교체된다
- [x] **ZOD-05**: DatabasePolicyEngine의 AllowedTokensRules JSON.parse가 Zod safeParse로 교체된다
- [x] **ZOD-06**: DatabasePolicyEngine의 LendingAssetWhitelistRules JSON.parse가 Zod safeParse로 교체된다
- [x] **ZOD-07**: DatabasePolicyEngine의 LendingLtvLimitRules JSON.parse가 Zod safeParse로 교체된다
- [x] **ZOD-08**: DatabasePolicyEngine의 나머지 정책 룰 JSON.parse(~16건)가 모두 Zod safeParse로 교체된다
- [x] **ZOD-09**: DatabasePolicyEngine의 로컬 interface 정의가 제거되고 Zod z.infer<> 타입으로 교체된다
- [x] **ZOD-10**: daemon.ts의 JSON.parse 3건에 Zod 검증이 추가된다
- [x] **ZOD-11**: notification-service.ts의 JSON.parse 2건에 Zod 검증이 추가된다
- [x] **ZOD-12**: jwt-secret-manager.ts의 JSON.parse 2건에 Zod 검증이 추가된다
- [x] **ZOD-13**: 정상 규칙 파싱, corrupt JSON 처리, 스키마 불일치 처리에 대한 테스트가 존재한다

### 인터페이스 + 레이어 정비

- [x] **LAYER-01**: IChainSubscriber에 pollAll(): Promise<void> 메서드가 선언되어 있다
- [x] **LAYER-02**: IChainSubscriber에 checkFinalized(txHash: string): Promise<boolean> 메서드가 선언되어 있다
- [x] **LAYER-03**: incoming-tx-monitor-service.ts와 subscription-multiplexer.ts의 as unknown as 캐스팅 4건이 제거된다
- [x] **LAYER-04**: wc-signing-bridge.ts의 services/ → api/middleware/ import가 제거되고 유틸리티가 infrastructure/로 이동한다
- [x] **LAYER-05**: MasterPasswordRef 타입이 api/middleware/ → infrastructure/auth/types.ts로 이동한다 (re-export bridge 포함)
- [x] **LAYER-06**: INTERNAL_ERROR가 ERROR_CODES 레지스트리에 등록된다
- [x] **LAYER-07**: VALIDATION_FAILED 에러 코드가 추가되어 일반 Zod 검증 에러에 사용된다
- [x] **LAYER-08**: ACTION_VALIDATION_FAILED의 일반 Zod 에러 오용이 VALIDATION_FAILED로 교체된다
- [x] **LAYER-09**: services/ 및 infrastructure/에서 api/ import가 0건이다 (grep 검증)
- [x] **LAYER-10**: 인터페이스 contract 테스트가 갱신되어 새 메서드를 검증한다

### as any 제거

- [x] **CAST-01**: wc.ts의 (db as any).session?.client 8건이 typed 헬퍼로 교체된다
- [x] **CAST-02**: hot-reload.ts의 'solana' as any 4건이 타입 안전한 코드로 교체된다
- [x] **CAST-03**: daemon.ts의 policyEngine: null as any 2건이 optional 또는 null-object 패턴으로 교체된다
- [x] **CAST-04**: stages.ts의 (ctx.request as any).type 1건이 타입 가드로 교체된다
- [x] **CAST-05**: wc-signing-bridge.ts의 catch (error: any)가 catch (error: unknown) + 타입 내로잉으로 교체된다
- [x] **CAST-06**: wc-session-service.ts의 ESM interop/storage/namespace as any 3건이 타입 안전한 코드로 교체된다
- [x] **CAST-07**: solana/adapter.ts의 instruction as any, any[] 반환 3건이 @ts-expect-error + 명시적 주석으로 전환된다
- [x] **CAST-08**: payment-signer.ts의 branded type 우회 as any가 제거된다
- [x] **CAST-09**: hot-reload.ts의 Partial<any>가 실제 config 타입으로 교체된다
- [x] **CAST-10**: bundlerClient 관련 as any (~4건)가 wrapper 함수 또는 타입 가드로 교체된다
- [x] **CAST-11**: external-action-pipeline 관련 as any가 적절한 타입으로 교체된다
- [x] **CAST-12**: 프로덕션 소스에 as any가 0건이다 (Solana @ts-expect-error 전환 제외)
- [x] **CAST-13**: pnpm turbo run typecheck가 전체 패키지에서 통과한다

### SSoT 통합

- [x] **SSOT-01**: NATIVE_DECIMALS, NATIVE_SYMBOLS 상수가 @waiaas/core에 정의되고 5곳에서 import된다
- [x] **SSOT-02**: sleep() 유틸리티가 @waiaas/core에서 export되고 4곳 로컬 정의가 제거된다
- [x] **SSOT-03**: formatDisplayCurrency가 Admin UI에서 @waiaas/core import로 통합된다
- [x] **SSOT-04**: aggregateStakingBalance가 공유 모듈로 추출되고 admin.ts 인라인 복제가 제거된다
- [x] **SSOT-05**: resolveRpcUrl 시그니처가 typed config를 수용하여 8곳 as unknown as Record 캐스팅이 제거된다
- [x] **SSOT-06**: Balance formatting Number(balance) / 10 ** decimals 6곳이 formatAmount() 사용으로 교체된다
- [x] **SSOT-07**: 로컬 중복 정의가 0건이다 (grep 검증: sleep, NATIVE_DECIMALS 패턴)

### 설정 + 정리

- [x] **CLN-01**: rpc.evm_default_network가 SETTING_DEFINITIONS에 등록되거나 하드코딩이 명시적 파라미터로 교체된다
- [x] **CLN-02**: Settings configPath 5건(oracle, signing_sdk, gas_condition, rpc_pool, position_tracker)이 실제 동작과 일치하도록 수정된다
- [x] **CLN-03**: hintedTokens export가 제거되고 테스트에서 모킹으로 전환된다
- [x] **CLN-04**: stale phase 참조 주석 40+건이 제거된다 (Phase 80, Phase 50-04 등)
- [x] **CLN-05**: sweepAll() stub가 인터페이스에서 제거된다
- [x] **CLN-06**: stage3_5GasCondition 네이밍이 일관된 형식으로 변경된다
- [x] **CLN-07**: 설정 키 등록 검증 테스트와 stale 참조 부재 확인 테스트가 존재한다
- [x] **CLN-08**: pnpm turbo run test:unit이 전체 통과한다

## v2 Requirements

Deferred to future milestone.

### 테스트 코드 as any 정리

- **TEST-01**: 테스트 코드 ~785건의 as any를 proper typing으로 교체
- **TEST-02**: Mock 객체에 대한 타입 안전 팩토리 패턴 도입

### 비정책 JSON.parse 확장

- **PARSE-01**: wc-storage.ts의 JSON.parse에 Zod 검증 추가
- **PARSE-02**: backup-format.ts의 JSON.parse에 Zod 검증 추가

## Out of Scope

| Feature | Reason |
|---------|--------|
| 테스트 코드 as any 정리 (~785건) | 프로덕션 코드와 별개 범위, 별도 마일스톤으로 분리 |
| @solana/kit 버전 업그레이드 | Branded generic은 라이브러리 설계 의도, 업그레이드로 해결 불가 |
| DB 마이그레이션 | 이번 마일스톤은 스키마 변경 없음, 런타임 검증만 추가 |
| ESLint ban-ts-comment 규칙 추가 | 유용하나 이번 scope 외 — 코드 변경이 아닌 도구 설정 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ZOD-01 | Phase 427 | Complete |
| ZOD-02 | Phase 427 | Complete |
| ZOD-03 | Phase 429 | Complete |
| ZOD-04 | Phase 429 | Complete |
| ZOD-05 | Phase 429 | Complete |
| ZOD-06 | Phase 429 | Complete |
| ZOD-07 | Phase 429 | Complete |
| ZOD-08 | Phase 429 | Complete |
| ZOD-09 | Phase 429 | Complete |
| ZOD-10 | Phase 430 | Complete |
| ZOD-11 | Phase 430 | Complete |
| ZOD-12 | Phase 430 | Complete |
| ZOD-13 | Phase 429 | Complete |
| LAYER-01 | Phase 428 | Complete |
| LAYER-02 | Phase 428 | Complete |
| LAYER-03 | Phase 428 | Complete |
| LAYER-04 | Phase 428 | Complete |
| LAYER-05 | Phase 428 | Complete |
| LAYER-06 | Phase 427 | Complete |
| LAYER-07 | Phase 427 | Complete |
| LAYER-08 | Phase 428 | Complete |
| LAYER-09 | Phase 428 | Complete |
| LAYER-10 | Phase 428 | Complete |
| CAST-01 | Phase 430 | Complete |
| CAST-02 | Phase 430 | Complete |
| CAST-03 | Phase 430 | Complete |
| CAST-04 | Phase 430 | Complete |
| CAST-05 | Phase 430 | Complete |
| CAST-06 | Phase 430 | Complete |
| CAST-07 | Phase 430 | Complete |
| CAST-08 | Phase 430 | Complete |
| CAST-09 | Phase 430 | Complete |
| CAST-10 | Phase 430 | Complete |
| CAST-11 | Phase 430 | Complete |
| CAST-12 | Phase 430 | Complete |
| CAST-13 | Phase 430 | Complete |
| SSOT-01 | Phase 431 | Complete |
| SSOT-02 | Phase 427 | Complete |
| SSOT-03 | Phase 431 | Complete |
| SSOT-04 | Phase 431 | Complete |
| SSOT-05 | Phase 431 | Complete |
| SSOT-06 | Phase 431 | Complete |
| SSOT-07 | Phase 431 | Complete |
| CLN-01 | Phase 431 | Complete |
| CLN-02 | Phase 431 | Complete |
| CLN-03 | Phase 431 | Complete |
| CLN-04 | Phase 431 | Complete |
| CLN-05 | Phase 431 | Complete |
| CLN-06 | Phase 431 | Complete |
| CLN-07 | Phase 431 | Complete |
| CLN-08 | Phase 431 | Complete |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after Phase 427 completion*
