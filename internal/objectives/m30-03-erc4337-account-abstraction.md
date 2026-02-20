# 마일스톤 m30-03: ERC-4337 Account Abstraction 지원

## 목표

EVM 지갑에 ERC-4337 스마트 어카운트 옵션을 추가하여, AI 에이전트가 Paymaster를 통한 가스비 스폰서십, 네이티브 배치 트랜잭션, 모듈러 권한 체계를 활용할 수 있는 상태.

---

## 배경

### 현재 한계

WAIaaS의 EVM 지갑은 EOA(Externally Owned Account)만 지원한다. 이로 인한 제약:

| 제약 | 설명 |
|------|------|
| 가스비 필수 보유 | 에이전트가 트랜잭션을 실행하려면 반드시 ETH를 보유해야 함 |
| 배치 비원자성 | APPROVE + SWAP을 별도 트랜잭션으로 전송 → 중간 실패 시 불일치 |
| 단순 서명 체계 | secp256k1 단일 키. 세션 키, 멀티시그 등 온체인 권한 위임 불가 |
| 가스비 최적화 한계 | ERC-20 토큰으로 가스비 지불 불가 |

### 사용 시나리오

```
AI 에이전트: "USDC를 DAI로 스왑해줘" (ETH 잔고 0)

EOA (현재):
  → INSUFFICIENT_BALANCE 에러 (가스비 ETH 없음)

스마트 어카운트 (m30-03):
  1. UserOperation 생성 (APPROVE + SWAP 배치)
  2. Paymaster가 가스비 스폰서 (에이전트는 USDC에서 수수료 차감)
  3. Bundler가 UserOperation 제출 → 단일 원자적 실행
```

```
DApp 운영자: "에이전트 거래 가스비는 우리가 부담"

1. Admin Settings에서 Paymaster URL + API 키 설정
2. 에이전트 트랜잭션 → Paymaster가 가스비 전액 스폰서
3. 에이전트는 가스비 없이 운영
```

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| SmartAccountFactory | ERC-4337 스마트 어카운트 생성. 지갑 생성 시 `accountType: "smart"` 옵션으로 EOA 대신 스마트 어카운트 배포. Signer는 기존 EOA 키 재사용 (owner로 설정) |
| UserOperationBuilder | 트랜잭션 요청을 UserOperation 구조체로 변환. 배치 트랜잭션 지원 (여러 calldata를 단일 UserOp으로). gas 추정 (preVerificationGas, verificationGasLimit, callGasLimit) |
| PaymasterClient | Paymaster 서비스 연동. `pm_getPaymasterStubData` / `pm_getPaymasterData` RPC 호출. 가스 스폰서십 또는 ERC-20 토큰 결제 지원 |
| BundlerClient | Bundler 서비스 연동. `eth_sendUserOperation` / `eth_getUserOperationReceipt` RPC 호출. UserOperation 제출 + 상태 추적 |
| SmartAccountAdapter | IChainAdapter 확장 또는 EvmAdapter 내부 분기. accountType에 따라 EOA 트랜잭션 또는 UserOperation으로 분기 |

### REST API 변경

#### 지갑 생성 확장

```json
{
  "name": "my-smart-wallet",
  "chain": "ethereum",
  "environment": "testnet",
  "accountType": "smart"
}
```

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `accountType` | string (optional) | `"eoa"` | `"eoa"` (기존) 또는 `"smart"` (ERC-4337) |

#### 배치 트랜잭션 원자성

기존 BATCH 타입 트랜잭션이 스마트 어카운트에서는 단일 UserOperation으로 원자적 실행:

```json
{
  "type": "BATCH",
  "operations": [
    { "type": "APPROVE", "token": "0x...", "spender": "0x...", "amount": "..." },
    { "type": "CONTRACT_CALL", "to": "0x...", "data": "0x...", "value": "0" }
  ]
}
```

EOA: 순차 실행 (개별 트랜잭션)
Smart Account: 단일 UserOperation (원자적 실행)

### 지갑 모델 확장

| 필드 | EOA (기존) | Smart Account (신규) |
|------|-----------|---------------------|
| `accountType` | `"eoa"` | `"smart"` |
| `publicKey` | EOA 주소 | 스마트 어카운트 주소 (CREATE2 예측) |
| `signerKey` | — | EOA signer 주소 (owner) |
| `deployed` | — | boolean (실제 온체인 배포 여부) |
| `entryPoint` | — | EntryPoint 컨트랙트 주소 |

### Admin Settings

