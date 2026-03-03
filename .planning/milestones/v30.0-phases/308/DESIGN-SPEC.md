# Phase 308: Admin Stats + AutoStop Plugin 설계 통합 스펙

**Phase:** 308
**마일스톤:** v30.0 운영 기능 확장 설계
**Requirements:** STAT-01, STAT-02, STAT-03, STAT-04, PLUG-01, PLUG-02, PLUG-03, PLUG-04
**상태:** 완료
**작성일:** 2026-03-03

---

## 1. 설계 개요

### 1.1 목적

데몬의 운영 통계를 단일 JSON 엔드포인트 `GET /v1/admin/stats`로 제공하고, AutoStop 규칙을 플러그인 구조(`IAutoStopRule` + `RuleRegistry`)로 리팩토링하여 확장 가능하게 설계한다.

### 1.2 핵심 원칙

1. **Self-Hosted 단순성** -- Prometheus/Grafana 없이 JSON 통계 엔드포인트로 충분
2. **Zod SSoT** -- 응답 스키마를 Zod로 정의, TS 타입 자동 도출
3. **플러그인 확장성** -- 새 AutoStop 규칙 추가 시 하드코딩 없이 등록만으로 확장
4. **하위 호환** -- 기존 3개 규칙의 동작 변경 없음

### 1.3 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| STAT-01 | AdminStatsResponseSchema Zod 정의 (7 카테고리) | 섹션 2 |
| STAT-02 | 인메모리 카운터 인터페이스 (IMetricsCounter) | 섹션 3 |
| STAT-03 | DB 집계 쿼리 + 1분 TTL 캐시 | 섹션 4, 5 |
| STAT-04 | GET /v1/admin/stats + Admin UI 대시보드 | 섹션 8, 11 |
| PLUG-01 | IAutoStopRule 인터페이스 + RuleResult 타입 | 섹션 6 |
| PLUG-02 | RuleRegistry 설계 (런타임 등록/해제/조회) | 섹션 7 |
| PLUG-03 | 기존 3개 규칙 → IAutoStopRule 리팩토링 | 섹션 6.4 |
| PLUG-04 | 규칙별 enable/disable + REST API 스펙 | 섹션 9, 10 |

### 1.4 영향 범위

| 패키지 | 변경 사항 |
|--------|----------|
| `@waiaas/core` | AdminStatsResponseSchema, AutoStopRulesResponseSchema, IMetricsCounter export |
| `@waiaas/daemon` (services) | AdminStatsService 신규, autostop/ 디렉토리 분리 리팩토링 |
| `@waiaas/daemon` (api) | GET /admin/stats, GET /admin/autostop/rules, PUT /admin/autostop/rules/:id |
| `@waiaas/daemon` (settings) | 3개 규칙별 enable 키 추가 |
| `@waiaas/daemon` (admin-ui) | 대시보드 stats 카드 추가 |
| 설계 문서 | doc 29, 36, 37, 67 갱신 |

---

## 2. AdminStatsResponseSchema (STAT-01)

### 2.1 7 카테고리 구조

| 카테고리 | 데이터 소스 | 주요 필드 |
|---------|-----------|----------|
| transactions | DB 집계 | total, byStatus, byType, last24h, last7d |
| sessions | DB 집계 | active, total, revokedLast24h |
| wallets | DB 집계 | total, byStatus, withOwner |
| rpc | 인메모리 카운터 | totalCalls, totalErrors, byNetwork, poolStatus |
| autostop | AutoStopService | enabled, triggeredTotal, rules, lastTriggeredAt |
| notifications | DB 집계 | sentLast24h, failedLast24h, channelStatus |
| system | 런타임 | uptimeSeconds, version, schemaVersion, dbSizeBytes, nodeVersion, platform, timestamp |

### 2.2 Zod 스키마 파일

```
packages/core/src/schemas/admin-stats.schema.ts
```

전체 스키마 코드는 PLAN-308-01 섹션 2.3 참조.

### 2.3 카테고리 설계 근거

원안은 6 카테고리(transactions, sessions, wallets, rpc, autostop, system)였으나, `notifications` 카테고리를 추가하여 7개로 확장하였다. 알림 전송 현황(24h 성공/실패, 채널 설정 상태)은 운영 통계의 필수 항목이며, `notification_logs` 테이블에서 효율적으로 집계 가능하다.

