"""
Retry Manager Tests
Comprehensive tests for pipeline retry logic with exponential backoff.

Tests cover:
- Retry eligibility checking
- Max retries enforcement
- Error type filtering (retry_on_errors)
- Exponential backoff calculation
- Retry scheduling
- State persistence
- Dead letter queue scenarios
"""

import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timedelta, timezone
from google.cloud import bigquery
from google.api_core import exceptions as google_exceptions

from src.core.scheduler.retry_manager import RetryManager


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
def retry_manager():
    """Create RetryManager instance."""
    with patch("src.core.scheduler.retry_manager.settings") as mock_settings:
        mock_settings.gcp_project_id = "test-project"
        mock_settings.bq_max_retry_attempts = 3
        manager = RetryManager()
        return manager


@pytest.fixture
def retry_config_default():
    """Default retry configuration."""
    return {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": None  # Retry all errors
    }


@pytest.fixture
def retry_config_with_filters():
    """Retry configuration with error type filters."""
    return {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": ["TimeoutError", "TransientError", "ServiceUnavailable"]
    }


# ============================================
# Should Retry Tests
# ============================================

@pytest.mark.asyncio
async def test_should_retry_within_limit(retry_manager, mock_bq_client, retry_config_default):
    """
    Test should_retry returns True when under retry limit.

    Verifies:
    - Retry allowed when retry_count < max_retries
    - Queries org_meta_scheduled_runs table
    """
    run_id = "run-123"

    # Mock query result: retry_count = 1, max_retries = 3
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": "Pipeline failed"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_default,
        bq_client=mock_bq_client
    )

    assert should_retry is True

    # Verify query called
    mock_bq_client.query.assert_called_once()
    query = mock_bq_client.query.call_args[0][0]
    assert "org_meta_scheduled_runs" in query
    assert "retry_count" in query


@pytest.mark.asyncio
async def test_should_retry_at_max_retries(retry_manager, mock_bq_client, retry_config_default):
    """
    Test should_retry returns False when max retries reached.

    Verifies:
    - Retry denied when retry_count >= max_retries
    - Prevents infinite retry loops
    """
    run_id = "run-123"

    # Mock query result: retry_count = 3, max_retries = 3
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 3,
        "error_message": "Pipeline failed"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_default,
        bq_client=mock_bq_client
    )

    assert should_retry is False


@pytest.mark.asyncio
async def test_should_retry_exceeds_max_retries(retry_manager, mock_bq_client, retry_config_default):
    """Test should_retry returns False when retries exceeded."""
    run_id = "run-123"

    # Mock query result: retry_count = 5, max_retries = 3
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 5,
        "error_message": "Pipeline failed"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_default,
        bq_client=mock_bq_client
    )

    assert should_retry is False


@pytest.mark.asyncio
async def test_should_retry_first_attempt(retry_manager, mock_bq_client, retry_config_default):
    """Test should_retry allows first retry (retry_count = 0)."""
    run_id = "run-123"

    # Mock query result: first failure, retry_count = 0
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 0,
        "error_message": "Pipeline failed"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_default,
        bq_client=mock_bq_client
    )

    assert should_retry is True


@pytest.mark.asyncio
async def test_should_retry_run_not_found(retry_manager, mock_bq_client, retry_config_default):
    """
    Test should_retry returns False when run not found.

    Verifies:
    - Gracefully handles missing run_id
    - Prevents retry for non-existent runs
    """
    run_id = "nonexistent-run"

    # Mock query result: no rows found
    query_job = MagicMock()
    query_job.result.return_value = []
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_default,
        bq_client=mock_bq_client
    )

    assert should_retry is False


# ============================================
# Error Type Filter Tests
# ============================================

