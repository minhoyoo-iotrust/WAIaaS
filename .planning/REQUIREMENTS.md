# Requirements: WAIaaS v2.5 DX 품질 개선

**Defined:** 2026-02-19
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

README/예시 코드를 복붙하면 바로 동작하는 상태 달성. 첫 5분 경험 마찰 28건 제거.

### README 정합성

- [ ] **README-01**: README SDK 코드 예시의 응답 필드가 실제 API 응답과 일치한다 (`balance.amount` → `balance.balance`, `tx.signature` → `tx.id` 등)
- [ ] **README-02**: skill 파일(7개)의 version 헤더가 빌드 타임에 패키지 버전으로 자동 치환된다

### CLI 첫 실행

- [x] **CLI-01**: `waiaas --version`이 package.json의 실제 버전을 표시한다 (0.0.0 아님)
- [x] **CLI-02**: CLI package.json에 `engines.node >= 22.0.0` 필드가 존재한다
- [x] **CLI-03**: `waiaas init` 완료 메시지에 마스터 패스워드 설정 방법이 안내된다
- [x] **CLI-04**: init 생성 config.toml에 주석 처리된 섹션 예시(`[security]`, `[rpc]`, `[notifications]`)가 포함된다
- [x] **CLI-05**: init 시 권한 오류가 발생하면 친절한 에러 메시지가 출력된다

### 데몬 시작

- [x] **DAEMON-01**: 포트 충돌(EADDRINUSE) 시 "Port N is already in use" 메시지가 출력된다
- [x] **DAEMON-02**: 기본 모드에서 내부 Step 1~6 로그가 debug 레벨로 하향되어 미출력된다
- [x] **DAEMON-03**: 데몬 시작 완료 메시지에 Admin UI URL(`http://127.0.0.1:3100/admin`)이 포함된다
- [x] **DAEMON-04**: mcp setup 에러 메시지가 "Run waiaas quickstart first"로 안내된다

### quickstart

- [x] **QS-01**: quickstart 출력에 한글이 포함되지 않는다 (전체 영문)
- [x] **QS-02**: 토큰 발급 후 만료 시점(`Expires at: YYYY-MM-DD HH:mm`)이 출력된다
- [x] **QS-03**: 동일 이름 지갑 존재 시 409 에러 대신 기존 지갑을 재사용하고 세션만 재발급한다
- [x] **QS-04**: 네트워크 목록을 `availableNetworks` 필드로 정확히 읽는다

### Docker DX

- [ ] **DOCK-01**: docker-compose.yml이 `build:` 대신 `image: ghcr.io/...` 기본값을 사용한다
- [ ] **DOCK-02**: `.env.example` 파일이 존재하며 필수 환경변수(MASTER_PASSWORD, RPC URLs 등)를 포함한다

### Python SDK

- [ ] **PY-01**: Python SDK `__version__`이 pyproject.toml의 version과 동일하다
- [ ] **PY-02**: Python SDK README의 기본 포트가 3100이다
- [ ] **PY-03**: `.venv/` 디렉토리가 git에서 추적되지 않는다

### SDK 패키지

- [ ] **SDK-01**: CLI 패키지에 npm 레지스트리용 최소 README가 존재한다
- [ ] **SDK-02**: SDK 패키지에 npm 레지스트리용 최소 README가 존재한다

### MCP 안내

- [x] **MCP-01**: mcp setup 시 기본 만료 기간(24h) 경고와 `--expires-in` 옵션이 안내된다

## v2 Requirements

없음 — m25-00 objective가 명확한 범위 한정.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Admin UI 온보딩 (지갑 0개 상태 CTA) | v2.3에서 메뉴 재구성 완료. 온보딩 CTA는 별도 마일스톤 |
| `waiaas start --background` 데몬 모드 | 프로세스 관리 아키텍처 변경 필요 (별도 설계) |
| SDK `createSession()` 메서드 추가 | SDK 인터페이스 확장 (별도 설계) |
| Python SDK PyPI 게시 | Trusted Publishing 인프라 별도 구축 필요 |
| `--password` CLI 인자 보안 경고 | 문서화로 충분 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| README-01 | 196 | Pending |
| README-02 | 196 | Pending |
| CLI-01 | 194 | Complete |
| CLI-02 | 194 | Complete |
| CLI-03 | 194 | Complete |
| CLI-04 | 194 | Complete |
| CLI-05 | 194 | Complete |
| DAEMON-01 | 194 | Complete |
| DAEMON-02 | 194 | Complete |
| DAEMON-03 | 194 | Complete |
| DAEMON-04 | 195 | Complete |
| QS-01 | 195 | Complete |
| QS-02 | 195 | Complete |
| QS-03 | 195 | Complete |
| QS-04 | 195 | Complete |
| DOCK-01 | 197 | Pending |
| DOCK-02 | 197 | Pending |
| PY-01 | 197 | Pending |
| PY-02 | 197 | Pending |
| PY-03 | 197 | Pending |
| SDK-01 | 196 | Pending |
| SDK-02 | 196 | Pending |
| MCP-01 | 195 | Complete |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
