FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Build args
ARG TARGET_ENV=local
ARG VERSION=unknown
ARG BUILD_DATE=unknown
ARG GIT_COMMIT=unknown

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

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV RELEASE_VERSION=${VERSION}
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_COMMIT=${GIT_COMMIT}

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
