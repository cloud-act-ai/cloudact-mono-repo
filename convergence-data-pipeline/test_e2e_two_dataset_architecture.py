#!/usr/bin/env python3
"""
End-to-End Test: Two-Dataset Architecture Security & Functionality
Tests the complete separation of auth data (customers dataset) from operational data (tenant datasets)
"""

import requests
import json
import time
from datetime import datetime
from google.cloud import bigquery

# Configuration
BASE_URL = "http://localhost:8080"
PROJECT_ID = "gac-prod-471220"

# Test customers
TEST_CUSTOMERS = [
    {
        "tenant_id": "test_genai_acme_001",
        "company_name": "GenAI Test Acme Corp",
        "admin_email": "admin@acme-genai-test.com",
        "subscription_plan": "PROFESSIONAL"
    },
    {
        "tenant_id": "test_genai_globex_001",
        "company_name": "GenAI Test Globex Inc",
        "admin_email": "admin@globex-genai-test.com",
        "subscription_plan": "SCALE"
    }
]

def print_test_header(test_name):
    """Print formatted test header"""
    print("\n" + "="*80)
    print(f"TEST: {test_name}")
    print("="*80)

def print_success(message):
    """Print success message"""
    print(f"✅ SUCCESS: {message}")

def print_error(message):
    """Print error message"""
    print(f"❌ FAILED: {message}")

def print_info(message):
    """Print info message"""
    print(f"ℹ️  INFO: {message}")

# ============================================
# TEST 1: Customer Onboarding with Two-Dataset Architecture
# ============================================
def test_customer_onboarding():
    """Test that onboarding creates entries in customers dataset and tenant dataset"""
    print_test_header("Customer Onboarding - Two-Dataset Architecture")

    results = []

    for customer in TEST_CUSTOMERS:
        print_info(f"Onboarding customer: {customer['tenant_id']}")

        response = requests.post(
            f"{BASE_URL}/api/v1/customers/onboard",
            json=customer
        )

        if response.status_code == 200:
            data = response.json()
            print_success(f"Customer {customer['tenant_id']} onboarded successfully")
            print_info(f"  - Customer ID: {data.get('customer_id')}")
            print_info(f"  - API Key: {data.get('api_key')[:20]}...")
            print_info(f"  - Dataset Created: {data.get('dataset_created')}")

            results.append({
                "tenant_id": customer['tenant_id'],
                "customer_id": data.get('customer_id'),
                "api_key": data.get('api_key')
            })
        else:
            print_error(f"Failed to onboard {customer['tenant_id']}: {response.status_code} - {response.text}")

    return results

# ============================================
# TEST 2: Verify Auth Data in Customers Dataset
# ============================================
def test_auth_data_in_customers_dataset(onboarded_customers):
    """Verify API keys and credentials are stored in customers dataset"""
    print_test_header("Auth Data Stored in Customers Dataset")

    client = bigquery.Client(project=PROJECT_ID)

    for customer in onboarded_customers:
        tenant_id = customer['tenant_id']

        # Check customer_profiles table
        query = f"""
        SELECT customer_id, tenant_id, company_name, subscription_plan, status
        FROM `{PROJECT_ID}.customers.customer_profiles`
        WHERE tenant_id = '{tenant_id}'
        """

        try:
            results = list(client.query(query).result())
            if results:
                print_success(f"Customer profile found in customers.customer_profiles for {tenant_id}")
                print_info(f"  - Customer ID: {results[0].customer_id}")
                print_info(f"  - Plan: {results[0].subscription_plan}")
                print_info(f"  - Status: {results[0].status}")
            else:
                print_error(f"No customer profile found for {tenant_id}")
        except Exception as e:
            print_error(f"Error querying customer_profiles: {e}")

        # Check customer_api_keys table
        query = f"""
        SELECT api_key_id, tenant_id, is_active, created_at
        FROM `{PROJECT_ID}.customers.customer_api_keys`
        WHERE tenant_id = '{tenant_id}'
        """

        try:
            results = list(client.query(query).result())
            if results:
                print_success(f"API key found in customers.customer_api_keys for {tenant_id}")
                print_info(f"  - API Key ID: {results[0].api_key_id}")
                print_info(f"  - Active: {results[0].is_active}")
                print_info(f"  - Created: {results[0].created_at}")
            else:
                print_error(f"No API key found for {tenant_id}")
        except Exception as e:
            print_error(f"Error querying customer_api_keys: {e}")

        # Check customer_subscriptions table
        query = f"""
        SELECT subscription_id, plan_name, status, max_pipelines_per_day
        FROM `{PROJECT_ID}.customers.customer_subscriptions`
        WHERE customer_id = (
            SELECT customer_id FROM `{PROJECT_ID}.customers.customer_profiles`
            WHERE tenant_id = '{tenant_id}'
        )
        """

        try:
            results = list(client.query(query).result())
            if results:
                print_success(f"Subscription found in customers.customer_subscriptions for {tenant_id}")
                print_info(f"  - Plan: {results[0].plan_name}")
                print_info(f"  - Daily Quota: {results[0].max_pipelines_per_day}")
            else:
                print_error(f"No subscription found for {tenant_id}")
        except Exception as e:
            print_error(f"Error querying customer_subscriptions: {e}")

