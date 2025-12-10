"""
GCP API Extractor Processor

Extracts data from any GCP REST API using Service Account authentication.
Uses GCPAuthenticator from the same folder for credential management.

ps_type: gcp.api_extractor

ELT Pattern: Extract from GCP API → Load to BigQuery (raw) → Transform via SQL

Architecture:
- Uses GCPAuthenticator for OAuth2 Service Account credentials
- GCP pagination: nextPageToken pattern (standard across GCP APIs)
- Streaming batch insert to BigQuery
- Auto token refresh on 401

Supports:
- All GCP REST APIs (Billing, Compute, Monitoring, IAM, etc.)
- GCP pagination (nextPageToken pattern)
- Rate limiting with exponential backoff
- Streaming batch insert to BigQuery
"""

import logging
import json
import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, AsyncGenerator
import httpx

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient
from src.core.utils.bq_helpers import insert_rows_smart, InsertResult
from .authenticator import GCPAuthenticator


# ============================================
# Constants
# ============================================

DEFAULT_BATCH_SIZE = 1000
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 100

# GCP API base URLs for common services
GCP_API_HOSTS = {
    "billing": "cloudbilling.googleapis.com",
    "compute": "compute.googleapis.com",
    "storage": "storage.googleapis.com",
    "monitoring": "monitoring.googleapis.com",
    "iam": "iam.googleapis.com",
    "cloudresourcemanager": "cloudresourcemanager.googleapis.com",
    "bigquery": "bigquery.googleapis.com",
}


# ============================================
# Helper Functions
# ============================================

