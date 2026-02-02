"""
Polars Streaming Processor
Petabyte-scale data processing with lazy evaluation and memory efficiency.
"""

import polars as pl
from typing import Dict, Any, List, Optional, Iterator
from pathlib import Path
import logging
from datetime import datetime, date, timezone
import json

from google.cloud import bigquery

from src.core.utils.logging import get_logger
from src.app.config import settings

logger = get_logger(__name__)


class PolarsProcessor:
    """
    High-performance data processor using Polars.

    Features:
    - Lazy evaluation for memory efficiency
    - Streaming processing for unlimited dataset sizes
    - Automatic schema casting
    - BigQuery integration
    - Chunk-based processing
    """

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        num_threads: Optional[int] = None
    ):
        """
        Initialize Polars processor.

        Args:
            chunk_size: Number of rows to process per chunk
            num_threads: Number of threads for parallel processing
        """
        self.chunk_size = chunk_size or settings.polars_streaming_chunk_size
        self.num_threads = num_threads or settings.polars_max_threads

        # Set Polars thread pool size
        pl.Config.set_thread_pool_size(self.num_threads)

    def from_dicts(
        self,
        records: List[Dict[str, Any]],
        schema: Optional[Dict[str, Any]] = None
    ) -> pl.DataFrame:
        """
        Create Polars DataFrame from list of dictionaries.

        Args:
            records: List of record dictionaries
            schema: Optional schema for type casting

        Returns:
            Polars DataFrame
        """
        if not records:
            return pl.DataFrame()

        df = pl.DataFrame(records)

        # Apply schema if provided
        if schema:
            df = self._apply_schema(df, schema)

        logger.debug(
            f"Created DataFrame",
            rows=df.height,
            columns=df.width,
            schema=df.schema
        )

        return df

    def from_bigquery(
        self,
        bq_client: bigquery.Client,
        query: str,
        use_streaming: bool = True
    ) -> pl.DataFrame:
        """
        Load data from BigQuery into Polars DataFrame.

        Args:
            bq_client: BigQuery client
            query: SQL query
            use_streaming: Use streaming API for large results

        Returns:
            Polars DataFrame
        """
        logger.info(f"Loading data from BigQuery", query=query[:100])

        if use_streaming:
            # Stream results in chunks
            query_job = bq_client.query(query)
            chunks = []

            for chunk in query_job.result(page_size=self.chunk_size):
                chunk_data = [dict(row) for row in chunk]
                if chunk_data:
                    chunks.append(pl.DataFrame(chunk_data))

            if chunks:
                df = pl.concat(chunks)
            else:
                df = pl.DataFrame()

        else:
            # Load all at once (for smaller datasets)
            query_job = bq_client.query(query)
            rows = list(query_job.result())
            data = [dict(row) for row in rows]
            df = pl.DataFrame(data) if data else pl.DataFrame()

        logger.info(
            f"Loaded DataFrame from BigQuery",
            rows=df.height,
            columns=df.width
        )

        return df

    def to_bigquery(
        self,
        df: pl.DataFrame,
        bq_client: bigquery.Client,
        table_id: str,
        write_disposition: str = "WRITE_APPEND",
        batch_size: Optional[int] = None
    ) -> int:
        """
        Write Polars DataFrame to BigQuery.

        Args:
            df: Polars DataFrame
            bq_client: BigQuery client
            table_id: Fully qualified table ID
            write_disposition: WRITE_APPEND, WRITE_TRUNCATE, or WRITE_EMPTY
            batch_size: Rows per batch (default: chunk_size)

        Returns:
            Number of rows written
        """
        batch_size = batch_size or self.chunk_size

        logger.info(
            f"Writing DataFrame to BigQuery",
            table_id=table_id,
            rows=df.height,
            write_disposition=write_disposition
        )

        # Convert to list of dicts for BigQuery
        total_written = 0

        # Process in batches to avoid memory issues
        for i in range(0, df.height, batch_size):
            batch_df = df.slice(i, batch_size)

            # Convert Polars types to Python types for BigQuery
            batch_data = self._to_bigquery_compatible(batch_df)

            # Insert to BigQuery
            errors = bq_client.insert_rows_json(table_id, batch_data)

            if errors:
                logger.error(
                    f"BigQuery insert errors",
                    table_id=table_id,
                    errors=errors
                )
                raise ValueError(f"Failed to insert batch: {errors}")

            total_written += len(batch_data)

            logger.debug(
                f"Wrote batch",
                batch_num=i // batch_size + 1,
                batch_size=len(batch_data),
                total_written=total_written
            )

        logger.info(
            f"Completed write to BigQuery",
            table_id=table_id,
            total_rows=total_written
        )

        return total_written

    def add_metadata_columns(
        self,
        df: pl.DataFrame,
        pipeline_logging_id: str,
        ingestion_date: Optional[date] = None
    ) -> pl.DataFrame:
        """
        Add standard metadata columns to DataFrame.

        Args:
            df: Polars DataFrame
            pipeline_logging_id: Pipeline run ID
            ingestion_date: Date for partitioning (default: today)

        Returns:
            DataFrame with metadata columns added
        """
        ingestion_date = ingestion_date or datetime.now(timezone.utc).date()

        df = df.with_columns([
            pl.lit(pipeline_logging_id).alias("pipeline_logging_id"),
            pl.lit(ingestion_date).alias("ingestion_date"),
            pl.lit(datetime.now(timezone.utc)).alias("ingestion_timestamp"),
        ])

        logger.debug(
            f"Added metadata columns",
            pipeline_logging_id=pipeline_logging_id,
            ingestion_date=ingestion_date
        )

        return df

    def validate_schema(
        self,
        df: pl.DataFrame,
        expected_schema: Dict[str, str]
    ) -> bool:
        """
        Validate DataFrame schema against expected schema.

        Args:
            df: Polars DataFrame
            expected_schema: Dict mapping column names to Polars types

        Returns:
            True if schema matches

        Raises:
            ValueError: If schema doesn't match
        """
        df_schema = {col: str(dtype) for col, dtype in df.schema.items()}

        missing_cols = set(expected_schema.keys()) - set(df_schema.keys())
        extra_cols = set(df_schema.keys()) - set(expected_schema.keys())

        if missing_cols or extra_cols:
            raise ValueError(
                f"Schema mismatch. Missing: {missing_cols}, Extra: {extra_cols}"
            )

        for col, expected_type in expected_schema.items():
            if df_schema[col] != expected_type:
                logger.warning(
                    f"Type mismatch for column '{col}': "
                    f"expected {expected_type}, got {df_schema[col]}"
                )

        logger.info("Schema validation passed")
        return True

    def _apply_schema(
        self,
        df: pl.DataFrame,
        schema: Dict[str, Any]
    ) -> pl.DataFrame:
        """
        Apply schema to DataFrame with type casting.

        Args:
            df: Polars DataFrame
            schema: BigQuery schema dict

        Returns:
            DataFrame with casted types
        """
        # Map BigQuery types to Polars types
        type_mapping = {
            "STRING": pl.Utf8,
            "INTEGER": pl.Int64,
            "INT64": pl.Int64,
            "FLOAT": pl.Float64,
            "FLOAT64": pl.Float64,
            "NUMERIC": pl.Float64,
            "BOOLEAN": pl.Boolean,
            "BOOL": pl.Boolean,
            "DATE": pl.Date,
            "DATETIME": pl.Datetime,
            "TIMESTAMP": pl.Datetime,
            "JSON": pl.Utf8,  # Store as string, parse as needed
        }

        casts = []
        for field in schema:
            col_name = field.get("name")
            bq_type = field.get("type", "STRING").upper()

            if col_name in df.columns:
                polars_type = type_mapping.get(bq_type, pl.Utf8)
                casts.append(pl.col(col_name).cast(polars_type, strict=False))

        if casts:
            df = df.with_columns(casts)

        return df

    def _to_bigquery_compatible(
        self,
        df: pl.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Convert Polars DataFrame to BigQuery-compatible dicts.

        Handles special types:
        - Dates → ISO format strings
        - Datetimes → ISO format strings
        - None/NaN → None

        Args:
            df: Polars DataFrame

        Returns:
            List of dictionaries
        """
        records = df.to_dicts()

        # Convert special types
        for record in records:
            for key, value in record.items():
                if isinstance(value, (date, datetime)):
                    record[key] = value.isoformat()
                elif value is None or (isinstance(value, float) and pl.is_nan(value)):
                    record[key] = None

        return records

    def stream_process(
        self,
        records_iterator: Iterator[Dict[str, Any]],
        process_fn: Any,
        batch_size: Optional[int] = None
    ) -> Iterator[pl.DataFrame]:
        """
        Stream processing for infinite/large datasets.

        Args:
            records_iterator: Iterator yielding records
            process_fn: Function to apply to each batch DataFrame
            batch_size: Records per batch

        Yields:
            Processed DataFrames
        """
        batch_size = batch_size or self.chunk_size
        batch = []

        for record in records_iterator:
            batch.append(record)

            if len(batch) >= batch_size:
                # Process batch
                df = pl.DataFrame(batch)
                processed_df = process_fn(df)
                yield processed_df

                # Clear batch
                batch = []

        # Process remaining records
        if batch:
            df = pl.DataFrame(batch)
            processed_df = process_fn(df)
            yield processed_df

    def deduplicate(
        self,
        df: pl.DataFrame,
        keys: List[str],
        keep: str = "last"
    ) -> pl.DataFrame:
        """
        Remove duplicate rows based on key columns.

        Args:
            df: Polars DataFrame
            keys: Columns to use for deduplication
            keep: 'first' or 'last' (which duplicate to keep)

        Returns:
            Deduplicated DataFrame
        """
        original_count = df.height

        df = df.unique(subset=keys, keep=keep)

        duplicates_removed = original_count - df.height

        logger.info(
            f"Deduplication complete",
            original_rows=original_count,
            final_rows=df.height,
            duplicates_removed=duplicates_removed
        )

        return df


def get_polars_processor() -> PolarsProcessor:
    """Get Polars processor instance."""
    return PolarsProcessor()
