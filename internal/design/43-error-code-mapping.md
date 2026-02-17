# RFC 9457 에러 코드 -> v0.2 에러 코드 매핑

**문서 ID:** MAPPING-02
**작성일:** 2026-02-06
**상태:** 완료
**참조:** API-04 (20-error-codes.md), API-SPEC (37-rest-api-complete-spec.md)
**요구사항:** LEGACY-08 (H11 에러 코드 매핑)

---

## 1. 개요

### 1.1 목적

v0.1의 RFC 9457 기반 46개 에러 코드와 v0.2의 7-domain 36개 에러 코드 간의 대응 관계를 명확히 정의한다. 이 문서는 구현자가 v0.1 에러 처리 코드를 v0.2로 마이그레이션할 때 참조한다.

### 1.2 핵심 변경 요약

| 항목 | v0.1 (API-04) | v0.2 (API-SPEC) | 변경 이유 |
|------|--------------|-----------------|-----------|
| 에러 코드 수 | 46개 | 36개 | Self-Hosted 모델에서 불필요한 코드 제거 |
| 포맷 | RFC 9457 Problem Details | 간소화 JSON | localhost 환경, Content-Type 단순화 |
| 도메인 분류 | 9개 도메인 | 7개 도메인 | webhook, funding, emergency 통합/제거 |
| Content-Type | `application/problem+json` | `application/json` | 단순화 |
| 에스컬레이션 필드 | 있음 (`escalation`) | 없음 | Self-Hosted에서 불필요 (Owner가 직접 관리) |

### 1.3 참조 문서

- **v0.1 원본:** [20-error-codes.md](./20-error-codes.md) (API-04)
- **v0.2 대체:** [37-rest-api-complete-spec.md](./37-rest-api-complete-spec.md) 섹션 10 (API-SPEC)

---

## 2. 에러 응답 포맷 변경

### 2.1 v0.1 RFC 9457 포맷

```json
{
  "type": "https://api.waiass.io/errors/policy-violation",
  "title": "Policy Violation",
  "status": 403,
  "detail": "Transaction amount exceeds daily limit",
  "instance": "/api/v1/transactions",
  "code": "POLICY_DAILY_LIMIT_EXCEEDED",
  "param": "amount",
  "requestId": "req_01HV8PQXYZ",
  "docUrl": "https://docs.waiass.io/errors/POLICY_DAILY_LIMIT_EXCEEDED",
  "retryable": false,
  "escalation": "LOW"
}
```

### 2.2 v0.2 간소화 포맷

```json
{
  "code": "SPENDING_LIMIT_EXCEEDED",
  "message": "잔액이 부족합니다. 현재 잔액: 500000000 lamports",
  "details": { "currentBalance": "500000000" },
  "requestId": "req_a1b2c3d4e5f678901234",
  "retryable": false
}
```

### 2.3 필드 대응

| v0.1 필드 | v0.2 필드 | 변경 |
|-----------|-----------|------|
| `type` | **제거** | URI 불필요 (localhost) |
| `title` | **제거** | `message`로 통합 |
| `status` | HTTP 상태 코드 (응답 레벨) | 동일 |
| `detail` | `message` | 명칭 변경 |
| `instance` | **제거** | 불필요 |
| `code` | `code` | **유지** |
| `param` | `details` (객체 내) | 구조 변경 |
| `requestId` | `requestId` | **유지** |
| `docUrl` | **제거** | Self-Hosted에서 불필요 |
| `retryable` | `retryable` | **유지** |
| `escalation` | **제거** | Self-Hosted에서 불필요 |

---

## 3. 도메인 변경

### 3.1 도메인 대응표

| v0.1 도메인 | v0.2 도메인 | 변경 |
|------------|------------|------|
| `auth_error` | AUTH | **유지** (대문자 변경) |
| `validation_error` | - | TX, SESSION 도메인으로 분산 |
| `policy_error` | POLICY | **유지** |
| `agent_error` | AGENT | **유지** |
| `transaction_error` | TX | 명칭 단축 |
| `funding_error` | **제거** | Owner API로 통합 |
| `emergency_error` | SYSTEM | SYSTEM으로 통합 |
| `system_error` | SYSTEM | **유지** |
| `webhook_error` | **제거** | v0.2에서 Webhook 미사용 |
| - | SESSION | **신규** (세션 관련 분리) |
| - | OWNER | **신규** (Owner 관련 분리) |

### 3.2 v0.2 7-domain 구조

