# CloudAct Inc - Customer Onboarding Instructions

**Organization:** CloudAct Inc
**Primary Contact:** sursani.rama@gmail.com
**Created:** 2026-01-08
**Status:** Active Setup

---

## ⚡ AUTOMATION FIRST

**RECOMMENDED:** Use **Playwright** or **browser automation tools** to execute these steps programmatically.

**Why automate?**
- ✅ Faster execution (complete setup in < 2 minutes)
- ✅ Repeatable and consistent
- ✅ Reduces human error
- ✅ Can be version controlled and tested

**Automation Options:**
1. **Playwright (Recommended):** Available via MCP plugin `mcp__plugin_playwright_playwright__*`
2. **Puppeteer:** For Node.js-based automation
3. **Selenium:** For cross-browser testing

**Manual Steps Provided Below:** If automation is not available, follow the detailed manual steps.

---

## Account Credentials

| Field | Value |
|-------|-------|
| **Email** | sursani.rama@gmail.com |
| **Password** | guru1234 |
| **Phone** | +1 669 467 0258 |
| **Organization Name** | CloudAct Inc |

---

## STEP 1: Login Check (Try First)

**Before creating a new account, check if login already exists:**

1. Navigate to: `https://cloudact.ai` (production) or `http://localhost:3000` (local dev)
2. Click **"Sign In"** or **"Login"**
3. Enter credentials:
   - **Email:** `sursani.rama@gmail.com`
   - **Password:** `guru1234`
4. Click **"Sign In"**

**If login succeeds:** Skip to STEP 3 (Configure Subscription)
**If login fails (404/401):** Continue to STEP 2 (Signup)

---

## STEP 2: Account Signup (If Login Fails)

### 2.1 Navigate to Signup Page
1. Go to: `https://cloudact.ai/signup` or `http://localhost:3000/signup`
2. You should see the CloudAct signup form

### 2.2 Fill Signup Form

**Personal Information:**
- **Email:** `sursani.rama@gmail.com`
- **Password:** `guru1234`
- **Confirm Password:** `guru1234`
- **Phone:** `+1 669 467 0258`

**Organization Information:**
- **Organization Name:** `CloudAct Inc`
- **Time Zone:** `America/Los_Angeles` (PST)
- **Currency:** `USD` (US Dollar)
- **Fiscal Year Start:** `January 1`

**Subscription Plan:**
- Select: **"Scale"** plan ($199/month)
  - ✅ Unlimited users
  - ✅ Multi-cloud support
  - ✅ Advanced analytics
  - ✅ Priority support

### 2.3 Complete Stripe Checkout

1. After clicking **"Sign Up"**, you'll be redirected to Stripe Checkout
2. Enter payment details:
   - **Card Number:** Use production credit card
   - **Expiry & CVC:** As per card
   - **Billing Address:** Company billing address
3. Click **"Subscribe"**
4. Wait for redirect back to CloudAct dashboard

### 2.4 Verify Account Creation

**After signup, you should see:**
- Welcome message with "CloudAct Inc" in the header
- Dashboard with navigation menu
- Organization slug (auto-generated): `cloudact_inc_DDMMYYYY`

**Automatic Setup (happens behind the scenes):**
- ✅ Supabase auth account created
- ✅ Stripe customer + subscription created
- ✅ BigQuery dataset created: `{org_slug}_prod`
- ✅ 6 org-specific tables initialized
- ✅ API key generated for org

---

## STEP 3: Configure Fiscal Year

**Current Status:** Default fiscal year is Calendar Year (Jan 1 - Dec 31)

**If you need to change:**
1. Navigate to: **Settings** → **Organization Settings**
2. Look for **"Fiscal Year"** section
3. Confirm: **Start Month: January**
4. Click **"Save"** if changes made

**Note:** For CloudAct Inc, fiscal year = calendar year (Jan 1 start), so no changes needed.

---

## STEP 4: Add ChatGPT Subscription

### 4.1 Navigate to Subscriptions
1. From dashboard, click **"Subscriptions"** in left sidebar
2. Click **"Add Subscription"** button (top right)

### 4.2 Fill Subscription Details

**Provider Information:**
- **Provider:** `OpenAI` (select from dropdown)
- **Service Name:** `ChatGPT`
- **Subscription Type:** `Per-User Monthly`

**Plan Details:**
- **Plan Name:** `ChatGPT Plus`
- **Cost per Unit:** `$20.00`
- **Billing Frequency:** `Monthly`
- **Currency:** `USD`

