# ============================================
# Stage 1: Builder
# ============================================
FROM python:3.11-slim as builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ============================================
# Stage 2: Runtime
# ============================================
FROM python:3.11-slim

RUN useradd -m -u 1000 appuser

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --chown=appuser:appuser . .

ARG TARGET_ENV=local

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8002}/health || exit 1

EXPOSE 8002

CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
