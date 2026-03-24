# WAIaaS 통합 타겟 프로젝트

> 다른 프로젝트에 WAIaaS Wallet Provider PR을 넣어 발견 경로를 만드는 전략

## 핵심 내러티브

> "에이전트는 자기 프라이빗 키를 직접 쥘 필요 없다."

에이전트가 해킹되면 키가 탈취된다. WAIaaS는 키를 데몬에 분리하고, 정책 엔진으로 피해 범위를 제한한다. 모든 통합 PR의 메시지는 이 한 줄에서 출발한다.

## WAIaaS 차별점

1. **셀프호스팅**: CDP(Coinbase), Crossmint과 달리 로컬 실행. 제3자 API 키 불필요, 수탁 리스크 없음
2. **정책 엔진**: 기본 거부(default-deny), 토큰 화이트리스트, 지출 한도 — 다른 wallet provider에 없는 보안
3. **Owner 승인**: SIWE/SIWS 또는 WalletConnect로 고가 트랜잭션 사람 승인
4. **멀티체인**: EVM + Solana 하나의 데몬에서 통합 API
5. **DeFi 내장**: Jupiter, 0x, LI.FI, Lido, Jito, Aave, Kamino, Pendle — 전송뿐 아니라 DeFi까지
6. **MCP 네이티브**: MCP 서버 내장, MCP 호환 프레임워크는 추가 작업 없이 사용 가능
7. **x402 내장**: HTTP 402 자동 결제 클라이언트 내장 (v1.5.1)
8. **Kill Switch**: 에이전트 이상 행동 시 즉시 차단

---

## Tier 1: 최우선 — 자율 에이전트 (키를 직접 보유하는 프로젝트)

이 프로젝트들은 에이전트가 프라이빗 키를 직접 쥐고 자율적으로 트랜잭션한다. WAIaaS의 키 분리 내러티브가 가장 강하게 먹히는 타겟.

### Conway Automaton — Skill PR / Identity 모듈 대안

- **GitHub**: https://github.com/Conway-Research/automaton
- **Stars**: ~2,900 / Forks: 565
- **무엇**: 자기 존재비용을 벌고, 복제하고, 진화하는 자율 AI. 부팅 시 Ethereum 지갑 생성, USDC/x402로 컴퓨팅 비용 결제. 수익 < 비용이면 죽음
- **현재 키 관리**: 에이전트 프로세스가 직접 키 생성·보유. 자식 에이전트도 자체 키 생성
- **통합 방식**: (1) `Conway-Research/skills` repo에 WAIaaS 스킬 제출 (커뮤니티 기여 환영 명시) (2) `src/identity/` 모듈의 대안으로 WAIaaS 데몬 위임 PR
- **왜 최우선**: x402 직접 매칭, SIWE 매칭, TypeScript+pnpm 동일 스택, 트윗 스레드 초안 이미 존재 (`web4-conway-tweet-thread-240222.md`). "자식 에이전트가 부모 자금을 훔치는" 시나리오에서 WAIaaS 정책 엔진이 정확히 해결책
- **접근 전략**: 트윗으로 먼저 접근(@0xSigil, @ConwayResearch) → 반응 보고 PR 방향 결정
- **노력**: 중간
- **활성도**: 매우 활발 (2026-02-28 최근 푸시, MIT)

### Solana Agent Kit (SendAI) — Wallet Backend PR

- **GitHub**: https://github.com/sendaifun/solana-agent-kit
- **Stars**: ~1,600 / Forks: 835
- **무엇**: AI 에이전트를 60+ Solana 프로토콜에 연결하는 툴킷. 스왑, 스테이킹, 렌딩, 퍼프 트레이딩, NFT 민팅
- **현재 키 관리**: raw keypair 모드(자율) 또는 Turnkey/Privy 임베디드 월렛(사람 확인)
- **통합 방식**: WAIaaS를 custody/policy backend로 추가. 에이전트는 SAK로 프로토콜 상호작용, WAIaaS로 키 관리·지출 한도·승인
- **왜 Tier 1**: WAIaaS Solana DeFi 스택(Jupiter, Kamino, Jito)과 직접 겹침. raw keypair 모드가 정확히 WAIaaS가 해결하는 문제
- **노력**: 중간
- **활성도**: 활발 (Apache-2.0)

