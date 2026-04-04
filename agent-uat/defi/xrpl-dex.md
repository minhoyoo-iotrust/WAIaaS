---
id: "defi-17"
title: "XRPL DEX Swap (XRP -> USD IOU)"
category: "defi"
auth: "session"
network: ["xrpl-mainnet"]
requires_funds: true
estimated_cost_usd: "0.01"
risk_level: "medium"
tags: ["defi", "swap", "xrpl", "dex", "orderbook"]
---

# XRPL DEX Swap (XRP -> USD IOU)

## Metadata

| Field | Value |
|-------|-------|
| Provider | xrpl-dex |
| Action | swap |
| Chain | ripple |
| Network | xrpl-mainnet |

## Prerequisites

- XRPL wallet with XRP balance
- XRPL DEX provider enabled in Admin Settings

## Scenario

### Step 1: Check orderbook depth

```
Action: xrpl_dex / get_orderbook
Input: { "takerGets": { "currency": "XRP" }, "takerPays": { "currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" } }
Expected: Orderbook with bids and asks, funded amounts included
```

### Step 2: Execute swap

```
Action: xrpl_dex / swap
Input: { "takerGets": "1000000", "takerPays": { "currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", "value": "0.5" }, "slippageBps": 100 }
Expected: OfferCreate with tfImmediateOrCancel executed, transaction confirmed
```

### Step 3: Check active offers

```
Action: xrpl_dex / get_offers
Input: {}
Expected: Empty list (immediate swap should not leave residual offers)
```

## Success Criteria

- Orderbook query returns funded amounts
- Swap executes via OfferCreate with tfImmediateOrCancel
- USD spending limit policy applies to TakerGets amount
- No residual offers after immediate swap
