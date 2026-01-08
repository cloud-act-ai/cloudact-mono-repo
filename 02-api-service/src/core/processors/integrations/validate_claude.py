"""
Claude/Anthropic Integration Validation Processor

Validates Anthropic API key and updates validation status.
"""

import logging
from typing import Dict, Any
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class ValidateClaudeIntegrationProcessor:
    """
    Processor for validating Claude/Anthropic integration credentials.

    Expects decrypted API key to be in context['secrets']['claude_api_key'].
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
        Validate Claude/Anthropic API key.

        Args:
            step_config: Step configuration (optional)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - secrets.claude_api_key: Decrypted API key (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - validation_status: VALID or INVALID
                - models: List of available models (if valid)
        """
        org_slug = context.get("org_slug")
        secrets = context.get("secrets", {})
        api_key = secrets.get("claude_api_key")

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        if not api_key:
            return {"status": "FAILED", "error": "claude_api_key not found in context.secrets"}

        self.logger.info(f"Validating Claude integration for {org_slug}")

        try:
            import httpx

            # BUG-012 FIX: Make timeout configurable
            timeout = step_config.get("timeout", 15.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                # BUG-013 FIX: Use correct Anthropic API endpoint for validation
                # Anthropic doesn't have /v1/models endpoint, use /v1/messages with minimal request
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "Hi"}]
                    }
                )

                if response.status_code == 200:
                    # Successfully made API call with the key
                    await self._update_validation_status(
                        org_slug, "CLAUDE", "VALID", None
                    )

                    self.logger.info(f"Claude validation successful for {org_slug}")
                    return {
                        "status": "SUCCESS",
                        "validation_status": "VALID",
                        "message": "Claude API key validated successfully"
                    }
                elif response.status_code == 401:
                    error_msg = "Invalid API key"
                    await self._update_validation_status(
                        org_slug, "CLAUDE", "INVALID", error_msg
                    )
                    return {
                        "status": "SUCCESS",
                        "validation_status": "INVALID",
                        "error": error_msg
                    }
                else:
                    error_msg = f"API error: {response.status_code}"
                    await self._update_validation_status(
                        org_slug, "CLAUDE", "INVALID", error_msg
                    )
                    return {
                        "status": "SUCCESS",
                        "validation_status": "INVALID",
                        "error": error_msg
                    }

        except Exception as e:
            error_msg = str(e)
            self.logger.error(f"Claude validation error: {e}", exc_info=True)
            await self._update_validation_status(
                org_slug, "CLAUDE", "INVALID", error_msg
            )
            return {
                "status": "FAILED",
                "validation_status": "INVALID",
                "error": error_msg
            }

    async def _update_validation_status(
        self,
        org_slug: str,
        provider: str,
        status: str,
        error: str = None
    ):
        """Update validation status in database."""
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        try:
            query = f"""
            UPDATE `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            SET
                validation_status = @status,
                last_validated_at = CURRENT_TIMESTAMP(),
                last_error = @error,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
            """

            bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("provider", "STRING", provider),
                        bigquery.ScalarQueryParameter("status", "STRING", status),
                        bigquery.ScalarQueryParameter("error", "STRING", error),
                    ]
                )
            ).result()
        except Exception as e:
            self.logger.error(f"Failed to update validation status: {e}")


def get_engine():
    return ValidateClaudeIntegrationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    processor = ValidateClaudeIntegrationProcessor()
    return await processor.execute(step_config, context)
