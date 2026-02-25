# 160 — connect-info API가 글로벌 정책(walletId=NULL)을 누락

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.2
- **상태:** OPEN
- **발견일:** 2026-02-23

## 증상

Admin UI에서 글로벌 SPENDING_LIMIT 정책을 설정했으나, 에이전트가 `GET /v1/connect-info` 호출 시
모든 지갑의 policies 배열이 빈 배열(`[]`)로 반환됨. 프롬프트에도 "No restrictions"로 표시.

실제 트랜잭션 실행 시에는 정책이 정상 적용되어 DELAY tier로 분류됨 (정책 엔진은 정상 동작).

## 원인

`connect-info.ts:193`의 정책 조회 쿼리가 특정 지갑 ID에 매칭되는 정책만 조회하고,
글로벌 정책(`wallet_id IS NULL`)을 포함하지 않음.

```typescript
// 현재 (connect-info.ts:193)
.where(and(eq(policies.walletId, w.id), eq(policies.enabled, true)))

// DatabasePolicyEngine (정상 동작)
.where(and(
  or(eq(policies.walletId, walletId), isNull(policies.walletId)),
  ...
))
```

## 영향 범위

- **파일:** `packages/daemon/src/api/routes/connect-info.ts` (line 185-194)
- 에이전트가 정책 존재 여부를 잘못 인식 → 프롬프트에 "No restrictions" 표시
- MCP 에이전트, SDK 클라이언트 등 connect-info를 사용하는 모든 소비자에 영향

## 수정 방안

`connect-info.ts`의 정책 조회 쿼리에 `OR walletId IS NULL` 조건 추가:

```typescript
import { or, isNull } from 'drizzle-orm';

const walletPolicies = deps.db
  .select({ type: policies.type, rules: policies.rules, priority: policies.priority, network: policies.network })
  .from(policies)
  .where(and(
    or(eq(policies.walletId, w.id), isNull(policies.walletId)),
    eq(policies.enabled, true),
  ))
  .all();
```

`or`, `isNull`은 이미 `database-policy-engine.ts`에서 사용 중인 drizzle-orm 함수.

## 테스트 항목

- [ ] 글로벌 정책(walletId=NULL) 설정 후 connect-info 응답의 policies에 포함 확인
- [ ] 지갑별 정책 + 글로벌 정책 동시 존재 시 양쪽 모두 반환 확인
- [ ] 정책 미설정 시 기존대로 빈 배열 반환 확인
- [ ] 프롬프트 텍스트에 정책 유형(SPENDING_LIMIT 등) 정상 표시 확인
