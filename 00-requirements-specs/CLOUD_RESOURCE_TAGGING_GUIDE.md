# Cloud Resource Tagging Guide for Hierarchy Assignment
**Version:** 1.0.0
**Date:** 2026-01-08
**Applies To:** GCP, AWS, Azure, OCI

---

## Overview

CloudAct uses resource labels/tags to assign cloud costs to your organizational hierarchy (Department → Project → Team). This guide shows how to tag resources in each cloud provider.

### Supported Label Keys

CloudAct looks for these labels in order of priority:

| Priority | Label Key | Description | Example Value |
|----------|-----------|-------------|---------------|
| 1 | `entity_id` | Full hierarchy entity ID | `TEAM-INFRA`, `PROJ-CTO`, `DEPT-CIO` |
| 2 | `cost_center` | Department/cost center code | `DEPT-CIO`, `engineering` |
| 3 | `team` | Team identifier | `TEAM-DATA`, `platform-team` |
| 4 | `department` | Department name | `DEPT-CFO`, `operations` |

**Recommendation:** Use `entity_id` with the full entity ID from your CloudAct hierarchy for most accurate cost allocation.

---

## Google Cloud Platform (GCP)

### Compute Engine Instances

```bash
# Add label to existing instance
gcloud compute instances add-labels INSTANCE_NAME \
  --labels=entity_id=TEAM-INFRA \
  --zone=us-central1-a

# Create instance with labels
gcloud compute instances create INSTANCE_NAME \
  --labels=entity_id=TEAM-INFRA,environment=prod \
  --zone=us-central1-a
```

### Cloud Storage Buckets

```bash
# Add label to bucket
gsutil label ch -l entity_id:TEAM-DATA gs://BUCKET_NAME

# View current labels
gsutil label get gs://BUCKET_NAME

# Set multiple labels (replaces all)
cat > labels.json <<EOF
{
  "entity_id": "TEAM-DATA",
  "environment": "prod",
  "cost_center": "DEPT-CIO"
}
EOF
gsutil label set labels.json gs://BUCKET_NAME
```

### BigQuery Datasets & Tables

```bash
# Label a dataset
bq update --set_label entity_id:PROJ-CTO PROJECT_ID:DATASET_NAME

# Label a table
bq update --set_label entity_id:TEAM-DATA PROJECT_ID:DATASET.TABLE_NAME

# View labels
bq show --format=prettyjson PROJECT_ID:DATASET_NAME
```

### GKE Clusters

```bash
# Create cluster with labels
gcloud container clusters create CLUSTER_NAME \
  --resource-labels=entity_id=TEAM-PLAT \
  --zone=us-central1-a

# Update existing cluster labels
gcloud container clusters update CLUSTER_NAME \
  --update-labels=entity_id=TEAM-PLAT \
  --zone=us-central1-a
```

### Cloud SQL Instances

```bash
# Add label to Cloud SQL instance
gcloud sql instances patch INSTANCE_NAME \
  --labels=entity_id=TEAM-DATA

# Create with labels
gcloud sql instances create INSTANCE_NAME \
  --labels=entity_id=TEAM-DATA,environment=prod
```

### Cloud Functions

```bash
# Deploy function with labels
gcloud functions deploy FUNCTION_NAME \
  --labels=entity_id=TEAM-ARCH \
  --runtime=python311
```

### Cloud Run Services

```bash
# Deploy with labels
gcloud run deploy SERVICE_NAME \
  --labels=entity_id=TEAM-PLAT \
  --image=gcr.io/PROJECT/IMAGE
```

### Bulk Labeling Script (GCP)

```bash
#!/bin/bash
# bulk_label_gcp.sh - Add entity_id label to all resources in a project

ENTITY_ID="TEAM-INFRA"
PROJECT_ID="your-project-id"
ZONE="us-central1-a"

# Label all Compute Engine instances
echo "Labeling Compute Engine instances..."
gcloud compute instances list --project=$PROJECT_ID --format="value(name,zone)" | \
while IFS=$'\t' read -r name zone; do
  echo "  - $name (zone: $zone)"
  gcloud compute instances add-labels "$name" \
    --labels=entity_id=$ENTITY_ID \
    --zone="$zone" \
    --project=$PROJECT_ID
done

# Label all Cloud Storage buckets
echo "Labeling Cloud Storage buckets..."
gsutil ls -p $PROJECT_ID | \
while read bucket; do
  echo "  - $bucket"
  gsutil label ch -l entity_id:$ENTITY_ID "$bucket"
done

# Label all BigQuery datasets
echo "Labeling BigQuery datasets..."
bq ls --project_id=$PROJECT_ID --format=json | \
jq -r '.[].id' | \
while read dataset; do
  echo "  - $dataset"
  bq update --set_label entity_id:$ENTITY_ID "$PROJECT_ID:$dataset"
done

echo "✓ Bulk labeling complete"
```

---

## Amazon Web Services (AWS)

### EC2 Instances

