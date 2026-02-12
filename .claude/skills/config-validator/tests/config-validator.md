# Configuration Validator - Test Plan

## Backend Tests

Configuration validation via Python scripts and pytest:
- **Pipeline configs:** `03-data-pipeline-service/configs/`
- **Bootstrap schemas:** `02-api-service/configs/setup/bootstrap/schemas/`
- **Onboarding schemas:** `02-api-service/configs/setup/organizations/onboarding/schemas/`
- **Provider registry:** `03-data-pipeline-service/configs/system/providers.yml`
- **Schema validation tests:** `03-data-pipeline-service/tests/test_08_schema_validation.py`
- **Run:** `cd 03-data-pipeline-service && source venv/bin/activate && python -m pytest tests/test_08_schema_validation.py -v`

### Test Matrix (30 checks)

| # | Test | Type | Rule | Expected |
|---|------|------|------|----------|
| 1 | All pipeline YAML files parse without errors | Syntax | -- | Zero YAML parse errors |
| 2 | All JSON schema files parse without errors | Syntax | -- | Zero JSON parse errors |
| 3 | Pipeline YAML has required fields (pipeline_id, name, version, steps) | Structure | P001 | All 4 fields present |
| 4 | Pipeline version is semantic (X.Y.Z) | Format | P002 | Regex `^\d+\.\d+\.\d+$` matches |
| 5 | Step IDs unique within each pipeline | Uniqueness | P003 | No duplicate step_id values |
| 6 | ps_type references valid processor | Reference | P004 | ps_type exists in processor registry |
| 7 | timeout_minutes between 1 and 120 | Range | P005 | Within bounds or absent |
| 8 | schedule type is valid | Format | P006 | cron or interval if present |
| 9 | Provider registry has required fields (type, credential_type, display_name) | Structure | R001-R002 | All 3 fields present per provider |
| 10 | Provider type is llm, cloud, or saas | Enum | R001 | Valid type value |
| 11 | Provider credential_type is valid | Enum | R002 | api_key, service_account, or oauth |
| 12 | Provider api_base_url is valid URL | Format | R003 | URL format if present |
| 13 | Provider rate_limit has required subfields | Structure | R004 | requests_per_minute + retry_after_seconds |
| 14 | Bootstrap schema table_name is valid identifier | Format | S001 | Matches `^[a-zA-Z_][a-zA-Z0-9_]*$` |
| 15 | Bootstrap schema field types are valid | Enum | S002 | STRING, INTEGER, FLOAT, etc. |
| 16 | Bootstrap schema clustering fields exist | Reference | S004 | All clustering fields in schema |
| 17 | Bootstrap schema partition field exists and is DATE/TIMESTAMP | Reference | S005 | Valid partition config |
| 18 | Onboarding schema table_name is valid identifier | Format | S001 | Matches `^[a-zA-Z_][a-zA-Z0-9_]*$` |
| 19 | Onboarding schema field types are valid | Enum | S002 | STRING, INTEGER, FLOAT, etc. |
| 20 | Onboarding schema clustering fields exist | Reference | S004 | All clustering fields in schema |
| 21 | Onboarding schema partition field exists | Reference | S005 | Valid partition config |
| 22 | Bootstrap table_name matches filename | Cross-check | S001 | org_profiles.json has table_name=org_profiles |
| 23 | No duplicate table_name across bootstrap schemas | Uniqueness | -- | All table_name values unique |
| 24 | No duplicate table_name across onboarding schemas | Uniqueness | -- | All table_name values unique |
| 25 | Pipeline provider exists in providers.yml | Cross-ref | P004 | Provider directory name in registry |
| 26 | cost_data_standard_1_3 has FOCUS 1.3 columns | Completeness | -- | Required FOCUS columns present |
| 27 | schema_versions table exists in onboarding schemas | Completeness | -- | schema_versions.json present |
| 28 | Bootstrap schema count matches expected | Inventory | -- | 27 JSON files |
| 29 | Onboarding schema count matches expected | Inventory | -- | 20 JSON files |
| 30 | providers.yml covers all pipeline provider directories | Coverage | -- | No orphan pipeline directories |

## Syntax Validation Commands

### YAML Syntax (all pipeline configs)

