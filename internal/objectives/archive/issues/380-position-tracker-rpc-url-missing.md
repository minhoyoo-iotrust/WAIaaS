# 380 — PositionTracker RPC URL 미해결로 DeFi 대시보드 포지션 미표시

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** v32.8
- **수정일:** 2026-03-18
- **발견일:** 2026-03-17
- **발견 경로:** Admin UI DeFi Positions 대시보드에서 포지션 0건 표시 (지갑 상세 Assets 탭에서는 정상 표시)

## 증상

- Admin UI → DeFi Positions 대시보드: ACTIVE POSITIONS 0, TOTAL DEFI VALUE "—"
- Admin UI → 지갑 상세 → Assets 탭: Lido stETH 0.005000 ($11.66) 정상 표시
- `Include testnets` 체크 상태에서도 동일

## 원인

`PositionTracker`가 RPC URL을 해결하지 못해 모든 provider의 `getPositions()` 호출이 스킵됨.

### 데이터 경로 차이

| 경로 | API | 데이터 소스 | RPC 필요 |
|------|-----|-------------|----------|
| 지갑 상세 Assets 탭 | `GET /v1/admin/wallets/{id}/staking` | `transactions` 테이블 집계 (`aggregateStakingBalance`) | **No** |
| DeFi 대시보드 | `GET /v1/admin/defi/positions` | `defi_positions` 테이블 (PositionTracker 주기적 동기화) | **Yes** |

### 근본 원인

`daemon-startup.ts:873`에서 PositionTracker 생성 시 `rpcConfig`를 전달하지 않음:

```typescript
state.positionTracker = new PositionTracker({
  sqlite: state.sqlite,
  settingsService: state._settingsService,
  // rpcConfig 미전달 → {} 빈 객체
});
```

`position-tracker.ts:164`에서 `resolveRpcUrl(this.rpcConfig, chain, net)` 호출 시 빈 config로 인해 항상 빈 문자열 반환 → provider가 `if (!rpcUrl) return []`로 스킵.

**추가 문제:** `resolveRpcUrl`은 `config.toml`의 `[rpc]` 섹션만 읽는 정적 함수. Admin Settings로만 RPC를 관리하는 경우 `rpcConfig`를 전달해도 빈 상태.

## 수정 방안

PositionTracker의 RPC URL 해결을 `resolveRpcUrlFromPool`로 변경:

1. **PositionTracker constructor에 `rpcPool` 파라미터 추가** (optional)
2. **`syncCategory`에서 `resolveRpcUrlFromPool(rpcPool, settingsService.get, chain, net)` 사용**
   - RpcPool 먼저 시도 → 실패 시 SettingsService(`rpc.{key}`) fallback
   - 이미 daemon의 다른 곳 (subscriber factory, adapter pool)에서 동일 패턴 사용 중
3. **`daemon-startup.ts`에서 `state.rpcPool` 전달**
4. **기존 `rpcConfig` 파라미터 및 `resolveRpcUrl` import 제거**

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/services/defi/position-tracker.ts` | `rpcConfig` → `rpcPool` + `settingsService` 기반 RPC 해결 |
| `packages/daemon/src/lifecycle/daemon-startup.ts` | PositionTracker에 `rpcPool: state.rpcPool` 전달 |

## 테스트 항목

- [ ] PositionTracker가 SettingsService의 `rpc.*` 설정으로 RPC URL을 정상 해결하는지 단위 테스트
- [ ] RpcPool이 있을 때 RpcPool 우선, 없을 때 SettingsService fallback 동작 테스트
- [ ] 테스트넷 지갑의 Lido staking 포지션이 `defi_positions` 테이블에 기록되는지 확인
- [ ] DeFi 대시보드에서 `includeTestnets=true` 시 테스트넷 포지션 표시 확인
- [ ] 기존 PositionTracker 테스트가 rpcPool 없이도 정상 동작 (하위 호환)
