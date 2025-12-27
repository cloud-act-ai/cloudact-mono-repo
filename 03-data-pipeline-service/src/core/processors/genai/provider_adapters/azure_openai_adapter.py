"""
Azure OpenAI Provider Adapter

Extracts usage data from Azure OpenAI for PAYG and PTU billing.

STUB IMPLEMENTATION STATUS:
---------------------------
This adapter is a STUB that returns empty data. To enable actual data extraction:

1. Install required dependencies:
   pip install azure-mgmt-consumption azure-mgmt-resource azure-identity

2. Implement Cost Management API extraction in extract_payg_usage():
   - ProcessedPromptTokens metric
   - GeneratedTokens metric
   - Azure Cost Management consumption API

3. Implement PTU deployment extraction in extract_commitment_usage():
   - List PTU deployments via ARM API
   - Query ProvisionedCapacity and ActiveCapacity metrics

Documentation:
- https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/manage-costs
- https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/provisioned-throughput
- https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/monitoring
"""

import httpx
from typing import Dict, Any, List
from datetime import date, datetime, timedelta
import logging

from .base_adapter import BaseGenAIAdapter


class AzureOpenAIAdapter(BaseGenAIAdapter):
    """
    Adapter for Azure OpenAI API usage extraction.

    Supports:
    - PAYG: Yes (token-based billing via Azure Monitor)
    - Commitment: Yes (PTU - Provisioned Throughput Units)
    - Infrastructure: No
    """

    @property
    def provider_name(self) -> str:
        return "azure_openai"

    @property
    def supports_commitment(self) -> bool:
        return True

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
        Extract PAYG usage from Azure OpenAI via Azure Monitor.

        Uses Azure Monitor metrics API to get token consumption.
        """
        endpoint = self.credentials.get("endpoint")
        api_key = self.credentials.get("api_key")
        subscription_id = self.credentials.get("subscription_id")
        resource_group = self.credentials.get("resource_group")
        account_name = self.credentials.get("account_name")
        credential_id = self.credentials.get("credential_id", "default")

        if not all([endpoint, api_key]):
            self.logger.error("Missing required Azure OpenAI credentials")
            return []

        # MEDIUM #16: Return empty with warning instead of raising NotImplementedError
        # This adapter requires azure-mgmt-consumption and Azure Monitor integration
        # See module docstring for implementation steps
        self.logger.warning(
            f"Azure OpenAI PAYG: STUB IMPLEMENTATION - No data extraction. "
            f"Requested period: {start_date} to {end_date}. Endpoint: {endpoint}. "
            f"Required: azure-mgmt-consumption, Azure Monitor metrics (ProcessedPromptTokens, GeneratedTokens). "
            f"See: https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/manage-costs"
        )
        return []

    async def extract_commitment_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract PTU (Provisioned Throughput Unit) usage from Azure.

        PTU deployments have fixed capacity that's billed hourly.
        """
        endpoint = self.credentials.get("endpoint")
        subscription_id = self.credentials.get("subscription_id")
        resource_group = self.credentials.get("resource_group")
        credential_id = self.credentials.get("credential_id", "default")

        if not subscription_id:
            self.logger.error("subscription_id required for PTU usage extraction")
            return []

        # MEDIUM #16: Return empty with warning instead of raising NotImplementedError
        # This adapter requires azure-mgmt-resource and Azure Resource Manager integration
        # See module docstring for implementation steps
        self.logger.warning(
            f"Azure OpenAI PTU: STUB IMPLEMENTATION - No data extraction. "
            f"Requested period: {start_date} to {end_date}. "
            f"Required: azure-mgmt-resource, ARM API for PTU deployments, Azure Monitor (ProvisionedCapacity, ActiveCapacity). "
            f"See: https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/provisioned-throughput"
        )
        return []

    async def validate_credentials(self) -> bool:
        """
        Validate Azure OpenAI credentials using free endpoint.

        Uses the /openai/deployments endpoint which lists deployments without
        consuming API credits. This is a read-only operation that only
        validates authentication.

        SECURITY: Uses _get_http_client() for proper connection management.
        """
        endpoint = self.credentials.get("endpoint")
        api_key = self.credentials.get("api_key")

        if not endpoint or not api_key:
            return False

        try:
            # SECURITY: Use base class HTTP client for proper lifecycle management
            async with self._get_http_client() as client:
                # Use /deployments endpoint - free, read-only, validates auth
                response = await self._make_request_with_retry(
                    client, "GET",
                    f"{endpoint.rstrip('/')}/openai/deployments",
                    headers={"api-key": api_key},
                    params={"api-version": "2024-02-01"}
                )
                return response.status_code == 200
        except Exception as e:
            # Log only exception type to avoid leaking sensitive data in error messages
            self.logger.error(f"Azure OpenAI credential validation failed: {type(e).__name__}")
            return False
