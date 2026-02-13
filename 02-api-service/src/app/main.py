"""
CloudAct API Service - Enterprise FastAPI Application
API service entry point with multi-organization support.

This service handles:
- Organization bootstrap and onboarding
- Integration management (credentials, validation)
- LLM pricing and subscription data management

Pipeline execution is handled by the separate data-pipeline-service.
"""

from fastapi import FastAPI, Request, status, HTTPException
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

    # Brief pause for in-flight requests
    await asyncio.sleep(1)

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

    # Check CORS origins are configured and valid
    if not settings.cors_origins or settings.cors_origins == ["http://localhost:3000"]:
        logger.warning("CORS origins appear to be using default values - ensure these are correct for production")

    # Validate CORS origins format
    import re
    for origin in settings.cors_origins:
        # Check for valid URL format (http/https with optional port)
        if not re.match(r'^https?://[a-zA-Z0-9\-.]+(:[0-9]+)?$', origin) and origin != "*":
            errors.append(f"Invalid CORS origin format: {origin}. Must be valid URL or '*'")

    if errors:
        for error in errors:
            logger.critical(f"Production config error: {error}")
        raise RuntimeError(f"Production configuration invalid: {'; '.join(errors)}")

    logger.info("Production configuration validation passed")


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
        logger.info(f"KMS configuration validated: {key_name}")
    except ValueError as e:
        logger.error(f"KMS configuration invalid: {e}")
        if settings.environment == "production":
            logger.critical("KMS is required in production. Application startup failed.")
            raise RuntimeError(f"KMS configuration required in production: {e}")
        else:
            logger.warning("KMS configuration invalid - encryption will be disabled (DEV/STAGING only)")
    except Exception as e:
        logger.error(f"KMS validation failed: {e}", exc_info=True)
        if settings.environment == "production":
            logger.critical("KMS validation failed in production. Application startup failed.")
            raise RuntimeError(f"KMS validation failed: {e}")
        else:
            logger.warning("KMS validation failed - encryption may not work properly (DEV/STAGING only)")

    # ============================================
    # GO-LIVE: Auto-bootstrap disabled
    # ============================================
    # Bootstrap and org sync are now ad-hoc operations:
    # - POST /api/v1/admin/bootstrap - Initial system setup
    # - POST /api/v1/organizations/{org}/sync - Sync existing org schemas
    # This ensures faster startup and explicit control over schema changes.
    logger.info("Auto-bootstrap disabled (go-live mode). Use POST /api/v1/admin/bootstrap for initial setup.")

    # GO-LIVE: All auto-sync operations disabled
    # Schema sync and org sync are now ad-hoc operations via admin endpoints

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

    # FIX #13: Close pipeline proxy httpx client
    try:
        from src.app.routers.pipelines_proxy import close_http_client
        await close_http_client()
        logger.info("Pipeline proxy HTTP client closed")
    except Exception as e:
        logger.warning(f"Error closing pipeline proxy HTTP client: {e}")

    await graceful_shutdown()


# OpenAPI metadata and tags
api_description = """
## CloudAct.ai API Service

Enterprise-grade API service for multi-cloud cost analytics platform.

### Key Features

* **Organization Management** - Bootstrap and onboard new organizations
* **Integration Management** - Secure credential storage with KMS encryption
* **LLM Data Management** - Pricing and subscription CRUD for OpenAI/Anthropic/Gemini
* **Multi-Organization Support** - Secure tenant isolation with per-org datasets
* **BigQuery-Powered** - Petabyte-scale data processing with automatic partitioning
* **KMS Encryption** - Enterprise security with Google Cloud KMS for sensitive data
* **Rate Limiting** - Per-org and global rate limits to prevent resource exhaustion

### Authentication

Two authentication methods:

1. **Root API Key** (`X-CA-Root-Key` header)
   - Platform-level operations (bootstrap, onboarding)
   - Set via `CA_ROOT_API_KEY` environment variable

2. **Organization API Key** (`X-API-Key` header)
   - Organization-specific operations (integrations, data management)
   - Generated during organization onboarding
   - Format: `{org_slug}_api_{random_16_chars}`

### Architecture

```
Frontend (Next.js) --> CloudAct API Service --> BigQuery
                                            --> data-pipeline-service (for pipelines)
```

**Central Dataset**: `organizations` (14 management tables)
**Per-Org Datasets**: `{org_slug}_{env}` (operational data tables)
"""