```bash
cd 03-data-pipeline-service

# Validate all YAML files parse correctly
python -c "
import yaml, glob, sys
errors = []
for f in glob.glob('configs/**/*.yml', recursive=True):
    try:
        yaml.safe_load(open(f))
    except yaml.YAMLError as e:
        errors.append(f'{f}: {e}')
if errors:
    for e in errors: print(e)
    sys.exit(1)
print(f'All YAML files valid ({len(glob.glob(\"configs/**/*.yml\", recursive=True))} files)')
"
```

### JSON Syntax (all schema files)

```bash
cd 02-api-service

# Validate all bootstrap schemas
python -c "
import json, glob, sys
errors = []
for f in glob.glob('configs/setup/bootstrap/schemas/*.json'):
    try:
        json.load(open(f))
    except json.JSONDecodeError as e:
        errors.append(f'{f}: {e}')
if errors:
    for e in errors: print(e)
    sys.exit(1)
print(f'All bootstrap schemas valid ({len(glob.glob(\"configs/setup/bootstrap/schemas/*.json\"))} files)')
"

# Validate all onboarding schemas
python -c "
import json, glob, sys
errors = []
for f in glob.glob('configs/setup/organizations/onboarding/schemas/*.json'):
    try:
        json.load(open(f))
    except json.JSONDecodeError as e:
        errors.append(f'{f}: {e}')
if errors:
    for e in errors: print(e)
    sys.exit(1)
print(f'All onboarding schemas valid ({len(glob.glob(\"configs/setup/organizations/onboarding/schemas/*.json\"))} files)')
"
```

### Provider Registry Validation

```bash
cd 03-data-pipeline-service

python -c "
import yaml, sys
with open('configs/system/providers.yml') as f:
    providers = yaml.safe_load(f)

required = ['type', 'credential_type', 'display_name']
valid_types = {'llm', 'cloud', 'saas'}
valid_creds = {'api_key', 'service_account', 'oauth'}
errors = []

for name, config in providers.items():
    missing = [f for f in required if f not in config]
    if missing:
        errors.append(f'{name}: missing {missing}')
    if config.get('type') not in valid_types:
        errors.append(f'{name}: invalid type \"{config.get(\"type\")}\" (must be llm/cloud/saas)')
    if config.get('credential_type') not in valid_creds:
        errors.append(f'{name}: invalid credential_type \"{config.get(\"credential_type\")}\"')

if errors:
    for e in errors: print(e)
    sys.exit(1)
print(f'Provider registry valid ({len(providers)} providers)')
"
```

### Cross-Validation (Pipeline vs Provider)

```bash
cd 03-data-pipeline-service

python -c "
import yaml, os, sys

# Load providers
with open('configs/system/providers.yml') as f:
    providers = set(yaml.safe_load(f).keys())

# Get pipeline provider directories
pipeline_dirs = set()
for category in ['cloud', 'genai']:
    category_path = f'configs/{category}'
    if os.path.isdir(category_path):
        for entry in os.listdir(category_path):
            if os.path.isdir(os.path.join(category_path, entry)):
                pipeline_dirs.add(entry)

# Check for orphan directories
system_dirs = {'system', 'aggregated', 'notify_systems', 'subscription', 'alerts', 'unified', 'payg', 'commitment', 'infrastructure', 'cost', 'api'}
orphans = pipeline_dirs - providers - system_dirs
if orphans:
    print(f'WARNING: Pipeline directories without provider entry: {orphans}')
else:
    print(f'Cross-validation passed (providers: {len(providers)}, pipeline dirs checked)')
"
```

### Schema Field Type Validation

```bash
cd 02-api-service

python -c "
import json, glob, sys

valid_types = {'STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'TIMESTAMP', 'DATE', 'RECORD', 'JSON', 'BYTES', 'FLOAT64', 'INT64'}
valid_modes = {'REQUIRED', 'NULLABLE', 'REPEATED'}
errors = []

for f in glob.glob('configs/setup/bootstrap/schemas/*.json') + glob.glob('configs/setup/organizations/onboarding/schemas/*.json'):
    schema = json.load(open(f))
    for field in schema.get('schema', []):
        if field.get('type') not in valid_types:
            errors.append(f'{f}: field \"{field[\"name\"]}\" has invalid type \"{field.get(\"type\")}\"')
        if field.get('mode') and field['mode'] not in valid_modes:
            errors.append(f'{f}: field \"{field[\"name\"]}\" has invalid mode \"{field[\"mode\"]}\"')

    # Clustering field existence
    for cluster_field in schema.get('clustering', []):
        field_names = [f_['name'] for f_ in schema.get('schema', [])]
        if cluster_field not in field_names:
            errors.append(f'{f}: clustering field \"{cluster_field}\" not in schema')

    # Partition field existence
    part = schema.get('partitioning', {})
    if part.get('field'):
        field_names = [f_['name'] for f_ in schema.get('schema', [])]
        if part['field'] not in field_names:
            errors.append(f'{f}: partition field \"{part[\"field\"]}\" not in schema')

if errors:
    for e in errors: print(e)
    sys.exit(1)
print(f'All schema fields valid')
"
```

