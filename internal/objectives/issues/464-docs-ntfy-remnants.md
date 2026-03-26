# #464 — 문서에 ntfy.sh 잔재 설명 잔존

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **등록일:** 2026-03-26
- **관련:** #463 (코드 잔재 제거 완료), v32.9 (ntfy.sh 제거)

## 현상

v32.9에서 ntfy.sh를 제거하고 Push Relay 직접 연동으로 전환했고, #463에서 코드 잔재를 제거했으나, 사용자/개발자 대면 문서에 ntfy 관련 설명이 여전히 남아있다.

## 수정 대상

### Tier 1: 사용자/개발자 대면 문서 (반드시 수정)

| 파일 | ntfy 참조 내용 | 수정 방향 |
|------|---------------|----------|
| `docs/wallet-sdk-integration.md` | Scenario 1 ntfy Direct 전체, sendViaNtfy 코드 예시, ntfy fetch URL 모드, responseTopic, ntfy 채널 보안 설명, FAQ ntfy 언급 | ntfy 시나리오 제거, Push Relay 중심으로 재작성 |
| `docs/architecture.md` | `sdk_ntfy` approval method, ntfy mermaid 다이어그램, WalletNotificationChannel ntfy 설명 | Push Relay 기반으로 업데이트 |
| `docs/deployment.md` | `ntfy_topic`, `ntfy_server` config 설명, ntfy 채널 설정 가이드 | ntfy config 항목 제거, Push Relay 설정으로 교체 |
| `docs/security-model.md` | ntfy HTTP push 전송 프로토콜 표 | Push Relay HTTP POST로 업데이트 |
| `skills/wallet.skill.md` | ntfy 관련 설명 | Push Relay 기반으로 업데이트 |
| `README.md` | ntfy 참조 여부 확인 후 수정 | 필요 시 업데이트 |

### Tier 2: 내부 설계 문서 (필요 시 주석 추가)

| 파일 | 비고 |
|------|------|
| `internal/design/73-signing-protocol-v1.md` | 원본 설계 문서 — 역사적 기록. 상단에 "v32.9에서 ntfy 제거됨" 노트 추가 |
| `internal/design/74-wallet-sdk-daemon-components.md` | 동일 |
| `internal/design/75-notification-channel-push-relay.md` | 동일 |
| `internal/design/35-notification-architecture.md` | 동일 |

### Tier 3: 수정 불필요 (역사적 아카이브)

- `.planning/milestones/v32.9-*` — v32.9 마일스톤 계획/실행 기록 (ntfy 제거 작업 자체의 기록)
- `.planning/milestones/v2.6.1-*` — Signing SDK 초기 구현 기록
- `.planning/milestones/v29.7-*` — D'CENT 직접 서명 기록
- `internal/objectives/archive/*` — 아카이브된 이슈/마일스톤
- `CHANGELOG.md` — 자동 생성, 수정 금지
- `agent-uat/*` — UAT 시나리오 기록

## 수정 원칙

1. **Tier 1 문서**: ntfy 직접 시나리오/코드를 완전 제거하고 Push Relay + Telegram 2채널 구조로 재작성
2. **Tier 2 설계 문서**: 파일 상단에 deprecation 노트만 추가 (본문은 역사적 기록으로 보존)
3. **Tier 3 아카이브**: 수정하지 않음

## 테스트 항목

- [ ] `docs/wallet-sdk-integration.md` — ntfy/responseTopic/sendViaNtfy 참조 0건 확인
- [ ] `docs/architecture.md` — ntfy 참조 현행 구조 반영 확인
- [ ] `docs/deployment.md` — ntfy config 항목 제거 확인
- [ ] `docs/security-model.md` — 전송 프로토콜 표 업데이트 확인
- [ ] `skills/wallet.skill.md` — ntfy 참조 제거 확인
- [ ] Tier 2 설계 문서 — deprecation 노트 추가 확인
