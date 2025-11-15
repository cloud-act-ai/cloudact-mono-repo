"""
Create required BigQuery datasets for the pipeline.
"""
import os
from google.cloud import bigquery
from pathlib import Path

# Load credentials from .env
credentials_path = Path(__file__).parent.parent / ".env"
if credentials_path.exists():
    with open(credentials_path) as f:
        for line in f:
            if line.startswith("GOOGLE_APPLICATION_CREDENTIALS="):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = line.split("=", 1)[1].strip()
            elif line.startswith("GCP_PROJECT_ID="):
                os.environ["GCP_PROJECT_ID"] = line.split("=", 1)[1].strip()

project_id = os.environ.get("GCP_PROJECT_ID", "gac-prod-471220")
location = "US"

print(f"Creating datasets in project: {project_id}")

# Initialize BigQuery client
client = bigquery.Client(project=project_id, location=location)

datasets_to_create = [
    {
        "id": "metadata",
        "description": "Metadata storage for pipeline runs, API keys, and system logs",
        "location": location
    },
    {
        "id": "acme1281_google",
        "description": "Tenant acme1281 - Google data storage",
        "location": location
    }
]

for dataset_info in datasets_to_create:
    dataset_id = f"{project_id}.{dataset_info['id']}"

    try:
        # Try to get the dataset first
        dataset = client.get_dataset(dataset_id)
        print(f"✅ Dataset already exists: {dataset_id}")
    except Exception:
        # Dataset doesn't exist, create it
        try:
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = dataset_info["location"]
            dataset.description = dataset_info["description"]

            dataset = client.create_dataset(dataset, exists_ok=True)
            print(f"✅ Created dataset: {dataset_id}")
        except Exception as e:
            print(f"❌ Error creating dataset {dataset_id}: {e}")

print("\n🎉 Dataset creation complete!")
