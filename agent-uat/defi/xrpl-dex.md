---
id: "defi-17"
title: "XRPL DEX Swap (XRP -> RLUSD)"
category: "defi"
auth: "session"
network: ["xrpl-mainnet"]
requires_funds: true
estimated_cost_usd: "0.50"
risk_level: "medium"
tags: ["defi", "swap", "xrpl", "dex", "orderbook", "rlusd"]
---

# XRPL DEX Swap (XRP -> RLUSD)

## Metadata

| Field | Value |
|-------|-------|
| Provider | xrpl-dex |
| Action | swap |
| Chain | ripple |
| Network | xrpl-mainnet |

## Prerequisites

- XRPL wallet with XRP balance (최소 12 XRP — 10 base reserve + 2 owner reserve for Trust Line)
- XRPL DEX provider enabled in Admin Settings
- RLUSD issuer: `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De` (Ripple 공식)

## Scenario Steps

### Step 1: Check RLUSD orderbook depth

```
Action: xrpl_dex / get_orderbook
Input: { "takerGets": { "currency": "XRP" }, "takerPays": { "currency": "524C555344000000000000000000000000000000", "issuer": "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De" } }
Expected: Orderbook with bids and asks, funded amounts included
Note: RLUSD uses 40-char hex currency code (non-standard currency)
```

### Step 2: Execute swap (XRP -> RLUSD)

```
Action: xrpl_dex / swap
Input: { "takerGets": "1000000", "takerPays": { "currency": "524C555344000000000000000000000000000000", "issuer": "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", "value": "0.5" }, "slippageBps": 100 }
Expected: OfferCreate with tfImmediateOrCancel executed, Trust Line auto-created if needed, transaction confirmed
```

### Step 3: Check active offers

```
Action: xrpl_dex / get_offers
Input: {}
Expected: Empty list (immediate swap should not leave residual offers)
```

### Step 4: Verify RLUSD balance

```
Action: get_balance
Input: { "network": "xrpl-mainnet" }
Expected: RLUSD balance reflects swapped amount
```

## Verification

- Orderbook query returns funded amounts for RLUSD pair
- Trust Line auto-created for RLUSD issuer before swap
- Swap executes via OfferCreate with tfImmediateOrCancel
- USD spending limit policy applies to TakerGets amount
- No residual offers after immediate swap
- RLUSD balance visible after swap
- Transaction appears in Admin UI transaction list with XRPL DEX label

## Estimated Cost

- Network fee: ~0.00001 XRP per transaction
- Trust Line creation: 2 XRP owner reserve (locked, not spent)
- Swap amount: configurable (test with ~1 XRP worth)
- Total estimated: < $0.50

## Troubleshooting

- **Trust Line required**: RLUSD Trust Line must exist before receiving — provider auto-creates if missing
- **Insufficient reserve**: Base reserve (10 XRP) + 2 XRP per Trust Line/offer
- **tecKILLED**: Swap failed due to insufficient liquidity at requested price
- **40-char hex currency**: RLUSD is `524C555344000000000000000000000000000000`, not 3-char `USD`
- **Provider disabled**: Check Admin Settings > Actions > xrpl_dex_enabled
