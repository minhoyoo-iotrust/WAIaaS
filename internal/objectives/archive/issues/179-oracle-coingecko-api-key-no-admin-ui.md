# #179 CoinGecko 가격 오라클 API 키 설정 Admin UI 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** v28.5
- **상태:** FIXED

---

## 증상

Admin UI에서 CoinGecko 가격 오라클 API 키를 설정할 수 있는 화면이 없음.
System 페이지 Oracle 섹션에는 `cross_validation_threshold`만 존재하고 API 키 입력 필드가 없음.

---

## 기대 동작

System > Oracle 섹션 또는 별도 위치에서 CoinGecko API 키를 입력/변경/삭제할 수 있어야 함.
CoinGecko 무료 API는 rate limit이 낮아(분당 10-30회), Pro API 키 등록이 안정적 운영에 필요.

---

## 수정 방안

Oracle 섹션에 CoinGecko API 키 입력 필드 추가. `setting-keys.ts`의 `oracle.coingecko_api_key` (isCredential: true) 활용.

---

## 관련 파일

- `packages/admin/src/pages/system.tsx` — Oracle 섹션
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` — oracle 카테고리 설정 정의

---

## 테스트 항목

- [ ] Oracle 섹션에서 CoinGecko API 키 입력/저장 가능 확인
- [ ] 키 저장 후 마스킹 표시 확인
- [ ] 키 삭제 가능 확인
