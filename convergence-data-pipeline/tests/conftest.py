"""
Root conftest.py - Sets environment variables before any module imports.

This file is loaded by pytest before any test modules, ensuring environment
variables are set before the settings module is imported.
"""

import os

# Set environment variables BEFORE any imports that might load settings
# These must be set before src.app.config is imported anywhere
os.environ["GCP_PROJECT_ID"] = "test-project"
os.environ["ENVIRONMENT"] = "development"
os.environ["KMS_KEY_NAME"] = "projects/test/locations/global/keyRings/test/cryptoKeys/test"
os.environ["CA_ROOT_API_KEY"] = "test-ca-root-key"
os.environ["DISABLE_AUTH"] = "true"
