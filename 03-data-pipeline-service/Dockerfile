# Multi-stage build for enterprise FastAPI application
FROM python:3.11-slim as builder

# Set build arguments
ARG DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create build directory
WORKDIR /build

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir --upgrade pip && \
    pip install --user --no-cache-dir -r requirements.txt

# ============================================
# Runtime stage
# ============================================
FROM python:3.11-slim

# Set runtime arguments
ARG DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1000 appuser

# Set working directory
WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/appuser/.local

# Build arg for target environment: local, test, stage, prod
ARG TARGET_ENV=local

# Copy application code and env files
COPY --chown=appuser:appuser src/ ./src/
COPY --chown=appuser:appuser configs/ ./configs/
COPY --chown=appuser:appuser .env* ./

# Copy the appropriate environment file based on TARGET_ENV
# Mapping: local -> .env.local, test -> .env.test, stage -> .env.stage, prod -> .env.production
RUN ENV_FILE=".env.local" && \
    case "${TARGET_ENV}" in \
      test) ENV_FILE=".env.test" ;; \
      stage) ENV_FILE=".env.stage" ;; \
      prod) ENV_FILE=".env.production" ;; \
      local) ENV_FILE=".env.local" ;; \
    esac && \
    echo "Building with environment: ${TARGET_ENV} using ${ENV_FILE}" && \
    if [ -f "${ENV_FILE}" ]; then \
      cp "${ENV_FILE}" .env.local && \
      echo "Environment configured for ${TARGET_ENV}"; \
    else \
      echo "Warning: ${ENV_FILE} not found, using existing .env.local"; \
    fi

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/tmp && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Add local bin to PATH
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Expose port
EXPOSE 8080

# Run FastAPI with Uvicorn
# Use shell form to allow environment variable substitution
CMD uvicorn src.app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1
