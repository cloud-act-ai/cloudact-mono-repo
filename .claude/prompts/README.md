# Code Review Prompts

Reusable prompts for security and scalability reviews of CloudAct multi-tenant SaaS platform.

---

## Usage

Reference these prompts when conducting code reviews. Each focuses on **IDENTIFYING GAPS** without over-engineering.

---

## Available Prompts

| Prompt | Use When |
|--------|----------|
| `FRONTEND_REVIEW_PROMPT.md` | Reviewing Next.js, Supabase, Stripe code |
| `BACKEND_REVIEW_PROMPT.md` | Reviewing FastAPI, BigQuery, pipeline code |
| `INTEGRATION_FLOWS_REVIEW_PROMPT.md` | Reviewing cross-system flows |
| `GENAI_COSTS_PROMPTS.md` | GenAI cost management scenarios |

---

## Key Principles

| Principle | Description |
|-----------|-------------|
| Identify gaps, don't refactor | Only fix security vulnerabilities |
| 10K+ parallel users | Review for multi-tenant scale |
| No over-engineering | Keep solutions simple |
| Review is mandatory | Check every file mentioned |

---

## Severity Levels

| Level | Action | Examples |
|-------|--------|----------|
| CRITICAL | Block deploy | Auth bypass, SQL injection, cross-tenant leak |
| HIGH | Fix before prod | Missing validation, quota bypass |
| MEDIUM | Fix next sprint | Missing pagination, timeouts |
| LOW | Track only | Code style |

---

## Quick Checklist

### Frontend

| Area | Check |
|------|-------|
| Multi-tenant | Verify org membership before data access |
| Stripe | Idempotency keys are deterministic (no timestamps) |
| Input | Validation on all forms |
| Rate limiting | On sensitive actions |
| Pagination | On all list queries |

### Backend

| Area | Check |
|------|-------|
| Authentication | All endpoints have auth dependency |
| SQL | Queries use parameterized inputs |
| Quota | Checked before pipelines |
| Errors | Messages sanitized |
| Queries | Results limited |

### Integration

| Area | Check |
|------|-------|
| API keys | Never exposed to client |
| Webhooks | Signatures verified first |
| Data sync | Idempotent operations |
| Timeouts | At all boundaries |
| Tracing | Request IDs propagated |

---

## Review Process

1. Read the relevant prompt completely
2. Check EVERY file mentioned in the prompt
3. Use the checklists to identify gaps
4. Document findings using the output format
5. Prioritize by severity level
6. Fix CRITICAL issues before any deployment
