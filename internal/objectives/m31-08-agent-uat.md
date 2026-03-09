# 마일스톤 m31-08: Agent UAT (메인넷 인터랙티브 검증)

- **Status:** SHIPPED
- **Milestone:** v31.8
- **Completed:** 2026-03-10

## 목표

AI 에이전트(Claude Code 등)가 마크다운으로 작성된 테스트 시나리오를 읽고, 사용자와 인터랙티브하게 메인넷에서 실제 기능을 검증하는 Agent UAT 체계를 구축한다. 새로운 기능(Action Provider, API 엔드포인트) 추가 시 Agent UAT 시나리오 등록을 CI로 강제하여, 기능 증가에 따라 메인넷 검증 시나리오도 함께 늘어나는 것을 구조적으로 보장한다.

---

## 배경

### 기존 E2E 검증 체계의 한계

m31-07(E2E 자동 검증 체계)은 두 트랙으로 자동화한다:
- **오프체인 Smoke** (CI/CD): 데몬 기능의 60-70%를 블록체인 없이 검증
- **온체인 E2E** (testnet): Sepolia/Devnet/Holesky에서 기본 전송, 스테이킹 등 검증

그러나 메인넷에서의 실제 동작 확인은 여전히 수동이다:
- **DeFi 프로토콜 대부분이 mainnet-only**: Jupiter, 0x, LI.FI, Aave, Kamino, Pendle, Drift, DCent, Across, Hyperliquid 등
- **testnet과 mainnet의 차이**: 유동성, 슬리피지, 가스비, 컨트랙트 주소가 다름
- **RC 검증 시 누락 위험**: 기능이 90+ 마일스톤을 거쳐 누적되면서 전체 수동 커버가 불가능

### Agent UAT 접근

AI 에이전트를 테스트 드라이버로 활용하면 기존의 코드 기반 테스트 러너가 불필요해진다:
- **마크다운 시나리오**: 에이전트가 자연어로 시나리오를 이해하고 실행
- **인터랙티브 실행**: 시나리오별로 사용자에게 실행 여부와 금액을 확인
- **적응적 대응**: 예외 상황(잔액 부족, 슬리피지 초과 등)에서 에이전트가 판단
- **코드 변경 없는 시나리오 추가**: 마크다운 파일 하나로 새 시나리오 추가 가능

### 기존 지갑 재사용 원칙

Agent UAT는 사용자의 실제 운영 데몬에서 실행되므로, **시나리오마다 지갑을 새로 생성하지 않는다.** 테스트 후 쓸모없는 지갑이 쌓이는 것을 방지하기 위해 다음 원칙을 따른다:

- **모든 시나리오는 사용자가 사전에 준비한 기존 지갑을 사용한다.** 에이전트는 시작 시 세션에 연결된 지갑 목록을 조회하고, 각 시나리오의 네트워크 요구사항에 맞는 지갑을 자동 선택하여 사용자에게 확인한다.
- **지갑 CRUD 자체를 검증하는 시나리오는 생성 → 테스트 → 삭제를 하나로 묶는다.** 시나리오 종료 시 테스트용 지갑이 남지 않도록 정리까지 포함한다.
- **지갑 삭제 실패 시 에이전트가 사용자에게 알린다.** 수동 정리가 필요한 경우 지갑 ID를 명시한다.

### 실행 플로우

```
1. 사용자가 데몬을 기동하고 기존 지갑에 코인을 준비
2. 사용자가 세션 토큰을 에이전트에게 제공
3. 에이전트가 세션에 연결된 지갑 목록을 조회하고 네트워크별로 정리
4. 에이전트가 _index.md를 읽고 시나리오 목록을 파악
5. 각 시나리오에 대해:
   a. 사전 조건 확인 (잔액, 네트워크, 필요 설정)
   b. 사용할 지갑을 자동 선택하고 사용자에게 확인
   c. 사용자에게 시나리오 설명 + 예상 비용 표시
   d. 사용자가 실행 여부/금액 결정
   e. 스킵 → 다음 시나리오로 이동
   f. 실행 → dry-run → 최종 승인 → 트랜잭션 실행 → 결과 검증
6. 전체 리포트 출력 (실행/스킵/실패 요약, 총 소비 가스비)
```

