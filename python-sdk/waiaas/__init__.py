"""WAIaaS Python SDK -- AI Agent Wallet-as-a-Service client."""

from waiaas.client import WAIaaSClient
from waiaas.errors import WAIaaSError
from waiaas.models import (
    WalletAddress,
    WalletBalance,
    WalletAssets,
    AssetInfo,
    TransactionResponse,
    TransactionDetail,
    TransactionList,
    PendingTransactionList,
    SessionRenewResponse,
    SendTokenRequest,
)

__version__ = "0.1.0"

__all__ = [
    "WAIaaSClient",
    "WAIaaSError",
    "WalletAddress",
    "WalletBalance",
    "WalletAssets",
    "AssetInfo",
    "TransactionResponse",
    "TransactionDetail",
    "TransactionList",
    "PendingTransactionList",
    "SessionRenewResponse",
    "SendTokenRequest",
]
