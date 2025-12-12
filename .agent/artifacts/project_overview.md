# CloudAct Project Structure & Tech Stack

## Overview

A monorepo containing a modern full-stack application with three core services, heavily integrated with Google Cloud Platform.

## 1. Frontend System (`01-fronted-system`)

**Path:** `/01-fronted-system`

- **Framework:** Next.js 16 + React 19
- **Styling:** Tailwind CSS v4, shadcn/ui components (`@radix-ui/*`)
- **Key Features:**
  - Stripe Integration
  - Supabase Backend Integration
  - Comprehensive Testing (Vitest, Playwright)

## 2. API Service (`02-api-service`)

**Path:** `/02-api-service`

- **Language:** Python
- **Core Framework:** FastAPI + Uvicorn
- **Data Engine:** Polars + PyArrow + BigQuery
- **Infrastructure:** Google Cloud Secret Manager, Cloud KMS, Cloud Logging
- **Purpose:** High-performance data serving and subscription management.

## 3. Data Pipeline Service (`03-data-pipeline-service`)

**Path:** `/03-data-pipeline-service`

- **Language:** Python
- **Core Framework:** FastAPI (likely for orchestration/triggering)
- **Data Engineering:**
  - Polars/PyArrow for processing
  - Great Expectations for data quality
  - OpenTelemetry for observability
- **Purpose:** Data ingestion, transformation, and reliable pipeline execution.

## Key Shared Patterns

- **Authentication:** JWT handling via `python-jose`
- **Config:** Environment-based config with `pydantic-settings`
- **Observability:** `python-json-logger` and Prometheus metrics across backend services
