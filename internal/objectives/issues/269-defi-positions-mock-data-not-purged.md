# #269 — DeFi 포지션 Mock 오염 데이터 미정리 — #263 코드 수정 후 DB 마이그레이션 누락

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-07
- **마일스톤:** —
- **영향 범위:** `packages/daemon/src/infrastructure/database/migrate.ts`, Admin UI 대시보드 DeFi Positions

## 증상

Admin UI 대시보드의 DeFi Positions 섹션에 가짜 포지션이 여전히 대량 표시됨:

- **Active Positions:** 8,733건
- **Total DeFi Value:** $130,905,000
- **Health Factor:** N/A
- kamino LENDING: 동일한 패턴 반복 (10,000,000,000 / $10,000 + 50,000,000,000 / $5,000)
- drift_perp PERP: 동일한 패턴 반복 (100 / $15,000)
- 모든 포지션이 solana 체인

## 근본 원인

이슈 #263에서 `registerBuiltInProviders()`가 Mock SDK wrapper를 사용하는 코드 결함은 수정되었으나, **기존 DB에 누적된 가짜 포지션 데이터를 정리하는 마이그레이션이 누락**됨.

### #263 수정 내역 (반영 완료)

- `packages/actions/src/index.ts:253`: `new KaminoLendingProvider(config, new KaminoSdkWrapper(''))` — 실제 wrapper 전달
- `packages/actions/src/index.ts:279`: `new DriftPerpProvider(config, new DriftSdkWrapper('', config.subAccount))` — 실제 wrapper 전달

### 미반영 사항

#263 이슈 문서의 "기존 오염 데이터 정리" 섹션에서 명시한 마이그레이션이 구현되지 않음:

```sql
DELETE FROM defi_positions WHERE provider IN ('kamino', 'drift_perp');
```

## 해결 방안

v48 마이그레이션을 추가하여 Mock 데이터로 오염된 `defi_positions` 레코드를 일괄 삭제:

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts

MIGRATIONS.push({
  version: 48,
  description: 'Purge mock defi_positions data from Kamino/Drift (#263)',
  up: (sqlite) => {
    sqlite.exec(`DELETE FROM defi_positions WHERE provider IN ('kamino', 'drift_perp')`);
  },
});
```

### 안전성

- Kamino/Drift 프로바이더는 실제 SDK 미설치 환경에서 빈 배열을 반환하므로 정상 포지션 데이터가 존재하지 않음
- 실제 SDK가 설치된 환경에서도 PositionTracker가 다음 sync 주기에서 실제 포지션을 다시 기록하므로 데이터 손실 없음

## 테스트 항목

1. **마이그레이션 체인 테스트:** v47 → v48 마이그레이션 적용 후 `defi_positions` 테이블에서 provider='kamino' 및 provider='drift_perp' 레코드가 0건인지 검증
2. **회귀 테스트:** 마이그레이션 후 Admin UI 대시보드 DeFi Positions가 빈 상태(또는 실제 포지션만)를 표시하는지 확인
3. **기존 테스트 호환:** migration-chain.test.ts가 v48까지 정상 통과하는지 확인