@pytest.mark.asyncio
async def test_should_retry_with_retryable_error(retry_manager, mock_bq_client, retry_config_with_filters):
    """
    Test should_retry allows retry for whitelisted error types.

    Verifies:
    - retry_on_errors filter applied
    - Retryable errors allowed
    """
    run_id = "run-123"

    # Mock query result with TimeoutError (in retry_on_errors list)
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": "Pipeline failed: TimeoutError occurred"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_with_filters,
        bq_client=mock_bq_client
    )

    assert should_retry is True


@pytest.mark.asyncio
async def test_should_retry_with_non_retryable_error(retry_manager, mock_bq_client, retry_config_with_filters):
    """
    Test should_retry denies retry for non-whitelisted errors.

    Verifies:
    - Non-retryable errors (not in retry_on_errors) rejected
    - Prevents retry for permanent failures
    """
    run_id = "run-123"

    # Mock query result with ValidationError (NOT in retry_on_errors list)
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": "Pipeline failed: ValidationError - invalid input"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_with_filters,
        bq_client=mock_bq_client
    )

    assert should_retry is False


@pytest.mark.asyncio
async def test_should_retry_multiple_error_types(retry_manager, mock_bq_client):
    """Test should_retry with multiple retryable error types."""
    run_id = "run-123"
    retry_config = {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": ["Error1", "Error2", "Error3"]
    }

    # Test each error type
    for error_type in ["Error1", "Error2", "Error3"]:
        query_job = MagicMock()
        query_job.result.return_value = [{
            "retry_count": 1,
            "error_message": f"Pipeline failed: {error_type} occurred"
        }]
        mock_bq_client.query.return_value = query_job

        should_retry = await retry_manager.should_retry(
            run_id=run_id,
            retry_config=retry_config,
            bq_client=mock_bq_client
        )

        assert should_retry is True, f"Should retry for {error_type}"


@pytest.mark.asyncio
async def test_should_retry_partial_error_match(retry_manager, mock_bq_client, retry_config_with_filters):
    """Test should_retry with partial string match in error message."""
    run_id = "run-123"

    # Error message contains "ServiceUnavailable" substring
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": "Connection failed: ServiceUnavailable - try again later"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_with_filters,
        bq_client=mock_bq_client
    )

    assert should_retry is True


@pytest.mark.asyncio
async def test_should_retry_no_error_message(retry_manager, mock_bq_client, retry_config_with_filters):
    """Test should_retry when error_message is None."""
    run_id = "run-123"

    # Mock query result with None error_message
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": None
    }]
    mock_bq_client.query.return_value = query_job

    # Should retry when error_message is None (can't filter unknown errors)
    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_with_filters,
        bq_client=mock_bq_client
    )

    # None error message passes filter (benefit of doubt)
    assert should_retry is True


# ============================================
# Exponential Backoff Tests
# ============================================

def test_calculate_retry_time_first_attempt(retry_manager):
    """
    Test exponential backoff for first retry attempt.

    Formula: base_delay * (multiplier ^ (attempt - 1))
    Attempt 1: 1 * (2^0) = 1 minute
    """
    retry_time = retry_manager.calculate_retry_time(attempt=1, backoff_multiplier=2)

    # Verify time is approximately 1 minute from now
    expected_time = datetime.utcnow() + timedelta(minutes=1)
    time_diff = abs((retry_time - expected_time).total_seconds())
    assert time_diff < 5  # Allow 5 second margin


def test_calculate_retry_time_second_attempt(retry_manager):
    """
    Test exponential backoff for second retry attempt.

    Attempt 2: 1 * (2^1) = 2 minutes
    """
    retry_time = retry_manager.calculate_retry_time(attempt=2, backoff_multiplier=2)

    expected_time = datetime.utcnow() + timedelta(minutes=2)
    time_diff = abs((retry_time - expected_time).total_seconds())
    assert time_diff < 5


def test_calculate_retry_time_third_attempt(retry_manager):
    """
    Test exponential backoff for third retry attempt.

    Attempt 3: 1 * (2^2) = 4 minutes
    """
    retry_time = retry_manager.calculate_retry_time(attempt=3, backoff_multiplier=2)

    expected_time = datetime.utcnow() + timedelta(minutes=4)
    time_diff = abs((retry_time - expected_time).total_seconds())
    assert time_diff < 5