---

## 범위

### Phase 1: Agent UAT 시나리오 포맷 및 인프라

마크다운 시나리오 포맷을 정의하고, 에이전트가 실행할 수 있는 skill 파일과 인덱스 구조를 구축한다.

**기능:**
- Agent UAT 마크다운 시나리오 포맷 정의 (섹션 구조, 메타데이터, 검증 항목)
- `packages/e2e-tests/scenarios/agent-uat/_index.md` — 시나리오 목록, 실행 순서, 카테고리별 그룹핑
- `.claude/skills/agent-uat/SKILL.md` — `/agent-uat` 슬래시 커맨드로 트리거되는 개발용 skill. 디렉토리명(`agent-uat`)이 커맨드명이 되며, 최종 사용자용 `skills/`(npm 배포)와 분리하여 개발 환경에서만 사용. 서브커맨드:
  - `/agent-uat` 또는 `/agent-uat help` — 사용법, 사전 준비 사항, 카테고리 목록, 옵션 설명 표시
  - `/agent-uat run` — 전체 시나리오 순회 (testnet + mainnet + admin)
  - `/agent-uat run testnet` — testnet 시나리오만 (Sepolia, Devnet)
  - `/agent-uat run mainnet` — mainnet 시나리오만 (전송 + DeFi + 고급 기능)
  - `/agent-uat run transfer` — 기본 전송 시나리오만
  - `/agent-uat run defi` — DeFi 프로토콜 시나리오만
  - `/agent-uat run admin` — 관리자 기능 시나리오만
  - `/agent-uat run --network ethereum-mainnet` — 특정 네트워크 시나리오만
- 시나리오 포맷 명세:
  - **메타데이터**: 네트워크, 필요 잔액, 필요 API, 카테고리, 난이도
  - **사전 조건**: 잔액 요구사항, 설정 요구사항, 의존 시나리오
  - **시나리오 단계**: 순서대로 실행할 API 호출 + 사용자 확인 포인트
  - **검증 항목**: 트랜잭션 성공, 잔액 변동, 감사 로그, 알림 등 체크리스트
  - **예상 비용**: 가스 추정, dry-run 참조 안내
  - **실패 시 조치**: 롤백 가능 여부, 수동 확인 필요 항목

### Phase 2: Testnet 시나리오 + 기본 전송 시나리오

m31-07 Phase 6-7에서 vitest 코드로 구현한 testnet 온체인 E2E를 마크다운 시나리오로도 수행할 수 있도록 확장한다. 기존 vitest 기반 자동 테스트(`pnpm e2e:onchain`)는 그대로 유지하고, skill 기반 인터랙티브 실행을 추가하여 에이전트가 사용자와 대화하며 testnet 검증을 진행할 수 있게 한다. 이어서 mainnet 기본 전송 시나리오도 작성한다.

**Testnet 시나리오:**
- ETH 전송 (Sepolia): 자기 자신에게 소액 전송 → 잔액 확인
- SOL 전송 (Devnet): 자기 자신에게 소액 전송 → 잔액 확인
- ERC-20 토큰 전송 (Sepolia): 테스트 토큰 → 잔액 확인
- SPL 토큰 전송 (Devnet): 테스트 토큰 → 잔액 확인
- Hyperliquid (testnet): Spot/Perp 주문 생성/취소, Sub Account
- NFT 전송 (Sepolia): ERC-721 / ERC-1155 전송
- 수신 트랜잭션 감지 (Sepolia/Devnet): 외부 전송 → IncomingTxMonitor 감지

**Mainnet 기본 전송 시나리오:**
- ETH 전송 (ethereum-mainnet): 자기 자신에게 소액 전송 → 잔액 확인
- SOL 전송 (solana-mainnet): 자기 자신에게 소액 전송 → 잔액 확인
- ERC-20 토큰 전송 (ethereum-mainnet): USDC/USDT 등 → 잔액 확인
- SPL 토큰 전송 (solana-mainnet): USDC 등 → 잔액 확인
- 다중 체인 전송: Polygon, Arbitrum, Base 등 L2 네이티브 전송
- NFT 전송: ERC-721 / ERC-1155 전송 (보유 NFT 있는 경우)

### Phase 3: DeFi 프로토콜 시나리오

