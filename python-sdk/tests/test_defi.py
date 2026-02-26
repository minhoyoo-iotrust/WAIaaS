"""Tests for DeFi position Pydantic models and response parsing."""

import pytest
from waiaas.models import DeFiPosition, DeFiPositionsResponse, HealthFactorResponse


class TestDeFiPositionResponse:
    """Test DeFiPositionsResponse model parsing."""

    def test_defi_positions_response_parsing(self) -> None:
        """Validate Pydantic model from sample JSON (camelCase aliases)."""
        data = {
            "walletId": "wlt-001",
            "positions": [
                {
                    "id": "pos-1",
                    "category": "LENDING",
                    "provider": "aave_v3",
                    "chain": "ethereum",
                    "network": "ethereum-mainnet",
                    "assetId": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
                    "amount": "1000000000000000000",
                    "amountUsd": 2500.0,
                    "metadata": {"aToken": "0xabc"},
                    "status": "ACTIVE",
                    "openedAt": 1700000000,
                    "lastSyncedAt": 1700003600,
                }
            ],
            "totalValueUsd": 2500.0,
        }

        resp = DeFiPositionsResponse.model_validate(data)
        assert resp.wallet_id == "wlt-001"
        assert len(resp.positions) == 1
        pos = resp.positions[0]
        assert pos.category == "LENDING"
        assert pos.provider == "aave_v3"
        assert pos.amount_usd == 2500.0
        assert pos.asset_id == "0xdAC17F958D2ee523a2206206994597C13D831ec7"
        assert resp.total_value_usd == 2500.0

    def test_defi_position_optional_fields(self) -> None:
        """assetId, amountUsd, network can be null."""
        data = {
            "id": "pos-2",
            "category": "YIELD",
            "provider": "pendle",
            "chain": "ethereum",
            "network": None,
            "assetId": None,
            "amount": "500000",
            "amountUsd": None,
            "metadata": None,
            "status": "ACTIVE",
            "openedAt": 1700000000,
            "lastSyncedAt": 1700003600,
        }

        pos = DeFiPosition.model_validate(data)
        assert pos.network is None
        assert pos.asset_id is None
        assert pos.amount_usd is None
        assert pos.metadata is None

    def test_empty_positions_response(self) -> None:
        """Empty positions list with null total."""
        data = {
            "walletId": "wlt-002",
            "positions": [],
            "totalValueUsd": None,
        }

        resp = DeFiPositionsResponse.model_validate(data)
        assert resp.wallet_id == "wlt-002"
        assert resp.positions == []
        assert resp.total_value_usd is None


class TestHealthFactorResponse:
    """Test HealthFactorResponse model parsing."""

    def test_health_factor_response_parsing(self) -> None:
        """Validate Pydantic model from sample JSON."""
        data = {
            "walletId": "wlt-001",
            "factor": 2.5,
            "totalCollateralUsd": 10000.0,
            "totalDebtUsd": 4000.0,
            "currentLtv": 0.4,
            "status": "safe",
        }

        resp = HealthFactorResponse.model_validate(data)
        assert resp.wallet_id == "wlt-001"
        assert resp.factor == 2.5
        assert resp.total_collateral_usd == 10000.0
        assert resp.total_debt_usd == 4000.0
        assert resp.current_ltv == 0.4
        assert resp.status == "safe"

    def test_health_factor_danger_status(self) -> None:
        """Status can be warning/danger/critical."""
        data = {
            "walletId": "wlt-003",
            "factor": 1.05,
            "totalCollateralUsd": 5000.0,
            "totalDebtUsd": 4760.0,
            "currentLtv": 0.95,
            "status": "critical",
        }

        resp = HealthFactorResponse.model_validate(data)
        assert resp.status == "critical"
        assert resp.factor == 1.05
