# Requirements: WAIaaS v0.9

**Defined:** 2026-02-09
**Core Value:** AI 에이전트가 MCP 환경에서 세션 중단 없이 안전하게 온체인 거래를 지속할 수 있어야 한다

## v0.9 Requirements

설계 마일스톤 — 산출물은 설계 문서 수정/생성이며, 코드 구현은 범위 외.

### SessionManager 핵심 설계 (SMGR)

- [ ] **SMGR-01**: SessionManager 클래스 인터페이스 설계 — getToken/start/dispose 메서드, 내부 상태(token, sessionId, expiresAt, renewalCount, timer)
- [x] **SMGR-02**: 토큰 파일 영속화 사양 설계 — ~/.waiaas/mcp-token 경로, JWT 문자열만, 0o600 권한, UTF-8, symlink 거부
- [ ] **SMGR-03**: 토큰 로드 우선순위 설계 — 파일 > env var, JWT payload base64url 디코딩(jose decodeJwt), 만료 여부 확인
- [ ] **SMGR-04**: 자동 갱신 스케줄 설계 — 60% TTL 경과 시 갱신 시도, safeSetTimeout 래퍼(32-bit overflow 방지), 서버 응답 기반 드리프트 보정
- [ ] **SMGR-05**: 갱신 실패 처리 설계 — 5종 에러(RENEWAL_TOO_EARLY/LIMIT_REACHED/LIFETIME_EXCEEDED/네트워크/TOKEN_EXPIRED) 대응 + 재시도 전략
- [ ] **SMGR-06**: Lazy 401 reload 설계 — 401 수신 시 토큰 파일 재로드, 파일 토큰 ≠ 현재 토큰이면 교체 + API 재시도, 같으면 에러 상태
- [x] **SMGR-07**: 원자적 토큰 파일 쓰기 설계 — write-then-rename 패턴(POSIX rename 원자성), Windows NTFS 대응, 임시 파일 + rename

### SessionManager 통합 설계 (SMGI)

- [ ] **SMGI-01**: MCP tool handler 통합 설계 — ApiClient 리팩토링, 모든 tool/resource handler가 sessionManager.getToken() 참조, 401 자동 재시도
- [ ] **SMGI-02**: 토큰 로테이션 동시성 설계 — 갱신 중 tool 호출 시 현재(이전) 토큰 사용, 갱신 완료 후 다음 호출부터 새 토큰, in-flight 충돌 방지
- [ ] **SMGI-03**: MCP 프로세스 생명주기 설계 — Claude Desktop 재시작 시 파일에서 토큰 복원, 갱신 도중 프로세스 kill 시 파일-우선 쓰기 순서
- [ ] **SMGI-04**: Claude Desktop 에러 처리 설계 — 세션 만료 시 tool 응답 형식(isError 대신 안내 메시지), 반복 에러 시 연결 해제 방지

### CLI MCP 커맨드 (CLIP)

- [ ] **CLIP-01**: `waiaas mcp setup` 커맨드 인터페이스 설계 — 세션 생성 + 토큰 파일 저장 + Claude Desktop config.json 안내 출력
- [ ] **CLIP-02**: `waiaas mcp refresh-token` 커맨드 인터페이스 설계 — 기존 세션 폐기 + 새 세션 생성(constraints 계승) + 토큰 파일 교체

### Telegram /newsession (TGSN)

- [ ] **TGSN-01**: `/newsession` 명령어 플로우 설계 — chatId Tier 1 인증, 에이전트 목록 인라인 키보드, 세션 생성 + 토큰 파일 저장 + 완료 메시지
- [ ] **TGSN-02**: 기본 constraints 결정 규칙 설계 — 3-level 우선순위(agents.default_constraints > config.toml > 하드코딩 기본값)

### 알림 확장 (NOTI)

- [x] **NOTI-01**: SESSION_EXPIRING_SOON 이벤트 사양 설계 — 발생 조건(만료 24h 전 OR 잔여 갱신 3회 이하), WARNING 심각도, 알림 내용(세션ID, 에이전트명, 만료시각, 잔여횟수)
- [x] **NOTI-02**: 데몬 측 만료 임박 판단 로직 설계 — 갱신 API 응답 처리 시 잔여 횟수/절대 만료 체크, 알림 발송 트리거

