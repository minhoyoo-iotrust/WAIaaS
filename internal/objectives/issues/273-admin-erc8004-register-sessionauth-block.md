# 273 — Admin UI ERC-8004 에이전트 등록 시 sessionAuth 인증 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-07

## 증상

Admin UI의 ERC-8004 Agent Identity 페이지에서 "Register Agent" 버튼 클릭 시 에러 토스트만 표시되고 등록이 진행되지 않음.

## 원인 분석

Admin UI가 `POST /v1/actions/providers/erc8004_agent/register_agent`를 호출하지만, 이 경로는 `sessionAuth`만 허용함.

**인증 미들웨어 흐름 (`server.ts`):**

1. **sessionAuth 블록 (line 278-285):** `POST /v1/actions/*`에 대해 무조건 `sessionAuth` 적용
2. **masterAuth 블록 (line 376-388):** `GET /v1/actions/providers`만 masterAuth 허용, POST는 통과

Admin UI는 `X-Master-Password` 헤더로 masterAuth를 사용하므로 sessionAuth에서 401 발생.

**추가 문제 — `resolveWalletId` 세션 의존:**

`POST /v1/actions/:provider/:action` 핸들러 내부의 `resolveWalletId()` (line 241)가 `sessionId`를 필수로 요구하며, `session_wallets` 테이블에서 접근 권한을 검증함. masterAuth 컨텍스트에는 sessionId가 없으므로 인증만 통과해도 walletId 해석에서 실패함.

## 영향 범위

- Admin UI에서 ERC-8004 관련 모든 액션 실행 불가:
  - `register_agent` (에이전트 등록)
  - `set_agent_wallet` (지갑 연결)
  - `unset_agent_wallet` (지갑 연결 해제)
- 동일 패턴의 다른 Admin UI 액션 호출도 동일 문제 (현재는 ERC-8004만 Admin에서 액션 직접 호출)

## 해결 방안

### 방안 A: Admin 전용 액션 실행 엔드포인트 신설 (권장)

`POST /v1/admin/actions/:provider/:action` 경로를 별도 생성하여 masterAuth 전용으로 운영.

- masterAuth 미들웨어 적용
- `resolveWalletId` 대신 `body.walletId`를 직접 사용 (세션 접근 권한 검증 불필요 — 어드민은 전체 지갑 접근 가능)
- `sessionId`는 `null`로 전달 (어드민 컨텍스트 표시)
- 기존 `POST /v1/actions/:provider/:action`는 sessionAuth 전용으로 유지하여 에이전트 세션 보안 모델 보존

**장점:** 세션 인증 모델을 훼손하지 않음, 관심사 분리 명확
**단점:** 라우트 코드 일부 중복 (공통 파이프라인 로직은 함수 추출로 해결)

### 방안 B: 기존 경로에 dual-auth 추가

`POST /v1/actions/*`에 masterAuth를 dual-auth로 추가하고, `resolveWalletId`에 어드민 컨텍스트 분기 추가.

- X-Master-Password 헤더 감지 시 masterAuth 적용 + `adminContext` 플래그 설정
- `resolveWalletId`에서 adminContext일 때 session_wallets 검증 스킵, body.walletId 직접 사용
- sessionId는 `undefined`로 설정

**장점:** 코드 변경 최소
**단점:** resolveWalletId에 인증 방식 분기가 침투하여 결합도 증가, 기존 세션 보안 가드에 예외 경로 생성

### 방안 C: Admin UI에서 세션 생성 후 호출

Admin UI가 임시 세션을 생성하여 세션 토큰으로 액션을 호출.

**장점:** 기존 인증 모델 완전 보존
**단점:** UX 복잡도 증가, 불필요한 세션 생성, Admin이 자기 자신에게 세션을 발급하는 모순

## 테스트 항목

1. **인증 테스트:** Admin UI(masterAuth)에서 `POST /v1/admin/actions/erc8004_agent/register_agent` 호출 시 201 응답 확인
2. **권한 분리 테스트:** 세션 토큰으로 `POST /v1/admin/actions/*` 접근 시 401 거부 확인
3. **walletId 해석 테스트:** body.walletId로 전달된 지갑이 정상 조회되는지 확인
4. **파이프라인 통합 테스트:** 어드민 액션 실행 후 트랜잭션 상태가 PENDING → pipeline 진행 확인
5. **기존 경로 회귀 테스트:** `POST /v1/actions/*` sessionAuth 경로가 변경 없이 동작하는지 확인
6. **Admin UI E2E 테스트:** Register Agent 모달에서 등록 완료 후 테이블에 REGISTERED 상태 표시 확인
