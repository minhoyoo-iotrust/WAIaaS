# #151 — CLI에서 에이전트 프롬프트(매직워드) 생성 명령어 추가

- **Type:** ENHANCEMENT
- **Severity:** MEDIUM
- **Found in:** v27.3
- **Status:** FIXED

## 현상

에이전트 연결용 프롬프트(매직워드)를 생성하려면 Admin UI를 열거나 `curl`로 `POST /v1/admin/agent-prompt`를 직접 호출해야 한다. CLI 명령어가 없어 터미널 워크플로우에서 불편하다.

## 기대 동작

```
waiaas session prompt [--wallet <id>] [--expires-in <seconds>] [--password <pw>]
```

- `--wallet <id>`: 특정 지갑만 포함 (생략 시 전체 ACTIVE 지갑)
- `--expires-in <seconds>`: 세션 유효 시간 (기본 86400 = 24시간)
- `--password <pw>`: 마스터 패스워드 (생략 시 프롬프트 입력)
- 기존 `POST /v1/admin/agent-prompt` API를 호출하여 Admin UI와 동일 로직 (세션 재사용 포함)
- 출력: 에이전트에게 전달할 프롬프트 텍스트

### 엣지 케이스

- **ACTIVE 지갑 0개**: API가 빈 프롬프트를 반환(`walletCount: 0`). CLI는 "No active wallets found. Create a wallet first with `waiaas quickset`." 안내 메시지 출력 후 exit code 1.
- **지정한 `--wallet` ID가 존재하지 않거나 ACTIVE가 아닌 경우**: 동일하게 walletCount 0 → 안내 메시지 출력.
- **데몬 미실행**: 연결 실패 시 "Daemon is not running. Start it with `waiaas start`." 에러 메시지 출력.

## 수정 범위

- `packages/cli/src/index.ts` — `session` 서브커맨드 그룹 + `prompt` 명령어 등록, 상단 주석 업데이트
- `packages/cli/src/commands/session.ts` — 신규: API 호출 + 출력 포맷팅 + 엣지 케이스 처리

## 테스트 항목

1. `waiaas session prompt` 실행 시 전체 ACTIVE 지갑 포함 프롬프트 출력 확인
2. `--wallet <id>` 옵션으로 특정 지갑만 포함 확인
3. `--expires-in` 옵션 반영 확인
4. 기존 세션 재사용 시 `sessionReused: true` 동작 확인
5. ACTIVE 지갑 0개 시 안내 메시지 + exit code 1 확인
6. 데몬 미실행 시 적절한 에러 메시지 출력 확인
