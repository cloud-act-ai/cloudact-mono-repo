---
name: config-validator
description: |
  Configuration validation for CloudAct. Validate YAML pipelines, JSON schemas, and provider configs.
  Use when: validating pipeline configs, checking schema files, verifying provider registry,
  or debugging configuration issues.
---

# Configuration Validator

## Overview
CloudAct is configuration-driven. This skill validates all config types before deployment.

## Key Locations
- **Pipeline Configs:** `03-data-pipeline-service/configs/{provider}/{domain}/*.yml`
- **Provider Registry:** `03-data-pipeline-service/configs/system/providers.yml`
- **Bootstrap Schemas:** `02-api-service/configs/setup/bootstrap/schemas/*.json`
- **Onboarding Schemas:** `02-api-service/configs/setup/organizations/onboarding/schemas/*.json`
- **GenAI Pricing:** `02-api-service/configs/genai/seed/`

## Configuration Types

### 1. Pipeline YAML
```yaml
# Required fields
pipeline_id: string        # {org_slug}-{provider}-{domain}
name: string               # Human-readable name
version: string            # Semantic version (e.g., "1.0.0")
steps: array               # At least one step required
  - step_id: string        # Unique within pipeline
    ps_type: string        # Must exist in processor registry
    config: object         # Processor-specific config

# Optional fields
description: string
timeout_minutes: number    # Default: 30
schedule: object           # Cron-like schedule
variables: object          # Template variables
requires_auth: boolean     # Default: true
tags: array                # Categorization
category: string           # cost|usage|subscription|etl
```

### 2. Provider Registry (providers.yml)
```yaml
provider_name:
  type: string             # llm|cloud|saas
  credential_type: string  # api_key|service_account|oauth
  display_name: string
  api_base_url: string
  auth_header: string
  auth_prefix: string      # Bearer|Basic|ApiKey
  validation_endpoint: string
  rate_limit:
    requests_per_minute: number
    retry_after_seconds: number
  data_tables: object
  seed_path: string        # Optional
```

### 3. Bootstrap Schema (JSON)
```json
{
  "table_name": "string (required)",
  "description": "string",
  "schema": [
    {
      "name": "string (required)",
      "type": "STRING|INTEGER|FLOAT|BOOLEAN|TIMESTAMP|DATE|RECORD|JSON",
      "mode": "REQUIRED|NULLABLE|REPEATED",
      "description": "string"
    }
  ],
  "clustering": ["field1", "field2"],
  "partitioning": {
    "type": "DAY|MONTH|YEAR",
    "field": "field_name"
  }
}
```

## Instructions

### 1. Validate Pipeline YAML
```bash
# Check YAML syntax
python -c "
import yaml
import sys

try:
    with open('configs/{provider}/{domain}/{file}.yml') as f:
        config = yaml.safe_load(f)

    # Required fields
    required = ['pipeline_id', 'name', 'version', 'steps']
    missing = [f for f in required if f not in config]
    if missing:
        print(f'Missing required fields: {missing}')
        sys.exit(1)

    # Validate steps
    for step in config['steps']:
        if 'step_id' not in step or 'ps_type' not in step:
            print(f'Invalid step: {step}')
            sys.exit(1)

    print('Pipeline config valid!')
except yaml.YAMLError as e:
    print(f'YAML syntax error: {e}')
    sys.exit(1)
"
```

### 2. Validate Provider Registry
```bash
python -c "
import yaml

with open('configs/system/providers.yml') as f:
    providers = yaml.safe_load(f)

required = ['type', 'credential_type', 'display_name']
for name, config in providers.items():
    missing = [f for f in required if f not in config]
    if missing:
        print(f'{name}: missing {missing}')
    else:
        print(f'{name}: valid')
"
```

### 3. Validate JSON Schema
```bash
python -c "
import json
import sys

try:
    with open('configs/setup/bootstrap/schemas/{table}.json') as f:
        schema = json.load(f)

    # Required fields
    if 'table_name' not in schema:
        print('Missing table_name')
        sys.exit(1)

    if 'schema' not in schema or not schema['schema']:
        print('Missing or empty schema')
        sys.exit(1)

    # Validate field types
    valid_types = {'STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'TIMESTAMP', 'DATE', 'RECORD', 'JSON', 'BYTES'}
    for field in schema['schema']:
        if field.get('type') not in valid_types:
            print(f'Invalid type for {field[\"name\"]}: {field.get(\"type\")}')
            sys.exit(1)

    print('Schema valid!')
except json.JSONDecodeError as e:
    print(f'JSON syntax error: {e}')
    sys.exit(1)
"
```

### 4. Cross-Validate Pipeline vs Provider
```bash
python -c "
import yaml

# Load providers
with open('configs/system/providers.yml') as f:
    providers = yaml.safe_load(f)

# Load pipeline
with open('configs/{provider}/{domain}/{file}.yml') as f:
    pipeline = yaml.safe_load(f)

# Extract provider from ps_type
for step in pipeline['steps']:
    ps_type = step['ps_type']
    provider = ps_type.split('.')[0]

    if provider not in providers and provider != 'generic':
        print(f'Unknown provider in ps_type: {ps_type}')
    else:
        print(f'{ps_type}: valid')
"
```

### 5. Validate All Configs
```bash
# Full validation script
cd 03-data-pipeline-service

# Check all YAML files
find configs -name "*.yml" -exec python -c "import yaml; yaml.safe_load(open('{}'))" \;

# Check all JSON files
find ../02-api-service/configs -name "*.json" -exec python -c "import json; json.load(open('{}'))" \;
```

## Validation Rules

### Pipeline Rules
| Rule | Check |
|------|-------|
| P001 | pipeline_id follows naming convention |
| P002 | version is semantic (X.Y.Z) |
| P003 | All steps have unique step_id |
| P004 | ps_type references valid processor |
| P005 | timeout_minutes is reasonable (1-120) |
| P006 | schedule has valid type |

### Provider Rules
| Rule | Check |
|------|-------|
| R001 | type is llm|cloud|saas |
| R002 | credential_type is valid |
| R003 | api_base_url is valid URL |
| R004 | rate_limit has required fields |

### Schema Rules
| Rule | Check |
|------|-------|
| S001 | table_name is valid identifier |
| S002 | All fields have valid types |
| S003 | Required fields have mode: REQUIRED |
| S004 | Clustering fields exist in schema |
| S005 | Partition field exists and is DATE/TIMESTAMP |

## Validation Checklist
- [ ] All YAML files parse correctly
- [ ] All JSON files parse correctly
- [ ] Pipeline IDs follow convention
- [ ] ps_types reference existing processors
- [ ] Schemas have required fields
- [ ] Provider registry is complete

## Common Issues
| Issue | Solution |
|-------|----------|
| YAML indent error | Use spaces, not tabs |
| JSON trailing comma | Remove trailing commas |
| Unknown ps_type | Add processor or fix typo |
| Missing field | Add required field to config |

## Example Prompts

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
```

## Related Skills
- `pipeline-ops` - Pipeline management
- `bigquery-ops` - Schema operations
- `provider-mgmt` - Provider lifecycle
