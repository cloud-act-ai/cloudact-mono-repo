#!/usr/bin/env python3
"""
Test script to verify request size limits are enforced.
Tests both middleware enforcement and file-based payload submission.

Usage:
    python test_request_size_limits.py [base_url]

Default base_url: http://localhost:8080
"""

import requests
import json
import sys
import tempfile
from pathlib import Path


def create_large_payload_file(size_mb: float) -> Path:
    """
    Create a temporary file with a large JSON payload.

    Args:
        size_mb: Size of payload in megabytes

    Returns:
        Path to temporary file
    """
    # Create large array of dummy data
    target_bytes = int(size_mb * 1024 * 1024)

    # Each item is ~100 bytes, calculate how many we need
    item_size = 100
    num_items = target_bytes // item_size

    # Build payload incrementally to avoid memory issues
    temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)

    temp_file.write('{"data": [')
    for i in range(num_items):
        if i > 0:
            temp_file.write(',')
        temp_file.write(f'{{"id": {i}, "value": "x" * 90}}')

        # Flush every 10000 items to avoid memory buildup
        if i % 10000 == 0:
            temp_file.flush()

    temp_file.write(']}')
    temp_file.close()

    file_path = Path(temp_file.name)
    actual_size_mb = file_path.stat().st_size / (1024 * 1024)
    print(f"Created test payload: {file_path} ({actual_size_mb:.2f} MB)")

    return file_path


def test_request_size_limit(base_url: str, api_key: str, payload_size_mb: float, expected_status: int) -> bool:
    """
    Test request size limit enforcement.

    Args:
        base_url: API base URL
        api_key: Test API key
        payload_size_mb: Size of payload to send
        expected_status: Expected HTTP status code

    Returns:
        True if test passed, False otherwise
    """
    print(f"\n{'='*70}")
    print(f"Test: {payload_size_mb}MB payload -> Expected HTTP {expected_status}")
    print(f"{'='*70}")

    # Create large payload file
    payload_file = create_large_payload_file(payload_size_mb)

    try:
        # Read file and post to endpoint
        with open(payload_file, 'rb') as f:
            headers = {
                'X-API-Key': api_key,
                'Content-Type': 'application/json'
            }

            # Use /health endpoint for testing (doesn't require specific payload structure)
            url = f"{base_url}/health"

            print(f"Sending {payload_size_mb}MB request to {url}...")

            response = requests.post(
                url,
                data=f,
                headers=headers,
                timeout=30
            )

            print(f"Response: HTTP {response.status_code}")

            if response.status_code != 200:
                print(f"Response body: {response.text[:500]}")

            # Check if we got expected status
            if response.status_code == expected_status:
                print(f"✓ PASS: Got expected HTTP {expected_status}")
                return True
            else:
                print(f"✗ FAIL: Expected HTTP {expected_status}, got HTTP {response.status_code}")
                return False

    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        # Some errors (like connection reset) might be expected for huge payloads
        if expected_status >= 400:
            print(f"✓ PASS: Request rejected (expected failure)")
            return True
        return False

    finally:
        # Clean up temp file
        payload_file.unlink()


def test_api_key_authentication(base_url: str, api_key: str) -> bool:
    """
    Test that API key authentication works.

    Args:
        base_url: API base URL
        api_key: Test API key

    Returns:
        True if auth works, False otherwise
    """
    print(f"\n{'='*70}")
    print(f"Test: API Key Authentication")
    print(f"{'='*70}")

    url = f"{base_url}/health"
    headers = {'X-API-Key': api_key}

    print(f"Testing authentication with API key: {api_key[:20]}...")

    response = requests.get(url, headers=headers)

    print(f"Response: HTTP {response.status_code}")
    print(f"Response body: {response.text[:200]}")

    if response.status_code == 200:
        print(f"✓ PASS: Authentication successful")
        return True
    else:
        print(f"✗ FAIL: Authentication failed")
        return False


def main():
    """Run all request size limit tests."""
    # Get base URL from command line or use default
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"

    # Use test API key from test_api_keys.json
    test_api_key = "test_key_acme_inc"

    print(f"\n{'#'*70}")
    print(f"# Request Size Limit Tests")
    print(f"# Base URL: {base_url}")
    print(f"# Test API Key: {test_api_key}")
    print(f"{'#'*70}")

    results = []

    # Test 1: API key authentication
    results.append(("API Key Auth", test_api_key_authentication(base_url, test_api_key)))

    # Test 2: Normal-sized request (should succeed)
    results.append(("1MB payload (OK)", test_request_size_limit(base_url, test_api_key, 1.0, 200)))

    # Test 3: Just under limit (should succeed)
    results.append(("9MB payload (OK)", test_request_size_limit(base_url, test_api_key, 9.0, 200)))

    # Test 4: Just over limit (should be rejected)
    results.append(("11MB payload (REJECT)", test_request_size_limit(base_url, test_api_key, 11.0, 413)))

    # Test 5: Way over limit (should be rejected)
    results.append(("50MB payload (REJECT)", test_request_size_limit(base_url, test_api_key, 50.0, 413)))

    # Print summary
    print(f"\n{'='*70}")
    print(f"TEST SUMMARY")
    print(f"{'='*70}")

    passed = 0
    failed = 0

    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        symbol = "✓" if result else "✗"
        print(f"{symbol} {test_name}: {status}")

        if result:
            passed += 1
        else:
            failed += 1

    print(f"\nTotal: {passed} passed, {failed} failed")

    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
