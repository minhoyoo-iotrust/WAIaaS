# Issue Tracker

> 이슈 추적 현황. 새 이슈는 `{NNN}-{slug}.md`로 추가하고 이 표를 갱신한다.

## Status Legend

| 상태 | 설명 |
|------|------|
| OPEN | 미처리 — 수정 필요 |
| FIXED | 수정 완료 — 코드 반영됨 |
| VERIFIED | 수정 후 검증 완료 |
| WONTFIX | 수정하지 않음 (의도된 동작 또는 해당 없음) |

## Active Issues

| ID | 유형 | 심각도 | 제목 | 마일스톤 | 상태 | 수정일 |
|----|------|--------|------|----------|------|--------|
| 001 | BUG | HIGH | 트랜잭션 라우트 미등록 (POST /v1/transactions/send 404) | m12 | FIXED | 2026-02-10 |
| 002 | BUG | CRITICAL | 세션 라우트 미등록 + masterAuth 미적용 (POST /v1/sessions 404) | m13 | FIXED | 2026-02-10 |
| 003 | BUG | LOW | mcp setup 헬스체크가 인증 필요 엔드포인트 호출 (/v1/admin/status) | m14 | FIXED | 2026-02-11 |
| 004 | BUG | MEDIUM | mcp setup 에이전트 목록 조회 시 X-Master-Password 헤더 누락 | m14 | FIXED | 2026-02-11 |
| 005 | BUG | CRITICAL | MCP SessionManager가 JWT의 sub 대신 sessionId 클레임 참조 | m14 | FIXED | 2026-02-11 |
| 006 | BUG | MEDIUM | mcp setup 에이전트 자동 감지 시 API 응답 필드 불일치 (items vs agents) | m14 | FIXED | 2026-02-11 |
| 007 | BUG | MEDIUM | Admin UI 알림 테스트 응답 파싱 오류 (results 래퍼 미처리) | m14-04 | FIXED | 2026-02-12 |
| 008 | BUG | MEDIUM | vitest fork pool 워커 프로세스가 고아 상태로 누적 | m14-04 | FIXED | 2026-02-12 |
| 009 | BUG | LOW | E2E E-11 테스트가 잘못된 인증 모델 전제 (X-Agent-Id 미사용, sessionAuth 누락) | m12 | FIXED | 2026-02-12 |
| 010 | BUG | HIGH | Admin UI EVM 에이전트 생성 시 network 값 불일치 (sepolia → ethereum-sepolia) | m15-01 | FIXED | 2026-02-12 |
| 011 | BUG | MEDIUM | MCP 서버 초기화 순서 레이스 컨디션 (sessionManager.start → server.connect) | m14 | FIXED | 2026-02-12 |
| 012 | BUG | MEDIUM | MCP에 get_assets 도구 미구현 — SPL/ERC-20 토큰 잔액 조회 불가 | m14 | FIXED | 2026-02-12 |
| 013 | BUG | LOW | Admin UI에서 MCP 토큰 발급 불가 — CLI 의존 | m15-01 | FIXED | 2026-02-13 |
| 014 | BUG | MEDIUM | EVM getAssets()가 ERC-20 토큰 잔액 미반환 — ALLOWED_TOKENS 정책 미연동 | m15-01 | FIXED | 2026-02-13 |
| 015 | BUG | HIGH | EVM 트랜잭션 확인 타임아웃 시 온체인 성공 건을 FAILED로 처리 | m15-01 | FIXED | 2026-02-13 |
| 016 | BUG | LOW | 모든 패키지 버전이 0.0.0 — Admin UI/OpenAPI에 잘못된 버전 표시 | m15-01 | FIXED | 2026-02-13 |
| 017 | BUG | MEDIUM | MCP에서 CONTRACT_CALL/APPROVE/BATCH 타입 차단 — 보안 근거 부재 | m15-01 | FIXED | 2026-02-14 |
| 018 | ENHANCEMENT | LOW | 테스트넷 빌트인 ERC-20 토큰이 빈 배열 — 토큰 전송 테스트 시 수동 등록 필요 | m15-03 | FIXED | 2026-02-14 |
| 019 | BUG | HIGH | EVM simulateTransaction에서 from 주소 누락 — ERC-20 전송 시뮬레이션 실패 | m15-04 | FIXED | 2026-02-14 |
| 020 | BUG | MEDIUM | MCP 서버 프로세스가 Claude Desktop 종료 후 고아로 잔류 — stdin 종료 미감지 | m15-08 | FIXED | 2026-02-15 |
| 021 | ENHANCEMENT | LOW | 멀티체인 전체 네트워크 잔액 일괄 조회 미지원 — `network=all` 파라미터 필요 | m15-08 | FIXED | 2026-02-15 |
| 022 | MISSING | LOW | 기본 네트워크 변경 MCP 도구 및 CLI 명령어 미구현 | m15-08 | FIXED | 2026-02-15 |
| 023 | MISSING | MEDIUM | 월렛 상세 정보 조회 CLI 명령어 + SDK 메서드 미구현 (MCP 도구 구현 완료) | m15-08 | FIXED | 2026-02-15 |
| 024 | ENHANCEMENT | MEDIUM | Admin UI 월렛 상세 페이지에 잔액 및 트랜잭션 내역 미표시 | m15-08 | FIXED | 2026-02-15 |
| 025 | ENHANCEMENT | LOW | 알림 로그에 실제 발송 메시지 내용 미저장 — Admin UI에서 확인 불가 | m15-08 | FIXED | 2026-02-15 |
| 026 | ENHANCEMENT | LOW | Admin UI 세션 페이지에서 전체 세션 조회 불가 — 월렛 선택 필수 | m15-08 | FIXED | 2026-02-15 |
| 027 | ENHANCEMENT | MEDIUM | Admin UI 대시보드 핵심 정보 누락 + StatCard 상세 페이지 링크 없음 | m15-08 | FIXED | 2026-02-15 |
| 028 | BUG | MEDIUM | Admin UI 알림 테스트가 SYSTEM_LOCKED 에러로 실패 — 빈 body 파싱 오류 | m15-08 | FIXED | 2026-02-15 |
| 029 | ENHANCEMENT | LOW | Admin UI 알림 테스트 시 대상 채널 불명확 — 채널 선택 UI 없음 | m15-08 | FIXED | 2026-02-15 |
| 030 | ENHANCEMENT | LOW | Slack 알림 채널 미지원 — Incoming Webhook 방식 추가 | m15-08 | FIXED | 2026-02-15 |
| 031 | BUG | HIGH | pushSchema 인덱스 생성이 마이그레이션보다 먼저 실행 — 기존 DB 시작 실패 | m15-08 | FIXED | 2026-02-15 |
| 032 | BUG | HIGH | ActionProviderRegistry.listActions() 빌드 실패 — noUncheckedIndexedAccess 위반 | m16 | FIXED | 2026-02-15 |
| 033 | BUG | HIGH | Admin UI 월렛 상세 네트워크 필드 불일치 — Terminate 무응답 + 삭제 지갑 크래시 | m16-01 | FIXED | 2026-02-16 |
| 034 | ENHANCEMENT | MEDIUM | OpenAPI → 클라이언트 타입 자동 생성 도입 — API 필드 불일치 구조적 방지 | m16-01 | FIXED | 2026-02-16 |
| 035 | ENHANCEMENT | MEDIUM | USDC_DOMAINS 하드코딩 테이블과 실제 온체인 도메인 불일치 | m16-01 | FIXED | 2026-02-16 |
| 036 | BUG | HIGH | x402 EIP-712 도메인 name 불일치로 결제 서명 검증 실패 | m16-01 | FIXED | 2026-02-16 |
| 037 | BUG | MEDIUM | Admin Table 컴포넌트 undefined data 크래시 — sessions 페이지 테스트 실패 | m17 | FIXED | 2026-02-16 |
| 038 | BUG | LOW | v1.6 추가 enum/error code에 대한 테스트 count 미갱신 (7건) | m17 | FIXED | 2026-02-16 |
| 039 | ENHANCEMENT | MEDIUM | 마일스톤 감사 전 빌드+테스트 자동 실행 훅 추가 | m17 | FIXED | 2026-02-16 |
| 040 | ENHANCEMENT | LOW | EVM Testnet Level 3 블록체인 검증 추가 — Solana Devnet과 대칭 | m18 | FIXED | 2026-02-17 |
| 041 | MISSING | LOW | Admin UI Owner 주소 설정 폼 미구현 | m17 | FIXED | 2026-02-17 |
| 042 | BUG | HIGH | tsconfig.json이 __tests__/ 포함하여 빌드 실패 반복 | m17 | FIXED | 2026-02-17 |
| 043 | BUG | MEDIUM | WalletConnect 미설정 시 404 + "알 수 없는 에러" 표시 | m17 | FIXED | 2026-02-17 |
| 044 | ENHANCEMENT | LOW | 알림 자격증명이 config.toml과 Admin Settings에 중복 존재 | m17 | FIXED | 2026-02-17 |
| 045 | ENHANCEMENT | MEDIUM | WalletConnect 설정 변경 시 hot-reload 미지원 | m17 | FIXED | 2026-02-17 |
| 046 | ENHANCEMENT | LOW | Admin UI Settings 재구조화 — 관련 메뉴로 설정 재배치 + Telegram 통합 | m17 | FIXED | 2026-02-17 |
| 047 | BUG | HIGH | Terminate 시 리소스 정리 누락 + TERMINATED 가드 미적용 | m17 | FIXED | 2026-02-17 |
| 048 | MISSING | HIGH | Owner 자산 회수(Withdraw) API 미구현 | m17 | FIXED | 2026-02-17 |
| 049 | BUG | HIGH | WalletConnect SignClient ESM/CJS 호환성 오류로 초기화 실패 | m17 | FIXED | 2026-02-17 |
| 050 | ENHANCEMENT | MEDIUM | Telegram Bot 활성화를 Admin Settings에서 관리 | m17 | FIXED | 2026-02-17 |
| 051 | ENHANCEMENT | LOW | 외부 지갑 예시에 D'CENT 추가 및 우선 표기 | m18 | FIXED | 2026-02-17 |
| 052 | BUG | HIGH | E2E 하네스가 AdapterPool 대신 단일 adapter 전달 — 3건 실패 | m18 | FIXED | 2026-02-17 |
| 053 | ENHANCEMENT | LOW | CI workflow에 workflow_dispatch 미지원 — 수동 전체 테스트 실행 불가 | m18 | FIXED | 2026-02-17 |
| 054 | BUG | LOW | Owner 주소 저장 후 Created 시각이 NaN으로 표시 | m18 | FIXED | 2026-02-17 |
| 055 | ENHANCEMENT | MEDIUM | Admin UI Owner 지갑 UX 개선 — 가시성 및 안내 강화 | m18 | FIXED | 2026-02-17 |
| 056 | BUG | HIGH | WalletConnect 페어링 시 Owner 주소 검증 누락 | m18 | FIXED | 2026-02-17 |
| 057 | MISSING | MEDIUM | Owner 수동 검증 API + Admin UI Verify 버튼 | m18 | FIXED | 2026-02-17 |
| 058 | BUG | MEDIUM | WalletConnect 셧다운 시 DB 연결 종료 후 스토리지 쓰기 시도 | m19 | FIXED | 2026-02-17 |
| 059 | ENHANCEMENT | MEDIUM | Contract Test Suite 크로스 패키지 Import 구조 개선 | m20 | FIXED | 2026-02-17 |
| 060 | BUG | MEDIUM | adapter-solana 커버리지 임계값과 실제 수치 불일치 (branches 75% vs 68.29%) | m20 | FIXED | 2026-02-17 |
| 061 | BUG | MEDIUM | admin 커버리지 임계값과 실제 수치 불일치 (functions 70% vs 58.48%) | m20 | FIXED | 2026-02-17 |
| 062 | BUG | MEDIUM | cli 커버리지 임계값과 실제 수치 불일치 (lines/statements 70% vs 68.49%) | m20 | FIXED | 2026-02-17 |
| 063 | BUG | HIGH | killswitch 보안 테스트 `now` 변수명 오류 — lint 수정 시 사용처 누락 (23건) | m20 | FIXED | 2026-02-17 |
| 064 | BUG | HIGH | session-auth 보안 테스트 `walletA` 변수명 오류 — lint 수정 시 사용처 누락 (1건) | m20 | FIXED | 2026-02-17 |
| 065 | BUG | HIGH | CI coverage report 경로 이중화 — working-directory + 절대 경로 충돌 | m20 | FIXED | 2026-02-17 |
| 066 | ENHANCEMENT | MEDIUM | CLAUDE.md 영문 번역 — 오픈소스 기여자용 | m21 | FIXED | 2026-02-18 |
| 067 | ENHANCEMENT | HIGH | README 재작성 — 퍼블릭 리포 전환 대비 | m21 | FIXED | 2026-02-18 |
| 068 | ENHANCEMENT | MEDIUM | 지갑 생성 시 기본 세션 자동 생성 | m21 | FIXED | 2026-02-18 |
| 069 | ENHANCEMENT | MEDIUM | 세션 기본 TTL 대폭 연장 + 하드코딩 Admin Settings 이관 | m21 | FIXED | 2026-02-18 |
| 070 | ENHANCEMENT | LOW | 폐기된 tag-release.sh 스크립트 제거 | m21 | FIXED | 2026-02-18 |
| 071 | ENHANCEMENT | MEDIUM | 배포 패키지 스모크 테스트 자동화 (npm pack) | m21 | FIXED | 2026-02-18 |
| 072 | ENHANCEMENT | LOW | CLAUDE.md 언어 컨벤션에 태그/릴리스 영문 규칙 추가 | m20 | FIXED | 2026-02-18 |
| 073 | ENHANCEMENT | MEDIUM | 정식 릴리스 승격 스크립트 자동화 (promote-release.sh) | m20 | FIXED | 2026-02-18 |
| 074 | ENHANCEMENT | MEDIUM | 마일스톤 목표 문서 명명 규칙 변경 — 버전 제거, 순번 기반 | m20 | FIXED | 2026-02-18 |
| 075 | ENHANCEMENT | LOW | 마일스톤 파일명에 -00 서브순번 통일 + CLAUDE.md 영문 규칙 | m20 | FIXED | 2026-02-18 |
| 076 | BUG | HIGH | Smoke Test가 npm pack으로 workspace:* 미해석 — ESM import 실패 | m21 | FIXED | 2026-02-18 |
| 077 | BUG | HIGH | Smoke Test pnpm pack 출력 경로 이중화로 install 실패 (exit 254) | m21 | FIXED | 2026-02-18 |
| 078 | BUG | HIGH | Smoke Test 워크스페이스 상호 의존 패키지 설치 순서 오류 + CLI ESM import 부적절 | v2.2 | FIXED | 2026-02-18 |
| 079 | ENHANCEMENT | MEDIUM | vitest 고아 프로세스 재발 방지 — 전 패키지 forceExit + forks pool 통일 | v2.2 | FIXED | 2026-02-18 |
| 080 | BUG | MEDIUM | Graceful Shutdown 후 process.exit(0) 미호출로 프로세스 미종료 | v2.2 | FIXED | 2026-02-18 |
| 081 | BUG | HIGH | npm publish에서 RC 버전이 latest 태그로 배포됨 | v2.3 | FIXED | 2026-02-18 |
| 082 | BUG | CRITICAL | release.yml이 npm publish 사용하여 workspace:* 미치환 상태로 배포됨 | v2.3 | FIXED | 2026-02-18 |
| 083 | ENHANCEMENT | MEDIUM | README를 npm quickstart 중심으로 재구성 | v2.3 | FIXED | 2026-02-18 |
| 084 | BUG | HIGH | @waiaas/daemon npm 패키지에 Admin UI 정적 파일 누락 — turbo 캐시 히트 시 postbuild 건너뜀 | v2.3 | FIXED | 2026-02-18 |
| 085 | ENHANCEMENT | MEDIUM | 스킬 파일 버전 자동 동기화 + 연결 디스커버리 가이드 추가 | v2.4 | FIXED | 2026-02-19 |
| 086 | BUG | HIGH | CI --affected가 push to main에서 변경 감지 실패 + 알림 테스트 텍스트 불일치 | v2.3 | FIXED | 2026-02-18 |
| 087 | ENHANCEMENT | MEDIUM | AI 에이전트용 연결 프롬프트(매직워드) 복사 기능 | v2.4 | FIXED | 2026-02-19 |
| 088 | BUG | MEDIUM | NotificationService가 config.toml enabled=false일 때 미생성되어 Admin UI에서 알림 활성화 불가 | v2.4 | FIXED | 2026-02-19 |
| 089 | ENHANCEMENT | LOW | Admin UI JWT Rotation 명칭/설명이 내부 구현 용어 사용 — 사용자 이해 어려움 | v2.4 | FIXED | 2026-02-19 |
| 090 | BUG | HIGH | 데몬 시작 시 마스터 패스워드 검증 없음 — 잘못된 패스워드로 시작 후 서명 시점에야 실패 | v2.4 | FIXED | 2026-02-19 |
| 091 | ENHANCEMENT | LOW | quickset 명령어 추가 — quickstart와 start 이름 혼동 해소 | v2.4 | FIXED | 2026-02-19 |
| 092 | BUG | MEDIUM | npm 패키지 homepage + repository URL 잘못 설정 — 패키지 페이지에서 리포지토리 접근 불가 | v2.4 | FIXED | 2026-02-19 |
| 093 | BUG | HIGH | npm 패키지 페이지에 README 미표시 — 개별 패키지 디렉토리에 README.md 없음 | v2.4 | FIXED | 2026-02-19 |
| 094 | ENHANCEMENT | MEDIUM | Admin 지갑 상세에서 모든 네트워크 잔액 미표시 — defaultNetwork 하나만 조회 | v2.4 | FIXED | 2026-02-19 |
| 095 | ENHANCEMENT | MEDIUM | Admin 세션 페이지에서 MCP 세션 식별 불가 — source 컬럼 없음 | v2.4 | FIXED | 2026-02-19 |
| 096 | ENHANCEMENT | MEDIUM | Admin 다중 지갑 일괄 세션/MCP 토큰 생성 기능 미지원 | v2.5 | FIXED | 2026-02-19 |
| 097 | BUG | MEDIUM | Admin Owner 주소 등록 실패 시 구체적 에러 사유 미표시 — serverMessage 무시 | v2.5 | FIXED | 2026-02-19 |
| 098 | BUG | MEDIUM | Admin Owner 주소 등록 후 ownerState 즉시 미반영 — PUT 응답에 ownerState 누락 | v2.5 | FIXED | 2026-02-19 |
| 099 | ENHANCEMENT | LOW | WalletConnect 미설정 에러 시 설정 위치(Wallets > WalletConnect 탭) 이동 안내 없음 | v2.5 | FIXED | 2026-02-19 |
| 100 | BUG | CRITICAL | npm publish가 workspace:* 미치환 상태로 배포 — RC 버전 글로벌 설치 불가 | v2.5 | FIXED | 2026-02-19 |
| 101 | BUG | MEDIUM | Admin 알림 전체 활성 토글이 Telegram 영역 안에 배치 + 비활성 배너가 config.toml 참조 | v2.5 | FIXED | 2026-02-19 |
| 102 | ENHANCEMENT | LOW | CLI `upgrade` → `update` 주 명령어 변경 + `upgrade` 별칭 유지 | v2.6 | FIXED | 2026-02-20 |
| 103 | ENHANCEMENT | MEDIUM | Admin UI 대시보드에 업데이트 가능 배너 추가 | v2.6 | FIXED | 2026-02-20 |
| 104 | ENHANCEMENT | MEDIUM | MCP 서버에서 AI 에이전트에게 업데이트 가능 알림 제공 | v2.6 | FIXED | 2026-02-20 |
| 105 | ENHANCEMENT | LOW | 노티피케이션 채널을 통한 데몬 업데이트 알림 발송 | v2.6 | FIXED | 2026-02-20 |
| 106 | ENHANCEMENT | MEDIUM | 매직워드 대시보드 전용 카드 승격 + REST API 추가 + skills 반영 | v2.6 | FIXED | 2026-02-20 |
| 107 | MISSING | HIGH | 신규/누락 패키지 release-please + CI 커버리지 설정 등록 | v2.6 | FIXED | 2026-02-20 |
| 108 | MISSING | HIGH | wallet-sdk 연동 가이드 문서 작성 | v2.6.1 | FIXED | 2026-02-20 |
| 109 | ENHANCEMENT | LOW | 기존 마일스톤 목표 문서에 상태 헤더 추가 | v2.6.1 | FIXED | 2026-02-20 |
| 110 | ENHANCEMENT | LOW | 소스코드 메시지 및 문서에서 `waiaas upgrade` → `waiaas update` 일괄 변경 | v2.6.1 | FIXED | 2026-02-20 |
| 111 | ENHANCEMENT | MEDIUM | OpenClaw 연동 퀵 가이드 + 스킬 설치 명령어 | v2.6.1 | FIXED | 2026-02-20 |
| 112 | ENHANCEMENT | MEDIUM | 기본 환경 모드를 testnet → mainnet으로 변경 | v2.6.1 | FIXED | 2026-02-20 |
| 113 | ENHANCEMENT | MEDIUM | Claude Code 연동 퀵 가이드 + 스킬 설치 명령어 | v2.6.1 | FIXED | 2026-02-20 |
| 114 | ENHANCEMENT | MEDIUM | 범용 Agent Skills 연동 가이드 + 플랫폼별 설치 명령어 | v2.6.1 | FIXED | 2026-02-20 |
| 115 | BUG | MEDIUM | Notifications 상태 API가 정적 config 참조하여 활성화 배너 미갱신 | v2.6.1 | FIXED | 2026-02-20 |
| 116 | BUG | MEDIUM | Telegram Bot Enabled 저장 후 비활성화로 되돌림 | v2.6.1 | FIXED | 2026-02-20 |
| 117 | BUG | MEDIUM | Admin UI 정책 기본값 체크박스 클릭 시 즉시 반영 안 됨 — dirty/value 키 불일치 | v26.3 | FIXED | 2026-02-20 |
| 118 | ENHANCEMENT | LOW | 에이전트 연동 가이드를 docs/guides/ 폴더로 이동 + README 링크 추가 | v26.3 | FIXED | 2026-02-20 |
| 119 | MISSING | MEDIUM | wallet-sdk 연동 가이드에 Push Relay 시나리오 누락 | v26.4 | FIXED | 2026-02-21 |
| 120 | ENHANCEMENT | MEDIUM | 정식 릴리스 승격을 GitHub Actions workflow_dispatch로 자동화 | v26.4 | FIXED | 2026-02-21 |
| 121 | ENHANCEMENT | LOW | stable 릴리스 배포 후 prerelease 모드 자동 복원 | v26.4 | FIXED | 2026-02-21 |
| 122 | MISSING | MEDIUM | Claude Code 연동 가이드에 세션 토큰 설정 방법 누락 | v26.5 | FIXED | 2026-02-21 |
| 123 | BUG | HIGH | 에이전트 프롬프트에 지갑 UUID 및 사용 가능 네트워크 누락 | v26.5 | FIXED | 2026-02-21 |
| 124 | ENHANCEMENT | MEDIUM | 매직워드 프롬프트 생성 시 기존 세션 재활용 | v26.5 | FIXED | 2026-02-21 |
| 125 | ENHANCEMENT | MEDIUM | Admin UI 세션 토큰 재발급 + 발급 이력 추적 | v26.5 | FIXED | 2026-02-21 |
| 126 | BUG | MEDIUM | release.yml prerelease 복원 스텝이 detached HEAD에서 push 실패 | v26.5 | FIXED | 2026-02-21 |
| 127 | BUG | HIGH | Promote RC 워크플로우가 번호 없는 RC 태그를 거부 | v27.0 | FIXED | 2026-02-21 |
| 128 | ENHANCEMENT | HIGH | 에이전트 읽기 전용 API 접근 확대 + 스킬 파일 권한 구분 명확화 | v27.0 | FIXED | 2026-02-21 |
| 129 | BUG | HIGH | 데몬 재시작 시 Admin UI에서 설정한 알림 채널이 로드되지 않음 | v27.0 | FIXED | 2026-02-21 |
| 130 | ENHANCEMENT | MEDIUM | 1:N 세션 모델 도입으로 불필요해진 벌크 세션/MCP 토큰 생성 기능 제거 | v27.0 | FIXED | 2026-02-21 |
| 131 | ENHANCEMENT | MEDIUM | X402_ALLOWED_DOMAINS 정책에 default-deny 토글 추가 | v27.1 | FIXED | 2026-02-21 |
| 132 | BUG | HIGH | Admin UI에서 킬 스위치 Recover 시 SYSTEM_LOCKED 에러 발생 | v27.1 | FIXED | 2026-02-21 |
| 133 | MISSING | HIGH | 지갑 Suspend/Resume REST API 및 Admin UI 버튼 추가 | v27.1 | FIXED | 2026-02-21 |
| 134 | ENHANCEMENT | MEDIUM | 킬 스위치 Recover의 dual-auth(owner 서명) 요구 제거 | v27.1 | FIXED | 2026-02-21 |
| 135 | ENHANCEMENT | MEDIUM | 알림 메시지에서 walletId 대신 walletName 주 표시 + 부가 정보 축약 | v27.1 | FIXED | 2026-02-21 |
| 136 | BUG | HIGH | 루트 skills/와 packages/skills/skills/ 내용 불일치로 npm에 오래된 스킬 배포 | v27.1 | FIXED | 2026-02-21 |
| 137 | BUG | MEDIUM | 알림 메시지 제목 중복 표시 — 4개 채널 모두 title이 2번 출력 | v27.1 | FIXED | 2026-02-21 |
| 138 | BUG | LOW | 시스템 이벤트 알림에 불필요한 Wallet/타임스탬프 표시 — UPDATE_AVAILABLE 등 | v27.1 | FIXED | 2026-02-21 |
| 139 | BUG | HIGH | telegram.enabled 미제거 — Approval Method가 Telegram Bot 비활성으로 판단 | v27.1 | FIXED | 2026-02-22 |
| 140 | ENHANCEMENT | LOW | Approval Method 라벨 "SDK" → "Wallet App" 변경 — 사용자 직관성 개선 | v27.1 | FIXED | 2026-02-22 |
| 141 | BUG | HIGH | Signing SDK 설정이 리뉴얼된 Admin UI에서 접근 불가 — 메뉴 재구성 시 누락 | v27.1 | FIXED | 2026-02-22 |
| 142 | ENHANCEMENT | MEDIUM | 알림 카테고리 필터 통합 — 일반 채널 + 지갑 앱 채널 단일 설정 | v27.1 | FIXED | 2026-02-22 |
| 143 | BUG | CRITICAL | Confirmation Worker RPC 콜백 미주입 — DETECTED→CONFIRMED 전이 불가 | v27.2 | FIXED | 2026-02-22 |
| 144 | MISSING | MEDIUM | SDK Signing E2E 라이브 인프라 수동 테스트 미검증 (ntfy/Telegram) | v2.6.1 | WONTFIX | 2026-02-22 |
| 145 | BUG | LOW | README/deployment.md CLI 문법 불일치 — `add --all` vs `add all` | v2.0 | FIXED | 2026-02-22 |
| 146 | BUG | LOW | examples/simple-agent/README.md 깨진 링크 + placeholder URL + 구버전 | v27.2 | FIXED | 2026-02-22 |
| 147 | BUG | LOW | validate-openapi.ts `@see` 주석 경로 불일치 | v2.0 | FIXED | 2026-02-22 |
| 148 | ENHANCEMENT | MEDIUM | 알림 메시지에 블록 익스플로러 링크 추가 + {txId} 미치환 버그 수정 | v27.2 | FIXED | 2026-02-22 |
| 149 | ENHANCEMENT | HIGH | 에이전트가 마스터 패스워드를 요청하지 못하도록 차단 | v27.2 | FIXED | 2026-02-22 |
| 150 | ENHANCEMENT | LOW | 알림 카테고리 필터 전체 언체크 시 UX 혼동 — 전체 수신이 빈 체크로 표시 | v27.4 | FIXED | 2026-02-23 |
| 151 | ENHANCEMENT | MEDIUM | CLI에서 에이전트 프롬프트(매직워드) 생성 명령어 추가 — `waiaas session prompt` | v27.4 | FIXED | 2026-02-23 |
| 152 | ENHANCEMENT | MEDIUM | CLI에서 지갑 생성 명령어 추가 — `waiaas wallet create` | v27.4 | FIXED | 2026-02-23 |
| 153 | ENHANCEMENT | MEDIUM | Admin UI Transactions + Incoming TX 페이지 통합 | v28.1 | FIXED | 2026-02-23 |
| 154 | ENHANCEMENT | LOW | Balance Monitoring 설정을 Notifications 페이지로 이동 | v28.1 | FIXED | 2026-02-23 |
| 155 | ENHANCEMENT | MEDIUM | 알림 필터링을 이벤트 단위로 세분화 | v28.1 | FIXED | 2026-02-23 |
| 156 | BUG | MEDIUM | FilterBar / SearchInput CSS 스타일 누락으로 UI 엉성 | v28.1 | FIXED | 2026-02-23 |
| 157 | BUG | HIGH | IncomingTxMonitorService가 삭제된 wallets.network 컬럼 참조 | v28.2 | FIXED | 2026-02-24 |
| 158 | ENHANCEMENT | HIGH | 빌트인 액션 프로바이더 Admin UI 페이지 + API 키 미설정 알림 | v28.2 | FIXED | 2026-02-24 |
| 159 | ENHANCEMENT | HIGH | 딜레이/승인 대기 거래 취소 UX 개선 (Telegram 버튼 + Admin UI) | v28.2 | FIXED | 2026-02-24 |
| 160 | BUG | HIGH | connect-info API가 글로벌 정책(walletId=NULL)을 누락 | v28.2 | FIXED | 2026-02-24 |
| 161 | BUG | MEDIUM | connect-info 프롬프트가 에이전트 읽기 가능 엔드포인트를 차단/누락 | v28.2 | FIXED | 2026-02-24 |
| 162 | MISSING | HIGH | 스킬 파일 마스터 패스워드 요청 금지 안내 누락 + 유지 보장 | v28.2 | FIXED | 2026-02-24 |
| 163 | BUG | HIGH | 알림 메시지 {txId} 미치환 회귀 — TX_APPROVAL_REQUIRED, TX_FAILED 등 6곳 | v28.2 | FIXED | 2026-02-24 |
| 164 | ENHANCEMENT | MEDIUM | 인커밍 모니터링이 환경 기본 네트워크만 구독 (전체 네트워크 미지원) | v28.2 | FIXED | 2026-02-24 |
| 165 | ENHANCEMENT | HIGH | 알림 메시지 금액이 최소 단위(wei/lamports)로 표시 (사람 친화적 포맷 미지원) | v28.2 | FIXED | 2026-02-24 |
| 166 | BUG | HIGH | WalletConnect 핫리로드 시 WcSigningBridge 미생성 — 서명 요청 전달 불가 | v28.2 | FIXED | 2026-02-24 |
| 167 | BUG | HIGH | IncomingTxMonitor EVM RPC 설정 키 중복으로 모든 EVM 네트워크 구독 실패 | v28.3 | FIXED | 2026-02-24 |
| 168 | ENHANCEMENT | MEDIUM | Admin UI 트랜잭션 금액이 raw 단위(lamports/wei)로 표시 | v28.4 | FIXED | 2026-02-24 |
| 169 | BUG | HIGH | IncomingTxMonitor EVM 폴링이 무료 RPC 엔드포인트 rate limit 초과 | v28.4 | FIXED | 2026-02-24 |
| 170 | BUG | HIGH | Admin UI Actions 페이지 접근 시 401 — sessionAuth 미스매치 | v28.4 | FIXED | 2026-02-24 |
| 171 | BUG | HIGH | Admin UI apiCall 글로벌 401 핸들러가 비-admin 엔드포인트 401에도 로그아웃 트리거 | v28.3 | FIXED | 2026-02-24 |
| 172 | BUG | HIGH | EVM IncomingTxMonitor getBlock(includeTransactions:true)가 L2 체인에서 타임아웃 | v28.3 | FIXED | 2026-02-24 |
| 173 | BUG | HIGH | Admin UI 정책 기본값 체크박스가 항상 해제 상태로 표시 — policies.tsx 카테고리 불일치 | v28.4 | FIXED | 2026-02-24 |
| 174 | ENHANCEMENT | HIGH | connect-info 프롬프트에 default-deny 상태 미포함 — 에이전트 잘못된 안내 | v28.4 | FIXED | 2026-02-24 |
| 175 | BUG | HIGH | EVM IncomingSubscriber per-wallet 폴링 에러 시 무한 재시도 + 로그 스팸 | v28.4 | FIXED | 2026-02-24 |
| 176 | BUG | HIGH | 액션 프로바이더 기본 비활성 + 런타임 활성화 시 레지스트리 미갱신 (핫 리로드 누락) | v28.5 | FIXED | 2026-02-24 |
| 177 | ENHANCEMENT | MEDIUM | 지갑 상세 트랜잭션 목록 금액이 최소 단위(lamports/wei)로 표시 | v28.5 | FIXED | 2026-02-24 |
| 178 | BUG | HIGH | Admin UI Actions 페이지에 LI.FI, Lido, Jito 프로바이더 미표시 — 하드코딩 누락 | v28.5 | FIXED | 2026-02-24 |
| 179 | MISSING | MEDIUM | CoinGecko 가격 오라클 API 키 설정 Admin UI 누락 | v28.5 | FIXED | 2026-02-24 |
| 180 | ENHANCEMENT | LOW | System 페이지 API Keys 섹션이 Actions 페이지와 중복 — 단일화 필요 | v28.5 | FIXED | 2026-02-24 |
| 181 | BUG | CRITICAL | Admin UI 네비게이션 불가 — dirty-guard isDirty 크래시 (t.isDirty is not a function) | v28.5 | FIXED | 2026-02-24 |
| 182 | ENHANCEMENT | LOW | Admin Settings 외부 서비스 도움 URL 추가 — API 키 발급처 안내 누락 | v28.5 | FIXED | 2026-02-25 |
| 183 | ENHANCEMENT | LOW | Admin UI 정책 생성 시 타입별 한 줄 설명 추가 — 정책 유형 이해 어려움 | v28.5 | FIXED | 2026-02-25 |
| 184 | ENHANCEMENT | MEDIUM | 테스트 커버리지 임계값 상향 + 미설정 패키지 추가 — 실제 수치 대비 기준 과소 | v28.5 | FIXED | 2026-02-25 |
| 185 | BUG | HIGH | EVM IncomingSubscriber free-tier RPC 408 타임아웃으로 수신 트랜잭션 무음 누락 | v28.5 | FIXED | 2026-02-25 |
| 186 | BUG | CRITICAL | LI.FI getQuote 쿼리 파라미터명 오류로 스왑/브릿지 전체 실패 | v28.5 | FIXED | 2026-02-25 |
| 187 | BUG | HIGH | 솔라나 메인넷 잔액 조회 429 실패 — 무료 RPC rate limit + 재시도 로직 부재 | v28.5 | FIXED | 2026-02-25 |
| 188 | BUG | HIGH | Admin UI Actions 프로바이더가 항상 Inactive — `/v1/actions/*` 와일드카드 sessionAuth 충돌 | v28.5 | FIXED | 2026-02-25 |
| 189 | ENHANCEMENT | HIGH | 에이전트 Zero-State 셋업 스킬 + 가이드 경량화 + README 진입점 | v28.7 | FIXED | 2026-02-25 |
| 190 | BUG | HIGH | LI.FI + 0x resolve() value hex→decimal 변환 누락으로 스왑/브릿지 실패 | v28.8 | FIXED | 2026-02-25 |
| 191 | BUG | CRITICAL | 세션 TTL이 1일로 적용 — quickset expiresIn/ttl 필드 불일치 + 스키마 max 7일 제한 | v28.8 | FIXED | 2026-02-25 |
| 192 | MISSING | MEDIUM | 세션 토큰 영구 만료 시 에이전트 자력 복구 불가 — 복구 프로세스 스킬 필요 | v28.8 | FIXED | 2026-02-25 |
| 193 | ENHANCEMENT | MEDIUM | 네트워크별 WSS URL 설정 + EVM WSS 구독 지원 — 인커밍 모니터 개선 | v28.8 | FIXED | 2026-02-26 |
| 194 | BUG | CRITICAL | 데몬 장시간 실행 시 응답 불능 — reconnectLoop 무지연 루프 + fetch 타임아웃 부재 | v28.8 | FIXED | 2026-02-26 |
| 195 | MISSING | MEDIUM | CLI 텔레그램 알림 설정 명령어 추가 (`waiaas notification setup`) | v29.0 | FIXED | 2026-02-26 |
| 196 | ENHANCEMENT | LOW | CLAUDE.md에 Admin Settings 우선 사용 컨벤션 추가 | v29.0 | FIXED | 2026-02-26 |
| 197 | BUG | MEDIUM | Admin UI RPC 빌트인 URL 하드코딩 중복으로 동기화 깨짐 — API 기반 전환 필요 | v29.0 | FIXED | 2026-02-26 |
| 198 | MISSING | LOW | Wallet SDK 연동 가이드에 Push Relay 페이로드 커스텀 섹션 누락 | v29.0 | FIXED | 2026-02-26 |
| 199 | BUG | HIGH | EVM 수신 폴링이 RPC Pool 우회하여 단일 엔드포인트만 사용 | v29.0 | FIXED | 2026-02-26 |
| 200 | ENHANCEMENT | HIGH | Auto-Provision 모드: 마스터 패스워드 없는 초기 셋업 + set-master 인계 | v29.2 | FIXED | 2026-02-27 |
| 201 | ENHANCEMENT | MEDIUM | Auto-Provision 문서 동기화: 스킬 파일 + 가이드 + README | v29.2 | FIXED | 2026-02-27 |
| 202 | ENHANCEMENT | MEDIUM | deployment.md 현행화: Admin Settings 우선 + #200 Auto-Provision 반영 | v29.2 | FIXED | 2026-02-27 |
| 203 | BUG | HIGH | EVM 수신 모니터 eth_getLogs address 필터 누락으로 반복 실패 | v29.2 | FIXED | 2026-02-27 |
| 204 | BUG | HIGH | AUTO-03 idle timeout이 세션을 revoke하여 에이전트 운영 방해 | v29.2 | FIXED | 2026-02-27 |
| 205 | ENHANCEMENT | MEDIUM | 알림 메시지에서 트랜잭션 타입 구분 불가 — CONTRACT_CALL 등이 "전송"으로 표시 | v29.2 | FIXED | 2026-02-27 |
| 206 | BUG | HIGH | 알림 메시지에 트랜잭션 실제 네트워크 대신 지갑 기본 네트워크 표시 | v29.2 | FIXED | 2026-02-27 |
| 207 | BUG | HIGH | 파이프라인 재진입 시 notificationService 누락으로 대기 트랜잭션 알림 미발송 | v29.3 | FIXED | 2026-02-27 |
| 208 | BUG | CRITICAL | DELAY/GAS_WAITING 재진입 시 원본 요청 데이터 손실로 트랜잭션 변질 | v29.3 | FIXED | 2026-02-27 |
| 209 | ENHANCEMENT | MEDIUM | 테스트 커버리지 임계값 상향 — 실제 수치 대비 과소 설정 + CI Gate soft mode | v29.3 | FIXED | 2026-02-27 |
| 210 | ENHANCEMENT | HIGH | Sepolia 빌트인 RPC 엔드포인트 확장 — 무료 티어 제한으로 수신 모니터 중단 | v29.4 | FIXED | 2026-02-28 |
| 211 | ENHANCEMENT | LOW | Solana 네트워크 ID에 `solana-` 프리픽스 추가 — EVM과 네이밍 규칙 통일 | m29-05 | FIXED | 2026-02-28 |
| 212 | BUG | CRITICAL | 액션 라우트 GAP-2 fix가 stage1Validate의 originalRequest 메타데이터 덮어씀 — #208 수정 불완전 | v29.4 | FIXED | 2026-02-28 |
| 213 | ENHANCEMENT | LOW | Admin UI 지갑 리스트에서 BALANCE 컬럼 제거 — 기본 네트워크 제거로 단일 잔액 무의미 | v29.4 | FIXED | 2026-02-28 |
| 214 | BUG | CRITICAL | API 키 이중 저장소 비동기화로 프로바이더에 키 미전달 — ApiKeyStore ↔ SettingsService 불일치 | m29-05 | FIXED | 2026-02-28 |
| 215 | ENHANCEMENT | MEDIUM | Push Relay 서명 응답 릴레이 엔드포인트 추가 — 지갑 앱이 ntfy 직접 접근 불필요하도록 | v29.5 | FIXED | 2026-02-28 |
| 216 | BUG | HIGH | Solana WSS URL 설정 키에 `solana-` 프리픽스 누락 — IncomingTxMonitor 구독 실패 | v29.6 | FIXED | 2026-03-01 |
| 217 | BUG | HIGH | 기본 네트워크 제거 잔재 — Lido 팩토리 에러 + OpenAPI/코멘트 불일치 | v29.6 | FIXED | 2026-03-01 |
| 218 | ENHANCEMENT | HIGH | SDK auto-connect — 데몬 자동 탐색 + 옵트인 자동 기동 | v29.8 | FIXED | 2026-03-02 |
| 219 | BUG | CRITICAL | Push Relay 서버 시작 10초 후 강제 종료 — Shutdown 타이머 즉시 시작 | v29.8 | FIXED | 2026-03-01 |
| 220 | MISSING | LOW | Push Relay 서버 버전 정보 노출 수단 없음 — health/로그/CLI 모두 미지원 | v29.9 | FIXED | 2026-03-02 |
| 221 | BUG | HIGH | SignRequestSchema chain 열거값 불일치 — `'evm'` vs SSoT `'ethereum'` | v29.9 | FIXED | 2026-03-02 |
| 222 | BUG | HIGH | Push Relay ntfy SSE gzip 미해제로 JSON 파싱 실패 — Accept-Encoding: identity가 원인 | v29.10 | FIXED | 2026-03-02 |
| 223 | ENHANCEMENT | LOW | 프리셋 지갑의 Approval Method 변경 시 경고 미표시 | v29.10 | FIXED | 2026-03-02 |
| 224 | BUG | MEDIUM | Approval Method에서 Telegram 설정 상태를 불완전하게 체크 — notifications 토큰 폴백 미확인 | v29.10 | FIXED | 2026-03-02 |
| 225 | BUG | LOW | Approval Method 경고 메시지가 이전 메뉴 경로 참조 — System > Signing SDK (v29.7에서 이동됨) | v29.10 | FIXED | 2026-03-02 |
| 226 | BUG | CRITICAL | 세션 클린업 워커가 무제한 세션(expires_at=0)을 만료로 삭제 — SESSION_NOT_FOUND | v29.10 | FIXED | 2026-03-02 |
| 227 | BUG | MEDIUM | 지갑 앱 알림 발송이 notification_logs에 미기록 — Admin UI에 Telegram만 표시 | v29.10 | FIXED | 2026-03-02 |
| 228 | BUG | MEDIUM | Admin UI ntfy Channel Status가 항상 "Not Configured" — 지갑별 토픽 미반영 | v29.10 | FIXED | 2026-03-02 |
| 229 | ENHANCEMENT | HIGH | 지갑 앱 알림 설정을 Human Wallet Apps 페이지로 통합 + 테스트 버튼 | v29.10 | FIXED | 2026-03-02 |
| 230 | ENHANCEMENT | HIGH | wallet_apps wallet_type / name 분리 — 동일 지갑 종류 다중 디바이스 등록 | — | FIXED | 2026-03-02 |
| 231 | ENHANCEMENT | HIGH | 구독 토큰 기반 ntfy 토픽 라우팅 — 알림 격리 + 토픽 보안 (#230 선행) | — | FIXED | 2026-03-02 |
| 232 | BUG | MEDIUM | Human Wallet Apps ntfy Server URL이 미등록 키 사용 — 설정 변경 무효 + Notifications와 중복 | — | FIXED | 2026-03-02 |
| 233 | MISSING | MEDIUM | Wallet SDK에 Push Relay 디바이스 등록 헬퍼 추가 — registerDevice/unregisterDevice/getSubscriptionToken | — | FIXED | 2026-03-02 |
| 234 | BUG | HIGH | Push Relay DeviceRegistry 마이그레이션 UNIQUE 컬럼 추가 실패 — SQLite ALTER TABLE 제약 | — | FIXED | 2026-03-02 |
| 235 | BUG | HIGH | Push Relay ntfy SSE 수동 decompression 필요 — #222 수정 불완전, undici SSE auto-decompress 불안정 | — | FIXED | 2026-03-02 |
| 236 | BUG | CRITICAL | Push Relay ntfy SSE 압축 해제 4회 수정 후 재발 — undici fetch() 완전 제거 필요 | — | FIXED | 2026-03-02 |
| 237 | MISSING | HIGH | Push Relay 디바이스 등록 시 subscription token 기반 토픽 동적 구독 미구현 | — | FIXED | 2026-03-02 |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 0
- **FIXED:** 237
- **RESOLVED:** 0
- **VERIFIED:** 0
- **WONTFIX:** 1
- **Total:** 238
