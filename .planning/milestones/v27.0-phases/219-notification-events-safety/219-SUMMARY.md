# Phase 219 Summary: 알림 이벤트 + 의심 입금 감지 설계

## Completed
- [x] 219-01: INCOMING_TX_DETECTED/SUSPICIOUS 이벤트 스키마 + 알림 채널 연동 명세
- [x] 219-02: IIncomingSafetyRule 인터페이스 + 감지 규칙 3종 + i18n 메시지 템플릿

## Key Decisions
1. NotificationEventType 28→30 확장 (INCOMING_TX_DETECTED + INCOMING_TX_SUSPICIOUS)
2. EventBus 'transaction:incoming' + 'transaction:incoming:suspicious' 2개 이벤트 추가
3. SuspiciousReason: 'dust' | 'unknownToken' | 'largeAmount' 3종
4. 의심 TX도 DB에 저장 (기록 유지) + SUSPICIOUS 이벤트로 별도 알림
5. DustAttackRule: $0.01 미만 (PriceOracle 연동)
6. UnknownTokenRule: token_registry 미등록 토큰
7. LargeAmountRule: 30일 평균 수신의 10배 초과
8. i18n 메시지 템플릿 en/ko 양쪽 정의
9. 알림 카테고리 'incoming' 추가, SUSPICIOUS는 priority: high

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 6

## Requirements Covered
- EVT-01: INCOMING_TX_DETECTED 이벤트 스키마 ✅
- EVT-02: INCOMING_TX_SUSPICIOUS 이벤트 스키마 (suspiciousReasons 포함) ✅
- EVT-03: 5채널(Telegram/Discord/ntfy/Slack/WalletNotification) 연동 명세 ✅
- EVT-04: i18n 메시지 템플릿 en/ko ✅
- EVT-05: IIncomingSafetyRule + 3규칙 (dust/unknownToken/largeAmount) ✅
