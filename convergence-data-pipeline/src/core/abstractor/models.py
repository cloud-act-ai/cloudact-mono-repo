"""
Config Abstraction Layer - Pydantic Models
Type-safe configuration models for pipelines, sources, and DQ rules.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, validator
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

    class Config:
        use_enum_values = True


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

class PipelineStepConfig(BaseModel):
    """Single pipeline step configuration."""
    name: str
    type: StepType
    source_config: Optional[str] = Field(None, description="Path to source config file")
    target_table: Optional[str] = None
    rules_config: Optional[str] = Field(None, description="Path to DQ rules config file")
    sql_file: Optional[str] = Field(None, description="Path to SQL transformation file")
    destination: Optional[str] = None
    on_failure: OnFailure = OnFailure.STOP

    @validator("source_config")
    def validate_ingest_step(cls, v, values):
        """Validate ingest step has source_config."""
        if values.get("type") == StepType.INGEST and not v:
            raise ValueError("Ingest step must have source_config")
        return v

    @validator("rules_config")
    def validate_dq_step(cls, v, values):
        """Validate DQ step has rules_config."""
        if values.get("type") == StepType.DQ_CHECK and not v:
            raise ValueError("DQ check step must have rules_config")
        return v

    class Config:
        use_enum_values = True


class PipelineConfig(BaseModel):
    """Complete pipeline configuration."""
    pipeline_id: str
    description: Optional[str] = None
    schedule: Optional[str] = Field(None, description="Cron expression for scheduling")
    steps: List[PipelineStepConfig]
    timeout_seconds: int = Field(default=3600, ge=60)
    retry_attempts: int = Field(default=3, ge=0, le=10)

    class Config:
        use_enum_values = True


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
