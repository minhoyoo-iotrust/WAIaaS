# 192 — 세션 토큰 영구 만료 시 에이전트 자력 복구 불가

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** —

## 현상

세션이 영구 만료되면(갱신 한도 초과, 절대 수명 초과) MCP recovery loop이 60초마다 토큰 파일을 폴링하면서 누군가 새 토큰을 넣어주기만 기다림. 에이전트가 스스로 해결할 방법이 없어 사용자가 수동으로 개입해야 함.

## 현재 상태

### MCP 에이전트 — 자동 갱신 구현됨 (정상 만료 전)
- TTL의 60%에 자동 갱신 스케줄링
- 실패 시 exponential backoff (1s→2s→4s, 최대 3회)
- 만료 시 60초 간격 recovery polling (토큰 파일 감시)
- 파일 기반 토큰 조율 (multi-process safe)

### SDK — 자동 갱신 없음
- `client.renewSession()` 수동 호출 필요
- 만료되면 `TOKEN_EXPIRED` (401) 에러만 반환
- 소비자가 직접 retry/renewal 로직 구현해야 함

### 갱신 안전장치 (5단계)
1. 갱신 횟수 제한 (기본 12회)
2. 절대 수명 제한 (기본 1년)
3. TTL의 50% 이전 갱신 차단
4. CAS 가드 (token hash 일치)
5. 세션 존재/유효성 확인

## 문제점

영구 만료(갱신 한도 초과 또는 절대 수명 초과) 시 에이전트가 새 세션을 스스로 발급받을 방법이 없음:
- MCP recovery loop은 토큰 파일에 새 토큰이 들어오기만 기다림
- SDK는 401 에러를 반환할 뿐 복구 경로 없음
- `waiaas session prompt` CLI 명령어가 존재하지만 에이전트가 활용하는 프로세스 미정의

## 제안

### 세션 복구 스킬 파일 신규 작성

에이전트가 `TOKEN_EXPIRED` 에러를 감지했을 때 사용자에게 마스터 패스워드 입력을 안내하고, `waiaas session prompt` CLI 명령어를 통해 새 세션을 발급받는 복구 프로세스를 스킬로 정의:

1. **감지**: 에이전트가 401 `TOKEN_EXPIRED` 응답 수신
2. **안내**: 사용자에게 세션 만료 상황 설명 + 복구 절차 안내
3. **실행**: `waiaas session prompt` 실행 유도 (사용자가 마스터 패스워드 입력)
4. **적용**: 새 토큰을 환경변수 또는 토큰 파일에 설정
5. **확인**: 복구 후 정상 동작 검증

### 구현 범위

- `skills/session-recovery.skill.md` — 세션 복구 프로세스 스킬 파일 신규 작성
- 기존 `skills/admin.skill.md` 또는 `skills/quickstart.skill.md`에 복구 참조 추가
- MCP `connect-info` 프롬프트에 세션 만료 시 복구 안내 포함 검토

## 영향 범위

- `skills/` — 신규 스킬 파일 또는 기존 스킬 파일 갱신
- `packages/mcp/` — connect-info 프롬프트 갱신 검토
- `packages/daemon/` — 세션 만료 응답에 복구 힌트 추가 검토

## 테스트 항목

- [ ] 세션 만료 시 에이전트가 스킬에 정의된 복구 절차를 따르는지 확인
- [ ] `waiaas session prompt`로 새 토큰 발급 후 에이전트 정상 동작 확인
- [ ] 스킬 파일에 마스터 패스워드 요청 금지 안내 포함 확인
- [ ] MCP 에이전트 recovery loop이 새 토큰 파일 감지 후 정상 복구 확인
