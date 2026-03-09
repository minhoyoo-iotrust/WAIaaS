# 마일스톤 m31-07: E2E 자동 검증 체계

- **Status:** SHIPPED
- **Milestone:** v31.7
- **Completed:** 2026-03-09

## 목표

RC 발행 후 수동으로 진행하던 기능 검증 과정을 자동화한다. 오프체인 기능은 CI/CD에 통합하여 RC publish 시 자동 실행하고, 온체인 기능은 로컬 환경에서 사전 조건 확인 후 자동 테스트할 수 있도록 구성한다. 또한 새로운 기능(Action Provider, API 엔드포인트) 추가 시 E2E 시나리오 등록을 CI로 강제하여, 기능 증가에 따라 테스트도 함께 늘어나는 것을 구조적으로 보장한다.

### 함께 처리하는 이슈

이 마일스톤 범위 내에서 현재 OPEN 상태인 이슈를 함께 해결한다:

- **#282** (ENHANCEMENT): 네트워크 설정 키 완전성 자동 검증 테스트 — CI 워크플로우 통합(Phase 5) 시 반영
- **#283** (ENHANCEMENT): README 테스트 배지 자동 업데이트 — CI 워크플로우(Phase 5)에서 Gist 기반 동적 배지 구현

---

## 배경

### 현재 RC 검증 프로세스

현재 RC 검증은 수동으로 진행된다:

1. release-please가 RC 패키지 발행
2. 개발자가 RC 패키지를 설치하여 데몬 기동
3. AI 에이전트와 대화하며 기능별 동작 확인
4. 문제 발견 시 이슈 등록 후 수정

이 프로세스는 다음의 문제가 있다:

- **시간 소모**: 매 RC마다 전체 기능을 수동으로 확인해야 함
- **누락 위험**: 기능이 90+개 마일스톤을 거쳐 누적되면서 전체 커버가 어려움
- **비결정적**: 테스트 범위와 깊이가 테스터에 따라 달라짐
- **단위/통합 테스트와의 갭**: 7,200+ 테스트가 코드 레벨을 검증하지만, 패키징 후 실제 실행 시 깨지는 문제는 감지 불가

### 두 트랙 전략

기능을 코인 필요 여부로 나누어 두 트랙으로 자동화한다:

| 구분 | 트랙 1: 오프체인 (CI/CD) | 트랙 2: 온체인 (로컬) |
|------|------------------------|---------------------|
| 실행 환경 | GitHub Actions | 개발자 로컬 머신 |
| 트리거 | RC publish 자동 | `pnpm e2e:onchain` 수동 |
| 블록체인 | 불필요 | testnet 코인 필요 |
| 범위 | 데몬 자체 기능 60-70% | 온체인 트랜잭션 30-40% |
| 안정성 | 높음 (외부 의존 없음) | testnet RPC/faucet 상태에 의존 |

---

## 범위

### Phase 1: E2E 테스트 인프라 및 공통 유틸리티

`packages/e2e-tests/` 패키지를 생성하고, 두 트랙이 공유하는 인프라를 구축한다.

**기능:**
- `packages/e2e-tests/` 패키지 셋업 (vitest, 스크립트 구조)
- 데몬 라이프사이클 관리 유틸리티 (설치 → config 생성 → 기동 → health check → 종료)
- 테스트 세션 관리 (마스터 패스워드 설정, 세션 생성/정리)
- HTTP 클라이언트 헬퍼 (REST API 호출, 응답 검증)
- Push Relay 라이프사이클 관리 유틸리티 (설치 → config 생성 → 기동 → health check → 종료, 데몬과 독립적으로 관리)
- E2E 시나리오 등록 인터페이스 (`E2EScenario` 타입, offchain/onchain 트랙 구분)
- 테스트 리포트 포맷 (통과/실패/스킵 요약)

### Phase 2: 오프체인 Smoke — 코어 기능

