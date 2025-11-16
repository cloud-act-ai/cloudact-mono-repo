#!/bin/bash

################################################################################
# 02-setup-kms.sh
#
# Setup Cloud KMS key ring and encryption keys
#
# Usage: ./02-setup-kms.sh [stage|prod]
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Environment required${NC}"
    echo "Usage: ./02-setup-kms.sh [stage|prod]"
    exit 1
fi

ENV=$1

# Load environment config
if [ "$ENV" = "stage" ]; then
    PROJECT_ID="gac-stage-471220"
    KEYRING_NAME="convergence-keyring-stage"
    echo -e "${YELLOW}Setting up KMS for STAGING${NC}"
elif [ "$ENV" = "prod" ]; then
    PROJECT_ID="gac-prod-471220"
    KEYRING_NAME="convergence-keyring-prod"
    echo -e "${YELLOW}Setting up KMS for PRODUCTION${NC}"
else
    echo -e "${RED}Error: Environment must be 'stage' or 'prod'${NC}"
    exit 1
fi

LOCATION="us-central1"
KEY_NAME="api-key-encryption"

echo "Project: $PROJECT_ID"
echo "Keyring: $KEYRING_NAME"
echo "Location: $LOCATION"
echo ""

# Set active project
gcloud config set project $PROJECT_ID

# Create key ring (ignore if already exists)
echo -e "${GREEN}[1/2] Creating KMS key ring...${NC}"
gcloud kms keyrings create $KEYRING_NAME \
    --location=$LOCATION \
    2>/dev/null || echo "Key ring already exists"

# Create encryption key (ignore if already exists)
echo -e "${GREEN}[2/2] Creating encryption key...${NC}"
gcloud kms keys create $KEY_NAME \
    --location=$LOCATION \
    --keyring=$KEYRING_NAME \
    --purpose=encryption \
    2>/dev/null || echo "Key already exists"

echo ""
echo -e "${GREEN}✓ KMS setup complete for $ENV!${NC}"
echo ""
echo "Key Ring: projects/$PROJECT_ID/locations/$LOCATION/keyRings/$KEYRING_NAME"
echo "Key: projects/$PROJECT_ID/locations/$LOCATION/keyRings/$KEYRING_NAME/cryptoKeys/$KEY_NAME"
echo ""
echo "Next step: Run ./03-setup-cloud-build.sh $ENV"
