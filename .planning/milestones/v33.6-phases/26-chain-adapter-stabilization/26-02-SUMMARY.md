---
phase: 26-chain-adapter-stabilization
plan: 02
subsystem: chain-adapter
tags: [aes-gcm, nonce, birthday-problem, nist, keystore, solana, priority-fee, nyquist, fee-bump, security]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: 키스토어 파일 포맷 (CORE-03) + IChainAdapter 기본 설계 (CORE-04)
  - phase: 26-chain-adapter-stabilization (plan 01)
    provides: Solana blockhash freshness guard + BLOCKHASH_STALE 에러 코드
provides:
  - AES-GCM nonce 충돌 확률 정정 (Birthday Problem 정확 공식 + WAIaaS 구조적 불가능 분석)
  - Priority fee TTL 30초의 Nyquist-Shannon 이론적 근거
  - 1.5배 fee bump 1회 재시도 전략 (플로우 + 설계 제약 + 코드)
  - SOLANA_INSUFFICIENT_FEE 에러 코드 + mapRpcError 매핑
affects:
  - 27-pipeline-stabilization (파이프라인에서 fee bump 재시도 통합)
  - 28-security-policy-stabilization (정책 엔진에서 fee 관련 에러 처리)
  - 30-documentation-consolidation (보안 수학 정정 반영)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Birthday Problem 정확 공식: P = 1 - e^(-n^2/(2N)), N=2^96"
    - "Nyquist-Shannon 캐시 TTL 결정: 신호 주기/2 = 샘플링 주기"
    - "Fee bump 1회 재시도: 1.5배 고정 bump + 새 blockhash 필수"
    - "매번 새 salt -> 매번 새 AES 키 -> nonce 충돌 구조적 불가능"

key-files:
  created: []
  modified:
    - ".planning/deliverables/26-keystore-spec.md"
    - ".planning/deliverables/31-solana-adapter-detail.md"

key-decisions:
  - "AES-GCM nonce 충돌은 WAIaaS에서 구조적으로 불가능: 매 암호화마다 새 salt -> 새 AES 키 -> n=1"
  - "Birthday Problem 공식 정정: P ~ 1 - e^(-n^2/(2N)), N=2^96 (기존 부정확한 '2^-32' 표현 대체)"
  - "Priority fee TTL 30초: Nyquist 최소 샘플링 주기 (60초 윈도우 / 2)"
  - "Fee bump 계수 1.5배 고정: 업계 관행(50-100%), 설정 불가(단순성 우선)"
  - "Fee bump 최대 1회: escalation 무한 루프 방지"
  - "SOLANA_INSUFFICIENT_FEE 에러 코드 추가: retryable:true, fee bump 재시도 전용"

patterns-established:
  - "보안 수학 정정: 부정확한 근사 -> 정확한 공식 + 실사용 패턴 분석"
  - "캐시 TTL 근거: Nyquist-Shannon 기반 이론적 정당화"
  - "재시도 전략: bump 계수 고정 + 최대 횟수 제한 + 새 blockhash 필수"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 26 Plan 02: Keystore AES-GCM nonce 충돌 확률 Birthday Problem 정정 + Priority fee TTL Nyquist 근거 + 1.5배 fee bump 재시도 전략 Summary

**AES-GCM nonce 충돌의 Birthday Problem 정확 공식(P=1-e^(-n^2/(2N))) 정정 + WAIaaS 구조적 불가능성 분석, Priority fee TTL 30초의 Nyquist-Shannon 이론적 근거 확립, 1.5배 fee bump 1회 재시도 전략 설계**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T07:43:26Z
- **Completed:** 2026-02-08T07:47:08Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- 26-keystore-spec.md 섹션 3.3의 부정확한 Birthday Problem 계산을 정확한 수식으로 정정하고, WAIaaS의 매번 새 salt 설계에 의한 nonce 충돌 구조적 불가능성을 증명 (CHAIN-03 CRITICAL 해소)
- 31-solana-adapter-detail.md 섹션 11.2에 priority fee TTL 30초의 Nyquist-Shannon 샘플링 정리 근거를 추가하고, 비교 테이블로 오버/언더 샘플링 트레이드오프 명시 (CHAIN-04 MEDIUM 해소)
- 제출 실패 시 1.5배 fee bump 1회 재시도 전략을 플로우 다이어그램 + 설계 제약 테이블 + TypeScript 코드로 설계
- SOLANA_INSUFFICIENT_FEE 에러 코드를 에러 매핑 테이블, mapRpcError 구현, 재시도 분류에 일관되게 추가
- NIST SP 800-38D 참조 + 보수적 가정 분석 테이블(4개 시나리오)으로 보안 근거 강화

## Task Commits

Each task was committed atomically:

1. **Task 1: Keystore AES-GCM nonce 충돌 확률 Birthday Problem 정정** - `20d1eba` (feat)
2. **Task 2: Priority fee TTL Nyquist 근거 + 1.5배 fee bump 재시도 전략** - `4e10e31` (feat)

## Files Created/Modified
- `.planning/deliverables/26-keystore-spec.md` - 섹션 3.3 Birthday Problem 정확 공식 정정, WAIaaS 구조적 불가능 분석, NIST SP 800-38D 참조, 보수적 가정 테이블, v0.7 업데이트 날짜 추가 (+35줄, -5줄)
- `.planning/deliverables/31-solana-adapter-detail.md` - 섹션 11.2 Nyquist 근거, 섹션 8.2 fee bump 재시도 전략(플로우+제약+코드), 섹션 10.1/10.2/10.3 INSUFFICIENT_FEE 에러 코드 (+117줄, -2줄)

## Decisions Made
1. **AES-GCM nonce 충돌 구조적 불가능:** WAIaaS는 매 암호화마다 새 CSPRNG salt를 생성하여 Argon2id로 새 AES-256 키를 파생한다. 동일 키로의 암호화 횟수가 항상 1이므로 Birthday Problem의 전제(동일 키 복수 사용)가 충족되지 않는다.
2. **Birthday Problem 공식 정정:** 기존 "2^32회 시 2^-32" 표현을 정확한 공식 P = 1 - e^(-n^2/(2N)), N=2^96으로 교체. NIST SP 800-38D 권장 한계(P < 2^-32, n < 2^32)도 명시.
3. **Priority fee TTL 30초 = Nyquist 최소 샘플링 주기:** getRecentPrioritizationFees의 150 슬롯(~60초) 윈도우를 신호 주기로 간주, Nyquist 정리에 의해 최소 2배 샘플링(30초) 필요.
4. **Fee bump 1.5배 고정:** 업계 관행(50-100% 인상)의 하한. 설정 가능하게 하지 않음으로써 단순성 확보.
5. **Fee bump 최대 1회:** 무한 fee escalation 루프 방지. bump 후에도 실패 시 TRANSACTION_FAILED 반환.
6. **SOLANA_INSUFFICIENT_FEE 에러 코드:** retryable:true로 설정. fee bump 재시도(섹션 8.2)로 라우팅. Solana RPC가 명시적 에러를 반환하지 않는 경우의 대안 감지 조건도 문서화.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CHAIN-03(키스토어 보안 수학)과 CHAIN-04(priority fee 전략) 해소 완료
- Phase 26 전체 완료 (2/2 plans)
- Phase 27(파이프라인 안정화) 실행 준비 완료
- 두 문서 모두 기존 설계를 파괴하지 않고 [v0.7 보완] 태그로 보완만 수행

## Self-Check: PASSED

---
*Phase: 26-chain-adapter-stabilization*
*Completed: 2026-02-08*