데몬의 핵심 기능(인증, 지갑, 세션, 정책)을 검증하는 E2E 시나리오를 구현한다. 이 시나리오들은 이후 Phase 3-4 시나리오의 전제 조건이 된다.

**시나리오:**
- 인증 플로우: 마스터 패스워드 설정 → 세션 생성/갱신/삭제
- 지갑 CRUD: EVM/Solana 지갑 생성 → 목록 조회 → 삭제
- 다중 지갑 세션: 세션에 지갑 연결/해제, session_wallets junction 검증
- 정책 CRUD: 정책 생성 → 조회 → 수정 → 삭제, 정책 평가 (dry-run)

### Phase 3: 오프체인 Smoke — 인터페이스 & 운영

데몬의 외부 인터페이스(Admin UI, MCP, SDK)와 운영 기능(알림, 감사 로그, 백업)을 검증하는 E2E 시나리오를 구현한다.

**시나리오:**
- Admin UI: HTTP 200 접근, Settings CRUD
- MCP 서버: `@modelcontextprotocol/sdk` 클라이언트로 stdio 연결 → tool listing → 기본 도구 호출 (지갑 목록 등)
- SDK: createSession → listWallets → 기본 조회 API (DeFi/NFT 등 고급 SDK 메서드는 단위 테스트로 커버, E2E는 SDK 연결성 검증에 집중)
- 알림: 채널 설정, 이벤트 발행 확인
- 토큰 레지스트리: CRUD
- connect-info: 자기 발견 엔드포인트 (userop capability 포함)
- 감사 로그: 작업 후 로그 생성 확인
- 백업/복원: 백업 생성 → 복원 → 데이터 일치 확인

### Phase 4: 오프체인 Smoke — 고급 프로토콜

Smart Account, Owner 인증, 표준 프로토콜(ERC-8004/8128), DeFi 설정 등 고급 기능의 오프체인 E2E 시나리오를 구현한다.

**시나리오:**
- Smart Account: Smart Account 생성 (accountType=smart), 조회, Lite/Full 모드 확인
- UserOp Build/Sign: UserOp 빌드 요청 → 서명 → userop_builds TTL 만료 확인
- Owner 인증: SIWE/SIWS 챌린지 발급 → 서명 검증 플로우 (오프체인, 서명은 테스트 키로 생성)
- x402 결제: x402 설정 CRUD, dry-run 평가 (실제 결제 없이 오프체인 검증)
- ERC-8004 Trustless Agents: 스마트 계정에 에이전트 등록/해제, 권한 조회 (오프체인 설정 검증)
- ERC-8128 Signed HTTP Requests: 서명 생성/검증 플로우 (오프체인, 테스트 키 사용)
- DeFi Admin Settings: 각 DeFi 프로토콜별 Admin Settings CRUD (slippage, gas limit 등 오프체인 설정)
- Push Relay: 서버 기동 → 디바이스 등록/해제 (오프체인, 실제 push 전달은 mock)

### Phase 5: CI/CD 워크플로우 통합

오프체인 E2E 테스트를 GitHub Actions에 통합하여 RC publish 시 자동 실행한다.

**기능:**
- GitHub Actions workflow (`e2e-smoke.yml`)
- 트리거: `release: published` 이벤트 (기존 `release.yml`과 동일 패턴). release-please가 Release PR 머지 시 GitHub Release를 생성하면 자동 트리거됨. RC/stable 모두 포함.
- RC 버전 명시적 설치: `npx @waiaas/daemon@${RELEASE_TAG}` — 방금 발행된 RC 버전을 정확히 테스트
- workflow_dispatch 수동 트리거 지원 (특정 버전 지정 가능)
- `release.yml`의 기존 quality gate (unit test, chain-integration, platform test) 통과 후 E2E 실행, 또는 독립 workflow로 병렬 실행
- 테스트 결과 리포트 (GitHub Actions summary)
- 실패 시 알림 (GitHub Issue 자동 생성 또는 ntfy)
- #282 네트워크 설정 키 완전성 검증 스크립트 작성 + CI 스텝 포함
- #283 README 테스트 배지 동적 업데이트 (schneegans/dynamic-badges-action + GitHub Gist)

