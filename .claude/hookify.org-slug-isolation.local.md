---
name: org-slug-isolation
enabled: true
event: all
pattern: (org_slug|x_org_slug|org_profiles|org_api_keys|org_hierarchy)
action: warn
---

**Field Naming:** `organizations.*` → `org_slug` | `{org_slug}_prod.*` → `x_org_slug`

See: `.claude/SUMMARY.md` → Key Boundaries
