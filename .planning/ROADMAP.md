# Roadmap: WAIaaS v0.7 구현 장애 요소 해소

## 개요

v0.1~v0.6 설계 문서 전수 분석에서 도출된 25건의 구현 장애 요소(CRITICAL 7 + HIGH 10 + MEDIUM 8)를 해소한다. 기존 설계 문서(24~64번)를 직접 수정하여, 코드 작성 첫날부터 차단 없이 구현을 진행할 수 있는 상태를 만든다. 새 문서를 만들지 않고 기존 문서에 `[v0.7 보완]` 태그를 붙여 추적 가능하게 보완한다.

## Milestones

<details>
<summary>v0.1 MVP Research (Phases 1-5) -- SHIPPED 2026-02-05</summary>
15 plans, 23 reqs -- Research & Design
</details>

<details>
<summary>v0.2 Self-Hosted Design (Phases 6-9) -- SHIPPED 2026-02-05</summary>
16 plans, 45 reqs, 17 docs (24-40)
</details>

<details>
<summary>v0.3 설계 일관성 (Phases 10-13) -- SHIPPED 2026-02-06</summary>
8 plans, 37 reqs, 5 mapping docs
</details>

<details>
<summary>v0.4 테스트 전략 (Phases 14-18) -- SHIPPED 2026-02-07</summary>
9 plans, 26 reqs, 11 docs (41-51)
</details>

<details>
<summary>v0.5 인증 재설계 + DX (Phases 19-21) -- SHIPPED 2026-02-07</summary>
9 plans, 24 reqs, 15 docs (52-55 신규 + 11개 수정)
</details>

<details>
<summary>v0.6 블록체인 확장 설계 (Phases 22-25) -- SHIPPED 2026-02-08</summary>
11 plans, 30 reqs, 9 docs (56-64 신규) + 8개 기존 문서 통합
</details>

### v0.7 구현 장애 요소 해소 (진행 중)

**마일스톤 목표:** 25건의 구현 장애 요소를 설계 문서 직접 수정으로 해소

## Phases

- [x] **Phase 26: 체인 어댑터 안정화** - blockhash 경쟁 조건, EVM nonce, keystore 수학, fee 전략 해소
- [x] **Phase 27: 데몬 보안 기반 확립** - JWT rotation, flock 잠금, Rate Limiter 분리, killSwitch 확정, 패스워드 통일
<<<<<<< HEAD
- [ ] **Phase 28: 의존성 빌드 환경 해소** - SIWE viem 전환, sidecar 크로스 컴파일 전략 확정
=======
- [x] **Phase 28: 의존성 빌드 환경 해소** - SIWE viem 전환, sidecar 크로스 컴파일 전략 확정
>>>>>>> gsd/phase-28-dependency-build-resolution
- [ ] **Phase 29: API 통합 프로토콜 완성** - Tauri 타임아웃/CORS, disconnect cascade, status 응답, init 순서, SDK 보완
- [ ] **Phase 30: 스키마 설정 확정** - 환경변수 매핑, timestamp 정밀도, CHECK 제약, Docker UID, amount 근거, 채널 삭제

## Phase Details

### Phase 26: 체인 어댑터 안정화
**Goal**: 블록체인 트랜잭션이 설계대로 구현 시 런타임 장애 없이 동작하는 상태를 만든다
**Depends on**: Nothing (첫 번째 페이즈)
**Requirements**: CHAIN-01, CHAIN-02, CHAIN-03, CHAIN-04
**Success Criteria** (what must be TRUE):
  1. Solana 트랜잭션 서명 직전 blockhash 잔여 수명을 검사하는 freshness guard 스펙이 31-solana-adapter-detail에 추가되어, sign 시점 blockhash 만료 경쟁 조건이 설계 수준에서 해소되었다
  2. IChainAdapter가 getCurrentNonce/resetNonceTracker 포함 19개 메서드로 확장되고, UnsignedTransaction.nonce가 명시적 optional 필드로 승격되어, EVM nonce 관리가 타입 안전하게 설계되었다
  3. 26-keystore-spec의 AES-256-GCM nonce 충돌 확률이 정확한 Birthday Problem 수식(P ~ 1-e^(-n^2/2N), N=2^96)으로 정정되고 실제 사용 패턴 분석이 추가되었다
  4. Priority fee 캐시 TTL 30초의 Nyquist 기준 근거가 명시되고, 제출 실패 시 1.5배 fee bump 1회 재시도 전략이 추가되었다
