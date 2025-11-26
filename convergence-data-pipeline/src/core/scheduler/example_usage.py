"""
Example Usage of Pipeline State Management System

This file demonstrates how to use the state management components
for scheduled pipeline execution.
"""

import asyncio
from datetime import datetime, timedelta
from google.cloud import bigquery

from src.core.scheduler import (
    PipelineStateManager,
    QueueManager,
    ScheduleCalculator,
    RetryManager,
    PipelineState
)
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


async def example_state_transitions():
    """
    Example 1: Creating scheduled runs and transitioning states
    """
    print("\n=== Example 1: State Transitions ===")

    # Initialize BigQuery client and state manager
    bq_client = bigquery.Client()
    state_manager = PipelineStateManager(bq_client)

    # 1. Create a scheduled run
    org_slug = "acme_corp"
    config_id = "daily_sales_pipeline"
    scheduled_time = datetime.utcnow() + timedelta(hours=1)

    run_id = await state_manager.create_scheduled_run(
        org_slug=org_slug,
        config_id=config_id,
        scheduled_time=scheduled_time
    )
    print(f"Created scheduled run: {run_id}")

    # 2. Transition from SCHEDULED to PENDING (ready to run)
    success = await state_manager.transition_state(
        run_id=run_id,
        from_state=PipelineState.SCHEDULED.value,
        to_state=PipelineState.PENDING.value
    )
    print(f"Transitioned to PENDING: {success}")

    # 3. Mark as running when execution starts
    pipeline_logging_id = "abc-123-def-456"
    success = await state_manager.mark_as_running(
        run_id=run_id,
        pipeline_logging_id=pipeline_logging_id
    )
    print(f"Marked as RUNNING: {success}")

    # 4. Mark as completed when done
    execution_duration_seconds = 120
    success = await state_manager.mark_as_completed(
        run_id=run_id,
        execution_duration_seconds=execution_duration_seconds
    )
    print(f"Marked as COMPLETED: {success}")

    # 5. Get final status
    status = await state_manager.get_run_status(run_id)
    print(f"Final status: {status['state']}")


async def example_queue_management():
    """
    Example 2: Queue management with priority
    """
    print("\n=== Example 2: Queue Management ===")

    bq_client = bigquery.Client()
    queue_manager = QueueManager(bq_client)

    # 1. Enqueue multiple pipelines with different priorities
    pipelines = [
        {"org_slug": "customer_a", "pipeline_id": "pipeline_1", "priority": 5},
        {"org_slug": "customer_b", "pipeline_id": "pipeline_2", "priority": 1},  # High priority
        {"org_slug": "customer_c", "pipeline_id": "pipeline_3", "priority": 10},  # Low priority
    ]

    for pipeline in pipelines:
        config = {
            "pipeline_id": pipeline["pipeline_id"],
            "parameters": {"date": "2025-11-17"}
        }

        queue_id = await queue_manager.enqueue(
            org_slug=pipeline["org_slug"],
            config=config,
            priority=pipeline["priority"]
        )
        print(f"Enqueued {pipeline['pipeline_id']} with priority {pipeline['priority']}: {queue_id}")

    # 2. Check queue status
    queue_status = await queue_manager.get_queue_status()
    print(f"Queue status: {queue_status}")

    # 3. Dequeue next item (will get highest priority first)
    worker_id = "worker-001"
    next_item = await queue_manager.dequeue(worker_id)

    if next_item:
        print(f"Dequeued: {next_item['config']['pipeline_id']} (priority: {next_item['priority']})")

        # 4. Process the item (simulate work)
        await asyncio.sleep(1)

        # 5. Mark as completed
        await queue_manager.mark_completed(next_item["queue_id"])
        print(f"Completed: {next_item['queue_id']}")

    # 6. Get updated queue length
    queue_length = await queue_manager.get_queue_length()
    print(f"Remaining in queue: {queue_length}")