# API tags metadata
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
        "name": "Admin",
        "description": "Platform administration endpoints requiring Root API Key (X-CA-Root-Key header). Use for system bootstrap and API key operations."
    },
    {
        "name": "Organizations",
        "description": "Organization onboarding and management endpoints. Includes dry-run validation and full onboarding workflows."
    },
    {
        "name": "Integrations",
        "description": "Integration setup and management endpoints. Configure LLM providers (OpenAI, Anthropic) and cloud providers (GCP)."
    },
    {
        "name": "LLM Data",
        "description": "LLM provider pricing and subscription CRUD endpoints. Manage pricing models and subscription plans for usage-based cost calculations."
    },
    {
        "name": "Pipeline Validator",
        "description": "Pipeline validation endpoints for data-pipeline-service. Validates org subscription, quota, and credentials before pipeline execution."
    },
    {
        "name": "Quota",
        "description": "Quota usage and limits endpoints. Retrieve current pipeline usage and available quotas for organizations."
    },
    {
        "name": "Costs",
        "description": "High-performance, Polars-powered read-only cost analytics endpoints. Retrieve cost data, summaries, and trends using FOCUS 1.3 standard schema with org-specific extension fields."
    },
    {
        "name": "Pipeline Proxy",
        "description": "Centralized pipeline trigger endpoints. Frontend calls these endpoints instead of pipeline service directly. Handles status checks and proxies triggers to pipeline-service (8001)."
    },
    {
        "name": "Notifications",
        "description": "Notification management endpoints. Configure notification channels (email, Slack, webhook), alert rules (cost thresholds, anomaly detection), scheduled summaries (daily/weekly digests), and view notification history."
    }
]

# Create FastAPI application with comprehensive metadata
app = FastAPI(
    title="CloudAct.ai API Service",
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
            "url": "https://api.cloudact.ai",
            "description": "Production environment"
        },
        {
            "url": "http://localhost:8000",
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


# Maintenance mode middleware (#44) - checked before any other processing
@app.middleware("http")
async def maintenance_mode_middleware(request: Request, call_next):
    """
    Maintenance mode middleware.
    Returns 503 Service Unavailable when maintenance_mode is enabled.
    Allows health check endpoints to pass through for monitoring.
    """
    if settings.maintenance_mode:
        # Allow health checks during maintenance for monitoring
        if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics", "/"]:
            return await call_next(request)

        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "Service Unavailable",
                "message": settings.maintenance_message,
                "maintenance": True
            },
            headers={
                "Retry-After": "3600",  # Suggest retry in 1 hour
                "X-Maintenance-Mode": "true"
            }
        )

    return await call_next(request)


