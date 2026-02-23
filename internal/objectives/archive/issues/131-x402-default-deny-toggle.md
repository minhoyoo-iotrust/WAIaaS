# 131 — X402_ALLOWED_DOMAINS 정책에 default-deny 토글 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

X402_ALLOWED_DOMAINS 정책은 하드코딩 default-deny로, 정책 미설정 시 모든 x402 결제가 차단된다. 다른 화이트리스트 정책(ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS)은 `policy.default_deny_*` 설정 토글로 default-deny를 런타임에 제어할 수 있으나, X402만 토글이 없다.

### 비교

| 정책 | default-deny 토글 | 기본값 |
|------|-------------------|--------|
| ALLOWED_TOKENS | `policy.default_deny_tokens` | `'true'` |
| CONTRACT_WHITELIST | `policy.default_deny_contracts` | `'true'` |
| APPROVED_SPENDERS | `policy.default_deny_spenders` | `'true'` |
| **X402_ALLOWED_DOMAINS** | **없음 (하드코딩)** | **항상 deny** |

x402 결제를 전면 허용하고 싶은 운영자는 현재 모든 도메인을 와일드카드(`*`)로 등록하는 우회가 필요하다. 다른 정책과 동일한 패턴을 적용하면 일관성이 확보된다.

## 수정 범위

### 1. SettingsService 키 추가

`packages/core/src/settings/setting-keys.ts`에 `policy.default_deny_x402_domains` 키 추가:

```typescript
'policy.default_deny_x402_domains': 'true',  // 기본값: deny
```

### 2. x402 도메인 평가 로직 수정

`packages/daemon/src/services/x402/x402-domain-policy.ts`의 `evaluateX402Domain()`:

현재:
```typescript
// 정책 미설정 시 무조건 deny
if (!policy) {
  return { allowed: false, tier: 'INSTANT', reason: 'x402 payments disabled: no X402_ALLOWED_DOMAINS policy configured' };
}
```

수정:
```typescript
if (!policy) {
  const defaultDeny = settingsService
    ? settingsService.get('policy.default_deny_x402_domains') !== 'false'
    : true;
  if (defaultDeny) {
    return { allowed: false, tier: 'INSTANT', reason: 'x402 payments disabled: no X402_ALLOWED_DOMAINS policy configured' };
  }
  return null;  // 허용
}
```

### 3. Admin UI Settings 반영

Admin Settings 정책 섹션에 "Default deny x402 domains" 토글 추가. 기존 3개 토글(`default_deny_tokens`, `default_deny_contracts`, `default_deny_spenders`)과 동일한 UI 패턴.

### 영향 범위

- `packages/core/src/settings/setting-keys.ts` — 키 추가
- `packages/daemon/src/services/x402/x402-domain-policy.ts` — SettingsService 참조 + 토글 분기
- `packages/admin/src/pages/settings.tsx` 또는 관련 설정 컴포넌트 — 토글 UI 추가

## 테스트 항목

### 단위 테스트

1. `policy.default_deny_x402_domains=true` + 정책 미설정 시 x402 결제가 차단되는지 확인
2. `policy.default_deny_x402_domains=false` + 정책 미설정 시 x402 결제가 허용되는지 확인
3. `policy.default_deny_x402_domains=false` + 정책 설정 시 화이트리스트 도메인만 허용되는지 확인
4. `policy.default_deny_x402_domains=true` + 정책 설정 시 기존 동작(화이트리스트 도메인만 허용)과 동일한지 확인
5. 설정 미존재(SettingsService 미주입) 시 기본값 `true`(deny)로 동작하는지 확인

### 회귀 테스트

6. 기존 X402_ALLOWED_DOMAINS 정책이 설정된 환경에서 동작이 변경되지 않는지 확인
7. 와일드카드 도메인 매칭(`*.example.com`)이 정상 동작하는지 확인