async def example_schedule_calculation():
    """
    Example 3: Calculating next run times from cron expressions
    """
    print("\n=== Example 3: Schedule Calculation ===")

    calculator = ScheduleCalculator()

    # Test various cron expressions
    examples = [
        ("0 2 * * *", "America/New_York", "Daily at 2:00 AM ET"),
        ("0 */4 * * *", "America/Los_Angeles", "Every 4 hours PT"),
        ("0 0 * * 0", "Europe/London", "Weekly on Sunday at midnight GMT"),
        ("0 0 1 * *", "Asia/Tokyo", "Monthly on 1st at midnight JST"),
        ("*/15 * * * *", "UTC", "Every 15 minutes UTC"),
    ]

    for cron_expr, timezone, description in examples:
        try:
            next_run = calculator.calculate_next_run(
                cron_expression=cron_expr,
                timezone=timezone
            )
            print(f"{description}")
            print(f"  Cron: {cron_expr}")
            print(f"  Next run (UTC): {next_run.isoformat()}")
            print()
        except Exception as e:
            print(f"Error: {e}")

    # Check if a pipeline is due
    last_run = datetime.utcnow() - timedelta(hours=5)
    is_due = calculator.is_due(
        cron_expression="0 */4 * * *",  # Every 4 hours
        last_run=last_run,
        timezone="UTC"
    )
    print(f"Is pipeline due? {is_due}")


async def example_retry_logic():
    """
    Example 4: Retry management with exponential backoff
    """
    print("\n=== Example 4: Retry Management ===")

    bq_client = bigquery.Client()
    state_manager = PipelineStateManager(bq_client)
    retry_manager = RetryManager()

    # 1. Create a scheduled run
    org_slug = "test_org"
    config_id = "test_pipeline"
    scheduled_time = datetime.utcnow()

    run_id = await state_manager.create_scheduled_run(
        org_slug=org_slug,
        config_id=config_id,
        scheduled_time=scheduled_time
    )

    # 2. Simulate failure
    await state_manager.mark_as_running(run_id, "test-logging-id")
    await state_manager.mark_as_failed(
        run_id=run_id,
        error_message="TimeoutError: Connection timeout after 30s",
        should_retry=True
    )

    # 3. Check if should retry
    retry_config = {
        "max_retries": 3,
        "backoff_multiplier": 2,
        "retry_on_errors": ["TimeoutError", "TransientError"]
    }

    should_retry = await retry_manager.should_retry(
        run_id=run_id,
        retry_config=retry_config,
        bq_client=bq_client
    )
    print(f"Should retry: {should_retry}")

    if should_retry:
        # 4. Calculate retry time with exponential backoff
        for attempt in range(1, 5):
            retry_time = retry_manager.calculate_retry_time(
                attempt=attempt,
                backoff_multiplier=2
            )
            delay_seconds = (retry_time - datetime.utcnow()).total_seconds()
            print(f"Attempt {attempt}: Retry in {delay_seconds:.0f} seconds")

        # 5. Schedule the retry
        retry_time = retry_manager.calculate_retry_time(attempt=1)
        await retry_manager.schedule_retry(
            run_id=run_id,
            retry_time=retry_time,
            bq_client=bq_client
        )
        print(f"Scheduled retry at {retry_time.isoformat()}")


async def example_yet_to_run_pipelines():
    """
    Example 5: Finding pipelines that are due to run
    """
    print("\n=== Example 5: Yet-to-Run Pipelines ===")

    bq_client = bigquery.Client()
    state_manager = PipelineStateManager(bq_client)

    # Get pipelines scheduled for today that haven't run yet
    yet_to_run = await state_manager.get_yet_to_run_pipelines()

    print(f"Found {len(yet_to_run)} pipelines yet to run:")
    for pipeline in yet_to_run:
        print(f"  - Run ID: {pipeline['run_id']}")
        print(f"    Customer: {pipeline['org_slug']}")
        print(f"    Config: {pipeline['config_id']}")
        print(f"    Scheduled: {pipeline['scheduled_time']}")
        print(f"    State: {pipeline['state']}")
        print()


