"""
DeepSeek Integration Validation Processor

Validates DeepSeek API key and updates validation status.
"""

import logging
from typing import Dict, Any
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class ValidateDeepSeekIntegrationProcessor:
    """
    Processor for validating DeepSeek integration credentials.

    Expects decrypted API key to be in context['secrets']['deepseek_api_key'].
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
        Validate DeepSeek API key.

        Args:
            step_config: Step configuration (optional)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - secrets.deepseek_api_key: Decrypted API key (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - validation_status: VALID or INVALID
        """
        org_slug = context.get("org_slug")
        secrets = context.get("secrets", {})
        api_key = secrets.get("deepseek_api_key")

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        if not api_key:
            return {"status": "FAILED", "error": "deepseek_api_key not found in context.secrets"}

        self.logger.info(f"Validating DeepSeek integration for {org_slug}")

        try:
            import httpx

            async with httpx.AsyncClient(timeout=15.0) as client:
                # List models to validate key
                response = await client.get(
                    "https://api.deepseek.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"}
                )

                if response.status_code == 200:
                    data = response.json()
                    models = [m.get("id") for m in data.get("data", [])]

                    await self._update_validation_status(
                        org_slug, "DEEPSEEK", "VALID", None
                    )

                    self.logger.info(f"DeepSeek validation successful for {org_slug}")
                    return {
                        "status": "SUCCESS",
                        "validation_status": "VALID",
                        "models_count": len(models),
                        "sample_models": models[:5],
                        "message": f"DeepSeek API key validated."
                    }
                elif response.status_code == 401:
                    error_msg = "Invalid API key"
                    await self._update_validation_status(
                        org_slug, "DEEPSEEK", "INVALID", error_msg
                    )
                    return {
                        "status": "SUCCESS",
                        "validation_status": "INVALID",
                        "error": error_msg
                    }
                else:
                    error_msg = f"API error: {response.status_code}"
                    await self._update_validation_status(
                        org_slug, "DEEPSEEK", "INVALID", error_msg
                    )
                    return {
                        "status": "SUCCESS",
                        "validation_status": "INVALID",
                        "error": error_msg
                    }

        except Exception as e:
            error_msg = str(e)
            self.logger.error(f"DeepSeek validation error: {e}", exc_info=True)
            await self._update_validation_status(
                org_slug, "DEEPSEEK", "INVALID", error_msg
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
    return ValidateDeepSeekIntegrationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    processor = ValidateDeepSeekIntegrationProcessor()
    return await processor.execute(step_config, context)
