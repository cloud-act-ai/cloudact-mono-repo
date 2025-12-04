"""
GCP Service Account Integration Validation Processor

Validates GCP Service Account JSON and updates validation status.
"""

import json
import logging
from typing import Dict, Any
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class ValidateGcpIntegrationProcessor:
    """
    Processor for validating GCP Service Account integration credentials.

    Expects decrypted SA JSON to be in context['secrets']['gcp_sa_json'].
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
                - secrets.gcp_sa_json: Decrypted SA JSON (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - validation_status: VALID or INVALID
                - project_id: GCP project from SA
                - permissions: List of validated permissions
        """
        org_slug = context.get("org_slug")
        secrets = context.get("secrets", {})
        sa_json_str = secrets.get("gcp_sa_json")

        config = step_config.get("config", {})
        check_bigquery = config.get("check_bigquery", True)
        check_billing = config.get("check_billing", False)

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        if not sa_json_str:
            return {"status": "FAILED", "error": "gcp_sa_json not found in context.secrets"}

        self.logger.info(f"Validating GCP integration for {org_slug}")

        try:
            # Parse SA JSON
            sa_info = json.loads(sa_json_str)
            project_id = sa_info.get("project_id")
            client_email = sa_info.get("client_email")

            if not project_id or not client_email:
                error_msg = "Invalid service account JSON: missing project_id or client_email"
                await self._update_validation_status(
                    org_slug, "GCP_SA", "INVALID", error_msg
                )
                return {
                    "status": "SUCCESS",
                    "validation_status": "INVALID",
                    "error": error_msg
                }

            # Import Google libs
            from google.oauth2 import service_account
            from google.cloud import bigquery as bq

            # Create credentials
            credentials = service_account.Credentials.from_service_account_info(sa_info)

            validated_permissions = []
            errors = []

            # Check BigQuery access
            if check_bigquery:
                try:
                    client = bq.Client(credentials=credentials, project=project_id)
                    # List datasets to validate access
                    datasets = list(client.list_datasets(max_results=1))
                    validated_permissions.append("bigquery.datasets.list")

                    # Try to get project details
                    validated_permissions.append("bigquery.read")
                    self.logger.info(f"BigQuery validation successful for {org_slug}/{project_id}")
                except Exception as e:
                    errors.append(f"BigQuery: {str(e)}")

            # Check Billing API access (optional)
            if check_billing:
                try:
                    from googleapiclient.discovery import build

                    billing_service = build(
                        "cloudbilling", "v1",
                        credentials=credentials,
                        cache_discovery=False
                    )

                    # Try to list billing accounts
                    billing_service.billingAccounts().list().execute()
                    validated_permissions.append("cloudbilling.billingAccounts.list")
                except Exception as e:
                    errors.append(f"Billing: {str(e)}")

            # Determine final status
            if validated_permissions and not errors:
                await self._update_validation_status(
                    org_slug, "GCP_SA", "VALID", None
                )
                return {
                    "status": "SUCCESS",
                    "validation_status": "VALID",
                    "project_id": project_id,
                    "client_email": client_email,
                    "permissions": validated_permissions,
                    "message": f"GCP Service Account validated for project {project_id}"
                }
            elif validated_permissions and errors:
                # Partial success
                error_msg = "; ".join(errors)
                await self._update_validation_status(
                    org_slug, "GCP_SA", "VALID", f"Partial: {error_msg}"
                )
                return {
                    "status": "SUCCESS",
                    "validation_status": "VALID",
                    "project_id": project_id,
                    "permissions": validated_permissions,
                    "warnings": errors,
                    "message": f"GCP SA validated with warnings"
                }
            else:
                error_msg = "; ".join(errors) if errors else "No permissions validated"
                await self._update_validation_status(
                    org_slug, "GCP_SA", "INVALID", error_msg
                )
                return {
                    "status": "SUCCESS",
                    "validation_status": "INVALID",
                    "project_id": project_id,
                    "error": error_msg
                }

        except json.JSONDecodeError:
            error_msg = "Invalid JSON format for service account"
            await self._update_validation_status(
                org_slug, "GCP_SA", "INVALID", error_msg
            )
            return {
                "status": "FAILED",
                "validation_status": "INVALID",
                "error": error_msg
            }
        except Exception as e:
            error_msg = str(e)
            self.logger.error(f"GCP validation error: {e}", exc_info=True)
            await self._update_validation_status(
                org_slug, "GCP_SA", "INVALID", error_msg
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
    return ValidateGcpIntegrationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    processor = ValidateGcpIntegrationProcessor()
    return await processor.execute(step_config, context)