def get_nested_value(data: Dict[str, Any], path: str, default: Any = None) -> Any:
    """
    Get a nested value from a dictionary using dot notation.

    Args:
        data: Dictionary to search
        path: Dot-separated path (e.g., "meta.pagination.nextPageToken")
        default: Default value if path not found

    Returns:
        Value at path or default
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


# ============================================
# GCP API Extractor Processor
# ============================================

class GcpApiExtractorProcessor:
    """
    GCP-specific API extractor using Service Account OAuth2.

    Uses GCPAuthenticator from the same folder for credential management.
    Supports all GCP REST APIs with nextPageToken pagination.

    Configuration Example (YAML):
    ```yaml
    - step: "extract_billing_accounts"
      processor: "gcp.api_extractor"
      config:
        # Option 1: API + endpoint shorthand
        api: "cloudbilling.googleapis.com"
        endpoint: "/v1/billingAccounts"

        # Option 2: Full URL
        # url: "https://cloudbilling.googleapis.com/v1/billingAccounts"

        method: "GET"  # GET, POST, etc.

        pagination:
          page_size: 100              # Items per page
          page_size_param: "pageSize" # Query param name (default: pageSize)
          token_param: "pageToken"    # Query param for token (default: pageToken)
          response_path: "nextPageToken"  # JSON path to next token

        data_path: "billingAccounts"  # JSON path to array of records

        params:                       # Additional query parameters
          filter: "{filter_expression}"

        destination:
          table: "gcp_billing_accounts_raw"
          batch_size: 1000
          key_fields:                 # For idempotent inserts
            - "name"

        rate_limit:
          requests_per_second: 10
          max_retries: 3

        transform:
          flatten: false              # Store as raw JSON (ELT pattern)
    ```
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        self.auth: Optional[GCPAuthenticator] = None

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute GCP API extraction.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context with org_slug, variables

        Returns:
            Dict with status, rows_extracted, destination_table, etc.
        """
        start_time = time.time()
        org_slug = context.get("org_slug")

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required in context"}

        config = step_config.get("config", {})

        # Validate required config
        if not config.get("url") and not (config.get("api") and config.get("endpoint")):
            return {"status": "FAILED", "error": "url OR (api + endpoint) is required"}

        if not config.get("destination", {}).get("table"):
            return {"status": "FAILED", "error": "destination.table is required"}

        # Initialize GCP authenticator
        self.auth = GCPAuthenticator(org_slug)

        # Build URL
        url = self._build_url(config, context)

        self.logger.info(
            f"Starting GCP API extraction",
            extra={
                "org_slug": org_slug,
                "url": url,
                "destination": config["destination"]["table"]
            }
        )

        try:
            # Get access token
            access_token = await self.auth.get_access_token()

            # Build headers
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }

            # Resolve params with variables
            params = self._resolve_params(config.get("params", {}), context)

            # Setup BigQuery client and destination
            bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)
            dataset_id = self.settings.get_org_dataset_name(org_slug)
            destination = config.get("destination", {})
            table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{destination['table']}"
            batch_size = destination.get("batch_size", DEFAULT_BATCH_SIZE)
            key_fields = destination.get("key_fields")

            # Extract and load
            total_rows = 0
            total_batches = 0
            buffer = []

            async for page_rows in self._fetch_gcp_pages(url, headers, params, config):
                # Transform rows
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
                f"GCP API extraction completed",
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
                "gcp_project_id": self.auth.project_id,
                "elapsed_seconds": round(elapsed_seconds, 2)
            }

        except Exception as e:
            self.logger.error(f"GCP API extraction failed: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": str(e),
                "elapsed_seconds": round(time.time() - start_time, 2)
            }

    def _build_url(self, config: Dict[str, Any], context: Dict[str, Any]) -> str:
        """
        Build GCP API URL from config.

        Supports:
        - Full URL: config.url
        - Shorthand: config.api + config.endpoint
        - Variable substitution: {project_id}, {gcp_project_id}
        """
        if config.get("url"):
            url = config["url"]
        else:
            api = config["api"]
            endpoint = config["endpoint"]

            # Support shorthand API names
            if api in GCP_API_HOSTS:
                api = GCP_API_HOSTS[api]

            url = f"https://{api}{endpoint}"

        # Replace variables
        url = self._replace_variables(url, context)

        return url

    def _replace_variables(self, text: str, context: Dict[str, Any]) -> str:
        """Replace {variable} placeholders with context values."""
        import re

        def replacer(match):
            var_name = match.group(1)

            # Special handling for GCP project ID from authenticator
            if var_name in ("project_id", "gcp_project_id") and self.auth and self.auth.project_id:
                return self.auth.project_id

            if var_name in context:
                return str(context[var_name])

            return match.group(0)  # Keep original if not found

        return re.sub(r'\{(\w+)\}', replacer, text)

    def _resolve_params(
        self,
        params: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Resolve variables in query parameters."""
        resolved = {}

        for key, value in params.items():
            if isinstance(value, str):
                resolved[key] = self._replace_variables(value, context)
            else:
                resolved[key] = value

        return resolved

    async def _fetch_gcp_pages(
        self,
        url: str,
        headers: Dict[str, str],
        params: Dict[str, str],
        config: Dict[str, Any]
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Generator that fetches and yields pages of data using GCP pagination.

        GCP APIs use nextPageToken pattern:
        - Request: GET /v1/resource?pageSize=100&pageToken=xxx
        - Response: {"items": [...], "nextPageToken": "yyy"}

        Yields:
            List of records from each page
        """
        pagination = config.get("pagination", {})
        method = config.get("method", "GET")
        data_path = config.get("data_path", "items")
        rate_limit = config.get("rate_limit", {})

        # Pagination config
        page_size = pagination.get("page_size", DEFAULT_PAGE_SIZE)
        page_size_param = pagination.get("page_size_param", "pageSize")
        token_param = pagination.get("token_param", "pageToken")
        response_path = pagination.get("response_path", "nextPageToken")

        # Rate limiting
        rps = rate_limit.get("requests_per_second", 10)
        min_delay = 1.0 / rps if rps > 0 else 0
        max_retries = rate_limit.get("max_retries", DEFAULT_MAX_RETRIES)

        # State
        page_token = None
        page_number = 1
        last_request_time = 0

        async with httpx.AsyncClient(timeout=config.get("timeout", DEFAULT_TIMEOUT_SECONDS)) as client:
            while True:
                # Rate limiting
                elapsed = time.time() - last_request_time
                if elapsed < min_delay and last_request_time > 0:
                    await asyncio.sleep(min_delay - elapsed)

                # Build request params
                current_params = params.copy()
                current_params[page_size_param] = page_size

                if page_token:
                    current_params[token_param] = page_token

                self.logger.debug(
                    f"Fetching GCP API page {page_number}",
                    extra={"url": url, "page": page_number, "has_token": bool(page_token)}
                )

                # Make request with retry
                response = await self._make_request_with_retry(
                    client,
                    method,
                    url,
                    headers,
                    current_params,
                    max_retries
                )

                last_request_time = time.time()

                if response.status_code == 401:
                    # Token expired - refresh and retry
                    self.logger.info("GCP token expired, refreshing...")
                    access_token = await self.auth.get_access_token()
                    headers["Authorization"] = f"Bearer {access_token}"
                    continue

                if response.status_code != 200:
                    raise Exception(
                        f"GCP API Error {response.status_code}: {response.text[:500]}"
                    )

                data = response.json()

                # Extract rows
                rows = get_nested_value(data, data_path, [])
                if not isinstance(rows, list):
                    # Some GCP APIs return dict with nested arrays (e.g., compute aggregated)
                    if isinstance(rows, dict):
                        # Flatten aggregated responses
                        flattened = []
                        for key, value in rows.items():
                            if isinstance(value, dict) and "instances" in value:
                                for item in value.get("instances", []):
                                    item["_zone"] = key
                                    flattened.append(item)
                            elif isinstance(value, list):
                                flattened.extend(value)
                        rows = flattened
                    else:
                        rows = [rows] if rows else []

                if rows:
                    yield rows

                # Check for next page
                page_token = get_nested_value(data, response_path)
                if not page_token:
                    break

                page_number += 1

                # Safety: prevent infinite loops
                if page_number > 10000:
                    self.logger.warning("GCP pagination limit reached (10000 pages)")
                    break

    async def _make_request_with_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        headers: Dict[str, str],
        params: Dict[str, str],
        max_retries: int
    ) -> httpx.Response:
        """
        Make HTTP request with retry logic for transient errors.
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
                if response.status_code not in {429, 500, 502, 503, 504}:
                    return response

                # Rate limited (429) or server error
                if attempt >= max_retries:
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
                    f"GCP API error {response.status_code}, retrying in {delay}s",
                    extra={"attempt": attempt, "url": url}
                )
                await asyncio.sleep(delay)
                attempt += 1

            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                last_exception = e
                if attempt >= max_retries:
                    raise

                delay = 2 ** attempt
                self.logger.warning(
                    f"GCP API connection error, retrying in {delay}s: {e}",
                    extra={"attempt": attempt, "url": url}
                )
                await asyncio.sleep(delay)
                attempt += 1

        if last_exception:
            raise last_exception
        raise Exception("Max retries exceeded")

    def _transform_rows(
        self,
        rows: List[Dict[str, Any]],
        transform_config: Dict[str, Any],
        org_slug: str,
        context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Transform rows before inserting to BigQuery.

        Default behavior (ELT): Wrap each row in standard format:
        {
            "org_slug": "...",
            "raw_data": "{...json...}",
            "extracted_at": "2024-01-01T00:00:00Z",
            "gcp_project_id": "..."
        }
        """
        flatten = transform_config.get("flatten", False)
        add_fields = transform_config.get("add_fields", {})

        result = []
        now = datetime.now(timezone.utc).isoformat()
        gcp_project_id = self.auth.project_id if self.auth else None

        for row in rows:
            if flatten:
                # Flatten: merge row with additional fields
                transformed = {**row, **add_fields}
                transformed["org_slug"] = org_slug
                transformed["extracted_at"] = now
                if gcp_project_id:
                    transformed["gcp_project_id"] = gcp_project_id
            else:
                # Default: wrap in standard raw format (ELT pattern)
                transformed = {
                    "org_slug": org_slug,
                    "raw_data": json.dumps(row, default=str),
                    "extracted_at": now,
                    **add_fields
                }
                if gcp_project_id:
                    transformed["gcp_project_id"] = gcp_project_id

            result.append(transformed)

        return result

    async def _flush_to_bq(
        self,
        bq_client,
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
    return GcpApiExtractorProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = GcpApiExtractorProcessor()
    return await processor.execute(step_config, context)