### Phase 6: 온체인 사전 조건 체커 및 인터랙티브 프롬프트

로컬 온체인 테스트의 사전 조건을 확인하고 사용자와 상호작용하는 런처를 구현한다.

**기능:**
- 데몬 접속 확인 (health check)
- 지갑 존재 여부 확인 (EVM/Solana)
- 네트워크별 잔액 확인 (네이티브 토큰 + 테스트용 ERC-20/SPL)
- 부족 항목 리포트 출력 (네트워크, 토큰, 필요 금액, 현재 잔액)
- 인터랙티브 프롬프트: 가능한 것만 실행 / 중단 후 준비
- 네트워크/프로토콜 필터 옵션 (`--network sepolia`, `--only swap,bridge`)

### Phase 7: 온체인 E2E 시나리오 구현

testnet에서 실제 트랜잭션을 실행하는 E2E 시나리오를 구현한다.

**시나리오:**
- 기본 전송: ETH(Sepolia) / SOL(Devnet) 전송
- 토큰 전송: ERC-20(Sepolia) / SPL(Devnet) 토큰 전송
- 수신 감지: IncomingTxMonitor가 수신 트랜잭션 감지하는지 확인
- Lido Staking: Holesky testnet에서 stETH stake/unstake (유일한 EVM DeFi testnet 지원)
- Hyperliquid: testnet API로 Spot/Perp 주문 생성/취소, Sub Account 생성 (전용 testnet 완비)
- NFT 전송: ERC-721 / ERC-1155 전송 (Sepolia)
- 잔액 부족 시 해당 시나리오 skip (fail이 아닌 skip)

**testnet 미지원으로 제외되는 프로토콜** (mainnet-only):
- Jupiter Swap, 0x EVM DEX, LI.FI Bridge, Jito Staking, Aave V3, Kamino Lending, Pendle Yield, Drift Perp, DCent Swap, Across Bridge
- 이들은 단위/통합 테스트(mock)로 검증하고, E2E 온체인 시나리오에서는 skip 처리

**Solana NFT (Metaplex) 제외 사유:**
- Devnet에서 Metaplex NFT 민팅이 가능하나, 테스트용 NFT를 사전에 민팅해두어야 하므로 사전 조건이 복잡함. EVM NFT(ERC-721/1155)로 NFT 전송 파이프라인을 검증하고, Solana NFT는 단위/통합 테스트로 커버

### Phase 8: E2E 시나리오 등록 강제 (CI 검증)

새 기능 추가 시 E2E 시나리오도 함께 등록되도록 CI에서 강제한다.

**기능:**
- Action Provider ↔ E2E 시나리오 매핑 검증 스크립트
  - `providers/`에 ActionProvider 파일 존재 → `e2e-tests/scenarios/`에 대응 시나리오 존재 확인
- REST API 엔드포인트 ↔ 오프체인 시나리오 매핑 검증
  - 신규 API 엔드포인트 추가 시 대응 smoke 시나리오 필수
- CI workflow에 검증 스텝 추가 (PR 시 실행)
- 미등록 시 즉시 CI fail — 시나리오 미등록 PR은 머지 불가. E2E 시나리오 등록을 기능 개발의 일부로 취급하여 처음부터 강제
- 시나리오 파일 존재 여부뿐 아니라 최소 1개 테스트 케이스(`it`/`test` 블록) 존재를 검증하여 빈 파일 통과 방지

---

## 기술적 고려사항

