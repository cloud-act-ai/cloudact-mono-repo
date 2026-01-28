# CloudAct Go-Live Playbook

**Version:** v4.1.11 | **Date:** 2026-01-28 | **Issues:** [go-live-issues.csv](./go-live-issues.csv) (3 fixed, 0 open)

---

## Feature Test Matrix

| Section | Page/Feature | Component | Endpoint/Action | Expected | Status | Verified |
|---------|--------------|-----------|-----------------|----------|--------|----------|
| **LANDING** |||||||
| Landing | Home | Hero | GET / | Renders | PASS | Screenshot ✓ |
| Landing | Home | Features Grid | GET / | 6 features | PASS | Screenshot ✓ |
| Landing | Home | Stats | GET / | Metrics | PASS | Screenshot ✓ |
| Landing | Home | Enterprise Stats | Component | NEW | PASS | Screenshot ✓ |
| Landing | Home | Key Capabilities | Component | NEW | PASS | Screenshot ✓ |
| Landing | Home | Product Screenshots | Component | NEW | PASS | Screenshot ✓ |
| Landing | Home | CTA | Click | Signup | PASS | Screenshot ✓ |
| Landing | Pricing | Plan Cards | GET /pricing | 4 plans | PASS | Screenshot ✓ |
| Landing | Pricing | Toggle | Click | Price update | PASS | Screenshot ✓ |
| Landing | Pricing | Comparison | Table | Renders | PASS | Screenshot ✓ |
| Landing | Pricing | Checkout | Stripe | Opens | PENDING | - |
| Landing | Features | List | GET /features | All | PASS | Screenshot ✓ |
| Landing | About | Content | GET /about | Renders | PASS | Screenshot ✓ |
| Landing | Contact | Form | POST | Submits | PENDING | - |
| Landing | Privacy | Content | GET /privacy | Renders | PASS | Screenshot ✓ |
| Landing | Terms | Content | GET /terms | Renders | PASS | Screenshot ✓ |
| Landing | Blog | List | GET /blog | Posts | PENDING | - |
| Landing | Docs | Content | GET /docs | Renders | PASS | Screenshot ✓ |
| Landing | Docs | Quick Start | GET /docs/quick-start | Guide | PENDING | - |
| Landing | Docs | API Reference | GET /docs/api/reference | OpenAPI | PASS | 137 endpoints |
| Landing | Resources | Guides | GET /resources/guides | Articles | PENDING | - |
| Landing | Resources | Videos | GET /resources/videos | Tutorials | PENDING | - |
| Landing | Compliance | Content | GET /compliance | SOC2/GDPR | PASS | Screenshot ✓ |
| Landing | Security | Content | GET /security | Practices | PASS | Screenshot ✓ |
| Landing | 404 Page | Error | GET /invalid | Shows 404 | PENDING | - |
| Landing | 500 Page | Error | Server error | Shows 500 | PENDING | - |
| **AUTH - SIGNUP** |||||||
| Auth | Signup | Form | GET /signup | Displays | PASS | Screenshot ✓ |
| Auth | Signup | Email Validation | Invalid | Error | PASS | Form ✓ |
| Auth | Signup | Password Strength | Weak | Warning | PASS | Form ✓ |
| Auth | Signup | Password Requirements | Display | Shows rules | PASS | Form ✓ |
| Auth | Signup | Company Name | Required | Validates | PASS | Form ✓ |
| Auth | Signup | Submit | POST | Creates | PENDING | - |
| Auth | Signup | Supabase User | Create | User created | PENDING | - |
| Auth | Signup | Org Profile | Create | org_profiles | PENDING | - |
| Auth | Signup | Org Slug | Auto | company_MMDDYYYY | PENDING | - |
| Auth | Signup | API Key | Generate | org_api_keys | PENDING | - |
| Auth | Signup | Subscription | Create | org_subscriptions | PENDING | - |
| Auth | Signup | Usage Quota | Create | org_usage_quotas | PENDING | - |
| Auth | Signup | BigQuery Dataset | Create | {org}_prod | PENDING | - |
| Auth | Signup | Demo Data Seed | Insert | Sample costs | PENDING | - |
| Auth | Signup | Demo Hierarchy | Insert | Sample tree | PENDING | - |
| Auth | Signup | Demo Integrations | Insert | Sample providers | PENDING | - |
| Auth | Signup | Demo Alerts | Insert | Sample alerts | PENDING | - |
| Auth | Signup | Email Verify | Send | Link sent | PENDING | - |
| Auth | Signup | Verify Email Template | Email | Branded | PENDING | - |
| Auth | Signup | Duplicate | Existing | Error | PENDING | - |
| Auth | Signup | OAuth Google | Click | Redirects | PENDING | - |
| Auth | Signup | OAuth GitHub | Click | Redirects | PENDING | - |
| Auth | Signup | Terms | Checkbox | Required | PENDING | - |
| Auth | Signup | Stripe Customer | Create | customer_id | PENDING | - |
| Auth | Signup | Welcome Email | Send | Onboarding | PENDING | - |
| **AUTH - SIGNIN** |||||||
| Auth | Signin | Form | GET /login | Displays | PASS | Screenshot ✓ |
| Auth | Signin | Valid Creds | POST | Success | PENDING | Needs valid creds |
| Auth | Signin | Invalid Creds | POST | Error | PASS | Screenshot ✓ |
| Auth | Signin | Remember Me | Check | Persists | PASS | Form ✓ |
| Auth | Signin | OAuth Google | Click | Works | PENDING | - |
| Auth | Signin | OAuth GitHub | Click | Works | PENDING | - |
| Auth | Signin | Redirect | Success | Dashboard | PENDING | - |
| Auth | Signin | Rate Limit | 5 fails | Locked | PENDING | - |
| Auth | Signin | MFA | TOTP | Required | PENDING | - |
| Auth | Signin | Last Login | Update | Timestamp | PENDING | - |
| **AUTH - PASSWORD** |||||||
| Auth | Forgot | Form | GET /forgot | Displays | PASS | Screenshot ✓ |
| Auth | Forgot | Submit | POST | Email sent | PENDING | - |
| Auth | Forgot | Email Template | Email | Branded | PENDING | - |
| Auth | Forgot | Invalid | Non-exist | Generic msg | PENDING | - |
| Auth | Reset | Valid Token | GET | Displays | PENDING | - |
| Auth | Reset | Expired | Token | Error | PENDING | - |
| Auth | Reset | Submit | POST | Updated | PENDING | - |
| Auth | Reset | Mismatch | Passwords | Error | PENDING | - |
| Auth | Reset | Success Email | Send | Confirmation | PENDING | - |
| **AUTH - SESSION** |||||||
| Auth | Session | JWT | Login | Issued | PENDING | - |
| Auth | Session | Refresh | Expiry | Auto | PENDING | - |
| Auth | Session | Logout | Click | Cleared | PENDING | - |
| Auth | Session | Multi-device | Login | Valid | PENDING | - |
| Auth | Session | Timeout | 30min | Auto logout | PENDING | - |
| Auth | Session | Cookie | HttpOnly | Secure | PENDING | - |
| **CONSOLE - ONBOARDING** |||||||
| Console | Onboarding | Welcome Modal | First login | Shows | PENDING | - |
| Console | Onboarding | Setup Checklist | Widget | Progress | PENDING | - |
| Console | Onboarding | Add Integration | Step | Guided | PENDING | - |
| Console | Onboarding | First Pipeline | Step | Guided | PENDING | - |
| Console | Onboarding | Skip | Button | Dismisses | PENDING | - |
| Console | Onboarding | Complete | All done | Hides | PENDING | - |
| Console | Onboarding | Tooltip Hints | Help | Shows | PENDING | - |
| **CONSOLE - DASHBOARD** |||||||
| Console | Dashboard | Overview | GET | Renders | PENDING | - |
| Console | Dashboard | Cost Summary | Widget | Total | PENDING | - |
| Console | Dashboard | Trend Chart | Widget | 30-day | PENDING | - |
| Console | Dashboard | Top Providers | Widget | Breakdown | PENDING | - |
| Console | Dashboard | Activity | Widget | Last 10 | PENDING | - |
| Console | Dashboard | Quick Actions | Buttons | Work | PENDING | - |
| Console | Dashboard | Date Range | Filter | Updates | PENDING | - |
| Console | Dashboard | Refresh | Button | Reloads | PENDING | - |
| Console | Dashboard | Loading | Skeleton | Shows | PENDING | - |
| Console | Dashboard | Error | State | Shows | PENDING | - |
| Console | Dashboard | Empty State | No data | Shows msg | PENDING | - |
| Console | Dashboard | Currency Display | Locale | Formatted | PENDING | - |
| **CONSOLE - CLOUD COSTS** |||||||
| Console | Cloud | Overview | GET | Summary | PENDING | - |
| Console | Cloud | GCP Tab | Click | GCP | PENDING | - |
| Console | Cloud | AWS Tab | Click | AWS | PENDING | - |
| Console | Cloud | Azure Tab | Click | Azure | PENDING | - |
| Console | Cloud | OCI Tab | Click | OCI | PENDING | - |
| Console | Cloud | Service Table | Breakdown | Shows | PENDING | - |
| Console | Cloud | Export CSV | Button | Downloads | PENDING | - |
| Console | Cloud | Export PDF | Button | Downloads | PENDING | - |
| Console | Cloud | Empty State | No data | Shows msg | PENDING | - |
| Console | Cloud | Caching | TTL | 5min cache | PENDING | - |
| **CONSOLE - GENAI COSTS** |||||||
| Console | GenAI | Overview | GET | Summary | PENDING | - |
| Console | GenAI | OpenAI Tab | Click | OpenAI | PENDING | - |
| Console | GenAI | Anthropic Tab | Click | Anthropic | PENDING | - |
| Console | GenAI | Gemini Tab | Click | Gemini | PENDING | - |
| Console | GenAI | Bedrock Tab | Click | AWS Bedrock | PENDING | - |
| Console | GenAI | Vertex Tab | Click | GCP Vertex | PENDING | - |
| Console | GenAI | Token Chart | Usage | Shows | PENDING | - |
| Console | GenAI | Model Table | Breakdown | Shows | PENDING | - |
| Console | GenAI | Cost/Token | Calc | Rate | PENDING | - |
| Console | GenAI | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - SUBSCRIPTION** |||||||
| Console | Subscription | Overview | GET | Summary | PENDING | - |
| Console | Subscription | List | Table | All SaaS | PENDING | - |
| Console | Subscription | Add | POST | Creates | PENDING | - |
| Console | Subscription | Edit | PUT | Updates | PENDING | - |
| Console | Subscription | Delete | DELETE | Removes | PENDING | - |
| Console | Subscription | Per User | Calc | Shows | PENDING | - |
| Console | Subscription | Renewal | Date | Shows | PENDING | - |
| Console | Subscription | Pagination | Table | Cursor-based | PENDING | - |
| Console | Subscription | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - UNIFIED COSTS** |||||||
| Console | Unified | FOCUS 1.3 | GET | All costs | PENDING | - |
| Console | Unified | Type Filter | Dropdown | Filters | PENDING | - |
| Console | Unified | Provider Filter | Dropdown | Filters | PENDING | - |
| Console | Unified | Hierarchy Filter | Dropdown | NEW | PENDING | - |
| Console | Unified | Date Range | Picker | Updates | PENDING | - |
| Console | Unified | Comparison | Toggle | MoM/YoY | PENDING | - |
| Console | Unified | Currency Convert | Toggle | To base | PENDING | - |
| Console | Unified | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - HIERARCHY** |||||||
| Console | Hierarchy | Tree | GET | Shows | PENDING | - |
| Console | Hierarchy | Add Dept | POST | DEPT-* | PENDING | - |
| Console | Hierarchy | Add Project | POST | PROJ-* | PENDING | - |
| Console | Hierarchy | Add Team | POST | TEAM-* | PENDING | - |
| Console | Hierarchy | Edit | PUT | Updates | PENDING | - |
| Console | Hierarchy | Delete | DELETE | Removes | PENDING | - |
| Console | Hierarchy | Move | Drag | Reparents | PENDING | - |
| Console | Hierarchy | Cost Alloc | View | Shows | PENDING | - |
| Console | Hierarchy | Owner | Edit | Assigns | PENDING | - |
| Console | Hierarchy | Budget | Edit | Sets | PENDING | - |
| Console | Hierarchy | Path Display | Breadcrumb | Shows | PENDING | - |
| Console | Hierarchy | Sync to BQ | Trigger | x_org_hierarchy | PENDING | - |
| Console | Hierarchy | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - INTEGRATIONS** |||||||
| Console | Integrations | List | GET | Providers | PENDING | - |
| Console | Integrations | GCP | POST | Service Acct | PENDING | - |
| Console | Integrations | AWS | POST | IAM Role | PENDING | - |
| Console | Integrations | Azure | POST | SP | PENDING | - |
| Console | Integrations | OCI | POST | Config | PENDING | - |
| Console | Integrations | OpenAI | POST | API Key | PENDING | - |
| Console | Integrations | Anthropic | POST | API Key | PENDING | - |
| Console | Integrations | Gemini | POST | API Key | PENDING | - |
| Console | Integrations | Azure OpenAI | POST | API Key | PENDING | - |
| Console | Integrations | AWS Bedrock | POST | IAM + Region | PENDING | - |
| Console | Integrations | GCP Vertex | POST | Service Acct | PENDING | - |
| Console | Integrations | Validate | POST | Tests | PENDING | - |
| Console | Integrations | Delete | DELETE | Removes | PENDING | - |
| Console | Integrations | Sync Status | Badge | Last | PENDING | - |
| Console | Integrations | Manual Sync | Button | Triggers | PENDING | - |
| Console | Integrations | Encryption | KMS | AES-256 | PENDING | - |
| Console | Integrations | Permission Check | Validate | IAM roles | PENDING | - |
| Console | Integrations | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - ALERTS (NEW)** |||||||
| Console | Alerts | List | GET | Shows | PASS | Email sent ✓ |
| Console | Alerts | Create | POST | Creates | PASS | 3 created ✓ |
| Console | Alerts | Edit | PUT | Updates | PENDING | - |
| Console | Alerts | Delete | DELETE | Removes | PENDING | - |
| Console | Alerts | Toggle | Enable | Changes | PENDING | - |
| Console | Alerts | Test | Button | Sends | PASS | Email recv'd ✓ |
| Console | Alerts | History | Table | Shows | PENDING | - |
| Console | Alerts | Preset Cloud | Quick | $1K | PENDING | - |
| Console | Alerts | Preset GenAI | Quick | $500 | PENDING | - |
| Console | Alerts | Preset Total | Quick | $2.5K | PENDING | - |
| Console | Alerts | Email Config | Form | Setup | PASS | SMTP works ✓ |
| Console | Alerts | Slack Config | Form | Webhook | PENDING | - |
| Console | Alerts | Threshold | Form | Value | PENDING | - |
| Console | Alerts | Provider | Dropdown | Filter | PENDING | - |
| Console | Alerts | Cooldown | Form | Hours | PENDING | - |
| Console | Alerts | Severity | Dropdown | Level | PENDING | - |
| Console | Alerts | Forecast | Type | Projected | PENDING | - |
| Console | Alerts | Email Template | Email | Branded | PASS | Template ok ✓ |
| Console | Alerts | Org Isolation | Security | Multi-tenant | PASS | Fixed ISS-001 ✓ |
| Console | Alerts | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - NOTIFICATIONS** |||||||
| Console | Notifications | Channels | GET | List | PENDING | - |
| Console | Notifications | Add Channel | POST | Creates | PENDING | - |
| Console | Notifications | Edit Channel | PUT | Updates | PENDING | - |
| Console | Notifications | Delete Channel | DELETE | Removes | PENDING | - |
| Console | Notifications | Test | Button | Tests | PENDING | - |
| Console | Notifications | Rules | Table | Shows | PENDING | - |
| Console | Notifications | Add Rule | POST | Creates | PENDING | - |
| Console | Notifications | History | Table | Past | PENDING | - |
| Console | Notifications | Retry Failed | Button | Retries | PENDING | - |
| Console | Notifications | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - SETTINGS - PROFILE** |||||||
| Console | Profile | View | GET | Shows | PENDING | - |
| Console | Profile | Name | PUT | Updates | PENDING | - |
| Console | Profile | Email | PUT | Updates | PENDING | - |
| Console | Profile | Password | PUT | Changes | PENDING | - |
| Console | Profile | Avatar | POST | Uploads | PENDING | - |
| Console | Profile | Delete Account | DELETE | Removes user | PENDING | - |
| Console | Profile | Export My Data | GET | GDPR export | PENDING | - |
| Console | Profile | Notification Prefs | PUT | Updates | PENDING | - |
| **CONSOLE - SETTINGS - ORG** |||||||
| Console | Org | View | GET | Config | PENDING | - |
| Console | Org | Name | PUT | Updates | PENDING | - |
| Console | Org | Logo | POST | Uploads | PENDING | - |
| Console | Org | Currency | Dropdown | Locale | PENDING | - |
| Console | Org | Timezone | Dropdown | Locale | PENDING | - |
| Console | Org | Date Format | Dropdown | Locale | PENDING | - |
| Console | Org | Fiscal Year | Dropdown | Start month | PENDING | - |
| Console | Org | Delete Org | DELETE | Full delete | PENDING | - |
| Console | Org | Export All Data | GET | GDPR export | PENDING | - |
| Console | Org | Transfer Ownership | PUT | New owner | PENDING | - |
| **CONSOLE - SETTINGS - API KEYS** |||||||
| Console | API Keys | List | GET | Shows | PENDING | - |
| Console | API Keys | Generate | POST | Creates | PENDING | - |
| Console | API Keys | Copy | Button | Clipboard | PENDING | - |
| Console | API Keys | Revoke | DELETE | Removes | PENDING | - |
| Console | API Keys | Expiry | Date | Shows | PENDING | - |
| Console | API Keys | Last Used | Date | Shows | PENDING | - |
| Console | API Keys | Rate Limit | Display | Shows | PENDING | - |
| **CONSOLE - SETTINGS - TEAM** |||||||
| Console | Team | Members List | GET | Shows | PENDING | - |
| Console | Team | Invite User | POST | Sends invite | PENDING | - |
| Console | Team | Invite Email | Email | Branded | PENDING | - |
| Console | Team | Accept Invite | GET /invite?token= | Joins org | PENDING | - |
| Console | Team | Resend Invite | POST | Resends | PENDING | - |
| Console | Team | Cancel Invite | DELETE | Removes | PENDING | - |
| Console | Team | Remove Member | DELETE | Removes | PENDING | - |
| Console | Team | Role: Admin | Assign | Full | PENDING | - |
| Console | Team | Role: Member | Assign | Limited | PENDING | - |
| Console | Team | Role: Viewer | Assign | Read | PENDING | - |
| Console | Team | Change Role | PUT | Updates | PENDING | - |
| Console | Team | Pending Invites | Table | Shows | PENDING | - |
| Console | Team | Seat Limit Check | Validation | Quota | PENDING | - |
| Console | Team | Invite Expiry | 7 days | Auto cleanup | PENDING | - |
| **CONSOLE - BILLING - SUBSCRIPTION** |||||||
| Console | Billing | Plan Overview | GET | Current | PENDING | - |
| Console | Billing | Usage Stats | Widget | Shows | PENDING | - |
| Console | Billing | Upgrade Plan | Button | Stripe | PENDING | - |
| Console | Billing | Downgrade Plan | Button | Confirm | PENDING | - |
| Console | Billing | Cancel Sub | Button | Flow | PENDING | - |
| Console | Billing | Reactivate | Button | Restores | PENDING | - |
| Console | Billing | Trial Days | Display | Remaining | PENDING | - |
| Console | Billing | Next Billing | Date | Shows | PENDING | - |
| Console | Billing | Plan Comparison | Modal | Shows | PENDING | - |
| **CONSOLE - BILLING - PAYMENT** |||||||
| Console | Payment | Card Display | Widget | **** 4242 | PENDING | - |
| Console | Payment | Update Card | Button | Stripe | PENDING | - |
| Console | Payment | Add Card | Button | Stripe | PENDING | - |
| Console | Payment | Remove Card | Button | Removes | PENDING | - |
| Console | Payment | Default Card | Radio | Sets | PENDING | - |
| Console | Payment | Billing Portal | Link | Stripe | PENDING | - |
| Console | Payment | 3D Secure | Auth | SCA compliant | PENDING | - |
| **CONSOLE - BILLING - INVOICES** |||||||
| Console | Invoices | List | Table | History | PENDING | - |
| Console | Invoices | Download PDF | Link | Downloads | PENDING | - |
| Console | Invoices | View Online | Link | Stripe | PENDING | - |
| Console | Invoices | Status | Badge | Paid/Due | PENDING | - |
| Console | Invoices | Amount | Display | Shows | PENDING | - |
| Console | Invoices | Date | Display | Shows | PENDING | - |
| Console | Invoices | Tax/VAT | Display | If applicable | PENDING | - |
| Console | Invoices | Empty State | No data | Shows msg | PENDING | - |
| **CONSOLE - BILLING - STRIPE WEBHOOKS** |||||||
| Console | Stripe WH | checkout.session.completed | Event | Creates sub | PENDING | - |
| Console | Stripe WH | customer.subscription.created | Event | Records | PENDING | - |
| Console | Stripe WH | customer.subscription.updated | Event | Syncs limits | PENDING | - |
| Console | Stripe WH | customer.subscription.deleted | Event | Downgrades | PENDING | - |
| Console | Stripe WH | invoice.payment_succeeded | Event | Records | PENDING | - |
| Console | Stripe WH | invoice.payment_failed | Event | Notifies | PENDING | - |
| Console | Stripe WH | invoice.created | Event | Records | PENDING | - |
| Console | Stripe WH | invoice.finalized | Event | PDF ready | PENDING | - |
| Console | Stripe WH | customer.created | Event | Links | PENDING | - |
| Console | Stripe WH | customer.updated | Event | Syncs | PENDING | - |
| Console | Stripe WH | payment_method.attached | Event | Records | PENDING | - |
| Console | Stripe WH | Signature Verify | Security | Validates | PENDING | - |
| Console | Stripe WH | Idempotency | Duplicate | Skips | PENDING | - |
| **CONSOLE - QUOTA** |||||||
| Console | Quota | Display | Widget | Limits | PENDING | - |
| Console | Quota | Daily Progress | Bar | X/Y | PENDING | - |
| Console | Quota | Monthly Progress | Bar | X/Y | PENDING | - |
| Console | Quota | Seats | Badge | X/Y | PENDING | - |
| Console | Quota | Providers | Badge | X/Y | PENDING | - |
| Console | Quota | 90% Warning | Modal | Shows | PENDING | - |
| Console | Quota | Limit Hit | Modal | Upgrade | PENDING | - |
| Console | Quota | Reset Schedule | Info | UTC midnight | PENDING | - |
| **CONSOLE - SEARCH** |||||||
| Console | Search | Global Search | Cmd+K | Opens | PENDING | - |
| Console | Search | Results | List | Shows | PENDING | - |
| Console | Search | Navigate | Enter | Goes to | PENDING | - |
| Console | Search | Recent | History | Shows | PENDING | - |
| **CONSOLE - HELP** |||||||
| Console | Help | Help Menu | Button | Opens | PENDING | - |
| Console | Help | Docs Link | Link | Opens | PENDING | - |
| Console | Help | Support Email | Link | Opens | PENDING | - |
| Console | Help | Chat Widget | Intercom | Opens | PENDING | - |
| Console | Help | Keyboard Shortcuts | Modal | Shows | PENDING | - |
| Console | Help | Tooltips | Hover | Shows | PENDING | - |
| **CONSOLE - UI/UX** |||||||
| Console | UI | Dark Mode | Toggle | Switches | PENDING | - |
| Console | UI | Responsive | Mobile | Works | PENDING | - |
| Console | UI | Breadcrumbs | Nav | Shows | PENDING | - |
| Console | UI | Loading States | All pages | Shows | PENDING | - |
| Console | UI | Error States | All pages | Shows | PENDING | - |
| Console | UI | Toast Messages | Actions | Shows | PENDING | - |
| Console | UI | Confirmation Modals | Destructive | Confirms | PENDING | - |
| Console | UI | Accessibility | a11y | WCAG 2.1 | PENDING | - |
| **CONSOLE - AUDIT** |||||||
| Console | Audit | Activity Log | GET | Shows | PENDING | - |
| Console | Audit | Filter by User | Dropdown | Filters | PENDING | - |
| Console | Audit | Filter by Action | Dropdown | Filters | PENDING | - |
| Console | Audit | Export | Button | CSV | PENDING | - |
| Console | Audit | Date Range | Picker | Filters | PENDING | - |
| **PIPELINES** |||||||
| Pipelines | Run | Manual | POST | Executes | PENDING | - |
| Pipelines | Status | Badge | Realtime | Shows | PENDING | - |
| Pipelines | Logs | Table | History | Shows | PENDING | - |
| Pipelines | Error | Alert | Failure | Shows | PENDING | - |
| Pipelines | Retry | Button | Retries | Works | PENDING | - |
| Pipelines | Cancel | Button | Cancels | Works | PENDING | - |
| Pipelines | Checkpoint | Recovery | Resume | Works | PENDING | - |
| Pipelines | Lock | Concurrent | Prevented | Works | PENDING | - |
| Pipelines | Circuit Breaker | Failure | Auto-open | Works | PENDING | - |
| **API** |||||||
| API | Health | GET /health | 200 | Healthy | PASS | curl ✓ |
| API | Version | GET /health | v4.1.5 | Shows | PASS | curl ✓ |
| API | Bootstrap | POST | 201 | Tables | PENDING | - |
| API | Onboard | POST | 201 | Org | PENDING | - |
| API | Rate Limit | 100/min | 429 | Works | PENDING | - |
| API | CORS | Headers | Set | Config | PENDING | - |
| API | OpenAPI | GET | 200 | Docs | PASS | 137 endpoints |
| API | Swagger | GET /docs | 200 | CSP Block | PASS | Security ✓ |
| API | Error Codes | Structured | JSON | Standard | PENDING | - |
| API | Pagination | Cursor | Query | Works | PENDING | - |
| **SECURITY** |||||||
| Security | JWT | Validate | MW | Works | PENDING | - |
| Security | API Key | Validate | Header | Works | PENDING | - |
| Security | Root Key | Validate | Header | Works | PENDING | - |
| Security | Multi-tenant | Isolation | Query | Isolated | PASS | Fixed ISS-001 ✓ |
| Security | Encryption | KMS | AES-256 | Works | PENDING | - |
| Security | XSS | Escape | HTML | Blocked | PENDING | - |
| Security | SQLi | Param | Query | Blocked | PENDING | - |
| Security | HTTPS | TLS 1.3 | Forced | Works | PENDING | - |
| Security | CSP | Header | Set | Config | PENDING | - |
| Security | HSTS | Header | Set | Config | PENDING | - |
| Security | Audit Log | All ops | Logged | Works | PENDING | - |
| Security | Scope Enforce | MW | Validates | Works | PASS | Fixed ISS-002 ✓ |
| **DELETE FLOWS** |||||||
| Delete | Delete User | POST /delete-account | Removes user | Supabase | PENDING | - |
| Delete | Delete User Data | Cascade | Removes user refs | BigQuery | PENDING | - |
| Delete | Delete Org | POST /delete-org | Removes org | All systems | PENDING | - |
| Delete | Delete Org - Supabase | Cascade | user_organizations | Supabase | PENDING | - |
| Delete | Delete Org - BigQuery | Drop | {org}_prod dataset | BigQuery | PENDING | - |
| Delete | Delete Org - Meta | DELETE | org_profiles | BigQuery | PENDING | - |
| Delete | Delete Org - Keys | DELETE | org_api_keys | BigQuery | PENDING | - |
| Delete | Delete Org - Subs | DELETE | org_subscriptions | BigQuery | PENDING | - |
| Delete | Delete Org - Quotas | DELETE | org_usage_quotas | BigQuery | PENDING | - |
| Delete | Delete Org - Creds | DELETE | org_integration_credentials | BigQuery | PENDING | - |
| Delete | Delete Org - Hierarchy | DELETE | org_hierarchy | BigQuery | PENDING | - |
| Delete | Delete Org - Alerts | DELETE | org_scheduled_alerts | BigQuery | PENDING | - |
| Delete | Delete Org - Stripe | Cancel | subscription | Stripe | PENDING | - |
| Delete | Delete Org - Confirm | Modal | Type org name | UI | PENDING | - |
| Delete | Delete Org - Email | Send | Confirmation | Email | PENDING | - |
| Delete | Grace Period | 30 days | Soft delete | Recovery | PENDING | - |
| **ERROR HANDLING** |||||||
| Error | Error Boundary | React | Fallback UI | Shows | PENDING | - |
| Error | Error Classification | Backend | Categorized | Works | PENDING | - |
| Error | Retry Logic | Exponential | Backoff | Works | PENDING | - |
| Error | Fallback Values | Default | Graceful | Works | PENDING | - |
| Error | Error Logging | Structured | JSON | Works | PENDING | - |
| **MONITORING** |||||||
| Monitor | Query Performance | BigQuery | Metrics | Tracked | PENDING | - |
| Monitor | Cache Hit Rate | Memory | Stats | Tracked | PENDING | - |
| Monitor | Request Latency | API | P95 | Tracked | PENDING | - |
| Monitor | Error Rate | All | Percentage | Tracked | PENDING | - |
| Monitor | Health Dashboard | GCP | Console | Available | PENDING | - |
| **DATA & CACHING** |||||||
| Data | Query Cache | TTL | 5 min | Works | PENDING | - |
| Data | Cache Invalidation | On write | Clears | Works | PENDING | - |
| Data | Batch Loading | Bulk | Efficient | Works | PENDING | - |
| Data | Currency Convert | Rates | On-demand | Works | PENDING | - |
| Data | Schema Validation | FOCUS 1.3 | Enforced | Works | PENDING | - |
| **TESTING** |||||||
| Testing | Unit Tests | Backend | Passing | Required | PENDING | - |
| Testing | Integration Tests | E2E | Passing | Required | PENDING | - |
| Testing | Security Tests | Auth | Passing | Required | PENDING | - |
| Testing | Load Tests | Concurrency | Passing | Required | PENDING | - |