---

## 3. 인메모리 카운터 인터페이스 (STAT-02)

### 3.1 IMetricsCounter

```typescript
export interface IMetricsCounter {
  increment(key: string, labels?: Record<string, string>): void;
  recordLatency(key: string, durationMs: number, labels?: Record<string, string>): void;
  getCount(key: string, labels?: Record<string, string>): number;
  getAvgLatency(key: string, labels?: Record<string, string>): number;
  snapshot(): MetricsSnapshot;
  reset(): void;
}
```

### 3.2 카운터 연동 지점

| 카운터 | 라벨 | 연동 지점 |
|--------|------|----------|
| `rpc.calls` | `network` | RpcPool.getUrl() 성공 후 (어댑터 래퍼) |
| `rpc.errors` | `network` | RpcPool.reportFailure() 호출 시 (onEvent 콜백) |
| `rpc.latency` | `network` | 어댑터 메서드 try/finally 래퍼 |
| `autostop.triggered` | `rule` | AutoStopService.suspendWallet() 시 |
| `tx.submitted` | `chain` | Stage 5d 완료 시 (인메모리 보조) |
| `tx.failed` | `chain` | Pipeline 실패 시 (인메모리 보조) |

### 3.3 구현 위치

```
packages/core/src/metrics/metrics-counter.ts       -- 인터페이스
packages/daemon/src/infrastructure/metrics/in-memory-counter.ts  -- 구현
```

---

## 4. DB 집계 쿼리 (STAT-03)

### 4.1 쿼리 목록

| 대상 | 쿼리 | 인덱스 |
|------|------|--------|
| TX 상태별 | `SELECT status, COUNT(*) FROM transactions GROUP BY status` | idx_transactions_wallet_status |
| TX 타입별 | `SELECT type, COUNT(*) FROM transactions GROUP BY type` | idx_transactions_type |
| TX 24h | `SELECT COUNT(*), SUM(amount_usd), ... FROM transactions WHERE created_at >= ?` | idx_transactions_created_at |
| TX 7d | `SELECT COUNT(*), SUM(amount_usd) FROM transactions WHERE created_at >= ?` | idx_transactions_created_at |
| 활성 세션 | `SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > ?` | idx_sessions_expires_at |
| 전체 세션 | `SELECT COUNT(*) FROM sessions` | PK |
| 폐기 세션 24h | `SELECT COUNT(*) FROM sessions WHERE revoked_at >= ?` | - |
| 월렛 상태별 | `SELECT status, COUNT(*) FROM wallets GROUP BY status` | idx_wallets_status |
| 월렛 Owner | `SELECT COUNT(*) FROM wallets WHERE owner_address IS NOT NULL` | idx_wallets_owner_address |
| 알림 24h | `SELECT status, COUNT(*) FROM notification_logs WHERE created_at >= ? GROUP BY status` | idx_notification_logs_created_at |

**신규 인덱스 불필요** -- 모든 쿼리가 기존 인덱스로 커버됨.

---

## 5. 1분 TTL 캐시 (STAT-03)

### 5.1 AdminStatsService

```
packages/daemon/src/services/admin-stats-service.ts
```

- `getStats(): AdminStatsResponse` -- 캐시 유효 시 캐시 반환, 만료 시 재생성
- `invalidateCache(): void` -- 수동 무효화 (테스트/강제 갱신)
- 총 응답 시간: 캐시 적중 ~0ms, 캐시 미적중 ~5ms

### 5.2 캐시 설계 요약

| 항목 | 값 |
|------|-----|
| TTL | 60초 |
| 캐시 단위 | 전체 응답 1건 |
| 무효화 | TTL 만료 + 수동 invalidateCache() |
| 동시성 | Node.js 단일 스레드, 문제 없음 |

---

## 6. IAutoStopRule 인터페이스 (PLUG-01)

### 6.1 핵심 타입

```typescript
export interface IAutoStopRule {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly subscribedEvents: AutoStopEventType[];
  enabled: boolean;

  evaluate(event: AutoStopEvent): RuleResult;
  tick?(nowSec: number): RuleTickResult[];
  getStatus(): RuleStatus;
  updateConfig(config: Record<string, unknown>): void;
  reset(): void;
}

export interface RuleResult {
  triggered: boolean;
  walletId: string;
  action?: RuleAction;
}

export type RuleAction = 'SUSPEND_WALLET' | 'NOTIFY_IDLE' | 'KILL_SWITCH_CASCADE';

export type AutoStopEventType = 'transaction:failed' | 'transaction:completed' | 'wallet:activity';
```