```bash
# Add tags to instance
aws ec2 create-tags \
  --resources i-1234567890abcdef0 \
  --tags Key=entity_id,Value=TEAM-INFRA

# Tag multiple instances
aws ec2 create-tags \
  --resources i-instance1 i-instance2 \
  --tags Key=entity_id,Value=TEAM-DATA Key=environment,Value=prod
```

### S3 Buckets

```bash
# Tag a bucket
aws s3api put-bucket-tagging \
  --bucket BUCKET_NAME \
  --tagging 'TagSet=[{Key=entity_id,Value=TEAM-DATA},{Key=environment,Value=prod}]'

# View tags
aws s3api get-bucket-tagging --bucket BUCKET_NAME
```

### RDS Databases

```bash
# Add tags to RDS instance
aws rds add-tags-to-resource \
  --resource-arn arn:aws:rds:us-east-1:123456789012:db:mydbinstance \
  --tags Key=entity_id,Value=TEAM-DATA

# View tags
aws rds list-tags-for-resource \
  --resource-arn arn:aws:rds:us-east-1:123456789012:db:mydbinstance
```

### Lambda Functions

```bash
# Tag Lambda function
aws lambda tag-resource \
  --resource arn:aws:lambda:us-east-1:123456789012:function:my-function \
  --tags entity_id=TEAM-ARCH
```

### EKS Clusters

```bash
# Tag EKS cluster
aws eks tag-resource \
  --resource-arn arn:aws:eks:us-east-1:123456789012:cluster/my-cluster \
  --tags entity_id=TEAM-PLAT
```

### Bulk Tagging Script (AWS)

```bash
#!/bin/bash
# bulk_tag_aws.sh - Add entity_id tag to all resources in a region

ENTITY_ID="TEAM-INFRA"
REGION="us-east-1"

# Tag all EC2 instances
echo "Tagging EC2 instances..."
aws ec2 describe-instances --region=$REGION --query "Reservations[].Instances[].[InstanceId]" --output text | \
while read instance_id; do
  echo "  - $instance_id"
  aws ec2 create-tags --resources "$instance_id" --tags Key=entity_id,Value=$ENTITY_ID --region=$REGION
done

# Tag all S3 buckets
echo "Tagging S3 buckets..."
aws s3api list-buckets --query "Buckets[].Name" --output text | \
while read bucket; do
  echo "  - $bucket"
  aws s3api put-bucket-tagging --bucket "$bucket" --tagging "TagSet=[{Key=entity_id,Value=$ENTITY_ID}]" 2>/dev/null
done

echo "✓ Bulk tagging complete"
```

---

## Microsoft Azure

### Virtual Machines

```bash
# Add tag to VM
az vm update \
  --resource-group MyResourceGroup \
  --name MyVM \
  --set tags.entity_id=TEAM-INFRA

# Create VM with tags
az vm create \
  --resource-group MyResourceGroup \
  --name MyVM \
  --image UbuntuLTS \
  --tags entity_id=TEAM-INFRA environment=prod
```

### Storage Accounts

```bash
# Tag storage account
az storage account update \
  --name mystorageaccount \
  --resource-group MyResourceGroup \
  --tags entity_id=TEAM-DATA
```

### SQL Databases

```bash
# Tag SQL database
az sql db update \
  --resource-group MyResourceGroup \
  --server myserver \
  --name mydatabase \
  --tags entity_id=TEAM-DATA
```

### AKS Clusters

```bash
# Create AKS cluster with tags
az aks create \
  --resource-group MyResourceGroup \
  --name MyAKSCluster \
  --tags entity_id=TEAM-PLAT
```

### Resource Groups

```bash
# Tag entire resource group (applies to all resources)
az group update \
  --name MyResourceGroup \
  --tags entity_id=DEPT-CIO cost_center=engineering
```

### Bulk Tagging Script (Azure)

```bash
#!/bin/bash
# bulk_tag_azure.sh - Add entity_id tag to all resources in a resource group

ENTITY_ID="TEAM-INFRA"
RESOURCE_GROUP="MyResourceGroup"

# Get all resource IDs
echo "Tagging all resources in $RESOURCE_GROUP..."
az resource list --resource-group $RESOURCE_GROUP --query "[].id" -o tsv | \
while read resource_id; do
  echo "  - $resource_id"
  az resource tag --ids "$resource_id" --tags entity_id=$ENTITY_ID
done

echo "✓ Bulk tagging complete"
```

---

## Oracle Cloud Infrastructure (OCI)

### Compute Instances

```bash
# Add freeform tags to instance
oci compute instance update \
  --instance-id ocid1.instance.oc1... \
  --freeform-tags '{"entity_id":"TEAM-INFRA"}'
```

### Object Storage Buckets

```bash
# Tag bucket
oci os bucket update \
  --bucket-name BUCKET_NAME \
  --freeform-tags '{"entity_id":"TEAM-DATA"}'
```

---

## Terraform Integration

### GCP Example