각 DeFi Action Provider에 대응하는 Agent UAT 시나리오를 작성한다. mainnet-only 프로토콜의 실제 동작을 검증하는 핵심 트랙이다.

**시나리오:**
- Jupiter Swap (solana-mainnet): SOL → USDC 스왑 → 잔액 확인
- 0x EVM DEX Swap (ethereum-mainnet/polygon 등): ETH → USDC 스왑
- LI.FI Bridge (크로스체인): L1 → L2 브릿지 전송
- Across Bridge (크로스체인): L2 → L2 브릿지 전송
- Lido Staking (ethereum-mainnet): ETH → stETH stake
- Jito Staking (solana-mainnet): SOL → JitoSOL stake
- Aave V3 Lending (ethereum-mainnet/polygon 등): USDC supply → 포지션 확인
- Kamino Lending (solana-mainnet): USDC supply → 포지션 확인
- Pendle Yield (ethereum-mainnet): PT/YT 토큰 매매
- Drift Perp (solana-mainnet): USDC deposit → 포지션 개설/종료
- Hyperliquid Perp/Spot: 주문 생성/취소 → 포지션 확인
- DCent Swap (ethereum-mainnet 등): 스왑 실행 → 잔액 확인

### Phase 4: 고급 기능 및 관리자 기능 시나리오

Smart Account, 표준 프로토콜, Owner 인증, 운영 기능의 메인넷 검증과 함께, Admin UI 및 관리자 기능이 실제 데이터와 함께 정상 동작하는지 검증하는 시나리오를 작성한다.

**고급 기능 시나리오:**
- Smart Account 트랜잭션: UserOp Build → Sign → 실행 확인
- ERC-4337 Account Abstraction: Bundler를 통한 UserOp 제출
- WalletConnect Owner 승인: 트랜잭션 승인 요청 → Owner 서명
- x402 결제: x402 지원 서비스에 결제 요청 (실제 결제 가능한 경우)
- 수신 트랜잭션 감지: 외부에서 전송 → IncomingTxMonitor 감지 확인
- 잔액 모니터링: 잔액 변동 알림 발생 확인
- 가스비 조건부 실행: 가스비 상한 설정 → 조건 미충족 시 대기 확인

**관리자 기능 시나리오:**

Admin UI 검증은 에이전트가 Admin API 엔드포인트를 호출하고, 브라우저 접근 가능 여부를 확인하는 방식으로 수행한다. 실제 데이터가 있는 상태에서 동작 정확성을 검증하는 것이 핵심이다.

- Admin UI 전체 페이지 접근 검증: 네비게이션 메뉴에 등록된 모든 페이지 URL에 HTTP 요청 → 200 응답 확인. 메뉴 항목은 있지만 라우트가 없거나, 라우트는 있지만 페이지가 렌더링되지 않는 문제를 감지
- Admin 인증: 마스터 패스워드로 Admin UI 접근 → HTTP 200 확인
- Dashboard 정확성: Dashboard API 조회 → 실제 지갑 수, 총 잔액, 최근 트랜잭션과 일치 확인
- Admin Settings 반영: Settings 변경(예: 슬리피지 한도) → 실제 트랜잭션에서 변경된 설정이 적용되는지 확인
- 정책 관리 플로우: Admin UI에서 정책 생성 → 해당 정책이 트랜잭션에 실제 적용되는지 dry-run으로 확인
- 지갑 관리 탭: 지갑 목록 조회 → 실제 온체인 잔액과 Admin UI 표시 잔액 일치 확인
- NFT 탭: NFT 목록 조회 → 실제 보유 NFT와 Admin UI 표시 일치 확인 (NFT 보유 시)
- DeFi 포지션 탭: DeFi 포지션 조회 → 실제 온체인 포지션과 일치 확인 (포지션 보유 시)
- 알림 설정 + 수신: Admin에서 알림 채널 설정 → 트랜잭션 실행 → 실제 알림 수신 확인
- 감사 로그 정확성: 이전 시나리오에서 실행한 작업들의 감사 로그가 정확히 기록되었는지 확인
- 백업/복원 무결성: Admin에서 백업 생성 → 복원 → 지갑/정책/설정 데이터가 정확히 복원되는지 확인
- 토큰 레지스트리: 커스텀 토큰 등록 → 잔액 조회에 반영되는지 확인
- 통계/모니터링: Stats API 조회 → 실제 트랜잭션 수, 성공/실패 비율이 정확한지 확인

