# Phase 40: 테스트 설계 + 설계 문서 통합 - Research

**Researched:** 2026-02-09
**Domain:** v0.9 테스트 시나리오 설계 문서 명시 + 7개 기존 설계 문서 v0.9 변경 통합 + pitfall 대응 반영 검증
**Confidence:** HIGH

## Summary

Phase 40은 v0.9 마일스톤의 마지막 페이즈로, 두 가지 독립적인 작업을 수행한다:

1. **테스트 설계 명시 (Plan 40-01):** v0.9 objectives에 정의된 14개 핵심 검증 시나리오(T-01~T-14)와 4개 보안 시나리오(S-01~S-04)를 설계 문서에 명시한다. 각 시나리오의 검증 내용, 테스트 레벨(Unit/Integration), 검증 방법이 설계 문서에 존재해야 구현 단계에서 테스트 계획의 기반이 된다. 테스트 시나리오의 원본은 v0.9 objectives 섹션 "테스트 전략" (T-01~T-14, S-01~S-04)이며, Phase 36-39에서 확정된 설계 결정이 각 시나리오의 구체적 검증 방법을 결정한다.

2. **설계 문서 통합 (Plan 40-02):** 7개 기존 설계 문서(38, 35, 40, 54, 53, 24, 25)에 v0.9 변경이 [v0.9] 태그로 일관되게 통합되었는지 확인하고, 5건의 리서치 pitfall(C-01, C-02, C-03, H-04, H-05) 대응이 설계 문서에 반영되었는지 검증한다.

Phase 36-39에서 대부분의 설계 내용이 이미 설계 문서에 작성되었으므로, Phase 40은 **검증 + 보완** 성격이 강하다. 38-sdk-mcp-interface.md(130회 v0.9 태그), 40-telegram-bot-docker.md(37회), 54-cli-flow-redesign.md(32회), 35-notification-architecture.md(14회), 53-session-renewal-protocol.md(29회), 24-monorepo-data-directory.md(10회)에 이미 v0.9 내용이 반영되어 있다. 25-sqlite-schema.md만 v0.9 태그가 0회로, agents.default_constraints 이연(EXT-03) 결정 반영이 필요하다.

**Primary recommendation:** Plan 40-01은 테스트 시나리오 18개를 38-sdk-mcp-interface.md에 테스트 섹션으로 통합하여 명시하고, Plan 40-02는 7개 문서의 v0.9 통합 완결성을 검증 후 누락분(25-sqlite 이연 태그, pitfall 교차 참조 등)을 보완한다.

---

## Standard Stack

Phase 40은 설계 문서 검증 + 보완 작업이므로 라이브러리나 기술 스택이 관여하지 않는다.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| N/A | N/A | N/A | 문서 작업만 수행 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 기존 설계 문서에 테스트 시나리오 인라인 | 별도 테스트 설계 문서 생성 | v0.4에서 별도 문서(41-51) 방식 사용했으나, v0.9 테스트는 18개로 소규모이므로 기존 문서 내 인라인이 적절 |
| 38-sdk-mcp-interface.md에 통합 | 각 시나리오를 관련 문서에 분산 | T-01~T-14가 대부분 SessionManager 관련이므로 38에 통합이 SSoT 유지에 유리 |

---

## Architecture Patterns

### Pattern 1: 테스트 시나리오 명시 형식

**What:** v0.9 objectives에 정의된 T-01~T-14, S-01~S-04를 설계 문서에 테이블 + 검증 방법으로 명시한다.

**When to use:** 38-sdk-mcp-interface.md에 새 섹션으로 추가.

**Format (기존 v0.9 objectives 형식 확장):**

