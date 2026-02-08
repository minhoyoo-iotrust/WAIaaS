# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-08)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.
<<<<<<< HEAD
<<<<<<< HEAD
**현재 초점:** v0.7 Phase 27 완료 (verified ✓) -> Phase 28 의존성 빌드 환경 해소
=======
**현재 초점:** v0.7 Phase 28 완료 (verified ✓) -> Phase 29 API 통합 프로토콜 완성
>>>>>>> gsd/phase-28-dependency-build-resolution
=======
**현재 초점:** v0.7 Phase 29 complete (3/3 plans). Phase 30 대기.
>>>>>>> gsd/phase-29-api-integration-protocol

## 현재 위치

마일스톤: v0.7 구현 장애 요소 해소
<<<<<<< HEAD
<<<<<<< HEAD
페이즈: 27 of 30 (데몬 보안 기반) -- COMPLETE
플랜: 3 of 3 in current phase -- COMPLETE
상태: Phase complete (verified ✓, 4/4 must-haves)
마지막 활동: 2026-02-08 -- Phase 27 verified, DAEMON-01~06 complete

Progress: █████████░░░░░░░░░░░ 45% (5/11)
=======
페이즈: 28 of 30 (의존성 빌드 환경 해소) -- COMPLETE
플랜: 1 of 1 in current phase -- COMPLETE
상태: Phase complete (verified ✓, 3/3 must-haves)
마지막 활동: 2026-02-08 -- Phase 28 verified, DEPS-01~02 complete

Progress: ██████████░░░░░░░░░░ 55% (6/11)
>>>>>>> gsd/phase-28-dependency-build-resolution
=======
페이즈: 29 of 30 (API 통합 프로토콜 완성) -- COMPLETE
플랜: 3 of 3 in current phase -- COMPLETE
상태: Phase complete (verified ✓, 23/23 must-haves)
마지막 활동: 2026-02-08 -- Phase 29 verified, API-01~07 complete

Progress: ██████████████████░░ 82% (9/11)
>>>>>>> gsd/phase-29-api-integration-protocol

## 성과 지표

**v0.1 최종 통계:** 15 plans, 23/23 reqs
**v0.2 최종 통계:** 16 plans, 45/45 reqs, 17 docs
**v0.3 최종 통계:** 8 plans, 37/37 reqs, 5 mapping docs
**v0.4 최종 통계:** 9 plans, 26/26 reqs, 11 docs (41-51)
**v0.5 최종 통계:** 9 plans, 24/24 reqs, 15 docs (52-55 신규 + 11개 기존 문서 수정)
**v0.6 최종 통계:** 11 plans, 30/30 reqs, 9 docs (56-64 신규) + 기존 8개 문서 v0.6 통합

**누적:** 68 plans, 185 reqs, 30 설계 문서 (24-64), 25 phases

**v0.7:**
- Total plans: 11 (2+3+1+3+2)
- Requirements: 25
<<<<<<< HEAD
<<<<<<< HEAD
- Completed: 5/11 plans (26-01, 26-02, 27-01, 27-02, 27-03)
=======
- Completed: 6/11 plans (26-01, 26-02, 27-01, 27-02, 27-03, 28-01)
>>>>>>> gsd/phase-28-dependency-build-resolution
=======
- Completed: 9/11 plans (26-01, 26-02, 27-01, 27-02, 27-03, 28-01, 29-01, 29-02, 29-03)
>>>>>>> gsd/phase-29-api-integration-protocol

## 누적 컨텍스트

### 결정 사항

전체 결정 사항은 PROJECT.md 참조.
v0.7 핵심: 설계 문서 직접 수정 + [v0.7 보완] 태그 추적