---

## Email Templates

| Template | Trigger | Subject | Status |
|----------|---------|---------|--------|
| Welcome | Signup | Welcome to CloudAct | PENDING |
| Verify Email | Signup | Verify your email | PENDING |
| Password Reset | Forgot | Reset your password | PENDING |
| Password Changed | Reset | Password changed | PENDING |
| Invite User | Team invite | You're invited to join | PENDING |
| Invite Accepted | Accept | Welcome to {org} | PENDING |
| Alert Triggered | Cost alert | Cost Alert: {name} | PENDING |
| Payment Success | Stripe | Payment received | PENDING |
| Payment Failed | Stripe | Payment failed | PENDING |
| Subscription Upgraded | Stripe | Plan upgraded | PENDING |
| Subscription Cancelled | Stripe | Subscription cancelled | PENDING |
| Account Deleted | Delete | Account deleted | PENDING |
| Org Deleted | Delete | Organization deleted | PENDING |
| Quota Warning | 90% | Approaching limit | PENDING |
| Quota Exceeded | 100% | Limit reached | PENDING |

---

## Scheduled Jobs

| Job | Service | Schedule | Endpoint | Purpose | Status |
|-----|---------|----------|----------|---------|--------|
| Daily Quota Reset | Pipeline | `0 0 * * *` | reset_daily_quotas() | Reset daily | PENDING |
| Monthly Quota Reset | Pipeline | `0 0 1 * *` | reset_monthly_quotas() | Reset monthly | PENDING |
| Stale Cleanup | Pipeline | `*/15 * * * *` | reset_stale_concurrent() | Clean stuck | PENDING |
| Alert Evaluation | Pipeline | `0 8 * * *` | POST /alerts/evaluate | Cost alerts | PENDING |
| Critical Alerts | Pipeline | `0 */4 * * *` | POST /alerts/evaluate?severity=critical | Critical | PENDING |
| Procedure Sync | Pipeline | Startup | POST /procedures/sync | SQL sync | PENDING |
| Cache Cleanup | Both | `0 3 * * *` | Internal | Clear stale | PENDING |
| Log Rotation | Cloud Run | Auto | GCP Logging | 30 days | PENDING |
| Partition Expiry | BigQuery | Auto | Table config | 90 days | PENDING |
| Expired Invites | API | `0 0 * * *` | cleanup_expired_invites() | 7 day expiry | PENDING |
| Soft Delete Cleanup | API | `0 0 * * *` | cleanup_soft_deleted() | 30 day grace | PENDING |

