# #247 범용 EIP-712 signTypedData API 지원

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** OPEN
- **마일스톤:** —

## 배경

현재 SIGN 타입 트랜잭션은 raw 메시지 서명(`personal_sign`)만 지원한다.
EIP-712 구조화 데이터 서명(`signTypedData`)은 x402(EIP-3009)와 ERC-8004(setAgentWallet)에서
내부적으로 하드코딩하여 사용하고 있으나, 에이전트가 임의의 DApp EIP-712 서명 요청
(Permit, 주문 서명 등)을 처리할 수 있는 범용 API는 없다.

viem의 `signTypedData`는 이미 사용 중이므로 범용으로 노출만 하면 된다.

## 변경 사항

### 1. SIGN 스키마 확장

SIGN 타입 요청에 `signType` 필드를 추가하여 `personal`(기존)과 `typedData`(신규)를 분기한다.

```typescript
// personal (기존 동작, 기본값)
{ type: 'SIGN', signType: 'personal', message: '0x...' }

// typedData (신규)
{ type: 'SIGN', signType: 'typedData', typedData: {
  domain: { name: 'MyDApp', version: '1', chainId: 1, verifyingContract: '0x...' },
  types: { ... },
  primaryType: 'Order',
  message: { ... }
}}
```

- `signType` 기본값 `'personal'` — 기존 동작 하위 호환 유지
- `typedData` 필드는 EIP-712 표준 구조 (domain, types, primaryType, message)

### 2. 파이프라인 sign stage 분기

sign stage에서 `signType`에 따라 분기:
- `personal` → `account.signMessage()` (기존)
- `typedData` → `account.signTypedData()` (신규)

### 3. 인터페이스 동기화

- REST API: SIGN 요청 바디에 `signType` + `typedData` 필드 수용
- MCP: `sign_message` 도구에 `signType` + `typedData` 파라미터 추가
- 스킬 파일: transactions.skill.md 업데이트

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `packages/core/src/schemas/transaction.schema.ts` | SIGN discriminant에 `signType`, `typedData` 필드 추가 |
| `packages/daemon/src/pipeline/stages.ts` | sign stage에서 `signType` 분기 |
| `packages/daemon/src/api/routes/transactions.ts` | 요청 바디 스키마 반영 |
| `packages/daemon/src/mcp/tools/` | sign 도구 파라미터 확장 |
| `skills/transactions.skill.md` | SIGN 타입 사용법 업데이트 |

## 테스트 항목

- [ ] `signType: 'personal'` (기존 동작) 하위 호환 확인
- [ ] `signType` 미지정 시 기본값 `personal` 적용 확인
- [ ] `signType: 'typedData'` + 유효한 EIP-712 데이터 → 서명 성공 확인
- [ ] `signType: 'typedData'` + `typedData` 필드 누락 시 400 에러 확인
- [ ] EVM/Smart Account 양쪽에서 `signTypedData` 동작 확인
- [ ] Solana 지갑에서 `signType: 'typedData'` 요청 시 400 에러 확인 (EVM 전용)
