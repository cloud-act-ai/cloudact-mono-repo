#!/usr/bin/env python3
"""
Test BigQuery Schema Validation

This script validates that BigQuery table schemas match expected configurations.

Features:
1. Loads schema definitions from tests/configs/schemas/schema_validation_config.json
2. Queries BigQuery INFORMATION_SCHEMA to get actual table schemas
3. Validates:
   - All required fields exist
   - Data types match
   - Field modes match (REQUIRED, NULLABLE, REPEATED)
   - Field descriptions are present
4. Logs results to temp folder

Usage:
    # Validate central tenants dataset tables
    python tests/test_config_schema_validation.py

    # Validate specific tenant dataset tables
    python tests/test_config_schema_validation.py --tenant-id guru_test_001

    # Validate all (central + test tenants)
    python tests/test_config_schema_validation.py --all

    # Verbose output
    python tests/test_config_schema_validation.py --verbose
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from google.cloud import bigquery


class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color


class SchemaValidator:
    """Validates BigQuery table schemas against expected configurations."""

    def __init__(self, config_path: str):
        """Initialize validator with config file."""
        self.config_path = Path(config_path)
        self.config = self._load_config()
        self.project_id = self.config['project_id']
        self.central_dataset = self.config['central_dataset']
        self.test_settings = self.config['test_settings']
        self.client = bigquery.Client(project=self.project_id)

        # Setup logging
        self.log_dir = Path(self.test_settings['temp_log_dir'])
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / f"schema_validation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

        # Validation results
        self.results = {
            'total_tables': 0,
            'passed': 0,
            'failed': 0,
            'errors': []
        }

    def _load_config(self) -> Dict:
        """Load configuration from JSON file."""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, 'r') as f:
            return json.load(f)

    def _log(self, message: str, level: str = "INFO"):
        """Log message to file and optionally to console."""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] [{level}] {message}"

        if self.test_settings['log_to_file']:
            with open(self.log_file, 'a') as f:
                f.write(log_entry + '\n')

    def _get_table_schema(self, dataset_id: str, table_id: str) -> Optional[List[Dict]]:
        """
        Query INFORMATION_SCHEMA to get actual table schema.

        Returns list of field definitions or None if table doesn't exist.
        """
        query = f"""
        SELECT
            column_name,
            data_type,
            is_nullable,
            description
        FROM `{self.project_id}.{dataset_id}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = '{table_id}'
        ORDER BY ordinal_position
        """

        try:
            query_job = self.client.query(query)
            results = list(query_job.result())

            if not results:
                return None

            # Convert to expected format
            schema_fields = []
            for row in results:
                field = {
                    'name': row.column_name,
                    'type': row.data_type,
                    'mode': 'NULLABLE' if row.is_nullable == 'YES' else 'REQUIRED',
                    'description': row.description or ''
                }
                schema_fields.append(field)

            return schema_fields

        except Exception as e:
            self._log(f"Error querying schema for {dataset_id}.{table_id}: {e}", "ERROR")
            return None

    def _validate_field(
        self,
        expected_field: Dict,
        actual_fields: List[Dict],
        table_name: str
    ) -> Tuple[bool, List[str]]:
        """
        Validate a single field against actual schema.

        Returns (is_valid, list_of_errors)
        """
        errors = []
        field_name = expected_field['name']

        # Find field in actual schema
        actual_field = next(
            (f for f in actual_fields if f['name'] == field_name),
            None
        )

        if not actual_field:
            errors.append(f"Field '{field_name}' not found in table {table_name}")
            return False, errors

        # Validate data type
        if self.test_settings['verify_data_types']:
            expected_type = expected_field['type']
            actual_type = actual_field['type']

            # Handle type variations (e.g., INT64 vs INTEGER)
            type_aliases = {
                'INTEGER': ['INT64', 'INTEGER'],
                'FLOAT': ['FLOAT64', 'FLOAT'],
                'BOOLEAN': ['BOOL', 'BOOLEAN']
            }

            types_match = False
            if expected_type in type_aliases:
                types_match = actual_type in type_aliases[expected_type]
            else:
                types_match = expected_type == actual_type

            if not types_match:
                errors.append(
                    f"Field '{field_name}' type mismatch: "
                    f"expected {expected_type}, got {actual_type}"
                )

        # Validate mode (REQUIRED/NULLABLE/REPEATED)
        if self.test_settings['verify_modes']:
            expected_mode = expected_field['mode']
            actual_mode = actual_field['mode']

            if expected_mode != actual_mode:
                errors.append(
                    f"Field '{field_name}' mode mismatch: "
                    f"expected {expected_mode}, got {actual_mode}"
                )

        # Validate description exists
        if self.test_settings['verify_descriptions']:
            if not actual_field.get('description', '').strip():
                errors.append(f"Field '{field_name}' missing description")

        return len(errors) == 0, errors

    def validate_table(
        self,
        dataset_id: str,
        table_id: str,
        expected_fields: List[Dict],
        description: str = ""
    ) -> Tuple[bool, List[str]]:
        """
        Validate a single table's schema.

        Returns (is_valid, list_of_errors)
        """
        self.results['total_tables'] += 1
        errors = []

        self._log(f"Validating {dataset_id}.{table_id}...", "INFO")

        # Get actual schema
        actual_fields = self._get_table_schema(dataset_id, table_id)

        if actual_fields is None:
            errors.append(f"Table {dataset_id}.{table_id} does not exist")
            self.results['failed'] += 1
            self.results['errors'].extend(errors)
            return False, errors

        # Validate each expected field
        for expected_field in expected_fields:
            field_valid, field_errors = self._validate_field(
                expected_field,
                actual_fields,
                f"{dataset_id}.{table_id}"
            )

            if not field_valid:
                errors.extend(field_errors)

        # Record results
        if errors:
            self.results['failed'] += 1
            self.results['errors'].extend(errors)
            self._log(f"FAILED: {dataset_id}.{table_id} - {len(errors)} errors", "ERROR")
            return False, errors
        else:
            self.results['passed'] += 1
            self._log(f"PASSED: {dataset_id}.{table_id}", "INFO")
            return True, []

    def validate_central_tables(self, verbose: bool = False) -> Dict:
        """Validate all central tenants dataset tables."""
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print(f"{Colors.BLUE}Validating Central Dataset Tables{Colors.NC}")
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print()

        central_tables = self.config['central_tables']

        for table_id, table_config in central_tables.items():
            print(f"{Colors.CYAN}Validating {self.central_dataset}.{table_id}...{Colors.NC}")

            is_valid, errors = self.validate_table(
                dataset_id=self.central_dataset,
                table_id=table_id,
                expected_fields=table_config['required_fields'],
                description=table_config['description']
            )

            if is_valid:
                print(f"{Colors.GREEN}✓ PASSED{Colors.NC}")
            else:
                print(f"{Colors.RED}✗ FAILED{Colors.NC}")
                if verbose:
                    for error in errors:
                        print(f"  {Colors.RED}- {error}{Colors.NC}")
            print()

        return self.results

    def validate_tenant_tables(self, tenant_id: str, verbose: bool = False) -> Dict:
        """Validate tables in a specific tenant dataset."""
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print(f"{Colors.BLUE}Validating Tenant Dataset: {tenant_id}{Colors.NC}")
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print()

        per_tenant_tables = self.config['per_tenant_tables']

        # Check if tenant dataset exists
        try:
            self.client.get_dataset(tenant_id)
        except Exception as e:
            print(f"{Colors.RED}✗ Tenant dataset '{tenant_id}' does not exist{Colors.NC}")
            self._log(f"Tenant dataset {tenant_id} not found: {e}", "ERROR")
            return self.results

        for table_id, table_config in per_tenant_tables.items():
            print(f"{Colors.CYAN}Validating {tenant_id}.{table_id}...{Colors.NC}")

            is_valid, errors = self.validate_table(
                dataset_id=tenant_id,
                table_id=table_id,
                expected_fields=table_config['required_fields'],
                description=table_config['description']
            )

            if is_valid:
                print(f"{Colors.GREEN}✓ PASSED{Colors.NC}")
            else:
                print(f"{Colors.RED}✗ FAILED{Colors.NC}")
                if verbose:
                    for error in errors:
                        print(f"  {Colors.RED}- {error}{Colors.NC}")
            print()

        return self.results

    def validate_all_test_tenants(self, verbose: bool = False) -> Dict:
        """Validate all test tenant datasets."""
        test_tenants = self.config.get('test_tenants', [])

        if not test_tenants:
            print(f"{Colors.YELLOW}No test tenants configured{Colors.NC}")
            return self.results

        for tenant_id in test_tenants:
            self.validate_tenant_tables(tenant_id, verbose)

        return self.results

    def print_summary(self):
        """Print validation summary."""
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print(f"{Colors.BLUE}Validation Summary{Colors.NC}")
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print()

        print(f"Total Tables Validated: {self.results['total_tables']}")
        print(f"{Colors.GREEN}Passed: {self.results['passed']}{Colors.NC}")
        print(f"{Colors.RED}Failed: {self.results['failed']}{Colors.NC}")
        print()

        if self.results['errors']:
            print(f"{Colors.RED}Errors ({len(self.results['errors'])}):  {Colors.NC}")
            for error in self.results['errors']:
                print(f"  - {error}")
            print()

        print(f"Log file: {self.log_file}")
        print()

        if self.results['failed'] == 0:
            print(f"{Colors.GREEN}{'=' * 80}{Colors.NC}")
            print(f"{Colors.GREEN}✓ All schema validations passed!{Colors.NC}")
            print(f"{Colors.GREEN}{'=' * 80}{Colors.NC}")
        else:
            print(f"{Colors.RED}{'=' * 80}{Colors.NC}")
            print(f"{Colors.RED}✗ Schema validation failed!{Colors.NC}")
            print(f"{Colors.RED}{'=' * 80}{Colors.NC}")


def main():
    """Main test function."""
    parser = argparse.ArgumentParser(
        description="Validate BigQuery table schemas against expected configurations"
    )
    parser.add_argument(
        '--tenant-id',
        type=str,
        help='Validate specific tenant dataset tables'
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Validate central tables and all test tenant tables'
    )
    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Show detailed error messages'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='tests/configs/schemas/schema_validation_config.json',
        help='Path to schema validation config file'
    )

    args = parser.parse_args()

    # Determine config file path (relative to project root)
    project_root = Path(__file__).parent.parent
    config_path = project_root / args.config

    # Initialize validator
    validator = SchemaValidator(str(config_path))

    # Run validation based on arguments
    if args.all:
        # Validate central tables
        validator.validate_central_tables(verbose=args.verbose)
        # Validate all test tenants
        validator.validate_all_test_tenants(verbose=args.verbose)
    elif args.tenant_id:
        # Validate specific tenant
        validator.validate_tenant_tables(args.tenant_id, verbose=args.verbose)
    else:
        # Default: validate central tables only
        validator.validate_central_tables(verbose=args.verbose)

    # Print summary
    validator.print_summary()

    # Exit with appropriate code
    sys.exit(0 if validator.results['failed'] == 0 else 1)


if __name__ == "__main__":
    main()