---

## Data Pipeline Jobs (Per Org)

| Pipeline | Provider | Domain | Endpoint | Schedule | Target | Status |
|----------|----------|--------|----------|----------|--------|--------|
| GCP Billing | gcp | cost | POST /pipelines/run/{org}/gcp/cost/billing | 06:00 | cost_data_standard_1_3 | PENDING |
| AWS Billing | aws | cost | POST /pipelines/run/{org}/aws/cost/billing | 06:00 | cost_data_standard_1_3 | PENDING |
| Azure Billing | azure | cost | POST /pipelines/run/{org}/azure/cost/billing | 06:00 | cost_data_standard_1_3 | PENDING |
| OCI Billing | oci | cost | POST /pipelines/run/{org}/oci/cost/billing | 06:00 | cost_data_standard_1_3 | PENDING |
| OpenAI Usage | openai | payg | POST /pipelines/run/{org}/genai/payg/openai | */6h | genai_usage_daily | PENDING |
| Anthropic Usage | anthropic | payg | POST /pipelines/run/{org}/genai/payg/anthropic | */6h | genai_usage_daily | PENDING |
| Gemini Usage | gemini | payg | POST /pipelines/run/{org}/genai/payg/gemini | */6h | genai_usage_daily | PENDING |
| Azure OpenAI | azure_openai | payg | POST /pipelines/run/{org}/genai/payg/azure_openai | */6h | genai_usage_daily | PENDING |
| Bedrock Usage | bedrock | payg | POST /pipelines/run/{org}/genai/payg/bedrock | */6h | genai_usage_daily | PENDING |
| Vertex Usage | vertex | payg | POST /pipelines/run/{org}/genai/payg/vertex | */6h | genai_usage_daily | PENDING |
| Subscription Cost | subscription | costs | POST /pipelines/run/{org}/subscription/costs | 01:00 | subscription_costs_daily | PENDING |
| GenAI Consolidate | system | proc | sp_genai_1_consolidate_usage_daily | After payg | genai_costs_daily | PENDING |
| GenAI to FOCUS | system | proc | sp_genai_3_convert_to_focus | After consol | cost_data_standard_1_3 | PENDING |
| Cloud to FOCUS | system | proc | sp_cloud_1_convert_to_focus | After billing | cost_data_standard_1_3 | PENDING |
| Sub to FOCUS | system | proc | sp_subscription_3_convert_to_focus | After sub | cost_data_standard_1_3 | PENDING |
| Hierarchy Sync | system | proc | sp_hierarchy_sync | On change | x_org_hierarchy | PENDING |