def test_calculate_retry_time_fourth_attempt(retry_manager):
    """
    Test exponential backoff for fourth retry attempt.

    Attempt 4: 1 * (2^3) = 8 minutes
    """
    retry_time = retry_manager.calculate_retry_time(attempt=4, backoff_multiplier=2)

    expected_time = datetime.utcnow() + timedelta(minutes=8)
    time_diff = abs((retry_time - expected_time).total_seconds())
    assert time_diff < 5


def test_calculate_retry_time_max_cap(retry_manager):
    """
    Test exponential backoff caps at 60 minutes.

    Verifies:
    - Very high attempt numbers capped at max delay
    - Prevents excessive wait times
    """
    retry_time = retry_manager.calculate_retry_time(attempt=20, backoff_multiplier=2)

    # Should be capped at 60 minutes
    expected_time = datetime.utcnow() + timedelta(minutes=60)
    time_diff = abs((retry_time - expected_time).total_seconds())
    assert time_diff < 5


def test_calculate_retry_time_custom_multiplier(retry_manager):
    """Test exponential backoff with custom multiplier."""
    # Multiplier = 3
    # Attempt 3: 1 * (3^2) = 9 minutes
    retry_time = retry_manager.calculate_retry_time(attempt=3, backoff_multiplier=3)

    expected_time = datetime.utcnow() + timedelta(minutes=9)
    time_diff = abs((retry_time - expected_time).total_seconds())
    assert time_diff < 5


def test_calculate_retry_time_multiplier_1(retry_manager):
    """
    Test constant backoff with multiplier = 1.

    Verifies:
    - Multiplier = 1 gives constant delay
    - All attempts have same delay
    """
    # All attempts should be 1 minute
    for attempt in [1, 2, 3, 4, 5]:
        retry_time = retry_manager.calculate_retry_time(attempt=attempt, backoff_multiplier=1)
        expected_time = datetime.utcnow() + timedelta(minutes=1)
        time_diff = abs((retry_time - expected_time).total_seconds())
        assert time_diff < 5


def test_calculate_retry_time_progression(retry_manager):
    """
    Test backoff times increase exponentially.

    Verifies progression: 1min → 2min → 4min → 8min
    """
    times = []
    for attempt in [1, 2, 3, 4]:
        retry_time = retry_manager.calculate_retry_time(attempt=attempt, backoff_multiplier=2)
        times.append(retry_time)

    # Verify each retry time is later than the previous
    for i in range(len(times) - 1):
        assert times[i+1] > times[i]

    # Verify approximate doubling
    diff1 = (times[1] - times[0]).total_seconds()
    diff2 = (times[2] - times[1]).total_seconds()
    diff3 = (times[3] - times[2]).total_seconds()

    # Each interval should be approximately double the previous
    assert 100 < diff2 < 140  # ~2x of 60 seconds
    assert 200 < diff3 < 280  # ~2x of 120 seconds


# ============================================
# Schedule Retry Tests
# ============================================

@pytest.mark.asyncio
async def test_schedule_retry_success(retry_manager, mock_bq_client):
    """
    Test successful retry scheduling.

    Verifies:
    - Updates org_meta_scheduled_runs
    - Sets state to PENDING
    - Sets scheduled_time to retry_time
    """
    run_id = "run-123"
    retry_time = datetime.utcnow() + timedelta(minutes=5)

    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await retry_manager.schedule_retry(
        run_id=run_id,
        retry_time=retry_time,
        bq_client=mock_bq_client
    )

    # Verify UPDATE query called
    mock_bq_client.query.assert_called_once()
    query = mock_bq_client.query.call_args[0][0]
    assert "UPDATE" in query
    assert "org_meta_scheduled_runs" in query
    assert "state = 'PENDING'" in query
    assert "scheduled_time = @retry_time" in query

    # Verify retry_time parameter exists
    job_config = mock_bq_client.query.call_args[1]["job_config"]
    params = {p.name: p.value for p in job_config.query_parameters}
    assert "retry_time" in params
    # Verify it's a datetime
    assert isinstance(params["retry_time"], datetime)


