"""
Generic API Extractor Processor
Part of 'Pipeline as Config' Architecture.

ELT Pattern: Extract from API → Load to BigQuery (raw) → Transform via SQL

Architecture:
- Stream & Batch: Fetch Page -> Yield Rows -> Accumulate Batch -> Insert to BigQuery
- Memory Safe: Only holds batch_size rows in memory at a time
- Resilient: Partial data saved on failure (rows 1-8000 saved if fails at 9000)
- Auth Integration: Uses org_integration_credentials via KMS decryption

Supports:
- Pagination: Cursor, Offset, Page, Link (next URL in response)
- Authentication: Bearer, Header, Query, Basic, OAuth2
- Rate Limiting: Configurable delays, exponential backoff on 429
- Streaming: Handles millions of rows via generator pattern
- Batch Inserts: Smart switching between streaming (<100) and batch load (>=100)
"""

import logging
import json
import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, AsyncGenerator, Union
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.cloud import bigquery

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.core.utils.bq_helpers import (
    insert_rows_smart,
    InsertResult,
    serialize_row_for_json
)


# ============================================
# Constants
# ============================================

DEFAULT_BATCH_SIZE = 1000
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_RETRIES = 3
DEFAULT_RATE_LIMIT_DELAY = 0.1  # 100ms between requests

# Retryable HTTP status codes
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


# ============================================
# Helper Functions
# ============================================

def get_nested_value(data: Dict[str, Any], path: str, default: Any = None) -> Any:
    """
    Get a nested value from a dictionary using dot notation.

    Args:
        data: Dictionary to search
        path: Dot-separated path (e.g., "meta.pagination.next_cursor")
        default: Default value if path not found

    Returns:
        Value at path or default

    Example:
        data = {"meta": {"pagination": {"next_cursor": "abc123"}}}
        get_nested_value(data, "meta.pagination.next_cursor") -> "abc123"
    """
    if not path:
        return default

    keys = path.split(".")
    current = data

    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return default

    return current


def set_nested_value(data: Dict[str, Any], path: str, value: Any) -> None:
    """
    Set a nested value in a dictionary using dot notation.
    Creates intermediate dicts as needed.
    """
    keys = path.split(".")
    current = data

    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]

    current[keys[-1]] = value


# ============================================
# API Extractor Processor
# ============================================

