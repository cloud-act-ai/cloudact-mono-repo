#!/usr/bin/env python3
"""
Manual End-to-End Pub/Sub Pipeline Test
Demonstrates the complete flow: Publish → Pub/Sub → Worker → Pipeline Execution
"""

import asyncio
import sys
import time
from src.core.pubsub.publisher import PipelinePublisher
from src.core.pubsub.worker import PipelineWorker
from google.cloud import pubsub_v1
from src.app.config import settings

# Color codes for terminal output
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
RED = '\033[91m'
RESET = '\033[0m'
BOLD = '\033[1m'


def print_header(message: str):
    """Print colored header"""
    print(f"\n{BOLD}{BLUE}{'='*80}{RESET}")
    print(f"{BOLD}{BLUE}{message}{RESET}")
    print(f"{BOLD}{BLUE}{'='*80}{RESET}\n")


def print_success(message: str):
    """Print success message"""
    print(f"{GREEN}✓ {message}{RESET}")


def print_info(message: str):
    """Print info message"""
    print(f"{BLUE}ℹ {message}{RESET}")


def print_warning(message: str):
    """Print warning message"""
    print(f"{YELLOW}⚠ {message}{RESET}")


def print_error(message: str):
    """Print error message"""
    print(f"{RED}✗ {message}{RESET}")


async def test_publish_to_pubsub():
    """Step 1: Publish pipeline tasks to Pub/Sub"""
    print_header("STEP 1: Publishing Pipeline Tasks to Pub/Sub")

    # Use real tenant ID (tenant "1" from your setup)
    tenant_ids = ["1"]
    pipeline_id = "p_openai_billing"
    parameters = {
        "date": "2025-11-16",
        "trigger_by": "manual_test"
    }

    print_info(f"Publishing tasks for {len(tenant_ids)} tenant(s)...")
    print_info(f"  Tenant IDs: {tenant_ids}")
    print_info(f"  Pipeline: {pipeline_id}")
    print_info(f"  Parameters: {parameters}")
    print_info(f"  Random delay: No (for immediate testing)")

    # Create publisher
    publisher = PipelinePublisher()

    # Publish tasks (no random delay for immediate testing)
    result = await publisher.publish_pipeline_batch(
        tenant_ids=tenant_ids,
        pipeline_id=pipeline_id,
        parameters=parameters,
        randomize_delay=False,  # No delay for immediate testing
        max_jitter_seconds=0
    )

    print_success(f"Published {result['published_count']} tasks successfully")
    print_info(f"  Total tenants: {result['total_tenants']}")
    print_info(f"  Failed: {result['failed_count']}")
    print_info(f"  Message IDs: {result['message_ids'][:5]}")

    return result


def verify_pubsub_messages():
    """Step 2: Verify messages are in Pub/Sub"""
    print_header("STEP 2: Verifying Messages in Pub/Sub")

    project_id = settings.gcp_project_id
    subscription_path = f"projects/{project_id}/subscriptions/pipeline-tasks-sub"

    print_info(f"Checking subscription: {subscription_path}")

    try:
        subscriber = pubsub_v1.SubscriberClient()

        # Get subscription details
        subscription = subscriber.get_subscription(
            request={"subscription": subscription_path}
        )

        print_success(f"Subscription exists: {subscription.name}")
        print_info(f"  Topic: {subscription.topic}")
        print_info(f"  Ack deadline: {subscription.ack_deadline_seconds} seconds")

        # Note: num_undelivered_messages requires monitoring API, not available in basic client
        print_info("  Messages are queued and ready for workers to pull")

        return True

    except Exception as e:
        print_error(f"Failed to verify subscription: {e}")
        return False


async def test_worker_execution(max_wait_seconds: int = 120):
    """Step 3: Run worker to pull and execute tasks"""
    print_header("STEP 3: Starting Worker to Process Tasks")

    print_info(f"Worker will process tasks for up to {max_wait_seconds} seconds")
    print_info("Press Ctrl+C to stop early if task completes")

    # Create worker
    worker = PipelineWorker(
        subscription_name="pipeline-tasks-sub",
        max_concurrent=10  # Lower concurrency for testing
    )

    print_success("Worker initialized")
    print_info(f"  Subscription: {worker.subscription_path}")
    print_info(f"  Max concurrent: {worker.max_concurrent}")

    # Start worker (non-blocking)
    print_info("\nStarting worker (pulling messages)...")
    streaming_pull_future = worker.start(block=False)

    print_success("Worker started - listening for messages...")
    print_info("  Worker will execute pipelines as messages arrive")
    print_info("  Check logs below for execution progress...\n")

    # Wait for execution to complete or timeout
    start_time = time.time()
    try:
        # Wait with timeout
        await asyncio.sleep(max_wait_seconds)

    except KeyboardInterrupt:
        print_warning("\n\nManual interrupt received")

    finally:
        # Stop worker
        elapsed = time.time() - start_time
        print_info(f"\nStopping worker after {elapsed:.1f} seconds...")
        streaming_pull_future.cancel()

        # Show stats
        print_success(f"Worker Statistics:")
        print_info(f"  Total executed: {worker.execution_count}")
        print_info(f"  Successful: {worker.success_count}")
        print_info(f"  Failed: {worker.failure_count}")

        return {
            "execution_count": worker.execution_count,
            "success_count": worker.success_count,
            "failure_count": worker.failure_count,
            "elapsed_seconds": elapsed
        }


