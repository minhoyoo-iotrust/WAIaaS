---
phase: 263-admin-ui-rpc-endpoints
verified: 2026-02-25T11:15:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 263: Admin UI RPC Endpoints Verification Report

**Phase Goal:** Admin UI의 RPC Endpoints 탭에서 네트워크별 복수 RPC URL을 시각적으로 관리할 수 있다
**Verified:** 2026-02-25T11:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RPC Endpoints tab shows per-network expandable sections with ordered URL lists | VERIFIED | `wallets.tsx:1664` — `<details class="rpc-pool-network">` with `NETWORK_DISPLAY_NAMES`, priority `#idx+1`, collapsible via `toggleExpand` |
| 2 | Admin can add a new URL to a network's list via text input + Add button | VERIFIED | `wallets.tsx:1781-1794` — `<input class="rpc-add-url-input">` + `<Button onClick={() => addUrl(network)}>Add</Button>`; `addUrl()` at line 1613 validates https:// and deduplication |
| 3 | Admin can remove a user-added URL from a network's list | VERIFIED | `wallets.tsx:1768-1775` — delete button `onClick={() => removeUrl(network, idx)}` present for non-builtin URLs |
| 4 | Admin can reorder URLs using up/down arrows to change priority | VERIFIED | `wallets.tsx:1740-1757` — up arrow `onClick={() => moveUrl(network, idx, 'up')}` and down arrow `onClick={() => moveUrl(network, idx, 'down')}`, disabled at boundaries |
| 5 | Built-in default URLs are labeled (built-in) and cannot be deleted, only disabled/enabled | VERIFIED | `wallets.tsx:1688` — `<span class="badge-builtin">(built-in)</span>` for `entry.isBuiltin`; delete button replaced by On/Off toggle (`toggleBuiltin`) at `wallets.tsx:1758-1766` |
| 6 | Saving the URL list persists via PUT /admin/settings (rpc_pool.* keys) and hot-reloads | VERIFIED | `wallets.tsx:1551-1566` — collects `rpc_pool.{network}` JSON arrays of user-only URLs and calls `apiPut(API.ADMIN_SETTINGS, { settings: entries })` |
| 7 | GET /admin/rpc-status returns per-network RPC pool state from daemon memory | VERIFIED | `admin.ts:2586-2596` — handler iterates `deps.rpcPool.getNetworks()`, calls `getStatus(network)`, returns `{ networks: {...} }`; wired in `server.ts:577` |
| 8 | Each URL row displays live status: available or cooldown with time and failure count | VERIFIED | `wallets.tsx:1690-1713` — status dot + "Available"/"Cooldown" + `formatCooldown` + failure count `Badge` rendered per URL |
| 9 | Status auto-refreshes every 15 seconds via polling GET /admin/rpc-status | VERIFIED | `wallets.tsx:1483-1496` — `useEffect` with `setInterval(fetchStatus, 15_000)` and `clearInterval` on unmount |
| 10 | Each URL has a Test button that fires POST /admin/settings/test-rpc and shows result | VERIFIED | `wallets.tsx:1716-1738` — `<Button onClick={() => handleTestUrl(network, entry.url)}>Test</Button>`; result badge shows OK/FAIL with latency/block/error |
| 11 | Test result badge shows OK (green) with latency+block or FAIL (red) with error message | VERIFIED | `wallets.tsx:1724-1737` — `Badge variant={testResult.success ? 'success' : 'danger'}` with latency, block number, and error message display |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/api/routes/admin.ts` | GET /admin/rpc-status endpoint returning RpcPool.getStatus() | VERIFIED | `rpcStatusRoute` defined at line 351, handler at line 2586; iterates `deps.rpcPool.getNetworks()` and calls `getStatus()` |
| `packages/admin/src/pages/wallets.tsx` | Redesigned RpcEndpointsTab with multi-URL list management | VERIFIED | `RpcEndpointsTab` at line 1407; contains all signals, polling, add/delete/reorder/test/save logic; 585+ lines of substantive implementation |
| `packages/admin/src/api/endpoints.ts` | ADMIN_RPC_STATUS endpoint constant | VERIFIED | Line 21: `ADMIN_RPC_STATUS: '/v1/admin/rpc-status'` |
| `packages/admin/src/styles/global.css` | CSS for rpc-pool-network, rpc-url-item, built-in badge, status indicators | VERIFIED | Lines 1200-1349+: `.rpc-pool-network`, `.rpc-url-item`, `.rpc-url-item--builtin`, `.badge-builtin`, `.rpc-url-status`, `.rpc-url-status-dot--available/cooldown/unknown` all present |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | RpcStatusResponseSchema and RpcEndpointStatusSchema | VERIFIED | Lines 1182-1191: both schemas defined |
| `packages/admin/src/utils/settings-helpers.ts` | RpcPoolStatus and RpcEndpointStatusEntry types | VERIFIED | Lines 39-46: both types defined |
| `packages/daemon/src/__tests__/admin-rpc-status.test.ts` | 4 backend tests for GET /admin/rpc-status | VERIFIED | 227 lines, 4 tests — network status, empty pool, field validation, 401 auth |
| `packages/admin/src/__tests__/wallets-rpc-pool.test.tsx` | 13 frontend tests for multi-URL tab | VERIFIED | 585 lines, 13 tests — render, add, delete, built-in label, reorder, save, discard, available/cooldown status, test button, success/failure, formatCooldown |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/admin/src/pages/wallets.tsx` | `/v1/admin/settings` | `apiGet` for rpc_pool.* JSON arrays + `apiPut` for saving | WIRED | `wallets.tsx:1466` — load settings; `wallets.tsx:1558` — save `rpc_pool.${network}` entries |
| `packages/admin/src/pages/wallets.tsx` | `/v1/admin/rpc-status` | `apiGet` in `useEffect` + `setInterval` for periodic polling | WIRED | `wallets.tsx:1487` — `apiGet(API.ADMIN_RPC_STATUS)`; `wallets.tsx:1494` — `setInterval(fetchStatus, 15_000)` |
| `packages/admin/src/pages/wallets.tsx` | `/v1/admin/settings/test-rpc` | `apiPost` per Test button click | WIRED | `wallets.tsx:1503` — `apiPost(API.ADMIN_SETTINGS_TEST_RPC, { url, chain: networkToChain(network) })` |
| `packages/daemon/src/api/routes/admin.ts` | `RpcPool.getStatus()` | `deps.rpcPool` injection returning `RpcEndpointStatus[]` | WIRED | `admin.ts:2589-2592` — `deps.rpcPool.getStatus(network)` called per network |
| `packages/daemon/src/api/server.ts` | `admin.ts` createAdminRoutes | rpcPool from `adapterPool.pool` passed as dep | WIRED | `server.ts:577` — `rpcPool: deps.adapterPool?.pool` in admin deps |
| `packages/daemon/src/api/server.ts` | `/v1/admin/rpc-status` masterAuth | `masterAuthForAdmin` middleware applied | WIRED | `server.ts:313` — `app.use('/v1/admin/rpc-status', masterAuthForAdmin)` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ADUI-01 | 263-01 | RPC Endpoints 탭에서 네트워크별 복수 URL 목록을 표시하고 순서를 변경할 수 있다 | SATISFIED | Per-network collapsible sections with ordered URL list and up/down reorder buttons implemented; 2 frontend tests verify |
| ADUI-02 | 263-02 | URL별 상태를 표시한다 (정상: 레이턴시+블록번호 / cooldown: 남은시간+실패횟수) | SATISFIED | Live pool status indicator per URL via 15s polling; available/cooldown states with formatted time and failure count; 2 tests verify |
| ADUI-03 | 263-01 | URL 추가/삭제 폼을 제공한다 | SATISFIED | Add input + button per network section; delete button for user URLs; 2 frontend tests verify |
| ADUI-04 | 263-02 | 개별 URL 연결 테스트 버튼이 동작한다 | SATISFIED | Per-URL Test button calling POST /admin/settings/test-rpc with chain param; result displayed inline; 3 frontend tests verify |
| ADUI-05 | 263-01 | 빌트인 기본 URL은 (built-in) 라벨로 구분하며 삭제 불가, 비활성화 가능하다 | SATISFIED | `(built-in)` badge on builtin URLs; delete replaced by On/Off toggle; 1 frontend test verifies |

