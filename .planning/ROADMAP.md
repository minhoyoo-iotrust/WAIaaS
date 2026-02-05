# Roadmap: WAIaaS

## Milestones

- :white_check_mark: **v0.1 Research & Design** - Phases 1-5 (shipped 2026-02-05)
- :construction: **v0.2 Self-Hosted Secure Wallet Design** - Phases 6-9 (in progress)

## Phases

<details>
<summary>v0.1 Research & Design (Phases 1-5) - SHIPPED 2026-02-05</summary>

5개 페이즈, 15개 플랜, 23개 요구사항 완료.
기술 스택 확정, 커스터디 모델, Dual Key 아키텍처, 소유자-에이전트 관계 모델, API 스펙 완성.

Git range: first commit -> `fbceed0`

</details>

### :construction: v0.2 Self-Hosted Secure Wallet Design (진행 중)

**마일스톤 목표:** 중앙 서버 없이 사용자가 직접 설치하여 운영하는 에이전트 지갑 시스템의 상세 설계를 완성한다. 체인 무관 3계층 보안 모델의 프로토콜, 데이터 모델, 인터페이스를 구현 가능한 수준으로 정의한다.

**산출물:** 상세 설계 문서 (v0.1과 동일 형식의 Markdown 설계 문서)

- [x] **Phase 6: Core Architecture Design** - 데몬 아키텍처, 암호화 키스토어 스펙, 스토리지 스키마, 기본 API 프레임워크 설계
- [ ] **Phase 7: Session & Transaction Protocol Design** - 세션 토큰 프로토콜, 거래 처리 파이프라인, Solana 어댑터 설계
- [ ] **Phase 8: Security Layers Design** - 시간 지연/승인 메커니즘, 알림 아키텍처, Owner 지갑 연결 플로우, Kill Switch 프로토콜 설계
- [ ] **Phase 9: Integration & Client Interface Design** - REST API 스펙, SDK 인터페이스, MCP 서버 스펙, Desktop 앱 아키텍처, 배포 스펙 설계

## Phase Details

### Phase 6: Core Architecture Design

**Goal**: Self-Hosted 데몬의 기반 아키텍처를 설계한다 — 모노레포 패키지 구조, 암호화 키스토어 파일 포맷/프로토콜, SQLite 스키마, 데몬 라이프사이클, 체인 추상화 인터페이스를 구현 가능한 수준으로 정의한다.

**Depends on**: v0.1 Research & Design (설계 문서 활용, 특히 ARCH-01~05)

**Requirements**: KEYS-01, KEYS-02, KEYS-03, KEYS-04, CHAIN-01, CLI-01, CLI-02, CLI-03, CLI-04, API-01, API-06

**Plans:** 5 plans

**Success Criteria** (what must be TRUE):
  1. 암호화 키스토어 파일 포맷이 바이트 수준으로 정의됨 (Ethereum Keystore V3 확장, AES-256-GCM nonce 관리, Argon2id 파라미터, sodium-native guarded memory 사용 프로토콜)
  2. SQLite 스키마가 테이블/인덱스/마이그레이션 수준으로 정의됨 (세션, 거래, 정책, 감사 로그)
  3. 데몬 라이프사이클이 시퀀스 다이어그램으로 문서화됨 (시작, 키스토어 잠금 해제, 서비스 초기화, 신호 처리, 우아한 종료)
  4. ChainAdapter 인터페이스가 TypeScript 타입 정의 수준으로 설계됨 (메서드 시그니처, 에러 타입, 체인별 차이점)
  5. 모노레포 패키지 구조와 `~/.waiaas/` 데이터 디렉토리 레이아웃이 확정됨

Plans:
- [x] 06-01-PLAN.md — 모노레포 구조 + 데이터 디렉토리 + SQLite 스키마 설계
- [x] 06-02-PLAN.md — 암호화 키스토어 스펙 설계 (파일 포맷, 키 파생, 메모리 안전성 프로토콜)
- [x] 06-03-PLAN.md — ChainAdapter 인터페이스 설계 + Solana/EVM 어댑터 명세
- [x] 06-04-PLAN.md — 데몬 라이프사이클 + CLI 커맨드 설계 (init/start/stop/status)
- [x] 06-05-PLAN.md — Hono API 프레임워크 설계 + localhost 보안 + Zod/OpenAPI 통합 설계

---

### Phase 7: Session & Transaction Protocol Design

**Goal**: 에이전트 세션 인증 프로토콜과 거래 처리 파이프라인을 상세 설계한다 — JWT 토큰 구조, SIWS/SIWE 승인 플로우, 세션 제약 모델, 거래 6단계 파이프라인, Solana 어댑터 상세를 정의한다.

**Depends on**: Phase 6 (키스토어 스펙, API 프레임워크, ChainAdapter 인터페이스)

**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, API-02, API-03, API-04, CHAIN-02

**Success Criteria** (what must be TRUE):
  1. 세션 토큰 프로토콜이 완전히 정의됨 (JWT claims 구조, SIWS 서명 검증 플로우, 발급/검증/폐기 시퀀스, nonce 재생 방지)
  2. 세션 제약 모델이 데이터 모델 수준으로 정의됨 (만료, 누적 한도, 단건 한도, 허용 작업 — 스키마와 검증 로직)
  3. 거래 처리 파이프라인 6단계가 시퀀스 다이어그램으로 문서화됨 (Receive → Session validate → Policy check → Tier classify → Queue/Execute → Sign → Submit)
  4. Solana Adapter가 @solana/kit 3.x 기반으로 상세 설계됨 (트랜잭션 빌드, 시뮬레이션, 제출, 확정성 처리)
  5. 세션/거래 API 엔드포인트가 요청/응답 스키마 수준으로 설계됨

