---
name: service-integration-standards
enabled: true
event: all
pattern: (deploy|restart|npm run|uvicorn|git push|git tag)
action: warn
---

**Paths:** Always use `$REPO_ROOT` | **Deploy:** `git tag v*` for prod (Cloud Build auto)

See: `.claude/commands/restart.md` or `.claude/commands/infra-cicd.md`
