#!/usr/bin/env python3
"""
Test Bootstrap Setup
Tests the one-time bootstrap processor that creates central tenants dataset and tables.

Usage:
    # Test in development
    python tests/test_bootstrap_setup.py

    # Test with force recreation (DANGER - deletes data!)
    python tests/test_bootstrap_setup.py --force-tables

    # Complete reset (DANGER - deletes everything!)
    python tests/test_bootstrap_setup.py --force-all
"""

import asyncio
import sys
import argparse
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.processors.setup.initial.onetime_bootstrap_processor import (
    OnetimeBootstrapProcessor
)


class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color


async def test_bootstrap(
    force_recreate_dataset: bool = False,
    force_recreate_tables: bool = False,
    skip_confirmation: bool = False
):
    """
    Test the bootstrap processor.

    Args:
        force_recreate_dataset: Delete and recreate entire dataset
        force_recreate_tables: Delete and recreate all tables
        skip_confirmation: Skip confirmation prompts (use with caution!)
    """
    print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
    print(f"{Colors.BLUE}One-Time Bootstrap Processor Test{Colors.NC}")
    print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
    print()

    if force_recreate_dataset and not skip_confirmation:
        print(f"{Colors.RED}WARNING: force_recreate_dataset=True{Colors.NC}")
        print(f"{Colors.RED}This will DELETE the entire tenants dataset!{Colors.NC}")
        print()
        response = input("Are you sure? Type 'yes' to continue: ")
        if response.lower() != 'yes':
            print("Aborted.")
            return False

    if force_recreate_tables and not skip_confirmation:
        print(f"{Colors.YELLOW}WARNING: force_recreate_tables=True{Colors.NC}")
        print(f"{Colors.YELLOW}This will DELETE all data in tenant tables!{Colors.NC}")
        print()
        response = input("Are you sure? Type 'yes' to continue: ")
        if response.lower() != 'yes':
            print("Aborted.")
            return False

    print(f"{Colors.BLUE}Configuration:{Colors.NC}")
    print(f"  force_recreate_dataset: {force_recreate_dataset}")
    print(f"  force_recreate_tables: {force_recreate_tables}")
    print()

    try:
        # Initialize processor
        print(f"{Colors.BLUE}Initializing bootstrap processor...{Colors.NC}")
        processor = OnetimeBootstrapProcessor()
        print(f"{Colors.GREEN}✓ Processor initialized{Colors.NC}")
        print()

        # Execute bootstrap
        print(f"{Colors.BLUE}Executing bootstrap setup...{Colors.NC}")
        context = {
            'force_recreate_dataset': force_recreate_dataset,
            'force_recreate_tables': force_recreate_tables
        }

        result = await processor.execute(
            step_config={},
            context=context
        )

        # Print results
        print()
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print(f"{Colors.BLUE}Bootstrap Results{Colors.NC}")
        print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}")
        print()

        if result['status'] == 'SUCCESS':
            print(f"{Colors.GREEN}✓ Status: {result['status']}{Colors.NC}")
            print()
            print(f"Dataset created: {result['dataset_created']}")
            print(f"Total tables: {result['total_tables']}")
            print()

            if result['tables_created']:
                print(f"{Colors.GREEN}Tables created ({len(result['tables_created'])}):  {Colors.NC}")
                for table in result['tables_created']:
                    print(f"  ✓ {table}")
                print()

            if result['tables_existed']:
                print(f"{Colors.YELLOW}Tables already existed ({len(result['tables_existed'])}):  {Colors.NC}")
                for table in result['tables_existed']:
                    print(f"  - {table}")
                print()

            print(f"{Colors.GREEN}{'=' * 80}{Colors.NC}")
            print(f"{Colors.GREEN}✓ Bootstrap completed successfully!{Colors.NC}")
            print(f"{Colors.GREEN}{'=' * 80}{Colors.NC}")
            return True

        else:
            print(f"{Colors.RED}✗ Status: {result['status']}{Colors.NC}")
            print(f"{Colors.RED}Bootstrap failed!{Colors.NC}")
            return False

    except Exception as e:
        print()
        print(f"{Colors.RED}{'=' * 80}{Colors.NC}")
        print(f"{Colors.RED}✗ Bootstrap failed with exception{Colors.NC}")
        print(f"{Colors.RED}{'=' * 80}{Colors.NC}")
        print(f"{Colors.RED}Error: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main test function."""
    parser = argparse.ArgumentParser(
        description="Test one-time bootstrap setup processor"
    )
    parser.add_argument(
        '--force-tables',
        action='store_true',
        help='Delete and recreate all tables (DANGER!)'
    )
    parser.add_argument(
        '--force-all',
        action='store_true',
        help='Delete and recreate entire dataset (DANGER!)'
    )
    parser.add_argument(
        '--yes',
        action='store_true',
        help='Skip confirmation prompts (DANGER!)'
    )

    args = parser.parse_args()

    force_recreate_dataset = args.force_all
    force_recreate_tables = args.force_tables or args.force_all
    skip_confirmation = args.yes

    success = asyncio.run(test_bootstrap(
        force_recreate_dataset=force_recreate_dataset,
        force_recreate_tables=force_recreate_tables,
        skip_confirmation=skip_confirmation
    ))

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
