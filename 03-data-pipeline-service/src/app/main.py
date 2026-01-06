"""
Data Pipeline Service - Enterprise FastAPI Application
Main application entry point with multi-organization support.
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging
import signal
import asyncio
import os
from typing import Optional

from src.app.config import settings
from src.core.utils.logging import setup_logging
from src.core.utils.rate_limiter import init_rate_limiter, get_rate_limiter
from src.core.observability.metrics import get_metrics
from src.app.middleware.validation import validation_middleware
from src.app.dependencies.auth import get_auth_aggregator
from src.core.engine.bq_client import get_bigquery_client

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


def validate_production_config() -> None:
    """
    Validate configuration for production readiness.

    CRITICAL: These checks ensure the application is securely configured
    before accepting traffic in production.

    Raises:
        RuntimeError: If production configuration is invalid
    """
    if settings.environment != "production":
        logger.info("Skipping production config validation (non-production environment)")
        return

    errors = []

    # Check root API key presence and minimum length
    MIN_API_KEY_LENGTH = 32
    if not settings.ca_root_api_key:
        errors.append("CA_ROOT_API_KEY environment variable is required in production")
    elif len(settings.ca_root_api_key) < MIN_API_KEY_LENGTH:
        errors.append(f"CA_ROOT_API_KEY must be at least {MIN_API_KEY_LENGTH} characters for production security")

    # Check authentication is enabled
    if settings.disable_auth:
        errors.append("DISABLE_AUTH must be false in production (authentication cannot be disabled)")

    # Check rate limiting is enabled
    if not settings.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED must be true in production")

    # Check CORS origins are configured
    if not settings.cors_origins or settings.cors_origins == ["http://localhost:3000"]:
        logger.warning("CORS origins appear to be using default values - ensure these are correct for production")

    if errors:
        for error in errors:
            logger.critical(f"Production config error: {error}")
        raise RuntimeError(f"Production configuration invalid: {'; '.join(errors)}")

    logger.info("✓ Production configuration validation passed")


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

    # Validate production configuration FIRST
    validate_production_config()

    # Initialize shutdown event
    shutdown_event = asyncio.Event()

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, handle_shutdown_signal)
    signal.signal(signal.SIGINT, handle_shutdown_signal)
    logger.info("Shutdown signal handlers registered (SIGTERM, SIGINT)")

    # SCALE-001 FIX: Warn about in-memory lock limitations with multiple workers
    # asyncio.Lock only works within a single process, not across uvicorn workers
    workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
    if workers > 1:
        logger.warning(
            f"Running with {workers} workers. In-memory pipeline locks will NOT be "
            "shared across workers. For production with multiple workers, consider: "
            "(1) Using --workers 1 for pipeline-service, or "
            "(2) Implementing distributed locking with Redis/Memorystore, or "
            "(3) Using Cloud Tasks for pipeline execution. "
            "Risk: Duplicate pipeline executions possible if same request hits different workers."
        )

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

    # Validate KMS configuration on startup
    try:
        from src.core.security.kms_encryption import _get_key_name, _get_kms_client
        key_name = _get_key_name()
        _get_kms_client()  # Ensure KMS client can be created
        logger.info(f"✓ KMS configuration validated: {key_name}")
    except ValueError as e:
        logger.error(f"❌ KMS configuration invalid: {e}")
        if settings.environment == "production":
            logger.critical("KMS is required in production. Application startup failed.")
            raise RuntimeError(f"KMS configuration required in production: {e}")
        else:
            logger.warning("KMS configuration invalid - encryption will be disabled (DEV/STAGING only)")
    except Exception as e:
        logger.error(f"❌ KMS validation failed: {e}", exc_info=True)
        if settings.environment == "production":
            logger.critical("KMS validation failed in production. Application startup failed.")
            raise RuntimeError(f"KMS validation failed: {e}")
        else:
            logger.warning("KMS validation failed - encryption may not work properly (DEV/STAGING only)")

    # Auto-sync stored procedures on startup (if enabled)
    # Creates/updates procedures in organizations dataset from SQL files
    if settings.auto_sync_procedures:
        try:
            from pathlib import Path
            from google.cloud import bigquery

            bq_client = get_bigquery_client()
            project_id = settings.gcp_project_id

            # Check if organizations dataset exists
            dataset_id = f"{project_id}.organizations"
            try:
                bq_client.client.get_dataset(dataset_id)
            except Exception:
                logger.info("Auto-sync procedures skipped: organizations dataset not found (bootstrap not run yet)")
            else:
                # Discover procedure files
                procedures_dir = Path(__file__).parent.parent.parent / "configs" / "system" / "procedures"

                if procedures_dir.exists():
                    procedures_synced = []
                    procedures_created = []
                    procedures_failed = []

                    # Find all SQL files in subdirectories (skip migrations/)
                    for subdir in procedures_dir.iterdir():
                        if not subdir.is_dir() or subdir.name == "migrations":
                            continue

                        for sql_file in subdir.glob("*.sql"):
                            proc_name = sql_file.stem

                            try:
                                # Load SQL and replace {project_id}
                                with open(sql_file, 'r') as f:
                                    sql = f.read().replace("{project_id}", project_id)

                                # Check if procedure exists
                                check_query = f"""
                                SELECT routine_name
                                FROM `{project_id}.organizations.INFORMATION_SCHEMA.ROUTINES`
                                WHERE routine_name = '{proc_name}' AND routine_type = 'PROCEDURE'
                                """
                                results = list(bq_client.client.query(check_query).result())
                                exists = len(results) > 0

                                if not exists:
                                    # Create procedure
                                    bq_client.client.query(sql).result()
                                    procedures_created.append(proc_name)
                                    logger.debug(f"Created procedure: {proc_name}")
                                else:
                                    procedures_synced.append(proc_name)

                            except Exception as e:
                                procedures_failed.append({"name": proc_name, "error": str(e)[:100]})
                                logger.warning(f"Auto-sync procedures: Failed to sync {proc_name}: {e}")

                    # Log summary
                    if procedures_created:
                        logger.info(
                            f"Auto-sync procedures: Created {len(procedures_created)} new procedures",
                            extra={"procedures_created": procedures_created}
                        )
                        for proc in procedures_created:
                            logger.info(f"  + {proc}")

                    if procedures_synced:
                        logger.info(f"Auto-sync procedures: {len(procedures_synced)} procedures already exist")

                    if procedures_failed:
                        logger.warning(f"Auto-sync procedures: {len(procedures_failed)} procedures failed to sync")

                    if not procedures_created and not procedures_failed:
                        logger.info("Auto-sync procedures: All procedures in sync")
                else:
                    logger.debug("Auto-sync procedures: Procedures directory not found")

        except Exception as e:
            logger.error(f"Auto-sync procedures failed: {e}", exc_info=True)
            logger.warning("Continuing startup despite auto-sync procedures failure")
    else:
        logger.info("Auto-sync procedures disabled (AUTO_SYNC_PROCEDURES=false)")

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
        # Only warn in production/staging - silently skip in development
        if settings.environment in ["production", "staging"]:
            logger.warning("Tracing enabled but OpenTelemetry packages not installed - skipping")
        else:
            logger.info("Distributed tracing disabled (OpenTelemetry packages not installed)")
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

    # Stop auth aggregator with timeout
    try:
        auth_aggregator = get_auth_aggregator()
        auth_aggregator.stop_background_flush()

        # Flush any remaining updates with timeout to prevent hanging
        bq_client = get_bigquery_client()
        await asyncio.wait_for(
            auth_aggregator.flush_updates(bq_client),
            timeout=10.0  # 10 seconds max for final flush
        )
        logger.info("Auth metrics aggregator stopped and flushed")
    except asyncio.TimeoutError:
        logger.warning("Auth metrics flush timed out during shutdown (10s)")
    except Exception as e:
        logger.warning(f"Error stopping auth aggregator: {e}")

    # Shutdown BigQuery thread pool executor
    try:
        from src.core.pipeline.async_executor import BQ_EXECUTOR
        BQ_EXECUTOR.shutdown(wait=False)  # Don't wait to avoid blocking shutdown
        logger.info("BigQuery thread pool executor shutdown initiated")
    except Exception as e:
        logger.warning(f"Error shutting down BigQuery executor: {e}")

    await graceful_shutdown()


# OpenAPI metadata and tags
api_description = """
## Data Pipeline Service API