### Phase 5: CI 시나리오 등록 강제

새 기능 추가 시 Agent UAT 시나리오도 함께 등록되도록 CI에서 강제한다. m31-07 Phase 8(오프체인 E2E 시나리오 강제)과 동일한 패턴을 적용한다.

**기능:**
- Action Provider ↔ Agent UAT 시나리오 매핑 검증 스크립트
  - `packages/actions/src/providers/`에 Provider 디렉토리 존재 → `packages/e2e-tests/scenarios/agent-uat/`에 대응 시나리오 `.md` 파일 존재 확인
- REST API 엔드포인트 ↔ Agent UAT 시나리오 매핑 검증
  - 신규 API 엔드포인트 추가 시 대응 시나리오 필수 (기본 전송, DeFi 등 온체인 기능에 해당하는 엔드포인트)
- 시나리오 파일 유효성 검증
  - `.md` 파일 존재 여부뿐 아니라, 필수 섹션(메타데이터, 사전 조건, 시나리오, 검증 항목) 존재를 파싱으로 확인
  - 빈 시나리오(섹션만 있고 내용 없음) 방지
- Admin UI 라우트/메뉴 일관성 검증 스크립트
  - 라우터 정의(routes)에 등록된 path 목록과 네비게이션 메뉴(navigation)에 등록된 path 목록을 정적 분석으로 추출
  - 메뉴에 있지만 라우트에 없는 항목 → CI fail (클릭해도 페이지 없음)
  - 라우트에 있지만 메뉴에 없는 항목 → CI warning (접근 불가능한 페이지, 의도적 제외는 allowlist로 관리)
  - 새 기능 추가 시 Admin UI 메뉴/라우트 등록 누락을 자동 감지
- CI workflow에 검증 스텝 추가 (PR 시 실행)
- 미등록 시 CI fail — Agent UAT 시나리오 미등록 PR은 머지 불가
- `_index.md`에 시나리오가 등록되어 있는지도 검증 (고아 시나리오 방지)

---

## 기술적 고려사항

1. **마크다운 = 시나리오 정의, 에이전트 = 실행 엔진**: 별도 테스트 러너를 만들지 않는다. AI 에이전트가 skill 파일의 안내에 따라 시나리오 마크다운을 읽고 REST API / SDK를 직접 호출한다.
2. **비용 관리**: 모든 시나리오에서 dry-run을 먼저 실행하여 예상 가스비를 사용자에게 표시한다. 사용자가 금액을 직접 지정하므로 예기치 않은 대량 소비를 방지한다.
3. **기존 지갑 재사용**: 시나리오마다 지갑을 새로 생성하지 않는다. 사용자가 준비한 기존 지갑을 사용하고, 지갑 CRUD 검증이 필요한 경우 생성→테스트→삭제를 원자적으로 묶어 테스트 잔여물이 남지 않도록 한다.
4. **자기 전송 패턴**: 기본 전송 시나리오는 자기 자신에게 전송하여 자산 손실을 최소화한다 (가스비만 소모).
5. **시나리오 독립성**: 각 시나리오는 독립 실행 가능해야 한다. 의존 관계가 있는 경우(예: supply 후 withdraw) 사전 조건에 명시한다.
6. **기존 E2E와의 관계**: m31-07의 오프체인 Smoke(CI 자동)와 온체인 E2E(testnet vitest)는 코드 기반 자동 테스트로 그대로 유지한다. Agent UAT는 마크다운 기반 인터랙티브 테스트로, testnet과 mainnet 모두 커버한다. testnet 시나리오는 vitest 자동 테스트와 Agent UAT 인터랙티브 테스트 두 가지 방식으로 실행 가능하며, 중복이 아니라 자동화와 수동 검증의 보완 관계이다.
7. **Skill 파일 위치**: `.claude/skills/agent-uat/SKILL.md`에 배치하여 `/agent-uat` 슬래시 커맨드로 트리거한다. 최종 사용자용 `skills/`(npm 배포)와 분리하여 개발 환경에서만 노출한다.
8. **시나리오 등록 강제**: m31-07 Phase 8의 오프체인 E2E 시나리오 강제와 병렬로 동작한다. 하나의 CI 스텝에서 오프체인 E2E 시나리오와 Agent UAT 시나리오를 모두 검증할 수 있다.
9. **네트워크별 그룹핑**: 사용자가 특정 네트워크만 테스트하고 싶을 수 있으므로 `_index.md`에서 네트워크별 필터링을 지원한다.

