# 기술 스택 연구: AI Agent Wallet-as-a-Service (WAIaaS)

**프로젝트:** WAIaaS - AI 에이전트용 클라우드 지갑 서비스
**연구 일자:** 2026-02-04
**전체 신뢰도:** MEDIUM-HIGH

---

## 요약

WAIaaS를 위한 2025-2026년 표준 기술 스택을 조사했습니다. Solana 생태계는 AI 에이전트 통합에 가장 활발한 블록체인으로, 전용 프레임워크(Solana Agent Kit, GOAT)와 성숙한 WaaS 인프라(Turnkey, Crossmint, Privy)를 갖추고 있습니다.

**핵심 결정 사항:**
1. **SDK**: `@solana/kit` (구 web3.js 2.0) - 성능과 모듈성 우선
2. **키 관리**: Turnkey 또는 Crossmint Agent Wallets - MPC/TSS 기반 비수탁형
3. **API 프레임워크**: Fastify + TypeScript - 고성능, 저지연
4. **에이전트 통합**: Solana Agent Kit + Vercel AI SDK - 표준 조합

---

## 권장 스택

### 1. Solana 개발 도구

| 기술 | 버전 | 용도 | 선택 이유 | 신뢰도 |
|------|------|------|----------|--------|
| `@solana/kit` | 3.0.x | Solana SDK 메인 | web3.js 2.0 후속작. 트리 셰이킹, 200ms 빠른 확인 지연, 모듈식 설계 | HIGH |
| `@solana/web3.js` | 1.98.x | 레거시 호환용 | Anchor 등 기존 라이브러리가 아직 v2 미지원 | HIGH |
| Anchor | 0.32.x | 온체인 프로그램 | Solana 스마트 컨트랙트 표준 프레임워크. v1 직전 안정 버전 | HIGH |
| Helius RPC | - | RPC/API | Solana 특화 인프라. DAS API, LaserStream gRPC, 99.99% 업타임 | HIGH |

```bash
# 설치
npm install @solana/kit @solana/web3.js
npm install -D @coral-xyz/anchor
```

**선택하지 않은 것:**
- `@solana/web3.js` 1.x 단독 사용: 번들 크기 크고 성능 저하. 단, Anchor 호환성 위해 병행 설치 필요
- 공개 RPC 엔드포인트: 레이트 리밋 문제. 프로덕션에서는 Helius/QuickNode 필수

---

### 2. 키 관리 솔루션 (중요 결정)

#### 권장: Turnkey (PRIMARY) 또는 Crossmint Agent Wallets (ALTERNATIVE)

| 솔루션 | 타입 | Solana 지원 | AI 에이전트 특화 | 가격 | 신뢰도 |
|--------|------|-------------|-----------------|------|--------|
| **Turnkey** | MPC + TEE | Ed25519 완벽 지원 | Policy Engine, API 기반 접근 | 요청당 과금 | HIGH |
| **Crossmint Agent Wallets** | Dual-Key Smart Wallet | Squads Protocol 기반 | 에이전트 전용 설계, 비수탁형 | 크레딧 기반 | HIGH |
| Privy | MPC + Passkey | 지원 | 일반 임베디드 지갑 | 월정액 | MEDIUM |
| Dynamic | TSS-MPC | 지원 | 일반 임베디드 지갑 | 월정액 | MEDIUM |
| Circle | MPC + EOA | 지원 | 일반 WaaS | 월정액 | MEDIUM |
| Fireblocks | MPC-BAM | 지원 | 기관용 | 고가 | HIGH |

**Turnkey 선택 이유:**
1. **Solana Policy Engine**: 트랜잭션 금액, 주소, 프로그램별 세분화된 정책 설정
2. **50-100ms 서명 지연**: 고성능 AI 에이전트 워크플로우에 적합
3. **TEE 기반**: 프라이빗 키 노출 없이 API로 서명 제어
4. **Gasless Transaction 지원**: 에이전트가 SOL 보유 없이 트랜잭션 가능

