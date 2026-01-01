# Demo Account Setup

**Purpose**: Create a demo account for testing and demonstration purposes.

## Default Demo Account

| Field | Value |
|-------|-------|
| Email | `demo@acme-inc.com` |
| Password | `acme1234` |
| Company | `Acme Inc` |
| Plan | Starter ($19/month) |

## Usage

Run the demo account setup using Playwright browser automation:

```bash
cd 01-fronted-system
npx ts-node tests/demo-setup/setup-demo-account.ts
```

### Custom Configuration

Override default values with command-line arguments:

```bash
# Custom email and company
npx ts-node tests/demo-setup/setup-demo-account.ts \
  --email=custom@example.com \
  --company="My Custom Company" \
  --plan=professional
```

### Available Options

| Option | Description | Default |
|--------|-------------|---------|
| `--email` | Account email | `demo_account@example.com` |
| `--password` | Account password | `guru1234` |
| `--phone` | Phone number | `5551234567` |
| `--company` | Company name | `Acme Inc` |
| `--companyType` | Personal/Startup/Agency/Company/Educational | `Company` |
| `--currency` | Currency code | `$ USD` |
| `--timezone` | Timezone | `PST/PDT - Los Angeles, USA` |
| `--plan` | starter/professional/scale | `starter` |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_BASE_URL` | Frontend URL | `http://localhost:3000` |
| `TEST_HEADLESS` | Run headless | `true` |
| `TEST_SLOW_MO` | Slow down (ms) | `0` |

## Prerequisites

1. Frontend running on localhost:3000
2. API service running on localhost:8000
3. Supabase accessible (email confirmation disabled)

## Flow

1. Navigate to `/signup`
2. Fill account details (email, password, phone)
3. Fill organization details (company name, type, currency, timezone)
4. Select billing plan (Starter/Professional/Scale)
5. Proceed to Stripe checkout

## After Setup

After the demo account is created:

1. **If redirected to Stripe**: Complete checkout with test card `4242 4242 4242 4242`
2. **Organization slug**: `acme_inc` (derived from company name)
3. **Dashboard URL**: `http://localhost:3000/acme_inc/dashboard`

## Cleanup

To delete a demo account:
```bash
# Use the cleanup-supabase command
/cleanup-supabase
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Signup 400 error | Disable email confirmation in Supabase |
| Account exists | Delete from Supabase or use different email |
| Stripe redirect hangs | Use test card or check Stripe configuration |
