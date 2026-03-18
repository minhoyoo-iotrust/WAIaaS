# 마일스톤 m32-10: ERC-20 Token Approval 관리 (Allowance 조회 + Revoke)

- **Status:** PLANNED
- **Milestone:** v32.10

## 목표

EVM 지갑의 ERC-20 토큰 Approval(allowance) 상태를 조회하고, 불필요하거나 위험한 승인을 Revoke할 수 있는 기능을 전 레이어에 추가한다. WAIaaS를 통한 approve뿐 아니라 외부에서 직접 수행한 approve까지 포함하여, 지갑의 전체 approve 현황을 파악할 수 있다. Admin UI에서는 지갑 상세 Assets 탭에서 토큰별 승인 현황을 확인하고 즉시 Revoke할 수 있다.

---

## 배경

### 현재 문제

1. **Allowance 조회 불가**: ERC-20 ABI에 `allowance` 함수가 정의되어 있고(`evm/src/abi/erc20.ts`), `buildApprove()`로 approve 트랜잭션을 생성할 수 있지만, 현재 승인 상태를 조회하는 메서드가 어디에도 없다.
2. **불필요한 approve 트랜잭션**: DCent Swap, 0x Swap 등 DeFi 액션이 매번 approve를 포함하여 BATCH를 구성하지만, 이미 충분한 allowance가 있어도 중복 approve가 발생한다 (가스비 낭비).
3. **보안 리스크 불가시**: 무제한 approve(`type(uint256).max`)가 어떤 컨트랙트에 설정되어 있는지 확인할 방법이 없다. DeFi 프로토콜 해킹 시 무제한 approve된 지갑이 자금 탈취 대상이 된다.
4. **외부 approve 미감지**: WAIaaS 외부에서(예: 브라우저 지갑으로 직접) approve한 건은 WAIaaS DB에 기록이 없어 완전히 사각지대다.
5. **에이전트 DX 부재**: AI 에이전트가 스왑 전 allowance를 확인하거나, 보안 감사 목적으로 승인 목록을 조회할 수 없다.

### Allowance 조회의 기술적 제약

ERC-20 `allowance(owner, spender)`는 특정 (owner, spender) 쌍을 명시해야만 호출할 수 있다. **"이 owner가 approve한 모든 spender 목록"을 반환하는 온체인 함수는 존재하지 않는다.** 따라서 approve 대상을 발견하려면 다음 3가지 소스를 조합해야 한다:

| 소스 | 감지 범위 | 장점 | 단점 |
|------|----------|------|------|
| **WAIaaS 트랜잭션 DB** | WAIaaS를 통해 실행된 APPROVE 트랜잭션 | 즉시 조회, 추가 비용 없음 | 외부 approve 미감지 |
| **온체인 이벤트 로그 스캔** | 해당 주소의 모든 `Approval(owner, spender, value)` 이벤트 | 외부 approve 포함 전수 조사 | RPC 비용, 스캔 시간 |
| **Known Spenders 목록** | ContractNameRegistry + DeFi 프로바이더 spender 주소 | 빠른 프로빙 | 미등록 spender 누락 |

### 활용 시나리오

| 시나리오 | 설명 |
|----------|------|
| **스왑 전 확인** | 에이전트가 DCent/0x 스왑 전 기존 allowance 확인 → 충분하면 approve 생략 |
| **보안 감사** | Owner가 지갑의 전체 approve 현황 조회 → 무제한 approve 탐지 → 즉시 Revoke |
| **외부 approve 감지** | WAIaaS 외부에서 수행된 approve도 이벤트 로그 스캔으로 발견 |
| **정기 정리** | 더 이상 사용하지 않는 DeFi 프로토콜에 대한 approve를 일괄 Revoke |
| **위험 알림** | 해킹된 컨트랙트에 approve가 있는 경우 즉시 감지 및 Revoke |

---

## 변경 범위

### 1. Approval Discovery 전략 (3-소스 조합)

Approve 대상(token + spender 쌍)을 발견하는 3-tier 전략:

**Tier 1 — WAIaaS 트랜잭션 DB (즉시)**:
- `transactions` 테이블에서 해당 지갑의 `type = 'APPROVE'` 트랜잭션 추출
- (tokenAddress, spenderAddress) 쌍 수집
- 비용: 0, 지연: 즉시

**Tier 2 — Known Spenders 프로빙 (빠름)**:
- ContractNameRegistry의 well-known 엔트리에서 spender 주소 추출
- DeFi 프로바이더별 알려진 spender 주소 (LiFi Diamond, 0x AllowanceHolder, Uniswap Router, Aave Pool 등)
- 각 (토큰, spender) 쌍에 대해 `allowance()` multicall 조회
- 비용: RPC 1~2회 (multicall), 지연: ~1초

