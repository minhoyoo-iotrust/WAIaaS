# 마일스톤 m32-06: 성능 + 구조 개선

- **Status:** SHIPPED
- **Milestone:** v32.6
- **Package:** v2.9.0-rc
- **Completed:** 2026-03-17

## 목표

N+1 쿼리 패턴 3건과 페이지네이션 미적용 2건을 해소하고, 1,500줄 이상 대형 파일 4개를 분할하여 API 응답 성능과 코드 유지보수성을 동시에 개선한다.

---

## 배경

### 성능 이슈

코드베이스에서 확인된 성능 병목:

| ID | 심각도 | 이슈 | 위치 | 영향 |
|----|--------|------|------|------|
| P-1 | **High** | N+1: 세션당 wallet 쿼리 | `sessions.ts:427-446` | N 세션 × 1 쿼리 (페이지네이션 없이 전체) |
| P-2 | **Medium** | N+1: admin session prompt 2패턴 | `admin-monitoring.ts:384,434` | walletId별 개별 쿼리 + 후보 세션당 linked count 쿼리 |
| P-3 | **Medium** | N+1: `formatTxAmount` 행당 token_registry 조회 | `admin-wallets.ts:29` (정의), 3곳 사용 | 100행 × 1 토큰 조회 (`admin-wallets.ts:347`, `admin-monitoring.ts:251,330`, `admin-auth.ts:240`) |
| P-4 | **Medium** | 무제한 세션 목록 | `sessions.ts` | 비취소 세션 전체 반환 (LIMIT 없음) |
| P-5 | **Low** | 무제한 정책 목록 | `policies.ts` | 전체 정책 반환 (규칙 JSON 포함) |
| P-6 | **Low** | Dynamic `import()` in hot path | `admin-auth.ts:255` | `GET /admin/status` 매 요청 시 `import('semver')` |
| P-7 | **Medium** | N+1: 세션 생성 시 walletId별 조회 | `sessions.ts:333-336` | walletId당 개별 SELECT (`.map()` 내) |

### 구조 이슈

1,500줄 이상 대형 파일 중 유지보수에 직접 영향을 미치는 핵심 파일:

| 파일 | 줄 수 | 문제 |
|------|------|------|
| `migrate.ts` | **3,525** | DDL + 59개 버전 마이그레이션(58 MIGRATIONS.push)이 단일 파일 |
| `daemon.ts` | **2,390** | 시작/종료/파이프라인 재진입이 단일 클래스에 혼재 |
| `stages.ts` | **2,330** | 6단계 파이프라인 + 헬퍼 함수가 단일 파일 |
| `database-policy-engine.ts` | **2,318** | 7개+ 정책 타입 평가 로직이 단일 파일 |

> **참고:** `admin.ts`는 이미 7개 서브라우터로 분할 완료 (`admin.ts` 99줄 aggregator + `admin-auth.ts` 571줄 + `admin-wallets.ts` 648줄 + `admin-monitoring.ts` 943줄 + `admin-settings.ts` 623줄 + `admin-actions.ts` 421줄 + `admin-notifications.ts` 249줄 + `admin-credentials.ts` 140줄).
> 단, `admin-monitoring.ts`(943줄)은 여전히 대형이며 N+1 패턴(P-2)이 존재.

### 연관성

N+1 쿼리 해소와 페이지네이션은 독립적으로 진행 가능:
- `formatTxAmount` N+1은 `admin-wallets.ts`에 정의되어 3개 서브라우터에서 import하여 사용
- 세션 프롬프트 N+1은 `admin-monitoring.ts` 내에서 수정
- `sessions.ts` 페이지네이션은 독립적이지만 N+1 해소와 동시 처리가 자연스러움

---

## 구현 대상

### ~~Phase 1: admin.ts 분할~~ → 완료 (이전 마일스톤에서 수행됨)

admin.ts는 이미 7개 서브라우터로 분할되어 있음. 이 Phase는 제거.

### Phase 1: N+1 쿼리 해소