**Crossmint Agent Wallets 대안 이유:**
1. **Dual-Key 아키텍처**: 소유자 키 + 에이전트 키(TEE 내) 분리
2. **Squads Protocol 기반**: $10B+ 보안 검증된 스마트 월렛
3. **완전 비수탁형**: 플랫폼도 에이전트 지갑 접근 불가
4. **Agent Launchpad Starter Kit**: 빠른 구현 가능

```bash
# Turnkey
npm install @turnkey/sdk-browser @turnkey/sdk-server

# Crossmint (선택 시)
npm install @crossmint/client-sdk-smart-wallet
```

**선택하지 않은 것:**
- **자체 MPC 구현**: 암호학적 복잡성, 보안 감사 비용, 시간 소요
- **단순 HD 월렛**: 에이전트에 프라이빗 키 노출 - 보안 위험
- **Fireblocks**: 비용 과다, 스타트업에 부적합 (기관용)

---

### 3. API 프레임워크

| 기술 | 버전 | 용도 | 선택 이유 | 신뢰도 |
|------|------|------|----------|--------|
| **Fastify** | 5.x | HTTP 서버 | 2.7x Express 대비 처리량, 스키마 검증 내장 | HIGH |
| TypeScript | 5.x | 언어 | 타입 안전성, Solana SDK 네이티브 지원 | HIGH |
| Zod | 3.x | 스키마 검증 | Fastify + AI SDK 공통 사용 | HIGH |
| tRPC | 11.x | (선택) 타입세이프 API | 프론트엔드가 있다면 사용 고려 | MEDIUM |

```bash
npm install fastify @fastify/cors @fastify/rate-limit
npm install zod
npm install -D typescript @types/node
```

**NestJS 선택하지 않은 이유:**
- 오버헤드 크고 지갑 서비스에 불필요한 복잡성
- Express 기본 = Fastify 대비 성능 저하
- 의존성 주입은 이 규모에서 불필요

**Express 선택하지 않은 이유:**
- Fastify 대비 2.7x 낮은 처리량
- JSON 직렬화 느림
- 모던 기능(스키마 검증 등) 부재

---

### 4. WaaS 프로바이더 SDK

| 프로바이더 | 패키지 | 주요 기능 | 권장 용도 | 신뢰도 |
|-----------|--------|----------|----------|--------|
| **Turnkey** | `@turnkey/sdk-server` | 서명, 정책, 월렛 관리 | 백엔드 키 관리 | HIGH |
| **Crossmint** | `@crossmint/client-sdk-smart-wallet` | Agent Wallets, Smart Wallets | AI 에이전트 월렛 | HIGH |
| Privy | `@privy-io/react-auth/solana` | 임베디드 월렛 | 최종 사용자 온보딩 | MEDIUM |
| Circle | REST API | Programmable Wallets | USDC 중심 서비스 | MEDIUM |

```bash
# 주요 프로바이더
npm install @turnkey/sdk-server @turnkey/sdk-browser
npm install @crossmint/client-sdk-smart-wallet

# 선택적
npm install @privy-io/server-auth
```

---

### 5. AI 에이전트 프레임워크 통합

| 기술 | 버전 | 용도 | 선택 이유 | 신뢰도 |
|------|------|------|----------|--------|
| **Solana Agent Kit** | 1.x | Solana 온체인 액션 | 60+ 사전 구축 액션, LangChain/Vercel AI 통합 | HIGH |
| **Vercel AI SDK** | 6.x | 에이전트 추상화 | Agent 클래스, 도구 실행 루프, human-in-the-loop | HIGH |
| **GOAT SDK** | latest | 멀티체인 액션 | Crossmint 개발, 250+ 온체인 액션 | MEDIUM |
| LangChain | latest | 에이전트 오케스트레이션 | 메모리, 체인, 도구 조합 | MEDIUM |

```bash
# 필수
npm install solana-agent-kit ai
npm install @langchain/core @langchain/openai

# Solana Agent Kit 플러그인
npm install @solana-agent-kit/plugin-token
npm install @solana-agent-kit/plugin-defi
npm install @solana-agent-kit/plugin-nft

# GOAT (멀티체인 필요 시)
npm install @goat-sdk/core @goat-sdk/crossmint
```

