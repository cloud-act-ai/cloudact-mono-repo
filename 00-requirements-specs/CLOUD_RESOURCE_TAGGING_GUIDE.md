# Cloud Resource Tagging Guide

**v1.1** | 2026-02-05

> Tag cloud resources for hierarchy cost allocation in CloudAct

---

## Tagging Workflow

```
1. Set up hierarchy in CloudAct → Departments, Projects, Teams
2. Note entity IDs → DEPT-001, PROJ-002, TEAM-INFRA, etc.
3. Apply labels/tags to cloud resources → Use entity_id as primary label
4. Run billing pipeline → Labels extracted from billing export
5. Cost allocation → Labels matched to hierarchy entities
6. Dashboard shows → Costs broken down by department/project/team
```

---

## Supported Label Keys (Priority Order)

| Priority | Label Key | Example | Use |
|----------|-----------|---------|-----|
| 1 | `entity_id` | `TEAM-INFRA` | Direct CloudAct hierarchy entity |
| 2 | `cost_center` | `DEPT-CIO` | Department-level allocation |
| 3 | `team` | `TEAM-DATA` | Team-level allocation |
| 4 | `department` | `DEPT-CFO` | Department fallback |

**Recommendation:** Use `entity_id` with your CloudAct hierarchy entity ID for most accurate cost allocation.

---

## Provider Tagging Standards

| Provider | Label Format | Applies To |
|----------|-------------|------------|
| GCP | `--labels=entity_id=VALUE` | Compute, Storage, BigQuery, GKE |
| AWS | `Key=entity_id,Value=VALUE` | EC2, S3, RDS, Lambda |
| Azure | `--tags entity_id=VALUE` | Resource groups, VMs, Storage |
| OCI | `freeform_tags.entity_id=VALUE` | Compute, Block Storage |

---

## Tagging Standards

| Standard | Requirement |
|----------|-------------|
| Consistency | Same entity_id across all resources in a team/project |
| Case | Use uppercase for entity IDs (TEAM-INFRA, DEPT-CFO) |
| Coverage | Tag ALL billable resources for accurate allocation |
| Automation | Use IaC (Terraform, Pulumi) to enforce tagging at creation |
| Validation | CloudAct validates labels against known hierarchy entities |
