# #217 기본 네트워크 제거 잔재 — Lido 팩토리 에러 + OpenAPI/코멘트 불일치 (v29.3 사이드 이펙트)

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.6
- **상태:** OPEN

## 증상

### 1차 증상 (HIGH — 런타임 에러)

데몬 시작 시 Lido 스테이킹 프로바이더 등록 실패:

```
Built-in provider 'lido_staking' registration failed:
WAIaaSError: Unknown setting key: rpc.evm_default_network
```

### 2차 증상 (MEDIUM — 문서 불일치)

OpenAPI 스키마 설명에 "wallet defaults", "session default wallet" 등 제거된 개념이 남아있어 API 소비자에게 혼동 유발.

## 원인

v29.3(#207)에서 기본 네트워크 개념을 완전 제거하고 `rpc.evm_default_network` 설정 키를 삭제했으나, 일부 사용처가 누락됨.

## 영향 범위

### 런타임 에러 (HIGH)

| 파일 | 라인 | 내용 |
|------|------|------|
| `packages/actions/src/index.ts` | 158-160 | Lido 팩토리가 `settingsReader.get('rpc.evm_default_network')` 호출 — 미등록 키로 throw |

### OpenAPI 설명 불일치 (MEDIUM)

| 파일 | 라인 | 현재 텍스트 | 문제 |
|------|------|-----------|------|
| `packages/daemon/src/api/routes/openapi-schemas.ts` | 937 | `'Network (optional -- resolved from wallet defaults)'` | "wallet defaults" 개념 제거됨 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | 940 | `'Target wallet ID (optional -- defaults to session default wallet)'` | "session default wallet" 개념 제거됨 |
| `packages/daemon/src/api/routes/x402.ts` | 132 | `'Target wallet ID (optional -- defaults to session default wallet)'` | 동일 |
| `packages/daemon/src/api/routes/actions.ts` | 112 | `'Target wallet ID (optional -- defaults to session default wallet)'` | 동일 |

### 코드 주석/테스트 설명 잔재 (LOW)

| 파일 | 라인 | 내용 |
|------|------|------|
| `packages/daemon/src/api/routes/wc.ts` | 332 | 주석에 `defaultWalletId` 참조 |
| `packages/daemon/src/__tests__/wallet-id-selection.test.ts` | 6, 10 | 테스트 설명에 "default wallet" 참조 |
| `packages/daemon/src/__tests__/session-lifecycle-e2e.test.ts` | 876, 996 | 테스트 설명에 "non-default wallet", "default wallet" 참조 |

## 수정 방안

### 1. Lido 팩토리 (HIGH)

Lido는 Ethereum 전용이므로 `rpc.evm_default_network` 참조를 제거하고 하드코딩:

```typescript
// Before
const evmNetwork = settingsReader.get('rpc.evm_default_network') || 'ethereum-mainnet';
const isTestnet = deriveEnvironment(evmNetwork as NetworkType) === 'testnet';

// After
const evmNetwork: NetworkType = 'ethereum-mainnet';
const isTestnet = deriveEnvironment(evmNetwork) === 'testnet';
```

### 2. OpenAPI 설명 (MEDIUM)

```
// network 필드
'Network (optional -- resolved from wallet defaults)'
→ 'Network (optional -- auto-resolved for single-network chains, required for multi-network chains)'

// walletId 필드
'Target wallet ID (optional -- defaults to session default wallet)'
→ 'Target wallet ID (optional -- auto-resolved if session has single wallet)'
```

### 3. 코드 주석/테스트 설명 (LOW)

"default wallet" → "auto-resolved wallet" 등으로 변경.

## 테스트 항목

- [ ] `rpc.evm_default_network` 참조 완전 제거 확인 (`grep -r 'evm_default_network' packages/`)
- [ ] 데몬 시작 시 Lido 프로바이더 등록 성공 확인
- [ ] 기존 Lido 스테이킹 테스트 통과 확인
- [ ] OpenAPI 스키마에서 "default wallet"/"wallet defaults" 참조 제거 확인
- [ ] `validate-openapi` 테스트 통과 확인
