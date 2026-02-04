# AI 에이전트 WaaS 프로젝트 리서치 총합

**프로젝트:** WAIaaS (AI Agent Wallet-as-a-Service)
**도메인:** AI 에이전트용 암호화폐 지갑 서비스 (Solana 우선)
**리서치 완료:** 2026-02-04
**전체 신뢰도:** MEDIUM-HIGH

## 요약 (Executive Summary)

AI 에이전트용 지갑 서비스는 전통적인 인간 중심 WaaS와 근본적으로 다른 접근이 필요합니다. 인간용 WaaS가 UI 기반 승인, 소셜 로그인, 시드 구문 복구에 중점을 두는 반면, AI 에이전트 WaaS는 **프로그래매틱 제어**, **정책 기반 자율 실행**, **주인-에이전트 이중 키 구조**를 핵심으로 합니다.

권장 접근법은 **Dual Key Architecture**입니다. Squads Protocol 기반 스마트 월렛으로 Owner Key(주인이 전권 보유)와 Agent Key(TEE 내부에서 제한된 권한으로 작동)를 분리합니다. 키 관리는 Turnkey(TEE 기반, 50-100ms 서명 지연) 또는 Crossmint Agent Wallets(Dual-Key 전용 설계)를 사용하여 비수탁 구조를 유지합니다. 기술 스택은 TypeScript + Fastify(고성능 API), @solana/kit(차세대 SDK), Solana Agent Kit(에이전트 프레임워크 통합)으로 구성됩니다.

핵심 위험은 **프롬프트 인젝션을 통한 비인가 트랜잭션**, **키 노출**, **과도한 에이전트 권한**입니다. 이를 방지하기 위해 초기 단계부터 Policy Engine을 구축하여 지출 한도, 화이트리스트, 시간 기반 제어를 적용해야 합니다. TEE 기반 키 격리로 에이전트 손상 시에도 키가 노출되지 않도록 하며, 주인이 언제든 에이전트 권한을 철회하고 자금을 회수할 수 있는 비상 메커니즘이 필수입니다.

## 핵심 발견 사항

### 권장 기술 스택

Solana 생태계는 2026년 기준 AI 에이전트 통합에 가장 활발한 블록체인입니다. 전용 프레임워크(Solana Agent Kit, GOAT)와 성숙한 WaaS 인프라(Turnkey, Crossmint)를 갖추고 있어 MVP 구축에 최적입니다.

**핵심 기술:**
- **@solana/kit (3.0.x)**: Solana SDK 메인 — web3.js 2.0 후속작, 트리 셰이킹, 200ms 빠른 확인 지연
- **Turnkey (PRIMARY) / Crossmint (ALTERNATIVE)**: 키 관리 — MPC/TEE 기반 비수탁형, Policy Engine 내장, 50-100ms 서명
- **Fastify (5.x)**: API 프레임워크 — Express 대비 2.7배 처리량, 스키마 검증 내장, 저지연
- **Solana Agent Kit**: 에이전트 통합 — 60+ 사전 구축 액션, LangChain/Vercel AI SDK 통합
- **PostgreSQL (16.x) + Redis (7.x)**: 데이터 — ACID 필수(금융 데이터), 잔액 캐시, 실시간 알림

**선택하지 않은 것:**
- **자체 MPC 구현**: 암호학 전문성 필요, 보안 감사 비용, 1년+ 소요
- **단순 HD 지갑**: 에이전트에게 프라이빗 키 노출 — 보안 위험
- **NestJS/Express**: 지갑 서비스에 과도한 복잡성, 성능 저하

### 필수 기능 (Table Stakes)

사용자가 당연히 기대하는 기능. 없으면 제품이 불완전하게 느껴집니다.

**코어 지갑 작업:**
- **지갑 생성/서명/전송**: API 한 줄로 프로비저닝, TEE 기반 서명(50-100ms), 멱등성 보장
- **잔액/트랜잭션 조회**: 실시간 웹훅 또는 폴링으로 에이전트 상태 모니터링