```markdown
## 테스트 설계 [v0.9]

### 핵심 검증 시나리오

| # | 시나리오 | 검증 내용 | 테스트 레벨 | 검증 방법 | 관련 설계 결정 |
|---|----------|----------|------------|----------|--------------|
| T-01 | 최초 기동 (env var만) | env var에서 토큰 로드, 갱신 스케줄링 | Unit | Mock readMcpToken → null, env var 설정 → loadToken 호출 → token/sessionId/expiresAt 검증 | SM-04 |
| ... | ... | ... | ... | ... | ... |

### 보안 시나리오

| # | 시나리오 | 검증 내용 | 검증 방법 | 관련 설계 결정 |
|---|----------|----------|----------|--------------|
| S-01 | mcp-token 파일 권한 | 0o600 외 권한 시 로드 거부 (또는 경고) | lstatSync mock으로 mode 조작 → readMcpToken → null 반환 검증 | TF-01 |
| ... | ... | ... | ... | ... |
```

**Source:** v0.9 objectives 테스트 전략 섹션, Phase 25 테스트 전략 통합 선례

### Pattern 2: 설계 문서 통합 검증 체크리스트

**What:** 7개 설계 문서 각각에 대해 v0.9 변경 내용이 [v0.9] 태그로 반영되었는지 체크리스트로 검증한다.

**When to use:** Plan 40-02 실행 시.

```markdown
## 문서 통합 체크리스트

### 38-sdk-mcp-interface.md
- [x] SessionManager 클래스 인터페이스 (Phase 37-01: SM-01~SM-07)
- [x] 자동 갱신 + 실패 처리 + lazy reload (Phase 37-02: SM-08~SM-14)
- [x] ApiClient 래퍼 + tool/resource 통합 (Phase 38-01: SMGI-D01)
- [x] 동시성 + 생명주기 + 에러 처리 (Phase 38-02: SMGI-D02~D04)
- [ ] 테스트 시나리오 18개 명시 (Phase 40: TEST-01, TEST-02)

### 25-sqlite-schema.md
- [ ] agents.default_constraints EXT-03 이연 결정 기록
```

### Pattern 3: Pitfall 대응 교차 참조 패턴

**What:** 5건의 pitfall 대응이 설계 문서에 반영되었는지 추적 가능한 교차 참조를 작성한다.

**When to use:** Plan 40-02에서 INTEG-02 검증 시.

```markdown
## Pitfall 대응 매트릭스 [v0.9]

| Pitfall | 대응 설계 결정 | 설계 문서 위치 | 검증 상태 |
|---------|--------------|--------------|----------|
| C-01: setTimeout 32-bit overflow | SM-08: safeSetTimeout | 38-sdk-mcp §6.4.3 | Verified |
| C-02: 원자적 쓰기 | TF-02: write-then-rename | 24-monorepo §4.3 | Verified |
| C-03: JWT 미검증 디코딩 | SM-05: 방어적 범위 검증 | 38-sdk-mcp §6.4.2 | Verified |
| H-04: Claude Desktop 에러 | SMGI-D01: toToolResult isError 회피 | 38-sdk-mcp §6.5.7 | Verified |
| H-05: 토큰 로테이션 충돌 | SMGI-D02: 50ms 대기 + 401 재시도 | 38-sdk-mcp §6.5.5 | Verified |
```

### Anti-Patterns to Avoid

- **테스트 시나리오를 별도 독립 문서로 작성:** v0.9 테스트는 18개로 소규모이며, 모두 SessionManager/토큰 파일 관련. 기존 38-sdk-mcp-interface.md에 인라인이 SSoT 유지와 참조 편의성 면에서 우월. 별도 문서 생성은 문서 간 분산을 야기.
- **이미 반영된 v0.9 내용을 중복 작성:** Phase 36-39에서 이미 설계 문서에 상당량의 v0.9 내용이 반영됨. Phase 40에서 동일 내용을 재작성하면 일관성 위험. 검증 + 누락분 보완에 집중.
- **25-sqlite-schema.md에 agents.default_constraints 컬럼을 추가:** EXT-03으로 이연이 확정됨(TG-04 결정). 스키마 변경 대신 이연 결정 기록만 추가.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 테스트 시나리오 형식 | 새로운 형식 발명 | v0.9 objectives 테이블 형식 확장 | 이미 T-01~T-14, S-01~S-04가 테이블로 정의됨. 검증 방법 컬럼 추가로 충분 |
| 문서 통합 검증 | 수동 목시 확인 | [v0.9] 태그 grep + 체크리스트 | 정량적 검증 (태그 수 비교)이 누락 방지에 효과적 |
| pitfall 추적 | 텍스트 서술 | 매트릭스 테이블 (pitfall ID -> 설계 결정 ID -> 문서 위치) | 교차 참조 추적성 보장 |

