# Feature Landscape: WalletConnect Owner 승인

**Domain:** Self-hosted AI agent wallet daemon -- WalletConnect v2 QR 페어링, 원격 서명 요청, Telegram fallback
**Researched:** 2026-02-16
**Overall Confidence:** HIGH (WC 공식 스펙 + 기존 코드베이스 분석)

---

## Table Stakes

Owner가 WalletConnect를 통해 승인할 때 **반드시 존재해야 하는** 기능. 없으면 기능 자체가 동작하지 않음.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| WC SignClient 초기화/종료 | WC 프로토콜의 기반 인프라. 없으면 아무것도 안 됨 | Med | project_id 필수, relay URL 연결, lifecycle 관리 |
| QR 코드 생성 (pairing URI) | Owner가 QR 스캔으로 세션 연결하는 UX의 핵심 | Low | `qrcode.toDataURL()` -> base64 PNG |
| WC 세션 관리 (생성/조회/삭제) | 세션 없이는 서명 요청 불가 | Med | `wc_sessions` DB 테이블, 이벤트 핸들링 |
| WC 서명 요청 (personal_sign / solana_signMessage) | APPROVAL 트랜잭션의 Owner 승인 핵심 메커니즘 | High | namespace별 메서드 분기, 승인 메시지 포맷 |
| WC 서명 응답 검증 | Owner 서명의 진위 확인. 없으면 보안 구멍 | Med | 기존 verifySIWE / Ed25519 verify 로직 재사용 |
| ApprovalWorkflow 통합 | WC 서명 -> approve()/reject() 연결 | High | 타이밍 동기화, CAS 기반 이중 승인 방어 |
| Telegram Bot fallback | WC 실패 시 대안 경로. self-hosted 신뢰성 핵심 | Med | 기존 /approve, /reject 재사용 + 전환 로직 |
| DB 마이그레이션 (v16) | wc_sessions 테이블 + pending_approvals.channel 컬럼 | Med | 증분 마이그레이션 필수 (MIG 전략 준수) |
| REST API 엔드포인트 | QR 생성, 세션 상태 조회, 페어링 해제 | Med | `GET /v1/admin/walletconnect/:walletId/pair` 등 |
| Setting keys 확장 | relay_url, metadata 설정 | Low | 기존 SettingsService 패턴 |

## Differentiators

존재하면 UX/보안이 크게 향상되는 기능. 없어도 기본 동작은 가능.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 구조화된 승인 메시지 | Owner가 "무엇을 승인하는지" 명확히 인지 | Med | TX 상세(금액, 수신자, 체인)를 포함한 읽기 쉬운 메시지 |
| Admin UI QR 모달 | 관리자가 브라우저에서 직관적으로 QR 표시 | Med | 기존 Modal 컴포넌트 + 타이머 + 세션 상태 |
| Admin UI WC 세션 패널 | 현재 세션 상태, 피어 메타데이터, 수동 disconnect | Med | wallets.tsx 확장 |
| 채널 우선순위 설정 | 운영자가 WC/Telegram/REST 순서를 Admin Settings에서 조정 | Low | `approval_channel_priority` 설정 키 |
| WC fallback 타임아웃 설정 | WC 응답 대기 시간을 운영자가 조정 | Low | `wc_fallback_timeout` 설정 키 (기본 60초) |
| 세션 자동 헬스체크 | 주기적 ping으로 WC 세션 liveness 확인, 만료 자동 정리 | Med | AutoStopService/BalanceMonitor 패턴 |
| WC 관련 알림 | 세션 연결/해제/만료 시 4채널 알림 | Low | 기존 NotificationService + 새 이벤트 타입 |
| WC 관련 감사 로그 | TX_APPROVED_VIA_WC, WC_SESSION_PAIRED 등 | Low | 기존 audit_log 테이블 |
| KillSwitch-WC 통합 | SUSPENDED 시 WC 승인 차단, 세션은 유지 | Med | 이벤트 핸들러에서 KillSwitch 상태 체크 |
| Telegram QR 전송 | QR 이미지를 Telegram으로 전송하여 모바일 페어링 | Low | 기존 Telegram API + qrcode base64 |

## Anti-Features

