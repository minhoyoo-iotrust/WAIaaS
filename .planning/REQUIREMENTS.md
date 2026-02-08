# Requirements: WAIaaS v0.7 구현 장애 요소 해소

**Defined:** 2026-02-08
**Core Value:** 코드 작성 전에 "설계대로 구현하면 동작하지 않는 부분" 25건을 제거하여, 구현 첫날부터 차단 없이 진행할 수 있는 상태를 만든다.

## v0.7 Requirements

v0.1~v0.6 설계 문서 전수 분석에서 도출된 구현 장애 요소 25건. 기존 설계 문서(24~64번)를 직접 수정하여 해소한다.

### 체인 어댑터 & 트랜잭션 안정성

- [x] **CHAIN-01**: Solana blockhash freshness guard — signTransaction() 직전 잔여 수명 < 20초이면 blockhash 갱신, UnsignedTransaction에 refreshBlockhash() 추가 [CRITICAL]
- [x] **CHAIN-02**: IChainAdapter에 getCurrentNonce/resetNonceTracker 2개 메서드 추가 (17→19개), UnsignedTransaction.nonce 명시적 optional 필드 승격 [CRITICAL]
- [x] **CHAIN-03**: Keystore AES-256-GCM nonce 충돌 확률 Birthday Problem 계산을 정확한 수학적 근거로 정정 [CRITICAL]
- [x] **CHAIN-04**: Priority fee 캐시 TTL 30초 근거 명시 (Nyquist 기준) + 제출 실패 시 1.5배 fee bump 1회 재시도 전략 추가 [MEDIUM]

### 데몬 프로세스 & 보안 기반

- [x] **DAEMON-01**: JWT Secret dual-key rotation 메커니즘 — current/previous 5분 전환 윈도우, `waiaas secret rotate` CLI + `POST /v1/admin/rotate-secret` API [CRITICAL]
- [x] **DAEMON-02**: 데몬 인스턴스 잠금을 PID 파일에서 flock 기반으로 전환, Windows Named Mutex fallback [CRITICAL]
- [x] **DAEMON-03**: Rate Limiter 2단계 분리 — #3.5 globalRateLimit(IP, 1000/min DoS방어) + #9 sessionRateLimit(세션기반, authRouter 후) [HIGH]
- [x] **DAEMON-04**: killSwitchGuard 허용 엔드포인트 4개 확정 (health/status/recover/kill-switch), 503 SYSTEM_LOCKED 응답 + hint [HIGH]
- [x] **DAEMON-05**: Master Password 인증을 Argon2id로 통일 — SHA-256 해시 전송 폐기, X-Master-Password 헤더 평문(localhost only) [HIGH]
- [x] **DAEMON-06**: 단일 데몬 인스턴스 강제 — flock(1차) + 선택적 SQLite nonce 저장(2차), config.toml nonce_storage 옵션 [HIGH]

### 의존성 & 빌드 환경

- [ ] **DEPS-01**: SIWE 검증을 viem v2.x 내장 `viem/siwe` parseSiweMessage + verifyMessage로 전환, ethers/siwe npm 패키지 의존성 제거 [CRITICAL]
- [ ] **DEPS-02**: Sidecar 크로스 컴파일 전략 — prebuildify 기반 네이티브 바이너리 번들, 6개 타겟 플랫폼 확정 (ARM64 Windows 제외) [MEDIUM]

### API & 통합 프로토콜

