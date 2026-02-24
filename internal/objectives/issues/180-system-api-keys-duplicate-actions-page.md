# #180 System 페이지 API Keys 섹션이 Actions 페이지와 중복

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v28.5
- **상태:** OPEN

---

## 증상

System 페이지에 "API Keys — Manage API keys for Action Providers" 섹션이 있지만,
동일한 기능이 Actions 페이지에서도 제공됨. 사용자 입장에서:

1. 같은 키를 두 곳에서 설정 가능 → 혼동
2. Actions 페이지가 더 직관적인 위치 (프로바이더별 활성화 + 키 설정이 한곳에)
3. System 페이지 API Keys에는 액션 프로바이더 키만 표시되어 "API Keys"라는 범용 제목과 불일치

---

## 수정 방안

System 페이지에서 액션 프로바이더 API Keys 섹션을 제거하고 Actions 페이지로 단일화.
Oracle API 키(#179)는 System > Oracle 섹션에 직접 배치.

---

## 관련 파일

- `packages/admin/src/pages/system.tsx` — ApiKeysSection 컴포넌트
- `packages/admin/src/pages/actions.tsx` — 프로바이더별 API 키 관리

## 관련 이슈

- #179: CoinGecko 오라클 API 키 설정 UI 누락

---

## 테스트 항목

- [ ] System 페이지에서 API Keys 섹션 제거 후 빌드 성공 확인
- [ ] Actions 페이지에서 모든 프로바이더 API 키 관리 정상 동작 확인
