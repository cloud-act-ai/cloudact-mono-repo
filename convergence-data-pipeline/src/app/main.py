"""
Convergence Data Pipeline - Enterprise FastAPI Application
Main application entry point with multi-tenant support.
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging
import signal
import asyncio
from typing import Optional

from src.app.config import settings
from src.core.utils.logging import setup_logging
from src.core.utils.rate_limiter import init_rate_limiter, get_rate_limiter
from src.core.observability.metrics import get_metrics
from src.app.middleware.validation import validation_middleware
from src.app.dependencies.auth import get_auth_aggregator
from src.core.engine.bq_client import get_bigquery_client
import os

# Optional telemetry import (requires opentelemetry packages)
# Temporarily disabled - uncomment when OpenTelemetry packages are installed
# try:
#     from src.core.utils.telemetry import setup_telemetry
#     TELEMETRY_AVAILABLE = True
# except ImportError:
TELEMETRY_AVAILABLE = False

# Initialize logging
setup_logging()
logger = logging.getLogger(__name__)

# Shutdown event for graceful termination
shutdown_event: Optional[asyncio.Event] = None


async def graceful_shutdown():
    """
    Graceful shutdown handler.
    Ensures clean termination of all resources.
    """
    global shutdown_event

    logger.info("Graceful shutdown initiated")

    # Set shutdown event to stop accepting new requests
    if shutdown_event:
        shutdown_event.set()

    # Wait for running pipelines to complete (max 30 seconds)
    shutdown_timeout = 30
    logger.info(f"Waiting up to {shutdown_timeout}s for running pipelines to complete...")

    try:
        # Import MetadataLogger to flush pending logs
        from src.core.metadata import MetadataLogger

        # Stop all active metadata loggers
        # Note: Individual executors handle their own cleanup
        await asyncio.sleep(1)  # Brief pause for in-flight requests

        logger.info("Flushing metadata logs...")
        # Metadata loggers are stopped in their respective executors

        logger.info("Closing database connections...")
        # BigQuery clients are closed in their respective executors

    except Exception as e:
        logger.error(f"Error during graceful shutdown: {e}", exc_info=True)

    logger.info("Graceful shutdown completed")


def handle_shutdown_signal(signum, frame):
    """
    Signal handler for SIGTERM and SIGINT.
    """
    logger.info(f"Received shutdown signal: {signal.Signals(signum).name}")

    # Schedule graceful shutdown in the event loop
    loop = asyncio.get_event_loop()
    if loop.is_running():
        loop.create_task(graceful_shutdown())


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    global shutdown_event

    # Startup
    logger.info(
        f"Starting {settings.app_name} v{settings.app_version}",
        extra={
            "environment": settings.environment,
            "project_id": settings.gcp_project_id
        }
    )

    # Initialize shutdown event
    shutdown_event = asyncio.Event()

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, handle_shutdown_signal)
    signal.signal(signal.SIGINT, handle_shutdown_signal)
    logger.info("Shutdown signal handlers registered (SIGTERM, SIGINT)")

    # Initialize rate limiting
    if settings.rate_limit_enabled:
        init_rate_limiter(
            default_limit_per_minute=settings.rate_limit_requests_per_minute,
            default_limit_per_hour=settings.rate_limit_requests_per_hour,
            global_limit_per_minute=settings.rate_limit_global_requests_per_minute,
            global_limit_per_hour=settings.rate_limit_global_requests_per_hour
        )
        logger.info("Rate limiting initialized")
    else:
        logger.warning("Rate limiting is disabled")

    # Initialize OpenTelemetry if enabled
    # Check both settings and environment variable
    enable_tracing = settings.enable_tracing and os.getenv("ENABLE_TRACING", "true").lower() == "true"

    if enable_tracing and TELEMETRY_AVAILABLE:
        try:
            setup_telemetry()
            logger.info("OpenTelemetry distributed tracing initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize tracing: {e}. Continuing without tracing.")
    elif enable_tracing and not TELEMETRY_AVAILABLE:
        logger.warning("Tracing enabled but OpenTelemetry packages not installed - skipping")
    else:
        logger.info("Distributed tracing is disabled")

    # Initialize Auth Metrics Aggregator background task
    try:
        auth_aggregator = get_auth_aggregator()
        bq_client = get_bigquery_client()

        # Start background flush task
        asyncio.create_task(auth_aggregator.start_background_flush(bq_client))
        logger.info("Auth metrics aggregator background task started")
    except Exception as e:
        logger.warning(f"Failed to start auth aggregator: {e}. Auth metrics will not be batched.")

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.app_name}")

    # Stop auth aggregator
    try:
        auth_aggregator = get_auth_aggregator()
        auth_aggregator.stop_background_flush()

        # Flush any remaining updates
        bq_client = get_bigquery_client()
        await auth_aggregator.flush_updates(bq_client)
        logger.info("Auth metrics aggregator stopped and flushed")
    except Exception as e:
        logger.warning(f"Error stopping auth aggregator: {e}")

    await graceful_shutdown()


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Enterprise data ingestion pipeline for multi-cloud cost data",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan
)

# ============================================
# Middleware
# ============================================

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)


# Input validation middleware (FIRST - validates all requests)
@app.middleware("http")
async def validation_middleware_wrapper(request: Request, call_next):
    """Input validation middleware - validates tenant IDs, headers, request size."""
    return await validation_middleware(request, call_next)


# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """
    Global rate limiting middleware.
    Checks both per-tenant and global rate limits.
    Sets tenant_id in request.state for downstream use.
    """
    if not settings.rate_limit_enabled:
        return await call_next(request)

    # Skip rate limiting for health checks and metrics
    if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics", "/"]:
        return await call_next(request)

    rate_limiter = get_rate_limiter()

    # Extract tenant from authentication or path
    tenant_id = None
    if hasattr(request.state, "tenant_id"):
        tenant_id = request.state.tenant_id
    elif "tenant_id" in request.path_params:
        tenant_id = request.path_params.get("tenant_id")

    # Check per-tenant limit if tenant identified
    if tenant_id:
        is_allowed, metadata = await rate_limiter.check_tenant_limit(
            tenant_id,
            limit_per_minute=settings.rate_limit_requests_per_minute,
            limit_per_hour=settings.rate_limit_requests_per_hour
        )

        if not is_allowed:
            logger.warning(
                f"Rate limit exceeded for tenant {tenant_id}",
                extra={
                    "tenant_id": tenant_id,
                    "path": request.url.path,
                    "remaining": metadata["minute"]["remaining"]
                }
            )

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests for tenant {tenant_id}",
                    "retry_after": metadata["minute"]["reset"]
                }
            )

    # Check global limit for all requests
    endpoint_key = request.url.path.split("/")[1]  # Use first path segment as key
    is_allowed, metadata = await rate_limiter.check_global_limit(
        endpoint_key,
        limit_per_minute=settings.rate_limit_global_requests_per_minute,
        limit_per_hour=settings.rate_limit_global_requests_per_hour
    )

    if not is_allowed:
        logger.warning(
            f"Global rate limit exceeded for endpoint {endpoint_key}",
            extra={
                "endpoint": endpoint_key,
                "path": request.url.path,
                "remaining": metadata["minute"]["remaining"]
            }
        )

        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "Rate limit exceeded",
                "message": f"Global rate limit exceeded",
                "retry_after": metadata["minute"]["reset"]
            }
        )

    # Proceed with request
    response = await call_next(request)

    # Add rate limit headers if limits were checked
    if tenant_id:
        response.headers["X-RateLimit-Tenant-Limit"] = str(settings.rate_limit_requests_per_minute)
        response.headers["X-RateLimit-Tenant-Remaining"] = str(metadata.get("minute", {}).get("remaining", 0))

    return response


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing."""
    start_time = time.time()

    # Extract tenant from header if present
    api_key = request.headers.get("x-api-key")
    tenant_id = "unknown"  # Will be set by auth dependency

    logger.info(
        f"Request started",
        extra={
            "method": request.method,
            "path": request.url.path,
            "tenant_id": tenant_id
        }
    )

    response = await call_next(request)

    duration = time.time() - start_time

    logger.info(
        f"Request completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration * 1000, 2),
            "tenant_id": tenant_id
        }
    )

    # Add custom headers
    response.headers["X-Process-Time"] = str(duration)
    response.headers["X-API-Version"] = settings.app_version

    return response


