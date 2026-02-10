"""Exponential backoff retry for transient HTTP errors."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")


@dataclass
class RetryPolicy:
    """Configuration for exponential backoff retry."""

    max_retries: int = 3
    base_delay: float = 1.0  # seconds
    max_delay: float = 10.0  # seconds
    retryable_status_codes: set[int] = field(
        default_factory=lambda: {429, 500, 502, 503, 504}
    )

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for the given attempt (0-indexed)."""
        delay = self.base_delay * (2**attempt)
        return min(delay, self.max_delay)

    def is_retryable_status(self, status_code: int) -> bool:
        """Check if the given HTTP status code is retryable."""
        return status_code in self.retryable_status_codes


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    policy: RetryPolicy,
) -> T:
    """Execute an async function with exponential backoff retry.

    Retries on exceptions that have a ``status_code`` attribute matching
    the policy's retryable status codes.  The ``retryable`` attribute on
    the error is also checked -- if False, no retry is attempted.

    Args:
        fn: Async function to execute.
        policy: Retry policy configuration.

    Returns:
        The result of the function call.

    Raises:
        The last exception if all retries are exhausted.
    """
    last_error: Exception | None = None
    for attempt in range(policy.max_retries + 1):
        try:
            return await fn()
        except Exception as e:
            last_error = e
            status_code = getattr(e, "status_code", 0)
            retryable = getattr(e, "retryable", True)

            # Don't retry if not retryable or not a retryable status code
            if not retryable or not policy.is_retryable_status(status_code):
                raise

            # Don't retry if we've exhausted attempts
            if attempt >= policy.max_retries:
                raise

            delay = policy.get_delay(attempt)
            await asyncio.sleep(delay)

    # Should not reach here, but satisfy type checker
    assert last_error is not None
    raise last_error
