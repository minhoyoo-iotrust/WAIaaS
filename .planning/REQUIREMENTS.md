# Requirements: WAIaaS v1.4.3

**Defined:** 2026-02-13
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

v1.4.3 마일스톤 요구사항. EVM 토큰 레지스트리 + MCP/Admin DX 개선 + 버그 수정.

### 토큰 레지스트리

- [ ] **REGISTRY-01**: 데몬이 EVM 네트워크별 주요 ERC-20 토큰 목록(주소/symbol/name/decimals)을 내장하여, 별도 설정 없이 주요 토큰을 인식할 수 있다
- [ ] **REGISTRY-02**: 사용자가 API를 통해 커스텀 토큰을 추가/삭제할 수 있다
- [ ] **REGISTRY-03**: 토큰 레지스트리는 조회용(UX), ALLOWED_TOKENS는 전송 허용(보안)으로 역할이 분리된다

### getAssets ERC-20 연동

- [ ] **ASSETS-01**: EVM 지갑의 getAssets()가 토큰 레지스트리 + ALLOWED_TOKENS에 등록된 ERC-20 토큰 잔액을 반환한다 (BUG-014)
- [ ] **ASSETS-02**: 토큰 레지스트리와 ALLOWED_TOKENS 모두 미설정인 EVM 지갑은 네이티브 ETH만 반환한다

### MCP 토큰 관리

- [ ] **MCP-01**: POST /v1/mcp/tokens API가 세션 생성 + 토큰 파일 저장 + Claude Desktop 설정 스니펫을 반환한다 (BUG-013)
- [ ] **MCP-02**: Admin UI 지갑 상세에서 MCP 토큰 발급 버튼으로 원스톱 MCP 설정이 가능하다
- [ ] **MCP-03**: Admin UI가 발급된 Claude Desktop 설정 JSON을 복사 가능하게 표시한다

### 파이프라인 확인 로직

- [ ] **PIPE-01**: EVM adapter waitForConfirmation이 타임아웃/RPC 에러 시 fallback receipt 조회로 온체인 상태를 확인한다 (BUG-015)
- [ ] **PIPE-02**: Stage 6이 waitForConfirmation 반환값(confirmed/failed/submitted)에 따라 DB 상태를 정확히 기록한다
- [ ] **PIPE-03**: Solana adapter에도 동일한 fallback 패턴이 적용된다

### 개발자 경험

- [ ] **DX-01**: scripts/tag-release.sh가 모든 패키지 버전을 일괄 갱신하고 git tag를 생성한다 (BUG-016)
- [ ] **DX-02**: 현재 코드베이스의 패키지 버전이 최신 태그와 일치한다

## v2 Requirements

없음 — 이 마일스톤에서 연기한 항목 없음.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 인덱서 API 기반 자동 토큰 발견 (Alchemy 등) | 특정 RPC 프로바이더 의존, Self-Hosted 원칙과 상충. 장기 로드맵 |
| 토큰 로고 이미지 서빙 | Admin UI에서 토큰 로고 표시는 외부 CDN 의존. v1.5+ 고려 |
| CLI mcp setup을 POST /v1/mcp/tokens로 리팩터링 | 기존 CLI 동작 유지, API 추가만 수행. 향후 정리 |
| 토큰 잔액 캐시 | 복잡도 증가 대비 이점 불명확. multicall 성능 문제 발생 시 재검토 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REGISTRY-01 | Phase 97 | Pending |
| REGISTRY-02 | Phase 97 | Pending |
| REGISTRY-03 | Phase 97 | Pending |
| ASSETS-01 | Phase 98 | Pending |
| ASSETS-02 | Phase 98 | Pending |
| MCP-01 | Phase 99 | Pending |
| MCP-02 | Phase 99 | Pending |
| MCP-03 | Phase 99 | Pending |
| PIPE-01 | Phase 96 | Pending |
| PIPE-02 | Phase 96 | Pending |
| PIPE-03 | Phase 96 | Pending |
| DX-01 | Phase 95 | Pending |
| DX-02 | Phase 95 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-13 after roadmap creation*
