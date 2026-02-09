# Roadmap: WAIaaS

## Milestones

- v0.1 Research & Design (shipped 2026-02-05)
- v0.2 Self-Hosted Secure Wallet Design (shipped 2026-02-05)
- v0.3 설계 논리 일관성 확보 (shipped 2026-02-06)
- v0.4 테스트 전략 및 계획 수립 (shipped 2026-02-07)
- v0.5 인증 모델 재설계 + DX 개선 (shipped 2026-02-07)
- v0.6 블록체인 기능 확장 설계 (shipped 2026-02-08)
- v0.7 구현 장애 요소 해소 (shipped 2026-02-08)
- v0.8 Owner 선택적 등록 + 점진적 보안 모델 (shipped 2026-02-09)
- **v0.9 MCP 세션 관리 자동화 설계** (in progress)

## Overview

MCP 환경에서 세션 토큰의 갱신/만료/재발급을 자동화하는 메커니즘을 설계한다. 토큰 파일 인프라(공유 유틸리티)를 기반으로 SessionManager 핵심 로직을 정의하고, MCP tool handler 통합, CLI/Telegram 외부 연동, 테스트 시나리오 명시 및 7개 기존 설계 문서 통합까지 완료하여, 구현 단계에서 "무엇을 어떻게 구현할 것인가"가 명확한 상태를 만든다.

## Phases

**Phase Numbering:**
- v0.8까지 Phase 35 완료. v0.9는 Phase 36부터 시작.
- Integer phases (36, 37, ...): 계획된 마일스톤 작업
- Decimal phases (36.1, 36.2): 긴급 삽입 (INSERTED 표기)

- [x] **Phase 36: 토큰 파일 인프라 + 알림 이벤트** - 공유 파일 유틸리티와 SESSION_EXPIRING_SOON 이벤트 설계
- [ ] **Phase 37: SessionManager 핵심 설계** - 토큰 로드/갱신/실패처리/lazy reload 핵심 메커니즘
- [ ] **Phase 38: SessionManager MCP 통합 설계** - MCP tool handler 연동, 동시성, 프로세스 생명주기, 에러 처리
- [ ] **Phase 39: CLI + Telegram 연동 설계** - mcp setup/refresh-token 커맨드 + /newsession 플로우
- [ ] **Phase 40: 테스트 설계 + 설계 문서 통합** - 18개 테스트 시나리오 명시 + 7개 기존 문서 v0.9 통합

## Phase Details

### Phase 36: 토큰 파일 인프라 + 알림 이벤트
**Goal**: MCP/CLI/Telegram 3개 컴포넌트가 공유하는 토큰 파일 사양과 원자적 쓰기 패턴이 정의되고, SESSION_EXPIRING_SOON 알림 이벤트가 설계된다
**Depends on**: Nothing (v0.9 첫 페이즈)
**Requirements**: SMGR-02, SMGR-07, NOTI-01, NOTI-02
**Success Criteria** (what must be TRUE):
  1. ~/.waiaas/mcp-token 파일 사양(경로, 포맷, 권한 0o600, 인코딩, symlink 거부)이 설계 문서에 명확히 정의되어 있다
  2. 원자적 토큰 파일 쓰기 패턴(write-then-rename, Windows NTFS 대응)이 설계 문서에 정의되어 있다
  3. SESSION_EXPIRING_SOON 이벤트의 발생 조건(만료 24h 전 OR 잔여 갱신 3회 이하), 심각도(WARNING), 알림 내용(세션ID, 에이전트명, 만료시각, 잔여횟수)이 정의되어 있다
  4. 데몬 측 만료 임박 판단 로직(갱신 API 응답 처리 시 잔여 횟수/절대 만료 체크, 알림 트리거)이 설계 문서에 정의되어 있다
**Plans**: 2 plans (Wave 1: 병렬 실행)

Plans:
- [x] 36-01-PLAN.md -- 토큰 파일 사양 + 원자적 쓰기 패턴 설계 (SMGR-02, SMGR-07)
- [x] 36-02-PLAN.md -- SESSION_EXPIRING_SOON 이벤트 + 데몬 판단 로직 설계 (NOTI-01, NOTI-02)

### Phase 37: SessionManager 핵심 설계
**Goal**: SessionManager 클래스의 인터페이스, 토큰 로드 전략, 자동 갱신 스케줄, 실패 처리, lazy 401 reload가 구현 가능한 수준으로 정의된다
**Depends on**: Phase 36 (토큰 파일 사양)
**Requirements**: SMGR-01, SMGR-03, SMGR-04, SMGR-05, SMGR-06
**Success Criteria** (what must be TRUE):
  1. SessionManager 클래스의 getToken/start/dispose 메서드와 내부 상태(token, sessionId, expiresAt, renewalCount, timer)가 설계 문서에 정의되어 있다
  2. 토큰 로드 우선순위(파일 > env var)와 JWT payload base64url 디코딩 절차가 정의되어 있다
  3. 자동 갱신 스케줄(60% TTL 경과, safeSetTimeout 래퍼, 서버 응답 기반 드리프트 보정)이 정의되어 있다
  4. 5종 갱신 실패 에러 각각의 대응 전략(재시도 횟수, 알림 트리거, 에러 상태 전이)이 정의되어 있다
  5. Lazy 401 reload(파일 재로드, 토큰 비교, API 재시도) 메커니즘이 정의되어 있다
**Plans**: TBD