@pytest.mark.asyncio
async def test_schedule_retry_immediate(retry_manager, mock_bq_client):
    """Test scheduling retry for immediate execution."""
    run_id = "run-123"
    retry_time = datetime.utcnow()  # Immediate

    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await retry_manager.schedule_retry(
        run_id=run_id,
        retry_time=retry_time,
        bq_client=mock_bq_client
    )

    # Verify query executed
    mock_bq_client.query.assert_called_once()


@pytest.mark.asyncio
async def test_schedule_retry_far_future(retry_manager, mock_bq_client):
    """Test scheduling retry far in the future."""
    run_id = "run-123"
    retry_time = datetime.utcnow() + timedelta(hours=24)

    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await retry_manager.schedule_retry(
        run_id=run_id,
        retry_time=retry_time,
        bq_client=mock_bq_client
    )

    # Verify query executed
    mock_bq_client.query.assert_called_once()


@pytest.mark.asyncio
async def test_schedule_retry_with_transient_error(retry_manager, mock_bq_client):
    """
    Test schedule_retry retries on transient errors.

    Verifies:
    - ServiceUnavailable triggers retry
    - Eventually succeeds
    """
    run_id = "run-123"
    retry_time = datetime.utcnow() + timedelta(minutes=5)

    # First call fails, second succeeds
    error_job = MagicMock()
    error_job.result.side_effect = google_exceptions.ServiceUnavailable("Temporary error")

    success_job = MagicMock()
    success_job.result.return_value = []

    mock_bq_client.query.side_effect = [error_job, success_job]

    await retry_manager.schedule_retry(
        run_id=run_id,
        retry_time=retry_time,
        bq_client=mock_bq_client
    )

    # Verify retry occurred
    assert mock_bq_client.query.call_count == 2


# ============================================
# Integration Tests
# ============================================

@pytest.mark.asyncio
async def test_full_retry_flow(retry_manager, mock_bq_client, retry_config_default):
    """
    Test complete retry flow: check → calculate → schedule.

    Verifies:
    - should_retry approves retry
    - Backoff time calculated
    - Retry scheduled with correct time
    """
    run_id = "run-123"

    # Step 1: Check if should retry (yes, retry_count = 1 < max_retries = 3)
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": "Pipeline failed: timeout"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config_default,
        bq_client=mock_bq_client
    )
    assert should_retry is True

    # Step 2: Calculate retry time (attempt 2 = 2 minutes)
    retry_time = retry_manager.calculate_retry_time(
        attempt=2,  # Second attempt
        backoff_multiplier=retry_config_default["backoff_multiplier"]
    )

    # Step 3: Schedule retry
    update_job = MagicMock()
    update_job.result.return_value = []
    mock_bq_client.query.return_value = update_job

    await retry_manager.schedule_retry(
        run_id=run_id,
        retry_time=retry_time,
        bq_client=mock_bq_client
    )

    # Verify retry scheduled
    assert mock_bq_client.query.call_count >= 2


@pytest.mark.asyncio
async def test_retry_progression_multiple_attempts(retry_manager, mock_bq_client):
    """
    Test retry progression through multiple attempts.

    Simulates:
    - Attempt 1 fails → retry in 1 min
    - Attempt 2 fails → retry in 2 min
    - Attempt 3 fails → retry in 4 min
    - Attempt 4 fails → max retries reached
    """
    run_id = "run-123"
    retry_config = {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": None
    }

    # Test attempts 1, 2, 3 (should retry)
    for attempt in [1, 2, 3]:
        query_job = MagicMock()
        query_job.result.return_value = [{
            "retry_count": attempt - 1,  # 0, 1, 2
            "error_message": f"Attempt {attempt} failed"
        }]
        mock_bq_client.query.return_value = query_job

        should_retry = await retry_manager.should_retry(
            run_id=run_id,
            retry_config=retry_config,
            bq_client=mock_bq_client
        )

        assert should_retry is True, f"Should retry attempt {attempt}"

    # Test attempt 4 (max retries reached)
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 3,  # Max retries reached
        "error_message": "Attempt 4 failed"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config,
        bq_client=mock_bq_client
    )

    assert should_retry is False, "Should not retry after max attempts"


