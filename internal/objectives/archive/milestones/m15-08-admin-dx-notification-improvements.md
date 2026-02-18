# 마일스톤 m15-08: Admin UI · DX · 알림 개선

## 목표

OPEN 이슈 12건(020~031)을 일괄 해소한다. MCP 안정성, Admin UI UX, 알림 시스템, MCP 도구 확장, DB 마이그레이션 안정성을 포함한다.

---

## 배경

v1.4.5~v1.4.7 진행 중 발견된 이슈와 개선 사항 12건을 모아 한 번에 처리한다.

| 카테고리 | 이슈 수 | 내용 |
|---------|--------|------|
| MCP 안정성 | 1건 | 고아 프로세스 (020) |
| MCP 도구 확장 | 2건 | get_wallet_info (023), set_default_network (022) |
| 멀티체인 DX | 1건 | network=all 잔액 조회 (021) |
| Admin UI 개선 | 5건 | 대시보드 (027), 월렛 잔액/트랜잭션 (024), 세션 전체 조회 (026), 알림 테스트 버그 (028), 알림 채널 선택 (029) |
| 알림 시스템 | 2건 | 메시지 내용 저장 (025), Slack 채널 (030) |
| DB 마이그레이션 | 1건 | pushSchema 실행 순서 + 체인 테스트 (031) |

---

## 이슈 목록

| ID | 유형 | 심각도 | 제목 | 페이즈 |
|----|------|--------|------|--------|
| 020 | BUG | MEDIUM | MCP 서버 프로세스가 Claude Desktop 종료 후 고아로 잔류 | P1 |
| 021 | ENHANCEMENT | LOW | 멀티체인 전체 네트워크 잔액 일괄 조회 (`network=all`) | P2 |
| 022 | MISSING | LOW | 기본 네트워크 변경 MCP 도구 및 CLI 명령어 | P2 |
| 023 | MISSING | MEDIUM | 월렛 상세 정보 조회 CLI 명령어 + SDK 메서드 (MCP 도구 구현 완료) | P2 |
| 024 | ENHANCEMENT | MEDIUM | Admin UI 월렛 상세 페이지에 잔액 및 트랜잭션 내역 | P3 |
| 025 | ENHANCEMENT | LOW | 알림 로그에 실제 발송 메시지 내용 저장 | P4 |
| 026 | ENHANCEMENT | LOW | Admin UI 세션 페이지에서 전체 세션 조회 | P3 |
| 027 | ENHANCEMENT | MEDIUM | Admin UI 대시보드 핵심 정보 + StatCard 링크 | P3 |
| 028 | BUG | MEDIUM | Admin UI 알림 테스트 SYSTEM_LOCKED 에러 | P4 |
| 029 | ENHANCEMENT | LOW | Admin UI 알림 테스트 채널 선택 UI | P4 |
| 030 | ENHANCEMENT | LOW | Slack 알림 채널 추가 | P4 |
| 031 | BUG | HIGH | pushSchema 인덱스 생성이 마이그레이션보다 먼저 실행 — 기존 DB 시작 실패 | P0 |

---

## 페이즈 구성

### Phase 0: DB 마이그레이션 안정성 (이슈 031)

pushSchema 실행 순서 수정 + 마이그레이션 체인 테스트 추가. 기존 DB에서 데몬 시작이 불가능한 HIGH 버그 해결.

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/daemon/src/infrastructure/database/migrate.ts` |
| 변경 | pushSchema 순서: 테이블 → 마이그레이션 → 인덱스 (기존: 테이블+인덱스 → 마이그레이션) |
| 테스트 | 마이그레이션 체인 테스트 11건 (스키마 6건: v1→v9, v5→v9, fresh DB, 스키마 동등성, 인덱스 완전성, 회귀 방지 + 데이터 변환 5건: v7 environment 매핑, v6 network 백필, v3 이름 변환, FK 보존, 엣지 케이스) |

### Phase 1: MCP 안정성 (이슈 020)

MCP 서버의 graceful shutdown 개선. stdin 종료 감지 + SIGTERM 타임아웃 추가.

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/mcp/src/index.ts` |
| 변경 | `shutdown()` 함수 + stdin close 핸들러 + 3초 강제 종료 타임아웃 |
| 테스트 | stdin 종료 시 프로세스 종료, SIGTERM 타임아웃, 중복 호출 안전성 |

### Phase 2: MCP 도구 + 멀티체인 DX (이슈 021, 022, 023)

MCP 도구 확장과 멀티체인 잔액 일괄 조회.

| 항목 | 내용 |
|------|------|
| 이슈 023 | `get_wallet_info` CLI 명령어 + SDK 메서드 신규 (MCP 도구 기구현) |
| 이슈 022 | `set_default_network` MCP 도구 + CLI 명령어 + SDK 메서드 신규 |
| 이슈 021 | `GET /v1/wallet/balance?network=all` + `GET /v1/wallet/assets?network=all` + MCP 도구 확장 |
| 수정 파일 | MCP 도구 1개 신규(set_default_network), CLI 명령어 2개, SDK 메서드 2개, `routes/wallet.ts`, 스키마 확장 |
| 백엔드 | `Promise.allSettled()` 병렬 RPC + 부분 실패 처리 |