### 6.2 설계 포인트

- `evaluate(event)` -- 통합 이벤트 핸들러 (기존 개별 메서드 대체)
- `tick()` -- 선택적 주기 검사 (IdleTimeoutRule만 사용)
- `action` -- 규칙이 "무엇을 할지" 선언, AutoStopService가 실행

### 6.3 기존 RuleResult와의 관계

기존 `{ triggered, walletId }` → 신규 `{ triggered, walletId, action? }`. `action` 미지정 시 기본 `SUSPEND_WALLET`.

### 6.4 기존 규칙 리팩토링 매트릭스

| 기존 클래스 | id | subscribedEvents | tick | action |
|------------|-----|-----------------|------|--------|
| ConsecutiveFailuresRule | `consecutive_failures` | transaction:failed, transaction:completed | 없음 | SUSPEND_WALLET |
| UnusualActivityRule | `unusual_activity` | wallet:activity | 없음 | SUSPEND_WALLET |
| IdleTimeoutRule | `idle_timeout` | wallet:activity | checkIdle | NOTIFY_IDLE |

### 6.5 파일 구조 변경

```
기존: services/autostop-service.ts, services/autostop-rules.ts
신규: services/autostop/
      ├── types.ts
      ├── rule-registry.ts
      ├── autostop-service.ts
      ├── rules/consecutive-failures.rule.ts
      ├── rules/unusual-activity.rule.ts
      ├── rules/idle-timeout.rule.ts
      └── index.ts
```

---

## 7. RuleRegistry (PLUG-02)

### 7.1 인터페이스

```typescript
export interface IRuleRegistry {
  register(rule: IAutoStopRule): void;
  unregister(ruleId: string): void;
  getRules(): IAutoStopRule[];
  getEnabledRules(): IAutoStopRule[];
  getRule(id: string): IAutoStopRule | undefined;
  getRulesForEvent(eventType: AutoStopEventType): IAutoStopRule[];
  getTickableRules(): IAutoStopRule[];
  setEnabled(ruleId: string, enabled: boolean): void;
  readonly size: number;
}
```

### 7.2 설계 포인트

- Map 기반 -- 삽입 순서 보장, O(1) 조회
- 동일 id 재등록 시 교체 (update 패턴)
- AutoStopService constructor에서 3개 빌트인 규칙 자동 등록

---

## 8. REST API 엔드포인트

### 8.1 엔드포인트 요약

| # | 메서드 | 경로 | 인증 | 설명 |
|---|--------|------|------|------|
| 1 | GET | `/v1/admin/stats` | masterAuth | 통합 운영 통계 (7 카테고리, 1분 캐시) |
| 2 | GET | `/v1/admin/autostop/rules` | masterAuth | AutoStop 규칙 목록 + 상태/설정 |
| 3 | PUT | `/v1/admin/autostop/rules/:id` | masterAuth | 규칙 enable/config 변경 |

### 8.2 에러 코드

| 코드 | HTTP | 엔드포인트 |
|------|------|----------|
| INVALID_MASTER_PASSWORD | 401 | 3개 모두 |
| RULE_NOT_FOUND | 404 | PUT /admin/autostop/rules/:id |

---

## 9. Admin Settings 규칙 토글 (PLUG-04)

### 9.1 신규 Setting 키

| 키 | 기본값 | 설명 |
|----|--------|------|
| `autostop.rule.consecutive_failures.enabled` | `true` | ConsecutiveFailures 규칙 개별 활성화 |
| `autostop.rule.unusual_activity.enabled` | `true` | UnusualActivity 규칙 개별 활성화 |
| `autostop.rule.idle_timeout.enabled` | `true` | IdleTimeout 규칙 개별 활성화 |

### 9.2 글로벌 vs 개별

- `autostop.enabled = false` → 모든 규칙 비활성 (마스터 스위치)
- `autostop.enabled = true` + `autostop.rule.{id}.enabled = false` → 해당 규칙만 비활성

---

## 10. AutoStop 규칙 응답 스키마

