"""
GenAI to FOCUS 1.3 Converter

Converts GenAI unified costs to FOCUS 1.3 standard format.
Reads from: genai_costs_daily_unified
Writes to: cost_data_standard_1_3

Usage in pipeline:
    ps_type: genai.focus_converter

Idempotency Fixes:
    HIGH #10: Use atomic MERGE instead of INSERT to prevent duplicate FOCUS records
"""

import logging
from datetime import datetime, date
from typing import Dict, Any
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.utils.audit_logger import log_execute, AuditLogger


class FOCUSConverterProcessor:
    """
    Converts GenAI costs to FOCUS 1.3 format.

    Maps GenAI cost fields to FOCUS 1.3 schema for unified reporting
    across cloud, SaaS, and GenAI costs.
    """

    # FOCUS 1.3 service categories for GenAI
    SERVICE_CATEGORIES = {
        "payg": "AI and Machine Learning",
        "commitment": "AI and Machine Learning",
        "infrastructure": "Compute"
    }

    # Provider to ServiceProviderName mapping
    PROVIDER_NAMES = {
        "openai": "OpenAI",
        "anthropic": "Anthropic",
        "deepseek": "DeepSeek",
        "gemini": "Google",
        "azure_openai": "Microsoft",
        "aws_bedrock": "Amazon Web Services",
        "gcp_vertex": "Google Cloud",
        "gcp_gpu": "Google Cloud",
        "aws_gpu": "Amazon Web Services",
        "azure_gpu": "Microsoft"
    }

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert GenAI costs to FOCUS 1.3 format.

        Args:
            step_config: Step configuration containing:
                - config.date: Date to convert
            context: Execution context with org_slug

        Returns:
            Dict with status and row counts
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        process_date = self._parse_date(config.get("date") or context.get("start_date"))

        if not process_date:
            return {"status": "FAILED", "error": "date is required"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(f"Converting GenAI costs to FOCUS 1.3 for {org_slug}")

        # SEC-005: Audit logging - Log pipeline execution start
        run_id = context.get("run_id", "manual")
        pipeline_id = context.get("pipeline_id", "genai_focus_converter")
        await log_execute(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_PIPELINE,
            resource_id=pipeline_id,
            details={
                "run_id": run_id,
                "action": "START",
                "processor": "GenAIFOCUSConverterProcessor",
                "process_date": str(process_date)
            }
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # HIGH #10: Use atomic MERGE instead of INSERT to prevent duplicates
            merge_query = f"""
                MERGE `{project_id}.{dataset_id}.cost_data_standard_1_3` T
                USING (
                    SELECT
                        TIMESTAMP(cost_date) as ChargePeriodStart,
                        TIMESTAMP(DATE_ADD(cost_date, INTERVAL 1 DAY)) as ChargePeriodEnd,
                        TIMESTAMP(DATE_TRUNC(cost_date, MONTH)) as BillingPeriodStart,
                        TIMESTAMP(DATE_ADD(LAST_DAY(cost_date, MONTH), INTERVAL 1 DAY)) as BillingPeriodEnd,
                        -- Provider name mapping
                        CASE provider
                            WHEN 'openai' THEN 'OpenAI'
                            WHEN 'anthropic' THEN 'Anthropic'
                            WHEN 'gemini' THEN 'Google'
                            WHEN 'azure_openai' THEN 'Microsoft'
                            WHEN 'aws_bedrock' THEN 'Amazon Web Services'
                            WHEN 'gcp_vertex' THEN 'Google Cloud'
                            ELSE provider
                        END as InvoiceIssuerName,
                        CASE provider
                            WHEN 'openai' THEN 'OpenAI'
                            WHEN 'anthropic' THEN 'Anthropic'
                            WHEN 'gemini' THEN 'Google AI'
                            WHEN 'azure_openai' THEN 'Azure OpenAI'
                            WHEN 'aws_bedrock' THEN 'AWS Bedrock'
                            WHEN 'gcp_vertex' THEN 'Vertex AI'
                            ELSE provider
                        END as ServiceProviderName,
                        -- Service category
                        CASE cost_type
                            WHEN 'infrastructure' THEN 'Compute'
                            ELSE 'AI and Machine Learning'
                        END as ServiceCategory,
                        -- Service name
                        CASE cost_type
                            WHEN 'payg' THEN CONCAT(provider, ' API')
                            WHEN 'commitment' THEN CONCAT(provider, ' Commitment')
                            WHEN 'infrastructure' THEN CONCAT(provider, ' GPU/TPU')
                        END as ServiceName,
                        -- Resource identification
                        COALESCE(model, instance_type, 'default') as ResourceId,
                        COALESCE(model, instance_type, provider) as ResourceName,
                        cost_type as ResourceType,
                        COALESCE(region, 'global') as RegionId,
                        COALESCE(region, 'global') as RegionName,
                        -- Usage (FOCUS 1.3 uses ConsumedQuantity/ConsumedUnit - NUMERIC type)
                        -- BUG EDGE-03 FIX: Add NULL handling for ConsumedQuantity
                        CAST(COALESCE(usage_quantity, 0) AS NUMERIC) as ConsumedQuantity,
                        COALESCE(usage_unit, 'units') as ConsumedUnit,
                        CASE cost_type
                            WHEN 'commitment' THEN 'Committed'
                            WHEN 'infrastructure' THEN CASE
                                WHEN usage_unit = 'spot' THEN 'Spot'
                                ELSE 'On-Demand'
                            END
                            ELSE 'On-Demand'
                        END as PricingCategory,
                        usage_unit as PricingUnit,
                        -- Costs (NUMERIC type in FOCUS 1.3)
                        CAST(total_cost_usd AS NUMERIC) as EffectiveCost,
                        CAST(total_cost_usd AS NUMERIC) as BilledCost,
                        CAST(total_cost_usd / NULLIF(1 - COALESCE(discount_applied_pct, 0) / 100, 0) AS NUMERIC) as ListCost,
                        CAST(NULL AS NUMERIC) as ListUnitPrice,
                        CAST(CASE WHEN cost_type = 'commitment' THEN total_cost_usd ELSE NULL END AS NUMERIC) as ContractedCost,
                        CAST(NULL AS NUMERIC) as ContractedUnitPrice,
                        -- Charge attributes (FOCUS 1.3 naming)
                        'Usage' as ChargeCategory,
                        'Standard' as ChargeClass,
                        'Usage-Based' as ChargeFrequency,
                        -- Account
                        org_slug as SubAccountId,
                        org_slug as SubAccountName,
                        -- Extension fields for GenAI
                        cost_type as x_genai_cost_type,
                        provider as x_genai_provider,
                        model as x_genai_model,
                        hierarchy_level_1_id as x_hierarchy_level_1_id,
                        hierarchy_level_1_name as x_hierarchy_level_1_name,
                        hierarchy_level_2_id as x_hierarchy_level_2_id,
                        hierarchy_level_2_name as x_hierarchy_level_2_name,
                        hierarchy_level_3_id as x_hierarchy_level_3_id,
                        hierarchy_level_3_name as x_hierarchy_level_3_name,
                        hierarchy_level_4_id as x_hierarchy_level_4_id,
                        hierarchy_level_4_name as x_hierarchy_level_4_name,
                        hierarchy_level_5_id as x_hierarchy_level_5_id,
                        hierarchy_level_5_name as x_hierarchy_level_5_name,
                        hierarchy_level_6_id as x_hierarchy_level_6_id,
                        hierarchy_level_6_name as x_hierarchy_level_6_name,
                        hierarchy_level_7_id as x_hierarchy_level_7_id,
                        hierarchy_level_7_name as x_hierarchy_level_7_name,
                        hierarchy_level_8_id as x_hierarchy_level_8_id,
                        hierarchy_level_8_name as x_hierarchy_level_8_name,
                        hierarchy_level_9_id as x_hierarchy_level_9_id,
                        hierarchy_level_9_name as x_hierarchy_level_9_name,
                        hierarchy_level_10_id as x_hierarchy_level_10_id,
                        hierarchy_level_10_name as x_hierarchy_level_10_name,
                        -- Lineage columns (REQUIRED)
                        'focus_convert_genai' as x_pipeline_id,
                        @credential_id as x_credential_id,
                        @process_date as x_pipeline_run_date,
                        @run_id as x_run_id,
                        CURRENT_TIMESTAMP() as x_ingested_at
                    FROM `{project_id}.{dataset_id}.genai_costs_daily_unified`
                    WHERE cost_date = @process_date
                      AND org_slug = @org_slug
                      AND total_cost_usd > 0
                      AND usage_quantity > 0
                      AND usage_unit IS NOT NULL
                      AND cost_type IN ('payg', 'commitment', 'infrastructure')
                ) S
                ON T.ChargePeriodStart = S.ChargePeriodStart
                    AND T.SubAccountId = S.SubAccountId
                    AND T.x_genai_cost_type = S.x_genai_cost_type
                    AND T.x_genai_provider = S.x_genai_provider
                    AND COALESCE(T.ResourceId, '') = COALESCE(S.ResourceId, '')
                    AND COALESCE(T.RegionId, 'global') = COALESCE(S.RegionId, 'global')
                    AND T.x_pipeline_id = S.x_pipeline_id
                    AND T.x_credential_id = S.x_credential_id
                    AND T.x_pipeline_run_date = S.x_pipeline_run_date
                WHEN MATCHED THEN
                    UPDATE SET
                        ChargePeriodEnd = S.ChargePeriodEnd,
                        BillingPeriodStart = S.BillingPeriodStart,
                        BillingPeriodEnd = S.BillingPeriodEnd,
                        InvoiceIssuerName = S.InvoiceIssuerName,
                        ServiceProviderName = S.ServiceProviderName,
                        ServiceCategory = S.ServiceCategory,
                        ServiceName = S.ServiceName,
                        ResourceName = S.ResourceName,
                        ResourceType = S.ResourceType,
                        RegionId = S.RegionId,
                        RegionName = S.RegionName,
                        ConsumedQuantity = S.ConsumedQuantity,
                        ConsumedUnit = S.ConsumedUnit,
                        PricingCategory = S.PricingCategory,
                        PricingUnit = S.PricingUnit,
                        EffectiveCost = S.EffectiveCost,
                        BilledCost = S.BilledCost,
                        ListCost = S.ListCost,
                        ContractedCost = S.ContractedCost,
                        ChargeCategory = S.ChargeCategory,
                        ChargeClass = S.ChargeClass,
                        ChargeFrequency = S.ChargeFrequency,
                        x_genai_model = S.x_genai_model,
                        x_hierarchy_level_1_id = S.x_hierarchy_level_1_id,
                        x_hierarchy_level_1_name = S.x_hierarchy_level_1_name,
                        x_hierarchy_level_2_id = S.x_hierarchy_level_2_id,
                        x_hierarchy_level_2_name = S.x_hierarchy_level_2_name,
                        x_hierarchy_level_3_id = S.x_hierarchy_level_3_id,
                        x_hierarchy_level_3_name = S.x_hierarchy_level_3_name,
                        x_hierarchy_level_4_id = S.x_hierarchy_level_4_id,
                        x_hierarchy_level_4_name = S.x_hierarchy_level_4_name,
                        x_hierarchy_level_5_id = S.x_hierarchy_level_5_id,
                        x_hierarchy_level_5_name = S.x_hierarchy_level_5_name,
                        x_hierarchy_level_6_id = S.x_hierarchy_level_6_id,
                        x_hierarchy_level_6_name = S.x_hierarchy_level_6_name,
                        x_hierarchy_level_7_id = S.x_hierarchy_level_7_id,
                        x_hierarchy_level_7_name = S.x_hierarchy_level_7_name,
                        x_hierarchy_level_8_id = S.x_hierarchy_level_8_id,
                        x_hierarchy_level_8_name = S.x_hierarchy_level_8_name,
                        x_hierarchy_level_9_id = S.x_hierarchy_level_9_id,
                        x_hierarchy_level_9_name = S.x_hierarchy_level_9_name,
                        x_hierarchy_level_10_id = S.x_hierarchy_level_10_id,
                        x_hierarchy_level_10_name = S.x_hierarchy_level_10_name,
                        x_run_id = S.x_run_id,
                        x_ingested_at = S.x_ingested_at
                WHEN NOT MATCHED THEN
                    INSERT (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
                            InvoiceIssuerName, ServiceProviderName, ServiceCategory, ServiceName,
                            ResourceId, ResourceName, ResourceType, RegionId, RegionName,
                            ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
                            EffectiveCost, BilledCost, ListCost, ListUnitPrice,
                            ContractedCost, ContractedUnitPrice,
                            ChargeCategory, ChargeClass, ChargeFrequency,
                            SubAccountId, SubAccountName,
                            x_genai_cost_type, x_genai_provider, x_genai_model,
                            x_hierarchy_level_1_id, x_hierarchy_level_1_name,
                            x_hierarchy_level_2_id, x_hierarchy_level_2_name,
                            x_hierarchy_level_3_id, x_hierarchy_level_3_name,
                            x_hierarchy_level_4_id, x_hierarchy_level_4_name,
                            x_hierarchy_level_5_id, x_hierarchy_level_5_name,
                            x_hierarchy_level_6_id, x_hierarchy_level_6_name,
                            x_hierarchy_level_7_id, x_hierarchy_level_7_name,
                            x_hierarchy_level_8_id, x_hierarchy_level_8_name,
                            x_hierarchy_level_9_id, x_hierarchy_level_9_name,
                            x_hierarchy_level_10_id, x_hierarchy_level_10_name,
                            x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
                    VALUES (S.ChargePeriodStart, S.ChargePeriodEnd, S.BillingPeriodStart, S.BillingPeriodEnd,
                            S.InvoiceIssuerName, S.ServiceProviderName, S.ServiceCategory, S.ServiceName,
                            S.ResourceId, S.ResourceName, S.ResourceType, S.RegionId, S.RegionName,
                            S.ConsumedQuantity, S.ConsumedUnit, S.PricingCategory, S.PricingUnit,
                            S.EffectiveCost, S.BilledCost, S.ListCost, S.ListUnitPrice,
                            S.ContractedCost, S.ContractedUnitPrice,
                            S.ChargeCategory, S.ChargeClass, S.ChargeFrequency,
                            S.SubAccountId, S.SubAccountName,
                            S.x_genai_cost_type, S.x_genai_provider, S.x_genai_model,
                            S.x_hierarchy_level_1_id, S.x_hierarchy_level_1_name,
                            S.x_hierarchy_level_2_id, S.x_hierarchy_level_2_name,
                            S.x_hierarchy_level_3_id, S.x_hierarchy_level_3_name,
                            S.x_hierarchy_level_4_id, S.x_hierarchy_level_4_name,
                            S.x_hierarchy_level_5_id, S.x_hierarchy_level_5_name,
                            S.x_hierarchy_level_6_id, S.x_hierarchy_level_6_name,
                            S.x_hierarchy_level_7_id, S.x_hierarchy_level_7_name,
                            S.x_hierarchy_level_8_id, S.x_hierarchy_level_8_name,
                            S.x_hierarchy_level_9_id, S.x_hierarchy_level_9_name,
                            S.x_hierarchy_level_10_id, S.x_hierarchy_level_10_name,
                            S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date, S.x_run_id, S.x_ingested_at)
            """

            # Get lineage context from pipeline execution
            credential_id = context.get("credential_id", "unknown")
            run_id = context.get("run_id", "unknown")

            job = bq_client.client.query(merge_query, job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("process_date", "DATE", process_date),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id),
                    bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
                ]
            ))
            job.result()

            rows_affected = job.num_dml_affected_rows or 0

            # PROC-007: Enhanced MERGE logging with operation breakdown
            # Note: BigQuery MERGE doesn't provide separate insert/update counts in job stats
            # Total affected rows includes: inserted + updated (excludes matched but unchanged)
            self.logger.info(
                f"MERGE completed for FOCUS 1.3 conversion: {rows_affected} rows affected "
                f"(inserts + updates) for date {process_date}",
                extra={
                    "rows_affected": rows_affected,
                    "process_date": str(process_date),
                    "operation": "MERGE",
                    "note": "Affected count includes both inserted and updated rows"
                }
            )

            # SEC-005: Audit logging - Log successful completion
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_SUCCESS,
                details={
                    "run_id": run_id,
                    "rows_affected": rows_affected,
                    "process_date": str(process_date),
                    "target_table": "cost_data_standard_1_3"
                }
            )

            return {
                "status": "SUCCESS",
                "rows_inserted": rows_affected,  # Keep name for backward compatibility
                "rows_affected": rows_affected,  # More accurate name
                "date": str(process_date),
                "target_table": "cost_data_standard_1_3"
            }

        except Exception as e:
            self.logger.error(f"FOCUS conversion failed: {e}", exc_info=True)

            # SEC-005: Audit logging - Log failure
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_FAILURE,
                error_message=str(e),
                details={"run_id": run_id, "process_date": str(process_date)}
            )

            return {"status": "FAILED", "error": str(e)}

    def _parse_date(self, date_str):
        if not date_str:
            return None
        if isinstance(date_str, date):
            return date_str
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None


def get_engine():
    """Factory function for pipeline executor - REQUIRED for dynamic loading"""
    return FOCUSConverterProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = FOCUSConverterProcessor()
    return await processor.execute(step_config, context)