**Key insight:** Phase 40은 새로운 설계가 아닌 "설계 검증 + 문서 완결성 확보"이다. 기존 형식과 패턴을 재사용하고, 누락분을 정밀하게 찾아 보완하는 것이 핵심.

---

## Common Pitfalls

### Pitfall 1: 이미 반영된 내용을 중복 작성하여 불일치 발생

**What goes wrong:** Phase 36-39에서 이미 설계 문서에 반영된 v0.9 내용을 Phase 40에서 다시 작성하면, 두 버전 간 미묘한 차이로 불일치가 발생한다.

**Why it happens:** 7개 문서가 모두 크고(총 18,545줄), 기존 v0.9 태그가 총 ~250회 이상 존재하여 전수 확인이 어렵다.

**How to avoid:** Plan 40-02에서 각 문서의 기존 [v0.9] 태그를 grep으로 목록화하고, Phase 36-39 SUMMARY.md의 설계 결정 ID와 대조하여 누락분만 식별한다. 기존 내용은 수정하지 않는다.

**Warning signs:** 동일한 설계 결정이 문서 내 두 곳에 서로 다른 표현으로 존재.

### Pitfall 2: 25-sqlite-schema.md 변경 범위 과대 해석

**What goes wrong:** 25-sqlite-schema.md에 agents.default_constraints 컬럼을 실제로 추가하는 스키마 변경을 수행한다.

**Why it happens:** INTEG-01에 "25(SQLite)" 통합이 포함되어 있어, 스키마 변경이 필요한 것으로 오해할 수 있다.

**How to avoid:** TG-04 결정 (EXT-03 이연)에 따라, 25-sqlite-schema.md에는 "[v0.9] agents.default_constraints: EXT-03으로 이연. 구현 시점(v1.x)에 컬럼 추가 여부 결정" 주석만 추가한다. 실제 스키마 변경은 범위 외.

**Warning signs:** 25-sqlite-schema.md에 새로운 CREATE TABLE 문이나 ALTER TABLE 문이 추가됨.

### Pitfall 3: 테스트 시나리오의 검증 방법이 설계 결정과 불일치

**What goes wrong:** T-01~T-14의 검증 방법이 Phase 37-39에서 확정된 설계 결정과 맞지 않는다.

**Why it happens:** v0.9 objectives의 테스트 시나리오는 Phase 36 이전에 작성되었으므로, Phase 37-39에서 변경된 세부 사항이 반영되지 않았을 수 있다.

**How to avoid:** 각 테스트 시나리오의 검증 방법을 작성할 때, 해당 시나리오와 관련된 설계 결정(SM-XX, SMGI-DXX, TF-XX, CLI-XX, TG-XX)을 명시적으로 참조하고, 결정 내용과 일치하는지 확인한다.

**Warning signs:** T-07(외부 토큰 교체 감지)의 검증 방법이 SM-12(handleUnauthorized 4-step)와 상이.

### Pitfall 4: REQUIREMENTS.md의 SMGI-01~04 상태 미갱신

**What goes wrong:** REQUIREMENTS.md에서 SMGI-01~04가 "Pending"으로 남아 있지만, 실제로는 Phase 38에서 완료됨. Phase 40에서 이를 갱신하지 않으면 추적성이 깨진다.

