---
name: api-dev
description: |
  FastAPI development patterns for CloudAct. Routers, schemas, processors, middleware.
  Use when: creating API endpoints, adding routers, defining Pydantic schemas, implementing middleware,
  or following CloudAct's FastAPI patterns.
---

# API Development

## Overview
CloudAct uses FastAPI with Pydantic for type-safe API development across two services.

## Environments

| Env | GCP Project | API URL | Pipeline URL | GCP Key File |
|-----|-------------|---------|--------------|--------------|
| local | cloudact-testing-1 | `http://localhost:8000` | `http://localhost:8001` | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| test/stage | cloudact-testing-1 | Cloud Run URL | Cloud Run URL | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| prod | cloudact-prod | `https://api.cloudact.ai` | `https://pipeline.cloudact.ai` | `/Users/openclaw/.gcp/cloudact-prod.json` |

> **Note:** local/test/stage all use `cloudact-testing-1`. No separate `cloudact-stage` project.

### Local Dev

```bash
REPO_ROOT=/Users/openclaw/.openclaw/workspace/cloudact-mono-repo

# API Service (port 8000)
cd $REPO_ROOT/02-api-service && source venv/bin/activate
python -m uvicorn src.app.main:app --port 8000 --reload

# Pipeline Service (port 8001)
cd $REPO_ROOT/03-data-pipeline-service && source venv/bin/activate
python -m uvicorn src.app.main:app --port 8001 --reload
```

### GCP Auth (for BigQuery access)

```bash
# Stage/test
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json

# Prod
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
```

## Key Locations
- **API Service App:** `02-api-service/src/app/`
- **Pipeline Service App:** `03-data-pipeline-service/src/app/`
- **Routers:** `src/app/routers/`
- **Schemas:** `src/app/schemas/`
- **Core Logic:** `src/core/`

## Project Structure
```
src/
├── app/
│   ├── main.py              # FastAPI app entry
│   ├── routers/             # API endpoints
│   │   ├── admin.py         # Bootstrap endpoints
│   │   ├── organizations.py # Org management
│   │   ├── integrations.py  # Provider setup
│   │   ├── subscriptions.py # SaaS subscriptions
│   │   └── pipelines.py     # Pipeline execution
│   ├── schemas/             # Pydantic models
│   │   ├── requests.py      # Request models
│   │   └── responses.py     # Response models
│   └── middleware/          # Auth, rate limiting
│       ├── auth.py
│       └── rate_limit.py
├── core/
│   ├── engine/              # BigQuery client
│   ├── processors/          # Business logic
│   ├── security/            # KMS encryption
│   └── utils/               # Helpers
└── configs/                 # Configuration files
```

## Instructions

### 1. Create New Router
```python
# src/app/routers/my_feature.py
from fastapi import APIRouter, Depends, HTTPException
from typing import List

from src.app.schemas.requests import MyFeatureRequest
from src.app.schemas.responses import MyFeatureResponse
from src.app.middleware.auth import verify_org_key

router = APIRouter(
    prefix="/api/v1/my-feature",
    tags=["my-feature"],
    dependencies=[Depends(verify_org_key)]
)

@router.get("/{org_slug}", response_model=List[MyFeatureResponse])
async def list_features(org_slug: str):
    """List all features for an organization."""
    # Implementation
    return []

@router.post("/{org_slug}", response_model=MyFeatureResponse)
async def create_feature(
    org_slug: str,
    request: MyFeatureRequest
):
    """Create a new feature."""
    # Implementation
    return MyFeatureResponse(...)
```

### 2. Register Router in main.py
```python
# src/app/main.py
from fastapi import FastAPI
from src.app.routers import (
    admin,
    organizations,
    integrations,
    subscriptions,
    my_feature,  # Add new router
)

app = FastAPI(
    title="CloudAct API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Register routers
app.include_router(admin.router)
app.include_router(organizations.router)
app.include_router(integrations.router)
app.include_router(subscriptions.router)
app.include_router(my_feature.router)  # Add new router
```

### 3. Define Pydantic Schemas
```python
# src/app/schemas/requests.py
from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime

class MyFeatureRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    amount: float = Field(..., gt=0)
    currency: str = Field(default="USD", pattern="^[A-Z]{3}$")

    @validator("name")
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "name": "My Feature",
                "description": "Description here",
                "amount": 100.00,
                "currency": "USD"
            }
        }
```

```python
# src/app/schemas/responses.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MyFeatureResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    amount: float
    currency: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

### 4. Add Authentication Dependency
```python
# src/app/middleware/auth.py
from fastapi import Request, HTTPException, Depends
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
root_key_header = APIKeyHeader(name="X-CA-Root-Key", auto_error=False)

async def verify_org_key(
    request: Request,
    api_key: str = Depends(api_key_header)
):
    """Verify organization API key."""
    if not api_key:
        raise HTTPException(401, "Missing API key")

    # Validate key against BigQuery
    org_slug = request.path_params.get("org_slug")
    if not await validate_key(api_key, org_slug):
        raise HTTPException(401, "Invalid API key")

    return api_key

