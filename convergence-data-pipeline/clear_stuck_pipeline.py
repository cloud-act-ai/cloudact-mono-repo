#!/usr/bin/env python3
"""
Clear stuck pipeline run so we can test the fixed template path
"""
from google.cloud import bigquery

client = bigquery.Client(project='gac-prod-471220')

# Update the stuck pipeline to FAILED status
update_query = """
UPDATE `gac-prod-471220.test_x_meta_final.x_meta_pipeline_runs`
SET
    status = 'FAILED',
    end_time = CURRENT_TIMESTAMP(),
    error_message = 'Pipeline stuck - templates path was moved. Manually cleared to allow retesting.'
WHERE pipeline_logging_id = 'bb0410f9-eeb4-4656-bf90-b27f1cb31805'
  AND status IN ('RUNNING', 'PENDING')
"""

print("Clearing stuck pipeline run...")
query_job = client.query(update_query)
result = query_job.result()

print(f"Rows updated: {query_job.num_dml_affected_rows}")

if query_job.num_dml_affected_rows > 0:
    print("✓ Stuck pipeline cleared successfully!")
    print("You can now trigger a new pipeline run.")
else:
    print("No rows updated - pipeline may have already completed or doesn't exist.")
