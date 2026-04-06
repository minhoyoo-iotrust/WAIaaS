# Phase 116: Default Deny Toggles - Research

**Researched:** 2026-02-14
**Domain:** SettingsService + DatabasePolicyEngine 분기 로직 + Admin UI 자동 노출
**Confidence:** HIGH

## Summary

Phase 116은 현재 DatabasePolicyEngine에 하드코딩된 3가지 기본 거부(default deny) 정책을 SettingsService 기반 토글로 전환하는 작업이다. 현재 ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS 정책이 미설정된 월렛에 대해 해당 트랜잭션 유형이 무조건 거부되는데, 이 토글을 통해 관리자가 각각을 개별적으로 ON/OFF 전환할 수 있게 된다.

기존 인프라가 완벽하게 갖추어져 있다. SettingsService는 DB > config.toml > default 3단계 폴백 체인을 지원하고, HotReloadOrchestrator가 키 변경 시 서브시스템 리로드를 처리하며, Admin UI Settings 페이지는 SETTING_DEFINITIONS에 추가된 키를 자동으로 노출한다(단, 카테고리별 수동 UI 섹션 매핑이 필요). DatabasePolicyEngine의 3개 메서드(`evaluateAllowedTokens`, `evaluateContractWhitelist`, `evaluateApprovedSpenders`)에 각각 4줄 정도의 분기 로직만 추가하면 된다.

핵심 설계 결정은 SettingsService를 DatabasePolicyEngine에 어떻게 전달할 것인가이다. 현재 DatabasePolicyEngine의 생성자는 `(db, sqlite?)`만 받는다. SettingsService 의존성을 주입하는 방법으로 (A) 생성자에 추가하거나 (B) setter 메서드를 추가하는 두 가지 옵션이 있다. IPolicyEngine 인터페이스 자체는 변경 불필요하다.

**Primary recommendation:** SettingsService를 DatabasePolicyEngine 생성자에 선택적 파라미터로 추가하고, `evaluateAllowedTokens/evaluateContractWhitelist/evaluateApprovedSpenders`의 "no policy" 분기에 토글 확인 로직을 삽입한다. `evaluateInstructionPolicies`(BATCH)도 동일하게 적용된다. 토글 값은 매 평가 시 `settingsService.get()`으로 읽되, 이는 DB 조회이므로 hot-reload가 자동으로 지원된다.

## Standard Stack

### Core (기존 사용, 추가 패키지 없음)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SettingsService | 내부 | 설정 CRUD + 3단계 폴백 | SSoT for operational settings |
| HotReloadOrchestrator | 내부 | 설정 변경 시 서브시스템 리로드 | 이미 notification/rpc/security 처리 |
| DatabasePolicyEngine | 내부 | 정책 평가 엔진 | 11개 정책 유형 지원 |
| setting-keys.ts | 내부 | SETTING_DEFINITIONS SSoT | 새 키 추가만으로 자동 인식 |
| Admin UI Settings | Preact+Signals | 설정 UI | FormField checkbox 이미 지원 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 기존 | 테스트 프레임워크 | 토글 동작 검증 테스트 |
| in-memory SQLite | 기존 | 테스트 DB | DatabasePolicyEngine 테스트 패턴 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SettingsService.get() per evaluation | Config 캐시 + 이벤트 리스너 | 불필요한 복잡성 -- SQLite get은 ~0.1ms, 캐시 무효화 이슈 발생 가능 |
| DatabasePolicyEngine 생성자 주입 | 전역 싱글톤 패턴 | 테스트 어려움, 기존 DI 패턴과 불일치 |
| 새 `policy` 카테고리 추가 | 기존 `security` 카테고리 사용 | 카테고리 추가 시 OpenAPI 스키마, Admin UI 섹션 추가 필요 -- `security`에 넣는 것이 더 간단 |

**Installation:** 추가 패키지 없음

## Architecture Patterns

### Recommended Changes Structure

```
packages/daemon/src/
├── infrastructure/settings/
│   └── setting-keys.ts          # +3 SETTING_DEFINITIONS 추가
├── pipeline/
│   └── database-policy-engine.ts # 생성자 + 3개 메서드 분기 수정
├── lifecycle/
│   └── daemon.ts                 # DatabasePolicyEngine 생성 시 settingsService 전달
├── __tests__/
│   └── database-policy-engine.test.ts  # +토글 동작 검증 테스트
│   └── settings-hot-reload.test.ts     # +policy 키 hot-reload 테스트 (선택)
packages/admin/src/
└── pages/
    └── settings.tsx              # SecuritySettings 섹션에 3개 체크박스 추가
```

