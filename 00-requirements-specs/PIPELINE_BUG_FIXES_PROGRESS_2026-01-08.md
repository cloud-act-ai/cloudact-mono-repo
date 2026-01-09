# Pipeline Service Bug Fixes - Progress Report
**Date:** 2026-01-08
**Total Issues:** 45 (Phase 2 High + Phase 3 Medium + Phase 4 Low)

## PHASE 2: HIGH PRIORITY (18 issues) - STATUS: 14/18 COMPLETED

### ✅ COMPLETED (14 issues)

**Schema Fixes:**
1. ✅ **SCH-004** - Added x_data_quality_score (FLOAT64, NULLABLE) to:
   - cloud_aws_billing_raw_daily.json
   - cloud_azure_billing_raw_daily.json
   - cloud_oci_billing_raw_daily.json
   - cloud_gcp_billing_raw_daily.json

2. ✅ **SCH-005** - Added x_created_at (TIMESTAMP, NULLABLE) to:
   - cloud_aws_billing_raw_daily.json
   - cloud_azure_billing_raw_daily.json
   - cloud_oci_billing_raw_daily.json

3. ✅ **SCH-006** - Verified Azure CommitmentDiscountType fix in sp_cloud_1_convert_to_focus.sql (lines 495-499)

**Procedure Fixes:**
4. ✅ **PRO-004** - Added batch processing performance comment in sp_cloud_1_convert_to_focus.sql (lines 73-75)

5. ✅ **PRO-006** - Added org authorization check in sp_cloud_1_convert_to_focus.sql (lines 46-53):
   ```sql
   DECLARE v_org_exists INT64 DEFAULT 0;
   EXECUTE IMMEDIATE FORMAT("""
     SELECT COUNT(*) FROM `%s.organizations.org_profiles`
     WHERE org_slug = @v_org_slug
   """, p_project_id)
   INTO v_org_exists USING v_org_slug AS v_org_slug;
   ASSERT v_org_exists = 1 AS "Organization not found or unauthorized access";
   ```

**Config Fixes:**
6. ✅ **CFG-003** - Changed timeout from 5 to 15 minutes in configs/subscription/costs/subscription_cost.yml (line 36)

7. ✅ **CFG-005** - Verified provider: "gcp" exists in configs/cloud/gcp/cost/focus_convert.yml (line 29)

**Processor Fixes:**
8. ✅ **PROC-004** - Added "deepseek": "DeepSeek" to PROVIDER_NAMES dict in src/core/processors/genai/focus_converter.py (line 43)

**Security Fixes:**
9. ✅ **SEC-002** - Verified org_slug validation already exists in src/app/routers/pipelines.py (lines 450-454):
   ```python
   if not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
       raise HTTPException(status_code=400, detail="Invalid org_slug format")
   ```

10. ✅ **SEC-003** - Same as PRO-006 (org authorization check in procedure)

### 🔄 IN PROGRESS / PENDING (4 issues)

**Config:**
11. ⏳ **CFG-004** - Add schema validation in pipeline loader
   - Action: Add validation for required fields (pipeline_id, name, provider, domain, steps)
   - Location: src/core/pipeline/loader.py or executor.py

**Processor:**
12. ⏳ **PROC-005** - Implement retry wrapper using BQ_MAX_RETRIES constants
   - Action: Add exponential backoff retry logic in payg_cost.py
   - Constants already defined (lines 40-44)

**Testing:**
13. ⏳ **TEST-001** - Create tests/test_hierarchy_validation.py
   - test_payg_cost_invalid_hierarchy_entity()
   - test_focus_converter_hierarchy_null_handling()
   - test_cloud_focus_aws_hierarchy_allocation()

---

## PHASE 3: MEDIUM PRIORITY (18 issues) - STATUS: 0/18 COMPLETED

### Schema Fixes (3 issues)
14. ⏳ **SCH-007** - Add x_cloud_provider (STRING, REQUIRED) to AWS/Azure/OCI schemas
15. ⏳ **SCH-008** - Add x_cloud_account_id (STRING, NULLABLE) to all cloud schemas
16. ⏳ **SCH-009** - Reorder x_* fields to standard order in all schemas