```typescript
export const AutoStopRuleInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  subscribedEvents: z.array(z.string()),
  config: z.record(z.unknown()),
  state: z.record(z.unknown()),
});

export const AutoStopRulesResponseSchema = z.object({
  globalEnabled: z.boolean(),
  rules: z.array(AutoStopRuleInfoSchema),
});
```

---

## 11. Admin UI 대시보드 연동

### 11.1 기존 대시보드 확장

`dashboard.tsx`에 Stats 카드 섹션 추가:
- 상단: 기존 StatCard (wallets, sessions, transactions, 24h)
- 중단: RPC 네트워크별 통계 테이블
- 중단: AutoStop 규칙 상태 테이블
- 하단: 알림 24h 요약 + 시스템 정보

### 11.2 폴링

`GET /v1/admin/stats` 30초 간격 폴링 (기존 Admin UI 패턴 일관).

---

## 12. 설계 결정 종합

| ID | 결정 | 근거 |
|----|------|------|
| STAT-D01 | 7 카테고리 (notifications 추가) | 알림 전송 현황은 운영 통계 필수 |
| STAT-D02 | IMetricsCounter 인터페이스 추출 | 테스트 모킹 + 향후 Prometheus 어댑터 확장 |
| STAT-D03 | 인메모리 카운터 재시작 시 리셋 | 이력은 DB, 실시간은 메모리 |
| STAT-D04 | better-sqlite3 동기 쿼리 | 기존 패턴, ~5ms 무시 가능 |
| STAT-D05 | RPC 레이턴시 어댑터 래퍼 측정 | RpcPool 수정 최소화 |
| STAT-D06 | 신규 인덱스 불필요 | 기존 인덱스 완전 커버 |
| STAT-D07 | last7d 간이 집계 추가 | 주간 추세 파악용 |
| PLUG-D01 | evaluate(event) 통합 메서드 | 3개 고유 메서드 통합 |
| PLUG-D02 | tick() 선택적 | IdleTimeout만 필요, 불필요한 규칙은 생략 |
| PLUG-D03 | RuleAction 타입 분리 | 규칙이 선언, 서비스가 실행 |
| PLUG-D04 | Map 기반 RuleRegistry | 삽입 순서 보장, O(1) |
| PLUG-D05 | 빌트인 규칙 자동 등록 | 하위 호환 |
| PLUG-D06 | autostop/ 디렉토리 분리 | 파일 수 증가에 대응 |
| PLUG-D07 | subscribedEvents 선언형 | 이벤트 라우팅 자동화 |
| API-D01 | 단일 /admin/stats 엔드포인트 | RTT 최소화, 실용적 |
| API-D02 | /admin/autostop/rules 하위 경로 | 기존 /admin/ 일관 |
| API-D03 | PUT 규칙 업데이트 | PUT /admin/settings 패턴 일관 |
| API-D04 | 규칙별 Setting 키 | 글로벌 enabled와 분리, 세밀한 제어 |
| API-D05 | 대시보드 확장 (별도 페이지 아님) | UX 자연스러움 |
| API-D06 | 30초 폴링 | Self-Hosted 단순성 |
| API-D07 | RULE_NOT_FOUND 신규 에러 | 규칙용 구분 |

---

## 13. 테스트 시나리오 종합

### 13.1 AdminStats 테스트 (8건)

| ID | 시나리오 | 예상 결과 |
|----|---------|----------|
| STAT-T01 | AdminStatsResponseSchema Zod parse | 검증 통과 |
| STAT-T02 | 빈 DB에서 집계 | 모든 카운트 0 |
| STAT-T03 | 5건 TX 집계 | 상태별 카운트 정확 |
| STAT-T04 | 1분 이내 재호출 | 캐시 응답 |
| STAT-T05 | invalidateCache() 후 | DB 재쿼리 |
| STAT-T06 | rpc.calls 카운터 | increment → getCount 정확 |
| STAT-T07 | rpc.latency 기록 | recordLatency → avgMs 정확 |
| STAT-T08 | 시스템 정보 | uptime, version, dbSize 반환 |

### 13.2 AutoStop Plugin 테스트 (11건)

