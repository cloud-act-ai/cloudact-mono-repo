"""
Query performance logging and monitoring utilities.

Provides decorators and utilities to track BigQuery query performance,
log slow queries, and collect metrics.

Features:
- Automatic query timing
- Slow query logging (configurable threshold)
- Query execution metrics
- Integration with Prometheus metrics
"""

import time
import logging
from typing import Callable, Optional
from functools import wraps

logger = logging.getLogger(__name__)

# Slow query threshold in seconds
SLOW_QUERY_THRESHOLD_SECONDS = 2.0


def log_query_performance(
    query_name: Optional[str] = None,
    slow_threshold_seconds: float = SLOW_QUERY_THRESHOLD_SECONDS
):
    """
    Decorator to log query performance.

    Logs execution time for all queries and warns on slow queries.

    Args:
        query_name: Name of the query (default: function name)
        slow_threshold_seconds: Threshold in seconds to log as slow query (default: 2.0)

    Example:
        @log_query_performance(query_name="get_all_plans", slow_threshold_seconds=2.0)
        async def get_all_plans(org_slug: str):
            # BigQuery query here
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            name = query_name or func.__name__
            start_time = time.time()

            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start_time

                # Log performance
                log_level = logging.WARNING if duration >= slow_threshold_seconds else logging.DEBUG
                logger.log(
                    log_level,
                    f"Query '{name}' completed in {duration:.3f}s",
                    extra={
                        "query_name": name,
                        "duration_seconds": round(duration, 3),
                        "is_slow": duration >= slow_threshold_seconds
                    }
                )

                # Log slow queries prominently
                if duration >= slow_threshold_seconds:
                    logger.warning(
                        f"SLOW QUERY DETECTED: '{name}' took {duration:.3f}s (threshold: {slow_threshold_seconds}s)",
                        extra={
                            "query_name": name,
                            "duration_seconds": round(duration, 3),
                            "threshold_seconds": slow_threshold_seconds
                        }
                    )

                return result

            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"Query '{name}' failed after {duration:.3f}s: {e}",
                    extra={
                        "query_name": name,
                        "duration_seconds": round(duration, 3),
                        "error": str(e)
                    },
                    exc_info=True
                )
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            name = query_name or func.__name__
            start_time = time.time()

            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time

                # Log performance
                log_level = logging.WARNING if duration >= slow_threshold_seconds else logging.DEBUG
                logger.log(
                    log_level,
                    f"Query '{name}' completed in {duration:.3f}s",
                    extra={
                        "query_name": name,
                        "duration_seconds": round(duration, 3),
                        "is_slow": duration >= slow_threshold_seconds
                    }
                )

                # Log slow queries prominently
                if duration >= slow_threshold_seconds:
                    logger.warning(
                        f"SLOW QUERY DETECTED: '{name}' took {duration:.3f}s (threshold: {slow_threshold_seconds}s)",
                        extra={
                            "query_name": name,
                            "duration_seconds": round(duration, 3),
                            "threshold_seconds": slow_threshold_seconds
                        }
                    )

                return result

            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"Query '{name}' failed after {duration:.3f}s: {e}",
                    extra={
                        "query_name": name,
                        "duration_seconds": round(duration, 3),
                        "error": str(e)
                    },
                    exc_info=True
                )
                raise

        # Return appropriate wrapper based on whether function is async
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


class QueryTimer:
    """
    Context manager for timing query execution.

    Usage:
        with QueryTimer("my_query") as timer:
            result = bq_client.query(query).result()
        print(f"Query took {timer.duration_ms}ms")
    """

    def __init__(self, query_name: str, slow_threshold_seconds: float = SLOW_QUERY_THRESHOLD_SECONDS):
        self.query_name = query_name
        self.slow_threshold_seconds = slow_threshold_seconds
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.duration_seconds: Optional[float] = None
        self.duration_ms: Optional[float] = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.time()
        self.duration_seconds = self.end_time - self.start_time
        self.duration_ms = self.duration_seconds * 1000

        if exc_type is None:
            # Query succeeded
            if self.duration_seconds >= self.slow_threshold_seconds:
                logger.warning(
                    f"SLOW QUERY: '{self.query_name}' took {self.duration_seconds:.3f}s",
                    extra={
                        "query_name": self.query_name,
                        "duration_seconds": round(self.duration_seconds, 3),
                        "duration_ms": round(self.duration_ms, 2)
                    }
                )
            else:
                logger.debug(
                    f"Query '{self.query_name}' completed in {self.duration_seconds:.3f}s",
                    extra={
                        "query_name": self.query_name,
                        "duration_seconds": round(self.duration_seconds, 3),
                        "duration_ms": round(self.duration_ms, 2)
                    }
                )
        else:
            # Query failed
            logger.error(
                f"Query '{self.query_name}' failed after {self.duration_seconds:.3f}s",
                extra={
                    "query_name": self.query_name,
                    "duration_seconds": round(self.duration_seconds, 3),
                    "duration_ms": round(self.duration_ms, 2),
                    "error": str(exc_val)
                }
            )

        return False  # Don't suppress exceptions


def log_bigquery_job_stats(job, query_name: str):
    """
    Log BigQuery job statistics for performance analysis.

    Args:
        job: BigQuery job object
        query_name: Name of the query for logging

    Example:
        job = bq_client.client.query(query)
        result = job.result()
        log_bigquery_job_stats(job, "get_all_plans")
    """
    if not hasattr(job, 'query_plan'):
        return

    try:
        # Extract job statistics
        stats = {
            "query_name": query_name,
            "total_bytes_processed": job.total_bytes_processed,
            "total_bytes_billed": job.total_bytes_billed,
            "cache_hit": job.cache_hit,
            "num_dml_affected_rows": job.num_dml_affected_rows,
            "slot_millis": job.slot_millis,
        }

        if job.timeline:
            stats["elapsed_ms"] = job.timeline[-1].elapsed_ms

        logger.info(
            f"BigQuery job stats for '{query_name}'",
            extra=stats
        )

        # Warn on expensive queries
        bytes_gb = job.total_bytes_billed / (1024 ** 3) if job.total_bytes_billed else 0
        if bytes_gb > 1.0:
            logger.warning(
                f"Expensive query: '{query_name}' billed {bytes_gb:.2f} GB",
                extra={
                    "query_name": query_name,
                    "bytes_billed_gb": round(bytes_gb, 2)
                }
            )

    except Exception as e:
        logger.debug(f"Failed to log BigQuery job stats: {e}")
