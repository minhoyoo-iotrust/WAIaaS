# 마일스톤 m03: 설계 논리 일관성 확보

## 목표
v0.1(리서치 & 기획)과 v0.2(Self-Hosted 설계) 전체 산출물 40건을 크로스체크하여, 구현 단계 진입 전에 설계 문서 간 논리적 모순을 해소한다. Enum/상태값, 설정 스펙, API 스키마, 수치 기준을 단일 진실 소스(Single Source of Truth)로 통일하고, v0.1 잔재를 공식적으로 정리한다.

## 핵심 원칙

### 1. 구현 가능한 설계만 남긴다
- 동일한 개념에 대해 문서마다 다른 값이 존재하면 구현 시 혼란을 유발
- 모든 모순을 식별하고 하나의 값으로 확정하여 문서에 반영

### 2. v0.1 문서의 역할을 명확히 한다
- v0.1 산출물(01~23)은 리서치/기획 단계의 산출물로, v0.2에서 대체된 항목이 다수
- 대체된 항목은 명시적으로 표기하여 구현 시 잘못된 문서를 참조하지 않도록 한다

### 3. 결정은 한 곳에 기록한다
- 동일 결정이 여러 문서에 분산되면 불일치가 재발
- 최종 결정 사항은 해당 도메인의 v0.2 설계 문서에 반영하고, 나머지는 참조로 전환

---

## 식별된 비일관성 목록

### CRITICAL — 즉시 결정 필요 (8건)

구현을 시작할 수 없거나, 구현 시 시스템 장애로 이어질 수 있는 모순.

| ID | 항목 | 충돌 위치 | 내용 |
|----|------|-----------|------|
| C1 | 기본 포트 충돌 | 24-monorepo vs 29-api-framework | `config.toml` 기본값 3000 vs API 프레임워크 설계 3100 |
| C2 | 트랜잭션 상태 Enum 불일치 | 40-telegram-bot vs 25-sqlite-schema | Bot이 14개 상태값 참조, SQLite CHECK 제약은 8개만 허용 |
| C3 | Docker 127.0.0.1 바인딩 | 40-telegram-bot-docker vs 29-api-framework | 데몬 127.0.0.1 강제 바인딩 → Docker 컨테이너 내부에서 외부 접근 불가 |
| C4 | v0.1 데이터베이스 스택 잔재 | 05~08(v0.1) vs 24~25(v0.2) | PostgreSQL + Redis 설계가 v0.1에 남아있으나 v0.2는 SQLite + LRU |
| C5 | v0.1 API 프레임워크 잔재 | 09~12(v0.1) vs 29(v0.2) | Fastify + JWT Bearer → Hono + Session Token. 근본적으로 다른 스펙 |
| C6 | v0.1 인증 모델 잔재 | 13~14(v0.1) vs 30(v0.2) | 영구 API Key + RBAC → 단기 JWT + SIWS/SIWE |
| C7 | v0.1 키 관리 잔재 | 15~16(v0.1) vs 26(v0.2) | AWS KMS + Nitro Enclaves → 로컬 Keystore + sodium-native |
| C8 | 자금 충전 모델 누락 | 21(v0.1) vs v0.2 전체 | v0.1 "Owner→Agent 자금 충전" 프로세스가 v0.2에 명시적 설계 없음 |

### HIGH — 구현 전 해결 필요 (15건)

구현 시 버그나 통합 실패로 이어질 수 있는 모순.

