# ============================================
# Production-Optimized Multi-Stage Dockerfile
# ============================================
# Multi-stage build for minimal image size and security
# - Stage 1: Builder - installs dependencies and compiles
# - Stage 2: Runtime - minimal production image
# ============================================

# ============================================
# Stage 1: Builder
# ============================================
FROM python:3.11-slim-bookworm AS builder

# Set build arguments
ARG DEBIAN_FRONTEND=noninteractive
ARG PIP_NO_CACHE_DIR=1
ARG PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libpq-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv

# Activate virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Set working directory
WORKDIR /build

# Copy requirements first (for layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# ============================================
# Stage 2: Runtime
# ============================================
FROM python:3.11-slim-bookworm AS runtime

# Set build arguments
ARG DEBIAN_FRONTEND=noninteractive
ARG APP_VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# Metadata labels (OCI standard)
LABEL org.opencontainers.image.title="Convergence Data Pipeline"
LABEL org.opencontainers.image.description="Multi-tenant BigQuery data pipeline API"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.authors="Data Engineering Team"
LABEL org.opencontainers.image.vendor="CloudAct"
LABEL org.opencontainers.image.licenses="Proprietary"

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security
RUN groupadd -r -g 1000 appuser && \
    useradd -r -u 1000 -g appuser -m -s /bin/bash appuser && \
    mkdir -p /app /home/appuser/.cache && \
    chown -R appuser:appuser /app /home/appuser

# Copy virtual environment from builder
COPY --from=builder --chown=appuser:appuser /opt/venv /opt/venv

# Set environment variables
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Application settings
    APP_VERSION="${APP_VERSION}" \
    API_HOST=0.0.0.0 \
    API_PORT=8000 \
    # Workers - should be set via env vars in k8s
    WEB_CONCURRENCY=4 \
    # Gunicorn settings (if used instead of uvicorn)
    WORKER_CLASS=uvicorn.workers.UvicornWorker \
    WORKER_TIMEOUT=300 \
    GRACEFUL_TIMEOUT=30 \
    KEEPALIVE=5

# Set working directory
WORKDIR /app

# Copy application code
COPY --chown=appuser:appuser . /app/

# Create necessary directories
RUN mkdir -p /app/logs /app/tmp && \
    chown -R appuser:appuser /app/logs /app/tmp

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

# Default command - use uvicorn for async support
CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--log-level", "info"]

# ============================================
# Alternative: Use Gunicorn with Uvicorn workers (better for production)
# ============================================
# CMD ["gunicorn", "src.app.main:app", \
#     "--bind", "0.0.0.0:8000", \
#     "--workers", "4", \
#     "--worker-class", "uvicorn.workers.UvicornWorker", \
#     "--timeout", "300", \
#     "--graceful-timeout", "30", \
#     "--keep-alive", "5", \
#     "--access-logfile", "-", \
#     "--error-logfile", "-", \
#     "--log-level", "info"]

# ============================================
# Build Instructions
# ============================================
# Build with build args:
#   docker build \
#     --build-arg APP_VERSION=1.0.0 \
#     --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
#     --build-arg VCS_REF=$(git rev-parse --short HEAD) \
#     -t convergence-pipeline:latest \
#     -f infrastructure/docker/Dockerfile .
#
# Run locally:
#   docker run -p 8000:8000 \
#     -e GCP_PROJECT_ID=your-project \
#     -e ENVIRONMENT=dev \
#     convergence-pipeline:latest
#
# Push to GCR:
#   docker tag convergence-pipeline:latest gcr.io/PROJECT_ID/convergence-pipeline:latest
#   docker push gcr.io/PROJECT_ID/convergence-pipeline:latest
# ============================================

# ============================================
# Security Best Practices Implemented
# ============================================
# ✓ Multi-stage build (minimal attack surface)
# ✓ Non-root user (UID 1000)
# ✓ Minimal base image (slim-bookworm)
# ✓ No unnecessary packages
# ✓ Health check included
# ✓ Proper file permissions
# ✓ Environment variables for configuration
# ✓ Python bytecode optimization
# ✓ No secrets in image
# ✓ OCI standard labels
# ✓ Graceful shutdown support
# ============================================
