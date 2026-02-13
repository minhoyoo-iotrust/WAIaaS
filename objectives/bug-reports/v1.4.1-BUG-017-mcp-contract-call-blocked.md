# BUG-017: MCP에서 CONTRACT_CALL/APPROVE/BATCH 타입 차단 — 보안 근거 부재

## 심각도

**MEDIUM** — MCP 사용자가 컨트랙트 호출, 토큰 승인, 배치 트랜잭션을 사용할 수 없음. REST API/SDK로는 가능하므로 기능 자체는 존재하나, MCP 에이전트의 DX가 불필요하게 제한됨.

## 증상

MCP `send_token` 도구에서 `type: 'CONTRACT_CALL'`, `type: 'APPROVE'`, `type: 'BATCH'`를 지원하지 않음. TRANSFER와 TOKEN_TRANSFER만 허용.

```typescript
// packages/mcp/src/tools/send-token.ts
/**
 * Supports TRANSFER (native) and TOKEN_TRANSFER (SPL/ERC-20) types.
 * CONTRACT_CALL, APPROVE, and BATCH are deliberately NOT exposed via MCP
 * for security (MCPSDK-04).
 */
```

MCP 에이전트가 컨트랙트를 호출하려면 MCP 대신 REST API를 직접 호출해야 하며, 이는 MCP의 목적(에이전트 네이티브 연동)에 반한다.

## 원인

### 잘못된 보안 전제

MCPSDK-04 설계 결정은 "MCP는 AI 에이전트가 직접 호출하므로 프롬프트 인젝션으로 악의적 컨트랙트 호출이 가능하다"는 전제에 기반한다.

그러나 실제로는:

```
MCP 경로:   사용자 프롬프트 → AI 에이전트 → MCP 도구 → 데몬 → 정책 엔진
SDK 경로:   사용자 프롬프트 → AI 에이전트 → SDK → 데몬 → 정책 엔진
API 경로:   사용자 프롬프트 → AI 에이전트 → REST API → 데몬 → 정책 엔진
```

**세 경로 모두 AI 에이전트가 판단하고 호출**하는 구조이므로, 프롬프트 인젝션 공격 표면은 동일하다. MCP만 차단하는 것은 보안 효과 없이 DX만 저하시킨다.

### 실제 보안은 정책 엔진에 존재

| 정책 | 역할 | 적용 범위 |
|------|------|----------|
| CONTRACT_WHITELIST | 화이트리스트된 컨트랙트만 호출 허용 | MCP/SDK/API 동일 |
| METHOD_WHITELIST | 허용된 메서드 시그니처만 실행 | MCP/SDK/API 동일 |
| APPROVED_SPENDERS | Approve 대상 주소 제한 | MCP/SDK/API 동일 |
| APPROVE_AMOUNT_LIMIT | Approve 금액 제한 | MCP/SDK/API 동일 |
| 기본 거부 원칙 | 위 정책 미설정 시 컨트랙트 호출 자체가 거부 | MCP/SDK/API 동일 |

정책 엔진은 호출 경로(MCP/SDK/API)와 무관하게 **파이프라인 Stage 3에서 동일하게 적용**된다. CONTRACT_WHITELIST 미설정 시 모든 컨트랙트 호출은 기본 거부된다.

## 수정안

### 1. MCP send_token 도구에 3개 타입 추가

`packages/mcp/src/tools/send-token.ts`:

- `type` 파라미터에 `CONTRACT_CALL`, `APPROVE`, `BATCH` 추가
- 각 타입에 필요한 파라미터 추가:
  - CONTRACT_CALL: `calldata`, `abi`, `value`, `programId`, `instructionData`, `accounts`
  - APPROVE: `spender`, `tokenMint`, `amount`
  - BATCH: `operations` 배열

### 2. 또는 별도 MCP 도구 분리

복잡도가 높아지면 도구를 분리하는 방안:

| 도구 | 타입 |
|------|------|
| `send_token` (기존) | TRANSFER, TOKEN_TRANSFER |
| `call_contract` (신규) | CONTRACT_CALL |
| `approve_token` (신규) | APPROVE |
| `send_batch` (신규) | BATCH |

### 3. MCPSDK-04 설계 결정 철회

설계 문서 38(sdk-mcp)에서 MCPSDK-04 결정을 폐기하고, MCP와 SDK/API 간 기능 동등성(feature parity) 원칙으로 대체.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/mcp/src/tools/send-token.ts` (도구 정의 + 파라미터 확장) |
| 선택 수정 | 도구 분리 시 `call-contract.ts`, `approve-token.ts`, `send-batch.ts` 신규 |
| 설계 문서 | 문서 38(sdk-mcp) MCPSDK-04 결정 폐기 |
| 테스트 | MCP 도구 테스트에 CONTRACT_CALL/APPROVE/BATCH 시나리오 추가 |
| 스킬 파일 | `transactions.skill.md`에 MCP 컨트랙트 호출 예시 포함 |

---

*발견일: 2026-02-13*
*마일스톤: v1.4.1*
*상태: RESOLVED*
*관련: 설계 문서 38(sdk-mcp), MCPSDK-04 결정*

*해결: 2026-02-14*
*해결 방법: Phase 103에서 call_contract, approve_token, send_batch 3개 MCP 도구 추가. MCPSDK-04 결정 철회. 설계 문서 38 feature parity 원칙으로 대체.*
