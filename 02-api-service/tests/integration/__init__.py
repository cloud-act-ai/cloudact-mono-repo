"""
Integration tests for CloudAct API Service.

These tests require real BigQuery credentials and test actual service behavior
without mocks. They verify multi-tenant isolation, quota enforcement, concurrent
execution, and security properties.

Run with: pytest -m integration --run-integration

Requirements:
- GOOGLE_APPLICATION_CREDENTIALS environment variable
- GCP_PROJECT_ID set to a real project
- Existing test organizations in BigQuery
"""
