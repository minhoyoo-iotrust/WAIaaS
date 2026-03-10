# 323: Terminated 지갑 하드 삭제(Purge) 기능

- **유형**: ENHANCEMENT
- **심각도**: MEDIUM
- **상태**: OPEN
- **발견일**: 2026-03-10

## 현상

`DELETE /v1/wallets/:id`는 소프트 삭제(`status: 'TERMINATED'`)만 수행하여 DB 레코드가 영구적으로 남는다. UAT 반복 실행, 테스트 환경 정리 등에서 terminated 지갑을 완전히 제거할 방법이 없다.

## 수정 방향

### 1. REST API

- `DELETE /v1/wallets/:id/purge` 엔드포인트 추가 (masterAuth 필수)
- **terminated 상태인 지갑만** purge 허용 — active 지갑 실수 삭제 방지
- 관련 데이터 cascade 삭제: sessions, session_wallets, policies, tx_history, wallet_apps, keystore 등
- 응답: `{ id, status: 'PURGED' }` 또는 204 No Content

### 2. Admin UI

- 지갑 목록에서 terminated 지갑에 "완전 삭제" 버튼 표시
- 확인 다이얼로그: "이 지갑의 모든 데이터(트랜잭션 기록, 세션, 정책 등)가 영구 삭제됩니다. 복구할 수 없습니다."
- 지갑 상세 페이지에도 terminated 상태일 때 purge 액션 노출

### 3. 안전장치

- masterAuth 필수 (sessionAuth로는 purge 불가)
- active/suspended 상태 지갑은 purge 거부 (`WALLET_NOT_TERMINATED` 에러)
- 감사 로그에 purge 이벤트 기록

## 영향 범위

| 파일/영역 | 변경 |
|----------|------|
| `packages/daemon/src/api/routes/wallets.ts` | purge 엔드포인트 추가 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | purge 스키마 추가 |
| `packages/admin/src/pages/wallets/` | purge 버튼 + 확인 다이얼로그 |
| `packages/mcp/src/tools/` | purge_wallet 도구 추가 (선택) |
| `packages/sdk/src/` | purgeWallet() 메서드 추가 (선택) |
| `skills/wallet.skill.md` | purge API 문서 추가 |
| `skills/admin.skill.md` | Admin UI purge 기능 문서 추가 |

## 테스트 항목

- [ ] terminated 지갑 purge 시 DB에서 완전 삭제 확인
- [ ] active 지갑 purge 시도 시 에러 반환 확인
- [ ] cascade 삭제: 관련 sessions, policies, tx_history 등 함께 삭제 확인
- [ ] masterAuth 없이 purge 시도 시 401 반환 확인
- [ ] Admin UI purge 버튼이 terminated 지갑에만 표시되는지 확인
- [ ] Admin UI 확인 다이얼로그 동작 확인
- [ ] 감사 로그에 purge 이벤트 기록 확인
