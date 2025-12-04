# Cloud Provider Costs

**Status**: GCP IMPLEMENTED | AWS/Azure NOT IMPLEMENTED

## What
Track cloud infrastructure costs from GCP, AWS, Azure.

## Examples
- GCP Compute Engine us-central1: $45/day
- GCP BigQuery: $12/day
- AWS EC2 (future): $50/day
- Azure VMs (future): $40/day

## GCP (IMPLEMENTED)
- Integration: Service account setup
- Pipeline: `configs/gcp/cost/billing.yml`
- Data: `{org_slug}_prod.gcp_billing_*`
- Dashboard: Cost by service, region, trend charts

## AWS (NOT IMPLEMENTED)
- [ ] Cost Explorer API integration
- [ ] IAM role setup
- [ ] Billing extraction pipeline
- [ ] Dashboard charts

## Azure (NOT IMPLEMENTED)
- [ ] Cost Management API integration
- [ ] Service principal setup
- [ ] Billing extraction pipeline
- [ ] Dashboard charts
