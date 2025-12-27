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

    def __init__(self, org_slug: str):
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
            return await self._parse_parquet(body)
        else:
            return await self._parse_csv(body, key.endswith(".gz"))

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
    return AWSCURExtractor
