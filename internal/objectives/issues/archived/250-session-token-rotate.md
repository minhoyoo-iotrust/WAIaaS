# #250 세션 토큰 재발급(Rotate) 기능

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-05

## 배경

세션 토큰은 보안상 SHA-256 해시로만 DB에 저장되므로, 생성 시점 이후에는 원본 토큰을 다시 확인할 수 없다. 세션 TTL이 무제한 기본값으로 변경(v29.9)되면서 장기 세션이 늘어났고, 토큰 분실 시 기존 세션을 revoke하고 새로 만들어야 하는 불편이 있다.

## 요구사항

세션의 메타데이터(연결된 지갑, 권한, TTL, usage_stats 등)를 유지하면서 토큰 값만 새로 발급하는 rotate 기능 추가.

### 백엔드

- `POST /v1/sessions/:id/rotate` 엔드포인트 추가
- 새 JWT 토큰 생성 → SHA-256 해시 계산 → DB token_hash 교체 (기존 CAS 패턴 활용)
- 이전 토큰은 즉시 무효화 (해시가 교체되므로 자동으로 인증 실패)
- revoke된 세션은 rotate 불가
- 응답에 새 토큰 원본 포함 (생성 API와 동일한 형태)
- masterAuth 필요

### Admin UI

- 세션 목록 또는 상세에 "Rotate Token" 버튼 추가
- rotate 성공 시 새 토큰을 표시하는 다이얼로그 (클립보드 복사 버튼 포함)
- 다이얼로그 닫기 전 "토큰을 복사했습니까?" 확인
- renew와 구분: renew는 만료 연장, rotate는 토큰 교체

### MCP / SDK

- MCP tool: `session_rotate_token` 추가
- SDK: `rotateSessionToken(sessionId)` 메서드 추가

## 테스트 항목

- [ ] rotate 호출 시 새 토큰 반환, 이전 토큰으로 인증 실패
- [ ] rotate 후 세션 메타데이터(wallets, constraints, usage_stats) 불변 확인
- [ ] revoke된 세션 rotate 시 적절한 에러 반환
- [ ] masterAuth 없이 호출 시 401 반환
- [ ] Admin UI에서 rotate 버튼 → 토큰 다이얼로그 표시 → 복사 동작 확인
