# Scheduler Jobs Dockerfile
# Extends the API service image to include job scripts
#
# Build: docker build -f 05-scheduler-jobs/Dockerfile -t cloudact-jobs:latest .
# Note: Must be built from repo root to access both api-service and scheduler-jobs

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy API service requirements and code (jobs need these imports)
COPY 02-api-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install additional dependencies for jobs
RUN pip install --no-cache-dir httpx

# Copy API service source code
COPY 02-api-service/src ./src
COPY 02-api-service/configs ./configs

# Copy job scripts
COPY 05-scheduler-jobs/jobs ./jobs

# Build args
ARG TARGET_ENV=local
ARG VERSION=unknown

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV RELEASE_VERSION=${VERSION}
ENV PYTHONPATH=/app

# Copy environment config if exists
COPY 02-api-service/.env.* ./
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
      echo "Warning: ${ENV_FILE} not found"; \
    fi

# Default command (will be overridden by Cloud Run job)
CMD ["python", "--version"]
