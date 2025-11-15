"""
Firestore-Based Distributed Pipeline Lock Manager
Prevents duplicate concurrent execution across multiple instances.
Built-in TTL for automatic expiration, no additional infrastructure.
"""

import time
import logging
from typing import Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta

from google.cloud import firestore
from google.api_core import exceptions as gcp_exceptions

logger = logging.getLogger(__name__)


@dataclass
class PipelineLock:
    """Represents an active pipeline execution lock."""
    pipeline_logging_id: str
    tenant_id: str
    pipeline_id: str
    locked_at: float
    locked_by: str
    expires_at: float


class FirestoreLockManager:
    """
    Distributed lock manager using Firestore for pipeline concurrency control.

    Features:
    - Prevents duplicate execution of same pipeline for same tenant
    - Automatic lock expiration via Firestore TTL
    - Works across multiple application instances
    - No additional infrastructure (uses existing GCP stack)
    - Thread-safe atomic operations via Firestore transactions

    Collection Structure:
    pipeline_locks/{tenant_id}:{pipeline_id}
        - pipeline_logging_id: str
        - tenant_id: str
        - pipeline_id: str
        - locked_at: timestamp
        - locked_by: str
        - expires_at: timestamp (TTL field)
    """

    def __init__(
        self,
        project_id: str,
        lock_timeout_seconds: int = 3600,
        collection_name: str = "pipeline_locks"
    ):
        """
        Initialize Firestore lock manager.

        Args:
            project_id: GCP project ID
            lock_timeout_seconds: Maximum time a lock can be held before auto-expiration.
                                 Default: 3600 seconds (1 hour)
            collection_name: Firestore collection name for locks
        """
        self.db = firestore.Client(project=project_id)
        self.collection_name = collection_name
        self.lock_timeout = lock_timeout_seconds

        logger.info(
            f"Initialized FirestoreLockManager",
            extra={
                "project_id": project_id,
                "collection": collection_name,
                "timeout_seconds": lock_timeout_seconds
            }
        )

    def _get_lock_key(self, tenant_id: str, pipeline_id: str) -> str:
        """Generate unique lock key for tenant + pipeline combination."""
        return f"{tenant_id}:{pipeline_id}"

    def _is_lock_expired(self, lock_data: dict) -> bool:
        """Check if a lock has expired."""
        if not lock_data:
            return True

        expires_at = lock_data.get("expires_at")
        if not expires_at:
            return True

        # Firestore timestamps are datetime objects
        if isinstance(expires_at, datetime):
            return datetime.now() > expires_at

        # Handle timestamp as float
        return time.time() > expires_at

    async def acquire_lock(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        locked_by: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Try to acquire a lock for pipeline execution using Firestore transaction.

        Args:
            tenant_id: Tenant identifier
            pipeline_id: Pipeline identifier
            pipeline_logging_id: Current execution ID
            locked_by: Who is requesting the lock (for audit)

        Returns:
            Tuple of (success: bool, existing_pipeline_logging_id: Optional[str])
            - (True, None): Lock acquired successfully
            - (False, existing_id): Lock already held by another execution
        """
        lock_key = self._get_lock_key(tenant_id, pipeline_id)
        lock_ref = self.db.collection(self.collection_name).document(lock_key)

        try:
            # Use Firestore transaction for atomic read-modify-write
            transaction = self.db.transaction()

            @firestore.transactional
            def acquire_lock_transaction(transaction, lock_ref):
                """Atomic lock acquisition logic."""
                # Read existing lock
                snapshot = lock_ref.get(transaction=transaction)

                if snapshot.exists:
                    existing_lock = snapshot.to_dict()

                    # Check if lock expired
                    if not self._is_lock_expired(existing_lock):
                        logger.info(
                            f"Pipeline already running - returning existing execution",
                            extra={
                                "tenant_id": tenant_id,
                                "pipeline_id": pipeline_id,
                                "existing_pipeline_logging_id": existing_lock.get("pipeline_logging_id"),
                                "requested_pipeline_logging_id": pipeline_logging_id,
                                "locked_by": existing_lock.get("locked_by")
                            }
                        )
                        return (False, existing_lock.get("pipeline_logging_id"))

                    # Lock expired - will be replaced
                    logger.warning(
                        f"Replacing expired lock",
                        extra={
                            "tenant_id": tenant_id,
                            "pipeline_id": pipeline_id,
                            "expired_pipeline_logging_id": existing_lock.get("pipeline_logging_id")
                        }
                    )

                # Acquire new lock
                now = datetime.now()
                expires_at = now + timedelta(seconds=self.lock_timeout)

                lock_data = {
                    "pipeline_logging_id": pipeline_logging_id,
                    "tenant_id": tenant_id,
                    "pipeline_id": pipeline_id,
                    "locked_at": now,
                    "locked_by": locked_by,
                    "expires_at": expires_at
                }

                transaction.set(lock_ref, lock_data)

                logger.info(
                    f"Lock acquired",
                    extra={
                        "tenant_id": tenant_id,
                        "pipeline_id": pipeline_id,
                        "pipeline_logging_id": pipeline_logging_id,
                        "locked_by": locked_by,
                        "expires_at": expires_at.isoformat()
                    }
                )

                return (True, None)

            # Execute transaction
            return acquire_lock_transaction(transaction, lock_ref)

        except gcp_exceptions.GoogleAPIError as e:
            logger.error(
                f"Firestore error during lock acquisition",
                exc_info=True,
                extra={
                    "tenant_id": tenant_id,
                    "pipeline_id": pipeline_id,
                    "error": str(e)
                }
            )
            # On error, allow execution (fail open)
            return (True, None)

    async def release_lock(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str
    ) -> bool:
        """
        Release a lock after pipeline execution completes.

        Args:
            tenant_id: Tenant identifier
            pipeline_id: Pipeline identifier
            pipeline_logging_id: Execution ID that holds the lock

        Returns:
            True if lock was released, False if lock not found or held by different execution
        """
        lock_key = self._get_lock_key(tenant_id, pipeline_id)
        lock_ref = self.db.collection(self.collection_name).document(lock_key)

        try:
            # Use transaction for atomic check-and-delete
            transaction = self.db.transaction()

            @firestore.transactional
            def release_lock_transaction(transaction, lock_ref):
                """Atomic lock release logic."""
                snapshot = lock_ref.get(transaction=transaction)

                if not snapshot.exists:
                    logger.warning(
                        f"Attempted to release non-existent lock",
                        extra={
                            "tenant_id": tenant_id,
                            "pipeline_id": pipeline_id,
                            "pipeline_logging_id": pipeline_logging_id
                        }
                    )
                    return False

                existing_lock = snapshot.to_dict()

                # Only release if this execution holds the lock
                if existing_lock.get("pipeline_logging_id") != pipeline_logging_id:
                    logger.warning(
                        f"Attempted to release lock held by different execution",
                        extra={
                            "tenant_id": tenant_id,
                            "pipeline_id": pipeline_id,
                            "requested_id": pipeline_logging_id,
                            "actual_holder_id": existing_lock.get("pipeline_logging_id")
                        }
                    )
                    return False

                # Release the lock
                transaction.delete(lock_ref)

                locked_at = existing_lock.get("locked_at")
                duration = None
                if isinstance(locked_at, datetime):
                    duration = int((datetime.now() - locked_at).total_seconds())

                logger.info(
                    f"Lock released",
                    extra={
                        "tenant_id": tenant_id,
                        "pipeline_id": pipeline_id,
                        "pipeline_logging_id": pipeline_logging_id,
                        "lock_duration_seconds": duration
                    }
                )

                return True

            # Execute transaction
            return release_lock_transaction(transaction, lock_ref)

        except gcp_exceptions.GoogleAPIError as e:
            logger.error(
                f"Firestore error during lock release",
                exc_info=True,
                extra={
                    "tenant_id": tenant_id,
                    "pipeline_id": pipeline_id,
                    "error": str(e)
                }
            )
            return False

    async def get_lock_status(
        self,
        tenant_id: str,
        pipeline_id: str
    ) -> Optional[PipelineLock]:
        """
        Check if a pipeline currently has an active lock.

        Returns:
            PipelineLock if locked, None if not locked
        """
        lock_key = self._get_lock_key(tenant_id, pipeline_id)
        lock_ref = self.db.collection(self.collection_name).document(lock_key)

        try:
            snapshot = lock_ref.get()

            if not snapshot.exists:
                return None

            lock_data = snapshot.to_dict()

            # Check if expired
            if self._is_lock_expired(lock_data):
                # Clean up expired lock
                lock_ref.delete()
                return None

            # Convert to PipelineLock dataclass
            locked_at = lock_data.get("locked_at")
            expires_at = lock_data.get("expires_at")

            # Convert datetime to timestamp
            if isinstance(locked_at, datetime):
                locked_at = locked_at.timestamp()
            if isinstance(expires_at, datetime):
                expires_at = expires_at.timestamp()

            return PipelineLock(
                pipeline_logging_id=lock_data.get("pipeline_logging_id"),
                tenant_id=lock_data.get("tenant_id"),
                pipeline_id=lock_data.get("pipeline_id"),
                locked_at=locked_at,
                locked_by=lock_data.get("locked_by"),
                expires_at=expires_at
            )

        except gcp_exceptions.GoogleAPIError as e:
            logger.error(
                f"Firestore error checking lock status",
                exc_info=True,
                extra={
                    "tenant_id": tenant_id,
                    "pipeline_id": pipeline_id,
                    "error": str(e)
                }
            )
            return None

    async def get_active_locks(self) -> dict:
        """Get all active locks (for monitoring/debugging)."""
        try:
            locks = {}
            collection_ref = self.db.collection(self.collection_name)

            for doc in collection_ref.stream():
                lock_data = doc.to_dict()
                if not self._is_lock_expired(lock_data):
                    locks[doc.id] = lock_data

            return locks

        except gcp_exceptions.GoogleAPIError as e:
            logger.error(
                f"Firestore error getting active locks",
                exc_info=True,
                extra={"error": str(e)}
            )
            return {}


# Global singleton instance
_firestore_lock_manager: Optional[FirestoreLockManager] = None


def get_firestore_lock_manager(
    project_id: str = None,
    lock_timeout_seconds: int = 3600
) -> FirestoreLockManager:
    """
    Get the global Firestore lock manager instance (singleton pattern).

    Args:
        project_id: GCP project ID (required on first call)
        lock_timeout_seconds: Lock expiration time (only used on first call)

    Returns:
        FirestoreLockManager instance
    """
    global _firestore_lock_manager

    if _firestore_lock_manager is None:
        if not project_id:
            raise ValueError("project_id required for first initialization")

        _firestore_lock_manager = FirestoreLockManager(
            project_id=project_id,
            lock_timeout_seconds=lock_timeout_seconds
        )
        logger.info(f"Initialized FirestoreLockManager for project {project_id}")

    return _firestore_lock_manager
