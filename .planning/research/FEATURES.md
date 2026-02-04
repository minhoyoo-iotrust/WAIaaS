# Feature Landscape: AI Agent Wallet-as-a-Service

**도메인:** AI 에이전트를 위한 암호화폐 지갑 서비스 (Solana 메인넷 우선)
**연구일:** 2026-02-04
**전체 신뢰도:** MEDIUM (WebSearch + 공식 문서 WebFetch 교차 검증)

---

## 개요

AI Agent WaaS는 전통적인 인간 중심 WaaS와 근본적으로 다른 요구사항을 가진다. 인간 중심 WaaS가 UI 기반 승인, 소셜 로그인, 시드 구문 복구에 중점을 두는 반면, AI Agent WaaS는 **프로그래매틱 제어**, **자율 실행**, **정책 기반 권한**을 핵심으로 한다.

핵심 차이점:
- **인간 WaaS**: 수동 UI 흐름, 소셜/이메일 인증, 시드 구문 복구
- **AI Agent WaaS**: API 기반 제어, 위임된 권한, 정책 기반 자동 실행

---

## Table Stakes (필수 기능)

사용자가 당연히 기대하는 기능. 없으면 제품이 불완전하게 느껴짐.

### 1. 코어 지갑 작업

| 기능 | 필요 이유 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **지갑 생성 (Create)** | 에이전트 인스턴스별 독립 지갑 필요 | Low | 없음 | API 한 줄로 지갑 프로비저닝. Turnkey는 50-100ms 레이턴시 제공 |
| **트랜잭션 서명 (Sign)** | 온체인 작업의 핵심 | Medium | 지갑 생성 | TEE 기반 서명 권장. MPC 대비 50-100x 빠름 |
| **트랜잭션 전송 (Send)** | 토큰 전송, 컨트랙트 호출 | Medium | 서명 | 멱등성(idempotency) 보장 필수 |
| **잔액/트랜잭션 조회** | 에이전트 상태 모니터링 | Low | 지갑 생성 | 실시간 웹훅 또는 폴링 |
| **입금 수신 (Receive)** | 지갑 주소 생성 및 공유 | Low | 지갑 생성 | 입금 웹훅 알림 필수 |

### 2. 소유자-에이전트 관계 (Owner-Agent Relationship)

| 기능 | 필요 이유 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **자금 충전 (Funding)** | 주인이 에이전트 지갑에 운영 자금 공급 | Low | 지갑 생성 | 카드, ACH, Apple Pay, 직접 전송 지원 |
| **자금 회수 (Withdrawal)** | 주인이 에이전트 지갑에서 자금 인출 | Medium | 소유권 구조 | 에이전트 동의 없이 주인이 인출 가능해야 함 |
| **소유권 증명** | 에이전트 지갑의 궁극적 통제권 | High | 지갑 생성 | 듀얼 키 아키텍처: Owner Key + Agent Key |
| **에이전트 키 폐기** | 위험 발생 시 에이전트 접근 즉시 차단 | Medium | 소유권 구조 | 즉시 폐기 가능해야 함. 스마트 지갑 필요 |

### 3. 트랜잭션 제어

| 기능 | 필요 이유 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **지출 한도 (Spending Limits)** | 에이전트 폭주 방지 | Medium | 정책 엔진 | 트랜잭션당, 일별, 주별 한도 설정 |
| **수신자 허용 목록 (Allowlist)** | 승인된 주소만 전송 허용 | Medium | 정책 엔진 | Openfort, Privy 표준 기능 |
| **컨트랙트 허용 목록** | 승인된 스마트 컨트랙트만 상호작용 | Medium | 정책 엔진 | DeFi 상호작용 제어 필수 |
| **차단 목록 (Blocklist)** | 알려진 악성 주소 차단 | Low | 허용 목록 | 프롬프트 인젝션 방어에도 활용 |

### 4. 에이전트 인증

| 기능 | 필요 이유 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **API 키 인증** | 에이전트 서버-서버 인증 | Low | 없음 | Turnkey: "API keys are a great fit for machines and agents" |
| **키 스코핑** | API 키별 권한 범위 제한 | Medium | API 키 | 특정 지갑, 특정 작업만 허용 |
| **키 로테이션** | 보안 위한 주기적 키 교체 | Low | API 키 | 자동 로테이션 지원 |

### 5. 모니터링 및 감사

