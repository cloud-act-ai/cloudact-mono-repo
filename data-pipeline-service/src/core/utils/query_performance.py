"""
BigQuery Query Performance Monitoring

Provides utilities for tracking query performance metrics including:
- Query execution time
- Bytes processed
- Bytes billed
- Slot milliseconds consumed
- Cache hit status

Usage:
    from src.core.utils.query_performance import log_query_performance, QueryPerformanceMonitor

    # Option 1: Decorator
    @log_query_performance(operation="list_pricing")
    def my_query_function():
        result = client.query(query, job_config=config).result()
        return result

    # Option 2: Context manager
    with QueryPerformanceMonitor(operation="bulk_update") as monitor:
        result = client.query(query, job_config=config).result()
        monitor.set_query_job(result._query_job)

    # Option 3: Manual logging
    result = client.query(query, job_config=config).result()
    log_query_metrics(result._query_job, operation="manual_query")
"""

import logging
import time
from typing import Optional, Dict, Any
from functools import wraps
from contextlib import contextmanager
from google.cloud import bigquery

logger = logging.getLogger(__name__)


def log_query_metrics(
    query_job: bigquery.QueryJob,
    operation: str,
    org_slug: Optional[str] = None,
    additional_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Log query performance metrics from a BigQuery job.

    Args:
        query_job: Completed BigQuery query job
        operation: Name of the operation (e.g., "list_pricing", "bulk_update")
        org_slug: Organization slug for multi-tenant tracking
        additional_context: Additional metadata to log

    Returns:
        Dictionary of performance metrics
    """
    try:
        # Extract performance metrics
        metrics = {
            "operation": operation,
            "org_slug": org_slug,
            "job_id": query_job.job_id,
            "total_bytes_processed": query_job.total_bytes_processed or 0,
            "total_bytes_billed": query_job.total_bytes_billed or 0,
            "slot_millis": query_job.slot_millis or 0,
            "cache_hit": query_job.cache_hit,
            "num_dml_affected_rows": query_job.num_dml_affected_rows,
        }

        # Calculate execution time if available
        if query_job.started and query_job.ended:
            execution_time_ms = (query_job.ended - query_job.started).total_seconds() * 1000
            metrics["execution_time_ms"] = round(execution_time_ms, 2)
        else:
            metrics["execution_time_ms"] = None

        # Add additional context
        if additional_context:
            metrics.update(additional_context)

        # Determine log level based on performance
        bytes_gb = metrics["total_bytes_processed"] / (1024 ** 3)
        exec_time_sec = metrics.get("execution_time_ms", 0) / 1000

        # Log warnings for expensive queries
        if bytes_gb > 1.0:  # More than 1 GB processed
            logger.warning(
                f"Large query detected: {operation} processed {bytes_gb:.2f} GB",
                extra=metrics
            )
        elif exec_time_sec > 10.0:  # Slower than 10 seconds
            logger.warning(
                f"Slow query detected: {operation} took {exec_time_sec:.2f}s",
                extra=metrics
            )
        else:
            logger.info(
                f"Query performance: {operation}",
                extra=metrics
            )

        return metrics

    except Exception as e:
        logger.error(f"Error logging query metrics for {operation}: {e}", exc_info=True)
        return {}


def log_query_performance(operation: str, org_slug: Optional[str] = None):
    """
    Decorator to automatically log query performance metrics.

    Usage:
        @log_query_performance(operation="list_subscriptions")
        def get_subscriptions():
            result = client.query(query).result()
            return result

    Args:
        operation: Name of the operation
        org_slug: Optional organization slug
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)

                # Try to extract query job from result
                if hasattr(result, '_query_job'):
                    log_query_metrics(
                        result._query_job,
                        operation=operation,
                        org_slug=org_slug or kwargs.get('org_slug')
                    )
                elif hasattr(result, 'query_job'):
                    log_query_metrics(
                        result.query_job,
                        operation=operation,
                        org_slug=org_slug or kwargs.get('org_slug')
                    )
                else:
                    # Fallback: log execution time only
                    execution_time = (time.time() - start_time) * 1000
                    logger.info(
                        f"Query performance: {operation} (no job object)",
                        extra={
                            "operation": operation,
                            "execution_time_ms": round(execution_time, 2),
                            "org_slug": org_slug or kwargs.get('org_slug')
                        }
                    )

                return result

            except Exception as e:
                execution_time = (time.time() - start_time) * 1000
                logger.error(
                    f"Query failed: {operation}",
                    extra={
                        "operation": operation,
                        "execution_time_ms": round(execution_time, 2),
                        "org_slug": org_slug or kwargs.get('org_slug'),
                        "error": str(e)
                    },
                    exc_info=True
                )
                raise

        return wrapper
    return decorator


