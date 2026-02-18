# 마일스톤 m24-01: Admin UI 테스트 커버리지 복원

## 목표

v2.3 Admin UI 메뉴 재구성으로 하락한 커버리지 임계값을 원래 수준(lines/statements 70%, functions 70%)으로 복원하여, CI 커버리지 게이트가 모든 패키지에서 일관된 품질 기준을 유지하는 상태.

> **핵심 원칙**: "새 페이지를 추가하면 테스트도 함께 추가한다." v2.3에서 3개 신규 페이지가 테스트 없이 추가되어 전체 커버리지가 67.42%로 하락. 이를 70%+ 로 복원.

---

## 배경

v2.3(Admin UI 기능별 메뉴 재구성)에서 기존 monolithic Settings 페이지를 7개 개별 페이지로 분리하면서 신규 페이지 3개가 테스트 없이 추가됨:

| 파일 | 현재 커버리지 | 미커버 라인 수 (추정) | 비고 |
|------|-------------|---------------------|------|
| `system.tsx` | 3.85% | ~505 lines | 신규 페이지 — 거의 전체 미커버 |
| `walletconnect.tsx` | 0% | ~288 lines | 신규 페이지 — 완전 미커버 |
| `security.tsx` | 22.19% | ~350 lines | 신규 페이지 — 대부분 미커버 |

추가로 기존 페이지 중 커버리지가 낮은 파일:

| 파일 | 현재 커버리지 | 비고 |
|------|-------------|------|
| `notifications.tsx` | 50.46% | 기존 — 중간 수준 |
| `sessions.tsx` | 55.49% | 기존 — 중간 수준 |
| `wallets.tsx` | 63.42% | 기존 — 개선 여지 |

컴포넌트 중 커버리지가 낮은 파일:

| 파일 | 현재 커버리지 | 비고 |
|------|-------------|------|
| `empty-state.tsx` | 5.88% | 공용 컴포넌트 |
| `typed-dialog.tsx` | 19.56% | 공용 컴포넌트 |
| `settings-search.tsx` | 26.92% | 설정 검색 컴포넌트 |
| `policy-summary.tsx` | 44.03% | 정책 요약 컴포넌트 |
| `dirty-guard.ts` | 23.07% | 유틸리티 |

현재 임계값 (issue #086에서 임시 하향):
- lines: 67, statements: 67, functions: 60, branches: 65

목표 임계값 (복원):
- lines: 70, statements: 70, functions: 70, branches: 65

---

## 산출물

| # | 산출물 | 설명 |
|---|--------|------|
| 1 | `security.test.tsx` | Security 페이지 테스트 — Kill Switch, JWT Rotation, Danger Zone 등 |
| 2 | `system.test.tsx` | System 페이지 테스트 — Daemon, AutoStop, Monitoring, API Keys 등 |
| 3 | `walletconnect.test.tsx` | WalletConnect 페이지 테스트 — 페어링, 세션, 설정 폼 등 |
| 4 | 기존 테스트 보강 | notifications, sessions, wallets 등 기존 테스트 커버리지 개선 |
| 5 | 공용 컴포넌트 테스트 보강 | empty-state, typed-dialog, settings-search, policy-summary, dirty-guard |
| 6 | 임계값 복원 | vitest.config.ts 임계값을 lines/statements/functions 70%로 복원 |

---

## 구현 범위

### Phase 1: 신규 페이지 테스트 (우선순위 최고 — 커버리지 효과 최대)

**system.tsx** (~505 미커버 라인):
- 렌더링 + 탭 네비게이션 테스트
- Daemon 설정 (RPC URL, 포트 등) 폼 제출
- AutoStop 설정 토글 + 저장
- Monitoring 설정 폼
- API Keys CRUD

**security.tsx** (~350 미커버 라인):
- Kill Switch 활성화/비활성화
- JWT Rotation 설정
- Danger Zone 동작 (데이터 초기화 등)
- 입력 검증 + 에러 상태

**walletconnect.tsx** (~288 미커버 라인):
- WalletConnect 설정 폼 (Project ID 입력 등)
- 페어링 목록 렌더링
- 세션 관리 (연결/해제)
- 미설정 상태 안내 UI

### Phase 2: 공용 컴포넌트 + 유틸리티 테스트 보강

- `empty-state.tsx`: 렌더링, CTA 버튼 클릭
- `typed-dialog.tsx`: 열기/닫기, 확인/취소 핸들러
- `settings-search.tsx`: 검색어 입력, 필터링, 결과 하이라이트
- `policy-summary.tsx`: 다양한 정책 타입별 요약 렌더링
- `dirty-guard.ts`: 변경 감지 + 이탈 경고

### Phase 3: 기존 페이지 테스트 개선 + 임계값 복원

- notifications.tsx: 채널별 설정 폼, 테스트 전송 흐름
- sessions.tsx: 세션 목록, 생성/삭제 흐름
- wallets.tsx: 월렛 상세, 네트워크 전환, 잔액 표시
- vitest.config.ts 임계값 복원: lines 70, statements 70, functions 70

---

## 전제 조건

- PR #15 (CI --affected 수정 + 임시 임계값 하향) 머지 완료
- v2.3 Admin UI 코드 안정 상태

---

## 성공 기준

- [ ] Admin 패키지 lines 커버리지 ≥ 70%
- [ ] Admin 패키지 statements 커버리지 ≥ 70%
- [ ] Admin 패키지 functions 커버리지 ≥ 70%
- [ ] vitest.config.ts 임계값이 lines/statements/functions 모두 70%로 복원
- [ ] CI 전체 통과 (lint + typecheck + test:unit + coverage gate)
- [ ] 신규 3개 페이지 (security, system, walletconnect) 각각 테스트 파일 존재

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 테스트 전략 | 렌더링 + 폼 제출 + 에러 상태 중심 | v2.2에서 확립한 패턴 유지. DOM 구조 의존 최소화, 사용자 인터랙션 중심 |
| 2 | 모킹 방식 | 기존 setupMocks 패턴 재사용 | notifications.test.tsx, settings-coverage.test.tsx 등 기존 패턴 일관성 유지 |
| 3 | 커버리지 목표 수준 | 70% (원래 수준 복원) | 75%+ 과도한 목표보다 실용적 70% 유지. branches는 65% 유지 (UI 분기 특성) |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | WalletConnect 모킹 복잡도 | SignClient 등 외부 의존성 모킹 어려움 | 렌더링 + 설정 폼 위주 테스트. SignClient 호출은 모킹으로 대체 |
| 2 | security.tsx Danger Zone 테스트 | 데이터 초기화 등 부작용 있는 동작 테스트 | confirm dialog + API 호출 모킹으로 부작용 격리 |
| 3 | 70% 복원에 필요한 테스트 양 | 예상보다 많은 테스트 필요할 수 있음 | Phase 1 (신규 3페이지)만으로 ~70% 근접 예상. 부족 시 Phase 2/3에서 보충 |

---

*최종 업데이트: 2026-02-18 — CI 커버리지 하락 분석 기반 작성*
