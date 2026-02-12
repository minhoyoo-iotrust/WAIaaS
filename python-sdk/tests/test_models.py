"""Pydantic model validation tests for WAIaaS SDK."""

import pytest
from pydantic import ValidationError

from waiaas.models import (
    AssetInfo,
    PendingTransactionList,
    SendTokenRequest,
    SessionRenewResponse,
    TokenInfo,
    TransactionDetail,
    TransactionList,
    WalletAddress,
    WalletAssets,
    WalletBalance,
)

from tests.conftest import AGENT_ID, SESSION_ID, TX_ID


class TestWalletBalance:
    def test_from_camel_case_json(self):
        data = {
            "agentId": AGENT_ID,
            "chain": "solana",
            "network": "devnet",
            "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
            "balance": "1000000000",
            "decimals": 9,
            "symbol": "SOL",
        }
        model = WalletBalance.model_validate(data)
        assert model.agent_id == AGENT_ID
        assert model.chain == "solana"
        assert model.network == "devnet"
        assert model.balance == "1000000000"
        assert model.decimals == 9
        assert model.symbol == "SOL"


class TestWalletAddress:
    def test_from_camel_case_json(self):
        data = {
            "agentId": AGENT_ID,
            "chain": "solana",
            "network": "devnet",
            "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        }
        model = WalletAddress.model_validate(data)
        assert model.agent_id == AGENT_ID
        assert model.address == "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"


class TestWalletAssets:
    def test_with_nested_asset_info(self):
        data = {
            "agentId": AGENT_ID,
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
        }
        model = WalletAssets.model_validate(data)
        assert model.agent_id == AGENT_ID
        assert len(model.assets) == 2
        assert model.assets[0].is_native is True
        assert model.assets[0].usd_value == 150.25
        assert model.assets[1].is_native is False
        assert model.assets[1].usd_value is None


class TestTransactionDetail:
    def test_with_null_optional_fields(self):
        data = {
            "id": TX_ID,
            "agentId": AGENT_ID,
            "type": "TRANSFER",
            "status": "PENDING",
            "tier": None,
            "chain": "solana",
            "toAddress": None,
            "amount": None,
            "txHash": None,
            "error": None,
            "createdAt": None,
        }
        model = TransactionDetail.model_validate(data)
        assert model.id == TX_ID
        assert model.agent_id == AGENT_ID
        assert model.tier is None
        assert model.to_address is None
        assert model.tx_hash is None

    def test_with_all_fields_populated(self):
        data = {
            "id": TX_ID,
            "agentId": AGENT_ID,
            "type": "TRANSFER",
            "status": "CONFIRMED",
            "tier": "INSTANT",
            "chain": "solana",
            "toAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "amount": "500000000",
            "txHash": "5KtP8...abc",
            "error": None,
            "createdAt": 1707000000,
        }
        model = TransactionDetail.model_validate(data)
        assert model.tier == "INSTANT"
        assert model.to_address == "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
        assert model.amount == "500000000"
        assert model.created_at == 1707000000


class TestTransactionList:
    def test_with_cursor_pagination(self):
        data = {
            "items": [
                {
                    "id": TX_ID,
                    "agentId": AGENT_ID,
                    "type": "TRANSFER",
                    "status": "CONFIRMED",
                    "chain": "solana",
                }
            ],
            "cursor": TX_ID,
            "hasMore": True,
        }
        model = TransactionList.model_validate(data)
        assert len(model.items) == 1
        assert model.cursor == TX_ID
        assert model.has_more is True

    def test_last_page_no_cursor(self):
        data = {
            "items": [],
            "cursor": None,
            "hasMore": False,
        }
        model = TransactionList.model_validate(data)
        assert len(model.items) == 0
        assert model.cursor is None
        assert model.has_more is False


class TestPendingTransactionList:
    def test_pending_list(self):
        data = {
            "items": [
                {
                    "id": TX_ID,
                    "agentId": AGENT_ID,
                    "type": "TRANSFER",
                    "status": "PENDING",
                    "chain": "solana",
                }
            ]
        }
        model = PendingTransactionList.model_validate(data)
        assert len(model.items) == 1
        assert model.items[0].status == "PENDING"


class TestSessionRenewResponse:
    def test_from_camel_case_json(self):
        data = {
            "id": SESSION_ID,
            "token": "wai_sess_new_token_xyz",
            "expiresAt": 1707003600,
            "renewalCount": 2,
        }
        model = SessionRenewResponse.model_validate(data)
        assert model.id == SESSION_ID
        assert model.token == "wai_sess_new_token_xyz"
        assert model.expires_at == 1707003600
        assert model.renewal_count == 2


class TestSendTokenRequest:
    def test_serialization(self):
        req = SendTokenRequest(
            to="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            amount="1000000",
        )
        data = req.model_dump(exclude_none=True)
        assert data == {
            "to": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "amount": "1000000",
        }

    def test_serialization_with_memo(self):
        req = SendTokenRequest(
            to="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            amount="1000000",
            memo="test payment",
        )
        data = req.model_dump(exclude_none=True)
        assert data["memo"] == "test payment"


class TestTokenInfo:
    def test_token_info_creation(self):
        token = TokenInfo(address="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals=6, symbol="USDC")
        assert token.address == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        assert token.decimals == 6
        assert token.symbol == "USDC"

    def test_token_info_serialization(self):
        token = TokenInfo(address="mint1", decimals=9, symbol="SOL")
        data = token.model_dump()
        assert data == {"address": "mint1", "decimals": 9, "symbol": "SOL"}


class TestSendTokenRequestWithType:
    def test_serialization_with_type_and_token(self):
        token = TokenInfo(address="mint1", decimals=6, symbol="USDC")
        req = SendTokenRequest(
            to="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            amount="500000",
            type="TOKEN_TRANSFER",
            token=token,
        )
        data = req.model_dump(exclude_none=True, by_alias=True)
        assert data["to"] == "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
        assert data["amount"] == "500000"
        assert data["type"] == "TOKEN_TRANSFER"
        assert data["token"]["address"] == "mint1"
        assert data["token"]["decimals"] == 6
        assert data["token"]["symbol"] == "USDC"

    def test_serialization_legacy_no_type(self):
        req = SendTokenRequest(
            to="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            amount="1000000",
        )
        data = req.model_dump(exclude_none=True, by_alias=True)
        assert data == {
            "to": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "amount": "1000000",
        }
        assert "type" not in data
        assert "token" not in data

    def test_serialization_with_contract_call_fields(self):
        req = SendTokenRequest(
            to="0xContractAddr",
            type="CONTRACT_CALL",
            calldata="0xabcdef",
        )
        data = req.model_dump(exclude_none=True, by_alias=True)
        assert data["type"] == "CONTRACT_CALL"
        assert data["to"] == "0xContractAddr"
        assert data["calldata"] == "0xabcdef"

    def test_serialization_with_program_id_alias(self):
        req = SendTokenRequest(
            to="program",
            type="CONTRACT_CALL",
            program_id="ProgramXYZ",
            instruction_data="base64data",
        )
        data = req.model_dump(exclude_none=True, by_alias=True)
        assert data["programId"] == "ProgramXYZ"
        assert data["instructionData"] == "base64data"


class TestValidationErrors:
    def test_missing_required_field(self):
        with pytest.raises(ValidationError):
            WalletBalance.model_validate(
                {
                    "agentId": AGENT_ID,
                    "chain": "solana",
                    # missing: network, address, balance, decimals, symbol
                }
            )

    def test_wrong_type(self):
        with pytest.raises(ValidationError):
            WalletBalance.model_validate(
                {
                    "agentId": AGENT_ID,
                    "chain": "solana",
                    "network": "devnet",
                    "address": "xxx",
                    "balance": "100",
                    "decimals": "not_a_number",  # should be int
                    "symbol": "SOL",
                }
            )


class TestAssetInfo:
    def test_with_optional_usd_value(self):
        data = {
            "mint": "So11111111111111111111111111111111111111112",
            "symbol": "SOL",
            "name": "Solana",
            "balance": "1000000000",
            "decimals": 9,
            "isNative": True,
            "usdValue": 150.25,
        }
        model = AssetInfo.model_validate(data)
        assert model.usd_value == 150.25

    def test_without_usd_value(self):
        data = {
            "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "symbol": "USDC",
            "name": "USD Coin",
            "balance": "5000000",
            "decimals": 6,
            "isNative": False,
        }
        model = AssetInfo.model_validate(data)
        assert model.usd_value is None
        assert model.is_native is False