**Subscription Period:**
- **Start Date:** `2025-01-01` (January 1, 2025)
- **End Date:** Leave blank (continuous/ongoing)
- **Auto-Renewal:** ✅ Enabled

**Initial Usage:**
- **Active Users:** `1` (or current team size)
- **Notes:** "Continuous subscription starting Jan 1, 2025"

### 4.3 Save Subscription
1. Review all fields
2. Click **"Add Subscription"** or **"Save"**
3. Verify it appears in subscriptions list with:
   - Status: **Active**
   - Next billing: **Feb 1, 2025** (if current month)
   - Monthly cost: **$20.00**

---

## STEP 5: Invite Team Member

### 5.1 Navigate to Team Management
1. Click **"Team"** or **"Users"** in left sidebar
2. Click **"Invite User"** or **"Add Team Member"** button

### 5.2 Send Invitation

**Team Member Details:**
- **Email:** `guru.kallam@gmail.com`
- **Role:** `Admin` (or `Member` based on access needs)
- **Department:** (Optional - assign if hierarchy is set up)
- **Team:** (Optional - assign if hierarchy is set up)

### 5.3 Complete Invitation
1. Click **"Send Invite"** or **"Invite User"**
2. System will:
   - Send invitation email to `guru.kallam@gmail.com`
   - Create pending user record
   - Show invitation status as "Pending"

### 5.4 Team Member Accepts Invite

**Steps for guru.kallam@gmail.com:**
1. Check email for invitation from CloudAct
2. Click **"Accept Invitation"** link
3. Set password and complete profile
4. Login to CloudAct Inc organization

---

## Post-Setup Verification Checklist

### ✅ Account & Authentication
- [ ] Login works with `sursani.rama@gmail.com` / `guru1234`
- [ ] Organization name shows "CloudAct Inc" in header
- [ ] Dashboard loads without errors

### ✅ Organization Configuration
- [ ] Time zone: **Pacific Standard Time (PST)**
- [ ] Currency: **USD ($)**
- [ ] Fiscal year: **January 1 start**

### ✅ Subscription & Billing
- [ ] Stripe subscription active: **Scale Plan ($199/month)**
- [ ] Payment method saved in Stripe
- [ ] ChatGPT subscription visible: **$20/month starting Jan 1, 2025**

### ✅ Team Management
- [ ] Invitation sent to `guru.kallam@gmail.com`
- [ ] Invitation status shows "Pending" or "Accepted"

---

## Troubleshooting

### Issue: Signup 400 Error
**Cause:** Supabase email confirmation enabled
**Fix:** Disable email confirmation in Supabase Auth settings, or check spam folder

### Issue: Stripe Checkout Fails
**Cause:** Missing STRIPE_SECRET_KEY or wrong environment keys
**Fix:**
```bash
cd 04-inra-cicd-automation/CICD/secrets
./setup-secrets.sh prod
```

### Issue: Login Fails After Signup
**Cause:** Session not established or Supabase auth issue
**Fix:**
1. Clear browser cookies/cache
2. Try incognito/private window
3. Check browser console for errors

### Issue: Subscription Not Saving
**Cause:** BigQuery permissions or missing org dataset
**Fix:** Check API Service logs at `http://localhost:8000` or Cloud Run logs

### Issue: Team Invitation Email Not Received
**Cause:** Email delivery or Supabase email config
**Fix:**
1. Check spam/junk folder
2. Verify email address is correct
3. Resend invitation from Team page

---

## Support & Next Steps

### Access URLs
- **Production:** https://cloudact.ai
- **API Docs:** https://api.cloudact.ai/docs
- **Support:** support@cloudact.ai

### Recommended Next Steps
1. **Set up integrations:** Connect GCP, AWS, or Azure accounts
2. **Configure hierarchy:** Set up Departments → Projects → Teams
3. **Add more subscriptions:** Import other SaaS subscriptions
4. **Run first pipeline:** Process cloud cost data
5. **Invite additional team members:** Scale your org

### Additional Resources
- **Architecture:** `00-requirements-specs/00_ARCHITECTURE.md`
- **User Guide:** `00-requirements-specs/04_USER_MANAGEMENT.md`
- **Billing Guide:** `00-requirements-specs/05_BILLING_PAYMENTS.md`

---

**Document Version:** 1.0
**Last Updated:** 2026-01-08
**Maintained By:** CloudAct Engineering Team
