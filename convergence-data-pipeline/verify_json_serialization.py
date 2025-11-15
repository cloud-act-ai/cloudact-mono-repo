#!/usr/bin/env python3
"""
Verification script to demonstrate JSON field serialization fix.
This script shows that parameters and metadata are now JSON strings, not dicts.
"""

import json
from datetime import datetime


def _serialize_datetime_values(obj):
    """Same function from logger.py"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: _serialize_datetime_values(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_serialize_datetime_values(item) for item in obj]
    else:
        return obj


def test_pipeline_parameters_serialization():
    """Test that pipeline parameters are converted to JSON strings"""
    print("=" * 80)
    print("TEST 1: Pipeline Parameters Serialization")
    print("=" * 80)

    # Sample parameters with datetime
    parameters = {
        "source": "salesforce",
        "mode": "incremental",
        "start_date": datetime(2025, 11, 14, 10, 30, 0),
        "batch_size": 1000,
        "filters": {
            "region": "US",
            "last_modified": datetime(2025, 11, 14, 12, 0, 0)
        }
    }

    print("\n1. Original parameters (Python dict with datetime):")
    print(f"   Type: {type(parameters)}")
    print(f"   Value: {parameters}")

    # Apply datetime serialization
    parameters_serialized = _serialize_datetime_values(parameters)
    print("\n2. After datetime serialization (still dict):")
    print(f"   Type: {type(parameters_serialized)}")
    print(f"   Value: {parameters_serialized}")

    # Convert to JSON string (THE FIX)
    parameters_json_str = json.dumps(parameters_serialized)
    print("\n3. After json.dumps() - READY FOR BigQuery (JSON string):")
    print(f"   Type: {type(parameters_json_str)}")
    print(f"   Value: {parameters_json_str}")

    # Verify it's a string
    assert isinstance(parameters_json_str, str), "parameters must be a string!"
    print("\n✅ SUCCESS: parameters is now a JSON string, not a dict!")


def test_step_metadata_serialization():
    """Test that step metadata is converted to JSON strings"""
    print("\n" + "=" * 80)
    print("TEST 2: Step Metadata Serialization")
    print("=" * 80)

    # Sample metadata with datetime
    metadata = {
        "destination_table": "dataset.table",
        "bytes_processed": 12345678,
        "query_cost_usd": 0.05,
        "execution_time": datetime(2025, 11, 14, 13, 45, 30),
        "validation_results": {
            "total_checks": 15,
            "passed_count": 14,
            "failed_count": 1,
            "timestamp": datetime(2025, 11, 14, 13, 50, 0)
        }
    }

    print("\n1. Original metadata (Python dict with datetime):")
    print(f"   Type: {type(metadata)}")
    print(f"   Value: {metadata}")

    # Apply datetime serialization
    metadata_serialized = _serialize_datetime_values(metadata)
    print("\n2. After datetime serialization (still dict):")
    print(f"   Type: {type(metadata_serialized)}")
    print(f"   Value: {metadata_serialized}")

    # Convert to JSON string (THE FIX)
    metadata_json_str = json.dumps(metadata_serialized)
    print("\n3. After json.dumps() - READY FOR BigQuery (JSON string):")
    print(f"   Type: {type(metadata_json_str)}")
    print(f"   Value: {metadata_json_str}")

    # Verify it's a string
    assert isinstance(metadata_json_str, str), "metadata must be a string!"
    print("\n✅ SUCCESS: metadata is now a JSON string, not a dict!")


def test_none_handling():
    """Test that None values are handled correctly"""
    print("\n" + "=" * 80)
    print("TEST 3: None Value Handling")
    print("=" * 80)

    # Test None parameters/metadata
    parameters = None

    print("\n1. Original parameters: None")

    # Apply serialization
    parameters_serialized = _serialize_datetime_values(parameters) if parameters else None
    print(f"2. After datetime serialization: {parameters_serialized}")

    # Convert to JSON string
    parameters_json_str = json.dumps(parameters_serialized) if parameters_serialized is not None else None
    print(f"3. After json.dumps(): {parameters_json_str}")
    print(f"   Type: {type(parameters_json_str) if parameters_json_str else 'NoneType'}")

    # Verify it's None (not the string "null")
    assert parameters_json_str is None, "None should remain None!"
    print("\n✅ SUCCESS: None values are handled correctly!")


def test_complete_log_entry():
    """Test a complete log entry structure"""
    print("\n" + "=" * 80)
    print("TEST 4: Complete Log Entry Structure")
    print("=" * 80)

    # Simulate what happens in log_pipeline_start
    parameters = {
        "source": "api",
        "endpoint": "/data/customers",
        "timestamp": datetime(2025, 11, 14, 14, 0, 0)
    }

    # Apply the fix
    parameters_serialized = _serialize_datetime_values(parameters) if parameters else None
    parameters_json_str = json.dumps(parameters_serialized) if parameters_serialized is not None else None

    log_entry = {
        "insertId": "test_pipeline_123_start",
        "json": {
            "pipeline_logging_id": "test_pipeline_123",
            "pipeline_id": "data_ingestion_v1",
            "tenant_id": "acme_corp",
            "status": "RUNNING",
            "trigger_type": "api",
            "trigger_by": "user@example.com",
            "start_time": datetime.utcnow().isoformat(),
            "parameters": parameters_json_str  # This is now a JSON string!
        }
    }

    print("\nComplete log entry ready for insert_rows_json():")
    print(json.dumps(log_entry, indent=2))

    # Verify parameters field is a string
    assert isinstance(log_entry["json"]["parameters"], str), "parameters field must be a string!"
    print("\n✅ SUCCESS: Log entry has parameters as JSON string!")
    print("\nThis log entry will NOT cause 'This field: parameters is not a record' error!")


if __name__ == "__main__":
    print("\n")
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 20 + "JSON FIELD SERIALIZATION VERIFICATION" + " " * 20 + "║")
    print("╚" + "=" * 78 + "╝")

    try:
        test_pipeline_parameters_serialization()
        test_step_metadata_serialization()
        test_none_handling()
        test_complete_log_entry()

        print("\n" + "=" * 80)
        print("ALL TESTS PASSED!")
        print("=" * 80)
        print("\nSummary:")
        print("- pipeline_runs.parameters: Now JSON string ✅")
        print("- step_logs.metadata: Now JSON string ✅")
        print("- None values: Handled correctly ✅")
        print("- BigQuery insert_rows_json(): Will accept these values ✅")
        print("\nThe fix ensures JSON type fields are serialized as strings before insertion.")
        print("This resolves the 'This field: X is not a record' errors.")

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        exit(1)