# User context middleware (#48) - extracts X-User-ID for audit logging
@app.middleware("http")
async def user_context_middleware(request: Request, call_next):
    """
    Extract user context from headers for audit logging.
    X-User-ID header is set by the frontend from Supabase auth.
    This enables per-user audit trails even when using org API keys.
    """
    # Extract user ID from header (set by authenticated frontend)
    user_id = request.headers.get("x-user-id")
    if user_id:
        request.state.user_id = user_id

    # Also extract request ID for correlation
    request_id = request.headers.get("x-request-id")
    if request_id:
        request.state.request_id = request_id

    response = await call_next(request)

    # Echo back request ID in response for tracing
    if request_id:
        response.headers["X-Request-ID"] = request_id

    return response


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
            # BUG-015 FIX: Add null-safe metadata access
            minute_meta = metadata.get("minute", {})
            remaining = minute_meta.get("remaining", 0)
            reset_time = minute_meta.get("reset", 60)

            logger.warning(
                f"Rate limit exceeded for org {org_slug}",
                extra={
                    "org_slug": org_slug,
                    "path": request.url.path,
                    "remaining": remaining
                }
            )

            retry_after_seconds = max(1, int(reset_time))
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests for org {org_slug}",
                    "retry_after": retry_after_seconds
                },
                headers={
                    "Retry-After": str(retry_after_seconds),
                    "X-RateLimit-Limit": str(settings.rate_limit_requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(retry_after_seconds)
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
        # BUG-015 FIX: Add null-safe metadata access
        minute_meta = metadata.get("minute", {})
        remaining = minute_meta.get("remaining", 0)
        reset_time = minute_meta.get("reset", 60)

        logger.warning(
            f"Global rate limit exceeded for endpoint {endpoint_key}",
            extra={
                "endpoint": endpoint_key,
                "path": request.url.path,
                "remaining": remaining
            }
        )

        retry_after_seconds = max(1, int(reset_time))
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "Rate limit exceeded",
                "message": f"Global rate limit exceeded",
                "retry_after": retry_after_seconds
            },
            headers={
                "Retry-After": str(retry_after_seconds),
                "X-RateLimit-Limit": str(settings.rate_limit_global_requests_per_minute),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(retry_after_seconds)
            }
        )

    # Proceed with request
    response = await call_next(request)

    # Add rate limit headers if limits were checked
    if org_slug:
        response.headers["X-RateLimit-Org-Limit"] = str(settings.rate_limit_requests_per_minute)
        response.headers["X-RateLimit-Org-Remaining"] = str(metadata.get("minute", {}).get("remaining", 0))

    return response


