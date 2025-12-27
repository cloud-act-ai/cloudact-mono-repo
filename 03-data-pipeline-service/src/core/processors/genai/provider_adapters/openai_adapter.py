"""
OpenAI Provider Adapter

Extracts usage data from OpenAI API for PAYG billing.
"""

import httpx
from typing import Dict, Any, List, Optional, Union
from datetime import date, datetime, timedelta
import logging

from .base_adapter import BaseGenAIAdapter


class APIResponseValidationError(Exception):
    """Raised when API response validation fails."""
    pass


class OpenAIAdapter(BaseGenAIAdapter):
    """
    Adapter for OpenAI API usage extraction.

    Supports:
    - PAYG: Yes (token-based billing via Usage API)
    - Commitment: No
    - Infrastructure: No
    """

    BASE_URL = "https://api.openai.com/v1"
    # SECURITY: Limit date range to prevent unbounded loops
    MAX_DATE_RANGE_DAYS = 90

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

    @property
    def provider_name(self) -> str:
        return "openai"

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
        Extract usage from OpenAI Usage API.

        OpenAI provides daily aggregated usage through their admin API.

        SECURITY: Date range is limited to MAX_DATE_RANGE_DAYS to prevent unbounded loops.
        """
        api_key = self.credentials.get("api_key")
        org_id = self.credentials.get("org_id")
        credential_id = self.credentials.get("credential_id", "default")

        if not api_key:
            self.logger.error("No API key found in credentials")
            return []

        # SECURITY: Validate date range to prevent unbounded loops
        date_range_days = (end_date - start_date).days
        if date_range_days > self.MAX_DATE_RANGE_DAYS:
            self.logger.error(
                f"Date range of {date_range_days} days exceeds maximum of {self.MAX_DATE_RANGE_DAYS} days"
            )
            raise ValueError(
                f"Date range exceeds maximum of {self.MAX_DATE_RANGE_DAYS} days. "
                f"Requested: {date_range_days} days ({start_date} to {end_date})"
            )

        if date_range_days < 0:
            self.logger.error(f"Invalid date range: start_date {start_date} is after end_date {end_date}")
            raise ValueError(f"start_date ({start_date}) cannot be after end_date ({end_date})")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        if org_id:
            headers["OpenAI-Organization"] = org_id

        usage_records = []

        async with self._get_http_client() as client:
            # Iterate through each day in the range
            current_date = start_date
            while current_date <= end_date:
                try:
                    # OpenAI Usage API endpoint
                    url = f"{self.BASE_URL}/usage"
                    params = {
                        "date": current_date.isoformat()
                    }

                    response = await self._make_request_with_retry(
                        client, "GET", url, headers=headers, params=params
                    )

                    if response.status_code == 200:
                        try:
                            data = response.json()
                            validated_data = self._validate_response_structure(
                                data, f"for date {current_date}"
                            )
                            daily_usage = self._parse_daily_usage(
                                validated_data, current_date, credential_id
                            )
                            usage_records.extend(daily_usage)
                        except (ValueError, APIResponseValidationError) as e:
                            self.logger.error(
                                f"Failed to parse OpenAI response for {current_date}: {type(e).__name__}"
                            )
                        except Exception as e:
                            self.logger.error(
                                f"Unexpected error parsing OpenAI response for {current_date}: {type(e).__name__}"
                            )
                    elif response.status_code == 404:
                        # No usage for this date
                        self.logger.debug(f"No usage data for {current_date}")
                    elif response.status_code == 401:
                        # Invalid credentials - don't retry
                        self.logger.error("OpenAI API authentication failed")
                        break
                    else:
                        self.logger.warning(
                            f"Failed to fetch OpenAI usage for {current_date}: "
                            f"status={response.status_code}"
                        )

                except Exception as e:
                    # Log error type but not potentially sensitive details
                    self.logger.error(f"Error fetching OpenAI usage for {current_date}: {type(e).__name__}")

                current_date += timedelta(days=1)

        self.logger.info(f"Extracted {len(usage_records)} OpenAI usage records")
        return usage_records

    def _parse_daily_usage(
        self,
        data: Dict[str, Any],
        usage_date: date,
        credential_id: str
    ) -> List[Dict[str, Any]]:
        """
        Parse OpenAI usage response into standardized records.

        Handles malformed responses gracefully with type checking and validation.
        """
        records = []

        # Safely extract the data array
        usage_items = self._safe_get_list(data, "data")

        # OpenAI returns usage grouped by model
        for model_usage in usage_items:
            try:
                # Validate each item is a dictionary
                if not isinstance(model_usage, dict):
                    self.logger.warning(
                        f"Skipping invalid usage item: expected dict, got {type(model_usage).__name__}"
                    )
                    continue

                # Safely extract model identifier with fallback chain
                model = self._safe_get_str(model_usage, "snapshot_id")
                if not model:
                    model = self._safe_get_str(model_usage, "model", "unknown")
                model_family = self._get_model_family(model)

                # Safely extract token counts with type validation
                input_tokens = self._safe_get_int(model_usage, "n_context_tokens_total", 0)
                output_tokens = self._safe_get_int(model_usage, "n_generated_tokens_total", 0)
                request_count = self._safe_get_int(model_usage, "n_requests", 0)

                # Validate non-negative values
                input_tokens = max(0, input_tokens)
                output_tokens = max(0, output_tokens)
                request_count = max(0, request_count)

                if input_tokens > 0 or output_tokens > 0:
                    records.append({
                        "usage_date": usage_date,
                        "org_slug": self.org_slug,
                        "provider": self.provider_name,
                        "model": model,
                        "model_family": model_family,
                        "region": "global",  # OpenAI doesn't provide region
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "cached_input_tokens": 0,  # OpenAI doesn't report cached tokens
                        "total_tokens": input_tokens + output_tokens,
                        "request_count": request_count,
                        "credential_id": credential_id
                    })

            except Exception as e:
                self.logger.warning(
                    f"Error parsing usage item for date {usage_date}: {type(e).__name__}"
                )
                continue

        return records

    async def validate_credentials(self) -> bool:
        """
        Validate OpenAI API key using free endpoint.

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
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                return response.status_code == 200
        except Exception as e:
            self.logger.error(f"OpenAI credential validation failed: {type(e).__name__}")
            return False