### 테스트 설계 (TEST)

- [ ] **TEST-01**: 14개 핵심 검증 시나리오 설계 문서 명시 — T-01~T-14 각 시나리오의 검증 내용 + 테스트 레벨(Unit/Integration) 정의
- [ ] **TEST-02**: 4개 보안 시나리오 설계 문서 명시 — S-01~S-04(파일 권한/악성 내용/미인증/심볼릭 링크) 검증 방법 정의

### 설계 문서 통합 (INTEG)

- [ ] **INTEG-01**: 7개 기존 설계 문서 v0.9 통합 — 38(SDK-MCP), 35(알림), 40(Telegram), 54(CLI), 53(세션 갱신), 24(모노레포), 25(SQLite)
- [ ] **INTEG-02**: 리서치 pitfall 반영 — safeSetTimeout(C-01), 원자적 쓰기(C-02), JWT 미검증 디코딩 보안(C-03), Claude Desktop 에러 처리(H-04), 토큰 로테이션 충돌(H-05)

## Future Requirements

다음 마일스톤으로 이연.

### v1.0 구현 계획
- **IMPL-01**: v0.9 설계 기반 SessionManager 구현 (v1.3 SDK+MCP 마일스톤)
- **IMPL-02**: CLI mcp setup/refresh-token 구현 (v1.3)
- **IMPL-03**: Telegram /newsession 구현 (v1.6 Desktop+Telegram 마일스톤)

### 확장
- **EXT-01**: MCP Streamable HTTP transport 세션 관리 (v0.3 확장 계획 유지)
- **EXT-02**: 다중 MCP 클라이언트 동시 접속 시 토큰 격리
- **EXT-03**: agents.default_constraints DB 컬럼 추가 여부 결정 (구현 시 최종 결정)
- **EXT-04**: previous_token_hash 유예 기간 (세션 갱신 프로토콜 53 수정 검토)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 코드 구현 | 설계 마일스톤 — 구현은 v1.1+ |
| OAuth 2.1 / OIDC | MCP stdio transport는 스펙상 OAuth 대상 외 |
| fs.watch 기반 파일 감시 | macOS FSEvents 불안정, lazy 401 reload로 충분 |
| 다중 MCP 클라이언트 | 단일 토큰 파일 전제, Self-Hosted 단일 머신 |
| 클라우드 환경 세션 전달 | Self-Hosted 전용, 클라우드 전환 시 별도 재설계 |
| MCP SDK v2 호환 | 현재 pre-alpha, v1.x 타겟 + v2 향후 참고 |
| Windows 전용 파일 보안 | ACL 기반 권한 설정은 구현 시 스파이크 |

## Traceability

요구사항 -> 페이즈 매핑.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SMGR-01 | Phase 37 | Pending |
| SMGR-02 | Phase 36 | Complete |
| SMGR-03 | Phase 37 | Pending |
| SMGR-04 | Phase 37 | Pending |
| SMGR-05 | Phase 37 | Pending |
| SMGR-06 | Phase 37 | Pending |
| SMGR-07 | Phase 36 | Complete |
| SMGI-01 | Phase 38 | Pending |
| SMGI-02 | Phase 38 | Pending |
| SMGI-03 | Phase 38 | Pending |
| SMGI-04 | Phase 38 | Pending |
| CLIP-01 | Phase 39 | Pending |
| CLIP-02 | Phase 39 | Pending |
| TGSN-01 | Phase 39 | Pending |
| TGSN-02 | Phase 39 | Pending |
| NOTI-01 | Phase 36 | Complete |
| NOTI-02 | Phase 36 | Complete |
| TEST-01 | Phase 40 | Pending |
| TEST-02 | Phase 40 | Pending |
| INTEG-01 | Phase 40 | Pending |
| INTEG-02 | Phase 40 | Pending |

**Coverage:**
- v0.9 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after Phase 36 completion*