스마트 어카운트 관련 설정을 Admin Settings에서 런타임 조정 가능:

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `smart_account.enabled` | `false` | 스마트 어카운트 기능 활성화 (opt-in) |
| `smart_account.entry_point` | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | EntryPoint v0.7 주소 |
| `smart_account.factory_address` | — | SimpleAccountFactory 주소 (체인별) |
| `smart_account.bundler_url` | — | Bundler RPC URL (필수) |
| `smart_account.paymaster_url` | — | Paymaster RPC URL (선택) |
| `smart_account.paymaster_api_key` | — | Paymaster API 키 (선택, 마스킹 표시) |

Admin UI > System > Settings 페이지의 "Smart Account (ERC-4337)" 섹션에서 설정. Bundler/Paymaster URL은 보안 자격증명이므로 저장 후 마스킹 표시.

### 파일/모듈 구조

```
packages/daemon/src/
  infrastructure/
    smart-account/
      smart-account-factory.ts            # 스마트 어카운트 생성
      user-operation-builder.ts           # UserOperation 빌드
      paymaster-client.ts                 # Paymaster 연동
      bundler-client.ts                   # Bundler 연동
      index.ts

  pipeline/
    pipeline.ts                           # accountType 분기: EOA → sign+send / Smart → UserOp+Bundler

packages/adapters/evm/src/
  evm-adapter.ts                          # SmartAccountAdapter 통합 또는 분기 로직

packages/core/src/
  schemas/
    wallet.schema.ts                      # accountType, signerKey, deployed 필드 추가
  enums/
    wallet.ts                             # AccountType enum 추가

packages/admin/src/pages/
  wallets.tsx                             # 지갑 생성 폼에 accountType 선택 추가
  system.tsx                              # Smart Account 설정 섹션 추가

skills/
  wallet.skill.md                         # 스마트 어카운트 생성 가이드 추가
  quickstart.skill.md                     # Smart Account 퀵스타트 추가
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 스마트 어카운트 구현체 | SimpleAccount (ERC-4337 레퍼런스) | ZeroDev Kernel, Safe 등 대안 대비 의존성 최소. 레퍼런스 구현으로 표준 호환성 최대. 향후 ERC-7579 모듈 시스템으로 확장 가능 |
| 2 | Bundler/Paymaster 연동 | 외부 서비스(Pimlico, Stackup, Alchemy 등) URL 설정 | Self-hosted Bundler는 운영 부담 과다. 호스팅 서비스를 Admin Settings URL로 설정. 인터페이스는 ERC-4337 표준 RPC이므로 서비스 교체 용이 |
| 3 | 기존 EOA 호환 | accountType 옵션으로 공존 | EOA 지갑은 변경 없이 유지. 신규 지갑 생성 시 `accountType: "smart"` 선택. 기존 에이전트 코드 영향 없음 |
| 4 | 배포 시점 | 첫 트랜잭션 시 (lazy deployment) | CREATE2 예측 주소로 미배포 상태에서도 주소 확정. 가스비 절약 (사용 시점까지 배포 지연). 입금 수신은 미배포 상태에서도 가능 |
| 5 | ERC-7579 모듈 지원 | m30-03에서는 기본 구조만, 모듈 시스템은 향후 확장 | ERC-7579 모듈(Validator/Executor/Hook)은 복잡도 높음. 기본 스마트 어카운트(Paymaster+배치)만 먼저 구현하고, 모듈 시스템은 사용자 수요 확인 후 |
| 6 | Solana 지원 범위 | EVM 전용 | ERC-4337은 EVM 표준. Solana는 프로그램 기반 계정 모델이 이미 유사한 기능 제공 (PDA, CPI). Solana AA는 별도 검토 |
| 7 | EntryPoint 버전 | v0.7 (최신) | v0.6은 레거시. v0.7이 가스 효율성 개선 + 최신 Bundler/Paymaster 서비스 지원 |
| 8 | 설정 위치 | Admin Settings (런타임 조정) | Bundler/Paymaster URL과 API 키를 데몬 재시작 없이 변경 가능. 보안 자격증명은 마스킹 표시 |

---

## E2E 검증 시나리오

**자동화 비율: 95%+ — `[HUMAN]` 1건**

### 스마트 어카운트 생성

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | accountType: "smart" → 스마트 어카운트 생성 | POST /v1/wallets (accountType: smart) → CREATE2 주소 반환 + deployed: false assert | [L0] |
| 2 | accountType 미지정 → 기존 EOA 생성 | POST /v1/wallets → accountType: "eoa" assert | [L0] |
| 3 | 스마트 어카운트 주소 예측 정확성 | CREATE2 계산 주소 == 온체인 배포 후 주소 일치 assert | [L0] |

### UserOperation + Bundler

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | TRANSFER → UserOperation 변환 + Bundler 제출 | mock Bundler + 스마트 어카운트 지갑 → eth_sendUserOperation 호출 assert | [L0] |
| 5 | BATCH → 단일 원자적 UserOperation | APPROVE+SWAP 배치 → 단일 UserOp의 calldata에 두 작업 포함 assert | [L0] |
| 6 | UserOperation 가스 추정 | mock Bundler eth_estimateUserOperationGas → 가스 값 적용 assert | [L0] |

### Paymaster

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | Paymaster 가스 스폰서십 | mock Paymaster → UserOp.paymasterAndData 설정 + 에이전트 가스비 0 assert | [L0] |
| 8 | Paymaster 미설정 → 에이전트 직접 가스비 | paymaster_url 미설정 → UserOp.paymasterAndData 비어있음 assert | [L0] |
| 9 | Paymaster 거부 → 에러 | mock Paymaster 거부 → PAYMASTER_REJECTED 에러 assert | [L0] |

### 파이프라인 통합

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | 스마트 어카운트 + 정책 평가 | CONTRACT_WHITELIST + SPENDING_LIMIT → 정책 평가 후 UserOp 제출 assert | [L0] |
| 11 | 스마트 어카운트 + ActionProvider | Jupiter Swap → resolve() → UserOp 변환 → Bundler 제출 assert | [L0] |
| 12 | EOA 지갑은 기존 흐름 유지 | accountType: "eoa" → 기존 sign+sendTransaction 흐름 변경 없음 assert | [L0] |

### Lazy Deployment

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | 미배포 상태 주소 → 입금 수신 가능 | deployed: false 지갑에 ETH 전송 → 잔액 조회 정상 assert | [L0] |
| 14 | 첫 UserOp → initCode 포함 배포 | deployed: false → 첫 트랜잭션 시 initCode 포함 UserOp → deployed: true assert | [L0] |

### 실 네트워크 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 15 | Sepolia에서 스마트 어카운트 E2E | Sepolia Bundler + Paymaster → 스마트 어카운트 생성 + 가스 스폰서 트랜잭션 실행 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m28-m29 (DeFi 프로토콜) | DeFi가 EOA 기반으로 안정화된 후 스마트 어카운트 도입. 배치 트랜잭션(APPROVE+SWAP) 원자성이 DeFi에서 가장 큰 가치 |
| m30-00~m30-01 (운영 기능) | Audit Log, Dry-Run 등 운영 인프라가 스마트 어카운트 디버깅에 필요 |
| v1.4 (EVM 인프라) | EvmAdapter, viem 2.x 기반 위에 스마트 어카운트 레이어 추가 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Bundler/Paymaster 서비스 의존 | 외부 서비스 장애 시 스마트 어카운트 트랜잭션 불가 | Bundler URL 다중 설정(fallback). EOA 지갑은 독립적으로 동작하므로 전체 시스템 영향 없음 |
| 2 | 가스 추정 부정확 | UserOperation 가스 초과/부족 | Bundler의 eth_estimateUserOperationGas 활용 + 안전 마진(120%) 적용. 기존 가스 마진 정책과 동일 |
| 3 | EntryPoint 버전 파편화 | v0.6/v0.7 공존으로 호환성 이슈 | v0.7만 지원으로 범위 한정. v0.6 사용자는 EOA 유지 |
| 4 | 스마트 어카운트 보안 | 컨트랙트 버그로 자금 손실 가능 | 감사 완료된 레퍼런스 구현(SimpleAccount) 사용. 커스텀 로직 최소화 |
| 5 | DeFi 프로토콜 호환성 | 일부 DeFi가 스마트 어카운트 주소를 지원하지 않을 수 있음 | 호환성 이슈 발생 시 해당 프로토콜은 EOA 지갑 사용 안내 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (SmartAccountFactory+Builder 1 / Paymaster+Bundler 1 / 파이프라인 통합 1 / Admin+MCP+SDK+스킬 1) |
| 신규 파일 | 8-12개 |
| 수정 파일 | 10-15개 |
| 테스트 | 15-20개 |
| DB 마이그레이션 | 1건 (wallets 테이블 accountType, signerKey, deployed 컬럼 추가) |

---

*생성일: 2026-02-20*
*선행: m30-00~m30-01 (운영 기능 확장)*
*관련: PROJECT.md 범위 외 → 별도 마일스톤으로 승격*
