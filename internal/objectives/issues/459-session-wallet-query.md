# 459 — 세션 토큰으로 GET /v1/wallets, GET /v1/wallets/:id 조회 불가 (masterAuth only)

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-25
- **GitHub:** https://github.com/minhoyoo-iotrust/WAIaaS/issues/278

## 증상

`GET /v1/wallets` 및 `GET /v1/wallets/:id`가 masterAuth만 허용하여, 세션 토큰을 가진 에이전트가 자기 지갑의 구조화된 JSON 정보(id, publicKey, chain, ownerState 등)를 조회할 수 없음.

`connect-info`가 지갑 정보를 텍스트 형태로 제공하지만, SDK에서 프로그래밍적으로 지갑 주소/상태를 조회하려면 구조화된 JSON 응답이 필요함.

## 수정 위치 및 변경 내용

### 1. `packages/daemon/src/api/server.ts` — dual-auth 미들웨어

기존 `/v1/policies` dual-auth 패턴과 동일하게 적용.

**masterAuth 블록 (`/v1/wallets`):**
- `GET` + `Bearer wai_sess_` 토큰이면 masterAuth 스킵 → sessionAuth로 라우팅

**masterAuth 블록 (`/v1/wallets/:id`):**
- 기존 sub-path skip 조건에 `GET` + `Bearer wai_sess_` 조건 추가

**sessionAuth 블록:**
- `GET /v1/wallets` sessionAuth 미들웨어 등록
- `GET /v1/wallets/:id` sessionAuth 미들웨어 등록

### 2. `packages/daemon/src/api/routes/wallets.ts` — 세션 스코프 필터링

**`GET /v1/wallets` 핸들러:**
- `sessionId`가 존재하면 `session_wallets` 테이블로 해당 세션에 연결된 지갑만 필터링하여 반환

**`GET /v1/wallets/:id` 핸들러:**
- `sessionId`가 존재하면 `verifyWalletAccess()`로 해당 세션의 접근 권한 검증

### 보안 고려사항

- masterAuth(관리자): 기존과 동일하게 전체 지갑 조회
- sessionAuth(에이전트): `session_wallets` junction 테이블 기반으로 **자기 세션에 연결된 지갑만** 조회 가능
- POST /v1/wallets (지갑 생성), PUT /v1/wallets/:id/owner (오너 등록)은 masterAuth 유지

## 테스트 항목

1. **단위 테스트**: 세션 토큰으로 `GET /v1/wallets` 호출 시 200 반환 + 세션 연결 지갑만 포함 확인
2. **단위 테스트**: 세션 토큰으로 `GET /v1/wallets/:id` 호출 시 세션에 연결된 지갑이면 200, 아니면 WALLET_ACCESS_DENIED
3. **단위 테스트**: masterAuth로 `GET /v1/wallets` 호출 시 기존과 동일하게 전체 지갑 반환 확인
4. **단위 테스트**: `POST /v1/wallets`는 여전히 masterAuth only 확인
