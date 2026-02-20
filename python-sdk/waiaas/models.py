"""Pydantic v2 models for WAIaaS API request/response data."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Wallet models
# ---------------------------------------------------------------------------


class WalletAddress(BaseModel):
    wallet_id: str = Field(alias="walletId")
    chain: str
    network: str
    address: str

    model_config = {"populate_by_name": True}


class WalletBalance(BaseModel):
    wallet_id: str = Field(alias="walletId")
    chain: str
    network: str
    address: str
    balance: str
    decimals: int
    symbol: str

    model_config = {"populate_by_name": True}


class AssetInfo(BaseModel):
    mint: str
    symbol: str
    name: str
    balance: str
    decimals: int
    is_native: bool = Field(alias="isNative")
    usd_value: Optional[float] = Field(default=None, alias="usdValue")

    model_config = {"populate_by_name": True}


class WalletAssets(BaseModel):
    wallet_id: str = Field(alias="walletId")
    chain: str
    network: str
    assets: list[AssetInfo]

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Wallet Info models
# ---------------------------------------------------------------------------


class WalletNetworkInfo(BaseModel):
    network: str
    is_default: bool = Field(alias="isDefault")

    model_config = {"populate_by_name": True}


class WalletInfo(BaseModel):
    wallet_id: str = Field(alias="walletId")
    chain: str
    network: str
    environment: str
    address: str
    networks: list[WalletNetworkInfo]

    model_config = {"populate_by_name": True}


class SetDefaultNetworkResponse(BaseModel):
    id: str
    default_network: str = Field(alias="defaultNetwork")
    previous_network: Optional[str] = Field(default=None, alias="previousNetwork")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Multi-network aggregate models (network=all)
# ---------------------------------------------------------------------------


class MultiNetworkBalance(BaseModel):
    """Single network entry in multi-network balance response."""

    network: str
    balance: Optional[str] = None
    decimals: Optional[int] = None
    symbol: Optional[str] = None
    error: Optional[str] = None


class MultiNetworkBalanceResponse(BaseModel):
    """Response from GET /v1/wallet/balance?network=all."""

    wallet_id: str = Field(alias="walletId")
    chain: str
    environment: str
    balances: list[MultiNetworkBalance]

    model_config = {"populate_by_name": True}


class MultiNetworkAssets(BaseModel):
    """Single network entry in multi-network assets response."""

    network: str
    assets: Optional[list[AssetInfo]] = None
    error: Optional[str] = None


class MultiNetworkAssetsResponse(BaseModel):
    """Response from GET /v1/wallet/assets?network=all."""

    wallet_id: str = Field(alias="walletId")
    chain: str
    environment: str
    network_assets: list[MultiNetworkAssets] = Field(alias="networkAssets")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Transaction models
# ---------------------------------------------------------------------------


class TokenInfo(BaseModel):
    """Token identification for TOKEN_TRANSFER/APPROVE transactions."""

    address: str
    decimals: int
    symbol: str


class SendTokenRequest(BaseModel):
    """Request body for POST /v1/transactions/send (5-type support)."""

    to: Optional[str] = None
    amount: Optional[str] = None
    memo: Optional[str] = None
    type: Optional[str] = None
    token: Optional[TokenInfo] = None
    # CONTRACT_CALL fields
    calldata: Optional[str] = None
    abi: Optional[list[dict[str, Any]]] = None
    value: Optional[str] = None
    program_id: Optional[str] = Field(default=None, alias="programId")
    instruction_data: Optional[str] = Field(default=None, alias="instructionData")
    accounts: Optional[list[dict[str, Any]]] = None
    # APPROVE fields
    spender: Optional[str] = None
    # BATCH fields
    instructions: Optional[list[dict[str, Any]]] = None
    # Network selection (multichain)
    network: Optional[str] = None

    model_config = {"populate_by_name": True}


class TransactionResponse(BaseModel):
    """Response from POST /v1/transactions/send (201)."""

    id: str
    status: str


class TransactionDetail(BaseModel):
    """Response from GET /v1/transactions/:id."""

    id: str
    wallet_id: str = Field(alias="walletId")
    type: str
    status: str
    tier: Optional[str] = None
    chain: str
    to_address: Optional[str] = Field(default=None, alias="toAddress")
    amount: Optional[str] = None
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    error: Optional[str] = None
    created_at: Optional[int] = Field(default=None, alias="createdAt")

    model_config = {"populate_by_name": True}


class TransactionList(BaseModel):
    """Response from GET /v1/transactions."""

    items: list[TransactionDetail]
    cursor: Optional[str] = None
    has_more: bool = Field(alias="hasMore")

    model_config = {"populate_by_name": True}


class PendingTransactionList(BaseModel):
    """Response from GET /v1/transactions/pending."""

    items: list[TransactionDetail]


# ---------------------------------------------------------------------------
# Session models
# ---------------------------------------------------------------------------


class SessionRenewResponse(BaseModel):
    """Response from PUT /v1/sessions/:id/renew."""

    id: str
    token: str
    expires_at: int = Field(alias="expiresAt")
    renewal_count: int = Field(alias="renewalCount")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Utils models
# ---------------------------------------------------------------------------


class EncodeCalldataRequest(BaseModel):
    abi: list[dict[str, Any]] = Field(description="ABI fragment array")
    function_name: str = Field(alias="functionName", description="Function name to encode")
    args: list[Any] = Field(default_factory=list, description="Function arguments")

    model_config = {"populate_by_name": True}


class EncodeCalldataResponse(BaseModel):
    calldata: str = Field(description="Hex-encoded calldata (0x-prefixed)")
    selector: str = Field(description="Function selector (first 4 bytes)")
    function_name: str = Field(alias="functionName", description="Encoded function name")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Sign Transaction models
# ---------------------------------------------------------------------------


class SignTransactionRequest(BaseModel):
    """Request body for POST /v1/transactions/sign."""

    transaction: str
    chain: Optional[str] = None
    network: Optional[str] = None

    model_config = {"populate_by_name": True}


class SignTransactionOperation(BaseModel):
    """Parsed operation from a signed transaction."""

    type: str
    to: Optional[str] = None
    amount: Optional[str] = None
    token: Optional[str] = None
    program_id: Optional[str] = Field(default=None, alias="programId")
    method: Optional[str] = None

    model_config = {"populate_by_name": True}


class PolicyResult(BaseModel):
    """Policy evaluation result."""

    tier: str


class SignTransactionResponse(BaseModel):
    """Response from POST /v1/transactions/sign."""

    id: str
    signed_transaction: str = Field(alias="signedTransaction")
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    operations: list[SignTransactionOperation]
    policy_result: PolicyResult = Field(alias="policyResult")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# x402 models
# ---------------------------------------------------------------------------


class X402FetchRequest(BaseModel):
    """Request body for POST /v1/x402/fetch."""

    url: str
    method: Optional[str] = None
    headers: Optional[dict[str, str]] = None
    body: Optional[str] = None

    model_config = {"populate_by_name": True}


class X402PaymentInfo(BaseModel):
    """Payment details from an x402 auto-payment."""

    amount: str
    asset: str
    network: str
    pay_to: str = Field(alias="payTo")
    tx_id: str = Field(alias="txId")

    model_config = {"populate_by_name": True}


class X402FetchResponse(BaseModel):
    """Response from POST /v1/x402/fetch."""

    status: int
    headers: dict[str, str]
    body: str
    payment: Optional[X402PaymentInfo] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# WalletConnect models
# ---------------------------------------------------------------------------


class WcPairingResponse(BaseModel):
    uri: str
    qr_code: str = Field(alias="qrCode")
    expires_at: int = Field(alias="expiresAt")

    model_config = {"populate_by_name": True}


class WcSessionInfo(BaseModel):
    wallet_id: str = Field(alias="walletId")
    topic: str
    peer_name: Optional[str] = Field(None, alias="peerName")
    peer_url: Optional[str] = Field(None, alias="peerUrl")
    chain_id: str = Field(alias="chainId")
    owner_address: str = Field(alias="ownerAddress")
    expiry: int
    created_at: int = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class WcDisconnectResponse(BaseModel):
    disconnected: bool


# ---------------------------------------------------------------------------
# Policy models (reference for REST API /v1/policies users)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Connect Info (Discovery) models
# ---------------------------------------------------------------------------


class ConnectInfoWallet(BaseModel):
    """Single wallet entry in connect-info response."""

    id: str
    name: str
    chain: str
    environment: str
    default_network: str = Field(alias="defaultNetwork")
    address: str
    is_default: bool = Field(alias="isDefault")

    model_config = {"populate_by_name": True}


class ConnectInfoSession(BaseModel):
    """Session info in connect-info response."""

    id: str
    expires_at: int = Field(alias="expiresAt")
    source: str

    model_config = {"populate_by_name": True}


class ConnectInfoDaemon(BaseModel):
    """Daemon info in connect-info response."""

    version: str
    base_url: str = Field(alias="baseUrl")

    model_config = {"populate_by_name": True}


class ConnectInfo(BaseModel):
    """Response from GET /v1/connect-info -- self-discovery for AI agents."""

    session: ConnectInfoSession
    wallets: list[ConnectInfoWallet]
    policies: dict[str, list[dict[str, Any]]]
    capabilities: list[str]
    daemon: ConnectInfoDaemon
    prompt: str

    model_config = {"populate_by_name": True}


class SpendingLimitRules(BaseModel):
    """SPENDING_LIMIT policy rules schema.

    Per-transaction tiers use native amount digit strings.
    USD tiers and cumulative limits are optional.
    When cumulative USD spending exceeds the limit, the transaction
    tier is escalated to APPROVAL.
    """

    instant_max: str = Field(description="INSTANT tier max (lamports/wei digit string)")
    notify_max: str = Field(description="NOTIFY tier max (digit string)")
    delay_max: str = Field(description="DELAY tier max (digit string)")
    delay_seconds: Optional[int] = Field(default=None, description="Delay cooldown seconds (min 60)")
    instant_max_usd: Optional[float] = Field(default=None, description="INSTANT tier max USD")
    notify_max_usd: Optional[float] = Field(default=None, description="NOTIFY tier max USD")
    delay_max_usd: Optional[float] = Field(default=None, description="DELAY tier max USD")
    daily_limit_usd: Optional[float] = Field(
        default=None, description="24h rolling window cumulative USD limit"
    )
    monthly_limit_usd: Optional[float] = Field(
        default=None, description="30d rolling window cumulative USD limit"
    )
