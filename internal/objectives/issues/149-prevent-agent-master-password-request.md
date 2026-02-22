# #149 에이전트가 마스터 패스워드를 요청하지 못하도록 차단

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** TBD
- **상태:** FIXED

## 현재 상태

- AI 에이전트가 사용자에게 마스터 패스워드를 반복적으로 요청하는 현상 발생
- 마스터 패스워드는 Operator 전용 시크릿으로, 에이전트가 알거나 사용해서는 안 되는 정보
- connect-info / 매직워드 프롬프트에 마스터 패스워드 관련 금지 지시가 없음
- 스킬 파일에 masterAuth 필요 엔드포인트가 에이전트 접근 가능한 형태로 기술됨

## 수정 방향

### A. `buildConnectInfoPrompt()`에 명시적 금지 문구 추가

connect-info(`GET /v1/connect-info`)와 매직워드(`POST /admin/agent-prompt`) 프롬프트는 동일한 `buildConnectInfoPrompt()` 함수를 공유하므로, 이 함수에 금지 문구를 추가하면 양쪽 모두 자동 반영됨.

추가할 지시:

- "마스터 패스워드(X-Master-Password)를 사용자에게 요청하거나 직접 사용하지 마세요"
- "지갑 생성, 세션 발급, 정책 설정 등 관리 작업은 Operator가 Admin UI 또는 CLI로 수행합니다"
- "당신은 세션 토큰(Authorization: Bearer)으로만 동작합니다"

### B. 스킬 파일에서 masterAuth 엔드포인트 분리

에이전트용 스킬 파일에서 masterAuth 필요 엔드포인트를 처리:

1. **제거 대상**: 에이전트가 절대 사용할 수 없는 masterAuth 전용 엔드포인트는 에이전트 스킬에서 제거
   - `POST /v1/wallets` (지갑 생성)
   - `POST /v1/sessions` (세션 발급)
   - 정책 CRUD (`POST/PUT/DELETE /v1/wallets/:id/policies`)
   - Admin 전용 API (`/v1/admin/*`)

2. **경고 표기 대상**: 참조 목적으로 남기되 "Operator only" 경고를 명확히 표기
   - `quickstart.skill.md`의 Step 2 (지갑 생성), Step 3 (세션 생성) 섹션

3. **에이전트 전용 섹션 강화**: sessionAuth로 사용 가능한 작업만 별도 섹션으로 정리
   - 잔액 조회, 자산 조회, 트랜잭션 전송/조회, connect-info

### 수정 대상 파일

- `packages/daemon/src/api/routes/connect-info.ts` — `buildConnectInfoPrompt()`에 금지 문구 추가 (connect-info + 매직워드 모두 반영)
- `skills/quickstart.skill.md` — masterAuth 엔드포인트에 "Operator only" 경고 추가
- `skills/wallet.skill.md` — masterAuth 전용 섹션 분리 또는 제거
- `skills/policies.skill.md` — 에이전트 불가 작업 명시
- `skills/admin.skill.md` — 에이전트 불가 명시 또는 스킬에서 제외

## 테스트 항목

- [ ] connect-info 프롬프트에 마스터 패스워드 금지 지시가 포함되는지 확인
- [ ] 매직워드 프롬프트에도 동일 금지 지시가 포함되는지 확인 (buildConnectInfoPrompt 공유)
- [ ] connect-info 프롬프트에 에이전트 사용 가능 범위(sessionAuth)가 명시되는지 확인
- [ ] 스킬 파일에서 masterAuth 엔드포인트가 "Operator only"로 표기되는지 확인
- [ ] 에이전트가 프롬프트를 읽은 후 마스터 패스워드를 요청하지 않는지 수동 확인
