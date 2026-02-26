# #195 CLI 텔레그램 알림 설정 명령어 추가 (`waiaas notification setup`)

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** OPEN
- **관련:** #101 (Admin 알림 활성화 UX), #088 (알림 활성화 불가)

## 현상

현재 텔레그램 알림을 설정하려면 Admin UI(웹 대시보드) 또는 REST API(curl)를 사용해야 한다. CLI에는 알림 설정 명령어가 없어 터미널에서 직접 설정할 수 없다.

다른 주요 기능(`wallet create`, `mcp setup`, `session prompt`, `owner connect`)은 모두 CLI 명령어를 제공하지만, 알림 설정만 누락되어 있다.

## 개선 방안

### 1. `waiaas notification setup` 명령어 추가

기존 `mcp setup`, `wallet create` 패턴을 따르는 인터랙티브 설정 명령어:

```bash
# 인터랙티브 모드 (프롬프트로 입력)
waiaas notification setup

# 옵션 직접 지정 (스크립트/자동화 용)
waiaas notification setup --bot-token <TOKEN> --chat-id <ID>

# 설정 후 테스트 알림 전송
waiaas notification setup --bot-token <TOKEN> --chat-id <ID> --test
```

### 2. 명령어 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--base-url <url>` | 데몬 base URL | `http://127.0.0.1:3100` |
| `--bot-token <token>` | 텔레그램 봇 토큰 (미지정 시 hidden prompt) | - |
| `--chat-id <id>` | 텔레그램 채팅 ID (미지정 시 visible prompt) | - |
| `--locale <locale>` | 알림 언어 (`en` / `ko`) | `en` |
| `--password <pw>` | 마스터 패스워드 | resolvePassword() |
| `--test` | 설정 후 테스트 알림 전송 | false |

### 3. 실행 흐름

```
1. Health check (GET /health)
2. Resolve master password
3. Collect bot-token (옵션 또는 hidden prompt)
4. Collect chat-id (옵션 또는 visible prompt)
5. Validate locale (en/ko)
6. PUT /v1/admin/settings — 6개 키 동시 업데이트:
   - notifications.enabled = "true"
   - notifications.telegram_bot_token = 토큰
   - notifications.telegram_chat_id = chat ID
   - notifications.locale = locale
   - telegram.bot_token = 토큰 (인터랙티브 봇 겸용)
   - telegram.locale = locale
7. 인터랙티브 모드: "테스트 알림 전송?" 프롬프트
   --test 플래그: 바로 테스트
8. POST /v1/admin/notifications/test → 결과 출력
9. 완료 메시지
```

### 4. 필요한 유틸리티

- `packages/cli/src/utils/prompt.ts` (신규): `promptText()` — 보이는 텍스트 입력 (chat ID용)
- `packages/cli/src/utils/password.ts` (수정): `promptPassword` export 추가 — bot token hidden input에 재사용

## 영향 범위

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| cli | `src/commands/notification-setup.ts` | **신규** — 메인 커맨드 구현 |
| cli | `src/utils/prompt.ts` | **신규** — `promptText()` 유틸리티 |
| cli | `src/utils/password.ts` | `promptPassword` export 추가 (1줄) |
| cli | `src/index.ts` | notification 서브커맨드 그룹 등록 |
| cli | `src/__tests__/notification-setup.test.ts` | **신규** — 테스트 |

## 테스트 항목

- [ ] 모든 옵션 제공 시 성공 플로우 (health → PUT settings → 출력)
- [ ] `--test` 성공 시 테스트 알림 전송 + 성공 메시지
- [ ] `--test` 실패 시 에러 메시지 출력 (process.exit 하지 않음)
- [ ] 인터랙티브 모드: bot-token hidden prompt + chat-id visible prompt 호출
- [ ] PUT 요청 body에 6개 설정 키 포함 확인
- [ ] X-Master-Password 헤더 전송 확인
- [ ] daemon 미접속 시 에러 메시지 + process.exit(1)
- [ ] PUT 401 (잘못된 패스워드) 시 에러 처리
- [ ] 잘못된 locale (en/ko 외) 시 에러 처리
- [ ] 빈 chat-id 입력 시 에러 처리
- [ ] 비인터랙티브 모드(모든 옵션 지정)에서 테스트 프롬프트 미출력 확인
- [ ] `--password` 플래그 사용 시 resolvePassword 미호출 확인
