"""
Manual test script for quota endpoint.
Run this with a real org to verify endpoint works.
"""

import requests
import json

# Test endpoint (assumes server running on port 8000)
BASE_URL = "http://localhost:8000"

def test_quota_endpoint():
    """Test quota endpoint with mock response."""
    # Test with DISABLE_AUTH=true (development mode)
    response = requests.get(
        f"{BASE_URL}/api/v1/organizations/test_org/quota"
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 200:
        data = response.json()
        assert "org_slug" in data
        assert "pipelinesRunToday" in data
        assert "dailyLimit" in data
        assert "pipelinesRunMonth" in data
        assert "monthlyLimit" in data
        assert "concurrentRunning" in data
        assert "concurrentLimit" in data
        print("\n✅ All required fields present!")
    else:
        print(f"\n❌ Error: {response.json().get('detail', 'Unknown error')}")

if __name__ == "__main__":
    test_quota_endpoint()