**Tier 3 — 온체인 Approval 이벤트 로그 스캔 (포괄적)**:
- `eth_getLogs`로 `Approval(owner, spender, value)` 이벤트 필터 (topic0 = `keccak256("Approval(address,address,uint256)")`, topic1 = owner)
- 모든 ERC-20 컨트랙트의 Approval 이벤트를 한 번에 스캔 (토큰 주소 무관)
- 외부에서 직접 approve한 건도 감지
- 발견된 (token, spender) 쌍에 대해 현재 `allowance()` 값을 multicall로 확인
- 비용: RPC 블록 범위에 따라 변동, 지연: 수초~수십초
- 블록 범위: 최근 N 블록 또는 지갑 생성 블록부터 전체 (설정 가능)

**조합 전략**:
- 기본 조회(`GET /approvals`): Tier 1 + Tier 2 (빠른 응답)
- 전체 스캔(`GET /approvals?scan=full`): Tier 1 + Tier 2 + Tier 3 (포괄적, 느림)
- Admin UI: 기본 조회 표시 + "Scan All Approvals" 버튼으로 Tier 3 트리거

### 2. IChainAdapter 확장 (`@waiaas/core`)

```typescript
interface TokenApproval {
  tokenAddress: string;       // ERC-20 컨트랙트 주소
  tokenSymbol?: string;       // 토큰 심볼
  tokenDecimals?: number;     // 토큰 소수점
  spender: string;            // 승인된 spender 주소
  spenderName?: string;       // ContractNameRegistry에서 해석
  allowance: string;          // 승인 금액 (smallest unit)
  isUnlimited: boolean;       // type(uint256).max 여부
  source: 'db' | 'known' | 'event_log';  // 발견 소스
}

interface IChainAdapter {
  // 기존 메서드...

  /** 특정 토큰의 특정 spender에 대한 allowance 조회 */
  getTokenAllowance(
    walletAddress: string,
    tokenAddress: string,
    spenderAddress: string,
  ): Promise<string>;

  /** 알려진 spender 목록에 대한 allowance 배치 조회 (Tier 2) */
  getTokenApprovals(
    walletAddress: string,
    tokenAddresses: string[],
    knownSpenders: string[],
  ): Promise<TokenApproval[]>;

  /** Approval 이벤트 로그 스캔으로 전체 approve 이력 발견 (Tier 3) */
  scanApprovalEvents(
    walletAddress: string,
    fromBlock?: bigint,
  ): Promise<TokenApproval[]>;
}
```

### 3. EvmAdapter 구현

- `getTokenAllowance()`: 단일 ERC-20 `allowance(owner, spender)` 호출
- `getTokenApprovals()`: multicall로 배치 조회 (N 토큰 × M spender 조합)
- `scanApprovalEvents()`: `eth_getLogs` 필터로 `Approval` 이벤트 스캔 → 발견된 (token, spender) 쌍의 현재 allowance를 multicall로 확인 → `allowance > 0`인 것만 반환
- **무제한 판정**: `allowance >= type(uint256).max / 2` → `isUnlimited: true`
- **ContractNameRegistry 연동**: spender 주소를 well-known 이름으로 해석

### 4. Known Spenders Registry

DeFi 프로바이더별 알려진 spender 주소를 체인별로 관리:

```typescript
// core/src/constants/known-spenders.ts
export const KNOWN_SPENDERS: Record<string, Array<{ address: string; name: string }>> = {
  'eip155:1': [
    { address: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', name: 'LiFi Diamond' },
    { address: '0x0000000000001fF3684f28c67538d4D072C22734', name: '0x AllowanceHolder' },
    { address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', name: 'Aave V3 Pool' },
    // ...
  ],
  'eip155:137': [ /* ... */ ],
  'eip155:42161': [ /* ... */ ],
};
```

기존 ContractNameRegistry의 well-known 엔트리와 병합하여 사용.

### 5. REST API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/v1/wallet/:walletId/approvals` | 지갑의 토큰 승인 목록 조회 (Tier 1+2) |
| `GET` | `/v1/wallet/:walletId/approvals?scan=full` | 이벤트 로그 포함 전체 스캔 (Tier 1+2+3) |
| `GET` | `/v1/wallet/:walletId/approvals/:tokenAddress` | 특정 토큰의 spender별 allowance 조회 |
| `POST` | `/v1/wallet/:walletId/approvals/revoke` | 특정 토큰+spender의 approve를 0으로 설정 |

**GET /v1/wallet/:walletId/approvals 쿼리 파라미터**:
- `network` (필수): EVM 네트워크 ID
- `scan`: `quick` (기본, Tier 1+2) / `full` (Tier 1+2+3)
- `tokenAddress`: 특정 토큰 필터
- `unlimitedOnly`: `true`이면 무제한 approve만 반환

**GET /v1/wallet/:walletId/approvals 응답**:
```json
{
  "approvals": [
    {
      "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "tokenSymbol": "USDC",
      "tokenDecimals": 6,
      "spender": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
      "spenderName": "LiFi Diamond",
      "allowance": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      "isUnlimited": true,
      "source": "event_log"
    }
  ],
  "network": "ethereum-mainnet",
  "scanMode": "quick"
}
```

**POST /v1/wallet/:walletId/approvals/revoke 요청**:
```json
{
  "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "spenderAddress": "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE",
  "network": "ethereum-mainnet"
}
```

