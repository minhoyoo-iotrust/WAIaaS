# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-08)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.
**현재 초점:** v0.7 Phase 26 완료 (verified ✓) -> Phase 27 데몬 보안 기반 확립

## 현재 위치

마일스톤: v0.7 구현 장애 요소 해소
페이즈: 26 of 30 (체인 어댑터 안정화)
플랜: 2 of 2 in current phase
상태: Phase complete (verified ✓, 10/10 must-haves)
마지막 활동: 2026-02-08 -- Phase 26 verified, CHAIN-01~04 complete

Progress: ██░░░░░░░░░░░░░░░░░░ 18% (2/11)

## 성과 지표

**v0.1 최종 통계:** 15 plans, 23/23 reqs
**v0.2 최종 통계:** 16 plans, 45/45 reqs, 17 docs
**v0.3 최종 통계:** 8 plans, 37/37 reqs, 5 mapping docs
**v0.4 최종 통계:** 9 plans, 26/26 reqs, 11 docs (41-51)
**v0.5 최종 통계:** 9 plans, 24/24 reqs, 15 docs (52-55 신규 + 11개 기존 문서 수정)
**v0.6 최종 통계:** 11 plans, 30/30 reqs, 9 docs (56-64 신규) + 기존 8개 문서 v0.6 통합

**누적:** 68 plans, 185 reqs, 30 설계 문서 (24-64), 25 phases

**v0.7:**
- Total plans: 11 (2+3+1+3+2)
- Requirements: 25
- Completed: 2/11 plans (26-01, 26-02)

## 누적 컨텍스트

### 결정 사항

전체 결정 사항은 PROJECT.md 참조.
v0.7 핵심: 설계 문서 직접 수정 + [v0.7 보완] 태그 추적

| 결정 | 근거 | Plan |
|------|------|------|
| getBlockHeight() 사용 (getSlot() 아님) | skipped 슬롯으로 slot > blockHeight 차이 발생 방지 | 26-01 |
| FRESHNESS_THRESHOLD_SECONDS = 20초 | sign(1s)+submit(2s)+대기(2s)+안전마진(15s) | 26-01 |
| refreshBlockhash Option A (메시지 캐싱) | instruction 보존, RPC 1회로 빠른 복구 | 26-01 |
| BLOCKHASH_STALE vs EXPIRED 분리 | STALE=refreshBlockhash(경량), EXPIRED=buildTransaction(중량) | 26-01 |
| UnsignedTransaction.nonce 명시적 승격 | metadata 타입 불안전 해소, tx.nonce !== undefined 가드 패턴 | 26-01 |
| IChainAdapter 17 -> 19개 메서드 | getCurrentNonce/resetNonceTracker 추가, Solana=no-op | 26-01 |
| AES-GCM nonce 충돌 구조적 불가능 | 매번 새 salt -> 새 AES 키 -> n=1, Birthday Problem 전제 미충족 | 26-02 |
| Birthday Problem 공식 정정 | P ~ 1-e^(-n^2/(2N)), N=2^96. NIST SP 800-38D 참조 | 26-02 |
| Priority fee TTL 30초 = Nyquist 최소 | 60초 윈도우 / 2 = 30초 (Nyquist-Shannon) | 26-02 |
| Fee bump 1.5배 고정, 최대 1회 | 업계 관행 하한, 무한 escalation 방지, 단순성 우선 | 26-02 |
| SOLANA_INSUFFICIENT_FEE 에러 코드 | retryable:true, fee bump 재시도 전용 | 26-02 |

### 차단 요소/우려 사항

없음

## 세션 연속성

마지막 세션: 2026-02-08
중단 지점: Phase 26 verified ✓. Phase 27 계획 수립 필요.
재개 파일: .planning/ROADMAP.md (Phase 27 참조)