### Heurist Agent Framework — x402 Wallet Backend

- **GitHub**: https://github.com/heurist-network/heurist-agent-framework
- **Stars**: ~779 / Forks: 79
- **무엇**: 크립토 네이티브 AI 에이전트 프레임워크. 내장 지갑으로 AI 추론 비용을 x402로 결제
- **현재 키 관리**: 에이전트가 직접 지갑 보유, 추론 서비스 비용 자율 결제
- **통합 방식**: WAIaaS x402 클라이언트를 wallet backend로. 추론별 지출 한도 정책 가능
- **왜 Tier 1**: x402 직접 매칭, "AI가 추론 비용을 지불한다"는 Conway와 동일한 패턴
- **노력**: 중간
- **활성도**: 매우 활발 (2026-02-27 최근 푸시)

### OpenClaw — MCP Skill / Crypto MCP PR

- **GitHub**: https://github.com/openclaw/openclaw
- **Stars**: ~302,000 / Forks: ~50,000+
- **무엇**: 가장 빠르게 성장한 오픈소스 AI 에이전트 프레임워크. 20+ 메시징 채널, 800+ 스킬 마켓플레이스, 멀티 에이전트 라우팅, 로컬 Gateway 컨트롤 플레인
- **현재 크립토 통합**: Composio 통해 Blocknative MCP(멤풀/가스), AnChain AML/지갑 리스크 MCP 이미 존재. 하지만 실제 지갑 관리/트랜잭션 실행 MCP는 없음
- **통합 방식**: WAIaaS MCP 서버를 OpenClaw Skill로 발행. MCP 네이티브 지원이므로 추가 작업 최소. 또는 `openclaw/skills` 커뮤니티 repo에 WAIaaS 스킬 제출
- **왜 Tier 1**: 302K stars — 사실상 가장 큰 에이전트 생태계. MCP 네이티브라 WAIaaS MCP 서버 바로 사용 가능. 크립토 MCP 이미 존재하지만 지갑 관리가 빠져 있는 빈틈
- **노력**: 낮음 (기존 MCP 서버 그대로 활용)
- **활성도**: 역대급 (GitHub 역사상 최빠른 성장, MIT)
- **🔗 PR 제출됨**: https://github.com/openclaw/openclaw/pull/48327 (2026-03-17, `skills/waiaas/SKILL.md`)
- **🔗 ClawHub 발행됨**: https://clawhub.ai/minhoyoo-iotrust/waiaas-wallet (v1.0.1, Benign)
- **참고**: repo에 `r: skill` auto-close 정책 있음 — 스킬 PR은 ClawHub로 보내라는 정책. PR 코멘트로 번들 포함 근거 설명 완료. auto-close 되더라도 ClawHub 경로로 사용자 접근 가능

---

## Tier 2: 에이전트 프레임워크 (Wallet Provider 통합)

이 프로젝트들은 에이전트 프레임워크로, wallet provider 플러그인 구조를 갖고 있다. WAIaaS를 하나의 wallet provider 옵션으로 추가.

### Nanobot — ClawHub Skill / MCP SSE PR

- **GitHub**: https://github.com/HKUDS/nanobot
- **Stars**: ~33,900 / Forks: ~5,600
- **무엇**: ~4,000줄 Python. OpenClaw(317K stars, TS)의 초경량 재구현. 홍콩대 HKUDS 제작. MCP SSE 지원(v0.1.4~). ClawHub 스킬 생태계 공유. 11개 채널(Telegram, Discord, WhatsApp, Feishu, Slack, Email, QQ, DingTalk, WeCom, Matrix, Mochat). 채널 플러그인 아키텍처
- **현재 키 관리**: 없음 (크립토 기능 미내장, 머지된 크립토 스킬 0개)
- **통합 방식**: (1) MCP SSE로 WAIaaS MCP 서버 직접 연결 (설정만으로 도구 자동 등록) (2) ClawHub에 WAIaaS 스킬 발행 — OpenClaw과 동일 생태계라 양쪽 사용자 모두 도달 (3) 빌트인 스킬 PR
- **왜 Tier 2**: OpenClaw과 ClawHub 스킬 생태계 공유 → OpenClaw 스킬 PR과 동시 진행 시 시너지. Python SDK 존재. 33.9K stars 대규모 커뮤니티. 크립토 스킬 선점 가능
- **노력**: 낮음 (MCP SSE 경로 — 설정 문서 PR) / 중간 (ClawHub 스킬 발행)
- **활성도**: 매우 활발 (v0.1.4.post4, 2026-03-08, MIT)
- **🔗 PR 제출됨**: https://github.com/HKUDS/nanobot/pull/2105 (2026-03-17, `nanobot/skills/waiaas/SKILL.md`)