class QueryPerformanceMonitor:
    """
    Context manager for monitoring query performance.

    Usage:
        with QueryPerformanceMonitor(operation="complex_query", org_slug="acme") as monitor:
            result = client.query(query).result()
            monitor.set_query_job(result._query_job)
            # or monitor.set_result(result)
    """

    def __init__(
        self,
        operation: str,
        org_slug: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ):
        self.operation = operation
        self.org_slug = org_slug
        self.additional_context = additional_context or {}
        self.query_job: Optional[bigquery.QueryJob] = None
        self.start_time: Optional[float] = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            # Query failed
            execution_time = (time.time() - self.start_time) * 1000
            logger.error(
                f"Query failed: {self.operation}",
                extra={
                    "operation": self.operation,
                    "execution_time_ms": round(execution_time, 2),
                    "org_slug": self.org_slug,
                    "error": str(exc_val),
                    **self.additional_context
                },
                exc_info=True
            )
            return False

        # Query succeeded - log metrics
        if self.query_job:
            log_query_metrics(
                self.query_job,
                operation=self.operation,
                org_slug=self.org_slug,
                additional_context=self.additional_context
            )
        else:
            # No query job set - log execution time only
            execution_time = (time.time() - self.start_time) * 1000
            logger.info(
                f"Query performance: {self.operation} (no job set)",
                extra={
                    "operation": self.operation,
                    "execution_time_ms": round(execution_time, 2),
                    "org_slug": self.org_slug,
                    **self.additional_context
                }
            )

    def set_query_job(self, query_job: bigquery.QueryJob):
        """Set the query job for metrics logging."""
        self.query_job = query_job

    def set_result(self, result):
        """Set the query job from a result object."""
        if hasattr(result, '_query_job'):
            self.query_job = result._query_job
        elif hasattr(result, 'query_job'):
            self.query_job = result.query_job


# Query performance thresholds (configurable)
PERFORMANCE_THRESHOLDS = {
    "warn_bytes_gb": 1.0,  # Warn if query processes more than 1 GB
    "warn_execution_sec": 10.0,  # Warn if query takes more than 10 seconds
    "alert_bytes_gb": 10.0,  # Alert if query processes more than 10 GB
    "alert_execution_sec": 60.0,  # Alert if query takes more than 60 seconds
}


def check_performance_thresholds(metrics: Dict[str, Any]) -> str:
    """
    Check if query metrics exceed performance thresholds.

    Args:
        metrics: Query performance metrics

    Returns:
        Status: "ok", "warn", or "alert"
    """
    bytes_gb = metrics.get("total_bytes_processed", 0) / (1024 ** 3)
    exec_time_sec = metrics.get("execution_time_ms", 0) / 1000

    if (bytes_gb >= PERFORMANCE_THRESHOLDS["alert_bytes_gb"] or
            exec_time_sec >= PERFORMANCE_THRESHOLDS["alert_execution_sec"]):
        return "alert"
    elif (bytes_gb >= PERFORMANCE_THRESHOLDS["warn_bytes_gb"] or
            exec_time_sec >= PERFORMANCE_THRESHOLDS["warn_execution_sec"]):
        return "warn"
    else:
        return "ok"