Plans:
- [ ] 37-01: SessionManager 인터페이스 + 토큰 로드 전략 설계
- [ ] 37-02: 자동 갱신 스케줄 + 실패 처리 + lazy reload 설계

### Phase 38: SessionManager MCP 통합 설계
**Goal**: SessionManager가 MCP tool/resource handler와 통합되어, 토큰 로테이션 동시성, 프로세스 생명주기, Claude Desktop 에러 처리가 설계 수준에서 해결된다
**Depends on**: Phase 37 (SessionManager 핵심)
**Requirements**: SMGI-01, SMGI-02, SMGI-03, SMGI-04
**Success Criteria** (what must be TRUE):
  1. ApiClient 리팩토링 설계가 정의되어, 모든 tool/resource handler가 sessionManager.getToken()을 참조하고 401 자동 재시도하는 구조가 명확하다
  2. 갱신 중 tool 호출 시 동시성 처리(현재 토큰 사용, 갱신 완료 후 전환, in-flight 충돌 방지)가 정의되어 있다
  3. Claude Desktop 재시작 시 파일 복원, 갱신 도중 프로세스 kill 시 파일-우선 쓰기 순서가 정의되어 있다
  4. 세션 만료 시 tool 응답 형식(isError 대신 안내 메시지)과 반복 에러 시 연결 해제 방지 전략이 정의되어 있다
**Plans**: TBD

Plans:
- [ ] 38-01: MCP tool handler 통합 + ApiClient 리팩토링 설계
- [ ] 38-02: 동시성 + 프로세스 생명주기 + Claude Desktop 에러 처리 설계

### Phase 39: CLI + Telegram 연동 설계
**Goal**: CLI mcp setup/refresh-token 커맨드와 Telegram /newsession 플로우가 인터페이스, 동작, 출력 수준으로 정의된다
**Depends on**: Phase 36 (토큰 파일 사양)
**Requirements**: CLIP-01, CLIP-02, TGSN-01, TGSN-02
**Success Criteria** (what must be TRUE):
  1. `waiaas mcp setup` 커맨드의 인터페이스(인자, 옵션), 동작(세션 생성 + 토큰 파일 저장), 출력(Claude Desktop config.json 안내)이 정의되어 있다
  2. `waiaas mcp refresh-token` 커맨드의 동작(기존 세션 폐기 + 새 세션 생성 + constraints 계승 + 토큰 파일 교체)이 정의되어 있다
  3. Telegram `/newsession` 명령어의 chatId Tier 1 인증, 에이전트 목록 인라인 키보드, 세션 생성 + 토큰 파일 저장 + 완료 메시지 플로우가 정의되어 있다
  4. 기본 constraints 결정 규칙(agents.default_constraints > config.toml > 하드코딩 기본값) 3-level 우선순위가 정의되어 있다
**Plans**: TBD

Plans:
- [ ] 39-01: CLI mcp setup + mcp refresh-token 커맨드 설계
- [ ] 39-02: Telegram /newsession 플로우 + 기본 constraints 규칙 설계

### Phase 40: 테스트 설계 + 설계 문서 통합
**Goal**: 18개 테스트 시나리오(14 핵심 + 4 보안)가 설계 문서에 명시되고, 7개 기존 설계 문서에 v0.9 변경이 일관되게 통합된다
**Depends on**: Phase 37, Phase 38, Phase 39 (모든 설계 완료 후)
**Requirements**: TEST-01, TEST-02, INTEG-01, INTEG-02
**Success Criteria** (what must be TRUE):
  1. T-01~T-14 핵심 검증 시나리오 각각의 검증 내용과 테스트 레벨(Unit/Integration)이 설계 문서에 명시되어 있다
  2. S-01~S-04 보안 시나리오(파일 권한/악성 내용/미인증/심볼릭 링크)의 검증 방법이 정의되어 있다
  3. 7개 기존 설계 문서(38, 35, 40, 54, 53, 24, 25)에 v0.9 변경이 [v0.9] 태그로 통합되어 있다
  4. 리서치 pitfall 5건(safeSetTimeout C-01, 원자적 쓰기 C-02, JWT 미검증 디코딩 C-03, Claude Desktop 에러 처리 H-04, 토큰 로테이션 충돌 H-05)의 대응이 설계 문서에 반영되어 있다
**Plans**: TBD

Plans:
- [ ] 40-01: 18개 테스트 시나리오 설계 문서 명시
- [ ] 40-02: 7개 기존 설계 문서 v0.9 통합 + pitfall 반영

## Progress

**Execution Order:**
Phase 36 → Phase 37 → Phase 38 (Phase 39는 Phase 36 이후 병렬 가능) → Phase 40

**Dependencies:**
```
Phase 36 ─┬─→ Phase 37 ──→ Phase 38 ──┐
           └─→ Phase 39 ───────────────┤
                                        └──→ Phase 40
```

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 36. 토큰 파일 인프라 + 알림 이벤트 | 2/2 | Complete | 2026-02-09 |
| 37. SessionManager 핵심 설계 | 0/2 | Not started | - |
| 38. SessionManager MCP 통합 설계 | 0/2 | Not started | - |
| 39. CLI + Telegram 연동 설계 | 0/2 | Not started | - |
| 40. 테스트 설계 + 설계 문서 통합 | 0/2 | Not started | - |

---
*로드맵 생성: 2026-02-09*
*마일스톤: v0.9 MCP 세션 관리 자동화 설계*
*페이즈: 36-40 (5개 페이즈, 10개 플랜)*
*요구사항 커버리지: 21/21*