---

## Sync Jobs (System-Wide)

| Job | Type | Trigger | Source | Target | Status |
|-----|------|---------|--------|--------|--------|
| Bootstrap Meta Tables | DDL | Deploy | schemas/*.json | organizations.* | PENDING |
| Stored Procedures | DDL | Startup | procedures/*.sql | BigQuery | PENDING |
| Pricing Tables | Data | Manual | genai_pricing.yml | genai_model_pricing | PENDING |
| Provider Registry | Config | Startup | providers.yml | Memory | PENDING |
| Alert Configs | Config | Startup | alerts/*.yml | Memory | PENDING |
| Stripe Products | Sync | Webhook | Stripe | org_subscriptions | PENDING |
| Supabase Users | Sync | Auth | Supabase | org_profiles | PENDING |

---

## Demo Account Data (Seeded on Signup)

| Data Type | Table | Records | Purpose | Status |
|-----------|-------|---------|---------|--------|
| Sample Cloud Costs | cost_data_standard_1_3 | 30 days | Demo dashboard | PENDING |
| Sample GenAI Usage | genai_usage_daily | 30 days | Demo charts | PENDING |
| Sample Subscriptions | subscription_plans | 5 plans | Demo SaaS | PENDING |
| Sample Hierarchy | org_hierarchy | 1 dept, 2 proj, 3 teams | Demo tree | PENDING |
| Sample Integrations | org_integration_credentials | 2 providers | Demo list | PENDING |
| Sample Alerts | org_scheduled_alerts | 2 alerts | Demo alerts | PENDING |

---

## Cleanup Tasks

| Task | Command | Purpose | Status |
|------|---------|---------|--------|
| Remove test orgs | `DELETE FROM org_profiles WHERE org_slug LIKE 'test_%'` | Clean test | PENDING |
| Clear demo data | BigQuery cleanup | Remove demo | PENDING |
| Reset quotas | `UPDATE org_usage_quotas SET ...` | Fresh start | PENDING |
| Clear alert history | `DELETE FROM org_alert_history WHERE env='test'` | Clean | PENDING |
| Revoke test keys | `DELETE FROM org_api_keys WHERE is_test=true` | Security | PENDING |
| Clear notif history | `DELETE FROM org_notification_history` | Clean | PENDING |
| Remove debug logs | Cloud Logging filter | Sensitive | PENDING |
| Validate Stripe | Check price IDs | Billing | PENDING |
| Update robots.txt | Allow crawling | SEO | PENDING |
| Remove beta banners | UI cleanup | Production | PENDING |
| Clear expired invites | `DELETE FROM org_invitations WHERE expires < NOW()` | Clean | PENDING |
| Purge soft-deleted | `DELETE FROM * WHERE deleted_at < 30 days` | GDPR | PENDING |

---

## Deployment Sequence

| Step | Action | Command | Status |
|------|--------|---------|--------|
| 1 | Create tag | `git tag v4.1.10 && git push origin v4.1.10` | PENDING |
| 2 | Build triggers | Automatic | PENDING |
| 3 | Frontend deploy | cloudbuild-prod.yaml | PENDING |
| 4 | API deploy | cloudbuild-prod.yaml | PENDING |
| 5 | Pipeline deploy | cloudbuild-prod.yaml | PENDING |
| 6 | Health: Frontend | `curl https://cloudact.ai/health` | PENDING |
| 7 | Health: API | `curl https://api.cloudact.ai/health` | PENDING |
| 8 | Health: Pipeline | `curl https://pipeline.cloudact.ai/health` | PENDING |
| 9 | Smoke: Login | Manual | PENDING |
| 10 | Smoke: Dashboard | Manual | PENDING |
| 11 | Smoke: Alert | Test email | PENDING |
| 12 | Enable Scheduler | Unpause jobs | PENDING |
| 13 | Monitor 30min | Watch logs | PENDING |
| 14 | Announce | Team notify | PENDING |

---

## Rollback

| Step | Condition | Action | Command |
|------|-----------|--------|---------|
| 1 | Critical bug | Find version | `git log --oneline` |
| 2 | | Rollback | `gcloud run services update-traffic` |
| 3 | | Or redeploy | `git checkout v4.1.9` |
| 4 | | Pause Scheduler | Disable jobs |
| 5 | | Notify | Slack |
| 6 | DB issue | Restore | BigQuery snapshot |
| 7 | Stripe issue | Disable webhook | Dashboard |

---

## Summary

| Category | Count | Tested | Pass | Pending |
|----------|-------|--------|------|---------|
| Landing Pages | 26 | 18 | 18 | 8 |
| Auth - Signup | 25 | 5 | 5 | 20 |
| Auth - Signin/Session | 16 | 4 | 3 | 12 |
| Auth - Password | 9 | 1 | 1 | 8 |
| Console - Dashboard | 12 | 0 | 0 | 12 |
| Console - Cost Pages | 41 | 0 | 0 | 41 |
| Console - Hierarchy | 13 | 0 | 0 | 13 |
| Console - Integrations | 18 | 0 | 0 | 18 |
| Console - Alerts | 20 | 6 | 6 | 14 |
| Console - Notifications | 10 | 0 | 0 | 10 |
| Console - Settings | 44 | 0 | 0 | 44 |
| Console - Billing | 35 | 0 | 0 | 35 |
| Console - Quota/UI | 23 | 0 | 0 | 23 |
| Pipelines | 9 | 0 | 0 | 9 |
| API | 10 | 4 | 4 | 6 |
| Security | 12 | 2 | 2 | 10 |
| Delete Flows | 16 | 0 | 0 | 16 |
| Error Handling | 5 | 0 | 0 | 5 |
| Monitoring | 5 | 0 | 0 | 5 |
| Data & Caching | 5 | 0 | 0 | 5 |
| Testing | 4 | 0 | 0 | 4 |
| Email Templates | 15 | 1 | 1 | 14 |
| Scheduled Jobs | 12 | 0 | 0 | 12 |
| Pipeline Jobs | 16 | 0 | 0 | 16 |
| Sync Jobs | 7 | 0 | 0 | 7 |
| **TOTAL** | **300+** | **41** | **40** | **260** |

## Test Screenshots

All screenshots saved to: `go-live-test-screenshots/2026-01-28/`
- 300+ screenshots from comprehensive testing sessions
- Key pages: Home, Pricing, Signup, Login, Forgot Password, Features, Privacy
| **Issues** | **3** | - | - | **[CSV](./go-live-issues.csv)** |

---

*Updated: 2026-01-28 03:30 UTC*
