# 410 — DCent Swap Solana 트랜잭션 EVM 스키마 적용 회귀 — txdata.from/to Required

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT defi-16 (DCent Solana 네이티브 스왑)
- **상태:** OPEN
- **관련 이슈:** #394 (동일 패턴, FIXED 상태이나 회귀)

## 증상

`POST /v1/actions/dcent_swap/dex_swap?dryRun=true` 호출 시 Solana 체인에서 EVM 전용 스키마 검증 에러:

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "...txdata.from Required...txdata.to Required..."
}
```

## 근본 원인

**#394 수정이 불완전 — 프로바이더 metadata에서 Solana를 제거했지만, builtin-metadata는 미갱신, 런타임 체인 검증도 부재.**

### 3중 불일치

| 파일 | 위치 | 값 | 문제 |
|------|------|-----|------|
| `packages/actions/src/providers/dcent-swap/index.ts:110` | 프로바이더 metadata | `chains: ['ethereum']` | OK — #394에서 수정 |
| `packages/daemon/src/infrastructure/action/builtin-metadata.ts:35` | 빌트인 메타데이터 | `chains: ['ethereum', 'solana']` | **미갱신** — Solana 남아있음 |
| `packages/actions/src/providers/dcent-swap/index.ts:141-198` | `resolve()` 메서드 | 체인 검증 없음 | **누락** — 어떤 체인이든 처리 시도 |

### 상세 분석

1. **#394 수정** (commit fe09ade0): 프로바이더 `metadata.chains`에서 Solana를 제거하여 일반적인 경우 Solana 요청이 도달하지 않도록 함
2. **builtin-metadata.ts:35**: 여전히 `['ethereum', 'solana']`를 보고하여 Admin UI와 connect-info에서 Solana 지원으로 표시
3. **currency-mapper.ts:84-91**: Solana CAIP-19 → DCent ID 변환이 정상 동작하여 Solana 자산 식별자도 DCent API로 전달 가능
4. **schemas.ts:71-83**: `DcentTxDataResponseSchema`가 EVM 전용 (`from`, `to`, `data` 필수) — Solana 분기 없음
5. **dex-swap.ts:218-276**: 체인 감지 없이 `txdata.to`, `txdata.data`를 직접 사용하여 EVM 전용 ContractCallRequest 구성

### 요청이 Solana로 도달하는 경로

- UAT 시나리오에서 `network: "solana-mainnet"`으로 직접 호출
- `resolve()`에 런타임 체인 검증이 없어 metadata.chains 필터를 우회하는 직접 호출은 모두 처리됨

## 수정 방향

1. **builtin-metadata.ts:35** — `chains: ['ethereum']`로 갱신 (최우선)
2. **resolve()에 체인 가드 추가** — `if (context.chain !== 'ethereum') throw 'Unsupported chain'`
3. **장기적**: DCent API가 Solana를 지원할 경우 Solana txdata 스키마 분기 추가

## 테스트 항목

- [ ] builtin-metadata의 dcent_swap chains가 `['ethereum']`만 포함
- [ ] Solana 체인으로 dex_swap 요청 시 명확한 미지원 에러 반환
- [ ] EVM 체인 dex_swap은 정상 동작 유지
- [ ] Admin UI에서 DCent Swap이 Solana 미지원으로 표시
