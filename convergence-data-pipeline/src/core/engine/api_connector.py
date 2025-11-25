"""
API Connector
REST API client with authentication, pagination, rate limiting, and retry logic.
"""

import httpx
import asyncio
import time
from typing import Dict, Any, Optional, Iterator, List
from dataclasses import dataclass
import logging
import ipaddress
from urllib.parse import urlparse

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from src.core.abstractor.models import (
    RestAPIConnectorConfig,
    AuthType,
    PaginationConfig
)
from src.core.utils.secrets import get_secret
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class SSRFValidationError(ValueError):
    """Raised when URL fails SSRF security validation."""
    pass


def validate_url(url: str) -> None:
    """
    Validate URL to prevent SSRF attacks.

    Blocks:
    - Private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    - Loopback: 127.0.0.0/8
    - Link-local: 169.254.0.0/16 (AWS metadata service, etc)
    - Broadcast/special: 0.0.0.0, 255.255.255.255
    - localhost hostname
    - Non-HTTP(S) schemes

    Args:
        url: URL to validate

    Raises:
        SSRFValidationError: If URL fails validation
    """
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise SSRFValidationError(f"Invalid URL format: {url}") from e

    # Validate scheme
    if parsed.scheme not in ("http", "https"):
        raise SSRFValidationError(
            f"Invalid scheme '{parsed.scheme}' for URL: {url}. Only http and https are allowed."
        )

    # Validate hostname exists
    hostname = parsed.hostname
    if not hostname:
        raise SSRFValidationError(f"URL missing hostname: {url}")

    # Block localhost by hostname
    if hostname.lower() in ("localhost", "localhost.localdomain"):
        raise SSRFValidationError(
            f"Localhost not allowed: {url}"
        )

    # Try to parse as IP address
    try:
        ip = ipaddress.ip_address(hostname)

        # Block private IP ranges
        private_ranges = [
            ipaddress.ip_network("10.0.0.0/8"),           # Private
            ipaddress.ip_network("172.16.0.0/12"),        # Private
            ipaddress.ip_network("192.168.0.0/16"),       # Private
            ipaddress.ip_network("127.0.0.0/8"),          # Loopback
            ipaddress.ip_network("169.254.0.0/16"),       # Link-local (AWS metadata)
            ipaddress.ip_network("0.0.0.0/8"),            # Current network
            ipaddress.ip_network("255.255.255.255/32"),   # Broadcast
        ]

        for private_range in private_ranges:
            if ip in private_range:
                raise SSRFValidationError(
                    f"URL resolves to blocked private/reserved IP range {private_range}: {url}"
                )

        # Block IPv6 private ranges
        if ip.version == 6:
            ipv6_private_ranges = [
                ipaddress.ip_network("::1/128"),           # Loopback
                ipaddress.ip_network("fc00::/7"),          # Unique local
                ipaddress.ip_network("fe80::/10"),         # Link-local
                ipaddress.ip_network("::/128"),            # Unspecified
            ]
            for private_range in ipv6_private_ranges:
                if ip in private_range:
                    raise SSRFValidationError(
                        f"URL resolves to blocked IPv6 private range {private_range}: {url}"
                    )

    except ipaddress.AddressValueError:
        # Not an IP address, assume it's a valid hostname (DNS resolution happens at request time)
        # In production, consider adding DNS rebinding protection
        pass


@dataclass
class APIResponse:
    """Container for API response data."""
    data: List[Dict[str, Any]]
    status_code: int
    total_records: Optional[int] = None
    next_page_token: Optional[str] = None


class RateLimiter:
    """
    Token bucket rate limiter for API calls.
    """

    def __init__(self, requests_per_minute: int):
        """
        Initialize rate limiter.

        Args:
            requests_per_minute: Maximum requests allowed per minute
        """
        self.requests_per_minute = requests_per_minute
        self.tokens = requests_per_minute
        self.last_update = time.time()
        self.lock = asyncio.Lock()

    async def acquire(self):
        """Acquire a token, waiting if necessary."""
        async with self.lock:
            while self.tokens <= 0:
                # Refill tokens based on elapsed time
                now = time.time()
                elapsed = now - self.last_update
                self.tokens += elapsed * (self.requests_per_minute / 60.0)
                self.tokens = min(self.tokens, self.requests_per_minute)
                self.last_update = now

                if self.tokens <= 0:
                    # Wait a bit before checking again
                    await asyncio.sleep(0.1)

            self.tokens -= 1


