"""
Test Configuration for Multi-Environment Support

Supports testing against:
- local: localhost:8080 (default)
- staging: Cloud Run staging environment
- production: Cloud Run production environment

Usage:
    export TEST_ENV=staging
    python tests/test_e2e_pipeline.py
"""

import os
from typing import Literal

Environment = Literal["local", "staging", "production"]

# Environment URLs
ENVIRONMENT_URLS = {
    "local": "http://localhost:8080",
    "staging": "https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app",
    "production": "https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app",
}


def get_api_base_url(env: Environment = None) -> str:
    """
    Get API base URL for the specified environment.

    Args:
        env: Environment name (local, staging, production)
             If None, reads from TEST_ENV environment variable
             Falls back to 'local' if not set

    Returns:
        API base URL string

    Examples:
        >>> get_api_base_url("staging")
        'https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app'

        >>> os.environ["TEST_ENV"] = "production"
        >>> get_api_base_url()
        'https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app'
    """
    if env is None:
        env = os.getenv("TEST_ENV", "local").lower()

    if env not in ENVIRONMENT_URLS:
        available = ", ".join(ENVIRONMENT_URLS.keys())
        raise ValueError(
            f"Invalid environment '{env}'. Must be one of: {available}"
        )

    return ENVIRONMENT_URLS[env]


def get_current_environment() -> Environment:
    """
    Get current test environment from TEST_ENV environment variable.

    Returns:
        Environment name (defaults to 'local')
    """
    return os.getenv("TEST_ENV", "local").lower()


def is_local_environment() -> bool:
    """Check if tests are running against local environment."""
    return get_current_environment() == "local"


def is_staging_environment() -> bool:
    """Check if tests are running against staging environment."""
    return get_current_environment() == "staging"


def is_production_environment() -> bool:
    """Check if tests are running against production environment."""
    return get_current_environment() == "production"
