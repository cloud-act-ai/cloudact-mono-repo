import requests
import os

API_KEY = os.getenv("ORG_API_KEY", "")
ORG_SLUG = os.getenv("ORG_SLUG", "")
API_SERVICE_URL = os.getenv("API_SERVICE_URL", "http://localhost:8000")
URL = f"{API_SERVICE_URL}/api/v1/integrations/{ORG_SLUG}/gcp/setup"

def setup_gcp():
    # Validate required environment variables
    if not API_KEY:
        print("ERROR: ORG_API_KEY environment variable is required")
        print("Usage: export ORG_API_KEY='your-org-api-key'")
        return
    if not ORG_SLUG:
        print("ERROR: ORG_SLUG environment variable is required")
        print("Usage: export ORG_SLUG='your-org-slug'")
        return

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