async def example_org_status():
    """
    Example 6: Get org pipeline status summary
    """
    print("\n=== Example 6: Org Pipeline Status ===")

    bq_client = bigquery.Client()
    state_manager = PipelineStateManager(bq_client)

    org_slug = "acme_corp"
    status = await state_manager.get_org_pipeline_status(
        org_slug=org_slug,
        date="2025-11-17"
    )

    print(f"Pipeline status for {org_slug}:")
    print(f"  Total configured: {status['total_configured']}")
    print(f"  Scheduled today: {status['scheduled_today']}")
    print(f"  Completed today: {status['completed_today']}")
    print(f"  Currently running: {status['running']}")
    print(f"  Yet to run: {status['yet_to_run']}")
    print(f"  Failed: {status['failed']}")


async def example_complete_workflow():
    """
    Example 7: Complete workflow from scheduling to completion
    """
    print("\n=== Example 7: Complete Workflow ===")

    bq_client = bigquery.Client()
    state_manager = PipelineStateManager(bq_client)
    queue_manager = QueueManager(bq_client)
    calculator = ScheduleCalculator()

    # 1. Calculate next run time for a daily pipeline
    next_run = calculator.calculate_next_run(
        cron_expression="0 2 * * *",  # Daily at 2 AM
        timezone="America/New_York"
    )
    print(f"Next scheduled run: {next_run.isoformat()}")

    # 2. Create scheduled run
    run_id = await state_manager.create_scheduled_run(
        org_slug="demo_customer",
        config_id="daily_analytics",
        scheduled_time=next_run
    )
    print(f"Created scheduled run: {run_id}")

    # 3. When time comes, transition to PENDING
    await state_manager.transition_state(
        run_id=run_id,
        from_state=PipelineState.SCHEDULED.value,
        to_state=PipelineState.PENDING.value
    )
    print("Transitioned to PENDING")

    # 4. Enqueue for execution
    config = {
        "pipeline_id": "daily_analytics",
        "parameters": {"date": "2025-11-17"}
    }
    queue_id = await queue_manager.enqueue(
        org_slug="demo_customer",
        config=config,
        priority=5
    )
    print(f"Enqueued with ID: {queue_id}")

    # 5. Worker dequeues and starts execution
    worker_id = "worker-001"
    item = await queue_manager.dequeue(worker_id)

    if item:
        print(f"Worker {worker_id} claimed job")

        # 6. Mark as running
        pipeline_logging_id = "exec-123-456"
        await state_manager.mark_as_running(run_id, pipeline_logging_id)
        print(f"Pipeline running with logging ID: {pipeline_logging_id}")

        # 7. Simulate execution
        await asyncio.sleep(2)

        # 8. Mark as completed
        await state_manager.mark_as_completed(run_id, execution_duration_seconds=120)
        await queue_manager.mark_completed(queue_id)
        print("Pipeline completed successfully")

    # 9. Check final status
    status = await state_manager.get_run_status(run_id)
    print(f"Final state: {status['state']}")


async def main():
    """
    Run all examples
    """
    print("=" * 60)
    print("Pipeline State Management System - Usage Examples")
    print("=" * 60)

    try:
        # Run each example
        # await example_state_transitions()
        # await example_queue_management()
        await example_schedule_calculation()
        # await example_retry_logic()
        # await example_yet_to_run_pipelines()
        # await example_org_status()
        # await example_complete_workflow()

        print("\n" + "=" * 60)
        print("All examples completed successfully!")
        print("=" * 60)

    except Exception as e:
        logger.error(f"Error running examples: {e}", exc_info=True)
        print(f"\nError: {e}")


if __name__ == "__main__":
    asyncio.run(main())
