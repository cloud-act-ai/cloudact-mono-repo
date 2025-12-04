"""
In-Memory Pipeline Lock Manager
Prevents duplicate concurrent execution of the same pipeline without external dependencies.
Thread-safe implementation using asyncio locks.
"""

import asyncio
import time
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class PipelineLock:
    """Represents an active pipeline execution lock."""
    pipeline_logging_id: str
    org_slug: str
    pipeline_id: str
    locked_at: float
    locked_by: str


class PipelineLockManager:
    """
    Thread-safe in-memory lock manager for pipeline concurrency control.

    Features:
    - Prevents duplicate execution of same pipeline for same org
    - Automatic lock expiration (stale lock cleanup)
    - No external dependencies (Redis/Firestore)
    - Works across multiple uvicorn workers via shared memory

    Note: Locks are lost on application restart. For multi-instance deployments,
    consider using distributed locks (Redis/Firestore).
    """

    def __init__(self, lock_timeout_seconds: int = 3600):
        """
        Initialize the lock manager.

        Args:
            lock_timeout_seconds: Maximum time a lock can be held before auto-expiration.
                                 Default: 3600 seconds (1 hour)
        """
        self._locks: Dict[str, PipelineLock] = {}
        self._lock_timeout = lock_timeout_seconds
        self._asyncio_lock = asyncio.Lock()

    def _get_lock_key(self, org_slug: str, pipeline_id: str) -> str:
        """Generate unique lock key for org + pipeline combination."""
        return f"{org_slug}:{pipeline_id}"

    def _is_lock_expired(self, lock: PipelineLock) -> bool:
        """Check if a lock has expired."""
        elapsed = time.time() - lock.locked_at
        return elapsed > self._lock_timeout

    async def _cleanup_expired_locks(self):
        """Remove all expired locks from memory."""
        current_time = time.time()
        expired_keys = [
            key for key, lock in self._locks.items()
            if current_time - lock.locked_at > self._lock_timeout
        ]

        for key in expired_keys:
            expired_lock = self._locks.pop(key, None)
            if expired_lock:
                logger.warning(
                    f"Removed expired lock",
                    extra={
                        "org_slug": expired_lock.org_slug,
                        "pipeline_id": expired_lock.pipeline_id,
                        "pipeline_logging_id": expired_lock.pipeline_logging_id,
                        "lock_age_seconds": int(current_time - expired_lock.locked_at)
                    }
                )

    async def acquire_lock(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        locked_by: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Try to acquire a lock for pipeline execution.

        Args:
            org_slug: Org identifier
            pipeline_id: Pipeline identifier
            pipeline_logging_id: Current execution ID
            locked_by: Who is requesting the lock (for audit)

        Returns:
            Tuple of (success: bool, existing_pipeline_logging_id: Optional[str])
            - (True, None): Lock acquired successfully
            - (False, existing_id): Lock already held by another execution
        """
        async with self._asyncio_lock:
            # Cleanup expired locks first
            await self._cleanup_expired_locks()

            lock_key = self._get_lock_key(org_slug, pipeline_id)

            # Check if lock already exists
            existing_lock = self._locks.get(lock_key)

            if existing_lock:
                # Lock exists and not expired
                if not self._is_lock_expired(existing_lock):
                    logger.info(
                        f"Pipeline already running - returning existing execution",
                        extra={
                            "org_slug": org_slug,
                            "pipeline_id": pipeline_id,
                            "existing_pipeline_logging_id": existing_lock.pipeline_logging_id,
                            "requested_pipeline_logging_id": pipeline_logging_id,
                            "lock_age_seconds": int(time.time() - existing_lock.locked_at)
                        }
                    )
                    return (False, existing_lock.pipeline_logging_id)

                # Lock expired - remove it
                logger.warning(
                    f"Replacing expired lock",
                    extra={
                        "org_slug": org_slug,
                        "pipeline_id": pipeline_id,
                        "expired_pipeline_logging_id": existing_lock.pipeline_logging_id
                    }
                )

            # Acquire new lock
            new_lock = PipelineLock(
                pipeline_logging_id=pipeline_logging_id,
                org_slug=org_slug,
                pipeline_id=pipeline_id,
                locked_at=time.time(),
                locked_by=locked_by
            )

            self._locks[lock_key] = new_lock

            logger.info(
                f"Lock acquired",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "pipeline_logging_id": pipeline_logging_id,
                    "locked_by": locked_by
                }
            )

            return (True, None)

    async def release_lock(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str
    ) -> bool:
        """
        Release a lock after pipeline execution completes.

        Args:
            org_slug: Org identifier
            pipeline_id: Pipeline identifier
            pipeline_logging_id: Execution ID that holds the lock

        Returns:
            True if lock was released, False if lock not found or held by different execution
        """
        async with self._asyncio_lock:
            lock_key = self._get_lock_key(org_slug, pipeline_id)
            existing_lock = self._locks.get(lock_key)

            if not existing_lock:
                logger.warning(
                    f"Attempted to release non-existent lock",
                    extra={
                        "org_slug": org_slug,
                        "pipeline_id": pipeline_id,
                        "pipeline_logging_id": pipeline_logging_id
                    }
                )
                return False

            # Only release if this execution holds the lock
            if existing_lock.pipeline_logging_id != pipeline_logging_id:
                logger.warning(
                    f"Attempted to release lock held by different execution",
                    extra={
                        "org_slug": org_slug,
                        "pipeline_id": pipeline_id,
                        "requested_id": pipeline_logging_id,
                        "actual_holder_id": existing_lock.pipeline_logging_id
                    }
                )
                return False

            # Release the lock
            self._locks.pop(lock_key, None)

            logger.info(
                f"Lock released",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "pipeline_logging_id": pipeline_logging_id,
                    "lock_duration_seconds": int(time.time() - existing_lock.locked_at)
                }
            )

            return True

    async def get_active_locks(self) -> Dict[str, PipelineLock]:
        """Get all active locks (for monitoring/debugging)."""
        async with self._asyncio_lock:
            await self._cleanup_expired_locks()
            return dict(self._locks)

    async def get_lock_status(
        self,
        org_slug: str,
        pipeline_id: str
    ) -> Optional[PipelineLock]:
        """
        Check if a pipeline currently has an active lock.

        Returns:
            PipelineLock if locked, None if not locked
        """
        async with self._asyncio_lock:
            lock_key = self._get_lock_key(org_slug, pipeline_id)
            lock = self._locks.get(lock_key)

            if lock and self._is_lock_expired(lock):
                # Clean up expired lock
                self._locks.pop(lock_key, None)
                return None

            return lock


# Global singleton instance
_pipeline_lock_manager: Optional[PipelineLockManager] = None


def get_pipeline_lock_manager(lock_timeout_seconds: int = 3600) -> PipelineLockManager:
    """
    Get the global pipeline lock manager instance (singleton pattern).

    Args:
        lock_timeout_seconds: Lock expiration time (only used on first call)

    Returns:
        PipelineLockManager instance
    """
    global _pipeline_lock_manager

    if _pipeline_lock_manager is None:
        _pipeline_lock_manager = PipelineLockManager(lock_timeout_seconds)
        logger.info(f"Initialized PipelineLockManager with {lock_timeout_seconds}s timeout")

    return _pipeline_lock_manager
