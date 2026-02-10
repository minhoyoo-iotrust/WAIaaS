# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-10)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**현재 초점:** v1.1 Phase 50 진행 중. 50-02 완료 (Solana adapter). 다음: 50-03

## 현재 위치

마일스톤: v1.1 코어 인프라 + 기본 전송
페이즈: 50 of 51 (API + Solana Pipeline)
플랜: 2 of 4 in current phase
상태: In progress
마지막 활동: 2026-02-10 -- Completed 50-02-PLAN.md

진행률: [████████....] 67% (8/12 plans)

## 성과 지표

**v0.1-v1.0 누적:** 115 plans, 286 reqs, 47 phases, 11 milestones
**v1.1 목표:** 4 phases, 12 plans, 46 requirements
**v1.1 완료:** 8 plans (48-01, 48-02, 48-03, 49-01, 49-02, 49-03, 50-01, 50-02)

## 누적 컨텍스트

### 결정 사항

전체 결정 사항은 PROJECT.md 참조.

| 결정 | 근거 | Phase |
|------|------|-------|
| TD-02: ESLint 9 flat config + typescript-eslint + eslint-config-prettier | 최신 ESLint 9 flat config, Prettier 충돌 방지 | 48-01 |
| TD-03: singleQuote, semi, tabWidth=2, trailingComma=all, printWidth=100 | 프로젝트 표준 코드 스타일 | 48-01 |
| TD-04: Vitest workspace (루트 + 패키지별 config) | Turborepo test 파이프라인과 자연스러운 연동 | 48-01 |
| TD-05: TypeScript project references (composite: true) | 모노레포 증분 빌드, 패키지 간 타입 참조 | 48-01 |
| TD-11: tsc only (빌드 도구 불필요) | ESM 단일 출력, 번들러 불필요, 복잡도 최소화 | 48-01 |
| as const -> TS type -> Zod enum SSoT pipeline | 배열 SSoT에서 타입, Zod, Drizzle CHECK 모두 파생 | 48-02 |
| Zod z.infer 타입 파생 (수동 interface 없음) | 스키마 정의 단일 소스, 타입 자동 동기화 | 48-02 |
| ERROR_CODES as const satisfies Record | 타입 안전 키 + 런타임 접근, exhaustive 매칭 | 48-02 |
| WAIaaSError.toJSON()에서 httpStatus 제외 | httpStatus는 HTTP 전송 계층 관심사, API 본문에 불포함 | 48-02 |
| Amount 필드는 string 타입 | bigint (lamports/wei) JSON 직렬화 + SQLite TEXT 호환 | 48-02 |
| Messages 인터페이스: Record<ErrorCode, string> | 컴파일러가 66개 에러 코드 키 일치를 locale 간 강제 | 48-03 |
| i18n: as const 대신 명시적 Messages 인터페이스 | as const는 리터럴 타입으로 고정되어 다국어 값 할당 불가 | 48-03 |
| IPolicyEngine.evaluate(): 일반 객체 파라미터 | 인터페이스-스키마 간 순환 의존 방지, 경량 계약 | 48-03 |
| TD-09 확정: uuidv7 npm 패키지 사용 | 수동 구현 대비 정확성 우선, ms 정밀도 시간순 정렬 보장 | 49-01 |
| pushSchema(): raw SQL (CREATE TABLE IF NOT EXISTS) | drizzle-kit CLI 대신 프로그래매틱 데몬 시작에 적합 | 49-01 |
| PARTIAL_FAILURE를 core TRANSACTION_STATUSES에 추가 | doc 25 v0.10에 정의되었으나 core enum에 누락, CHECK 제약 파생에 필요 | 49-01 |
| createRequire(import.meta.url) for CJS native modules | sodium-native는 CJS-only; ESM에서 createRequire 패턴 사용 | 49-02 |
| Vitest forks pool for sodium mprotect | sodium mprotect_noaccess가 SIGSEGV 유발, threads 대신 forks 사용 | 49-02 |
| INVALID_MASTER_PASSWORD for GCM authTag mismatch | 잘못된 비밀번호 시 기존 에러 코드 활용 | 49-02 |
| Inline base58 encoding (외부 의존성 없음) | 단순 인코딩에 외부 패키지 불필요 | 49-02 |
| proper-lockfile for 크로스플랫폼 데몬 잠금 | native flock/PID-only 대비 플랫폼 호환성, stale lock 감지 | 49-03 |
| withTimeout: SYSTEM_LOCKED 에러 코드 사용 | 66개 에러 코드 매트릭스에 STARTUP_TIMEOUT 없음, 503 retryable 적합 | 49-03 |
| Steps 4+5 stub (Phase 50) | Adapter init + HTTP server는 v1.1 Phase 50에서 구현 | 49-03 |
| zod as direct daemon dependency | @waiaas/core 경유 가능하나 DaemonConfigSchema 직접 사용 | 49-03 |
| BackgroundWorkers async void IIFE + overlap guard | 비동기 핸들러 중복 실행 방지, 테스트에서 real timer 사용 | 49-03 |
| Hono createMiddleware pattern | hono/factory의 createMiddleware()로 typed c.set/c.get 사용 | 50-01 |
| killSwitchGuard factory DI pattern | createKillSwitchGuard(getState) 팩토리로 상태 제공자 주입 | 50-01 |
| ZodError -> ACTION_VALIDATION_FAILED (400) | 기존 에러 코드 재활용, 구조화된 issue details 포함 | 50-01 |
| Generic errors -> SYSTEM_LOCKED (500) | 매핑되지 않은 에러는 SYSTEM_LOCKED 500 사용 | 50-01 |
| errorHandler via app.onError | Hono 빌트인 에러 핸들러 등록, 미들웨어 아님 | 50-01 |
| createApp(deps) factory pattern for DI | getKillSwitchState 주입, 향후 확장 가능 | 50-01 |
| @solana/kit 6.0.1 (실제 버전, 설계서 3.x 참조) | 설계서는 3.x 언급했으나 실제 npm 버전은 6.0.1, API 동일 | 50-02 |
| createNoopSigner for unsigned tx building | getTransferSolInstruction source가 TransactionSigner 타입 요구 | 50-02 |
| getTransactionEncoder/Decoder 쌍 | encode-only, decode-only 분리 사용 (codec 대신) | 50-02 |
| createKeyPairFromBytes (64B) + createKeyPairFromPrivateKeyBytes (32B) | 키스토어 포맷에 따라 듀얼 키 포맷 지원 | 50-02 |
| signBytes(CryptoKey, messageBytes) | Ed25519 서명: 디코드된 tx의 messageBytes에 직접 서명 | 50-02 |

v1.1 구현 시 확정 필요: TD-10(CLI 프레임워크)

### 차단 요소/우려 사항

- better-sqlite3 네이티브 addon 빌드 검증 완료 (49-01에서 성공)
- sodium-native 네이티브 addon 빌드 검증 완료 (49-02에서 성공, argon2도 성공)
- proper-lockfile 크로스플랫폼 잠금 검증 완료 (49-03에서 성공)
- Hono 4.x 설치 및 동작 검증 완료 (50-01에서 성공, 19 tests)
- @solana/kit 6.0.1 API 안정성 검증 완료 (50-02에서 성공, 17 tests)
- 설계 부채 DD-01~03 (v1.1 구현 시 인라인 처리)

## 세션 연속성

마지막 세션: 2026-02-10
중단 지점: Completed 50-02-PLAN.md. Phase 50 진행 중. 다음: 50-03 (JWT session auth)
재개 파일: .planning/phases/50-api-solana-pipeline/50-02-SUMMARY.md