### NanoClaw — Claude Tool Definition / MCP PR

- **GitHub**: https://github.com/qwibitai/nanoclaw
- **Stars**: ~22,800 / Forks: ~5,400
- **무엇**: ~500줄 TypeScript. Anthropic Claude Agent SDK 기반. 에이전트가 격리된 Linux 컨테이너에서 실행(Apple Container/Docker). 에이전트 스윔 지원. "포크하고, 커스터마이징하고, 소유하세요" 철학
- **현재 키 관리**: 없음 (NWC Lightning 스킬 PR만 존재, EVM/Solana 없음)
- **통합 방식**: `.claude/skills/add-wallet/SKILL.md` — 6단계 설치 지침 (Claude Code가 읽고 코드 변환 실행). 소스 코드 직접 수정 PR은 거부됨 — 기능 추가는 반드시 스킬로
- **왜 Tier 2**: TypeScript — `@waiaas/sdk` 직접 import 가능. 에이전트 스윔 → WAIaaS 멀티 월렛 세션(v26.4)과 시너지. 컨테이너 격리 + WAIaaS 키 분리 = 이중 보안. 500줄이라 코드 이해 즉시 가능
- **노력**: 낮음~중간
- **활성도**: 활발 (MIT)
- **🔗 PR 제출됨**: https://github.com/qwibitai/nanoclaw/pull/1146 (2026-03-17, `.claude/skills/add-wallet/SKILL.md`)

### IronClaw — WASM Tool + Credential Vault PR

- **GitHub**: https://github.com/nearai/ironclaw
- **Stars**: ~9,800 / Forks: ~1,070
- **무엇**: Rust 기반 보안 우선 에이전트 프레임워크. Illia Polosukhin(Transformer 논문 공저자, NEAR Protocol 창립자) 제작. WASM 샌드박스, AES-256-GCM 자격 증명 볼트, 프롬프트 주입 방어, 엔드포인트 허용 목록, Docker 샌드박스. 4계층 심층 방어
- **현재 키 관리**: 자격 증명 볼트(AES-256-GCM)에 키 저장. 도구는 WASM 격리 컨테이너에서 실행
- **통합 방식**: WAIaaS API를 WASM 도구로 컴파일. 자격 증명 볼트에 WAIaaS 세션 토큰 저장. 엔드포인트 허용 목록에 WAIaaS API 등록
- **왜 Tier 2**: NEAR 창립자의 프로젝트라 크립토 통합에 자연스럽게 관심. 보안 우선 철학이 WAIaaS 3계층 보안과 완벽 일치. 다만 Rust + WASM 컴파일 필요
- **노력**: 중간~높음 (WASM 컴파일 필요)
- **활성도**: 활발 (v0.16.1, 2026-03-06, Apache-2.0)

### GOAT SDK — Wallet Provider PR

- **GitHub**: https://github.com/goat-sdk/goat
- **Stars**: ~957 / Forks: 284
- **무엇**: 온체인 에이전트 금융 툴킷. 200+ 도구, 30+ 체인. LangChain, Vercel AI SDK, ElizaOS와 호환
- **통합 방식**: `WAIaaSWalletClient` 구현 — `EVMWalletClient`, `SolanaWalletClient` 인터페이스를 WAIaaS REST API로 위임
- **통합 가이드**: `typescript/docs/5-add-a-wallet-provider.md`에 명시적으로 설명됨
- **외부 PR**: 수락 (MIT, "open an issue or submit a pull request" 안내)
- **노력**: 중간. `@goat-sdk/wallet-waiaas`로 패키지 발행. TS + Python 둘 다 가능

### Coinbase AgentKit — WalletProvider PR