**주인-에이전트 관계:**
- **자금 충전/회수**: 주인이 에이전트 지갑에 운영 자금 공급, 언제든 회수 가능
- **소유권 증명**: Dual Key 아키텍처 — Owner Key(주인) + Agent Key(TEE 내)
- **에이전트 키 폐기**: 위험 발생 시 에이전트 접근 즉시 차단

**트랜잭션 제어:**
- **지출 한도**: 트랜잭션당/일별/주별 한도로 에이전트 폭주 방지
- **화이트리스트**: 수신자/컨트랙트 허용 목록으로 승인된 대상만 전송 허용

**모니터링:**
- **트랜잭션 로깅**: 모든 작업을 변조 불가능한 감사 추적으로 기록
- **실시간 웹훅**: 트랜잭션 상태, 입금, 출금 이벤트 알림

### 차별화 기능 (Differentiators)

경쟁 우위를 제공하는 기능. 기대하지 않지만 있으면 가치 있습니다.

**고급 정책 엔진:**
- **시간 기반 제어**: 특정 시간대만 에이전트 작동 허용
- **복합 조건 규칙**: "1 SOL 이상 AND 새로운 수신자" → 추가 승인 필요
- **의도 기반 트랜잭션**: "Y 가격 이하로 X 구매" 같은 조건부 실행 (Google AP2 표준)

**멀티 에이전트 관리:**
- **에이전트 플릿**: 수십~수백 에이전트 지갑 일괄 관리
- **정책 템플릿 재사용**: 동일 정책을 여러 에이전트에 적용

**고급 보안:**
- **이상 탐지**: ML 기반 비정상 행동 감지 및 알림
- **다중 서명**: 고액 트랜잭션에 2-of-N 서명 적용

**구현하지 말아야 할 것 (Anti-Features):**
- **무제한 에이전트 권한**: 에이전트 손상 시 전체 자금 유출 — 항상 한도/화이트리스트 적용
- **평문 프라이빗 키 저장**: 치명적 취약점 — TEE 기반 키 관리 필수
- **시드 구문 기반 복구**: AI 에이전트에게 무의미 — Owner Key 기반 프로그래매틱 복구

### 아키텍처 접근

권장 아키텍처는 **Dual Key + Policy-First Signing + Non-Custodial** 조합입니다. 서비스 제공자가 키에 접근할 수 없으며, 모든 서명 전에 정책 검증이 필수입니다.

**주요 컴포넌트:**
1. **API Gateway** — 인증/인가, Rate Limiting, 로깅
2. **Wallet Service** — 지갑 CRUD, Squads 스마트 월렛 배포, 소유권 관리
3. **Transaction Service** — TX 구성, 시뮬레이션, 제출
4. **Policy Engine** — 권한 검증, 한도 관리, 규칙 실행 (서명 전 필수)
5. **Key Management (TEE/MPC)** — 키 생성, 보관, 서명 연산 (키는 절대 외부 노출 안 함)
6. **Blockchain Adapter** — 체인별 RPC 호출 추상화 (Solana 우선, 멀티체인 준비)

**권한 계층:**
```
Level 1: Owner (주인) → 전체 권한, 에이전트 등록/해제, 정책 변경, 무제한 입출금
    ↓
Level 2: Agent (에이전트) → 정책 범위 내 자율 거래, 한도/화이트리스트 제약
```

**커스터디 모델 비교:**
- **Dual Key (권장)**: 스마트 컨트랙트 지갑 + Owner/Agent 키 분리 — 주인 통제권 유지, 완전 비수탁
- **MPC/TSS**: 키 조각 분산, M-of-N 임계값 — 기관용, 높은 보안
- **Custodial**: 서비스 제공자가 키 보관 — 규제 리스크, Single Point of Failure
- **Non-Custodial**: 에이전트가 직접 키 보관 — 보안 취약, 복구 불가

### 치명적 함정 (Critical Pitfalls)

**함정 1: 프롬프트 인젝션을 통한 비인가 트랜잭션**
- **위험**: 공격자가 악의적 프롬프트로 에이전트 로직 변경, 비인가 거래 실행
- **예방**: LLM 출력 절대 신뢰 금지, 화이트리스트 기반 필터링, Human-in-the-loop 필수화

