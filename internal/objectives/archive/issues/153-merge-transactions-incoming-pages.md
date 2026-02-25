# 153 — Admin UI Transactions + Incoming TX 페이지 통합

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** v28.1

## 설명

현재 Admin UI에 `/transactions`(발신 TX 리스트)와 `/incoming`(수신 TX 리스트 + 모니터링 설정)이 별도 페이지로 분리되어 있다. 사용자가 모든 트랜잭션을 한 곳에서 확인할 수 있도록 하나의 Transactions 페이지로 통합한다.

## 현재 동작

- `/transactions` (432줄): 발신 TX 리스트, 6개 필터 (wallet, type, status, network, since, until), 검색, 페이지네이션, 확장 행, 탐색기 링크, USD 표시
- `/incoming` (651줄): 3섹션 구조
  - Section A: 수신 TX 모니터링 설정 (7개 incoming.* 필드)
  - Section B: 지갑별 모니터링 토글 테이블
  - Section C: 수신 TX 리스트, 4개 필터 (wallet, chain, status, suspicious), 페이지네이션, 확장 행

## 기대 동작

### 통합 Transactions 페이지 (2탭)

**Tab 1: "All Transactions"**
- 발신 TX와 수신 TX를 하나의 테이블에서 통합 표시
- **Direction 컬럼** 추가: `Outgoing` / `Incoming` 뱃지로 구분
- **Direction 필터** (All / Outgoing / Incoming):
  - All(기본): 양쪽 API 병렬 호출 → 타임스탬프 정렬 → 통합 표시
  - Outgoing: `/admin/transactions`만 호출
  - Incoming: `/admin/incoming`만 호출
- **통합 컬럼**: Time, Direction, Wallet, Counterparty, Amount, Network, Status, Tx Hash
- **조건부 필터**: Direction에 따라 관련 필터만 표시
  - 공통: Wallet, Network, Since, Until
  - Outgoing/All: Type
  - Incoming/All: Chain, Suspicious
- **확장 행**: direction에 따라 다른 상세 필드 표시
- **"All" 모드 페이지네이션**: 양쪽 API에 같은 offset/limit 적용, 합산 total 표시 (근사치, admin UI에 충분)

**Tab 2: "Monitor Settings"**
- 기존 `/incoming` Section A(설정 7필드) + Section B(지갑별 토글) 이동
- dirty guard 연동 유지

### 네비게이션 변경
- 사이드바에서 "Incoming TX" 메뉴 제거 (10개 → 9개)
- `/incoming` 접속 시 `/transactions`로 리다이렉트
- Settings Search의 incoming 항목 경로 업데이트

## 변경 대상 파일

| 파일 | 작업 |
|------|------|
| `pages/transactions.tsx` | 재작성 — 2탭 구조 + 통합 테이블 |
| `pages/incoming.tsx` | 삭제 |
| `components/layout.tsx` | /incoming 메뉴 제거, 리다이렉트 추가 |
| `utils/settings-search-index.ts` | incoming 7항목 경로 변경 |
| `components/settings-search.tsx` | PAGE_LABELS 업데이트 |
| `__tests__/transactions.test.tsx` | 재작성 — 통합 테스트 |
| `__tests__/incoming.test.tsx` | 삭제 |

모든 파일은 `packages/admin/src/` 기준.

## 구현 핵심 사항

1. **UnifiedTxRow 타입**: 양쪽 응답을 공통 형태로 정규화 (id에 `out-`/`in-` 접두어로 충돌 방지)
2. **백엔드 변경 없음**: 기존 2개 API 유지, 프론트엔드에서 병합
3. **기존 컴포넌트 재사용**: TabNav, FilterBar, SearchInput, Badge, ExplorerLink, Breadcrumb, FormField
4. **notifications.tsx 탭 패턴 참고**: Breadcrumb + TabNav + 조건부 렌더링 + dirty guard

## 테스트 항목

### 단위 테스트

1. **탭 네비게이션**: 2탭 렌더링, 기본 탭 확인, 탭 전환
2. **통합 테이블**: outgoing + incoming 데이터 통합 렌더링
3. **Direction 뱃지**: Outgoing/Incoming 뱃지 정상 표시
4. **Direction 필터**:
   - All 선택 시 양쪽 API 호출 검증
   - Outgoing 선택 시 `/admin/transactions`만 호출 검증
   - Incoming 선택 시 `/admin/incoming`만 호출 검증
5. **조건부 필터**: Direction에 따라 Type/Suspicious 필터 표시/숨김
6. **확장 행**: outgoing/incoming 각각 상세 필드 정상 렌더링
7. **로딩/빈/에러 상태**: 각 상태 정상 렌더링
8. **페이지네이션**: Previous/Next 동작
9. **Monitor Settings 탭**: 설정 필드 7개 렌더링, 지갑 토글, 저장 바
10. **SearchInput**: Direction=incoming 시 숨김 확인
