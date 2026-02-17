# v1.5-034: OpenAPI → 클라이언트 타입 자동 생성 도입 — API 필드 불일치 구조적 방지

## 유형: ENHANCEMENT
## 심각도: MEDIUM
## 마일스톤: v1.5.1
## 상태: FIXED

---

## 배경

API 응답 필드명 불일치 버그가 반복 발생하고 있다:

| 이슈 | 서버 필드 | 클라이언트 참조 | 소비자 |
|------|----------|---------------|--------|
| #006 (v1.3) | `items` | `agents` | CLI (mcp-setup) |
| #033 (v1.5.1) | `availableNetworks` | `networks` | Admin UI (wallets) |

두 건 모두 **포인트 픽스**만 적용하고 구조적 대책을 미이행하여 동일 패턴이 재발했다.

### 근본 원인

서버(Daemon)와 클라이언트(Admin/CLI/SDK/MCP) 간 **타입 연결이 없다**:

```
Daemon                           Admin / CLI / SDK
──────                           ──────────────────
Zod 스키마 (SSoT)     ← 연결 없음 →    수동 TypeScript interface
OpenAPI spec 자동 생성               개발자 기억에 의존
```

- 서버: `@hono/zod-openapi`로 Zod 스키마 → OpenAPI spec 자동 생성 (이미 동작 중)
- 클라이언트: 개발자가 API 문서를 보고 수동으로 interface 작성
- 테스트 mock도 수동 가정 기반 → 실제 API와 동일 오류 재생산
- 빌드/린트 시점에 불일치를 감지할 수단 없음

---

## 구현 방안

### 방안 A: openapi-typescript 자동 생성 (추천)

OpenAPI JSON/YAML spec에서 TypeScript 타입을 자동 생성하는 빌드 단계 추가.

#### 1. OpenAPI spec 추출

```typescript
// scripts/export-openapi.ts
import { createApp } from '../packages/daemon/src/app.js';

const app = createApp(/* minimal deps */);
const spec = app.getOpenAPIDocument({ openapi: '3.1.0', info: { title: 'WAIaaS', version: '1.0.0' } });
fs.writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
```

#### 2. 타입 생성

```bash
pnpm add -Dw openapi-typescript
npx openapi-typescript openapi.json -o packages/core/src/api-types.generated.ts
```

생성 결과 예시:
```typescript
// auto-generated — do not edit
export interface paths {
  "/v1/wallets/{id}/networks": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              id: string;
              chain: string;
              environment: string;
              defaultNetwork: string | null;
              availableNetworks: Array<{  // ← SSoT에서 자동 파생
                network: string;
                isDefault: boolean;
              }>;
            };
          };
        };
      };
    };
  };
  // ...
}
```

#### 3. 클라이언트에서 생성된 타입 사용

```typescript
// packages/admin/src/pages/wallets.tsx
import type { paths } from '@waiaas/core/api-types.generated';

type NetworksResponse = paths['/v1/wallets/{id}/networks']['get']['responses']['200']['content']['application/json'];

const result = await apiGet<NetworksResponse>(API.WALLET_NETWORKS(id));
networks.value = result.availableNetworks;  // ← 컴파일 타임 검증
// result.networks → TypeScript 에러!
```

#### 4. CI에서 staleness 검증

```yaml
# .github/workflows/ci.yml
- name: Check API types freshness
  run: |
    pnpm run generate:api-types
    git diff --exit-code packages/core/src/api-types.generated.ts
```

### 방안 B: Contract Test (보완)

방안 A 도입 전까지 또는 병행하여, 서버 스키마 키와 클라이언트 타입 키를 비교하는 테스트 추가.

```typescript
// packages/daemon/src/__tests__/api-contract.test.ts
import { WalletNetworksResponseSchema, WalletListResponseSchema } from '../api/routes/openapi-schemas.js';

describe('API response schema field names', () => {
  it('WalletNetworksResponse uses availableNetworks (not networks)', () => {
    const keys = Object.keys(WalletNetworksResponseSchema.shape);
    expect(keys).toContain('availableNetworks');
    expect(keys).not.toContain('networks');
  });

  it('WalletListResponse uses items (not wallets/agents)', () => {
    const keys = Object.keys(WalletListResponseSchema.shape);
    expect(keys).toContain('items');
    expect(keys).not.toContain('wallets');
    expect(keys).not.toContain('agents');
  });
});
```

---

## 교체 대상 수동 interface 목록

| 파일 | 수동 interface | 대응 서버 스키마 |
|------|---------------|-----------------|
| `packages/admin/src/pages/wallets.tsx` | `Wallet`, `WalletDetail`, `NetworkInfo`, `WalletBalance`, `WalletTransaction` | `WalletCrudResponseSchema`, `WalletDetailResponseSchema`, `WalletNetworksResponseSchema` 등 |
| `packages/admin/src/pages/sessions.tsx` | 세션 관련 interface | `SessionResponseSchema` |
| `packages/admin/src/pages/policies.tsx` | 정책 관련 interface | `PolicyResponseSchema` |
| `packages/cli/src/commands/mcp-setup.ts` | 인라인 타입 단언 | `WalletListResponseSchema` |
| `packages/sdk/src/client.ts` | SDK 응답 타입 | 전체 API 스키마 |

---

## 적용 시점

- **방안 B (Contract Test)**: #033 수정 시 즉시 적용 가능
- **방안 A (openapi-typescript)**: 다음 구현 마일스톤(v1.5.3) 시작 전 선행 처리 권장

---

## 관련 이슈

| 이슈 | 관계 |
|------|------|
| #006 | 동일 패턴 최초 발견. 구조적 대책 미이행 |
| #033 | 동일 패턴 재발. 이 이슈의 직접 동기 |

---

*등록일: 2026-02-16*
