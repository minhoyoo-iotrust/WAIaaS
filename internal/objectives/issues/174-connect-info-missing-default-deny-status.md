# Issue #174: connect-info 프롬프트에 default-deny 상태 미포함 — 에이전트 잘못된 안내

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v28.5
- **상태:** OPEN

## 현상

AI 에이전트가 `connect-info` 프롬프트를 기반으로 정책 상태를 판단하지만,
글로벌 default-deny 설정 상태가 프롬프트에 포함되지 않아 부정확한 안내를 제공한다.

### 구체적 사례

1. 에이전트가 CONTRACT_CALL을 위해 CONTRACT_WHITELIST 추가가 필요하다고 안내
2. 운영자가 Admin UI에서 Default Deny: Contract Calls가 해제된 것으로 보임 (→ #173 UI 버그)
3. 실제 백엔드는 default-deny 활성 상태이므로 에이전트 안내가 맞지만, 에이전트는 그 이유를 설명할 수 없음

## 원인

`buildConnectInfoPrompt()`가 지갑별 정책 목록만 전달하고 글로벌 default-deny 상태를 포함하지 않음:

```typescript
// connect-info.ts:82-84
const policySummary = w.policies.length > 0
  ? w.policies.map((p) => p.type).join(', ')
  : 'No restrictions';  // ← default-deny가 켜져 있어도 "제한 없음"으로 안내
```

에이전트는 `'No restrictions'`를 보고 모든 트랜잭션이 허용된다고 판단하지만,
실제로는 default-deny가 활성화되어 있어 화이트리스트 정책 없이는 거부됨.

## 영향

- 에이전트가 정책 상태를 정확히 파악하지 못함
- 운영자에게 불필요한 화이트리스트 추가를 요청하거나, 반대로 필요한 설정을 안내하지 않을 수 있음
- 에이전트가 트랜잭션 실패 원인을 진단하지 못함

## 수정 방안

### 1. connect-info 응답에 defaultDeny 상태 포함

```typescript
// connect-info.ts 응답에 추가
defaultDeny: {
  tokenTransfers: true,   // policy.default_deny_tokens
  contractCalls: true,    // policy.default_deny_contracts
  tokenApprovals: true,   // policy.default_deny_spenders
  x402Domains: true,      // policy.default_deny_x402_domains
}
```

### 2. 프롬프트에 default-deny 안내 추가

```
Security defaults:
- Token transfers: DENY unless ALLOWED_TOKENS policy exists
- Contract calls: DENY unless CONTRACT_WHITELIST policy exists
- Token approvals: DENY unless APPROVED_SPENDERS policy exists
- x402 payments: DENY unless domain whitelist policy exists
```

### 3. 정책 요약 개선

정책이 없을 때 `'No restrictions'` 대신 default-deny 상태를 반영:

```typescript
const policySummary = w.policies.length > 0
  ? w.policies.map((p) => p.type).join(', ')
  : defaultDeny.contractCalls || defaultDeny.tokenTransfers
    ? 'Default-deny active (whitelist policies required)'
    : 'No restrictions';
```

## 관련 파일

- `packages/daemon/src/api/routes/connect-info.ts` — buildConnectInfoPrompt()
- `packages/daemon/src/api/routes/openapi-schemas.ts` — ConnectInfoResponseSchema
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` — default_deny 설정 정의
- `skills/policies.skill.md` — 정책 스킬 파일도 동기 필요

## 관련 이슈

- #173: Admin UI 정책 기본값 체크박스 표시 버그 (같은 근본 원인의 파생 문제)

## 테스트 항목

- [ ] connect-info 응답에 defaultDeny 객체가 포함되는지 확인
- [ ] default-deny 설정 변경 시 connect-info 프롬프트가 즉시 반영되는지 확인
- [ ] 정책 없는 지갑에서 default-deny 활성 시 프롬프트에 해당 안내 표시 확인
- [ ] default-deny 비활성 시 기존 'No restrictions' 문구 유지 확인
- [ ] MCP 도구가 connect-info 변경 사항을 정상 전달하는지 확인
