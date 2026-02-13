"""Shared pytest fixtures for WAIaaS SDK tests."""

import httpx

# Standard response fixtures
WALLET_ID = "01234567-89ab-cdef-0123-456789abcdef"
SESSION_ID = "fedcba98-7654-3210-fedc-ba9876543210"
TX_ID = "aabbccdd-eeff-0011-2233-445566778899"


def make_response(status_code: int, body: dict) -> httpx.Response:
    """Create an httpx.Response from status and body dict."""
    return httpx.Response(
        status_code=status_code,
        json=body,
    )


def mock_transport(handler):
    """Create httpx.MockTransport from a request handler function."""
    return httpx.MockTransport(handler)
