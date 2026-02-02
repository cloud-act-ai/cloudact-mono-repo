"""
Enterprise Structured Logging
JSON-formatted logs with trace correlation for Cloud Logging.
"""

import logging
import json
import sys
from typing import Any, Dict, Optional
from datetime import datetime, timezone
from pythonjsonlogger import jsonlogger
from opentelemetry import trace

from src.app.config import settings


class CloudLoggingFormatter(jsonlogger.JsonFormatter):
    """
    Custom JSON formatter for Google Cloud Logging.
    Adds trace_id, span_id, and severity mapping.
    """

    def add_fields(
        self,
        log_record: Dict[str, Any],
        record: logging.LogRecord,
        message_dict: Dict[str, Any]
    ):
        """Add custom fields to log record."""
        super().add_fields(log_record, record, message_dict)

        # Add timestamp in ISO format
        log_record["timestamp"] = datetime.now(timezone.utc).isoformat() + "Z"

        # Add severity (Cloud Logging compatible)
        log_record["severity"] = record.levelname

        # Add trace context from OpenTelemetry
        span = trace.get_current_span()
        if span and span.get_span_context().is_valid:
            span_context = span.get_span_context()
            log_record["trace_id"] = f"{span_context.trace_id:032x}"
            log_record["span_id"] = f"{span_context.span_id:016x}"
            log_record["trace_sampled"] = span_context.trace_flags.sampled

        # Add service metadata
        log_record["service"] = settings.app_name
        log_record["version"] = settings.app_version
        log_record["environment"] = settings.environment

        # Move 'message' to 'msg' if exists
        if "message" in log_record:
            log_record["msg"] = log_record.pop("message")


def setup_logging(log_level: Optional[str] = None):
    """
    Configure application-wide structured logging.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
                  Defaults to settings.log_level
    """
    level = log_level or settings.log_level

    # Create handler for stdout
    handler = logging.StreamHandler(sys.stdout)

    # Set formatter
    formatter = CloudLoggingFormatter(
        fmt="%(timestamp)s %(severity)s %(name)s %(msg)s",
        json_ensure_ascii=False
    )
    handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Suppress noisy third-party loggers
    logging.getLogger("google").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    logging.info(
        "Logging initialized",
        extra={
            "log_level": level,
            "environment": settings.environment
        }
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)


def should_include_stacktrace() -> bool:
    """
    Determine if stack traces should be included in logs.

    SECURITY: In production, stack traces can leak sensitive information
    (credentials in variables, API keys in call stacks, etc.)

    Returns:
        True if stack traces should be included (dev/staging), False for production
    """
    return settings.environment.lower() in ("development", "dev", "local", "staging")


def safe_error_log(
    logger: logging.Logger,
    message: str,
    error: Exception,
    **extra_context
) -> None:
    """
    Log an error safely, conditionally including stack trace based on environment.

    SECURITY: In production, only logs error type and sanitized message.
    In development, includes full stack trace for debugging.

    Args:
        logger: Logger instance
        message: Error message
        error: The exception
        **extra_context: Additional context to include in logs
    """
    # Basic error info always logged
    error_info = {
        "error_type": type(error).__name__,
        "error_module": type(error).__module__,
        **extra_context
    }

    if should_include_stacktrace():
        # Development: Include full stack trace
        logger.error(message, exc_info=True, extra=error_info)
    else:
        # Production: Sanitize error message (remove potential secrets)
        sanitized_msg = _sanitize_error_message(str(error))
        logger.error(
            f"{message}: {sanitized_msg}",
            extra={**error_info, "sanitized": True}
        )