- [ ] **API-01**: Tauri sidecar 종료 타임아웃을 5초→35초로 변경 (데몬 30초+5초 마진), 비정상 종료 시 다음 시작에서 SQLite integrity_check [CRITICAL]
- [ ] **API-02**: Tauri CORS Origin에 Windows용 `https://tauri.localhost` 추가, 개발 모드 Origin 로깅 [HIGH]
- [ ] **API-03**: Owner disconnect cascade — DELETE /v1/owner/disconnect 스펙 확정, 에이전트별 owner_address 기준 5단계 (APPROVAL→EXPIRED, DELAY유지, WC정리, 주소유지, 감사) [HIGH]
- [ ] **API-04**: 5개 TransactionType × 4 티어의 HTTP 응답 status 값 확정 (INSTANT→200 CONFIRMED/SUBMITTED, DELAY/APPROVAL→202 QUEUED) [HIGH]
- [ ] **API-05**: Tauri Setup Wizard가 CLI를 통해 초기화하는 구조 확정, `waiaas init` idempotent 보장 [HIGH]
- [ ] **API-06**: Python SDK snake_case 변환 규칙 SSoT + Pydantic v2 ConfigDict alias_generator 패턴 확정 [MEDIUM]
- [ ] **API-07**: @waiaas/core에서 Zod 스키마 export → @waiaas/sdk에서 사전 검증, Python SDK는 Pydantic field_validator 수동 매핑 [MEDIUM]

### 스키마 & 설정

- [ ] **SCHEMA-01**: config.toml 환경변수 매핑 규칙 — WAIAAS_{SECTION}_{KEY} 평탄화, 중첩 섹션 금지 [HIGH]
- [ ] **SCHEMA-02**: SQLite 타임스탬프 전체 초 단위 통일 확정, audit_log 밀리초 고려 주석 삭제, UUID v7 시간 정밀도 활용 [HIGH]
- [ ] **SCHEMA-03**: agents 테이블 chain/network CHECK 제약조건 추가 (ChainType/NetworkType Enum 값) [MEDIUM]
- [ ] **SCHEMA-04**: Docker 볼륨 UID 1001 Dockerfile 명시, WAIAAS_DATA_DIR 환경변수, 소유권 확인 로직 [MEDIUM]
- [ ] **SCHEMA-05**: amount TEXT 성능 제약 문서화 — JS number 정밀도 한계 근거, amount_lamports 보조 컬럼 옵션 유보 [MEDIUM]
- [ ] **SCHEMA-06**: 알림 채널 삭제/비활성화 시 BEGIN IMMEDIATE 트랜잭션으로 min_channels 동시성 보호 [MEDIUM]

## Out of Scope

| Feature | Reason |
|---------|--------|
| 실제 코드 구현 | 설계 보완 마일스톤 — 코드는 v0.8+ |
| v0.5 인증 재설계 재작업 | v0.5에서 완료 |
| v0.6 블록체인 확장 재작업 | v0.6에서 완료 |
| 성능 최적화 | 프로파일링은 구현 후 |
| 새로운 기능 추가 | 기존 설계의 장애 요소 해소만 |
| v0.2 아키텍처 골격 변경 | 6단계 파이프라인, 8-state 머신, 3계층 보안 유지 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAIN-01 | Phase 26 | Complete |
| CHAIN-02 | Phase 26 | Complete |
| CHAIN-03 | Phase 26 | Complete |
| CHAIN-04 | Phase 26 | Complete |
| DAEMON-01 | Phase 27 | Complete |
| DAEMON-02 | Phase 27 | Complete |
| DAEMON-03 | Phase 27 | Complete |
| DAEMON-04 | Phase 27 | Complete |
| DAEMON-05 | Phase 27 | Complete |
| DAEMON-06 | Phase 27 | Complete |
| DEPS-01 | Phase 28 | Pending |
| DEPS-02 | Phase 28 | Pending |
| API-01 | Phase 29 | Pending |
| API-02 | Phase 29 | Pending |
| API-03 | Phase 29 | Pending |
| API-04 | Phase 29 | Pending |
| API-05 | Phase 29 | Pending |
| API-06 | Phase 29 | Pending |
| API-07 | Phase 29 | Pending |
| SCHEMA-01 | Phase 30 | Pending |
| SCHEMA-02 | Phase 30 | Pending |
| SCHEMA-03 | Phase 30 | Pending |
| SCHEMA-04 | Phase 30 | Pending |
| SCHEMA-05 | Phase 30 | Pending |
| SCHEMA-06 | Phase 30 | Pending |

**Coverage:**
- v0.7 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-08 after Phase 27 completion*
