# 021: 멀티체인 전체 네트워크 잔액 일괄 조회 미지원

## 심각도

**LOW** — 개별 네트워크 잔액 조회는 가능하나, 전체 네트워크를 한 번에 조회하는 방법이 없어 MCP 에이전트가 N번 호출해야 한다.

## 증상

- EVM testnet 월렛이 5개 네트워크를 지원하지만, 전체 잔액을 보려면 `get_balance`를 5번 호출해야 함
- AI 에이전트가 "잔액 확인해줘"라고 요청받으면 기본 네트워크 잔액만 반환하거나, 5번 연속 호출 필요
- `get_assets`도 동일한 문제

## 현재 동작

```
GET /v1/wallet/balance                        → 기본 네트워크 잔액만 반환
GET /v1/wallet/balance?network=polygon-amoy   → 특정 네트워크 잔액 반환
GET /v1/wallet/balance?network=all            → 지원하지 않음
```

## 수정안: `network=all` 명시적 파라미터 추가

`network` 파라미터에 `all` 값을 추가하여, 환경 내 모든 네트워크 잔액을 한 번에 반환한다. 기존 동작(미지정 시 기본 네트워크 반환)은 변경하지 않는다.

### 설계 결정 근거

"파라미터 생략 = 전체 조회" 방식 대신 `network=all` 명시적 파라미터를 채택한 이유:

| 항목 | `network=all` (채택) | 생략 = 전체 |
|------|---------------------|------------|
| v1.4.6 하위호환 | 유지 | 깨짐 — 응답 형태 변경 |
| 응답 타입 일관성 | 파라미터로 명확히 결정 | 유무에 따라 객체/배열 분기 |
| 성능 예측 | 호출자가 의도적으로 5개 RPC 선택 | 파라미터 누락 시 의도치 않게 느려짐 |
| SDK 타입 안전성 | 반환 타입 예측 가능 | 런타임 분기 필요 |

### API

```
GET /v1/wallet/balance?network=all
```

```json
{
  "balances": [
    { "network": "ethereum-sepolia",  "balance": "0.5",   "symbol": "ETH" },
    { "network": "polygon-amoy",      "balance": "1.2",   "symbol": "POL" },
    { "network": "arbitrum-sepolia",  "balance": "0.0",   "symbol": "ETH" },
    { "network": "optimism-sepolia",  "balance": "0.0",   "symbol": "ETH" },
    { "network": "base-sepolia",      "balance": "0.03",  "symbol": "ETH" }
  ]
}
```

### 동작 규칙

| `network` 파라미터 | 응답 형태 | 설명 |
|-------------------|----------|------|
| 미지정 | 단일 객체 | 기본 네트워크 잔액 (기존 동작 유지) |
| 특정 네트워크 | 단일 객체 | 해당 네트워크 잔액 (기존 동작) |
| `all` | 배열 | 환경 내 모든 네트워크 잔액 |

### MCP 도구

| 도구 | 변경 |
|------|------|
| `get_balance` | `network` 파라미터에 `'all'` 선택지 추가 |
| `get_assets` | `network` 파라미터에 `'all'` 선택지 추가 |

### 구현 고려사항

- 환경 내 네트워크 목록을 `getNetworksForEnvironment()`로 조회
- `Promise.allSettled()`로 병렬 RPC 호출
- 일부 네트워크 RPC 실패 시 해당 네트워크만 에러 표시, 나머지는 정상 반환
- 응답 시간: 가장 느린 RPC에 의존 — 네트워크별 타임아웃 설정 필요

## 재발 방지 테스트

### T-1: `network=all`로 전체 네트워크 잔액 조회

EVM testnet 월렛에 대해 `GET /v1/wallet/balance?network=all`을 호출하면, 환경 내 모든 네트워크(5개)의 잔액이 배열로 반환되는지 검증.

```
GET /v1/wallet/balance?network=all
→ response.balances.length === 5
→ 각 항목에 network, balance, symbol 포함
```

### T-2: Solana 월렛에서 `network=all`

Solana testnet 월렛에서 `network=all` 호출 시 devnet, testnet 2개 네트워크 잔액이 반환되는지 검증.

```
GET /v1/wallet/balance?network=all (solana testnet 월렛)
→ response.balances.length === 2
→ networks: ['devnet', 'testnet']
```

### T-3: 일부 네트워크 RPC 실패 시 부분 성공

5개 네트워크 중 1개 RPC가 타임아웃되어도 나머지 4개 잔액이 정상 반환되고, 실패한 네트워크에 에러 표시가 포함되는지 검증.

```
GET /v1/wallet/balance?network=all (1개 RPC 모킹 실패)
→ response.balances.length === 5
→ 실패 네트워크: { network: 'arbitrum-sepolia', error: 'RPC timeout' }
→ 나머지 4개: balance 정상 반환
```

### T-4: 기존 동작 하위호환

`network` 미지정 또는 특정 네트워크 지정 시 기존과 동일한 단일 객체 응답을 반환하는지 검증.

```
GET /v1/wallet/balance → { balance: "0.5", ... } (단일 객체, 기본 네트워크)
GET /v1/wallet/balance?network=polygon-amoy → { balance: "1.2", ... } (단일 객체)
```

### T-5: MCP `get_balance` 도구에서 `network: 'all'` 지원

MCP `get_balance` 도구에 `network: 'all'` 파라미터를 전달하면 전체 네트워크 잔액 배열이 반환되는지 검증.

### T-6: `get_assets`에서 `network=all` 지원

`GET /v1/wallet/assets?network=all` 호출 시 네트워크별 토큰 잔액이 포함된 배열이 반환되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `routes/wallet.ts`, MCP `get_balance`/`get_assets` 도구, SDK 메서드 |
| 스키마 | `BalanceResponseSchema` 확장 (배열 응답 타입 추가) |
| 테스트 | API + MCP 도구 테스트 6건 추가 |
| 하위호환 | 기존 동작 변경 없음 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: ENHANCEMENT*
*관련: 멀티체인 월렛 모델 (v1.4.5/v1.4.6)*