@pytest.mark.asyncio
async def test_dead_letter_queue_scenario(retry_manager, mock_bq_client):
    """
    Test dead letter queue scenario (max retries + permanent error).

    Verifies:
    - Permanent errors not retried
    - Max retries enforced
    - Item ready for DLQ
    """
    run_id = "run-123"
    retry_config = {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": ["TransientError"]  # Only retry transient errors
    }

    # Permanent error (ValidationError not in retry_on_errors)
    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 0,  # First failure
        "error_message": "ValidationError: invalid schema"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config,
        bq_client=mock_bq_client
    )

    # Should not retry permanent errors
    assert should_retry is False


@pytest.mark.asyncio
async def test_concurrent_retry_checks(retry_manager, mock_bq_client):
    """
    Test concurrent retry checks for different runs.

    Verifies:
    - Multiple runs can be checked concurrently
    - Each run evaluated independently
    """
    retry_config = {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": None
    }

    # Setup different results for different runs
    results = [
        [{"retry_count": 0, "error_message": "Error 1"}],  # run-1: should retry
        [{"retry_count": 3, "error_message": "Error 2"}],  # run-2: max retries
        [{"retry_count": 1, "error_message": "Error 3"}],  # run-3: should retry
    ]

    query_jobs = []
    for result in results:
        job = MagicMock()
        job.result.return_value = result
        query_jobs.append(job)

    mock_bq_client.query.side_effect = query_jobs

    # Check all runs concurrently
    results = await asyncio.gather(
        retry_manager.should_retry("run-1", retry_config, mock_bq_client),
        retry_manager.should_retry("run-2", retry_config, mock_bq_client),
        retry_manager.should_retry("run-3", retry_config, mock_bq_client)
    )

    assert results[0] is True   # run-1: should retry
    assert results[1] is False  # run-2: max retries reached
    assert results[2] is True   # run-3: should retry


# ============================================
# Edge Cases
# ============================================

@pytest.mark.asyncio
async def test_should_retry_zero_max_retries(retry_manager, mock_bq_client):
    """Test should_retry with max_retries = 0 (no retries allowed)."""
    run_id = "run-123"
    retry_config = {
        "max_retries": 0,
        "backoff_multiplier": 2,
        "retry_on_errors": None
    }

    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 0,
        "error_message": "First failure"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config,
        bq_client=mock_bq_client
    )

    assert should_retry is False


def test_calculate_retry_time_zero_multiplier(retry_manager):
    """Test exponential backoff with multiplier = 0."""
    # Multiplier = 0 should give 0 delay (edge case)
    retry_time = retry_manager.calculate_retry_time(attempt=5, backoff_multiplier=0)

    # Should be approximately now
    time_diff = abs((retry_time - datetime.utcnow()).total_seconds())
    assert time_diff < 5


@pytest.mark.asyncio
async def test_should_retry_empty_error_filters(retry_manager, mock_bq_client):
    """Test should_retry with empty retry_on_errors list."""
    run_id = "run-123"
    retry_config = {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": []  # Empty list
    }

    query_job = MagicMock()
    query_job.result.return_value = [{
        "retry_count": 1,
        "error_message": "Some error"
    }]
    mock_bq_client.query.return_value = query_job

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config,
        bq_client=mock_bq_client
    )

    # Empty list in implementation is treated as "no filter" (retry all)
    # This is different from a list with values (filter applied)
    assert should_retry is True
