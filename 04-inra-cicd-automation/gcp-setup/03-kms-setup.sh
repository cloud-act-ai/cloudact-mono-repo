#!/bin/bash
################################################################################
# 03-kms-setup.sh - Setup Cloud KMS keyring and encryption keys
# Usage: ./03-kms-setup.sh <project-id> <environment>
# Environments: test, stage, prod
#
# Prerequisites:
#   - 00-gcp-enable-apis.sh (Cloud KMS API must be enabled)
#   - Service account must exist (created in 02-artifactory-setup.sh or manually)
################################################################################

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

if [ "$#" -lt 2 ]; then
    echo -e "${RED}Usage: ./03-kms-setup.sh <project-id> <environment>${NC}"
    echo ""
    echo "Environments: test, stage, prod"
    echo ""
    echo "Examples:"
    echo "  ./03-kms-setup.sh cloudact-testing-1 test"
    echo "  ./03-kms-setup.sh cloudact-prod prod"
    exit 1
fi

PROJECT_ID=$1
ENV=$2
REGION="us-central1"

# Validate environment
if [[ ! "$ENV" =~ ^(test|stage|prod)$ ]]; then
    echo -e "${RED}Error: Environment must be test, stage, or prod${NC}"
    exit 1
fi

# Environment-specific configuration
case $ENV in
    test)
        KEYRING_NAME="cloudact-keyring-test"
        SERVICE_ACCOUNT="cloudact-sa-test@${PROJECT_ID}.iam.gserviceaccount.com"
        ;;
    stage)
        KEYRING_NAME="cloudact-keyring-stage"
        SERVICE_ACCOUNT="cloudact-sa-stage@${PROJECT_ID}.iam.gserviceaccount.com"
        ;;
    prod)
        KEYRING_NAME="cloudact-keyring"
        SERVICE_ACCOUNT="cloudact-sa-prod@${PROJECT_ID}.iam.gserviceaccount.com"
        ;;
esac

KEY_NAME="api-key-encryption"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Cloud KMS Setup - ${ENV} Environment${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Project:         $PROJECT_ID"
echo "Region:          $REGION"
echo "Keyring:         $KEYRING_NAME"
echo "Key:             $KEY_NAME"
echo "Service Account: $SERVICE_ACCOUNT"
echo ""

# Set active project
gcloud config set project $PROJECT_ID

# Step 1: Ensure KMS API is enabled
echo -e "${YELLOW}[1/4] Ensuring Cloud KMS API is enabled...${NC}"
if gcloud services enable cloudkms.googleapis.com --project=$PROJECT_ID 2>/dev/null; then
    echo -e "${GREEN}✓ Cloud KMS API enabled${NC}"
else
    echo -e "${GREEN}✓ Cloud KMS API already enabled${NC}"
fi

# Step 2: Create keyring
echo ""
echo -e "${YELLOW}[2/4] Creating KMS keyring...${NC}"
if gcloud kms keyrings create $KEYRING_NAME \
    --location=$REGION \
    --project=$PROJECT_ID 2>/dev/null; then
    echo -e "${GREEN}✓ Keyring created: $KEYRING_NAME${NC}"
else
    echo -e "${YELLOW}ℹ Keyring already exists: $KEYRING_NAME${NC}"
fi

# Step 3: Create encryption key
echo ""
echo -e "${YELLOW}[3/4] Creating encryption key...${NC}"
if gcloud kms keys create $KEY_NAME \
    --location=$REGION \
    --keyring=$KEYRING_NAME \
    --purpose=encryption \
    --project=$PROJECT_ID 2>/dev/null; then
    echo -e "${GREEN}✓ Encryption key created: $KEY_NAME${NC}"
else
    echo -e "${YELLOW}ℹ Encryption key already exists: $KEY_NAME${NC}"
fi

# Step 4: Grant IAM permissions to service account
echo ""
echo -e "${YELLOW}[4/4] Granting KMS permissions to service account...${NC}"

# Check if service account exists
if gcloud iam service-accounts describe $SERVICE_ACCOUNT --project=$PROJECT_ID >/dev/null 2>&1; then
    # Grant encrypter/decrypter role
    if gcloud kms keys add-iam-policy-binding $KEY_NAME \
        --location=$REGION \
        --keyring=$KEYRING_NAME \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
        --project=$PROJECT_ID >/dev/null 2>&1; then
        echo -e "${GREEN}✓ IAM binding created for $SERVICE_ACCOUNT${NC}"
    else
        echo -e "${YELLOW}ℹ IAM binding already exists${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Service account not found: $SERVICE_ACCOUNT${NC}"
    echo -e "${YELLOW}  Create it first or run 05-iam-setup.sh${NC}"
fi

# Summary
KEY_PATH="projects/${PROJECT_ID}/locations/${REGION}/keyRings/${KEYRING_NAME}/cryptoKeys/${KEY_NAME}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  KMS Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Keyring: projects/${PROJECT_ID}/locations/${REGION}/keyRings/${KEYRING_NAME}"
echo "Key:     ${KEY_PATH}"
echo ""
echo -e "${BLUE}Environment variables for .env files:${NC}"
echo "  KMS_PROJECT_ID=${PROJECT_ID}"
echo "  KMS_LOCATION=${REGION}"
echo "  KMS_KEYRING=${KEYRING_NAME}"
echo "  KMS_KEY=${KEY_NAME}"
echo ""
echo "Or use full key path:"
echo "  GCP_KMS_KEY_NAME=${KEY_PATH}"
echo ""
echo -e "${YELLOW}Next: Run 04-secrets-setup.sh${NC}"
