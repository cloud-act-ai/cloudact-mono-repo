# Cloud Resource Tagging Guide

**v1.0** | 2026-01-15

> Tag cloud resources for hierarchy cost allocation

---

## Supported Labels

| Priority | Label Key | Example |
|----------|-----------|---------|
| 1 | `entity_id` | TEAM-INFRA |
| 2 | `cost_center` | DEPT-CIO |
| 3 | `team` | TEAM-DATA |
| 4 | `department` | DEPT-CFO |

**Recommendation:** Use `entity_id` with your CloudAct hierarchy entity ID

---

## GCP

```bash
# Compute Engine
gcloud compute instances add-labels INSTANCE_NAME \
  --labels=entity_id=TEAM-INFRA

# Cloud Storage
gsutil label ch -l entity_id:TEAM-DATA gs://BUCKET_NAME

# BigQuery
bq update --set_label entity_id:TEAM-DATA project:dataset.table
```

---

## AWS

```bash
# EC2
aws ec2 create-tags --resources i-xxx \
  --tags Key=entity_id,Value=TEAM-INFRA

# S3
aws s3api put-bucket-tagging --bucket BUCKET_NAME \
  --tagging 'TagSet=[{Key=entity_id,Value=TEAM-DATA}]'
```

---

## Azure

```bash
# Resource Group
az tag create --resource-id /subscriptions/.../resourceGroups/RG_NAME \
  --tags entity_id=TEAM-INFRA
```