class ApiExtractorProcessor:
    """
    Generic processor for extracting data from REST APIs.

    Flow:
    1. Resolve authentication (KMS-decrypted credentials)
    2. Fetch pages using configured pagination strategy
    3. Stream rows to BigQuery in batches
    4. Return extraction statistics

    Configuration Example (YAML):
    ```yaml
    - step: "extract_users"
      processor: "generic.api_extractor"
      config:
        url: "https://api.vendor.com/v1/users"
        method: "GET"
        auth:
          type: "bearer"              # bearer | header | query | basic | oauth2
          provider: "VENDOR_API"      # Provider name in org_integration_credentials
          # OR direct secret_key for simple cases:
          # secret_key: "vendor_api_key"
        pagination:
          type: "cursor"              # cursor | offset | page | link | none
          param: "after"              # Query param name for cursor/offset/page
          response_path: "meta.next"  # JSON path to find next cursor/link
          limit: 100                  # Page size
          limit_param: "limit"        # Query param name for page size
        data_path: "data"             # JSON path to array of records
        params:                       # Additional query parameters
          include: "metadata"
          status: "{status}"          # Variables resolved from context
        headers:                      # Additional headers
          Accept: "application/json"
        destination:
          table: "vendor_users_raw"   # Target table name
          batch_size: 1000            # Rows per batch insert
          key_fields:                 # Fields for idempotent insertId
            - "id"
            - "updated_at"
        rate_limit:
          requests_per_second: 10     # Max RPS
          retry_on_429: true          # Auto-retry on rate limit
          max_retries: 3              # Max retry attempts
        transform:                    # Optional row transformation
          add_fields:
            org_slug: "{org_slug}"
            extracted_at: "{now}"
          flatten: false              # Store as raw JSON or flatten
    ```
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute API extraction.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context with org_slug, secrets, variables

        Returns:
            Dict with status, rows_extracted, destination_table, etc.
        """
        start_time = time.time()
        org_slug = context.get("org_slug")

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required in context"}

        config = step_config.get("config", {})

        # Validate required config
        if not config.get("url"):
            return {"status": "FAILED", "error": "url is required in config"}

        if not config.get("destination", {}).get("table"):
            return {"status": "FAILED", "error": "destination.table is required in config"}

        self.logger.info(
            f"Starting API extraction",
            extra={
                "org_slug": org_slug,
                "url": config["url"],
                "destination": config["destination"]["table"]
            }
        )

        try:
            # 1. Setup authentication
            headers, params = await self._setup_auth(config, context, org_slug)

            # 2. Merge additional headers and params from config
            headers.update(config.get("headers", {}))
            base_params = config.get("params", {}).copy()

            # Resolve variables in params
            for k, v in base_params.items():
                if isinstance(v, str) and v.startswith("{") and v.endswith("}"):
                    var_name = v[1:-1]
                    if var_name in context:
                        base_params[k] = context[var_name]
                    elif var_name == "now":
                        base_params[k] = datetime.now(timezone.utc).isoformat()

            params.update(base_params)

            # 3. Setup BigQuery client and destination
            bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)
            dataset_id = self.settings.get_org_dataset_name(org_slug)
            destination = config.get("destination", {})
            table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{destination['table']}"
            batch_size = destination.get("batch_size", DEFAULT_BATCH_SIZE)
            key_fields = destination.get("key_fields")

            # 4. Extract and load
            total_rows = 0
            total_batches = 0
            buffer = []

            async for page_rows in self._fetch_pages(config, headers, params, context):
                # Transform rows if needed
                transformed_rows = self._transform_rows(
                    page_rows,
                    config.get("transform", {}),
                    org_slug,
                    context
                )

                buffer.extend(transformed_rows)

                # Flush when buffer reaches batch size
                while len(buffer) >= batch_size:
                    batch = buffer[:batch_size]
                    buffer = buffer[batch_size:]

                    result = await self._flush_to_bq(
                        bq_client.client,
                        table_id,
                        batch,
                        org_slug,
                        key_fields,
                        context
                    )

                    if result.success:
                        total_rows += result.rows_inserted
                        total_batches += 1
                    else:
                        self.logger.error(f"Batch insert failed: {result.error}")
                        # Continue processing - partial data is better than none

            # Flush remaining buffer
            if buffer:
                result = await self._flush_to_bq(
                    bq_client.client,
                    table_id,
                    buffer,
                    org_slug,
                    key_fields,
                    context
                )
                if result.success:
                    total_rows += result.rows_inserted
                    total_batches += 1

            elapsed_seconds = time.time() - start_time

            self.logger.info(
                f"API extraction completed",
                extra={
                    "org_slug": org_slug,
                    "rows_extracted": total_rows,
                    "batches": total_batches,
                    "elapsed_seconds": round(elapsed_seconds, 2),
                    "destination": table_id
                }
            )

            return {
                "status": "SUCCESS",
                "rows_extracted": total_rows,
                "batches_inserted": total_batches,
                "destination_table": table_id,
                "elapsed_seconds": round(elapsed_seconds, 2)
            }

        except Exception as e:
            self.logger.error(f"API extraction failed: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": str(e),
                "elapsed_seconds": round(time.time() - start_time, 2)
            }

    async def _setup_auth(
        self,
        config: Dict[str, Any],
        context: Dict[str, Any],
        org_slug: str
    ) -> tuple[Dict[str, str], Dict[str, str]]:
        """
        Setup authentication headers and params.

        Supports:
        - bearer: Authorization: Bearer {token}
        - header: Custom header with API key
        - query: API key as query parameter
        - basic: Basic authentication
        - oauth2: OAuth2 with token refresh (future)

        Credential Resolution:
        1. Check context["secrets"][provider] (from previous KMS decrypt step)
        2. Query org_integration_credentials and decrypt via KMS
        3. Use direct secret_key if provided

        Returns:
            Tuple of (headers_dict, params_dict)
        """
        headers = {}
        params = {}

        auth_config = config.get("auth", {})
        if not auth_config:
            return headers, params

        auth_type = auth_config.get("type", "bearer")

        # Resolve credential
        credential = await self._resolve_credential(auth_config, context, org_slug)

        if not credential:
            raise ValueError(f"Failed to resolve credential for auth type: {auth_type}")

        # Apply authentication based on type
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {credential}"

        elif auth_type == "header":
            header_name = auth_config.get("header_name", "X-API-Key")
            headers[header_name] = credential

        elif auth_type == "query":
            param_name = auth_config.get("param_name", "api_key")
            params[param_name] = credential

        elif auth_type == "basic":
            import base64
            # Credential expected as "username:password" or just API key
            if ":" not in credential:
                # API key as username, empty password
                credential = f"{credential}:"
            encoded = base64.b64encode(credential.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"

        elif auth_type == "oauth2":
            # For OAuth2, credential should be the access token
            # Token refresh logic would go here
            headers["Authorization"] = f"Bearer {credential}"

        else:
            raise ValueError(f"Unsupported auth type: {auth_type}")

        return headers, params

    async def _resolve_credential(
        self,
        auth_config: Dict[str, Any],
        context: Dict[str, Any],
        org_slug: str
    ) -> Optional[str]:
        """
        Resolve credential from multiple sources.

        Priority:
        1. context["secrets"][provider] - from previous KMS decrypt step
        2. Direct query to org_integration_credentials with KMS decryption
        3. context["secrets"][secret_key] - direct key reference
        """
        provider = auth_config.get("provider", "").upper()
        secret_key = auth_config.get("secret_key")

        # 1. Check if already decrypted in context (from prior kms_decrypt step)
        secrets = context.get("secrets", {})

        if provider:
            # Check various possible context keys
            for key in [provider.lower(), f"{provider.lower()}_api_key", f"{provider.lower()}_credential"]:
                if key in secrets:
                    credential = secrets[key]
                    # If it's a JSON string, try to extract api_key
                    if isinstance(credential, str) and credential.startswith("{"):
                        try:
                            cred_data = json.loads(credential)
                            return cred_data.get("api_key", credential)
                        except json.JSONDecodeError:
                            return credential
                    return credential

        if secret_key and secret_key in secrets:
            return secrets[secret_key]

        # 2. Query org_integration_credentials directly
        if provider:
            credential = await self._fetch_credential_from_bq(org_slug, provider)
            if credential:
                return credential

        # 3. Try secret_key as provider
        if secret_key:
            credential = await self._fetch_credential_from_bq(org_slug, secret_key.upper())
            if credential:
                return credential

        return None

    async def _fetch_credential_from_bq(
        self,
        org_slug: str,
        provider: str
    ) -> Optional[str]:
        """
        Fetch and decrypt credential from org_integration_credentials.

        Args:
            org_slug: Organization identifier
            provider: Provider name (e.g., "OPENAI", "VENDOR_API")

        Returns:
            Decrypted credential string or None
        """
        try:
            bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

            query = f"""
            SELECT encrypted_credential
            FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug
                AND provider = @provider
                AND is_active = TRUE
                AND validation_status = 'VALID'
            ORDER BY created_at DESC
            LIMIT 1
            """

            results = list(bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("provider", "STRING", provider),
                    ]
                )
            ).result())

            if not results:
                self.logger.warning(f"No credential found for {org_slug}/{provider}")
                return None

            encrypted_credential = results[0]["encrypted_credential"]

            # Decrypt using KMS
            decrypted = decrypt_value(encrypted_credential)

            # Try to extract api_key from JSON
            if decrypted.startswith("{"):
                try:
                    cred_data = json.loads(decrypted)
                    return cred_data.get("api_key", decrypted)
                except json.JSONDecodeError:
                    pass

            return decrypted

        except Exception as e:
            self.logger.error(f"Failed to fetch credential: {e}", exc_info=True)
            return None

    async def _fetch_pages(
        self,
        config: Dict[str, Any],
        headers: Dict[str, str],
        params: Dict[str, str],
        context: Dict[str, Any]
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Generator that fetches and yields pages of data.

        Supports pagination types:
        - cursor: Uses cursor token from response
        - offset: Uses offset parameter (offset = page * limit)
        - page: Uses page number parameter
        - link: Uses next URL from response (Link header or body)
        - none: Single request, no pagination

        Yields:
            List of records from each page
        """
        url = config["url"]
        method = config.get("method", "GET")
        pagination = config.get("pagination", {})
        pagination_type = pagination.get("type", "none")
        data_path = config.get("data_path", "data")
        rate_limit = config.get("rate_limit", {})

        # Rate limiting setup
        rps = rate_limit.get("requests_per_second", 10)
        min_delay = 1.0 / rps if rps > 0 else 0
        retry_on_429 = rate_limit.get("retry_on_429", True)
        max_retries = rate_limit.get("max_retries", DEFAULT_MAX_RETRIES)

        # Pagination setup
        limit = pagination.get("limit", 100)
        limit_param = pagination.get("limit_param", "limit")
        cursor_param = pagination.get("param", "cursor")
        response_path = pagination.get("response_path", "meta.next_cursor")

        # State
        cursor = None
        page_number = 1
        offset = 0
        next_url = url
        has_more = True
        last_request_time = 0

        async with httpx.AsyncClient(timeout=config.get("timeout", DEFAULT_TIMEOUT_SECONDS)) as client:
            while has_more:
                # Rate limiting
                elapsed = time.time() - last_request_time
                if elapsed < min_delay:
                    await asyncio.sleep(min_delay - elapsed)

                # Build request params
                current_params = params.copy()

                if pagination_type != "none":
                    current_params[limit_param] = limit

                if pagination_type == "cursor" and cursor:
                    current_params[cursor_param] = cursor
                elif pagination_type == "page":
                    current_params[cursor_param] = page_number
                elif pagination_type == "offset":
                    current_params[cursor_param] = offset

                # Determine URL (for link pagination, next_url may change)
                request_url = next_url if pagination_type == "link" and next_url != url else url

                self.logger.debug(
                    f"Fetching page",
                    extra={
                        "url": request_url,
                        "page": page_number,
                        "cursor": cursor,
                        "offset": offset
                    }
                )

                # Make request with retry
                response = await self._make_request_with_retry(
                    client,
                    method,
                    request_url,
                    headers,
                    current_params if pagination_type != "link" or page_number == 1 else {},
                    retry_on_429,
                    max_retries
                )

                last_request_time = time.time()

                if response.status_code != 200:
                    raise RuntimeError(
                        f"API Error {response.status_code}: {response.text[:500]}"
                    )

                data = response.json()

                # Extract rows
                rows = get_nested_value(data, data_path, [])
                if not isinstance(rows, list):
                    rows = [rows] if rows else []

                if rows:
                    yield rows

                # Handle pagination
                if pagination_type == "none":
                    has_more = False

                elif pagination_type == "cursor":
                    cursor = get_nested_value(data, response_path)
                    has_more = bool(cursor)
                    page_number += 1

                elif pagination_type == "page":
                    # Check if we got a full page
                    has_more = len(rows) >= limit
                    page_number += 1

                elif pagination_type == "offset":
                    has_more = len(rows) >= limit
                    offset += limit
                    page_number += 1

                elif pagination_type == "link":
                    # Check for next URL in response body or Link header
                    next_url = get_nested_value(data, response_path)
                    if not next_url:
                        # Try Link header
                        link_header = response.headers.get("Link", "")
                        if 'rel="next"' in link_header:
                            # Parse Link header
                            for part in link_header.split(","):
                                if 'rel="next"' in part:
                                    next_url = part.split(";")[0].strip("<> ")
                                    break
                    has_more = bool(next_url)
                    page_number += 1

                else:
                    has_more = False

                # Safety: prevent infinite loops
                if page_number > 9900:  # Warn at 99% of limit
                    self.logger.warning(f"Approaching pagination limit: {page_number}/10000 pages")
                if page_number > 10000:
                    self.logger.error("Pagination limit reached (10000 pages) - data may be truncated")
                    has_more = False

    async def _make_request_with_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        headers: Dict[str, str],
        params: Dict[str, str],
        retry_on_429: bool,
        max_retries: int
    ) -> httpx.Response:
        """
        Make HTTP request with retry logic for rate limits and transient errors.
        """
        attempt = 0
        last_exception = None

        while attempt <= max_retries:
            try:
                response = await client.request(
                    method,
                    url,
                    headers=headers,
                    params=params
                )

                # Success or non-retryable error
                if response.status_code not in RETRYABLE_STATUS_CODES:
                    return response

                # Rate limited
                if response.status_code == 429:
                    if not retry_on_429 or attempt >= max_retries:
                        return response

                    # Get retry-after header or use exponential backoff
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            delay = int(retry_after)
                        except ValueError:
                            delay = 2 ** attempt
                    else:
                        delay = 2 ** attempt

                    self.logger.warning(
                        f"Rate limited, retrying in {delay}s",
                        extra={"attempt": attempt, "url": url}
                    )
                    await asyncio.sleep(delay)
                    attempt += 1
                    continue

                # Server error - retry with backoff
                if response.status_code in {500, 502, 503, 504}:
                    if attempt >= max_retries:
                        return response

                    delay = 2 ** attempt
                    self.logger.warning(
                        f"Server error {response.status_code}, retrying in {delay}s",
                        extra={"attempt": attempt, "url": url}
                    )
                    await asyncio.sleep(delay)
                    attempt += 1
                    continue

                return response

            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                last_exception = e
                if attempt >= max_retries:
                    raise

                delay = 2 ** attempt
                self.logger.warning(
                    f"Connection error, retrying in {delay}s: {e}",
                    extra={"attempt": attempt, "url": url}
                )
                await asyncio.sleep(delay)
                attempt += 1

        if last_exception:
            raise last_exception
        raise RuntimeError("Max retries exceeded")

    def _transform_rows(
        self,
        rows: List[Dict[str, Any]],
        transform_config: Dict[str, Any],
        org_slug: str,
        context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Transform rows before inserting to BigQuery.

        Options:
        - add_fields: Add static or variable fields to each row
        - flatten: Store as flattened fields or wrap in raw_data JSON

        Default behavior: Wrap each row in standard format:
        {
            "org_slug": "...",
            "raw_data": "{...json...}",
            "extracted_at": "2024-01-01T00:00:00Z"
        }
        """
        flatten = transform_config.get("flatten", False)
        add_fields = transform_config.get("add_fields", {})

        # Resolve variables in add_fields
        resolved_fields = {}
        for key, value in add_fields.items():
            if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
                var_name = value[1:-1]
                if var_name == "org_slug":
                    resolved_fields[key] = org_slug
                elif var_name == "now":
                    resolved_fields[key] = datetime.now(timezone.utc).isoformat()
                elif var_name in context:
                    resolved_fields[key] = context[var_name]
                else:
                    resolved_fields[key] = value
            else:
                resolved_fields[key] = value

        result = []
        now = datetime.now(timezone.utc).isoformat()

        for row in rows:
            if flatten:
                # Flatten: merge row with additional fields
                transformed = {**row, **resolved_fields}
                transformed["org_slug"] = org_slug
                transformed["extracted_at"] = now
            else:
                # Default: wrap in standard raw format (ELT pattern)
                transformed = {
                    "org_slug": org_slug,
                    "raw_data": json.dumps(row, default=str),
                    "extracted_at": now,
                    **resolved_fields
                }

            result.append(transformed)

        return result

    async def _flush_to_bq(
        self,
        bq_client: bigquery.Client,
        table_id: str,
        rows: List[Dict[str, Any]],
        org_slug: str,
        key_fields: Optional[List[str]],
        context: Dict[str, Any]
    ) -> InsertResult:
        """
        Flush rows to BigQuery using smart insert.

        Uses insert_rows_smart which:
        - Streaming insert for <100 rows (with idempotent insertId)
        - Batch load for >=100 rows (more efficient)
        """
        pipeline_context = {
            "pipeline_id": context.get("pipeline_id"),
            "step_id": context.get("step_id")
        }

        return await insert_rows_smart(
            bq_client=bq_client,
            table_id=table_id,
            rows=rows,
            org_slug=org_slug,
            key_fields=key_fields,
            write_disposition="WRITE_APPEND",
            pipeline_context=pipeline_context
        )


# ============================================
# Factory Functions
# ============================================

def get_engine():
    """Factory function for pipeline executor."""
    return ApiExtractorProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = ApiExtractorProcessor()
    return await processor.execute(step_config, context)
