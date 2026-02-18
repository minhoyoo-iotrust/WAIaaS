# 마일스톤 m22: 테스트 커버리지 강화

## 목표

v1.7에서 설정한 커버리지 임계값을 모든 패키지에서 실제로 달성하는 상태. 임시 하향한 임계값을 원래 수준으로 복원하고, 전체 패키지의 커버리지 품질을 균일하게 유지한다.

---

## 배경

v1.7 Phase 151에서 8개 패키지에 커버리지 임계값을 일괄 설정했으나, 일부 패키지에서 실제 커버리지가 목표에 미달. `--affected` CI 모드에서 미변경 패키지는 테스트가 미실행되어 발견되지 않았음.

| 이슈 | 패키지 | 항목 | 목표 | 실제 | 임시 조정 |
|------|--------|------|------|------|----------|
| #060 | adapter-solana | branches | 75% | 68.29% | → 65% |
| #061 | admin | functions | 70% | 58.48% | → 55% |
| #062 | cli | lines | 70% | 68.49% | → 65% |
| #062 | cli | statements | 70% | 68.49% | → 65% |

### 현재 베이스라인 (2026-02-18 측정)

| 패키지 | Stmts | Branch | Funcs | Lines | 대상 항목 갭 |
|--------|-------|--------|-------|-------|-------------|
| adapter-solana | 90.11% | **68.29%** | 97.5% | 90.11% | branches +6.71pp |
| admin | 71.8% | 69.35% | **57.95%** | 71.8% | functions +12.05pp |
| cli | **68.09%** | 81.16% | 97.05% | **68.09%** | lines/stmts +1.91pp |

---

## 산출물

### 1. adapter-solana 브랜치 커버리지 75% 이상 달성

현재 미커버 78개 브랜치(246개 중 168개 커버) 중 최소 17개 이상 추가 커버 필요.

| 우선순위 | 영역 | 미커버 | 설명 |
|---------|------|--------|------|
| P1 | `convertBatchInstruction()` | ~12 | 4가지 instruction 타입(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE) 분기 |
| P2 | `signExternalTransaction()` | ~8 | Base64 디코딩 실패, 키 길이 판별(32 vs 64), 서명자 검증 |
| P3 | `tx-parser.ts` | ~15 | 파싱 실패, unknown 명령어, null coalescing fallback |
| P4 | Error instanceof 분기 | ~30 | 모든 메서드의 `instanceof WAIaaSError`/`instanceof Error` false 분기 |
| P5 | 기타 | ~13 | getAssets 정렬, estimateFee 토큰/네이티브 분기 등 |

### 2. admin functions 커버리지 70% 이상 달성

현재 57.95%에서 70%로 올리기 위해 미커버 함수에 대한 테스트 추가 필요. 총 88개 함수 중 51개 커버, 최소 11개 추가 필요.

| 우선순위 | 영역 | funcs% | 미커버 함수 수 | 설명 |
|---------|------|--------|--------------|------|
| P1 | `settings.tsx` | 50.79% | ~31개 중 ~15 | RPC 테스트, 네트워크 RPC URL, API 키, 모니터링 간격 등 핸들러 |
| P2 | `wallets.tsx` | 50% | ~18개 중 ~9 | 네트워크 추가/제거, WC 페어링, Owner 등록/검증, Withdraw |
| P3 | `dashboard.tsx` | 50% | ~6개 중 ~3 | 리프레시, 킬스위치 토글, 상태 폴링 |
| P4 | `policies.tsx` | 64.86% | ~37개 중 ~13 | 정책 재정렬, 삭제 확인, 필터링 |
| P5 | 컴포넌트 0% 그룹 | 0% | ~8 | `client.ts`(7), `layout.tsx`(3), `toast.tsx`(2), `copy-button.tsx`(1), `walletconnect.tsx`(5) |
| P6 | 폼 컴포넌트 | 0~37.5% | ~12 | `approved-spenders-form`(0%), `approve-amount-limit-form`(0%), `allowed-networks-form`(20%), `contract-whitelist-form`(20%), `currency-select`(25%) |
| P7 | `notifications.tsx` | 68.75% | ~16개 중 ~5 | 채널별 테스트 발송, 로그 필터링 |

### 3. cli lines/statements 커버리지 70% 이상 달성

현재 68.09%에서 70%로 올리기 위해 미커버 라인에 대한 테스트 추가 필요. 갭이 1.91pp로 작으나, 0% 파일 2개가 주 원인.

| 우선순위 | 파일 | lines% | 미커버 LOC | 설명 |
|---------|------|--------|----------|------|
| P1 | `commands/owner.ts` | 0% | 227 | WalletConnect 연결/해제/상태 — E2E만 존재, 단위 테스트 없음 |
| P2 | `commands/wallet.ts` | 0% | 173 | 월렛 상세 조회 + 기본 네트워크 변경 — E2E만 존재, 단위 테스트 없음 |
| P3 | `utils/password.ts` | 31.7% | ~44 | stdin 프롬프트 경로, 파일 읽기 경로 미커버 |

> owner.ts + wallet.ts 400 라인 중 일부만 커버해도 70% 달성 가능 (현재 대비 ~38 라인 추가 커버 필요).

### 4. 전체 패키지 커버리지 임계값 검증

모든 패키지의 vitest.config.ts 임계값이 실제 커버리지와 일치하는지 점검하고, 불일치 항목 식별.

> **범위 제한**: 3개 대상 패키지(adapter-solana, admin, cli) 외 추가 불일치가 발견되면 별도 이슈로 분리한다. 이 마일스톤의 범위는 기존 이슈 #060~#062의 해소로 한정한다.

### 5. 임계값 복원

- adapter-solana `branches`: 65 → 75
- admin `functions`: 55 → 70
- cli `lines`: 65 → 70
- cli `statements`: 65 → 70

---

## 성공 기준

- [ ] adapter-solana 브랜치 커버리지 ≥ 75%
- [ ] admin functions 커버리지 ≥ 70%
- [ ] cli lines/statements 커버리지 ≥ 70%
- [ ] 모든 패키지 CI 커버리지 체크 통과
- [ ] 임시 하향한 임계값이 원래 수준으로 복원됨
- [ ] 3개 대상 패키지 외 추가 불일치 발견 시 이슈 등록 완료
