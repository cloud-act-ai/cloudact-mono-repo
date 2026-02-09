"""Request logging middleware."""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        org_slug = request.headers.get("X-Org-Slug", "unknown")

        response = await call_next(request)

        duration_ms = int((time.time() - start) * 1000)
        logger.info(
            f"{request.method} {request.url.path} → {response.status_code} "
            f"({duration_ms}ms) org={org_slug}"
        )
        return response
