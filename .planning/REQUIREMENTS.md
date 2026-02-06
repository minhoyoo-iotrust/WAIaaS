# Requirements: WAIaaS v0.3

**정의일:** 2026-02-06
**핵심 가치:** 구현 단계 진입 전 설계 문서 간 논리적 모순 해소, Single Source of Truth 확립

## v0.3 요구사항

v0.1(23개) + v0.2(17개) = 40개 설계 문서의 논리 일관성 확보.

### v0.1 잔재 정리

v0.2에서 대체된 v0.1 설계에 명시적 표기를 추가하여 잘못된 참조를 방지한다.

- [x] **LEGACY-01**: v0.1 → v0.2 변경 매핑 문서 작성 — 40개 문서 간 대체/계승 관계 정리
- [x] **LEGACY-02**: v0.1 데이터베이스 스택 SUPERSEDED 표기 (C4) — PostgreSQL + Redis → SQLite + LRU
- [x] **LEGACY-03**: v0.1 API 프레임워크 SUPERSEDED 표기 (C5) — Fastify + JWT Bearer → Hono + Session Token
- [x] **LEGACY-04**: v0.1 인증 모델 SUPERSEDED 표기 (C6) — 영구 API Key + RBAC → 단기 JWT + SIWS/SIWE
- [x] **LEGACY-05**: v0.1 키 관리 SUPERSEDED 표기 (C7) — AWS KMS + Nitro → 로컬 Keystore + sodium
- [x] **LEGACY-06**: v0.1 인터페이스명 업데이트 (H1) — IBlockchainAdapter → IChainAdapter 참조 수정
- [x] **LEGACY-07**: v0.1 어댑터 Squads 메서드 정리 (H10) — createMultisig() 등 v0.2 미사용 메서드 표기
- [x] **LEGACY-08**: v0.1 에러 코드 체계 정리 (H11) — RFC 9457 46개 코드 → v0.2 36개 코드 매핑
- [x] **LEGACY-09**: v0.1 에스컬레이션 모델 정리 (H13) — 4단계 → 4-tier 대응표

### CRITICAL 의사결정

시스템의 기본 동작에 영향을 미치는 모순을 단일 값으로 확정한다.

- [x] **CRIT-01**: 기본 포트 통일 (C1) — 3100으로 확정, config.toml 및 모든 문서 반영
- [x] **CRIT-02**: 트랜잭션 상태 Enum 통일 (C2) — DB 8개 상태 + 클라이언트 표시 상태 분리 방안 확정
- [x] **CRIT-03**: Docker 바인딩 전략 확정 (C3) — WAIAAS_DAEMON_HOSTNAME 환경변수 오버라이드 허용 설계
- [x] **CRIT-04**: 자금 충전 모델 문서화 (C8) — Owner → Agent 직접 SOL 전송 방식 명시

### Enum/상태값 통일

문서 간 충돌하는 Enum 값을 SQLite CHECK 제약과 1:1로 대응시킨다.

- [x] **ENUM-01**: 에이전트 상태 Enum 통일 (H6) — REST API와 SQLite CHECK 일치
- [x] **ENUM-02**: 정책 상태 Enum 통일 (H7) — REST API와 SQLite CHECK 일치
- [x] **ENUM-03**: 트랜잭션 상태 머신 통일 (M1) — QUEUED vs PENDING_QUEUE 등 정리
- [x] **ENUM-04**: Enum/상태값 통합 대응표 작성 — 모든 Enum의 단일 진실 소스

### 설정 스펙 통일

config.toml에 누락된 설정을 추가하고 기본값을 통일한다.

- [x] **CONF-01**: 세션 TTL 기본값 통일 (H2) — 24h로 확정, config.toml 반영
- [x] **CONF-02**: jwt_secret 설정 추가 (H3) — config.toml [security] 섹션에 필드 추가
- [x] **CONF-03**: 연속 실패 임계값 통일 (H5) — 단일 값으로 확정
- [x] **CONF-04**: Nonce 캐시 크기 설정화 (M3) — config.toml에 조절 옵션 추가
- [x] **CONF-05**: Kill Switch 복구 쿨다운 설정화 (M5) — config.toml에 옵션 추가

### API 스펙 통일

REST API 스펙과 API 프레임워크 설계 간 불일치를 해소한다.

- [x] **API-01**: 메모 길이 제한 통일 (H4) — Solana 256 bytes vs API 200 chars 해결
- [x] **API-02**: CORS 헤더 통일 (H8) — REST API 추가 헤더를 미들웨어 설계에 반영
- [x] **API-03**: Health 응답 스키마 통일 (H9) — 단일 스키마로 확정
- [x] **API-04**: Rate Limiter 단위 통일 (H12) — req/min으로 통일
- [x] **API-05**: SuccessResponse 래퍼 정리 (H14) — 미사용 확정, 잔존 예시 제거
- [x] **API-06**: ownerAuth 미들웨어 상세 정의 (H15) — REST API 스펙에 반영

