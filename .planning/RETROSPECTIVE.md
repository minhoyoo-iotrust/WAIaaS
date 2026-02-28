# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v29.5 — 내부 일관성 정리

**Shipped:** 2026-02-28
**Phases:** 3 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- API 키 이중 저장소 해소: ApiKeyStore 완전 제거, SettingsService SSoT 통합, DB migration v28 (api_keys→settings)
- Solana 네트워크 ID 전 스택 통일: `solana-mainnet` 형식, DB migration v29 (6 테이블 12-step recreation), 레거시 자동 변환
- Push Relay 서명 응답 릴레이: POST /v1/sign-response 엔드포인트 + sendViaRelay() SDK 함수
- normalizeNetworkInput() + NetworkTypeEnumWithLegacy Zod preprocess 하위 호환 레이어

### What Worked
- Issue-driven milestone: #214/#211/#215 세 가지 구체적 이슈에 집중하여 스코프가 명확했음
- DB migration 순서 결정(v28→v29)을 사전에 확정하여 충돌 없이 순차 적용
- Audit 선행으로 skills 파일 네트워크 예시 오류 2건 사전 수정
- 156 파일 변경에도 불구하고 5,595+ 전체 테스트 PASS — 기존 테스트 인프라의 가치 확인

### What Was Inefficient
- Phase 287 (Push Relay)은 quick task로 처리되어 phase directory/SUMMARY.md 없음 — gsd-tools roadmap analyze에서 누락
- REQUIREMENTS.md traceability 상태가 Pending으로 유지됨 (audit에서는 satisfied 확인) — 자동 업데이트 미구현

### Patterns Established
- config.toml 키 유지 + 런타임 양방향 매핑(`rpcConfigKey`/`configKeyToNetwork`) — 네이밍 변경 시 config 호환 패턴
- Zod preprocess + normalizer 조합으로 API 하위 호환 레이어 구축

### Key Lessons
1. 내부 일관성 마일스톤은 기능 추가보다 파일 변경이 광범위하지만 오래 끌리지 않음 — 1일 완료
2. 이중 저장소 문제는 발견 즉시 SSoT 통합이 최선 — dual-write나 sync보다 단일 저장소 전환
3. 네트워크 ID 리네이밍은 DB migration + Zod preprocess + config 매핑 3-layer로 하위 호환 확보 가능

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 156 파일 변경, 순 삭제(-1,220 > +3,990 중 상당수 테스트 업데이트) — 정리 마일스톤 특성

---

## Milestone: v29.0 — 고급 DeFi 프로토콜 설계

**Shipped:** 2026-02-26
**Phases:** 6 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- defi_positions 통합 테이블 + PositionTracker 차등 폴링 + REST API + Admin 와이어프레임
- IDeFiMonitor 공통 프레임워크 + 3개 모니터(HealthFactor/Maturity/Margin) + 4 알림 이벤트
- ILendingProvider + IYieldProvider + IPerpProvider 3개 프레임워크 + 프로토콜 매핑(Aave/Kamino/Morpho/Pendle/Drift)
- SignableOrder EIP-712 Intent 서명 패턴 + 10-step 파이프라인 + 4-layer 보안 모델
- m29-00 설계 문서 26개 섹션, 59 설계 결정

### What Worked
- 인프라-우선 순서(positions → monitoring → frameworks → intent)로 의존성 자연 해소
- 6 phases 전체를 1 세션에 완료 — 설계 마일스톤은 실행 속도가 빠름
- 기존 IActionProvider/PolicyEngine 패턴 재사용으로 프레임워크 설계 일관성 확보
- Audit 선행으로 갭 사전 식별 (4건 low-severity, 전부 구현 시 해결 가능)

### What Was Inefficient
- SUMMARY.md 포맷 불일치 (268은 markdown, 269-273은 YAML frontmatter) — gsd-tools summary-extract 실패
- Audit에서 발견한 slug 오타(273-01 → '272-perp-framework-design') 수정 미반영

### Patterns Established
- DeFi 프레임워크 설계 패턴: IXxxProvider extends IActionProvider + XxxPolicyEvaluator + XxxMonitor + 프로토콜 매핑
- 설계 마일스톤에서 m{seq}-{sub} 설계 문서 섹션 번호 체계 활용

### Key Lessons
1. 설계 마일스톤은 6 phases도 1일 1세션에 완료 가능 — 코드 작성 없이 문서만 산출
2. 프로토콜 매핑 테이블은 구현 시 가장 유용한 산출물 — API/SDK/ABI 호출 매핑 미리 정의

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 설계 문서 전용 마일스톤은 context 효율적 (코드 변경 없음, +11,805 lines docs only)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v29.0 | 1 | 6 | 설계 전용 마일스톤, 1일 완료 |
| v29.5 | 1 | 3 | 이슈 기반 정리 마일스톤, 156 파일 변경 1일 완료 |

### Cumulative Quality

| Milestone | Tests | Coverage | Design Decisions |
|-----------|-------|----------|-----------------|
| v29.0 | ~5,000 (unchanged) | unchanged | +59 decisions |
| v29.5 | ~5,595 (+512) | maintained | +5 decisions |

### Top Lessons (Verified Across Milestones)

1. 인프라-우선 설계 순서가 프레임워크 간 의존성을 자연스럽게 해소한다
2. 프로토콜 매핑 테이블을 설계 시점에 완성하면 구현 시 API 조사 시간이 절약된다
3. 이중 저장소 발견 시 즉각 SSoT 통합이 최선 — 동기화 레이어보다 단일 저장소 전환이 안정적