## Pipeline Service Schema Test

```bash
cd 03-data-pipeline-service
source venv/bin/activate
python -m pytest tests/test_08_schema_validation.py -v
```

| Domain | File | Tests |
|--------|------|-------|
| Schema validation | `tests/test_08_schema_validation.py` | Pipeline config structure, field types, required fields |

## SDLC Verification

| Check | Command | Expected |
|-------|---------|----------|
| Pre-deploy validation | Run all validation scripts above | Exit code 0 |
| Schema count (bootstrap) | `ls 02-api-service/configs/setup/bootstrap/schemas/*.json \| wc -l` | 27 |
| Schema count (onboarding) | `ls 02-api-service/configs/setup/organizations/onboarding/schemas/*.json \| wc -l` | 20 |
| Pipeline YAML count | `find 03-data-pipeline-service/configs -name "*.yml" \| wc -l` | 32 |
| CI integration | Validation scripts run before Cloud Build deploy step | Fail build on errors |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| YAML syntax | Open each .yml in YAML linter | No syntax errors |
| JSON syntax | Open each .json in JSON linter | No syntax errors, no trailing commas |
| Pipeline required fields | Inspect pipeline YAML | pipeline_id, name, version, steps present |
| Step uniqueness | Check step_id values per pipeline | No duplicates |
| Provider completeness | Compare provider dirs vs providers.yml | All directories represented |
| Schema table_name match | Compare JSON filename vs table_name field | Consistent naming |
| Clustering integrity | Check clustering fields exist in schema | All references resolve |
| Partition integrity | Check partition field type is DATE/TIMESTAMP | Valid partition config |
| FOCUS 1.3 columns | Check cost_data_standard_1_3.json | All mandatory FOCUS columns present |
| schema_versions exists | Check onboarding schemas directory | schema_versions.json present |
| Cross-ref pipeline to provider | ps_type provider prefix in providers.yml | All providers registered |
| No duplicate table_name | Collect all table_name values | Globally unique within each schema set |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| YAML syntax | 0 parse errors across all .yml files |
| JSON syntax | 0 parse errors across all .json files |
| Pipeline rules (P001-P006) | 0 ERROR-severity violations |
| Registry rules (R001-R004) | 0 ERROR-severity violations |
| Schema rules (S001-S005) | 0 ERROR-severity violations |
| Cross-validation | 0 orphan references |
| Bootstrap schema count | 27 files |
| Onboarding schema count | 20 files |
| Pipeline schema test | `test_08_schema_validation.py` 100% passing |
| table_name uniqueness | 0 duplicates within each schema set |

## Known Limitations

1. **ps_type processor registry not codified**: Processor classes exist in code but there is no formal registry file; P004 validation currently checks against provider names rather than a complete processor map
2. **FOCUS 1.3 column list**: The mandatory FOCUS 1.3 columns are defined by the FinOps Foundation spec; changes to the spec require manual update of the validation check
3. **Schema evolution**: Validation checks current schema files but cannot detect if BigQuery tables have drifted from the JSON definitions (use `/bootstrap-onboard` status endpoints for drift detection)
4. **YAML template variables**: Some pipeline YAMLs use `${variable}` template syntax that is resolved at runtime; validation treats these as literal strings
5. **Nested RECORD types**: JSON schemas with `RECORD` type fields containing nested `fields` arrays require recursive validation not covered by basic field-type checks
6. **Provider directory mapping**: Cloud providers use subdirectories (e.g., `cloud/gcp/`) while GenAI uses different nesting (e.g., `genai/payg/openai.yml`); cross-validation must account for both patterns
7. **Config count may change**: Bootstrap (27) and onboarding (20) counts reflect current state; adding new tables changes these numbers -- update test expectations accordingly
