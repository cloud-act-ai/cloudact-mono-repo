#!/usr/bin/env python3
"""
Fix Deprecated Hierarchy Fields in Python Code

Purpose: Fix BUG #34-#50 (MEDIUM severity) - Replace deprecated hierarchy field usage
Affected files: 6 Python processors in 03-data-pipeline-service/src/core/processors/genai/

Deprecated fields → Replacement:
- hierarchy_entity_id → x_hierarchy_level_1_id (or appropriate level)
- hierarchy_level_code → REMOVED (no longer needed)
- hierarchy_path → x_hierarchy_level_1_id, x_hierarchy_level_2_id, etc.

INSTRUCTIONS:
1. Review changes before applying (--dry-run first)
2. Backup files or commit to git before running
3. Run: python3 fix_deprecated_hierarchy_code.py --apply
"""

import re
from pathlib import Path
from typing import List, Dict

REPO_ROOT = Path("/Users/gurukallam/prod-ready-apps/cloudact-mono-repo")
PROCESSORS_DIR = REPO_ROOT / "03-data-pipeline-service" / "src" / "core" / "processors" / "genai"

class HierarchyCodeFixer:
    def __init__(self, dry_run: bool = True):
        self.dry_run = dry_run
        self.changes_made = []

    def fix_file(self, file_path: Path) -> None:
        """Fix deprecated hierarchy field usage in a single file"""
        print(f"\n{'[DRY-RUN] ' if self.dry_run else ''}Processing: {file_path.name}")

        with open(file_path) as f:
            content = f.read()

        original_content = content
        changes_in_file = []

        # Fix 1: Replace hierarchy_entity_id references
        if 'hierarchy_entity_id' in content:
            # In SELECT statements, replace with x_hierarchy_level_1_id
            content = re.sub(
                r'\bhierarchy_entity_id\b',
                'x_hierarchy_level_1_id',
                content
            )
            changes_in_file.append("✓ Replaced 'hierarchy_entity_id' with 'x_hierarchy_level_1_id'")

        # Fix 2: Remove hierarchy_level_code references
        if 'hierarchy_level_code' in content:
            # Remove from SELECT lists
            content = re.sub(
                r',?\s*hierarchy_level_code\s*,?\s*',
                '',
                content
            )
            # Remove from column lists in comments
            content = re.sub(
                r'hierarchy_level_code\s*\([^)]*\)\s*,?\s*',
                '',
                content
            )
            changes_in_file.append("✓ Removed 'hierarchy_level_code' references")

        # Fix 3: Replace hierarchy_path with proper N-level fields
        if 'hierarchy_path' in content:
            # Add comment explaining the change
            content = content.replace(
                'hierarchy_path',
                '-- DEPRECATED: hierarchy_path removed, use x_hierarchy_level_N_id fields instead\n        -- hierarchy_path'
            )
            changes_in_file.append("✓ Commented out 'hierarchy_path' with migration note")

        # Fix 4: Update DataFrame column selections if present
        if "df.select([" in content or "df['" in content:
            # Replace in DataFrame operations
            content = re.sub(
                r"df\[(['\"])hierarchy_entity_id\1\]",
                r"df[\1x_hierarchy_level_1_id\1]",
                content
            )
            content = re.sub(
                r"(['\"])hierarchy_entity_id\1",
                r"\1x_hierarchy_level_1_id\1",
                content
            )
            changes_in_file.append("✓ Updated DataFrame column references")

        # Fix 5: Update INSERT statements
        if 'INSERT INTO' in content or 'insert into' in content:
            # This is more complex - add a warning comment
            if 'hierarchy_entity_id' in content or 'hierarchy_level_code' in content:
                content = "# WARNING: This file has INSERT statements using deprecated hierarchy fields\n" + \
                         "# Manual review recommended to ensure proper 10-level hierarchy insertion\n\n" + content
                changes_in_file.append("⚠ Added warning comment for INSERT statements")

        if content != original_content:
            if not self.dry_run:
                # Create backup
                backup_path = file_path.with_suffix('.py.backup')
                with open(backup_path, 'w') as f:
                    f.write(original_content)
                print(f"  Created backup: {backup_path.name}")

                # Write fixed content
                with open(file_path, 'w') as f:
                    f.write(content)
                print(f"  ✅ Updated: {file_path.name}")

            for change in changes_in_file:
                print(f"  {change}")

            self.changes_made.append({
                'file': file_path.name,
                'changes': changes_in_file
            })
        else:
            print(f"  ℹ️  No changes needed")

    def fix_all_processors(self) -> None:
        """Fix all GenAI processor files"""
        print("=" * 80)
        print("HIERARCHY CODE FIXER - Deprecated Field Removal")
        print("=" * 80)

        processor_files = [
            "infrastructure_usage.py",
            "payg_usage.py",
            "commitment_usage.py",
            "payg_cost.py",
            "infrastructure_cost.py",
            "commitment_cost.py",
        ]

        for filename in processor_files:
            file_path = PROCESSORS_DIR / filename
            if file_path.exists():
                self.fix_file(file_path)
            else:
                print(f"\n⚠️  File not found: {filename}")

        self.print_summary()

    def print_summary(self) -> None:
        """Print summary of changes"""
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)

        if not self.changes_made:
            print("✅ No deprecated fields found - all code is up to date!")
            return

        print(f"\n{'[DRY-RUN] ' if self.dry_run else ''}Modified {len(self.changes_made)} files:")
        for item in self.changes_made:
            print(f"\n{item['file']}:")
            for change in item['changes']:
                print(f"  {change}")

        if self.dry_run:
            print("\n" + "=" * 80)
            print("⚠️  DRY-RUN MODE - No files were modified")
            print("To apply changes, run: python3 fix_deprecated_hierarchy_code.py --apply")
            print("=" * 80)
        else:
            print("\n" + "=" * 80)
            print("✅ All changes applied successfully!")
            print("Next steps:")
            print("1. Review the changes using: git diff")
            print("2. Test the processors to ensure they work correctly")
            print("3. Restore backups if needed: *.py.backup files")
            print("=" * 80)

def main():
    import sys

    apply_changes = '--apply' in sys.argv

    if not apply_changes:
        print("\n" + "=" * 80)
        print("RUNNING IN DRY-RUN MODE")
        print("No files will be modified. Add --apply to make actual changes.")
        print("=" * 80)

    fixer = HierarchyCodeFixer(dry_run=not apply_changes)
    fixer.fix_all_processors()

if __name__ == "__main__":
    main()
