"""
Demonstration of Pydantic Validation Enforcement

This script demonstrates various invalid configurations that are now caught
by Pydantic validation instead of failing at runtime.
"""

from pydantic import ValidationError
from src.core.abstractor.models import PipelineConfig, PipelineStepConfig, BigQuerySourceConfig, BigQueryDestinationConfig


def demo_validation():
    """Demonstrate validation enforcement."""

    print("=" * 80)
    print("PYDANTIC VALIDATION ENFORCEMENT DEMONSTRATION")
    print("=" * 80)
    print()

    # Example 1: Missing pipeline_id
    print("1. MISSING PIPELINE_ID:")
    print("-" * 40)
    try:
        config = PipelineConfig(
            steps=[PipelineStepConfig(step_id="test", type="bigquery_to_bigquery")]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print("   CAUGHT: Pipeline without pipeline_id")
        print(f"   Error: {e.errors()[0]['msg']}")
    print()

    # Example 2: Invalid pipeline_id format
    print("2. INVALID PIPELINE_ID FORMAT (special characters):")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="test pipeline!",  # Spaces and special chars
            steps=[PipelineStepConfig(step_id="test", type="bigquery_to_bigquery")]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 3: Empty steps list
    print("3. EMPTY STEPS LIST:")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            steps=[]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 4: BigQuery step missing source
    print("4. BIGQUERY STEP MISSING SOURCE:")
    print("-" * 40)
    try:
        step = PipelineStepConfig(
            step_id="test_step",
            type="bigquery_to_bigquery",
            destination=BigQueryDestinationConfig(
                dataset_type="gcp",
                table="output_table"
            )
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 5: BigQuery step missing destination
    print("5. BIGQUERY STEP MISSING DESTINATION:")
    print("-" * 40)
    try:
        step = PipelineStepConfig(
            step_id="test_step",
            type="bigquery_to_bigquery",
            source=BigQuerySourceConfig(
                project_id="test-project",
                dataset="test_dataset",
                table="test_table"
            )
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 6: Data quality step missing dq_config
    print("6. DATA QUALITY STEP MISSING DQ_CONFIG:")
    print("-" * 40)
    try:
        step = PipelineStepConfig(
            step_id="test_dq",
            type="data_quality"
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 7: Unknown step dependency
    print("7. STEP DEPENDS ON UNKNOWN STEP:")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            steps=[
                PipelineStepConfig(
                    step_id="step1",
                    type="data_quality",
                    dq_config="test.yml",
                    depends_on=["nonexistent_step"]
                )
            ]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 8: Circular dependency
    print("8. CIRCULAR DEPENDENCY:")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            steps=[
                PipelineStepConfig(
                    step_id="step1",
                    type="data_quality",
                    dq_config="test.yml",
                    depends_on=["step2"]
                ),
                PipelineStepConfig(
                    step_id="step2",
                    type="data_quality",
                    dq_config="test.yml",
                    depends_on=["step1"]
                )
            ]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 9: Duplicate step IDs
    print("9. DUPLICATE STEP IDS:")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            steps=[
                PipelineStepConfig(
                    step_id="duplicate",
                    type="data_quality",
                    dq_config="test.yml"
                ),
                PipelineStepConfig(
                    step_id="duplicate",  # Same ID!
                    type="data_quality",
                    dq_config="test.yml"
                )
            ]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 10: Invalid write_mode
    print("10. INVALID WRITE_MODE:")
    print("-" * 40)
    try:
        dest = BigQueryDestinationConfig(
            dataset_type="gcp",
            table="test_table",
            write_mode="invalid_mode"
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 11: Timeout out of range
    print("11. TIMEOUT OUT OF RANGE:")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            timeout_minutes=2000,  # Too high (max 1440)
            steps=[
                PipelineStepConfig(
                    step_id="step1",
                    type="data_quality",
                    dq_config="test.yml"
                )
            ]
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 12: Invalid step type
    print("12. INVALID STEP TYPE:")
    print("-" * 40)
    try:
        step = PipelineStepConfig(
            step_id="test",
            type="invalid_step_type"
        )
        print("   FAILED: Should have raised ValidationError!")
    except ValidationError as e:
        print(f"   CAUGHT: {e.errors()[0]['msg']}")
    print()

    # Example 13: Valid configuration
    print("13. VALID CONFIGURATION (should pass):")
    print("-" * 40)
    try:
        config = PipelineConfig(
            pipeline_id="valid_pipeline",
            description="A valid pipeline configuration",
            steps=[
                PipelineStepConfig(
                    step_id="extract_data",
                    type="bigquery_to_bigquery",
                    source=BigQuerySourceConfig(
                        project_id="test-project",
                        dataset="source_dataset",
                        table="source_table",
                        query="SELECT * FROM test"
                    ),
                    destination=BigQueryDestinationConfig(
                        dataset_type="gcp",
                        table="output_table",
                        write_mode="overwrite"
                    )
                ),
                PipelineStepConfig(
                    step_id="validate_data",
                    type="data_quality",
                    dq_config="validation_rules.yml",
                    depends_on=["extract_data"]
                )
            ]
        )
        print("   SUCCESS: Valid configuration passed all validation checks")
        print(f"   Pipeline: {config.pipeline_id}")
        print(f"   Steps: {len(config.steps)}")
        for step in config.steps:
            print(f"      - {step.step_id} ({step.type})")
    except ValidationError as e:
        print(f"   FAILED: {e}")
    print()

    print("=" * 80)
    print("SUMMARY:")
    print("All invalid configurations are now caught at config load time")
    print("with clear, helpful error messages via Pydantic validation.")
    print("=" * 80)


if __name__ == "__main__":
    demo_validation()
