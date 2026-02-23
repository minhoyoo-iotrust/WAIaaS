# 166 — WalletConnect 핫리로드 시 WcSigningBridge 미생성

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.2
- **상태:** OPEN

## 증상

Admin Settings에서 `walletconnect.project_id`를 설정한 후 데몬을 재시작하지 않으면, WC 페어링/세션 연결은 정상이지만 APPROVAL 티어 트랜잭션에서 지갑 앱에 서명 요청이 전달되지 않음.

- WC 세션 상태: `connected` (D'CENT Wallet, `eip155:84532`)
- pending_approvals.approval_channel: 모든 건이 `rest_api` — `walletconnect`로 전환되지 않음
- 지갑 앱에 서명 팝업 미표시

## 원인

`HotReloadOrchestrator.reloadWalletConnect()`가 `WcSessionService`만 재생성하고 `WcSigningBridge`를 생성하지 않음.

### 데몬 시작 시 (daemon.ts)

```
Step 4c-6: WcSessionService 초기화
Step 4c-7: if (this.wcSessionService && ...) → WcSigningBridge 생성
```

시작 시 `walletconnect.project_id`가 없으면 → WcSessionService = null → WcSigningBridge = null

### 핫리로드 시 (hot-reload.ts:331-364)

```typescript
// reloadWalletConnect()
ref.current = newService;  // WcSessionService ✓ 재생성
// WcSigningBridge?        // ✗ 누락 — daemon.wcSigningBridge = null 유지
```

### 결과

- `ctx.wcSigningBridge`가 `undefined` → `stage4Wait`의 WC 서명 분기 건너뜀
- `ApprovalChannelRouter` 글로벌 폴백에서 WalletConnect 선택되나, 이는 channelResult=null (Telegram 메시지 없이 method만 반환)
- 실질적으로 서명 요청 전달 경로 없음

## 영향 범위

- WC project_id를 **데몬 실행 중** Admin Settings에서 설정한 모든 사용자
- config.toml에 미리 설정하고 시작한 경우에는 영향 없음

## 수정 방안

`reloadWalletConnect()`에서 WcSigningBridge도 함께 생성/파괴:

1. WcSessionService 재생성 후, `approvalWorkflow`와 `sqlite`가 있으면 WcSigningBridge 생성
2. HotReloadDeps에 WcSigningBridge 관련 의존성 추가 (approvalWorkflow, mutable bridge ref)
3. WcSessionService 제거 시 WcSigningBridge도 null로 설정

또는 daemon.ts에서 WcSigningBridge를 `wcServiceRef` 기반으로 지연 생성하는 방식도 가능 (이미 내부에서 `wcServiceRef.current`를 참조하므로, 시작 시 무조건 생성하고 런타임에 ref가 null이면 guard에서 빠지는 구조).

## 테스트 항목

1. Admin Settings에서 WC project_id 설정 → 핫리로드 후 WcSigningBridge 생성 확인
2. APPROVAL 트랜잭션 시 pending_approvals.approval_channel이 `walletconnect`로 업데이트되는지 검증
3. WC project_id 제거 → 핫리로드 후 WcSigningBridge null 확인
4. 데몬 시작 시 project_id 사전 설정된 경우 기존 동작 회귀 없음 확인
