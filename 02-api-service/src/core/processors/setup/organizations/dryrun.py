"""
Organization Onboarding Dry-Run Validation Processor
Validates organization configuration and infrastructure before actual onboarding
"""
import logging
import hashlib
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class OrgDryRunProcessor:
    """
    Processor for dry-run validation of organization onboarding
    Performs pre-flight checks without creating any resources
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        self.validation_results = []

    def _add_validation(
        self,
        check_name: str,
        passed: bool,
        message: str,
        details: Dict[str, Any] = None
    ):
        """Add a validation result to the results list"""
        self.validation_results.append({
            "check_name": check_name,
            "passed": passed,
            "message": message,
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat()
        })

        if passed:
            self.logger.info(f"✓ {check_name}: {message}")
        else:
            self.logger.warning(f"✗ {check_name}: {message}")

    async def _validate_org_slug(self, org_slug: str) -> bool:
        """Validate org_slug format"""
        import re

        try:
            # Must be alphanumeric with underscores, 3-50 characters
            if not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
                self._add_validation(
                    check_name="org_slug_format",
                    passed=False,
                    message="Invalid org_slug format",
                    details={
                        "org_slug": org_slug,
                        "requirement": "alphanumeric with underscores, 3-50 characters"
                    }
                )
                return False

            self._add_validation(
                check_name="org_slug_format",
                passed=True,
                message=f"Organization slug '{org_slug}' format is valid",
                details={"org_slug": org_slug}
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="org_slug_format",
                passed=False,
                message=f"Error validating org_slug: {str(e)}",
                details={"error": str(e)}
            )
            return False

    async def _validate_org_not_exists(self, bq_client: BigQueryClient, org_slug: str) -> bool:
        """Check if organization already exists"""
        try:
            # Check org_profiles table
            query = f"""
            SELECT COUNT(*) as count
            FROM `{self.settings.gcp_project_id}.organizations.org_profiles`
            WHERE org_slug = @org_slug
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )

            result = bq_client.client.query(query, job_config=job_config).result()
            count = list(result)[0].count

            if count > 0:
                self._add_validation(
                    check_name="org_existence",
                    passed=False,
                    message=f"Organization '{org_slug}' already exists",
                    details={
                        "org_slug": org_slug,
                        "existing_count": count
                    }
                )
                return False

            # Check if dataset already exists
            # Use get_org_dataset_name() for consistency with onboarding
            dataset_id = f"{self.settings.gcp_project_id}.{self.settings.get_org_dataset_name(org_slug)}"
            try:
                await bq_client.get_dataset(dataset_id)
                self._add_validation(
                    check_name="org_existence",
                    passed=False,
                    message=f"Dataset '{org_slug}' already exists",
                    details={
                        "org_slug": org_slug,
                        "dataset_id": dataset_id
                    }
                )
                return False
            except NotFound:
                # Dataset doesn't exist - good!
                pass

            self._add_validation(
                check_name="org_existence",
                passed=True,
                message=f"Organization '{org_slug}' does not exist (ready for onboarding)",
                details={"org_slug": org_slug}
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="org_existence",
                passed=False,
                message=f"Error checking organization existence: {str(e)}",
                details={"error": str(e)}
            )
            return False

    async def _validate_gcp_credentials(self, bq_client: BigQueryClient) -> bool:
        """Test BigQuery connectivity with current credentials"""
        try:
            # Try to list datasets to verify connectivity
            datasets = list(bq_client.client.list_datasets(max_results=1))

            self._add_validation(
                check_name="gcp_credentials",
                passed=True,
                message="GCP credentials are valid and BigQuery is accessible",
                details={
                    "project_id": self.settings.gcp_project_id,
                    "location": self.settings.bigquery_location
                }
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="gcp_credentials",
                passed=False,
                message=f"GCP credentials validation failed: {str(e)}",
                details={
                    "error": str(e),
                    "project_id": self.settings.gcp_project_id
                }
            )
            return False

    async def _validate_bigquery_connectivity(self, bq_client: BigQueryClient) -> bool:
        """Test BigQuery query execution"""
        try:
            # Run simple test query
            query = "SELECT 'Dry run test' as message, CURRENT_TIMESTAMP() as timestamp"
            result = bq_client.client.query(query).result()

            # Consume result to ensure query completes
            for row in result:
                message = row.message

            self._add_validation(
                check_name="bigquery_connectivity",
                passed=True,
                message="BigQuery query execution successful",
                details={
                    "test_query": query,
                    "message": message
                }
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="bigquery_connectivity",
                passed=False,
                message=f"BigQuery connectivity test failed: {str(e)}",
                details={"error": str(e)}
            )
            return False

    async def _validate_subscription_plan(self, subscription_plan: str) -> bool:
        """Validate subscription plan"""
        try:
            allowed_plans = ['STARTER', 'PROFESSIONAL', 'SCALE']

            if subscription_plan.upper() not in allowed_plans:
                self._add_validation(
                    check_name="subscription_plan",
                    passed=False,
                    message=f"Invalid subscription plan: {subscription_plan}",
                    details={
                        "provided_plan": subscription_plan,
                        "allowed_plans": allowed_plans
                    }
                )
                return False

            self._add_validation(
                check_name="subscription_plan",
                passed=True,
                message=f"Subscription plan '{subscription_plan}' is valid",
                details={
                    "plan": subscription_plan,
                    "allowed_plans": allowed_plans
                }
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="subscription_plan",
                passed=False,
                message=f"Error validating subscription plan: {str(e)}",
                details={"error": str(e)}
            )
            return False

    async def _validate_central_tables_exist(self, bq_client: BigQueryClient) -> bool:
        """Verify central organizations dataset and tables exist"""
        try:
            required_tables = [
                "org_profiles",
                "org_api_keys",
                "org_subscriptions",
                "org_usage_quotas",
                "org_pipeline_configs"
            ]

            missing_tables = []
            existing_tables = []

            for table_name in required_tables:
                table_id = f"{self.settings.gcp_project_id}.organizations.{table_name}"
                try:
                    await bq_client.get_table(table_id)
                    existing_tables.append(table_name)
                except NotFound:
                    missing_tables.append(table_name)

            if missing_tables:
                self._add_validation(
                    check_name="central_tables",
                    passed=False,
                    message=f"Missing central tables: {', '.join(missing_tables)}",
                    details={
                        "missing_tables": missing_tables,
                        "existing_tables": existing_tables,
                        "hint": "Run bootstrap first: POST /admin/bootstrap"
                    }
                )
                return False

            self._add_validation(
                check_name="central_tables",
                passed=True,
                message="All required central tables exist",
                details={
                    "tables_checked": required_tables,
                    "all_exist": True
                }
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="central_tables",
                passed=False,
                message=f"Error validating central tables: {str(e)}",
                details={"error": str(e)}
            )
            return False

    async def _validate_email_format(self, email: str) -> bool:
        """Validate email format"""
        import re

        try:
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

            if not re.match(email_pattern, email):
                self._add_validation(
                    check_name="email_format",
                    passed=False,
                    message=f"Invalid email format: {email}",
                    details={"email": email}
                )
                return False

            self._add_validation(
                check_name="email_format",
                passed=True,
                message=f"Email format is valid: {email}",
                details={"email": email}
            )
            return True

        except Exception as e:
            self._add_validation(
                check_name="email_format",
                passed=False,
                message=f"Error validating email: {str(e)}",
                details={"error": str(e)}
            )
            return False

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute dry-run validation for organization onboarding

        Args:
            step_config: Step configuration from pipeline YAML or request
            context: Execution context (org_slug, subscription_plan, etc.)

        Returns:
            Validation result with all checks passed/failed
        """
        # Reset validation results
        self.validation_results = []

        org_slug = context.get("org_slug")
        subscription_plan = context.get("subscription_plan", "STARTER")
        admin_email = context.get("admin_email", "")
        company_name = context.get("company_name", "")

        self.logger.info(
            f"Starting dry-run validation for organization: {org_slug}",
            extra={
                "org_slug": org_slug,
                "subscription_plan": subscription_plan
            }
        )

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        # Run all validation checks
        checks = []

        # 1. Validate org_slug format
        checks.append(await self._validate_org_slug(org_slug))

        # 2. Validate email format
        if admin_email:
            checks.append(await self._validate_email_format(admin_email))

        # 3. Validate GCP credentials
        checks.append(await self._validate_gcp_credentials(bq_client))

        # 4. Validate BigQuery connectivity
        checks.append(await self._validate_bigquery_connectivity(bq_client))

        # 5. Validate subscription plan
        checks.append(await self._validate_subscription_plan(subscription_plan))

        # 6. Check if organization already exists
        checks.append(await self._validate_org_not_exists(bq_client, org_slug))

        # 7. Validate central tables exist
        checks.append(await self._validate_central_tables_exist(bq_client))

        # Note: Dryrun is now a direct API endpoint, not a pipeline
        # No separate config file needed - configuration comes via API request

        # Calculate overall status
        all_passed = all(checks)
        passed_count = sum(1 for c in checks if c)
        failed_count = len(checks) - passed_count

        result = {
            "status": "SUCCESS" if all_passed else "FAILED",
            "org_slug": org_slug,
            "subscription_plan": subscription_plan,
            "company_name": company_name,
            "admin_email": admin_email,
            "validation_summary": {
                "total_checks": len(self.validation_results),
                "passed": passed_count,
                "failed": failed_count,
                "all_passed": all_passed
            },
            "validation_results": self.validation_results,
            "message": f"Dry-run validation {'passed' if all_passed else 'failed'}: {passed_count}/{len(checks)} checks passed",
            "ready_for_onboarding": all_passed
        }

        self.logger.info(
            f"Dry-run validation completed for {org_slug}",
            extra=result["validation_summary"]
        )

        return result


# Function for pipeline executor to call
async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = OrgDryRunProcessor()
    return await processor.execute(step_config, context)
