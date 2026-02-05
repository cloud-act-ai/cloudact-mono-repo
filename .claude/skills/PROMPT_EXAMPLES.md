# CloudAct Skills - Prompt Examples

Quick reference for triggering each skill with example prompts.

---

## pipeline-ops

**Purpose:** Pipeline lifecycle management (create, validate, run, monitor)

```
# Creating Pipelines
"Create a new pipeline for OpenAI usage extraction"
"Add a daily cost calculation pipeline for Anthropic"
"I need a monthly subscription sync pipeline for DeepSeek"

# Running Pipelines
"Run the GCP cost pipeline for acme_corp"
"Execute the usage extraction pipeline"
"Trigger the subscription sync for all orgs"

# Debugging Pipelines
"Pipeline failed with 'processor not found' error"
"Why is my pipeline timing out?"
"The pipeline run shows status 'failed' - help me debug"

# Validating Pipelines
"Check if my pipeline YAML is correct"
"Validate the ps_type in this pipeline config"
"What processors are available for OpenAI?"
```

---

## bigquery-ops

**Purpose:** BigQuery schema, tables, queries, optimization

```
# Schema Operations
"Create a new table schema for usage tracking"
"Add a column to the cost_data_standard_1_3 table"
"What's the schema for org_hierarchy table?"

# Querying
"Query total costs by provider for acme_corp"
"Get all pipeline runs from the last 24 hours"
"Show me the top 10 most expensive LLM models"

# Optimization
"How can I optimize this BigQuery query?"
"Add clustering to improve query performance"
"What partition strategy should I use for daily costs?"

# Troubleshooting
"Query is scanning too much data"
"Table not found error in BigQuery"
"How do I check if a dataset exists?"
```

---

## integration-setup

**Purpose:** Cloud/LLM/SaaS provider integrations

```
# Setting Up Integrations
"Setup OpenAI integration for acme_corp"
"Configure GCP billing export integration"
"Add Anthropic API credentials for our org"
"Connect Gemini API to CloudAct"

# Verifying Integrations
"Check if our OpenAI integration is working"
"Verify the GCP credentials are valid"
"List all integrations for acme_corp"

# Troubleshooting
"Integration showing 'invalid credentials' error"
"API key validation failed for Anthropic"
"How do I rotate integration credentials?"

# Managing Credentials
"Are our API keys encrypted?"
"Update the OpenAI API key"
"Remove the old GCP service account"
```

---

## cost-analysis

**Purpose:** FOCUS 1.3 costs, multi-currency, allocation

```
# Analyzing Costs
"Show total costs by provider for this month"
"What are our LLM costs broken down by model?"
"Compare costs between departments"

# Multi-Currency
"Costs showing in wrong currency for acme_in"
"How do exchange rates work in CloudAct?"
"Convert USD costs to INR for reporting"

# FOCUS 1.3
"What FOCUS 1.3 fields are required?"
"Map our cost data to FOCUS standard"
"Explain the EffectiveCost vs ListCost difference"

# Cost Allocation
"Allocate costs to the Engineering department"
"How do I assign costs to a specific team?"
"Show costs by hierarchy level"

# Troubleshooting
"Why are costs showing as zero?"
"Missing costs for the last billing period"
"Token costs don't match the invoice"
```

---

## test-orchestration

**Purpose:** Multi-org/currency testing infrastructure

```
# Running Tests
"Run all API tests"
"Execute the frontend E2E tests"
"Run pipeline processor tests"

# Multi-Org Testing
"Test with all 6 org fixtures"
"Run currency conversion tests"
"Test across different fiscal years"

# Specific Test Suites
"Run security tests only"
"Execute cost calculation unit tests"
"Run the subscription tests"

# Test Infrastructure
"How do I add a new test fixture?"
"What org fixtures are available?"
"Setup test data for multi-currency"

# Debugging Tests
"Test failing with async timeout"
"Mock BigQuery not working correctly"
"How do I run a single test?"
```

---

## bootstrap-onboard

**Purpose:** System initialization and org onboarding

```
# Bootstrap
"Initialize a new CloudAct deployment"
"Run bootstrap to create meta tables"
"What tables does bootstrap create?"

# Onboarding
"Onboard a new organization called acme_eu"
"Create org with EUR currency"
"Setup org with India fiscal year"

# Verification
"Verify bootstrap completed successfully"
"Check if all 14 meta tables exist"
"Confirm org dataset was created"

# Troubleshooting
"Bootstrap failed with permission error"
"Org onboarding stuck at table creation"
"How do I re-run bootstrap safely?"

# Understanding Structure
"What's the difference between bootstrap and onboarding?"
"Which tables are org-specific vs shared?"
"Explain the API key hierarchy"
```