```hcl
resource "google_compute_instance" "example" {
  name         = "example-instance"
  machine_type = "e2-medium"
  zone         = "us-central1-a"

  labels = {
    entity_id   = "TEAM-INFRA"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "google_storage_bucket" "example" {
  name     = "example-bucket"
  location = "US"

  labels = {
    entity_id  = "TEAM-DATA"
    environment = "prod"
  }
}
```

### AWS Example

```hcl
resource "aws_instance" "example" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"

  tags = {
    entity_id   = "TEAM-INFRA"
    environment = "prod"
    managed_by  = "terraform"
  }
}

resource "aws_s3_bucket" "example" {
  bucket = "example-bucket"

  tags = {
    entity_id   = "TEAM-DATA"
    environment = "prod"
  }
}
```

### Azure Example

```hcl
resource "azurerm_virtual_machine" "example" {
  name                  = "example-vm"
  location              = azurerm_resource_group.example.location
  resource_group_name   = azurerm_resource_group.example.name

  tags = {
    entity_id   = "TEAM-INFRA"
    environment = "prod"
    managed_by  = "terraform"
  }
}
```

---

## Best Practices

### 1. Tagging Strategy

**DO:**
- ✅ Use `entity_id` with CloudAct hierarchy entity IDs
- ✅ Tag resources immediately upon creation
- ✅ Include environment tags (`prod`, `stage`, `dev`)
- ✅ Use Terraform/IaC to enforce tagging
- ✅ Document your tagging standards

**DON'T:**
- ❌ Use inconsistent tag keys (`EntityId` vs `entity_id`)
- ❌ Leave high-cost resources untagged
- ❌ Use invalid entity IDs (not in CloudAct hierarchy)
- ❌ Mix cost allocation methods (pick one approach)

### 2. Validation

Before deploying, verify entity IDs exist in CloudAct:

```bash
# List all valid entity IDs
curl -X GET "https://api.cloudact.ai/api/v1/hierarchy/YOUR_ORG" \
  -H "X-API-Key: YOUR_API_KEY" | jq -r '.entities[].entity_id'
```

### 3. Monitoring Untagged Resources

CloudAct will show costs as "Unallocated" if resources lack hierarchy tags. Monitor this metric:

```bash
# Get unallocated costs
curl -X GET "https://api.cloudact.ai/api/v1/costs/YOUR_ORG/unallocated" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Goal:** Keep unallocated costs < 5% of total spend.

### 4. Default Hierarchy Fallback

If you can't tag all resources, set an org-level default hierarchy in CloudAct UI:
- Settings → Organization → Default Cost Allocation
- Untagged resources will use this default

---

## Troubleshooting

### Issue: Costs still show as "Unallocated"

**Causes:**
1. Tags not synced to billing export yet (24-48hr delay)
2. Invalid entity_id (not in CloudAct hierarchy)
3. Wrong tag key name (typo)

**Solution:**
```bash
# Check billing export for labels (GCP example)
bq query --use_legacy_sql=false \
  "SELECT labels_json, cost
   FROM \`project.billing_export.gcp_billing_export_*\`
   WHERE DATE(usage_start_time) = CURRENT_DATE() - 1
   LIMIT 10"
```

### Issue: Entity ID validation fails

**Cause:** Entity ID in tag doesn't match CloudAct hierarchy

**Solution:**
1. List valid IDs: `GET /api/v1/hierarchy/{org}`
2. Update resource tags with correct ID
3. Wait for next billing sync (24hrs)

---

## API Reference

### Validate Entity ID

```bash
curl -X GET "https://api.cloudact.ai/api/v1/hierarchy/YOUR_ORG/entities/TEAM-INFRA" \
  -H "X-API-Key: YOUR_API_KEY"

# Response:
# {
#   "success": true,
#   "entity": {
#     "entity_id": "TEAM-INFRA",
#     "entity_name": "Infrastructure",
#     "level_code": "team",
#     "is_active": true
#   }
# }
```

### Bulk Tag Validation

```bash
# Validate multiple entity IDs
curl -X POST "https://api.cloudact.ai/api/v1/hierarchy/YOUR_ORG/validate" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_ids": ["TEAM-INFRA", "PROJ-CTO", "DEPT-CIO"]
  }'
```

---

## Summary

| Cloud Provider | Tag/Label Command | Key Field |
|----------------|------------------|-----------|
| **GCP** | `gcloud compute instances add-labels` | `--labels=entity_id=VALUE` |
| **AWS** | `aws ec2 create-tags` | `Key=entity_id,Value=VALUE` |
| **Azure** | `az vm update` | `--tags entity_id=VALUE` |
| **OCI** | `oci compute instance update` | `--freeform-tags '{"entity_id":"VALUE"}'` |

**Next Steps:**
1. Choose entity IDs from CloudAct hierarchy
2. Tag high-cost resources first (VMs, databases, storage)
3. Use bulk tagging scripts for existing resources
4. Enforce tagging in Terraform/IaC
5. Monitor unallocated costs in CloudAct dashboard

---

**Need Help?**
- View hierarchy: `GET /api/v1/hierarchy/{org}`
- Support: support@cloudact.ai
- Docs: https://docs.cloudact.ai/hierarchy