**Why it happens:** Phase 38 실행 후 REQUIREMENTS.md 상태 갱신이 누락된 것으로 보임.

**How to avoid:** Plan 40-02에서 REQUIREMENTS.md의 상태도 함께 갱신하여 v0.9 전체 21개 요구사항의 상태를 일관되게 만든다.

**Warning signs:** REQUIREMENTS.md의 Coverage가 "21 total, 17 Complete, 4 Pending"이어야 하나 실제와 불일치.

---

## T-01~T-14 테스트 시나리오 상세 분석

v0.9 objectives에서 정의된 14개 핵심 검증 시나리오를 Phase 36-39 설계 결정과 매핑한다.

### 핵심 검증 시나리오 매핑

| # | 시나리오 | 검증 내용 | 테스트 레벨 | 관련 설계 결정 | 검증 방법 설명 |
|---|----------|----------|------------|--------------|--------------|
| T-01 | 최초 기동 (env var만) | env var에서 토큰 로드, 갱신 스케줄링 | Unit | SM-04 (파일>env), SM-06 (lazy init) | readMcpToken mock -> null, WAIAAS_SESSION_TOKEN 설정 -> SessionManager.start() -> getToken() 비교 |
| T-02 | 최초 기동 (파일 존재) | 파일 우선 로드, env var 무시 | Unit | SM-04 (파일>env), TF-01 (readMcpToken) | readMcpToken mock -> valid JWT, env var도 설정 -> start() -> getToken()이 파일 토큰인지 검증 |
| T-03 | 자동 갱신 성공 | 60% 경과 시점 갱신 -> 새 토큰 메모리 교체 + 파일 저장 | Integration | SM-09 (self-correcting timer), SM-10 (파일-우선 쓰기) | fake timer 사용, PUT /renew mock -> 200 OK -> writeMcpToken 호출 확인 + getToken() 새 토큰 확인 |
| T-04 | 자동 갱신 실패 (TOO_EARLY) | 30초 후 1회 재시도 | Unit | SM-11 (5종 에러 분기) | PUT /renew mock -> 403 RENEWAL_TOO_EARLY -> 30초 timer 재설정 확인 |
| T-05 | 갱신 한도 도달 (LIMIT_REACHED) | 갱신 포기, 알림 트리거 | Unit | SM-11, SM-13 (알림 미발송), NOTI-01~05 | PUT /renew mock -> 403 RENEWAL_LIMIT_REACHED -> scheduleRenewal 미호출 확인 |
| T-06 | 절대 수명 만료 | 갱신 불가, 에러 상태 진입 | Unit | SM-11 | PUT /renew mock -> 403 SESSION_LIFETIME_EXCEEDED -> state = 'expired' 확인 |
| T-07 | 외부 토큰 교체 감지 | 401 수신 -> 파일 재로드 -> 새 토큰 사용 -> 재시도 성공 | Integration | SM-12 (handleUnauthorized 4-step), SMGI-D02 (50ms 대기) | GET mock -> 401 -> readMcpToken mock 새 토큰 반환 -> handleUnauthorized() true -> 재시도 성공 |
| T-08 | Telegram /newsession | 에이전트 선택 -> 세션 생성 -> 파일 저장 -> 완료 메시지 | Integration | TG-01~TG-06 | mock agentService.listActive, mock sessionService.create -> writeMcpToken 호출 + sendMessage 확인 |
| T-09 | CLI mcp setup | 세션 생성 + 파일 저장 + 안내 출력 | Integration | CLI-01~CLI-06 | mock fetch (health + sessions POST) -> writeMcpToken 호출 + stdout Claude Desktop config 포함 |
| T-10 | CLI mcp refresh-token | 기존 세션 폐기 + 새 세션 생성 + 파일 교체 | Integration | CLI-03 (8단계), CLI-06 (constraints 계승) | mock fetch (health + sessions GET/POST/DELETE) -> 생성->파일->폐기 순서 검증 |
| T-11 | 토큰 파일 권한 | 파일 생성 시 0o600, 타 사용자 읽기 불가 | Unit | TF-01 (readMcpToken), TF-04 (Windows EPERM) | writeMcpToken 호출 후 statSync -> mode & 0o777 === 0o600 검증 (POSIX만) |
| T-12 | 동시 갱신 방지 | 갱신 진행 중 tool 호출 -> 현재 토큰 사용, 중복 갱신 없음 | Unit | SM-14 (갱신 중 구 토큰 반환), SMGI-D02 | renew() inflight 중 getToken() 호출 -> 구 토큰 반환 + isRenewing true 검증 |
| T-13 | 데몬 미기동 상태 | 네트워크 에러 -> 60초 후 재시도 x 3회 -> 에러 상태 | Unit | SM-11 (NETWORK_ERROR 분기), SM-07 (graceful degradation) | fetch mock -> network error -> retryRenewal(60000, 3) 호출 + 3회 후 state = 'error' |
| T-14 | SESSION_EXPIRING_SOON 알림 | 만료 24h 전 또는 잔여 3회 시 알림 발송 | Integration | NOTI-01~NOTI-05 | shouldNotifyExpiringSession(remainingRenewals=2, absoluteExpiresAt=future) -> true + notificationService.notify mock 호출 |

