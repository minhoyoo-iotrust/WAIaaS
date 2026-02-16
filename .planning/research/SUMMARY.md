# Research Summary: WalletConnect Owner 승인

**Domain:** Self-hosted AI agent wallet daemon -- WalletConnect v2 QR 페어링, 원격 서명 요청, Telegram fallback
**Researched:** 2026-02-16
**Overall confidence:** HIGH (npm registry 직접 확인 + 공식 문서 검증 + 기존 코드베이스 분석)

## Executive Summary

WAIaaS v1.6.1의 WalletConnect Owner 승인은 기존 ApprovalWorkflow(Owner가 REST API에 직접 서명 제출하는 Pull 모델)에 **WalletConnect v2 경유 Push 모델**을 추가하는 것이다. WAIaaS 데몬이 dApp 역할(Proposer)로 `@walletconnect/sign-client` 2.23.5를 사용하여 Owner의 외부 지갑(MetaMask, Phantom 등)에 서명을 요청한다.

기술적으로 새로 추가할 npm 패키지는 **2개뿐**이다: `@walletconnect/sign-client`(WC v2 Sign Protocol)과 `qrcode`(QR 코드 생성). 나머지 모든 기능은 기존 인프라(ApprovalWorkflow, TelegramBotService, EventBus, SettingsService, ownerAuth 서명 검증, CSP, viem, sodium-native)를 활용한다. `walletconnect.project_id`는 이미 Admin Settings에 정의되어 있다.

핵심 아키텍처 결정은 (1) WalletConnect를 "선호 채널"이지 "유일 채널"이 아닌 것으로 위치시킨다는 것, (2) WC 실패 시 Telegram Bot으로 자동 fallback, (3) 기존 REST API(SIWE/SIWS) 직접 승인 경로를 절대 제거하지 않는다는 것이다. 이 "3중 승인 채널" 구조가 self-hosted 데몬의 외부 relay 의존성 리스크를 완화한다.

가장 큰 리스크는 (1) WC Relay 서버 외부 의존성(self-hosted 철학과의 충돌), (2) ApprovalWorkflow 타이밍 불일치(WC 5분 vs 정책 1시간), (3) 데몬 재시작 시 WC 세션 복구이다. 모두 PITFALLS.md에서 상세히 다루며, 각각 fallback 전략, 타임아웃 동기화, 파일시스템 저장소 + DB 메타데이터 이원 관리로 대응한다.

## Key Findings

**Stack:** `@walletconnect/sign-client` 2.23.5 + `qrcode` 1.5.4. 나머지 기존 스택 100% 활용.
**Architecture:** WAIaaS = dApp(Proposer), Owner Wallet = Wallet(Responder). 3중 승인 채널 (WC > Telegram > REST). WcSessionService가 SignClient를 래핑하여 ApprovalWorkflow-WC 브릿지 역할.
**Critical pitfall:** WC Relay 외부 의존성 -- WC는 "선호 채널"이지 유일 채널이 아님. Telegram + REST 항상 가용하게 유지.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **WC 인프라 세팅 + DB 마이그레이션** - WcSessionService 구현, SignClient 초기화/종료, DB v16 (wc_sessions), setting-keys 확장
   - Addresses: STACK.md의 @walletconnect/sign-client 통합, DB schema v16
   - Avoids: C-01 (세션 유실) -- 파일시스템 저장 + DB 메타데이터 이원 관리부터 시작

2. **QR 페어링 + REST API** - pairing URI 생성, QR 코드 base64 변환, 세션 승인 대기, REST 엔드포인트
   - Addresses: FEATURES.md의 QR 페어링 테이블 스테이크
   - Avoids: H-01 (좀비 페어링) -- 세션 이벤트 전체 등록 + 단일 세션 정책

3. **WC 서명 요청 + ApprovalWorkflow 통합** - APPROVAL 이벤트 -> WC session_request, 서명 검증, approve/reject 연동
   - Addresses: FEATURES.md의 WC 서명 요청 핵심 기능
   - Avoids: C-03 (타이밍 불일치) -- WC 타임아웃을 ApprovalWorkflow에 동기화

4. **Telegram Fallback + 채널 전략** - WC 실패 감지, Telegram 전환, 채널 우선순위, 이중 승인 방어
   - Addresses: FEATURES.md의 Telegram fallback 기능
   - Avoids: H-03 (전환 조건 모호) -- 명시적 fallback 타임아웃 + 단일 승인 소스 원칙

5. **Admin UI + Telegram Bot 확장** - QR 모달, 세션 상태 표시, WC 알림 메시지, 감사 로그
   - Addresses: FEATURES.md의 Admin UI / UX 개선
   - Avoids: M-01 (CSP 충돌) -- 서버사이드 QR 생성으로 CSP 변경 불필요

**Phase ordering rationale:**
- Phase 1 -> 2: SignClient 인프라가 있어야 QR 페어링 가능
- Phase 2 -> 3: WC 세션이 있어야 서명 요청 가능
- Phase 3 -> 4: WC 서명 요청이 동작해야 fallback 조건 정의 가능
- Phase 4 -> 5: 핵심 기능 완성 후 UI/UX 보완
- 기존 REST API(SIWE/SIWS) 승인 경로는 모든 phase에서 유지 (절대 제거 안 함)

**Research flags for phases:**
- Phase 1: WC keyvaluestorage의 Node.js 파일 경로 기본값 확인 필요 (LOW confidence 항목)
- Phase 3: WC `session_request` 타임아웃 커스터마이징 API 검증 필요 (expiry 파라미터)
- Phase 4: Telegram /approve와 WC 승인의 동시성 방어 테스트 집중 필요

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry 직접 확인 (@walletconnect/sign-client 2.23.5, qrcode 1.5.4), Reown 공식 문서에서 sign-client 사용 확인 |
| Features | HIGH | WC 공식 스펙 (Pairing, Sign, Namespaces) + 기존 코드베이스 (ApprovalWorkflow, TelegramBot) 직접 분석 |
| Architecture | HIGH | dApp/Wallet 역할 구분, namespace 구성, chain ID 매핑 모두 공식 문서 검증 |
| Pitfalls | HIGH/MEDIUM | Critical 함정은 코드 분석 + WC 스펙으로 검증. 일부 Node.js 서버사이드 패턴은 GitHub 이슈 기반 (MEDIUM) |

## Gaps to Address

- WC `keyvaluestorage`의 Node.js 기본 파일 경로 (CWD 상대? 절대?) -- 소스 코드 확인 또는 테스트로 검증 필요
- WC `session_request`의 `expiry` 파라미터로 개별 요청 타임아웃을 설정하는 API 존재 여부 -- Phase 3에서 검증
- Solana WC 지갑 호환성 -- Phantom/Backpack의 WC v2 `solana_signMessage` 실제 지원 범위 검증 필요
- WC Extended Sessions (최대 7일 TTL) 사용 시 relay 비용/제한 -- WalletConnect Cloud 과금 체계 확인 필요
