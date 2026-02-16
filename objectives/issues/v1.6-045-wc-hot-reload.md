# v1.6-045: WalletConnect 설정 변경 시 hot-reload 미지원

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 현상

Admin Settings에서 WalletConnect Project ID를 설정/변경해도 WcSessionService가 재초기화되지 않아 데몬 재시작이 필요함. 다른 모든 설정(notifications, rpc, security, display, autostop, monitoring)은 hot-reload를 지원하는데 WalletConnect만 유일한 예외.

서버 로그에만 안내가 남고 사용자에게는 "Settings saved and applied" 성공 토스트만 표시되어 인지 불가:
```
Hot-reload: WalletConnect settings updated. Note: project_id changes require daemon restart for full effect.
```

## 수정 방안

`hot-reload.ts`에서 WcSessionService를 재생성하는 `reloadWalletConnect()` 구현:

1. 기존 `WcSessionService.shutdown()` 호출 (있는 경우)
2. 새 project_id가 있으면 → 새 `WcSessionService` 인스턴스 생성 + `initialize()`
3. 새 project_id가 비어있으면 → `wcSessionService = null` (WC 비활성화)
4. `WcSigningBridge` 재연결
5. 서버 라우트의 deps 참조 갱신

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | `reloadWalletConnect()` 구현 |
| `packages/daemon/src/lifecycle/daemon.ts` | wcSessionService 참조를 동적 교체 가능하도록 개선 |
| `packages/daemon/src/api/server.ts` | WC 라우트 deps가 동적 참조를 따르도록 |
| `packages/daemon/src/services/wc-session-service.ts` | shutdown → re-init 안전성 보장 |

## 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-045-01 | Project ID 미설정 → Admin에서 설정 → Connect Wallet 클릭 | 재시작 없이 QR 모달 정상 표시 |
| T-045-02 | Project ID A로 연결 중 → Admin에서 Project ID B로 변경 | 기존 세션 정리, 새 Project ID로 재초기화 |
| T-045-03 | Project ID 설정됨 → Admin에서 빈 값으로 변경 | WcSessionService shutdown, WC 라우트에서 WC_NOT_CONFIGURED 반환 |
| T-045-04 | hot-reload 중 WC pair 요청 동시 발생 | 레이스 컨디션 없이 503 또는 정상 처리 |
| T-045-05 | relay_url 변경 시 hot-reload | SignClient가 새 relay로 재연결 |