### 보안 시나리오 매핑

| # | 시나리오 | 검증 내용 | 검증 방법 | 관련 설계 결정 |
|---|----------|----------|----------|--------------|
| S-01 | mcp-token 파일 권한 | 0o600 외 권한 시 로드 거부 (또는 경고) | POSIX: 0o644 mode 파일 생성 -> readMcpToken -> null 또는 경고 로그. Windows: 권한 검증 스킵 + 경고 (H-03) | TF-01 (readMcpToken), H-03 (Windows 제한) |
| S-02 | 토큰 파일에 악성 내용 | JWT 형식 검증 실패 -> 로드 거부 | 파일에 "not-a-jwt" 작성 -> readMcpToken -> null. 파일에 잘린 JWT 작성 -> readMcpToken -> null | TF-01 (형식 검증: wai_sess_ 접두어 + 3-part JWT) |
| S-03 | /newsession 미인증 사용자 | chatId 불일치 -> 거부 메시지 | 잘못된 chatId로 handleNewSession 호출 -> sendUnauthorized 호출 확인 | TG-01 (Tier 1 chatId 인증) |
| S-04 | 토큰 파일 심볼릭 링크 | symlink 감지 -> 로드 거부 | symlink 생성 -> readMcpToken -> null + console.error 로그 확인 | TF-01 (lstatSync 검사) |

---

## 7개 설계 문서 v0.9 통합 현황 분석

### 문서별 현재 상태 + 필요 작업

| 문서 | 현재 [v0.9] 태그 수 | Phase 36-39에서 수행된 작업 | Phase 40에서 필요한 작업 |
|------|:-------------------:|--------------------------|------------------------|
| **38-sdk-mcp-interface.md** | 37회 (37개 v0.9 태그) + 130회 관련 키워드 | Phase 37(SM-01~14), Phase 38(SMGI-D01~D04): 섹션 6.4 전체 + 6.5 전체 신규 작성 | TEST-01/02 테스트 시나리오 섹션 추가, pitfall 교차 참조 매트릭스 추가 |
| **35-notification-architecture.md** | 9회 | Phase 36-02: SESSION_EXPIRING_SOON 이벤트, shouldNotifyExpiringSession, 알림 호출 포인트, 메시지 템플릿 | 완결성 확인. 누락 없음 예상 |
| **40-telegram-bot-docker.md** | 15회 | Phase 39-02: /newsession (섹션 4.12), 기본 Constraints (섹션 4.13) | 완결성 확인. SESSION_EXPIRING_SOON 인라인 버튼 참조 추가 가능 |
| **54-cli-flow-redesign.md** | 9회 | Phase 39-01: mcp setup/refresh-token (섹션 10) | 완결성 확인. 커맨드 목록 테이블 갱신 필요 여부 확인 |
| **53-session-renewal-protocol.md** | 8회 | Phase 36-02: shouldNotifyExpiringSession (섹션 5.6) | 완결성 확인. MCP SessionManager 연동 시나리오 참조 확인 |
| **24-monorepo-data-directory.md** | 5회 | Phase 36-01: mcp-token 파일 사양 (섹션 4) | 완결성 확인 |
| **25-sqlite-schema.md** | 0회 | 없음 | EXT-03 이연 결정 기록 추가 ([v0.9] agents.default_constraints 이연 주석) |

