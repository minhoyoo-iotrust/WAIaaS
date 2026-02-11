# Requirements: WAIaaS v1.3.3

**Defined:** 2026-02-11
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.3.3 Requirements

하나의 WAIaaS 데몬에 등록된 여러 에이전트를 Claude Desktop(MCP)에서 동시에 사용할 수 있는 상태.

### 토큰 파일 분리

- [ ] **TOKEN-01**: MCP SessionManager가 agentId 설정 시 `DATA_DIR/mcp-tokens/<agentId>` 경로에 토큰을 저장/로드한다
- [ ] **TOKEN-02**: agentId 미설정 시 기존 `DATA_DIR/mcp-token` 경로를 사용한다 (하위 호환)
- [ ] **TOKEN-03**: 새 경로에 토큰이 없고 기존 `mcp-token` 파일이 존재하면 fallback으로 로드한다
- [ ] **TOKEN-04**: 토큰 갱신(renewal) 시 agentId에 해당하는 경로에 저장한다

### MCP 서버 에이전트 식별

- [ ] **MCPS-01**: `WAIAAS_AGENT_NAME` 환경변수 설정 시 MCP 서버 이름이 `waiaas-{agentName}`이 된다
- [ ] **MCPS-02**: `WAIAAS_AGENT_NAME` 미설정 시 서버 이름이 `waiaas-wallet`을 유지한다 (하위 호환)
- [ ] **MCPS-03**: 도구/리소스 description에 에이전트 이름이 포함된다 (agentName 설정 시)

### CLI mcp setup 개선

- [ ] **CLIP-01**: `--agent` 지정 시 에이전트별 토큰 파일을 `mcp-tokens/<agentId>` 경로에 저장한다
- [ ] **CLIP-02**: config 스니펫에 `WAIAAS_AGENT_ID` + `WAIAAS_AGENT_NAME` 환경변수를 포함한다
- [ ] **CLIP-03**: config 키 이름이 `waiaas-{agentName}` 형태이다
- [ ] **CLIP-04**: `--all` 플래그로 전체 에이전트 토큰 일괄 생성 + 통합 config 스니펫을 출력한다
- [ ] **CLIP-05**: `--all` + 에이전트 0개 시 에러 메시지를 표시한다
- [ ] **CLIP-06**: `--all` + slug 충돌 시 `{slug}-{agentId 앞 8자}` 접미사를 추가한다
- [ ] **CLIP-07**: `--agent` 미지정 + 에이전트 1개 자동 선택 시에도 새 경로(`mcp-tokens/<agentId>`)를 사용한다

## Future Requirements

### v1.4 토큰 + 컨트랙트 확장

- **TOKEN-EXT-01**: SPL/ERC-20 토큰 전송
- **TOKEN-EXT-02**: 임의 컨트랙트 호출 + CONTRACT_WHITELIST
- **TOKEN-EXT-03**: Approve 관리 + 무제한 차단
- **TOKEN-EXT-04**: Batch 트랜잭션

## Out of Scope

| Feature | Reason |
|---------|--------|
| 단일 프로세스 다중 에이전트 (agentId 파라미터 방식) | MCP 프로토콜은 서버 단위 capability 노출 설계, 프로세스 분리가 자연스러움 |
| MCP 서버 내 `GET /v1/agents/{id}` API 호출 | 서버 시작 시 데몬 미실행 가능, CLI setup 단계에서 WAIAAS_AGENT_NAME 환경변수로 전달 |
| 기존 `mcp-token` 자동 마이그레이션 | fallback 읽기로 충분, `mcp setup` 재실행 시 새 경로에 저장 |
| 리소스 URI 변경 | 서버 인스턴스별로 격리되므로 URI 충돌 없음 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOKEN-01 | Phase 71 | Pending |
| TOKEN-02 | Phase 71 | Pending |
| TOKEN-03 | Phase 71 | Pending |
| TOKEN-04 | Phase 71 | Pending |
| MCPS-01 | Phase 71 | Pending |
| MCPS-02 | Phase 71 | Pending |
| MCPS-03 | Phase 71 | Pending |
| CLIP-01 | Phase 72 | Pending |
| CLIP-02 | Phase 72 | Pending |
| CLIP-03 | Phase 72 | Pending |
| CLIP-04 | Phase 72 | Pending |
| CLIP-05 | Phase 72 | Pending |
| CLIP-06 | Phase 72 | Pending |
| CLIP-07 | Phase 72 | Pending |

**Coverage:**
- v1.3.3 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after roadmap created*
