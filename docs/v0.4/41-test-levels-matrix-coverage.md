# 41. 테스트 레벨 정의, 모듈 매트릭스, 커버리지 목표

**Version:** 0.4
**Phase:** 14 - 테스트 기반 정의
**Status:** Confirmed
**Created:** 2026-02-06
**References:** 14-RESEARCH.md (Jest 30 + @swc/jest 기반 설정 패턴)

---

## 목차

1. [테스트 레벨 정의](#1-테스트-레벨-정의)
2. [모듈별 테스트 레벨 매트릭스](#2-모듈별-테스트-레벨-매트릭스)
3. [패키지별 커버리지 목표](#3-패키지별-커버리지-목표)

---

## 1. 테스트 레벨 정의

WAIaaS는 6개 테스트 레벨을 정의한다. 각 레벨은 검증 범위, 실행 환경, 실행 빈도, Mock 범위, 속도 목표가 명확히 구분된다.

### 1.1 레벨 요약 테이블

| Level | Scope | Environment | Frequency | Mock 범위 | 속도 목표 |
|-------|-------|-------------|-----------|----------|----------|
| Unit | 단일 함수/클래스 | Node.js + @swc/jest | 매 커밋 | 모든 외부 의존성 mock | 패키지당 <10s |
| Integration | 모듈 간 연동 (DB 포함) | Node.js + 실제 SQLite (tmpdir) | 매 PR | 외부 서비스만 mock (RPC, 알림) | 패키지당 <30s |
| E2E | API 엔드포인트 전체 흐름 | Node.js + Hono test client + mock chain | 매 PR | 블록체인만 mock | 전체 <2min |
| Chain Integration | 실제 블록체인 네트워크 | Devnet/Testnet | nightly/릴리스 | mock 없음 | 전체 <10min |
| Security | 공격 시나리오 재현 | Node.js + Unit 환경 | 매 PR | Unit과 동일 | 전체 <1min |
| Platform | CLI/Docker/Desktop 동작 | 각 플랫폼 환경 | 릴리스 | 환경에 따라 다름 | N/A |

### 1.2 레벨별 상세 설명

#### Unit

단일 함수, 클래스 메소드, Zod 스키마 검증 등 최소 단위의 로직을 검증한다. 모든 외부 의존성(DB, 파일시스템, 네트워크, 시간)은 mock/fake로 대체하며, 순수 입출력의 정확성만 확인한다. 테스트 대상이 의존하는 인터페이스(IChainAdapter, IPolicyEngine, INotificationChannel, IClock, IOwnerSigner)는 Mock/Fake 구현체를 주입한다.

**검증 대상:** 비즈니스 로직 정확성, 엣지 케이스 처리, 타입 안정성, Zod 스키마 입출력
**검증하지 않는 것:** DB 쿼리 실행, 실제 파일 I/O, 네트워크 통신, 모듈 간 연동

#### Integration

2개 이상의 모듈이 연동하여 동작하는 흐름을 검증한다. 실제 SQLite 데이터베이스를 임시 디렉토리에 생성하여 Drizzle ORM 쿼리, 트랜잭션 격리, 마이그레이션을 포함한 데이터 계층 동작을 확인한다. 외부 서비스(블록체인 RPC, 알림 채널)만 mock으로 유지한다.

**검증 대상:** DB 쿼리 정확성, 서비스 간 데이터 흐름, 트랜잭션 격리/롤백, 캐시 일관성
**검증하지 않는 것:** 블록체인 네트워크 응답, 외부 알림 채널 전송, HTTP API 엔드포인트 전체 흐름

#### E2E (End-to-End)

HTTP API 엔드포인트에 요청을 보내고 응답을 검증하는 전체 흐름 테스트이다. Hono의 `app.request()` 테스트 클라이언트를 사용하여 실제 HTTP 서버를 띄우지 않고도 미들웨어 체인, 라우트 핸들러, 요청/응답 직렬화를 포함한 API 동작을 검증한다. 블록체인 어댑터만 mock으로 대체한다.

**검증 대상:** 미들웨어 체인(인증, 호스트 가드, CORS, 레이트 리밋), API 요청/응답 형식, 에러 코드, 전체 트랜잭션 흐름
**검증하지 않는 것:** 실제 블록체인 트랜잭션 제출/확인, 네트워크 레이턴시, TLS/포트 바인딩

#### Chain Integration

실제 블록체인 네트워크(Solana Devnet/Testnet)에 연결하여 트랜잭션 빌드, 시뮬레이션, 제출, 확인까지의 전체 온체인 흐름을 검증한다. Mock을 전혀 사용하지 않으며, 네트워크 상태에 따라 테스트 결과가 달라질 수 있어 nightly/릴리스 주기로 실행한다.

**검증 대상:** 실제 RPC 응답 파싱, 트랜잭션 직렬화/서명/제출, 블록 확인 폴링, 네트워크 에러 복구
**검증하지 않는 것:** 메인넷 동작 (Devnet/Testnet만 사용), 대량 트랜잭션 부하

#### Security

알려진 공격 벡터를 시나리오로 재현하여 방어 로직을 검증한다. Unit 테스트와 동일한 환경(mock 포함)에서 실행되지만, 공격 패턴에 초점을 맞춘다. 입력 검증 우회, 인증/인가 우회, 타이밍 공격, Replay 공격 등을 포함한다. 상세 시나리오는 Phase 15에서 정의한다.

**검증 대상:** 입력 검증 우회 시도, 인증 토큰 위변조, 정책 우회, TOCTOU 공격, Replay 공격 방어
**검증하지 않는 것:** 인프라 수준 공격(DDoS, 네트워크 스니핑), 물리적 보안, 제3자 라이브러리 취약점

#### Platform

CLI 바이너리 실행, Docker 컨테이너 빌드/실행, Tauri 데스크톱 앱 패키징 등 각 배포 플랫폼에서의 동작을 검증한다. 실행 환경이 플랫폼마다 다르며, 자동화 가능한 범위가 제한적이므로 릴리스 시에만 실행한다.

**검증 대상:** CLI `init/start/stop/status` 명령, Docker 이미지 빌드/헬스체크, Tauri Sidecar 패키징/실행
**검증하지 않는 것:** UI 시각적 검증(수동 QA), 크로스 플랫폼 호환성(macOS/Windows/Linux 동시), 성능 벤치마크

### 1.3 속도 vs 충실도 최적화 전략

각 테스트 레벨은 속도와 충실도 사이에서 최적 균형점을 갖는다. 아래는 레벨별 Jest 설정 최적화 전략이다.

| 테스트 레벨 | Jest 설정 | 충실도 | 최적화 근거 |
|------------|----------|--------|-----------|
| Unit | `--maxWorkers=75%` | LOW (로직 정확성만) | 모든 I/O를 mock으로 제거하여 CPU 바운드 최적화. 병렬 워커로 처리량 극대화 |
| Integration | `--runInBand` | MEDIUM (DB 상호작용 포함) | SQLite 파일 잠금 방지를 위해 순차 실행. 대안으로 테스트별 독립 tmpdir 사용 시 병렬 가능 |
| E2E | `--detectOpenHandles` | HIGH (API 레벨 전체 흐름) | Hono 서버 인스턴스의 리소스 누수 방지. 각 테스트 후 서버 close 확인 |
| Security | `--maxWorkers=75%` | HIGH (공격 벡터 특화) | Unit과 동일 환경이나 공격 시나리오에 집중. Phase 15에서 상세 시나리오 정의 |
| Chain Integration | `--runInBand --testTimeout=60000` | HIGHEST (실제 네트워크) | 네트워크 지연 허용을 위한 긴 타임아웃. 순차 실행으로 nonce 충돌 방지 |
| Platform | 레벨별 개별 설정 | VARIES | CLI는 프로세스 spawn, Docker는 컨테이너 빌드. 각 환경에 맞는 별도 설정 |

**개발 시 최적화:**
- `--bail` 활성화: 첫 번째 실패 시 즉시 중단하여 빠른 피드백 제공
- `--watch` 모드: 파일 변경 시 관련 테스트만 자동 재실행
- `--onlyChanged`: 변경된 파일에 영향받는 테스트만 실행

**CI 최적화:**
- `--bail` 비활성: 전체 실패 목록을 한 번에 확인
- `--ci` 플래그: 스냅샷 자동 업데이트 비활성, 명시적 실패 처리
- `--forceExit`: 핸들 누수로 인한 CI 행(hang) 방지 (E2E에서만)

### 1.4 실행 빈도 피라미드

테스트 레벨은 피라미드 구조를 따르며, 빈번한 실행일수록 빠르고 가벼운 테스트를 배치한다.

```
                    Platform
                  (릴리스 시)
                 Chain Integration
                (nightly/릴리스 시)
              --------- E2E ---------
                   (매 PR 시)
           --------- Security ----------
                   (매 PR 시)
        --------- Integration -----------
                   (매 PR 시)
     ============== Unit ================
           (매 커밋 + 로컬 watch)
```

| 빈도 | 레벨 | 트리거 | 게이트 |
|------|------|--------|--------|
| 매 커밋 | Unit | 로컬 watch 모드 + CI push | CI 필수 통과 |
| 매 PR | Integration, E2E, Security | CI PR 이벤트 | CI 필수 통과 |
| nightly/릴리스 | Chain Integration, Platform | cron 스케줄 / 릴리스 태그 | 릴리스 차단 |

### 1.5 테스트 인프라 참조

| 항목 | 설정 |
|------|------|
| 프레임워크 | Jest 30 + @swc/jest |
| 트랜스포머 | @swc/jest (Rust 기반, ts-jest 대비 ~40% CI 시간 절감) |
| Mock 라이브러리 | jest-mock-extended 4.x (타입 안전 인터페이스 mock) |
| 파일시스템 Mock | memfs (Unit), tmpdir (Integration) |
| 커버리지 엔진 | v8 coverage provider (Jest 30 기본) |
| 커버리지 측정 범위 | Unit + Integration만 (E2E는 별도 관리) |
| 로컬 개발 | Watch 모드 기본 |
| CI 게이트 | 초기 soft gate (경고만) -> 안정화 후 hard gate (PR 차단) |
| 모노레포 실행 | 루트 Jest projects 설정 + 패키지별 jest.config.ts |
| 빌드 캐시 | Turborepo `test` 태스크 (cache: false, 항상 실행) |

---

## 2. 모듈별 테스트 레벨 매트릭스

9개 모듈(7 모노레포 패키지 + Python SDK + Desktop App)에 대해 6개 테스트 레벨의 적용 여부를 정의한다. O는 적용, -는 해당없음을 의미한다.

### 2.1 매트릭스 요약

| Module | Unit | Integration | E2E | Chain Integration | Security | Platform |
|--------|------|-------------|-----|-------------------|----------|----------|
| @waiaas/core | O | O | - | - | O | - |
| @waiaas/daemon | O | O | O | - | O | - |
| @waiaas/adapter-solana | O | O | - | O | - | - |
| @waiaas/adapter-evm | O | - | - | - | - | - |
| @waiaas/cli | - | O | - | - | - | O |
| @waiaas/sdk | O | O | - | - | - | - |
| @waiaas/mcp | O | O | - | - | - | - |
| Python SDK | O | O | - | - | - | - |
| Desktop App (Tauri) | - | - | - | - | - | O |

### 2.2 매트릭스 셀별 검증 대상

#### @waiaas/core

| Level | 검증 대상 |
|-------|----------|
| Unit | Zod 스키마 검증 (입력 유효성/거부), Enum 일관성 (45-enum-unified-mapping 준수), 순수 유틸리티 함수, 타입 가드 |
| Integration | 테스트 유틸리티(FakeClock, FakeOwnerSigner, MockChainAdapter 등)가 Contract Test 스위트를 통과하는지 검증 |
| Security | Zod 스키마 우회 시도 (악의적 입력, 프로토타입 오염, JSON 인젝션), Enum 범위 밖 값 처리 |

#### @waiaas/daemon

| Level | 검증 대상 |
|-------|----------|
| Unit | 서비스 로직(SessionService, PolicyEngine, TransactionService), 미들웨어 개별 동작(sessionAuth, ownerAuth, hostGuard, rateLimit), 키스토어 암호화/복호화 로직 |
| Integration | 서비스 + SQLite DB 연동(세션 CRUD, 정책 평가 + DB 조회, 트랜잭션 파이프라인 + 상태 전이), 키스토어 + 실제 파일시스템 |
| E2E | 31개 API 엔드포인트 전체 흐름: 세션 생성->트랜잭션 요청->정책 평가->응답, 미들웨어 체인 통합(9단계), 에러 응답 형식 검증 |
| Security | 인증 토큰 위변조, 세션 하이재킹, 정책 우회(TOCTOU 공격), Rate limit 우회, Host header 변조, Replay 공격 방어 |

#### @waiaas/adapter-solana

| Level | 검증 대상 |
|-------|----------|
| Unit | 주소 검증 로직, 트랜잭션 빌드/직렬화, 수수료 추정 계산, 에러 코드 매핑(RPC 에러 -> WAIaaS 에러) |
| Integration | Mock RPC 서버와의 연동 흐름 (connect -> getBalance -> buildTransaction -> simulate), Contract Test 스위트 실행 |
| Chain Integration | Solana Devnet 실제 연결, SOL 전송 전체 흐름(빌드->시뮬레이션->서명->제출->확인), 네트워크 에러 복구 |

#### @waiaas/adapter-evm

| Level | 검증 대상 |
|-------|----------|
| Unit | 13개 메소드 전체가 CHAIN_NOT_SUPPORTED 에러를 throw하는지 확인, Stub 인터페이스 준수 |

#### @waiaas/cli

| Level | 검증 대상 |
|-------|----------|
| Integration | CLI 명령 실행(init, start, stop, status) + 데몬 프로세스 상호작용, config.toml 생성/읽기, exit code 검증 |
| Platform | 실제 바이너리로 패키징 후 init->start->status->stop 전체 흐름, Node.js SEA 패키징 동작 확인 |

#### @waiaas/sdk

| Level | 검증 대상 |
|-------|----------|
| Unit | SDK 클라이언트 메소드 시그니처, 요청 빌드 로직, 응답 파싱/타입 변환, 에러 래핑 |
| Integration | Mock HTTP 서버(MSW 또는 Hono test client)와의 연동, 세션 토큰 관리 흐름, 재시도 로직 |

#### @waiaas/mcp

| Level | 검증 대상 |
|-------|----------|
| Unit | 6개 MCP 도구 정의(스키마, 파라미터 검증), 3개 리소스 정의, SDK 메소드 호출 위임 로직 |
| Integration | SDK를 통한 daemon 연동 흐름, stdio 전송 프로토콜 입출력, WAIAAS_SESSION_TOKEN 환경변수 처리 |

#### Python SDK

| Level | 검증 대상 |
|-------|----------|
| Unit | Pydantic v2 모델 직렬화/역직렬화, 클라이언트 메소드 시그니처, snake_case 변환, 에러 타입 |
| Integration | httpx AsyncClient + Mock 서버 연동, 세션 토큰 관리, 비동기 요청/응답 흐름 |

#### Desktop App (Tauri)

| Level | 검증 대상 |
|-------|----------|
| Platform | Tauri 앱 빌드/패키징, Sidecar(Node.js SEA) 실행, IPC 통신(daemon lifecycle), 트레이 아이콘 3-color 상태 전환 |

---

## 3. 패키지별 커버리지 목표

보안 위험도 기반 차등 커버리지를 적용한다. 커버리지는 Unit + Integration 테스트로 측정하며, E2E는 별도 관리한다.

### 3.1 커버리지 Tier 정의

| Tier | 커버리지 범위 | 적용 기준 |
|------|-------------|----------|
| Critical | 90%+ | 자금 보호, 인증/인가, 정책 평가 등 보안 핵심 모듈. 실패 시 자금 손실 또는 무단 접근 가능 |
| High | 80%+ | 공개 인터페이스, 외부 연동 어댑터. 실패 시 서비스 중단 또는 데이터 불일치 가능 |
| Normal | 70%+ | 유틸리티, CLI, 얇은 위임 레이어. 실패 시 사용성 저하이나 보안 영향 없음 |
| Low | 50%+ | Stub/미구현 모듈. 인터페이스 준수 확인만 필요 |

### 3.2 패키지 수준 커버리지 목표

| Package | Target | Tier | Rationale |
|---------|--------|------|-----------|
| @waiaas/core | 90%+ | Critical | SSoT Enum 9종, Zod 스키마, 인터페이스 정의를 포함하며 모든 패키지의 기반이 된다. 여기서의 타입 오류는 전체 시스템으로 전파된다 |
| @waiaas/daemon | 하위 모듈별 차등 | Critical~Normal | 키스토어(보안 최상위)부터 라이프사이클(프로세스 관리)까지 보안 위험도가 혼재한다. 패키지 전체 단일 수치로는 보안 보장이 불충분하므로 모듈별 세분화 적용 |
| @waiaas/adapter-solana | 80%+ | High | RPC 의존도가 높아 Mock 한계가 존재하나, 주소 검증/트랜잭션 빌드/에러 매핑 등 핵심 로직은 순수 함수로 검증 가능하다 |
| @waiaas/adapter-evm | 50%+ | Low | v0.4에서는 Stub만 존재한다. 13개 메소드가 CHAIN_NOT_SUPPORTED를 throw하는지만 확인하면 충분하다 |
| @waiaas/cli | 70%+ | Normal | parseArgs 기반 명령 파싱과 프로세스 spawn/시그널 전달이 주요 로직이다. 프로세스 간 통신 특성상 Unit보다 Integration 위주로 검증한다 |
| @waiaas/sdk | 80%+ | High | AI 에이전트와 외부 클라이언트가 직접 사용하는 공개 인터페이스이다. 타입 안정성과 에러 처리의 정확성이 사용자 경험에 직결된다 |
| @waiaas/mcp | 70%+ | Normal | SDK 위의 얇은 위임 레이어로, 6개 MCP 도구와 3개 리소스의 스키마 정의/위임 로직만 포함한다. 핵심 로직은 SDK에서 검증된다 |
| Python SDK | 80%+ | High | httpx + Pydantic v2 기반 별도 레포이다. pytest + httpx.AsyncClient mock으로 TS SDK와 동일 수준의 인터페이스 안정성을 보장한다 |
| Desktop App (Tauri) | 제외 | - | UI 컴포넌트는 수동 QA 중심이며, 자동화 커버리지 측정 대상에서 제외한다. Platform 테스트로 빌드/패키징/IPC만 검증한다 |

### 3.3 @waiaas/daemon 모듈별 세분화 커버리지

@waiaas/daemon은 보안 위험도가 모듈마다 크게 다르므로, 디렉토리 단위로 커버리지 목표를 세분화한다.

| daemon Sub-Module | Target | Tier | Rationale |
|-------------------|--------|------|-----------|
| infrastructure/keystore/ | 95%+ | Critical | AES-256-GCM 암호화, Argon2id 키 파생, sodium guarded memory 관리를 담당한다. 자금 보호의 최전선이며, 암호화 로직의 어떤 경로도 미검증 상태로 남아서는 안 된다 |
| services/session-service | 90%+ | Critical | JWT HS256 토큰 발급/검증, 세션 만료/무효화, nonce LRU 캐시를 관리한다. 인증 우회 시 전체 시스템 접근 권한이 탈취된다 |
| services/policy-engine | 90%+ | Critical | DatabasePolicyEngine의 4-tier 정책 평가(INSTANT/NOTIFY/DELAY/APPROVAL), TOCTOU 방지를 위한 BEGIN IMMEDIATE + reserved_amount 로직을 포함한다. 정책 평가 오류는 자금 무단 이동으로 이어진다 |
| services/transaction-service | 90%+ | Critical | 6단계 트랜잭션 파이프라인(validate->policy->build->simulate->sign->submit)과 8-state 상태 머신을 관리한다. 파이프라인의 단일 단계 오류가 자금 손실로 이어질 수 있다 |
| server/middleware/ | 85%+ | High | sessionAuth 2단계 검증, ownerAuth 8단계 검증, hostGuard(127.0.0.1 강제), rateLimit 3레벨(global/session/tx)을 포함한다. 미들웨어 우회는 보안 계층 전체를 무력화한다 |
| server/routes/ | 80%+ | High | 31개 API 엔드포인트의 요청 파싱(Zod), 서비스 위임, 응답 직렬화를 담당한다. 라우트 핸들러는 서비스 로직을 위임하므로 직접 보안 로직은 적으나, 입력 검증 누락이 보안 취약점이 된다 |
| infrastructure/database/ | 80%+ | High | Drizzle ORM 스키마 정의, 마이그레이션, 쿼리 빌더를 포함한다. 쿼리 오류는 데이터 불일치와 상태 손상으로 이어지며, 트랜잭션 격리 실패는 TOCTOU 취약점을 유발한다 |
| infrastructure/notifications/ | 80%+ | High | Telegram/Discord/ntfy.sh 채널의 INotificationChannel 구현체와 TokenBucketRateLimiter를 포함한다. 모든 레벨에서 완전 Mock이므로 HTTP 호출 로직 자체의 정확성을 검증한다 |
| lifecycle/ | 75%+ | Normal | 7단계 startup, 10단계 graceful shutdown, 시그널 핸들링(SIGTERM/SIGINT), 프로세스 관리를 담당한다. 실패 시 서비스 중단이나 리소스 누수가 발생하나, 자금 손실 위험은 제한적이다 |

### 3.4 커버리지 측정 방법

**커버리지 엔진:** Jest 30의 v8 coverage provider (기본 제공)

**임계값 설정:** 루트 `jest.config.ts`에서 `coverageThreshold`를 glob 패턴으로 지정한다. Jest projects에서 per-project `coverageThreshold`는 지원이 제한적이므로(Pitfall #2), 반드시 루트에서 관리한다.

```typescript
// jest.config.ts (루트) -- 커버리지 임계값 설정 예시
coverageThreshold: {
  // 글로벌 기본값
  global: {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
  },
  // @waiaas/core (Critical)
  './packages/core/src/': {
    branches: 85, functions: 90, lines: 90, statements: 90,
  },
  // @waiaas/daemon - keystore (Critical, 최상위)
  './packages/daemon/src/infrastructure/keystore/': {
    branches: 90, functions: 95, lines: 95, statements: 95,
  },
  // @waiaas/daemon - 핵심 서비스 (Critical)
  './packages/daemon/src/services/': {
    branches: 85, functions: 90, lines: 90, statements: 90,
  },
  // @waiaas/daemon - 미들웨어 (High)
  './packages/daemon/src/server/middleware/': {
    branches: 80, functions: 85, lines: 85, statements: 85,
  },
  // @waiaas/daemon - 라우트 (High)
  './packages/daemon/src/server/routes/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  // @waiaas/daemon - DB/알림 인프라 (High)
  './packages/daemon/src/infrastructure/database/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  './packages/daemon/src/infrastructure/notifications/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  // @waiaas/daemon - 라이프사이클 (Normal)
  './packages/daemon/src/lifecycle/': {
    branches: 70, functions: 75, lines: 75, statements: 75,
  },
  // @waiaas/adapter-solana (High)
  './packages/adapters/solana/src/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  // @waiaas/adapter-evm (Low)
  './packages/adapters/evm/src/': {
    branches: 45, functions: 50, lines: 50, statements: 50,
  },
  // @waiaas/sdk (High)
  './packages/sdk/src/': {
    branches: 75, functions: 80, lines: 80, statements: 80,
  },
  // @waiaas/cli (Normal)
  './packages/cli/src/': {
    branches: 65, functions: 70, lines: 70, statements: 70,
  },
  // @waiaas/mcp (Normal)
  './packages/mcp/src/': {
    branches: 65, functions: 70, lines: 70, statements: 70,
  },
}
```

**측정 제외 대상:**
- `**/*.d.ts` -- 타입 선언 파일
- `**/index.ts` -- barrel export 파일
- `**/testing/**` -- 테스트 유틸리티 (FakeClock, MockChainAdapter 등)
- `**/__tests__/**` -- 테스트 코드 자체

### 3.5 CI 게이트 전략

커버리지 게이트는 프로젝트 성숙도에 따라 2단계로 적용한다.

| Phase | 게이트 유형 | 동작 | 전환 조건 |
|-------|-----------|------|----------|
| Phase 1 (초기) | Soft Gate | 커버리지 미달 시 CI 경고 출력, PR은 통과 허용 | 프로젝트 시작부터 적용 |
| Phase 2 (안정화 후) | Hard Gate | 커버리지 미달 시 CI 실패, PR 차단 | 각 패키지의 커버리지가 목표의 80% 이상에 안정적으로 도달한 후 |

**Soft Gate 구현 방식:**
- Jest `coverageThreshold` 설정은 유지하되, CI 스크립트에서 `jest --coverage` 실패 시 exit code를 무시하고 경고만 출력
- 커버리지 리포트는 PR 코멘트에 첨부하여 가시성 확보

**Hard Gate 전환 판단 기준:**
- 최근 10회 PR에서 해당 패키지의 커버리지가 목표 수치의 80% 이상 유지
- 예: @waiaas/core 목표 90%이면, 72% 이상이 10회 연속 유지 시 hard gate 전환
- 전환은 패키지별로 독립 적용 (전체 일괄 전환 아님)
