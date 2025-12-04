import requests
import json
import os

API_KEY = "retryorg_001_12012025_api_gsgNUBI7qU06tXagqHJbcA"
ORG_SLUG = "retryorg_001_12012025"
URL = f"http://localhost:8000/api/v1/integrations/{ORG_SLUG}/gcp/setup"

def setup_gcp():
    try:
        with open("temp_gcp_creds.json", "r") as f:
            creds_content = f.read() # Read as string, don't parse yet

        payload = {
            "credential": creds_content,
            "credential_name": "GCP Service Account (Auto)",
            "skip_validation": False
        }

        headers = {
            "X-API-Key": API_KEY,
            "Content-Type": "application/json"
        }

        print(f"Sending request to {URL}...")
        response = requests.post(URL, json=payload, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")

        if response.status_code == 200:
            print("SUCCESS: GCP Integration Configured")
        else:
            print("FAILED: GCP Integration Configuration Failed")

    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    setup_gcp()
