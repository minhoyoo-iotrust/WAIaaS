# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Cumulative Quality

| Milestone | Tests | Coverage | Design Decisions |
|-----------|-------|----------|-----------------|
| v29.0 | ~5,000 (unchanged) | unchanged | +59 decisions |

### Top Lessons (Verified Across Milestones)

1. 인프라-우선 설계 순서가 프레임워크 간 의존성을 자연스럽게 해소한다
2. 프로토콜 매핑 테이블을 설계 시점에 완성하면 구현 시 API 조사 시간이 절약된다
