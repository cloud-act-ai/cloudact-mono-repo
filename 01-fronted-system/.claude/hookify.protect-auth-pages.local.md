---
name: protect-auth-pages
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: (app/login/page\.tsx|app/signup/page\.tsx|components/auth/auth-layout\.tsx)
---

# Auth Pages Protected (FINALIZED 2025-12-27)

**These files are locked and require explicit user permission to modify:**

- `app/login/page.tsx` - Login page
- `app/signup/page.tsx` - Signup page (2-step flow)
- `components/auth/auth-layout.tsx` - Premium split-screen layout

## Design Decisions (Final)

- Split-screen layout with animated gradient orbs
- **Mint buttons** for all primary CTAs
- 2-step signup flow
- Mobile responsive (48px/52px inputs)
- Dark mode ready

## To Make Changes

Ask the user: **"The auth pages are finalized. Do you want me to modify them?"**

Only proceed if user explicitly confirms they want changes.