**함정 2: 개인 키 노출 및 중앙화된 키 저장**
- **위험**: 2025년 1분기 손실 88%가 키 침해. DEXX 사건 $3천만 탈취
- **예방**: MPC/TEE 기반 키 관리, 절대 평문 저장 금지, 키 샤드 자동 갱신

**함정 3: API 키 및 자격 증명 탈취**
- **위험**: LangChain "LangGrinch" 취약점으로 환경 변수 전체 유출 가능
- **예방**: OAuth 2.1 + PKCE, 단기 토큰, JIT 자격 증명, HashiCorp Vault

**함정 4: 과도하게 광범위한 권한 부여**
- **위험**: 에이전트가 필요 이상의 자산 접근 가능
- **예방**: 최소 권한 원칙, 작업별 세분화된 스코프, RAR(Rich Authorization Requests)

**함정 5: 주인 자금 회수 메커니즘 부재**
- **위험**: 에이전트 장애 시 자금 영구 손실
- **예방**: 소유자 전용 withdraw 함수, 타임락 기반 비상 회수, 스마트 컨트랙트 "pause" 기능

**함정 6: Solana 계정 검증 실패**
- **위험**: Solana 감사 결과 심각한 이슈 85.5%가 검증 오류
- **예방**: 모든 계정의 소유권/타입/주소/관계 검증, Anchor 제약 시스템 활용

## 로드맵 시사점

연구 결과를 바탕으로 권장하는 개발 단계:

### Phase 1: Foundation (기반 구축)
**근거:** 비수탁 아키텍처와 키 관리가 전체 시스템의 근간. 초기 결정이 이후 모든 단계에 영향.
**구현:**
- 인프라 설정 (DB, 캐시, 모니터링)
- Solana RPC 연동 (Helius 사용)
- Turnkey 또는 Crossmint 선택 및 TEE 기반 Key Management 구현
- Squads Protocol 스마트 월렛 통합
- Dual Key 구조 구현 (Owner Key + Agent Key)

**피해야 할 함정:**
- 개인 키 노출 (함정 2) → TEE 기반 격리
- Solana 계정 검증 실패 (함정 6) → 초기부터 검증 로직 구축

**예상 기간:** 3-4주

---

### Phase 2: Core Wallet & Control (핵심 지갑 및 제어)
**근거:** 에이전트가 자율적으로 작동하되, 정책 기반 안전장치가 필수. Policy Engine이 없으면 프롬프트 인젝션과 권한 남용 방어 불가.
**구현:**
- Wallet Service (지갑 생성, 조회, 잔액)
- Transaction Service (TX 구성, 시뮬레이션, 제출)
- Policy Engine (지출 한도, 화이트리스트, 컨트랙트 허용 목록)
- API 키 인증 + 키 스코핑
- 트랜잭션 로깅 + 웹훅

**구현 기능:**
- 지갑 생성/서명/전송 (Table Stakes)
- 기본 지출 한도
- 수신자/컨트랙트 화이트리스트
- 모든 트랜잭션 감사 로그

**피해야 할 함정:**
- 프롬프트 인젝션 (함정 1) → Policy Engine에서 필터링
- 과도한 권한 (함정 4) → 최소 권한, 세분화된 스코프
- 트랜잭션 제어 부재 (함정 5) → 한도/Rate Limiting

**예상 기간:** 3-4주

---

### Phase 3: Owner Control & Recovery (소유자 제어 및 복구)
**근거:** 에이전트 자율성과 주인 통제권의 균형. 주인이 언제든 개입하고 자금을 회수할 수 있어야 신뢰 확보.
**구현:**
- Owner API (자금 충전, 회수, 정책 변경)
- 에이전트 등록/해제 시스템
- 에이전트 키 폐기 메커니즘
- 비상 회수(Emergency Withdrawal) 함수
- 복구 키 시스템 (타임락 기반)

**구현 기능:**
- 자금 충전/회수 (Table Stakes)
- 소유권 증명
- 에이전트 키 폐기

**피해야 할 함정:**
- 자금 회수 메커니즘 부재 (함정 5) → Owner 전용 withdraw, pause 기능

**예상 기간:** 2-3주

---

