"""
OpenTelemetry Distributed Tracing Setup
Configures tracing for Cloud Trace integration.

Note: Requires opentelemetry packages to be installed.
If packages are not available, functions will be no-ops.
"""

# Optional OpenTelemetry imports
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor
    TELEMETRY_AVAILABLE = True
except ImportError:
    TELEMETRY_AVAILABLE = False
    # Stub classes for when telemetry is not available
    trace = None
    TracerProvider = None
    BatchSpanProcessor = None
    CloudTraceSpanExporter = None
    FastAPIInstrumentor = None
    RequestsInstrumentor = None

from src.app.config import settings


def setup_telemetry():
    """
    Initialize OpenTelemetry with Cloud Trace exporter.
    Automatically instruments FastAPI and requests library.

    No-op if OpenTelemetry packages are not installed.
    """
    if not TELEMETRY_AVAILABLE:
        raise ImportError(
            "OpenTelemetry packages not installed. "
            "Install with: pip install opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-requests"
        )

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


def get_tracer(name: str):
    """
    Get a tracer instance.

    Args:
        name: Tracer name (typically __name__)

    Returns:
        Tracer instance, or None if telemetry is not available
    """
    if not TELEMETRY_AVAILABLE or trace is None:
        return None
    return trace.get_tracer(name)
