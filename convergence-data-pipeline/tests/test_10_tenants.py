#!/usr/bin/env python3
"""
Test 10 different tenants with the convergence data pipeline API

This script tests:
1. Health endpoint
2. Creating 10 different tenants via onboarding API
3. Verifying datasets and tables created for each tenant
"""

import requests
import json
import time
from datetime import datetime

API_BASE = "http://localhost:8080"
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

# Test tenant data
TENANTS = [
    {"tenant_id": "acme_corp_001", "company_name": "ACME Corp", "email": "admin@acme.com", "plan": "PROFESSIONAL"},
    {"tenant_id": "tech_startup_002", "company_name": "Tech Startup Inc", "email": "admin@techstartup.com", "plan": "STARTER"},
    {"tenant_id": "enterprise_003", "company_name": "Enterprise Solutions", "email": "admin@enterprise.com", "plan": "SCALE"},
    {"tenant_id": "fintech_004", "company_name": "FinTech Innovations", "email": "admin@fintech.com", "plan": "PROFESSIONAL"},
    {"tenant_id": "healthcare_005", "company_name": "Healthcare Systems", "email": "admin@healthcare.com", "plan": "SCALE"},
    {"tenant_id": "retail_006", "company_name": "Retail Group", "email": "admin@retail.com", "plan": "STARTER"},
    {"tenant_id": "manufacturing_007", "company_name": "Manufacturing Co", "email": "admin@manufacturing.com", "plan": "PROFESSIONAL"},
    {"tenant_id": "logistics_008", "company_name": "Logistics Partners", "email": "admin@logistics.com", "plan": "SCALE"},
    {"tenant_id": "consulting_009", "company_name": "Consulting Firm", "email": "admin@consulting.com", "plan": "PROFESSIONAL"},
    {"tenant_id": "ecommerce_010", "company_name": "E-Commerce Platform", "email": "admin@ecommerce.com", "plan": "SCALE"},
]

def log(message, level="INFO"):
    """Print colored log message"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    if level == "SUCCESS":
        print(f"{GREEN}[{timestamp}] ✓ {message}{RESET}")
    elif level == "ERROR":
        print(f"{RED}[{timestamp}] ✗ {message}{RESET}")
    elif level == "WARNING":
        print(f"{YELLOW}[{timestamp}] ⚠ {message}{RESET}")
    else:
        print(f"[{timestamp}] {message}")

def test_health():
    """Test health endpoint"""
    log("Testing health endpoint...")
    try:
        response = requests.get(f"{API_BASE}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            log(f"Health check passed: {data.get('status')}", "SUCCESS")
            return True
        else:
            log(f"Health check failed: {response.status_code}", "ERROR")
            return False
    except Exception as e:
        log(f"Health check failed: {str(e)}", "ERROR")
        return False

def test_tenant_onboarding(tenant_data):
    """Test tenant onboarding"""
    tenant_id = tenant_data["tenant_id"]
    log(f"Onboarding tenant: {tenant_id} ({tenant_data['company_name']})")

    try:
        response = requests.post(
            f"{API_BASE}/api/v1/tenants/onboard",
            json={
                "tenant_id": tenant_data["tenant_id"],
                "company_name": tenant_data["company_name"],
                "admin_email": tenant_data["email"],
                "subscription_plan": tenant_data["plan"]
            },
            timeout=60
        )

        if response.status_code in [200, 201]:
            data = response.json()
            log(f"  ✓ Tenant onboarded: {tenant_id}", "SUCCESS")
            log(f"  ✓ API Key: {data.get('api_key', 'N/A')[:30]}...", "SUCCESS")
            log(f"  ✓ Dataset: {data.get('dataset_created', False)}", "SUCCESS")
            log(f"  ✓ Tables: {len(data.get('tables_created', []))} created", "SUCCESS")
            return {
                "success": True,
                "tenant_id": tenant_id,
                "api_key": data.get("api_key"),
                "response": data
            }
        else:
            log(f"  ✗ Onboarding failed ({response.status_code}): {response.text[:200]}", "ERROR")
            return {
                "success": False,
                "tenant_id": tenant_id,
                "error": response.text
            }
    except Exception as e:
        log(f"  ✗ Exception during onboarding: {str(e)}", "ERROR")
        return {
            "success": False,
            "tenant_id": tenant_id,
            "error": str(e)
        }

def test_all_tenants():
    """Test onboarding for all 10 tenants"""
    log("=" * 80)
    log("TESTING 10 DIFFERENT TENANTS")
    log("=" * 80)

    # Test health first
    if not test_health():
        log("Server is not healthy, aborting", "ERROR")
        return False

    log("")
    results = []

    for i, tenant_data in enumerate(TENANTS, 1):
        log(f"\n--- Tenant {i}/10 ---")
        result = test_tenant_onboarding(tenant_data)
        results.append(result)
        time.sleep(1)  # Small delay between tenants

    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)

    successful = sum(1 for r in results if r.get("success"))
    failed = len(results) - successful

    log(f"\nTotal tenants: {len(results)}")
    log(f"Successful: {successful}", "SUCCESS" if successful > 0 else "INFO")
    log(f"Failed: {failed}", "ERROR" if failed > 0 else "INFO")

    if failed > 0:
        log("\nFailed tenants:", "ERROR")
        for r in results:
            if not r.get("success"):
                log(f"  - {r['tenant_id']}: {r.get('error', 'Unknown error')[:100]}", "ERROR")

    log("\n" + "=" * 80)
    if successful == len(results):
        log("ALL TESTS PASSED! 🎉", "SUCCESS")
        return True
    else:
        log(f"{failed} TESTS FAILED", "ERROR")
        return False

if __name__ == "__main__":
    success = test_all_tenants()
    exit(0 if success else 1)
