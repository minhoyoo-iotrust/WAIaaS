"""WAIaaS Python SDK -- AI Agent Wallet-as-a-Service client."""

from waiaas.client import WAIaaSClient
from waiaas.errors import WAIaaSError
from waiaas.models import (
    WalletAddress,
    WalletBalance,
    WalletAssets,
    WalletInfo,
    WalletNetworkInfo,
    AssetInfo,
    SetDefaultNetworkResponse,
    TransactionResponse,
    TransactionDetail,
    TransactionList,
    PendingTransactionList,
    SessionRenewResponse,
    SendTokenRequest,
    SignTransactionRequest,
    SignTransactionResponse,
)

__version__ = "0.1.0"

__all__ = [
    "WAIaaSClient",
    "WAIaaSError",
    "WalletAddress",
    "WalletBalance",
    "WalletAssets",
    "WalletInfo",
    "WalletNetworkInfo",
    "AssetInfo",
    "SetDefaultNetworkResponse",
    "TransactionResponse",
    "TransactionDetail",
    "TransactionList",
    "PendingTransactionList",
    "SessionRenewResponse",
    "SendTokenRequest",
    "SignTransactionRequest",
    "SignTransactionResponse",
]
