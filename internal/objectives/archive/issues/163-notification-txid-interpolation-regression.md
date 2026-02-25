# 163 — 알림 메시지 {txId} 미치환 회귀 (TX_APPROVAL_REQUIRED, TX_FAILED)

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.2
- **상태:** FIXED
- **관련:** #148 (불완전 수정)

## 증상

TX_APPROVAL_REQUIRED 알림에서 `{txId}`가 실제 트랜잭션 ID로 치환되지 않고 리터럴 문자열 `{txId}`로 표시됨.

**텔레그램 실제 출력:**
```
거래 {txId}에 Owner 승인이 필요합니다. 금액: 10000000000000000, 수신: 0xf3DfA424D21BE3018e79d7ABC095236d0dF9F091 ($19.10)
```

## 원인

`stages.ts`의 `notify()` 호출에서 `txId`를 `vars` (3번째 인자)가 아닌 `details` (4번째 인자)에 전달.
`getNotificationMessage()`는 `vars`만 보간하므로 `details`에 있는 `txId`는 템플릿에 치환되지 않음.

이슈 #148 (v27.2)에서 TX_SUBMITTED, TX_CONFIRMED만 수정하고 나머지 이벤트를 누락한 불완전 수정.

## 영향 범위

### txId가 details에만 있는 호출 (버그)

| 이벤트 | 파일:라인 | 템플릿 `{txId}` 사용 |
|--------|-----------|---------------------|
| TX_APPROVAL_REQUIRED | stages.ts:513-518 | O |
| TX_FAILED | stages.ts:765-769 | O |
| TX_FAILED | stages.ts:842-846 | O |
| TX_FAILED | stages.ts:873-877 | O |
| TX_FAILED | stages.ts:910-914 | O |
| TX_FAILED | stages.ts:1005-1009 | O |

### 추가 발견: TX_FAILED 템플릿 키 불일치

- 템플릿: `Transaction {txId} failed: {error} {display_amount}`
- 코드: `{ reason: ..., amount: ..., display_amount: ... }` — `{error}` 키에 대응하는 `error` 대신 `reason`을 전달

### 이미 수정된 호출 (#148에서 처리)

| 이벤트 | 파일:라인 | 비고 |
|--------|-----------|------|
| TX_SUBMITTED | stages.ts:808 | vars에 txId 포함 ✓ |
| TX_CONFIRMED | stages.ts:978 | vars에 txId 포함 ✓ |

### 호출 없는 템플릿 ({txId} 사용하나 프로덕션 callsite 없음)

TX_QUEUED, TX_CANCELLED, TX_DOWNGRADED_DELAY, TX_APPROVAL_EXPIRED

## 수정 방안

1. **TX_APPROVAL_REQUIRED** (stages.ts:513-518): vars에 `txId: ctx.txId` 추가
2. **TX_FAILED** 5곳: vars에 `txId: ctx.txId` 추가
3. **TX_FAILED 키 불일치**: vars의 `reason` → `error`로 변경 (또는 템플릿의 `{error}` → `{reason}`으로 변경)

## 테스트 항목

1. TX_APPROVAL_REQUIRED 알림 메시지에 실제 txId가 포함되는지 검증
2. TX_FAILED 알림 메시지에 실제 txId와 에러 사유가 포함되는지 검증
3. 기존 TX_SUBMITTED, TX_CONFIRMED 보간이 영향받지 않는 회귀 테스트
4. message-templates.ts 단위 테스트에서 모든 TX_* 이벤트 보간 검증