**Plans:** 3 plans

Plans:
- [ ] 07-01-PLAN.md — 세션 토큰 프로토콜 설계 (JWT 구조, SIWS/SIWE 플로우, 제약 모델, 수명주기, sessionAuth 미들웨어)
- [ ] 07-02-PLAN.md — Solana Adapter 상세 설계 (@solana/kit pipe API, 13개 메서드 구현, 에러 매핑)
- [ ] 07-03-PLAN.md — 거래 처리 파이프라인 6단계 설계 + 세션/거래/지갑 API 엔드포인트 Zod 스펙

---

### Phase 8: Security Layers Design

**Goal**: 3계층 보안의 핵심인 시간 지연/승인 메커니즘, 멀티 채널 알림 아키텍처, Owner 지갑 연결 플로우, Kill Switch 프로토콜을 상세 설계한다.

**Depends on**: Phase 7 (세션 프로토콜, 거래 파이프라인)

**Requirements**: LOCK-01, LOCK-02, LOCK-03, LOCK-04, NOTI-01, NOTI-02, NOTI-03, NOTI-04, NOTI-05, OWNR-01, OWNR-02, OWNR-03, API-05, CHAIN-03

**Success Criteria** (what must be TRUE):
  1. 4-티어 시간 지연 메커니즘이 상태 머신으로 정의됨 (Instant/Notify/Delay/Approval 전이, pending queue 스키마, 쿨다운/만료 타이머, TOCTOU 방지 전략)
  2. Owner 지갑 연결 플로우가 시퀀스 다이어그램으로 문서화됨 (Wallet Adapter 통합, WalletConnect v2 페어링, 서명 요청/응답, 데몬↔브라우저 통신)
  3. 멀티 채널 알림 아키텍처가 설계됨 (채널 추상화, 우선순위, 전달 확인, 폴백 체인, 속도 제한 회피)
  4. Kill Switch 프로토콜이 캐스케이드 순서로 정의됨 (트리거 → 세션 취소 → 거래 취소 → 에이전트 정지 → 알림 → 복구 절차)
  5. 자동 정지 규칙 엔진 스펙이 정의됨 (규칙 포맷, 이벤트 기반 평가, 기본 규칙 세트)

Plans:
- [ ] 08-01: 시간 지연 + 승인 메커니즘 설계 (4-티어 상태 머신, pending queue, TOCTOU 방지)
- [ ] 08-02: Owner 지갑 연결 플로우 설계 (Wallet Adapter, WalletConnect v2, 서명 승인 프로토콜)
- [ ] 08-03: 멀티 채널 알림 아키텍처 설계 (채널 추상화, 전달 추적, 폴백)
- [ ] 08-04: Kill Switch 프로토콜 + 자동 정지 규칙 엔진 + EVM Adapter 스텁 설계

---

### Phase 9: Integration & Client Interface Design

**Goal**: 외부 통합 인터페이스(REST API, SDK, MCP)와 사용자 클라이언트(Desktop 앱, Telegram 봇, Docker)의 상세 설계를 완성한다.

**Depends on**: Phase 8 (3계층 보안 설계 완성)

**Requirements**: MCP-01, MCP-02, SDK-01, SDK-02, DESK-01, DESK-02, DESK-03, DESK-04, DOCK-01, TGBOT-01, TGBOT-02

**Success Criteria** (what must be TRUE):
  1. REST API 전체 스펙이 완성됨 (모든 엔드포인트 요청/응답 스키마, 에러 코드 체계, 인증 미들웨어 명세, OpenAPI 3.0)
  2. TypeScript SDK + Python SDK 인터페이스가 메서드 시그니처 수준으로 설계됨 (클래스 구조, 에러 타입, 세션 관리 헬퍼)
  3. MCP Server 도구/리소스가 정의됨 (도구 스키마, 세션 토큰 전달 메커니즘, stdio/SSE 전송 설계)
  4. Tauri Desktop 앱 아키텍처가 설계됨 (컴포넌트 구조, 데몬 사이드카 통합, 시스템 트레이 동작, 화면별 UI 플로우)
  5. Telegram 인터랙티브 봇 명령/인라인 키보드 설계 + Docker 배포 스펙(docker-compose, 볼륨, 환경변수)이 정의됨

Plans:
- [ ] 09-01: REST API 완전 스펙 + Owner 전용 API 설계
- [ ] 09-02: SDK 인터페이스 설계 (TypeScript + Python) + MCP Server 스펙
- [ ] 09-03: Tauri Desktop 앱 아키텍처 + UI 플로우 설계
- [ ] 09-04: Interactive Telegram Bot 설계 + Docker 배포 스펙

## Progress

**Execution Order:** Phase 6 -> 7 -> 8 -> 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5 | v0.1 | 15/15 | Complete | 2026-02-05 |
| 6. Core Architecture Design | v0.2 | 5/5 | Complete | 2026-02-05 |
| 7. Session & Transaction Protocol | v0.2 | 0/3 | Planned | - |
| 8. Security Layers Design | v0.2 | 0/4 | Not started | - |
| 9. Integration & Client Interface | v0.2 | 0/4 | Not started | - |

---
*Roadmap created: 2026-02-05*
*Last updated: 2026-02-05 (Phase 7 planned)*
