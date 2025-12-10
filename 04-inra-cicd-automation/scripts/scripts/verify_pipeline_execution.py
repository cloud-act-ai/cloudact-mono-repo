import requests
import time
import json

ORG_SLUG = "retryorg_001_12012025"
ORG_KEY = "retryorg_001_12012025_api_gsgNUBI7qU06tXagqHJbcA"

VALIDATOR_URL = f"http://localhost:8000/api/v1/validator/validate/{ORG_SLUG}"
COMPLETE_URL = f"http://localhost:8000/api/v1/validator/complete/{ORG_SLUG}"
PIPELINE_URL = f"http://localhost:8001/api/v1/pipelines/run/{ORG_SLUG}/gcp/cost/billing"

def reset_pipeline_state():
    headers = {
        "X-API-Key": ORG_KEY,
        "Content-Type": "application/json"
    }
    params = {"pipeline_status": "FAILED"}
    try:
        requests.post(COMPLETE_URL, params=params, headers=headers)
    except:
        pass

def get_quota_info(retries=3):
    headers = {
        "X-API-Key": ORG_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "pipeline_id": "gcp_billing",
        "include_credentials": False
    }
    
    for i in range(retries):
        try:
            resp = requests.post(VALIDATOR_URL, json=payload, headers=headers)
            
            if resp.status_code == 200:
                data = resp.json()
                if data.get("quota"):
                    return data.get("quota")
                else:
                    print(f"Quota missing in 200 response: {json.dumps(data)}")
            else:
                print(f"Error getting quota (Attempt {i+1}): {resp.status_code} {resp.text}")
        except Exception as e:
            print(f"Exception getting quota (Attempt {i+1}): {e}")
        
        time.sleep(2)
    
    return None

def trigger_pipeline():
    headers = {
        "X-API-Key": ORG_KEY,
        "Content-Type": "application/json"
    }
    print(f"Triggering URL: {PIPELINE_URL}")
    try:
        resp = requests.post(PIPELINE_URL, json={}, headers=headers)
        print(f"Trigger Pipeline Response: {resp.status_code} {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Trigger Pipeline Error: {e}")
        return False

def main():
    print("--- Verifying Pipeline Execution (Debug) ---")
    
    # 0. Reset state
    reset_pipeline_state()
    time.sleep(2)

    # 1. Get initial quota
    print("Getting initial quota...")
    quota = get_quota_info()
    if not quota:
        print("Failed to get initial quota. Exiting.")
        return

    initial_run_count = quota.get("pipelines_run_today", 0)
    print(f"Initial Pipelines Run Today: {initial_run_count}")

    # 2. Trigger Pipeline
    if not trigger_pipeline():
        print("Failed to trigger pipeline.")
        return

    # 3. Wait for execution
    print("Waiting 10 seconds for execution...")
    time.sleep(10)

    # 4. Get final quota
    print("Getting final quota...")
    quota = get_quota_info()
    if not quota:
        print("Failed to get final quota.")
        return

    final_run_count = quota.get("pipelines_run_today", 0)
    print(f"Final Pipelines Run Today: {final_run_count}")

    # 5. Verify
    if final_run_count > initial_run_count:
        print("SUCCESS: Pipeline quota incremented!")
    else:
        print("FAILURE: Pipeline quota did not increment.")

if __name__ == "__main__":
    main()