def verify_pipeline_results():
    """Step 4: Verify pipeline execution results in BigQuery"""
    print_header("STEP 4: Verifying Pipeline Results")

    from google.cloud import bigquery
    from src.core.engine.bq_client import get_bigquery_client

    print_info("Querying BigQuery for pipeline execution logs...")

    bq_client = get_bigquery_client()

    # Query recent pipeline executions
    query = """
    SELECT
        pipeline_logging_id,
        tenant_id,
        pipeline_id,
        status,
        created_at,
        completed_at,
        TIMESTAMP_DIFF(completed_at, created_at, SECOND) as duration_seconds
    FROM `{project}.pipeline_metadata.pipeline_logging`
    WHERE pipeline_id = 'p_openai_billing'
      AND tenant_id = '1'
      AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
    ORDER BY created_at DESC
    LIMIT 5
    """.format(project=settings.gcp_project_id)

    try:
        query_job = bq_client.client.query(query)
        results = list(query_job.result())

        if results:
            print_success(f"Found {len(results)} recent pipeline execution(s)")
            for row in results:
                status_icon = "✓" if row.status == "SUCCESS" else "✗"
                status_color = GREEN if row.status == "SUCCESS" else RED

                print(f"\n  {status_color}{status_icon} Pipeline Execution:{RESET}")
                print(f"      ID: {row.pipeline_logging_id}")
                print(f"      Tenant: {row.tenant_id}")
                print(f"      Pipeline: {row.pipeline_id}")
                print(f"      Status: {status_color}{row.status}{RESET}")
                print(f"      Created: {row.created_at}")
                print(f"      Completed: {row.completed_at}")
                print(f"      Duration: {row.duration_seconds} seconds")

            return True
        else:
            print_warning("No recent pipeline executions found")
            print_info("  This might mean:")
            print_info("    1. Worker is still processing (wait a bit longer)")
            print_info("    2. Pipeline execution failed before logging")
            print_info("    3. Tenant '1' doesn't exist or has no pipeline config")
            return False

    except Exception as e:
        print_error(f"Failed to query BigQuery: {e}")
        print_warning("  Make sure pipeline_metadata.pipeline_logging table exists")
        return False


async def main():
    """Run complete end-to-end test"""
    print_header("🚀 Manual Pub/Sub Pipeline Flow Test")
    print_info("This test demonstrates the complete pipeline automation flow:")
    print_info("  1. Publish tasks to Pub/Sub")
    print_info("  2. Verify messages in queue")
    print_info("  3. Worker pulls and executes pipelines")
    print_info("  4. Verify results in BigQuery")

    try:
        # Step 1: Publish to Pub/Sub
        publish_result = await test_publish_to_pubsub()

        if publish_result['published_count'] == 0:
            print_error("\nNo tasks were published. Aborting test.")
            sys.exit(1)

        # Step 2: Verify messages in Pub/Sub
        if not verify_pubsub_messages():
            print_warning("\nCouldn't verify Pub/Sub subscription, but continuing...")

        # Give Pub/Sub a moment to process
        print_info("\nWaiting 2 seconds for Pub/Sub to process messages...")
        await asyncio.sleep(2)

        # Step 3: Run worker to execute tasks
        worker_result = await test_worker_execution(max_wait_seconds=60)

        if worker_result['execution_count'] == 0:
            print_warning("\nWorker didn't process any tasks in 60 seconds")
            print_info("  Possible reasons:")
            print_info("    1. Subscription doesn't exist (create it first)")
            print_info("    2. Messages already consumed by another worker")
            print_info("    3. Worker couldn't connect to Pub/Sub")

        # Give pipeline a moment to write to BigQuery
        print_info("\nWaiting 3 seconds for BigQuery writes...")
        await asyncio.sleep(3)

        # Step 4: Verify results
        results_verified = verify_pipeline_results()

        # Final summary
        print_header("📊 Test Summary")

        if publish_result['published_count'] > 0:
            print_success(f"Published: {publish_result['published_count']} tasks")
        else:
            print_error(f"Published: {publish_result['published_count']} tasks")

        if worker_result['execution_count'] > 0:
            print_success(f"Executed: {worker_result['execution_count']} tasks")
        else:
            print_warning(f"Executed: {worker_result['execution_count']} tasks")

        if worker_result['success_count'] > 0:
            print_success(f"Successful: {worker_result['success_count']} tasks")

        if worker_result['failure_count'] > 0:
            print_error(f"Failed: {worker_result['failure_count']} tasks")

        if results_verified:
            print_success("Results verified in BigQuery")
        else:
            print_warning("Could not verify results in BigQuery")

        # Overall result
        print("\n")
        if (publish_result['published_count'] > 0 and
            worker_result['success_count'] > 0 and
            results_verified):
            print_success("✅ END-TO-END TEST PASSED!")
            print_info("The complete Pub/Sub pipeline flow is working correctly.")
            print_info("You can now run the scheduler setup with confidence.")
        else:
            print_warning("⚠ TEST PARTIALLY COMPLETED")
            print_info("Some steps succeeded, but not all. Check logs above.")

    except KeyboardInterrupt:
        print_warning("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"\n\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    # Run async main
    asyncio.run(main())