def _sanitize_error_message(error_msg: str) -> str:
    """
    Sanitize error message to remove potential secrets.

    Args:
        error_msg: The original error message

    Returns:
        Sanitized error message
    """
    import re

    # Patterns that might contain secrets
    sensitive_patterns = [
        # API keys
        (r'sk-[a-zA-Z0-9]{20,}', '[REDACTED_API_KEY]'),
        (r'sk-ant-[a-zA-Z0-9]{20,}', '[REDACTED_ANTHROPIC_KEY]'),
        (r'Bearer\s+[a-zA-Z0-9\-_.]+', 'Bearer [REDACTED]'),
        # GCP service account info
        (r'"private_key":\s*"[^"]+?"', '"private_key": "[REDACTED]"'),
        (r'"client_email":\s*"[^"]+?"', '"client_email": "[REDACTED]"'),
        # Generic token patterns
        (r'token["\']?\s*[:=]\s*["\']?[a-zA-Z0-9\-_.]{20,}', 'token: [REDACTED]'),
        (r'key["\']?\s*[:=]\s*["\']?[a-zA-Z0-9\-_.]{20,}', 'key: [REDACTED]'),
        (r'password["\']?\s*[:=]\s*["\']?[^\s"\']+', 'password: [REDACTED]'),
        (r'secret["\']?\s*[:=]\s*["\']?[^\s"\']+', 'secret: [REDACTED]'),
    ]

    sanitized = error_msg
    for pattern, replacement in sensitive_patterns:
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)

    # Truncate very long error messages
    max_length = 500
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "... [TRUNCATED]"

    return sanitized


class StructuredLogger:
    """
    Structured logger wrapper for adding consistent contextual information.
    """

    def __init__(
        self,
        logger: logging.Logger,
        org_slug: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        pipeline_logging_id: Optional[str] = None
    ):
        """
        Initialize structured logger.

        Args:
            logger: Base logger instance
            org_slug: Org identifier
            pipeline_id: Pipeline identifier
            pipeline_logging_id: Unique pipeline run ID
        """
        self.logger = logger
        self.context = {}

        if org_slug:
            self.context["org_slug"] = org_slug
        if pipeline_id:
            self.context["pipeline_id"] = pipeline_id
        if pipeline_logging_id:
            self.context["pipeline_logging_id"] = pipeline_logging_id

    def _log(self, level: int, msg: str, **kwargs):
        """Internal logging method with context injection."""
        # Extract reserved logging parameters
        exc_info = kwargs.pop('exc_info', False)
        stack_info = kwargs.pop('stack_info', False)
        stacklevel = kwargs.pop('stacklevel', 1)

        # SECURITY: Only include stack traces in non-production environments
        # to prevent leaking sensitive information in logs
        if exc_info and not should_include_stacktrace():
            exc_info = False
            kwargs['_stacktrace_omitted'] = True  # Flag for debugging

        # Remaining kwargs go into extra
        extra = {**self.context, **kwargs}

        self.logger.log(
            level, msg,
            exc_info=exc_info,
            stack_info=stack_info,
            stacklevel=stacklevel,
            extra=extra
        )

    def debug(self, msg: str, **kwargs):
        """Log debug message."""
        self._log(logging.DEBUG, msg, **kwargs)

    def info(self, msg: str, **kwargs):
        """Log info message."""
        self._log(logging.INFO, msg, **kwargs)

    def warning(self, msg: str, **kwargs):
        """Log warning message."""
        self._log(logging.WARNING, msg, **kwargs)

    def error(self, msg: str, **kwargs):
        """Log error message."""
        self._log(logging.ERROR, msg, **kwargs)

    def critical(self, msg: str, **kwargs):
        """Log critical message."""
        self._log(logging.CRITICAL, msg, **kwargs)

    def exception(self, msg: str, **kwargs):
        """Log exception with stack trace."""
        extra = {**self.context, **kwargs}
        self.logger.exception(msg, extra=extra)


def create_structured_logger(
    name: str,
    org_slug: Optional[str] = None,
    pipeline_id: Optional[str] = None,
    pipeline_logging_id: Optional[str] = None
) -> StructuredLogger:
    """
    Create a structured logger with context.

    Args:
        name: Logger name
        org_slug: Org identifier
        pipeline_id: Pipeline identifier
        pipeline_logging_id: Unique pipeline run ID

    Returns:
        StructuredLogger instance
    """
    logger = get_logger(name)
    return StructuredLogger(
        logger=logger,
        org_slug=org_slug,
        pipeline_id=pipeline_id,
        pipeline_logging_id=pipeline_logging_id
    )
