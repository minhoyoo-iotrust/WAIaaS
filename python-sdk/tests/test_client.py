"""WAIaaSClient integration tests using httpx MockTransport."""

import json

import httpx
import pytest
from unittest.mock import AsyncMock, patch

from waiaas.client import WAIaaSClient
from waiaas.errors import WAIaaSError
from waiaas.models import (
    PendingTransactionList,
    SessionRenewResponse,
    SetDefaultNetworkResponse,
    TransactionDetail,
    TransactionList,
    TransactionResponse,
    WalletAddress,
    WalletAssets,
    WalletBalance,
    WalletInfo,
)
from waiaas.retry import RetryPolicy

from tests.conftest import WALLET_ID, SESSION_ID, TX_ID


def make_handler(responses: dict[tuple[str, str], tuple[int, dict]]):
    """Create a mock handler from a route -> response mapping."""

    def handler(request: httpx.Request) -> httpx.Response:
        key = (request.method, request.url.raw_path.decode())
        if key in responses:
            status, body = responses[key]
            return httpx.Response(status, json=body)
        # Also try without query string
        path_only = request.url.raw_path.decode().split("?")[0]
        key_no_qs = (request.method, path_only)
        if key_no_qs in responses:
            status, body = responses[key_no_qs]
            return httpx.Response(status, json=body)
        return httpx.Response(
            404, json={"code": "NOT_FOUND", "message": "Not found"}
        )

    return handler


