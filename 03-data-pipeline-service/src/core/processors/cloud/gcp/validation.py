"""
GCP Validation Processor

Pipeline processor that validates GCP Service Account credentials.
Uses GCPAuthenticator utility for actual validation logic.

Usage in pipeline:
    ps_type: gcp.validation
"""

import logging
from typing import Dict, Any

from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
from src.app.config import get_settings


class GCPValidationProcessor:
    """
    Processor for validating GCP Service Account integration credentials.

    Uses GCPAuthenticator utility class for credential decryption and validation.
    Updates validation_status in org_integration_credentials.
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
        Validate GCP Service Account.

        Args:
            step_config: Step configuration containing:
                - config.check_bigquery: Validate BigQuery access (default: True)
                - config.check_billing: Validate Billing API access (default: False)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - validation_status: VALID or INVALID
                - project_id: GCP project from SA
                - permissions: List of validated permissions
        """
        org_slug = context.get("org_slug")

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        self.logger.info(f"Validating GCP integration for {org_slug}")

        try:
            # Use authenticator utility
            auth = GCPAuthenticator(org_slug)
            result = await auth.validate()

            # Update status in database
            await auth.update_validation_status(
                result["status"],
                result.get("error")
            )

            return {
                "status": "SUCCESS",
                "validation_status": result["status"],
                "provider": result.get("provider", "GCP_SA"),
                "project_id": result.get("project_id", ""),
                "permissions": result.get("permissions", []),
                "message": result.get("message", "")
            }

        except Exception as e:
            self.logger.error(f"GCP validation error: {e}", exc_info=True)

            # Try to update status even on error
            try:
                auth = GCPAuthenticator(org_slug)
                await auth.update_validation_status("INVALID", str(e))
            except Exception:
                pass

            return {
                "status": "FAILED",
                "validation_status": "INVALID",
                "provider": "GCP_SA",
                "error": str(e)
            }


def get_engine():
    """Factory function for pipeline executor."""
    return GCPValidationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = GCPValidationProcessor()
    return await processor.execute(step_config, context)
