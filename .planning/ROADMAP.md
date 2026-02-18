# Roadmap: WAIaaS v2.2 테스트 커버리지 강화

## Overview

v2.2는 v1.7에서 설정한 커버리지 Hard 게이트 중 임시 하향된 3개 패키지(adapter-solana branches, admin functions, cli lines/statements)의 임계값을 원래 수준으로 복원하기 위해, 미커버 브랜치/함수/라인에 대한 단위 테스트를 추가하는 테스트 전용 마일스톤이다. 3개 패키지는 완전히 독립적이므로 병렬 작업이 가능하며, 최종 페이즈에서 임계값을 복원하고 전체 테스트 스위트를 검증한다.

## Phases

- [x] **Phase 178: adapter-solana 브랜치 커버리지** - Solana 어댑터의 미커버 ~78 브랜치에 대한 단위 테스트 추가 (completed 2026-02-18)
- [x] **Phase 179: admin 함수 커버리지** - Admin UI의 미커버 ~37+ 함수에 대한 단위 테스트 추가 (completed 2026-02-18)
- [ ] **Phase 180: CLI 라인/구문 커버리지** - CLI 패키지의 미커버 ~444 라인에 대한 단위 테스트 추가
- [ ] **Phase 181: 임계값 검증 및 복원** - 3개 패키지 vitest.config.ts 임계값을 원래 수준으로 복원하고 전체 검증

## Phase Details

### Phase 178: adapter-solana 브랜치 커버리지
**Goal**: @waiaas/adapter-solana의 브랜치 커버리지가 75% 이상으로 충분히 도달하여 임계값 복원이 가능한 상태가 된다
**Depends on**: Nothing (independent)
**Requirements**: SOL-01, SOL-02, SOL-03, SOL-04
**Success Criteria** (what must be TRUE):
  1. convertBatchInstruction()의 4가지 instruction 타입(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE) 분기가 각각 테스트되어 정상 경로와 에러 경로가 검증된다
  2. signExternalTransaction()의 Base64 디코딩 실패, 키 길이(Ed25519/secp256k1) 판별, 서명자 불일치 분기가 테스트되어 에러 메시지가 정확히 반환된다
  3. tx-parser.ts의 파싱 실패, unknown 명령어, null coalescing fallback 등 엣지 케이스가 테스트되어 예외 없이 처리된다
  4. Error instanceof 분기(ChainError vs generic Error), getAssets 정렬 로직, estimateFee 토큰/네이티브 분기가 테스트되어 브랜치 커버리지가 75%를 넘는다
**Plans**: 2 plans

Plans:
- [ ] 178-01-PLAN.md — convertBatchInstruction 4-type dispatch + signExternalTransaction edge case 브랜치 테스트 (SOL-01, SOL-02)
- [ ] 178-02-PLAN.md — tx-parser 엣지 케이스 + Error instanceof + getAssets sort + estimateFee 에러 브랜치 테스트 (SOL-03, SOL-04)

### Phase 179: admin 함수 커버리지
**Goal**: @waiaas/admin의 함수 커버리지가 70% 이상으로 충분히 도달하여 임계값 복원이 가능한 상태가 된다
**Depends on**: Nothing (independent)
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04
**Success Criteria** (what must be TRUE):
  1. settings.tsx의 RPC 테스트, 네트워크 RPC URL 변경, API 키 관리, 모니터링 간격 설정 등 ~15개 함수가 테스트되어 사용자 인터랙션 시나리오가 검증된다
  2. wallets.tsx와 dashboard.tsx의 네트워크 추가/제거, WC 페어링, Owner 설정, 킬스위치 토글 등 ~12개 함수가 테스트된다
  3. policies.tsx와 notifications.tsx의 정책 재정렬, 삭제 확인 다이얼로그, 필터링, 채널별 테스트 발송 등 ~18개 함수가 테스트된다
  4. 0% 커버리지 그룹(client.ts, layout.tsx, toast.tsx, copy-button.tsx, walletconnect.tsx)과 폼 컴포넌트의 미커버 함수가 테스트되어 함수 커버리지가 70%를 넘는다
**Plans**: 2 plans

Plans:
- [ ] 179-01-PLAN.md — settings.tsx + wallets.tsx WalletDetailView + dashboard.tsx 함수 커버리지 테스트 (ADM-01, ADM-02)
- [ ] 179-02-PLAN.md — policies.tsx + notifications.tsx + 0% 그룹(client.ts, layout.tsx, toast.tsx, copy-button.tsx, walletconnect.tsx, display-currency.ts) + 0% 폼 컴포넌트 함수 테스트 (ADM-03, ADM-04)

### Phase 180: CLI 라인/구문 커버리지
**Goal**: @waiaas/cli의 라인/구문 커버리지가 70% 이상으로 충분히 도달하여 임계값 복원이 가능한 상태가 된다
**Depends on**: Nothing (independent)
**Requirements**: CLI-01, CLI-02
**Success Criteria** (what must be TRUE):
  1. commands/owner.ts의 WalletConnect 연결/해제/상태 조회 로직이 테스트되어 정상 흐름과 에러 처리가 검증된다
  2. commands/wallet.ts의 월렛 상세 조회, 기본 네트워크 변경 로직이 테스트된다
  3. utils/password.ts의 stdin/파일 기반 비밀번호 프롬프트 분기가 테스트되어 라인 커버리지가 70%를 넘는다
**Plans**: 1 plan

Plans:
- [ ] 180-01-PLAN.md — owner.ts + wallet.ts + password.ts 라인/구문 커버리지 단위 테스트 (CLI-01, CLI-02)

### Phase 181: 임계값 검증 및 복원
**Goal**: 3개 패키지의 vitest.config.ts 임계값이 원래 수준으로 복원되고 전체 테스트 스위트가 통과한다
**Depends on**: Phase 178, Phase 179, Phase 180
**Requirements**: GATE-01
**Success Criteria** (what must be TRUE):
  1. adapter-solana의 vitest.config.ts branches 임계값이 65에서 75로 복원되어 있고 pnpm test가 통과한다
  2. admin의 vitest.config.ts functions 임계값이 55에서 70으로 복원되어 있고 pnpm test가 통과한다
  3. cli의 vitest.config.ts lines 임계값이 65에서 70, statements 임계값이 65에서 70으로 복원되어 있고 pnpm test가 통과한다
  4. pnpm test 전체 실행 시 모든 패키지가 커버리지 임계값을 만족하며 0건의 실패가 발생한다
**Plans**: TBD

Plans:
- [ ] 181-01: 임계값 복원 + 전체 검증 (GATE-01)

## Progress

**Execution Order:**
Phases 178, 179, 180은 독립적이므로 순서 무관 (병렬 가능). Phase 181은 178+179+180 완료 후 실행.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 178. adapter-solana 브랜치 커버리지 | v2.2 | Complete    | 2026-02-18 | - |
| 179. admin 함수 커버리지 | v2.2 | Complete    | 2026-02-18 | - |
| 180. CLI 라인/구문 커버리지 | v2.2 | 0/1 | Not started | - |
| 181. 임계값 검증 및 복원 | v2.2 | 0/1 | Not started | - |
