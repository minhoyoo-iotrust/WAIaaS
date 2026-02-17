# Issue Tracker

> 이슈 추적 현황. 새 이슈는 `v{milestone}-{NNN}-{slug}.md`로 추가하고 이 표를 갱신한다.

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
| 001 | BUG | HIGH | 트랜잭션 라우트 미등록 (POST /v1/transactions/send 404) | v1.1 | FIXED | 2026-02-10 |
| 002 | BUG | CRITICAL | 세션 라우트 미등록 + masterAuth 미적용 (POST /v1/sessions 404) | v1.2 | FIXED | 2026-02-10 |
| 003 | BUG | LOW | mcp setup 헬스체크가 인증 필요 엔드포인트 호출 (/v1/admin/status) | v1.3 | FIXED | 2026-02-11 |
| 004 | BUG | MEDIUM | mcp setup 에이전트 목록 조회 시 X-Master-Password 헤더 누락 | v1.3 | FIXED | 2026-02-11 |
| 005 | BUG | CRITICAL | MCP SessionManager가 JWT의 sub 대신 sessionId 클레임 참조 | v1.3 | FIXED | 2026-02-11 |
| 006 | BUG | MEDIUM | mcp setup 에이전트 자동 감지 시 API 응답 필드 불일치 (items vs agents) | v1.3 | FIXED | 2026-02-11 |
| 007 | BUG | MEDIUM | Admin UI 알림 테스트 응답 파싱 오류 (results 래퍼 미처리) | v1.3.4 | FIXED | 2026-02-12 |
| 008 | BUG | MEDIUM | vitest fork pool 워커 프로세스가 고아 상태로 누적 | v1.3.4 | FIXED | 2026-02-12 |
| 009 | BUG | LOW | E2E E-11 테스트가 잘못된 인증 모델 전제 (X-Agent-Id 미사용, sessionAuth 누락) | v1.1 | FIXED | 2026-02-12 |
| 010 | BUG | HIGH | Admin UI EVM 에이전트 생성 시 network 값 불일치 (sepolia → ethereum-sepolia) | v1.4.1 | FIXED | 2026-02-12 |
| 011 | BUG | MEDIUM | MCP 서버 초기화 순서 레이스 컨디션 (sessionManager.start → server.connect) | v1.3 | FIXED | 2026-02-12 |
| 012 | BUG | MEDIUM | MCP에 get_assets 도구 미구현 — SPL/ERC-20 토큰 잔액 조회 불가 | v1.3 | FIXED | 2026-02-12 |
| 013 | BUG | LOW | Admin UI에서 MCP 토큰 발급 불가 — CLI 의존 | v1.4.1 | FIXED | 2026-02-13 |
| 014 | BUG | MEDIUM | EVM getAssets()가 ERC-20 토큰 잔액 미반환 — ALLOWED_TOKENS 정책 미연동 | v1.4.1 | FIXED | 2026-02-13 |
| 015 | BUG | HIGH | EVM 트랜잭션 확인 타임아웃 시 온체인 성공 건을 FAILED로 처리 | v1.4.1 | FIXED | 2026-02-13 |
| 016 | BUG | LOW | 모든 패키지 버전이 0.0.0 — Admin UI/OpenAPI에 잘못된 버전 표시 | v1.4.1 | FIXED | 2026-02-13 |
| 017 | BUG | MEDIUM | MCP에서 CONTRACT_CALL/APPROVE/BATCH 타입 차단 — 보안 근거 부재 | v1.4.1 | FIXED | 2026-02-14 |
| 018 | ENHANCEMENT | LOW | 테스트넷 빌트인 ERC-20 토큰이 빈 배열 — 토큰 전송 테스트 시 수동 등록 필요 | v1.4.3 | FIXED | 2026-02-14 |
| 019 | BUG | HIGH | EVM simulateTransaction에서 from 주소 누락 — ERC-20 전송 시뮬레이션 실패 | v1.4.4 | FIXED | 2026-02-14 |
| 020 | BUG | MEDIUM | MCP 서버 프로세스가 Claude Desktop 종료 후 고아로 잔류 — stdin 종료 미감지 | v1.4.8 | FIXED | 2026-02-15 |
| 021 | ENHANCEMENT | LOW | 멀티체인 전체 네트워크 잔액 일괄 조회 미지원 — `network=all` 파라미터 필요 | v1.4.8 | FIXED | 2026-02-15 |
| 022 | MISSING | LOW | 기본 네트워크 변경 MCP 도구 및 CLI 명령어 미구현 | v1.4.8 | FIXED | 2026-02-15 |
| 023 | MISSING | MEDIUM | 월렛 상세 정보 조회 CLI 명령어 + SDK 메서드 미구현 (MCP 도구 구현 완료) | v1.4.8 | FIXED | 2026-02-15 |
| 024 | ENHANCEMENT | MEDIUM | Admin UI 월렛 상세 페이지에 잔액 및 트랜잭션 내역 미표시 | v1.4.8 | FIXED | 2026-02-15 |
| 025 | ENHANCEMENT | LOW | 알림 로그에 실제 발송 메시지 내용 미저장 — Admin UI에서 확인 불가 | v1.4.8 | FIXED | 2026-02-15 |
| 026 | ENHANCEMENT | LOW | Admin UI 세션 페이지에서 전체 세션 조회 불가 — 월렛 선택 필수 | v1.4.8 | FIXED | 2026-02-15 |
| 027 | ENHANCEMENT | MEDIUM | Admin UI 대시보드 핵심 정보 누락 + StatCard 상세 페이지 링크 없음 | v1.4.8 | FIXED | 2026-02-15 |
| 028 | BUG | MEDIUM | Admin UI 알림 테스트가 SYSTEM_LOCKED 에러로 실패 — 빈 body 파싱 오류 | v1.4.8 | FIXED | 2026-02-15 |
| 029 | ENHANCEMENT | LOW | Admin UI 알림 테스트 시 대상 채널 불명확 — 채널 선택 UI 없음 | v1.4.8 | FIXED | 2026-02-15 |
| 030 | ENHANCEMENT | LOW | Slack 알림 채널 미지원 — Incoming Webhook 방식 추가 | v1.4.8 | FIXED | 2026-02-15 |
| 031 | BUG | HIGH | pushSchema 인덱스 생성이 마이그레이션보다 먼저 실행 — 기존 DB 시작 실패 | v1.4.8 | FIXED | 2026-02-15 |
| 032 | BUG | HIGH | ActionProviderRegistry.listActions() 빌드 실패 — noUncheckedIndexedAccess 위반 | v1.5 | FIXED | 2026-02-15 |
| 033 | BUG | HIGH | Admin UI 월렛 상세 네트워크 필드 불일치 — Terminate 무응답 + 삭제 지갑 크래시 | v1.5.1 | FIXED | 2026-02-16 |
| 034 | ENHANCEMENT | MEDIUM | OpenAPI → 클라이언트 타입 자동 생성 도입 — API 필드 불일치 구조적 방지 | v1.5.1 | FIXED | 2026-02-16 |
| 035 | ENHANCEMENT | MEDIUM | USDC_DOMAINS 하드코딩 테이블과 실제 온체인 도메인 불일치 | v1.5.1 | FIXED | 2026-02-16 |
| 036 | BUG | HIGH | x402 EIP-712 도메인 name 불일치로 결제 서명 검증 실패 | v1.5.1 | FIXED | 2026-02-16 |
| 037 | BUG | MEDIUM | Admin Table 컴포넌트 undefined data 크래시 — sessions 페이지 테스트 실패 | v1.6 | FIXED | 2026-02-16 |
| 038 | BUG | LOW | v1.6 추가 enum/error code에 대한 테스트 count 미갱신 (7건) | v1.6 | FIXED | 2026-02-16 |
| 039 | ENHANCEMENT | MEDIUM | 마일스톤 감사 전 빌드+테스트 자동 실행 훅 추가 | v1.6 | FIXED | 2026-02-16 |
| 040 | ENHANCEMENT | LOW | EVM Testnet Level 3 블록체인 검증 추가 — Solana Devnet과 대칭 | v1.7 | FIXED | 2026-02-17 |
| 041 | MISSING | LOW | Admin UI Owner 주소 설정 폼 미구현 | v1.6 | FIXED | 2026-02-17 |
| 042 | BUG | HIGH | tsconfig.json이 __tests__/ 포함하여 빌드 실패 반복 | v1.6 | FIXED | 2026-02-17 |
| 043 | BUG | MEDIUM | WalletConnect 미설정 시 404 + "알 수 없는 에러" 표시 | v1.6 | FIXED | 2026-02-17 |
| 044 | ENHANCEMENT | LOW | 알림 자격증명이 config.toml과 Admin Settings에 중복 존재 | v1.6 | FIXED | 2026-02-17 |
| 045 | ENHANCEMENT | MEDIUM | WalletConnect 설정 변경 시 hot-reload 미지원 | v1.6 | FIXED | 2026-02-17 |
| 046 | ENHANCEMENT | LOW | Admin UI Settings 재구조화 — 관련 메뉴로 설정 재배치 + Telegram 통합 | v1.6 | FIXED | 2026-02-17 |
| 047 | BUG | HIGH | Terminate 시 리소스 정리 누락 + TERMINATED 가드 미적용 | v1.6 | FIXED | 2026-02-17 |
| 048 | MISSING | HIGH | Owner 자산 회수(Withdraw) API 미구현 | v1.6 | FIXED | 2026-02-17 |
| 049 | BUG | HIGH | WalletConnect SignClient ESM/CJS 호환성 오류로 초기화 실패 | v1.6 | FIXED | 2026-02-17 |
| 050 | ENHANCEMENT | MEDIUM | Telegram Bot 활성화를 Admin Settings에서 관리 | v1.6 | FIXED | 2026-02-17 |
| 051 | ENHANCEMENT | LOW | 외부 지갑 예시에 D'CENT 추가 및 우선 표기 | v1.7 | FIXED | 2026-02-17 |
| 052 | BUG | HIGH | E2E 하네스가 AdapterPool 대신 단일 adapter 전달 — 3건 실패 | v1.7 | FIXED | 2026-02-17 |
| 053 | ENHANCEMENT | LOW | CI workflow에 workflow_dispatch 미지원 — 수동 전체 테스트 실행 불가 | v1.7 | FIXED | 2026-02-17 |
| 054 | BUG | LOW | Owner 주소 저장 후 Created 시각이 NaN으로 표시 | v1.7 | FIXED | 2026-02-17 |
| 055 | ENHANCEMENT | MEDIUM | Admin UI Owner 지갑 UX 개선 — 가시성 및 안내 강화 | v1.7 | FIXED | 2026-02-17 |
| 056 | BUG | HIGH | WalletConnect 페어링 시 Owner 주소 검증 누락 | v1.7 | FIXED | 2026-02-17 |
| 057 | MISSING | MEDIUM | Owner 수동 검증 API + Admin UI Verify 버튼 | v1.7 | FIXED | 2026-02-17 |
| 058 | BUG | MEDIUM | WalletConnect 셧다운 시 DB 연결 종료 후 스토리지 쓰기 시도 | v1.8 | FIXED | 2026-02-17 |
| 059 | ENHANCEMENT | MEDIUM | Contract Test Suite 크로스 패키지 Import 구조 개선 | v2.0 | FIXED | 2026-02-17 |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 0
- **FIXED:** 59
- **VERIFIED:** 0
- **WONTFIX:** 0
- **Total:** 59