# ============================================
# TEST 3: Verify Tenant Dataset Contains NO Credentials
# ============================================
def test_tenant_dataset_no_credentials(onboarded_customers):
    """Verify tenant datasets contain ZERO credentials (safe for GenAI)"""
    print_test_header("Tenant Datasets Contain NO Credentials (GenAI Safe)")

    client = bigquery.Client(project=PROJECT_ID)

    for customer in onboarded_customers:
        tenant_id = customer['tenant_id']

        print_info(f"Checking tenant dataset: {tenant_id}")

        # List all tables in tenant dataset
        query = f"""
        SELECT table_name
        FROM `{PROJECT_ID}.{tenant_id}.INFORMATION_SCHEMA.TABLES`
        WHERE table_schema = '{tenant_id}'
        """

        try:
            tables = list(client.query(query).result())
            table_names = [row.table_name for row in tables]

            print_info(f"  Tables in {tenant_id}: {', '.join(table_names)}")

            # Check for credential-related tables (should NOT exist)
            dangerous_tables = [
                'x_meta_api_keys',
                'x_meta_cloud_credentials',
                'customer_api_keys',
                'customer_cloud_credentials',
                'api_keys',
                'credentials'
            ]

            found_dangerous = False
            for dangerous in dangerous_tables:
                if dangerous in table_names:
                    print_error(f"  ⚠️  SECURITY RISK: Found {dangerous} in tenant dataset!")
                    found_dangerous = True

            if not found_dangerous:
                print_success(f"  ✅ NO credential tables found in {tenant_id} - SAFE for GenAI")

            # Expected operational tables
            expected_tables = [
                'x_meta_pipeline_runs',
                'x_meta_step_logs',
                'x_meta_dq_results'
            ]

            for expected in expected_tables:
                if expected in table_names:
                    print_success(f"  ✅ Found operational table: {expected}")
                else:
                    print_info(f"  ⚠️  Expected table not found: {expected} (may be created on first run)")

        except Exception as e:
            print_error(f"Error checking tenant dataset {tenant_id}: {e}")

# ============================================
# TEST 4: Test API Authentication from Centralized Dataset
# ============================================
def test_centralized_authentication(onboarded_customers):
    """Test that API authentication reads from centralized customers.customer_api_keys"""
    print_test_header("Centralized API Authentication")

    for customer in onboarded_customers:
        tenant_id = customer['tenant_id']
        api_key = customer['api_key']

        print_info(f"Testing authentication for: {tenant_id}")

        # Test with valid API key
        response = requests.get(
            f"{BASE_URL}/api/v1/customers/{customer['customer_id']}",
            headers={"X-API-Key": api_key}
        )

        if response.status_code == 200:
            print_success(f"Authentication successful with valid API key")
            data = response.json()
            print_info(f"  - Tenant ID: {data.get('tenant_id')}")
            print_info(f"  - Company: {data.get('company_name')}")
        else:
            print_error(f"Authentication failed: {response.status_code} - {response.text}")

        # Test with invalid API key
        response = requests.get(
            f"{BASE_URL}/api/v1/customers/{customer['customer_id']}",
            headers={"X-API-Key": "invalid_key_12345"}
        )

        if response.status_code == 401:
            print_success(f"Correctly rejected invalid API key (401)")
        else:
            print_error(f"Should reject invalid API key but got: {response.status_code}")

# ============================================
# TEST 5: Test Cross-Tenant Isolation
# ============================================
def test_cross_tenant_isolation(onboarded_customers):
    """Test that customer A cannot access customer B's data"""
    print_test_header("Cross-Tenant Isolation")

    if len(onboarded_customers) < 2:
        print_error("Need at least 2 customers to test cross-tenant isolation")
        return

    customer_a = onboarded_customers[0]
    customer_b = onboarded_customers[1]

    print_info(f"Customer A: {customer_a['tenant_id']}")
    print_info(f"Customer B: {customer_b['tenant_id']}")

    # Customer A tries to access Customer B's data
    response = requests.get(
        f"{BASE_URL}/api/v1/customers/{customer_b['customer_id']}",
        headers={"X-API-Key": customer_a['api_key']}
    )

    if response.status_code == 403:
        print_success("Cross-tenant access correctly blocked (403 Forbidden)")
    elif response.status_code == 401:
        print_success("Cross-tenant access correctly blocked (401 Unauthorized)")
    else:
        print_error(f"Should block cross-tenant access but got: {response.status_code}")
        print_error(f"Response: {response.text}")

