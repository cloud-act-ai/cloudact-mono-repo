"""
Prometheus Metrics - Pipeline Observability
Tracks pipeline executions, durations, active pipelines, and quota utilization.
"""

from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, generate_latest
from typing import Optional

# Create a custom registry for application metrics
metrics_registry = CollectorRegistry()

# ====================
# Metrics Definitions
# ====================

# Counter: Total pipeline executions by tenant, pipeline, and status
pipeline_executions_total = Counter(
    'pipeline_executions_total',
    'Total number of pipeline executions',
    ['tenant_id', 'pipeline_id', 'status'],
    registry=metrics_registry
)

# Histogram: Pipeline execution duration in seconds
pipeline_duration_seconds = Histogram(
    'pipeline_duration_seconds',
    'Pipeline execution duration in seconds',
    ['tenant_id', 'pipeline_id', 'status'],
    buckets=(1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600),  # 1s to 1h
    registry=metrics_registry
)

# Gauge: Number of currently active pipelines
active_pipelines = Gauge(
    'active_pipelines',
    'Number of currently running pipelines',
    ['tenant_id'],
    registry=metrics_registry
)

# Gauge: Quota utilization percentage (0-100)
quota_utilization = Gauge(
    'quota_utilization',
    'Percentage of quota utilized',
    ['tenant_id', 'quota_type'],
    registry=metrics_registry
)

# ====================
# Helper Functions
# ====================

def increment_pipeline_execution(
    tenant_id: str,
    pipeline_id: str,
    status: str
) -> None:
    """
    Increment pipeline execution counter.

    Args:
        tenant_id: Tenant identifier
        pipeline_id: Pipeline identifier
        status: Execution status (COMPLETED, FAILED, TIMEOUT)
    """
    pipeline_executions_total.labels(
        tenant_id=tenant_id,
        pipeline_id=pipeline_id,
        status=status
    ).inc()


def observe_pipeline_duration(
    tenant_id: str,
    pipeline_id: str,
    status: str,
    duration_seconds: float
) -> None:
    """
    Record pipeline execution duration.

    Args:
        tenant_id: Tenant identifier
        pipeline_id: Pipeline identifier
        status: Execution status (COMPLETED, FAILED, TIMEOUT)
        duration_seconds: Duration in seconds
    """
    pipeline_duration_seconds.labels(
        tenant_id=tenant_id,
        pipeline_id=pipeline_id,
        status=status
    ).observe(duration_seconds)


def set_active_pipelines(tenant_id: str, count: int) -> None:
    """
    Set the number of active pipelines for a tenant.

    Args:
        tenant_id: Tenant identifier
        count: Number of active pipelines
    """
    active_pipelines.labels(tenant_id=tenant_id).set(count)


def set_quota_utilization(
    tenant_id: str,
    quota_type: str,
    percentage: float
) -> None:
    """
    Set quota utilization percentage.

    Args:
        tenant_id: Tenant identifier
        quota_type: Type of quota (pipelines_daily, concurrent, storage)
        percentage: Utilization percentage (0-100)
    """
    quota_utilization.labels(
        tenant_id=tenant_id,
        quota_type=quota_type
    ).set(percentage)


def get_metrics() -> bytes:
    """
    Generate Prometheus metrics in text format.

    Returns:
        Metrics in Prometheus exposition format
    """
    return generate_latest(metrics_registry)