### Pattern 1: SettingsService 생성자 주입

**What:** DatabasePolicyEngine 생성자에 선택적 SettingsService를 추가
**When to use:** 정책 평가 시 런타임 설정에 접근해야 할 때
**Example:**

```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts (현재)
export class DatabasePolicyEngine implements IPolicyEngine {
  private readonly sqlite: SQLiteDatabase | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    sqlite?: SQLiteDatabase,
  ) {
    this.sqlite = sqlite ?? null;
  }

// AFTER:
export class DatabasePolicyEngine implements IPolicyEngine {
  private readonly sqlite: SQLiteDatabase | null;
  private readonly settingsService: SettingsService | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    sqlite?: SQLiteDatabase,
    settingsService?: SettingsService,
  ) {
    this.sqlite = sqlite ?? null;
    this.settingsService = settingsService ?? null;
  }
```

### Pattern 2: 토글 확인 분기 로직 (3개 메서드 동일 패턴)

**What:** "no policy -> deny" 분기에 토글 확인 삽입
**When to use:** ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS 미설정 시
**Example:**

```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts
// BEFORE (evaluateAllowedTokens, line 773-779):
if (!allowedTokensPolicy) {
  return {
    allowed: false,
    tier: 'INSTANT',
    reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
  };
}

// AFTER:
if (!allowedTokensPolicy) {
  // Check default deny toggle -- if OFF, skip this check (allow through)
  const defaultDeny = this.settingsService?.get('policy.default_deny_tokens') !== 'false';
  if (defaultDeny) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
    };
  }
  return null; // default-allow mode: skip, continue evaluation
}
```

핵심: `settingsService?.get()` 사용으로 null 안전. settingsService가 null이면 `undefined !== 'false'` -> `true` -> 기본 거부 유지 (안전한 폴백).

### Pattern 3: SETTING_DEFINITIONS 추가 (SSoT)

**What:** 3개 토글 키를 SETTING_DEFINITIONS에 추가
**When to use:** 새로운 설정 키 도입 시
**Example:**

```typescript
// Source: packages/daemon/src/infrastructure/settings/setting-keys.ts
// security category 기존 키 뒤에 추가:
{ key: 'policy.default_deny_tokens', category: 'security', configPath: 'security.default_deny_tokens', defaultValue: 'true', isCredential: false },
{ key: 'policy.default_deny_contracts', category: 'security', configPath: 'security.default_deny_contracts', defaultValue: 'true', isCredential: false },
{ key: 'policy.default_deny_spenders', category: 'security', configPath: 'security.default_deny_spenders', defaultValue: 'true', isCredential: false },
```

주의: `key`는 `policy.*` prefix (논리적 도메인), `category`는 `security` (Admin UI 그룹), `configPath`는 `security.*` (DaemonConfig 맵핑). `defaultValue`는 `'true'` (기본 거부 유지).

### Pattern 4: Admin UI 체크박스 추가

**What:** SecuritySettings 컴포넌트에 3개 체크박스 추가
**When to use:** 새 보안 관련 토글 설정
**Example:**

