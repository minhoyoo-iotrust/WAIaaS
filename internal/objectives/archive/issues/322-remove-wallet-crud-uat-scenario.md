# 322: Agent UAT 지갑 CRUD 시나리오 제거

- **유형**: ENHANCEMENT
- **심각도**: LOW
- **상태**: FIXED
- **발견일**: 2026-03-10

## 현상

Agent UAT의 `admin-14` (지갑 CRUD 검증) 시나리오가 테스트 실행 시마다 지갑을 생성하고 terminate한다. 반복 실행 시 terminated 상태의 지갑이 DB에 누적되어 지갑 목록이 지저분해진다.

## 원인

지갑 CRUD 검증 시나리오(`agent-uat/admin/wallet-crud.md`)가 매 실행마다 EVM + Solana 테스트 지갑을 CREATE → DELETE 하는 구조. DELETE(terminate)는 소프트 삭제이므로 DB에 terminated 레코드가 남는다.

## 수정 방향

1. `agent-uat/admin/wallet-crud.md` 시나리오 파일 삭제
2. `agent-uat/_index.md`에서 admin-14 항목 제거
3. Admin 카테고리 Count: 14 → 13
4. Network Index, Quick Filters에서 admin-14 참조 제거

## 영향 범위

| 파일 | 변경 |
|------|------|
| `agent-uat/admin/wallet-crud.md` | 삭제 |
| `agent-uat/_index.md` | admin-14 제거, 카운트 갱신 |

## 테스트 항목

- [ ] `agent-uat/_index.md`에 admin-14 참조 없음 확인
- [ ] `agent-uat/admin/wallet-crud.md` 파일 부재 확인
- [ ] CI 검증 스크립트(`scripts/ci/validate-uat-scenarios.sh` 등)에서 오류 없음 확인