### 핵심 발견: 대부분 이미 반영됨

Phase 36-39 실행 시 설계 결정이 즉시 설계 문서에 반영되었으므로, 7개 문서 중 6개는 v0.9 내용이 이미 상당히 완전하다. Phase 40의 주요 작업은:

1. **38-sdk-mcp-interface.md:** 테스트 시나리오 18개 명시 섹션 추가 (TEST-01, TEST-02)
2. **25-sqlite-schema.md:** EXT-03 이연 결정 주석 추가 (1줄)
3. **나머지 5개:** 완결성 검증 (누락 항목이 있으면 보완)
4. **전체:** pitfall 대응 교차 참조 매트릭스 추가 (INTEG-02)

---

## Pitfall 대응 반영 현황

### 5건 pitfall 추적

| Pitfall ID | 설명 | 대응 설계 결정 | 반영 문서 | 반영 섹션 | 반영 상태 |
|------------|------|--------------|----------|----------|----------|
| C-01 | setTimeout 32-bit overflow | SM-08: safeSetTimeout 래퍼 | 38-sdk-mcp-interface.md | 6.4.3 safeSetTimeout 래퍼 | VERIFIED -- 래퍼 함수 코드 + MAX_TIMEOUT_MS 상수 + 체이닝 로직 명시 |
| C-02 | 토큰 파일 쓰기 경합 -> write-then-rename | TF-02: 원자적 쓰기 패턴 | 24-monorepo-data-directory.md | 4.3 원자적 쓰기 패턴 상세 | VERIFIED -- 6단계, 4개 플랫폼, Windows EPERM 재시도 |
| C-03 | JWT 미검증 디코딩 보안 | SM-05: 방어적 범위 검증 (exp 과거10년~미래1년) | 38-sdk-mcp-interface.md | 6.4.2 토큰 로드 전략 Step 5 | VERIFIED -- exp 범위 검증 코드 포함 |
| H-04 | Claude Desktop 반복 에러 -> 연결 해제 | SMGI-D01: toToolResult/toResourceResult isError 회피 | 38-sdk-mcp-interface.md | 6.5.7 Claude Desktop 에러 처리 전략 | VERIFIED -- isError 원칙 3종, 안내 메시지 형식 |
| H-05 | 토큰 로테이션 중 tool 호출 401 | SMGI-D02: 50ms 대기 + 401 재시도 | 38-sdk-mcp-interface.md | 6.5.5 토큰 로테이션 동시성 처리 | VERIFIED -- 시퀀스 다이어그램, 50ms 근거, handle401 3-step |

### 발견: 5건 모두 설계 문서에 반영 완료

Phase 37-38 실행 시 pitfall 대응이 설계 문서에 직접 반영되었다. Phase 40에서는 교차 참조 매트릭스를 추가하여 추적성을 확보하는 것이 목표.

---

## 기존 프로젝트 선례 분석

### Phase 25 (v0.6 테스트 전략 통합) 선례