class APIConnector:
    """
    Enterprise REST API connector with full feature set.

    Features:
    - Multiple authentication methods (Bearer, API Key, Basic, OAuth2)
    - Pagination (cursor, offset, page-based)
    - Rate limiting with token bucket algorithm
    - Automatic retry with exponential backoff
    - Request/response logging
    - Streaming for large datasets
    """

    def __init__(
        self,
        config: RestAPIConnectorConfig,
        org_slug: str
    ):
        """
        Initialize API connector.

        Args:
            config: REST API connector configuration
            org_slug: Organization identifier for secret management

        Raises:
            SSRFValidationError: If base_url fails SSRF validation
        """
        self.config = config
        self.org_slug = org_slug

        # SECURITY: Validate base_url to prevent SSRF attacks
        validate_url(config.base_url)

        self.base_url = config.base_url.rstrip("/")

        # Rate limiter
        self.rate_limiter = None
        if config.rate_limit:
            self.rate_limiter = RateLimiter(config.rate_limit.requests_per_minute)

        # HTTP client (async)
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """
        Get or create HTTP client.

        SECURITY: follow_redirects is disabled to prevent SSRF redirect attacks.
        """
        if self._client is None:
            headers = self._build_headers()
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=self.config.timeout,
                follow_redirects=False
            )
        return self._client

    def _build_headers(self) -> Dict[str, str]:
        """Build request headers with authentication."""
        headers = {
            "User-Agent": "Convergence-Data-Pipeline/1.0",
            "Accept": "application/json",
        }

        # Add custom headers from config
        if self.config.headers:
            headers.update(self.config.headers)

        # Add authentication header
        auth_header = self._get_auth_header()
        if auth_header:
            headers.update(auth_header)

        return headers

    def _get_auth_header(self) -> Optional[Dict[str, str]]:
        """
        Get authentication header based on auth type.

        Returns:
            Dictionary with auth header or None
        """
        auth = self.config.auth

        # Get secret value
        secret_value = get_secret(self.org_slug, auth.secret_key)
        if not secret_value:
            raise ValueError(f"Secret not found: {auth.secret_key} for org {self.org_slug}")

        if auth.type == AuthType.BEARER:
            return {"Authorization": f"Bearer {secret_value}"}

        elif auth.type == AuthType.API_KEY:
            header_name = auth.header_name or "X-API-Key"
            return {header_name: secret_value}

        elif auth.type == AuthType.BASIC:
            # Expect secret in format: username:password
            import base64
            encoded = base64.b64encode(secret_value.encode()).decode()
            return {"Authorization": f"Basic {encoded}"}

        elif auth.type == AuthType.OAUTH2:
            # OAuth2 token should be pre-fetched and stored as secret
            return {"Authorization": f"Bearer {secret_value}"}

        return None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(httpx.HTTPStatusError)
    )
    async def _make_request(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None
    ) -> httpx.Response:
        """
        Make HTTP GET request with retry and rate limiting.

        Args:
            url: Full URL to request
            params: Query parameters

        Returns:
            HTTP response

        Raises:
            httpx.HTTPStatusError: If response status is error
            SSRFValidationError: If URL fails SSRF validation
        """
        # SECURITY: Validate URL to prevent SSRF attacks
        validate_url(url)

        # Apply rate limiting
        if self.rate_limiter:
            await self.rate_limiter.acquire()

        client = await self._get_client()

        logger.debug(
            f"API request",
            url=url,
            params=params,
            org_slug=self.org_slug
        )

        response = await client.get(url, params=params)
        response.raise_for_status()

        logger.info(
            f"API response",
            url=url,
            status_code=response.status_code,
            response_time_ms=response.elapsed.total_seconds() * 1000,
            org_slug=self.org_slug
        )

        return response

    async def fetch_all(self) -> Iterator[Dict[str, Any]]:
        """
        Fetch all records with automatic pagination.

        Yields:
            Individual records as dictionaries
        """
        url = f"{self.base_url}{self.config.endpoint}"
        params = {}
        page = 1
        total_fetched = 0

        pagination = self.config.pagination

        while True:
            # Add pagination parameters
            if pagination:
                if pagination.type == "cursor":
                    # Cursor-based pagination
                    if page > 1 and "cursor" in params:
                        pass  # Keep cursor from previous response
                elif pagination.type == "offset":
                    params["offset"] = (page - 1) * pagination.page_size
                    params["limit"] = pagination.page_size
                elif pagination.type == "page":
                    params["page"] = page
                    params["per_page"] = pagination.page_size

            # Make request
            response = await self._make_request(url, params)
            data = response.json()

            # Extract records (handle different response formats)
            records = self._extract_records(data)

            if not records:
                logger.info(
                    f"No more records",
                    page=page,
                    total_fetched=total_fetched,
                    org_slug=self.org_slug
                )
                break

            # Yield records
            for record in records:
                yield record
                total_fetched += 1

            logger.info(
                f"Fetched page",
                page=page,
                records_in_page=len(records),
                total_fetched=total_fetched,
                org_slug=self.org_slug
            )

            # Check for next page
            if pagination and pagination.type == "cursor":
                next_cursor = data.get(pagination.cursor_field)
                if not next_cursor:
                    break
                params["cursor"] = next_cursor
            else:
                # Check if we got fewer records than page size (last page)
                if pagination and len(records) < pagination.page_size:
                    break

            page += 1

        logger.info(
            f"Completed fetch",
            total_records=total_fetched,
            total_pages=page,
            org_slug=self.org_slug
        )

    def _extract_records(self, response_data: Any) -> List[Dict[str, Any]]:
        """
        Extract records from API response.

        Handles different response formats:
        - Direct array: [{"id": 1}, {"id": 2}]
        - Wrapped: {"data": [{"id": 1}], "meta": {...}}
        - Wrapped with results: {"results": [{"id": 1}]}

        Args:
            response_data: Parsed JSON response

        Returns:
            List of record dictionaries
        """
        if isinstance(response_data, list):
            return response_data

        if isinstance(response_data, dict):
            # Try common wrapper keys
            for key in ["data", "results", "items", "records"]:
                if key in response_data and isinstance(response_data[key], list):
                    return response_data[key]

            # If no wrapper found, treat entire dict as single record
            return [response_data]

        return []

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


async def fetch_from_api(
    config: RestAPIConnectorConfig,
    org_slug: str
) -> List[Dict[str, Any]]:
    """
    Convenience function to fetch all data from API.

    Args:
        config: REST API connector configuration
        org_slug: Organization identifier

    Returns:
        List of all fetched records
    """
    connector = APIConnector(config, org_slug)
    try:
        records = []
        async for record in connector.fetch_all():
            records.append(record)
        return records
    finally:
        await connector.close()
