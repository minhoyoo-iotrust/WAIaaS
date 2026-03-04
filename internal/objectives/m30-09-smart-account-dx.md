# 마일스톤 m30-09: Smart Account DX 개선

- **Status:** PLANNED
- **Milestone:** v30.9

## 목표

Smart Account(ERC-4337) 설정 과정을 단순화하여, 운영자가 스마트 계정 지갑 생성 시
**프로바이더 선택 + API 키 입력**만으로 번들러·페이마스터를 한 번에 구성할 수 있는 상태.
지갑별 프로바이더 설정으로 서비스 프로바이더가 특정 에이전트에게 가스비를 대납하는 시나리오도 지원한다.

---

## 배경

### 현재 문제점

v30.6에서 ERC-4337 Smart Account를 도입했으나 설정 DX에 다음 문제가 있다:

1. **번들러 URL 수동 입력 필요** — 프로바이더(Pimlico, Alchemy 등)의 URL 형식을 알아야 하고,
   번들러 URL과 페이마스터 URL을 각각 따로 입력해야 함
2. **AA 기능이 기본 비활성** — `smart_account.enabled` 기본값이 `false`로, 번들러 미설정 시
   이미 400 에러로 차단되므로 기본 활성화해도 안전함에도 추가 설정이 필요
3. **프로바이더별 체인 매핑 없음** — WAIaaS networkId(예: `ethereum-sepolia`)와 프로바이더
   chainId(Pimlico: `sepolia`, Alchemy: `eth-sepolia`)가 달라서 URL 자동 조합이 불가능
4. **미지원 체인 사전 차단 없음** — 프로바이더가 지원하지 않는 체인에 대해 런타임 RPC 에러로만 실패
5. **API 키 발급 안내 없음** — 어디서 키를 받아야 하는지 Admin UI에서 안내하지 않음
6. **글로벌 Paymaster만 지원** — 지갑별로 다른 프로바이더(= 다른 가스 스폰서)를 설정할 수 없어,
   서비스 프로바이더가 특정 에이전트에게만 가스비를 대납하는 시나리오 불가

### 프로바이더 번들러/페이마스터 통합 구조

주요 프로바이더(Pimlico, Alchemy, Stackup)는 번들러와 페이마스터를 **동일 엔드포인트 + 동일 API 키**로
제공한다. 따라서 프로바이더 선택 + API 키 하나만 입력하면 양쪽 URL을 자동 조합할 수 있다.

| 프로바이더 | Bundler URL | Paymaster URL | API 키 |
|-----------|-------------|---------------|--------|
| Pimlico | `https://api.pimlico.io/v2/{chainId}/rpc?apikey={KEY}` | 동일 | 동일 |
| Alchemy | `https://{chain}.g.alchemy.com/v2/{KEY}` | 동일 | 동일 |
| Custom | 사용자 직접 입력 | 사용자 직접 입력 | — |

### 가스비 대납(Paymaster Sponsorship) 구조

```
서비스 프로바이더 (DeFi 플랫폼 등)
  └─ Pimlico/Alchemy에 크레딧 충전 + 스폰서십 정책 생성
  └─ 정책 스코프 API 키 발급
        ↓
WAIaaS 운영자
  └─ 지갑별 프로바이더 설정 (서비스 프로바이더가 준 키)
        ↓
AI 에이전트 (Smart Account)
  └─ 가스비 0으로 트랜잭션 실행 (Paymaster가 대납)
```

스마트 계정은 가스비를 아예 내지 않는다. Paymaster 컨트랙트가 EntryPoint에 가스비를 대납하고,
프로바이더가 서비스 프로바이더의 크레딧에서 차감한다.

### 적용 범위

프로바이더 설정은 **EVM Smart Account(`accountType: smart`)에만 적용**된다.
EOA 지갑과 Solana 지갑은 번들러/페이마스터가 필요 없으므로 기존 동작을 그대로 유지한다.

---

## 요구사항

### R1. 지갑별 프로바이더 설정

글로벌 설정을 제거하고, 각 Smart Account 지갑이 자신의 프로바이더 설정을 직접 보유한다.