All 5 requirements satisfied. No orphaned requirements.

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments found in phase-modified files. No stub implementations. All handlers make real API calls and process responses.

---

### Human Verification Required

#### 1. Visual Layout of URL Rows

**Test:** Navigate to Admin UI > Wallets > RPC Endpoints tab. Expand any network section (e.g., Solana Mainnet).
**Expected:** Each URL row shows: priority number (#1, #2...), URL text truncated with tooltip, (built-in) badge where applicable, green/orange/gray status dot, Test button, and reorder/delete/toggle controls — all in a readable horizontal layout.
**Why human:** CSS flex layout correctness and visual truncation cannot be verified programmatically.

#### 2. Real-time Status Polling Behavior

**Test:** With daemon running, open the RPC Endpoints tab. Observe a URL in cooldown state. Wait 15 seconds.
**Expected:** The cooldown remaining time updates automatically without page reload.
**Why human:** Requires live daemon with an RpcPool endpoint in cooldown state.

#### 3. EVM Default Network Selector Preservation

**Test:** Switch to RPC Endpoints tab. Scroll to EVM section.
**Expected:** "Default Network" dropdown appears above the per-network URL sections and is interactive.
**Why human:** UI layout within the EVM section grouping requires visual confirmation.

---

### Gaps Summary

No gaps found. All observable truths verified, all artifacts exist and are substantive, all key links are wired, and all 5 requirements are satisfied. 17/17 tests pass (4 backend + 13 frontend).

---

## Commits Verified

| Commit | Description |
|--------|-------------|
| `4bb7b091` | feat(263-01): add GET /admin/rpc-status endpoint and multi-URL RPC Endpoints tab |
| `4dd2e3b7` | test(263-01): add tests for RPC status endpoint and multi-URL tab UI |
| `68a9a49f` | fix(263-01): remove unused vi import in admin-rpc-status test |
| `942d300d` | feat(263-02): add live RPC pool status display and per-URL test buttons |
| `ca584026` | test(263-02): add tests for live status display and per-URL test buttons |

---

_Verified: 2026-02-25T11:15:00Z_
_Verifier: Claude (gsd-verifier)_