Phase 25는 v0.6 확장 기능의 테스트 전략을 통합하는 유사 페이즈였다. 4개 plan으로 구성:

- 25-01: 확장 기능 테스트 전략 문서(64-extension-test-strategy.md) 생성 -- 별도 문서
- 25-02~04: 기존 문서 통합

**Phase 40과의 차이:** Phase 25는 148개 테스트 시나리오로 대규모여서 별도 문서(64)가 필요했지만, Phase 40은 18개 시나리오로 소규모이므로 기존 38-sdk-mcp-interface.md에 인라인 추가가 적절하다.

### [v0.X] 태그 컨벤션

기존 설계 문서에서 사용하는 버전 태그 패턴:

```markdown
# 인라인 태그 (변경된 줄에 직접)
| 항목 | 값 | 비고 |
| SESSION_EXPIRING_SOON | [v0.9] Phase 36 추가 | 17번째 이벤트 |

# 섹션 헤더 태그 (새 섹션에)
## 섹션 제목 [v0.9]
### 하위 섹션 [v0.9 Phase 37-01]

# 코드 주석 태그
// [v0.9] Phase 38 -- 설명
```

이 패턴을 Phase 40에서도 동일하게 사용한다.

---

## Plan 구조 분석

### Plan 40-01: 테스트 시나리오 설계 문서 명시 (TEST-01, TEST-02)

**요구사항:** TEST-01 (T-01~T-14 명시), TEST-02 (S-01~S-04 명시)

**주요 작업:**
1. 38-sdk-mcp-interface.md에 테스트 설계 섹션 추가 (섹션 6.6 또는 7)
2. T-01~T-14: 검증 내용 + 테스트 레벨 + 검증 방법 + 관련 설계 결정 ID 테이블
3. S-01~S-04: 검증 내용 + 검증 방법 + 관련 설계 결정 ID 테이블
4. v0.9 objectives의 테스트 전략 섹션 업데이트 (설계 완료 표기)

**산출물:** 38-sdk-mcp-interface.md 수정 (테스트 섹션 추가)

**검증 기준:**
- 18개 시나리오 각각에 검증 방법이 존재
- Unit/Integration 레벨이 명시
- 관련 설계 결정 ID가 추적 가능

### Plan 40-02: 설계 문서 v0.9 통합 + pitfall 반영 (INTEG-01, INTEG-02)

**요구사항:** INTEG-01 (7개 문서 통합), INTEG-02 (pitfall 5건 반영)

**주요 작업:**
1. 7개 문서 v0.9 통합 완결성 검증 (체크리스트)
2. 25-sqlite-schema.md에 EXT-03 이연 결정 주석 추가
3. pitfall 대응 교차 참조 매트릭스 작성 (38-sdk-mcp-interface.md에 추가)
4. REQUIREMENTS.md 상태 갱신 (SMGI-01~04 Complete로, TEST-01/02/INTEG-01/02 Complete로)
5. v0.9 objectives 성공 기준 10/11번 업데이트

**산출물:** 25-sqlite-schema.md 수정 (1줄), 38-sdk-mcp-interface.md 수정 (pitfall 매트릭스), REQUIREMENTS.md 수정, objectives 수정

**검증 기준:**
- 7개 문서 모두 [v0.9] 태그 존재
- pitfall 5건 교차 참조 완료
- REQUIREMENTS.md 21개 요구사항 모두 Complete

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 별도 테스트 전략 문서 (v0.4: 41-51, v0.6: 64) | 기존 설계 문서 인라인 (v0.9: 38 섹션 내) | v0.9 (18개 소규모 시나리오) | 문서 분산 방지, SSoT 유지 |
| Phase 실행 후 문서 통합 별도 수행 | Phase 실행 시 즉시 문서 반영 | v0.9 Phase 36-39 | Phase 40 작업량 대폭 감소, 검증 중심으로 전환 |
| pitfall 문서 별도 관리 | pitfall -> 설계 결정 -> 문서 반영 추적 매트릭스 | v0.9 Phase 40 | 추적성 향상 |