- **GitHub**: https://github.com/coinbase/agentkit
- **Stars**: ~1,100 / Forks: 650
- **무엇**: Coinbase의 AI 에이전트 크립토 툴킷. LangChain, Vercel AI SDK, OpenAI Agents SDK 지원
- **통합 방식**: `WAIaaSWalletProvider` 구현. 기존 `CdpEvmWalletProvider`, `ViemWalletProvider`, `PrivyWalletProvider`와 동급
- **내러티브**: "CDP 클라우드 vs WAIaaS 셀프호스팅" — 같은 AgentKit 안에서 선택지 제공
- **노력**: 중간. TS + Python 둘 다

### ElizaOS — Plugin PR

- **GitHub**: https://github.com/elizaOS/eliza
- **Stars**: ~17,600 / Forks: 5,400
- **무엇**: 가장 인기 있는 자율 AI 에이전트 프레임워크. 플러그인 아키텍처
- **통합 방식**: `@elizaos/plugin-waiaas` — walletProvider + actions. 또는 기존 MCP 서버 직접 활용
- **노력**: 중간~높음. 기존 plugin-evm, plugin-solana 패턴 따라야 함
- **왜 Tier 2**: 스타 수는 가장 높지만 플러그인 구현 노력이 큼

---

## Tier 3: x402 / 결제 생태계

WAIaaS에 x402 클라이언트가 내장되어 있으므로, x402 생태계의 wallet backend로 포지셔닝.

### Coinbase x402 Protocol

- **GitHub**: https://github.com/coinbase/x402
- **Stars**: ~5,500 / Forks: 1,183
- **무엇**: AI 에이전트용 HTTP 402 결제 프로토콜. 140M+ 트랜잭션 처리
- **통합**: x402 클라이언트 예제에 WAIaaS wallet backend 추가. "x402로 결제할 때 WAIaaS로 키 관리"
- **노력**: 낮음 (예제/문서 PR)

### Google A2A x402 Extension

- **GitHub**: https://github.com/google-agentic-commerce/a2a-x402
- **Stars**: ~460 / Forks: 104
- **무엇**: Agent-to-Agent 프로토콜에 x402 결제 추가. Google 후원
- **통합**: A2A 에이전트의 wallet backend로 WAIaaS 예제 추가
- **노력**: 낮음

### Lucid Agents (Daydreams)

- **GitHub**: https://github.com/daydreamsai/lucid-agents
- **Stars**: ~170 / Forks: 45
- **무엇**: 60초 만에 AI 에이전트 부트스트랩. x402, A2A, ERC-8004 네이티브 지원. `@lucid-agents/wallet` 패키지
- **통합**: `@lucid-agents/wallet` 대안으로 WAIaaS custody backend 제공
- **왜 주목**: 기술 스택 동일 (Hono, SQLite, TypeScript), 아키텍처가 WAIaaS와 가장 유사
- **노력**: 중간

---

## Tier 4: MCP 디렉토리 일괄 등록

코드 작업 없이 등록만으로 노출을 얻을 수 있는 채널.

### 4-A: GitHub PR (완료/진행 중)

| 타겟 | Stars | 상태 | 링크 |
|------|-------|------|------|
| **punkpeye/awesome-mcp-servers** | ~81,900 | ✅ **머지 완료** (AAA 스코어 달성, Glama 배지 포함) | https://github.com/punkpeye/awesome-mcp-servers/pull/3823 |
| **royyannick/awesome-blockchain-mcps** | ~33 | ✅ PR 제출 | https://github.com/royyannick/awesome-blockchain-mcps/pull/27 |
| **badkk/awesome-crypto-mcp-servers** | ~127 | ✅ PR 제출 + Glama 배지 추가 | https://github.com/badkk/awesome-crypto-mcp-servers/pull/31 |
| **hive-intel/awesome-crypto-mcp-servers** | ~50+ | ✅ PR 제출 + Glama 배지 추가 | https://github.com/hive-intel/awesome-crypto-mcp-servers/pull/5 |
| **Cline MCP Marketplace** | ~753 | 미진행 | GitHub Issue |

### 4-B: 공식/고임팩트 레지스트리

