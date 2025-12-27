"""
AWS Bedrock Provider Adapter

Extracts usage data from AWS Bedrock for PAYG and Provisioned Throughput billing.

STUB IMPLEMENTATION STATUS:
---------------------------
This adapter is a STUB that returns empty data. To enable actual data extraction:

1. Install required dependencies:
   pip install boto3

2. Implement CloudWatch metrics extraction in extract_payg_usage():
   - AWS/Bedrock.InvocationCount
   - AWS/Bedrock.InputTokenCount
   - AWS/Bedrock.OutputTokenCount

3. Implement Provisioned Throughput extraction in extract_commitment_usage():
   - bedrock.list_provisioned_model_throughputs()
   - CloudWatch utilization metrics

Documentation:
- https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-cw.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/prov-thru-quotas.html
"""

from typing import Dict, Any, List
from datetime import date, datetime, timedelta
import logging

from .base_adapter import BaseGenAIAdapter


class AWSBedrockAdapter(BaseGenAIAdapter):
    """
    Adapter for AWS Bedrock API usage extraction.

    Supports:
    - PAYG: Yes (token-based billing via CloudWatch)
    - Commitment: Yes (Provisioned Throughput)
    - Infrastructure: No (use aws_gpu for SageMaker GPU)
    """

    @property
    def provider_name(self) -> str:
        return "aws_bedrock"

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
        Extract PAYG usage from AWS Bedrock via CloudWatch.

        Uses CloudWatch metrics for invocation counts and token usage.
        """
        access_key = self.credentials.get("aws_access_key_id")
        secret_key = self.credentials.get("aws_secret_access_key")
        region = self.credentials.get("region", "us-east-1")
        credential_id = self.credentials.get("credential_id", "default")

        if not all([access_key, secret_key]):
            self.logger.error("Missing AWS credentials")
            return []

        # MEDIUM #16: Return empty with warning instead of raising NotImplementedError
        # This adapter requires boto3 and AWS CloudWatch integration
        # See module docstring for implementation steps
        self.logger.warning(
            f"AWS Bedrock PAYG: STUB IMPLEMENTATION - No data extraction. "
            f"Requested period: {start_date} to {end_date}. "
            f"Required: boto3, CloudWatch metrics extraction (InvocationCount, InputTokenCount, OutputTokenCount). "
            f"See: https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-cw.html"
        )
        return []

    async def extract_commitment_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract Provisioned Throughput usage from AWS Bedrock.

        Provisioned Throughput is billed based on model units committed.
        """
        access_key = self.credentials.get("aws_access_key_id")
        secret_key = self.credentials.get("aws_secret_access_key")
        region = self.credentials.get("region", "us-east-1")
        credential_id = self.credentials.get("credential_id", "default")

        if not all([access_key, secret_key]):
            self.logger.error("Missing AWS credentials")
            return []

        # MEDIUM #16: Return empty with warning instead of raising NotImplementedError
        # This adapter requires boto3 and AWS CloudWatch integration
        # See module docstring for implementation steps
        self.logger.warning(
            f"AWS Bedrock Provisioned Throughput: STUB IMPLEMENTATION - No data extraction. "
            f"Requested period: {start_date} to {end_date}. "
            f"Required: boto3, bedrock.list_provisioned_model_throughputs(), CloudWatch utilization metrics. "
            f"See: https://docs.aws.amazon.com/bedrock/latest/userguide/prov-thru-quotas.html"
        )
        return []

    async def validate_credentials(self) -> bool:
        """
        Validate AWS credentials for Bedrock access.

        STUB: Returns False since actual validation is not implemented.
        When boto3 is installed, should use bedrock.list_foundation_models()
        which is a free, read-only operation that validates authentication
        without consuming API credits.

        SECURITY: Never return True without actual validation.
        """
        access_key = self.credentials.get("aws_access_key_id")
        secret_key = self.credentials.get("aws_secret_access_key")

        if not access_key or not secret_key:
            self.logger.error("AWS Bedrock: Missing credentials (access_key or secret_key)")
            return False

        # SECURITY: STUB implementation must return False with clear error
        # Returning True without actual validation could mask credential issues
        self.logger.error(
            "AWS Bedrock: Credential validation NOT IMPLEMENTED. "
            "Install boto3 and implement bedrock.list_foundation_models() for validation. "
            "Returning False for security."
        )
        return False