**Pure Pipeline Execution Engine** - Handles ETL jobs, usage data processing, and scheduled pipelines.

**Note**: Bootstrap, onboarding, and organization management are handled by `api-service` (port 8000).

### Key Features

* **Pipeline-Based Architecture** - Everything is a pipeline (no raw SQL, no Alembic)
* **Multi-Organization Support** - Secure tenant isolation with per-org datasets
* **BigQuery-Powered** - Petabyte-scale data processing with automatic partitioning
* **Async Execution** - Non-blocking pipeline execution with parallel step processing
* **KMS Encryption** - Enterprise security with Google Cloud KMS for sensitive data
* **Rate Limiting** - Per-org and global rate limits to prevent resource exhaustion
* **Quota Management** - Subscription-based usage limits (STARTER/PROFESSIONAL/SCALE)

### Authentication

**Organization API Key** (`X-API-Key` header)
- Organization-specific operations (run pipelines, view runs, manage integrations)
- Generated during organization onboarding via api-service
- Format: `{org_slug}_api_{random_16_chars}`

**Note**: Root API Key operations (bootstrap, onboarding) are handled by api-service (port 8000).

### Architecture

```
API Request → configs/ → Processor → BigQuery API
```

**Central Dataset**: `organizations` (11 management tables)
**Per-Org Datasets**: `{org_slug}_{env}` (operational data tables)

