# Documentation Consolidation Plan

## Current Issues:
1. ❌ Wrong architecture description (sign-up creates user_id is WRONG)
2. ❌ Too many docs files (need to reduce to 10%)
3. ❌ Old "customer" references still exist
4. ❌ Each folder has multiple files, need ONE per folder

## Correct Architecture (Data Pipeline):

**Data Pipeline is a BACKEND SERVICE, NOT a user management system**

### What It Does:
- ✅ Triggered by: Cloud Scheduler (automatic) OR Manual trigger (by user)
- ✅ Onboarding: Creates API key + stores credentials in BigQuery
- ✅ Runs pipelines based on **tenant_id** (organization-level)
- ✅ Tracks **user_id** for WHO triggered the pipeline (logging only)
- ✅ Quotas/Limits are at **tenant_id** level (not user level)
- ✅ Subscription: Created for company (tenant) by user_id

### tenant_id vs user_id:
- **tenant_id**: Organization (company) - LIMITS ARE HERE
- **user_id**: Individual who triggered - FOR LOGGING ONLY
- **Subscription**: Belongs to tenant_id (not user)
- **Quota enforcement**: By tenant_id (not user)

## Consolidation Plan:

### Target Structure (ONE file per folder):

```
docs/
├── README.md (Main entry point)
├── api/
│   └── API.md (Complete API reference)
├── architecture/
│   └── ARCHITECTURE.md (System design)
├── guides/
│   └── GUIDES.md (All guides consolidated)
├── reference/
│   └── REFERENCE.md (All technical references)
├── security/
│   └── SECURITY.md (All security docs)
└── operations/
    └── OPERATIONS.md (All operational docs)
```

### Remove These Folders (NOT NEEDED):
- ❌ docs/checklists/ - Remove entirely
- ❌ docs/implementation/ - Merge into architecture
- ❌ docs/notifications/ - Remove or merge into operations
- ❌ docs/testing/ - Remove (testing is developer concern)

### Consolidation Rules:
1. Keep ONLY essential information (reduce to 10%)
2. Remove all "customer" references → "tenant"
3. Fix architecture descriptions
4. One clear, concise file per topic
5. No duplicate information

### What to Keep:
- API endpoints with examples
- Correct architecture (backend service model)
- Onboarding flow (tenant creation)
- Pipeline execution flow
- Quota enforcement
- Security (KMS, auth)

### What to Remove:
- ❌ Implementation history
- ❌ Test reports
- ❌ Checklists
- ❌ Duplicate guides
- ❌ Overly detailed explanations
- ❌ User management (we don't do this!)

## Action Plan:

1. Create 6 consolidated files (one per folder)
2. Each file max 200-300 lines
3. Clear, concise, correct architecture
4. Remove all wrong references
5. Delete old files

Ready to execute?