| ID | 시나리오 | 예상 결과 |
|----|---------|----------|
| PLUG-T01 | ConsecutiveFailuresRule implements IAutoStopRule | 컴파일 + 동작 유지 |
| PLUG-T02 | UnusualActivityRule implements IAutoStopRule | 컴파일 + 동작 유지 |
| PLUG-T03 | IdleTimeoutRule implements IAutoStopRule | tick() 동작 유지 |
| PLUG-T04 | register → getRules → 3개 | 등록 순서 유지 |
| PLUG-T05 | unregister → getRules → 2개 | 정확한 제거 |
| PLUG-T06 | setEnabled(false) → getEnabledRules | 비활성 제외 |
| PLUG-T07 | getRulesForEvent('transaction:failed') | 1개 반환 |
| PLUG-T08 | getTickableRules | IdleTimeoutRule만 |
| PLUG-T09 | 기존 autostop-service.test.ts 통과 | 리팩토링 동작 동일 |
| PLUG-T10 | 기존 autostop-rules.test.ts 통과 | 인터페이스 추가 후 동작 동일 |
| PLUG-T11 | 커스텀 규칙 등록 + evaluate | 정상 동작 |

### 13.3 REST API 테스트 (10건)

| ID | 시나리오 | 예상 결과 |
|----|---------|----------|
| API-T01 | masterAuth 없이 GET /admin/stats | 401 |
| API-T02 | masterAuth로 GET /admin/stats | 200, 7 카테고리 |
| API-T03 | 빈 DB로 GET /admin/stats | 200, 모든 0 |
| API-T04 | 1분 이내 재호출 | 캐시 응답 |
| API-T05 | GET /admin/autostop/rules | 200, 3개 규칙 |
| API-T06 | PUT enabled=false | 200, enabled=false |
| API-T07 | PUT nonexistent rule | 404 RULE_NOT_FOUND |
| API-T08 | PUT config 변경 후 GET | 변경 반영 |
| API-T09 | Setting 핫 리로드 | 규칙 비활성화 |
| API-T10 | 대시보드 stats 렌더링 | 7 카테고리 표시 |

### 13.4 합계: 29건

---

## 14. 요구사항 추적

| 요구사항 | 충족 내용 |
|---------|----------|
| **STAT-01** | AdminStatsResponseSchema 7 카테고리 Zod 정의 (transactions/sessions/wallets/rpc/autostop/notifications/system) |
| **STAT-02** | IMetricsCounter 인터페이스 (increment/recordLatency/snapshot), 6개 카운터 연동 지점 매핑 |
| **STAT-03** | DB 집계 쿼리 10건 정의, 기존 인덱스 완전 커버, AdminStatsService 1분 TTL 캐시 |
| **STAT-04** | GET /v1/admin/stats 엔드포인트 스펙, Admin UI dashboard.tsx 확장 (30초 폴링) |
| **PLUG-01** | IAutoStopRule 인터페이스 (evaluate/tick/getStatus/updateConfig/reset), RuleResult + RuleAction 타입 |
| **PLUG-02** | RuleRegistry (register/unregister/getRules/getEnabledRules/getRulesForEvent/getTickableRules/setEnabled) |
| **PLUG-03** | 3개 규칙 → IAutoStopRule 구현체 리팩토링 설계, 파일 구조 autostop/ 분리, 기존 동작 보존 |
| **PLUG-04** | 3개 규칙별 enable Setting 키, GET /v1/admin/autostop/rules + PUT /:id 엔드포인트, RULE_NOT_FOUND 에러 코드 |

---

## 15. 설계 문서 갱신 요약

| 문서 | 변경 내용 | 규모 |
|------|----------|------|
| **29 (api-framework)** | IMetricsCounter 인메모리 카운터, AdminStatsService 캐시 패턴, RPC 래퍼 측정 | 소 |
| **36 (killswitch-autostop)** | IAutoStopRule 인터페이스, RuleRegistry, 3규칙 리팩토링, autostop/ 파일 구조, 규칙별 토글 | 대 |
| **37 (rest-api)** | 3개 엔드포인트 추가 (stats, autostop/rules GET/PUT), RULE_NOT_FOUND 에러, ~103개 합계 | 중 |
| **67 (admin-ui)** | 대시보드 Stats 카드 (RPC, AutoStop, 알림, 시스템), 30초 폴링 | 소 |

---

*작성: 2026-03-03*
*Phase 308 Plan 01 + 02 + 03 통합 설계 스펙*
*전제: Self-Hosted 단일 머신 아키텍처*
*범위: 설계 마일스톤 -- 코드 구현은 범위 외*
