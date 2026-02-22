# #144 SDK Signing E2E 라이브 인프라 수동 테스트 미검증

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** v2.6.1
- **상태:** OPEN

## 현재 상태

- Wallet Signing SDK의 ntfy/Telegram 서명 채널 2개 E2E 플로우가 라이브 인프라에서 수동 테스트되지 않음
- 유닛/통합 테스트는 모두 통과하나, 실제 ntfy 서버 + Telegram Bot과의 end-to-end 흐름은 미검증
- v2.6.1 Milestone Audit에서 Known Gap으로 기록됨

## 미검증 플로우

1. **ntfy SDK Signing**: SDK → ntfy 토픽 발행 → 지갑 앱 수신 → 서명 → SDK 폴링 → 완료
2. **Telegram SDK Signing**: SDK → Telegram Bot 메시지 → 사용자 승인 → 서명 → 콜백 → 완료

## 수정 방향

- 라이브 ntfy 서버(ntfy.sh 또는 셀프호스팅)와 Telegram Bot으로 수동 E2E 테스트 수행
- 테스트 결과를 체크리스트로 기록
- 가능하면 CI에서 실행 가능한 semi-automated E2E 테스트 스크립트 작성

## 출처

- v2.6.1 Milestone Audit — Known Gaps
- `.planning/MILESTONES.md` lines 1246-1247

## 테스트 항목

- [ ] ntfy 채널 경유 SDK signing E2E: 승인 요청 발행 → 지갑 앱 수신 → 서명 응답 → SDK 수신 확인
- [ ] Telegram 채널 경유 SDK signing E2E: 승인 요청 발송 → 사용자 버튼 승인 → 서명 완료 확인
- [ ] 타임아웃 시 적절한 에러 반환 확인
- [ ] 거부(reject) 시 적절한 에러 반환 확인