명시적으로 구현하지 않는 기능. 범위 외이거나, 구현하면 오히려 해로운 것.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WC를 통한 트랜잭션 실행 | WAIaaS는 Agent가 트랜잭션을 생성하고 Owner가 승인만 함. Owner가 WC 경유로 트랜잭션을 직접 제출하면 Agent 자율성 모델 파괴 | WC는 승인/거절 서명만 요청. 트랜잭션 생성/실행은 기존 파이프라인 |
| WC를 통한 KillSwitch 복구 | WC relay 의존성으로 복구 경로에 SPOF 추가. 보안상 KillSwitch 복구는 직접 접근(REST API)으로만 | REST API(SIWE/SIWS + masterAuth) 복구 유지 |
| 다중 WC 세션 지원 (v1.6.1) | wallet당 여러 WC 세션 허용 시 "어느 디바이스로 요청?" 결정 로직 복잡. 이중 서명 응답 위험 | wallet당 1개 WC 세션만 허용. 새 페어링 시 기존 세션 disconnect |
| WC relay self-hosting | WC 공식적으로 미지원. 자체 relay 구축은 과도한 인프라 투자 | 기본 relay 사용 + Telegram/REST fallback으로 SPOF 완화 |
| eth_signTypedData_v4 (v1.6.1) | personal_sign이 더 단순하고 모든 지갑 지원. Solana는 signMessage만 가능하므로 체인간 일관성 유지 | personal_sign + solana_signMessage 통일. EIP-712는 추후 확장 가능 |
| WC를 통한 Owner 등록/변경 | Owner 주소 변경은 보안 Critical 작업. WC relay 경유는 부적절 | 기존 REST API(masterAuth + ownerAuth) 유지 |
| 자동 WC 재연결 모달 | Admin UI에서 WC 세션 만료 시 자동으로 QR 모달 표시하는 것은 UX 방해 | 세션 만료 알림 + 수동 "재연결" 버튼 |
| WC 서명 없는 Telegram-only 고액 승인 | Telegram /approve는 ownerAuth 서명이 없으므로 보안 수준이 낮음. 고액에 허용하면 위험 | WC/REST(서명 포함) 승인만 허용하거나, Telegram은 소액 정책과 연동 (추후) |

## Feature Dependencies

```
walletconnect.project_id 설정 -> SignClient 초기화 가능
                                     |
                                     v
                              QR 페어링 URI 생성
                                     |
                                     v
                              WC 세션 승인 (Owner QR 스캔)
                                     |
                                     v
                              WC 세션 DB 저장 (wc_sessions)
                                     |
                                     v
      APPROVAL 거래 발생 ---------> WC 서명 요청 (personal_sign / solana_signMessage)
           |                         |
           |                    [WC 응답 대기]
           |                    /            \
           |              [성공]              [실패/타임아웃]
           |                |                      |
           |          서명 검증              Telegram fallback
           |                |                      |
           +--------> approve()/reject() <---------+
                            |
                        감사 로그 + 알림
```

## MVP Recommendation

### 필수 (Phase 1-3):
1. SignClient 초기화/종료 + DB v16 마이그레이션
2. QR 페어링 URI 생성 + REST API
3. WC 서명 요청 + ApprovalWorkflow.approve()/reject() 연동
4. 기본 서명 검증 (기존 verifySIWE / Ed25519 재사용)

### 핵심 (Phase 4):
5. Telegram fallback (WC 타임아웃 시 자동 전환)
6. 이중 승인 방어 (CAS 기반 단일 승인 소스)

### 보완 (Phase 5):
7. Admin UI QR 모달 + 세션 상태
8. 알림 + 감사 로그
9. 채널 우선순위/타임아웃 설정

### Defer:
- 다중 WC 세션 (wallet당 1개로 시작, 추후 확장)
- eth_signTypedData_v4 (personal_sign으로 시작)
- KillSwitch 복구에 WC 경로 추가 (REST API 전용 유지)
- 채널별 보안 수준 차별화 (Telegram 소액 제한 등)

## Sources

- [Reown Docs - Dapp Usage](https://docs.reown.com/advanced/api/sign/dapp-usage) -- SignClient API (connect, request, events)
- [WC Specs - Pairing](https://specs.walletconnect.com/2.0/specs/clients/core/pairing) -- pairing lifecycle
- [WC Specs - Sign](https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces) -- namespace 구조
- WAIaaS 코드베이스: `approval-workflow.ts`, `telegram-bot-service.ts`, `owner-auth.ts`, `setting-keys.ts`
