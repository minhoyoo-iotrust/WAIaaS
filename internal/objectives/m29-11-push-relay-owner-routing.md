# m29-11: 푸시 릴레이 구독 토큰 기반 알림 격리

- **Status:** SUPERSEDED
- **Milestone:** N/A

## 이슈로 전환

설계 검토 결과 마일스톤 규모가 아닌 이슈 2개로 분할:

| 이슈 | 제목 | 의존 |
|------|------|------|
| [#230](issues/230-wallet-apps-type-name-split.md) | wallet_apps wallet_type / name 분리 | — |
| [#231](issues/231-subscription-token-routing.md) | 구독 토큰 기반 ntfy 토픽 라우팅 | #230 |

## 설계 결정 요약

1. **daemonId 제거** → 구독 토큰(subscription token)으로 대체
2. **토큰 생성 주체**: 푸시 릴레이 (디바이스 등록 시 생성 + 반환, 텔레그램 봇 토큰 패턴)
3. **토픽 = 비밀값**: `waiaas-sign-{walletType}-{token}` — 토큰을 모르면 구독 불가
4. **1:1 모델**: 1 토큰 = 1 디바이스, 추가 디바이스는 지갑 앱 추가 등록
5. **wallet_type / name 분리**: 프리셋(wallet_type)과 사용자 라벨(name)을 분리하여 다중 등록 지원
6. **데몬 ↔ 릴레이 직접 통신 없음**: 각자 ntfy만 바라봄

---

*생성일: 2026-03-02*
*관련: m29-10, v29.7, v26.3*