- **R1-1.** `accountType: smart` 지갑 단위로 프로바이더(`pimlico` / `alchemy` / `custom`) + API 키 설정
- **R1-2.** 프로바이더 + API 키 → 해당 지갑의 번들러 URL + 페이마스터 URL 자동 조합
- **R1-3.** `custom` 선택 시 번들러 URL + 페이마스터 URL 직접 입력
- **R1-4.** API 키는 AES-256-GCM 암호화 저장 (기존 credential 패턴)
- **R1-5.** Smart Account 지갑 생성 시 프로바이더 설정 필수 (미설정 시 400 에러)
- **R1-6.** Admin UI 지갑 생성 폼에서 `accountType: smart` 선택 시에만 프로바이더 필드 노출
- **R1-7.** Admin UI 지갑 상세 페이지에서 프로바이더 설정 변경 가능 (Smart Account만)
- **R1-8.** REST API로 지갑별 프로바이더 설정 변경 가능
- **R1-9.** 기존 글로벌 설정(`smart_account.bundler_url`, `smart_account.paymaster_url`,
  `smart_account.paymaster_api_key`, `smart_account.bundler_url.{networkId}`,
  `smart_account.paymaster_url.{networkId}`) 제거
- **R1-10.** EOA 지갑 및 Solana 지갑은 프로바이더 설정 불필요 — 기존 동작 유지

### R2. 프로바이더별 체인 매핑

- **R2-1.** WAIaaS networkId → 프로바이더별 chainId 매핑 테이블 정의
- **R2-2.** 프리셋 프로바이더 사용 시 매핑 테이블에 없는 networkId면 400 에러로 사전 차단
- **R2-3.** 에러 메시지에 프로바이더명 + 미지원 네트워크 명시

매핑 테이블 (구현 시 공식 문서에서 최신 값 확인 필요):

| WAIaaS networkId | Pimlico | Alchemy |
|------------------|---------|---------|
| `ethereum-mainnet` | `ethereum` | `eth-mainnet` |
| `ethereum-sepolia` | `sepolia` | `eth-sepolia` |
| `polygon-mainnet` | `polygon` | `polygon-mainnet` |
| `polygon-amoy` | `polygon-amoy` | `polygon-amoy` |
| `arbitrum-mainnet` | `arbitrum` | `arb-mainnet` |
| `arbitrum-sepolia` | `arbitrum-sepolia` | `arb-sepolia` |
| `optimism-mainnet` | `optimism` | `opt-mainnet` |
| `optimism-sepolia` | `optimism-sepolia` | `opt-sepolia` |
| `base-mainnet` | `base` | `base-mainnet` |
| `base-sepolia` | `base-sepolia` | `base-sepolia` |

### R3. API 키 발급 안내

- **R3-1.** 프로바이더 선택 시 해당 서비스의 API 키 발급 대시보드 링크를 Admin UI에 표시
- **R3-2.** 기존 CoinGecko API 키 안내(`system.tsx:325-326`)와 동일한 패턴
- **R3-3.** 프로바이더 변경 시 링크도 동적 전환

| 프로바이더 | 안내 링크 |
|-----------|----------|
| Pimlico | https://dashboard.pimlico.io |
| Alchemy | https://dashboard.alchemy.com |

### R4. AA 기본 활성화

- **R4-1.** `smart_account.enabled` 기본값을 `false` → `true`로 변경
- **R4-2.** 프로바이더 미설정 시 지갑 생성 400 에러 가드는 기존 유지

---

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `packages/daemon/src/infrastructure/database/schema.ts` | wallets 테이블에 프로바이더 컬럼 추가 또는 별도 테이블 |
| `packages/daemon/src/infrastructure/smart-account/smart-account-clients.ts` | `resolveBundlerUrl()` + `resolvePaymasterUrl()` — 지갑별 프로바이더 기반 URL 조합 + 체인 매핑 |
| `packages/daemon/src/api/routes/wallets.ts` | 지갑 생성/수정 시 프로바이더 설정 처리 |
| `packages/admin/src/pages/wallets.tsx` | 지갑 생성 폼 + 상세 페이지 프로바이더 설정 UI (Smart Account 조건부 표시) |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | `enabled` 기본값 변경, 글로벌 번들러/페이마스터 키 제거 |
| `packages/core/src/constants/` | 프로바이더별 chainId 매핑 테이블 |
| `packages/core/src/schemas/wallet.schema.ts` | CreateWalletRequest에 프로바이더 필드 추가 |