**Plans**: 2 plans

Plans:
- [x] 26-01-PLAN.md -- Solana blockhash freshness guard + EVM nonce 인터페이스 확장 (CHAIN-01, CHAIN-02)
- [x] 26-02-PLAN.md -- Keystore nonce 수학 정정 + Priority fee TTL 근거/bump 전략 (CHAIN-03, CHAIN-04)

### Phase 27: 데몬 보안 기반 확립
**Goal**: 데몬 프로세스의 보안 메커니즘이 구현 시 경쟁 조건이나 보안 수준 불일치 없이 동작하는 상태를 만든다
**Depends on**: Phase 26
**Requirements**: DAEMON-01, DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-05, DAEMON-06
**Success Criteria** (what must be TRUE):
  1. JWT Secret이 current/previous dual-key 구조로 5분 전환 윈도우를 가지며, rotate CLI와 API가 정의되어, 로테이션 시 기존 세션이 즉시 무효화되지 않는다
  2. 데몬 인스턴스 잠금이 flock 기반(Windows Named Mutex fallback)으로 전환되어, PID 파일 경쟁 조건이 제거되고, DAEMON-06의 nonce replay 방지를 위한 SQLite nonce 저장 옵션이 추가되었다
  3. Rate Limiter가 globalRateLimit(#3.5, IP 1000/min)과 sessionRateLimit(#9, authRouter 후)로 2단계 분리되어, 미인증 공격자가 인증 사용자의 rate limit을 소진할 수 없다
  4. killSwitchGuard 허용 엔드포인트 4개(health/status/recover/kill-switch)가 확정되고 503 SYSTEM_LOCKED 응답이 정의되었으며, Master Password 인증이 전체 Argon2id로 통일되었다
**Plans**: 3 plans

Plans:
- [x] 27-01-PLAN.md -- JWT Secret dual-key rotation + flock 기반 인스턴스 잠금 (DAEMON-01, DAEMON-02)
- [x] 27-02-PLAN.md -- Rate Limiter 2단계 분리 + killSwitchGuard 허용 목록 확정 (DAEMON-03, DAEMON-04)
- [x] 27-03-PLAN.md -- Master Password Argon2id 통일 + 단일 인스턴스 SQLite nonce 옵션 (DAEMON-05, DAEMON-06)

### Phase 28: 의존성 빌드 환경 해소
**Goal**: 모노레포 첫 빌드부터 의존성 충돌이나 네이티브 바이너리 문제 없이 빌드가 성공하는 상태를 만든다
**Depends on**: Phase 27 (SIWE 전환은 보안 기반 확립 후)
**Requirements**: DEPS-01, DEPS-02
**Success Criteria** (what must be TRUE):
  1. SIWE 검증이 viem v2.x 내장 parseSiweMessage + verifyMessage로 전환되어, ethers와 siwe npm 패키지 의존성이 모노레포에서 완전히 제거된 설계이다
  2. Sidecar 크로스 컴파일 대상 5개 플랫폼(ARM64 Windows 제외)이 확정되고, prebuildify 기반 네이티브 바이너리 번들 전략이 정의되었다
**Plans**: 1 plan

Plans:
<<<<<<< HEAD
- [ ] 28-01-PLAN.md -- SIWE viem 전환 + Sidecar 크로스 컴파일 전략 (DEPS-01, DEPS-02)
=======
- [x] 28-01-PLAN.md -- SIWE viem 전환 + Sidecar 크로스 컴파일 전략 (DEPS-01, DEPS-02)
>>>>>>> gsd/phase-28-dependency-build-resolution

### Phase 29: API 통합 프로토콜 완성
**Goal**: REST API, SDK, 플랫폼 통합의 모호한 스펙이 확정되어, 클라이언트 구현자가 추가 질문 없이 코딩할 수 있는 상태를 만든다
**Depends on**: Phase 27 (Rate Limiter/killSwitch 변경 반영), Phase 28 (SIWE 전환 반영)
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria** (what must be TRUE):
  1. Tauri sidecar 종료 타임아웃이 35초(데몬 30초 + 5초 마진)로 변경되고, 비정상 종료 시 SQLite integrity_check 복구 로직이 추가되었으며, Windows용 CORS Origin(https://tauri.localhost)이 허용 목록에 포함되었다
  2. DELETE /v1/owner/disconnect의 cascade 동작이 에이전트별 owner_address 기준 5단계(APPROVAL->EXPIRED, DELAY유지, WC정리, 주소유지, 감사)로 확정되었다
  3. 5개 TransactionType 전체에 대해 티어별 HTTP 응답 status 값(INSTANT->200 CONFIRMED/SUBMITTED, DELAY/APPROVAL->202 QUEUED)이 확정되었다
  4. Tauri Setup Wizard가 CLI를 통해서만 초기화하는 구조이고 waiaas init이 idempotent하며, Python SDK snake_case 변환 규칙과 Zod 스키마 @waiaas/core export 패턴이 SSoT로 정의되었다
**Plans**: 3 plans

Plans:
- [ ] 29-01-PLAN.md -- Tauri 종료 타임아웃 35초 + CORS 3종 Origin + Setup Wizard CLI 위임 (API-01, API-02, API-05)
- [ ] 29-02-PLAN.md -- Owner disconnect cascade 5단계 + TransactionType x Tier HTTP 응답 매트릭스 (API-03, API-04)
- [ ] 29-03-PLAN.md -- Python SDK snake_case SSoT + Zod 스키마 @waiaas/core export 패턴 (API-06, API-07)

### Phase 30: 스키마 설정 확정
**Goal**: 데이터베이스 스키마와 설정 파일의 미결정 사항이 모두 확정되어, 모든 변경의 데이터 모델이 완전한 상태를 만든다
**Depends on**: Phase 27 (flock/nonce 설정 반영), Phase 29 (API 변경의 스키마 반영)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SCHEMA-05, SCHEMA-06
**Success Criteria** (what must be TRUE):
  1. config.toml 환경변수 매핑 규칙이 WAIAAS_{SECTION}_{KEY} 평탄화로 확정되고, 중첩 섹션 금지가 Zod 스키마에 에러 메시지로 반영되었다
  2. SQLite 타임스탬프가 전체 초 단위(Unix epoch INTEGER)로 통일 확정되고, audit_log 밀리초 고려 주석이 삭제되어 UUID v7 시간 정밀도 활용으로 대체되었다
  3. agents 테이블에 chain/network CHECK 제약조건이 추가되고, Docker 볼륨 UID 1001이 Dockerfile에 명시되어 데이터 디렉토리 소유권 확인 로직이 정의되었다
  4. amount TEXT 유지 근거(JS number 정밀도 한계)가 문서화되고 amount_lamports 보조 컬럼 옵션이 유보되었으며, 알림 채널 삭제가 BEGIN IMMEDIATE 트랜잭션으로 동시성 보호되었다
**Plans**: TBD

Plans:
- [ ] 30-01: 환경변수 매핑 규칙 + SQLite timestamp 통일
- [ ] 30-02: agents CHECK 제약 + Docker UID + amount TEXT 근거 + 채널 삭제 트랜잭션

## Progress

**Execution Order:**
Phase 26 -> 27 -> 28 -> 29 -> 30

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 26. 체인 어댑터 안정화 | 2/2 | ✓ Complete | 2026-02-08 |
| 27. 데몬 보안 기반 확립 | 3/3 | ✓ Complete | 2026-02-08 |
<<<<<<< HEAD
| 28. 의존성 빌드 환경 해소 | 0/1 | Planning complete | - |
| 29. API 통합 프로토콜 완성 | 0/3 | Not started | - |
=======
| 28. 의존성 빌드 환경 해소 | 1/1 | ✓ Complete | 2026-02-08 |
| 29. API 통합 프로토콜 완성 | 0/3 | In progress | - |
>>>>>>> gsd/phase-28-dependency-build-resolution
| 30. 스키마 설정 확정 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-08*
<<<<<<< HEAD
*Last updated: 2026-02-08 after Phase 28 planning*
=======
*Last updated: 2026-02-08 after Phase 29 planning*
>>>>>>> gsd/phase-28-dependency-build-resolution