**ElizaOS 선택하지 않은 이유:**
- 자체 에이전트 프레임워크로, 지갑 서비스와 통합보다 경쟁 관계
- 프레임워크 무관 API 목표와 맞지 않음
- 단, 고객이 ElizaOS 사용 시 GOAT SDK로 통합 가능

---

### 6. 데이터베이스 & 인프라

| 기술 | 버전 | 용도 | 선택 이유 | 신뢰도 |
|------|------|------|----------|--------|
| **PostgreSQL** | 16.x | 메인 DB | ACID 준수, 금융 데이터 필수, 트랜잭션 기록 | HIGH |
| **Redis** | 7.x | 캐싱/세션 | 잔액 캐시, 실시간 알림, 세션 관리 | HIGH |
| Prisma | 6.x | ORM | 타입 안전 쿼리, 마이그레이션 | HIGH |
| Docker | latest | 컨테이너 | 배포 표준화 | HIGH |

```bash
npm install @prisma/client
npm install -D prisma
npm install ioredis
```

**MongoDB 선택하지 않은 이유:**
- 금융 데이터에 ACID 필수
- 스키마 유연성보다 데이터 정합성 우선

---

### 7. 보안 & 모니터링

| 기술 | 용도 | 선택 이유 | 신뢰도 |
|------|------|----------|--------|
| **Rate Limiting** | API 보호 | @fastify/rate-limit | HIGH |
| **Helmet** | HTTP 헤더 보안 | @fastify/helmet | HIGH |
| **JWT/Paseto** | 인증 | 에이전트/사용자 인증 | HIGH |
| **OpenTelemetry** | 관측성 | 분산 추적, 메트릭 | MEDIUM |

```bash
npm install @fastify/rate-limit @fastify/helmet
npm install jose # JWT/PASETO
npm install @opentelemetry/api @opentelemetry/sdk-node
```

---

## 전체 설치 스크립트

```bash
# 1. 프로젝트 초기화
npm init -y

# 2. 핵심 의존성
npm install fastify @fastify/cors @fastify/rate-limit @fastify/helmet
npm install @solana/kit @solana/web3.js
npm install @turnkey/sdk-server @turnkey/sdk-browser
npm install solana-agent-kit ai @langchain/core
npm install @prisma/client ioredis zod jose

# 3. 선택적 의존성
npm install @solana-agent-kit/plugin-token @solana-agent-kit/plugin-defi
npm install @crossmint/client-sdk-smart-wallet
npm install @goat-sdk/core

# 4. 개발 의존성
npm install -D typescript @types/node prisma
npm install -D @coral-xyz/anchor # 온체인 프로그램 개발 시

# 5. TypeScript 설정
npx tsc --init
```

---

## 아키텍처 결정 매트릭스

### 커스터디 모델 비교

| 모델 | 장점 | 단점 | 권장 여부 |
|------|------|------|----------|
| **MPC/TSS (Turnkey)** | 키 노출 없음, 정책 제어, 규제 친화적 | 프로바이더 의존, 비용 | **PRIMARY** |
| **Dual-Key Smart Wallet (Crossmint)** | 완전 비수탁, 에이전트 전용 | 스마트 컨트랙트 복잡성 | **ALTERNATIVE** |
| 자체 HSM | 완전 제어 | 비용 과다, 운영 복잡 | NOT RECOMMENDED |
| 단순 HD Wallet | 구현 간단 | 보안 취약, 에이전트 키 노출 | NOT RECOMMENDED |

### 에이전트 통합 접근 방식

| 접근 방식 | 설명 | 권장 여부 |
|-----------|------|----------|
| **REST API + SDK** | 프레임워크 무관, 표준 HTTP | **PRIMARY** |
| MCP Server | 모델 컨텍스트 프로토콜 서버 | SECONDARY |
| 직접 SDK 통합 | 특정 프레임워크 전용 | 고객 요청 시 |

---

## 버전 매트릭스 (2026-02 기준)

