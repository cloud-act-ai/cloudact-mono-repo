#!/usr/bin/env python3
"""
Test Tenant Onboarding Processor
Tests the tenant onboarding processor that creates tenant datasets and metadata tables.

Usage:
    # Onboard test tenant
    python tests/test_onboarding_processor.py

    # Onboard specific tenant
    python tests/test_onboarding_processor.py --tenant-id my_tenant
"""

import asyncio
import sys
import argparse
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.processors.setup.tenants.onboarding import TenantOnboardingProcessor


class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color


async def test_onboarding(tenant_id: str):
    """
    Test the tenant onboarding processor.

    Args:
        tenant_id: Tenant identifier to onboard
    """
    print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
    print(f"{Colors.BLUE}Tenant Onboarding Processor Test{Colors.NC}")
    print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
    print()

    print(f"{Colors.BLUE}Tenant ID: {tenant_id}{Colors.NC}")
    print()

    try:
        # Initialize processor
        print(f"{Colors.BLUE}Initializing onboarding processor...{Colors.NC}")
        processor = TenantOnboardingProcessor()
        print(f"{Colors.GREEN}✓ Processor initialized{Colors.NC}")
        print()

        # Execute onboarding
        print(f"{Colors.BLUE}Executing onboarding for {tenant_id}...{Colors.NC}")

        # Step config with metadata tables to create
        step_config = {
            "config": {
                "dataset_id": tenant_id,
                "location": "US",
                "metadata_tables": [],
                "create_validation_table": True,
                "validation_table_name": "onboarding_validation_test",
                "default_daily_limit": 25,
                "default_monthly_limit": 750,
                "default_concurrent_limit": 3
            }
        }

        context = {
            "tenant_id": tenant_id
        }

        result = await processor.execute(
            step_config=step_config,
            context=context
        )

        # Print results
        print()
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print(f"{Colors.BLUE}Onboarding Results{Colors.NC}")
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print()

        if result['status'] in ['SUCCESS', 'PARTIAL']:
            print(f"{Colors.GREEN}✓ Status: {result['status']}{Colors.NC}")
            print()
            print(f"Tenant ID: {result['tenant_id']}")
            print(f"Dataset ID: {result['dataset_id']}")
            print(f"Dataset created: {result['dataset_created']}")
            print()

            if result['tables_created']:
                print(f"{Colors.GREEN}Tables created ({len(result['tables_created'])}):  {Colors.NC}")
                for table in result['tables_created']:
                    print(f"  ✓ {table}")
                print()
            else:
                print(f"{Colors.BLUE}No tables created (using central tenants dataset for metadata){Colors.NC}")
                print()

            if result.get('tables_failed'):
                print(f"{Colors.RED}Tables failed ({len(result['tables_failed'])}):  {Colors.NC}")
                for table in result['tables_failed']:
                    print(f"  ✗ {table}")
                print()

            print(f"{Colors.GREEN}{'=' * 80}{Colors.NC}")
            print(f"{Colors.GREEN}✓ Onboarding completed successfully!{Colors.NC}")
            print(f"{Colors.GREEN}{'=' * 80}{Colors.NC}")
            return True

        else:
            print(f"{Colors.RED}✗ Status: {result['status']}{Colors.NC}")
            if 'error' in result:
                print(f"{Colors.RED}Error: {result['error']}{Colors.NC}")
            print(f"{Colors.RED}Onboarding failed!{Colors.NC}")
            return False

    except Exception as e:
        print()
        print(f"{Colors.RED}{'=' * 80}{Colors.NC}")
        print(f"{Colors.RED}✗ Onboarding failed with exception{Colors.NC}")
        print(f"{Colors.RED}{'=' * 80}{Colors.NC}")
        print(f"{Colors.RED}Error: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main test function."""
    parser = argparse.ArgumentParser(
        description="Test tenant onboarding processor"
    )
    parser.add_argument(
        '--tenant-id',
        default='timpelien_acmered_2343',
        help='Tenant ID to onboard (default: timpelien_acmered_2343)'
    )

    args = parser.parse_args()

    success = asyncio.run(test_onboarding(tenant_id=args.tenant_id))

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