---

## config-validator

**Purpose:** Validate YAML/JSON configs

```
# Pipeline Validation
"Validate my pipeline YAML file"
"Check if ps_type is correct"
"Is this pipeline config valid?"

# Schema Validation
"Validate the BigQuery schema JSON"
"Check bootstrap schema files"
"Are all required fields present?"

# Provider Validation
"Validate providers.yml syntax"
"Check if provider config is complete"
"Is the rate limit configured correctly?"

# Bulk Validation
"Validate all pipeline configs"
"Check all JSON schemas in the project"
"Run validation on entire configs folder"

# Troubleshooting
"YAML parsing error on line 15"
"Missing required field in config"
"Invalid type in schema definition"
```

---

## deploy-check

**Purpose:** Deployment automation and verification

```
# Pre-Deployment
"What should I check before deploying?"
"Run pre-deployment validation"
"Is the code ready for production?"

# Deploying
"Deploy to staging environment"
"Promote staging to production"
"How do I deploy the pipeline service?"

# Verification
"Verify staging deployment is healthy"
"Check production health endpoints"
"Are all services responding?"

# Rollback
"Rollback to previous version"
"List available revisions"
"How do I revert a failed deployment?"

# Troubleshooting
"Deployment failed at build step"
"Health check timeout after deploy"
"Container not starting in Cloud Run"
```

---

## security-audit

**Purpose:** Security checks, KMS, auth, OWASP

```
# Credential Security
"Are all credentials encrypted with KMS?"
"Check for plain text secrets in code"
"Audit API key usage patterns"

# Authentication
"Is authentication properly configured?"
"Check for DISABLE_AUTH in production"
"Verify root key is secure"

# Security Testing
"Run security tests"
"Check for OWASP vulnerabilities"
"Audit BigQuery access permissions"

# Compliance
"Is our setup OWASP compliant?"
"Review security configuration"
"Generate security audit report"

# Troubleshooting
"Auth failing in production"
"KMS decryption error"
"Unauthorized access detected"
```

---

## env-setup

**Purpose:** Development environment setup

```
# Initial Setup
"Setup local development environment"
"How do I get started with CloudAct?"
"Initialize the project for first time"

# Docker
"Start services with Docker Compose"
"Build Docker images locally"
"Why is container not starting?"

# Dependencies
"Install Python dependencies"
"Setup Node.js for frontend"
"Configure GCP credentials locally"

# Configuration
"What environment variables do I need?"
"Setup .env.local for frontend"
"Configure Supabase for local dev"

# Troubleshooting
"Port 8000 already in use"
"GCP auth not working locally"
"npm install failing with errors"
```

---

## api-dev

**Purpose:** FastAPI patterns for backend

```
# Creating Endpoints
"Create a new API endpoint for features"
"Add a GET endpoint for listing items"
"Implement POST endpoint with validation"

# Schemas
"Create Pydantic request schema"
"Add response model for my endpoint"
"How do I validate input data?"

# Authentication
"Add auth to my new endpoint"
"Use org API key validation"
"Implement root key check"

# Patterns
"How do I add pagination?"
"Implement filtering on list endpoint"
"Add error handling to my router"

# Testing
"Write tests for my new endpoint"
"How do I mock BigQuery in tests?"
"Test authentication on endpoint"
```

---

## frontend-dev

**Purpose:** Next.js patterns for frontend

```
# Creating Pages
"Create a new page for analytics"
"Add a settings page under org"
"Implement loading state for page"

# Components
"Create a data table component"
"Add a form with validation"
"Build a chart for cost data"

# Server Actions
"Create server action for form submit"
"Implement data fetching action"
"Add revalidation after mutation"

# Patterns
"How do I use SWR for data fetching?"
"Add Supabase auth to page"
"Implement proper error handling"

# Styling
"Use the correct brand colors"
"Add badge with mint color"
"Style button following design system"
```

---

## provider-mgmt

**Purpose:** Add and manage providers

```
# Adding Providers
"Add a new LLM provider called Mistral"
"Register AWS as a cloud provider"
"Setup a new SaaS provider"

# Configuration
"Configure rate limits for new provider"
"Add validation endpoint for provider"
"Setup seed data for pricing"

# Provider Lifecycle
"What steps to add a complete provider?"
"Create processor for new provider"
"Add pipeline configs for provider"

# Troubleshooting
"Provider not found in registry"
"Processor not registered error"
"Validation endpoint failing"

# Existing Providers
"List all configured providers"
"What providers are currently active?"
"Show provider configuration for OpenAI"
```

