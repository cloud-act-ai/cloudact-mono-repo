#!/bin/bash

################################################################################
# get_admin_key.sh
#
# Simple script to retrieve admin API keys from Secret Manager
#
# Usage: ./get_admin_key.sh [local|stage|prod]
################################################################################

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV=$1

if [ -z "$ENV" ]; then
    echo -e "${YELLOW}Usage: ./get_admin_key.sh [local|stage|prod]${NC}"
    echo ""
    echo "This script retrieves the admin API key for the specified environment."
    echo ""
    echo "Examples:"
    echo "  ./get_admin_key.sh stage"
    echo "  ./get_admin_key.sh prod"
    echo ""
    echo "For local environment, the key must be generated locally."
    exit 1
fi

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}Admin API Key Retrieval - $ENV Environment${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

if [ "$ENV" = "local" ]; then
    echo -e "${YELLOW}LOCAL ENVIRONMENT${NC}"
    echo ""
    echo "For local development, you need to generate an admin key using:"
    echo ""
    echo -e "${GREEN}  cd convergence-data-pipeline${NC}"
    echo -e "${GREEN}  python scripts/generate_admin_key.py${NC}"
    echo ""
    echo "Then export it:"
    echo -e "${GREEN}  export ADMIN_API_KEY='admin_...'${NC}"
    echo ""
    
elif [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    echo -e "${BLUE}Fetching admin API key from Secret Manager (stage)...${NC}"
    
    # Try primary secret name first
    ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-stage --project=$PROJECT_ID 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_API_KEY" ]; then
        # Fallback to generic name
        ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key --project=$PROJECT_ID 2>/dev/null || echo "")
    fi
    
    if [ -z "$ADMIN_API_KEY" ]; then
        echo -e "${RED}Error: Could not fetch admin API key from Secret Manager${NC}"
        echo "Make sure you have access to project: $PROJECT_ID"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Admin API Key retrieved successfully${NC}"
    echo ""
    echo "Admin API Key:"
    echo -e "${YELLOW}$ADMIN_API_KEY${NC}"
    echo ""
    echo "To use it, export:"
    echo -e "${GREEN}export ADMIN_API_KEY='$ADMIN_API_KEY'${NC}"
    echo ""
    
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    echo -e "${BLUE}Fetching admin API key from Secret Manager (prod)...${NC}"
    
    # Try primary secret name first
    ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-prod --project=$PROJECT_ID 2>/dev/null || echo "")
    
    if [ -z "$ADMIN_API_KEY" ]; then
        # Fallback to generic name
        ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key --project=$PROJECT_ID 2>/dev/null || echo "")
    fi
    
    if [ -z "$ADMIN_API_KEY" ]; then
        echo -e "${RED}Error: Could not fetch admin API key from Secret Manager${NC}"
        echo "Make sure you have access to project: $PROJECT_ID"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Admin API Key retrieved successfully${NC}"
    echo ""
    echo "Admin API Key:"
    echo -e "${YELLOW}$ADMIN_API_KEY${NC}"
    echo ""
    echo "To use it, export:"
    echo -e "${GREEN}export ADMIN_API_KEY='$ADMIN_API_KEY'${NC}"
    echo ""
    
else
    echo -e "${RED}Invalid environment: $ENV${NC}"
    echo "Use: local, stage, or prod"
    exit 1
fi

echo -e "${BLUE}================================================================${NC}"
