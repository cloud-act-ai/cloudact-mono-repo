# Antigravity Testing Rules

## Core Philosophy

1.  **No Mocks**: Tests must run against the actual running services and databases. We do not mock API responses or database calls.
2.  **Real Environment**: The testing environment should mirror production as closely as possible.
3.  **Visual Verification**: Automated browser testing must be verifiable via screenshots and recordings.

## Testing Protocols

### 1. Browser Automation (E2E)

- **Tool**: Use the `browser_subagent` for all E2E testing.
- **Scope**: Cover critical user flows (Signup, Onboarding, Payments, Core Features).
- **Verification**:
  - Capture screenshots at every major step.
  - Verify DOM elements explicitly.
  - Check for console errors.

### 2. Integration Testing

- **Backend**: Run `pytest` against the running API service (`localhost:8000`).
- **Database**: Allow tests to read/write to the `test` or `dev` datasets in BigQuery and Supabase.
- **Cleanup**: Tests should be designed to use unique test data (e.g., unique org slugs) to avoid contamination, or cleaning up after themselves.

### 3. "Antigravity" Constraints

- **Never** use `jest.mock()` or Python `unittest.mock` for core logic.
- **Always** validate against the "Component Source of Truth" (e.g., if a file is uploaded, check the actual GCS bucket, not just the API response).

### 4. Artifacts

- **Location**: All artifacts (screenshots, recordings, reports) must be saved to `.agent/artifacts/`.
- **Naming**: Use descriptive names with timestamps for screenshots (e.g., `signup_error_1701234567.png`).