| ID | 항목 | 충돌 위치 | 내용 |
|----|------|-----------|------|
| H1 | 인터페이스명 충돌 | 10(v0.1) vs 27(v0.2) | `IBlockchainAdapter` vs `IChainAdapter`, v0.1 참조 미업데이트 |
| H2 | 세션 TTL 기본값 | 24-monorepo vs 30-session-protocol | config `session_ttl = "1h"` vs 프로토콜 설계 `default 24h` |
| H3 | jwt_secret 설정 누락 | 30-session-protocol vs 24-monorepo | JWT HS256에 필요한 `jwt_secret`이 config.toml 스펙에 없음 |
| H4 | 메모 길이 제한 | 31-solana-adapter vs 32-transaction-pipeline | Solana `memo 256 bytes` vs 거래 API `memo maxLength 200 chars` |
| H5 | 연속 실패 임계값 | 36-killswitch 내부 | `consecutive_failures` 기본값이 3, 5, 3으로 세 군데 다르게 표기 |
| H6 | 에이전트 상태 Enum | 37-rest-api vs 25-sqlite-schema | API 응답 `agent.status` 필드와 SQLite CHECK 제약 불일치 |
| H7 | 정책 상태 Enum | 37-rest-api vs 25-sqlite-schema | API `policy.status` 반환값과 SQLite CHECK 불일치 |
| H8 | CORS 헤더 누락 | 37-rest-api vs 29-api-framework | REST API 추가 CORS 헤더가 미들웨어 설계에 미반영 |
| H9 | Health 응답 스키마 | 37-rest-api vs 29-api-framework | `/health` 응답 필드 구성 상이 |
| H10 | v0.1 어댑터 Squads 메서드 | 10(v0.1) vs 27(v0.2) | `createMultisig()`, `approveTransaction()` 등 Squads 전용 메서드 잔재 |
| H11 | 에러 코드 체계 이중화 | 12(v0.1) vs 29(v0.2) | RFC 9457 46개 코드 vs 단순 JSON 36개 코드 병존 |
| H12 | Rate Limiter 단위 | 29-api-framework vs 37-rest-api | `req/min` vs `req/sec` 혼재 |
| H13 | 에스컬레이션 모델 혼동 | 17~20(v0.1) vs 33(v0.2) | v0.1 4단계(경고/제한/승인필요/동결) vs v0.2 4-tier(INSTANT/NOTIFY/DELAY/APPROVAL) |
| H14 | SuccessResponse 래퍼 | 37-rest-api vs 29-api-framework | 미사용 선언했으나 일부 응답 예시에 래퍼 구조 잔존 |
| H15 | Owner API 인증 상세 | 34-owner-wallet vs 37-rest-api | per-request SIWS 서명 설계와 ownerAuth 미들웨어 상세 미정의 |

### MEDIUM — 구현 시 주의 필요 (14건)

구현 단계에서 해결 가능하나, 사전 인지가 필요한 사항.

| ID | 항목 | 충돌 위치 | 내용 |
|----|------|-----------|------|
| M1 | 상태 머신 값 이름 | 32-transaction-pipeline vs 25-sqlite-schema | `QUEUED` vs `PENDING_QUEUE` 등 미세 차이 |
| M2 | BalanceInfo.amount 단위 | 27-chain-adapter vs 25-sqlite-schema | lamports vs SOL 변환 규칙 미정의 |
| M3 | Nonce 캐시 크기 설정 | 30-session-protocol vs 24-monorepo | LRU max 1000 고정, config 조절 설정 없음 |
| M4 | 알림 채널 최소 요구 | 35-notification vs 24-monorepo | "최소 2개 채널 필수"이나 config에서 선택적 표현 |
| M5 | Kill Switch 복구 쿨다운 | 36-killswitch vs 24-monorepo | 30분 최소 쿨다운, config에 해당 설정 없음 |
| M6 | MCP 기능 패리티 | 38-sdk-mcp vs 37-rest-api | MCP 6개 도구와 REST 31개 엔드포인트 간 기능 커버리지 미검증 |
| M7 | SDK 에러 타입 매핑 | 38-sdk-mcp vs 29-api-framework | 36개 에러 코드의 SDK 타입 매핑 전략 미정의 |
| M8 | Tauri IPC + HTTP 이중 채널 | 39-tauri-desktop vs 38-sdk-mcp | 두 통신 채널 동시 사용 시 에러 처리 전략 미정의 |
| M9 | Setup Wizard vs CLI init 순서 | 39-tauri-desktop vs 28-daemon-lifecycle | 초기화 단계 순서 미세 차이 |
| M10 | Telegram SIWS 서명 | 40-telegram-bot vs 34-owner-wallet | Telegram 환경에서 Tier 2 SIWS 서명 수행 방법 미정의 |
| M11 | Docker graceful shutdown | 40-telegram-bot-docker vs 28-daemon-lifecycle | 35초 grace period와 10단계 shutdown 합산 검증 안 됨 |
| M12 | 에이전트 생명주기 매핑 | 17(v0.1) vs 25(v0.2) | v0.1 5단계 생명주기와 v0.2 agents.status CHECK 매핑 미검증 |
| M13 | Python SDK 네이밍 | 38-sdk-mcp vs 37-rest-api | snake_case 변환과 에러 코드 camelCase 일관성 미검증 |
| M14 | 커서 페이지네이션 파라미터 | 32-transaction-pipeline vs 37-rest-api | UUID v7 커서 파라미터 이름 불일치 가능성 |

