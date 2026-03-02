# #220 Push Relay 서버 버전 정보 노출 수단 없음

- **유형:** MISSING
- **심각도:** LOW
- **마일스톤:** TBD
- **상태:** OPEN
- **생성일:** 2026-03-02

## 현상

Push Relay 서버(`@waiaas/push-relay`)는 런타임에 버전 정보를 확인할 수 있는 수단이 전혀 없다:

| 방법 | 지원 여부 |
|------|----------|
| `GET /health` 응답에 `version` 필드 | 없음 — status, ntfy, push, devices만 반환 |
| `GET /version` 전용 엔드포인트 | 없음 |
| `--version` CLI 플래그 | 없음 — `bin.ts`에 `process.argv` 파싱 없음 |
| 시작 로그에 버전 출력 | 없음 |
| 런타임 `package.json` 읽기 | 없음 |

`package.json`에 `"version": "2.9.0-rc.6"`이 존재하지만 런타임에서 이를 읽거나 노출하는 코드가 없어, 실행 중인 서버의 버전을 원격으로 확인할 수 없다.

## 원인

Push Relay 서버 구현 시 버전 노출 기능이 설계에 포함되지 않았음.

## 기대 동작

실행 중인 Push Relay 서버의 버전을 최소 2가지 방법으로 확인할 수 있어야 한다:

1. **`GET /health` 응답에 `version` 필드 추가** — 기존 health 엔드포인트 확장
   ```json
   {
     "status": "ok",
     "version": "2.9.0-rc.6",
     "ntfy": { "connected": true, "topics": 3 },
     "push": { "provider": "pushwoosh", "configured": true },
     "devices": 5
   }
   ```

2. **시작 로그에 버전 포함** — `[push-relay] Server listening on 0.0.0.0:3100` → `[push-relay] v2.9.0-rc.6 listening on 0.0.0.0:3100`

3. **(선택) `--version` CLI 플래그** — `process.argv`에 `--version` 있으면 버전 출력 후 종료

## 수정 방안

- `bin.ts`에서 `createRequire(import.meta.url)('./package.json')` 또는 빌드 시 버전 상수 주입으로 런타임 버전 획득
- `GET /health` 응답 스키마에 `version: string` 필드 추가
- 시작 로그 메시지에 버전 문자열 포함
- (선택) `process.argv.includes('--version')` 체크 추가

## 테스트 항목

- [ ] `GET /health` 응답에 `version` 필드가 존재하고 `package.json` 버전과 일치하는지 검증
- [ ] 서버 시작 로그에 버전 문자열이 포함되는지 검증
- [ ] (선택) `--version` 플래그 실행 시 버전 출력 후 프로세스 종료 검증
