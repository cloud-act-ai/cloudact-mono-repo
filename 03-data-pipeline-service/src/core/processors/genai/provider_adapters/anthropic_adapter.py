"""
Anthropic Provider Adapter

Extracts usage data from Anthropic API for PAYG billing.
"""

import httpx
from typing import Dict, Any, List, Optional, Union
from datetime import date, datetime, timedelta
import logging

from .base_adapter import BaseGenAIAdapter


class APIResponseValidationError(Exception):
    """Raised when API response validation fails."""
    pass


class AnthropicAdapter(BaseGenAIAdapter):
    """
    Adapter for Anthropic API usage extraction.

    Supports:
    - PAYG: Yes (token-based billing via Admin API)
    - Commitment: No
    - Infrastructure: No
    """

    BASE_URL = "https://api.anthropic.com/v1"
    ADMIN_URL = "https://api.anthropic.com/v1/admin"

    def _validate_response_structure(self, data: Any, context: str = "") -> Dict[str, Any]:
        """
        Validate that the API response is a dictionary with expected structure.

        Args:
            data: The response data to validate
            context: Description of what we're validating for error messages

        Returns:
            The validated data as a dictionary

        Raises:
            APIResponseValidationError: If validation fails
        """
        if data is None:
            raise APIResponseValidationError(f"Response is None {context}")

        if not isinstance(data, dict):
            raise APIResponseValidationError(
                f"Expected dict response, got {type(data).__name__} {context}"
            )

        return data

    def _safe_get_int(self, data: Dict[str, Any], key: str, default: int = 0) -> int:
        """
        Safely extract an integer value from a dictionary.

        Args:
            data: Dictionary to extract from
            key: Key to look up
            default: Default value if key missing or invalid type

        Returns:
            Integer value or default
        """
        try:
            value = data.get(key, default)
            if value is None:
                return default
            if isinstance(value, bool):
                return default
            if isinstance(value, (int, float)):
                return int(value)
            return default
        except (TypeError, ValueError):
            self.logger.warning(f"Invalid value for {key}: expected int, got {type(value).__name__}")
            return default

    def _safe_get_str(self, data: Dict[str, Any], key: str, default: str = "") -> str:
        """
        Safely extract a string value from a dictionary.

        Args:
            data: Dictionary to extract from
            key: Key to look up
            default: Default value if key missing or invalid type

        Returns:
            String value or default
        """
        try:
            value = data.get(key, default)
            if value is None:
                return default
            if isinstance(value, str):
                return value
            return str(value)
        except (TypeError, ValueError):
            return default

    def _safe_get_list(self, data: Dict[str, Any], key: str) -> List[Any]:
        """
        Safely extract a list value from a dictionary.

        Args:
            data: Dictionary to extract from
            key: Key to look up

        Returns:
            List value or empty list
        """
        try:
            value = data.get(key)
            if value is None:
                return []
            if isinstance(value, list):
                return value
            self.logger.warning(f"Expected list for {key}, got {type(value).__name__}")
            return []
        except (TypeError, AttributeError):
            return []

    def _safe_parse_date(self, date_str: Any) -> Optional[date]:
        """
        Safely parse a date string into a date object.

        Args:
            date_str: The date string to parse

        Returns:
            Parsed date or None if parsing fails
        """
        if not date_str:
            return None
        if not isinstance(date_str, str):
            self.logger.warning(f"Expected date string, got {type(date_str).__name__}")
            return None
        try:
            return datetime.fromisoformat(date_str).date()
        except (ValueError, TypeError) as e:
            self.logger.warning(f"Failed to parse date '{date_str}': {type(e).__name__}")
            return None

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def supports_commitment(self) -> bool:
        return False

    @property
    def supports_infrastructure(self) -> bool:
        return False

    async def extract_payg_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract usage from Anthropic Admin API.

        Anthropic provides usage data through their admin/usage endpoint.
        """
        api_key = self.credentials.get("api_key")
        workspace_id = self.credentials.get("workspace_id")
        credential_id = self.credentials.get("credential_id", "default")

        if not api_key:
            self.logger.error("No API key found in credentials")
            return []

        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }

        usage_records = []

        async with self._get_http_client() as client:
            try:
                # Anthropic usage endpoint
                url = f"{self.ADMIN_URL}/usage"
                params = {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat()
                }
                if workspace_id:
                    params["workspace_id"] = workspace_id

                response = await self._make_request_with_retry(
                    client, "GET", url, headers=headers, params=params
                )

                if response.status_code == 200:
                    try:
                        data = response.json()
                        validated_data = self._validate_response_structure(
                            data, f"for date range {start_date} to {end_date}"
                        )
                        usage_records = self._parse_usage_response(validated_data, credential_id)
                    except (ValueError, APIResponseValidationError) as e:
                        self.logger.error(
                            f"Failed to parse Anthropic response: {type(e).__name__}"
                        )
                    except Exception as e:
                        self.logger.error(
                            f"Unexpected error parsing Anthropic response: {type(e).__name__}"
                        )
                elif response.status_code == 401:
                    self.logger.error("Anthropic API authentication failed")
                else:
                    self.logger.warning(
                        f"Failed to fetch Anthropic usage: status={response.status_code}"
                    )

            except Exception as e:
                self.logger.error(f"Error fetching Anthropic usage: {type(e).__name__}")

        self.logger.info(f"Extracted {len(usage_records)} Anthropic usage records")
        return usage_records

    def _parse_usage_response(
        self,
        data: Dict[str, Any],
        credential_id: str
    ) -> List[Dict[str, Any]]:
        """
        Parse Anthropic usage response into standardized records.

        Handles malformed responses gracefully with type checking and validation.
        """
        records = []

        # Safely extract the data array
        usage_items = self._safe_get_list(data, "data")

        for usage_item in usage_items:
            try:
                # Validate each item is a dictionary
                if not isinstance(usage_item, dict):
                    self.logger.warning(
                        f"Skipping invalid usage item: expected dict, got {type(usage_item).__name__}"
                    )
                    continue

                # Safely parse the date
                usage_date_str = usage_item.get("date")
                usage_date = self._safe_parse_date(usage_date_str)
                if not usage_date:
                    self.logger.debug(f"Skipping usage item with missing or invalid date")
                    continue

                # Safely extract model identifier
                model = self._safe_get_str(usage_item, "model", "unknown")
                model_family = self._get_model_family(model)

                # Safely extract token counts with type validation
                input_tokens = self._safe_get_int(usage_item, "input_tokens", 0)
                output_tokens = self._safe_get_int(usage_item, "output_tokens", 0)
                cache_read_tokens = self._safe_get_int(usage_item, "cache_read_input_tokens", 0)
                cache_write_tokens = self._safe_get_int(usage_item, "cache_creation_input_tokens", 0)
                request_count = self._safe_get_int(usage_item, "request_count", 0)

                # Validate non-negative values
                input_tokens = max(0, input_tokens)
                output_tokens = max(0, output_tokens)
                cache_read_tokens = max(0, cache_read_tokens)
                cache_write_tokens = max(0, cache_write_tokens)
                request_count = max(0, request_count)

                if input_tokens > 0 or output_tokens > 0:
                    records.append({
                        "usage_date": usage_date,
                        "org_slug": self.org_slug,
                        "provider": self.provider_name,
                        "model": model,
                        "model_family": model_family,
                        "region": "global",
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "cached_input_tokens": cache_read_tokens + cache_write_tokens,
                        "total_tokens": input_tokens + output_tokens,
                        "request_count": request_count,
                        "credential_id": credential_id
                    })

            except Exception as e:
                self.logger.warning(
                    f"Error parsing usage item: {type(e).__name__}"
                )
                continue

        return records

    async def validate_credentials(self) -> bool:
        """
        Validate Anthropic API key using free endpoint.

        Uses the /models endpoint which lists available models without
        consuming API credits. This is a read-only operation that only
        validates authentication.
        """
        api_key = self.credentials.get("api_key")
        if not api_key:
            return False

        try:
            async with self._get_http_client() as client:
                # Use /models endpoint - free, read-only, validates auth
                response = await self._make_request_with_retry(
                    client, "GET",
                    f"{self.BASE_URL}/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01"
                    }
                )
                # 200 means valid credentials
                # 401 means invalid API key
                return response.status_code == 200
        except Exception as e:
            self.logger.error(f"Anthropic credential validation failed: {type(e).__name__}")
            return False