### MEDIUM 구현 노트

구현 시 주의해야 할 사항을 해당 설계 문서에 추가한다.

- [ ] **NOTE-01**: BalanceInfo.amount 단위 변환 규칙 (M2) — lamports/SOL 변환 명시
- [ ] **NOTE-02**: 알림 채널 최소 요구 명확화 (M4) — config 표현과 요구사항 일치
- [ ] **NOTE-03**: MCP 기능 패리티 매트릭스 (M6) — MCP 6개 도구 ↔ REST 31개 엔드포인트
- [ ] **NOTE-04**: SDK 에러 타입 매핑 전략 (M7) — 36개 에러 코드의 SDK 매핑
- [ ] **NOTE-05**: Tauri IPC + HTTP 이중 채널 전략 (M8) — 에러 처리 방안
- [ ] **NOTE-06**: Setup Wizard vs CLI init 순서 정리 (M9) — 초기화 단계 통일
- [ ] **NOTE-07**: Telegram SIWS 서명 방안 (M10) — Tier 2 인증 수행 방법 정의
- [ ] **NOTE-08**: Docker graceful shutdown 검증 (M11) — 35초 + 10단계 합산 확인
- [ ] **NOTE-09**: 에이전트 생명주기 매핑 (M12) — v0.1 5단계 ↔ v0.2 agents.status
- [ ] **NOTE-10**: Python SDK 네이밍 검증 (M13) — snake_case 변환 일관성
- [ ] **NOTE-11**: 커서 페이지네이션 파라미터 통일 (M14) — UUID v7 커서 파라미터명

## Future Requirements

v0.4 Implementation 마일스톤에서 다룰 예정:

- 실제 코드 구현 (v0.2 설계 문서 기반)
- SPL 토큰 지원
- EVM Adapter 완전 구현
- Streamable HTTP MCP transport

## Out of Scope

| 항목 | 이유 |
|------|------|
| 설계 변경 | 기존 v0.2 설계를 변경하지 않음, 불일치 해소만 수행 |
| 새로운 기능 추가 | 일관성 확보 목적, 새 기능은 v0.4 |
| 코드 구현 | 설계 문서 정리만, 구현은 v0.4 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LEGACY-01 | Phase 10 | Complete |
| LEGACY-02 | Phase 10 | Complete |
| LEGACY-03 | Phase 10 | Complete |
| LEGACY-04 | Phase 10 | Complete |
| LEGACY-05 | Phase 10 | Complete |
| LEGACY-06 | Phase 10 | Complete |
| LEGACY-07 | Phase 10 | Complete |
| LEGACY-08 | Phase 10 | Complete |
| LEGACY-09 | Phase 10 | Complete |
| CRIT-01 | Phase 11 | Complete |
| CRIT-02 | Phase 11 | Complete |
| CRIT-03 | Phase 11 | Complete |
| CRIT-04 | Phase 11 | Complete |
| ENUM-01 | Phase 12 | Complete |
| ENUM-02 | Phase 12 | Complete |
| ENUM-03 | Phase 12 | Complete |
| ENUM-04 | Phase 12 | Complete |
| CONF-01 | Phase 12 | Complete |
| CONF-02 | Phase 12 | Complete |
| CONF-03 | Phase 12 | Complete |
| CONF-04 | Phase 12 | Complete |
| CONF-05 | Phase 12 | Complete |
| API-01 | Phase 12 | Complete |
| API-02 | Phase 12 | Complete |
| API-03 | Phase 12 | Complete |
| API-04 | Phase 12 | Complete |
| API-05 | Phase 12 | Complete |
| API-06 | Phase 12 | Complete |
| NOTE-01 | Phase 13 | Pending |
| NOTE-02 | Phase 13 | Pending |
| NOTE-03 | Phase 13 | Pending |
| NOTE-04 | Phase 13 | Pending |
| NOTE-05 | Phase 13 | Pending |
| NOTE-06 | Phase 13 | Pending |
| NOTE-07 | Phase 13 | Pending |
| NOTE-08 | Phase 13 | Pending |
| NOTE-09 | Phase 13 | Pending |
| NOTE-10 | Phase 13 | Pending |
| NOTE-11 | Phase 13 | Pending |

**Coverage:**
- v0.3 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-06*
*Last updated: 2026-02-06 (Phase 12 ENUM/CONF/API complete)*
