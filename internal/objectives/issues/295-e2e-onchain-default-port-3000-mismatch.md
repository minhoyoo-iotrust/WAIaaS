# 295 — E2E 온체인 테스트 기본 포트 3000 — 데몬 기본 포트 3100과 불일치

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 온체인 E2E 테스트 실행 시도
- **상태:** OPEN

## 증상

온체인 E2E 테스트를 환경변수 없이 실행하면 `http://127.0.0.1:3000`에 연결을 시도하지만, 데몬의 기본 포트는 `3100`이므로 연결 실패.

## 원인

E2E 온체인 테스트 코드 6개 파일에서 기본 URL을 `http://127.0.0.1:3000`으로 하드코딩:

- `src/run-onchain.ts:19` — `DEFAULT_DAEMON_URL = 'http://127.0.0.1:3000'`
- `src/__tests__/onchain-transfer.e2e.test.ts:19`
- `src/__tests__/onchain-hyperliquid.e2e.test.ts:21`
- `src/__tests__/onchain-incoming.e2e.test.ts:21`
- `src/__tests__/onchain-nft.e2e.test.ts:20`
- `src/__tests__/onchain-staking.e2e.test.ts:18`

데몬의 기본 포트 설정 (`packages/daemon/src/infrastructure/config/loader.ts:22`):
```typescript
port: z.number().int().min(1024).max(65535).default(3100),
```

## 수정 방안

6개 파일의 기본 URL을 `http://127.0.0.1:3100`으로 변경. 중복을 줄이기 위해 공통 상수를 헬퍼 파일에 정의하는 것도 고려.

## 영향 범위

- `packages/e2e-tests/src/run-onchain.ts`
- `packages/e2e-tests/src/__tests__/onchain-*.e2e.test.ts` (5개 파일)

## 테스트 항목

1. 환경변수 미설정 상태에서 온체인 테스트가 3100 포트로 연결되는지 확인
2. `WAIAAS_E2E_DAEMON_URL` 환경변수로 오버라이드가 여전히 동작하는지 확인
