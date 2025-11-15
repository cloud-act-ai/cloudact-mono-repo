"""
OpenTelemetry Distributed Tracing Setup
Configures tracing for Cloud Trace integration.
"""

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

from src.app.config import settings


def setup_telemetry():
    """
    Initialize OpenTelemetry with Cloud Trace exporter.
    Automatically instruments FastAPI and requests library.
    """
    # Create tracer provider
    tracer_provider = TracerProvider()

    # Add Cloud Trace exporter
    cloud_trace_exporter = CloudTraceSpanExporter(
        project_id=settings.gcp_project_id
    )

    # Add batch span processor
    tracer_provider.add_span_processor(
        BatchSpanProcessor(cloud_trace_exporter)
    )

    # Set global tracer provider
    trace.set_tracer_provider(tracer_provider)

    # Auto-instrument FastAPI
    FastAPIInstrumentor.instrument()

    # Auto-instrument requests library
    RequestsInstrumentor().instrument()


def get_tracer(name: str) -> trace.Tracer:
    """
    Get a tracer instance.

    Args:
        name: Tracer name (typically __name__)

    Returns:
        Tracer instance
    """
    return trace.get_tracer(name)