| 대상 | 현재 | 개선 |
|------|------|------|
| P-1: `GET /sessions` 지갑 조회 (`sessions.ts:427-446`) | 세션당 1 쿼리 (`.map()` 내 개별 SELECT) | 단일 `IN(sessionIds)` 쿼리 + `Map<sessionId, wallet[]>` 클라이언트 그루핑 |
| P-2: `POST /admin/sessions/prompt` 패턴 A (`admin-monitoring.ts:384`) | walletId당 1 쿼리 (`.map()` 내 개별 SELECT) | 단일 `IN(walletIds)` 쿼리 |
| P-2: `POST /admin/sessions/prompt` 패턴 B (`admin-monitoring.ts:434`) | 후보 세션당 1 쿼리 (for 루프 내 linked count) | 단일 JOIN 쿼리로 후보 세션 + linked count 동시 조회 |
| P-3: `formatTxAmount` 토큰 조회 (`admin-wallets.ts:29`) | 행당 1 쿼리 (호출 시마다 token_registry SELECT) | 결과셋의 unique `tokenAddress` 수집 → 단일 `IN()` 조회 → `Map<address, token>` 룩업. 함수 시그니처를 `(amount, chain, network, tokenAddr, tokenMap)` 으로 변경하고 호출부 3곳에서 사전 배치 조회 |
| P-7: `sessions.ts:333-336` 세션 생성 시 지갑 조회 | walletId당 1 쿼리 (`.map()` 내 개별 SELECT) | 단일 `IN(walletIds)` 쿼리 |

### Phase 2: 페이지네이션 추가

| 엔드포인트 | 현재 | 개선 |
|-----------|------|------|
| `GET /v1/sessions` | 비취소 세션 전체 반환 | `?limit=50&offset=0` 쿼리 파라미터 추가, 응답에 `total` 포함 |
| `GET /v1/policies` | 전체 정책 반환 | `?limit=50&offset=0` 쿼리 파라미터 추가, 응답에 `total` 포함 |
| OpenAPI 스키마 갱신 | — | 페이지네이션 파라미터 + 응답 스키마 갱신 |
| SDK 갱신 | — | `listSessions()`, `listPolicies()`에 pagination 옵션 추가 |
| MCP 갱신 | — | list 도구에 pagination 파라미터 추가 |

페이지네이션 패턴은 기존 `GET /v1/wallets/:id/transactions`의 `limit`/`offset` 패턴을 따른다.

### Phase 3: migrate.ts + daemon.ts + database-policy-engine.ts 분할

**migrate.ts (3,525줄) 분할:**

| 파일 | 내용 |
|------|------|
| `schema-ddl.ts` | 초기 테이블 생성 DDL (CREATE TABLE 문) |
| `migrations/v2-v10.ts` | 마이그레이션 v2~v10 |
| `migrations/v11-v20.ts` | 마이그레이션 v11~v20 |
| `migrations/v21-v30.ts` | 마이그레이션 v21~v30 |
| `migrations/v31-v40.ts` | 마이그레이션 v31~v40 |
| `migrations/v41-v50.ts` | 마이그레이션 v41~v50 |
| `migrations/v51-v59.ts` | 마이그레이션 v51~v59 |
| `migrate.ts` (root) | 마이그레이션 러너 (버전 체크, 순차 실행, 트랜잭션 래핑) |

**daemon.ts (2,390줄) 분할:**

| 파일 | 내용 | 예상 줄 수 |
|------|------|-----------|
| `daemon-startup.ts` | `start()`, 서비스 초기화, DB 연결, 어댑터 풀 생성 | ~700 |
| `daemon-shutdown.ts` | `stop()`, graceful shutdown 6단계, 리소스 정리 | ~400 |
| `daemon-pipeline.ts` | `reEntryPendingTransactions()`, stage 5-6 재실행 | ~300 |
| `daemon.ts` (root) | `DaemonLifecycle` 클래스 (위 모듈 조합), getter, 필드 선언 | ~500 |
| `daemon-types.ts` | inline `import()` 타입 → 정적 `import type` 통합 | ~50 |

**database-policy-engine.ts (2,318줄) 분할:**