### Phase 4: Advanced Policies & Agent Integration (고급 정책 및 에이전트 통합)
**근거:** 복잡한 비즈니스 로직과 프레임워크 통합으로 제품 차별화. 개발자 경험(DX)이 성공의 핵심.
**구현:**
- 시간 기반 제어
- 복합 조건 규칙 (AND/OR 조합)
- 다중 서명 (고액 트랜잭션)
- Solana Agent Kit 통합
- JavaScript/Python SDK 개발
- REST API 문서화

**구현 기능:**
- 시간 기반/복합 조건 정책 (Differentiators)
- LangChain/Vercel AI SDK 플러그인
- 자연어 트랜잭션 (선택)

**피해야 할 함정:**
- API 키 탈취 (함정 3) → OAuth 2.1, 자동 로테이션
- 공급망 공격 (함정 10) → 의존성 버전 고정, SBOM 관리

**예상 기간:** 3-4주

---

### Phase 5: Production & Compliance (프로덕션 및 규정 준수)
**근거:** 보안 감사와 규정 준수를 나중으로 미루면 재작업 비용 폭증. 초기부터 고려해야 함.
**구현:**
- 보안 감사 (Soteria, Sec3 등)
- 이상 탐지 시스템 (ML 기반)
- KYC/AML 통합 계획 (Chainalysis 연동)
- Mainnet 배포
- 실시간 모니터링 대시보드
- 인시던트 대응 계획

**구현 기능:**
- 이상 탐지 (Differentiators)
- 에이전트 플릿 관리 (Differentiators)

**피해야 할 함정:**
- 규정 준수 지연 (함정 12) → 초기부터 KYC/AML 계획
- 감사 추적 부재 (함정 11) → 전용 에이전트 ID, 불변 로그

**예상 기간:** 4-5주

---

### Phase 6 (선택): Multi-Chain & Advanced Features (멀티체인 및 고급 기능)
**근거:** Solana 검증 후 확장. 멀티체인은 GOAT SDK로 준비됨.
**구현:**
- EVM 체인 지원 (GOAT SDK)
- 의도 기반 트랜잭션 (Google AP2)
- MCP (Model Context Protocol) 서버 개발
- 검증 가능한 에이전트 자격 증명 (W3C 표준)

**연기 사유:**
- Solana 우선, 이후 EVM 확장
- 오라클 의존성 높음
- W3C 표준 아직 성숙 중

---

### 단계 순서 근거

1. **Foundation 먼저**: Dual Key 아키텍처와 TEE 기반 키 관리가 모든 것의 기반. 초기 선택(Turnkey vs Crossmint)이 이후 API 설계에 영향.
2. **Policy Engine 조기 도입**: 프롬프트 인젝션 방어는 MVP부터 필수. 나중에 추가하면 API 재설계 필요.
3. **Owner Control은 Phase 3**: 에이전트 기본 작동 검증 후 소유자 기능 추가. 하지만 Phase 1에서 Dual Key 구조는 미리 설계.
4. **Agent Integration은 Phase 4**: 핵심 인프라가 안정된 후 DX 개선. SDK는 API가 확정된 후 개발.
5. **Compliance는 Phase 5**: 감사와 규정 준수는 병렬 진행 가능하지만, Mainnet 배포 전 완료 필수.

### 리서치 플래그

**추가 연구가 필요한 Phase:**
- **Phase 1 (Foundation)**: Turnkey vs Crossmint 상세 비교 필요. 각 프로바이더의 API 문서 정밀 분석 후 최종 선택.
- **Phase 4 (Agent Integration)**: MCP(Model Context Protocol) 표준이 2026년 2월 현재 빠르게 진화 중. 최신 스펙 확인 필요.
- **Phase 5 (Compliance)**: 국가별 수탁 규정 확인 필요. 비수탁 구조라도 서비스 제공자 의무 존재 가능.

**표준 패턴이 있는 Phase (연구 생략 가능):**
- **Phase 2 (Core Wallet)**: Fastify + PostgreSQL + Redis는 표준 조합. 잘 문서화됨.
- **Phase 3 (Owner Control)**: Squads Protocol은 Solana 표준 멀티시그. 공식 문서 충분.

## 신뢰도 평가

