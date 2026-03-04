# 마일스톤 m30-09: Smart Account DX 개선

- **Status:** PLANNED
- **Milestone:** v30.9

## 목표

Smart Account(ERC-4337) 설정 과정을 단순화하여, 운영자가 스마트 계정 지갑 생성 시
**프로바이더 선택 + API 키 입력**만으로 번들러·페이마스터를 한 번에 구성할 수 있는 상태.
지갑별 프로바이더 설정으로 서비스 프로바이더가 특정 에이전트에게 가스비를 대납하는 시나리오도 지원한다.
에이전트가 sessionAuth로 자기 지갑의 프로바이더를 직접 등록할 수 있고, 프로바이더 상태를
조회하여 가스 대납 가능 여부를 판단할 수 있다.

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
7. **에이전트 자력 설정 불가** — 프로바이더 설정이 masterAuth 전용이라, 에이전트가 서비스
   프로바이더로부터 받은 스코프 키를 직접 등록할 수 없음
8. **프로바이더 상태 조회 불가** — 에이전트가 자기 지갑의 프로바이더 설정 여부, 지원 체인,
   가스 대납 가능 여부를 알 수 없음

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
WAIaaS 운영자 또는 에이전트 (sessionAuth)
  └─ 지갑별 프로바이더 설정 (서비스 프로바이더가 준 키)
        ↓
AI 에이전트 (Smart Account)
  └─ 프로바이더 상태 조회 → 가스 대납 가능 확인
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
- **R1-8.** REST API로 지갑별 프로바이더 설정 변경 가능 (masterAuth)
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

### R4. 에이전트 셀프 프로바이더 등록

에이전트가 sessionAuth로 자기 지갑의 프로바이더를 직접 설정할 수 있다.
시스템 전역 설정이 아닌 자기 지갑에만 영향하므로 masterAuth 불필요.

- **R4-1.** `PUT /v1/wallets/:id/provider` — sessionAuth로 자기 지갑의 프로바이더 설정
- **R4-2.** 요청 바디: `{ provider, apiKey }` 또는 `{ provider: 'custom', bundlerUrl, paymasterUrl }`
- **R4-3.** 세션에 연결된 지갑만 설정 가능 (다른 지갑 설정 시 403)
- **R4-4.** 서비스 프로바이더가 에이전트에게 스코프 키를 전달 → 에이전트가 자력 등록하는 플로우 지원

### R5. 에이전트 프로바이더 상태 조회

에이전트가 자기 지갑의 프로바이더 설정 상태를 조회하여 가스 대납 가능 여부를 판단할 수 있다.

- **R5-1.** 지갑 정보 조회 응답(`GET /v1/wallets/:id`)에 프로바이더 상태 포함
- **R5-2.** 응답 필드: `provider.name` (프로바이더명), `provider.supportedChains` (지원 체인 목록),
  `provider.paymasterEnabled` (페이마스터 활성 여부)
- **R5-3.** 프로바이더 미설정 시 `provider: null`
- **R5-4.** connect-info 프롬프트에 프로바이더 상태 포함 — 에이전트가 가스 대납 가능 여부 인지
- **R5-5.** MCP 도구에서 프로바이더 상태 조회 가능

### R6. AA 기본 활성화

- **R6-1.** `smart_account.enabled` 기본값을 `false` → `true`로 변경
- **R6-2.** 프로바이더 미설정 시 지갑 생성 400 에러 가드는 기존 유지

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
| `packages/core/src/schemas/wallet.schema.ts` | CreateWalletRequest + WalletResponse에 프로바이더 필드 추가 |
| `packages/daemon/src/mcp/tools/` | 프로바이더 상태 조회 도구 확장 |
| `packages/daemon/src/services/connect-info/` | 프롬프트에 프로바이더 상태 포함 |
| `skills/` | 프로바이더 설정/조회 관련 스킬 파일 업데이트 |