| 도메인 | 코드 수 | 주요 HTTP | 설명 |
|--------|--------|-----------|------|
| AUTH | 8 | 401, 429 | 인증/토큰 검증 |
| SESSION | 4 | 401, 403, 404 | 세션 관리 |
| TX | 7 | 400, 404, 409, 410, 422, 502 | 거래 처리 |
| POLICY | 4 | 403, 429 | 정책 검증 |
| OWNER | 4 | 404, 409, 410 | Owner 연결/승인 |
| SYSTEM | 6 | 400, 409, 503 | 시스템 상태 |
| AGENT | 3 | 404, 409, 410 | 에이전트 상태 |
| **합계** | **36** | | |

---

## 4. 코드별 상세 대응표

### 4.1 AUTH 도메인 (8 -> 8)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `AUTH_KEY_INVALID` | **제거** | - | API Key 방식 미사용 |
| `AUTH_KEY_EXPIRED` | **제거** | - | API Key 방식 미사용 |
| `AUTH_KEY_REVOKED` | **제거** | - | API Key 방식 미사용 |
| `AUTH_TOKEN_EXPIRED` | `TOKEN_EXPIRED` | 명칭 단축 | JWT 만료 |
| `AUTH_TOKEN_INVALID` | `INVALID_TOKEN` | 명칭 변경 | JWT 검증 실패 |
| `AUTH_SCOPE_INSUFFICIENT` | `SESSION_LIMIT_EXCEEDED` | 통합 | 세션 제약으로 통합 |
| `AUTH_IP_BLOCKED` | **제거** | - | localhost 전용 |
| `AUTH_MFA_REQUIRED` | **제거** | - | Self-Hosted에서 미사용 |
| - | `SESSION_REVOKED` | **신규** | 세션 폐기 |
| - | `INVALID_SIGNATURE` | **신규** | Owner SIWS/SIWE 서명 |
| - | `INVALID_NONCE` | **신규** | nonce 무효/만료 |
| - | `INVALID_MASTER_PASSWORD` | **신규** | 마스터 패스워드 |
| - | `MASTER_PASSWORD_LOCKED` | **신규** | lockout |
| - | `SYSTEM_LOCKED` | **신규** | Kill Switch 상태 |

### 4.2 VALIDATION -> TX/SESSION (5 -> 분산)

| v0.1 코드 | v0.2 코드 | 도메인 | 설명 |
|-----------|-----------|--------|------|
| `VALIDATION_REQUIRED_FIELD` | **제거** | - | Zod 자동 검증 에러로 대체 |
| `VALIDATION_INVALID_FORMAT` | `INVALID_ADDRESS` | TX | 주소 형식 |
| `VALIDATION_OUT_OF_RANGE` | **제거** | - | Zod 자동 검증 |
| `VALIDATION_INVALID_ENUM` | **제거** | - | Zod 자동 검증 |
| `VALIDATION_DUPLICATE` | **제거** | - | 409 Conflict로 처리 |

### 4.3 POLICY 도메인 (10 -> 4)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `POLICY_PER_TX_LIMIT_EXCEEDED` | `SPENDING_LIMIT_EXCEEDED` | **통합** | 모든 한도 초과 통합 |
| `POLICY_DAILY_LIMIT_EXCEEDED` | `SPENDING_LIMIT_EXCEEDED` | **통합** | |
| `POLICY_WEEKLY_LIMIT_EXCEEDED` | `SPENDING_LIMIT_EXCEEDED` | **통합** | |
| `POLICY_MONTHLY_LIMIT_EXCEEDED` | `SPENDING_LIMIT_EXCEEDED` | **통합** | |
| `POLICY_DESTINATION_NOT_ALLOWED` | `WHITELIST_DENIED` | 명칭 변경 | 화이트리스트 |
| `POLICY_PROGRAM_NOT_ALLOWED` | `WHITELIST_DENIED` | **통합** | |
| `POLICY_TOKEN_NOT_ALLOWED` | `WHITELIST_DENIED` | **통합** | |
| `POLICY_OUTSIDE_OPERATING_HOURS` | `POLICY_DENIED` | **통합** | 일반 정책 거부 |
| `POLICY_BLACKOUT_DATE` | `POLICY_DENIED` | **통합** | |
| `POLICY_GLOBAL_BUDGET_EXCEEDED` | `SPENDING_LIMIT_EXCEEDED` | **통합** | |
| - | `RATE_LIMIT_EXCEEDED` | **유지** | API 속도 제한 |

### 4.4 AGENT 도메인 (6 -> 3)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `AGENT_NOT_FOUND` | `AGENT_NOT_FOUND` | **유지** | |
| `AGENT_SUSPENDED` | `AGENT_SUSPENDED` | **유지** | |
| `AGENT_TERMINATED` | `AGENT_TERMINATED` | **유지** | |
| `AGENT_CREATING` | **제거** | - | v0.2에서 동기 생성 |
| `AGENT_TERMINATING` | **제거** | - | 종료 중 상태 미사용 |
| `AGENT_KEY_ROTATION_IN_PROGRESS` | **제거** | - | 키 로테이션 동기 처리 |