---

## 처리 방향

### Phase 1: v0.1 잔재 정리

v0.1 산출물(01~23) 중 v0.2에서 대체된 항목을 명시적으로 표기한다.

**대상**: C4, C5, C6, C7, H1, H10, H11, H13

**처리 방법**:
- v0.1 → v0.2 변경 이력 매핑 문서를 작성하여, 어떤 v0.1 설계가 어떤 v0.2 문서로 대체되었는지 명시
- v0.1 문서에 `SUPERSEDED` 표기를 추가하여 참조 방지
- STATE.md의 누적 결정 사항과 정합성 확인

### Phase 2: CRITICAL 의사결정 확정

시스템의 기본 동작에 영향을 미치는 모순을 해소한다.

**대상**: C1, C2, C3, C8

**결정 필요 사항**:
- **C1 포트**: 3100으로 통일 (doc-24 config.toml 수정)
- **C2 상태 Enum**: DB 8개 상태 + 클라이언트 전용 표시 상태 분리 방안 확정, 모든 문서에 반영
- **C3 Docker 바인딩**: Docker 모드 시 `WAIAAS_HOST=0.0.0.0` 환경변수 오버라이드 허용, z.literal 제약 완화 방안 설계
- **C8 자금 충전**: Owner → Agent 지갑 직접 SOL 전송으로 확정 (별도 프로세스 불필요함을 문서화)

### Phase 3: HIGH 스키마/수치 통일

문서 간 충돌하는 Enum, 수치, 스키마를 하나로 통일한다.

**대상**: H2~H9, H12, H14, H15

**처리 방법**:
- 세션 TTL 24h 통일, config.toml에 `jwt_secret` 필드 추가
- 모든 Enum 값을 SQLite CHECK 제약과 1:1 대응표 작성
- REST API 스펙과 API 프레임워크 설계의 CORS, Health, Rate Limiter, 에러 응답 통일
- ownerAuth 미들웨어 상세를 REST API 스펙에 반영

### Phase 4: MEDIUM 사항 문서화

구현 시 주의해야 할 사항을 해당 설계 문서에 주석 또는 섹션으로 추가한다.

**대상**: M1~M14

**처리 방법**:
- 각 MEDIUM 항목의 권장 해결 방안을 해당 v0.2 설계 문서에 "구현 노트" 섹션으로 추가
- 단위 변환 규칙(lamports/SOL), 네이밍 규칙(snake_case 변환), 기능 패리티 매트릭스 등 보조 표 작성
- Telegram SIWS 서명 방안 등 미정의 영역은 결정 후 반영

---

## 산출물

| 산출물 | 설명 |
|--------|------|
| v0.1 → v0.2 변경 매핑 문서 | 40개 설계 문서 간 대체/계승 관계 정리 |
| 수정된 v0.1 문서 (SUPERSEDED 표기) | v0.2에서 대체된 v0.1 설계에 명시적 표기 |
| 수정된 v0.2 설계 문서 | 모순 해소 내용이 반영된 최종 설계 문서 |
| Enum/상태값 통합 대응표 | 모든 상태 Enum의 단일 진실 소스 |
| MEDIUM 구현 노트 | 각 v0.2 설계 문서에 추가된 구현 시 주의사항 |

## 성공 기준

1. v0.1 산출물(01~23) 중 v0.2에서 대체된 항목에 모두 SUPERSEDED 표기가 있음
2. CRITICAL 8건이 모두 단일 값으로 확정되어 해당 설계 문서에 반영됨
3. 모든 Enum/상태값이 SQLite CHECK 제약과 1:1로 대응하는 통합표가 존재함
4. config.toml 스펙에 누락된 설정(jwt_secret, kill switch 쿨다운 등)이 추가됨
5. REST API 스펙과 API 프레임워크 설계 간 응답 스키마/CORS/Rate Limiter가 일치함
6. Docker 환경에서 데몬 접근 가능한 바인딩 전략이 확정됨
7. 14개 MEDIUM 사항에 대한 구현 노트가 해당 문서에 추가됨

---

*작성: 2026-02-05*
*기반 분석: v0.1(01~23) + v0.2(24~40) 전체 크로스체크 결과*
