# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-05)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.
**현재 초점:** Phase 7 - Session & Transaction Protocol Design (세션 인증, 거래 파이프라인, Solana 어댑터)

## 현재 위치

페이즈: 6 of 9 (Core Architecture Design) -- Phase 6 완료
플랜: 5 of 5 in current phase (COMPLETE)
상태: Phase complete
마지막 활동: 2026-02-05 -- 06-05-PLAN.md 완료 (Hono API 프레임워크 설계)

진행률: v0.2 [█████░░░░░░░░░░░] 5/16 plans (31%)

## 성과 지표

**v0.1 최종 통계:**
- 완료된 플랜 총계: 15
- 평균 소요 시간: 5.5분
- 총 실행 시간: 82분
- 요구사항: 23/23 완료

**v0.2 페이즈 구성:**

| 페이즈 | 플랜 | 요구사항 | 상태 |
|--------|------|----------|------|
| 6. Core Daemon | 5/5 | 11 reqs | Complete |
| 7. Session & Transaction | 0/3 | 9 reqs | Not started |
| 8. Security Layers | 0/4 | 14 reqs | Not started |
| 9. Integration & Polish | 0/4 | 11 reqs | Not started |

## 누적 컨텍스트

### 결정 사항

- [v0.2]: Cloud -> Self-Hosted 전환 (AWS KMS/PostgreSQL/Redis 제거, 로컬 SQLite/파일 기반)
- [v0.2]: 세션 토큰 기반 인증 (영구 API Key 대신 단기 JWT, SIWS/SIWE 서명 승인)
- [v0.2]: 체인 무관 로컬 정책 엔진 (Squads 온체인 의존 제거)
- [v0.2]: Tauri + Hono + Drizzle + better-sqlite3 기술 스택 확정
- [06-01]: UUID v7을 모든 PK에 사용 (시간 정렬 가능, 분산 생성 안전)
- [06-01]: 트랜잭션 금액을 TEXT로 저장 (uint256 안전, 체인 무관)
- [06-01]: audit_log FK 없음 (엔티티 삭제 후에도 로그 영구 보존)
- [06-01]: hostname z.literal('127.0.0.1') 강제 (config/env로 변경 불가)
- [06-01]: config.toml에 [database] 섹션 분리 (WAL 체크포인트, cache_size 등 독립 관리)
- [06-02]: Argon2id KDF에 argon2 npm 사용 (sodium-native crypto_pwhash 대신 -- 비동기 이벤트 루프 비차단)
- [06-02]: Solana 개인키 64바이트 전체 저장 (seed 32B + pubkey 32B)
- [06-02]: EVM 키 생성은 viem generatePrivateKey() 사용 후 sodium_malloc에 복사
- [06-02]: 키 내보내기 파일 = 원본과 동일한 WAIaaS Keystore v1 포맷 (별도 패스워드)
- [06-02]: 키 손실 시 복구 불가 -- Owner 온체인 자산 회수가 복구 경로
- [06-03]: IChainAdapter 4단계 tx 분리 (build/simulate/sign/submit) -- 정책 엔진이 simulate 후 approve/reject
- [06-03]: signTransaction(tx, Uint8Array) -- sodium guarded memory 호환, Buffer GC 복사 회피
- [06-03]: AdapterRegistry 팩토리 패턴 -- (chain, network) 조합당 인스턴스 1개 캐싱
- [06-03]: EVM nonce: max(onchain, local) 전략 -- 빠른 연속 제출과 외부 제출 모두 안전
- [06-03]: Ethereum RPC 기본값 비어있음 -- 공용 RPC rate limit 문제로 사용자 설정 강제
- [06-04]: 데몬 foreground 기본 + --daemon background 지원
- [06-04]: Graceful Shutdown 10단계 캐스케이드
- [06-04]: 키스토어: 데몬 실행 중 = 상시 열림, 종료 시 sodium_memzero
- [06-04]: 하이브리드 로깅 (데몬 로그: 파일, 감사 로그: SQLite)
- [06-04]: CLI 파싱: Node.js 내장 parseArgs (util.parseArgs)
- [06-04]: Exit code 6단계 체계 (0=성공, 1=에러, 2=중복실행, 3=미초기화, 4=인증실패, 5=타임아웃)
- [06-04]: 어댑터 초기화 실패 = 경고(warn), fail-fast 아님
- [06-04]: Windows stop: SIGTERM 불가 -> HTTP API /v1/admin/shutdown 폴백
- [06-05]: v0.2 에러 포맷 간소화 (RFC 9457 -> 단순 JSON: code/message/details/requestId/retryable)
- [06-05]: 미들웨어 8단계 순서 확정 (ID -> 로깅 -> 종료검사 -> 보안헤더 -> Host -> CORS -> Rate -> 인증)
- [06-05]: IPv6 (::1) 미지원 -- 공격 표면 축소
- [06-05]: 기본 포트 3100 -- 3000/3001/8080 충돌 방지
- [06-05]: Rate Limiter 3-레벨 (전역 100/세션 300/거래 10 req/min)
- [06-05]: ownerAuth는 라우트 레벨 미들웨어 (Phase 8 상세)
- [06-05]: Swagger UI는 debug 모드에서만 활성화
- [06-05]: Content negotiation 미채택 -- application/json 단일 포맷

### v0.1에서 활용 가능한 설계

- ~~IBlockchainAdapter 체인 추상화 인터페이스~~ -> IChainAdapter로 리팩터링 완료 (CORE-04)
- ~~에러 코드 체계 (RFC 9457 + 46개 코드)~~ -> v0.2 간소화 포맷으로 재설계 완료 (CORE-06)
- 에이전트 생명주기 5단계 모델 / 4단계 에스컬레이션 / 비상 정지 트리거
- 모노레포 패키지 구조 (core/daemon/adapters/cli/sdk/mcp)

### 차단 요소/우려 사항

- WalletConnect v2 -> Reown 리브랜딩 불확실성 (Phase 8 시작 전 확인 필요)
- Tauri WebView WebHID 호환성 (Phase 9 Desktop 앱 개발 시 테스트)
- MCP 도구 인증 모델 (Phase 9 MCP 설계 시 결정)

## 세션 연속성

마지막 세션: 2026-02-05T09:17:57Z
중단 지점: 06-05-PLAN.md 완료 (Phase 6 전체 완료)
재개 파일: None -- 다음 단계: Phase 7 (Session & Transaction Protocol Design)
