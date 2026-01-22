"""
GCP Vertex AI Provider Adapter

Extracts usage data from GCP Vertex AI via BigQuery billing export.

For Vertex AI, usage data comes from the GCP billing export table where:
- service.id = 'aiplatform.googleapis.com'
- SKU descriptions contain model names and usage types

GCP Billing Export captures ALL Vertex AI usage including:
- Gemini API calls (PAYG token billing)
- GSU (Generative Scale Units) commitments
- GPU/TPU infrastructure for custom models

Documentation:
- https://cloud.google.com/vertex-ai/docs/general/monitoring
- https://cloud.google.com/vertex-ai/generative-ai/docs/quotas
- https://cloud.google.com/billing/docs/how-to/export-data-bigquery
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
import re

from google.cloud import bigquery
from google.oauth2 import service_account

from .base_adapter import BaseGenAIAdapter


class GCPVertexAdapter(BaseGenAIAdapter):
    """
    Adapter for GCP Vertex AI usage extraction.

    Extracts usage from GCP billing export - the source of truth for all GCP costs.

    Supports:
    - PAYG: Yes (Gemini API token billing via billing export)
    - Commitment: Yes (GSU - Generative AI Scale Units)
    - Infrastructure: Yes (GPU/TPU for custom models)
    """

    # Vertex AI service ID in billing export
    VERTEX_SERVICE_ID = "aiplatform.googleapis.com"

    # SKU patterns for different usage types
    SKU_PATTERNS = {
        # Gemini models
        "gemini-1.5-pro": r"Gemini 1\.5 Pro",
        "gemini-1.5-flash": r"Gemini 1\.5 Flash",
        "gemini-2.0-flash": r"Gemini 2\.0 Flash",
        "gemini-1.0-pro": r"Gemini Pro|Gemini 1\.0 Pro",
        # PaLM models (legacy)
        "palm-2": r"PaLM 2|Text Bison|Chat Bison",
        # Imagen
        "imagen": r"Imagen",
        # Codey
        "codey": r"Codey|Code Bison",
    }

    # Token type patterns
    TOKEN_PATTERNS = {
        "input": r"input|prompt|request",
        "output": r"output|completion|response|generation",
        "cached": r"cached|cache",
    }

    # SECURITY: Limit date range to prevent unbounded loops
    MAX_DATE_RANGE_DAYS = 90

    @property
    def provider_name(self) -> str:
        return "gcp_vertex"

    @property
    def supports_commitment(self) -> bool:
        return True

    @property
    def supports_infrastructure(self) -> bool:
        return True

    def _get_bigquery_client(self) -> Optional[bigquery.Client]:
        """
        Create BigQuery client from Service Account credentials.

        Returns:
            BigQuery client or None if credentials invalid
        """
        try:
            sa_json = self.credentials.get("service_account_json")
            if not sa_json:
                # Try getting full credentials dict
                if "private_key" in self.credentials:
                    sa_json = self.credentials
                else:
                    self.logger.error("No service_account_json in credentials")
                    return None

            if isinstance(sa_json, str):
                import json
                sa_json = json.loads(sa_json)

            credentials = service_account.Credentials.from_service_account_info(
                sa_json,
                scopes=["https://www.googleapis.com/auth/bigquery.readonly"]
            )

            project_id = self.credentials.get("project_id") or sa_json.get("project_id")
            return bigquery.Client(credentials=credentials, project=project_id)

        except Exception as e:
            self.logger.error(f"Failed to create BigQuery client: {type(e).__name__}")
            return None

    def _extract_model_from_sku(self, sku_description: str) -> str:
        """
        Extract model name from SKU description.

        Args:
            sku_description: GCP SKU description text

        Returns:
            Normalized model name
        """
        sku_lower = sku_description.lower()

        for model_name, pattern in self.SKU_PATTERNS.items():
            if re.search(pattern, sku_description, re.IGNORECASE):
                return model_name

        # Fallback: extract from description
        if "gemini" in sku_lower:
            return "gemini-unknown"
        elif "palm" in sku_lower or "bison" in sku_lower:
            return "palm-2"

        return "vertex-ai-unknown"

    def _extract_token_type(self, sku_description: str) -> str:
        """
        Extract token type (input/output) from SKU description.

        Args:
            sku_description: GCP SKU description text

        Returns:
            Token type: 'input', 'output', or 'unknown'
        """
        sku_lower = sku_description.lower()

        if any(re.search(p, sku_lower) for p in ["input", "prompt", "request"]):
            return "input"
        elif any(re.search(p, sku_lower) for p in ["output", "completion", "response", "generation"]):
            return "output"
        elif "cached" in sku_lower:
            return "cached_input"

        return "unknown"

    async def extract_payg_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract PAYG usage from GCP billing export.

        Queries the billing export table for Vertex AI (aiplatform.googleapis.com)
        costs and extracts token usage from SKU descriptions.

        Args:
            start_date: Start of date range (inclusive)
            end_date: End of date range (inclusive)
            **kwargs: Optional billing_export_table override

        Returns:
            List of usage records
        """
        billing_table = (
            kwargs.get("billing_export_table") or
            self.credentials.get("billing_export_table")
        )

        if not billing_table:
            self.logger.warning(
                "GCP Vertex AI PAYG: No billing_export_table configured. "
                "Configure in Settings → Integrations → GCP → Billing Export Tables"
            )
            return []

        # Validate date range
        date_range = (end_date - start_date).days
        if date_range > self.MAX_DATE_RANGE_DAYS:
            self.logger.warning(
                f"Date range {date_range} days exceeds max {self.MAX_DATE_RANGE_DAYS}. "
                f"Limiting to last {self.MAX_DATE_RANGE_DAYS} days."
            )
            start_date = end_date - timedelta(days=self.MAX_DATE_RANGE_DAYS)

        client = self._get_bigquery_client()
        if not client:
            self.logger.error("Failed to create BigQuery client for Vertex AI extraction")
            return []

        credential_id = self.credentials.get("credential_id", "default")
        project_id = self.credentials.get("project_id", "unknown")
        region = self.credentials.get("region", "us-central1")

        # Query billing export for Vertex AI usage
        query = f"""
        SELECT
            DATE(usage_start_time) as usage_date,
            sku.id as sku_id,
            sku.description as sku_description,
            project.id as gcp_project_id,
            location.region as location_region,
            SUM(usage.amount) as usage_amount,
            usage.unit as usage_unit,
            SUM(cost) as total_cost,
            currency
        FROM `{billing_table}`
        WHERE service.id = '{self.VERTEX_SERVICE_ID}'
            AND DATE(usage_start_time) BETWEEN @start_date AND @end_date
        GROUP BY
            usage_date, sku_id, sku_description, gcp_project_id,
            location_region, usage_unit, currency
        ORDER BY usage_date, sku_description
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
                bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
            ]
        )

        try:
            self.logger.info(
                f"Extracting Vertex AI usage from {billing_table}",
                extra={
                    "start_date": str(start_date),
                    "end_date": str(end_date),
                    "org_slug": self.org_slug
                }
            )

            query_job = client.query(query, job_config=job_config)
            results = query_job.result()

            # Aggregate by date and model
            usage_by_date_model: Dict[str, Dict[str, Any]] = {}

            for row in results:
                usage_date = row.usage_date
                sku_desc = row.sku_description or ""

                model = self._extract_model_from_sku(sku_desc)
                token_type = self._extract_token_type(sku_desc)

                key = f"{usage_date}_{model}"

                if key not in usage_by_date_model:
                    usage_by_date_model[key] = {
                        "usage_date": usage_date,
                        "provider": "gcp_vertex",
                        "model": model,
                        "model_family": self._get_model_family(model),
                        "region": row.location_region or region,
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "cached_input_tokens": 0,
                        "total_tokens": 0,
                        "request_count": 0,
                        "total_cost": 0.0,
                        "currency": row.currency or "USD",
                        "credential_id": credential_id,
                        "gcp_project_id": row.gcp_project_id or project_id,
                    }

                record = usage_by_date_model[key]

                # Estimate tokens from usage amount (GCP reports in 1000-character units for some SKUs)
                # For token-based SKUs, usage amount is typically in tokens
                usage_amount = float(row.usage_amount or 0)

                if token_type == "input":
                    record["input_tokens"] += int(usage_amount)
                elif token_type == "output":
                    record["output_tokens"] += int(usage_amount)
                elif token_type == "cached_input":
                    record["cached_input_tokens"] += int(usage_amount)

                record["total_cost"] += float(row.total_cost or 0)
                record["request_count"] += 1  # Each SKU row represents at least 1 request batch

            # Calculate totals and convert to list
            usage_records = []
            for record in usage_by_date_model.values():
                record["total_tokens"] = (
                    record["input_tokens"] +
                    record["output_tokens"] +
                    record["cached_input_tokens"]
                )
                usage_records.append(record)

            self.logger.info(
                f"Extracted {len(usage_records)} Vertex AI usage records",
                extra={"org_slug": self.org_slug}
            )

            return usage_records

        except Exception as e:
            self.logger.error(
                f"Failed to extract Vertex AI usage: {type(e).__name__}",
                extra={"org_slug": self.org_slug}
            )
            return []
        finally:
            client.close()

    async def extract_commitment_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract GSU (Generative Scale Units) commitment usage from billing export.

        GSUs appear in billing export with specific SKU patterns for committed usage.

        Args:
            start_date: Start of date range
            end_date: End of date range

        Returns:
            List of commitment usage records
        """
        billing_table = (
            kwargs.get("billing_export_table") or
            self.credentials.get("billing_export_table")
        )

        if not billing_table:
            self.logger.warning("No billing_export_table for GSU extraction")
            return []

        client = self._get_bigquery_client()
        if not client:
            return []

        credential_id = self.credentials.get("credential_id", "default")

        # Query for GSU commitment usage (committed/reserved SKUs)
        query = f"""
        SELECT
            DATE(usage_start_time) as usage_date,
            sku.id as sku_id,
            sku.description as sku_description,
            project.id as gcp_project_id,
            location.region as location_region,
            SUM(usage.amount) as usage_amount,
            usage.unit as usage_unit,
            SUM(cost) as total_cost,
            currency
        FROM `{billing_table}`
        WHERE service.id = '{self.VERTEX_SERVICE_ID}'
            AND DATE(usage_start_time) BETWEEN @start_date AND @end_date
            AND (
                LOWER(sku.description) LIKE '%commit%'
                OR LOWER(sku.description) LIKE '%reserved%'
                OR LOWER(sku.description) LIKE '%gsu%'
                OR LOWER(sku.description) LIKE '%scale unit%'
            )
        GROUP BY
            usage_date, sku_id, sku_description, gcp_project_id,
            location_region, usage_unit, currency
        ORDER BY usage_date
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
                bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
            ]
        )

        try:
            query_job = client.query(query, job_config=job_config)
            results = query_job.result()

            usage_records = []
            for row in results:
                usage_records.append({
                    "usage_date": row.usage_date,
                    "provider": "gcp_vertex",
                    "commitment_type": "gsu",
                    "commitment_id": row.sku_id,
                    "model_group": self._extract_model_from_sku(row.sku_description or ""),
                    "region": row.location_region or "us-central1",
                    "provisioned_units": int(row.usage_amount or 0),
                    "used_units": int(row.usage_amount or 0),
                    "utilization_pct": 100.0,  # Billing export shows actual usage
                    "overage_units": 0,
                    "total_cost": float(row.total_cost or 0),
                    "currency": row.currency or "USD",
                    "credential_id": credential_id,
                    "gcp_project_id": row.gcp_project_id,
                })

            self.logger.info(f"Extracted {len(usage_records)} GSU commitment records")
            return usage_records

        except Exception as e:
            self.logger.error(f"Failed to extract GSU usage: {type(e).__name__}")
            return []
        finally:
            client.close()

    async def extract_infrastructure_usage(
        self,
        start_date: date,
        end_date: date,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract GPU/TPU infrastructure usage from billing export.

        Infrastructure costs for Vertex AI custom models appear with
        Compute Engine service ID but are for AI workloads.

        Args:
            start_date: Start of date range
            end_date: End of date range

        Returns:
            List of infrastructure usage records
        """
        billing_table = (
            kwargs.get("billing_export_table") or
            self.credentials.get("billing_export_table")
        )

        if not billing_table:
            self.logger.warning("No billing_export_table for infrastructure extraction")
            return []

        client = self._get_bigquery_client()
        if not client:
            return []

        credential_id = self.credentials.get("credential_id", "default")

        # Query for GPU/TPU usage (both Vertex AI and Compute Engine accelerators)
        query = f"""
        SELECT
            DATE(usage_start_time) as usage_date,
            service.id as service_id,
            sku.id as sku_id,
            sku.description as sku_description,
            project.id as gcp_project_id,
            location.region as location_region,
            SUM(usage.amount) as usage_amount,
            usage.unit as usage_unit,
            SUM(cost) as total_cost,
            currency
        FROM `{billing_table}`
        WHERE DATE(usage_start_time) BETWEEN @start_date AND @end_date
            AND (
                -- Vertex AI GPU/TPU
                (service.id = '{self.VERTEX_SERVICE_ID}' AND (
                    LOWER(sku.description) LIKE '%gpu%'
                    OR LOWER(sku.description) LIKE '%tpu%'
                    OR LOWER(sku.description) LIKE '%accelerator%'
                    OR LOWER(sku.description) LIKE '%nvidia%'
                ))
                -- Compute Engine GPU for AI workloads
                OR (service.id = 'compute.googleapis.com' AND (
                    LOWER(sku.description) LIKE '%gpu%'
                    OR LOWER(sku.description) LIKE '%nvidia%'
                    OR LOWER(sku.description) LIKE '%tpu%'
                ))
            )
        GROUP BY
            usage_date, service_id, sku_id, sku_description, gcp_project_id,
            location_region, usage_unit, currency
        ORDER BY usage_date
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
                bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
            ]
        )

        try:
            query_job = client.query(query, job_config=job_config)
            results = query_job.result()

            usage_records = []
            for row in results:
                sku_desc = (row.sku_description or "").lower()

                # Determine resource type
                if "tpu" in sku_desc:
                    resource_type = "tpu"
                    gpu_type = "TPU"
                elif "a100" in sku_desc:
                    resource_type = "gpu"
                    gpu_type = "NVIDIA A100"
                elif "h100" in sku_desc:
                    resource_type = "gpu"
                    gpu_type = "NVIDIA H100"
                elif "t4" in sku_desc:
                    resource_type = "gpu"
                    gpu_type = "NVIDIA T4"
                elif "v100" in sku_desc:
                    resource_type = "gpu"
                    gpu_type = "NVIDIA V100"
                elif "l4" in sku_desc:
                    resource_type = "gpu"
                    gpu_type = "NVIDIA L4"
                else:
                    resource_type = "gpu"
                    gpu_type = "Unknown GPU"

                # Determine pricing type
                if "preemptible" in sku_desc or "spot" in sku_desc:
                    pricing_type = "spot"
                elif "commit" in sku_desc or "reserved" in sku_desc:
                    pricing_type = "reserved"
                else:
                    pricing_type = "on_demand"

                usage_records.append({
                    "usage_date": row.usage_date,
                    "provider": "gcp_vertex",
                    "resource_type": resource_type,
                    "instance_type": row.sku_id,
                    "instance_id": f"{row.gcp_project_id}_{row.sku_id}",
                    "gpu_type": gpu_type,
                    "region": row.location_region or "us-central1",
                    "instance_count": 1,
                    "hours_used": float(row.usage_amount or 0),
                    "gpu_hours": float(row.usage_amount or 0),
                    "pricing_type": pricing_type,
                    "avg_gpu_utilization_pct": 0.0,  # Not available from billing
                    "avg_memory_utilization_pct": 0.0,  # Not available from billing
                    "total_cost": float(row.total_cost or 0),
                    "currency": row.currency or "USD",
                    "credential_id": credential_id,
                    "gcp_project_id": row.gcp_project_id,
                })

            self.logger.info(f"Extracted {len(usage_records)} GPU/TPU infrastructure records")
            return usage_records

        except Exception as e:
            self.logger.error(f"Failed to extract infrastructure usage: {type(e).__name__}")
            return []
        finally:
            client.close()

    async def validate_credentials(self) -> bool:
        """
        Validate GCP credentials for Vertex AI access.

        Tests BigQuery access to billing export table.

        Returns:
            True if credentials are valid
        """
        billing_table = self.credentials.get("billing_export_table")

        if not billing_table:
            self.logger.warning(
                "No billing_export_table configured for validation. "
                "Credentials may be valid but billing export access cannot be tested."
            )
            # Still try to validate basic BigQuery access

        client = self._get_bigquery_client()
        if not client:
            self.logger.error("Failed to create BigQuery client - invalid credentials")
            return False

        try:
            # Test basic BigQuery access by listing datasets
            list(client.list_datasets(max_results=1))

            # If billing table configured, test access to it
            if billing_table:
                # Try to get table metadata
                table_parts = billing_table.split(".")
                if len(table_parts) >= 3:
                    project = table_parts[0]
                    dataset = table_parts[1]
                    table = ".".join(table_parts[2:])

                    table_ref = f"{project}.{dataset}.{table}"
                    client.get_table(table_ref)
                    self.logger.info(f"Validated access to billing table: {billing_table}")

            return True

        except Exception as e:
            self.logger.error(f"Credential validation failed: {type(e).__name__}")
            return False
        finally:
            client.close()

    def _get_model_family(self, model: str) -> str:
        """Determine model family from model name."""
        model_lower = model.lower()

        if "gemini-2" in model_lower:
            return "gemini-2"
        elif "gemini-1.5-pro" in model_lower:
            return "gemini-1.5-pro"
        elif "gemini-1.5-flash" in model_lower:
            return "gemini-1.5-flash"
        elif "gemini" in model_lower:
            return "gemini-1.0"
        elif "palm" in model_lower or "bison" in model_lower:
            return "palm-2"
        elif "imagen" in model_lower:
            return "imagen"
        elif "codey" in model_lower:
            return "codey"

        return "vertex-ai"