# Security headers middleware (OWASP recommended)
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """
    Add security headers to all responses (OWASP recommendations).
    These headers help prevent XSS, clickjacking, MIME-type sniffing, and other attacks.
    """
    try:
        response = await call_next(request)
    except RuntimeError as e:
        # Handle client disconnection gracefully
        if "No response returned" in str(e):
            logger.warning(
                f"Client disconnected before response",
                extra={"path": request.url.path, "method": request.method}
            )
            return JSONResponse(
                status_code=499,  # Client Closed Request (nginx convention)
                content={"error": "Client disconnected"}
            )
        raise

    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"

    # Prevent MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"

    # Enable XSS protection (legacy browsers)
    response.headers["X-XSS-Protection"] = "1; mode=block"

    # Control referrer information
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Content Security Policy for API responses
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"

    # Permissions Policy (formerly Feature-Policy)
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    # Strict Transport Security (HSTS) - only in production
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing."""
    start_time = time.time()

    # Extract org_slug from URL path
    # Pattern: /api/v1/{resource}/{org_slug}/... or /api/v1/costs/{org_slug}/...
    org_slug = "unknown"
    path_parts = request.url.path.strip("/").split("/")

    # Common patterns:
    # /api/v1/costs/{org_slug}/total
    # /api/v1/integrations/{org_slug}/...
    # /api/v1/subscriptions/{org_slug}/...
    # /api/v1/hierarchy/{org_slug}/...
    # /api/v1/pipelines/{org_slug}/runs
    # /api/v1/pipelines/status/{org_slug}  <- special case
    if len(path_parts) >= 4 and path_parts[0] == "api" and path_parts[1] == "v1":
        resource = path_parts[2]
        # These resources have org_slug as the 4th path segment
        if resource in ["costs", "integrations", "subscriptions", "hierarchy",
                       "notifications", "quota", "usage"]:
            org_slug = path_parts[3]
        # pipelines has special sub-routes: /pipelines/status/{org}, /pipelines/run/{org}
        elif resource == "pipelines" and len(path_parts) >= 5:
            sub_resource = path_parts[3]
            if sub_resource in ["status", "run"]:
                # /api/v1/pipelines/status/{org_slug} or /api/v1/pipelines/run/{org_slug}
                org_slug = path_parts[4]
            else:
                # /api/v1/pipelines/{org_slug}/runs
                org_slug = path_parts[3]
        elif resource == "pipelines" and len(path_parts) == 4:
            # /api/v1/pipelines/{org_slug}
            org_slug = path_parts[3]
        # organizations/{org_slug}/... pattern
        elif resource == "organizations" and len(path_parts) >= 4:
            org_slug = path_parts[3]

    logger.info(
        f"Request started",
        extra={
            "method": request.method,
            "path": request.url.path,
            "org_slug": org_slug
        }
    )

    try:
        response = await call_next(request)
    except RuntimeError as e:
        # Handle client disconnection gracefully
        if "No response returned" in str(e):
            duration = time.time() - start_time
            logger.warning(
                f"Client disconnected before response",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration * 1000, 2),
                    "org_slug": org_slug
                }
            )
            return JSONResponse(
                status_code=499,  # Client Closed Request
                content={"error": "Client disconnected"}
            )
        raise

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

def sanitize_error_message(exc: Exception) -> str:
    """
    Sanitize error messages to prevent sensitive information leakage (#53).
    Strips internal paths, credentials, and stack traces from error messages.
    """
    error_str = str(exc)

    # List of patterns that indicate sensitive information
    sensitive_patterns = [
        "/Users/",       # Local paths
        "/home/",        # Linux home paths
        "/var/",         # System paths
        "password",      # Credential indicators
        "secret",
        "api_key",
        "token",
        "credential",
        "sk_",           # API key prefixes
        "BEGIN PRIVATE", # Private keys
        "BEGIN RSA",
        "0x",            # Memory addresses
        "Traceback",     # Stack traces
    ]

    for pattern in sensitive_patterns:
        if pattern.lower() in error_str.lower():
            return "An internal error occurred. Please contact support if this persists."

    # Truncate long error messages
    if len(error_str) > 200:
        return error_str[:200] + "..."

    return error_str


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handler for HTTPException - preserves the intended status code."""
    request_id = request.headers.get("x-request-id") or getattr(request.state, "request_id", None)

    # Extract origin from request headers for CORS
    origin = request.headers.get("origin", "")

    # Build response headers with CORS support
    response_headers = {}
    if origin in settings.cors_origins or "*" in settings.cors_origins:
        response_headers["Access-Control-Allow-Origin"] = origin if origin in settings.cors_origins else "*"
        response_headers["Access-Control-Allow-Credentials"] = str(settings.cors_allow_credentials).lower()
        response_headers["Access-Control-Allow-Methods"] = ", ".join(settings.cors_allow_methods)
        response_headers["Access-Control-Allow-Headers"] = ", ".join(settings.cors_allow_headers)

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "request_id": request_id
        },
        headers=response_headers
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors (non-HTTP exceptions only)."""
    # Generate request ID if not provided
    request_id = request.headers.get("x-request-id") or getattr(request.state, "request_id", None)

    logger.error(
        f"Unhandled exception",
        exc_info=True,
        extra={
            "method": request.method,
            "path": request.url.path,
            "error": str(exc),
            "request_id": request_id
        }
    )

    # Determine error message based on settings (#53)
    if settings.expose_error_details or settings.debug:
        error_message = sanitize_error_message(exc)
    else:
        error_message = "An unexpected error occurred. Please try again or contact support."

    # Extract origin from request headers for CORS
    origin = request.headers.get("origin", "")

    # Build response headers with CORS support
    response_headers = {}

    # Add CORS headers if origin is allowed
    if origin in settings.cors_origins or "*" in settings.cors_origins:
        response_headers["Access-Control-Allow-Origin"] = origin if origin in settings.cors_origins else "*"
        response_headers["Access-Control-Allow-Credentials"] = str(settings.cors_allow_credentials).lower()
        response_headers["Access-Control-Allow-Methods"] = ", ".join(settings.cors_allow_methods)
        response_headers["Access-Control-Allow-Headers"] = ", ".join(settings.cors_allow_headers)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "message": error_message,
            "request_id": request_id
        },
        headers=response_headers
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
        "service": "api-service",
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
                "service": "api-service",
                "message": "Service is shutting down"
            }
        )

    return {
        "status": "alive",
        "service": "api-service",
        "version": settings.app_version
    }


@app.get("/health/ready", tags=["Health"])
async def readiness_probe():
    """
    Kubernetes readiness probe endpoint.
    Checks if the application is ready to accept traffic.
    Verifies BigQuery connectivity, KMS, and pipeline service.
    Returns 200 if ready, 503 if not ready.
    """
    global shutdown_event

    # Check if shutting down
    if shutdown_event and shutdown_event.is_set():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "service": "api-service",
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
        "setup": False,
        "encryption": False,
        "pipeline": False
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

    # Check if bootstrap is complete (organizations dataset and meta tables exist)
    try:
        from src.core.engine.bq_client import get_bigquery_client

        bq_client = get_bigquery_client()

        # Check if org_profiles table exists (core bootstrap table)
        query = f"""
            SELECT COUNT(*) as table_count
            FROM `{settings.gcp_project_id}.organizations.INFORMATION_SCHEMA.TABLES`
            WHERE table_name IN ('org_profiles', 'org_api_keys', 'org_subscriptions')
        """
        query_job = bq_client.client.query(query)
        result = list(query_job.result(timeout=5))

        # Bootstrap is complete if at least 3 core tables exist
        checks["setup"] = result[0].table_count >= 3

    except Exception as e:
        logger.warning(f"Bootstrap check failed: {e}")
        checks["setup"] = False

    # Check KMS availability
    try:
        from src.core.security.kms_encryption import _get_key_name, _get_kms_client
        key_name = _get_key_name()
        _get_kms_client()
        checks["encryption"] = True
    except Exception as e:
        logger.warning(f"KMS health check failed: {e}")
        checks["encryption"] = False

    # Check Pipeline Service connectivity
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.pipeline_service_url}/health")
            if response.status_code == 200:
                checks["pipeline"] = True
    except Exception as e:
        logger.warning(f"Pipeline service health check failed: {e}")
        checks["pipeline"] = False

    # Determine overall readiness (BigQuery is critical, others are warnings)
    critical_checks = checks["ready"] and checks["bigquery"]

    if critical_checks:
        return {
            "status": "ready",
            "service": "api-service",
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
                "service": "api-service",
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
        "message": "Welcome to CloudAct.ai API Service",
        "service": "api-service",
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
# API Routers (NO PIPELINES OR SCHEDULER)
# ============================================

from src.app.routers import admin, organizations, integrations, genai_pricing, pipeline_validator, pipeline_logs, subscription_plans, quota, costs, pipelines_proxy, hierarchy, genai, notifications, cost_alerts, chat_settings, budgets

app.include_router(admin.router, prefix="/api/v1", tags=["Admin"])
app.include_router(organizations.router, prefix="/api/v1", tags=["Organizations"])
app.include_router(integrations.router, prefix="/api/v1", tags=["Integrations"])
app.include_router(genai_pricing.router, prefix="/api/v1", tags=["GenAI Pricing"])
app.include_router(subscription_plans.router, prefix="/api/v1", tags=["Subscription Plans"])
app.include_router(pipeline_validator.router, prefix="/api/v1", tags=["Pipeline Validator"])
app.include_router(pipeline_logs.router, prefix="/api/v1", tags=["Pipeline Logs"])
app.include_router(quota.router, prefix="/api/v1", tags=["Quota"])
app.include_router(costs.router, prefix="/api/v1", tags=["Costs"])
app.include_router(pipelines_proxy.router, prefix="/api/v1", tags=["Pipeline Proxy"])
app.include_router(hierarchy.router, prefix="/api/v1/hierarchy", tags=["Hierarchy"])
app.include_router(genai.router, prefix="/api/v1", tags=["GenAI"])
app.include_router(notifications.router, prefix="/api/v1", tags=["Notifications"])
app.include_router(cost_alerts.router, prefix="/api/v1", tags=["Cost Alerts"])
app.include_router(chat_settings.router, prefix="/api/v1", tags=["Chat Settings"])
app.include_router(budgets.router, prefix="/api/v1/budgets", tags=["Budgets"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_reload,
        log_level=settings.log_level.lower()
    )
