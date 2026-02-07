# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-07)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.
**현재 초점:** v0.6 블록체인 기능 확장 설계 -- Phase 22 토큰 확장 설계

## 현재 위치

마일스톤: v0.6 블록체인 기능 확장 설계
페이즈: 22 of 25 (토큰 확장 설계)
플랜: 1 of 2 in current phase
상태: In progress
마지막 활동: 2026-02-07 -- 22-01-PLAN.md 완료 (CHAIN-EXT-01 토큰 전송 확장 스펙)

Progress: █░░░░░░░░░░░░░░░░░░░░ 11%

## 성과 지표

**v0.1 최종 통계:** 15 plans, 23/23 reqs
**v0.2 최종 통계:** 16 plans, 45/45 reqs, 17 docs
**v0.3 최종 통계:** 8 plans, 37/37 reqs, 5 mapping docs
**v0.4 최종 통계:** 9 plans, 26/26 reqs, 11 docs (41-51)
**v0.5 최종 통계:** 9 plans, 24/24 reqs, 15 docs (52-55 신규 + 11개 기존 문서 수정)
**v0.6 진행:** 1/9 plans

## 누적 컨텍스트

### 결정 사항

v0.1-v0.5 전체 결정 사항은 PROJECT.md 참조.

v0.6 핵심 결정:
- IChainAdapter는 저수준 실행 엔진으로 유지 (DeFi 지식은 Action Provider에 분리)
- 6단계 파이프라인 구조 변경 없음 -- 새 기능은 기존 위에 적층
- 임의 컨트랙트 호출은 기본 거부 (opt-in 화이트리스트)
- approve는 독립 정책 카테고리 (전송보다 위험한 권한 위임)
- Action Provider의 resolve-then-execute 패턴 (정책 엔진 개입 보장)
- USD 기준 정책 평가 (토큰 종류 무관한 티어 분류)

Phase 22-01 결정 (CHAIN-EXT-01):
- TransferRequest에 token? 필드로 분기 (type 대신 객체 기반, 타입 안전성)
- getTransferCheckedInstruction 사용 (decimals 온체인 검증)
- Token-2022 기본 transfer 지원, 위험 확장(TransferFee 등) 감지 시 거부
- ALLOWED_TOKENS 미설정 시 토큰 전송 기본 거부
- TOKEN_TRANSFER 기본 NOTIFY 티어 (Phase 24 USD 통합 전 과도기)
- SPENDING_LIMIT은 토큰 전송에 미적용 (금액 단위 비교 불가)
- PolicyType 5개로 확장 (ALLOWED_TOKENS 추가)

### 차단 요소/우려 사항

없음

## 세션 연속성

마지막 세션: 2026-02-07
중단 지점: 22-01-PLAN.md 완료. 22-02-PLAN.md (getAssets, estimateFee, 테스트) 대기.
재개 파일: .planning/phases/22-token-extension/22-02-PLAN.md
