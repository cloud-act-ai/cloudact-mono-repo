#!/bin/bash
################################################################################
# deploy-prod.sh - Quick deploy to PROD environment
# Usage: ./deploy-prod.sh [service] [--skip-build]
#
# WARNING: This deploys to PRODUCTION. Use with caution!
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CICD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

ENV="prod"
PROJECT_ID="cloudact-prod"
SERVICE=${1:-"all"}
SKIP_BUILD=""

[[ "$2" == "--skip-build" || "$1" == "--skip-build" ]] && SKIP_BUILD="--skip-build"

echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}  WARNING: PRODUCTION DEPLOYMENT${NC}"
echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE"
echo ""

# Confirmation prompt
read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}Proceeding with production deployment...${NC}"
echo ""

if [ "$SERVICE" == "all" ] || [ "$SERVICE" == "--skip-build" ]; then
    $CICD_DIR/deploy-all.sh $ENV $SKIP_BUILD
else
    TAG=$(date +%Y%m%d-%H%M%S)
    if [ -z "$SKIP_BUILD" ]; then
        $CICD_DIR/cicd.sh $SERVICE $ENV $PROJECT_ID $TAG
    else
        $CICD_DIR/deploy/deploy.sh $SERVICE $ENV $PROJECT_ID "${ENV}-latest"
    fi
fi

echo ""
echo -e "${GREEN}Production deployment complete!${NC}"
