"""
Base processor components for pipeline idempotency and multi-account support.
"""

from .idempotent_writer import IdempotentWriterMixin

__all__ = ["IdempotentWriterMixin"]
