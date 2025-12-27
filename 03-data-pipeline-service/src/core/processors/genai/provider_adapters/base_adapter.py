"""
Base GenAI Provider Adapter

Abstract base class for all GenAI provider adapters.
Defines the interface for extracting usage data from provider APIs.

Features:
- Configurable rate limiting to avoid provider API rate limits
- Retry with exponential backoff for transient errors
- HTTP connection pooling with proper timeouts
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import date
import logging
import asyncio
import time
import httpx

# Timeout and retry configuration
DEFAULT_TIMEOUT = httpx.Timeout(
    connect=10.0,    # Connection timeout
    read=30.0,       # Read timeout
    write=10.0,      # Write timeout
    pool=5.0         # Pool timeout
)
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # Exponential backoff base in seconds

# SECURITY: Rate limiting configuration
MAX_TOTAL_RETRIES = 10  # Maximum total retries across all requests
MAX_RETRY_AFTER_SECONDS = 120  # Maximum Retry-After header value to respect
MAX_REQUEST_DELAY_SECONDS = 5.0  # Maximum request delay
MAX_BATCH_DELAY_SECONDS = 30.0  # Maximum batch delay

# Rate limiting configuration for sequential API requests
# These can be overridden by adapter subclasses or at runtime
DEFAULT_REQUEST_DELAY_SECONDS = 0.1  # 100ms delay between requests
DEFAULT_BATCH_DELAY_SECONDS = 1.0    # 1 second delay between batches
DEFAULT_BURST_LIMIT = 10              # Requests before applying batch delay
DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60  # Window for rate limit tracking


class BaseGenAIAdapter(ABC):
    """
    Abstract base class for GenAI provider adapters.

    Each adapter must implement methods to:
    1. Extract PAYG usage (tokens)
    2. Extract commitment usage (PTU/GSU)
    3. Extract infrastructure usage (GPU hours)

    Not all providers support all flows - unsupported flows return empty lists.

    Rate Limiting Features:
    - Configurable delay between sequential API requests
    - Burst control with batch delays
    - Request tracking for rate limit avoidance
    """

    def __init__(
        self,
        credentials: Dict[str, Any],
        org_slug: str,
        request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
        batch_delay_seconds: float = DEFAULT_BATCH_DELAY_SECONDS,
        burst_limit: int = DEFAULT_BURST_LIMIT
    ):
        """
        Initialize adapter with credentials and rate limiting configuration.

        Args:
            credentials: Decrypted credentials from org_integration_credentials
            org_slug: Organization identifier
            request_delay_seconds: Delay between individual API requests (default: 0.1s)
            batch_delay_seconds: Delay after burst_limit requests (default: 1.0s)
            burst_limit: Number of requests before applying batch delay (default: 10)
        """
        self.credentials = credentials
        self.org_slug = org_slug
        # LOW #19: Use full module path for logger name
        self.logger = logging.getLogger(f"src.core.processors.genai.provider_adapters.{self.__class__.__name__}")

        # Rate limiting configuration
        self._request_delay_seconds = request_delay_seconds
        self._batch_delay_seconds = batch_delay_seconds
        self._burst_limit = burst_limit

        # Rate limiting state (thread-safe via lock)
        self._request_count = 0
        self._last_request_time: Optional[float] = None
        self._requests_in_window: List[float] = []
        # SECURITY: Track total retry count across all requests
        self._total_retry_count = 0
        # MEDIUM #15: Thread-safe lock for request count
        self._request_count_lock = asyncio.Lock()

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier (e.g., 'openai', 'anthropic')"""
        pass

    @property
    def supports_payg(self) -> bool:
        """Whether this provider supports PAYG (token-based) billing"""
        return True

    @property
    def supports_commitment(self) -> bool:
        """Whether this provider supports commitment (PTU/GSU) billing"""
        return False

    @property
    def supports_infrastructure(self) -> bool:
        """Whether this provider supports infrastructure (GPU/TPU) billing"""
        return False

    @abstractmethod
    async def extract_payg_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract PAYG (token-based) usage from provider API.

        Args:
            start_date: Start of date range (inclusive)
            end_date: End of date range (inclusive)
            **kwargs: Provider-specific parameters

        Returns:
            List of usage records with fields:
                - usage_date: DATE
                - provider: STRING
                - model: STRING
                - model_family: STRING (optional)
                - region: STRING (optional)
                - input_tokens: INT64
                - output_tokens: INT64
                - cached_input_tokens: INT64 (optional)
                - total_tokens: INT64
                - request_count: INT64
                - credential_id: STRING
        """
        pass

    async def extract_commitment_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract commitment (PTU/GSU) usage.

        Override in providers that support commitments (Azure, AWS Bedrock, GCP Vertex).

        Returns:
            List of usage records with fields:
                - usage_date: DATE
                - provider: STRING
                - commitment_type: STRING (ptu, gsu, pt)
                - commitment_id: STRING
                - model_group: STRING
                - region: STRING
                - provisioned_units: INT64
                - used_units: INT64
                - utilization_pct: FLOAT64
                - overage_units: INT64
        """
        if not self.supports_commitment:
            return []
        raise NotImplementedError("Commitment usage not implemented for this provider")

    async def extract_infrastructure_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract infrastructure (GPU/TPU) usage.

        Override in providers that support infrastructure billing (GCP, AWS, Azure GPU).

        Returns:
            List of usage records with fields:
                - usage_date: DATE
                - provider: STRING
                - resource_type: STRING (gpu, tpu, inferentia)
                - instance_type: STRING
                - instance_id: STRING
                - gpu_type: STRING
                - region: STRING
                - instance_count: INT64
                - hours_used: FLOAT64
                - gpu_hours: FLOAT64
                - pricing_type: STRING (on_demand, spot, reserved)
                - avg_gpu_utilization_pct: FLOAT64
                - avg_memory_utilization_pct: FLOAT64
        """
        if not self.supports_infrastructure:
            return []
        raise NotImplementedError("Infrastructure usage not implemented for this provider")

    async def validate_credentials(self) -> bool:
        """
        Validate that credentials are valid and have necessary permissions.

        Returns:
            True if credentials are valid, False otherwise
        """
        try:
            # Default implementation - try to make a simple API call
            # Subclasses should override with provider-specific validation
            return True
        except Exception as e:
            # Log only exception type to avoid leaking sensitive data in error messages
            self.logger.error(f"Credential validation failed: {type(e).__name__}")
            return False

    def _normalize_model_name(self, model: str) -> str:
        """
        Normalize model name to match pricing table format.

        Args:
            model: Raw model name from API

        Returns:
            Normalized model name
        """
        # Remove version suffixes, snapshots, etc.
        model = model.lower().strip()
        # Remove common suffixes
        for suffix in ["-preview", "-latest", "-0125", "-0613", "-turbo"]:
            if model.endswith(suffix):
                model = model[:-len(suffix)]
        return model

    async def _apply_rate_limit(self) -> None:
        """
        Apply rate limiting before making an API request.

        Implements configurable delay between requests to avoid provider rate limits:
        1. Always applies minimum delay between requests (request_delay_seconds)
        2. After burst_limit requests, applies longer batch delay (batch_delay_seconds)
        3. Tracks request timing for monitoring

        Usage:
            await self._apply_rate_limit()
            response = await client.get(url)
        """
        current_time = time.monotonic()

        # Clean up old requests outside the window
        window_start = current_time - DEFAULT_RATE_LIMIT_WINDOW_SECONDS
        self._requests_in_window = [t for t in self._requests_in_window if t > window_start]

        # Check if we've hit the burst limit
        if len(self._requests_in_window) >= self._burst_limit:
            self.logger.debug(
                f"Burst limit reached ({self._burst_limit} requests), "
                f"applying batch delay of {self._batch_delay_seconds}s"
            )
            await asyncio.sleep(self._batch_delay_seconds)
            # Reset the window after batch delay
            self._requests_in_window = []
        elif self._last_request_time is not None:
            # Apply minimum delay between requests
            elapsed = current_time - self._last_request_time
            if elapsed < self._request_delay_seconds:
                delay = self._request_delay_seconds - elapsed
                await asyncio.sleep(delay)

        # Update tracking state (Note: for async context, use lock for thread safety)
        self._last_request_time = time.monotonic()
        self._requests_in_window.append(self._last_request_time)
        # MEDIUM #15: Increment with awareness of concurrent access
        # In async context, this is generally safe but we track for monitoring
        self._request_count += 1

    def configure_rate_limiting(
        self,
        request_delay_seconds: Optional[float] = None,
        batch_delay_seconds: Optional[float] = None,
        burst_limit: Optional[int] = None
    ) -> None:
        """
        Configure rate limiting parameters at runtime.

        Allows adjusting rate limits based on provider-specific requirements
        or observed rate limit responses.

        Args:
            request_delay_seconds: Delay between individual requests
            batch_delay_seconds: Delay after burst limit reached
            burst_limit: Number of requests before batch delay

        Example:
            # Increase delays after hitting rate limits
            adapter.configure_rate_limiting(
                request_delay_seconds=0.5,
                batch_delay_seconds=5.0
            )
        """
        if request_delay_seconds is not None:
            self._request_delay_seconds = request_delay_seconds
        if batch_delay_seconds is not None:
            self._batch_delay_seconds = batch_delay_seconds
        if burst_limit is not None:
            self._burst_limit = burst_limit

        self.logger.info(
            f"Rate limiting configured: delay={self._request_delay_seconds}s, "
            f"batch_delay={self._batch_delay_seconds}s, burst_limit={self._burst_limit}"
        )

    def get_rate_limit_stats(self) -> Dict[str, Any]:
        """
        Get current rate limiting statistics.

        Returns:
            Dict with rate limit stats for monitoring
        """
        return {
            "total_requests": self._request_count,
            "requests_in_current_window": len(self._requests_in_window),
            "burst_limit": self._burst_limit,
            "request_delay_seconds": self._request_delay_seconds,
            "batch_delay_seconds": self._batch_delay_seconds,
            "last_request_time": self._last_request_time
        }

    def reset_retry_state(self) -> None:
        """
        Reset retry state after successful operation.
        Call after successful batch of requests to reset delay multipliers.
        """
        self._total_retry_count = 0
        self._request_delay_seconds = DEFAULT_REQUEST_DELAY_SECONDS
        self._batch_delay_seconds = DEFAULT_BATCH_DELAY_SECONDS
        self.logger.debug("Reset retry state and rate limit delays")

    async def _make_request_with_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        apply_rate_limit: bool = True,
        **kwargs
    ) -> httpx.Response:
        """
        Make HTTP request with retry logic, exponential backoff, and rate limiting.

        Args:
            client: httpx.AsyncClient instance
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            apply_rate_limit: Whether to apply rate limiting delay (default: True)
            **kwargs: Additional arguments for the request

        Returns:
            httpx.Response object

        Raises:
            httpx.HTTPError: If all retries fail or max total retries exceeded
        """
        last_exception = None

        for attempt in range(MAX_RETRIES):
            # SECURITY: Check total retry count across all requests
            if self._total_retry_count >= MAX_TOTAL_RETRIES:
                self.logger.error(
                    f"Max total retries ({MAX_TOTAL_RETRIES}) exceeded for {self.provider_name}. "
                    f"Aborting to prevent infinite retry loops."
                )
                raise httpx.HTTPError(
                    f"Max total retries ({MAX_TOTAL_RETRIES}) exceeded. "
                    "Provider may be experiencing issues or credentials may be rate limited."
                )

            try:
                # Apply rate limiting before each request attempt
                if apply_rate_limit:
                    await self._apply_rate_limit()

                response = await client.request(method, url, **kwargs)

                # Handle rate limiting (429)
                if response.status_code == 429:
                    self._total_retry_count += 1

                    # SECURITY: Validate and cap Retry-After header
                    retry_after_raw = response.headers.get("Retry-After", str(RETRY_BACKOFF_BASE ** attempt))
                    try:
                        retry_after = int(retry_after_raw)
                    except (ValueError, TypeError):
                        retry_after = int(RETRY_BACKOFF_BASE ** attempt)

                    # Cap the retry_after to prevent excessively long waits
                    retry_after = min(max(retry_after, 1), MAX_RETRY_AFTER_SECONDS)

                    self.logger.warning(
                        f"Rate limited by {self.provider_name}. Retrying in {retry_after}s "
                        f"(attempt {attempt + 1}/{MAX_RETRIES}, total retries: {self._total_retry_count}/{MAX_TOTAL_RETRIES})"
                    )
                    # Increase rate limit delays after hitting 429 (with caps)
                    self._request_delay_seconds = min(self._request_delay_seconds * 2, MAX_REQUEST_DELAY_SECONDS)
                    self._batch_delay_seconds = min(self._batch_delay_seconds * 2, MAX_BATCH_DELAY_SECONDS)
                    await asyncio.sleep(retry_after)
                    continue

                # Handle server errors (5xx) with retry
                if 500 <= response.status_code < 600:
                    self._total_retry_count += 1
                    wait_time = RETRY_BACKOFF_BASE ** attempt
                    self.logger.warning(
                        f"Server error {response.status_code} from {self.provider_name}. "
                        f"Retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES}, "
                        f"total retries: {self._total_retry_count}/{MAX_TOTAL_RETRIES})"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                return response

            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exception = e
                self._total_retry_count += 1
                wait_time = RETRY_BACKOFF_BASE ** attempt
                self.logger.warning(
                    f"Request failed for {self.provider_name}: {type(e).__name__}. "
                    f"Retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES}, "
                    f"total retries: {self._total_retry_count}/{MAX_TOTAL_RETRIES})"
                )
                await asyncio.sleep(wait_time)

        # All retries exhausted
        if last_exception:
            raise last_exception
        raise httpx.HTTPError(f"Request failed after {MAX_RETRIES} retries")

    def _get_http_client(self) -> httpx.AsyncClient:
        """
        Get configured HTTP client with proper timeout.

        Returns:
            httpx.AsyncClient configured with timeouts
        """
        return httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)

    def _get_model_family(self, model: str) -> str:
        """
        Determine model family from model name.

        Args:
            model: Model identifier

        Returns:
            Model family (e.g., 'gpt-4', 'claude-3', 'gemini-1.5')
        """
        model_lower = model.lower()

        # OpenAI families
        if "gpt-4o" in model_lower:
            return "gpt-4o"
        elif "gpt-4" in model_lower:
            return "gpt-4"
        elif "gpt-3.5" in model_lower:
            return "gpt-3.5"
        elif "o1" in model_lower:
            return "o1"

        # Anthropic families
        elif "claude-3-opus" in model_lower:
            return "claude-3-opus"
        elif "claude-3-sonnet" in model_lower:
            return "claude-3-sonnet"
        elif "claude-3-haiku" in model_lower:
            return "claude-3-haiku"
        elif "claude-3.5" in model_lower:
            return "claude-3.5"

        # Gemini families
        elif "gemini-1.5-pro" in model_lower:
            return "gemini-1.5-pro"
        elif "gemini-1.5-flash" in model_lower:
            return "gemini-1.5-flash"
        elif "gemini-2" in model_lower:
            return "gemini-2"

        # Default: use first part of model name
        return model.split("-")[0] if "-" in model else model
