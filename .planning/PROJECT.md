# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연 → 모니터링)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. CLI Daemon / Desktop App / Docker로 배포하며, REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## 현재 상태

v0.1 Research & Design + v0.2 Self-Hosted Secure Wallet Design + v0.3 설계 논리 일관성 확보 완료 (2026-02-06).
39개 플랜, 105개 요구사항, 17개 설계 문서 + 5개 대응표/매핑 문서를 통해 전체 시스템 아키텍처, 상세 설계, 그리고 설계 문서 간 논리 일관성이 확보됨. 구현 준비 완료.

## 요구사항

### 검증됨

- ✓ AI 에이전트 vs 사람 사용자: WaaS 설계 차이점 분석 — v0.1 (CUST-02)
- ✓ 에이전트 지갑 생성/사용 방식 설계 — v0.1 (ARCH-01, ARCH-02)
- ✓ 커스터디 모델 비교 연구 — v0.1 (CUST-01, CUST-03, CUST-04)
- ✓ 주인-에이전트 관계 모델 설계 — v0.1 (REL-01~05)
- ✓ Solana 생태계 기술 스택 조사 — v0.1 (TECH-01, TECH-02, TECH-03)
- ✓ 활용 가능한 오픈소스 및 기존 솔루션 조사 — v0.1 (CUST-03)
- ✓ 에이전트 프레임워크 통합 방안 조사 — v0.1 (API-05, API-06)
- ✓ 세션 기반 인증 시스템 설계 (JWT HS256, SIWS/SIWE, 세션 제약) — v0.2 (SESS-01~05)
- ✓ 시간 지연 + 승인 정책 엔진 설계 (4-tier, DatabasePolicyEngine) — v0.2 (LOCK-01~04)
- ✓ 실시간 알림 + 긴급 정지 설계 (멀티 채널, Kill Switch, AutoStop) — v0.2 (NOTI-01~05)
- ✓ Owner 지갑 연결 설계 (WalletConnect v2, ownerAuth) — v0.2 (OWNR-01~03)
- ✓ 체인 추상화 계층 설계 (IChainAdapter, SolanaAdapter, EvmStub) — v0.2 (CHAIN-01~03)
- ✓ 코어 지갑 서비스 설계 (AES-256-GCM 키스토어, sodium guarded memory) — v0.2 (KEYS-01~04)
- ✓ REST API 서버 설계 (Hono, 31 엔드포인트, OpenAPI 3.0) — v0.2 (API-01~06)
- ✓ CLI Daemon 설계 (init/start/stop/status, 데몬 라이프사이클) — v0.2 (CLI-01~04)
- ✓ TypeScript SDK + Python SDK 인터페이스 설계 — v0.2 (SDK-01~02)
- ✓ MCP Server 설계 (6 도구, 3 리소스, stdio) — v0.2 (MCP-01~02)
- ✓ Desktop App 아키텍처 설계 (Tauri 2, Sidecar, 8 화면) — v0.2 (DESK-01~04)
- ✓ Docker 배포 스펙 설계 (compose, named volume) — v0.2 (DOCK-01)
- ✓ Telegram Bot 설계 (2-Tier 인증, 인라인 키보드) — v0.2 (TGBOT-01~02)
- ✓ 로컬 스토리지 설계 (SQLite 7-table, Drizzle ORM) — v0.2 (CORE-02)
- ✓ v0.1→v0.2 변경 매핑 및 SUPERSEDED 표기 — v0.3 (LEGACY-01~09)
- ✓ CRITICAL 의사결정 확정 (포트, Enum, Docker, 자금충전) — v0.3 (CRIT-01~04)
- ✓ Enum/상태값 통합 대응표 + config.toml 보완 — v0.3 (ENUM-01~04, CONF-01~05)
- ✓ REST API↔API Framework 스펙 통일 — v0.3 (API-01~06)
- ✓ 11개 구현 노트 추가 — v0.3 (NOTE-01~11)

### 활성

(v0.4 마일스톤에서 정의 예정)

### 범위 외