---

## quota-mgmt

**Purpose:** Usage limits and enforcement

```
# Checking Quotas
"What's our current quota usage?"
"Check API call limits for acme_corp"
"How many pipeline runs remaining?"

# Configuring Quotas
"Increase API quota for acme_corp"
"Set storage limit to 500GB"
"Configure custom quota limits"

# Enforcement
"Why am I getting 429 errors?"
"Quota exceeded - what now?"
"How does quota enforcement work?"

# Resetting
"Reset quota for testing"
"When do quotas reset?"
"Manual quota reset needed"

# Alerts
"Setup quota warning alerts"
"Get notified at 80% usage"
"Configure email for quota alerts"
```

---

## hierarchy-ops

**Purpose:** Org structure and cost allocation

```
# Creating Structure
"Create Engineering department"
"Add Platform project under Engineering"
"Create Backend team"

# Viewing Hierarchy
"Show full org hierarchy"
"List all departments"
"Get teams under Platform project"

# Cost Allocation
"Assign subscription to Engineering dept"
"Allocate costs to Backend team"
"Show costs by department"

# Management
"Move team to different project"
"Rename department"
"Deactivate old team"

# Troubleshooting
"Costs not showing for department"
"Hierarchy path mismatch error"
"Cannot delete department with children"
```

---

---

## web-research

**Purpose:** Internet research for LLM pricing, provider comparisons, market analysis

```
# Pricing Research
"Search for current OpenAI pricing"
"What's the latest Claude 3.5 Sonnet price per million tokens?"
"Find Gemini 2.0 Flash pricing"
"Look up DeepSeek API costs"

# Comparisons
"Compare LLM pricing across all major providers"
"Which is cheaper: Claude or GPT-4o for high volume?"
"Research the most cost-effective LLM for embeddings"

# Analysis
"Analyze LLM pricing trends over the last 6 months"
"Calculate cost difference between providers for 10M tokens/month"
"Find the best value LLM for code generation"

# Updates
"Check if our LLM pricing data is current"
"Has any provider changed pricing this month?"
"Update our pricing table with latest rates"

# New Providers
"Research Mistral AI API and pricing"
"Evaluate Cohere for embeddings use case"
"Find information about Groq pricing"
```

---

## pr-review

**Purpose:** PR review, validation, test execution, and safe merge

```
# Reviewing PRs
"Review PR #123"
"Analyze the changes in PR 45"
"Check PR #67 for breaking changes"
"What files changed in PR #89?"

# Validation & Tests
"Run tests for PR #123 before merge"
"Validate PR 45 is safe to merge"
"Check if PR #67 passes all checks"
"Run full test suite for PR #89"

# Security & Quality
"Check PR #123 for security issues"
"Review PR 45 for large deletions"
"Are there any secrets in PR #67?"
"Check brand files in PR #89"

# Merge Operations
"Approve and merge PR #123"
"Squash merge PR 45 after tests pass"
"Request changes on PR #67 - needs tests"
"Merge PR #89 to main"

# Full Workflow
"Full PR review workflow for #123"
"Complete validation and merge for PR #45"
"Review, test, and merge PR #67"
```

---

## Combined Scenarios

These prompts trigger multiple skills together:

```
# New Feature End-to-End
"I need to add Mistral AI as a new provider with usage tracking"
→ provider-mgmt + pipeline-ops + integration-setup + bigquery-ops

# Deployment Preparation
"Prepare for production release with full testing"
→ test-orchestration + security-audit + deploy-check + config-validator

# PR Review & Merge
"Review and merge PR #123 with full validation"
→ pr-review + test-orchestration + security-audit

# Cost Investigation
"Why are Engineering department costs not showing correctly?"
→ cost-analysis + hierarchy-ops + bigquery-ops

# New Org Setup
"Onboard new customer 'techcorp' with EUR currency and full hierarchy"
→ bootstrap-onboard + hierarchy-ops + quota-mgmt

# Debug Pipeline Failure
"Pipeline run failed for anthropic usage extraction"
→ pipeline-ops + config-validator + integration-setup
```

---

## Tips for Better Results

1. **Be specific** - Include org names, provider names, specific errors
2. **State your goal** - "I want to..." is better than "How do I..."
3. **Provide context** - Mention relevant files, error messages, or current state
4. **Use domain terms** - "pipeline", "FOCUS 1.3", "ps_type", "hierarchy"

---

*Last Updated: 2026-02-05*
