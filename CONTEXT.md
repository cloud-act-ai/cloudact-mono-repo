# CONTEXT.md - CTO Ops Knowledge Map

*What to read and when*

## Required Reading (Every Session)

| File | Purpose | When |
|------|---------|------|
| `SOUL.md` | CTO identity & standards | Always first |
| `USER.md` | Rama's context & preferences | Always second |
| `CLAUDE.md` | Full CloudAct architecture | Always third |
| `memory/YYYY-MM-DD.md` | Recent deployments, decisions | Today + yesterday |
| `MEMORY.md` | Long-term technical learnings | Main session only |

## CloudAct Architecture (Source of Truth)

| File | Purpose | When to Read |
|------|---------|--------------|
| `CLAUDE.md` | Master architecture reference | Any CloudAct work |
| `.claude/SUMMARY.md` | Skills index, commands, hooks | Using skills/commands |
| `.claude/skills/PROMPT_EXAMPLES.md` | 25+ example prompts per skill | Learning skill usage |

## Service-Level Documentation

| Service | CLAUDE.md Location | When |
|---------|-------------------|------|
| Frontend | `01-fronted-system/CLAUDE.md` | Frontend work (E1, E2, E8) |
| API | `02-api-service/CLAUDE.md` | Backend work (E3, E4, E9) |
| Pipeline | `03-data-pipeline-service/CLAUDE.md` | Pipeline work (E5, E6) |
| Chat Backend | `07-org-chat-backend/CLAUDE.md` | Chat/AI work |
| Scheduler | `05-scheduler-jobs/CLAUDE.md` | Job management (E7) |
| Infrastructure | `04-inra-cicd-automation/CICD/` | Deploy/infra (E7) |

## Operational Files

| File | Purpose |
|------|---------|
| `HEARTBEAT.md` | 24/7 health checks, daily routines |
| `OPERATIONS.md` | Bootstrap, migration, deployment procedures |
| `AUTONOMOUS.md` | Decision matrix when Rama is away |

## Quick Reference

**Health Endpoints:**
- `https://api.cloudact.ai/health`
- `https://pipeline.cloudact.ai/health`
- `https://cloudact.ai` (HTTP 200)
- `https://chat.cloudact.ai/health`

**GCP Credentials:**
- Stage: `~/.gcp/cloudact-testing-1-e44da390bf82.json`
- Prod: `~/.gcp/cloudact-prod.json`

**Demo Account:** demo@cloudact.ai / Demo1234

**Access Restrictions:**
- `/Users/gurukallam/` — off-limits (privacy boundary)

## Coordination Files

| For Agent | What They Need From Us |
|-----------|----------------------|
| Marketing | Feature descriptions, changelogs, product screenshots |
| Social Media | Release notes, feature announcements, technical differentiators |

---

*Updated: 2026-02-12*
