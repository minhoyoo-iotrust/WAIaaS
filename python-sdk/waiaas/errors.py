"""WAIaaS error types matching the daemon's error response format."""

from __future__ import annotations

from typing import Any, Optional


class WAIaaSError(Exception):
    """Error from WAIaaS API or client-side validation."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 0,
        retryable: bool = False,
        details: Optional[dict[str, Any]] = None,
        request_id: Optional[str] = None,
        hint: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.details = details
        self.request_id = request_id
        self.hint = hint

    @classmethod
    def from_response(cls, status_code: int, body: dict[str, Any]) -> "WAIaaSError":
        """Create WAIaaSError from API error response JSON."""
        return cls(
            code=body.get("code", "UNKNOWN_ERROR"),
            message=body.get("message", "Unknown error"),
            status_code=status_code,
            retryable=body.get("retryable", False),
            details=body.get("details"),
            request_id=body.get("requestId"),
            hint=body.get("hint"),
        )

    def __repr__(self) -> str:
        return f"WAIaaSError(code={self.code!r}, message={self.message!r}, status_code={self.status_code})"
