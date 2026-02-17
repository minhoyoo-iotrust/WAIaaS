# 022: 기본 네트워크 변경 MCP 도구 및 CLI 명령어 미구현

## 심각도

**LOW** — REST API(`PUT /v1/wallets/:id/default-network`)는 v1.4.6에서 제공되나, MCP 도구와 CLI 명령어가 없어 AI 에이전트와 CLI 사용자가 기본 네트워크를 변경할 수 없다.

## 증상

- MCP 에이전트가 "기본 네트워크를 Polygon으로 바꿔줘" 요청을 처리할 수 없음
- CLI에서 기본 네트워크를 변경하려면 curl로 REST API를 직접 호출해야 함
- Admin UI에서만 변경 가능 (v1.4.6 월렛 상세 페이지)

## 수정안

### 1. MCP 도구 추가

```typescript
// set_default_network
{
  name: 'set_default_network',
  description: '월렛의 기본 네트워크를 변경합니다.',
  inputSchema: {
    network: { type: 'string', description: '변경할 네트워크 (예: polygon-amoy)' }
  }
}
```

### 2. CLI 명령어 추가

```bash
waiaas wallet set-default-network <network>
# 예: waiaas wallet set-default-network polygon-amoy
```

### 3. SDK 메서드 추가

```typescript
// TypeScript SDK
await client.setDefaultNetwork('polygon-amoy');

// Python SDK
client.set_default_network('polygon-amoy')
```

## 재발 방지 테스트

### T-1: MCP 도구로 기본 네트워크 변경

MCP `set_default_network` 도구로 기본 네트워크를 변경한 뒤, `get_wallet_info`(이슈 023)에서 `defaultNetwork`가 변경된 값으로 반환되는지 검증.

### T-2: 환경 불일치 거부

testnet 월렛에서 `set_default_network('ethereum-mainnet')` 호출 시 환경 불일치 에러가 반환되는지 검증.

### T-3: 변경 후 잔액 조회 반영

기본 네트워크를 `polygon-amoy`로 변경한 뒤, `get_balance`(network 미지정) 호출 시 Polygon Amoy 잔액이 반환되는지 검증.

### T-4: CLI 명령어 동작

`waiaas wallet set-default-network polygon-amoy` 실행 후 성공 메시지와 변경된 기본 네트워크가 표시되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | MCP 도구 등록, CLI 명령어 추가, SDK 메서드 추가 |
| 신규 API | 없음 — 기존 `PUT /v1/wallets/:id/default-network` 재사용 |
| 테스트 | MCP + CLI + SDK 테스트 4건 추가 |
| 하위호환 | 신규 기능 추가, 기존 동작 변경 없음 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: MISSING*
*관련: 멀티체인 월렛 모델 (v1.4.5/v1.4.6), 이슈 023 (get_wallet_info)*
