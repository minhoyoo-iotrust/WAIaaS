# Roadmap: WAIaaS v1.4.3

## Overview

EVM 지갑의 토큰 자산 조회 한계를 해소하고, Admin UI에서 MCP 설정까지 원스톱 처리 가능한 상태를 달성한다. 체인별 내장 토큰 레지스트리 도입, getAssets() ERC-20 연동, MCP 토큰 발급 API + Admin UI 통합, EVM 확인 타임아웃 오판 수정, 패키지 버전 관리를 5개 페이즈로 전달한다.

## Phases

**Phase Numbering:** 95-99 (v1.4.2 Phase 94에서 이어짐)

- [x] **Phase 95: 패키지 버전 관리** - 버전 일괄 갱신 스크립트 + 즉시 버전 적용 (BUG-016) ✓ 2026-02-13
- [x] **Phase 96: 파이프라인 확인 로직 수정** - EVM/Solana 확인 타임아웃 fallback + Stage 6 상태 정합성 (BUG-015) ✓ 2026-02-13
- [ ] **Phase 97: EVM 토큰 레지스트리** - 체인별 내장 토큰 목록 + 커스텀 토큰 CRUD + 역할 분리
- [ ] **Phase 98: getAssets ERC-20 연동** - 레지스트리 + ALLOWED_TOKENS 합집합 조회 (BUG-014)
- [ ] **Phase 99: MCP 토큰 관리** - POST /v1/mcp/tokens API + Admin UI MCP 섹션 (BUG-013)

## Phase Details

### Phase 95: 패키지 버전 관리
**Goal**: 모든 패키지 버전이 실제 릴리스 태그와 일치하고, 향후 릴리스에서 일괄 갱신이 가능하다
**Depends on**: Nothing (첫 페이즈, 독립 작업)
**Requirements**: DX-01, DX-02
**Success Criteria** (what must be TRUE):
  1. `scripts/tag-release.sh <version>` 실행 시 모든 package.json의 version 필드가 지정된 버전으로 갱신된다
  2. 스크립트가 git tag를 생성하고 커밋한다
  3. 현재 코드베이스의 모든 패키지 버전이 0.0.0이 아닌 실제 버전으로 표시된다
  4. Admin UI 대시보드와 OpenAPI 문서에 올바른 버전이 노출된다
**Plans**: 1 plan
Plans:
- [x] 95-01-PLAN.md -- tag-release.sh 스크립트 생성 + 전체 패키지 버전 1.4.3 갱신 ✓

### Phase 96: 파이프라인 확인 로직 수정
**Goal**: 트랜잭션이 온체인에서 성공했으나 확인 단계에서 RPC 에러/타임아웃이 발생해도, DB 상태가 온체인 상태와 일치한다
**Depends on**: Nothing (Phase 95와 독립, 병렬 가능하나 순차 실행)
**Requirements**: PIPE-01, PIPE-02, PIPE-03
**Success Criteria** (what must be TRUE):
  1. EVM adapter waitForConfirmation에서 타임아웃 발생 시 fallback으로 eth_getTransactionReceipt를 조회하여 온체인 상태를 확인한다
  2. Stage 6이 confirmed/failed/submitted 반환값에 따라 DB 상태를 정확히 기록하며, 이미 SUBMITTED인 트랜잭션을 잘못 FAILED로 덮어쓰지 않는다
  3. Solana adapter에도 동일한 fallback 패턴이 적용되어 getSignatureStatuses로 온체인 상태를 확인한다
  4. 기존 정상 경로(타임아웃 없는 확인)에 대한 회귀가 없다
**Plans**: 2 plans
Plans:
- [x] 96-01-PLAN.md -- SubmitResult 타입 확장 + EVM adapter fallback + Stage 6 반환값 분기 (PIPE-01, PIPE-02) ✓
- [x] 96-02-PLAN.md -- Solana adapter waitForConfirmation fallback 패턴 적용 (PIPE-03) ✓

### Phase 97: EVM 토큰 레지스트리
**Goal**: 데몬이 EVM 네트워크별 주요 ERC-20 토큰을 내장 목록으로 인식하고, 사용자가 커스텀 토큰을 추가/삭제할 수 있다
**Depends on**: Nothing (Phase 96과 독립)
**Requirements**: REGISTRY-01, REGISTRY-02, REGISTRY-03
**Success Criteria** (what must be TRUE):
  1. 데몬이 시작 시 별도 설정 없이 Ethereum/Polygon/Arbitrum/Optimism/Base 등 주요 네트워크의 ERC-20 토큰(USDC, USDT, WETH, DAI 등)을 인식한다
  2. API를 통해 사용자가 커스텀 토큰(address/symbol/name/decimals)을 추가하고 삭제할 수 있다
  3. 토큰 레지스트리(조회용 UX)와 ALLOWED_TOKENS 정책(전송 허용 보안)의 역할이 분리되어, 레지스트리에 등록되어도 ALLOWED_TOKENS에 없으면 전송이 거부된다
  4. 내장 토큰 목록 업데이트 시 사용자가 추가한 커스텀 토큰이 보존된다
**Plans**: TBD

### Phase 98: getAssets ERC-20 연동
**Goal**: EVM 지갑의 getAssets()가 토큰 레지스트리와 ALLOWED_TOKENS에 등록된 ERC-20 토큰 잔액을 자동으로 반환한다
**Depends on**: Phase 97 (토큰 레지스트리 인프라)
**Requirements**: ASSETS-01, ASSETS-02
**Success Criteria** (what must be TRUE):
  1. EVM 지갑의 GET /v1/wallets/:id/assets 응답에 네이티브 ETH와 함께 레지스트리 + ALLOWED_TOKENS 합집합에 해당하는 ERC-20 토큰 잔액이 포함된다
  2. 토큰 레지스트리와 ALLOWED_TOKENS 모두 미설정인 EVM 지갑은 네이티브 ETH만 반환하며 에러가 발생하지 않는다
  3. Solana 지갑의 기존 getAssets() 동작에 회귀가 없다
**Plans**: TBD

### Phase 99: MCP 토큰 관리
**Goal**: Admin UI에서 지갑 생성부터 MCP 토큰 발급, Claude Desktop 설정까지 원스톱으로 처리할 수 있다
**Depends on**: Nothing (Phase 97/98과 독립, 순차 실행)
**Requirements**: MCP-01, MCP-02, MCP-03
**Success Criteria** (what must be TRUE):
  1. POST /v1/mcp/tokens API가 세션 생성, 토큰 파일 저장(mcp-tokens/<walletId>), Claude Desktop 설정 JSON 스니펫을 단일 응답으로 반환한다
  2. Admin UI 지갑 상세 페이지에서 MCP 토큰 발급 버튼 클릭으로 API를 호출하고 결과를 표시한다
  3. 발급된 Claude Desktop 설정 JSON이 복사 가능한 형태(코드 블록 + 복사 버튼)로 Admin UI에 표시된다
  4. 기존 CLI `waiaas mcp setup` 동작에 회귀가 없다
**Plans**: TBD

## Progress

**Execution Order:** 95 -> 96 -> 97 -> 98 -> 99

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 95. 패키지 버전 관리 | 1/1 | ✓ Complete | 2026-02-13 |
| 96. 파이프라인 확인 로직 수정 | 2/2 | ✓ Complete | 2026-02-13 |
| 97. EVM 토큰 레지스트리 | 0/TBD | Not started | - |
| 98. getAssets ERC-20 연동 | 0/TBD | Not started | - |
| 99. MCP 토큰 관리 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-13*
*Milestone: v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX 개선 + 버그 수정*