| 패키지 | 권장 버전 | 최소 버전 | 비고 |
|--------|----------|----------|------|
| `@solana/kit` | 3.0.x | 2.0.0 | web3.js 2.0 후속 |
| `@solana/web3.js` | 1.98.x | 1.95.0 | 레거시 호환 |
| `@coral-xyz/anchor` | 0.32.x | 0.30.0 | v1 직전 |
| `fastify` | 5.x | 4.26.0 | LTS |
| `ai` (Vercel AI SDK) | 6.x | 5.0.0 | Agent 추상화 |
| `solana-agent-kit` | 1.x | 1.4.0 | 최신 플러그인 |
| `@turnkey/sdk-server` | latest | - | 빠른 업데이트 |
| `typescript` | 5.x | 5.0.0 | - |
| `node` | 22.x | 20.x | LTS |

---

## 고려하지 않은 기술과 이유

| 기술 | 제외 이유 |
|------|----------|
| **Python 백엔드** | TypeScript가 Solana 생태계 표준. 솔라나 SDK, 에이전트 킷 모두 TS 우선 |
| **Rust 백엔드** | 학습 곡선 높음. TS로 충분한 성능. 온체인 프로그램에만 Rust 사용 |
| **GraphQL** | 지갑 서비스에 과도한 복잡성. REST가 WaaS 표준 |
| **MongoDB** | 금융 데이터에 ACID 필수. PostgreSQL이 표준 |
| **자체 MPC 구현** | 암호학 전문성 필요, 보안 감사 비용, 시간 1년+ |
| **AWS KMS 직접 사용** | WaaS 프로바이더가 더 나은 추상화 제공 |
| **ElizaOS 기반** | 프레임워크 무관 목표와 충돌. 고객 프레임워크로 지원 가능 |

---

## 다음 단계

1. **Phase 1**: Turnkey 또는 Crossmint 선택 후 PoC 구현
2. **Phase 2**: Solana Agent Kit 통합 테스트
3. **Phase 3**: REST API 설계 및 구현
4. **Phase 4**: 프로덕션 인프라 구축

---

## 출처 (신뢰도별)

### HIGH 신뢰도 (공식 문서/릴리스)
- [Solana Kit GitHub](https://github.com/anza-xyz/kit)
- [@solana/kit npm](https://www.npmjs.com/package/@solana/kit) - v3.0.3
- [Anchor GitHub Releases](https://github.com/solana-foundation/anchor/releases) - v0.32.1
- [Turnkey Solana Documentation](https://docs.turnkey.com/ecosystems/solana)
- [Crossmint Agent Wallets](https://blog.crossmint.com/solana-ai-agent-app/)
- [Solana Agent Kit GitHub](https://github.com/sendaifun/solana-agent-kit)
- [Vercel AI SDK 6](https://vercel.com/blog/ai-sdk-6)
- [Helius Documentation](https://www.helius.dev/docs/api-reference/endpoints)

### MEDIUM 신뢰도 (검증된 블로그/가이드)
- [Alchemy: How to Build Solana AI Agents](https://www.alchemy.com/blog/how-to-build-solana-ai-agents-in-2026)
- [Helius: Build Secure AI Agent on Solana](https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana)
- [Dynamic: TSS-MPC Deep Dive](https://www.dynamic.xyz/blog/a-deep-dive-into-tss-mpc)
- [Crossmint: State of AI Agents in Solana](https://blog.crossmint.com/the-state-of-ai-agents-in-solana/)
- [QuickNode: Solana Web3.js 2.0](https://blog.quicknode.com/solana-web3-js-2-0-a-new-chapter-in-solana-development/)

### LOW 신뢰도 (일반 검색 결과)
- 일반 기술 블로그 비교 글
- 커뮤니티 토론

---

## 로드맵 시사점

1. **키 관리 먼저**: Turnkey/Crossmint 결정이 전체 아키텍처 결정
2. **에이전트 통합 표준화**: Solana Agent Kit + REST API 조합이 프레임워크 무관 목표 달성
3. **점진적 기능 확장**: 토큰 전송 -> 스왑 -> DeFi 순서
4. **멀티체인은 후순위**: Solana 우선, GOAT SDK로 확장 준비