def make_client(handler, **kwargs) -> WAIaaSClient:
    """Create a WAIaaSClient with MockTransport."""
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="http://test")
    return WAIaaSClient(
        "http://test",
        "wai_sess_test_token",
        http_client=http_client,
        retry_policy=RetryPolicy(max_retries=0),  # disable retry by default
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Wallet methods
# ---------------------------------------------------------------------------


class TestGetBalance:
    async def test_returns_wallet_balance(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/balance"): (
                    200,
                    {
                        "walletId": WALLET_ID,
                        "chain": "solana",
                        "network": "devnet",
                        "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                        "balance": "1000000000",
                        "decimals": 9,
                        "symbol": "SOL",
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.get_balance()
        assert isinstance(result, WalletBalance)
        assert result.wallet_id == WALLET_ID
        assert result.balance == "1000000000"
        assert result.symbol == "SOL"
        assert result.decimals == 9


class TestGetAddress:
    async def test_returns_wallet_address(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/address"): (
                    200,
                    {
                        "walletId": WALLET_ID,
                        "chain": "solana",
                        "network": "devnet",
                        "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.get_address()
        assert isinstance(result, WalletAddress)
        assert result.wallet_id == WALLET_ID
        assert result.address == "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"


class TestGetAssets:
    async def test_returns_wallet_assets(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/assets"): (
                    200,
                    {
                        "walletId": WALLET_ID,
                        "chain": "solana",
                        "network": "devnet",
                        "assets": [
                            {
                                "mint": "So11111111111111111111111111111111111111112",
                                "symbol": "SOL",
                                "name": "Solana",
                                "balance": "1000000000",
                                "decimals": 9,
                                "isNative": True,
                                "usdValue": 150.25,
                            },
                            {
                                "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                                "symbol": "USDC",
                                "name": "USD Coin",
                                "balance": "5000000",
                                "decimals": 6,
                                "isNative": False,
                            },
                        ],
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.get_assets()
        assert isinstance(result, WalletAssets)
        assert len(result.assets) == 2
        assert result.assets[0].symbol == "SOL"
        assert result.assets[0].usd_value == 150.25
        assert result.assets[1].usd_value is None

    async def test_empty_assets_list(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/assets"): (
                    200,
                    {
                        "walletId": WALLET_ID,
                        "chain": "solana",
                        "network": "devnet",
                        "assets": [],
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.get_assets()
        assert isinstance(result, WalletAssets)
        assert len(result.assets) == 0


# ---------------------------------------------------------------------------
# Wallet management methods
# ---------------------------------------------------------------------------


class TestGetWalletInfo:
    async def test_returns_combined_wallet_info(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/address"): (
                    200,
                    {
                        "walletId": WALLET_ID,
                        "chain": "ethereum",
                        "network": "ethereum-sepolia",
                        "environment": "testnet",
                        "address": "0xabc123",
                    },
                ),
                ("GET", f"/v1/wallets/{WALLET_ID}/networks"): (
                    200,
                    {
                        "id": WALLET_ID,
                        "chain": "ethereum",
                        "environment": "testnet",
                        "defaultNetwork": "ethereum-sepolia",
                        "availableNetworks": [
                            {"network": "ethereum-sepolia", "isDefault": True},
                            {"network": "polygon-amoy", "isDefault": False},
                        ],
                    },
                ),
            }
        )
        client = make_client(handler)
        result = await client.get_wallet_info()
        assert isinstance(result, WalletInfo)
        assert result.wallet_id == WALLET_ID
        assert result.chain == "ethereum"
        assert result.environment == "testnet"
        assert result.address == "0xabc123"
        assert len(result.networks) == 2
        assert result.networks[0].is_default is True
        assert result.networks[0].network == "ethereum-sepolia"
        assert result.networks[1].is_default is False


class TestSetDefaultNetwork:
    async def test_calls_put_and_returns_response(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if (
                request.method == "PUT"
                and "/v1/wallet/default-network" in str(request.url)
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    200,
                    json={
                        "id": WALLET_ID,
                        "defaultNetwork": "polygon-amoy",
                        "previousNetwork": "ethereum-sepolia",
                    },
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.set_default_network("polygon-amoy")
        assert isinstance(result, SetDefaultNetworkResponse)
        assert result.id == WALLET_ID
        assert result.default_network == "polygon-amoy"
        assert result.previous_network == "ethereum-sepolia"
        assert captured_body["network"] == "polygon-amoy"

    async def test_error_on_environment_mismatch(self):
        handler = make_handler(
            {
                ("PUT", "/v1/wallet/default-network"): (
                    400,
                    {
                        "code": "ENVIRONMENT_NETWORK_MISMATCH",
                        "message": "Network not allowed",
                    },
                ),
            }
        )
        client = make_client(handler)
        with pytest.raises(WAIaaSError) as exc_info:
            await client.set_default_network("mainnet")
        assert exc_info.value.code == "ENVIRONMENT_NETWORK_MISMATCH"


# ---------------------------------------------------------------------------
# Network parameter tests (multichain)
# ---------------------------------------------------------------------------


class TestGetBalanceWithNetwork:
    async def test_passes_network_query_parameter(self):
        captured_url = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_url["url"] = str(request.url)
            return httpx.Response(
                200,
                json={
                    "walletId": WALLET_ID,
                    "chain": "evm",
                    "network": "polygon-mainnet",
                    "address": "0xabc",
                    "balance": "1000000000000000000",
                    "decimals": 18,
                    "symbol": "MATIC",
                },
            )

        client = make_client(handler)
        result = await client.get_balance(network="polygon-mainnet")
        assert isinstance(result, WalletBalance)
        assert "network=polygon-mainnet" in captured_url["url"]

    async def test_no_network_backward_compat(self):
        captured_url = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_url["url"] = str(request.url)
            return httpx.Response(
                200,
                json={
                    "walletId": WALLET_ID,
                    "chain": "solana",
                    "network": "devnet",
                    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                    "balance": "1000000000",
                    "decimals": 9,
                    "symbol": "SOL",
                },
            )

        client = make_client(handler)
        result = await client.get_balance()
        assert isinstance(result, WalletBalance)
        assert "network=" not in captured_url["url"]


class TestGetAssetsWithNetwork:
    async def test_passes_network_query_parameter(self):
        captured_url = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_url["url"] = str(request.url)
            return httpx.Response(
                200,
                json={
                    "walletId": WALLET_ID,
                    "chain": "evm",
                    "network": "ethereum-sepolia",
                    "assets": [],
                },
            )

        client = make_client(handler)
        result = await client.get_assets(network="ethereum-sepolia")
        assert isinstance(result, WalletAssets)
        assert "network=ethereum-sepolia" in captured_url["url"]


class TestSendTokenWithNetwork:
    async def test_includes_network_in_body(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/v1/transactions/send" in str(
                request.url
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    201,
                    json={"id": TX_ID, "status": "PENDING"},
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.send_token(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "1000000",
            network="polygon-mainnet",
        )
        assert isinstance(result, TransactionResponse)
        assert captured_body["network"] == "polygon-mainnet"

    async def test_no_network_backward_compat(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/v1/transactions/send" in str(
                request.url
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    201,
                    json={"id": TX_ID, "status": "PENDING"},
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        await client.send_token(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "1000000"
        )
        assert "network" not in captured_body


# ---------------------------------------------------------------------------
# Transaction methods
# ---------------------------------------------------------------------------


class TestSendToken:
    async def test_sends_post_and_returns_response(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/v1/transactions/send" in str(
                request.url
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    201,
                    json={"id": TX_ID, "status": "PENDING"},
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.send_token(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "1000000"
        )
        assert isinstance(result, TransactionResponse)
        assert result.id == TX_ID
        assert result.status == "PENDING"
        assert captured_body["to"] == "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
        assert captured_body["amount"] == "1000000"
        assert "memo" not in captured_body

    async def test_send_with_memo(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/v1/transactions/send" in str(
                request.url
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    201,
                    json={"id": TX_ID, "status": "PENDING"},
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.send_token(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "1000000",
            memo="test payment",
        )
        assert result.id == TX_ID
        assert captured_body["memo"] == "test payment"


class TestSendTokenWithType:
    async def test_send_token_with_type_token_transfer(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/v1/transactions/send" in str(
                request.url
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    201,
                    json={"id": TX_ID, "status": "PENDING"},
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.send_token(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "500000",
            type="TOKEN_TRANSFER",
            token={"address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "decimals": 6, "symbol": "USDC"},
        )
        assert isinstance(result, TransactionResponse)
        assert result.id == TX_ID
        assert captured_body["to"] == "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
        assert captured_body["amount"] == "500000"
        assert captured_body["type"] == "TOKEN_TRANSFER"
        assert captured_body["token"]["address"] == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        assert captured_body["token"]["decimals"] == 6
        assert captured_body["token"]["symbol"] == "USDC"

    async def test_send_token_without_type_legacy_body(self):
        captured_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/v1/transactions/send" in str(
                request.url
            ):
                captured_body.update(json.loads(request.content))
                return httpx.Response(
                    201,
                    json={"id": TX_ID, "status": "PENDING"},
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.send_token(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "1000000"
        )
        assert isinstance(result, TransactionResponse)
        assert captured_body["to"] == "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
        assert captured_body["amount"] == "1000000"
        assert "type" not in captured_body
        assert "token" not in captured_body


class TestGetTransaction:
    async def test_returns_transaction_detail(self):
        handler = make_handler(
            {
                ("GET", f"/v1/transactions/{TX_ID}"): (
                    200,
                    {
                        "id": TX_ID,
                        "walletId": WALLET_ID,
                        "type": "TRANSFER",
                        "status": "CONFIRMED",
                        "tier": "INSTANT",
                        "chain": "solana",
                        "toAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
                        "amount": "1000000",
                        "txHash": "5KtP8abc",
                        "error": None,
                        "createdAt": 1707000000,
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.get_transaction(TX_ID)
        assert isinstance(result, TransactionDetail)
        assert result.id == TX_ID
        assert result.status == "CONFIRMED"
        assert result.tx_hash == "5KtP8abc"


class TestListTransactions:
    async def test_with_limit_and_cursor(self):
        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.raw_path.decode().split("?")[0]
            if request.method == "GET" and path == "/v1/transactions":
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {
                                "id": TX_ID,
                                "walletId": WALLET_ID,
                                "type": "TRANSFER",
                                "status": "CONFIRMED",
                                "chain": "solana",
                            }
                        ],
                        "cursor": TX_ID,
                        "hasMore": True,
                    },
                )
            return httpx.Response(
                404, json={"code": "NOT_FOUND", "message": "Not found"}
            )

        client = make_client(handler)
        result = await client.list_transactions(limit=10, cursor="some-cursor")
        assert isinstance(result, TransactionList)
        assert len(result.items) == 1
        assert result.has_more is True
        assert result.cursor == TX_ID


class TestListPendingTransactions:
    async def test_returns_pending_list(self):
        handler = make_handler(
            {
                ("GET", "/v1/transactions/pending"): (
                    200,
                    {
                        "items": [
                            {
                                "id": TX_ID,
                                "walletId": WALLET_ID,
                                "type": "TRANSFER",
                                "status": "PENDING",
                                "chain": "solana",
                            }
                        ]
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.list_pending_transactions()
        assert isinstance(result, PendingTransactionList)
        assert len(result.items) == 1
        assert result.items[0].status == "PENDING"


# ---------------------------------------------------------------------------
# Session methods
# ---------------------------------------------------------------------------


class TestRenewSession:
    async def test_returns_renew_response(self):
        handler = make_handler(
            {
                ("PUT", f"/v1/sessions/{SESSION_ID}/renew"): (
                    200,
                    {
                        "id": SESSION_ID,
                        "token": "wai_sess_new_token_abc",
                        "expiresAt": 1707003600,
                        "renewalCount": 2,
                    },
                )
            }
        )
        client = make_client(handler)
        result = await client.renew_session(SESSION_ID)
        assert isinstance(result, SessionRenewResponse)
        assert result.id == SESSION_ID
        assert result.token == "wai_sess_new_token_abc"
        assert result.renewal_count == 2

    async def test_auto_updates_session_token(self):
        handler = make_handler(
            {
                ("PUT", f"/v1/sessions/{SESSION_ID}/renew"): (
                    200,
                    {
                        "id": SESSION_ID,
                        "token": "wai_sess_updated_token",
                        "expiresAt": 1707003600,
                        "renewalCount": 3,
                    },
                )
            }
        )
        client = make_client(handler)
        assert client.session_token == "wai_sess_test_token"
        await client.renew_session(SESSION_ID)
        assert client.session_token == "wai_sess_updated_token"


class TestSetSessionToken:
    async def test_updates_authorization_header(self):
        handler = make_handler({})
        client = make_client(handler)
        client.set_session_token("wai_sess_new_one")
        assert client.session_token == "wai_sess_new_one"
        assert (
            client._client.headers["Authorization"] == "Bearer wai_sess_new_one"
        )


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    async def test_401_raises_waiaas_error(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/balance"): (
                    401,
                    {
                        "code": "SESSION_INVALID",
                        "message": "Invalid session token",
                        "retryable": False,
                        "hint": "Re-authenticate with POST /v1/sessions",
                    },
                )
            }
        )
        client = make_client(handler)
        with pytest.raises(WAIaaSError) as exc_info:
            await client.get_balance()
        err = exc_info.value
        assert err.code == "SESSION_INVALID"
        assert err.message == "Invalid session token"
        assert err.status_code == 401
        assert err.retryable is False
        assert err.hint == "Re-authenticate with POST /v1/sessions"

    async def test_404_raises_non_retryable(self):
        handler = make_handler(
            {
                ("GET", f"/v1/transactions/{TX_ID}"): (
                    404,
                    {
                        "code": "TRANSACTION_NOT_FOUND",
                        "message": "Transaction not found",
                        "retryable": False,
                    },
                )
            }
        )
        client = make_client(handler)
        with pytest.raises(WAIaaSError) as exc_info:
            await client.get_transaction(TX_ID)
        assert exc_info.value.code == "TRANSACTION_NOT_FOUND"
        assert exc_info.value.retryable is False

    async def test_error_includes_request_id(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/balance"): (
                    500,
                    {
                        "code": "INTERNAL_ERROR",
                        "message": "Internal server error",
                        "retryable": True,
                        "requestId": "req-123-abc",
                    },
                )
            }
        )
        client = make_client(handler)
        with pytest.raises(WAIaaSError) as exc_info:
            await client.get_balance()
        assert exc_info.value.request_id == "req-123-abc"

    async def test_non_json_error_response(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(502, text="Bad Gateway")

        client = make_client(handler)
        with pytest.raises(WAIaaSError) as exc_info:
            await client.get_balance()
        assert exc_info.value.code == "UNKNOWN_ERROR"
        assert exc_info.value.status_code == 502


# ---------------------------------------------------------------------------
# Retry integration
# ---------------------------------------------------------------------------


class TestRetryIntegration:
    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_429_retries_and_succeeds(self, mock_sleep):
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                return httpx.Response(
                    429,
                    json={
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many requests",
                        "retryable": True,
                    },
                )
            return httpx.Response(
                200,
                json={
                    "walletId": WALLET_ID,
                    "chain": "solana",
                    "network": "devnet",
                    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                    "balance": "1000000000",
                    "decimals": 9,
                    "symbol": "SOL",
                },
            )

        transport = httpx.MockTransport(handler)
        http_client = httpx.AsyncClient(transport=transport, base_url="http://test")
        client = WAIaaSClient(
            "http://test",
            "token",
            http_client=http_client,
            retry_policy=RetryPolicy(max_retries=3, base_delay=1.0),
        )
        result = await client.get_balance()
        assert result.balance == "1000000000"
        assert call_count == 2
        mock_sleep.assert_called_once_with(1.0)

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_500_retries_with_backoff(self, mock_sleep):
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                return httpx.Response(
                    500,
                    json={
                        "code": "INTERNAL_ERROR",
                        "message": "Server error",
                        "retryable": True,
                    },
                )
            return httpx.Response(
                200,
                json={
                    "walletId": WALLET_ID,
                    "chain": "solana",
                    "network": "devnet",
                    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                    "balance": "500",
                    "decimals": 9,
                    "symbol": "SOL",
                },
            )

        transport = httpx.MockTransport(handler)
        http_client = httpx.AsyncClient(transport=transport, base_url="http://test")
        client = WAIaaSClient(
            "http://test",
            "token",
            http_client=http_client,
            retry_policy=RetryPolicy(max_retries=3, base_delay=1.0),
        )
        result = await client.get_balance()
        assert result.balance == "500"
        assert call_count == 3
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)

    async def test_400_no_retry(self):
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(
                400,
                json={
                    "code": "ACTION_VALIDATION_FAILED",
                    "message": "Invalid request",
                    "retryable": False,
                },
            )

        transport = httpx.MockTransport(handler)
        http_client = httpx.AsyncClient(transport=transport, base_url="http://test")
        client = WAIaaSClient(
            "http://test",
            "token",
            http_client=http_client,
            retry_policy=RetryPolicy(max_retries=3),
        )
        with pytest.raises(WAIaaSError) as exc_info:
            await client.get_balance()
        assert exc_info.value.code == "ACTION_VALIDATION_FAILED"
        assert call_count == 1  # no retry


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------


class TestContextManager:
    async def test_async_with_creates_and_closes(self):
        handler = make_handler(
            {
                ("GET", "/v1/wallet/balance"): (
                    200,
                    {
                        "walletId": WALLET_ID,
                        "chain": "solana",
                        "network": "devnet",
                        "address": "addr",
                        "balance": "100",
                        "decimals": 9,
                        "symbol": "SOL",
                    },
                )
            }
        )
        transport = httpx.MockTransport(handler)
        async with WAIaaSClient(
            "http://test",
            "token",
            http_client=httpx.AsyncClient(transport=transport, base_url="http://test"),
        ) as client:
            result = await client.get_balance()
            assert result.balance == "100"

    async def test_close_is_idempotent(self):
        handler = make_handler({})
        transport = httpx.MockTransport(handler)
        client = WAIaaSClient(
            "http://test",
            "token",
            http_client=httpx.AsyncClient(transport=transport, base_url="http://test"),
        )
        # Should not raise on multiple close calls
        await client.close()
        await client.close()
