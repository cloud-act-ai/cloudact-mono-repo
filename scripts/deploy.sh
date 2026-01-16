#!/bin/bash
# =============================================
# CloudAct.AI Deployment Script
# =============================================
# Usage:
#   ./scripts/deploy.sh              # Deploy to stage (push to main)
#   ./scripts/deploy.sh --prod       # Deploy to production (create tag)
#   ./scripts/deploy.sh --version    # Show current version
#   ./scripts/deploy.sh --status     # Show deployment status
# =============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Get script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Get current version from latest tag
get_current_version() {
    git tag --sort=-v:refname | head -1 | sed 's/^v//' || echo "0.0.0"
}

# Increment version (patch by default)
increment_version() {
    local version=$1
    local type=${2:-patch}

    IFS='.' read -r major minor patch <<< "$version"

    case $type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
    esac

    echo "$major.$minor.$patch"
}

# Update version in files
update_version_files() {
    local version=$1
    local date=$(date +%Y-%m-%d)

    # Update CLAUDE.md
    if [[ -f "CLAUDE.md" ]]; then
        sed -i '' "s/\*\*v[0-9]*\.[0-9]*\.[0-9]*\*\* | [0-9-]*/**v${version}** | ${date}/" CLAUDE.md
        echo -e "${GREEN}✓${NC} Updated CLAUDE.md to v${version}"
    fi

    # Update 01-fronted-system/CLAUDE.md
    if [[ -f "01-fronted-system/CLAUDE.md" ]]; then
        sed -i '' "s/\*\*v[0-9]*\.[0-9]*\.[0-9]*\*\* | [0-9-]*/**v${version}** | ${date}/" 01-fronted-system/CLAUDE.md
        echo -e "${GREEN}✓${NC} Updated 01-fronted-system/CLAUDE.md to v${version}"
    fi

    # Update 02-api-service/CLAUDE.md
    if [[ -f "02-api-service/CLAUDE.md" ]]; then
        sed -i '' "s/\*\*v[0-9]*\.[0-9]*\.[0-9]*\*\* | [0-9-]*/**v${version}** | ${date}/" 02-api-service/CLAUDE.md
        echo -e "${GREEN}✓${NC} Updated 02-api-service/CLAUDE.md to v${version}"
    fi

    # Update 03-data-pipeline-service/CLAUDE.md
    if [[ -f "03-data-pipeline-service/CLAUDE.md" ]]; then
        sed -i '' "s/\*\*v[0-9]*\.[0-9]*\.[0-9]*\*\* | [0-9-]*/**v${version}** | ${date}/" 03-data-pipeline-service/CLAUDE.md
        echo -e "${GREEN}✓${NC} Updated 03-data-pipeline-service/CLAUDE.md to v${version}"
    fi
}

# Show banner
show_banner() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║           CloudAct.AI Deployment Script                ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Show status
show_status() {
    echo -e "${BOLD}Current Status:${NC}"
    echo ""
    echo -e "${CYAN}Version:${NC}     v$(get_current_version)"
    echo -e "${CYAN}Branch:${NC}      $(git branch --show-current)"
    echo -e "${CYAN}Commit:${NC}      $(git log -1 --format='%h %s')"
    echo ""
    echo -e "${CYAN}Recent Tags:${NC}"
    git tag --sort=-v:refname | head -5 | sed 's/^/  /'
    echo ""
    echo -e "${CYAN}Uncommitted Changes:${NC}"
    git status --short | head -10
    local count=$(git status --short | wc -l | tr -d ' ')
    if [[ $count -gt 10 ]]; then
        echo "  ... and $((count - 10)) more files"
    fi
}

# Deploy to stage (push to main)
deploy_stage() {
    echo -e "${YELLOW}Deploying to Stage...${NC}"
    echo ""

    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${RED}Error: You have uncommitted changes.${NC}"
        echo "Please commit your changes first or use --commit flag."
        exit 1
    fi

    # Push to main
    echo -e "${BLUE}Pushing to origin/main...${NC}"
    git push origin main

    echo ""
    echo -e "${GREEN}✓ Successfully deployed to Stage${NC}"
    echo -e "${CYAN}URL:${NC} https://stage.cloudact.ai"
}

# Deploy to production (create tag)
deploy_prod() {
    local version_type=${1:-patch}

    echo -e "${YELLOW}Deploying to Production...${NC}"
    echo ""

    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${RED}Error: You have uncommitted changes.${NC}"
        echo "Please commit your changes first."
        exit 1
    fi

    # Get current and new version
    local current_version=$(get_current_version)
    local new_version=$(increment_version "$current_version" "$version_type")

    echo -e "${CYAN}Current version:${NC} v${current_version}"
    echo -e "${CYAN}New version:${NC}     v${new_version}"
    echo ""

    # Confirm
    read -p "Create tag v${new_version} and deploy to production? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi

    # Update version files
    update_version_files "$new_version"

    # Commit version update
    git add -A
    git commit -m "chore: release v${new_version}" || true

    # Create tag
    git tag "v${new_version}"
    echo -e "${GREEN}✓${NC} Created tag v${new_version}"

    # Push everything
    echo -e "${BLUE}Pushing to origin...${NC}"
    git push origin main
    git push origin "v${new_version}"

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Successfully deployed v${new_version} to Production     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}URLs:${NC}"
    echo "  Frontend:  https://cloudact.ai"
    echo "  API:       https://api.cloudact.ai"
    echo "  Pipeline:  https://pipeline.cloudact.ai"
}

# Commit all changes
commit_changes() {
    local message=${1:-"chore: update"}

    echo -e "${YELLOW}Committing changes...${NC}"

    # Show what will be committed
    echo -e "${CYAN}Files to commit:${NC}"
    git status --short
    echo ""

    # Add all changes
    git add -A

    # Commit
    git commit -m "$(cat <<EOF
${message}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

    echo -e "${GREEN}✓${NC} Changes committed"
}

# Main
show_banner

case "${1:-}" in
    --prod|--production|-p)
        deploy_prod "${2:-patch}"
        ;;
    --stage|-s)
        deploy_stage
        ;;
    --version|-v)
        echo "v$(get_current_version)"
        ;;
    --status)
        show_status
        ;;
    --commit|-c)
        commit_changes "${2:-chore: update}"
        ;;
    --help|-h)
        echo "Usage: ./scripts/deploy.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --stage, -s       Deploy to stage (push to main)"
        echo "  --prod, -p        Deploy to production (create tag)"
        echo "  --commit, -c      Commit all changes with message"
        echo "  --version, -v     Show current version"
        echo "  --status          Show deployment status"
        echo "  --help, -h        Show this help"
        echo ""
        echo "Examples:"
        echo "  ./scripts/deploy.sh --commit 'feat: add email templates'"
        echo "  ./scripts/deploy.sh --stage"
        echo "  ./scripts/deploy.sh --prod"
        echo "  ./scripts/deploy.sh --prod minor  # Bump minor version"
        ;;
    *)
        show_status
        echo ""
        echo -e "${YELLOW}Use --help for usage information${NC}"
        ;;
esac
