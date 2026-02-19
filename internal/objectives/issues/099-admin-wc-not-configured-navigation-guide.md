# 099 — WalletConnect 미설정 에러 시 설정 페이지 이동 안내 없음

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v2.5
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

Admin UI 지갑 상세에서 Owner 주소 등록 후 WalletConnect 연결을 시도할 때, Project ID가 설정되지 않은 상태이면 토스트 메시지로 **"WalletConnect is not configured. Set the Project ID in Settings first."** 가 표시된다.

메시지 자체는 정확하지만, 실제 설정 위치(Wallets 페이지 > WalletConnect 탭)로 이동할 수 있는 **링크나 버튼이 없어** 사용자가 어디서 설정해야 하는지 직관적으로 알기 어렵다.

## 원인

`handleWcConnect`의 catch 블록에서 `getErrorMessage(e.code)`로 텍스트 토스트만 표시하고, 네비게이션 안내를 제공하지 않는다.

```typescript
// packages/admin/src/pages/wallets.tsx:374-377
catch (err) {
  const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
  showToast('error', getErrorMessage(e.code));
  // → "WalletConnect is not configured. Set the Project ID in Settings first."
  // 설정 위치(Wallets > WalletConnect 탭) 이동 수단 없음
}
```

WalletConnect 설정은 Wallets 페이지의 하위 탭으로 배치되어 있다:
- 경로: `#/wallets` → WalletConnect 탭 (`WALLETS_TABS[3]`)
- `pendingNavigation` signal을 통한 탭 전환 메커니즘 존재 (`packages/admin/src/pages/wallets.tsx:1584-1593`)

## 기대 동작

`WC_NOT_CONFIGURED` 에러 발생 시, 토스트 메시지와 함께 Wallets > WalletConnect 탭으로 이동할 수 있는 안내를 제공한다.

예시 방안:
1. **자동 네비게이션**: 토스트 표시 후 `pendingNavigation`을 설정하여 Wallets > WalletConnect 탭으로 이동
2. **토스트 메시지 보강**: "WalletConnect is not configured. Go to Wallets > WalletConnect tab to set the Project ID." 안내 문구로 변경

## 수정 범위

### 접근 방식

`handleWcConnect`의 catch에서 `WC_NOT_CONFIGURED` 에러 코드를 특수 처리한다. 지갑 상세 페이지에서 지갑 목록으로 돌아가면서 WalletConnect 탭을 활성화하는 방식이 자연스럽다.

```typescript
catch (err) {
  const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
  if (e.code === 'WC_NOT_CONFIGURED') {
    showToast('error', 'WalletConnect is not configured. Redirecting to WalletConnect settings...');
    pendingNavigation.value = { tab: 'walletconnect', fieldName: 'walletconnect.project_id' };
    window.location.hash = '#/wallets';
  } else {
    showToast('error', getErrorMessage(e.code));
  }
}
```

기존 `pendingNavigation` + `highlightField` 메커니즘을 재사용하면 해당 설정 필드까지 하이라이트 가능하다.

### 영향 범위

- `packages/admin/src/pages/wallets.tsx` — `handleWcConnect` catch 블록 1곳
- `packages/admin/src/utils/error-messages.ts` — `WC_NOT_CONFIGURED` 메시지 문구 갱신 (선택)

## 테스트 항목

### 단위 테스트
1. `WC_NOT_CONFIGURED` 에러 시 `pendingNavigation`이 walletconnect 탭으로 설정되는지 확인
2. `window.location.hash`가 `#/wallets`로 변경되는지 확인

### 수동 검증
3. WalletConnect Project ID 미설정 상태에서 지갑 상세에서 연결 시도 → WalletConnect 탭으로 이동 + Project ID 필드 하이라이트 확인