| 파일 | 내용 |
|------|------|
| `evaluators/spending-limit.ts` | `SpendingLimit` 정책 평가 |
| `evaluators/contract-whitelist.ts` | `CONTRACT_WHITELIST` 정책 평가 |
| `evaluators/allowed-tokens.ts` | `ALLOWED_TOKENS` 정책 평가 |
| `evaluators/approved-spenders.ts` | `APPROVED_SPENDERS` 정책 평가 |
| `evaluators/lending-asset-whitelist.ts` | Lending 자산 화이트리스트 평가 |
| `evaluators/lending-ltv-limit.ts` | Lending LTV 한도 평가 |
| `database-policy-engine.ts` (root) | `DatabasePolicyEngine` 클래스 (evaluator 조합, 공통 로직) |

### Phase 4: stages.ts 분할 + Solana mapError 중앙화 + 기타 정리

| 대상 | 내용 |
|------|------|
| `stages.ts` 분할 (2,330줄) | `stage1-validate.ts`, `stage2-auth.ts`, `stage3-policy.ts`, `stage4-wait.ts`, `stage5-execute.ts`, `stage6-confirm.ts` + `pipeline-helpers.ts` |
| Solana `mapError()` | EVM 어댑터와 동일한 중앙화 `mapError()` 메서드 생성. 20곳 catch 패턴 → 단일 호출로 교체 (Solana adapter: 1,657줄) |
| Dynamic `import()` 제거 | `admin-auth.ts:255`의 `import('semver')` → 정적 import |
| 구조화 로거 도입 검토 | `daemon.ts` `console.*` → 로거 인터페이스 정의 (구현은 별도 마일스톤) |
| 테스트 | 분할 후 기존 테스트 전체 통과. Solana 에러 분류 테스트 추가 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | ~~admin.ts 분할 단위~~ | ~~도메인별 (6개) vs 기능별 (3개)~~ | **이미 완료** — 7개 서브라우터로 분할됨 |
| 2 | N+1 해결 방법 | JOIN + subquery vs 2-쿼리 + 클라이언트 조합 | **2-쿼리 + Map 조합** — SQLite에서 복잡 JOIN보다 2개 단순 쿼리가 실행 계획 안정적. Drizzle ORM 호환성 우수 |
| 3 | 페이지네이션 스타일 | offset/limit vs cursor-based | **offset/limit** — 기존 트랜잭션 API 패턴과 일치. 세션/정책은 대량 데이터가 아니므로 offset 성능 충분 |
| 4 | migrate.ts 분할 단위 | 버전당 1파일 vs 10버전 묶음 | **10버전 묶음** — 현재 v59까지 58개 마이그레이션. 버전당 파일은 과도, 10개 묶음이 탐색 효율적. 6개 파일로 분할 |
| 5 | policy-engine 분할 | 정책 타입별 파일 vs 3-파일 (check/evaluate/execute) | **정책 타입별** — 각 정책 평가 로직이 독립적이므로 타입별 분할이 개별 수정/테스트에 유리 |
| 6 | stages.ts 분할 | 스테이지별 파일 vs 전반/후반 2분할 | **스테이지별** — 각 스테이지가 300-400줄로 관리 가능. 의존 관계가 순차적이므로 스테이지별이 자연스러움 |
| 7 | 구조화 로거 | 이 마일스톤에서 구현 vs 인터페이스만 정의 | **인터페이스만 정의** — 로거 구현은 별도 운영 인프라 마일스톤. 이 마일스톤에서는 `ILogger` 인터페이스 + `console` 기본 구현만 |
| 8 | 페이지네이션 기본값 | 50 vs 100 | **50** — 세션/정책은 JSON 필드(constraints, rules)를 포함하므로 페이로드 크기 고려 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 성능

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | `GET /sessions` N+1 해소 | 10 세션 × 3 지갑 환경 → DB 쿼리 수 ≤ 3 assert (SQLite query log) | [L0] |
| 2 | `formatTxAmount` 배치 조회 | 50행 결과 → 토큰 조회 쿼리 1회 assert | [L0] |
| 3 | Admin session prompt 쿼리 최적화 | 5 walletIds × 10 sessions → 총 쿼리 ≤ 5 assert | [L0] |
| 4 | 페이지네이션 세션 | `GET /sessions?limit=10&offset=0` → 10건 + total 포함 assert | [L0] |
| 5 | 페이지네이션 정책 | `GET /policies?limit=10&offset=0` → 10건 + total 포함 assert | [L0] |
| 6 | 페이지네이션 경계 | offset > total → 빈 배열 반환 assert | [L0] |
| 7 | 기존 API 하위호환 | `GET /sessions` (파라미터 없음) → 기본값 적용 (limit=50) | [L0] |