| 기능 | 필요 이유 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **트랜잭션 로깅** | 모든 작업 기록 | Low | 지갑 작업 | 변조 불가능한 감사 추적 |
| **실시간 알림 (Webhooks)** | 이벤트 기반 알림 | Medium | 로깅 | 트랜잭션 상태, 입금, 출금 이벤트 |
| **잔액 변동 알림** | 자금 이동 모니터링 | Low | Webhooks | 입금/출금 즉시 알림 |

---

## Differentiators (차별화 기능)

경쟁 우위를 제공하는 기능. 기대하지 않지만 있으면 가치 있음.

### 1. 고급 정책 엔진

| 기능 | 가치 제안 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **시간 기반 제어** | 특정 시간대만 에이전트 작동 허용 | Medium | 정책 엔진 | "Time-based controls to define when agents can operate" - Privy |
| **복합 조건 규칙** | AND/OR 조합 정책 | High | 정책 엔진 | 예: "1 SOL 이상 AND 새로운 수신자" → 추가 승인 필요 |
| **동적 한도 조정** | 에이전트 신뢰도에 따른 한도 자동 조정 | High | 모니터링, 정책 엔진 | 성공적 트랜잭션 이력 → 한도 증가 |
| **의도 기반 트랜잭션 (Intent Mandates)** | "Y 가격 이하로 X 구매" 같은 조건부 실행 | High | 정책 엔진, 오라클 | Google AP2 표준. 사람 부재 시 위임 작업용 |

### 2. 멀티 에이전트 관리

| 기능 | 가치 제안 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **에이전트 플릿 관리** | 수십~수백 에이전트 지갑 일괄 관리 | High | 지갑 생성 | Prava: "One developer wallet can fund multiple agents" |
| **정책 템플릿 재사용** | 동일 정책을 여러 에이전트에 적용 | Medium | 정책 엔진 | 플릿 전체 일관된 제어 |
| **계층적 지갑 구조** | 마스터-서브 지갑 구조 | High | 멀티 에이전트 | 부서/팀별 에이전트 그룹핑 |
| **에이전트간 결제** | 에이전트가 다른 에이전트 서비스 구매 | Medium | 지갑 생성 | "A market research AI agent may hire a data analysis AI agent" |

### 3. 고급 보안

| 기능 | 가치 제안 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **이상 탐지 (Anomaly Detection)** | 비정상 패턴 자동 감지 | High | 모니터링 | ML 기반 이상 행동 탐지 및 알림 |
| **다중 서명 (Multi-party Approval)** | 고액 트랜잭션 복수 승인 | High | 스마트 지갑 | 2-of-N 서명. Casa Wallet 참조 |
| **지연 트랜잭션** | 고액 전송에 대기 시간 적용 | Medium | 정책 엔진 | 취소 기회 제공. XRPL Agent Wallet 참조 |
| **TEE 기반 서명** | 신뢰 실행 환경에서 키 보호 | High | 인프라 | Turnkey, Privy 표준. 키 노출 방지 |
| **검증 가능한 에이전트 자격 증명** | W3C 표준 기반 에이전트 신원 증명 | High | 신원 시스템 | Openfort: KYC 준수, 범위 지정 권한 |

### 4. 에이전트 프레임워크 통합

| 기능 | 가치 제안 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **LangChain 플러그인** | 가장 인기 있는 에이전트 프레임워크 | Medium | API | Solana Agent Kit이 LangChain 통합 제공 |
| **CrewAI 통합** | 멀티 에이전트 협업 프레임워크 | Medium | API | 역할 기반 에이전트 팀 지원 |
| **Vercel AI SDK 통합** | 현대적 AI 앱 개발 | Medium | API | SendAI Solana Agent Kit 지원 |
| **MCP (Model Context Protocol)** | 에이전트 도구 표준 | Medium | API | Claude 등 주요 AI 모델 지원 |

### 5. 편의 기능

| 기능 | 가치 제안 | 복잡도 | 의존성 | 비고 |
|------|-----------|--------|--------|------|
| **가스 스폰서십** | 에이전트 대신 가스비 지불 | Medium | 트랜잭션 | Privy 제공. UX 개선 |
| **자연어 트랜잭션** | "0.5 SOL을 USDC로 스왑" 명령 처리 | High | AI 통합 | Solana Agent Kit + Claude 조합 |
| **멀티체인 추상화** | 단일 API로 여러 체인 지원 | High | 인프라 | EVM, Solana, Bitcoin 등 |

---

## Anti-Features (구현하지 말아야 할 것)

명시적으로 구현하지 말아야 할 기능. 이 도메인의 흔한 실수.

### 1. 무제한 자율성

