"""
Queue Manager Tests
Comprehensive tests for pipeline execution queue management.

Tests cover:
- Queue operations (enqueue, dequeue, peek)
- Job state transitions (QUEUED → PROCESSING → COMPLETED/FAILED)
- Priority handling
- Concurrency control
- Worker assignment
- Atomic dequeue operations
- Queue status and metrics
"""

import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timezone
from google.cloud import bigquery
from google.api_core import exceptions as google_exceptions

from src.core.scheduler.queue_manager import QueueManager
from src.core.scheduler.state_transitions import QueueStatus


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client for testing."""
    client = MagicMock(spec=bigquery.Client)
    client.project = "test-project"
    return client


@pytest.fixture
def queue_manager(mock_bq_client):
    """Create QueueManager instance with mocked BigQuery client."""
    with patch("src.core.scheduler.queue_manager.settings") as mock_settings:
        mock_settings.gcp_project_id = "test-project"
        mock_settings.bq_max_retry_attempts = 3
        manager = QueueManager(mock_bq_client)
        return manager


@pytest.fixture
def sample_config():
    """Sample pipeline configuration for queue items."""
    return {
        "config_id": "config-123",
        "provider": "gcp",
        "domain": "cost",
        "pipeline_template": "billing"
    }


# ============================================
# Enqueue Tests
# ============================================

@pytest.mark.asyncio
async def test_enqueue_success(queue_manager, mock_bq_client, sample_config):
    """
    Test successful pipeline enqueue.

    Verifies:
    - Queue ID is generated
    - Row inserted to BigQuery
    - Status set to QUEUED
    - Idempotency key used
    """
    # Mock successful insert
    mock_bq_client.insert_rows_json.return_value = []

    queue_id = await queue_manager.enqueue(
        org_slug="test_org",
        config=sample_config,
        priority=5
    )

    # Verify queue ID generated
    assert queue_id is not None
    assert isinstance(queue_id, str)
    assert len(queue_id) > 0

    # Verify BigQuery insert called
    mock_bq_client.insert_rows_json.assert_called_once()
    call_args = mock_bq_client.insert_rows_json.call_args

    # Verify table ID
    table_id = call_args[0][0]
    assert table_id == "test-project.metadata.org_meta_pipeline_queue"

    # Verify row data
    rows = call_args[0][1]
    assert len(rows) == 1
    row = rows[0]
    assert row["queue_id"] == queue_id
    assert row["org_slug"] == "test_org"
    assert row["config"] == sample_config
    assert row["priority"] == 5
    assert row["status"] == QueueStatus.QUEUED.value
    assert row["worker_id"] is None
    assert row["error_message"] is None

    # Verify idempotency
    row_ids = call_args[1]["row_ids"]
    assert row_ids == [queue_id]


@pytest.mark.asyncio
async def test_enqueue_with_high_priority(queue_manager, mock_bq_client, sample_config):
    """Test enqueue with high priority (1 = highest)."""
    mock_bq_client.insert_rows_json.return_value = []

    queue_id = await queue_manager.enqueue(
        org_slug="test_org",
        config=sample_config,
        priority=1  # Highest priority
    )

    # Verify priority set correctly
    call_args = mock_bq_client.insert_rows_json.call_args
    row = call_args[0][1][0]
    assert row["priority"] == 1


@pytest.mark.asyncio
async def test_enqueue_with_low_priority(queue_manager, mock_bq_client, sample_config):
    """Test enqueue with low priority (10 = lowest)."""
    mock_bq_client.insert_rows_json.return_value = []

    queue_id = await queue_manager.enqueue(
        org_slug="test_org",
        config=sample_config,
        priority=10  # Lowest priority
    )

    # Verify priority set correctly
    call_args = mock_bq_client.insert_rows_json.call_args
    row = call_args[0][1][0]
    assert row["priority"] == 10


@pytest.mark.asyncio
async def test_enqueue_failure(queue_manager, mock_bq_client, sample_config):
    """
    Test enqueue failure handling.

    Verifies:
    - ValueError raised on insert error
    - Error message includes details
    """
    # Mock insert error
    mock_bq_client.insert_rows_json.return_value = [
        {"index": 0, "errors": [{"message": "Insert failed"}]}
    ]

    with pytest.raises(ValueError) as exc_info:
        await queue_manager.enqueue(
            org_slug="test_org",
            config=sample_config,
            priority=5
        )

    assert "Failed to enqueue pipeline" in str(exc_info.value)


@pytest.mark.asyncio
async def test_enqueue_multiple_items(queue_manager, mock_bq_client, sample_config):
    """Test enqueuing multiple items generates unique IDs."""
    mock_bq_client.insert_rows_json.return_value = []

    queue_ids = []
    for i in range(3):
        queue_id = await queue_manager.enqueue(
            org_slug=f"test_org_{i}",
            config=sample_config,
            priority=i + 1
        )
        queue_ids.append(queue_id)

    # Verify all IDs are unique
    assert len(queue_ids) == len(set(queue_ids))


# ============================================
# Dequeue Tests
# ============================================

@pytest.mark.asyncio
async def test_dequeue_success(queue_manager, mock_bq_client):
    """
    Test successful dequeue operation.

    Verifies:
    - Item fetched from queue
    - Status updated to PROCESSING
    - Worker ID assigned
    - Atomic operation (MERGE statement)
    """
    worker_id = "worker-123"

    # Mock MERGE query result (no rows returned from MERGE)
    merge_job = MagicMock()
    merge_job.result.return_value = []

    # Mock SELECT query result
    fetch_job = MagicMock()
    fetch_row = {
        "queue_id": "queue-123",
        "org_slug": "test_org",
        "config": {"provider": "gcp"},
        "priority": 5,
        "status": QueueStatus.PROCESSING.value,
        "worker_id": worker_id,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    fetch_job.result.return_value = [fetch_row]

    # Setup client.query to return different jobs for MERGE and SELECT
    mock_bq_client.query.side_effect = [merge_job, fetch_job]

    item = await queue_manager.dequeue(worker_id)

    # Verify item returned
    assert item is not None
    assert item["queue_id"] == "queue-123"
    assert item["org_slug"] == "test_org"
    assert item["status"] == QueueStatus.PROCESSING.value
    assert item["worker_id"] == worker_id

    # Verify MERGE query called (atomic update)
    assert mock_bq_client.query.call_count == 2
    merge_query = mock_bq_client.query.call_args_list[0][0][0]
    assert "MERGE" in merge_query
    assert "status = 'QUEUED'" in merge_query  # WHERE clause
    assert "status = 'PROCESSING'" in merge_query  # UPDATE clause


@pytest.mark.asyncio
async def test_dequeue_empty_queue(queue_manager, mock_bq_client):
    """
    Test dequeue when queue is empty.

    Verifies:
    - Returns None when no items available
    - No errors raised
    """
    worker_id = "worker-123"

    # Mock empty MERGE result
    merge_job = MagicMock()
    merge_job.result.return_value = []

    # Mock empty SELECT result
    fetch_job = MagicMock()
    fetch_job.result.return_value = []

    mock_bq_client.query.side_effect = [merge_job, fetch_job]

    item = await queue_manager.dequeue(worker_id)

    # Verify None returned for empty queue
    assert item is None


@pytest.mark.asyncio
async def test_dequeue_priority_order(queue_manager, mock_bq_client):
    """
    Test dequeue respects priority ordering.

    Verifies:
    - Higher priority items dequeued first
    - ORDER BY clause includes priority
    """
    worker_id = "worker-123"

    merge_job = MagicMock()
    merge_job.result.return_value = []

    fetch_job = MagicMock()
    fetch_job.result.return_value = []

    mock_bq_client.query.side_effect = [merge_job, fetch_job]

    await queue_manager.dequeue(worker_id)

    # Verify MERGE query includes priority ordering
    merge_query = mock_bq_client.query.call_args_list[0][0][0]
    assert "ORDER BY priority ASC" in merge_query


@pytest.mark.asyncio
async def test_dequeue_fifo_within_priority(queue_manager, mock_bq_client):
    """
    Test dequeue uses FIFO within same priority.

    Verifies:
    - Items with same priority ordered by created_at
    - Oldest item dequeued first
    """
    worker_id = "worker-123"

    merge_job = MagicMock()
    merge_job.result.return_value = []

    fetch_job = MagicMock()
    fetch_job.result.return_value = []

    mock_bq_client.query.side_effect = [merge_job, fetch_job]

    await queue_manager.dequeue(worker_id)

    # Verify MERGE query includes created_at ordering
    merge_query = mock_bq_client.query.call_args_list[0][0][0]
    assert "created_at ASC" in merge_query


@pytest.mark.asyncio
async def test_dequeue_concurrent_workers(queue_manager, mock_bq_client):
    """
    Test concurrent dequeue from multiple workers.

    Verifies:
    - Each worker gets unique item
    - Atomic MERGE prevents race conditions
    """
    # Simulate two workers dequeuing sequentially (since mocking concurrent is complex)
    worker1_id = "worker-1"
    worker2_id = "worker-2"

    # Worker 1 gets first item
    merge_job1 = MagicMock()
    merge_job1.result.return_value = []
    fetch_job1 = MagicMock()
    fetch_job1.result.return_value = [{
        "queue_id": "queue-1",
        "worker_id": worker1_id,
        "status": QueueStatus.PROCESSING.value
    }]

    # Worker 2 gets second item
    merge_job2 = MagicMock()
    merge_job2.result.return_value = []
    fetch_job2 = MagicMock()
    fetch_job2.result.return_value = [{
        "queue_id": "queue-2",
        "worker_id": worker2_id,
        "status": QueueStatus.PROCESSING.value
    }]

    # Setup separate call sequences
    call_count = [0]

    def query_side_effect(*args, **kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            return merge_job1
        elif call_count[0] == 2:
            return fetch_job1
        elif call_count[0] == 3:
            return merge_job2
        elif call_count[0] == 4:
            return fetch_job2
        return MagicMock()

    mock_bq_client.query.side_effect = query_side_effect

    # Dequeue sequentially
    item1 = await queue_manager.dequeue(worker1_id)
    item2 = await queue_manager.dequeue(worker2_id)

    # Verify different items returned
    assert item1["queue_id"] == "queue-1"
    assert item2["queue_id"] == "queue-2"
    assert item1["worker_id"] == worker1_id
    assert item2["worker_id"] == worker2_id


# ============================================
# Mark Completed Tests
# ============================================

@pytest.mark.asyncio
async def test_mark_completed_success(queue_manager, mock_bq_client):
    """
    Test marking queue item as completed.

    Verifies:
    - Status updated to COMPLETED
    - Update query executed
    """
    queue_id = "queue-123"

    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await queue_manager.mark_completed(queue_id)

    # Verify UPDATE query called
    mock_bq_client.query.assert_called_once()
    query = mock_bq_client.query.call_args[0][0]
    assert "UPDATE" in query
    assert "status = 'COMPLETED'" in query
    assert "WHERE queue_id = @queue_id" in query


@pytest.mark.asyncio
async def test_mark_completed_with_retry(queue_manager, mock_bq_client):
    """
    Test mark_completed retries on transient errors.

    Verifies:
    - Transient errors trigger retry
    - Eventually succeeds
    """
    queue_id = "queue-123"

    # First call fails, second succeeds
    error_job = MagicMock()
    error_job.result.side_effect = google_exceptions.ServiceUnavailable("Temporary error")

    success_job = MagicMock()
    success_job.result.return_value = []

    mock_bq_client.query.side_effect = [error_job, success_job]

    # Should retry and succeed
    await queue_manager.mark_completed(queue_id)

    # Verify retry occurred
    assert mock_bq_client.query.call_count == 2


# ============================================
# Mark Failed Tests
# ============================================

@pytest.mark.asyncio
async def test_mark_failed_success(queue_manager, mock_bq_client):
    """
    Test marking queue item as failed.

    Verifies:
    - Status updated to FAILED
    - Error message stored
    """
    queue_id = "queue-123"
    error_message = "Pipeline execution failed"

    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await queue_manager.mark_failed(queue_id, error_message)

    # Verify UPDATE query called
    mock_bq_client.query.assert_called_once()
    query = mock_bq_client.query.call_args[0][0]
    assert "UPDATE" in query
    assert "status = 'FAILED'" in query
    assert "error_message = @error" in query
    assert "WHERE queue_id = @queue_id" in query

    # Verify error message parameter
    job_config = mock_bq_client.query.call_args[1]["job_config"]
    params = {p.name: p.value for p in job_config.query_parameters}
    assert params["error"] == error_message


@pytest.mark.asyncio
async def test_mark_failed_long_error_message(queue_manager, mock_bq_client):
    """Test marking failed with very long error message."""
    queue_id = "queue-123"
    error_message = "A" * 10000  # Very long error

    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await queue_manager.mark_failed(queue_id, error_message)

    # Verify query executed (error message should be handled by BigQuery)
    mock_bq_client.query.assert_called_once()


# ============================================
# Queue Length Tests
# ============================================

@pytest.mark.asyncio
async def test_get_queue_length_success(queue_manager, mock_bq_client):
    """
    Test getting current queue length.

    Verifies:
    - Returns count of QUEUED items
    - Excludes PROCESSING/COMPLETED items
    """
    query_job = MagicMock()
    query_job.result.return_value = [{"count": 42}]
    mock_bq_client.query.return_value = query_job

    length = await queue_manager.get_queue_length()

    assert length == 42

    # Verify query filters by QUEUED status
    query = mock_bq_client.query.call_args[0][0]
    assert "WHERE status = 'QUEUED'" in query


@pytest.mark.asyncio
async def test_get_queue_length_empty(queue_manager, mock_bq_client):
    """Test getting queue length when queue is empty."""
    query_job = MagicMock()
    query_job.result.return_value = [{"count": 0}]
    mock_bq_client.query.return_value = query_job

    length = await queue_manager.get_queue_length()

    assert length == 0


# ============================================
# Queue Status Tests
# ============================================

@pytest.mark.asyncio
async def test_get_queue_status_success(queue_manager, mock_bq_client):
    """
    Test getting queue status summary.

    Verifies:
    - Returns queued, processing, and avg wait time
    - Calculates metrics correctly
    """
    query_job = MagicMock()
    query_job.result.return_value = [{
        "queued": 10,
        "processing": 3,
        "avg_wait_time_seconds": 45.5
    }]
    mock_bq_client.query.return_value = query_job

    status = await queue_manager.get_queue_status()

    assert status["queued"] == 10
    assert status["processing"] == 3
    assert status["avg_wait_time_seconds"] == 45


@pytest.mark.asyncio
async def test_get_queue_status_no_data(queue_manager, mock_bq_client):
    """Test getting queue status when no recent activity."""
    query_job = MagicMock()
    query_job.result.return_value = [{
        "queued": 0,
        "processing": 0,
        "avg_wait_time_seconds": None
    }]
    mock_bq_client.query.return_value = query_job

    status = await queue_manager.get_queue_status()

    assert status["queued"] == 0
    assert status["processing"] == 0
    assert status["avg_wait_time_seconds"] == 0  # Defaults to 0 when None


@pytest.mark.asyncio
async def test_get_queue_status_calculates_avg_wait_time(queue_manager, mock_bq_client):
    """Test queue status calculates average wait time correctly."""
    query_job = MagicMock()
    query_job.result.return_value = [{
        "queued": 5,
        "processing": 2,
        "avg_wait_time_seconds": 120.75
    }]
    mock_bq_client.query.return_value = query_job

    status = await queue_manager.get_queue_status()

    # Verify avg_wait_time is converted to int
    assert status["avg_wait_time_seconds"] == 120

    # Verify query looks at last hour
    query = mock_bq_client.query.call_args[0][0]
    assert "INTERVAL 1 HOUR" in query


# ============================================
# Error Handling Tests
# ============================================

@pytest.mark.asyncio
async def test_enqueue_with_transient_error_retries(queue_manager, mock_bq_client, sample_config):
    """
    Test enqueue retries on transient errors.

    Verifies:
    - ServiceUnavailable triggers retry
    - Eventually succeeds
    """
    # First call fails, second succeeds
    mock_bq_client.insert_rows_json.side_effect = [
        google_exceptions.ServiceUnavailable("Temporary error"),
        []  # Success
    ]

    queue_id = await queue_manager.enqueue(
        org_slug="test_org",
        config=sample_config,
        priority=5
    )

    # Verify retry occurred
    assert mock_bq_client.insert_rows_json.call_count == 2
    assert queue_id is not None


@pytest.mark.asyncio
async def test_dequeue_with_timeout_error_retries(queue_manager, mock_bq_client):
    """Test dequeue retries on timeout errors."""
    worker_id = "worker-123"

    # First MERGE fails with timeout
    error_job = MagicMock()
    error_job.result.side_effect = TimeoutError("Query timeout")

    # Second MERGE succeeds
    merge_job = MagicMock()
    merge_job.result.return_value = []

    fetch_job = MagicMock()
    fetch_job.result.return_value = []

    mock_bq_client.query.side_effect = [
        error_job,  # First MERGE fails
        merge_job, fetch_job  # Second MERGE + fetch succeed
    ]

    item = await queue_manager.dequeue(worker_id)

    # Verify retry occurred
    assert mock_bq_client.query.call_count == 3


@pytest.mark.asyncio
async def test_enqueue_max_retries_exceeded(queue_manager, mock_bq_client, sample_config):
    """
    Test enqueue fails after max retries.

    Verifies:
    - Persistent errors eventually raise exception
    - Max retry limit respected
    """
    from tenacity import RetryError

    # All attempts fail
    mock_bq_client.insert_rows_json.side_effect = [
        google_exceptions.ServiceUnavailable("Error")
    ] * 10  # More than max retries

    # Tenacity wraps the exception in RetryError
    with pytest.raises(RetryError):
        await queue_manager.enqueue(
            org_slug="test_org",
            config=sample_config,
            priority=5
        )

    # Verify max retries attempted (3 by default)
    assert mock_bq_client.insert_rows_json.call_count == 3


# ============================================
# Integration Tests
# ============================================

@pytest.mark.asyncio
async def test_enqueue_dequeue_complete_flow(queue_manager, mock_bq_client, sample_config):
    """
    Test complete queue lifecycle: enqueue → dequeue → mark_completed.

    Verifies:
    - Item can be enqueued
    - Same item can be dequeued
    - Item can be marked completed
    """
    # Step 1: Enqueue
    mock_bq_client.insert_rows_json.return_value = []
    queue_id = await queue_manager.enqueue(
        org_slug="test_org",
        config=sample_config,
        priority=5
    )

    # Step 2: Dequeue
    worker_id = "worker-123"
    merge_job = MagicMock()
    merge_job.result.return_value = []

    fetch_job = MagicMock()
    fetch_job.result.return_value = [{
        "queue_id": queue_id,
        "org_slug": "test_org",
        "config": sample_config,
        "status": QueueStatus.PROCESSING.value,
        "worker_id": worker_id
    }]

    mock_bq_client.query.side_effect = [merge_job, fetch_job]

    item = await queue_manager.dequeue(worker_id)
    assert item["queue_id"] == queue_id

    # Step 3: Mark completed
    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await queue_manager.mark_completed(queue_id)

    # Verify all steps executed
    assert mock_bq_client.insert_rows_json.call_count == 1
    assert mock_bq_client.query.call_count >= 3  # dequeue (2) + mark_completed (1)


@pytest.mark.asyncio
async def test_enqueue_dequeue_fail_flow(queue_manager, mock_bq_client, sample_config):
    """
    Test queue failure flow: enqueue → dequeue → mark_failed.

    Verifies:
    - Failed items properly marked
    - Error message stored
    """
    # Step 1: Enqueue
    mock_bq_client.insert_rows_json.return_value = []
    queue_id = await queue_manager.enqueue(
        org_slug="test_org",
        config=sample_config,
        priority=5
    )

    # Step 2: Dequeue
    worker_id = "worker-123"
    merge_job = MagicMock()
    merge_job.result.return_value = []

    fetch_job = MagicMock()
    fetch_job.result.return_value = [{
        "queue_id": queue_id,
        "worker_id": worker_id,
        "status": QueueStatus.PROCESSING.value
    }]

    mock_bq_client.query.side_effect = [merge_job, fetch_job]

    item = await queue_manager.dequeue(worker_id)

    # Step 3: Mark failed
    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    error_message = "Pipeline execution failed: timeout"
    await queue_manager.mark_failed(queue_id, error_message)

    # Verify error message stored
    query = mock_bq_client.query.call_args[0][0]
    assert "error_message = @error" in query