| 타겟 | 제출 방법 | 상태 | 왜 중요 |
|------|----------|------|--------|
| **Glama.ai** | 웹 제출 (glama.ai/mcp/servers) | ✅ **AAA 달성** (Security A, License A, Quality A). Claim 완료, Docker 릴리스 완료, 60 tools 감지 | [서버 페이지](https://glama.ai/mcp/servers/minhoyoo-iotrust/WAIaaS). awesome-mcp-servers PR 머지 조건 충족 |
| **Official MCP Registry** | CLI (`mcp-publisher`) | ⚠️ server.json 유효성 통과, `mcp-publisher login` + `publish` 실행 대기 | 공식 레지스트리. 모든 MCP 클라이언트가 소비. `mcpName` 필드 + server.json 준비 완료 |
| **modelcontextprotocol/servers** | GitHub PR | ✅ PR 제출 (README PR 미수락 정책으로 close 가능) | [#3691](https://github.com/modelcontextprotocol/servers/pull/3691) |
| **Anthropic Connectors** | 직접 연락 (integrations@anthropic.com) | 미진행 | Claude Desktop/Web/Mobile 전체 사용자 직접 노출. 공개 제출 양식 없음 |
| **Docker MCP Catalog** | GitHub PR (docker/mcp-registry) | ✅ PR 제출 | [#1968](https://github.com/docker/mcp-registry/pull/1968). Docker Desktop 통합. 엔터프라이즈 도달 |
| **Cursor Directory** | 웹 제출 (cursor.directory/plugins/new) | ⚠️ `.mcp.json` 생성 완료, 웹 제출 대기 | PR 미수락 → 웹 폼 전용. `.mcp.json` 자동 감지. 250K+ 월간 개발자 |
| **Smithery.ai** | CLI (`@smithery/cli`) | ⚠️ 빌드 성공, scan 실패 — `createSandboxServer` export 필요 | MCP 서버 호스팅/디스커버리. stdio 서버는 sandbox 함수 필요 (데몬 없이 도구 스키마만 반환하는 mock 서버) |

### 4-C: 커뮤니티 웹 디렉토리 (웹 폼 일괄 제출)

| 타겟 | URL | 상태 |
|------|-----|------|
| mcpservers.org | mcpservers.org | 미진행 |
| mcp.so | mcp.so | ✅ 등록 완료 |
| PulseMCP | pulsemcp.com | 미진행 |
| LobeHub MCP | lobehub.com | 미진행 |
| MCP Market | mcpmarket.com | 미진행 |
| mcpserver.dev | mcpserver.dev | 미진행 |
| mcpserve.com | mcpserve.com/submit | 미진행 |
| claudemcp.com | claudemcp.com/servers | 미진행 |
| mcpserverdirectory.org | mcpserverdirectory.org/submit | 미진행 |
| mcp-servers-hub.net | mcp-servers-hub.net/submit | 미진행 |
| mcpserverhub.com | mcpserverhub.com/submit | 미진행 |
| hubmcp.dev | hubmcp.dev | 미진행 |
| mcpserver.cc | mcpserver.cc | 미진행 |
| apitracker.io | apitracker.io/mcp-servers | 미진행 |
| aiagentslist.com | aiagentslist.com/mcp-servers | 미진행 |
| Portkey | portkey.ai/mcp-servers | 미진행 |
| claudemcp.org | claudemcp.org | 미진행 |
| mcpservers.com | mcpservers.com | 미진행 |

---

## Tier 5: 기회가 되면

| 프로젝트 | Stars | 비고 |
|----------|-------|------|
| **ZeroClaw** | ~27,200 | Rust trait 기반. 컴파일 타임 통합 필요. <5MB RAM 초경량 |
| **PicoClaw** | ~25,000 | Go 기반. $10 하드웨어 타겟. HTTP 클라이언트로 REST API 호출 가능하나 리소스 제약 |
| **CrewAI** | ~44,900 | MCP 이미 호환. 크립토 비주류 |
| **Rig (0xPlaygrounds)** | ~6,200 | Rust 코드베이스, 높은 노력 |
| **Fetch.ai uAgents** | ~1,500 | ASI Alliance 니치 생태계 |
| **Valory/OLAS** | ~114 | Safe 멀티시그 이미 사용 중 |
| **Lit Protocol Agent Wallet** | ~52 | MPC 기반, 보완적이지만 경쟁 |
| **TinyClaw** | ~138 | GPL-3.0 라이선스 제약. 커뮤니티 소규모 |

---

## 추천 실행 순서

### Phase 1: 즉시 실행 (하루)

| 순서 | 작업 | 예상 시간 | 기대 효과 |
|------|------|----------|----------|
| 1 | **awesome-mcp-servers PR** | 1시간 | 81.9K stars repo에 노출 |
| 2 | **MCP 웹 디렉토리 일괄 등록** (6곳) | 2시간 | 웹 폼 제출만으로 완료 |
| 3 | **crypto/blockchain MCP 리스트 PR** | 1시간 | 크립토 타겟 오디언스 |
| 4 | **Cline Marketplace Issue** | 30분 | Cline 사용자 직접 도달 |

### Phase 2: MCP 생태계 진입 (3일) ✅ 완료

| 순서 | 작업 | 상태 | 링크 |
|------|------|------|------|
| 5 | **ClawHub 스킬 발행** | ✅ 발행 완료 (v1.0.1, Benign) | https://clawhub.ai/minhoyoo-iotrust/waiaas-wallet |
| 6 | **OpenClaw Skill PR** | ✅ PR 제출 | https://github.com/openclaw/openclaw/pull/48327 |
| 7 | **Nanobot Skill PR** | ✅ PR 제출 | https://github.com/HKUDS/nanobot/pull/2105 |
| 8 | **NanoClaw Wallet Skill PR** | ✅ PR 제출 | https://github.com/qwibitai/nanoclaw/pull/1146 |

### Phase 3: 관계 구축 + x402 (1주)

| 순서 | 작업 | 예상 시간 | 기대 효과 |
|------|------|----------|----------|
| 9 | **Conway 트윗 접근** | 1시간 | @0xSigil 반응 확인, PR 방향 결정 |
| 10 | **x402 생태계 예제 PR** (Coinbase x402, A2A) | 2~3일 | x402 사용자 전체에 노출 |

### Phase 4: 코드 통합 (2~4주)

| 순서 | 작업 | 예상 시간 | 기대 효과 |
|------|------|----------|----------|
| 11 | **Conway Skill PR** | 1주 | 자율 에이전트 생태계 진입 |
| 12 | **GOAT SDK Wallet Provider PR** | 1~2주 | 온체인 에이전트 프레임워크 진입 |
| 13 | **Solana Agent Kit PR** | 1~2주 | Solana DeFi 에이전트 생태계 |
| 14 | **IronClaw WASM Tool PR** | 1~2주 | 보안 에이전트 생태계. NEAR 창립자 프로젝트 |
| 15 | **Coinbase AgentKit PR** | 1~2주 | Coinbase 생태계 |
| 16 | **ElizaOS Plugin PR** | 2~3주 | 가장 큰 에이전트 프레임워크 |

---

*작성일: 2026-03-01*
*수정일: 2026-03-17 — MCP 디렉토리 등록: Glama 등록(claim 미완, AAA 필요), mcp.so 등록 완료, Smithery 빌드 성공(sandbox 함수 필요). awesome-mcp-servers PR에 Glama 배지 추가. glama.json main 푸시*
*수정일: 2026-03-24 — Glama AAA 스코어 달성 (Docker 릴리스, 60 tools). awesome-mcp-servers PR #3823 머지 완료 (이전 PR #2479 → close → 재제출). 배지 활용: README Glama 배지 추가, badkk/hive-intel PR 배지 추가, modelcontextprotocol/servers PR #3691, Docker MCP Catalog PR #1968, MCP Registry mcp-publisher 준비(server.json+mcpName), Cursor Directory .mcp.json 생성*
*수정일: 2026-03-17 — Phase 2 완료. ClawHub 발행(waiaas-wallet v1.0.1 Benign) + OpenClaw PR #48327 + Nanobot PR #2105 + NanoClaw PR #1146 제출*
*수정일: 2026-03-16 — Claw Family 생태계 추가 (OpenClaw, Nanobot, NanoClaw, IronClaw, ZeroClaw, PicoClaw, TinyClaw). Phase 2 MCP 생태계 진입 신설. 실행 순서 재편성*
*관련: agent-autonomous-onboarding.md, promotion-plan.md, ../content/web4-conway-tweet-thread-240222.md*