### Phase 3: Admin UI 개선 (이슈 024, 026, 027)

대시보드, 월렛 상세, 세션 페이지 개선. 백엔드 수정 최소화, 프론트엔드 중심.

| 항목 | 내용 |
|------|------|
| 이슈 027 | 대시보드 StatCard 링크 + 추가 카드(Policies, Txns 24h, Failed) + 최근 활동 섹션 |
| 이슈 024 | 월렛 상세에 잔액 섹션 + 트랜잭션 내역 테이블 추가 |
| 이슈 026 | 세션 API `walletId` 필수 해제 + walletName JOIN + 전체 세션 기본 표시 |
| 수정 파일 | `dashboard.tsx`, `wallets.tsx`, `sessions.tsx`, `routes/sessions.ts`, `routes/admin.ts` |
| 백엔드 | `/admin/status` 응답 확장, `GET /sessions` WHERE 분기 + walletName JOIN |

### Phase 4: 알림 시스템 개선 (이슈 025, 028, 029, 030)

알림 버그 수정, 메시지 저장, 채널 선택 UI, Slack 채널 추가.

| 항목 | 내용 |
|------|------|
| 이슈 028 | `apiPost(url)` → `apiPost(url, {})` 수정 (즉시) |
| 이슈 029 | Channel Status 카드에 채널별 [Test] 버튼 + [Test All] 분리 |
| 이슈 025 | DB 마이그레이션 `notification_logs ADD COLUMN message TEXT` + 발송 로직 저장 + Admin UI 행 확장 |
| 이슈 030 | `SlackChannel` 클래스 신규 (`INotificationChannel` 구현) + config.toml `slack_webhook_url` |
| 수정 파일 | `notifications.tsx`, `channels/slack.ts` 신규, 알림 발송 로직, DB 마이그레이션 |

---

## 순서 의존성

| 페이즈 | 의존 |
|--------|------|
| P0 | 독립 — 최우선 실행 (기존 DB 시작 차단 버그) |
| P1 | 독립 — 즉시 실행 가능 |
| P2 | 독립 — 멀티체인 환경 모델 구현 완료 (v1.4.6 shipped) |
| P3 | 독립 — 환경 모델 기반 UI 전제 충족 (v1.4.6 shipped) |
| P4 | 독립 — P0~P3과 병렬 가능 |

---

## DB 마이그레이션

| 테이블 | 변경 | 마이그레이션 버전 | 이슈 |
|--------|------|------------------|------|
| `notification_logs` | `ADD COLUMN message TEXT` | v10 | 025 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 5개 (P0~P4) |
| 이슈 | 12건 |
| 신규 파일 | 4~5개 (MCP 도구 1(set_default_network), SlackChannel 1, CLI 명령어, 마이그레이션 체인 테스트) |
| 수정 파일 | 13~16개 |
| 테스트 | 46~56건 추가 |
| DB 마이그레이션 | 1건 |

---

## E2E 검증 시나리오

| # | 시나리오 | 이슈 |
|---|---------|------|
| 1 | Claude Desktop 종료 후 MCP 프로세스가 5초 내 자동 종료 | 020 |
| 2 | CLI `waiaas wallet info` → chain, environment, availableNetworks 반환 | 023 |
| 3 | MCP `set_default_network('polygon-amoy')` → 이후 기본 네트워크 변경 확인 | 022 |
| 4 | `GET /v1/wallet/balance?network=all` → 5개 네트워크 잔액 배열 반환 | 021 |
| 5 | Admin 대시보드 Wallets 카드 클릭 → /wallets 페이지 이동 | 027 |
| 6 | Admin 월렛 상세 → 잔액 + 트랜잭션 내역 표시 | 024 |
| 7 | Admin 세션 페이지 진입 → 전체 세션 목록 즉시 표시 | 026 |
| 8 | Admin 알림 Send Test → 정상 응답 (SYSTEM_LOCKED 에러 없음) | 028 |
| 9 | Admin 알림 Telegram [Test] → Telegram만 테스트 | 029 |
| 10 | 알림 Delivery Log 행 클릭 → 메시지 원문 표시 | 025 |
| 11 | config.toml에 slack_webhook_url 설정 → Channel Status에 Slack 표시 | 030 |
| 12 | v5 스키마 DB에서 데몬 시작 → 마이그레이션 성공 + 정상 동작 | 031 |

---

## skills/ 파일 동기화

Phase 2에서 REST API/MCP/SDK 인터페이스가 변경되므로, 해당 skill 파일도 함께 업데이트한다.

| 변경 | 대상 skill 파일 |
|------|----------------|
| `GET /v1/wallet/balance?network=all` 추가, `GET /v1/wallet/assets?network=all` 추가 | `wallet.skill.md` |
| `set_default_network` MCP 도구 추가 | `wallet.skill.md` |
| `waiaas wallet info` CLI 명령어 추가 | `wallet.skill.md` |
| Slack 알림 채널 추가 (Phase 4) | `admin.skill.md` |

---

*생성일: 2026-02-14*
*선행: v1.4.7 (임의 트랜잭션 서명)*
*후행: v1.5 (DeFi + Price Oracle)*
