#!/bin/bash
################################################################################
# deploy-all.sh - Build and deploy ALL services to an environment
# Usage: ./deploy-all.sh <environment> [--skip-build] [--parallel]
# Environments: test, stage, prod
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/environments.conf"

# Parse arguments
ENV=""
SKIP_BUILD=false
PARALLEL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        test|stage|prod)
            ENV=$1
            ;;
        --skip-build)
            SKIP_BUILD=true
            ;;
        --parallel)
            PARALLEL=true
            ;;
        -h|--help)
            echo "Usage: ./deploy-all.sh <environment> [--skip-build] [--parallel]"
            echo ""
            echo "Environments: test, stage, prod"
            echo ""
            echo "Options:"
            echo "  --skip-build  Skip build step, deploy existing images"
            echo "  --parallel    Build/deploy services in parallel"
            echo ""
            echo "Examples:"
            echo "  ./deploy-all.sh test              # Full deploy to test"
            echo "  ./deploy-all.sh stage --parallel  # Parallel deploy to stage"
            echo "  ./deploy-all.sh prod --skip-build # Deploy existing images to prod"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

if [ -z "$ENV" ]; then
    echo -e "${RED}Usage: ./deploy-all.sh <environment> [--skip-build] [--parallel]${NC}"
    echo ""
    echo "Environments: test, stage, prod"
    exit 1
fi

PROJECT_ID=$(get_project_id $ENV)
TAG=$(date +%Y%m%d-%H%M%S)

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Invalid environment '$ENV'${NC}"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  CloudAct Full Stack Deployment${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Environment: $ENV"
echo "Project:     $PROJECT_ID"
echo "Tag:         $TAG"
echo "Skip Build:  $SKIP_BUILD"
echo "Parallel:    $PARALLEL"
echo ""

# Activate environment
activate_env $ENV

# Deploy function for a single service
deploy_service() {
    local service=$1
    local start_time=$(date +%s)

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Deploying: $service${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$SKIP_BUILD" = false ]; then
        # Build
        echo -e "${YELLOW}[1/3] Building...${NC}"
        $SCRIPT_DIR/build/build.sh $service $ENV $TAG

        # Push
        echo -e "${YELLOW}[2/3] Pushing...${NC}"
        $SCRIPT_DIR/push/push.sh $service $ENV $PROJECT_ID $TAG
    else
        echo -e "${YELLOW}Skipping build, using existing image...${NC}"
    fi

    # Deploy
    echo -e "${YELLOW}[3/3] Deploying...${NC}"
    $SCRIPT_DIR/deploy/deploy.sh $service $ENV $PROJECT_ID "${ENV}-latest"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo -e "${GREEN}✓ $service deployed in ${duration}s${NC}"
    echo ""
}

# Track overall timing
TOTAL_START=$(date +%s)

if [ "$PARALLEL" = true ]; then
    echo -e "${YELLOW}Running parallel deployment...${NC}"
    echo ""

    # Build all services in parallel
    if [ "$SKIP_BUILD" = false ]; then
        echo -e "${BLUE}Building all services...${NC}"
        for service in "${SERVICES[@]}"; do
            $SCRIPT_DIR/build/build.sh $service $ENV $TAG &
        done
        wait

        echo -e "${BLUE}Pushing all services...${NC}"
        for service in "${SERVICES[@]}"; do
            $SCRIPT_DIR/push/push.sh $service $ENV $PROJECT_ID $TAG &
        done
        wait
    fi

    # Deploy sequentially (to avoid race conditions with service URLs)
    echo -e "${BLUE}Deploying services...${NC}"
    # Deploy backend services first, then frontend
    $SCRIPT_DIR/deploy/deploy.sh api-service $ENV $PROJECT_ID "${ENV}-latest"
    $SCRIPT_DIR/deploy/deploy.sh pipeline-service $ENV $PROJECT_ID "${ENV}-latest"
    $SCRIPT_DIR/deploy/deploy.sh frontend $ENV $PROJECT_ID "${ENV}-latest"
else
    # Sequential deployment
    for service in "${SERVICES[@]}"; do
        deploy_service $service
    done
fi

TOTAL_END=$(date +%s)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Environment: $ENV"
echo "Total Time:  ${TOTAL_DURATION}s"
echo ""

# Show service URLs
echo -e "${BLUE}Service URLs:${NC}"
for service in "${SERVICES[@]}"; do
    URL=$(gcloud run services describe cloudact-${service}-${ENV} \
        --project=$PROJECT_ID \
        --region=$REGION \
        --format="value(status.url)" 2>/dev/null || echo "Not deployed")
    echo "  $service: $URL"
done

echo ""
echo -e "${YELLOW}Health Checks:${NC}"
for service in "${SERVICES[@]}"; do
    URL=$(gcloud run services describe cloudact-${service}-${ENV} \
        --project=$PROJECT_ID \
        --region=$REGION \
        --format="value(status.url)" 2>/dev/null)
    if [ -n "$URL" ]; then
        if curl -sf "${URL}/health" > /dev/null 2>&1; then
            echo -e "  $service: ${GREEN}✓ Healthy${NC}"
        else
            echo -e "  $service: ${YELLOW}! Starting${NC}"
        fi
    fi
done
echo ""
