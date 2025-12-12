import requests
import json
import uuid

# Configuration
API_URL = "http://localhost:8000/api/v1"
CA_ROOT_API_KEY = "test-ca-root-key-dev-32chars"
ORG_SLUG = "test_audit_org_" + uuid.uuid4().hex[:8]  # Unique org to avoid conflicts

def log(msg):
    print(msg)

def run_audit():
    log(f"Starting Audit for Org: {ORG_SLUG}")
    
    # 1. Onboard Organization (using Root Key)
    headers_root = {"X-CA-Root-Key": CA_ROOT_API_KEY, "Content-Type": "application/json"}
    onboard_payload = {
        "org_slug": ORG_SLUG,
        "company_name": "Audit Test Org",
        "admin_email": "audit@test.com"
    }
    
    # Check if org exists or create it
    # For simplicity, we just try to create. 
    # If it fails, we fall back to getting the key via dev endpoint.
    try:
        post_resp = requests.post(f"{API_URL}/organizations/onboard", json=onboard_payload, headers=headers_root)
        if post_resp.status_code in [200, 201]:
            org_api_key = post_resp.json()["api_key"]
            log(f"Organization created. API Key: {org_api_key[:10]}...")
        else:
             log(f"POST Onboard Failed: {post_resp.status_code} - {post_resp.text}")
             # Try getting dev key
             resp = requests.get(f"{API_URL}/admin/dev/api-key/{ORG_SLUG}", headers=headers_root)
             if resp.status_code == 200:
                 org_api_key = resp.json()["api_key"]
                 log(f"Retrieved existing API Key: {org_api_key[:10]}...")
             else:
                 log(f"Failed to retrieve key (Status {resp.status_code}): {resp.text}")
                 return
    except Exception as e:
        log(f"Critical error during onboard: {e}")
        return

    headers_org = {"X-API-Key": org_api_key, "Content-Type": "application/json"}
    
    # 2. Cleanup (Ensure no plans exist for 'audit_provider')
    # We use a custom provider 'audit_provider'
    PROVIDER = "audit_provider"
    
    # 3. Create Test Plans
    plans_to_create = [
        # Plan 1: Monthly USD
        {
            "plan_name": "Monthly_USD",
            "unit_price_usd": 10.00,
            "seats": 5,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT"
        },
        # Plan 2: Annual USD (High Value)
        {
            "plan_name": "Annual_USD",
            "unit_price_usd": 1200.00, # Assuming this means $1200/year if annual? Or $1200/month billed annually? 
                                       # Code divides by 12, so it treats this as "Total Annual Cost".
            "seats": 1,
            "billing_cycle": "annual",
            "currency": "USD",
            "pricing_model": "PER_SEAT"
        },
        # Plan 3: EUR Currency (Check Mixing)
        {
            "plan_name": "Monthly_EUR",
            "unit_price_usd": 10.00, # Sending 10.00 but Labeling as EUR
            "seats": 2,
            "billing_cycle": "monthly",
            "currency": "EUR", # This should ideally convert, but we suspect it simply sums 10+10
            "pricing_model": "PER_SEAT"
        },
         # Plan 4: GBP Annual
        {
            "plan_name": "Annual_GBP",
            "unit_price_usd": 2400.00, 
            "seats": 1,
            "billing_cycle": "annual",
            "currency": "GBP",
            "pricing_model": "PER_SEAT"
        }
    ]

    for plan in plans_to_create:
        try:
            resp = requests.post(
                f"{API_URL}/subscriptions/{ORG_SLUG}/providers/{PROVIDER}/plans",
                headers=headers_org,
                json=plan
            )
            if resp.status_code != 200:
                log(f"Failed to create plan {plan['plan_name']}: {resp.text}")
            else:
                log(f"Created plan: {plan['plan_name']}")
        except Exception as e:
            log(f"Exception creating plan {plan['plan_name']}: {e}")

    # 3.1 Edge Case Tests
    log("\n--- Edge Case Testing ---")
    
    # Test A: Invalid Currency (XYZ) - Expected: Success (Validation Gap) or Failure (if validated)
    plan_invalid_curr = {
        "plan_name": "Edge_Currency_XYZ",
        "unit_price_usd": 10.0,
        "seats": 1,
        "currency": "XYZ",
        "billing_cycle": "monthly",
        "pricing_model": "PER_SEAT"
    }
    resp = requests.post(f"{API_URL}/subscriptions/{ORG_SLUG}/providers/{PROVIDER}/plans", headers=headers_org, json=plan_invalid_curr)
    if resp.status_code == 200:
        log("[ISSUE FOUND] Created plan with invalid currency 'XYZ' (Validation Gap)")
    else:
        log(f"Correctly rejected invalid currency: {resp.status_code}")

    # Test B: Negative Price - Expected: 422
    plan_neg_price = {
        "plan_name": "Edge_Negative_Price",
        "unit_price_usd": -50.0,
        "seats": 1,
        "currency": "USD",
        "billing_cycle": "monthly",
        "pricing_model": "PER_SEAT"
    }
    resp = requests.post(f"{API_URL}/subscriptions/{ORG_SLUG}/providers/{PROVIDER}/plans", headers=headers_org, json=plan_neg_price)
    if resp.status_code == 200:
         log("[ISSUE FOUND] Created plan with NEGATIVE price (Crucial Validation Failure)")
    elif resp.status_code == 422:
         log("Correctly rejected negative price (422)")
    else:
         log(f"Rejected negative price with status {resp.status_code}")

    # Test C: Huge Seats - Expected: Success (but risky)
    plan_huge_seats = {
        "plan_name": "Edge_Huge_Seats",
        "unit_price_usd": 1.0,
        "seats": 999999999,
        "currency": "USD",
        "billing_cycle": "monthly",
        "pricing_model": "PER_SEAT"
    }
    resp = requests.post(f"{API_URL}/subscriptions/{ORG_SLUG}/providers/{PROVIDER}/plans", headers=headers_org, json=plan_huge_seats)
    if resp.status_code == 200:
         log("[INFO] Created plan with 999,999,999 seats (Potential Overflow risk)")
    else:
         log(f"Rejected huge seats: {resp.status_code}")
         
    # Test D: Duplicate Plan Name - Expected: 409
    # Try creating Monthly_USD again
    plan_duplicate = plans_to_create[0]
    resp = requests.post(f"{API_URL}/subscriptions/{ORG_SLUG}/providers/{PROVIDER}/plans", headers=headers_org, json=plan_duplicate)
    if resp.status_code == 409:
         log("Correctly rejected duplicate plan (409)")
    elif resp.status_code == 200:
         log("[ISSUE FOUND] Created DUPLICATE plan name (Should be unique)")
    else:
         log(f"Duplicate creation returned status {resp.status_code}")


    # 4. Fetch Results & Verify
    log("\n--- Verification Results ---")
    resp = requests.get(
        f"{API_URL}/subscriptions/{ORG_SLUG}/providers/{PROVIDER}/plans",
        headers=headers_org
    )
    
    if resp.status_code != 200:
        log(f"Failed to list plans: {resp.text}")
        return

    data = resp.json()
    total_monthly_reported = data.get("total_monthly_cost", 0)
    
    # Calculate Expected (Based on logic assumption: Summing mixed currencies)
    # 1. Monthly_USD: 10 * 5 = 50
    # 2. Annual_USD: 1200 / 12 * 1 = 100
    # 3. Monthly_EUR: 10 * 2 = 20 (Treated as USD presumably)
    # 4. Annual_GBP: 2400 / 12 * 1 = 200 (Treated as USD presumably)
    
    expected_sum_mixed = 50 + 100 + 20 + 200 # 370.0
    
    log(f"API Reported Total Monthly Cost: {total_monthly_reported}")
    log(f"Expected Sum (If currencies mixed): {expected_sum_mixed}")
    
    if abs(total_monthly_reported - expected_sum_mixed) < 0.01:
        log("\n[ISSUE FOUND] API incorrectly sums mixed currencies (EUR/GBP treated as USD).")
    else:
        log("\n[INFO] API totals differ from mixed sum (Conversion might be happening? or math different).")

    # Check for Annual Cost Field
    if "total_annual_cost" not in data:
         log("[ISSUE FOUND] API response missing 'total_annual_cost' field.")
    
    # Check for Currency Separation
    if "totals_by_currency" not in data:
         log("[ISSUE FOUND] API response missing 'totals_by_currency' breakdown.")

    # Check Plan 2 (Annual) Calculation Detail
    annual_plan = next((p for p in data["plans"] if p["plan_name"] == "Annual_USD"), None)
    if annual_plan:
        log(f"Annual Plan Details: Year Price={annual_plan.get('yearly_price_usd')}, Unit Price={annual_plan.get('unit_price_usd')}")
        # Does it expose the monthly breakdown?

if __name__ == "__main__":
    run_audit()
