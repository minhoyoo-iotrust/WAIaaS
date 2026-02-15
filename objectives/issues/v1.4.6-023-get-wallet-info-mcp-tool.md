# 023: 월렛 상세 정보 조회 CLI 명령어 + SDK 메서드 미구현 (MCP 도구 구현 완료)

## 심각도

**MEDIUM** — MCP `get_wallet_info` 도구는 v1.4.6에서 구현 완료되었으나, CLI 명령어(`waiaas wallet info`)와 SDK 메서드(`getWalletInfo()`)가 누락되어 MCP 외 인터페이스에서 월렛 상세 정보를 조회할 수 없다.

## 증상

- MCP 에이전트가 "내 월렛 정보 알려줘"라고 요청받으면 주소만 반환 가능
- 어떤 체인인지, 어떤 네트워크를 사용할 수 있는지, 기본 네트워크가 무엇인지 알 수 없음
- "Polygon에서 보낼 수 있어?" 같은 질문에 답할 수 없음

## 현재 상태

MCP `get_wallet_info` 도구는 v1.4.6에서 구현 완료. `/v1/wallet/address` + `/v1/wallets/:id/networks` 조합으로 동작.

## 수정안 (CLI + SDK만 추가)

### CLI 명령어 추가

```bash
waiaas wallet info
```

```
Wallet: my-evm-wallet
  Chain:            ethereum
  Environment:      testnet
  Address:          0xAbC...789
  Default Network:  ethereum-sepolia
  Available:        ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia
  Status:           ACTIVE
```

### SDK 메서드 추가

```typescript
// TypeScript SDK
const info = await client.getWalletInfo();

// Python SDK
info = client.get_wallet_info()
```

## 테스트

### T-1: CLI wallet info 명령어

`waiaas wallet info` 실행 시 chain, environment, defaultNetwork, availableNetworks가 포맷팅되어 표시되는지 검증.

### T-2: SDK getWalletInfo 메서드

TypeScript/Python SDK의 `getWalletInfo()` 호출 시 올바른 응답 객체가 반환되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | CLI 명령어 (`packages/cli`), TypeScript SDK (`packages/sdk`), Python SDK (`python-sdk`) |
| 신규 API | 없음 — 기존 월렛 조회 API 재사용 |
| 테스트 | CLI + SDK 테스트 2건 추가 |
| 하위호환 | 신규 명령어/메서드 추가, 기존 동작 변경 없음 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.8*
*상태: OPEN (MCP 도구 구현 완료, CLI/SDK 미구현)*
*유형: MISSING*
*관련: 멀티체인 월렛 모델 (v1.4.5/v1.4.6), 이슈 022 (set_default_network)*