Revoke는 내부적으로 `approve(spender, 0)` 트랜잭션을 파이프라인을 통해 실행.

### 6. MCP 도구

| 도구 | 설명 |
|------|------|
| `list_token_approvals` | 지갑의 토큰 승인 목록 조회 (scan 옵션 포함) |
| `revoke_token_approval` | 특정 토큰+spender approve Revoke |

### 7. SDK 메서드

```typescript
// @waiaas/sdk
listTokenApprovals(walletId: string, options?: {
  network: string;
  scan?: 'quick' | 'full';
  tokenAddress?: string;
  unlimitedOnly?: boolean;
}): Promise<TokenApproval[]>

revokeTokenApproval(walletId: string, params: {
  tokenAddress: string;
  spenderAddress: string;
  network: string;
}): Promise<TransactionResult>
```

### 8. Admin UI — 지갑 상세 Assets 탭

현재 Assets 탭에 Token Balances가 표시됨. **Token Approvals 서브섹션 추가**:

```
Assets 탭
  ├── Token Balances (기존)
  │     SOL      12.5
  │     USDC     1,250.00
  │
  └── Token Approvals (신규)
        ┌─────────┬──────────────────────┬───────────┬────────┬──────────┐
        │ Token   │ Spender              │ Allowance │ Source │ Action   │
        ├─────────┼──────────────────────┼───────────┼────────┼──────────┤
        │ USDC    │ LiFi Diamond (0x12…) │ Unlimited │ event  │ [Revoke] │
        │ USDC    │ 0x AllowanceHolder   │ 1,000     │ db     │ [Revoke] │
        │ WETH    │ Uniswap Router (0x…) │ 500       │ known  │ [Revoke] │
        └─────────┴──────────────────────┴───────────┴────────┴──────────┘
        [Scan All Approvals]  [Revoke All]
```

- **Unlimited 배지**: `isUnlimited: true`인 경우 빨간 배지로 강조 (보안 경고)
- **Spender 이름**: ContractNameRegistry에서 해석된 이름 표시, 없으면 축약 주소
- **Source 표시**: `db` / `known` / `event` — 발견 소스 식별
- **Scan All Approvals 버튼**: Tier 3 이벤트 로그 스캔 트리거 (로딩 표시, 느릴 수 있음 안내)
- **Revoke 확인 모달**: Revoke 클릭 시 "이 승인을 취소하시겠습니까?" 확인 (가스비 발생 안내)
- **Revoke All 버튼**: 전체 일괄 Revoke (BATCH 트랜잭션)
- **네트워크 필터**: EVM 네트워크별 필터 (Ethereum, Polygon, Arbitrum 등)
- **빈 상태**: 승인이 없으면 "No token approvals found" 표시
- **EVM 전용**: Solana 지갑 선택 시 이 섹션 숨김

### 9. Skill 파일 업데이트

`skills/wallet.skill.md`, `skills/admin.skill.md`에 approval 관련 엔드포인트 추가.

---

## 비목표 (Non-Goals)

- Solana SPL 토큰의 delegate 조회 (EVM ERC-20 전용, Solana는 delegate 모델이 다르므로 별도 마일스톤)
- ERC-721/1155 NFT approval 관리 (NFT approval은 별도 마일스톤)
- 자동 Revoke (보안 이벤트 기반 자동 Revoke는 향후 정책 엔진 연동)
- approve 금액 최적화 (무제한 대신 필요 금액만 approve하도록 DeFi 액션 수정)
- Approval 이력 영구 캐시 (스캔 결과를 DB에 저장하여 재사용 — 향후 최적화)

---

## 성공 기준

1. `getTokenAllowance()`로 단일 토큰+spender allowance 조회 가능
2. `getTokenApprovals()`로 Known Spenders에 대한 allowance 배치 조회 가능 (multicall)
3. `scanApprovalEvents()`로 온체인 Approval 이벤트 로그 스캔하여 외부 approve 포함 전수 조사 가능
4. 3-tier 조합 전략: quick(Tier 1+2)은 즉시 응답, full(Tier 1+2+3)은 외부 approve 포함 포괄 조회
5. REST API `GET /v1/wallet/:id/approvals`로 조회 가능 (scan=quick/full)
6. REST API `POST /v1/wallet/:id/approvals/revoke`로 Revoke 가능 (approve(spender, 0) 파이프라인)
7. MCP `list_token_approvals`, `revoke_token_approval` 도구 동작
8. SDK `listTokenApprovals()`, `revokeTokenApproval()` 메서드 동작
9. Admin UI Assets 탭에서 Token Approvals 목록 표시 (기본 quick, Scan All로 full)
10. Admin UI에서 Revoke 버튼으로 개별/일괄 Revoke 가능
11. 무제한 approve(`isUnlimited: true`)가 빨간 배지로 표시
12. Spender 주소가 ContractNameRegistry + Known Spenders에서 해석되어 이름으로 표시
13. 발견 소스(`source: db/known/event_log`)가 각 approval 항목에 표시
14. 스킬 파일이 새 엔드포인트와 동기화