### Service Separation

* **api-service (port 8000)**: Bootstrap, onboarding, organizations, user management
* **data-pipeline-service (port 8001)**: Pipeline execution, ETL jobs, integrations, scheduled runs
"""

# API tags metadata
# NOTE: Admin and Organizations tags removed - handled by api-service (port 8000)
tags_metadata = [
    {
        "name": "Health",
        "description": "Health check and readiness probe endpoints for Kubernetes/Cloud Run deployments. No authentication required."
    },
    {
        "name": "Observability",
        "description": "Prometheus metrics and monitoring endpoints for system observability."
    },
    {
        "name": "Pipelines",
        "description": "Pipeline execution and monitoring endpoints requiring Organization API Key. Supports templated pipelines with variable substitution, async execution, and quota enforcement."
    },
    {
        "name": "Scheduler",
        "description": "Pipeline scheduling and cron job management endpoints for automated pipeline execution."
    },
    {
        "name": "Integrations",
        "description": "Provider integration management endpoints for setting up and validating cloud provider and LLM credentials."
    },
    {
        "name": "LLM Data",
        "description": "LLM provider pricing and subscription CRUD endpoints under /integrations/{org_slug}/{provider}/. Supports OpenAI and Anthropic. Manage pricing models and subscription plans for usage-based cost calculations."
    }
]

# Create FastAPI application with comprehensive metadata
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=api_description,
    docs_url="/docs" if settings.enable_api_docs else None,
    redoc_url="/redoc" if settings.enable_api_docs else None,
    openapi_tags=tags_metadata,
    contact={
        "name": "CloudAct.ai",
        "email": "support@cloudact.ai"
    },
    license_info={
        "name": "Proprietary"
    },
    servers=[
        {
            "url": "https://pipeline.cloudact.ai",
            "description": "Production environment"
        },
        {
            "url": "http://localhost:8001",
            "description": "Local development"
        }
    ],
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
    """Input validation middleware - validates org slugs, headers, request size."""
    return await validation_middleware(request, call_next)


# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """
    Global rate limiting middleware.
    Checks both per-organization and global rate limits.
    Sets org_slug in request.state for downstream use.
    """
    if not settings.rate_limit_enabled:
        return await call_next(request)

    # Skip rate limiting for health checks and metrics
    if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics", "/"]:
        return await call_next(request)

    rate_limiter = get_rate_limiter()

    # Extract org from authentication or path
    org_slug = None
    if hasattr(request.state, "org_slug"):
        org_slug = request.state.org_slug
    elif "org_slug" in request.path_params:
        org_slug = request.path_params.get("org_slug")

    # Check per-organization limit if org identified
    if org_slug:
        is_allowed, metadata = await rate_limiter.check_org_limit(
            org_slug,
            limit_per_minute=settings.rate_limit_requests_per_minute,
            limit_per_hour=settings.rate_limit_requests_per_hour
        )

        if not is_allowed:
            logger.warning(
                f"Rate limit exceeded for org {org_slug}",
                extra={
                    "org_slug": org_slug,
                    "path": request.url.path,
                    "remaining": metadata["minute"]["remaining"]
                }
            )

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests for org {org_slug}",
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
    if org_slug:
        response.headers["X-RateLimit-Org-Limit"] = str(settings.rate_limit_requests_per_minute)
        response.headers["X-RateLimit-Org-Remaining"] = str(metadata.get("minute", {}).get("remaining", 0))

    return response


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing."""
    start_time = time.time()

    org_slug = "unknown"  # Will be set by auth dependency

    logger.info(
        f"Request started",
        extra={
            "method": request.method,
            "path": request.url.path,
            "org_slug": org_slug
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
            "org_slug": org_slug
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
        "release": settings.release_version,
        "release_timestamp": settings.release_timestamp,
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
    Verifies BigQuery connectivity, KMS, and API service.
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
                "version": settings.app_version,
                "release": settings.release_version,
                "release_timestamp": settings.release_timestamp,
                "reason": "shutting_down",
                "checks": {
                    "shutdown": False
                }
            }
        )

    checks = {
        "ready": True,
        "bigquery": False,
        "procedures": False,
        "encryption": False,
        "api": False
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

    # Check if stored procedures are synced (required for pipeline execution)
    try:
        from src.core.engine.bq_client import get_bigquery_client

        bq_client = get_bigquery_client()

        # Check for key stored procedures that must exist
        # These are in the organizations dataset
        required_procedures = [
            'sp_run_subscription_costs_pipeline',
            'sp_calculate_subscription_plan_costs_daily',
            'sp_convert_subscription_costs_to_focus_1_3',
        ]

        query = f"""
            SELECT routine_name
            FROM `{settings.gcp_project_id}.organizations.INFORMATION_SCHEMA.ROUTINES`
            WHERE routine_name IN ({','.join([f"'{p}'" for p in required_procedures])})
        """
        query_job = bq_client.client.query(query)
        result = list(query_job.result(timeout=5))

        # All required procedures must exist
        found_procedures = [row.routine_name for row in result]
        missing_procedures = [p for p in required_procedures if p not in found_procedures]

        if missing_procedures:
            logger.warning(f"Missing stored procedures: {missing_procedures}")
            checks["procedures"] = False
        else:
            checks["procedures"] = True

    except Exception as e:
        logger.warning(f"Stored procedures check failed: {e}")
        checks["procedures"] = False

    # Check KMS availability
    try:
        from src.core.security.kms_encryption import _get_key_name, _get_kms_client
        key_name = _get_key_name()
        _get_kms_client()
        checks["encryption"] = True
    except Exception as e:
        logger.warning(f"KMS health check failed: {e}")
        checks["encryption"] = False

    # Check API Service connectivity
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.api_service_url}/health")
            if response.status_code == 200:
                checks["api"] = True
    except Exception as e:
        logger.warning(f"API service health check failed: {e}")
        checks["api"] = False

    # Determine overall readiness (BigQuery is critical, others are warnings)
    critical_checks = checks["ready"] and checks["bigquery"]

    if critical_checks:
        return {
            "status": "ready",
            "service": settings.app_name,
            "version": settings.app_version,
            "release": settings.release_version,
            "release_timestamp": settings.release_timestamp,
            "environment": settings.environment,
            "checks": checks
        }
    else:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "service": settings.app_name,
                "version": settings.app_version,
                "release": settings.release_version,
                "release_timestamp": settings.release_timestamp,
                "checks": checks
            }
        )


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint with API information and documentation links."""
    return {
        "message": f"Welcome to {settings.app_name}",
        "service": settings.app_name,
        "version": settings.app_version,
        "release": settings.release_version,
        "release_timestamp": settings.release_timestamp,
        "environment": settings.environment,
        "docs": "/docs" if settings.enable_api_docs else "disabled",
        "redoc": "/redoc" if settings.enable_api_docs else "disabled",
        "openapi": "/openapi.json" if settings.enable_api_docs else "disabled"
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

from src.app.routers import pipelines, scheduler, procedures

app.include_router(pipelines.router, prefix="/api/v1", tags=["Pipelines"])
app.include_router(scheduler.router, prefix="/api/v1", tags=["Scheduler"])
app.include_router(procedures.router, prefix="/api/v1", tags=["Procedures"])
# Note: Integration setup/validate and LLM Data CRUD endpoints are in api-service (port 8000), not here


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_reload,
        log_level=settings.log_level.lower()
    )
