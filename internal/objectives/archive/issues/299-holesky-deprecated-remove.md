# Issue #299: Holesky 테스트넷 종료 — Holesky 참조 제거 + E2E 스테이킹 테스트 제거

- **유형:** BUG
- **심각도:** HIGH
- **발견 경로:** E2E onchain precondition checker 실행 + Ethereum Foundation 공식 발표 확인

## 배경

- Ethereum Foundation이 2025년 9월 Holesky 테스트넷 지원을 공식 종료
- 이더리움 테스트넷은 **Sepolia만 지원**하는 것으로 결정
- Lido는 Sepolia 배포도 deprecated 상태이며 Hoodi 테스트넷으로 이전 — E2E 테스트넷 스테이킹 테스트 실질적 불가

## 수정 사항

### 1. E2E 온체인 스테이킹 테스트 제거
- `packages/e2e-tests/src/__tests__/onchain-staking.e2e.test.ts` — 파일 삭제 또는 전체 skip
- `packages/e2e-tests/src/scenarios/onchain-staking.ts` — 시나리오 등록 제거

### 2. 사전 조건 체커에서 Holesky 제거
- `packages/e2e-tests/src/helpers/precondition-checker.ts:53` — `ethereum-holesky` 잔액 요구사항 제거
- `packages/e2e-tests/src/helpers/precondition-checker.ts:62` — `staking` → `ethereum-holesky` 매핑 제거

### 3. 유닛 테스트 업데이트
- `packages/e2e-tests/src/__tests__/precondition-checker.test.ts` — Holesky 관련 assertion 제거
- `packages/e2e-tests/src/__tests__/precondition-prompt.test.ts` — holesky 예시를 sepolia로 변경

### 4. Lido 프로바이더 코드 (유지)
- `packages/actions/src/providers/lido-staking/config.ts` — 테스트넷 주소는 코드에 유지 (메인넷 기능에는 영향 없음)
- `packages/daemon/src/__tests__/lido-staking-integration.test.ts` — 유닛 테스트는 mock 기반이므로 유지

## 테스트 항목

- [ ] 사전 조건 체크에서 Holesky 관련 항목 미출력 확인
- [ ] `pnpm --filter @waiaas/e2e-tests run test` 유닛 테스트 전체 통과
- [ ] `pnpm --filter @waiaas/e2e-tests run test:onchain` 실행 시 스테이킹 관련 실패 없음