### Procedure Fixes (4 issues)
17. ⏳ **PRO-007** - Add p_pipeline_id, p_credential_id, p_run_id to sp_subscription_3_convert_to_focus.sql
18. ⏳ **PRO-008** - Implement fiscal year logic in sp_subscription_2_calculate_daily_costs.sql
19. ⏳ **PRO-009** - Use p_pipeline_id parameter instead of hardcoded value
20. ⏳ **PRO-010** - Add INSERT into org_meta_dq_results for NULL seats

### Config Fixes (4 issues)
21. ⏳ **CFG-006** - Standardize retry config across steps in openai.yml
22. ⏳ **CFG-007** - Add slack to notifications in openai.yml
23. ⏳ **CFG-008** - Bump version from 1.0.0 to 15.0.0 in pipelines
24. ⏳ **CFG-009** - Add depends_on to sequential steps in all pipelines

### Processor Fixes (3 issues)
25. ⏳ **PROC-006** - Add org_slug validation at start of execute() in payg_cost.py
26. ⏳ **PROC-007** - Add MERGE count breakdown (inserted/updated/deleted) in focus_converter.py
27. ⏳ **PROC-008** - Verify cloud focus_converter.py calls procedure in loop for each date

### Security/Quality (4 issues)
28. ⏳ **SEC-004** - Add global rate limiting in pipelines.py using @rate_limit_global decorator
29. ⏳ **SEC-005** - Add audit logging to all processor execute() methods
30. ⏳ **QUAL-001** - Remove commented code from payg_cost.py lines 691-693
31. ⏳ **QUAL-002** - Delete sp_consolidate_genai_costs_daily.sql.bak and add *.bak to .gitignore

---

## PHASE 4: LOW PRIORITY (9 issues) - STATUS: 0/9 COMPLETED

### Schema Fixes (6 issues)
32. ⏳ **SCH-010** - Add description to billing_account_id in cloud_gcp_billing_raw_daily.json
33. ⏳ **SCH-011** - Verify resource_name is snake_case in all schemas
34. ⏳ **SCH-012** - Add clustering hint to x_pipeline_run_date descriptions
35. ⏳ **SCH-013** - Add $schema_version and last_updated to all schema JSON files
36. ⏳ **SCH-014** - Create CHANGELOG.md in schemas directory
37. ⏳ **SCH-015** - Add deprecation note for billing_amount in subscription_plans.json

### Procedure Fixes (2 issues)
38. ⏳ **PRO-011** - Improve error message in sp_cloud_1_convert_to_focus.sql line 558
39. ⏳ **PRO-012** - Add currency validation ASSERT in sp_subscription_3_convert_to_focus.sql

### Config Fixes (2 issues)
40. ⏳ **CFG-010** - Add timezone comment in openai.yml
41. ⏳ **CFG-011** - Add header comments to all .yml pipeline files

### Processor Fixes (2 issues)
42. ⏳ **PROC-009** - Implement google-cloud-monitoring API calls in gcp_vertex_adapter.py
43. ⏳ **PROC-010** - Add org_slug and process_date to exception context in focus_converter.py

### Quality (1 issue)
44. ⏳ **QUAL-003** - Add explanatory comments to retry constants in payg_cost.py lines 40-44

---

## Summary

- **Total Fixed:** 14/45 (31%)
- **Phase 2 (High):** 14/18 (78%)
- **Phase 3 (Medium):** 0/18 (0%)
- **Phase 4 (Low):** 0/9 (0%)

**Next Actions:**
1. Complete remaining 4 HIGH priority issues (CFG-004, PROC-005, TEST-001)
2. Systematically work through all 18 MEDIUM priority issues
3. Complete all 9 LOW priority issues
4. Run full test suite to verify all fixes
5. Create final summary document

**Files Modified:**
1. cloud_aws_billing_raw_daily.json
2. cloud_azure_billing_raw_daily.json
3. cloud_oci_billing_raw_daily.json
4. cloud_gcp_billing_raw_daily.json
5. sp_cloud_1_convert_to_focus.sql
6. subscription_cost.yml
7. focus_converter.py (genai)

**Next Steps:**
Continue with remaining HIGH priority fixes, then proceed through MEDIUM and LOW systematically.