---

## 테스트 항목

- 시나리오 포맷 유효성 검증 (필수 섹션 파싱 테스트)
- `_index.md` 파싱 및 시나리오 목록 추출 테스트
- ETH/SOL 전송 시나리오 (Sepolia/Devnet, testnet 인터랙티브)
- ERC-20/SPL 토큰 전송 시나리오 (Sepolia/Devnet, testnet 인터랙티브)
- Hyperliquid 시나리오 (testnet 인터랙티브)
- NFT 전송 시나리오 (Sepolia, testnet 인터랙티브)
- 수신 트랜잭션 감지 시나리오 (Sepolia/Devnet, testnet 인터랙티브)
- ETH/SOL 자기 전송 시나리오 (메인넷, 인터랙티브)
- ERC-20/SPL 토큰 전송 시나리오 (메인넷, 인터랙티브)
- L2 네이티브 전송 시나리오 (Polygon/Arbitrum/Base)
- NFT 전송 시나리오 (보유 NFT 있는 경우)
- Jupiter Swap 시나리오 (solana-mainnet)
- 0x EVM DEX Swap 시나리오 (ethereum-mainnet)
- LI.FI Bridge 시나리오 (크로스체인)
- Across Bridge 시나리오 (크로스체인)
- Lido Staking 시나리오 (ethereum-mainnet)
- Jito Staking 시나리오 (solana-mainnet)
- Aave V3 Lending 시나리오 (ethereum-mainnet)
- Kamino Lending 시나리오 (solana-mainnet)
- Pendle Yield 시나리오 (ethereum-mainnet)
- Drift Perp 시나리오 (solana-mainnet)
- Hyperliquid Perp/Spot 시나리오
- DCent Swap 시나리오
- Smart Account + UserOp 시나리오 (메인넷)
- WalletConnect Owner 승인 시나리오
- x402 결제 시나리오 (가능한 경우)
- 수신 트랜잭션 감지 시나리오
- 잔액 모니터링 알림 시나리오
- 가스비 조건부 실행 시나리오
- Admin 인증 + UI 접근 시나리오
- Dashboard 데이터 정확성 시나리오 (실제 지갑/잔액/트랜잭션 일치)
- Admin Settings 변경 → 실제 트랜잭션 적용 확인 시나리오
- 정책 생성 → dry-run 적용 확인 시나리오
- 지갑 관리 탭 잔액 일치 시나리오
- NFT 탭 보유 NFT 일치 시나리오 (보유 시)
- DeFi 포지션 탭 온체인 일치 시나리오 (포지션 보유 시)
- 알림 설정 → 트랜잭션 → 실제 알림 수신 시나리오
- 감사 로그 기록 정확성 시나리오
- 백업/복원 데이터 무결성 시나리오
- 토큰 레지스트리 등록 → 잔액 반영 시나리오
- 통계/모니터링 데이터 정확성 시나리오
- dry-run 예상 비용 표시 정확성 확인
- 사용자 스킵 시 다음 시나리오 정상 진행 확인
- 전체 리포트 출력 (실행/스킵/실패 요약)
- Admin UI 전체 페이지 접근 검증 시나리오 (모든 메뉴 URL → HTTP 200)
- Admin UI 라우트/메뉴 일관성 검증 (메뉴 항목 ↔ 라우트 정의 정적 분석)
- Admin UI 라우트/메뉴 불일치 시 CI fail 확인
- CI 시나리오 등록 강제: Provider 추가 시 Agent UAT 시나리오 미등록 → CI fail
- CI 시나리오 등록 강제: 시나리오 파일 존재하나 필수 섹션 누락 → CI fail
- CI 시나리오 등록 강제: `_index.md`에 미등록 시나리오 → CI fail
