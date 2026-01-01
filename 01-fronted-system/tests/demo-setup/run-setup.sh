#!/bin/bash
# Demo Account Setup Script
# Usage: ./tests/demo-setup/run-setup.sh [email] [company] [plan]

set -e

cd "$(dirname "$0")/../.."

EMAIL="${1:-acme_demo@example.com}"
COMPANY="${2:-Acme Inc}"
PLAN="${3:-starter}"

echo "============================================================"
echo "Demo Account Setup"
echo "============================================================"
echo "Email: $EMAIL"
echo "Company: $COMPANY"
echo "Plan: $PLAN"
echo ""

# Run using Vitest
npx vitest run tests/demo-setup/setup-demo-account.test.ts \
    --reporter=verbose \
    --env.DEMO_EMAIL="$EMAIL" \
    --env.DEMO_COMPANY="$COMPANY" \
    --env.DEMO_PLAN="$PLAN" \
    2>&1

echo ""
echo "============================================================"
echo "Setup Complete"
echo "============================================================"
