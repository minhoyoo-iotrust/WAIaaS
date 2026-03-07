# #278 — D'CENT Swap Aggregator 멀티체인/크로스체인 스왑 기능이 Admin UI와 에이전트에 미노출

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-07

## 현상

D'CENT Swap Aggregator는 멀티체인(6 EVM + Solana) 및 크로스체인 스왑(`cross_swap` providerType)을 지원하지만, Admin UI와 에이전트 인터페이스에 이 사실이 제대로 표시되지 않는다.

### Admin UI 문제

1. **프로바이더 헤더**: chain 배지가 `evm`으로만 표시
2. **Registered Actions 테이블**: `get_quotes`, `dex_swap` 모두 `ethereum` 배지만 표시
3. **설명 텍스트**: "DEX swap aggregator (6 EVM chains)" — 크로스체인 스왑 미언급

### 에이전트 인터페이스 문제

에이전트가 크로스체인 스왑 가능 여부를 알 수 없다:

| 경로 | 크로스체인 노출 | 현재 문구 |
|------|:---:|------|
| **connect-info** (MCP 첫 연결) | ❌ | "multi-provider DEX swaps" |
| **MCP tool description** | ❌ | "approve and txdata BATCH pipeline" |
| **REST API action list** | ❌ | action.chain: `"ethereum"` 단일 값 |
| **스킬 파일** `actions.skill.md` | △ | `cross_swap` providerType 언급은 있으나 description은 "same-chain DEX swaps" 중심 |

결과적으로 에이전트는 크로스체인 스왑이 필요할 때 LI.FI Bridge만 고려하고, D'CENT의 `cross_swap` 기능을 활용하지 못한다.

## 원인

### 1. Admin UI `BUILTIN_PROVIDERS` 하드코딩

`packages/admin/src/pages/actions.tsx:30`:

```tsx
{ key: 'dcent_swap', ..., description: 'DEX swap aggregator (6 EVM chains)', chain: 'evm', ... }
```

### 2. `ActionDefinitionSchema.chain`이 단일 값만 허용

`packages/core/src/interfaces/action-provider.types.ts:51`:

```ts
chain: ChainTypeEnum,  // 단일 값
```

`metadata.chains`는 `['ethereum', 'solana']`로 올바르지만, 개별 action은 `chain: 'ethereum'` 단일 값.

### 3. 크로스체인 스왑 코드는 동작하지만 숨겨져 있음

코드에서 `cross_swap`을 처리하고 있다:

- `schemas.ts:36` — `providerType: z.enum(['swap', 'cross_swap'])`
- `dex-swap.ts:107` — `p.providerType === 'swap' || p.providerType === 'cross_swap'`

이슈 #267에서 Exchange(교환소 크로스체인)를 제거했지만, DEX 기반 크로스체인 스왑(`cross_swap`)은 여전히 지원 중이다. 하지만 이 사실이 사용자/에이전트 인터페이스 어디에도 명시되지 않는다.

### 4. connect-info에 크로스체인 미언급

`packages/daemon/src/api/routes/connect-info.ts:160`:

```ts
lines.push("D'CENT Swap Aggregator: Use action_dcent_swap_* tools for multi-provider DEX swaps.");
```

"DEX swaps"만 언급하고 cross-chain 기능 미노출.

## 수정 방향

### 1. Admin UI 수정

- `BUILTIN_PROVIDERS`의 `dcent_swap`: `chain: 'multi'`, description에 크로스체인 언급
- Registered Actions 테이블에서 provider의 `metadata.chains` 참조하여 멀티 배지 표시

### 2. connect-info 수정

```ts
lines.push("D'CENT Swap Aggregator: Use action_dcent_swap_* tools for multi-chain DEX swaps including cross-chain swaps.");
```

### 3. MCP tool description 개선

action description에 크로스체인 지원 명시:

```ts
description: "Get swap quotes from D'CENT Swap Aggregator with provider comparison — supports same-chain and cross-chain swaps (informational)"
description: "Execute DEX swap via D'CENT Swap Aggregator — supports same-chain and cross-chain swaps with approve and txdata BATCH pipeline"
```

### 4. 스킬 파일 갱신

`actions.skill.md` 섹션 13의 description을 크로스체인 스왑 지원 중심으로 갱신.

## 영향 범위

- `packages/admin/src/pages/actions.tsx` — `BUILTIN_PROVIDERS` 배열(chain, description)
- `packages/daemon/src/api/routes/connect-info.ts` — 기능 설명 문구
- `packages/actions/src/providers/dcent-swap/index.ts` — action description, metadata.description
- `packages/mcp/src/tools/action-provider.ts` — MCP tool description (action description에서 자동 반영)
- `skills/actions.skill.md` — 섹션 13 description 갱신

## 테스트 항목

- [ ] Admin UI Actions 페이지에서 D'CENT Swap 프로바이더 헤더에 `multi` 배지가 표시되는지 확인
- [ ] Registered Actions 테이블에서 멀티체인 정보가 올바르게 표시되는지 확인
- [ ] 프로바이더 description에 크로스체인 스왑 지원이 명시되는지 확인
- [ ] connect-info 응답에서 크로스체인 스왑 기능이 언급되는지 확인
- [ ] MCP tool description에 크로스체인 지원이 포함되는지 확인
- [ ] 기존 단일 체인 프로바이더(Jupiter, 0x 등)의 표시가 영향받지 않는지 확인
- [ ] `cross_swap` providerType quote가 정상적으로 반환/표시되는지 확인
