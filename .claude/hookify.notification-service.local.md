---
name: notification-service-standards
enabled: true
event: all
pattern: (notification|alert|email.*send|slack.*webhook|notify)
action: warn
---

**Notifications:** API (8000) = CRUD settings | Pipeline (8001) = Sending

See: `.claude/skills/infra-cicd/SKILL.md` or `.claude/SUMMARY.md`