| Anti-Feature | 피해야 하는 이유 | 대신 할 것 |
|--------------|------------------|------------|
| **한도 없는 에이전트 권한** | 에이전트 손상 시 전체 자금 유출. "An AI agent with signing authority is a high-value target. A compromised agent can drain its wallet instantly." | 항상 지출 한도, 허용 목록, 시간 제한 적용 |
| **자동 한도 증가** | 에이전트가 스스로 권한 확대 가능 | 한도 증가는 반드시 소유자(인간) 승인 필요 |
| **에이전트 자체 정책 수정** | 정책 우회 가능성 | 정책 수정은 Owner Key로만 가능 |

### 2. 보안 단축

| Anti-Feature | 피해야 하는 이유 | 대신 할 것 |
|--------------|------------------|------------|
| **평문 프라이빗 키 저장** | 코드에 키 노출 시 치명적 취약점 | TEE 기반 키 관리 또는 스마트 지갑 사용 |
| **고정 API 키 (장기)** | 유출 시 오래 악용 가능. "Unlike static API keys that can live for years, OAuth 2.0 access tokens often expire in an hour" | 단기 토큰, 자동 로테이션 |
| **단일 키 아키텍처** | 키 손상 시 복구 불가 | 듀얼 키: Owner Key (인간 보유) + Agent Key (TEE 내) |
| **로깅 없는 트랜잭션** | 감사 불가, 문제 추적 불가 | 모든 작업 변조 불가능한 로그 기록 |

### 3. 프롬프트 인젝션 무방비

| Anti-Feature | 피해야 하는 이유 | 대신 할 것 |
|--------------|------------------|------------|
| **외부 데이터 무검증 처리** | 악의적 지시가 외부 콘텐츠를 통해 유입. "Indirect prompt injection, where malicious instructions arrive through untrusted external content" | 입력 검증, 샌드박싱, 정책 기반 필터링 |
| **메모 필드 무제한 허용** | 프롬프트 인젝션 벡터. XRPL Agent Wallet: "blocklist patterns for memo fields to defend against prompt injection attacks" | 메모 필드 차단 목록, 패턴 필터링 |
| **무제한 컨텍스트 처리** | Denial-of-Wallet 공격. "Malicious queries can trigger expensive operations" | 컨텍스트 크기 제한, 비용 상한 |

### 4. 잘못된 복잡성

| Anti-Feature | 피해야 하는 이유 | 대신 할 것 |
|--------------|------------------|------------|
| **시드 구문 기반 복구** | AI 에이전트에게 시드 구문은 무의미. 인간용 UX | 소유자 키 기반 복구, 프로그래매틱 복구 |
| **소셜 로그인 for 에이전트** | 에이전트는 이메일/소셜 계정 없음 | API 키, OAuth 2.0 Client Credentials |
| **UI 기반 승인 워크플로** | 에이전트는 UI 사용 불가 | API 기반 정책 승인, 프로그래매틱 승인 |
| **KYC for 에이전트** | 에이전트는 신원 증명 불가 | 대신 KYA (Know Your Agent): 에이전트-주인 연결 자격 증명 |

### 5. 규모 무시

| Anti-Feature | 피해야 하는 이유 | 대신 할 것 |
|--------------|------------------|------------|
| **단일 지갑 다중 에이전트** | 에이전트간 격리 불가, 권한 분리 불가 | 에이전트별 독립 지갑 |
| **수동 지갑 생성** | 수십~수백 에이전트 관리 불가 | 프로그래매틱 대량 지갑 프로비저닝 |
| **중앙화 병목** | 에이전트 수 증가 시 성능 저하 | 수평 확장 가능한 아키텍처 |

---

## Feature Dependencies (기능 의존성)

```
[지갑 생성] ──────────┬──────────────────────────────────────────┐
                      │                                          │
                      v                                          v
              [트랜잭션 서명]                           [소유권 구조]
                      │                                          │
                      v                                          v
              [트랜잭션 전송]                           [에이전트 키 관리]
                      │                                          │
                      v                                          │
              [트랜잭션 로깅] ─────────────────────────────────────┤
                      │                                          │
                      v                                          v
                [Webhooks]                              [정책 엔진] ─────────┐
                      │                                          │          │
                      v                                          v          v
              [이상 탐지]                            [지출 한도]    [허용 목록]
                                                          │          │
                                                          v          v
                                                     [시간 기반 제어]
                                                          │
                                                          v
                                                   [의도 기반 트랜잭션]
```

