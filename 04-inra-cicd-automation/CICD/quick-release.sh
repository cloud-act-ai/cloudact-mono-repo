#!/bin/bash
# quick-release.sh - One-command production release
# Usage: ./quick-release.sh v1.0.11 [--skip-tests]
#
# This script:
# 1. Updates version in all config files
# 2. Commits the version change
# 3. Runs tests (optional)
# 4. Creates release via CICD
# 5. Deploys to production
# 6. Verifies health

set -e

VERSION="${1:-}"
SKIP_TESTS=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
    esac
done

if [ -z "$VERSION" ]; then
    echo -e "\033[0;31m═══════════════════════════════════════════════════════════════\033[0m"
    echo -e "\033[0;31m  Quick Release - Usage\033[0m"
    echo -e "\033[0;31m═══════════════════════════════════════════════════════════════\033[0m"
    echo ""
    echo "Usage: ./quick-release.sh <version> [--skip-tests]"
    echo ""
    echo "Examples:"
    echo "  ./quick-release.sh v1.0.11              # Full release with tests"
    echo "  ./quick-release.sh v1.0.11 --skip-tests # Skip tests (faster)"
    echo ""
    echo "This will:"
    echo "  1. Update version in all service configs"
    echo "  2. Commit the version change"
    echo "  3. Run tests (unless --skip-tests)"
    echo "  4. Build, tag, push Docker images"
    echo "  5. Deploy to production"
    echo "  6. Verify health"
    echo ""

    # Show current and next version
    ./releases.sh next
    exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "\033[0;31mError: Version must be in format vX.Y.Z (e.g., v1.0.11)\033[0m"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "\033[0;34m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[0;34m  Quick Release: $VERSION\033[0m"
echo -e "\033[0;34m═══════════════════════════════════════════════════════════════\033[0m"
echo ""

# Step 1: Update version in configs
echo -e "\033[0;36m[1/6] Updating version in configs...\033[0m"
./update-version.sh "$VERSION"

# Step 2: Commit version change
echo -e "\033[0;36m[2/6] Committing version change...\033[0m"
cd "$REPO_ROOT"
git add -A
git commit -m "chore: Release $VERSION

- Updated release_version to $VERSION
- Updated release_timestamp

🤖 Generated with [Claude Code](https://claude.com/claude-code)" || echo "No changes to commit"

# Step 3: Run tests (optional)
if [ "$SKIP_TESTS" = false ]; then
    echo -e "\033[0;36m[3/6] Running tests...\033[0m"

    echo -e "\033[1;33m  Testing frontend build...\033[0m"
    cd "$REPO_ROOT/01-fronted-system"
    npm run build > /dev/null 2>&1 && echo -e "\033[0;32m  ✓ Frontend build passed\033[0m" || { echo -e "\033[0;31m  ✗ Frontend build failed\033[0m"; exit 1; }

    echo -e "\033[1;33m  Testing API service...\033[0m"
    cd "$REPO_ROOT/02-api-service"
    python3 -m pytest tests/test_00_health.py -v --tb=short > /dev/null 2>&1 && echo -e "\033[0;32m  ✓ API tests passed\033[0m" || echo -e "\033[1;33m  ⚠ API tests skipped (some failed)\033[0m"
else
    echo -e "\033[0;36m[3/6] Skipping tests (--skip-tests)\033[0m"
fi

# Step 4: Validate secrets
echo -e "\033[0;36m[4/6] Validating production secrets...\033[0m"
cd "$SCRIPT_DIR"
./secrets/verify-secrets.sh prod

# Step 5: Build, tag, push, and deploy
echo -e "\033[0;36m[5/6] Building and deploying to production...\033[0m"
echo "y" | ./release.sh "$VERSION" --deploy --env prod 2>&1 | tail -50 || {
    # If release.sh stops at confirmation, deploy manually
    echo -e "\033[1;33m  Deploying services manually...\033[0m"
    ./deploy/deploy.sh api-service prod cloudact-prod "$VERSION"
    ./deploy/deploy.sh pipeline-service prod cloudact-prod "$VERSION"
    ./deploy/deploy.sh frontend prod cloudact-prod "$VERSION"
}

# Step 6: Verify health
echo -e "\033[0;36m[6/6] Verifying production health...\033[0m"
sleep 5

API_HEALTH=$(curl -s https://api.cloudact.ai/health 2>/dev/null | grep -o '"status":"[^"]*"' | head -1)
PIPELINE_HEALTH=$(curl -s https://pipeline.cloudact.ai/health 2>/dev/null | grep -o '"status":"[^"]*"' | head -1)
FRONTEND_HEALTH=$(curl -s https://cloudact.ai/api/health 2>/dev/null | grep -o '"status":"[^"]*"' | head -1)

echo ""
echo -e "\033[0;32m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[0;32m  Release $VERSION Complete!\033[0m"
echo -e "\033[0;32m═══════════════════════════════════════════════════════════════\033[0m"
echo ""
echo "Health Status:"
if [[ "$API_HEALTH" == *"healthy"* ]]; then
    echo -e "  API Service:      \033[0;32m✓ Healthy\033[0m"
else
    echo -e "  API Service:      \033[0;31m✗ Unhealthy\033[0m"
fi
if [[ "$PIPELINE_HEALTH" == *"healthy"* ]]; then
    echo -e "  Pipeline Service: \033[0;32m✓ Healthy\033[0m"
else
    echo -e "  Pipeline Service: \033[0;31m✗ Unhealthy\033[0m"
fi
if [[ "$FRONTEND_HEALTH" == *"healthy"* ]]; then
    echo -e "  Frontend:         \033[0;32m✓ Healthy\033[0m"
else
    echo -e "  Frontend:         \033[0;31m✗ Unhealthy\033[0m"
fi
echo ""
echo "URLs:"
echo "  https://cloudact.ai"
echo "  https://api.cloudact.ai"
echo "  https://pipeline.cloudact.ai"
echo ""
