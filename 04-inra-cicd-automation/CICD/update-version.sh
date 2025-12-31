#!/bin/bash
# update-version.sh - Auto-update release version in all service configs
# Usage: ./update-version.sh v1.0.10

set -e

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo -e "\033[0;31mUsage: ./update-version.sh <version>\033[0m"
    echo "Example: ./update-version.sh v1.0.10"
    exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "\033[0;31mError: Version must be in format vX.Y.Z (e.g., v1.0.10)\033[0m"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TIMESTAMP=$(TZ='America/Los_Angeles' date +"%Y-%m-%dT%H:%M:%S%z" | sed 's/\([+-][0-9][0-9]\)\([0-9][0-9]\)$/\1:\2/')

echo -e "\033[0;34m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[0;34m  Updating Release Version: $VERSION\033[0m"
echo -e "\033[0;34m═══════════════════════════════════════════════════════════════\033[0m"
echo ""
echo "Timestamp: $TIMESTAMP"
echo ""

# Update API Service config
API_CONFIG="$REPO_ROOT/02-api-service/src/app/config.py"
if [ -f "$API_CONFIG" ]; then
    echo -e "\033[1;33mUpdating: api-service\033[0m"
    # Update release_version
    sed -i '' "s/default=\"v[0-9]*\.[0-9]*\.[0-9]*\",$/default=\"$VERSION\",/" "$API_CONFIG"
    # Update release_timestamp
    sed -i '' "s/default=\"[0-9T:\-+]*\",$/default=\"$TIMESTAMP\",/" "$API_CONFIG" 2>/dev/null || true
    echo -e "\033[0;32m✓ Updated $API_CONFIG\033[0m"
fi

# Update Pipeline Service config
PIPELINE_CONFIG="$REPO_ROOT/03-data-pipeline-service/src/app/config.py"
if [ -f "$PIPELINE_CONFIG" ]; then
    echo -e "\033[1;33mUpdating: pipeline-service\033[0m"
    sed -i '' "s/default=\"v[0-9]*\.[0-9]*\.[0-9]*\",$/default=\"$VERSION\",/" "$PIPELINE_CONFIG"
    sed -i '' "s/default=\"[0-9T:\-+]*\",$/default=\"$TIMESTAMP\",/" "$PIPELINE_CONFIG" 2>/dev/null || true
    echo -e "\033[0;32m✓ Updated $PIPELINE_CONFIG\033[0m"
fi

# Update Frontend health endpoint
FRONTEND_HEALTH="$REPO_ROOT/01-fronted-system/app/api/health/route.ts"
if [ -f "$FRONTEND_HEALTH" ]; then
    echo -e "\033[1;33mUpdating: frontend\033[0m"
    # Update RELEASE_VERSION constant
    sed -i '' "s/const RELEASE_VERSION = \"v[0-9]*\.[0-9]*\.[0-9]*\"/const RELEASE_VERSION = \"$VERSION\"/" "$FRONTEND_HEALTH"
    # Update RELEASE_TIMESTAMP constant
    sed -i '' "s/const RELEASE_TIMESTAMP = \"[^\"]*\"/const RELEASE_TIMESTAMP = \"$TIMESTAMP\"/" "$FRONTEND_HEALTH"
    echo -e "\033[0;32m✓ Updated $FRONTEND_HEALTH\033[0m"
fi

echo ""
echo -e "\033[0;32m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[0;32m  Version Updated to $VERSION\033[0m"
echo -e "\033[0;32m═══════════════════════════════════════════════════════════════\033[0m"
echo ""
echo "Next steps:"
echo "  1. git add -A && git commit -m \"chore: Release $VERSION\""
echo "  2. ./release.sh $VERSION --deploy --env prod"
