# #378 — Agent UAT admin-ops 카테고리 신설 + 시나리오 재배치

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **카테고리:** agent-uat

## 설명

### 1. admin-ops 카테고리 신설

Admin Settings 활성화(masterAuth)가 선행 조건인 시나리오를 위한 `admin-ops` 카테고리를 신설한다. 기존 카테고리에 흩어져 있던 "Admin 설정 + 세션 실행" 혼합 시나리오를 모은다.

**카테고리 특성:**
- `auth`: master + session (Admin 설정 선행 후 세션으로 기능 검증)
- 기존 `admin`: Admin UI 자체 기능 검증 (masterAuth only)
- 신설 `admin-ops`: 운영 기능 활성화 + 에이전트 관점 검증 (masterAuth + sessionAuth)

### 2. 시나리오 이동

| 원본 | 대상 | 제목 | 변경 사항 |
|------|------|------|-----------|
| testnet-07 | admin-ops-01 | 수신 트랜잭션 감지 | 카테고리 이동, ID 변경. 네트워크 유지 (ethereum-sepolia, solana-devnet) |
| advanced-05 | admin-ops-02 | 잔액 모니터링 | 카테고리 이동, ID 변경. 네트워크를 테스트넷으로 변경 (ethereum-sepolia, solana-devnet). 비용 $0.50→$0.01, 리스크 medium→low |

### 3. advanced-04 (Mainnet 수신 TX 감지) 제거

`advanced-04`는 `testnet-07`(→admin-ops-01)과 동일한 기능을 동일한 패턴(자기전송→감지확인→알림→감사로그)으로 검증한다. 네트워크만 다르고 스텝 구조가 완전히 동일하므로 중복 제거한다.

## 영향 범위

- `agent-uat/admin-ops/` 디렉토리 신설
- `agent-uat/testnet/incoming-tx.md` → `agent-uat/admin-ops/incoming-tx.md` (ID: testnet-07 → admin-ops-01)
- `agent-uat/advanced/balance-monitoring.md` → `agent-uat/admin-ops/balance-monitoring.md` (ID: advanced-05 → admin-ops-02, 네트워크 테스트넷 변경)
- `agent-uat/advanced/incoming-tx-mainnet.md` — 삭제
- `agent-uat/_index.md` — admin-ops 카테고리 추가, testnet/advanced에서 제거, Summary 업데이트
- testnet 카테고리 ID 리넘버링: testnet-01~06 (7→6개)
- advanced 카테고리 ID 리넘버링: advanced-01,02,03,06,07,08 → advanced-01~06 (8→6개, #377 반영 시 5개)
- 총 시나리오 수: 47 → 46 (advanced-04 제거). #377 반영 시 45

## 테스트 항목

- [ ] `agent-uat/admin-ops/` 디렉토리 생성
- [ ] `incoming-tx.md` 이동 및 ID/카테고리 frontmatter 수정
- [ ] `balance-monitoring.md` 이동 및 ID/카테고리/네트워크/비용/리스크 수정
- [ ] `incoming-tx-mainnet.md` 삭제
- [ ] advanced 카테고리 ID 리넘버링
- [ ] testnet 카테고리 ID 리넘버링 (불필요 시 6개 유지)
- [ ] `_index.md` Summary/Categories/Network Index/Quick Filters 업데이트
- [ ] `verify-agent-uat-index.ts` 통과
- [ ] `verify-agent-uat-format.ts` 통과
- [ ] `verify-agent-uat-provider-map.ts` 통과
