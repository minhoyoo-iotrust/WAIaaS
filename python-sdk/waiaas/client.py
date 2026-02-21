"""WAIaaS async HTTP client for AI wallet operations."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from waiaas.errors import WAIaaSError
from waiaas.models import (
    ConnectInfo,
    EncodeCalldataRequest,
    EncodeCalldataResponse,
    MultiNetworkAssetsResponse,
    MultiNetworkBalanceResponse,
    PendingTransactionList,
    SendTokenRequest,
    SessionRenewResponse,
    SetDefaultNetworkResponse,
    SignTransactionRequest,
    SignTransactionResponse,
    TokenInfo,
    TransactionDetail,
    TransactionList,
    TransactionResponse,
    WalletAddress,
    WalletAssets,
    WalletBalance,
    WalletInfo,
    WalletNetworkInfo,
    WcDisconnectResponse,
    WcPairingResponse,
    WcSessionInfo,
    X402FetchRequest,
    X402FetchResponse,
)
from waiaas.retry import RetryPolicy, with_retry


class WAIaaSClient:
    """Async client for WAIaaS daemon REST API.

    Usage:
        async with WAIaaSClient("http://localhost:3100", "wai_sess_xxx") as client:
            balance = await client.get_balance()
            print(balance.balance, balance.symbol)
    """

    def __init__(
        self,
        base_url: str,
        session_token: str,
        *,
        retry_policy: Optional[RetryPolicy] = None,
        timeout: float = 30.0,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._session_token = session_token
        self._retry_policy = retry_policy or RetryPolicy()
        self._timeout = timeout
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            headers=self._build_headers(),
        )

    def _build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._session_token}",
            "Content-Type": "application/json",
        }

    @property
    def session_token(self) -> str:
        return self._session_token

    def set_session_token(self, token: str) -> None:
        """Update the session token for subsequent requests."""
        self._session_token = token
        self._client.headers["Authorization"] = f"Bearer {token}"

    async def __aenter__(self) -> "WAIaaSClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._owns_client:
            await self._client.aclose()

    # -----------------------------------------------------------------
    # Internal HTTP helpers
    # -----------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> httpx.Response:
        """Make an HTTP request with retry logic."""

        async def _do_request() -> httpx.Response:
            response = await self._client.request(
                method,
                path,
                json=json_body,
                params=params,
            )
            if response.status_code >= 400:
                try:
                    body = response.json()
                except Exception:
                    body = {"code": "UNKNOWN_ERROR", "message": response.text}
                raise WAIaaSError.from_response(response.status_code, body)
            return response

        return await with_retry(_do_request, self._retry_policy)

    # -----------------------------------------------------------------
    # Wallet API
    # -----------------------------------------------------------------

    async def get_address(self) -> WalletAddress:
        """GET /v1/wallet/address -- Get wallet address."""
        resp = await self._request("GET", "/v1/wallet/address")
        return WalletAddress.model_validate(resp.json())

    async def get_balance(self, *, network: Optional[str] = None) -> WalletBalance:
        """GET /v1/wallet/balance -- Get wallet balance.

        Args:
            network: Query balance for a specific network (e.g., 'polygon-mainnet').
        """
        params: dict[str, Any] = {}
        if network is not None:
            params["network"] = network
        resp = await self._request("GET", "/v1/wallet/balance", params=params or None)
        return WalletBalance.model_validate(resp.json())

    async def get_assets(self, *, network: Optional[str] = None) -> WalletAssets:
        """GET /v1/wallet/assets -- Get all assets held by wallet.

        Args:
            network: Query assets for a specific network (e.g., 'polygon-mainnet').
        """
        params: dict[str, Any] = {}
        if network is not None:
            params["network"] = network
        resp = await self._request("GET", "/v1/wallet/assets", params=params or None)
        return WalletAssets.model_validate(resp.json())

    async def get_all_balances(self) -> MultiNetworkBalanceResponse:
        """GET /v1/wallet/balance?network=all -- Get balances for all networks.

        Returns native balances for every network in the wallet's environment.
        Networks that fail (e.g., RPC timeout) are included with an error field.
        """
        resp = await self._request("GET", "/v1/wallet/balance", params={"network": "all"})
        return MultiNetworkBalanceResponse.model_validate(resp.json())

    async def get_all_assets(self) -> MultiNetworkAssetsResponse:
        """GET /v1/wallet/assets?network=all -- Get assets for all networks.

        Returns token assets for every network in the wallet's environment.
        Networks that fail are included with an error field.
        """
        resp = await self._request("GET", "/v1/wallet/assets", params={"network": "all"})
        return MultiNetworkAssetsResponse.model_validate(resp.json())

    # -----------------------------------------------------------------
    # Wallet Management API
    # -----------------------------------------------------------------

    async def get_wallet_info(self) -> WalletInfo:
        """GET /v1/wallet/address + GET /v1/wallets/:id/networks combined.

        Returns combined wallet info including address, chain, environment,
        and available networks.
        """
        addr_resp = await self._request("GET", "/v1/wallet/address")
        addr = WalletAddress.model_validate(addr_resp.json())
        net_resp = await self._request(
            "GET", f"/v1/wallets/{addr.wallet_id}/networks"
        )
        net_data = net_resp.json()
        return WalletInfo(
            walletId=addr.wallet_id,
            chain=addr.chain,
            network=addr.network,
            environment=net_data.get("environment", ""),
            address=addr.address,
            networks=net_data.get("availableNetworks", []),
        )

    async def set_default_network(self, network: str) -> SetDefaultNetworkResponse:
        """PUT /v1/wallet/default-network -- Change default network.

        Args:
            network: New default network (e.g., 'polygon-amoy', 'ethereum-sepolia').

        Returns:
            SetDefaultNetworkResponse with id, defaultNetwork, previousNetwork.
        """
        resp = await self._request(
            "PUT", "/v1/wallet/default-network", json_body={"network": network}
        )
        return SetDefaultNetworkResponse.model_validate(resp.json())

    # -----------------------------------------------------------------
    # Transaction API
    # -----------------------------------------------------------------

    async def send_token(
        self,
        to: Optional[str] = None,
        amount: Optional[str] = None,
        *,
        memo: Optional[str] = None,
        type: Optional[str] = None,
        token: Optional[dict[str, Any]] = None,
        network: Optional[str] = None,
        **kwargs: Any,
    ) -> TransactionResponse:
        """POST /v1/transactions/send -- Send transaction (5-type support).

        For legacy TRANSFER: send_token(to="addr", amount="1000")
        For TOKEN_TRANSFER: send_token(to="addr", amount="1000", type="TOKEN_TRANSFER", token={...})
        For CONTRACT_CALL: send_token(type="CONTRACT_CALL", to="0xcontract", calldata="0x...")
        For APPROVE: send_token(type="APPROVE", spender="0x...", token={...}, amount="1000")
        For BATCH: send_token(type="BATCH", instructions=[...])

        Args:
            to: Recipient/contract address.
            amount: Amount in base units (lamports/wei).
            memo: Optional memo string.
            type: Transaction type (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH).
            token: Token info dict with address, decimals, symbol (for TOKEN_TRANSFER/APPROVE).
            network: Target network (e.g., 'polygon-mainnet') for multichain transactions.
            **kwargs: Additional fields (calldata, spender, instructions, etc.).

        Returns:
            TransactionResponse with id and status.
        """
        token_obj = TokenInfo(**token) if isinstance(token, dict) else token
        request = SendTokenRequest(
            to=to, amount=amount, memo=memo, type=type,
            token=token_obj, network=network, **kwargs,
        )
        body = request.model_dump(exclude_none=True, by_alias=True)
        resp = await self._request("POST", "/v1/transactions/send", json_body=body)
        return TransactionResponse.model_validate(resp.json())

    async def get_transaction(self, tx_id: str) -> TransactionDetail:
        """GET /v1/transactions/:id -- Get transaction details."""
        resp = await self._request("GET", f"/v1/transactions/{tx_id}")
        return TransactionDetail.model_validate(resp.json())

    async def list_transactions(
        self,
        *,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> TransactionList:
        """GET /v1/transactions -- List transactions with cursor pagination.

        Args:
            limit: Number of transactions per page (1-100, default 20).
            cursor: Cursor for pagination (UUID of last item).

        Returns:
            TransactionList with items, cursor, and has_more.
        """
        params: dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        resp = await self._request("GET", "/v1/transactions", params=params)
        return TransactionList.model_validate(resp.json())

    async def list_pending_transactions(self) -> PendingTransactionList:
        """GET /v1/transactions/pending -- List pending transactions."""
        resp = await self._request("GET", "/v1/transactions/pending")
        return PendingTransactionList.model_validate(resp.json())

    # -----------------------------------------------------------------
    # Session API
    # -----------------------------------------------------------------

    async def renew_session(self, session_id: str) -> SessionRenewResponse:
        """PUT /v1/sessions/:id/renew -- Renew session token.

        After renewal, the client automatically updates its session token.

        Args:
            session_id: Session ID to renew.

        Returns:
            SessionRenewResponse with new token, expiry, and renewal count.
        """
        resp = await self._request("PUT", f"/v1/sessions/{session_id}/renew")
        result = SessionRenewResponse.model_validate(resp.json())
        # Auto-update session token
        self.set_session_token(result.token)
        return result

    # -----------------------------------------------------------------
    # Discovery API
    # -----------------------------------------------------------------

    async def get_connect_info(self) -> ConnectInfo:
        """GET /v1/connect-info -- Get self-discovery info for this session.

        Returns wallets, policies, capabilities, and AI-ready prompt.
        Requires only session token (no master password).
        """
        resp = await self._request("GET", "/v1/connect-info")
        return ConnectInfo.model_validate(resp.json())

    # -----------------------------------------------------------------
    # Utils API
    # -----------------------------------------------------------------

    async def encode_calldata(
        self,
        abi: list[dict[str, Any]],
        function_name: str,
        args: Optional[list[Any]] = None,
    ) -> EncodeCalldataResponse:
        """POST /v1/utils/encode-calldata -- Encode EVM function call into calldata hex.

        Args:
            abi: ABI fragment array (JSON objects).
            function_name: Function name to encode (e.g., "transfer").
            args: Function arguments (defaults to empty list for zero-arg functions).

        Returns:
            EncodeCalldataResponse with calldata hex, selector, and functionName.
        """
        request = EncodeCalldataRequest(
            abi=abi, function_name=function_name, args=args or []
        )
        body = request.model_dump(exclude_none=True, by_alias=True)
        resp = await self._request("POST", "/v1/utils/encode-calldata", json_body=body)
        return EncodeCalldataResponse.model_validate(resp.json())

    async def sign_transaction(
        self,
        transaction: str,
        *,
        chain: Optional[str] = None,
        network: Optional[str] = None,
    ) -> SignTransactionResponse:
        """POST /v1/transactions/sign -- Sign an unsigned transaction without broadcasting.

        Args:
            transaction: Raw unsigned transaction (base64 for Solana, hex for EVM).
            chain: Chain hint (optional, usually auto-detected from wallet).
            network: Target network (e.g., 'polygon-mainnet').

        Returns:
            SignTransactionResponse with signed transaction, operations, and policy result.
        """
        request = SignTransactionRequest(
            transaction=transaction, chain=chain, network=network
        )
        body = request.model_dump(exclude_none=True, by_alias=True)
        resp = await self._request("POST", "/v1/transactions/sign", json_body=body)
        return SignTransactionResponse.model_validate(resp.json())

    # -----------------------------------------------------------------
    # x402 API
    # -----------------------------------------------------------------

    async def x402_fetch(
        self,
        url: str,
        *,
        method: Optional[str] = None,
        headers: Optional[dict[str, str]] = None,
        body: Optional[str] = None,
    ) -> X402FetchResponse:
        """POST /v1/x402/fetch -- Fetch URL with x402 auto-payment.

        If the target server responds with HTTP 402, the daemon automatically
        signs a cryptocurrency payment and retries. Policy evaluation
        (X402_ALLOWED_DOMAINS, SPENDING_LIMIT) is applied before payment.

        Args:
            url: Target URL to fetch (HTTPS required).
            method: HTTP method (GET, POST, PUT, DELETE, PATCH). Defaults to GET.
            headers: Additional HTTP headers to include.
            body: Request body string.

        Returns:
            X402FetchResponse with status, headers, body, and optional payment info.
        """
        request = X402FetchRequest(url=url, method=method, headers=headers, body=body)
        body_dict = request.model_dump(exclude_none=True, by_alias=True)
        resp = await self._request("POST", "/v1/x402/fetch", json_body=body_dict)
        return X402FetchResponse.model_validate(resp.json())

    # -----------------------------------------------------------------
    # WalletConnect API
    # -----------------------------------------------------------------

    async def wc_connect(self) -> WcPairingResponse:
        """POST /v1/wallet/wc/pair -- Start WalletConnect pairing.

        Returns a WC URI and QR code that the wallet owner can use
        to connect their external wallet (MetaMask, Phantom, etc).

        Returns:
            WcPairingResponse with uri, qr_code, and expires_at.
        """
        resp = await self._request("POST", "/v1/wallet/wc/pair")
        return WcPairingResponse.model_validate(resp.json())

    async def wc_status(self) -> WcSessionInfo:
        """GET /v1/wallet/wc/session -- Get WalletConnect session status.

        Returns session info (peer wallet, chain, expiry) or raises
        an error if no active session exists.

        Returns:
            WcSessionInfo with wallet_id, topic, peer info, chain_id, expiry.
        """
        resp = await self._request("GET", "/v1/wallet/wc/session")
        return WcSessionInfo.model_validate(resp.json())

    async def wc_disconnect(self) -> WcDisconnectResponse:
        """DELETE /v1/wallet/wc/session -- Disconnect WalletConnect session.

        After disconnecting, a new pairing must be initiated to reconnect.

        Returns:
            WcDisconnectResponse with disconnected=True on success.
        """
        resp = await self._request("DELETE", "/v1/wallet/wc/session")
        return WcDisconnectResponse.model_validate(resp.json())
