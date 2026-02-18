# Requirements: WAIaaS v2.2 테스트 커버리지 강화

**Defined:** 2026-02-18
**Core Value:** 임시 하향한 커버리지 임계값을 원래 수준으로 복원하고, 전체 패키지의 커버리지 품질을 균일하게 유지한다.

## v2.2 Requirements

### adapter-solana 브랜치 커버리지 (이슈 #060)

- [ ] **SOL-01**: convertBatchInstruction() 4가지 instruction 타입 분기 테스트 추가 (~12 브랜치)
- [ ] **SOL-02**: signExternalTransaction() Base64 디코딩 실패, 키 길이 판별, 서명자 검증 분기 테스트 추가 (~8 브랜치)
- [ ] **SOL-03**: tx-parser.ts 파싱 실패, unknown 명령어, null coalescing fallback 분기 테스트 추가 (~15 브랜치)
- [ ] **SOL-04**: Error instanceof 분기 + 기타(getAssets 정렬, estimateFee 토큰/네이티브) 테스트 추가 (~43 브랜치)

### admin functions 커버리지 (이슈 #061)

- [ ] **ADM-01**: settings.tsx 미커버 함수 테스트 추가 (RPC 테스트, 네트워크 RPC URL, API 키, 모니터링 간격 등 ~15 함수)
- [ ] **ADM-02**: wallets.tsx + dashboard.tsx 미커버 함수 테스트 추가 (네트워크 추가/제거, WC 페어링, Owner, 리프레시, 킬스위치 등 ~12 함수)
- [ ] **ADM-03**: policies.tsx + notifications.tsx 미커버 함수 테스트 추가 (정책 재정렬, 삭제 확인, 필터링, 채널별 테스트 발송 등 ~18 함수)
- [ ] **ADM-04**: 0% 그룹(client.ts, layout.tsx, toast.tsx, copy-button.tsx, walletconnect.tsx) + 폼 컴포넌트 미커버 함수 테스트 추가 (~20 함수)

### cli lines/statements 커버리지 (이슈 #062)

- [ ] **CLI-01**: commands/owner.ts 단위 테스트 추가 (WalletConnect 연결/해제/상태, ~227 라인)
- [ ] **CLI-02**: commands/wallet.ts + utils/password.ts 단위 테스트 추가 (월렛 상세 조회, 기본 네트워크 변경, stdin/파일 프롬프트, ~217 라인)

### 검증 및 복원

- [ ] **GATE-01**: 전체 패키지 vitest.config.ts 임계값 검증 + 임시 하향 임계값 원래 수준으로 복원 (adapter-solana branches 65→75, admin functions 55→70, cli lines 65→70, cli statements 65→70)

## Future Requirements

없음 — 이 마일스톤은 기존 이슈 #060~#062의 해소로 범위가 한정된다.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 3개 대상 패키지 외 커버리지 개선 | 추가 불일치 발견 시 별도 이슈로 분리 |
| 새로운 기능 추가 | 테스트 전용 마일스톤 |
| 테스트 프레임워크 변경 | 기존 Vitest 유지 |
| E2E 테스트 추가 | 단위 테스트 커버리지 개선에 집중 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SOL-01 | — | Pending |
| SOL-02 | — | Pending |
| SOL-03 | — | Pending |
| SOL-04 | — | Pending |
| ADM-01 | — | Pending |
| ADM-02 | — | Pending |
| ADM-03 | — | Pending |
| ADM-04 | — | Pending |
| CLI-01 | — | Pending |
| CLI-02 | — | Pending |
| GATE-01 | — | Pending |

**Coverage:**
- v2.2 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