```tsx
// Source: packages/admin/src/pages/settings.tsx - SecuritySettings 함수 내
function SecuritySettings() {
  // ... 기존 숫자 필드들 ...

  return (
    <div class="settings-category">
      <div class="settings-category-header">
        <h3>Security Parameters</h3>
        <p class="settings-description">Session, rate limiting, and policy defaults</p>
      </div>
      <div class="settings-category-body">
        {/* 기존 숫자 필드 그리드 */}
        <div class="settings-fields-grid">
          {fields.map((f) => (...))}
        </div>

        {/* NEW: Default Deny Policy Toggles */}
        <div class="settings-subgroup">
          <div class="settings-subgroup-title">Default Deny Policies</div>
          <div class="settings-fields-grid">
            <div class="settings-field-full">
              <FormField
                label="Default Deny Tokens"
                name="policy.default_deny_tokens"
                type="checkbox"
                value={getEffectiveBoolValue('security', 'default_deny_tokens')}
                onChange={(v) => handleFieldChange('policy.default_deny_tokens', v)}
              />
            </div>
            <div class="settings-field-full">
              <FormField
                label="Default Deny Contracts"
                name="policy.default_deny_contracts"
                type="checkbox"
                value={getEffectiveBoolValue('security', 'default_deny_contracts')}
                onChange={(v) => handleFieldChange('policy.default_deny_contracts', v)}
              />
            </div>
            <div class="settings-field-full">
              <FormField
                label="Default Deny Spenders"
                name="policy.default_deny_spenders"
                type="checkbox"
                value={getEffectiveBoolValue('security', 'default_deny_spenders')}
                onChange={(v) => handleFieldChange('policy.default_deny_spenders', v)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

주의: `key`는 `policy.default_deny_tokens`이지만 `category`는 `security`이므로, `getEffectiveBoolValue`는 `('security', 'default_deny_tokens')`로 호출해야 한다. 이는 `key.split('.').slice(1).join('.')`이 `default_deny_tokens`를 반환하고, 카테고리가 `security`이므로 정확히 매치된다.

### Pattern 5: keyToLabel 매핑 추가

```typescript
// Source: packages/admin/src/pages/settings.tsx - keyToLabel 함수
const map: Record<string, string> = {
  // ... 기존 매핑 ...
  default_deny_tokens: 'Default Deny: Token Transfers',
  default_deny_contracts: 'Default Deny: Contract Calls',
  default_deny_spenders: 'Default Deny: Token Approvals',
};
```

### Anti-Patterns to Avoid

- **전역 변수로 토글 상태 캐싱:** SettingsService.get()은 매번 DB를 조회하므로 hot-reload가 자연스럽게 지원된다. 캐시를 두면 무효화 시점 문제가 발생한다.
- **IPolicyEngine 인터페이스 변경:** IPolicyEngine은 core 패키지의 안정적 인터페이스. 구현체 레벨에서 해결해야 한다.
- **evaluateAndReserve에서 SettingsService.get() 누락:** evaluateAndReserve는 raw SQL로 정책을 로드하지만, "no policy" 분기에서 동일한 토글 확인이 필요하다. `this.settingsService?.get()` 호출은 raw sqlite 트랜잭션 내에서도 안전하다 (별도 DB 조회이지만, 같은 SQLite 커넥션의 settings 테이블 읽기는 IMMEDIATE 트랜잭션에서도 가능).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 설정 저장/조회 | Custom key-value store | SettingsService | 3단계 폴백, 암호화, importFromConfig 이미 구현 |
| Hot-reload 디스패치 | Custom event emitter | HotReloadOrchestrator | 카테고리별 리로더, fire-and-forget 에러 처리 |
| Admin UI 체크박스 | Custom toggle component | FormField type="checkbox" | 이미 notifications.enabled에서 사용 중 |
| 설정 키 등록 | Custom registry | SETTING_DEFINITIONS array | SSoT, getSettingDefinition() O(1) lookup |

**Key insight:** 이 Phase에서 새로 만들어야 하는 인프라는 없다. 모든 기반이 Phase 100-102에서 구축되었다. 순수 비즈니스 로직 변경만 필요하다.

## Common Pitfalls

### Pitfall 1: evaluateAndReserve에서 토글 확인 누락

**What goes wrong:** `evaluate()`와 `evaluateBatch()`에만 토글 로직을 추가하고 `evaluateAndReserve()`의 raw SQL 분기를 빠뜨리면, TOCTOU-safe 경로에서는 여전히 하드코딩된 기본 거부가 작동한다.
**Why it happens:** `evaluateAndReserve()`는 raw SQL로 정책을 로드한 후 별도의 private 메서드를 호출하지 않고 인라인으로 평가하므로, 같은 로직을 3곳에 적용해야 한다.
**How to avoid:** `evaluateAllowedTokens`, `evaluateContractWhitelist`, `evaluateApprovedSpenders`를 `evaluate()`와 `evaluateAndReserve()` 모두에서 호출하고 있는지 확인한다. 실제로 코드를 보면 `evaluateAndReserve()`도 이 private 메서드들을 호출하므로, private 메서드만 수정하면 된다.
**Warning signs:** evaluateAndReserve 경로에서 토글 OFF임에도 거부되는 테스트 실패.

### Pitfall 2: 화이트리스트 정책 존재 시 토글 무시 오류

**What goes wrong:** 토글이 OFF이고 화이트리스트 정책이 설정된 경우, 토글 때문에 화이트리스트 평가를 건너뛸 수 있다.
**Why it happens:** 토글 확인 로직을 잘못된 위치에 삽입하면 발생.
**How to avoid:** 토글은 오직 "no policy exists" 분기에서만 확인한다. 정책이 존재하면 토글과 무관하게 정상 화이트리스트 평가가 수행된다. 이것이 TOGGLE-04 요구사항의 핵심이다.
**Warning signs:** 화이트리스트에 없는 토큰/컨트랙트/스펜더가 토글 OFF 시 허용되는 테스트.

### Pitfall 3: Admin UI key/category 불일치

**What goes wrong:** SETTING_DEFINITIONS의 key가 `policy.default_deny_tokens`이고 category가 `security`인데, Admin UI에서 `getEffectiveValue('policy', 'default_deny_tokens')` 로 잘못 호출하면 값을 읽지 못한다.
**Why it happens:** SettingsService.getAllMasked()는 category별로 그룹화하고, 각 키의 `key.split('.').slice(1).join('.')`을 필드명으로 사용한다. 따라서 `policy.default_deny_tokens` 키는 `security` 카테고리 하위에 `default_deny_tokens` 필드로 노출된다.
**How to avoid:** Admin UI에서 `getEffectiveBoolValue('security', 'default_deny_tokens')` 사용. `handleFieldChange`는 full key인 `'policy.default_deny_tokens'`를 사용.
**Warning signs:** Admin UI에서 체크박스가 항상 false로 표시되는 문제.

### Pitfall 4: evaluateBatch의 evaluateInstructionPolicies 누락

**What goes wrong:** `evaluate()`와 `evaluateAndReserve()`는 수정했지만, `evaluateBatch()` 내부의 `evaluateInstructionPolicies()`를 빠뜨려서 BATCH 트랜잭션에서 토글이 작동하지 않는다.
**Why it happens:** `evaluateInstructionPolicies()`는 `evaluateAllowedTokens`, `evaluateContractWhitelist`, `evaluateApprovedSpenders`를 직접 호출하므로, private 메서드만 수정하면 자동으로 BATCH도 커버된다.
**How to avoid:** 코드 확인 결과, 3개 private 메서드만 수정하면 `evaluate()`, `evaluateAndReserve()`, `evaluateBatch()`가 모두 커버됨을 확인. 별도 작업 불필요.
**Warning signs:** BATCH 내 TOKEN_TRANSFER가 토글 OFF에도 거부되는 테스트.

### Pitfall 5: Hot-reload가 실제로 "즉시" 반영되는지

**What goes wrong:** hot-reload 콜백이 policy 키에 대해 아무 동작도 하지 않아 문서에 "hot-reload 지원"이라 써 있지만 실제로는 다음 요청부터 반영될 뿐이다.
**Why it happens:** SettingsService.get()은 매번 DB를 조회하므로 값 변경 즉시 다음 호출에 반영된다. 별도 hot-reload 동작이 필요 없다. security 키와 동일한 패턴.
**How to avoid:** HotReloadOrchestrator에 별도 policy 키 처리를 추가할 필요 없음. security 키처럼 "effective on next request" 로그만 추가하면 충분. TOGGLE-05의 "hot-reload" 요구사항은 SettingsService.get()의 자연스러운 동작으로 충족된다.
**Warning signs:** 없음 -- 이것은 의도된 동작.

## Code Examples

### Example 1: SETTING_DEFINITIONS 추가 (정확한 위치)

```typescript
// Source: packages/daemon/src/infrastructure/settings/setting-keys.ts
// 기존 security 키들 뒤에 추가 (line 82 이후):
  { key: 'security.policy_defaults_approval_timeout', category: 'security', configPath: 'security.policy_defaults_approval_timeout', defaultValue: '3600', isCredential: false },

  // --- policy default deny toggles (Phase 116) ---
  { key: 'policy.default_deny_tokens', category: 'security', configPath: 'security.default_deny_tokens', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_contracts', category: 'security', configPath: 'security.default_deny_contracts', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_spenders', category: 'security', configPath: 'security.default_deny_spenders', defaultValue: 'true', isCredential: false },
