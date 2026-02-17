# v1.6-047: Terminate 시 리소스 정리 누락 + TERMINATED 가드 미적용

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 현상

### 1. Terminate 후 리소스 정리 없음

월렛 terminate (`DELETE /v1/wallets/{id}`) 시 DB `status`만 `TERMINATED`로 변경하고 종료. 연관 리소스가 정리되지 않음:

- WalletConnect 세션이 만료될 때까지 활성 상태로 유지
- JWT 세션이 유효한 상태로 남음 (TTL 만료까지)
- 대기 중인 트랜잭션(PENDING/PENDING_APPROVAL)이 그대로 잔류

```typescript
// wallets.ts:416-421 — status 업데이트만 수행
await deps.db
  .update(wallets)
  .set({ status: 'TERMINATED', updatedAt: now })
  .where(eq(wallets.id, walletId))
  .run();
```

### 2. TERMINATED 월렛에 대한 작업 가드 누락

종료된 월렛에서 트랜잭션 전송, 정책 추가, 세션 생성, WC 연결 등이 모두 가능.

**가드가 있는 라우트 (4개):**

| 라우트 | 용도 |
|--------|------|
| `DELETE /v1/wallets/{id}` | 재종료 방지 |
| `PUT /v1/wallets/{id}/default-network` | 네트워크 변경 차단 |
| `PUT /v1/wallets/{id}/owner` | Owner 설정 차단 |
| `PUT /v1/wallet/default-network` (sessionAuth) | 네트워크 변경 차단 |

**가드가 없는 라우트:**

| 라우트 | 위험도 | 설명 |
|--------|--------|------|
| `POST /v1/wallets/{id}/wc/pair` | HIGH | 종료된 월렛에 WC 연결 가능 |
| `GET /v1/wallets/{id}/wc/session` | LOW | 세션 조회 (읽기) |
| `DELETE /v1/wallets/{id}/wc/session` | LOW | WC 해제 (정리 행위이므로 허용 가능) |
| `GET /v1/wallets/{id}/wc/pair/status` | LOW | 상태 폴링 (읽기) |
| `POST /v1/wallets/{id}/transactions` | HIGH | 종료된 월렛에서 트랜잭션 전송 가능 |
| `POST /v1/wallets/{id}/policies` | MEDIUM | 종료된 월렛에 정책 추가 가능 |
| `POST /v1/sessions` (walletId 지정) | HIGH | 종료된 월렛에 세션 생성 가능 |
| sessionAuth `/v1/wallet/wc/*` 4개 | HIGH | 기존 JWT로 WC 연결 가능 |
| sessionAuth `/v1/wallet/transactions` | HIGH | 기존 JWT로 트랜잭션 전송 가능 |
| Actions 라우트 | MEDIUM | 종료된 월렛에서 액션 실행 가능 |

## 원인

설계 문서(doc 67)에서 terminate를 "삭제(terminate)"로만 언급하고, 연관 리소스 정리 절차와 상태 가드를 명세하지 않음. 구현 시에도 일부 라우트에만 가드를 추가하고 나머지를 누락.

## 수정 방안

### 1. Terminate 정리 절차 추가

`DELETE /v1/wallets/{id}` 핸들러에서 status 변경 후 정리 수행:

```typescript
// 1. WC 세션 해제
if (wcSessionService) {
  await wcSessionService.disconnectSession(walletId).catch(() => {});
}

// 2. 활성 JWT 세션 무효화 (DB에서 삭제 또는 revoked 마킹)
await db.delete(sessions).where(eq(sessions.walletId, walletId)).run();

// 3. 대기 트랜잭션 취소
await db.update(transactions)
  .set({ status: 'CANCELLED' })
  .where(and(
    eq(transactions.walletId, walletId),
    inArray(transactions.status, ['PENDING', 'PENDING_APPROVAL'])
  ))
  .run();
```

### 2. TERMINATED 가드를 공통 미들웨어로 추출

월렛 ID를 받는 모든 쓰기 라우트에 적용할 공통 가드:

```typescript
function assertNotTerminated(wallet: { status: string; id: string }) {
  if (wallet.status === 'TERMINATED') {
    throw new WAIaaSError('WALLET_TERMINATED', {
      message: `Wallet '${wallet.id}' has been terminated`,
    });
  }
}
```

읽기 전용 라우트(GET session, GET status)는 허용하되, 쓰기 라우트(POST pair, POST transactions, POST policies, POST sessions)에는 필수 적용.

