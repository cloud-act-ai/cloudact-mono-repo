"""
Test that processor status (SUCCESS/FAILED) is correctly propagated to pipeline status.

This test verifies the fix for the issue where stored procedure failures were not
being propagated correctly, resulting in pipelines showing COMPLETED status even
when procedures failed.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from src.core.pipeline.async_executor import AsyncPipelineExecutor


@pytest.mark.asyncio
async def test_processor_failure_status_propagation():
    """
    Test that when a processor returns {"status": "FAILED", ...},
    the pipeline correctly marks the step as FAILED and propagates the error.
    """
    # Create a mock processor that returns FAILED status
    mock_processor = MagicMock()
    mock_processor.execute = AsyncMock(return_value={
        "status": "FAILED",
        "error": "BigQuery procedure failed: sp_run_subscription_costs_pipeline",
        "error_type": "BigQueryAPIError"
    })

    # Mock the processor loading
    with patch('importlib.import_module') as mock_import:
        mock_module = MagicMock()
        mock_module.get_engine = MagicMock(return_value=mock_processor)
        mock_import.return_value = mock_module

        # Create pipeline executor
        executor = AsyncPipelineExecutor(
            org_slug="test_org",
            pipeline_id="test_pipeline"
        )

        # Mock the config
        executor.config = {
            "pipeline_id": "test_pipeline",
            "steps": [
                {
                    "step_id": "execute_procedure",
                    "processor": "generic.procedure_executor",
                    "timeout_minutes": 10
                }
            ]
        }

        # Mock metadata logger - all async methods need AsyncMock
        executor.metadata_logger = MagicMock()
        executor.metadata_logger.log_step_start = AsyncMock()
        executor.metadata_logger.log_step_end = AsyncMock()
        executor.metadata_logger.log_state_transition = AsyncMock()
        executor.metadata_logger.log_pipeline_start = AsyncMock()
        executor.metadata_logger.log_pipeline_end = AsyncMock()

        # Execute the step - should raise exception due to FAILED status
        step_config = {
            "step_id": "execute_procedure",
            "processor": "generic.procedure_executor",
            "timeout_minutes": 10
        }

        with pytest.raises(ValueError) as exc_info:
            await executor._execute_step_async(step_config, 0)

        # Verify the exception message contains the processor error
        assert "Processor failed" in str(exc_info.value)
        assert "BigQuery procedure failed" in str(exc_info.value)

        # Verify the step was logged with FAILED status
        assert executor.metadata_logger.log_step_end.called
        call_kwargs = executor.metadata_logger.log_step_end.call_args[1]
        assert call_kwargs["status"] == "FAILED"
        assert call_kwargs["error_message"] is not None


@pytest.mark.asyncio
async def test_processor_success_status_propagation():
    """
    Test that when a processor returns {"status": "SUCCESS", ...},
    the pipeline correctly marks the step as COMPLETED.
    """
    # Create a mock processor that returns SUCCESS status
    mock_processor = MagicMock()
    mock_processor.execute = AsyncMock(return_value={
        "status": "SUCCESS",
        "procedure": "sp_run_subscription_costs_pipeline",
        "job_id": "test_job_id",
        "results": [],
        "rows_returned": 0
    })

    # Mock the processor loading
    with patch('importlib.import_module') as mock_import:
        mock_module = MagicMock()
        mock_module.get_engine = MagicMock(return_value=mock_processor)
        mock_import.return_value = mock_module

        # Create pipeline executor
        executor = AsyncPipelineExecutor(
            org_slug="test_org",
            pipeline_id="test_pipeline"
        )

        # Mock the config
        executor.config = {
            "pipeline_id": "test_pipeline",
            "steps": [
                {
                    "step_id": "execute_procedure",
                    "processor": "generic.procedure_executor",
                    "timeout_minutes": 10
                }
            ]
        }

        # Mock metadata logger - all async methods need AsyncMock
        executor.metadata_logger = MagicMock()
        executor.metadata_logger.log_step_start = AsyncMock()
        executor.metadata_logger.log_step_end = AsyncMock()
        executor.metadata_logger.log_state_transition = AsyncMock()
        executor.metadata_logger.log_pipeline_start = AsyncMock()
        executor.metadata_logger.log_pipeline_end = AsyncMock()

        # Execute the step - should NOT raise exception
        step_config = {
            "step_id": "execute_procedure",
            "processor": "generic.procedure_executor",
            "timeout_minutes": 10
        }

        await executor._execute_step_async(step_config, 0)

        # Verify the step was logged with COMPLETED status
        assert executor.metadata_logger.log_step_end.called
        call_kwargs = executor.metadata_logger.log_step_end.call_args[1]
        assert call_kwargs["status"] == "COMPLETED"
        assert call_kwargs["error_message"] is None


@pytest.mark.asyncio
async def test_processor_missing_status_defaults_to_success():
    """
    Test backward compatibility: processors that don't return a status field
    should be treated as SUCCESS (default behavior).
    """
    # Create a mock processor that returns result without status field
    mock_processor = MagicMock()
    mock_processor.execute = AsyncMock(return_value={
        "rows_processed": 100,
        "job_id": "test_job_id"
    })

    # Mock the processor loading
    with patch('importlib.import_module') as mock_import:
        mock_module = MagicMock()
        mock_module.get_engine = MagicMock(return_value=mock_processor)
        mock_import.return_value = mock_module

        # Create pipeline executor
        executor = AsyncPipelineExecutor(
            org_slug="test_org",
            pipeline_id="test_pipeline"
        )

        # Mock the config
        executor.config = {
            "pipeline_id": "test_pipeline",
            "steps": [
                {
                    "step_id": "execute_query",
                    "processor": "gcp.bq_etl",
                    "timeout_minutes": 10
                }
            ]
        }

        # Mock metadata logger - all async methods need AsyncMock
        executor.metadata_logger = MagicMock()
        executor.metadata_logger.log_step_start = AsyncMock()
        executor.metadata_logger.log_step_end = AsyncMock()
        executor.metadata_logger.log_state_transition = AsyncMock()
        executor.metadata_logger.log_pipeline_start = AsyncMock()
        executor.metadata_logger.log_pipeline_end = AsyncMock()

        # Execute the step - should NOT raise exception (backward compatibility)
        step_config = {
            "step_id": "execute_query",
            "processor": "gcp.bq_etl",
            "timeout_minutes": 10
        }

        await executor._execute_step_async(step_config, 0)

        # Verify the step was logged with COMPLETED status (default)
        assert executor.metadata_logger.log_step_end.called
        call_kwargs = executor.metadata_logger.log_step_end.call_args[1]
        assert call_kwargs["status"] == "COMPLETED"
        assert call_kwargs["error_message"] is None
