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

from src.app.config import settings
from src.core.utils.logging import setup_logging
# from src.core.utils.telemetry import setup_telemetry  # Disabled for local dev

# Initialize logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info(
        f"Starting {settings.app_name} v{settings.app_version}",
        extra={
            "environment": settings.environment,
            "project_id": settings.gcp_project_id
        }
    )

    # Initialize OpenTelemetry if enabled
    # if settings.enable_tracing:
    #     setup_telemetry()
    #     logger.info("OpenTelemetry tracing initialized")

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.app_name}")


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
    Health check endpoint for load balancers.
    No authentication required.
    """
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment
    }


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint."""
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "docs": "/docs" if not settings.is_production else "disabled",
    }


# ============================================
# API Routers
# ============================================

from src.app.routers import pipelines, admin, customers

app.include_router(pipelines.router, prefix="/api/v1", tags=["Pipelines"])
app.include_router(admin.router, prefix="/api/v1", tags=["Admin"])
app.include_router(customers.router, prefix="/api/v1", tags=["Customers"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_reload,
        log_level=settings.log_level.lower()
    )
