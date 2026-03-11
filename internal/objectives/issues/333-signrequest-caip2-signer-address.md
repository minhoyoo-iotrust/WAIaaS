# #333 SignRequest에 CAIP-2 체인 식별자 및 서명 주소 추가

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** —

## 현상

SignRequest 메시지가 외부 지갑 앱(DCent 등)에서 올바르게 해석하기 어려운 구조:

1. **서명 주소 누락** — `metadata.from`은 WAIaaS 관리 지갑 주소(에이전트 지갑)이며, Owner 지갑 주소가 아님. 지갑 앱이 여러 계정을 보유한 경우 어떤 키로 서명해야 하는지 알 수 없음.
2. **네트워크 식별 비표준** — `chain: 'ethereum'`, `network: 'ethereum-mainnet'` 같은 WAIaaS 내부 문자열 사용. Polygon/Arbitrum/Base 등 모든 EVM 체인이 `chain: 'ethereum'`으로 들어가 실제 체인 구분 불가. 외부 지갑 앱이 매핑 테이블 없이는 네트워크를 판별할 수 없음.

## 변경 사항

SignRequest 스키마 필드 변경:

| 기존 | 변경 후 | 설명 |
|------|---------|------|
| `chain` | (제거) | `caip2ChainId`로 대체 |
| `network` | `networkName` | 필드명 변경, 기존 값 유지 (휴먼 리더블) |
| (없음) | `caip2ChainId` | CAIP-2 표준 체인 식별자 추가 |
| (없음) | `signerAddress` | Owner 지갑 주소 추가 |

### 변경 예시

**EVM (Polygon Mainnet):**
```
Before: { chain: 'ethereum', network: 'polygon-mainnet' }
After:  { caip2ChainId: 'eip155:137', networkName: 'polygon-mainnet', signerAddress: '0xOwner...' }
```

**Solana (Mainnet):**
```
Before: { chain: 'solana', network: 'solana-mainnet' }
After:  { caip2ChainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', networkName: 'solana-mainnet', signerAddress: 'Owner...' }
```

## 영향 범위

- `packages/core/src/schemas/signing-protocol.ts` — SignRequest Zod 스키마
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` — 빌더
- `packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts` — ntfy 발행
- `packages/daemon/src/services/signing-sdk/channels/telegram-signing-channel.ts` — Telegram 발행
- `packages/push-relay/src/subscriber/message-parser.ts` — 메시지 파서
- 관련 테스트 파일

## 비고

- 하위 호환 불필요 (아직 푸시 릴레이를 통해 연동된 지갑 앱 없음)
- CAIP-2 매핑은 `packages/core/src/caip/network-map.ts`에 이미 구현되어 있음

## 테스트 항목

- [ ] SignRequest 스키마에서 `chain` 필드 제거, `caip2ChainId`/`networkName`/`signerAddress` 필드 존재 확인
- [ ] SignRequestBuilder가 CAIP-2 체인 ID를 올바르게 변환하는지 확인 (EVM 12개 + Solana 3개 네트워크)
- [ ] SignRequestBuilder가 signerAddress에 Owner 지갑 주소를 설정하는지 확인
- [ ] NtfySigningChannel 발행 페이로드에 새 필드 포함 확인
- [ ] Push Relay message-parser가 새 포맷을 올바르게 파싱하는지 확인
