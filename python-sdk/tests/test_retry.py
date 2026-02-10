"""Retry logic tests for WAIaaS SDK."""

import pytest
from unittest.mock import AsyncMock, patch

from waiaas.errors import WAIaaSError
from waiaas.retry import RetryPolicy, with_retry


class TestRetryPolicy:
    def test_delay_calculation(self):
        policy = RetryPolicy(base_delay=1.0)
        assert policy.get_delay(0) == 1.0
        assert policy.get_delay(1) == 2.0
        assert policy.get_delay(2) == 4.0

    def test_max_delay_cap(self):
        policy = RetryPolicy(base_delay=1.0, max_delay=5.0)
        assert policy.get_delay(0) == 1.0
        assert policy.get_delay(1) == 2.0
        assert policy.get_delay(2) == 4.0
        assert policy.get_delay(3) == 5.0  # capped at max_delay
        assert policy.get_delay(10) == 5.0  # still capped

    def test_is_retryable_status(self):
        policy = RetryPolicy()
        assert policy.is_retryable_status(429) is True
        assert policy.is_retryable_status(500) is True
        assert policy.is_retryable_status(502) is True
        assert policy.is_retryable_status(503) is True
        assert policy.is_retryable_status(504) is True
        assert policy.is_retryable_status(400) is False
        assert policy.is_retryable_status(401) is False
        assert policy.is_retryable_status(404) is False


class TestWithRetry:
    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_succeeds_on_first_attempt(self, mock_sleep):
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await with_retry(fn, RetryPolicy())
        assert result == "success"
        assert call_count == 1
        mock_sleep.assert_not_called()

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_429_retries_and_succeeds(self, mock_sleep):
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise WAIaaSError(
                    code="RATE_LIMIT_EXCEEDED",
                    message="Too many requests",
                    status_code=429,
                    retryable=True,
                )
            return "success"

        result = await with_retry(fn, RetryPolicy(base_delay=1.0))
        assert result == "success"
        assert call_count == 2
        mock_sleep.assert_called_once_with(1.0)

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_500_retries_with_exponential_backoff(self, mock_sleep):
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise WAIaaSError(
                    code="INTERNAL_ERROR",
                    message="Server error",
                    status_code=500,
                    retryable=True,
                )
            return "success"

        result = await with_retry(fn, RetryPolicy(base_delay=1.0))
        assert result == "success"
        assert call_count == 3
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_non_retryable_status_raises_immediately(self, mock_sleep):
        async def fn():
            raise WAIaaSError(
                code="ACTION_VALIDATION_FAILED",
                message="Bad request",
                status_code=400,
                retryable=False,
            )

        with pytest.raises(WAIaaSError) as exc_info:
            await with_retry(fn, RetryPolicy())

        assert exc_info.value.code == "ACTION_VALIDATION_FAILED"
        assert exc_info.value.status_code == 400
        mock_sleep.assert_not_called()

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_non_retryable_flag_raises_immediately(self, mock_sleep):
        """Even if status code is retryable, retryable=False prevents retry."""

        async def fn():
            raise WAIaaSError(
                code="CUSTOM_ERROR",
                message="Don't retry this",
                status_code=500,
                retryable=False,
            )

        with pytest.raises(WAIaaSError) as exc_info:
            await with_retry(fn, RetryPolicy())

        assert exc_info.value.code == "CUSTOM_ERROR"
        mock_sleep.assert_not_called()

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_exhausts_max_retries(self, mock_sleep):
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            raise WAIaaSError(
                code="SERVICE_UNAVAILABLE",
                message="Service unavailable",
                status_code=503,
                retryable=True,
            )

        with pytest.raises(WAIaaSError) as exc_info:
            await with_retry(fn, RetryPolicy(max_retries=3, base_delay=1.0))

        assert exc_info.value.code == "SERVICE_UNAVAILABLE"
        assert call_count == 4  # 1 initial + 3 retries
        assert mock_sleep.call_count == 3
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)
        mock_sleep.assert_any_call(4.0)

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_delay_values_increase_exponentially(self, mock_sleep):
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            raise WAIaaSError(
                code="INTERNAL_ERROR",
                message="Server error",
                status_code=500,
                retryable=True,
            )

        with pytest.raises(WAIaaSError):
            await with_retry(fn, RetryPolicy(max_retries=3, base_delay=1.0))

        delays = [call.args[0] for call in mock_sleep.call_args_list]
        assert delays == [1.0, 2.0, 4.0]

    @patch("waiaas.retry.asyncio.sleep", new_callable=AsyncMock)
    async def test_max_delay_cap_applied(self, mock_sleep):
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            raise WAIaaSError(
                code="INTERNAL_ERROR",
                message="Server error",
                status_code=500,
                retryable=True,
            )

        with pytest.raises(WAIaaSError):
            await with_retry(
                fn, RetryPolicy(max_retries=4, base_delay=2.0, max_delay=5.0)
            )

        delays = [call.args[0] for call in mock_sleep.call_args_list]
        # 2.0, 4.0, 5.0 (capped), 5.0 (capped)
        assert delays == [2.0, 4.0, 5.0, 5.0]