**핵심 의존성 체인:**
1. 지갑 생성 → 트랜잭션 서명 → 트랜잭션 전송 (코어 경로)
2. 소유권 구조 → 에이전트 키 관리 → 정책 엔진 (보안 경로)
3. 정책 엔진 → 지출 한도/허용 목록 → 고급 제어 (정책 경로)
4. 트랜잭션 로깅 → Webhooks → 이상 탐지 (모니터링 경로)

---

## MVP 권장 사항

### Phase 1: MVP (Table Stakes)

**우선 구현:**
1. 지갑 생성/서명/전송 (Core 3)
2. API 키 인증 + 키 스코핑
3. 기본 지출 한도
4. 수신자 허용 목록
5. 트랜잭션 로깅 + 웹훅

**이유:** 에이전트가 자율적으로 트랜잭션을 실행하되, 기본 안전장치가 필요함.

### Phase 2: Owner Control

**구현:**
1. 듀얼 키 아키텍처 (Owner + Agent)
2. 소유자 자금 회수
3. 에이전트 키 폐기
4. 컨트랙트 허용 목록

**이유:** 소유자(인간)가 궁극적 통제권을 가져야 함.

### Phase 3: Advanced Policies

**구현:**
1. 시간 기반 제어
2. 복합 조건 규칙
3. 다중 서명 (고액)
4. 지연 트랜잭션

**이유:** 복잡한 비즈니스 로직 지원.

### Phase 4: Scale & Intelligence

**구현:**
1. 멀티 에이전트 플릿 관리
2. 이상 탐지
3. 에이전트 프레임워크 SDK (LangChain, CrewAI)
4. 자연어 트랜잭션

**이유:** 엔터프라이즈 확장 및 개발자 경험.

### 연기할 기능:

| 기능 | 연기 이유 |
|------|-----------|
| 멀티체인 지원 | Solana 우선. 이후 EVM 확장 |
| 의도 기반 트랜잭션 | 오라클 의존성 높음. 복잡도 높음 |
| 검증 가능한 자격 증명 | W3C 표준 아직 성숙 중 |
| KYA 시스템 | 산업 표준 부재. 2026년 이후 |

---

## 전통 WaaS vs AI Agent WaaS 비교

| 영역 | 전통 WaaS (인간용) | AI Agent WaaS | 비고 |
|------|-------------------|---------------|------|
| **인증** | 이메일, 소셜, 패스키, 생체 | API 키, OAuth Client Credentials | 에이전트는 UI 없음 |
| **복구** | 시드 구문, 소셜 복구 | 소유자 키, 프로그래매틱 복구 | 에이전트는 시드 구문 관리 불가 |
| **승인** | UI 팝업, 서명 요청 | 정책 기반 자동 승인 | 에이전트는 팝업 처리 불가 |
| **권한** | 전체 또는 없음 | 세분화된 정책 (한도, 허용 목록, 시간) | 에이전트 자율성 제어 필수 |
| **소유 모델** | 사용자 = 지갑 소유자 | 사용자 → 에이전트 위임 | 듀얼 키 아키텍처 필요 |
| **규모** | 사용자당 1-몇 개 지갑 | 에이전트당 지갑, 수십~수백 관리 | 대량 프로비저닝 필요 |
| **KYC** | 사용자 신원 확인 | KYA: 에이전트-주인 연결 확인 | 새로운 패러다임 |

---

## Sources

### HIGH Confidence (공식 문서 검증)
- [Turnkey AI Agents](https://www.turnkey.com/solutions/ai-agents) - TEE 기반 에이전트 지갑, 정책, API 키
- [Privy Agentic Wallets](https://docs.privy.io/recipes/wallets/agentic-wallets) - 정책 제약, 위임 모델, 웹훅
- [Openfort AI Agents](https://www.openfort.io/solutions/ai-agents) - 가드레일, 지출 한도, 이상 탐지

### MEDIUM Confidence (WebSearch + 공식 소스 확인)
- [AI Agent Payments Landscape 2026](https://www.useproxy.ai/blog/ai-agent-payments-landscape-2026) - 결제 네트워크 통합, 산업 동향
- [Helius: Secure AI Agent on Solana](https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana) - 듀얼 키 아키텍처, 보안 권장사항
- [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit) - Solana 에이전트 프레임워크 통합

### LOW Confidence (WebSearch만, 추가 검증 필요)
- XRPL Agent Wallet MCP - 프롬프트 인젝션 방어 패턴
- Google AP2 표준 - Intent Mandates
- KYA (Know Your Agent) 개념 - 산업 표준화 진행 중