### 4.5 TRANSACTION -> TX 도메인 (7 -> 7)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `TRANSACTION_NOT_FOUND` | `TX_NOT_FOUND` | 명칭 단축 | |
| `TRANSACTION_ALREADY_SUBMITTED` | `TX_ALREADY_PROCESSED` | 명칭 변경 | |
| `TRANSACTION_SIGNING_FAILED` | (체인 에러) | **삭제** | `CHAIN_ERROR`로 통합 |
| `TRANSACTION_SUBMISSION_FAILED` | `CHAIN_ERROR` | **통합** | |
| `TRANSACTION_SIMULATION_FAILED` | `SIMULATION_FAILED` | 명칭 단축 | |
| `TRANSACTION_EXPIRED` | `TX_EXPIRED` | 명칭 단축 | |
| `TRANSACTION_INSUFFICIENT_BALANCE` | `INSUFFICIENT_BALANCE` | 명칭 단축 | |
| - | `INVALID_ADDRESS` | **신규** | 주소 검증 |

### 4.6 FUNDING 도메인 (5 -> 제거/통합)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `FUNDING_INSUFFICIENT_OWNER_BALANCE` | `INSUFFICIENT_BALANCE` | TX로 통합 | |
| `FUNDING_VAULT_ADDRESS_MISMATCH` | `INVALID_ADDRESS` | TX로 통합 | |
| `FUNDING_REPLENISHMENT_LIMIT_REACHED` | **제거** | - | Self-Hosted에서 미사용 |
| `FUNDING_WITHDRAWAL_IN_PROGRESS` | **제거** | - | 동기 처리 |
| `FUNDING_WITHDRAWAL_EXCEEDS_BALANCE` | `INSUFFICIENT_BALANCE` | TX로 통합 | |

### 4.7 EMERGENCY -> SYSTEM 도메인 (3 -> 통합)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `EMERGENCY_ALREADY_SUSPENDED` | `AGENT_SUSPENDED` | AGENT로 통합 | |
| `EMERGENCY_RECOVERY_IN_PROGRESS` | **제거** | - | 동기 복구 |
| `EMERGENCY_CIRCUIT_BREAKER_ACTIVE` | `KILL_SWITCH_ACTIVE` | 명칭 변경 | |

### 4.8 SYSTEM 도메인 (7 -> 6)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `SYSTEM_INTERNAL_ERROR` | (500 에러) | 일반화 | HTTP 500 |
| `SYSTEM_KMS_UNAVAILABLE` | **제거** | - | KMS 미사용 |
| `SYSTEM_ENCLAVE_UNAVAILABLE` | **제거** | - | Enclave 미사용 |
| `SYSTEM_RPC_UNAVAILABLE` | `ADAPTER_NOT_AVAILABLE` | 명칭 변경 | |
| `SYSTEM_DATABASE_ERROR` | (500 에러) | 일반화 | HTTP 500 |
| `SYSTEM_RATE_LIMITED` | `RATE_LIMIT_EXCEEDED` | POLICY로 이동 | |
| `SYSTEM_MAINTENANCE` | `SHUTTING_DOWN` | 명칭 변경 | |
| - | `KILL_SWITCH_ACTIVE` | **신규** | |
| - | `KILL_SWITCH_NOT_ACTIVE` | **신규** | |
| - | `KEYSTORE_LOCKED` | **신규** | |
| - | `CHAIN_NOT_SUPPORTED` | **신규** | |

### 4.9 WEBHOOK 도메인 (4 -> 제거)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| `WEBHOOK_NOT_FOUND` | **제거** | - | v0.2 Webhook 미사용 |
| `WEBHOOK_URL_UNREACHABLE` | **제거** | - | |
| `WEBHOOK_SIGNATURE_INVALID` | **제거** | - | |
| `WEBHOOK_DELIVERY_FAILED` | **제거** | - | |

### 4.10 신규 OWNER 도메인 (0 -> 4)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| - | `OWNER_ALREADY_CONNECTED` | **신규** | Owner 중복 등록 |
| - | `OWNER_NOT_CONNECTED` | **신규** | Owner 미등록 |
| - | `APPROVAL_TIMEOUT` | **신규** | 승인 기한 만료 |
| - | `APPROVAL_NOT_FOUND` | **신규** | 승인 대기 거래 없음 |

### 4.11 신규 SESSION 도메인 (0 -> 4)

