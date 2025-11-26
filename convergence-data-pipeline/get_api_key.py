#!/usr/bin/env python3
"""Script to retrieve and decrypt API key for an organization."""

from google.cloud import bigquery
from src.core.security.kms_encryption import decrypt_value
from src.app.config import settings

def get_api_key(org_slug: str):
    client = bigquery.Client(project=settings.gcp_project_id)

    query = f"""
    SELECT org_slug, encrypted_org_api_key, is_active, created_at
    FROM `{settings.gcp_project_id}.organizations.org_api_keys`
    WHERE org_slug = @org_slug AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]
    )

    result = list(client.query(query, job_config=job_config).result())
    if result:
        row = result[0]
        encrypted_key = row['encrypted_org_api_key']
        decrypted_key = decrypt_value(encrypted_key)
        print(f"API Key for {org_slug}: {decrypted_key}")
        return decrypted_key
    else:
        print(f"No active API key found for {org_slug}")
        return None

if __name__ == "__main__":
    import sys
    org_slug = sys.argv[1] if len(sys.argv) > 1 else "newteset_11262025"
    get_api_key(org_slug)
