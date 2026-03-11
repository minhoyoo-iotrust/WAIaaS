# Issue Tracker

> 이슈 추적 현황. 새 이슈는 `{NNN}-{slug}.md`로 추가하고 이 표를 갱신한다.

## Status Legend

| 상태 | 설명 |
|------|------|
| OPEN | 미처리 — 수정 필요 |
| FIXED | 수정 완료 — 코드 반영됨 |
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
| 238 | ENHANCEMENT | HIGH | Push Relay SSE 구독을 fetch()로 단순화 — node:http 수동 디컴프레션 제거 | — | FIXED | 2026-03-03 |
| 239 | BUG | HIGH | 지갑 앱 테스트 알림이 plain text로 전송되어 Push Relay 파싱 실패 | — | FIXED | 2026-03-03 |
| 240 | BUG | HIGH | Push Relay 기본 토픽 브로드캐스트 제거 — 디바이스 토픽 유니캐스트만 허용 | — | FIXED | 2026-03-03 |
| 241 | BUG | MEDIUM | 지갑 앱 테스트 알림이 subscriptionToken 미설정 상태에서도 발송 성공 | — | FIXED | 2026-03-03 |
| 242 | BUG | CRITICAL | WalletNotificationChannel 비ASCII Title 헤더로 ntfy 발송 silent failure | — | FIXED | 2026-03-03 |
| 243 | BUG | CRITICAL | Push Relay SSE 압축 해제 5회차 재발 — 서명 요청 미수신 (#222,#235,#236,#238) | — | FIXED | 2026-03-03 |
| 244 | BUG | MEDIUM | APPROVAL_CHANNEL_SWITCHED 알림 {txId} 미치환 — vars 대신 details에 전달 | — | FIXED | 2026-03-03 |
| 245 | BUG | HIGH | Stage4 WcSigningBridge가 비WC 지갑에도 무조건 실행 — 거짓 채널 전환 알림 + DB 오염 | — | FIXED | 2026-03-03 |
| 246 | BUG | CRITICAL | APPROVAL 티어 승인 후 파이프라인 미재개 — 모든 승인 경로에서 executeFromStage5 호출 누락 | — | FIXED | 2026-03-03 |
| 247 | MISSING | MEDIUM | 범용 EIP-712 signTypedData API 지원 | v30.9 | FIXED | 2026-03-05 |
| 248 | ENHANCEMENT | MEDIUM | Admin 대시보드 Recent Activity 트랜잭션 금액이 raw 단위로 표시 | v30.9 | FIXED | 2026-03-05 |
| 249 | BUG | HIGH | Admin UI Smart Account 생성 시 필드명 불일치 (provider→aaProvider 등) — validation 실패 | v30.9 | FIXED | 2026-03-05 |
| 250 | ENHANCEMENT | MEDIUM | 세션 토큰 재발급(Rotate) 기능 — 메타데이터 유지하며 토큰만 교체, Admin UI 복사 다이얼로그 | — | FIXED | 2026-03-06 |
| 251 | BUG | HIGH | Smart Account 파이프라인에서 RPC URL 미해석 — adapter private 필드 참조로 전 네트워크 AA 전송 실패 | — | FIXED | 2026-03-06 |
| 252 | ENHANCEMENT | MEDIUM | Smart Account 페이마스터 Policy ID 전달 경로 추가 — Alchemy 대납 필수, Pimlico 한도 제어 | — | FIXED | 2026-03-06 |
| 253 | ENHANCEMENT | MEDIUM | Push Relay 서버 --debug 모드 추가 — 로그 레벨 시스템 + 상세 디버깅 로그 | v31.2 | FIXED | 2026-03-06 |
| 254 | BUG | HIGH | Push Relay 서버 CORS 미들웨어 미설정으로 cross-origin 디바이스 등록 차단 | v31.2 | FIXED | 2026-03-06 |
| 255 | ENHANCEMENT | MEDIUM | Pushwoosh API base URL 설정 가능하도록 개선 — 기본값 api.pushwoosh.com 변경 + config.toml api_url 옵션 | v31.3 | FIXED | 2026-03-07 |
| 256 | ENHANCEMENT | HIGH | Smart Account 멀티체인 Factory 전환 (permissionless.js) — Solady factory 2개 체인 제한 해소 + 기존 AA 지갑 deprecation | v31.3 | FIXED | 2026-03-07 |
| 257 | BUG | MEDIUM | Admin UI Drift Perp 활성화 상태가 항상 Inactive — BUILTIN_PROVIDERS key `drift_perp` vs DB key `drift` 불일치 | — | FIXED | 2026-03-07 |
| 258 | BUG | HIGH | Admin 세션 Reissue가 무제한 세션을 만료로 판정 — expiresAt=0 가드 누락 + 헬퍼 함수 도입으로 재발 방지 | v31.3 | FIXED | 2026-03-07 |
| 259 | BUG | HIGH | Admin UI ERC-8004 페이지 wallets API 응답 형식 불일치로 무한 로딩 | v31.3 | FIXED | 2026-03-07 |
| 260 | BUG | HIGH | 스테이킹 포지션 미표시 — CONTRACT_CALL amount NULL 저장 | v31.3 | FIXED | 2026-03-07 |
| 261 | BUG | HIGH | Solana simulateTransaction 에러 객체 BigInt JSON 직렬화 실패 — 실패 사유 마스킹 | — | FIXED | 2026-03-07 |
| 262 | MISSING | MEDIUM | Admin UI Actions 페이지에 D'CENT Swap 프로바이더 미표시 — BUILTIN_PROVIDERS 누락 | — | FIXED | 2026-03-07 |
| 263 | BUG | HIGH | DeFi 포지션 대시보드에 Mock 데이터 오염 — Mock SDK wrapper가 가짜 포지션 대량 생성 | — | FIXED | 2026-03-07 |
| 264 | MISSING | HIGH | Admin UI에서 deprecated Smart Account(Solady factory) 지갑 경고 미표시 — factoryAddress API 응답 누락 | — | FIXED | 2026-03-07 |
| 265 | ENHANCEMENT | LOW | Admin UI Actions 페이지 프로바이더 카테고리별 그룹핑 (Swap/Bridge/Staking/Lending/Yield/Perp) | — | FIXED | 2026-03-07 |
| 266 | ENHANCEMENT | MEDIUM | Smart Account 팩토리별 지원 네트워크 표시 — 정적 리스트 + eth_getCode 런타임 검증 하이브리드 | — | FIXED | 2026-03-07 |
| 267 | ENHANCEMENT | HIGH | D'CENT Swap Aggregator DEX-only 정리 — Exchange 완전 제거 + URL/이름 변경 | — | FIXED | 2026-03-07 |
| 268 | ENHANCEMENT | LOW | Admin UI 슬리피지 설정 단위를 % 표시로 변경 — 전 프로바이더 동일 적용 (Jupiter/0x/Pendle/DCent) | — | FIXED | 2026-03-07 |
| 269 | BUG | HIGH | DeFi 포지션 Mock 오염 데이터 미정리 — #263 코드 수정 후 DB 마이그레이션 누락 | — | FIXED | 2026-03-07 |
| 270 | ENHANCEMENT | LOW | 빌트인 토큰 레지스트리에 PIM (Pimlico Test Token) 테스트넷 토큰 추가 | — | FIXED | 2026-03-07 |
| 271 | BUG | HIGH | Admin UI NFT 탭 네트워크 셀렉터가 항상 비어있음 — wallet.networks 미존재 필드 참조 | — | FIXED | 2026-03-07 |
| 272 | BUG | CRITICAL | Smart Account 지갑 주소가 EOA signer 주소로 저장됨 — daemon.ts createApp()에 smartAccountService 미주입 | — | FIXED | 2026-03-07 |
| 273 | BUG | HIGH | Admin UI ERC-8004 에이전트 등록 시 sessionAuth 인증 실패 — POST /v1/actions/* masterAuth 미허용 | — | FIXED | 2026-03-07 |
| 274 | BUG | HIGH | 무제한 세션(expires_at=0)이 활성 세션 카운트에서 누락 — Admin 대시보드/Stats/Telegram Bot 3곳 | — | FIXED | 2026-03-07 |
| 275 | ENHANCEMENT | HIGH | AA 프로바이더 글로벌 기본 API Key / Policy ID — per-wallet 반복 입력 제거 + policyId Admin UI 노출 | — | FIXED | 2026-03-07 |
| 276 | BUG | MEDIUM | Spending Limit 정책 목록 티어 바가 USD 키 불일치로 항상 빈 바 표시 | — | FIXED | 2026-03-07 |
| 277 | BUG | HIGH | Admin UI NFT Indexer 설정 섹션 미표시 — API 키 직접 입력 불가 | — | FIXED | 2026-03-07 |
| 278 | BUG | MEDIUM | D'CENT Swap 멀티체인/크로스체인 스왑 기능이 Admin UI와 에이전트 인터페이스에 미노출 | — | FIXED | 2026-03-07 |
| 279 | BUG | CRITICAL | UserOp Sign 라우트 network 이중 replace 버그로 RPC URL 해석 실패 — Sign 100% 불가 | — | FIXED | 2026-03-08 |
| 280 | BUG | HIGH | HyperEVM RPC 설정 키 미등록 — IncomingTxMonitor 구독 실패 | v31.6 | FIXED | 2026-03-09 |
| 281 | BUG | HIGH | HyperEVM incoming.wss_url 설정 키 미등록 — IncomingTxMonitor 구독 실패 | — | FIXED | 2026-03-09 |
| 282 | ENHANCEMENT | HIGH | 네트워크 설정 키 완전성 자동 검증 테스트 — NETWORK_TYPES SSoT 기반 동적 검증 | v31.7 | FIXED | 2026-03-09 |
| 283 | ENHANCEMENT | LOW | README 테스트 배지 자동 업데이트 — 하드코딩 제거, Gist + shields.io endpoint 동적 배지 | v31.7 | FIXED | 2026-03-09 |
| 284 | BUG | HIGH | E2E Smoke 워크플로우가 npm publish 전에 실행되어 실패 — workflow_run 전환 필요 | v31.7 | FIXED | 2026-03-09 |
| 285 | BUG | HIGH | E2E DaemonManager가 E2E_DAEMON_INSTALL_MODE=global 미지원 — CI에서 전 테스트 skip | v31.8 | FIXED | 2026-03-09 |
| 286 | BUG | MEDIUM | E2E Admin UI 정적 파일 미빌드로 root path 404 — turbo 빌드 의존성 누락 | v31.8 | FIXED | 2026-03-09 |
| 287 | BUG | HIGH | E2E interface 테스트 API 형식 불일치 — PUT settings body + SDK walletId 미해석 | v31.8 | FIXED | 2026-03-09 |
| 288 | BUG | MEDIUM | E2E audit-log 테스트 응답 필드 불일치 — items vs data | v31.8 | FIXED | 2026-03-09 |
| 289 | BUG | HIGH | E2E 스모크 워크플로우가 RC 대신 stable 릴리스를 설치 — /releases/latest가 prerelease 제외 | v31.8 | FIXED | 2026-03-09 |
| 290 | BUG | CRITICAL | E2E 스모크 CI에서 npm global bin 경로가 PATH에 없어 waiaas 실행 실패 | v31.8 | FIXED | 2026-03-09 |
| 291 | BUG | HIGH | E2E 스모크 CI에서 push-relay 빌드 누락으로 bin.js 미존재 실패 | v31.8 | FIXED | 2026-03-09 |
| 292 | BUG | MEDIUM | E2E Admin UI root path 테스트가 잘못된 경로(/) 사용 — 실제 서빙 경로는 /admin/ | v31.8 | FIXED | 2026-03-09 |
| 293 | BUG | MEDIUM | E2E Settings PUT 테스트가 잘못된 설정 키(display_currency) 사용 — 실제 키는 display.currency | v31.8 | FIXED | 2026-03-09 |
| 294 | BUG | HIGH | E2E SDK getWalletInfo 실패 — /v1/wallets/:id/networks GET에 masterAuth 불필요 적용 (미들웨어 모순) | v31.8 | FIXED | 2026-03-09 |
| 295 | BUG | MEDIUM | E2E 온체인 테스트 기본 포트 3000 — 데몬 기본 포트 3100과 불일치 | v31.8 | FIXED | 2026-03-09 |
| 296 | BUG | HIGH | E2E 온체인 테스트가 구버전 네트워크 ID 사용 — v29.5 통일 형식(ethereum-sepolia 등) 미반영 | v31.8 | FIXED | 2026-03-09 |
| 297 | BUG | MEDIUM | E2E Settings GET 응답 구조 불일치 — 플랫 키 접근 vs 카테고리별 중첩 객체 응답 | v31.8 | FIXED | 2026-03-09 |
| 298 | BUG | HIGH | E2E 온체인 사전 조건 잔액 체크에 network 파라미터 누락 — EVM 네트워크 전부 FAIL | v31.8 | FIXED | 2026-03-09 |
| 299 | BUG | HIGH | Holesky 테스트넷 종료 — Holesky 참조 제거 + E2E 스테이킹 테스트 제거 | v31.8 | FIXED | 2026-03-09 |
| 300 | BUG | HIGH | E2E 온체인 전송 테스트 txId 필드명 불일치 — 실제 API는 txHash 반환 | v31.8 | FIXED | 2026-03-09 |
| 301 | ENHANCEMENT | MEDIUM | E2E 온체인 테스트에 L2 테스트넷 네트워크 추가 — Polygon/Arbitrum/Optimism/Base/HyperEVM | v31.8 | FIXED | 2026-03-10 |
| 302 | BUG | HIGH | E2E 스모크 CI global waiaas CLI PATH 해결 실패 재발 — which fallback + WAIAAS_CLI_PATH 명시 전달 필요 | v31.8 | FIXED | 2026-03-10 |
| 303 | ENHANCEMENT | LOW | agent-uat 스킬을 .claude/skills/로 이동 — 런타임 스킬과 개발 스킬 분리 | — | FIXED | 2026-03-10 |
| 304 | BUG | MEDIUM | Agent UAT 시나리오 문서 API 불일치 3건 — dry-run→simulate, value→amount, token 문자열→객체 | — | FIXED | 2026-03-10 |
| 305 | MISSING | MEDIUM | Admin UI 네트워크 목록에 HyperEVM Mainnet/Testnet 누락 — 6개 파일 하드코딩 배열 미동기화 | — | FIXED | 2026-03-10 |
| 306 | ENHANCEMENT | MEDIUM | 공유 상수 패키지(@waiaas/shared) 분리 — Admin UI 하드코딩 제거 + 네트워크 동기화 자동화 | — | FIXED | 2026-03-10 |
| 307 | BUG | HIGH | Hyperliquid 액션 프로바이더 설정 키 불일치 + 기본값 비활성 — 토글 무동작 + Inactive 고정 | — | FIXED | 2026-03-10 |
| 308 | ENHANCEMENT | MEDIUM | Agent UAT 인증 카테고리 분류 + 필터링 — masterAuth/sessionAuth 시나리오 분리 | — | FIXED | 2026-03-10 |
| 309 | BUG | MEDIUM | Agent UAT 시나리오 문서 API 경로 불일치 2건 — wallets/:id/balance→wallet/balance, transactions→transactions/send | — | FIXED | 2026-03-10 |
| 310 | BUG | HIGH | EVM getAssets() ERC-20 multicall silent failure — Sepolia USDC 40개 미표시 | — | FIXED | 2026-03-10 |
| 311 | MISSING | HIGH | @waiaas/shared 패키지 릴리스 설정 누락 — release-please + smoke test + release.yml 미등록 | — | FIXED | 2026-03-10 |
| 312 | MISSING | MEDIUM | HyperEVM RPC 기본값이 Config Zod 스키마에 누락 — 지갑 상세 잔액 조회 불가 | — | FIXED | 2026-03-10 |
| 313 | BUG | LOW | CoinGecko API Key 붙여넣기 시 입력값 미표시 — icc() 패턴이 dirty 값 무시 | — | FIXED | 2026-03-10 |
| 314 | MISSING | MEDIUM | NFT Indexer 설정이 Admin UI에서 접근 불가 — 레거시 settings.tsx에만 존재 + 재발 방지 completeness 테스트 | — | FIXED | 2026-03-10 |
| 315 | BUG | MEDIUM | 병렬 UAT 실행 시 세션 한도 초과로 테스트 진행 불가 — max_sessions_per_wallet 5 고갈 + 세션 미정리 | — | FIXED | 2026-03-10 |
| 316 | BUG | HIGH | 0x Swap ACTION_RESOLVE_FAILED: gas/gasPrice 파싱 버그 — 0x API v2 응답 형식 변경 대응 필요 | — | FIXED | 2026-03-10 |
| 317 | BUG | HIGH | Across Bridge timestamp 타입 불일치 — API 응답 string vs Zod 스키마 number | — | FIXED | 2026-03-10 |
| 318 | BUG | HIGH | Jupiter API 401 Unauthorized — 인증 필수 전환 대응 (requiresApiKey 변경 필요) | — | FIXED | 2026-03-10 |
| 319 | BUG | HIGH | Hyperliquid Admin UI 활성화 불가 — MarketData null + Hot-Reload BUILTIN_NAMES 누락 (3중 결함) | — | FIXED | 2026-03-10 |
| 320 | BUG | MEDIUM | DeFi UAT 시나리오 문서 API 파라미터 불일치 8건 — amount/chain/token 형식 + 필드명 | — | FIXED | 2026-03-10 |
| 321 | BUG | MEDIUM | Jito Staking 최소 금액 검증 누락 — 소액 deposit 시 InstructionError Custom(1) 온체인 실패 | — | FIXED | 2026-03-10 |
| 322 | ENHANCEMENT | LOW | Agent UAT 지갑 CRUD 시나리오 제거 — 반복 실행 시 terminated 지갑 누적으로 DB 오염 | — | OPEN | — |
| 323 | ENHANCEMENT | MEDIUM | Terminated 지갑 하드 삭제(Purge) 기능 — API + Admin UI에서 완전 삭제 지원 | — | OPEN | — |
| 324 | BUG | CRITICAL | DELAY 티어 + DEX quote 만료로 스왑 트랜잭션 revert — 가스비 낭비 | v31.9 | OPEN | — |
| 325 | MISSING | MEDIUM | Actions 엔드포인트 ?dryRun=true 쿼리 파라미터 미지원 — simulate 시 실비 발생 | v31.9 | OPEN | — |
| 326 | BUG | MEDIUM | Pendle API v2 엔드포인트 변경으로 Yield Trading 전면 실패 (404) | v31.9 | OPEN | — |
| 327 | BUG | HIGH | 다수 DELAY 큐 항목 처리 중 데몬 크래시 — 원인 불명 | v31.9 | OPEN | — |
| 328 | BUG | HIGH | Jito Staking DepositSol 시 JitoSOL ATA 미생성으로 실패 — preInstructions 수정 적용 | v31.9 | FIXED | 2026-03-11 |
| 329 | BUG | HIGH | Confirmation Worker STO-03 회귀 — Lido 온체인 성공 후 SUBMITTED 상태 고착 (#143 재발) | v31.9 | OPEN | — |
| 330 | BUG | HIGH | Admin UI Jupiter Swap requiresApiKey 동기화 누락 — API 키 입력 필드 미표시 (#318 불완전) | v31.9 | OPEN | — |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 8
- **FIXED:** 322
- **WONTFIX:** 1
- **Total:** 331
- **Archived:** 321 (001–321)

