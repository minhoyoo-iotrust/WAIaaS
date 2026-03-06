# 253 — Push Relay 서버 --debug 모드 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **마일스톤:** —

## 현상

Push Relay 서버에 디버그 로깅 모드가 없어 운영 중 문제(401 인증 실패, CORS 차단, SSE 연결 실패 등) 발생 시 원인 파악이 어려움. 현재 `console.log`로 고정된 로그만 출력되며, 로그 레벨 제어나 `--debug` 플래그가 존재하지 않음.

## 원인

Push Relay 서버(`packages/push-relay`)에 로그 레벨 시스템이 미구현. 모든 로그가 `console.log`/`console.error` 직접 호출로 고정되어 있음.

## 수정 방안

1. **로거 유틸리티 추가** (`src/logger.ts`)
   - `info()`, `error()`, `debug()` 함수 제공
   - `debug()`는 디버그 모드 활성 시에만 출력
   - `setDebug(enabled)` / `isDebug()` 전역 제어

2. **활성화 방법** (CLI 플래그 + 환경변수)
   - `--debug` CLI 플래그
   - `DEBUG=1` 환경변수
   - 둘 중 하나라도 설정되면 디버그 모드 활성

3. **디버그 로그 추가 대상**
   - `middleware/api-key-auth.ts` — 헤더 존재 여부, 키 앞 4자리 비교 결과
   - `registry/device-routes.ts` — 요청 바디, 등록/삭제 결과
   - `relay/sign-response-routes.ts` — 릴레이 요청/응답 상세
   - `subscriber/ntfy-subscriber.ts` — SSE 연결/재연결, 메시지 파싱 상세
   - `server.ts` — 인바운드 HTTP 요청 메서드/경로/헤더
   - `bin.ts` — 설정 값 덤프, 디바이스 DB 복원 상세

4. **기존 `console.log` → 로거 함수 전환**
   - 기존 로그는 `info()` / `error()`로 전환
   - 신규 상세 로그는 `debug()`로 추가

## 영향 범위

- `packages/push-relay/src/` 내 7~8개 파일 수정
- 신규 파일: `src/logger.ts` 1개
- 기존 동작 변경 없음 (--debug 미사용 시 기존과 동일)

## 테스트 항목

- [ ] `--debug` 플래그로 시작 시 `[DEBUG]` 접두사 로그 출력 확인
- [ ] `DEBUG=1` 환경변수로 시작 시 동일 동작 확인
- [ ] 플래그/환경변수 미설정 시 디버그 로그 미출력 확인
- [ ] API 인증 실패 시 디버그 로그에 헤더 정보 출력 확인
- [ ] SSE 연결/재연결 시 디버그 로그 출력 확인
- [ ] `--version` 플래그 기존 동작 유지 확인