| 영역 | 신뢰도 | 비고 |
|------|--------|------|
| Stack | **HIGH** | 공식 문서 + npm 패키지 확인. Solana Kit 3.0, Turnkey/Crossmint 공식 문서 검증. |
| Features | **MEDIUM** | WebSearch + 공식 WaaS 프로바이더 문서 교차 검증. Table Stakes는 확실하나 Differentiators는 커뮤니티 합의 수준. |
| Architecture | **MEDIUM** | Crossmint, Turnkey, Dfns 등 주요 프로바이더가 Dual Key 채택 확인. TEE vs MPC는 프로바이더별 차이 존재. |
| Pitfalls | **MEDIUM** | Solana Security Ecosystem Review 2025 (고신뢰), OWASP AI Agent Top 10 (중신뢰) 교차 검증. 프롬프트 인젝션은 2025-2026 실제 사고 사례 다수. |

**전체 신뢰도:** MEDIUM-HIGH

### 해결해야 할 간극

**키 관리 프로바이더 최종 선택:**
- Turnkey와 Crossmint 중 하나 선택 필요
- **Turnkey**: TEE 단독, 50-100ms 서명, Policy Engine 성숙
- **Crossmint**: Dual-Key 전용 설계, Squads 기반, Agent Launchpad 제공
- **권장**: Phase 1 시작 전에 양쪽 API 문서 정밀 분석 및 PoC 구현 후 결정

**Solana 프로그램 개발 범위:**
- 연구에서는 Squads Protocol 사용 가정
- 커스텀 스마트 컨트랙트 개발 필요 여부 확인 필요
- **권장**: 초기에는 Squads 사용, Phase 3 이후 커스텀 로직 필요 시 추가 개발

**멀티체인 시기:**
- GOAT SDK가 멀티체인 지원하지만 복잡도 증가
- **권장**: Solana Mainnet 검증 후 EVM 확장. Phase 6으로 연기.

**규정 준수 범위:**
- 비수탁 구조라도 서비스 제공자 의무 존재 가능 (EU MiCA, 미국 주별 규정)
- **권장**: Phase 1에서 법률 자문 조기 확보, Phase 5 전에 KYC/AML 통합 계획 확정

## 출처

### 주요 출처 (HIGH 신뢰도)
- [Solana Kit GitHub](https://github.com/anza-xyz/kit) — SDK 버전, 기능
- [Turnkey Documentation](https://docs.turnkey.com/home) — TEE 아키텍처, Policy Engine
- [Crossmint Blog - AI Agent Wallet Architecture](https://blog.crossmint.com/ai-agent-wallet-architecture/) — Dual Key 설계
- [Solana Agent Kit GitHub](https://github.com/sendaifun/solana-agent-kit) — 에이전트 통합
- [Solana Security Ecosystem Review 2025](https://solanasec25.sec3.dev/) — Pitfalls, 감사 통계

### 부가 출처 (MEDIUM 신뢰도)
- [Helius - How to Build a Secure AI Agent on Solana](https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana) — Dual Key 권장
- [Alchemy - How to Build Solana AI Agents in 2026](https://www.alchemy.com/blog/how-to-build-solana-ai-agents-in-2026) — 기술 스택
- [Privy Agentic Wallets](https://docs.privy.io/recipes/wallets/agentic-wallets) — 정책 제약, 위임 모델
- [OWASP AI Agent Security Top 10 2026](https://medium.com/@oracle_43885/owasps-ai-agent-security-top-10-agent-security-risks-2026-fc5c435e86eb) — 보안 함정
- [WorkOS - OAuth for AI Agents 2025](https://workos.com/blog/best-oauth-oidc-providers-for-authenticating-ai-agents-2025) — 인증 패턴

### 검증 필요 (LOW 신뢰도)
- Google AP2 프로토콜 — 표준화 진행 중, 실제 구현 사례 제한적
- KYA (Know Your Agent) — 산업 표준 부재, 개념 수준
- 의도 기반 트랜잭션 — 오라클 의존성, 복잡도 높음

---

**리서치 완료:** 2026-02-04
**로드맵 준비 완료:** 예
**다음 단계:** 요구사항 정의 (gsd-requirements)