| v0.1 코드 | v0.2 코드 | 변경 | 설명 |
|-----------|-----------|------|------|
| - | `SESSION_NOT_FOUND` | **신규** | 세션 없음 |
| - | `SESSION_EXPIRED` | **신규** | 세션 만료 |
| - | `SESSION_LIMIT_EXCEEDED` | **신규** | 세션 제약 초과 |
| - | `CONSTRAINT_VIOLATED` | **신규** | 허용 작업/주소 제약 |

---

## 5. 제거된 코드 목록 (10개)

다음 코드는 v0.2 Self-Hosted 모델에서 해당 기능이 제거되어 더 이상 사용되지 않는다:

| v0.1 코드 | 제거 이유 |
|-----------|-----------|
| `AUTH_KEY_INVALID` | API Key 인증 미사용 (세션 토큰으로 대체) |
| `AUTH_KEY_EXPIRED` | API Key 인증 미사용 |
| `AUTH_KEY_REVOKED` | API Key 인증 미사용 |
| `AUTH_IP_BLOCKED` | localhost 전용 (IP 제한 불필요) |
| `AUTH_MFA_REQUIRED` | Self-Hosted에서 MFA 미사용 |
| `SYSTEM_KMS_UNAVAILABLE` | AWS KMS 미사용 (로컬 키스토어) |
| `SYSTEM_ENCLAVE_UNAVAILABLE` | Nitro Enclave 미사용 |
| `SQUADS_THRESHOLD_NOT_MET` | Squads 온체인 멀티시그 미사용 |
| `MULTISIG_TIMEOUT` | 온체인 멀티시그 미사용 |
| `WEBHOOK_*` (4개) | v0.2에서 Webhook 미사용 |

---

## 6. 에러 코드 마이그레이션 가이드

### 6.1 SDK/클라이언트 코드 변환

**v0.1 코드:**
```typescript
// v0.1 - RFC 9457 기반 에러 처리
if (error.code === 'POLICY_DAILY_LIMIT_EXCEEDED') {
  console.log(`일일 한도 초과. 문서: ${error.docUrl}`);
  console.log(`에스컬레이션: ${error.escalation}`);
}
```

**v0.2 코드:**
```typescript
// v0.2 - 간소화 에러 처리
if (error.code === 'SPENDING_LIMIT_EXCEEDED') {
  console.log(`한도 초과: ${error.message}`);
  console.log(`상세: ${JSON.stringify(error.details)}`);
}
```

### 6.2 에러 핸들링 변환 체크리스트

- [ ] `POLICY_*_LIMIT_EXCEEDED` 계열 -> `SPENDING_LIMIT_EXCEEDED` 통합
- [ ] `POLICY_*_NOT_ALLOWED` 계열 -> `WHITELIST_DENIED` 또는 `POLICY_DENIED`
- [ ] `TRANSACTION_*` 접두사 -> `TX_*` 로 단축
- [ ] `AUTH_KEY_*` 계열 -> 제거 (세션 토큰 에러로 대체)
- [ ] `escalation` 필드 참조 제거
- [ ] `docUrl` 필드 참조 제거
- [ ] `type`, `title`, `instance` 필드 참조 제거

### 6.3 HTTP 상태 코드 매핑 (불변)

| HTTP | 의미 | v0.1/v0.2 |
|------|------|-----------|
| 400 | Bad Request | 동일 |
| 401 | Unauthorized | 동일 |
| 403 | Forbidden | 동일 |
| 404 | Not Found | 동일 |
| 409 | Conflict | 동일 |
| 410 | Gone | 동일 |
| 422 | Unprocessable | 동일 |
| 429 | Too Many Requests | 동일 |
| 500 | Internal Error | 동일 |
| 502 | Bad Gateway | 동일 |
| 503 | Service Unavailable | 동일 |

---

## 7. 참조 문서

### 7.1 내부 문서

| 문서 | 내용 | 상태 |
|------|------|------|
| [20-error-codes.md](./20-error-codes.md) | v0.1 RFC 9457 에러 코드 (API-04) | SUPERSEDED |
| [37-rest-api-complete-spec.md](./37-rest-api-complete-spec.md) | v0.2 에러 코드 (API-SPEC 섹션 10) | **유효** |

### 7.2 외부 참조

| 참조 | 내용 |
|------|------|
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) | Problem Details for HTTP APIs (v0.1에서 사용) |

### 7.3 관련 요구사항

| 요구사항 | 설명 |
|---------|------|
| H11 | v0.1 RFC 9457 46개 에러 코드 -> v0.2 36개 에러 코드 매핑 |

---

*문서 ID: MAPPING-02*
*작성일: 2026-02-06*
*Phase: 10-v01-잔재-정리*
*상태: 완료*
