# Infrastructure vs Deployment Directory Comparison

This document clarifies the difference between the `/infrastructure` and `/deployment` directories.

## Overview

The project now has **two deployment approaches**:

1. **`/deployment`** - Existing Cloud Build-based deployment (Agent 3)
2. **`/infrastructure`** - New Terraform + Kubernetes IaC (Agent 1)

Both are valid and serve different use cases.

---

## Directory Comparison

| Aspect | `/deployment` | `/infrastructure` |
|--------|---------------|-------------------|
| **Created By** | Agent 3 | Agent 1 |
| **Approach** | Cloud Build + gcloud | Terraform + kubectl |
| **Infrastructure** | Manual GKE setup | Terraform-managed GKE |
| **Best For** | CI/CD automation | Full IaC, reproducible infrastructure |
| **Prerequisites** | Existing GKE cluster | None (creates everything) |
| **Deployment Tool** | Cloud Build | Terraform + kubectl |
| **Version Control** | Application code | Infrastructure + Application |

---

## `/deployment` Directory (Agent 3)

**Purpose**: CI/CD deployment using Cloud Build

### Files:
```
deployment/
├── cloudbuild.yaml              # Cloud Build pipeline
├── cloudbuild-test.yaml         # Test pipeline
├── deploy.sh                    # Deployment script
├── rollback.sh                  # Rollback script
├── migrate.sh                   # Database migration
├── cloud-scheduler-jobs.yaml    # Scheduler configuration
├── deploy-scheduler-jobs.sh     # Scheduler deployment
└── environments/                # Environment-specific configs
    ├── dev.yaml
    ├── staging.yaml
    └── production.yaml
```

### Use Case:
- **Application deployment** to existing infrastructure
- CI/CD pipeline with Cloud Build
- Multi-environment deployments (dev/staging/prod)
- Assumes GKE cluster already exists

### Workflow:
1. Push code to repository
2. Cloud Build triggers automatically
3. Runs tests
4. Builds Docker image
5. Deploys to GKE
6. Runs migrations

---

## `/infrastructure` Directory (Agent 1)

**Purpose**: Complete Infrastructure-as-Code

### Files:
```
infrastructure/
├── terraform/                   # GCP infrastructure
│   ├── main.tf                 # Core resources
│   ├── gke.tf                  # GKE cluster
│   ├── iam.tf                  # Service accounts
│   ├── network.tf              # VPC, Cloud Armor
│   ├── variables.tf            # Input variables
│   ├── outputs.tf              # Output values
│   └── terraform.tfvars.example
├── kubernetes/                  # K8s manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   ├── configmap.yaml
│   └── ...
├── docker/                      # Container configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .dockerignore
├── deploy.sh                    # Automated deployment
├── cleanup.sh                   # Resource cleanup
├── README.md                    # Full documentation
└── QUICKSTART.md               # 5-minute guide
```

### Use Case:
- **Infrastructure provisioning** from scratch
- Complete environment setup
- Disaster recovery
- Multi-region deployment
- Full control over infrastructure

### Workflow:
1. Configure `terraform.tfvars`
2. Run `terraform apply` (creates GKE, VPC, IAM, etc.)
3. Build and push Docker image
4. Deploy Kubernetes manifests
5. Application is running

---

## When to Use Which?

### Use `/deployment` (Cloud Build) When:

✓ You already have GKE cluster set up
✓ You want automated CI/CD
✓ You need quick application deployments
✓ You prefer Google Cloud Build
✓ You want Git-based deployments
✓ Infrastructure is managed separately

**Example**:
```bash
# Deploy to dev environment
gcloud builds submit --config=deployment/cloudbuild.yaml \
  --substitutions=_ENV=dev
```

### Use `/infrastructure` (Terraform) When:

✓ You need to create infrastructure from scratch
✓ You want full Infrastructure-as-Code
✓ You need to recreate environments easily
✓ You want infrastructure version control
✓ You prefer Terraform over gcloud
✓ You need disaster recovery capability
✓ You want to deploy to multiple GCP projects

**Example**:
```bash
# Create entire environment
cd infrastructure/terraform
terraform apply

# Deploy application
cd ../
./deploy.sh
```

---

## Recommended Approach

### For New Deployments (Greenfield):

Use **`/infrastructure`** first, then **`/deployment`** for CI/CD:

1. **One-time setup** with `/infrastructure`:
   ```bash
   cd infrastructure
   ./deploy.sh  # Creates GKE, VPC, IAM, deploys app
   ```

2. **Ongoing deployments** with `/deployment`:
   ```bash
   git push  # Triggers Cloud Build pipeline
   ```

### For Existing Deployments:

Continue using **`/deployment`** for application deployments.

Use **`/infrastructure`** for:
- Creating new environments (staging, production)
- Disaster recovery
- Infrastructure updates

---

## Combined Workflow

**Best of both worlds**:

```bash
# 1. Initial Infrastructure Setup (once)
cd infrastructure/terraform
terraform apply  # Creates GKE cluster, VPC, etc.

# 2. Configure Cloud Build to use this cluster
# Update deployment/environments/*.yaml with cluster details

# 3. Use Cloud Build for application deployments
gcloud builds submit --config=deployment/cloudbuild.yaml

# 4. Use Terraform for infrastructure changes
cd infrastructure/terraform
terraform apply  # Update cluster size, add resources, etc.
```

---

## Key Differences

| Feature | `/deployment` | `/infrastructure` |
|---------|---------------|-------------------|
| Creates GKE | No | Yes |
| Creates VPC | No | Yes |
| Creates IAM | No | Yes |
| Deploys App | Yes | Yes |
| CI/CD Integration | Yes (Cloud Build) | Manual/External |
| Infrastructure State | N/A | Terraform state |
| Rollback | Application only | Full infrastructure |
| Multi-environment | Via Cloud Build | Via Terraform workspaces |

---

## Migration Path

### From `/deployment` to `/infrastructure`:

If you're currently using `/deployment` and want to adopt Terraform:

1. **Document existing infrastructure**:
   ```bash
   gcloud container clusters describe <cluster-name>
   gcloud compute networks describe <network-name>
   ```

2. **Import existing resources** to Terraform:
   ```bash
   terraform import google_container_cluster.primary <cluster-name>
   ```

3. **Gradually adopt** Terraform for new resources

4. **Keep Cloud Build** for application deployments

### From `/infrastructure` to `/deployment`:

If you created infrastructure with Terraform and want CI/CD:

1. **Note your cluster details** from Terraform outputs
2. **Configure Cloud Build** in `/deployment`
3. **Use Cloud Build** for application deployments
4. **Keep Terraform** for infrastructure changes

---

## Conclusion

**Both approaches are valid**:

- **`/deployment`**: Application-focused, CI/CD automation
- **`/infrastructure`**: Infrastructure-focused, full IaC

**Recommendation**:
- Use `/infrastructure` for **infrastructure provisioning**
- Use `/deployment` for **application deployment**
- Combine both for a complete DevOps workflow

---

**Questions?**
- Infrastructure: See `infrastructure/README.md`
- Deployment: See `deployment/README.md`