1. **패키지 구조**: `packages/e2e-tests/`를 독립 패키지로 구성. 데몬 코드를 직접 import하지 않고 HTTP/MCP 프로토콜로만 통신하여 실제 배포 환경과 동일한 조건으로 테스트. MCP 테스트에는 `@modelcontextprotocol/sdk`를 클라이언트 의존성으로 사용.
2. **데몬 라이프사이클**: CI에서는 `npx @waiaas/daemon@${RELEASE_TAG}`으로 발행된 RC 버전을 명시적 설치 후 기동. 로컬 온체인에서는 이미 실행 중인 데몬에 접속. Push Relay는 별도 프로세스로 독립 라이프사이클 관리 (설치 → config 생성 → 기동 → health check → 종료).
3. **격리**: 각 테스트 실행마다 임시 디렉토리에 fresh config/DB를 생성하여 테스트 간 간섭 방지. 온체인 테스트는 기존 지갑을 사용하되 테스트 전후 상태를 검증.
4. **타임아웃**: 오프체인 시나리오는 개별 60초, 전체 5분 이내. 온체인 시나리오는 트랜잭션 확인 대기로 개별 120초, 전체 15분.
5. **시나리오 등록 강제**: 정적 분석으로 Provider/엔드포인트 목록을 추출하고 시나리오 파일과 대조. 100% 커버를 강제하는 게 아니라 "시나리오 파일 존재 + 최소 1개 테스트 케이스"를 체크하여 빈 파일 등록 방지 및 최소한의 의도적 검증을 보장.
6. **기존 테스트와의 관계**: 단위/통합 테스트(7,200+)는 코드 레벨 검증, E2E는 패키징 후 실행 검증. 중복이 아니라 보완 관계.

---

## 테스트 항목

- 데몬 설치 → config 생성 → 기동 → health check → 종료 라이프사이클
- 인증 플로우 (마스터 패스워드, 세션 CRUD) E2E
- 지갑 CRUD E2E (EVM + Solana)
- 다중 지갑 세션 (세션에 지갑 연결/해제, session_wallets) E2E
- Smart Account 생성/조회 + Lite/Full 모드 E2E
- UserOp Build/Sign + TTL 만료 E2E
- 정책 CRUD + dry-run 평가 E2E
- Admin UI 접근 + Settings CRUD E2E
- MCP 서버 연결 + tool listing E2E
- SDK 세션 + 기본 조회 E2E
- 알림 채널 설정 + 이벤트 발행 E2E
- 토큰 레지스트리 CRUD E2E
- connect-info 자기 발견 (userop capability 포함) E2E
- 감사 로그 생성 확인 E2E
- 백업 → 복원 → 데이터 일치 E2E
- Push Relay 기동 + 등록/해제 E2E (오프체인, mock push)
- Owner 인증 (SIWE/SIWS) 챌린지 발급 → 서명 검증 E2E
- x402 결제 설정 CRUD + dry-run 평가 E2E
- ERC-8004 에이전트 등록/해제/권한 조회 E2E
- ERC-8128 서명 생성/검증 E2E
- DeFi 프로토콜별 Admin Settings CRUD E2E
- 온체인 전송 (ETH/SOL, ERC-20/SPL) E2E
- 수신 트랜잭션 감지 E2E
- Lido Staking (Holesky testnet) stake/unstake E2E
- Hyperliquid (testnet) Spot/Perp 주문 + Sub Account E2E
- Across Bridge mainnet-only skip 처리 확인
- NFT 전송 ERC-721 / ERC-1155 (Sepolia) E2E
- testnet 미지원 프로토콜 skip 처리 확인
- Solana NFT (Metaplex) skip 처리 확인
- 사전 조건 체커: 데몬 미접속 시 에러 메시지
- 사전 조건 체커: 잔액 부족 시 리포트 + 프롬프트
- 사전 조건 체커: skip된 시나리오 리포트
- CI 시나리오 등록 검증: Provider 추가 시 시나리오 미등록 → CI fail
- CI 시나리오 등록 검증: API 엔드포인트 추가 시 시나리오 미등록 → CI fail
- CI 시나리오 등록 검증: 시나리오 파일은 존재하나 테스트 케이스 0개 → CI fail
- #282 네트워크 설정 키 완전성 검증 — NETWORK_TYPES SSoT 기반 동적 검증
- #283 README 테스트 배지 동적 업데이트 — Gist 기반 shields.io endpoint
