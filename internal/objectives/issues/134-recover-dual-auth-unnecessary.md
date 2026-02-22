# 134 — 킬 스위치 Recover의 dual-auth(owner 서명) 요구가 불필요

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

`POST /v1/admin/recover` 엔드포인트는 owner가 등록된 지갑이 하나라도 있으면 master password에 추가로 owner 서명(dual-auth)을 요구한다(`admin.ts:915-937`).

그러나 WAIaaS는 **self-hosted 로컬 데몬**이므로 master password를 아는 관리자 = 서버/DB 접근 권한을 가진 사람이다. dual-auth를 요구해도 관리자가 DB를 직접 수정하면 우회 가능하다:

```sql
UPDATE key_value_store SET value = 'ACTIVE' WHERE key = 'kill_switch_state';
```

즉, dual-auth는 **실질적 보안 효과 없이 긴급 복구만 어렵게 만든다.**

### 문제 정리

| 관점 | 현재 상태 |
|------|----------|
| 보안 강화 효과 | 없음 — DB 직접 수정으로 우회 가능 (self-hosted) |
| UX 영향 | 부정적 — 긴급 상황에서 외부 지갑 서명 필요 (WalletConnect 등) |
| Admin UI 지원 | 미구현 — recover 핸들러가 owner 서명을 수집하는 UI 없음 (#132) |
| 킬 스위치 목적 | 긴급 차단 + 빠른 복구 — 복구 경로가 복잡하면 목적에 반함 |

## 수정 범위

### `packages/daemon/src/api/routes/admin.ts` — recover 핸들러

현재 (`admin.ts:906-937`):
```typescript
const walletsWithOwner = deps.db
  .select({ ownerAddress: wallets.ownerAddress })
  .from(wallets)
  .where(sql`${wallets.ownerAddress} IS NOT NULL`)
  .all();

const hasOwners = walletsWithOwner.length > 0;

if (hasOwners) {
  if (!body.ownerSignature || !body.ownerAddress || !body.message) {
    throw new WAIaaSError('INVALID_SIGNATURE', { ... });
  }
  // owner 주소 매칭 검증 ...
}
```

수정:
```typescript
// master password(masterAuth 미들웨어)만으로 복구 허용
// owner 등록 여부와 무관하게 dual-auth 검증 제거
```

- `hasOwners` 분기 및 owner 서명 검증 로직 전체 제거
- masterAuth 미들웨어가 이미 master password를 검증하므로 추가 인증 불필요
- recover 요청에 body가 필요 없어지므로 빈 body/body 없이 호출 가능

### 영향 범위

- `packages/daemon/src/api/routes/admin.ts` — dual-auth 검증 제거
- `packages/daemon/src/api/routes/openapi-schemas.ts` — recover 요청 스키마에서 owner 필드 제거 (있는 경우)

## 테스트 항목

### 단위 테스트

1. owner가 등록된 환경에서 master password만으로 SUSPENDED → ACTIVE 복구 성공 확인
2. owner가 등록된 환경에서 master password만으로 LOCKED → ACTIVE 복구 성공 확인
3. owner 미등록 환경에서 기존과 동일하게 복구 성공 확인
4. master password 없이 호출 시 401 확인 (masterAuth 미들웨어 정상 동작)

### 회귀 테스트

5. 킬 스위치 활성화(ACTIVE → SUSPENDED) 기능이 변경되지 않는지 확인
6. 에스컬레이션(SUSPENDED → LOCKED) 기능이 변경되지 않는지 확인
