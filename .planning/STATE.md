# 프로젝트 상태

## 프로젝트 참조

참고: .planning/PROJECT.md (업데이트: 2026-02-07)

**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.
**현재 초점:** v0.5 인증 모델 재설계 + DX 개선 (Phase 19-21)

## 현재 위치

마일스톤: v0.5 인증 모델 재설계 + DX 개선
페이즈: Phase 21 of 21 (DX 개선 + 설계 문서 통합)
플랜: 2 of 4
상태: In progress
마지막 활동: 2026-02-07 -- Completed 21-02-PLAN.md

Progress: [███████████░] 7/9 (v0.5 전체), 2/4 (Phase 21)

## 성과 지표

**v0.1 최종 통계:** 15 plans, 23/23 reqs
**v0.2 최종 통계:** 16 plans, 45/45 reqs, 17 docs
**v0.3 최종 통계:** 8 plans, 37/37 reqs, 5 mapping docs
**v0.4 최종 통계:** 9 plans, 26/26 reqs, 11 docs (41-51)
**v0.5 현재:** 7/9 plans, 27/27 reqs (AUTH-01~05, OWNR-01~06, SESS-01~05, DX-01~08, SESS-03)

## 누적 컨텍스트

### 결정 사항

v0.1-v0.4 전체 결정 사항은 PROJECT.md 참조.

v0.5 핵심 결정:
- masterAuth/ownerAuth/sessionAuth 3-tier 인증 분리
- Owner 주소를 에이전트별 속성으로 이동 (agents.owner_address)
- WalletConnect를 선택적 편의 기능으로 전환
- 세션 낙관적 갱신 패턴 (maxRenewals 30, 총 수명 30일, 50% 갱신 시점)
- ownerAuth 필수 엔드포인트: 거래 승인 + Kill Switch 복구 (2곳만)

v0.5 Plan 19-01 결정:
- masterAuth 암묵적/명시적 이중 모드: 데몬 구동=인증 완료(implicit), X-Master-Password 헤더(explicit, Admin API + KS 복구)
- ownerAuth 정확히 2곳: POST /v1/owner/approve/:txId, POST /v1/owner/recover
- OwnerSignaturePayload action enum 7개에서 2개로 축소 (approve_tx, recover)
- ownerAuth Step 5를 agents.owner_address 대조로 변경
- APPROVAL 타임아웃 설정 가능: min 300s, max 86400s, default 3600s (config.toml [security].approval_timeout)
- authRouter 단일 디스패처로 기존 3개 인증 미들웨어 통합
- 16개 다운그레이드 엔드포인트 모두 보상 통제 존재 확인
- 감사 추적 트레이드오프: masterAuth = actor='master' (개인 식별 불가, Self-Hosted 단일 운영자 수용)

v0.5 Plan 19-03 결정:
- 34-owner-wallet-connection.md 기존 구조 유지 + v0.5 인라인 변경 (변경 추적 용이)
- 37-rest-api-complete-spec.md 섹션 1-4만 수정, 5-9는 Phase 21 위임
- audit_log actor 값 ownerAuth->masterAuth 전환 반영 (actor='master')

v0.5 Plan 20-01 결정:
- 기존 DELETE /v1/sessions/:id 재활용 for 갱신 거부 (별도 엔드포인트 불필요)
- 거부 윈도우는 검증이 아닌 알림 안내 문구 (Owner는 언제든 폐기 가능)
- usageStats 갱신 시 유지 (리셋하지 않음)
- 절대 수명(session_absolute_lifetime)은 config.toml 전역만 존재, 세션별 재정의 불가
- 50% 시점 갱신 비율은 시스템 고정 (설정 불가)

v0.5 Plan 20-02 결정:
- 에러 코드명은 53-session-renewal-protocol.md SSoT와 정확히 일치 (RENEWAL_LIMIT_REACHED, SESSION_ABSOLUTE_LIFETIME_EXCEEDED, RENEWAL_TOO_EARLY, SESSION_RENEWAL_MISMATCH)
- SESSION_NOT_FOUND는 기존 SESSION 도메인에 이미 존재하므로 중복 추가하지 않음 (실질 신규 4개)
- 갱신 엔드포인트를 Section 6 Session API (Agent 인증)에 6.6으로 배치 (sessionAuth)
- 섹션 5-9 엔드포인트 상세는 Phase 21 위임 유지 (19-03 결정 D2)

v0.5 Plan 21-01 결정:
- init에서 에이전트 생성/알림 설정/Owner 등록 제거, 순수 인프라 초기화(2단계)로 한정
- agent create --owner 필수 (agents.owner_address NOT NULL 반영, SIWS/SIWE 서명 불필요)
- session create는 masterAuth(implicit) 전용, 3가지 출력 포맷 (token/json/env)
- --quickstart 패스워드 자동 생성: randomBytes(24) base64url, ~/.waiaas/.master-password mode 0o600
- --dev 고정 패스워드 "waiaas-dev", 3종 보안 경고 (배너/헤더/감사로그), --expose 조합 금지
- config.toml [daemon].dev_mode 영구 설정 (boolean, 기본 false)
- 54-cli-flow-redesign.md가 28-daemon-lifecycle-cli.md 섹션 6(CLI 커맨드) 대체

v0.5 Plan 21-02 결정:
- hint 필드는 z.string().optional()로 ErrorResponseSchema backward-compatible 확장
- 40개 에러 중 31개에 hint 매핑 (78%), 9개 미매핑 (보안/복구불가 사유)
- MCP 옵션 B(별도 stdio) 채택: MCP Host 표준 + sessionAuth 보장 + 관심사 분리
- MCP 옵션 A(Streamable HTTP) 기각: Host 호환성 부족 + 인증 모델 충돌
- MCP 마이그레이션 경로: B -> B+자동화 -> C(--mcp-stdio) -> A 재검토
- 세션 토큰 불편함 완화 3방안: mcp setup 커맨드, 세션 자동 갱신, env 파일
- 원격 접근 SSH 터널 추천, --expose는 mTLS+IP화이트리스트 구현 후에만 안전

### 차단 요소/우려 사항

없음

## 세션 연속성

마지막 세션: 2026-02-07
중단 지점: Completed 21-02-PLAN.md. Phase 21 plan 2 of 4 complete. Ready for 21-03.
재개 파일: None
