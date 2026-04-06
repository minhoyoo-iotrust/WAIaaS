---
status: passed
phase: 268
name: position-infra-design
verified_at: 2026-02-26
---

# Phase 268 Verification: 포지션 인프라 설계

## Phase Goal
모든 DeFi 프로토콜이 공유하는 positions 통합 테이블과 PositionTracker 동기화 서비스가 설계되어, 후속 프레임워크가 인프라 수정 없이 포지션을 저장하고 조회할 수 있다.

## Requirement Verification

### POS-01: positions 통합 테이블 스키마 discriminatedUnion
- **Status:** PASSED
- **Evidence:** Section 5.1 defines `defi_positions` DDL with `category TEXT NOT NULL CHECK(category IN ('LENDING', 'YIELD', 'PERP', 'STAKING'))`. Section 5.3 defines `PositionSchema = z.discriminatedUnion('category', [...])` with 4 category extensions (LendingPositionSchema, YieldPositionSchema, PerpPositionSchema, StakingPositionSchema).
- **Location:** m29-00-defi-advanced-protocol-design.md sections 5.1, 5.3

### POS-02: PositionTracker 카테고리별 차등 폴링
- **Status:** PASSED
- **Evidence:** Section 6.2 defines differential polling intervals: PERP 60,000ms (1min), LENDING 300,000ms (5min), STAKING 900,000ms (15min), YIELD 3,600,000ms (1hr). Overlap prevention via per-category `running` flag documented.
- **Location:** m29-00-defi-advanced-protocol-design.md section 6.2

### POS-03: GET /v1/wallets/:id/positions 통합 응답 Zod 스키마
- **Status:** PASSED
- **Evidence:** Section 7.2 defines `PositionsResponseSchema` with `z.discriminatedUnion('category', [LendingPositionResponseSchema, YieldPositionResponseSchema, PerpPositionResponseSchema, StakingPositionResponseSchema2])` and `totalValueUsd: z.number().nullable()`. Query parameters (category, provider, status) defined in `PositionQuerySchema`.
- **Location:** m29-00-defi-advanced-protocol-design.md sections 7.1, 7.2

### POS-04: Admin 포트폴리오 뷰 와이어프레임
- **Status:** PASSED
- **Evidence:** Section 8.1 defines portfolio layout with 4 StatCards (Total USD, Lending TVL, Yield TVL, Perp PnL) and category tab filters. Section 8.2 provides ASCII wireframes for all 4 category cards showing position amount, USD value, APY, health factor (Lending), maturity (Yield), leverage/PnL (Perp). Section 8.3 defines health factor 4-level color coding (green/yellow/orange/red).
- **Location:** m29-00-defi-advanced-protocol-design.md sections 8.1, 8.2, 8.3

### POS-05: DB v25 마이그레이션 SQL
- **Status:** PASSED
- **Evidence:** Section 5.4 defines `MIGRATIONS.push({ version: 25, ... })` with CREATE TABLE IF NOT EXISTS only (no CREATE INDEX -- deferred to pushSchema). INSERT INTO schema_version included. Note about LATEST_SCHEMA_VERSION 24 -> 25 increment.
- **Location:** m29-00-defi-advanced-protocol-design.md section 5.4

### POS-06: 배치 쓰기 전략
- **Status:** PASSED
- **Evidence:** Section 6.3 defines PositionWriteQueue with Map<string, PositionUpsert> dedup (key: `walletId:provider:assetId:category`), MAX_BATCH = 100, and `ON CONFLICT(wallet_id, provider, asset_id, category) DO UPDATE SET ...` upsert. Flush triggered immediately after syncCategory() completion.
- **Location:** m29-00-defi-advanced-protocol-design.md section 6.3

## Success Criteria Verification

| # | Criterion | Status |
|---|-----------|--------|
| 1 | positions 테이블 스키마가 4개 카테고리를 discriminatedUnion으로 수용 + DB v25 | PASSED |
| 2 | PositionTracker 차등 폴링 + 배치 쓰기 전략 | PASSED |
| 3 | GET /v1/wallets/:id/positions 통합 Zod 스키마 | PASSED |
| 4 | Admin 포트폴리오 와이어프레임 (포지션/USD/APY/헬스팩터) | PASSED |

## Design Decisions Recorded

13 total design decisions across 4 sections:
- Section 5.5: 4 decisions (table name, JSON metadata, UNIQUE key, metadata validation)
- Section 6.5: 3 decisions (IPositionProvider independence, standalone service, flush timing)
- Section 7.5: 3 decisions (totalValueUsd server-side, URL query params, status default ACTIVE)
- Section 8.5: 3 decisions (tab placement, manual refresh, card layout)

## Verdict

**PASSED** -- All 6 requirements verified. All 4 success criteria met. Phase goal achieved: the position infrastructure design is complete and sufficient for subsequent frameworks to build upon without infrastructure modifications.
