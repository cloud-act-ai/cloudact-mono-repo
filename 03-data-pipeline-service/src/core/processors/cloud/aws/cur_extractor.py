"""
AWS Cost & Usage Report Extractor

Extracts CUR data from S3 buckets (Parquet/CSV format).
Uses AWSAuthenticator for cross-account access.

ps_type: cloud.aws.cur_extractor
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, date
import io
import uuid

from src.core.processors.cloud.aws.authenticator import AWSAuthenticator
from src.app.config import get_settings

logger = logging.getLogger(__name__)


class AWSCURExtractor:
    """
    Extracts AWS Cost & Usage Reports from S3.

    Supports:
    - Parquet format (preferred)
    - GZIP compressed CSV
    - Athena query integration
    """

    def __init__(self, org_slug: Optional[str] = None):
        self.org_slug = org_slug
        self.settings = get_settings()
        self._auth: Optional[AWSAuthenticator] = None

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract CUR data from S3.

        Args:
            step_config: Configuration with source_bucket, source_prefix, date_filter
            context: Pipeline context with org_slug

        Returns:
            Dict with extracted rows and metadata
        """
        # ERR-002 FIX: Get org_slug from context if not set in constructor
        if not self.org_slug:
            self.org_slug = context.get("org_slug")
        if not self.org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        config = step_config.get("config", {})
        source_bucket = config.get("source_bucket")
        source_prefix = config.get("source_prefix", "")
        date_filter = config.get("date_filter") or context.get("date")
        file_format = config.get("format", "Parquet").lower()

        if not source_bucket:
            return {"status": "FAILED", "error": "source_bucket is required"}

        logger.info(
            f"Extracting AWS CUR data",
            extra={
                "org_slug": self.org_slug,
                "bucket": source_bucket,
                "prefix": source_prefix,
                "date": date_filter,
                "format": file_format
            }
        )

        try:
            # Authenticate with AWS
            self._auth = AWSAuthenticator(self.org_slug)
            s3_client = await self._auth.get_s3_client()

            # List CUR files
            files = await self._list_cur_files(
                s3_client, source_bucket, source_prefix, date_filter
            )

            if not files:
                logger.warning(f"No CUR files found for date {date_filter}")
                return {
                    "status": "SUCCESS",
                    "rows": [],
                    "row_count": 0,
                    "message": f"No CUR files found for {date_filter}"
                }

            # Generate lineage metadata
            run_id = str(uuid.uuid4())
            pipeline_id = context.get("pipeline_id", "cloud_cost_aws")
            credential_id = context.get("credential_id", "")
            pipeline_run_date = date_filter or date.today().isoformat()
            ingested_at = datetime.utcnow().isoformat()

            # Extract data from files
            rows = []
            for file_key in files:
                file_rows = await self._extract_file(
                    s3_client, source_bucket, file_key, file_format
                )
                # Add standardized lineage columns to each row
                for row in file_rows:
                    row["x_pipeline_id"] = pipeline_id
                    row["x_credential_id"] = credential_id
                    row["x_pipeline_run_date"] = pipeline_run_date
                    row["x_run_id"] = run_id
                    row["x_ingested_at"] = ingested_at
                rows.extend(file_rows)

            # Store in context for downstream steps
            context["extracted_data"] = rows

            logger.info(
                f"CUR extraction complete",
                extra={
                    "org_slug": self.org_slug,
                    "row_count": len(rows),
                    "file_count": len(files)
                }
            )

            return {
                "status": "SUCCESS",
                "rows": rows,
                "row_count": len(rows),
                "file_count": len(files),
                "source_bucket": source_bucket,
                "date_filter": date_filter
            }

        except Exception as e:
            logger.error(f"CUR extraction failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    async def _list_cur_files(
        self,
        s3_client,
        bucket: str,
        prefix: str,
        date_filter: Optional[str]
    ) -> List[str]:
        """List CUR files in S3 bucket."""
        files = []

        # Build prefix with date if provided
        search_prefix = prefix
        if date_filter:
            # CUR files are typically organized by date
            # Format: prefix/yyyymmdd-yyyymmdd/
            try:
                dt = datetime.strptime(date_filter, "%Y-%m-%d")
                date_prefix = dt.strftime("%Y%m")
                search_prefix = f"{prefix}/{date_prefix}" if prefix else date_prefix
            except ValueError:
                pass

        paginator = s3_client.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=bucket, Prefix=search_prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                # Filter for CUR data files (parquet or csv.gz)
                if key.endswith(".parquet") or key.endswith(".csv.gz") or key.endswith(".csv"):
                    files.append(key)

        return files

    async def _extract_file(
        self,
        s3_client,
        bucket: str,
        key: str,
        file_format: str
    ) -> List[Dict[str, Any]]:
        """Extract data from a single CUR file."""
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response["Body"].read()

        if file_format == "parquet":
            raw_rows = await self._parse_parquet(body)
        else:
            raw_rows = await self._parse_csv(body, key.endswith(".gz"))

        # Map CUR columns to schema columns
        return [self._map_cur_row(row) for row in raw_rows]

    def _map_cur_row(self, cur_row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map AWS CUR column names to schema column names.

        AWS CUR uses naming like:
        - lineItem/UsageAccountId -> linked_account_id
        - lineItem/UnblendedCost -> unblended_cost
        - product/productName -> product_name
        """
        ingestion_ts = datetime.utcnow().isoformat()

        # AWS CUR column name mapping (both Parquet and CSV formats)
        # Parquet uses underscores, CSV uses slashes
        def get_val(key: str, *alt_keys: str):
            """Get value from CUR row, trying multiple key formats."""
            # Try exact key first
            if key in cur_row:
                return cur_row[key]
            # Try with underscores (Parquet format)
            underscore_key = key.replace("/", "_")
            if underscore_key in cur_row:
                return cur_row[underscore_key]
            # Try snake_case version
            snake_key = key.replace("/", "_").lower()
            if snake_key in cur_row:
                return cur_row[snake_key]
            # Try alternative keys
            for alt in alt_keys:
                if alt in cur_row:
                    return cur_row[alt]
                alt_underscore = alt.replace("/", "_")
                if alt_underscore in cur_row:
                    return cur_row[alt_underscore]
            return None

        def safe_float(val) -> float:
            """Safely convert to float."""
            if val is None:
                return 0.0
            try:
                return float(val)
            except (ValueError, TypeError):
                return 0.0

        def safe_date(val) -> str:
            """Extract date from timestamp."""
            if val is None:
                return None
            if isinstance(val, str):
                return val[:10] if len(val) >= 10 else val
            return str(val)[:10] if val else None

        # Map to schema columns
        return {
            # Required fields
            "usage_date": safe_date(get_val("lineItem/UsageStartDate", "line_item_usage_start_date")),
            "org_slug": self.org_slug,
            "provider": "aws",
            "linked_account_id": get_val("lineItem/UsageAccountId", "line_item_usage_account_id") or "",
            "unblended_cost": safe_float(get_val("lineItem/UnblendedCost", "line_item_unblended_cost")),
            "ingestion_timestamp": ingestion_ts,

            # Account info
            "linked_account_name": get_val("lineItem/UsageAccountName", "line_item_usage_account_name"),
            "payer_account_id": get_val("bill/PayerAccountId", "bill_payer_account_id"),

            # Service/Product info
            "service_code": get_val("lineItem/ProductCode", "line_item_product_code"),
            "product_code": get_val("product/ProductCode", "product_product_code"),
            "product_name": get_val("product/productName", "product_product_name"),

            # Usage details
            "usage_type": get_val("lineItem/UsageType", "line_item_usage_type"),
            "operation": get_val("lineItem/Operation", "line_item_operation"),
            "region": get_val("product/region", "product_region"),
            "availability_zone": get_val("lineItem/AvailabilityZone", "line_item_availability_zone"),
            "resource_id": get_val("lineItem/ResourceId", "line_item_resource_id"),
            "line_item_type": get_val("lineItem/LineItemType", "line_item_line_item_type"),

            # Time fields
            "usage_start_time": get_val("lineItem/UsageStartDate", "line_item_usage_start_date"),
            "usage_end_time": get_val("lineItem/UsageEndDate", "line_item_usage_end_date"),

            # Usage amounts
            "usage_amount": safe_float(get_val("lineItem/UsageAmount", "line_item_usage_amount")),
            "usage_unit": get_val("pricing/unit", "pricing_unit"),

            # Cost fields
            "blended_cost": safe_float(get_val("lineItem/BlendedCost", "line_item_blended_cost")),
            "amortized_cost": safe_float(get_val("savingsPlan/SavingsPlanEffectiveCost", "savings_plan_savings_plan_effective_cost")),
            "net_unblended_cost": safe_float(get_val("lineItem/NetUnblendedCost", "line_item_net_unblended_cost")),
            "currency": get_val("lineItem/CurrencyCode", "line_item_currency_code") or "USD",
            "pricing_unit": get_val("pricing/unit", "pricing_unit"),
            "public_on_demand_cost": safe_float(get_val("pricing/publicOnDemandCost", "pricing_public_on_demand_cost")),

            # Reservation/Savings Plan
            "reservation_arn": get_val("reservation/ReservationARN", "reservation_reservation_arn"),
            "savings_plan_arn": get_val("savingsPlan/SavingsPlanARN", "savings_plan_savings_plan_arn"),
            "discount_amount": safe_float(get_val("discount/TotalDiscount", "discount_total_discount")),

            # Billing period
            "invoice_id": get_val("bill/InvoiceId", "bill_invoice_id"),
            "billing_period_start": safe_date(get_val("bill/BillingPeriodStartDate", "bill_billing_period_start_date")),
            "billing_period_end": safe_date(get_val("bill/BillingPeriodEndDate", "bill_billing_period_end_date")),

            # Tags and categories
            "resource_tags_json": self._extract_tags(cur_row),
            "cost_category_json": self._extract_cost_categories(cur_row),
        }

    def _extract_tags(self, cur_row: Dict[str, Any]) -> str:
        """Extract resource tags from CUR row as JSON string."""
        import json
        tags = {}
        for key, value in cur_row.items():
            # Tags are prefixed with "resourceTags/" or "resource_tags_"
            if key.startswith("resourceTags/") or key.startswith("resource_tags_"):
                tag_name = key.split("/")[-1] if "/" in key else key.replace("resource_tags_", "")
                if value:
                    tags[tag_name] = value
        return json.dumps(tags) if tags else None

    def _extract_cost_categories(self, cur_row: Dict[str, Any]) -> str:
        """Extract cost categories from CUR row as JSON string."""
        import json
        categories = {}
        for key, value in cur_row.items():
            # Cost categories are prefixed with "costCategory/"
            if key.startswith("costCategory/") or key.startswith("cost_category_"):
                cat_name = key.split("/")[-1] if "/" in key else key.replace("cost_category_", "")
                if value:
                    categories[cat_name] = value
        return json.dumps(categories) if categories else None

    async def _parse_parquet(self, data: bytes) -> List[Dict[str, Any]]:
        """Parse Parquet file."""
        try:
            import pyarrow.parquet as pq
            table = pq.read_table(io.BytesIO(data))
            return table.to_pylist()
        except ImportError:
            logger.warning("pyarrow not installed, cannot parse Parquet")
            return []

    async def _parse_csv(self, data: bytes, is_gzip: bool) -> List[Dict[str, Any]]:
        """Parse CSV file (optionally gzipped)."""
        import csv
        import gzip

        if is_gzip:
            data = gzip.decompress(data)

        reader = csv.DictReader(io.StringIO(data.decode("utf-8")))
        return list(reader)


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    org_slug = context.get("org_slug")
    if not org_slug:
        return {"status": "FAILED", "error": "org_slug is required"}

    extractor = AWSCURExtractor(org_slug)
    return await extractor.execute(step_config, context)


def get_engine():
    """Factory function for pipeline executor."""
    return AWSCURExtractor()