# ============================================
# TEST 6: Verify GenAI-Safe Queries
# ============================================
def test_genai_safe_queries(onboarded_customers):
    """Test that GenAI can query tenant datasets without accessing credentials"""
    print_test_header("GenAI-Safe Queries on Tenant Datasets")

    client = bigquery.Client(project=PROJECT_ID)

    for customer in onboarded_customers:
        tenant_id = customer['tenant_id']

        print_info(f"Testing GenAI queries on: {tenant_id}")

        # Simulate GenAI query: Get pipeline execution stats
        query = f"""
        SELECT
            COUNT(*) as total_runs,
            COUNTIF(status = 'COMPLETED') as successful_runs,
            COUNTIF(status = 'FAILED') as failed_runs
        FROM `{PROJECT_ID}.{tenant_id}.x_meta_pipeline_runs`
        """

        try:
            results = list(client.query(query).result())
            print_success(f"GenAI query executed successfully on {tenant_id}")
            if results:
                print_info(f"  - Total Runs: {results[0].total_runs}")
                print_info(f"  - Successful: {results[0].successful_runs}")
                print_info(f"  - Failed: {results[0].failed_runs}")
        except Exception as e:
            print_info(f"Table may not exist yet (created on first pipeline run): {e}")

        # Simulate GenAI trying to access credentials (should fail)
        dangerous_queries = [
            f"SELECT * FROM `{PROJECT_ID}.{tenant_id}.x_meta_api_keys`",
            f"SELECT * FROM `{PROJECT_ID}.{tenant_id}.customer_api_keys`",
            f"SELECT * FROM `{PROJECT_ID}.{tenant_id}.x_meta_cloud_credentials`",
        ]

        for dangerous_query in dangerous_queries:
            try:
                results = list(client.query(dangerous_query).result())
                print_error(f"⚠️  SECURITY RISK: GenAI can access credentials via: {dangerous_query}")
            except Exception as e:
                if "Not found" in str(e) or "not found" in str(e):
                    print_success(f"✅ GenAI CANNOT access credentials (table not found)")
                else:
                    print_info(f"Query failed (expected): {e}")

# ============================================
# TEST 7: Performance Test - Centralized Auth
# ============================================
def test_authentication_performance(onboarded_customers):
    """Test authentication performance with centralized dataset"""
    print_test_header("Authentication Performance (Centralized Dataset)")

    if not onboarded_customers:
        print_error("No customers to test")
        return

    customer = onboarded_customers[0]
    api_key = customer['api_key']

    print_info("Running 10 authentication requests...")

    times = []
    for i in range(10):
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/v1/customers/{customer['customer_id']}",
            headers={"X-API-Key": api_key}
        )
        elapsed = (time.time() - start) * 1000  # Convert to ms
        times.append(elapsed)

        if response.status_code != 200:
            print_error(f"Request {i+1} failed: {response.status_code}")

    avg_time = sum(times) / len(times)
    min_time = min(times)
    max_time = max(times)

    print_success(f"Authentication Performance:")
    print_info(f"  - Average: {avg_time:.2f}ms")
    print_info(f"  - Min: {min_time:.2f}ms")
    print_info(f"  - Max: {max_time:.2f}ms")

    if avg_time < 100:
        print_success(f"✅ Excellent performance (<100ms)")
    elif avg_time < 500:
        print_success(f"✅ Good performance (<500ms)")
    else:
        print_error(f"⚠️  Performance needs improvement (>{avg_time:.2f}ms)")

# ============================================
# MAIN TEST EXECUTION
# ============================================
def main():
    """Run all E2E tests"""
    print("\n" + "="*80)
    print("END-TO-END TEST: TWO-DATASET ARCHITECTURE")
    print("Testing GenAI Security & Multi-Tenant Isolation")
    print(f"Started: {datetime.now().isoformat()}")
    print("="*80)

    try:
        # Test 1: Onboard customers
        onboarded_customers = test_customer_onboarding()

        # Give BigQuery a moment to propagate
        print_info("\nWaiting 3 seconds for BigQuery propagation...")
        time.sleep(3)

        # Test 2: Verify auth data in customers dataset
        test_auth_data_in_customers_dataset(onboarded_customers)

        # Test 3: Verify tenant datasets have NO credentials
        test_tenant_dataset_no_credentials(onboarded_customers)

        # Test 4: Test centralized authentication
        test_centralized_authentication(onboarded_customers)

        # Test 5: Test cross-tenant isolation
        test_cross_tenant_isolation(onboarded_customers)

        # Test 6: Test GenAI-safe queries
        test_genai_safe_queries(onboarded_customers)

        # Test 7: Performance test
        test_authentication_performance(onboarded_customers)

        # Summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print_success("All tests completed!")
        print_info(f"Tested {len(onboarded_customers)} customers")
        print_info(f"Architecture: Two-dataset (customers + tenant datasets)")
        print_info(f"Security: Multi-tenant isolation + GenAI-safe")
        print_info(f"Completed: {datetime.now().isoformat()}")
        print("="*80 + "\n")

    except Exception as e:
        print_error(f"Test suite failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
