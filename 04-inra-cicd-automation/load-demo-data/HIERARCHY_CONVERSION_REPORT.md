# Demo Data Hierarchy Conversion Report

**Date:** 2026-01-08
**Conversion:** N-level → 10-level hierarchy structure

## Summary

Successfully converted all demo data files from the old N-level hierarchy format to the new 10-level hierarchy structure.

## Changes Made

### Old N-Level Format (Removed)
```json
{
  "hierarchy_entity_id": "TEAM-ARCH",
  "hierarchy_entity_name": "Architecture",
  "hierarchy_level_code": "team",
  "hierarchy_path": "/DEPT-CIO/PROJ-CTO/TEAM-ARCH",
  "hierarchy_path_names": "Group CIO > Engineering > Architecture"
}
```

### New 10-Level Format (Added)
```json
{
  "hierarchy_level_1_id": "DEPT-CIO",
  "hierarchy_level_1_name": "Group CIO",
  "hierarchy_level_2_id": "PROJ-CTO",
  "hierarchy_level_2_name": "Engineering",
  "hierarchy_level_3_id": "TEAM-ARCH",
  "hierarchy_level_3_name": "Architecture",
  "hierarchy_level_4_id": null,
  "hierarchy_level_4_name": null,
  ...
  "hierarchy_level_10_id": null,
  "hierarchy_level_10_name": null
}
```

## Files Converted

### GenAI Usage Data (3 files, 4,015 records)
- **anthropic_usage_raw.json** - 1,095 records
- **openai_usage_raw.json** - 1,825 records
- **gemini_usage_raw.json** - 1,095 records

### Cloud Cost Data (4 files, 12,045 records)
- **gcp_billing_raw.json** - 3,650 records
- **aws_billing_raw.json** - 3,650 records
- **azure_billing_raw.json** - 2,920 records
- **oci_billing_raw.json** - 1,825 records

### Subscription Plans (1 file, 15 records)
- **subscription_plans.csv** - 15 records

**Total:** 8 files, 16,075 records converted

## Hierarchy Entities Used

Based on the default hierarchy template, the following entities are used in demo data:

### Level 1 (Departments)
- `DEPT-CIO` - Group CIO
- `DEPT-COO` - Group COO

### Level 2 (Projects)
- `PROJ-CTO` - Engineering (parent: DEPT-CIO)
- `PROJ-BU1` - Business Unit 1 IT (parent: DEPT-CIO)
- `PROJ-BU2` - Business Unit 2 IT (parent: DEPT-CIO)
- `PROJ-ITCOO` - IT Operations (parent: DEPT-CIO)

### Level 3 (Teams)
- `TEAM-ARCH` - Architecture (parent: PROJ-CTO)
- `TEAM-DATA` - Data (parent: PROJ-CTO)
- `TEAM-PLAT` - Platforms (parent: PROJ-CTO)
- `TEAM-INFRA` - Infrastructure (parent: PROJ-CTO)
- `TEAM-BU1APP` - BU1 Applications (parent: PROJ-BU1)
- `TEAM-BU2APP` - BU2 Applications (parent: PROJ-BU2)

### Levels 4-10
All demo data uses NULL for levels 4-10 (most organizations don't use all 10 levels).

## Example Assignments

### GenAI Usage
- **Anthropic:** DEPT-CIO → PROJ-CTO → TEAM-ARCH (Architecture)
- **OpenAI:** DEPT-CIO → PROJ-CTO → TEAM-DATA (Data)
- **Gemini:** DEPT-CIO → PROJ-BU1 → TEAM-BU1APP (BU1 Applications)

### Cloud Costs
- **GCP:** DEPT-CIO → PROJ-CTO → TEAM-INFRA (Infrastructure)
- **AWS:** DEPT-CIO → PROJ-CTO → TEAM-INFRA (Infrastructure)
- **Azure:** DEPT-CIO → PROJ-CTO → TEAM-INFRA (Infrastructure)
- **OCI:** DEPT-CIO → PROJ-CTO → TEAM-INFRA (Infrastructure)

### Subscriptions
- **ChatGPT Team:** DEPT-CIO → PROJ-CTO → TEAM-DATA
- **Claude Pro:** DEPT-CIO → PROJ-CTO → TEAM-PLAT
- **Slack Business+:** DEPT-CIO (department-level only)
- **GitHub Team:** DEPT-CIO → PROJ-CTO (project-level only)

## Validation

All converted files have been validated:
- ✓ Old N-level fields removed
- ✓ New 10-level fields added
- ✓ Hierarchy paths correctly parsed
- ✓ Parent-child relationships preserved
- ✓ NULL values for unused levels (4-10)

## Conversion Script

Location: `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo/04-inra-cicd-automation/load-demo-data/scripts/convert_hierarchy_to_10_level.py`

Usage:
```bash
cd 04-inra-cicd-automation/load-demo-data/scripts
python3 convert_hierarchy_to_10_level.py
```

The script can be re-run safely (idempotent) - it only converts records that still have the old N-level fields.

## Next Steps

✓ All demo data files converted
✓ Ready for use with the new 10-level hierarchy system
✓ Compatible with FOCUS 1.3 extension fields (x_hierarchy_level_N_*)

The demo data can now be loaded directly into BigQuery with the updated schema.
