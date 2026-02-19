# waiaas

Python SDK for WAIaaS (Wallet-as-a-Service for AI Agents).

## Installation

```bash
pip install waiaas
```

## Quick Start

```python
from waiaas import WAIaaSClient

async with WAIaaSClient("http://localhost:3100", "wai_sess_xxx") as client:
    balance = await client.get_balance()
    print(balance.balance, balance.symbol)
```
