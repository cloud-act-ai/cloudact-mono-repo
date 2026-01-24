"""
DeepSeek Provider Adapter

Extracts usage data from DeepSeek API for PAYG billing.
DeepSeek API is largely compatible with OpenAI API format.
"""

import httpx
from typing import Dict, Any, List
from datetime import date, datetime, timedelta
import logging

from .base_adapter import BaseGenAIAdapter


class APIResponseValidationError(Exception):
    """Raised when API response validation fails."""
    pass


class DeepSeekAdapter(BaseGenAIAdapter):
    """
    Adapter for DeepSeek API usage extraction.

    Supports:
    - PAYG: Yes (token-based billing)
    - Commitment: No
    - Infrastructure: No

    DeepSeek API uses OpenAI-compatible endpoints at https://api.deepseek.com
    """

    BASE_URL = "https://api.deepseek.com"
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
        return "deepseek"

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
        Extract usage from DeepSeek API.

        DeepSeek provides usage through their API similar to OpenAI.
        See: https://platform.deepseek.com/api-docs
        """
        api_key = self.credentials.get("api_key")
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

        usage_records = []

        async with self._get_http_client() as client:
            # Iterate through each day in the range
            current_date = start_date
            while current_date <= end_date:
                try:
                    # DeepSeek usage API endpoint (if available)
                    # Note: Check DeepSeek docs for actual usage endpoint
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
                            daily_usage = self._parse_daily_usage(validated_data, current_date, credential_id)
                            usage_records.extend(daily_usage)
                        except (ValueError, APIResponseValidationError) as e:
                            self.logger.error(
                                f"Failed to parse DeepSeek response for {current_date}: {type(e).__name__}"
                            )
                        except Exception as e:
                            self.logger.error(
                                f"Unexpected error parsing DeepSeek response for {current_date}: {type(e).__name__}"
                            )
                    elif response.status_code == 404:
                        # No usage for this date or endpoint not available
                        self.logger.debug(f"No usage data for {current_date}")
                    elif response.status_code == 401:
                        # Invalid credentials - don't retry
                        self.logger.error("DeepSeek API authentication failed")
                        break
                    else:
                        self.logger.warning(
                            f"Failed to fetch DeepSeek usage for {current_date}: "
                            f"status={response.status_code}"
                        )

                except Exception as e:
                    self.logger.error(f"Error fetching DeepSeek usage for {current_date}: {type(e).__name__}")

                current_date += timedelta(days=1)

        self.logger.info(f"Extracted {len(usage_records)} DeepSeek usage records")
        return usage_records

    def _parse_daily_usage(
        self,
        data: Dict[str, Any],
        usage_date: date,
        credential_id: str
    ) -> List[Dict[str, Any]]:
        """
        Parse DeepSeek usage response into standardized records.

        Handles malformed responses gracefully with type checking and validation.
        """
        records = []

        # Safely extract the data array
        usage_items = self._safe_get_list(data, "data")

        # DeepSeek returns usage grouped by model (similar to OpenAI)
        for model_usage in usage_items:
            try:
                # Validate each item is a dictionary
                if not isinstance(model_usage, dict):
                    self.logger.warning(
                        f"Skipping invalid usage item: expected dict, got {type(model_usage).__name__}"
                    )
                    continue

                # Safely extract model identifier
                model = self._safe_get_str(model_usage, "model", "deepseek-chat")
                model_family = self._get_model_family(model)

                # Safely extract token counts with fallback chain
                input_tokens = self._safe_get_int(model_usage, "input_tokens", 0)
                if input_tokens == 0:
                    input_tokens = self._safe_get_int(model_usage, "n_context_tokens_total", 0)

                output_tokens = self._safe_get_int(model_usage, "output_tokens", 0)
                if output_tokens == 0:
                    output_tokens = self._safe_get_int(model_usage, "n_generated_tokens_total", 0)

                cached_tokens = self._safe_get_int(model_usage, "cached_tokens", 0)

                request_count = self._safe_get_int(model_usage, "n_requests", 0)
                if request_count == 0:
                    request_count = self._safe_get_int(model_usage, "request_count", 0)

                # Validate non-negative values
                input_tokens = max(0, input_tokens)
                output_tokens = max(0, output_tokens)
                cached_tokens = max(0, cached_tokens)
                request_count = max(0, request_count)

                if input_tokens > 0 or output_tokens > 0:
                    records.append({
                        "usage_date": usage_date,
                        "x_org_slug": self.org_slug,
                        "provider": self.provider_name,
                        "model": model,
                        "model_family": model_family,
                        "region": "global",  # DeepSeek doesn't provide region info
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "cached_input_tokens": cached_tokens,
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

    def _get_model_family(self, model: str) -> str:
        """Determine the model family from the model name."""
        model_lower = model.lower()

        if "deepseek-v3" in model_lower or "deepseek-chat" in model_lower:
            return "deepseek-v3"
        elif "deepseek-coder" in model_lower:
            return "deepseek-coder"
        elif "deepseek-v2" in model_lower:
            return "deepseek-v2"
        elif "deepseek-reasoner" in model_lower:
            return "deepseek-reasoner"
        else:
            return "deepseek"

    async def validate_credentials(self) -> bool:
        """
        Validate DeepSeek API key using free endpoint.

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
            self.logger.error(f"DeepSeek credential validation failed: {type(e).__name__}")
            return False