```

### Example 2: DatabasePolicyEngine 수정 (완전한 패턴)

```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts
import type { SettingsService } from '../infrastructure/settings/settings-service.js';

export class DatabasePolicyEngine implements IPolicyEngine {
  private readonly sqlite: SQLiteDatabase | null;
  private readonly settingsService: SettingsService | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    sqlite?: SQLiteDatabase,
    settingsService?: SettingsService,
  ) {
    this.sqlite = sqlite ?? null;
    this.settingsService = settingsService ?? null;
  }

  // evaluateAllowedTokens: "no policy" 분기 수정
  private evaluateAllowedTokens(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    if (transaction.type !== 'TOKEN_TRANSFER') return null;

    const allowedTokensPolicy = resolved.find((p) => p.type === 'ALLOWED_TOKENS');

    if (!allowedTokensPolicy) {
      // Check toggle: if default deny is OFF, skip this check
      if (this.settingsService?.get('policy.default_deny_tokens') === 'false') {
        return null; // default-allow mode
      }
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
      };
    }
    // ... rest unchanged (whitelist evaluation)
  }

  // evaluateContractWhitelist: 동일 패턴
  private evaluateContractWhitelist(/*...*/): PolicyEvaluation | null {
    if (transaction.type !== 'CONTRACT_CALL') return null;

    const contractWhitelistPolicy = resolved.find((p) => p.type === 'CONTRACT_WHITELIST');

    if (!contractWhitelistPolicy) {
      if (this.settingsService?.get('policy.default_deny_contracts') === 'false') {
        return null;
      }
      return { allowed: false, tier: 'INSTANT', reason: '...' };
    }
    // ... rest unchanged
  }

  // evaluateApprovedSpenders: 동일 패턴
  private evaluateApprovedSpenders(/*...*/): PolicyEvaluation | null {
    if (transaction.type !== 'APPROVE') return null;

    const approvedSpendersPolicy = resolved.find((p) => p.type === 'APPROVED_SPENDERS');

    if (!approvedSpendersPolicy) {
      if (this.settingsService?.get('policy.default_deny_spenders') === 'false') {
        return null;
      }
      return { allowed: false, tier: 'INSTANT', reason: '...' };
    }
    // ... rest unchanged
  }
}
```

### Example 3: daemon.ts DatabasePolicyEngine 생성 수정

```typescript
// Source: packages/daemon/src/lifecycle/daemon.ts (line ~369)
// BEFORE:
policyEngine: new DatabasePolicyEngine(this._db!, this.sqlite ?? undefined),

