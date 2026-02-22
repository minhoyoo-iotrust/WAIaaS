# Phase 216 Summary: Solana 수신 감지 전략 설계

## Completed
- [x] 216-01: SolanaIncomingSubscriber 구독 전략 + TX 파싱 알고리즘 + ATA 감지 명세

## Key Decisions
1. logsSubscribe({ mentions: [walletAddress] }) 단일 구독으로 SOL + 모든 SPL 토큰 감지
2. mentions 구독은 지갑당 별도 구독 필요 (배열이지만 단일 주소만 허용)
3. preBalances/postBalances 차이로 SOL 수신 금액 계산
4. preTokenBalances/postTokenBalances 차이로 SPL 수신 금액 계산 (최초 수신 시 pre=0n)
5. Token-2022는 별도 필터 불필요 — jsonParsed 응답이 프로그램 구분 없이 모든 토큰 잔액 포함
6. ATA 2레벨 구독은 mentions 방식으로 자연스럽게 해결 — 별도 메커니즘 불필요
7. 폴링 폴백: getSignaturesForAddress(until: lastSig) 커서 관리
8. confirmed 감지 → finalized 확정 2단계 commitment 정책

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 3

## Requirements Covered
- MON-02: logsSubscribe + getTransaction 파싱으로 SOL + SPL 감지 ✅
- MON-08: ATA 2레벨 구독 (기존 ATA + 신규 ATA 생성 자동 감지) ✅
