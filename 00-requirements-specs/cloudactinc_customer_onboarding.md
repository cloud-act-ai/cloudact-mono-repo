# CloudAct Inc - Customer Onboarding

**Organization:** CloudAct Inc
**Primary Contact:** sursani.rama@gmail.com
**Updated:** 2026-02-05
**Status:** Active

---

## Onboarding Workflow

```
1. Login check → Try existing credentials first
2. Signup (if needed) → Email + Password + Company info + Scale plan
3. Stripe Checkout → Payment → Auto-provision (Supabase + BigQuery)
4. Configure fiscal year → Calendar year (Jan 1)
5. Add subscriptions → ChatGPT Plus ($20/mo)
6. Invite team → guru.kallam@gmail.com
7. Verify → Dashboard, billing, team all functional
```

---

## Account Credentials

| Field | Value |
|-------|-------|
| Email | sursani.rama@gmail.com |
| Password | guru1234 |
| Phone | +1 669 467 0258 |
| Organization | CloudAct Inc |
| Plan | Scale ($199/month) |

---

## Steps

### STEP 1: Login Check

Navigate to `https://cloudact.ai` (prod) or `http://localhost:3000` (local). Try login with credentials above. If succeeds, skip to Step 3.

### STEP 2: Signup (If Login Fails)

1. Go to `/signup`
2. Fill: email, password, phone, org name (`CloudAct Inc`)
3. Settings: timezone `America/Los_Angeles`, currency `USD`, fiscal year `January 1`
4. Select **Scale** plan ($199/month)
5. Complete Stripe Checkout with production card
6. Auto-setup: Supabase auth + Stripe subscription + BigQuery dataset + API key

### STEP 3: Configure Fiscal Year

Settings → Organization → Fiscal Year → Confirm **January** start (calendar year, no change needed).

### STEP 4: Add ChatGPT Subscription

Subscriptions → Add → Provider: `OpenAI`, Plan: `ChatGPT Plus`, $20/mo, monthly billing, start `2025-01-01`, ongoing.

### STEP 5: Invite Team Member

Settings → Members → Invite → `guru.kallam@gmail.com` with Admin role. 48h token expiry.

---

## Verification Checklist

| Check | Expected |
|-------|----------|
| Login works | Dashboard loads without errors |
| Org name | "CloudAct Inc" in header |
| Timezone | Pacific Standard Time (PST) |
| Currency | USD ($) |
| Stripe subscription | Scale Plan ($199/month) active |
| ChatGPT subscription | $20/month visible |
| Team invite | Sent to guru.kallam@gmail.com |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Signup 400 error | Supabase email confirmation enabled | Disable in Supabase Auth settings |
| Stripe checkout fails | Missing STRIPE_SECRET_KEY | Run secrets setup script |
| Login fails after signup | Session not established | Clear cookies, try incognito |
| Subscription not saving | Missing org dataset | Check API Service logs |
| Invite email missing | Email delivery issue | Check spam, verify address, resend |

---

## Access URLs

| Environment | URL |
|-------------|-----|
| Production | https://cloudact.ai |
| API Docs | https://api.cloudact.ai/docs |
| Support | support@cloudact.ai |

---

## Next Steps After Onboarding

1. Set up cloud integrations (GCP, AWS, Azure)
2. Configure hierarchy (Departments → Projects → Teams)
3. Add more SaaS subscriptions
4. Run first billing pipeline
5. Invite additional team members
