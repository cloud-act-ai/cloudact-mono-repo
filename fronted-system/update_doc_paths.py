#!/usr/bin/env python3
"""
Script to update folder references in markdown files from old names to new numbered names.
"""
import os
import glob

# Base directory
base_dir = "/Users/gurukallam/prod-ready-apps/cloudact-mono-repo/00-requirements-docs"

# Get all markdown files
md_files = glob.glob(os.path.join(base_dir, "*.md"))

# Replacement mappings
replacements = [
    ('fronted-system/', '01-fronted-system/'),
    ('api-service/', '02-api-service/'),
    ('data-pipeline-service/', '03-data-pipeline-service/'),
    ('requirements-docs/', '00-requirements-docs/'),
]

updated_files = []

for filepath in md_files:
    print(f"Processing: {os.path.basename(filepath)}")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Apply all replacements
    for old, new in replacements:
        content = content.replace(old, new)

    # Only write if content changed
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        updated_files.append(os.path.basename(filepath))
        print(f"  ✓ Updated")
    else:
        print(f"  - No changes")

print(f"\n{'='*60}")
print(f"Summary: Updated {len(updated_files)} files")
print(f"{'='*60}")
for filename in sorted(updated_files):
    print(f"  ✓ {filename}")