| 결정 | 근거 | Plan |
|------|------|------|
| getBlockHeight() 사용 (getSlot() 아님) | skipped 슬롯으로 slot > blockHeight 차이 발생 방지 | 26-01 |
| FRESHNESS_THRESHOLD_SECONDS = 20초 | sign(1s)+submit(2s)+대기(2s)+안전마진(15s) | 26-01 |
| refreshBlockhash Option A (메시지 캐싱) | instruction 보존, RPC 1회로 빠른 복구 | 26-01 |
| BLOCKHASH_STALE vs EXPIRED 분리 | STALE=refreshBlockhash(경량), EXPIRED=buildTransaction(중량) | 26-01 |
| UnsignedTransaction.nonce 명시적 승격 | metadata 타입 불안전 해소, tx.nonce !== undefined 가드 패턴 | 26-01 |
| IChainAdapter 17 -> 19개 메서드 | getCurrentNonce/resetNonceTracker 추가, Solana=no-op | 26-01 |
| AES-GCM nonce 충돌 구조적 불가능 | 매번 새 salt -> 새 AES 키 -> n=1, Birthday Problem 전제 미충족 | 26-02 |
| Birthday Problem 공식 정정 | P ~ 1-e^(-n^2/(2N)), N=2^96. NIST SP 800-38D 참조 | 26-02 |
| Priority fee TTL 30초 = Nyquist 최소 | 60초 윈도우 / 2 = 30초 (Nyquist-Shannon) | 26-02 |
| Fee bump 1.5배 고정, 최대 1회 | 업계 관행 하한, 무한 escalation 방지, 단순성 우선 | 26-02 |
| SOLANA_INSUFFICIENT_FEE 에러 코드 | retryable:true, fee bump 재시도 전용 | 26-02 |
| JWT Secret dual-key 5분 전환 윈도우 (고정값) | 24h 만료 대비 짧아 보안 영향 최소, 운영 복잡성 방지 | 27-01 |
| system_state 테이블에 JWT Secret 저장 | config.toml은 파일 잠금 없이 수정 위험, DB 트랜잭션 원자성 보장 | 27-01 |
| config.toml jwt_secret 초기값 전용 | init 시 생성, 이후 system_state에서 관리, rotate 시 config 미갱신 | 27-01 |
| flock exclusive non-blocking 인스턴스 잠금 | OS 커널 원자적 잠금, 비정상 종료 시 자동 해제, PID TOCTOU 제거 | 27-01 |
| Windows flock 미사용, 포트 바인딩 fallback | flock Windows 미지원, EADDRINUSE가 자연스러운 중복 감지 | 27-01 |
| PID 파일 보조 정보 격하 | flock이 주 잠금, PID는 표시 목적만 | 27-01 |
| 연속 로테이션 5분 이내 429 거부 | previous-이전 키 토큰 즉시 무효화 방지 | 27-01 |
| Rate Limiter 2단계: globalRateLimit(IP 1000/min) + sessionRateLimit(세션 300/min) | 미인증 공격자의 인증 사용자 rate limit 소진 방지 | 27-02 |
| killSwitchGuard 허용 4개 (health, status, recover, kill-switch) | 모니터링+복구+상태 최소 필요 | 27-02 |
| HTTP 503 SYSTEM_LOCKED (기존 401) | Kill Switch는 인증 실패가 아닌 시스템 가용성 문제 | 27-02 |
| recover 경로 /v1/admin/recover (기존 /v1/owner/recover) | 시스템 관리 작업, /v1/admin/ 네임스페이스 적절 | 27-02 |
| Argon2id 해시 메모리 캐시 (~50ms verify) | 매 요청 argon2.hash (~1-3s) 대비 수십 배 빠른 검증 | 27-03 |
| X-Master-Password 평문 헤더 (SHA-256 클라이언트 해싱 불필요) | localhost only 통신, 해시가 사실상 비밀번호 역할 | 27-03 |
| INonceStore 최소 인터페이스 (consume + cleanup) | 전략 패턴으로 Memory/SQLite 교체 가능, DI 주입 | 27-03 |
| INSERT OR IGNORE + changes > 0 원자적 소비 | SQLite 원자적 중복 검사, 별도 SELECT 불필요, TOCTOU 없음 | 27-03 |
| nonce_storage 기본값 "memory" | flock 단일 인스턴스 보장, sqlite는 2차 방어, INSERT ~100-500us 오버헤드 | 27-03 |
| nonces 테이블 CREATE TABLE IF NOT EXISTS | 선택적 테이블, nonce_storage=sqlite 시에만 런타임 생성 | 27-03 |
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
>>>>>>> gsd/phase-29-api-integration-protocol
| viem/siwe 3단계 검증 (parse -> validate -> verifyMessage) | EOA 전용, RPC 불필요, ethers 130KB+ 의존성 완전 제거 | 28-01 |
| verifySIWE 함수 시그니처 유지, 내부 구현만 교체 | 호출부 변경 최소화, SIWEVerifyInput -> { valid, address?, nonce? } 유지 | 28-01 |
| ARM64 Windows 제외 (5개 타겟 플랫폼) | sodium-native/argon2 prebuild 미제공, Tauri 실험적, 시장 미미 | 28-01 |
| SEA assets primary + 동반 파일 fallback | SEA 내장 메커니즘 우선, native addon 호환성 문제 시 안전망 | 28-01 |
| argon2 경로 차이: lib/binding/ (node-pre-gyp) | prebuildify의 prebuilds/와 다름, SEA config에서 정확한 경로 지정 필수 | 28-01 |
<<<<<<< HEAD
>>>>>>> gsd/phase-28-dependency-build-resolution
=======
| DELAY 트랜잭션 disconnect 시 유지(no-op) | Owner 개입 불필요한 자동 실행 티어, Pitfall 3 방지 | 29-02 |
| APPROVAL만 EXPIRED 처리 (disconnect cascade) | 승인자 부재로 영구 대기 방지, DELAY와 명확 구분 | 29-02 |
| cascade 전체를 단일 SQLite 트랜잭션 | APPROVAL->EXPIRED와 WC 정리가 부분 실패 시 rollback 보장 | 29-02 |
| OWNER_NOT_FOUND 에러 코드 추가 | address/chain 기준 조회 실패, OWNER_NOT_CONNECTED과 병존 | 29-02 |
| INSTANT 타임아웃 시 200 SUBMITTED | 트랜잭션 제출 완료 상태, 4xx/5xx 부적절, 클라이언트 폴링 필요 | 29-02 |
| TransactionType 무관 원칙 (HTTP status) | 5개 타입 동일 HTTP status, 타입별 차이는 응답 type 필드로만 | 29-02 |
| WAIaaSBaseModel alias_generator=to_camel SSoT | Field(alias=) 수동 방식 완전 대체, 29개 필드 전수 일치 확인 | 29-03 |
| Python SDK field_validator 수동 매핑 | Zod->Pydantic 자동 변환 도구 미사용, 엣지 케이스 안전성 우선 | 29-03 |
| @waiaas/core export type(0 bytes) + export Schema(runtime) 분리 | tree-shaking 최적화, 타입 drift 0% | 29-03 |
| Sidecar 종료 타임아웃 35초 (5초에서 변경) | 데몬 shutdown_timeout=30초 + 5초 마진, SQLite WAL 손상 방지 | 29-01 |
| 4단계 종료 플로우 (HTTP -> SIGTERM -> SIGKILL) | graceful shutdown 최대한 보장, 최후 수단으로만 SIGKILL | 29-01 |
| integrity_check는 비정상 종료 후에만 실행 | 정상 종료 시 불필요한 O(NlogN) 비용 방지, WAL checkpoint 복구 | 29-01 |
| CORS 5종 Origin (macOS/Linux + Windows 2종) | useHttpsScheme 설정 여부 무관하게 모든 플랫폼 호환 | 29-01 |
| waiaas init --json: idempotent 동작 | Tauri Setup Wizard 재시도/재진입 안전, alreadyInitialized 반환 | 29-01 |
| --force와 idempotent 상호 배타적 | --force=삭제+재초기화, idempotent=존재하면 skip | 29-01 |
| --master-password 옵션 (Tauri sidecar 전용) | stdin 프롬프트 불가한 sidecar 환경, localhost 전용 보안 전제 | 29-01 |
>>>>>>> gsd/phase-29-api-integration-protocol

### 차단 요소/우려 사항

없음

## 세션 연속성

마지막 세션: 2026-02-08
<<<<<<< HEAD
<<<<<<< HEAD
중단 지점: Phase 27 verified ✓. Phase 28 계획 수립 필요.
재개 파일: .planning/ROADMAP.md (Phase 28 참조)
=======
중단 지점: Phase 28 verified ✓. Phase 29 계획 수립 필요.
재개 파일: .planning/ROADMAP.md (Phase 29 참조)
>>>>>>> gsd/phase-28-dependency-build-resolution
=======
중단 지점: Phase 29 verified ✓. Phase 30 계획 수립 필요.
재개 파일: .planning/ROADMAP.md (Phase 30 참조)
>>>>>>> gsd/phase-29-api-integration-protocol
