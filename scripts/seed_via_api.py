import requests
import json
import time

API_URL = "http://localhost:8000"
ORG_SLUG = "guru_inc_12012025"
ROOT_KEY = "test-ca-root-key-dev-32chars-min"

# We hope Root Key works. If not, we are stuck without Org Key.
HEADERS = {
    "X-API-Key": ROOT_KEY,
    "Content-Type": "application/json"
}

SUBSCRIPTIONS = [
    { "provider": "slack", "plan": { "plan_name": "Pro", "unit_price": 15, "seats": 5, "pricing_model": "PER_SEAT", "billing_cycle": "monthly", "currency": "USD", "status": "active" } },
    { "provider": "jira", "plan": { "plan_name": "Standard", "unit_price": 10, "seats": 20, "pricing_model": "PER_SEAT", "billing_cycle": "monthly", "currency": "USD", "status": "active" } }
]

def seed():
    for sub in SUBSCRIPTIONS:
        provider = sub["provider"]
        plan = sub["plan"]
        
        url = f"{API_URL}/api/v1/subscriptions/{ORG_SLUG}/providers/{provider}/plans"
        print(f"Adding {provider} plan to {url}...")
        
        try:
            response = requests.post(url, headers=HEADERS, json=plan)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
        except Exception as e:
            print(f"Error: {e}")
        
        time.sleep(1)

if __name__ == "__main__":
    seed()