// AFTER:
policyEngine: new DatabasePolicyEngine(
  this._db!,
  this.sqlite ?? undefined,
  this._settingsService ?? undefined,
),
```

### Example 4: 토글 ON/OFF 테스트 패턴

```typescript
// Source: packages/daemon/src/__tests__/database-policy-engine.test.ts
describe('DatabasePolicyEngine - Default Deny Toggles', () => {
  let settingsService: SettingsService;

  beforeEach(async () => {
    // ... 기존 DB 설정 ...
    settingsService = new SettingsService({
      db: conn.db,
      config: createTestConfig(),
      masterPassword: 'test',
    });
    engine = new DatabasePolicyEngine(conn.db, undefined, settingsService);
  });

  it('denies TOKEN_TRANSFER when default_deny_tokens=true (default) and no ALLOWED_TOKENS', async () => {
    await insertPolicy({ type: 'SPENDING_LIMIT', rules: '...', priority: 10 });
    const result = await engine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(result.allowed).toBe(false);
  });

  it('allows TOKEN_TRANSFER when default_deny_tokens=false and no ALLOWED_TOKENS', async () => {
    settingsService.set('policy.default_deny_tokens', 'false');
    await insertPolicy({ type: 'SPENDING_LIMIT', rules: '...', priority: 10 });
    const result = await engine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(result.allowed).toBe(true);
  });

  it('evaluates whitelist normally when ALLOWED_TOKENS exists regardless of toggle', async () => {
    settingsService.set('policy.default_deny_tokens', 'false');
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: USDC_MINT }] }),
      priority: 15,
    });
    // Token NOT in whitelist -> deny (whitelist evaluation, not toggle)
    const result = await engine.evaluate(walletId, tokenTx('1000', 'unknown_token'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });

  it('hot-reload: changing toggle takes effect on next evaluation', async () => {
    await insertPolicy({ type: 'SPENDING_LIMIT', rules: '...', priority: 10 });

    // Initially: deny
    const r1 = await engine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(r1.allowed).toBe(false);

    // Toggle OFF
    settingsService.set('policy.default_deny_tokens', 'false');

    // Now: allow
    const r2 = await engine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(r2.allowed).toBe(true);

    // Toggle back ON
    settingsService.set('policy.default_deny_tokens', 'true');

    // Again: deny
    const r3 = await engine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(r3.allowed).toBe(false);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 하드코딩된 기본 거부 | SettingsService 기반 토글 | Phase 116 | 관리자가 운영 환경에 맞게 정책 완화 가능 |
| DatabasePolicyEngine(db, sqlite) | DatabasePolicyEngine(db, sqlite, settingsService) | Phase 116 | 선택적 DI, 기존 테스트 호환 |

**Deprecated/outdated:**
- 없음 -- 기존 API/인터페이스 변경 없음

## Open Questions

1. **config.toml에 default_deny_* 키를 추가할 것인가?**
   - What we know: `configPath`는 `security.default_deny_tokens` 등으로 설정. DaemonConfigSchema에는 현재 이 필드가 없다.
   - What's unclear: config.toml 사용자가 이 값을 파일에서 설정하고 싶을 수 있다.
   - Recommendation: DaemonConfigSchema security 섹션에 3개 boolean 필드를 추가하면 config.toml -> DB import가 자동으로 작동한다. 추가하지 않으면 DB/Admin UI에서만 변경 가능하다. **추가하는 것을 권장** -- 기존 패턴과 일치하고, importFromConfig 자동 지원.

2. **HotReloadOrchestrator에 policy 키 처리를 추가할 것인가?**
   - What we know: security 키 변경은 "effective on next request" 로그만 출력. policy 토글도 동일한 패턴이 적합.
   - What's unclear: 별도 서브시스템 리로드가 필요한지.
   - Recommendation: **불필요.** SettingsService.get()이 매번 DB를 조회하므로 별도 리로드 없이 즉시 반영. SECURITY_KEYS Set에 policy 키를 추가하면 "Security parameters updated" 로그가 출력되어 운영자에게 변경 사실을 알린다.

## Sources

### Primary (HIGH confidence)
- 코드베이스 직접 분석: `packages/daemon/src/pipeline/database-policy-engine.ts` -- 11개 정책 유형 평가 로직, 3개 기본 거부 분기 위치 확인
- 코드베이스 직접 분석: `packages/daemon/src/infrastructure/settings/settings-service.ts` -- get/set/getAll/getAllMasked 메서드, 3단계 폴백 체인
- 코드베이스 직접 분석: `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- SETTING_DEFINITIONS 구조, 31개 기존 키
- 코드베이스 직접 분석: `packages/daemon/src/infrastructure/settings/hot-reload.ts` -- HotReloadOrchestrator 패턴, SECURITY_KEYS 처리
- 코드베이스 직접 분석: `packages/daemon/src/lifecycle/daemon.ts` (line 369) -- DatabasePolicyEngine 생성 및 DI 지점
- 코드베이스 직접 분석: `packages/admin/src/pages/settings.tsx` -- SecuritySettings 컴포넌트, FormField checkbox 패턴
- 코드베이스 직접 분석: `packages/daemon/src/__tests__/database-policy-engine.test.ts` -- 테스트 패턴 (in-memory SQLite + insertPolicy helper)
- 코드베이스 직접 분석: `.planning/research/FEATURES.md` (DF-03 섹션) -- 사전 기획 연구 결과

### Secondary (MEDIUM confidence)
- 코드베이스 직접 분석: `packages/daemon/src/api/routes/admin.ts` -- PUT /admin/settings 엔드포인트, onSettingsChanged 콜백
- 코드베이스 직접 분석: `packages/daemon/src/__tests__/settings-hot-reload.test.ts` -- HotReloadOrchestrator 테스트 패턴

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모든 인프라가 이미 존재하며 코드 직접 확인 완료
- Architecture: HIGH -- 3개 private 메서드 수정 + 3개 SETTING_DEFINITIONS 추가의 단순 패턴
- Pitfalls: HIGH -- evaluateAndReserve/evaluateBatch 코드 경로 분석 완료, private 메서드 공유 구조 확인

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (안정적 내부 아키텍처, 30일)

---

## Implementation Impact Summary

| 파일 | 변경 유형 | 변경 규모 |
|------|-----------|-----------|
| `setting-keys.ts` | 3줄 추가 | ~3 LOC |
| `database-policy-engine.ts` | 생성자 + 3개 메서드 분기 | ~20 LOC |
| `daemon.ts` | DatabasePolicyEngine 생성 인자 추가 | ~2 LOC |
| `settings.tsx` | SecuritySettings에 3개 체크박스 | ~30 LOC |
| `settings.tsx` (keyToLabel) | 3개 라벨 매핑 | ~3 LOC |
| `hot-reload.ts` | SECURITY_KEYS에 3개 키 추가 (선택) | ~3 LOC |
| `loader.ts` | DaemonConfigSchema security에 3개 필드 (선택) | ~3 LOC |
| `database-policy-engine.test.ts` | 토글 동작 테스트 | ~100 LOC |
| **Total** | | **~165 LOC** |