- SaaS 버전 (클라우드 호스팅) — Self-Hosted 우선, 클라우드는 추후 확장
- 온체인 스마트 컨트랙트 정책 (Squads 등) — 체인 무관 로컬 정책 엔진 우선
- 모바일 앱 — Desktop/CLI 우선
- ML 기반 이상 탐지 — 규칙 기반으로 시작
- 가격/비즈니스 모델 — 기술 구현 완료 후 별도 검토
- 하드웨어 지갑 직접 연결 (Ledger/D'CENT) — WalletConnect 간접 연결

## 컨텍스트

v0.1 Research & Design 완료 (2026-02-05). 5개 페이즈, 15개 플랜, 23개 요구사항.
v0.2 Self-Hosted Secure Wallet Design 완료 (2026-02-05). 4개 페이즈, 16개 플랜, 45개 요구사항, 17개 설계 문서.
v0.3 설계 논리 일관성 확보 완료 (2026-02-06). 4개 페이즈, 8개 플랜, 37개 요구사항, 5개 대응표/매핑 문서.

**기술 스택 (v0.2 확정):**
- Runtime: Node.js 22 LTS
- Server: Hono 4.x (OpenAPIHono)
- DB: SQLite (better-sqlite3) + Drizzle ORM
- Crypto: sodium-native (guarded memory), argon2 (KDF), jose (JWT)
- Chain: @solana/kit 3.x (Solana), viem 2.x (EVM stub)
- Desktop: Tauri 2.x + React 18 + TailwindCSS 4
- Schema: Zod SSoT → TypeScript → OpenAPI 3.0

**설계 문서:** 17개 (deliverables 24-40.md) + 5개 대응표 (41-45.md), ~38,000 lines

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.4 스파이크)
- CORE-02 스키마에 Phase 8 확장 (reserved_amount, system_state 등) 미반영 (구현 시 마이그레이션)

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
| AWS KMS + Nitro Enclaves + Squads 하이브리드 | 5년 36% 비용 절감, 벤더 락인 방지 | ✓ Good → Self-Hosted로 전환 (v0.2) |
| Turnkey 결정 철회 → 직접 구축 | Phase 2 분석 결과 직접 구축이 비용/기능 모두 우위 | ✓ Good |
| Hono + SQLite (v0.2 전환) | Self-Hosted 경량화, 외부 의존 최소화 | ✓ Good |
| Dual Key 아키텍처 | Owner(통제) + Agent(자율) 역할 분리, defense-in-depth | ✓ Good |
| Cloud → Self-Hosted 전환 | 서비스 제공자 의존 제거, 사용자 완전 통제 | ✓ Good — v0.2 설계 완성 |
| 3계층 보안 (세션→시간지연→모니터링) | 다층 방어, 키 유출 시에도 피해 최소화 | ✓ Good — v0.2 설계 완성 |
| 체인 무관 정책 엔진 | Squads 등 온체인 의존 제거, 모든 체인에 동일 보안 | ✓ Good — v0.2 설계 완성 |
| 세션 기반 에이전트 인증 | 영구 키 대신 단기 JWT, 유출 시 만료로 자동 무효화 | ✓ Good — v0.2 설계 완성 |
| Zod SSoT | 스키마 → 타입 + OpenAPI + 런타임 검증 통합 | ✓ Good |
| Budget Pool + Hub-and-Spoke | 다수 에이전트 효율적 관리, 예산 격리 | ✓ Good |
| 기본 포트 3100 | 3000/3001/8080 충돌 회피 | ✓ Good — v0.3 통일 |
| DB 8개 TransactionStatus SSoT | 클라이언트 표시는 상태+tier 조합 | ✓ Good — v0.3 통일 |
| Docker hostname z.union | 기본 127.0.0.1, Docker 0.0.0.0 오버라이드 | ✓ Good — v0.3 통일 |
| Enum SSoT 대응표 | DB CHECK = Drizzle = Zod = TypeScript 1:1 | ✓ Good — v0.3 통일 |
| config.toml 중첩 섹션 | security.auto_stop, policy_defaults, kill_switch | ✓ Good — v0.3 통일 |
| rate_limit 3-level | global 100, session 300, tx 10 RPM | ✓ Good — v0.3 통일 |
| ownerAuth 9단계 미들웨어 | 라우트 레벨 미들웨어로 분리 | ✓ Good — v0.3 통일 |
| MCP 의도적 미커버 24개 | 보안 원칙: AI 에이전트에 Owner/Admin 권한 미노출 | ✓ Good — v0.3 확정 |
| Telegram Tier 2 TELEGRAM_PRE_APPROVED | SIWS는 Desktop/CLI 필수, Telegram은 알림+방어 채널 | ✓ Good — v0.3 확정 |

---
*최종 업데이트: 2026-02-06 after v0.3 milestone*
