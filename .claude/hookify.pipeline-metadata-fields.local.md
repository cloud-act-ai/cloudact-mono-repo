---
name: pipeline-metadata-fields
enabled: true
event: all
pattern: (x_pipeline_id|x_credential_id|x_run_id|x_ingested_at|x_org_slug|x_hierarchy|x_cloud_provider|x_genai_provider)
action: warn
---

**x_* fields:** API (8000) = NEVER | Pipeline (8001) = REQUIRED

See: `.claude/SUMMARY.md` → Key Boundaries
