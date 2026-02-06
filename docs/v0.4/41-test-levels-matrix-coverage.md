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
