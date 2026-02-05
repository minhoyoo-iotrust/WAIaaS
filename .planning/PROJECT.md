# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연 → 모니터링)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. CLI Daemon / Desktop App / Docker로 배포하며, REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## 현재 마일스톤: v0.2 Self-Hosted 보안 지갑 설계 및 구현

**목표:** 중앙 서버 없이 사용자가 직접 설치하여 운영하는 에이전트 지갑 시스템을 설계하고 구현한다. 체인 무관 보안 모델로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다.

**대상 기능:**
- 3계층 보안: 세션 기반 인증 + 시간 지연/승인 + 실시간 모니터링/긴급 정지
- 체인 추상화 계층 (Solana 1순위, EVM 2순위)
- Owner 지갑 연결 (브라우저 익스텐션, WalletConnect, 하드웨어 지갑)
- CLI Daemon + Desktop App + Docker 배포
- REST API + TypeScript/Python SDK + MCP Server

## 요구사항

### 검증됨

- ✓ AI 에이전트 vs 사람 사용자: WaaS 설계 차이점 분석 — v0.1 (CUST-02)
- ✓ 에이전트 지갑 생성/사용 방식 설계 — v0.1 (ARCH-01, ARCH-02)
- ✓ 커스터디 모델 비교 연구 — v0.1 (CUST-01, CUST-03, CUST-04)
- ✓ 주인-에이전트 관계 모델 설계 — v0.1 (REL-01~05)
- ✓ Solana 생태계 기술 스택 조사 — v0.1 (TECH-01, TECH-02, TECH-03)
- ✓ 활용 가능한 오픈소스 및 기존 솔루션 조사 — v0.1 (CUST-03)
- ✓ 에이전트 프레임워크 통합 방안 조사 — v0.1 (API-05, API-06)

### 활성

- [ ] 세션 기반 인증 시스템 (토큰 발급/만료/폐기, 사용량 추적)
- [ ] 시간 지연 + 승인 정책 엔진 (금액별 4단계: 즉시/알림/대기/승인)
- [ ] 실시간 알림 + 긴급 정지 (멀티 채널, Kill Switch, 자동 정지 규칙)
- [ ] Owner 지갑 연결 (Wallet Adapter, WalletConnect, 하드웨어 지갑)
- [ ] 체인 추상화 계층 (ChainAdapter 인터페이스, Solana/EVM 구현)
- [ ] 코어 지갑 서비스 (로컬 암호화 키스토어, 서명, 잔액 조회)
- [ ] REST API 서버 (세션 토큰/Owner 서명 인증, 14+ 엔드포인트)
- [ ] CLI Daemon (npm 패키지, init/start/status 명령)
- [ ] TypeScript SDK + Python SDK
- [ ] MCP Server (Claude Desktop 연동)
- [ ] Desktop App (Tauri/Electron, 승인 UI)
- [ ] 로컬 스토리지 (SQLite + 암호화 파일 + In-memory LRU)

### 범위 외

- SaaS 버전 (클라우드 호스팅) — Self-Hosted 우선, 클라우드는 추후 확장
- 온체인 스마트 컨트랙트 정책 (Squads 등) — 체인 무관 로컬 정책 엔진 우선
- 모바일 앱 — Desktop/CLI 우선
- ML 기반 이상 탐지 — 규칙 기반으로 시작
- 가격/비즈니스 모델 — 기술 구현 완료 후 별도 검토

## 컨텍스트

v0.1 Research & Design 마일스톤 완료 (2026-02-05). 5개 페이즈, 15개 플랜, 23개 요구사항 전체 완료.
v0.2에서 아키텍처 전환: Cloud-First → Self-Hosted-First. 중앙 서버/AWS 의존 제거.
v0.1 설계 중 활용 가능: IBlockchainAdapter 체인 추상화, 에이전트 생명주기 5단계, 4단계 에스컬레이션, 비상 정지 트리거, 모노레포 구조.
v0.1 설계 중 재설계 필요: 키 관리(KMS→로컬), 정책 시행(Squads→로컬 엔진), 인증(API Key→세션 토큰), 스토리지(PostgreSQL→SQLite).

### 알려진 이슈

- v0.1 클라우드 설계와 v0.2 셀프호스트 방향 간 전환 — 활용 전략 확립 완료
- 세션 토큰 시스템, 시간 지연 메커니즘, Owner 지갑 연결은 신규 설계 필요
- 로컬 키 저장 보안 (AES-256-GCM + Argon2id) 검증 필요

## 제약사항

- **배포**: Self-Hosted 전용 — 중앙 서버 의존 없이 사용자 로컬에서 완전 동작
- **보안**: 체인 무관(Chain-Agnostic) — 특정 블록체인 프로토콜에 의존하지 않는 보안 모델
- **블록체인**: Solana 1순위, EVM 2순위 — ChainAdapter로 추상화
- **언어**: 모든 기획 문서 한글 작성
- **의사결정 방식**: 질문 최소화, 직접 판단하여 최선의 방법 제시

## 주요 결정

| 결정 | 근거 | 결과 |
|------|------|------|
| Solana 우선 타겟 | 빠른 속도, 낮은 수수료, AI 에이전트 생태계 활발 | ✓ Good |
| API 우선 설계 | 에이전트는 UI가 아닌 API로 상호작용 | ✓ Good |
| AWS KMS + Nitro Enclaves + Squads 하이브리드 | 5년 36% 비용 절감, 벤더 락인 방지, 완전한 제어 | ⚠️ Revisit — v0.2에서 Self-Hosted로 전환 |
| Turnkey 결정 철회 → 직접 구축 | Phase 2 분석 결과 직접 구축이 비용/기능 모두 우위 | ✓ Good |
| TypeScript + Fastify + PostgreSQL | 생태계 성숙도, 성능, 타입 안전성 | ⚠️ Revisit — v0.2에서 Hono/Fastify + SQLite로 전환 |
| Dual Key 아키텍처 | Owner(통제) + Agent(자율) 역할 분리, defense-in-depth | ✓ Good — 개념 유지, 구현 방식 변경 |
| 3중 정책 검증 | 서버 → Enclave → Squads 온체인, fail-safe | ⚠️ Revisit — v0.2에서 로컬 3계층으로 전환 |
| Budget Pool + Hub-and-Spoke | 다수 에이전트 효율적 관리, 예산 격리 | ✓ Good |
| API Key Primary 인증 | AI 에이전트 비인터랙티브 특성에 최적 | ⚠️ Revisit — v0.2에서 세션 토큰 기반으로 전환 |
| Zod SSoT | 스키마 → 타입 + OpenAPI + 런타임 검증 통합 | ✓ Good |
| Cloud → Self-Hosted 전환 | 서비스 제공자 의존 제거, 사용자 완전 통제, 체인 무관 보안 | — Pending |
| 3계층 보안 (세션→시간지연→모니터링) | 다층 방어, 키 유출 시에도 피해 최소화, 주인 개입 시간 확보 | — Pending |
| 체인 무관 정책 엔진 | Squads 등 온체인 의존 제거, 모든 체인에 동일 보안 적용 | — Pending |
| 세션 기반 에이전트 인증 | 영구 키 대신 단기 토큰, 유출 시 만료로 자동 무효화 | — Pending |

---
*최종 업데이트: 2026-02-05 after v0.2 milestone start*