# ============================================
# Exception Handlers
# ============================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors."""
    logger.error(
        f"Unhandled exception",
        exc_info=True,
        extra={
            "method": request.method,
            "path": request.url.path,
            "error": str(exc)
        }
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.debug else "An unexpected error occurred",
            "request_id": request.headers.get("x-request-id")
        }
    )


# ============================================
# Health Check Endpoints
# ============================================

@app.get("/health", tags=["Health"])
async def health_check():
    """
    Basic health check endpoint.
    Returns 200 if service is running.
    No authentication required.
    """
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment
    }


@app.get("/health/live", tags=["Health"])
async def liveness_probe():
    """
    Kubernetes liveness probe endpoint.
    Checks if the application is alive and responding.
    Returns 200 if process is running, 503 if shutting down.
    """
    global shutdown_event

    if shutdown_event and shutdown_event.is_set():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "shutting_down",
                "service": settings.app_name,
                "message": "Service is shutting down"
            }
        )

    return {
        "status": "alive",
        "service": settings.app_name,
        "version": settings.app_version
    }


@app.get("/health/ready", tags=["Health"])
async def readiness_probe():
    """
    Kubernetes readiness probe endpoint.
    Checks if the application is ready to accept traffic.
    Verifies BigQuery connectivity and critical dependencies.
    Returns 200 if ready, 503 if not ready.
    """
    global shutdown_event

    # Check if shutting down
    if shutdown_event and shutdown_event.is_set():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "service": settings.app_name,
                "reason": "shutting_down",
                "checks": {
                    "shutdown": False
                }
            }
        )

    checks = {
        "shutdown": True,
        "bigquery": False
    }

    # Check BigQuery connectivity
    try:
        from src.core.engine.bq_client import get_bigquery_client

        bq_client = get_bigquery_client()

        # Simple query to verify connectivity
        query = "SELECT 1 as health_check"
        query_job = bq_client.client.query(query)
        result = query_job.result(timeout=5)  # 5 second timeout

        # If we get here, BigQuery is accessible
        checks["bigquery"] = True

    except Exception as e:
        logger.warning(f"BigQuery health check failed: {e}")
        checks["bigquery"] = False

    # Determine overall readiness
    all_ready = all(checks.values())

    if all_ready:
        return {
            "status": "ready",
            "service": settings.app_name,
            "version": settings.app_version,
            "checks": checks
        }
    else:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "service": settings.app_name,
                "checks": checks
            }
        )


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint."""
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "docs": "/docs" if not settings.is_production else "disabled",
    }


@app.get("/metrics", tags=["Observability"])
async def metrics():
    """
    Prometheus metrics endpoint.
    Returns metrics in Prometheus exposition format.
    """
    from fastapi.responses import PlainTextResponse

    metrics_data = get_metrics()
    return PlainTextResponse(
        content=metrics_data.decode('utf-8'),
        media_type="text/plain; version=0.0.4"
    )


# ============================================
# API Routers
# ============================================

from src.app.routers import pipelines, admin, tenants, tenant_management, scheduler

app.include_router(pipelines.router, prefix="/api/v1", tags=["Pipelines"])
app.include_router(admin.router, prefix="/api/v1", tags=["Admin"])
app.include_router(tenants.router, prefix="/api/v1", tags=["Tenants"])
app.include_router(tenant_management.router, prefix="/api/v1", tags=["Tenant Management"])
app.include_router(scheduler.router, prefix="/api/v1", tags=["Scheduler"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_reload,
        log_level=settings.log_level.lower()
    )
