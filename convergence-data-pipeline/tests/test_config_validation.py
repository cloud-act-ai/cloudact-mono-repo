"""
Test Config Validation - Demonstrates Pydantic Validation Enforcement

This test file demonstrates all validation errors that would now be caught
with Pydantic validation enforcement.
"""

import pytest
from pydantic import ValidationError

from src.core.abstractor.models import (
    PipelineConfig,
    PipelineStepConfig,
    BigQuerySourceConfig,
    BigQueryDestinationConfig,
)


class TestPipelineConfigValidation:
    """Test pipeline configuration validation."""

    def test_valid_pipeline_config(self):
        """Valid pipeline config should pass validation."""
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            description="Test pipeline",
            steps=[
                PipelineStepConfig(
                    step_id="step1",
                    type="gcp.bq_etl",
                    source=BigQuerySourceConfig(
                        project_id="test-project",
                        dataset="test_dataset",
                        table="test_table",
                        query="SELECT * FROM test"
                    ),
                    destination=BigQueryDestinationConfig(
                        dataset_type="gcp",
                        table="output_table"
                    )
                )
            ]
        )
        assert config.pipeline_id == "test_pipeline"
        assert len(config.steps) == 1

    def test_missing_pipeline_id(self):
        """Pipeline without pipeline_id should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl"
                    )
                ]
            )
        assert "pipeline_id" in str(exc_info.value)

    def test_empty_pipeline_id(self):
        """Pipeline with empty pipeline_id should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="",
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl"
                    )
                ]
            )
        # Either "cannot be empty" or "at least 1 character" is acceptable
        error_str = str(exc_info.value).lower()
        assert "pipeline_id" in error_str and ("empty" in error_str or "at least 1" in error_str)

    def test_invalid_pipeline_id_format(self):
        """Pipeline with invalid pipeline_id format should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test pipeline!",  # Spaces and special chars not allowed
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl"
                    )
                ]
            )
        assert "alphanumeric" in str(exc_info.value)

    def test_missing_steps(self):
        """Pipeline without steps should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                steps=[]
            )
        assert "at least 1" in str(exc_info.value).lower()

    def test_duplicate_step_ids(self):
        """Pipeline with duplicate step_ids should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                steps=[
                    PipelineStepConfig(
                        step_id="duplicate_step",
                        type="gcp.bq_etl"
                    ),
                    PipelineStepConfig(
                        step_id="duplicate_step",  # Duplicate!
                        type="data_quality"
                    )
                ]
            )
        assert "Duplicate step_id" in str(exc_info.value)

    def test_timeout_validation(self):
        """Timeout values should be validated."""
        # Too low timeout should fail
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                timeout_minutes=0,  # Must be >= 1
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl"
                    )
                ]
            )
        assert "greater than or equal to 1" in str(exc_info.value)

        # Too high timeout should fail
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                timeout_minutes=2000,  # Must be <= 1440 (24 hours)
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl"
                    )
                ]
            )
        assert "less than or equal to 1440" in str(exc_info.value)

    def test_retry_attempts_validation(self):
        """Retry attempts should be validated."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                retry_attempts=20,  # Must be <= 10
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl"
                    )
                ]
            )
        assert "less than or equal to 10" in str(exc_info.value)


class TestPipelineStepValidation:
    """Test pipeline step validation."""

    def test_missing_step_id(self):
        """Step without step_id should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                type="gcp.bq_etl"
            )
        assert "step_id" in str(exc_info.value)

    def test_invalid_step_type(self):
        """Step with invalid type should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="invalid_type"
            )
        assert "Unsupported step type" in str(exc_info.value)

    def test_bigquery_step_missing_source(self):
        """BigQuery step without source should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="gcp.bq_etl",
                destination=BigQueryDestinationConfig(
                    dataset_type="gcp",
                    table="output"
                )
            )
        assert "must have 'source' configuration" in str(exc_info.value)

    def test_bigquery_step_missing_destination(self):
        """BigQuery step without destination should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="gcp.bq_etl",
                source=BigQuerySourceConfig(
                    project_id="test",
                    dataset="test",
                    table="test"
                )
            )
        assert "must have 'destination' configuration" in str(exc_info.value)

    def test_data_quality_step_missing_dq_config(self):
        """Data quality step without dq_config should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="data_quality"
            )
        assert "must have 'dq_config' field" in str(exc_info.value)

    def test_step_timeout_validation(self):
        """Step timeout should be validated."""
        # Too low
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="gcp.bq_etl",
                timeout_minutes=0
            )
        assert "greater than or equal to 1" in str(exc_info.value)

        # Too high
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="gcp.bq_etl",
                timeout_minutes=200
            )
        assert "less than or equal to 120" in str(exc_info.value)

    def test_duplicate_depends_on(self):
        """Step with duplicate depends_on should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineStepConfig(
                step_id="step1",
                type="gcp.bq_etl",
                depends_on=["step0", "step0"]  # Duplicate!
            )
        assert "unique step IDs" in str(exc_info.value)


