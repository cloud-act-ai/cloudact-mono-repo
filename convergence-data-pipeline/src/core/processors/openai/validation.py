"""
OpenAI Validation Processor

Pipeline processor that validates OpenAI API key credentials.
Uses OpenAIAuthenticator utility for actual validation logic.

Usage in pipeline:
    ps_type: openai.validation
"""

import logging
from typing import Dict, Any

from src.core.processors.openai.authenticator import OpenAIAuthenticator
from src.app.config import get_settings


class OpenAIValidationProcessor:
    """
    Processor for validating OpenAI integration credentials.

    Uses OpenAIAuthenticator utility class for credential decryption and validation.
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
        Validate OpenAI API key.

        Args:
            step_config: Step configuration (optional)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - validation_status: VALID or INVALID
                - models_count: Number of available models
                - sample_models: First 5 model IDs
        """
        org_slug = context.get("org_slug")

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        self.logger.info(f"Validating OpenAI integration for {org_slug}")

        try:
            # Use authenticator utility
            auth = OpenAIAuthenticator(org_slug)
            result = await auth.validate()

            # Update status in database
            await auth.update_validation_status(
                result["status"],
                result.get("error")
            )

            return {
                "status": "SUCCESS",
                "validation_status": result["status"],
                "provider": result.get("provider", "OPENAI"),
                "models_count": result.get("models_count", 0),
                "sample_models": result.get("sample_models", []),
                "message": result.get("message", "")
            }

        except Exception as e:
            self.logger.error(f"OpenAI validation error: {e}", exc_info=True)

            # Try to update status even on error
            try:
                auth = OpenAIAuthenticator(org_slug)
                await auth.update_validation_status("INVALID", str(e))
            except Exception:
                pass

            return {
                "status": "FAILED",
                "validation_status": "INVALID",
                "provider": "OPENAI",
                "error": str(e)
            }


def get_engine():
    """Factory function for pipeline executor."""
    return OpenAIValidationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = OpenAIValidationProcessor()
    return await processor.execute(step_config, context)