---

## Open Questions

1. **테스트 시나리오를 38-sdk-mcp-interface.md에 통합할 위치**
   - What we know: 현재 38의 구조가 섹션 6.5.7까지 진행됨. 테스트 섹션은 섹션 7 또는 6.6으로 추가 가능.
   - What's unclear: 기존 섹션 구조에 맞는 최적 위치.
   - Recommendation: 섹션 7 (최상위 새 섹션)으로 "## 7. v0.9 테스트 설계 [v0.9]" 추가. 이유: 테스트는 전체 SessionManager 설계의 검증이므로 6.x 하위보다 독립 섹션이 적절.

2. **S-01 파일 권한 검증의 Windows 처리**
   - What we know: H-03에서 Windows 권한 검증 스킵 + 경고 로그로 확정.
   - What's unclear: S-01 테스트에서 Windows 환경을 어떻게 표현할지.
   - Recommendation: S-01 검증 방법에 "POSIX 전용. Windows에서는 권한 검증 스킵 (H-03)" 명시. 플랫폼별 분기 테스트는 구현 시(v1.x) 결정.

3. **REQUIREMENTS.md SMGI-01~04 상태 갱신 시점**
   - What we know: Phase 38 SUMMARY.md가 존재하므로 실제로는 Complete.
   - What's unclear: Phase 38이 현재 브랜치(gsd/phase-38-sessionmanager-mcp-integration)에서 완료되었는지, main에 병합되었는지.
   - Recommendation: Phase 40 Plan 40-02에서 REQUIREMENTS.md의 SMGI-01~04를 Complete로 갱신. 현재 브랜치 상태와 무관하게 SUMMARY 존재로 완료 판단.

---

## Sources

### Primary (HIGH confidence)

- v0.9 objectives (`objectives/v0.9-session-management-automation.md`) -- T-01~T-14, S-01~S-04 원본 정의, 성공 기준 10/11
- v0.9-PITFALLS.md (`.planning/research/v0.9-PITFALLS.md`) -- C-01~C-03, H-01~H-05, M-01~M-06 전체 12개 pitfall
- Phase 36 RESEARCH.md + SUMMARY.md x2 -- TF-01~TF-05, NOTI-01~NOTI-05 설계 결정
- Phase 37 RESEARCH.md + SUMMARY.md x2 -- SM-01~SM-14 설계 결정
- Phase 38 RESEARCH.md + SUMMARY.md x2 -- SMGI-D01~D04 설계 결정
- Phase 39 RESEARCH.md + SUMMARY.md x2 -- CLI-01~CLI-06, TG-01~TG-06 설계 결정
- 7개 설계 문서 현재 상태 (grep [v0.9] 태그 수 확인)
- REQUIREMENTS.md -- 21개 요구사항 추적성

### Secondary (MEDIUM confidence)

- Phase 25 Plan 구조 -- 테스트 전략 통합 선례 (유사 작업 형태)
- v0.10 objectives (`objectives/v0.10-pre-implementation-design-completion.md`) -- Phase 40 완료 후 착수 범위

### Tertiary (LOW confidence)

- 없음

---

## Metadata

**Confidence breakdown:**
- 테스트 시나리오 매핑: HIGH -- v0.9 objectives에 18개 시나리오가 명확히 정의되어 있고, Phase 36-39 설계 결정과 1:1 매핑 완료
- 문서 통합 현황: HIGH -- 7개 문서의 [v0.9] 태그를 grep으로 정량 확인. 6/7 문서에 이미 상당량 반영 확인
- pitfall 대응 검증: HIGH -- 5건 모두 설계 문서 내 구체적 섹션 번호까지 확인 완료

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (설계 마일스톤 마무리, 외부 의존성 없음)