async def verify_root_key(
    root_key: str = Depends(root_key_header)
):
    """Verify root API key for admin operations."""
    if not root_key or root_key != settings.CA_ROOT_API_KEY:
        raise HTTPException(401, "Invalid root key")
    return root_key
```

### 5. Create Processor (Business Logic)
```python
# src/core/processors/my_feature/processor.py
from typing import List, Optional
from src.core.engine.bq_client import BigQueryClient

class MyFeatureProcessor:
    def __init__(self, bq_client: BigQueryClient):
        self.bq = bq_client

    async def list_features(
        self,
        org_slug: str,
        limit: int = 100
    ) -> List[dict]:
        query = f"""
        SELECT * FROM `{org_slug}_prod.my_features`
        ORDER BY created_at DESC
        LIMIT {limit}
        """
        return await self.bq.query(query)

    async def create_feature(
        self,
        org_slug: str,
        data: dict
    ) -> dict:
        # Insert into BigQuery
        await self.bq.insert_rows(
            f"{org_slug}_prod.my_features",
            [data]
        )
        return data
```

### 6. Add Error Handling
```python
# Standard error response
from fastapi import HTTPException

# 400 - Bad Request
raise HTTPException(400, "Invalid input: {details}")

# 401 - Unauthorized
raise HTTPException(401, "Invalid API key")

# 403 - Forbidden
raise HTTPException(403, "Access denied to this resource")

# 404 - Not Found
raise HTTPException(404, f"Resource {id} not found")

# 409 - Conflict
raise HTTPException(409, "Resource already exists")

# 429 - Rate Limited
raise HTTPException(429, "Rate limit exceeded")

# 500 - Internal Error
raise HTTPException(500, "Internal server error")
```

### 7. Add Tests
```python
# tests/test_my_feature.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_list_features(client: AsyncClient, org_fixture):
    response = await client.get(
        f"/api/v1/my-feature/{org_fixture['slug']}",
        headers={"X-API-Key": org_fixture['api_key']}
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_create_feature(client: AsyncClient, org_fixture):
    response = await client.post(
        f"/api/v1/my-feature/{org_fixture['slug']}",
        headers={"X-API-Key": org_fixture['api_key']},
        json={
            "name": "Test Feature",
            "amount": 100.00,
            "currency": "USD"
        }
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test Feature"
```

## API Patterns

### Pagination
```python
@router.get("/{org_slug}")
async def list_items(
    org_slug: str,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0)
):
    return await processor.list(org_slug, limit, offset)
```

### Filtering
```python
@router.get("/{org_slug}")
async def list_items(
    org_slug: str,
    status: Optional[str] = None,
    provider: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    filters = {k: v for k, v in locals().items() if v is not None}
    return await processor.list(org_slug, **filters)
```

### Versioning
```python
# Include version in path
prefix="/api/v1/my-feature"

# Or in header
@router.get("/", headers={"X-API-Version": "1.0"})
```

## Validation Checklist
- [ ] Router registered in main.py
- [ ] Pydantic schemas defined
- [ ] Auth dependency applied
- [ ] Error handling complete
- [ ] Tests written
- [ ] API docs accurate

## Example Prompts

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
```

## Development Rules (Non-Negotiable)

- **No over-engineering** - Simple, direct fixes. Don't add features, refactor, or make "improvements" beyond what was asked.
- **Multi-tenancy support** - Proper `org_slug` isolation in every endpoint and query
- **Enterprise-grade for 10k customers** - Must scale. Rate limiting, connection pooling, query timeouts.
- **LRU in-memory cache** - NO Redis at all. Use `functools.lru_cache` or custom LRU only.
- **ZERO mock tests** - All tests must hit real services (BigQuery, Supabase, APIs)
- **Reusability and repeatability** - Patterns that work everywhere. Follow existing codebase patterns.
- **Don't break existing functionality** - Run all tests before/after changes
- **Update skills with learnings** - Document fixes in skill files

## 5 Implementation Pillars

| Pillar | How API Dev Handles It |
|--------|-------------------------------|
| **i18n** | `validate_org_slug()` at entry, `SupportedCurrency` enum (20 currencies), `org_profiles` stores locale settings |
| **Enterprise** | Pydantic v2 validation, structured logging, rate limiting, KMS encryption, audit logs |
| **Cross-Service** | Frontend calls via `X-API-Key`, proxies to Pipeline (8001), serves Chat (8002) settings |
| **Multi-Tenancy** | `get_current_org()` dependency injection, parameterized `@org_slug` queries, `{org_slug}_prod` datasets |
| **Reusability** | Shared services (`cost_read`, `hierarchy_crud`, `notification_crud`), Pydantic models, `BigQueryClient` |

## Related Skills
- `test-orchestration` - API testing
- `security-audit` - Auth patterns
- `config-validator` - Schema validation
