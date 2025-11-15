"""
Celery Application Configuration
Distributed task queue for async pipeline execution.
"""

from celery import Celery
from kombu import Exchange, Queue

from src.app.config import settings

# Create Celery app
celery_app = Celery(
    "convergence_pipeline",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=settings.celery_task_track_started,
    task_time_limit=settings.celery_task_time_limit,
    task_soft_time_limit=settings.celery_task_time_limit - 60,
    worker_prefetch_multiplier=1,  # One task at a time for better control
    worker_max_tasks_per_child=100,  # Recycle workers to prevent memory leaks
    task_acks_late=True,  # Acknowledge tasks after completion
    task_reject_on_worker_lost=True,  # Retry if worker crashes
)

# Define task queues
celery_app.conf.task_default_queue = "default"
celery_app.conf.task_queues = (
    Queue("default", Exchange("default"), routing_key="default"),
    Queue("pipeline", Exchange("pipeline"), routing_key="pipeline.*"),
    Queue("ingest", Exchange("ingest"), routing_key="ingest.*"),
    Queue("dq", Exchange("dq"), routing_key="dq.*"),
    Queue("transform", Exchange("transform"), routing_key="transform.*"),
)

# Task routing
celery_app.conf.task_routes = {
    "src.core.workers.pipeline_task.*": {"queue": "pipeline"},
    "src.core.workers.ingest_task.*": {"queue": "ingest"},
    "src.core.workers.dq_task.*": {"queue": "dq"},
    "src.core.workers.transform_task.*": {"queue": "transform"},
}

# Auto-discover tasks
celery_app.autodiscover_tasks([
    "src.core.workers"
])

if __name__ == "__main__":
    celery_app.start()
