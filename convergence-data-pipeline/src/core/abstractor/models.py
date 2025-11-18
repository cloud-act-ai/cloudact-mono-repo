"""
Config Abstraction Layer - Pydantic Models
Type-safe configuration models for pipelines, sources, and DQ rules.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from enum import Enum


# ============================================
# Enums
# ============================================

class ConnectorType(str, Enum):
    """Supported connector types."""
    REST_API = "rest_api"
    BIGQUERY = "bigquery"
    DATABASE = "database"
    OBJECT_STORAGE = "object_storage"
    GCS = "gcs"


class AuthType(str, Enum):
    """Supported authentication types."""
    BEARER = "bearer"
    API_KEY = "api_key"
    BASIC = "basic"
    OAUTH2 = "oauth2"


class LoadingStrategy(str, Enum):
    """Data loading strategies."""
    APPEND = "append"
    OVERWRITE = "overwrite"
    MERGE = "merge"
    CREATE_EXTERNAL_TABLE = "create_external_table"
    API_POST = "api_post"


class StepType(str, Enum):
    """Pipeline step types."""
    INGEST = "ingest"
    DQ_CHECK = "dq_check"
    TRANSFORM = "transform"


class OnFailure(str, Enum):
    """Failure handling strategies."""
    STOP = "stop"
    ALERT = "alert"
    CONTINUE = "continue"


# ============================================
# Source Configuration Models
# ============================================

class AuthConfig(BaseModel):
    """Authentication configuration."""
    type: AuthType
    secret_key: str = Field(..., description="Name of secret in secrets manager")
    header_name: Optional[str] = Field(default=None, description="Custom auth header name")


class PaginationConfig(BaseModel):
    """API pagination configuration."""
    type: Literal["cursor", "offset", "page"] = "cursor"
    cursor_field: Optional[str] = "next_page_token"
    page_size: int = Field(default=100, ge=1, le=10000)


class RateLimitConfig(BaseModel):
    """API rate limiting configuration."""
    requests_per_minute: int = Field(default=60, ge=1)
    requests_per_hour: Optional[int] = None


class ConnectorConfig(BaseModel):
    """Base connector configuration."""
    type: ConnectorType


class RestAPIConnectorConfig(ConnectorConfig):
    """REST API connector configuration."""
    type: Literal[ConnectorType.REST_API] = ConnectorType.REST_API
    base_url: str
    endpoint: str
    auth: AuthConfig
    pagination: Optional[PaginationConfig] = None
    rate_limit: Optional[RateLimitConfig] = None
    headers: Optional[Dict[str, str]] = None
    timeout: int = Field(default=30, ge=1, le=300)


class BigQueryConnectorConfig(ConnectorConfig):
    """BigQuery connector configuration."""
    type: Literal[ConnectorType.BIGQUERY] = ConnectorType.BIGQUERY
    source_project: str
    source_dataset: str
    query: str


class DatabaseConnectorConfig(ConnectorConfig):
    """Database connector configuration."""
    type: Literal[ConnectorType.DATABASE] = ConnectorType.DATABASE
    db_type: Literal["postgres", "mysql", "mssql"]
    secret_key: str = Field(..., description="Connection string secret name")
    query: str


class LoadingConfig(BaseModel):
    """Data loading configuration."""
    destination: str = Field(..., description="Target table (dataset.table)")
    schema_file: Optional[str] = Field(None, description="Path to schema JSON file")
    strategy: LoadingStrategy
    merge_keys: Optional[List[str]] = Field(None, description="Keys for merge strategy")
    partition_field: Optional[str] = Field(default="ingestion_date")
    cluster_fields: Optional[List[str]] = None


class SourceConfig(BaseModel):
    """Complete source configuration."""
    source_id: str
    domain: str = Field(..., description="Domain/provider (e.g., 'openai', 'google')")
    description: Optional[str] = None
    connector: RestAPIConnectorConfig | BigQueryConnectorConfig | DatabaseConnectorConfig
    loading: LoadingConfig

    model_config = ConfigDict(use_enum_values=True)


# ============================================
# Data Quality Configuration Models
# ============================================

class ExpectationConfig(BaseModel):
    """Data quality expectation configuration."""
    name: str
    type: str = Field(..., description="Great Expectations expectation type")
    column: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    value_set: Optional[List[Any]] = None
    filter: Optional[str] = None
    severity: Literal["critical", "warning", "info"] = "warning"
    kwargs: Optional[Dict[str, Any]] = Field(default_factory=dict)


class DQConfig(BaseModel):
    """Data quality rules configuration."""
    dq_id: str
    target_table: str
    description: Optional[str] = None
    expectations: List[ExpectationConfig]


# ============================================
# Pipeline Configuration Models
# ============================================

class BigQuerySourceConfig(BaseModel):
    """BigQuery source configuration for pipeline steps."""
    project_id: str = Field(..., description="GCP project ID")
    dataset: str = Field(..., description="BigQuery dataset name")
    table: str = Field(..., description="BigQuery table name")
    query: Optional[str] = Field(None, description="SQL query to execute")


class BigQueryDestinationConfig(BaseModel):
    """BigQuery destination configuration for pipeline steps."""
    dataset_type: str = Field(..., description="Dataset type (e.g., 'gcp', 'aws', 'openai')")
    table: str = Field(..., description="Destination table name")
    write_mode: str = Field(default="overwrite", description="Write mode: overwrite, append, merge")
    recreate: bool = Field(default=False, description="Delete and recreate table")
    schema_file: Optional[str] = Field(None, description="Path to schema JSON file")
    schema_template: Optional[str] = Field(None, description="Name of schema template from template directory")

    @field_validator("write_mode")
    @classmethod
    def validate_write_mode(cls, v):
        """Validate write_mode is a valid option."""
        valid_modes = ["overwrite", "append", "merge"]
        if v not in valid_modes:
            raise ValueError(f"write_mode must be one of {valid_modes}, got: {v}")
        return v


class DataQualitySourceConfig(BaseModel):
    """Data quality source configuration."""
    dataset_type: str = Field(..., description="Dataset type to validate")
    table: str = Field(..., description="Table name to validate")


class PipelineStepConfig(BaseModel):
    """Single pipeline step configuration."""
    step_id: str = Field(..., description="Unique step identifier")
    name: Optional[str] = Field(None, description="Human-readable step name")
    description: Optional[str] = Field(None, description="Step description")
    ps_type: str = Field(..., description="Pipeline step type with provider prefix (e.g., 'gcp.bigquery_to_bigquery', 'notify_systems.email_notification')")

    # Additional fields for any ps_type
    trigger: Optional[str] = Field(None, description="Notification trigger (on_failure, on_success, etc.)")
    to_emails: Optional[str | List[str]] = Field(None, description="Email recipients for notifications")
    subject: Optional[str] = Field(None, description="Email subject for notifications")
    message: Optional[str] = Field(None, description="Email message for notifications")
    variables: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Variables for template replacement")

    # BigQuery to BigQuery step fields
    # Note: source can be BigQuerySourceConfig OR DataQualitySourceConfig OR dict (for flexibility)
    source: Optional[BigQuerySourceConfig | DataQualitySourceConfig | Dict[str, Any]] = Field(
        None, description="Source configuration for BQ or DQ steps"
    )
    destination: Optional[BigQueryDestinationConfig] = Field(None, description="Destination configuration for BQ steps")

    # Data quality step fields
    dq_config: Optional[str] = Field(None, description="Path to DQ rules config file")
    fail_on_error: bool = Field(default=True, description="Whether to fail pipeline on DQ errors")

    # Legacy fields (kept for backward compatibility)
    source_config: Optional[str] = Field(None, description="Path to source config file")
    target_table: Optional[str] = None
    rules_config: Optional[str] = Field(None, description="Path to DQ rules config file")
    sql_file: Optional[str] = Field(None, description="Path to SQL transformation file")

    # Step configuration
    timeout_minutes: int = Field(default=10, ge=1, le=120, description="Step timeout in minutes")
    on_failure: OnFailure = Field(default=OnFailure.STOP, description="Failure handling strategy")
    depends_on: List[str] = Field(default_factory=list, description="List of step IDs this step depends on")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    @field_validator("ps_type")
    @classmethod
    def validate_ps_type(cls, v):
        """Validate ps_type follows provider.template_name format."""
        if "." not in v:
            raise ValueError(f"ps_type must follow 'provider.template_name' format (e.g., 'gcp.bigquery_to_bigquery'). Got: {v}")
        return v

    @field_validator("depends_on")
    @classmethod
    def validate_depends_on(cls, v):
        """Validate depends_on contains unique step IDs."""
        if len(v) != len(set(v)):
            raise ValueError("depends_on must contain unique step IDs (no duplicates)")
        return v

    @model_validator(mode="after")
    def validate_step_requirements(self):
        """Validate step has required fields based on ps_type."""
        # BigQuery to BigQuery step requirements
        if self.ps_type == "gcp.bigquery_to_bigquery":
            if not self.source:
                raise ValueError("BigQuery to BigQuery step must have 'source' configuration")
            if not self.destination:
                raise ValueError("BigQuery to BigQuery step must have 'destination' configuration")

        # Data quality step requirements
        if self.ps_type == "gcp.data_quality":
            if not self.dq_config:
                raise ValueError("Data quality step must have 'dq_config' field")

        return self

    model_config = ConfigDict(use_enum_values=True, extra="allow")


class PipelineConfig(BaseModel):
    """Complete pipeline configuration."""
    pipeline_id: str = Field(..., description="Unique pipeline identifier", min_length=1)
    description: Optional[str] = Field(None, description="Pipeline description")
    version: Optional[str] = Field(None, description="Pipeline version")
    schedule: Optional[str] = Field(None, description="Cron expression for scheduling")
    steps: List[PipelineStepConfig] = Field(..., min_length=1, description="Pipeline steps (at least 1 required)")
    timeout_minutes: int = Field(default=30, ge=1, le=1440, description="Pipeline timeout in minutes")
    timeout_seconds: int = Field(default=3600, ge=60, description="Pipeline timeout in seconds (deprecated)")
    retry_attempts: int = Field(default=3, ge=0, le=10, description="Number of retry attempts on failure")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Runtime parameters")

    @field_validator("pipeline_id")
    @classmethod
    def validate_pipeline_id(cls, v):
        """Validate pipeline_id format."""
        if not v or not v.strip():
            raise ValueError("pipeline_id cannot be empty or whitespace")
        # Allow alphanumeric, underscores, hyphens
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError(
                f"pipeline_id must contain only alphanumeric characters, underscores, and hyphens. Got: {v}"
            )
        return v

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, v):
        """Validate steps configuration."""
        if not v:
            raise ValueError("Pipeline must have at least one step")

        # Check for duplicate step_ids
        step_ids = [step.step_id for step in v]
        if len(step_ids) != len(set(step_ids)):
            duplicates = [sid for sid in step_ids if step_ids.count(sid) > 1]
            raise ValueError(f"Duplicate step_id found: {set(duplicates)}")

        # Validate dependencies reference existing steps
        for step in v:
            for dep_id in step.depends_on:
                if dep_id not in step_ids:
                    raise ValueError(
                        f"Step '{step.step_id}' depends on unknown step '{dep_id}'. "
                        f"Available steps: {step_ids}"
                    )

        # Detect circular dependencies (simple check)
        cls._detect_circular_dependencies(v)

        return v

    @classmethod
    def _detect_circular_dependencies(cls, steps: List[PipelineStepConfig]) -> None:
        """Detect circular dependencies in pipeline steps."""
        step_map = {step.step_id: step for step in steps}

        def has_cycle(step_id: str, visited: set, rec_stack: set) -> bool:
            """DFS to detect cycles."""
            visited.add(step_id)
            rec_stack.add(step_id)

            step = step_map[step_id]
            for dep_id in step.depends_on:
                if dep_id not in visited:
                    if has_cycle(dep_id, visited, rec_stack):
                        return True
                elif dep_id in rec_stack:
                    return True

            rec_stack.remove(step_id)
            return False

        visited = set()
        for step in steps:
            if step.step_id not in visited:
                if has_cycle(step.step_id, visited, set()):
                    raise ValueError(
                        f"Circular dependency detected in pipeline steps involving '{step.step_id}'"
                    )

    model_config = ConfigDict(use_enum_values=True, extra="allow")


# ============================================
# Runtime Models
# ============================================

class PipelineRunMetadata(BaseModel):
    """Metadata for a pipeline run."""
    pipeline_logging_id: str
    pipeline_id: str
    tenant_id: str
    status: Literal["PENDING", "RUNNING", "COMPLETE", "FAILED"]
    trigger_type: Literal["api", "scheduler", "manual"]
    trigger_by: str
    config_version: Optional[str] = None  # Git commit SHA
    worker_instance: Optional[str] = None
