# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

AI 에이전트가 자율적으로 암호화폐 자산을 소유하고 거래할 수 있는 Wallet-as-a-Service. Dual Key 아키텍처(Owner Key + Agent Key)로 에이전트의 자율성과 소유자의 통제권을 동시에 보장하며, AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 커스터디로 보안을 확보한다. REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

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

- [ ] 코어 지갑 서비스 구현 (지갑 생성, 조회, 서명)
- [ ] 트랜잭션 서비스 구현 (전송, 수신, 상태 조회)
- [ ] 정책 엔진 구현 (규칙 평가, 승인/거부)
- [ ] API 서버 구현 (Fastify 기반, 33개 엔드포인트)
- [ ] SDK 구현 (TypeScript, Python)
- [ ] TEE 환경 구축 (AWS Nitro Enclaves)
- [ ] 모니터링 및 알림 시스템
- [ ] CI/CD 파이프라인

### 범위 외

- UI/대시보드 — API 우선, 관리 인터페이스는 추후 검토
- 멀티체인 구현 — 설계 시 IBlockchainAdapter 확장성 확보, 초기 구현은 Solana 집중
- 법률/규정 준수 상세 — 기본 방향 정립 완료, 상세는 구현 시
- 가격/비즈니스 모델 — 기술 설계 완료 후 별도 검토

## 컨텍스트

v0.1 Research & Design 마일스톤 완료 (2026-02-05). 5개 페이즈, 15개 플랜, 23개 요구사항 전체 완료.
기술 스택: TypeScript 5.x, Fastify 5.x, PostgreSQL 16.x, Redis 7.x, Prisma 6.x.
커스터디: AWS KMS (Owner Key) + Nitro Enclaves (Agent Key) + Squads Protocol (온체인 정책).
설계 문서 38,262줄 Markdown.

### 알려진 이슈

- Squads v4 동적 threshold → 서버 레벨 금액 기반 라우팅으로 구현
- 다중 리전 배포 시 PCR 관리 자동화 필요
- configAuthority vault 직접 접근 범위 → Devnet 테스트로 확인 필요

## 제약사항

- **블록체인**: Solana 메인넷 우선 — 빠른 속도, 낮은 수수료, 활발한 에이전트 생태계
- **언어**: 모든 기획 문서 한글 작성
- **의사결정 방식**: 질문 최소화, 직접 판단하여 최선의 방법 제시

## 주요 결정

| 결정 | 근거 | 결과 |
|------|------|------|
| Solana 우선 타겟 | 빠른 속도, 낮은 수수료, AI 에이전트 생태계 활발 | ✓ Good |
| API 우선 설계 | 에이전트는 UI가 아닌 API로 상호작용 | ✓ Good |
| AWS KMS + Nitro Enclaves + Squads 하이브리드 | 5년 36% 비용 절감, 벤더 락인 방지, 완전한 제어 | ✓ Good |
| Turnkey 결정 철회 → 직접 구축 | Phase 2 분석 결과 직접 구축이 비용/기능 모두 우위 | ✓ Good |
| TypeScript + Fastify + PostgreSQL | 생태계 성숙도, 성능, 타입 안전성 | ✓ Good |
| Dual Key 아키텍처 | Owner(통제) + Agent(자율) 역할 분리, defense-in-depth | ✓ Good |
| 3중 정책 검증 | 서버 → Enclave → Squads 온체인, fail-safe | ✓ Good |
| Budget Pool + Hub-and-Spoke | 다수 에이전트 효율적 관리, 예산 격리 | ✓ Good |
| API Key Primary 인증 | AI 에이전트 비인터랙티브 특성에 최적 | ✓ Good |
| Zod SSoT | 스키마 → 타입 + OpenAPI + 런타임 검증 통합 | ✓ Good |

---
*최종 업데이트: 2026-02-05 after v0.1 milestone*