### 구조 분할

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 8 | daemon lifecycle 통합 | 시작 → 요청 처리 → 종료 플로우 기존 테스트 통과 | [L0] |
| 9 | 마이그레이션 연속성 | v1 → v59 순차 마이그레이션 테스트 통과 | [L0] |
| 10 | 정책 엔진 전체 평가 | 7개+ 정책 타입 기존 테스트 전체 통과 | [L0] |
| 11 | Solana 에러 매핑 | 기존 에러 분류 테스트 통과 + 신규 `mapError` 테스트 추가 | [L0] |
| 12 | stages 파이프라인 통합 | 분할 후 파이프라인 기존 테스트 전체 통과 | [L0] |

### SDK/MCP 호환

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | SDK listSessions pagination | `sdk.listSessions({ limit: 10 })` → 정상 | [L0] |
| 14 | MCP list-sessions pagination | `limit` 파라미터 전달 → 정상 | [L0] |
| 15 | 전체 테스트 통과 | `pnpm turbo run test:unit` + `typecheck` + `lint` | [L0] |

---

## 선행 조건

| 의존 대상 | 이유 | 상태 |
|----------|------|------|
| m32-04 (타입 안전 + 코드 품질) | `database-policy-engine.ts` 분할이 Zod 스키마 추가 이후에 진행되어야 충돌 최소화 | **완료 (v32.4 SHIPPED)** |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 페이지네이션 도입으로 기존 클라이언트 호환성 | SDK/MCP에서 전체 목록을 가정한 코드 깨짐 | 기본 limit=50 + offset=0 적용. 파라미터 생략 시 기본값 사용으로 하위 호환 |
| 2 | migrate.ts 분할 시 마이그레이션 순서 보장 | 파일 분할 후 import 순서 오류로 마이그레이션 건너뜀 | 마이그레이션 러너가 `schema_version` 기반 순차 실행하므로 import 순서 무관. 체인 테스트로 검증 |
| 3 | daemon.ts 분할 시 클래스 필드 접근 | private 필드를 외부 모듈에서 접근 불가 | 분할된 모듈을 클래스 메서드가 아닌 함수로 추출, 필요한 의존성을 파라미터로 전달 |
| 4 | N+1 쿼리 수정 시 SQLite 성능 특성 | `IN()` 절에 수백 개 ID → SQLite 변수 바인딩 제한 (SQLITE_MAX_VARIABLE_NUMBER=999) | 세션/정책은 수백 개 수준이므로 제한 미도달. 초과 시 배치 분할 |
| 5 | stages.ts 분할 시 순환 의존 | 스테이지 간 공유 헬퍼/타입 참조 | `pipeline-helpers.ts`와 `pipeline-types.ts`에 공유 코드 추출 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 4개 (admin 분할 완료로 축소) |
| 신규 파일 | 20-25개 (evaluators 6 + stages 7 + migration 6 + daemon 4 + helpers 2-3) |
| 수정 파일 | 15-20개 (원본 분할 + SDK/MCP 페이지네이션) |
| 예상 LOC 변경 | +1,500/-200 (파일 분할은 이동이므로 net 변경 적음. 페이지네이션/N+1 수정이 주 변경) |
| 쿼리 최적화 | 5건 (P-1~P-3) |
| 대형 파일 분할 | 4개 → 25+ 파일 |

---

*생성일: 2026-03-01*
*최종 갱신: 2026-03-16 (코드 상태 반영: admin.ts 분할 완료, 줄 수/위치/마이그레이션 범위 업데이트)*
*관련 분석: 코드베이스 성능 + 구조 감사 (2026-03-01)*
*선행: m32-04 (타입 안전 + 코드 품질) — 완료*
