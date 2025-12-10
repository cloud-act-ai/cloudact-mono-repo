#!/usr/bin/env python3
"""
Script to fix double-replacements like 01-01-fronted-system → 01-fronted-system
"""
import os
import glob

# Base directory
base_dir = "/Users/gurukallam/prod-ready-apps/cloudact-mono-repo/00-requirements-docs"

# Get all markdown files
md_files = glob.glob(os.path.join(base_dir, "*.md"))

# Fix double replacements
replacements = [
    ('01-01-fronted-system/', '01-fronted-system/'),
    ('02-02-api-service/', '02-api-service/'),
    ('03-03-data-pipeline-service/', '03-data-pipeline-service/'),
    ('00-00-requirements-docs/', '00-requirements-docs/'),
]

updated_files = []

for filepath in md_files:
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

if updated_files:
    print(f"Fixed double-replacements in {len(updated_files)} files:")
    for filename in sorted(updated_files):
        print(f"  ✓ {filename}")
else:
    print("No double-replacements found.")