`DELETE /wc/session`은 정리 행위이므로 허용 (종료된 월렛의 잔여 WC 세션을 수동 해제할 수 있어야 함).

### 3. Withdraw(자산 회수) API는 TERMINATED에서도 허용

`IChainAdapter.sweepAll()` 인터페이스와 `WITHDRAW` 에러 도메인(4개 코드)은 정의되어 있으나, 이를 호출하는 **REST API 엔드포인트가 미구현**. TERMINATED 가드 적용 시 일반 트랜잭션이 차단되므로, Owner 주소로 자산을 회수하는 withdraw 전용 엔드포인트가 반드시 필요:

- `POST /v1/wallets/{id}/withdraw` — Owner 주소로 전체 자산 sweep
- TERMINATED + SUSPENDED 상태에서도 허용 (자산 회수는 항상 가능해야 함)
- Owner 상태가 LOCKED인 경우에만 실행 가능 (`WITHDRAW_LOCKED_ONLY` 에러 코드 활용)
- 이 엔드포인트는 TERMINATED 가드 예외 대상

> **참고**: withdraw API 구현은 별도 이슈/마일스톤에서 다루되, #047의 TERMINATED 가드 설계 시 withdraw 예외를 고려해야 함.

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/api/routes/wallets.ts` | terminate 핸들러에 정리 로직 추가 |
| `packages/daemon/src/api/routes/wc.ts` | POST pair에 TERMINATED 가드 |
| `packages/daemon/src/api/routes/transactions.ts` | POST에 TERMINATED 가드 |
| `packages/daemon/src/api/routes/policies.ts` | POST에 TERMINATED 가드 |
| `packages/daemon/src/api/routes/sessions.ts` | POST에 TERMINATED 가드 |
| `packages/daemon/src/api/routes/wallet.ts` | sessionAuth 쓰기 라우트에 TERMINATED 가드 |
| `packages/daemon/src/api/routes/actions.ts` | POST에 TERMINATED 가드 |

## 테스트

### 정리 절차 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-047-01 | WC 세션 활성 상태에서 terminate | WC 세션 disconnect 호출, 세션 제거 |
| T-047-02 | JWT 세션 3개 활성 상태에서 terminate | 3개 세션 모두 DB에서 삭제/무효화 |
| T-047-03 | PENDING 트랜잭션 2건 존재 상태에서 terminate | 2건 모두 CANCELLED로 전환 |
| T-047-04 | PENDING_APPROVAL 트랜잭션 존재 상태에서 terminate | CANCELLED로 전환 |
| T-047-05 | WC 미설정(wcSessionService=null) 상태에서 terminate | WC 정리 스킵, 나머지 정상 수행 |
| T-047-06 | 연관 리소스 없는 월렛 terminate | 정리 로직 에러 없이 정상 종료 |

### TERMINATED 가드 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-047-07 | TERMINATED 월렛에 `POST /wc/pair` | 403 `WALLET_TERMINATED` |
| T-047-08 | TERMINATED 월렛에 `POST /transactions` | 403 `WALLET_TERMINATED` |
| T-047-09 | TERMINATED 월렛에 `POST /policies` | 403 `WALLET_TERMINATED` |
| T-047-10 | TERMINATED 월렛에 `POST /sessions` | 403 `WALLET_TERMINATED` |
| T-047-11 | TERMINATED 월렛에 `GET /wc/session` (읽기) | 200 또는 404 (정상 허용) |
| T-047-12 | TERMINATED 월렛에 `DELETE /wc/session` (정리) | 200 (정상 허용) |
| T-047-13 | TERMINATED 월렛의 기존 JWT로 sessionAuth 쓰기 요청 | 403 `WALLET_TERMINATED` |
| T-047-14 | ACTIVE 월렛에서 기존 기능 정상 동작 확인 (회귀 방지) | 기존 응답 동일 |
| T-047-15 | TERMINATED 월렛에 `POST /withdraw` (자산 회수) | 200 (TERMINATED 가드 예외, Owner LOCKED 필수) |
| T-047-16 | TERMINATED + Owner NONE 상태에서 `POST /withdraw` | 404 `NO_OWNER` |
| T-047-17 | TERMINATED + Owner GRACE 상태에서 `POST /withdraw` | 403 `WITHDRAW_LOCKED_ONLY` |
