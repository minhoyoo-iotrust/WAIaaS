# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-07)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.
**현재 초점:** v0.6 블록체인 기능 확장 설계 -- Phase 25 테스트 전략 통합 + 기존 문서 반영

## 현재 위치

마일스톤: v0.6 블록체인 기능 확장 설계
페이즈: 25 of 25 (테스트 전략 + 문서 통합)
플랜: 2 of 4 in current phase
상태: In progress
마지막 활동: 2026-02-08 -- Completed 25-02-PLAN.md (SSoT 기반 문서 3개 v0.6 통합)

Progress: █████████████████████████████████████████████████████████████████░░ 97%

## 성과 지표

**v0.1 최종 통계:** 15 plans, 23/23 reqs
**v0.2 최종 통계:** 16 plans, 45/45 reqs, 17 docs
**v0.3 최종 통계:** 8 plans, 37/37 reqs, 5 mapping docs
**v0.4 최종 통계:** 9 plans, 26/26 reqs, 11 docs (41-51)
**v0.5 최종 통계:** 9 plans, 24/24 reqs, 15 docs (52-55 신규 + 11개 기존 문서 수정)
**v0.6 진행:** 9/11 plans (Phase 25 plan 2/4 complete)

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

Phase 22-02 결정 (CHAIN-EXT-02):
- getAssets() 반환 순서: 네이티브 토큰 첫 번째, 이후 잔액 내림차순
- EVM 토큰 조회: ALLOWED_TOKENS 기반 보수적 조회 (외부 인덱서 의존 없음)
- Token-2022 토큰도 type='spl'로 통합 (프로그램 구분은 어댑터 내부)
- ATA 생성 비용: getMinimumBalanceForRentExemption(165) 동적 조회 (하드코딩 금지)
- estimateFee() 반환 타입: bigint -> FeeEstimate 구조체 (하위 호환 필요)
- REST API 명칭: GET /v1/wallet/tokens -> GET /v1/wallet/assets 확정
- ITokenDiscovery 확장 포인트: 향후 AlchemyDiscovery, MoralisDiscovery 플러그인 가능

Phase 23-01 결정 (CHAIN-EXT-03):
- IChainAdapter에 buildContractCall() 독립 메서드 추가 (유니온 확장 대신)
- CONTRACT_CALL 기본 티어 = APPROVAL (보수적, Owner 승인 필수)
- METHOD_WHITELIST는 EVM 전용 (Solana 표준 selector 규약 없음)
- 감사 컬럼 4개 직접 추가 (metadata JSON 대신 독립 컬럼, 인덱싱 효율)
- 주소 비교 시 lowercase 정규화 (EVM checksum 주소 호환)
- TransactionType 5개 정식화 (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
- PolicyType 10개로 확장 (+CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
- DatabasePolicyEngine.evaluate() 11단계 알고리즘 (DENY 우선 원칙)

Phase 23-02 결정 (CHAIN-EXT-04):
- ApproveRequest를 ContractCallRequest와 독립 타입으로 설계 (권한 위임 vs 실행)
- EVM race condition 방지: 어댑터에서 approve(0)->approve(new) 자동 처리 (에이전트 보안 지식 불요)
- APPROVE_TIER_OVERRIDE가 SPENDING_LIMIT과 독립 (approve는 자금 소모가 아닌 권한 위임)
- 무제한 임계값 = 체인별 MAX / 2 (EVM: 2^256/2, Solana: 2^64/2)
- Solana 단일 delegate 경고: 자동 차단하지 않고 previousDelegate 정보 + 감사 로그 기록

Phase 23-03 결정 (CHAIN-EXT-05):
- InstructionRequest를 discriminated union으로 설계 (4 types: TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE)
- BatchRequest의 chain은 'solana' only (EVM BATCH_NOT_SUPPORTED 400)
- 2단계 정책 평가: Phase A 개별 instruction + Phase B 합산 금액 티어
- TOKEN_TRANSFER/APPROVE 합산 금액 = 0n (Phase 24 USD 통합 전)
- APPROVE 포함 배치: maxTier(합산 금액 티어, APPROVE override 티어)
- 감사 컬럼 대표값 + metadata JSON 전체 기록 패턴
- 배치 내 중복 instruction 미감지 (감사 로그 사후 추적)
- ATA 자동 생성은 instruction 수(20개 한도)에 포함

Phase 24-01 결정 (CHAIN-EXT-06):
- IPriceOracle 4개 메서드, 서비스 레이어 위치 (IChainAdapter 독립)
- OracleChain 패턴: CoinGecko(Primary) -> Pyth(Solana)/Chainlink(EVM) -> stale cache
- 5분 TTL + 30분 staleMaxAge, LRU 1000 항목
- SpendingLimitRuleSchema에 instant_max_usd/notify_max_usd/delay_max_usd optional 추가 (하위 호환)
- USD + 네이티브 병행 평가: maxTier(nativeTier, usdTier) 보수적 채택
- stale 가격 INSTANT->NOTIFY 상향, +-50% 급변동 시 한 단계 상향
- 완전 장애 시 Phase 22-23 과도기 전략 fallback (TOKEN_TRANSFER=NOTIFY)
- APPROVE USD는 참고값 (TIER_OVERRIDE 독립, 감사 로그 기록용)

Phase 24-02 결정 (CHAIN-EXT-07, CHAIN-EXT-08):
- resolve()는 ContractCallRequest만 반환 (UnsignedTransaction/TransactionRequest 대안 미채택, 정책 우회 차단)
- validate-then-trust 보안 경계 (vm.Module 샌드박스 미채택, 실험적 API 불안정)
- MCP Tool 16개 상한 (기존 6 + Action 최대 10, mcpExpose 플래그 제어)
- Jupiter /swap-instructions 사용 (/swap은 직렬화 전체 트랜잭션 반환하므로 부적합)
- priceImpactPct 1% 상한 (유동성 부족/MEV 공격 사전 차단, config.toml 조정 가능)
- Jito MEV 보호 기본 활성화 (1000 lamports 팁, 100000 상한)

Phase 25-02 결정 (SSoT 문서 통합):
- 45-enum 섹션 번호 재번호 (2.3~2.12, TransactionType 신규 삽입으로 기존 섹션 이동)
- ActionErrorCode는 소스 문서(62) 실제 정의 반영 (계획의 ACTION_PROVIDER_* 대신 ACTION_* 사용)
- 27-chain-adapter에 Action Provider 협력 패턴 섹션 추가 (resolve-then-execute 상호 참조)

### 차단 요소/우려 사항

없음

## 세션 연속성

마지막 세션: 2026-02-08
중단 지점: Phase 25 plan 02 완료 (SSoT 문서 3개 v0.6 통합). Plan 03-04 대기.
재개 파일: None