class TestBigQueryConfigValidation:
    """Test BigQuery configuration validation."""

    def test_missing_required_source_fields(self):
        """Source config missing required fields should fail."""
        with pytest.raises(ValidationError) as exc_info:
            BigQuerySourceConfig(
                project_id="test-project"
                # Missing dataset and table
            )
        assert "dataset" in str(exc_info.value)

    def test_missing_required_destination_fields(self):
        """Destination config missing required fields should fail."""
        with pytest.raises(ValidationError) as exc_info:
            BigQueryDestinationConfig(
                dataset_type="gcp"
                # Missing table
            )
        assert "table" in str(exc_info.value)

    def test_invalid_write_mode(self):
        """Invalid write_mode should fail."""
        with pytest.raises(ValidationError) as exc_info:
            BigQueryDestinationConfig(
                dataset_type="gcp",
                table="test_table",
                write_mode="invalid_mode"
            )
        assert "write_mode must be one of" in str(exc_info.value)


class TestDependencyValidation:
    """Test pipeline dependency validation."""

    def test_unknown_dependency(self):
        """Step depending on unknown step should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl",
                        depends_on=["unknown_step"]  # Doesn't exist!
                    )
                ]
            )
        assert "depends on unknown step" in str(exc_info.value)

    def test_circular_dependency_simple(self):
        """Simple circular dependency should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl",
                        depends_on=["step2"]
                    ),
                    PipelineStepConfig(
                        step_id="step2",
                        type="gcp.bq_etl",
                        depends_on=["step1"]  # Circular!
                    )
                ]
            )
        assert "Circular dependency detected" in str(exc_info.value)

    def test_circular_dependency_complex(self):
        """Complex circular dependency should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PipelineConfig(
                pipeline_id="test_pipeline",
                steps=[
                    PipelineStepConfig(
                        step_id="step1",
                        type="gcp.bq_etl",
                        depends_on=["step3"]
                    ),
                    PipelineStepConfig(
                        step_id="step2",
                        type="gcp.bq_etl",
                        depends_on=["step1"]
                    ),
                    PipelineStepConfig(
                        step_id="step3",
                        type="gcp.bq_etl",
                        depends_on=["step2"]  # Circular: 1->3->2->1
                    )
                ]
            )
        assert "Circular dependency detected" in str(exc_info.value)

    def test_valid_dependency_chain(self):
        """Valid dependency chain should pass."""
        config = PipelineConfig(
            pipeline_id="test_pipeline",
            steps=[
                PipelineStepConfig(
                    step_id="step1",
                    type="gcp.bq_etl",
                    source=BigQuerySourceConfig(
                        project_id="test",
                        dataset="test",
                        table="test"
                    ),
                    destination=BigQueryDestinationConfig(
                        dataset_type="gcp",
                        table="output"
                    )
                ),
                PipelineStepConfig(
                    step_id="step2",
                    type="gcp.bq_etl",
                    depends_on=["step1"],
                    source=BigQuerySourceConfig(
                        project_id="test",
                        dataset="test",
                        table="test"
                    ),
                    destination=BigQueryDestinationConfig(
                        dataset_type="gcp",
                        table="output"
                    )
                ),
                PipelineStepConfig(
                    step_id="step3",
                    type="data_quality",
                    depends_on=["step2"],
                    dq_config="test_dq.yml"
                )
            ]
        )
        assert len(config.steps) == 3


class TestValidationErrorMessages:
    """Test that validation error messages are helpful."""

    def test_error_messages_are_descriptive(self):
        """Validation errors should have helpful messages."""
        try:
            PipelineConfig(
                pipeline_id="test@pipeline",  # Invalid character
                steps=[]  # Empty
            )
        except ValidationError as e:
            error_str = str(e)
            # Should mention what's wrong
            assert len(error_str) > 0
            # Should have field information
            assert "pipeline_id" in error_str or "steps" in error_str

    def test_multiple_validation_errors(self):
        """Multiple validation errors should all be reported."""
        try:
            PipelineConfig(
                pipeline_id="",  # Empty
                timeout_minutes=-5,  # Invalid
                retry_attempts=100,  # Invalid
                steps=[]  # Empty
            )
        except ValidationError as e:
            # Should report multiple errors
            errors = e.errors()
            assert len(errors) >= 3  # At least 3 validation errors


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
